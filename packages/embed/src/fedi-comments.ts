/**
 * Fedi Comments - Embed GoToSocial comments on your blog
 * Usage: <div data-fedi-comments data-post-id="STATUS_ID" data-worker-url="https://your-worker.workers.dev"></div>
 */

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
const MAX_DEPTH = 2;

const STYLES = `
.fedi-comments-header {
  margin-bottom: 1em;
  font-size: 0.9em;
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
  display: block;
  font-size: 0.8em;
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
    replyIndicator = `<span class="fedi-comment-reply-to">↩ @${comment.replyToAcct}</span>`;
  }

  // Render nested or flattened replies
  let repliesHtml = '';
  if (comment.replies.length > 0) {
    if (depth < MAX_DEPTH) {
      repliesHtml = `<ul class="fedi-replies">${comment.replies.map(r => renderComment(r, depth + 1)).join('')}</ul>`;
    }
  }

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
        <span class="fedi-comment-time"><a href="${comment.url}" target="_blank" rel="noopener">${formatDate(comment.created_at)}</a></span>
        <div class="fedi-comment-text">${comment.content}</div>
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

function renderHelp(canonicalUrl: string): string {
  return `
    <details class="fedi-help">
      <summary>💬 如何评论</summary>
      <p>回复 <a href="${canonicalUrl}" target="_blank" rel="noopener">这个 Fediverse 上的帖子</a>，你的评论就会出现在这里。</p>
      <p>输入并跳转到你所在的 Fediverse 实例来互动：</p>
      <div class="fedi-help-form">
        <input type="text" class="fedi-help-input" placeholder="mastodon.social" data-fedi-instance>
        <button class="fedi-help-btn" data-fedi-go>出发！</button>
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

    let html = `<div class="fedi-comments-header">${headerText}</div>`;

    if (data.comments.length > 0) {
      const tree = buildTree(data.comments, data.status.id);
      html += `<ul class="fedi-comments-list">${tree.map(c => renderComment(c, 0)).join('')}</ul>`;
    } else {
      html += '<div class="fedi-empty">还没有评论，快来评论吧！</div>';
    }

    html += renderHelp(data.canonicalUrl);
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
