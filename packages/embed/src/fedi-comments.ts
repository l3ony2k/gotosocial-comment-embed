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

const STYLES = `
.fedi-comments-header, .fedi-loading, .fedi-error {
  margin-bottom: 1em;
  font-size: 0.9em;
}
.fedi-comment-stats-header {
  display: inline-flex;
  gap: 0.5em;
  margin-left: 0.5em;
}
.fedi-comments-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.fedi-comment {
  display: flex;
  gap: 0.6em;
  margin-bottom: 1em;
}
.fedi-comment-avatar {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  background-color: #808080;
}
.fedi-comment-body {
  flex: 1;
  min-width: 0;
}
.fedi-comment-meta {
  display: flex;
  align-items: baseline;
  gap: 0.4em;
  flex-wrap: wrap;
  font-size: 0.9em;
}
.fedi-comment-author a {
  font-weight: bold;
}
.fedi-comment-badge {
  font-size: 0.7em;
  padding: 0 4px;
}
.fedi-comment-time {
  font-size: 0.8em;
  opacity: 0.7;
}
.fedi-comment-stats {
  display: inline-flex;
  gap: 0.6em;
  font-size: 0.8em;
  opacity: 0.7;
  margin-left: 0.5em;
}
.fedi-stats-item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.fedi-comment-text {
  margin: 0.3em 0;
}
.fedi-comment-text p {
  margin: 0 0 0.5em 0;
}
.fedi-comment-text p:last-child {
  margin-bottom: 0;
}
.fedi-attachments {
  margin-top: 0.5em;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em;
}
.fedi-attachment-img {
  max-height: 100px;
  width: auto;
  object-fit: cover;
}
.fedi-replies {
  list-style: none;
  padding: 0;
  margin: 0 0 0 2.5em;
}
.fedi-replies .fedi-comment {
  margin-bottom: 0.4em;
}
.fedi-replies .fedi-comment-avatar {
  width: 28px;
  height: 28px;
}
.fedi-replies .fedi-replies {
  margin-left: 0;
}
.fedi-help-form {
  display: flex;
  gap: 0.5em;
  align-items: stretch;
}
.fedi-help-input {
  flex: 1;
}
.fedi-help-btn {
  height: auto;
}
/* Utility for clean link separation */
.fedi-comment-meta a {
  text-decoration: none;
  color: inherit;
}
.fedi-comment-meta a:hover {
  text-decoration: underline;
}
`;

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
      <summary>如何评论</summary>
      <p>这些评论都来自 Fediverse 上 <a href="${instanceUrl}" target="_blank" rel="noopener">我的实例</a>。回复 <a href="${canonicalUrl}" target="_blank" rel="noopener">这个帖文</a>，你的评论就会出现在这里。</p>
      <p>推荐直接输入并跳转到你所在的 Fediverse 实例来互动：</p>
      <div class="fedi-help-form">
        <input type="text" class="fedi-help-input" placeholder="mastodon.social" data-fedi-instance>
        <button class="fedi-help-btn" data-fedi-go>出发</button>
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

  container.innerHTML = '<div class="fedi-loading">加载评论中...</div>';

  try {
    const res = await fetch(`${workerUrl.replace(/\/$/, '')}/comments/${postId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data: FediResponse = await res.json();

    let headerText = `找到了 ${data.visibleCount} 条可见评论`;
    if (data.hiddenCount > 0) {
      headerText += `；还有 ${data.hiddenCount} 条评论被隐藏或私有`;
    }

    // Main status counts (replies_count omitted - already shown in header text)
    const statusStats = [
      data.status.favourites_count > 0 ? `<span class="fedi-stats-item">♡ ${data.status.favourites_count}</span>` : '',
      data.status.reblogs_count > 0 ? `<span class="fedi-stats-item">↻ ${data.status.reblogs_count}</span>` : '',
    ].filter(Boolean).join(' ');

    let html = `<div class="fedi-comments-header">
      <span>${headerText}</span>${statusStats ? ` <span class="fedi-comment-stats-header">${statusStats}</span>` : ''}
    </div>`;

    // Render Help immediately after header
    html += renderHelp(data.canonicalUrl, data.instanceUrl);

    if (data.comments.length > 0) {
      const tree = buildTree(data.comments, data.status.id);
      html += `<ul class="fedi-comments-list">${tree.map(c => renderComment(c, 0)).join('')}</ul>`;
    } else {
      html += '<div class="fedi-empty">还没有评论，快来评论吧！</div>';
    }

    container.innerHTML = html;

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
  } catch (e) {
    container.innerHTML = `<div class="fedi-error">Failed to load comments: ${e instanceof Error ? e.message : 'Unknown error'}</div>`;
  }
}

function init() {
  if (!document.getElementById('fedi-comments-styles')) {
    const style = document.createElement('style');
    style.id = 'fedi-comments-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }
  document.querySelectorAll<HTMLElement>('[data-fedi-comments]').forEach(loadComments);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

(window as any).FediComments = { init, loadComments };
