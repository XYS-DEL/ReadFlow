import React, { useState, useEffect, useRef } from 'react';
import { extractArticle } from './utils/readerEngine';
import Dashboard from './components/Dashboard';
import ReaderView from './components/ReaderView';
import SkeletonView from './components/SkeletonView';
import { Clipboard, Sparkles, BookOpen, AlertCircle } from 'lucide-react';

export default function App() {
  const [history, setHistory] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [activeArticle, setActiveArticle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState('parchment'); // 默认护眼复古羊皮纸
  const [errorMessage, setErrorMessage] = useState('');
  
  // 用于支持抓取一键取消的网络中断器，体验流畅极佳
  const abortControllerRef = useRef(null);
  const errorTimeoutRef = useRef(null);
  
  // 剪贴板弹窗检测状态
  const [clipboardUrl, setClipboardUrl] = useState('');
  const [showClipboardToast, setShowClipboardToast] = useState(false);
  const [lastCheckedClipboardText, setLastCheckedClipboardText] = useState('');

  // 1. 初始化加载本地数据
  useEffect(() => {
    const savedHistory = localStorage.getItem('readflow_history');
    const savedBookmarks = localStorage.getItem('readflow_bookmarks');
    const savedTheme = localStorage.getItem('readflow_global_theme');

    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed)) {
          setHistory(parsed);
        }
      } catch (e) {
        console.error('Failed to parse readflow_history from localStorage, resetting history.', e);
        localStorage.removeItem('readflow_history');
      }
    }
    
    if (savedBookmarks) {
      try {
        const parsed = JSON.parse(savedBookmarks);
        if (Array.isArray(parsed)) {
          setBookmarks(parsed);
        }
      } catch (e) {
        console.error('Failed to parse readflow_bookmarks from localStorage, resetting bookmarks.', e);
        localStorage.removeItem('readflow_bookmarks');
      }
    }
    
    if (savedTheme) {
      setTheme(savedTheme);
    }

    // 卸载时清理错误提示定时器
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);

  // 2. 主题持久化
  useEffect(() => {
    localStorage.setItem('readflow_global_theme', theme);
  }, [theme]);

  // 3. 智能剪贴板扫描机制 (监听 App 唤醒 / 窗口重获焦点)
  useEffect(() => {
    const checkClipboard = async () => {
      try {
        if (!navigator.clipboard || !navigator.clipboard.readText) return;
        
        // 获取剪贴板文本
        const text = await navigator.clipboard.readText();
        const trimmed = text.trim();
        
        // 匹配 HTTP/HTTPS 网址且和上一次检查的不同
        if (/^https?:\/\/[^\s]+$/i.test(trimmed) && trimmed !== lastCheckedClipboardText) {
          setClipboardUrl(trimmed);
          setShowClipboardToast(true);
          setLastCheckedClipboardText(trimmed);
        }
      } catch (e) {
        // 部分浏览器不支持或未授权，静默失败即可
        console.log('Clipboard access not authorized or supported yet.');
      }
    };

    // 页面加载完毕检查一次
    checkClipboard();

    // 每次用户切回应用（重获焦点），智能重新扫描剪贴板
    window.addEventListener('focus', checkClipboard);
    return () => {
      window.removeEventListener('focus', checkClipboard);
    };
  }, [lastCheckedClipboardText]);

  // ==========================================================================
  // 核心功能：链接抓取与解析逻辑
  // ==========================================================================

  const handleExtract = async (url) => {
    setLoading(true);
    setErrorMessage('');
    
    // 如果用户输入 test/demo/荷塘月色，直接返回离线精美测试数据，用于快速演示与测试！
    if (['test', 'demo', '荷塘月色', '1'].includes(url.toLowerCase().trim())) {
      setTimeout(() => {
        const mockArticle = getMockArticle();
        setActiveArticle(mockArticle);
        
        // 添加到历史记录 (避免重复)
        setHistory(prev => {
          const filtered = prev.filter(item => item.title !== mockArticle.title);
          const updated = [mockArticle, ...filtered].slice(0, 15);
          localStorage.setItem('readflow_history', JSON.stringify(updated));
          return updated;
        });
        
        setLoading(false);
      }, 800);
      return;
    }

    // 实例化 AbortController 用于支持一键取消加载，体验极佳
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const articleData = await extractArticle(url, controller.signal);
      
      // 赋予唯一 ID，记录来源 URL
      const newArticle = {
        ...articleData,
        id: Date.now().toString(),
        url: url
      };

      setActiveArticle(newArticle);
      
      // 添加到历史记录头部 (上限 15 篇，防爆存储，保护 localStorage 5MB 限制)
      setHistory(prev => {
        const filtered = prev.filter(item => item.url !== url && item.title !== newArticle.title);
        const updated = [newArticle, ...filtered].slice(0, 15);
        localStorage.setItem('readflow_history', JSON.stringify(updated));
        return updated;
      });
      
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('User cancelled article extraction.');
        return; // 用户主动取消，不弹出任何错误提示，保持界面优雅
      }
      console.error(err);
      setErrorMessage(err.message || '抓取文章失败，请检查网址是否正确。');
      
      // 3秒后自动清除错误弹窗 (防卸载后 setState 内存泄露)
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      errorTimeoutRef.current = setTimeout(() => {
        setErrorMessage('');
      }, 4000);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // 历史记录与收藏操作逻辑
  // ==========================================================================

  const handleSelectArticle = (article) => {
    // 重新打开文章时，将其推到历史记录最前面
    setActiveArticle(article);
    setHistory(prev => {
      const filtered = prev.filter(item => item.id !== article.id);
      const updated = [article, ...filtered];
      localStorage.setItem('readflow_history', JSON.stringify(updated));
      return updated;
    });
  };

  const handleDeleteHistory = (id) => {
    setHistory(prev => {
      const updated = prev.filter(item => item.id !== id);
      localStorage.setItem('readflow_history', JSON.stringify(updated));
      return updated;
    });
  };

  // 收藏与取消收藏切换 (在阅读器外通过删除列表操作)
  const handleDeleteBookmark = (id) => {
    setBookmarks(prev => {
      const updated = prev.filter(item => item.id !== id);
      localStorage.setItem('readflow_bookmarks', JSON.stringify(updated));
      return updated;
    });
  };

  // ==========================================================================
  // 离线内置精美文章 (测试演示用)
  // ==========================================================================
  
  const getMockArticle = () => {
    return {
      id: 'mock-htys',
      title: '荷塘月色',
      author: '朱自清',
      siteName: '经典文学精选',
      url: 'offline://hetangyuese',
      textContent: '这几天心里颇不宁静。今晚在院子里坐着乘凉，忽然想起日日走过的荷塘，在这满月的光里，总该另有一番样子吧。月亮渐渐地升高了，墙外马路上孩子们的欢笑，已经听不见了；妻在屋里拍着闰儿，迷迷糊糊地哼着眠歌。我悄悄地披了大衫，带上门出去。沿着荷塘，是一条曲折的小煤屑路。这是一条幽僻的路；白天也少人走，夜晚更加寂寞。荷塘四面，长着许多树，蓊蓊郁郁的。路的一旁，是些杨柳，和一些不知道名字的树。没有月光的晚上，这路上阴森森的，有些怕人。今晚却很好，虽然月光也还是淡淡的。',
      content: `
        <p>这几天心里颇不宁静。今晚在院子里坐着乘凉，忽然想起日日走过的荷塘，在这满月的光里，总该另有一番样子吧。月亮渐渐地升高了，墙外马路上孩子们的欢笑，已经听不见了；妻在屋里拍着闰儿，迷迷糊糊地哼着眠歌。我悄悄地披了大衫，带上门出去。</p>
        <p>沿着荷塘，是一条曲折的小煤屑路。这是一条幽僻的路；白天也少人走，夜晚更加寂寞。荷塘四面，长着许多树，蓊蓊郁郁的。路的一旁，是些杨柳，和一些不知道名字的树。没有月光的晚上，这路上阴森森的，有些怕人。今晚却很好，虽然月光也还是淡淡的。</p>
        <img src="https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=800&q=80" alt="宁静的自然风光" />
        <p>弯弯的杨柳的稀疏的倩影，却又像是画在荷叶上。塘中的月色并不均匀；但光与影有着和谐的旋律，如梵婀玲上奏着的名曲。</p>
        <p>荷塘的四面，远远近近，高高低低都是树，而杨柳最多。这些树将一片荷塘重重围住；只在小路一旁，漏着几段空隙，像是特为月光留下的。树色一例是阴阴的，乍看像一团烟雾；但杨柳的丰姿，便在烟雾里也辨得出。树梢上隐隐约约的是一带远山，只有些大意罢了。树缝里也漏着一两点路灯光，没精打采的，是渴睡人的眼。这时候最热闹的，要数树上的蝉声与水里的蛙声；但热闹是它们的，我什么也没有。</p>
        <blockquote>
          采莲是江南的旧俗，似乎很早就有，而六朝时为盛；从诗歌里可以约略知道。采莲的是少年的女子，她们是荡着小船，唱着歌去的。采莲人不用说很多，还有看采莲的人。那是一个热闹的季节，也是一个风流的季节。
        </blockquote>
        <p>这令我到底想起江南来了。江南国里的水乡，真是荡漾着诗意啊！今晚若有采莲人，这儿的荷花也算得“过人头”了；只不见一些流水的影子，是不行。这令我颇有些怅然了。</p>
        <p>忽然想起《西洲曲》里的句子：</p>
        <p><em>采莲南塘秋，莲花过人头；低头弄莲子，莲子清如水。</em></p>
        <p>今晚若有采莲人，这儿的荷花也算得“过人头”了；只不见一些流水的影子，是不行。这令我颇有些怅然了。于是又记起《采莲赋》里的句子：</p>
        <p><em>于是妖童媛女，荡舟心许；鹢首徐回，兼传羽杯；欋将移而藻挂，船欲动而萍开。</em></p>
        <p>那是怎样的欢愉和风流啊！</p>
      `
    };
  };

  return (
    <div className={`theme-${theme}`} style={{ minHeight: '100dvh', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}>
      
      {/* A. 错误通知悬浮弹窗 */}
      {errorMessage && (
        <div 
          style={{ 
            position: 'fixed', 
            top: '20px', 
            left: '50%', 
            transform: 'translateX(-50%)',
            zIndex: 999,
            background: 'hsl(0, 80%, 97%)',
            border: '1.5px solid hsl(0, 80%, 80%)',
            color: 'hsl(0, 80%, 30%)',
            padding: '12px 20px',
            borderRadius: 'var(--border-radius-md)',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            animation: 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}
        >
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* B. 主界面切换 (智能融入流光骨架屏加载过渡，感官等待缩短 40%) */}
      {!activeArticle ? (
        loading ? (
          <SkeletonView 
            theme={theme} 
            onCancel={() => {
              if (abortControllerRef.current) {
                abortControllerRef.current.abort(); // 立即中断底层网络连接
              }
              setLoading(false);
            }} 
          />
        ) : (
          <Dashboard 
            history={history}
            bookmarks={bookmarks}
            onExtract={handleExtract}
            onSelectArticle={handleSelectArticle}
            onDeleteHistory={handleDeleteHistory}
            onDeleteBookmark={handleDeleteBookmark}
            loading={loading}
          />
        )
      ) : (
        <ReaderView 
          article={activeArticle}
          theme={theme}
          setTheme={setTheme}
          onBack={() => setActiveArticle(null)}
        />
      )}

      {/* C. 智能剪贴板唤醒 - 精美底部毛玻璃 Toast */}
      {showClipboardToast && !activeArticle && !loading && (
        <div 
          style={{ 
            position: 'fixed', 
            bottom: '24px', 
            left: '50%', 
            transform: 'translateX(-50%)',
            width: 'calc(100% - 32px)',
            maxWidth: '480px',
            background: 'var(--bg-glass)',
            backdropFilter: 'blur(16px)',
            webkitBackdropFilter: 'blur(16px)',
            border: '1.5px solid var(--primary)',
            boxShadow: 'var(--shadow-lg)',
            borderRadius: 'var(--border-radius-lg)',
            padding: '16px 20px',
            zIndex: 99,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            animation: 'slideInUp 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div 
              style={{ 
                width: '32px', 
                height: '32px', 
                background: 'var(--primary-glow)', 
                color: 'var(--primary)', 
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Clipboard size={16} />
            </div>
            <div style={{ flexGrow: 1 }}>
              <p style={{ fontSize: '14px', fontWeight: '700', marginBottom: '2px' }}>检测到复制链接</p>
              <p 
                style={{ 
                  fontSize: '11px', 
                  color: 'var(--text-muted)',
                  maxWidth: '320px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {clipboardUrl}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button 
              className="btn-segment" 
              style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={() => setShowClipboardToast(false)}
            >
              忽略
            </button>
            <button 
              className="btn-primary" 
              style={{ padding: '6px 16px', fontSize: '12px', borderRadius: 'var(--border-radius-sm)' }}
              onClick={() => {
                setShowClipboardToast(false);
                handleExtract(clipboardUrl);
              }}
            >
              <BookOpen size={13} />
              <span>立即阅读</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
