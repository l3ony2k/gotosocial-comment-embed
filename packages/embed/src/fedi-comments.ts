/**
 * Fedi Comments - Embed GoToSocial comments on your blog
 * Usage: <div data-fedi-comments data-post-id="STATUS_ID" data-worker-url="https://your-worker.workers.dev"></div>
 */

interface FediAttachment {
  type: string;
  url: string;
  preview_url: string;
  description: string | null;
}

interface FediComment {
  id: string;
  created_at: string;
  in_reply_to_id: string | null;
  content: string;
  url: string;
  account: {
    username: string;
    acct: string;
    display_name: string;
    avatar: string;
    url: string;
  };
  replies_count: number;
  reblogs_count: number;
  favourites_count: number;
  media_attachments: FediAttachment[];
}

interface FediResponse {
  status: FediComment;
  comments: FediComment[];
  visibleCount: number;
  hiddenCount: number;
  canonicalUrl: string;
  instanceUrl: string;
}

const AUTHOR_ACCT = 'lok@rex.cat';
const MAX_DEPTH = 3;
const WORKER_URL = 'https://gts-comment-worker.l3on.workers.dev';
const WEBMENTION_JS = `${WORKER_URL}/webmention.js`;


function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getRedirectUrl(instanceUrl: string, canonicalUrl: string): string {
  const instance = instanceUrl.replace(/\/$/, '');
  return `${instance}/authorize_interaction?uri=${encodeURIComponent(canonicalUrl)}`;
}

function isAuthor(acct: string): boolean {
  return acct === AUTHOR_ACCT || acct === AUTHOR_ACCT.split('@')[0];
}

function sanitizeContent(html: string): string {
  // Simple parser to strip leading mentions
  // Matches <a ... class="...mention..." ...>@username</a> at the start, possibly inside a <p>

  const mentionRegex1 = /^(\s*<p[^>]*>\s*)?<span class="h-card"[^>]*><a[^>]+class="[^"]*mention[^"]*"[^>]*>@<span>[^<]+<\/span><\/a><\/span>\s*/i;
  const mentionRegex2 = /^(\s*<p[^>]*>\s*)?<a[^>]+class="[^"]*mention[^"]*"[^>]*>@[^<]+<\/a>\s*/i;

  return html.replace(mentionRegex1, '$1').replace(mentionRegex2, '$1');
}

interface CommentNode extends FediComment {
  replies: CommentNode[];
  replyToAcct?: string;
}

function buildTree(comments: FediComment[], rootId: string): CommentNode[] {
  const map = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];

  for (const c of comments) {
    map.set(c.id, { ...c, replies: [] });
  }

  for (const c of comments) {
    const node = map.get(c.id)!;

    if (c.in_reply_to_id === rootId) {
      roots.push(node);
    } else if (c.in_reply_to_id && map.has(c.in_reply_to_id)) {
      const parent = map.get(c.in_reply_to_id)!;
      node.replyToAcct = parent.account.acct;
      parent.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function renderComment(comment: CommentNode, depth: number): string {
  const badge = isAuthor(comment.account.acct) ? '<span class="fedi-comment-badge">是我</span>' : '';

  // Show "↩ @user" if replying to someone at depth >= MAX_DEPTH
  let replyIndicator = '';
  if (depth >= MAX_DEPTH && comment.replyToAcct) {
    replyIndicator = `<span class="fedi-comment-reply-to">✉︎ @${comment.replyToAcct}</span>`;
  }

  // Stats
  const stats = [
    comment.favourites_count > 0 ? `<span class="fedi-stats-item" title="Favorites">♡ ${comment.favourites_count}</span>` : '',
    comment.reblogs_count > 0 ? `<span class="fedi-stats-item" title="Boosts">↻ ${comment.reblogs_count}</span>` : '',
    comment.replies_count > 0 ? `<span class="fedi-stats-item" title="Replies">✉︎ ${comment.replies_count}</span>` : '',
  ].filter(Boolean).join(' ');

  // Images
  let attachmentsHtml = '';
  if (comment.media_attachments && comment.media_attachments.length > 0) {
    attachmentsHtml = `<div class="fedi-attachments">${comment.media_attachments.map(att => `
      <a href="${att.url}" target="_blank" rel="noopener">
        <img class="fedi-attachment-img" src="${att.url}" alt="${att.description || ''}" loading="lazy">
      </a>
    `).join('')}</div>`;
  }

  // Render nested or flattened replies
  let repliesHtml = '';
  if (comment.replies.length > 0) {
    if (depth < MAX_DEPTH) {
      repliesHtml = `<ul class="fedi-replies">${comment.replies.map(r => renderComment(r, depth + 1)).join('')}</ul>`;
    }
  }

  const cleanContent = sanitizeContent(comment.content);

  const html = `
    <li class="fedi-comment">
      <img class="fedi-comment-avatar" src="${comment.account.avatar}" alt="" loading="lazy">
      <div class="fedi-comment-body">
        <div class="fedi-comment-meta">
          <span class="fedi-comment-author">
            <a href="${comment.account.url}" target="_blank" rel="noopener">${comment.account.display_name || comment.account.username}</a>
          </span>
          <span class="fedi-comment-handle">@${comment.account.acct}</span>
          ${badge}
          ${replyIndicator}
        </div>
        <div class="fedi-comment-info">
          <span class="fedi-comment-time"><a href="${comment.url}" target="_blank" rel="noopener">${formatDate(comment.created_at)}</a></span>
          ${stats ? `<span class="fedi-comment-stats">${stats}</span>` : ''}
        </div>
        <div class="fedi-comment-text">${cleanContent}</div>
        ${attachmentsHtml}
      </div>
    </li>
    ${repliesHtml}
  `;

  // Flatten deep replies
  if (depth >= MAX_DEPTH - 1 && comment.replies.length > 0) {
    const flatReplies = comment.replies.map(r => renderComment(r, depth + 1)).join('');
    return html.replace(repliesHtml, '') + flatReplies;
  }

  return html;
}

function renderHelp(canonicalUrl: string, instanceUrl: string): string {
  return `
    <details class="fedi-help">
      <summary>在 Fediverse 上互动</summary>
      <p>这些评论都来自 Fediverse 上 <a href="${instanceUrl}/about" target="_blank" rel="noopener">我的实例</a>。回复 <a href="${canonicalUrl}" target="_blank" rel="noopener">这个帖文</a>，你的评论就会出现在这里。推荐在下面直接输入你的 Fediverse 实例域名，然后跳转到你所在的实例来互动：</p>
      <div class="fedi-help-form">
        <input type="text" class="fedi-help-input" placeholder="mastodon.social" data-fedi-instance>
        <button class="fedi-help-btn" data-fedi-go>出发</button>
      </div>
    </details>
  `;
}

function renderWebmentionHelp(): string {
  return `
    <details class="fedi-help">
      <summary>使用 Webmention 互动</summary>
      <p>如果你的网站发布了提到这篇文章的内容，可以通过 <a href="https://indieweb.org/Webmention" target="_blank" rel="noopener">Webmention</a> 将链接发送给我，收到后会显示在下方。在输入框中填入你的页面地址：</p>
      <div class="fedi-help-form">
        <input type="url" class="fedi-help-input" placeholder="https://your-blog.com/your-post" data-wm-source>
        <button class="fedi-help-btn" data-wm-send>发送</button>
      </div>
    </details>
  `;
}

async function loadComments(container: HTMLElement): Promise<void> {
  const postId = container.dataset.postId;
  const workerUrl = container.dataset.workerUrl;

  if (!postId || !workerUrl) {
    container.innerHTML = '<div class="fedi-error">博主评论没配置对，提醒一下他吧</div>';
    return;
  }

  // In unified mode the loading state is pre-set in the container HTML.
  // In legacy mode (no pre-set loading), set it now.
  const preRenderedHelp = container.parentElement?.querySelector<HTMLElement>('[data-fedi-help]');
  if (!preRenderedHelp) {
    container.innerHTML = '<div class="fedi-loading">加载评论中...</div>';
  }

  try {
    const res = await fetch(`${workerUrl.replace(/\/$/, '')}/comments/${postId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data: FediResponse = await res.json();

    // Update pre-rendered help toggle with canonical URL and wire up button
    if (preRenderedHelp) {
      const helpText = preRenderedHelp.querySelector<HTMLElement>('[data-fedi-help-text]');
      if (helpText) {
        const instanceLink = helpText.querySelector('[data-fedi-instance-link]');
        if (instanceLink) instanceLink.outerHTML = `<a href="${data.instanceUrl}/about" target="_blank" rel="noopener">我的实例</a>`;
        const canonicalLink = helpText.querySelector('[data-fedi-canonical-link]');
        if (canonicalLink) canonicalLink.outerHTML = `<a href="${data.canonicalUrl}" target="_blank" rel="noopener">这个帖文</a>`;
      }
      const input = preRenderedHelp.querySelector<HTMLInputElement>('[data-fedi-instance]');
      const btn = preRenderedHelp.querySelector('[data-fedi-go]');
      if (input && btn) {
        const go = () => {
          const instance = input.value.trim();
          if (instance) {
            const url = instance.includes('://') ? instance : `https://${instance}`;
            window.open(getRedirectUrl(url, data.canonicalUrl), '_blank');
          }
        };
        btn.addEventListener('click', go);
        input.addEventListener('keypress', (e) => { if ((e as KeyboardEvent).key === 'Enter') go(); });
      }
    }

    let headerText = `找到了 ${data.visibleCount} 条可见评论`;
    if (data.hiddenCount > 0) {
      headerText += `；还有 ${data.hiddenCount} 条评论被隐藏或私有`;
    }

    const statusStats = [
      data.status.favourites_count > 0 ? `<span class="fedi-stats-item">♡ ${data.status.favourites_count}</span>` : '',
      data.status.reblogs_count > 0 ? `<span class="fedi-stats-item">↻ ${data.status.reblogs_count}</span>` : '',
    ].filter(Boolean).join(' ');

    let html = `<div class="fedi-comments-header">
      <span>${headerText}</span>${statusStats ? ` <span class="fedi-comment-stats-header">${statusStats}</span>` : ''}
    </div>`;

    // In legacy mode, render the help toggle inside the container
    if (!preRenderedHelp) {
      html += renderHelp(data.canonicalUrl, data.instanceUrl);
    }

    if (data.comments.length > 0) {
      const tree = buildTree(data.comments, data.status.id);
      html += `<ul class="fedi-comments-list">${tree.map(c => renderComment(c, 0)).join('')}</ul>`;
    } else {
      html += '<div class="fedi-empty">还没有评论，快来评论吧！</div>';
    }

    container.innerHTML = html;

    // Wire up instance button in legacy mode
    if (!preRenderedHelp) {
      const input = container.querySelector('[data-fedi-instance]') as HTMLInputElement;
      const btn = container.querySelector('[data-fedi-go]');
      if (input && btn) {
        const go = () => {
          const instance = input.value.trim();
          if (instance) {
            const url = instance.includes('://') ? instance : `https://${instance}`;
            window.open(getRedirectUrl(url, data.canonicalUrl), '_blank');
          }
        };
        btn.addEventListener('click', go);
        input.addEventListener('keypress', (e) => { if ((e as KeyboardEvent).key === 'Enter') go(); });
      }
    }
  } catch (e) {
    container.innerHTML = `<div class="fedi-error">Failed to load comments: ${e instanceof Error ? e.message : 'Unknown error'}</div>`;
  }
}

function loadWebmentions(): void {
  if (document.querySelector('script[src*="webmention"]')) return;
  const s = document.createElement('script');
  s.src = WEBMENTION_JS;
  s.dataset.wordcount = 'true';
  s.dataset.maxWebmentions = '30';
  s.async = true;

  // Collect any extra URLs declared via <span data-wm-also="..." hidden>
  const alsoUrls = Array.from(document.querySelectorAll<HTMLElement>('[data-wm-also]'))
    .map(el => el.dataset.wmAlso)
    .filter(Boolean) as string[];
  if (alsoUrls.length > 0) s.dataset.addUrls = alsoUrls.join('|');

  document.head.appendChild(s);
}

const EXCLUDED_PATHS = ['/journal', '/guestbook'];

function shouldShowComments(): boolean {
  const body = document.body;
  const path = window.location.pathname;
  const isPostOrPage = body.classList.contains('post') || body.classList.contains('page');
  const isExcluded = EXCLUDED_PATHS.some(p => path.startsWith(p));
  return isPostOrPage && !isExcluded;
}

function watchWebmentions(container: HTMLElement): void {
  // webmention.js replaces the container contents when done.
  // We watch for mutations and, once it settles, check if any items were rendered.
  const SETTLE_MS = 300; // wait for burst of mutations to stop
  let timer: ReturnType<typeof setTimeout> | null = null;

  const check = () => {
    // If the loading placeholder is still there, webmention.js hasn't run yet
    if (container.querySelector('.fedi-loading')) return;

    // webmention.js renders <div class="webmention-..."> items or an h2
    // If nothing rendered (empty container or only whitespace), show empty state
    const hasItems = container.querySelector('ul.fedi-comments-list');
    const isError = (container as HTMLElement & { dataset: DOMStringMap }).dataset.wmError === '1';

    if (isError) {
      container.innerHTML = '<div class="fedi-error">无法加载 Webmention，请稍后再试</div>';
    } else if (!hasItems) {
      container.innerHTML = '<div class="fedi-empty">还没有 Webmention，快来互动吧！</div>';
    }

    observer.disconnect();
  };

  const observer = new MutationObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(check, SETTLE_MS);
  });

  observer.observe(container, { childList: true, subtree: true });

  // Also handle case where webmention.js never loads (network fail, blocked, etc.)
  // Fall back after 10s
  setTimeout(() => {
    observer.disconnect();
    if (container.querySelector('.fedi-loading')) {
      container.innerHTML = '<div class="fedi-error">无法加载 Webmention，请稍后再试</div>';
    }
  }, 10000);
}

function initUnified(): void {
  if (!shouldShowComments()) return;

  const marker = document.querySelector<HTMLElement>('[data-fedi-id]');
  const section = document.createElement('div');
  section.className = 'comments-section';

  let html = '<h2>comments</h2>';

  if (marker) {
    const postId = marker.dataset.fediId!;
    html += `
      <div class="comments-group">
        <div class="comments-label">via fediverse</div>
        <details class="fedi-help" data-fedi-help>
          <summary>在 Fediverse 上互动</summary>
          <p data-fedi-help-text>这些评论都来自 Fediverse 上 <span data-fedi-instance-link>我的实例</span>。回复 <span data-fedi-canonical-link>这个帖文</span>，你的评论就会出现在这里。推荐在下面直接输入你的 Fediverse 实例域名，然后跳转到你所在的实例来互动：</p>
          <div class="fedi-help-form">
            <input type="text" class="fedi-help-input" placeholder="mastodon.social" data-fedi-instance>
            <button class="fedi-help-btn" data-fedi-go>出发</button>
          </div>
        </details>
        <div data-fedi-comments data-post-id="${postId}" data-worker-url="${WORKER_URL}">
          <div class="fedi-loading">加载评论中...</div>
        </div>
      </div>`;
  }

  html += `
    <div class="comments-group">
      <div class="comments-label">via webmention</div>
      ${renderWebmentionHelp()}
      <div id="webmentions"><div class="fedi-loading">加载 Webmention 中...</div></div>
    </div>`;

  section.innerHTML = html;
  document.querySelector('main')?.appendChild(section);

  if (marker) {
    const fediContainer = section.querySelector<HTMLElement>('[data-fedi-comments]');
    if (fediContainer) loadComments(fediContainer);
  }

  // Wire up webmention send form
  const wmInput = section.querySelector<HTMLInputElement>('[data-wm-source]');
  const wmBtn = section.querySelector('[data-wm-send]');
  if (wmInput && wmBtn) {
    const send = async () => {
      const source = wmInput.value.trim();
      if (!source) return;
      wmBtn.textContent = '发送中...';
      (wmBtn as HTMLButtonElement).disabled = true;
      try {
        const body = new URLSearchParams({ source, target: window.location.href });
        const res = await fetch('https://webmention.io/l3on.site/webmention', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        wmInput.value = '';
        wmInput.placeholder = res.ok ? '已发送！稍后刷新页面查看' : '发送失败，请重试';
      } catch {
        wmInput.placeholder = '发送失败，请重试';
      }
      wmBtn.textContent = '发送';
      (wmBtn as HTMLButtonElement).disabled = false;
    };
    wmBtn.addEventListener('click', send);
    wmInput.addEventListener('keypress', (e) => { if ((e as KeyboardEvent).key === 'Enter') send(); });
  }

  loadWebmentions();

  // Watch for webmention.js to finish rendering
  const wmContainer = section.querySelector<HTMLElement>('#webmentions');
  if (wmContainer) {
    watchWebmentions(wmContainer);
  }
}

function init() {
  if (shouldShowComments()) {
    initUnified();
    return;
  }
  // fallback: legacy direct [data-fedi-comments] embeds
  document.querySelectorAll<HTMLElement>('[data-fedi-comments]').forEach(loadComments);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

(window as any).FediComments = { init, initUnified, loadComments };
