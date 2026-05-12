import {
  escapeHtml,
  formatDate,
  PLACEHOLDER_AVATAR,
  renderEmpty,
  renderError,
  renderLoading,
  renderRetryError,
  sanitizeHtml,
  sanitizeUrl,
} from './shared';

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

interface CommentNode extends FediComment {
  replies: CommentNode[];
  replyToAcct?: string;
}

const AUTHOR_ACCT = 'lok@rex.cat';
const MAX_DEPTH = 3;

function getRedirectUrl(instanceUrl: string, canonicalUrl: string): string {
  const instance = instanceUrl.replace(/\/$/, '');
  return `${instance}/authorize_interaction?uri=${encodeURIComponent(canonicalUrl)}`;
}

function isAuthor(acct: string): boolean {
  return acct === AUTHOR_ACCT || acct === AUTHOR_ACCT.split('@')[0];
}

function stripLeadingMentions(html: string): string {
  let output = html;
  const patterns = [
    /^(\s*<p[^>]*>\s*)?<span class="h-card"[^>]*><a[^>]+class="[^"]*mention[^"]*"[^>]*>@<span>[^<]+<\/span><\/a><\/span>\s*/i,
    /^(\s*<p[^>]*>\s*)?<a[^>]+class="[^"]*mention[^"]*"[^>]*>@[^<]+<\/a>\s*/i,
  ];

  for (let i = 0; i < 10; i += 1) {
    const before = output;
    for (const pattern of patterns) output = output.replace(pattern, '$1');
    if (output === before) break;
  }

  return output;
}

function sanitizeFediContent(html: string): string {
  return sanitizeHtml(stripLeadingMentions(html));
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

function renderAttachments(comment: FediComment): string {
  if (!comment.media_attachments?.length) return '';

  const items = comment.media_attachments
    .map((att) => {
      const href = sanitizeUrl(att.url);
      const src = sanitizeUrl(att.url || att.preview_url);
      if (!href || !src) return '';
      const alt = escapeHtml(att.description || '');
      return `
        <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
          <img class="l3on-attachment-img" src="${escapeHtml(src)}" alt="${alt}" loading="lazy">
        </a>
      `;
    })
    .filter(Boolean)
    .join('');

  return items ? `<div class="l3on-attachments">${items}</div>` : '';
}

function renderComment(comment: CommentNode, depth: number): string {
  const badge = isAuthor(comment.account.acct) ? '<span class="l3on-comment-badge">是我</span>' : '';
  const replyIndicator = depth >= MAX_DEPTH && comment.replyToAcct
    ? `<span class="l3on-comment-reply-to">✉︎ @${escapeHtml(comment.replyToAcct)}</span>`
    : '';

  const stats = [
    comment.favourites_count > 0 ? `<span class="l3on-stats-item" title="Favorites">♡ ${comment.favourites_count}</span>` : '',
    comment.reblogs_count > 0 ? `<span class="l3on-stats-item" title="Boosts">↻ ${comment.reblogs_count}</span>` : '',
    comment.replies_count > 0 ? `<span class="l3on-stats-item" title="Replies">✉︎ ${comment.replies_count}</span>` : '',
  ].filter(Boolean).join(' ');

  let repliesHtml = '';
  if (comment.replies.length > 0 && depth < MAX_DEPTH) {
    repliesHtml = `<ul class="l3on-replies">${comment.replies.map((r) => renderComment(r, depth + 1)).join('')}</ul>`;
  }

  const accountUrl = sanitizeUrl(comment.account.url);
  const commentUrl = sanitizeUrl(comment.url);
  const avatarUrl = sanitizeUrl(comment.account.avatar) || PLACEHOLDER_AVATAR;
  const authorName = comment.account.display_name || comment.account.username;
  const cleanContent = sanitizeFediContent(comment.content);
  const attachmentsHtml = renderAttachments(comment);

  const html = `
    <li class="l3on-comment">
      <img class="l3on-comment-avatar" src="${escapeHtml(avatarUrl)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER_AVATAR}'">
      <div class="l3on-comment-body">
        <div class="l3on-comment-meta">
          <span class="l3on-comment-author">
            ${accountUrl ? `<a href="${escapeHtml(accountUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(authorName)}</a>` : escapeHtml(authorName)}
          </span>
          <span class="l3on-comment-handle">@${escapeHtml(comment.account.acct)}</span>
          ${badge}
          ${replyIndicator}
        </div>
        <div class="l3on-comment-info">
          <span class="l3on-comment-time">${commentUrl ? `<a href="${escapeHtml(commentUrl)}" target="_blank" rel="noopener noreferrer">${formatDate(comment.created_at)}</a>` : formatDate(comment.created_at)}</span>
          ${stats ? `<span class="l3on-comment-stats">${stats}</span>` : ''}
        </div>
        ${cleanContent ? `<div class="l3on-comment-text">${cleanContent}</div>` : ''}
        ${attachmentsHtml}
      </div>
    </li>
    ${repliesHtml}
  `;

  if (depth >= MAX_DEPTH - 1 && comment.replies.length > 0) {
    const flatReplies = comment.replies.map((r) => renderComment(r, depth + 1)).join('');
    return html.replace(repliesHtml, '') + flatReplies;
  }

  return html;
}

export function renderFediverseHelp(canonicalUrl?: string, instanceUrl?: string): string {
  const instance = instanceUrl
    ? `<a href="${escapeHtml(sanitizeUrl(`${instanceUrl}/about`))}" target="_blank" rel="noopener noreferrer">我的实例</a>`
    : '<span data-fedi-instance-link>我的实例</span>';
  const canonical = canonicalUrl
    ? `<a href="${escapeHtml(sanitizeUrl(canonicalUrl))}" target="_blank" rel="noopener noreferrer">这个帖文</a>`
    : '<span data-fedi-canonical-link>这个帖文</span>';

  return `
    <details class="l3on-help" data-fedi-help>
      <summary>在 Fediverse 上互动</summary>
      <p data-fedi-help-text>这些评论都来自 Fediverse 上 ${instance}。回复 ${canonical}，你的评论就会出现在这里。推荐在下面直接输入你的 Fediverse 实例域名，然后跳转到你所在的实例来互动：</p>
      <div class="l3on-help-form">
        <input type="text" class="l3on-help-input" placeholder="mastodon.social" data-fedi-instance>
        <button class="l3on-help-btn" data-fedi-go>出发</button>
      </div>
    </details>
  `;
}

function wireFediverseHelp(root: ParentNode, canonicalUrl: string): void {
  const input = root.querySelector<HTMLInputElement>('[data-fedi-instance]');
  const btn = root.querySelector<HTMLButtonElement>('[data-fedi-go]');
  if (!input || !btn) return;

  const go = () => {
    const instance = input.value.trim();
    if (!instance) return;
    const url = instance.includes('://') ? instance : `https://${instance}`;
    window.open(getRedirectUrl(url, canonicalUrl), '_blank');
  };

  btn.addEventListener('click', go);
  input.addEventListener('keypress', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') go();
  });
}

function updatePreRenderedHelp(help: HTMLElement, data: FediResponse): void {
  const helpText = help.querySelector<HTMLElement>('[data-fedi-help-text]');
  if (helpText) {
    const instanceLink = helpText.querySelector('[data-fedi-instance-link]');
    const instanceAbout = sanitizeUrl(`${data.instanceUrl}/about`);
    if (instanceLink && instanceAbout) {
      instanceLink.outerHTML = `<a href="${escapeHtml(instanceAbout)}" target="_blank" rel="noopener noreferrer">我的实例</a>`;
    }
    const canonicalLink = helpText.querySelector('[data-fedi-canonical-link]');
    const canonicalUrl = sanitizeUrl(data.canonicalUrl);
    if (canonicalLink && canonicalUrl) {
      canonicalLink.outerHTML = `<a href="${escapeHtml(canonicalUrl)}" target="_blank" rel="noopener noreferrer">这个帖文</a>`;
    }
  }

  wireFediverseHelp(help, data.canonicalUrl);
}

export async function loadFediverseComments(container: HTMLElement, workerUrl: string): Promise<void> {
  const postId = container.dataset.postId;

  if (!postId || !workerUrl) {
    container.innerHTML = renderError('博主评论没配置对，提醒一下他吧');
    return;
  }

  const preRenderedHelp = container.parentElement?.querySelector<HTMLElement>('[data-fedi-help]');
  container.innerHTML = renderLoading('加载评论中...');

  try {
    const res = await fetch(`${workerUrl.replace(/\/$/, '')}/fediverse/${encodeURIComponent(postId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data: FediResponse = await res.json();

    if (preRenderedHelp) updatePreRenderedHelp(preRenderedHelp, data);

    let headerText = `找到了 ${data.visibleCount} 条可见评论`;
    if (data.hiddenCount > 0) {
      headerText += `；还有 ${data.hiddenCount} 条评论被隐藏或私有`;
    }

    const statusStats = [
      data.status.favourites_count > 0 ? `<span class="l3on-stats-item">♡ ${data.status.favourites_count}</span>` : '',
      data.status.reblogs_count > 0 ? `<span class="l3on-stats-item">↻ ${data.status.reblogs_count}</span>` : '',
    ].filter(Boolean).join(' ');

    let html = `<div class="l3on-comments-header">
      <span>${escapeHtml(headerText)}</span>${statusStats ? ` <span class="l3on-comment-stats-header">${statusStats}</span>` : ''}
    </div>`;

    if (!preRenderedHelp) {
      html += renderFediverseHelp(data.canonicalUrl, data.instanceUrl);
    }

    if (data.comments.length > 0) {
      const tree = buildTree(data.comments, data.status.id);
      html += `<ul class="l3on-comments-list">${tree.map((c) => renderComment(c, 0)).join('')}</ul>`;
    } else {
      html += renderEmpty('还没有评论，快来评论吧！');
    }

    container.innerHTML = html;
    if (!preRenderedHelp) wireFediverseHelp(container, data.canonicalUrl);
  } catch (e) {
    container.innerHTML = renderRetryError(`Failed to load comments: ${e instanceof Error ? e.message : 'Unknown error'}`, 'data-fedi-retry');
    container.querySelector('[data-fedi-retry]')?.addEventListener('click', () => {
      loadFediverseComments(container, workerUrl);
    });
  }
}
