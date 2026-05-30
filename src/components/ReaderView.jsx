import React, { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { TextToSpeech as CapTTS } from '@capacitor-community/text-to-speech';
import { Capacitor } from '@capacitor/core';
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
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(-1);
  const [sentences, setSentences] = useState([]); // 保持状态命名，为全局独立朗读句子数组
  const [sanitizedHtml, setSanitizedHtml] = useState('');
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState('');
  
  const contentRef = useRef(null);
  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const utteranceRef = useRef(null);
  const onlineAudioRef = useRef(null); // 在线精品语音播放实例

  // 跨平台 Native TTS 控制变量及线程并发锁 (保障无缝步进高亮)
  const isNativeTts = Capacitor.isNativePlatform();
  const speechSessionRef = useRef(0); // 线程会话计数器，杜绝异步回调闭包及事件并发引发的值过期或段落重叠 Bug
  
  const isBookmarked = bookmarks.some(item => item && (item.url === article.url || item.title === article.title));

  // 动态扫描并加载系统/浏览器内置的所有中文音色
  useEffect(() => {
    // 5种极具拟真感、完全免费、免 Key 的在线高质量 AI 音色，为无内置发音人用户提供完美听书体验
    const onlineVoices = [
      { name: '在线精品：百度美柔 (标准女声)', id: 'baidu-0', type: 'online', engine: 'baidu', per: 0, lang: 'zh-CN' },
      { name: '在线精品：百度宇宽 (标准男声)', id: 'baidu-1', type: 'online', engine: 'baidu', per: 1, lang: 'zh-CN' },
      { name: '在线精品：百度逍遥 (情感男声)', id: 'baidu-3', type: 'online', engine: 'baidu', per: 3, lang: 'zh-CN' },
      { name: '在线精品：百度丫丫 (情感女声)', id: 'baidu-4', type: 'online', engine: 'baidu', per: 4, lang: 'zh-CN' },
      { name: '在线精品：谷歌官方 (高清国语)', id: 'google-online', type: 'online', engine: 'google', lang: 'zh-CN' }
    ];

    const loadVoices = async () => {
      if (isNativeTts) {
        try {
          const res = await CapTTS.getSupportedVoices();
          const zhVoices = (res.voices || []).map((voice, idx) => ({
            name: voice.name,
            lang: voice.lang,
            voiceURI: voice.voiceURI,
            default: voice.default,
            originalIndex: idx
          })).filter(v => v.lang && (v.lang.toLowerCase().includes('zh') || v.lang.toLowerCase().includes('chn') || v.lang.toLowerCase().includes('cmn')));
          
          const allVoices = [...onlineVoices, ...zhVoices];
          setAvailableVoices(allVoices);
          
          const savedVoiceName = localStorage.getItem('readflow_selected_voice_name');
          if (savedVoiceName && allVoices.some(v => v.name === savedVoiceName)) {
            setSelectedVoiceName(savedVoiceName);
          } else {
            setSelectedVoiceName(onlineVoices[0].name); // 默认高保真在线美柔女声
            localStorage.setItem('readflow_selected_voice_name', onlineVoices[0].name);
          }
        } catch (e) {
          console.error('Failed to get native voices, fallback to online...', e);
          setAvailableVoices(onlineVoices);
          setSelectedVoiceName(onlineVoices[0].name);
        }
      } else {
        const loadH5Voices = () => {
          if (typeof window === 'undefined' || !window.speechSynthesis) return;
          const voices = window.speechSynthesis.getVoices();
          const zhVoices = voices.map((voice, idx) => ({
            name: voice.name,
            lang: voice.lang,
            voiceURI: voice.voiceURI,
            default: voice.default,
            originalIndex: idx,
            rawVoice: voice
          })).filter(v => v.lang && (v.lang.toLowerCase().includes('zh') || v.lang.toLowerCase().includes('chn') || v.lang.toLowerCase().includes('cmn')));
          
          const allVoices = [...onlineVoices, ...zhVoices];
          setAvailableVoices(allVoices);
          
          const savedVoiceName = localStorage.getItem('readflow_selected_voice_name');
          if (savedVoiceName && allVoices.some(v => v.name === savedVoiceName)) {
            setSelectedVoiceName(savedVoiceName);
          } else {
            setSelectedVoiceName(onlineVoices[0].name);
            localStorage.setItem('readflow_selected_voice_name', onlineVoices[0].name);
          }
        };

        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.onvoiceschanged = loadH5Voices;
          loadH5Voices();
        } else {
          // 兜底加载在线音色
          setAvailableVoices(onlineVoices);
          setSelectedVoiceName(onlineVoices[0].name);
        }
      }
    };

    loadVoices();
  }, [isNativeTts]);

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

  // 深度句级解析引擎：分割正文并建立全局高精准 Span 锚点，100% 保留 HTML 内部格式和元素布局 (如超链接、粗体等)
  useEffect(() => {
    if (article && article.content) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(article.content, 'text/html');
      
      let sentenceGlobalIndex = 0;
      const sentenceList = [];
      let currentSentenceAccumulator = "";
      
      // 中英文通用句子结束符判定集合
      const sentenceEnds = new Set(['。', '！', '？', '；', '\n', '\r', ';', '!', '?']);

      // 1. 递归获取所有待处理的文本节点 (深度优先搜索，确保视觉展示顺序一致)
      const textNodes = [];
      function findTextNodes(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tagName = node.tagName.toLowerCase();
          // 跳过不需要朗读和高亮的特殊排版元素
          if (['script', 'style', 'pre', 'code', 'img', 'video', 'audio', 'iframe', 'canvas'].includes(tagName)) {
            return;
          }
        }
        
        if (node.nodeType === Node.TEXT_NODE) {
          textNodes.push(node);
          return;
        }
        
        for (let child = node.firstChild; child; child = child.nextSibling) {
          findTextNodes(child);
        }
      }
      
      findTextNodes(doc.body);

      // 2. 对每个文本节点进行句级细分和 DOM 包装
      let lastBlockParent = null;

      textNodes.forEach((node) => {
        const text = node.nodeValue;
        if (!text) return;

        // 如果文本节点只包含空白字符，不进行包裹，保持原样，防止破坏缩进或换行布局
        if (text.trim().length === 0) {
          return;
        }

        // 获取该文本节点最近的块级父容器
        const blockParent = node.parentElement ? node.parentElement.closest('p, li, h1, h2, h3, h4, h5, h6, blockquote, div, td, th') : null;
        
        // 核心亮点：如果跨越了不同的块级父容器，强制闭合上一句，避免朗读高亮跨段落显示，导致排版视觉割裂
        if (blockParent !== lastBlockParent) {
          if (currentSentenceAccumulator.trim().length > 0) {
            sentenceList.push(currentSentenceAccumulator.trim());
            sentenceGlobalIndex++;
          }
          currentSentenceAccumulator = "";
          lastBlockParent = blockParent;
        }

        const segments = [];
        let temp = "";
        
        // 逐字扫描，根据句子标点进行切片
        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          temp += char;
          if (sentenceEnds.has(char)) {
            segments.push({ text: temp, finished: true });
            temp = "";
          }
        }
        if (temp.length > 0) {
          segments.push({ text: temp, finished: false });
        }

        const fragment = doc.createDocumentFragment();
        
        segments.forEach((seg) => {
          // 如果分段全是空白，则作为普通文本节点插入，不包裹 span，保留原样
          if (seg.text.trim().length === 0) {
            fragment.appendChild(doc.createTextNode(seg.text));
            return;
          }

          // 开启/累加当前句子的文本
          currentSentenceAccumulator += seg.text;
          
          const span = doc.createElement('span');
          span.className = 'tts-sentence';
          span.setAttribute('data-sentence-idx', sentenceGlobalIndex.toString());
          span.textContent = seg.text;
          fragment.appendChild(span);

          if (seg.finished) {
            const finalSentence = currentSentenceAccumulator.trim();
            if (finalSentence.length > 0) {
              sentenceList.push(finalSentence);
              sentenceGlobalIndex++;
            }
            currentSentenceAccumulator = "";
          }
        });

        if (node.parentNode) {
          node.parentNode.replaceChild(fragment, node);
        }
      });

      // 3. 兜底处理：如果全文结束时还有未闭合的句子，加入列表
      if (currentSentenceAccumulator.trim().length > 0) {
        sentenceList.push(currentSentenceAccumulator.trim());
        sentenceGlobalIndex++;
      }

      setSanitizedHtml(doc.body.innerHTML);
      setSentences(sentenceList);
    }
    
    return () => {
      stopTts();
    };
  }, [article]);

  // 监听朗读句子变化，在 DOM 中进行像素级高亮与丝滑居中滚动
  useEffect(() => {
    if (!contentRef.current || sentences.length === 0) return;
    
    const sentenceElements = contentRef.current.querySelectorAll('.reader-body .tts-sentence');
    
    // 先清除所有高亮
    sentenceElements.forEach(el => el.classList.remove('tts-highlight'));
    
    if (activeSentenceIndex >= 0) {
      const activeSpans = contentRef.current.querySelectorAll(`.reader-body .tts-sentence[data-sentence-idx="${activeSentenceIndex}"]`);
      if (activeSpans && activeSpans.length > 0) {
        activeSpans.forEach(span => span.classList.add('tts-highlight'));
        // 丝滑滚动到视野正中，对注意力障碍者极其友好
        activeSpans[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeSentenceIndex, sentences, isTtsPlaying, isTtsPaused, sanitizedHtml]);

  // ==========================================================================
  // TTS 语音朗读控制逻辑
  // ==========================================================================

  const startTts = (startIndex = 0) => {
    if (!isNativeTts && !synthRef.current) {
      alert('您的系统或设备暂不支持语音合成朗读（TTS）功能。');
      return;
    }
    if (sentences.length === 0) return;
    
    setIsTtsPlaying(true);
    setIsTtsPaused(false);
    playSentence(startIndex);
  };

  const playSentence = async (index) => {
    if (index < 0 || index >= sentences.length) {
      stopTts();
      return;
    }

    // 递增会话序列号，立使当前执行的其他 playSentence 线程失效，杜绝重叠播放和状态混乱
    speechSessionRef.current++;
    const mySession = speechSessionRef.current;

    setActiveSentenceIndex(index);
    setIsTtsPlaying(true);
    setIsTtsPaused(false);

    try {
      // 深度防御性：清理句子前后的换行和空白，若为空句子，直接无缝步进到下一句，防止设备 TTS 引擎挂起或报 Error
      const cleanText = sentences[index] ? sentences[index].trim() : '';
      if (!cleanText) {
        console.log(`[TTS] 句子为空，跳过 index: ${index}`);
        playSentence(index + 1);
        return;
      }

      // 打断正在播放的任何在线语音流
      if (onlineAudioRef.current) {
        onlineAudioRef.current.pause();
        onlineAudioRef.current = null;
      }

      // 获取当前发音人对象
      const activeVoiceObj = availableVoices.find(v => v.name === selectedVoiceName);

      if (activeVoiceObj && activeVoiceObj.type === 'online') {
        // C. 在线免 Key 神经网络语音播放分支
        let audioUrl = '';
        if (activeVoiceObj.engine === 'baidu') {
          // spd 语速: 1-9，5为中数 (倍速映射：1.0x -> 5, 0.6x -> 3, 2.0x -> 9)
          let speedParam = 5;
          if (ttsSpeed <= 1.0) {
            speedParam = Math.max(1, Math.floor(3 + (ttsSpeed - 0.6) * 5));
          } else {
            speedParam = Math.min(9, Math.floor(5 + (ttsSpeed - 1.0) * 4));
          }
          audioUrl = `https://tts.baidu.com/text2audio?tex=${encodeURIComponent(cleanText)}&lan=zh&cuid=dict&cod=2&spd=${speedParam}&per=${activeVoiceObj.per}`;
        } else if (activeVoiceObj.engine === 'google') {
          audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=zh-CN&client=tw-ob&q=${encodeURIComponent(cleanText)}`;
        }

        const audio = new Audio(audioUrl);
        onlineAudioRef.current = audio;

        // 针对无法通过 URL 传参的在线引擎 (如谷歌)，直接在前端设定音频倍速播放
        audio.playbackRate = ttsSpeed;

        audio.onended = () => {
          if (mySession === speechSessionRef.current) {
            playSentence(index + 1);
          }
        };

        audio.onerror = (e) => {
          console.error('[Online TTS] 播放发生异常，跳过当前句:', e);
          if (mySession === speechSessionRef.current) {
            playSentence(index + 1);
          }
        };

        await audio.play();
      } else {
        // A. 本地 Native / H5 语音播放分支
        if (isNativeTts) {
          // A. 安卓原生 TTS 引擎播放分支
          await CapTTS.stop();
          
          // 异步等待 stop 后，检查此会话是否已被更高优先级的操作中断
          if (mySession !== speechSessionRef.current) return;

          // 根据用户所选发音人名称，匹配原生音色索引
          const voiceIdx = activeVoiceObj ? activeVoiceObj.originalIndex : undefined;

          await CapTTS.speak({
            text: cleanText,
            lang: 'zh-CN',
            rate: ttsSpeed,
            voice: voiceIdx
          });

          // 异步朗读完毕后，若会话依然合法有效，平滑推进到下一句
          if (mySession === speechSessionRef.current) {
            playSentence(index + 1);
          }
        } else {
          // B. H5 网页 浏览器语音播放分支 (平滑降级)
          if (!synthRef.current) return;
          synthRef.current.cancel();

          const utterance = new SpeechSynthesisUtterance(cleanText);
          utteranceRef.current = utterance;
          
          utterance.rate = ttsSpeed;
          
          // 匹配 H5 原生发音人对象
          if (activeVoiceObj && activeVoiceObj.rawVoice) {
            utterance.voice = activeVoiceObj.rawVoice;
            utterance.lang = activeVoiceObj.lang;
          } else {
            utterance.lang = 'zh-CN';
          }

          utterance.onend = () => {
            if (mySession === speechSessionRef.current) {
              playSentence(index + 1);
            }
          };

          utterance.onerror = (e) => {
            console.error('SpeechSynthesis error:', e);
            if (e.error !== 'interrupted' && mySession === speechSessionRef.current) {
              // 发生非打断性异常时，兜底跳过当前异常句子，继续朗读下一句，防挂死
              playSentence(index + 1);
            }
          };

          synthRef.current.speak(utterance);
        }
      }
    } catch (err) {
      console.error('TTS Playback failed:', err);
      // 容错恢复机制：如果 native/H5 调用失败，安全步进到下一句
      if (mySession === speechSessionRef.current) {
        playSentence(index + 1);
      }
    }
  };

  const pauseTts = async () => {
    setIsTtsPaused(true);
    speechSessionRef.current++; // 废弃当前正准备链式播放下一个句子的老会话
    try {
      if (isNativeTts) {
        await CapTTS.stop();
      } else {
        if (synthRef.current && synthRef.current.speaking && !synthRef.current.paused) {
          synthRef.current.pause();
        }
      }
      // 暂停在线音频流
      if (onlineAudioRef.current) {
        onlineAudioRef.current.pause();
      }
    } catch (err) {
      console.error('TTS Pause failed:', err);
    }
  };

  const resumeTts = async () => {
    setIsTtsPaused(false);
    try {
      const activeVoiceObj = availableVoices.find(v => v.name === selectedVoiceName);
      if (activeVoiceObj && activeVoiceObj.type === 'online') {
        if (onlineAudioRef.current) {
          onlineAudioRef.current.play(); // 恢复播放已缓存的在线音频片段
        } else {
          playSentence(activeSentenceIndex >= 0 ? activeSentenceIndex : 0);
        }
      } else {
        if (isNativeTts) {
          // 安卓原生 TTS 重新播放当前句子
          playSentence(activeSentenceIndex >= 0 ? activeSentenceIndex : 0);
        } else {
          if (synthRef.current && synthRef.current.paused) {
            synthRef.current.resume();
          } else {
            playSentence(activeSentenceIndex >= 0 ? activeSentenceIndex : 0);
          }
        }
      }
    } catch (err) {
      console.error('TTS Resume failed:', err);
    }
  };

  const stopTts = async () => {
    setIsTtsPlaying(false);
    setIsTtsPaused(false);
    setActiveSentenceIndex(-1);
    speechSessionRef.current++; // 彻底失效当前播放流
    
    try {
      if (isNativeTts) {
        await CapTTS.stop();
      } else {
        if (synthRef.current) {
          synthRef.current.cancel();
        }
      }
      // 停止并清理在线音频
      if (onlineAudioRef.current) {
        onlineAudioRef.current.pause();
        onlineAudioRef.current = null;
      }
    } catch (err) {
      console.error('TTS Cancel failed:', err);
    }
    utteranceRef.current = null;
  };

  const nextSentence = () => {
    if (activeSentenceIndex < sentences.length - 1) {
      playSentence(activeSentenceIndex + 1);
    }
  };

  const prevSentence = () => {
    if (activeSentenceIndex > 0) {
      playSentence(activeSentenceIndex - 1);
    }
  };

  // 监听语速变化并实时生效
  const handleSpeedChange = async (newSpeed) => {
    setTtsSpeed(newSpeed);
    if (isTtsPlaying && !isTtsPaused) {
      // 语速变化时，立即停止当前句子并以新语速重新开始该句朗读
      playSentence(activeSentenceIndex);
    }
  };

  // 通过事件代理，实现点击文章任意句子即刻从该句开始/切换语音朗读 (极度便捷且响应迅速)
  const handleBodyClick = (e) => {
    // 保证正常超链接的点击跳转行为不受阻碍
    if (e.target.closest('a')) return;

    const spanEl = e.target.closest('.tts-sentence');
    if (spanEl && contentRef.current) {
      const index = parseInt(spanEl.getAttribute('data-sentence-idx'));
      if (index >= 0 && index < sentences.length) {
        if (navigator.vibrate) {
          navigator.vibrate(20); // 震动轻微反馈
        }
        playSentence(index);
      }
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

            {/* 语音音色选择 */}
            <div className="settings-section">
              <div className="settings-label">语音音色 ({availableVoices.length} 种可用)</div>
              {availableVoices.length > 0 ? (
                <div className="voice-selector-container">
                  <select 
                    value={selectedVoiceName} 
                    onChange={(e) => {
                      const newVoiceName = e.target.value;
                      setSelectedVoiceName(newVoiceName);
                      localStorage.setItem('readflow_selected_voice_name', newVoiceName);
                      if (isTtsPlaying && !isTtsPaused) {
                        playSentence(activeSentenceIndex); // 切换音色时，立即以新音色重新朗读当前句
                      }
                    }}
                    className="voice-select-dropdown"
                  >
                    {availableVoices.map(v => (
                      <option key={v.name} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                  <div className="voice-tip">
                    💡 提示：App 会自动发现系统及浏览器中的所有中文音色。你可以在手机“系统设置 - 辅助功能 - 无障碍 - 文本转语音 (TTS)”中安装导入第三方高品质 AI 发音人（如讯飞、微软等），App 将自动发现并支持导入！
                  </div>
                </div>
              ) : (
                <div className="voice-empty">
                  暂无可用中文音色，将使用系统默认发音。
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* 2. 核心文章区域 */}
      <main className="reader-content-wrapper no-scrollbar" ref={contentRef} onClick={handleBodyClick}>
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

          {/* 渲染经过净化清洗和高精准 Span 锚点化的正文 HTML (增加 data-sentence-idx 属性的安全许可) */}
          <div 
            className="reader-body"
            dangerouslySetInnerHTML={{ 
              __html: DOMPurify.sanitize(sanitizedHtml || '', {
                ALLOWED_TAGS: [
                  'p', 'img', 'video', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
                  'ul', 'ol', 'li', 'blockquote', 'strong', 'em', 'span', 'br', 'a', 
                  'section', 'fieldset', 'div', 'pre', 'code',
                  'table', 'thead', 'tbody', 'tr', 'th', 'td'
                ],
                ALLOWED_ATTR: ['src', 'href', 'alt', 'controls', 'class', 'referrerpolicy', 'data-sentence-idx']
              }) 
            }} 
          />
        </article>
      </main>

      {/* 3. 底部语音播放面板 (TTS Panel) */}
      {isTtsPlaying && (
        <div className="tts-panel">
          {/* 顶层极细流光进度条，质感直接拉满 */}
          <div 
            style={{ 
              position: 'absolute', 
              top: 0, 
              left: 0, 
              height: '3px', 
              backgroundColor: 'var(--primary)', 
              width: `${sentences.length > 0 ? ((activeSentenceIndex + 1) / sentences.length) * 100 : 0}%`,
              transition: 'width 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
              borderTopLeftRadius: 'var(--border-radius-lg)',
              borderTopRightRadius: 'var(--border-radius-lg)',
              zIndex: 5
            }} 
          />
          <div className="tts-info">
            <span>正在朗读第 {activeSentenceIndex + 1} / {sentences.length} 句</span>
            <span>语速: {ttsSpeed}x</span>
          </div>

          <div className="tts-controls">
            <button className="btn-tts-secondary" onClick={prevSentence} title="上一句">
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

            <button className="btn-tts-secondary" onClick={nextSentence} title="下一句">
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
