import React, { useState, useRef } from 'react';
import { 
  BookOpen, 
  Clock, 
  Bookmark, 
  Trash2, 
  Sparkles, 
  Link,
  ChevronRight,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';

export default function Dashboard({ 
  history, 
  bookmarks, 
  onExtract, 
  onSelectArticle, 
  onDeleteHistory, 
  onDeleteBookmark, 
  onToggleBookmark,
  loading,
  activeTab,
  setActiveTab
}) {
  const [url, setUrl] = useState('');

  // ==========================================================================
  // 手势与二次确认弹出层状态
  // ==========================================================================
  const [longPressedArticle, setLongPressedArticle] = useState(null); // 当前长按选中的历史文章对象
  const [activeConfirmModal, setActiveConfirmModal] = useState(null); // 二次确认模态框信息
  
  // 侧滑手势状态 (我的收藏)
  const [swipedCardId, setSwipedCardId] = useState(null); // 已经侧滑展开的卡片 ID
  const [activeSwipeId, setActiveSwipeId] = useState(null); // 当前正在被滑动的卡片 ID
  const [swipeOffset, setSwipeOffset] = useState(0); // 实时滑动水平像素偏移量
  
  // 指针/触摸控制变量
  const pressTimerRef = useRef(null);
  const touchStartPosRef = useRef({ x: 0, y: 0 });
  const isLongPressTriggeredRef = useRef(false);
  const swipeStartPosRef = useRef({ x: 0, y: 0 });
  const currentSwipeOffsetRef = useRef(0);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    onExtract(url.trim());
    setUrl('');
  };

  // ==========================================================================
  // 1. 最近阅读 - 统一指针长按处理器 (Pointer Event Unified Handlers)
  // ==========================================================================
  const handlePointerDown = (item, e) => {
    if (e.button !== undefined && e.button !== 0) return;
    
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {}
    
    touchStartPosRef.current = { x: e.clientX, y: e.clientY };
    isLongPressTriggeredRef.current = false;

    pressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      if (navigator.vibrate) {
        navigator.vibrate(45);
      }
      setLongPressedArticle(item);
    }, 600);
  };

  const handlePointerMove = (e) => {
    if (!pressTimerRef.current) return;
    
    const diffX = Math.abs(e.clientX - touchStartPosRef.current.x);
    const diffY = Math.abs(e.clientY - touchStartPosRef.current.y);

    if (diffX > 10 || diffY > 10) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const handlePointerUp = (item, e) => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}

    if (isLongPressTriggeredRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    const diffX = Math.abs(e.clientX - touchStartPosRef.current.x);
    const diffY = Math.abs(e.clientY - touchStartPosRef.current.y);
    if (diffX < 10 && diffY < 10) {
      onSelectArticle(item);
    }
  };

  const handlePointerCancel = (e) => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}
  };

  // ==========================================================================
  // 2. 我的收藏 - 统一指针侧滑处理器 (Pointer Event Swipable Handlers)
  // ==========================================================================
  const handleSwipeDown = (item, e) => {
    if (e.button !== undefined && e.button !== 0) return;
    
    if (swipedCardId && swipedCardId !== item.id) {
      setSwipedCardId(null);
    }
    
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {}
    
    swipeStartPosRef.current = { x: e.clientX, y: e.clientY };
    setActiveSwipeId(item.id);
    
    currentSwipeOffsetRef.current = swipedCardId === item.id ? -90 : 0;
    setSwipeOffset(currentSwipeOffsetRef.current);
  };

  const handleSwipeMove = (e) => {
    if (activeSwipeId === null) return;
    
    const deltaX = e.clientX - swipeStartPosRef.current.x;
    const deltaY = e.clientY - swipeStartPosRef.current.y;
    
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaX) < 10) {
      setActiveSwipeId(null);
      setSwipeOffset(0);
      return;
    }
    
    let targetOffset = currentSwipeOffsetRef.current + deltaX;
    
    if (targetOffset < -110) targetOffset = -110;
    if (targetOffset > 10) targetOffset = 10;
    
    setSwipeOffset(targetOffset);
  };

  const handleSwipeUp = (item, e) => {
    if (activeSwipeId !== item.id) return;
    setActiveSwipeId(null);
    
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}

    if (swipeOffset < -40) {
      setSwipedCardId(item.id);
      setSwipeOffset(-90);
    } else {
      setSwipedCardId(null);
      setSwipeOffset(0);
    }
  };

  // 统计计算 - 合并历史和收藏并去重，以 url (或 title 如果 url 不存在) 为唯一识别符，防止重复计算同一篇文章
  const uniqueArticles = [];
  const seenKeys = new Set();
  
  [...history, ...bookmarks].forEach(item => {
    if (!item) return;
    const key = item.url || item.title;
    if (key && !seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueArticles.push(item);
    }
  });

  const totalReadCount = uniqueArticles.length;
  const totalWords = uniqueArticles.reduce((sum, item) => sum + (item && item.textContent ? item.textContent.length : 0), 0);

  return (
    <div className="app-container" style={{ paddingBottom: '90px' }}>
      {/* 顶部标题区 */}
      <header className="app-header">
        <div className="logo-section">
          <div className="logo-icon">
            <BookOpen size={20} />
          </div>
          <span className="logo-text">ReadFlow</span>
        </div>
        <div className="meta-item" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          <Sparkles size={14} style={{ color: 'var(--primary)' }} />
          <span>纯净 · 障碍关怀</span>
        </div>
      </header>

      {/* 1. 首页 Tab 页面 */}
      {activeTab === 'home' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'scaleIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both' }}>
          {/* 核心操作控制台 */}
          <div className="dashboard-card" style={{ marginBottom: 0 }}>
            <h2 className="welcome-title">开启流光纯净阅读</h2>
            <p className="welcome-desc">
              粘贴任意网页或微信公众号链接，我们将为您洗涤所有广告、弹窗与多余排版，还原极致舒适的沉浸式字里行间。
            </p>

            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <input 
                  type="text" 
                  placeholder="粘贴微信公众号、知乎、新闻或博客网址..." 
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="input-field"
                  disabled={loading}
                />
                <button type="submit" className="btn-primary" disabled={loading || !url.trim()}>
                  {loading ? (
                    <>
                      <div className="loading-spinner" />
                      <span>清洗中...</span>
                    </>
                  ) : (
                    <>
                      <BookOpen size={16} />
                      <span>开始阅读</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* 剪贴板快速粘贴小提示 */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Link size={12} />
                <span>支持各大主流平台图文、动图与长文提取</span>
              </span>
            </div>
          </div>

          {/* 数据微统计看板 */}
          <div 
            style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
              gap: '12px', 
              marginBottom: '28px',
              animation: 'fadeInUp 0.6s cubic-bezier(0.25, 1, 0.5, 1) 0.15s both'
            }}
          >
            <div className="article-card" style={{ cursor: 'default', display: 'flex', flexDirection: 'column', gap: '4px', margin: 0 }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>累计阅读文章</span>
              <span style={{ fontSize: '24px', fontWeight: '700', color: 'var(--primary)' }}>{totalReadCount} 篇</span>
            </div>
            <div className="article-card" style={{ cursor: 'default', display: 'flex', flexDirection: 'column', gap: '4px', margin: 0 }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>累计清洗字数</span>
              <span style={{ fontSize: '24px', fontWeight: '700', color: 'var(--primary)' }}>{totalWords.toLocaleString()} 字</span>
            </div>
          </div>
        </div>
      )}

      {/* 2. 最近阅读 Tab 页面 */}
      {activeTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'scaleIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both' }}>
          <div className="section-header" style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} style={{ color: 'var(--primary)' }} />
              <span style={{ fontWeight: '700', fontSize: '18px', color: 'var(--text-main)' }}>最近阅读 ({history.length})</span>
            </div>
          </div>

          <div className="article-list">
            {history.length === 0 ? (
              <div className="empty-state" style={{ padding: '60px 20px' }}>
                <Clock size={36} strokeWidth={1.5} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                <div>
                  <p style={{ fontWeight: '600', marginBottom: '4px' }}>暂无最近阅读历史</p>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>在首页输入框粘贴链接，立即开启您的第一次纯净阅读旅程。</p>
                </div>
              </div>
            ) : (
              history.map((item, idx) => (
                <div 
                  key={item.id || idx} 
                  className={`article-card ${longPressedArticle && longPressedArticle.id === item.id ? 'longpress-active' : ''}`}
                  onPointerDown={(e) => handlePointerDown(item, e)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={(e) => handlePointerUp(item, e)}
                  onPointerCancel={handlePointerCancel}
                  style={{ userSelect: 'none', touchAction: 'none' }}
                >
                  <div className="article-card-info">
                    <h3 className="article-card-title">{item.title}</h3>
                    <div className="article-card-meta">
                      <span className="meta-item">
                        <Clock size={12} />
                        {item.siteName}
                      </span>
                      <span className="meta-item">
                        {item.textContent?.length || 0} 字
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 3. 我的收藏 Tab 页面 */}
      {activeTab === 'bookmarks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'scaleIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both' }}>
          <div className="section-header" style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bookmark size={18} style={{ color: 'var(--primary)' }} />
              <span style={{ fontWeight: '700', fontSize: '18px', color: 'var(--text-main)' }}>我的收藏 ({bookmarks.length})</span>
            </div>
          </div>

          <div className="article-list">
            {bookmarks.length === 0 ? (
              <div className="empty-state" style={{ padding: '60px 20px' }}>
                <Bookmark size={36} strokeWidth={1.5} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                <div>
                  <p style={{ fontWeight: '600', marginBottom: '4px' }}>暂无收藏文章</p>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>在阅读器中，可以点击右上角收藏按钮，方便您随时离线查看。</p>
                </div>
              </div>
            ) : (
              bookmarks.map((item, idx) => {
                const isSwipingThis = activeSwipeId === item.id;
                const isSwipedThis = swipedCardId === item.id;
                
                let transformStyle = 'translateX(0px)';
                if (isSwipingThis) {
                  transformStyle = `translateX(${swipeOffset}px)`;
                } else if (isSwipedThis) {
                  transformStyle = 'translateX(-90px)';
                }
                
                return (
                  <div key={item.id || idx} className="swipe-card-wrapper">
                    {/* 底层取消收藏操作区 */}
                    <div 
                      className="swipe-action-layer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveConfirmModal({ type: 'deleteBookmark', article: item });
                      }}
                    >
                      <Bookmark size={16} fill="white" />
                      <span>取消收藏</span>
                    </div>

                    {/* 顶层卡片内容区 */}
                    <div 
                      className="swipe-content-layer"
                      style={{ transform: transformStyle, touchAction: 'pan-y' }}
                      onPointerDown={(e) => handleSwipeDown(item, e)}
                      onPointerMove={handleSwipeMove}
                      onPointerUp={(e) => handleSwipeUp(item, e)}
                      onPointerCancel={() => {
                        setActiveSwipeId(null);
                        setSwipeOffset(0);
                      }}
                      onClick={(e) => {
                        if (isSwipedThis) {
                          e.preventDefault();
                          e.stopPropagation();
                          setSwipedCardId(null);
                          return;
                        }
                        onSelectArticle(item);
                      }}
                    >
                      <div className="article-card" style={{ margin: 0, borderRadius: 0, border: 'none' }}>
                        <div className="article-card-info">
                          <h3 className="article-card-title">{item.title}</h3>
                          <div className="article-card-meta">
                            <span className="meta-item">
                              <Bookmark size={12} style={{ color: 'var(--primary)' }} />
                              {item.siteName}
                            </span>
                            <span className="meta-item">
                              {item.textContent?.length || 0} 字
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 长按触发的底部功能抽屉 Drawer */}
      {longPressedArticle && (
        <>
          <div className="bottom-sheet-overlay" onClick={() => setLongPressedArticle(null)} />
          <div className="bottom-sheet">
            <div className="bottom-sheet-handle" />
            <div className="bottom-sheet-title">文章管理: 《{longPressedArticle.title}》</div>
            
            {/* 收藏 / 取消收藏 切换 */}
            <button 
              className="bottom-sheet-btn"
              onClick={() => {
                const article = longPressedArticle;
                setLongPressedArticle(null);
                setActiveConfirmModal({ type: 'toggleBookmark', article });
              }}
            >
              <Bookmark size={16} fill={bookmarks.some(b => b.url === longPressedArticle.url || b.title === longPressedArticle.title) ? "var(--text-main)" : "none"} />
              <span>
                {bookmarks.some(b => b.url === longPressedArticle.url || b.title === longPressedArticle.title) 
                  ? '从我的收藏中移除' 
                  : '加入我的收藏'}
              </span>
            </button>

            {/* 删除阅读历史 */}
            <button 
              className="bottom-sheet-btn danger"
              onClick={() => {
                const article = longPressedArticle;
                setLongPressedArticle(null);
                setActiveConfirmModal({ type: 'deleteHistory', article });
              }}
            >
              <Trash2 size={16} />
              <span>从阅读历史中删除</span>
            </button>

            {/* 取消 */}
            <button className="bottom-sheet-btn cancel" onClick={() => setLongPressedArticle(null)}>
              取消
            </button>
          </div>
        </>
      )}

      {/* 高保真二次确认弹窗 Modal */}
      {activeConfirmModal && (
        <>
          <div className="modal-overlay" onClick={() => setActiveConfirmModal(null)} />
          <div className="modal-card">
            <div className={`modal-icon-container ${activeConfirmModal.type !== 'toggleBookmark' || bookmarks.some(b => b.url === activeConfirmModal.article.url || b.title === activeConfirmModal.article.title) ? 'danger' : ''}`}>
              {activeConfirmModal.type === 'toggleBookmark' && !bookmarks.some(b => b.url === activeConfirmModal.article.url || b.title === activeConfirmModal.article.title) ? (
                <Bookmark size={24} />
              ) : activeConfirmModal.type === 'toggleBookmark' ? (
                <AlertTriangle size={24} />
              ) : (
                <Trash2 size={24} />
              )}
            </div>
            
            <h3 className="modal-title">
              {activeConfirmModal.type === 'deleteHistory' && '确认删除历史'}
              {activeConfirmModal.type === 'deleteBookmark' && '确认取消收藏'}
              {activeConfirmModal.type === 'toggleBookmark' && (
                bookmarks.some(b => b.url === activeConfirmModal.article.url || b.title === activeConfirmModal.article.title)
                  ? '确认取消收藏'
                  : '确认加入收藏'
              )}
            </h3>
            
            <p className="modal-desc">
              {activeConfirmModal.type === 'deleteHistory' && (
                <>
                  您确定要将以下文章从阅读历史中删除吗？此操作无法撤销。
                  <span className="modal-article-title">《{activeConfirmModal.article.title}》</span>
                </>
              )}
              {activeConfirmModal.type === 'deleteBookmark' && (
                <>
                  您确定要取消收藏以下文章吗？取消后该文章将无法再从离线存储中读取。
                  <span className="modal-article-title">《{activeConfirmModal.article.title}》</span>
                </>
              )}
              {activeConfirmModal.type === 'toggleBookmark' && (
                <>
                  {bookmarks.some(b => b.url === activeConfirmModal.article.url || b.title === activeConfirmModal.article.title) ? (
                    <>
                      您确定要取消收藏以下文章吗？取消后该文章将无法再从离线存储中读取。
                    </>
                  ) : (
                    <>
                      您确定要将以下文章收藏下来以便随时离线阅读吗？
                    </>
                  )}
                  <span className="modal-article-title">《{activeConfirmModal.article.title}》</span>
                </>
              )}
            </p>
            
            <div className="modal-btn-group">
              <button className="modal-btn" onClick={() => setActiveConfirmModal(null)}>
                我再想想
              </button>
              <button 
                className={`modal-btn confirm ${activeConfirmModal.type !== 'toggleBookmark' || bookmarks.some(b => b.url === activeConfirmModal.article.url || b.title === activeConfirmModal.article.title) ? 'danger' : ''}`}
                onClick={() => {
                  const { type, article } = activeConfirmModal;
                  setActiveConfirmModal(null);
                  
                  if (type === 'deleteHistory') {
                    onDeleteHistory(article.id);
                  } else if (type === 'deleteBookmark') {
                    onDeleteBookmark(article.id);
                    setSwipedCardId(null);
                  } else if (type === 'toggleBookmark') {
                    onToggleBookmark(article);
                  }
                }}
              >
                确认执行
              </button>
            </div>
          </div>
        </>
      )}

      {/* 底部导航栏 */}
      <nav className="bottom-nav">
        <button 
          className={`bottom-nav-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
        >
          <BookOpen size={20} />
          <span>首页</span>
        </button>
        <button 
          className={`bottom-nav-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <Clock size={20} />
          <span>最近阅读</span>
        </button>
        <button 
          className={`bottom-nav-item ${activeTab === 'bookmarks' ? 'active' : ''}`}
          onClick={() => setActiveTab('bookmarks')}
        >
          <Bookmark size={20} />
          <span>我的收藏</span>
        </button>
      </nav>

      {/* 简易的环绕加载动效样式 */}
      <style>{`
        .loading-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
