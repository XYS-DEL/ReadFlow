import React, { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { 
  ArrowLeft, 
  Settings, 
  Volume2, 
  Play, 
  Pause, 
  Square, 
  ChevronLeft, 
  ChevronRight, 
  Sliders,
  Type,
  BookOpen,
  Eye,
  Bookmark
} from 'lucide-react';

export default function ReaderView({ article, theme, setTheme, bookmarks = [], onToggleBookmark, onBack }) {
  const [showSettings, setShowSettings] = useState(false);
  const [fontSize, setFontSize] = useState(18); // px
  const [lineHeight, setLineHeight] = useState(1.8);
  const [useSerif, setUseSerif] = useState(true);
  const [showFocusLine, setShowFocusLine] = useState(false);
  
  // TTS (Text-to-Speech) 状态
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [isTtsPaused, setIsTtsPaused] = useState(false);
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [activeParagraphIndex, setActiveParagraphIndex] = useState(-1);
  const [paragraphs, setParagraphs] = useState([]);
  
  const contentRef = useRef(null);
  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const utteranceRef = useRef(null);
  
  const isBookmarked = bookmarks.some(item => item && (item.url === article.url || item.title === article.title));

  // 从本地存储读取用户排版习惯
  useEffect(() => {
    const savedFontSize = localStorage.getItem('readflow_font_size');
    const savedLineHeight = localStorage.getItem('readflow_line_height');
    const savedSerif = localStorage.getItem('readflow_use_serif');
    const savedFocusLine = localStorage.getItem('readflow_focus_line');

    if (savedFontSize) setFontSize(parseInt(savedFontSize));
    if (savedLineHeight) setLineHeight(parseFloat(savedLineHeight));
    if (savedSerif) setUseSerif(savedSerif === 'true');
    if (savedFocusLine) setShowFocusLine(savedFocusLine === 'true');
  }, []);

  // 写入本地存储并应用排版 CSS 变量
  useEffect(() => {
    localStorage.setItem('readflow_font_size', fontSize);
    localStorage.setItem('readflow_line_height', lineHeight);
    localStorage.setItem('readflow_use_serif', useSerif);
    localStorage.setItem('readflow_focus_line', showFocusLine);
    
    if (contentRef.current) {
      contentRef.current.style.setProperty('--read-font-size', `${fontSize}px`);
      contentRef.current.style.setProperty('--read-line-height', lineHeight);
      contentRef.current.style.fontFamily = useSerif ? 'var(--font-serif)' : 'var(--font-sans)';
    }
  }, [fontSize, lineHeight, useSerif, showFocusLine]);

  // 解析并收集所有用于朗读的段落文本
  useEffect(() => {
    if (article && article.content) {
      // 临时在后台解析 HTML 并剥离干净的段落内容
      const parser = new DOMParser();
      const doc = parser.parseFromString(article.content, 'text/html');
      const pElements = doc.querySelectorAll('p');
      const textParagraphs = Array.from(pElements)
        .map(el => el.textContent.trim())
        .filter(text => text.length > 0);
      
      setParagraphs(textParagraphs);
    }
    
    // 组件卸载时停止 TTS
    return () => {
      stopTts();
    };
  }, [article]);

  // 监听朗读段落变化，动态在 DOM 中高亮对应的段落
  useEffect(() => {
    if (!contentRef.current || paragraphs.length === 0) return;
    
    const pDomElements = contentRef.current.querySelectorAll('.reader-body p');
    
    // 先清除所有高亮
    pDomElements.forEach(el => el.classList.remove('tts-highlight'));
    
    if (activeParagraphIndex >= 0 && activeParagraphIndex < pDomElements.length) {
      const activeEl = pDomElements[activeParagraphIndex];
      if (activeEl) {
        activeEl.classList.add('tts-highlight');
        // 丝滑滚动到视野正中，对注意力障碍者极其友好
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeParagraphIndex, paragraphs]);

  // ==========================================================================
  // TTS 语音朗读控制逻辑
  // ==========================================================================

  const startTts = (startIndex = 0) => {
    if (!synthRef.current) {
      alert('您的系统或设备暂不支持语音合成朗读（TTS）功能。');
      return;
    }
    if (paragraphs.length === 0) return;
    stopTts(); // 确保先停止之前的

    setIsTtsPlaying(true);
    setIsTtsPaused(false);
    playParagraph(startIndex);
  };

  const playParagraph = (index) => {
    if (!synthRef.current) return;
    if (index < 0 || index >= paragraphs.length) {
      stopTts();
      return;
    }

    setActiveParagraphIndex(index);
    
    try {
      // 实例化 SpeechSynthesisUtterance
      const utterance = new SpeechSynthesisUtterance(paragraphs[index]);
      utteranceRef.current = utterance;
      
      // 设置语速与语言
      utterance.rate = ttsSpeed;
      utterance.lang = 'zh-CN'; // 强制定向中文

      // 监听朗读完毕，自动播放下一段
      utterance.onend = () => {
        if (isTtsPlaying && !isTtsPaused) {
          playParagraph(index + 1);
        }
      };

      utterance.onerror = (e) => {
        console.error('SpeechSynthesis error:', e);
        if (e.error !== 'interrupted') {
          stopTts();
        }
      };

      synthRef.current.speak(utterance);
    } catch (err) {
      console.error('TTS Speak failed:', err);
      stopTts();
    }
  };

  const pauseTts = () => {
    if (!synthRef.current) return;
    try {
      if (synthRef.current.speaking && !synthRef.current.paused) {
        synthRef.current.pause();
        setIsTtsPaused(true);
      }
    } catch (err) {
      console.error('TTS Pause failed:', err);
    }
  };

  const resumeTts = () => {
    if (!synthRef.current) return;
    try {
      if (synthRef.current.paused) {
        synthRef.current.resume();
        setIsTtsPaused(false);
      } else {
        // 预防异常的 resume 兜底
        startTts(activeParagraphIndex >= 0 ? activeParagraphIndex : 0);
      }
    } catch (err) {
      console.error('TTS Resume failed:', err);
    }
  };

  const stopTts = () => {
    if (!synthRef.current) return;
    try {
      synthRef.current.cancel();
    } catch (err) {
      console.error('TTS Cancel failed:', err);
    }
    setIsTtsPlaying(false);
    setIsTtsPaused(false);
    setActiveParagraphIndex(-1);
    utteranceRef.current = null;
  };

  const nextParagraph = () => {
    if (!synthRef.current) return;
    if (activeParagraphIndex < paragraphs.length - 1) {
      try {
        synthRef.current.cancel();
      } catch (err) {
        console.error('TTS Cancel failed:', err);
      }
      playParagraph(activeParagraphIndex + 1);
    }
  };

  const prevParagraph = () => {
    if (!synthRef.current) return;
    if (activeParagraphIndex > 0) {
      try {
        synthRef.current.cancel();
      } catch (err) {
        console.error('TTS Cancel failed:', err);
      }
      playParagraph(activeParagraphIndex - 1);
    }
  };

  // 监听语速变化
  const handleSpeedChange = (newSpeed) => {
    setTtsSpeed(newSpeed);
    if (!synthRef.current) return;
    if (isTtsPlaying && !isTtsPaused) {
      try {
        // 语速变化需要重新启动当前段落才能生效
        synthRef.current.cancel();
      } catch (err) {
        console.error('TTS Cancel failed:', err);
      }
      playParagraph(activeParagraphIndex);
    }
  };

  // 6 种高级视觉主题的定义
  const themes = [
    { id: 'theme-morning', name: '晨曦白', color: '#fcfbf9' },
    { id: 'theme-green', name: '护眼绿', color: '#e8f5e9' },
    { id: 'theme-parchment', name: '羊皮纸', color: '#ebdcb9' },
    { id: 'theme-grey', name: '优雅灰', color: '#e2e7ec' },
    { id: 'theme-space', name: '深空灰', color: '#2a2f35' },
    { id: 'theme-midnight', name: '极夜黑', color: '#000000' }
  ];

  return (
    <div className={`reader-view theme-${theme}`}>
      {/* 1. 顶部控制栏 */}
      <header className="reader-header">
        <button className="btn-circle" onClick={onBack} title="返回主页">
          <ArrowLeft size={20} />
        </button>

        <div className="reader-actions">
          <button 
            className={`btn-circle ${showFocusLine ? 'active' : ''}`} 
            onClick={() => setShowFocusLine(!showFocusLine)}
            style={showFocusLine ? { borderColor: 'var(--primary)', color: 'var(--primary)' } : {}}
            title="视线聚焦线"
          >
            <Eye size={20} />
          </button>
          
          <button 
            className="btn-circle" 
            onClick={() => {
              stopTts();
              startTts(0);
            }} 
            title="语音朗读"
          >
            <Volume2 size={20} />
          </button>
          
          <button 
            className={`btn-circle ${isBookmarked ? 'active' : ''}`} 
            onClick={() => onToggleBookmark(article)}
            style={isBookmarked ? { borderColor: 'var(--primary)', color: 'var(--primary)' } : {}}
            title={isBookmarked ? "取消收藏" : "加入收藏"}
          >
            <Bookmark size={20} fill={isBookmarked ? "var(--primary)" : "none"} />
          </button>
          
          <button 
            className="btn-circle" 
            onClick={() => setShowSettings(!showSettings)}
            title="排版设置"
          >
            <Settings size={20} />
          </button>
        </div>

        {/* 1.1 排版设置浮窗 */}
        {showSettings && (
          <div className="settings-drawer">
            <div className="drawer-title">视觉排版偏好</div>
            
            {/* 字号无极调节 */}
            <div className="settings-section">
              <div className="settings-label">字体大小 ({fontSize}px)</div>
              <div className="tts-slider-group">
                <span style={{ fontSize: '12px' }}>A-</span>
                <input 
                  type="range" 
                  min="14" 
                  max="32" 
                  value={fontSize} 
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  className="tts-slider"
                />
                <span style={{ fontSize: '18px' }}>A+</span>
              </div>
            </div>

            {/* 行高段落调节 */}
            <div className="settings-section">
              <div className="settings-label">行间距</div>
              <div className="font-ctrl-group">
                <button 
                  className={`btn-segment ${lineHeight === 1.5 ? 'active' : ''}`}
                  onClick={() => setLineHeight(1.5)}
                >
                  紧凑
                </button>
                <button 
                  className={`btn-segment ${lineHeight === 1.8 ? 'active' : ''}`}
                  onClick={() => setLineHeight(1.8)}
                >
                  标准
                </button>
                <button 
                  className={`btn-segment ${lineHeight === 2.2 ? 'active' : ''}`}
                  onClick={() => setLineHeight(2.2)}
                >
                  宽松
                </button>
              </div>
            </div>

            {/* 衬线/非衬线切换 */}
            <div className="settings-section">
              <div className="settings-label">字体风格</div>
              <div className="font-ctrl-group">
                <button 
                  className={`btn-segment ${useSerif ? 'active' : ''}`}
                  onClick={() => setUseSerif(true)}
                >
                  经典衬线 (推荐阅读)
                </button>
                <button 
                  className={`btn-segment ${!useSerif ? 'active' : ''}`}
                  onClick={() => setUseSerif(false)}
                >
                  现代无衬线
                </button>
              </div>
            </div>

            {/* 主题选择网格 */}
            <div className="settings-section">
              <div className="settings-label">阅读主题</div>
              <div className="theme-grid">
                {themes.map(t => (
                  <button
                    key={t.id}
                    className={`theme-btn ${theme === t.id.replace('theme-', '') ? 'active' : ''}`}
                    style={{ backgroundColor: t.color, color: t.id.includes('dark') || t.id.includes('space') || t.id.includes('midnight') ? '#fff' : '#000' }}
                    onClick={() => setTheme(t.id.replace('theme-', ''))}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* 2. 核心文章区域 */}
      <main className="reader-content-wrapper no-scrollbar" ref={contentRef}>
        {/* 辅助对焦线 (视线聚焦引导线) */}
        {showFocusLine && (
          <div className="focus-line-overlay" style={{ top: '35vh', position: 'fixed' }} />
        )}
        
        <article className="reader-article">
          <h1 className="reader-title">{article.title}</h1>
          
          <div className="reader-meta">
            <span className="meta-item">
              <BookOpen size={14} />
              {article.siteName}
            </span>
            {article.author && article.author !== '佚名' && (
              <span className="meta-item">
                作者: {article.author}
              </span>
            )}
            <span className="meta-item">
              字数: {article.textContent.length} 字
            </span>
          </div>

          {/* 渲染经过净化清洗的正文 HTML（二次安全过滤，杜绝 localStorage XSS 绕过） */}
          <div 
            className="reader-body"
            dangerouslySetInnerHTML={{ 
              __html: DOMPurify.sanitize(article.content || '', {
                ALLOWED_TAGS: [
                  'p', 'img', 'video', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
                  'ul', 'ol', 'li', 'blockquote', 'strong', 'em', 'span', 'br', 'a', 
                  'section', 'fieldset', 'div', 'pre', 'code',
                  'table', 'thead', 'tbody', 'tr', 'th', 'td'
                ],
                ALLOWED_ATTR: ['src', 'href', 'alt', 'controls', 'class', 'referrerpolicy']
              }) 
            }} 
          />
        </article>
      </main>

      {/* 3. 底部语音播放面板 (TTS Panel) */}
      {isTtsPlaying && (
        <div className="tts-panel">
          <div className="tts-info">
            <span>正在朗读第 {activeParagraphIndex + 1} / {paragraphs.length} 段</span>
            <span>语速: {ttsSpeed}x</span>
          </div>

          <div className="tts-controls">
            <button className="btn-tts-secondary" onClick={prevParagraph} title="上一段">
              <ChevronLeft size={18} />
            </button>

            {isTtsPaused ? (
              <button className="btn-tts-primary" onClick={resumeTts} title="继续">
                <Play size={20} fill="white" />
              </button>
            ) : (
              <button className="btn-tts-primary" onClick={pauseTts} title="暂停">
                <Pause size={20} fill="white" />
              </button>
            )}

            <button className="btn-tts-secondary" onClick={stopTts} title="停止">
              <Square size={16} fill="var(--text-main)" />
            </button>

            <button className="btn-tts-secondary" onClick={nextParagraph} title="下一段">
              <ChevronRight size={18} />
            </button>
          </div>

          {/* 语速滑动微调 */}
          <div className="tts-slider-group">
            <Sliders size={14} />
            <input 
              type="range" 
              min="0.6" 
              max="2.0" 
              step="0.1" 
              value={ttsSpeed} 
              onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
              className="tts-slider"
            />
            <span style={{ minWidth: '30px', textAlign: 'right' }}>{ttsSpeed}x</span>
          </div>
        </div>
      )}
    </div>
  );
}
