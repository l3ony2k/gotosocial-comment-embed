import {
  escapeHtml,
  formatDate,
  normalizePageUrl,
  PLACEHOLDER_AVATAR,
  renderEmpty,
  renderLoading,
  renderRetryError,
  sanitizeHtml,
  sanitizeUrl,
} from './shared';

type TextValue = string | { value?: string; text?: string };

interface WebmentionEntry {
  type?: string;
  url?: string;
  'wm-source'?: string;
  'wm-property'?: string;
  'wm-received'?: string;
  published?: string;
  name?: string;
  summary?: TextValue;
  content?: {
    html?: string;
    text?: string;
  };
  rsvp?: string;
  author?: {
    name?: string;
    url?: string;
    photo?: string;
  };
  photo?: string | string[];
}

interface WebmentionResponse {
  children?: WebmentionEntry[];
}

const icons: Record<string, string> = {
  'in-reply-to': '✉︎',
  'like-of': '♡',
  'repost-of': '↻',
  'bookmark-of': '☆',
  'mention-of': '✉︎',
  rsvp: '○',
  'follow-of': '→',
};

const labels: Record<string, string> = {
  'in-reply-to': '回复',
  'like-of': '喜欢',
  'repost-of': '转发',
  'bookmark-of': '书签',
  'mention-of': '提及',
  rsvp: 'RSVP',
  'follow-of': '关注',
};

const rsvpIcons: Record<string, string> = {
  yes: '✓',
  no: '✗',
  interested: '?',
  maybe: '?',
};

function unwrapTextValue(value: TextValue | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.value || value.text || '';
}

function normalizeText(value: TextValue | undefined): string {
  let text = unwrapTextValue(value);
  if (!text) return '';

  if (text.includes('<') || text.includes('&')) {
    const div = document.createElement('div');
    div.innerHTML = text;
    text = div.textContent || div.innerText || '';
  }

  return text.replace(/\s+/g, ' ').trim();
}

function isCompactType(prop: string): boolean {
  return prop === 'like-of' || prop === 'repost-of' || prop === 'bookmark-of' || prop === 'follow-of';
}

function renderHtmlContent(value: TextValue | undefined): string {
  const html = sanitizeHtml(unwrapTextValue(value));
  if (!html) return '';
  return `<div class="l3on-comment-text">${html}</div>`;
}

function getEntryUrl(entry: WebmentionEntry): string {
  return entry.url || entry['wm-source'] || '';
}

function getRenderedContent(entry: WebmentionEntry): string {
  const prop = entry['wm-property'] || 'mention-of';
  if (isCompactType(prop)) return '';

  const summaryHtml = renderHtmlContent(entry.summary);
  if (summaryHtml) return summaryHtml;

  const contentHtml = renderHtmlContent(entry.content?.html);
  if (contentHtml) return contentHtml;

  const summary = normalizeText(entry.summary);
  if (summary) return `<div class="l3on-comment-text"><p>${escapeHtml(summary)}</p></div>`;

  const text = normalizeText(entry.content?.text);
  if (text) return `<div class="l3on-comment-text"><p>${escapeHtml(text)}</p></div>`;

  return '';
}

function dedup(entries: WebmentionEntry[]): WebmentionEntry[] {
  const seen = new Set<string>();
  const out: WebmentionEntry[] = [];

  entries.forEach((entry) => {
    const url = getEntryUrl(entry);
    if (!url) return;
    const key = url.replace(/^https?:\/\//, '');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(entry);
  });

  return out;
}

function renderEntry(entry: WebmentionEntry): string {
  const sourceUrl = sanitizeUrl(getEntryUrl(entry));
  const sourceDomain = sourceUrl ? new URL(sourceUrl).hostname : '';
  const rawPhoto = entry.author?.photo || (Array.isArray(entry.photo) ? entry.photo[0] : entry.photo) || '';
  const avatar = sanitizeUrl(rawPhoto) || PLACEHOLDER_AVATAR;
  const authorName = entry.author?.name || sourceDomain;
  const authorUrl = sanitizeUrl(entry.author?.url) || sourceUrl;
  const prop = entry['wm-property'] || 'mention-of';
  const icon = icons[prop] || '✉︎';
  const label = labels[prop] || '提及';
  const rsvpSub = entry.rsvp && rsvpIcons[entry.rsvp] ? `<sub>${rsvpIcons[entry.rsvp]}</sub>` : '';
  const date = formatDate(entry.published || entry['wm-received']);
  const content = getRenderedContent(entry);

  return `<li class="l3on-comment">
    <img class="l3on-comment-avatar" src="${escapeHtml(avatar)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER_AVATAR}'">
    <div class="l3on-comment-body">
      <div class="l3on-comment-meta">
        <span class="l3on-comment-author">${authorUrl ? `<a href="${escapeHtml(authorUrl)}" target="_blank" rel="nofollow noopener noreferrer">${escapeHtml(authorName)}</a>` : escapeHtml(authorName)}</span>
        <span class="l3on-comment-handle">${escapeHtml(sourceDomain)}</span>
        <span class="l3on-comment-badge">${icon} ${escapeHtml(label)}</span>
        ${rsvpSub}
      </div>
      <div class="l3on-comment-info">
        ${date ? `<span class="l3on-comment-time">${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="nofollow noopener noreferrer">${date}</a>` : date}</span>` : ''}
      </div>
      ${content}
    </div>
  </li>`;
}

function renderItems(items: WebmentionEntry[]): string {
  const counts: Record<string, number> = {};
  items.forEach((entry) => {
    const prop = entry['wm-property'] || 'mention-of';
    counts[prop] = (counts[prop] || 0) + 1;
  });

  const order = ['like-of', 'repost-of', 'bookmark-of', 'in-reply-to', 'mention-of', 'follow-of', 'rsvp'];
  const chips = order
    .filter((prop) => counts[prop])
    .map((prop) => `<span class="l3on-stats-item">${icons[prop] || '✉︎'} ${counts[prop]}</span>`)
    .join(' ');

  return `<div class="l3on-comments-header">
    <span>找到了 ${items.length} 条互动</span>${chips ? ` <span class="l3on-comment-stats-header">${chips}</span>` : ''}
  </div>
  <ul class="l3on-comments-list">${items.map(renderEntry).join('')}</ul>`;
}

function getAlsoUrls(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-wm-also]'))
    .map((el) => normalizePageUrl(el.dataset.wmAlso || ''))
    .filter(Boolean);
}

function buildWebmentionUrl(workerUrl: string): string {
  const url = new URL(`${workerUrl.replace(/\/$/, '')}/webmentions`);
  url.searchParams.set('target', normalizePageUrl(window.location.href));
  getAlsoUrls().forEach((also) => url.searchParams.append('also', also));
  return url.toString();
}

export function renderWebmentionHelp(): string {
  return `
    <details class="l3on-help">
      <summary>使用 Webmention 互动</summary>
      <p>如果你的网站发布了提到这篇文章的内容，可以通过 <a href="https://indieweb.org/Webmention" target="_blank" rel="noopener noreferrer">Webmention</a> 将链接发送给我，收到后会显示在下方。在输入框中填入你的页面地址：</p>
      <div class="l3on-help-form">
        <input type="url" class="l3on-help-input" placeholder="https://your-blog.com/your-post" data-wm-source>
        <button class="l3on-help-btn" data-wm-send>发送</button>
      </div>
    </details>
  `;
}

export async function loadWebmentions(container: HTMLElement, workerUrl: string): Promise<void> {
  container.innerHTML = renderLoading('加载 Webmention 中...');

  try {
    const res = await fetch(buildWebmentionUrl(workerUrl));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data: WebmentionResponse = await res.json();
    const items = dedup(data.children || []);

    container.innerHTML = items.length > 0
      ? renderItems(items)
      : renderEmpty('还没有 Webmention，快来互动吧！');
  } catch (e) {
    container.innerHTML = renderRetryError(`无法加载 Webmention：${e instanceof Error ? e.message : 'Unknown error'}`, 'data-wm-retry');
    container.querySelector('[data-wm-retry]')?.addEventListener('click', () => {
      loadWebmentions(container, workerUrl);
    });
  }
}

export function wireWebmentionSendForm(root: ParentNode): void {
  const wmInput = root.querySelector<HTMLInputElement>('[data-wm-source]');
  const wmBtn = root.querySelector<HTMLButtonElement>('[data-wm-send]');
  if (!wmInput || !wmBtn) return;

  const send = async () => {
    const source = wmInput.value.trim();
    if (!source) return;
    wmBtn.textContent = '发送中...';
    wmBtn.disabled = true;
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
    wmBtn.disabled = false;
  };

  wmBtn.addEventListener('click', send);
  wmInput.addEventListener('keypress', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') send();
  });
}
