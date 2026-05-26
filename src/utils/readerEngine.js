import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

/**
 * 智能抓取并提取网页正文 (支持 Capacitor 原生桥接与 Web 代理)
 * @param {string} url 目标网页网址
 * @param {AbortSignal} [abortSignal] 中断网络请求的信号，用于支持一键取消加载
 * @returns {Promise<{title: string, author: string, content: string, textContent: string, siteName: string}>}
 */
export async function extractArticle(url, abortSignal) {
  // 补全协议头
  let targetUrl = url.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  let htmlText = '';
  
  // 1. 判断是否在 Capacitor 原生环境下 (Android/iOS)
  // 原生环境利用 Java 原生 Fetch，完全绕过浏览器 CORS 跨域限制
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) {
    try {
      const { CapacitorHttp } = window.Capacitor.Plugins;
      const response = await CapacitorHttp.get({
        url: targetUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
        }
      });
      htmlText = response.data;
    } catch (e) {
      console.warn('Capacitor native HTTP fetch failed, trying fallback...', e);
    }
  }

  // 2. 如果原生请求没有获取到，或者在 Web 浏览器开发环境下
  if (!htmlText) {
    try {
      let fetchUrl = '';
      
      // 智能检测本地开发环境 (包含 localhost、127.0.0.1、以及局域网本地调试 IP 如 192.168.x.x 等)
      // 确保手机或其它设备进行本地局域网调试时，依然能正确走本地 Node 代理，彻底绕过跨域与公网代理失败！
      const isLocalDev = 
        window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' || 
        /^192\.168\./.test(window.location.hostname) || 
        /^10\./.test(window.location.hostname) || 
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(window.location.hostname);

      if (isLocalDev) {
        fetchUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
      } else {
        // 在公网 Web 部署环境下，才使用公共的跨域代理作为兜底
        fetchUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
      }

      const response = await fetch(fetchUrl, { signal: abortSignal });
      if (!response.ok) {
        throw new Error(`HTTP 状态码异常: ${response.status}`);
      }
      htmlText = await response.text();
    } catch (e) {
      console.error('CORS Proxy fetch failed, trying direct fetch...', e);
      // 最后的垂死挣扎：直接 Fetch (可能遭遇 CORS)
      try {
        const response = await fetch(targetUrl, { signal: abortSignal });
        htmlText = await response.text();
      } catch (directErr) {
        throw new Error('网页加载失败，本地开发请确保已开启 Vite 服务器；生产环境可能该网站有严格的反爬限制。');
      }
    }
  }

  if (!htmlText || htmlText.length < 50) {
    throw new Error('未能成功提取到网页内容，网页内容过空。');
  }

  // 3. 使用 DOMParser 将 HTML 字符串转化为 DOM 树
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');

  // 判断微信和 Git 平台
  const isWeChat = /mp\.weixin\.qq\.com/i.test(targetUrl);
  const isGitHub = /github\.com\/([^/]+)\/([^/]+)/i.test(targetUrl);
  const isGitee = /gitee\.com\/([^/]+)\/([^/]+)/i.test(targetUrl);
  
  const isGitRepo = (isGitHub && !/\/issues|\/pulls|\/actions|\/projects|\/wiki|\/security|\/releases|\/tags|\/graphs|\/settings/i.test(targetUrl)) ||
                    (isGitee && !/\/pulls|\/issues|\/keys|\/settings|\/releases|\/wikis|\/graphs/i.test(targetUrl));

  // ==========================================================================
  // 【微信专属深度定制逻辑】
  // ==========================================================================
  if (isWeChat) {
    const titleEl = doc.querySelector('#activity-name');
    const title = titleEl ? titleEl.textContent.trim() : (doc.title || '微信公众号文章');

    const authorEl = doc.querySelector('#profileBt a') || doc.querySelector('.rich_media_meta_nickname') || doc.querySelector('#js_author_name');
    const author = authorEl ? authorEl.textContent.trim() : '微信作者';

    // 微信正文容器 100% 固定为 #js_content
    const contentEl = doc.querySelector('#js_content');
    if (!contentEl) {
      throw new Error('未能在微信文章中找到正文内容区域，可能该网页格式已改变。');
    }

    // 预处理微信图片、去除推广和无用排版
    preprocessWeChatDOM(contentEl);

    // 纯文本字数统计
    const textContent = contentEl.textContent || '';

    // HTML 清洗：特别允许 'referrerpolicy' 及 section, fieldset 等微信排版常用标签以及代码块
    const cleanHtml = DOMPurify.sanitize(contentEl.innerHTML, {
      ALLOWED_TAGS: [
        'p', 'img', 'video', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
        'ul', 'ol', 'li', 'blockquote', 'strong', 'em', 'span', 'br', 'a', 
        'section', 'fieldset', 'div', 'pre', 'code'
      ],
      ALLOWED_ATTR: ['src', 'href', 'alt', 'controls', 'class', 'referrerpolicy']
    });

    return {
      title,
      author,
      content: cleanHtml,
      textContent: textContent.trim(),
      siteName: '微信公众号'
    };
  }

  // ==========================================================================
  // 【Git 平台专属深度定制逻辑 (GitHub & Gitee)】
  // ==========================================================================
  if (isGitRepo) {
    const pathParts = new URL(targetUrl).pathname.split('/').filter(Boolean);
    const owner = pathParts[0] || 'Git';
    const repo = pathParts[1] || 'Repository';
    const title = `${owner} / ${repo}`;
    const siteName = isGitHub ? 'GitHub 仓库' : 'Gitee 仓库';

    // 1. 抓取顶层项目目录结构
    const fileItems = [];
    const fileRows = doc.querySelectorAll('tr.js-navigation-item, div.Box-row, [data-testid="files-list-table"] [role="row"], .react-directory-row, table.tree-table tr.tree-item, #git-tree tr, .tree-item');
    
    fileRows.forEach(row => {
      const link = row.querySelector('a[href*="/tree/"], a[href*="/blob/"], .js-navigation-open, a.tree-item-name, a');
      if (!link) return;
      
      const href = link.getAttribute('href') || '';
      const name = link.textContent.trim();
      
      // 过滤返回上一级等杂质
      if (!name || name === '..' || name.startsWith('Go to parent') || name.includes('View all files') || name.includes('history')) return;
      
      // 判定是目录还是文件
      const isDir = row.querySelector('.octicon-file-directory, [aria-label="Directory"], svg[title="Directory"], .fa-folder, .fa-folder-open') || href.includes('/tree/');
      fileItems.push({ name, isDir });
    });

    // Helper: 安全的 HTML 转义函数，防御项目目录文件名 XSS 注入（纵深防御）
    const escapeHtml = (str) => {
      if (!str) return '';
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    // 2. 生成目录结构的 HTML 布局
    let fileTreeHtml = '';
    if (fileItems.length > 0) {
      // 过滤重复匹配项
      const seenNames = new Set();
      const uniqueFileItems = fileItems.filter(item => {
        if (seenNames.has(item.name)) return false;
        seenNames.add(item.name);
        return true;
      });

      // 排序：文件夹排前面，文件排后面
      uniqueFileItems.sort((a, b) => (b.isDir ? 1 : 0) - (a.isDir ? 1 : 0));
      
      fileTreeHtml = `
        <div class="github-file-tree">
          <div class="github-tree-header">📁 项目目录结构 (Top-Level)</div>
          <div class="github-tree-grid">
            ${uniqueFileItems.map(item => `
              <div class="github-tree-item">
                <span class="github-tree-icon">${item.isDir ? '📁' : '📄'}</span>
                <span class="github-tree-name">${escapeHtml(item.name)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // 3. 【核心双层保护解析架构】README.md 内容捕获与 Markdown 动态编译
    let readmeHtml = '';
    let textContent = '';
    let parsedGitee = false;

    // Helper: HTML entity 解码函数，利用浏览器原生 DOMParser 实现完美、全面的 HTML 实体解析（支持任意进制与命名实体）
    const decodeHtmlEntities = (str) => {
      if (!str) return '';
      try {
        const docParser = new DOMParser();
        const parsedDoc = docParser.parseFromString(str, 'text/html');
        return parsedDoc.documentElement.textContent || str;
      } catch (e) {
        console.warn('[解码警告] 原生 DOMParser 解码失败，启用备用实体替换方案', e);
        return str
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&#x000A;/g, '\n')
          .replace(/&#x0A;/g, '\n')
          .replace(/&nbsp;/g, ' ');
      }
    };

    // 3.1 针对 Gitee 平台的隐藏 raw markdown textarea 进行精准定向捕获
    if (isGitee) {
      const giteeTextarea = doc.querySelector('.file_content.markdown-body textarea.content') || 
                            doc.querySelector('blob-markdown-renderer textarea.content') ||
                            doc.querySelector('.markdown-body textarea') ||
                            doc.querySelector('textarea.content');
      if (giteeTextarea) {
        const rawMarkdown = giteeTextarea.value || giteeTextarea.textContent || '';
        try {
          const decodedMarkdown = decodeHtmlEntities(rawMarkdown);
          readmeHtml = marked.parse(decodedMarkdown);
          textContent = decodedMarkdown;
          parsedGitee = true;
          console.log('[Gitee 专属解析] 成功通过 Gitee 隐藏 textarea 提取并编译 Markdown！');
        } catch (e) {
          console.error('Gitee marked parse failed, falling back to standard...', e);
        }
      }
    }

    if (!parsedGitee) {
      // 3.2 尝试寻找已经由服务器渲染好的 HTML 容器（这最稳定，相对链接和图片地址均已由官方服务器解析妥当）
      // 特别注意：利用 :not(textarea) 排除 Gitee 用来存放原始 markdown 源码的隐藏 textarea！
      const readmeEl = doc.querySelector('#readme:not(textarea)') || 
                       doc.querySelector('.markdown-body:not(textarea)') || 
                       doc.querySelector('article.markdown-body') || 
                       doc.querySelector('#git-readme') ||
                       doc.querySelector('.file_content:not(textarea)');
                       
      // 检查 readmeEl 是否真的存在且不是一个仅仅包装了 Gitee 隐藏 textarea 的空骨架
      const hasGiteeTextareaOnly = readmeEl && 
                                   readmeEl.querySelector('textarea.content') && 
                                   !readmeEl.querySelector('.markdown-body > p, .markdown-body > h1, .markdown-body > h2');

      if (readmeEl && !hasGiteeTextareaOnly) {
        // 预处理 README 里的图片，加上防盗链绕过和响应式比例
        readmeEl.querySelectorAll('img').forEach(img => {
          const src = img.getAttribute('src');
          if (src) {
            img.setAttribute('referrerpolicy', 'no-referrer');
          }
          img.removeAttribute('style');
          img.style.maxWidth = '100%';
          img.style.height = 'auto';
        });

        readmeHtml = readmeEl.innerHTML;
        textContent = readmeEl.textContent || '';
      } else {
        // 3.3 兜底：如果服务器只下发了 textarea 里的原始 Markdown 源码文本（如部分 Gitee 响应或纯文本页面）
        // 我们直接使用 marked 引擎，在本地将其编译为标准完美排版的 HTML！
        const textarea = doc.querySelector('textarea#readme') || 
                         doc.querySelector('#gitee-readme-markdown') || 
                         doc.querySelector('textarea.content') ||
                         doc.querySelector('textarea');
        if (textarea) {
          const rawMarkdown = textarea.value || textarea.textContent || '';
          try {
            const decodedMarkdown = decodeHtmlEntities(rawMarkdown);
            readmeHtml = marked.parse(decodedMarkdown);
            textContent = decodedMarkdown;
            console.log('[Markdown 编译] 成功通过 marked 引擎本地编译原始 Markdown！');
          } catch (e) {
            console.error('marked parse failed, falling back...', e);
            readmeHtml = `<pre>${rawMarkdown}</pre>`;
            textContent = rawMarkdown;
          }
        } else {
          readmeHtml = '<p style="color: var(--text-muted);">未能在主页中找到 README.md 文件内容。</p>';
          textContent = '未找到 README.md';
        }
      }
    }

    // 4. 清洗 HTML 并允许 pre, code 代码块，以及 table, tbody 等表格标签，同时允许 referrerpolicy 与 style 样式
    const cleanHtml = DOMPurify.sanitize(`${fileTreeHtml}<div class="github-readme-wrapper">${readmeHtml}</div>`, {
      ALLOWED_TAGS: [
        'p', 'img', 'video', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
        'ul', 'ol', 'li', 'blockquote', 'strong', 'em', 'span', 'br', 'a', 
        'section', 'fieldset', 'div', 'pre', 'code',
        'table', 'thead', 'tbody', 'tr', 'th', 'td' // 核心解禁：表格标签白名单！
      ],
      ALLOWED_ATTR: ['src', 'href', 'alt', 'controls', 'class', 'referrerpolicy']
    });

    return {
      title,
      author: owner,
      content: cleanHtml,
      textContent: textContent.trim(),
      siteName
    };
  }

  // ==========================================================================
  // 【普通网页提取逻辑】走经典的 Readability + DOMPurify 流程
  // ==========================================================================
  
  // 移除所有脚本、样式、iframe 等干扰 Readability 评分的元素
  const killTags = ['script', 'style', 'iframe', 'noscript', 'header', 'footer', 'nav'];
  killTags.forEach(tag => {
    doc.querySelectorAll(tag).forEach(el => el.remove());
  });

  // 强行注入 referrerpolicy 防止普通网站的图片也有防盗链
  doc.querySelectorAll('img').forEach(img => {
    img.setAttribute('referrerpolicy', 'no-referrer');
  });

  const reader = new Readability(doc, {
    charThreshold: 20,
    keepClasses: false
  });
  
  const article = reader.parse();

  if (!article || !article.content) {
    throw new Error('未能识别出网页的中心文章内容，可能该网页不是文章页面。');
  }

  // 深度清洗普通网页 HTML（允许 pre, code 代码块排版与 table 表格，支持开发者阅读模式！）
  const cleanHtml = DOMPurify.sanitize(article.content, {
    ALLOWED_TAGS: [
      'p', 'img', 'video', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
      'ul', 'ol', 'li', 'blockquote', 'strong', 'em', 'span', 'br', 'a',
      'pre', 'code',
      'table', 'thead', 'tbody', 'tr', 'th', 'td' // 表格白名单放行
    ],
    ALLOWED_ATTR: ['src', 'href', 'alt', 'controls', 'class', 'referrerpolicy']
  });

  return {
    title: article.title || '未命名文章',
    author: article.byline || '佚名',
    content: cleanHtml,
    textContent: article.textContent || '',
    siteName: article.siteName || getDomainName(targetUrl)
  };
}

/**
 * 专门处理微信公众号的 DOM 结构清洗与图片防盗链还原
 * @param {Element} contentEl 微信正文 DOM 节点
 */
function preprocessWeChatDOM(contentEl) {
  // 1. 微信公众号懒加载图片还原与防盗链注入
  const imgs = contentEl.querySelectorAll('img');
  imgs.forEach(img => {
    const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-actualsrc') || img.getAttribute('src');
    if (dataSrc) {
      img.setAttribute('src', dataSrc);
      img.removeAttribute('data-src');
    }
    
    // 【防盗链最强一招】：强行命令浏览器在获取此图片时不带 Referer 头
    // 这行属性必须被 DOMPurify 白名单放行才会最终生效！
    img.setAttribute('referrerpolicy', 'no-referrer');
    
    // 强制清除宽度和高度绝对限制，防止图片在移动端变形或溢出
    img.removeAttribute('style');
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
  });

  // 2. 移除微信专属的无用噪音组件 (如微信扫码等)
  const wechatJunkSelectors = [
    '.qr_code_pc', '.js_profile_qrcode', 'mp-common-profile', 
    '.rich_media_tool', '.rich_media_area_extra', '.global_share_card',
    '#js_pc_qr_code', '.qr_code_pc_outer'
  ];
  wechatJunkSelectors.forEach(selector => {
    contentEl.querySelectorAll(selector).forEach(el => el.remove());
  });

  // 3. 极其轻量的叶子节点净化（仅扫描没有子节点的 p 和 span），剔除翻页滑动噪音文字
  const textElements = contentEl.querySelectorAll('p, span');
  textElements.forEach(el => {
    if (el.children.length === 0) {
      const txt = el.textContent.trim();
      if (txt === '继续滑动看下一个' || txt === '向上滑动看下一个' || txt.includes('滑动看下一个')) {
        el.remove();
      }
    }
  });
}

/**
 * 获取域名的简短显示
 * @param {string} urlStr 
 */
function getDomainName(urlStr) {
  try {
    const url = new URL(urlStr);
    return url.hostname.replace('www.', '');
  } catch (e) {
    return '外部网站';
  }
}
