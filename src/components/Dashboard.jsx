import React, { useState } from 'react';
import { 
  BookOpen, 
  Clock, 
  Bookmark, 
  Trash2, 
  Sparkles, 
  Link,
  ChevronRight,
  TrendingUp
} from 'lucide-react';

export default function Dashboard({ 
  history, 
  bookmarks, 
  onExtract, 
  onSelectArticle, 
  onDeleteHistory, 
  onDeleteBookmark, 
  loading 
}) {
  const [url, setUrl] = useState('');
  const [activeTab, setActiveTab] = useState('history'); // 'history' | 'bookmarks'

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    onExtract(url.trim());
    setUrl('');
  };

  // 统计计算
  const totalReadCount = history.length + bookmarks.length;
  const totalWords = history.reduce((sum, item) => sum + (item.textContent?.length || 0), 0) +
                     bookmarks.reduce((sum, item) => sum + (item.textContent?.length || 0), 0);

  return (
    <div className="app-container">
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

      {/* 核心操作控制台 */}
      <div className="dashboard-card">
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

        {/* 剪贴板快速粘贴小提示 (如果剪贴板有内容由父组件触发，这里展示输入帮助) */}
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
        <div className="article-card" style={{ cursor: 'default', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>累计阅读文章</span>
          <span style={{ fontSize: '24px', fontWeight: '700', color: 'var(--primary)' }}>{totalReadCount} 篇</span>
        </div>
        <div className="article-card" style={{ cursor: 'default', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>累计清洗字数</span>
          <span style={{ fontSize: '24px', fontWeight: '700', color: 'var(--primary)' }}>{totalWords.toLocaleString()} 字</span>
        </div>
      </div>

      {/* 历史记录与收藏选项卡 */}
      <div className="section-header">
        <div style={{ display: 'flex', gap: '16px' }}>
          <span 
            onClick={() => setActiveTab('history')}
            style={{ 
              cursor: 'pointer', 
              color: activeTab === 'history' ? 'var(--text-main)' : 'var(--text-muted)',
              borderBottom: activeTab === 'history' ? '2px solid var(--primary)' : 'none',
              paddingBottom: '4px'
            }}
          >
            最近阅读 ({history.length})
          </span>
          <span 
            onClick={() => setActiveTab('bookmarks')}
            style={{ 
              cursor: 'pointer', 
              color: activeTab === 'bookmarks' ? 'var(--text-main)' : 'var(--text-muted)',
              borderBottom: activeTab === 'bookmarks' ? '2px solid var(--primary)' : 'none',
              paddingBottom: '4px'
            }}
          >
            我的收藏 ({bookmarks.length})
          </span>
        </div>
      </div>

      {/* 列表渲染 */}
      <div className="article-list">
        {activeTab === 'history' ? (
          history.length === 0 ? (
            <div className="empty-state">
              <Clock size={36} strokeWidth={1.5} />
              <div>
                <p style={{ fontWeight: '600', marginBottom: '4px' }}>暂无阅读历史</p>
                <p style={{ fontSize: '13px' }}>在上方粘贴链接，立即开启您的第一次纯净阅读旅程。</p>
              </div>
            </div>
          ) : (
            history.map((item, idx) => (
              <div 
                key={item.id || idx} 
                className="article-card"
                onClick={() => onSelectArticle(item)}
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
                <button 
                  className="btn-icon-danger"
                  onClick={(e) => {
                    e.stopPropagation(); // 阻止打开阅读器
                    onDeleteHistory(item.id);
                  }}
                  title="删除历史"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )
        ) : (
          bookmarks.length === 0 ? (
            <div className="empty-state">
              <Bookmark size={36} strokeWidth={1.5} />
              <div>
                <p style={{ fontWeight: '600', marginBottom: '4px' }}>暂无收藏文章</p>
                <p style={{ fontSize: '13px' }}>在阅读器中，可以点击右上角收藏，方便您随时离线查看。</p>
              </div>
            </div>
          ) : (
            bookmarks.map((item, idx) => (
              <div 
                key={item.id || idx} 
                className="article-card"
                onClick={() => onSelectArticle(item)}
              >
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
                <button 
                  className="btn-icon-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteBookmark(item.id);
                  }}
                  title="取消收藏"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )
        )}
      </div>

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
