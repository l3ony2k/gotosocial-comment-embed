/**
 * L3on Comments - unified Fediverse and Webmention comments for l3on.site.
 */

import { loadFediverseComments, renderFediverseHelp } from './fediverse';
import { escapeHtml } from './shared';
import { loadWebmentions, renderWebmentionHelp, wireWebmentionSendForm } from './webmention';

const DEFAULT_WORKER_URL = 'https://gts-comment-worker.l3on.workers.dev';
const EXCLUDED_PATHS = ['/journal', '/guestbook'];

function getWorkerUrl(): string {
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script?.src) return DEFAULT_WORKER_URL;

  try {
    const url = new URL(script.src);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
  } catch {}

  return DEFAULT_WORKER_URL;
}

function shouldShowComments(): boolean {
  const body = document.body;
  const path = window.location.pathname;
  const isPostOrPage = body.classList.contains('post') || body.classList.contains('page');
  const isExcluded = EXCLUDED_PATHS.some((p) => path.startsWith(p));
  return isPostOrPage && !isExcluded;
}

function initUnified(): void {
  if (!shouldShowComments()) return;

  const marker = document.querySelector<HTMLElement>('[data-fedi-id]');
  const section = document.createElement('div');
  section.className = 'l3on-comments-section';

  let html = '<h2>comments</h2>';

  if (marker) {
    const postId = marker.dataset.fediId!;
    html += `
      <div class="l3on-comments-group">
        <div class="l3on-comments-label">via fediverse</div>
        ${renderFediverseHelp()}
        <div data-fedi-comments data-post-id="${escapeHtml(postId)}">
          <div class="l3on-loading">加载评论中...</div>
        </div>
      </div>`;
  }

  html += `
    <div class="l3on-comments-group">
      <div class="l3on-comments-label">via webmention</div>
      ${renderWebmentionHelp()}
      <div id="webmentions"><div class="l3on-loading">加载 Webmention 中...</div></div>
    </div>`;

  section.innerHTML = html;
  document.querySelector('main')?.appendChild(section);

  const workerUrl = getWorkerUrl();

  if (marker) {
    const fediContainer = section.querySelector<HTMLElement>('[data-fedi-comments]');
    if (fediContainer) loadFediverseComments(fediContainer, workerUrl);
  }

  wireWebmentionSendForm(section);

  const wmContainer = section.querySelector<HTMLElement>('#webmentions');
  if (wmContainer) loadWebmentions(wmContainer, workerUrl);
}

function init(): void {
  initUnified();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

(window as any).L3onComments = {
  init,
  initUnified,
  loadFediverseComments,
  loadWebmentions,
};
