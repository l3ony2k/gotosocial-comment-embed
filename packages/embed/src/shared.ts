export const PLACEHOLDER_AVATAR = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2236%22%20height%3D%2236%22%3E%3Crect%20width%3D%2236%22%20height%3D%2236%22%20fill%3D%22%23808080%22%2F%3E%3C%2Fsvg%3E';

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeUrl(url: string | undefined | null): string {
  if (!url) return '';
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch {}
  return '';
}

export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function normalizePageUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    if (!u.pathname.endsWith('/') && !u.pathname.split('/').pop()!.includes('.')) {
      u.pathname += '/';
    }
    return u.toString();
  } catch {
    return url.replace(/#.*$/, '');
  }
}

export function sanitizeHtml(html: string | undefined | null): string {
  if (!html) return '';

  const template = document.createElement('template');
  template.innerHTML = html;

  const allowedTags = new Set([
    'A', 'P', 'BR', 'EM', 'STRONG', 'B', 'I', 'BLOCKQUOTE', 'CODE', 'PRE',
    'UL', 'OL', 'LI', 'DEL', 'INS', 'SUB', 'SUP', 'MARK',
  ]);
  const allowedAttrs: Record<string, Set<string>> = {
    A: new Set(['href', 'title', 'class']),
  };

  function cleanNode(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) return;

    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.remove();
      return;
    }

    const element = node as HTMLElement;
    const tag = element.tagName;
    if (!allowedTags.has(tag)) {
      const parent = element.parentNode;
      if (!parent) return;
      while (element.firstChild) parent.insertBefore(element.firstChild, element);
      parent.removeChild(element);
      return;
    }

    Array.from(element.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const perTag = allowedAttrs[tag];
      if (!perTag?.has(name)) {
        element.removeAttribute(attr.name);
        return;
      }

      if (tag === 'A' && name === 'href') {
        const safeHref = sanitizeUrl(attr.value);
        if (!safeHref) {
          element.removeAttribute(attr.name);
          return;
        }
        element.setAttribute('href', safeHref);
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'nofollow noopener noreferrer');
      }
    });

    Array.from(element.childNodes).forEach(cleanNode);
  }

  Array.from(template.content.childNodes).forEach(cleanNode);
  template.content.querySelectorAll('a:not([href])').forEach((a) => {
    const parent = a.parentNode;
    if (!parent) return;
    while (a.firstChild) parent.insertBefore(a.firstChild, a);
    parent.removeChild(a);
  });

  return template.innerHTML.trim();
}

export function renderLoading(message: string): string {
  return `<div class="l3on-loading">${escapeHtml(message)}</div>`;
}

export function renderEmpty(message: string): string {
  return `<div class="l3on-empty">${escapeHtml(message)}</div>`;
}

export function renderError(message: string): string {
  return `<div class="l3on-error">${escapeHtml(message)}</div>`;
}

export function renderRetryError(message: string, retryAttr: string): string {
  return `<div class="l3on-error"><span>${escapeHtml(message)}</span> <button type="button" class="l3on-help-btn" ${retryAttr}>重试</button></div>`;
}
