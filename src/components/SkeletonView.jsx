import React from 'react';
import { ArrowLeft } from 'lucide-react';

export default function SkeletonView({ theme, onCancel }) {
  return (
    <div className={`reader-view theme-${theme}`} style={{ animation: 'none' }}>
      {/* 顶部模拟控制栏，支持一键取消抓取，体验流畅 */}
      <header className="reader-header">
        <button className="btn-circle" onClick={onCancel} title="取消加载并返回">
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: '500' }}>
          正在清洗杂质，还原流光视界...
        </span>
        <div style={{ width: '40px' }} /> {/* 左右结构性天平占位 */}
      </header>

      {/* 骨架屏正文区域 */}
      <main className="reader-content-wrapper no-scrollbar">
        <div className="skeleton-container">
          {/* 标题占位 */}
          <div className="skeleton-item skeleton-title" />
          
          {/* 作者/出处占位 */}
          <div className="skeleton-item skeleton-meta" />

          {/* 模拟段落一 */}
          <div className="skeleton-paragraph">
            <div className="skeleton-item skeleton-line w-full" />
            <div className="skeleton-item skeleton-line w-95" />
            <div className="skeleton-item skeleton-line w-90" />
            <div className="skeleton-item skeleton-line w-75" />
          </div>

          {/* 模拟段落二 */}
          <div className="skeleton-paragraph">
            <div className="skeleton-item skeleton-line w-full" />
            <div className="skeleton-item skeleton-line w-full" />
            <div className="skeleton-item skeleton-line w-85" />
            <div className="skeleton-item skeleton-line w-60" />
          </div>

          {/* 模拟段落三 */}
          <div className="skeleton-paragraph">
            <div className="skeleton-item skeleton-line w-full" />
            <div className="skeleton-item skeleton-line w-95" />
            <div className="skeleton-item skeleton-line w-90" />
            <div className="skeleton-item skeleton-line w-75" />
          </div>
        </div>
      </main>
    </div>
  );
}
