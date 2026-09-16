import { loadCSS } from '../../scripts/aem.js';
import { createTag, formatDate } from '../../scripts/shared.js';

/**
 * Default GraphQL persisted-query endpoint returning `data.articleList.items`.
 * Authors override by pasting an endpoint URL into the block.
 */
const DEFAULT_ENDPOINT = 'https://publish-p153659-e1614585.adobeaemcloud.com/graphql/execute.json/frescopa/ListArticles';

/**
 * Read the GraphQL endpoint an author pasted into the block (as a link or text).
 * @param {Element} block
 * @returns {string}
 */
function getEndpoint(block) {
  const link = block.querySelector('a[href]');
  const raw = (link?.getAttribute('href') || block.textContent || '').trim();
  return raw || DEFAULT_ENDPOINT;
}

/** User-facing fallback strings (override via block config for localization). */
const LABELS = {
  by: 'By',
  empty: 'No articles found.',
  error: 'Unable to load articles right now.',
  close: 'Close dialog',
  dialog: 'Article',
};

/**
 * Resolve an article's date. Prefers the projected `date` field; falls back to
 * `_metadata.calendarMetadata` (jcr:created) when the persisted query omits it.
 * @param {Object} article
 * @returns {string}
 */
function resolveDate(article) {
  if (article.date) return article.date;
  const cal = article._metadata?.calendarMetadata || [];
  const byName = (name) => cal.find((m) => m.name === name)?.value;
  return byName('jcr:created') || byName('cq:lastPublished') || byName('cq:lastModified') || '';
}

/**
 * Fallback article image (inline SVG data URI, brand gradient) used when an
 * article has no featured image. Self-contained: no network request or asset.
 */
const DEFAULT_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">'
  + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
  + '<stop offset="0" stop-color="#a14f2b"/><stop offset="1" stop-color="#c5a059"/>'
  + '</linearGradient></defs><rect width="1200" height="675" fill="url(#g)"/></svg>',
)}`;

/**
 * Resolve a usable absolute image URL from a GraphQL featuredImage node,
 * falling back to the default image when none is available.
 * @param {Object|null} featuredImage
 * @returns {string}
 */
function resolveImageUrl(featuredImage) {
  return featuredImage?._publishUrl || DEFAULT_IMAGE;
}

/**
 * Build the author/date meta line shared by card and modal.
 * @param {Object} article
 * @param {Object} labels
 * @returns {HTMLElement|null}
 */
function buildMeta(article, labels) {
  const author = (article.author || '').trim();
  const date = resolveDate(article);
  const meta = createTag('div', { class: 'articles-card-meta' });
  if (author) meta.append(createTag('span', { class: 'articles-card-author' }, `${labels.by} ${author}`));
  if (date) {
    meta.append(createTag('time', { class: 'articles-card-date', datetime: date }, formatDate(date)));
  }
  return meta.childElementCount ? meta : null;
}

/* -----------------------------------------------------------------------
   Modal – shows an article's full content on card click
   ----------------------------------------------------------------------- */

let modalApi = null;

/**
 * Build the modal body for an article: image, title, meta and full content
 * (plaintext split into paragraphs).
 */
function buildModalContent(article, labels) {
  const title = (article.title || '').trim();
  const main = createTag('main', { class: 'modal-main articles-modal' });

  const imageUrl = resolveImageUrl(article.featuredImage);
  if (imageUrl) {
    main.append(createTag(
      'div',
      { class: 'articles-modal-image' },
      createTag('img', { src: imageUrl, alt: title }),
    ));
  }

  if (title) main.append(createTag('h2', { class: 'articles-modal-title' }, title));
  const meta = buildMeta(article, labels);
  if (meta) main.append(meta);

  const body = createTag('div', { class: 'articles-modal-body' });
  (article.content?.plaintext || '')
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean)
    .forEach((para) => body.append(createTag('p', {}, para)));
  main.append(body);

  return { main, title };
}

/**
 * Lazily create the single shared modal, reusing the modal block's styles.
 * @param {Object} labels
 * @returns {{ open: (article: Object, opener: Element) => void }}
 */
function ensureModal(labels) {
  if (modalApi) return modalApi;

  loadCSS(`${window.hlx.codeBasePath}/blocks/modal/modal.css`);

  const closeBtn = createTag('button', { type: 'button', class: 'modal-close', 'aria-label': labels.close }, '×');
  const content = createTag('div', { class: 'modal-content' });
  const dialog = createTag('div', {
    class: 'modal-dialog', role: 'dialog', 'aria-modal': 'true',
  }, [closeBtn, content]);
  const backdrop = createTag('div', { class: 'modal-backdrop', 'aria-hidden': 'true' });
  const root = createTag('div', { class: 'modal', hidden: 'true' }, [backdrop, dialog]);
  document.body.append(root);

  let previousOverflow = '';
  let previousFocus = null;

  const close = () => {
    root.hidden = true;
    content.replaceChildren();
    document.body.style.overflow = previousOverflow;
    if (previousFocus?.focus) previousFocus.focus();
  };

  const open = (article, opener) => {
    const { main, title } = buildModalContent(article, labels);
    dialog.setAttribute('aria-label', title || labels.dialog);
    content.replaceChildren(main);
    previousFocus = opener;
    root.hidden = false;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.scrollTop = 0;
    closeBtn.focus();
  };

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !root.hidden) close();
  });

  modalApi = { open };
  return modalApi;
}

/**
 * Build a single article card.
 * @param {Object} article - GraphQL article item
 * @param {Object} labels - Resolved label strings
 * @returns {HTMLElement}
 */
function buildCard(article, labels) {
  const title = (article.title || '').trim();
  const excerpt = (article.content?.plaintext || '').trim();
  const imageUrl = resolveImageUrl(article.featuredImage);

  const body = createTag('div', { class: 'articles-card-body' });
  if (title) body.append(createTag('h3', { class: 'articles-card-title' }, title));

  const meta = buildMeta(article, labels);
  if (meta) body.append(meta);

  if (excerpt) body.append(createTag('p', { class: 'articles-card-excerpt' }, excerpt));

  const article$ = createTag('article', {
    class: 'articles-card',
    role: 'button',
    tabindex: '0',
    'aria-haspopup': 'dialog',
  });
  if (imageUrl) {
    const imageDiv = createTag('div', { class: 'articles-card-image' });
    imageDiv.append(createTag('img', {
      src: imageUrl,
      alt: title,
      loading: 'lazy',
    }));
    article$.append(imageDiv);
  }
  article$.append(body);

  const openModal = () => ensureModal(labels).open(article, article$);
  article$.addEventListener('click', openModal);
  article$.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openModal();
    }
  });

  return createTag('li', { class: 'articles-card-item' }, article$);
}

/**
 * Fetch articles from the GraphQL persisted query.
 * @param {string} endpoint
 * @returns {Promise<Array>}
 */
async function fetchArticles(endpoint) {
  const separator = endpoint.includes('?') ? '&' : '?';
  const url = `${endpoint}${separator}timestamp=${Date.now()}`;
  const resp = await fetch(url, { credentials: 'include' });
  if (!resp.ok) throw new Error(`Articles request failed: ${resp.status}`);
  const json = await resp.json();
  return json?.data?.articleList?.items || [];
}

/** @param {Element} block */
export default async function decorate(block) {
  const endpoint = getEndpoint(block);
  const labels = { ...LABELS };

  try {
    const items = await fetchArticles(endpoint);
    const articles = [...items].sort(
      (a, b) => Date.parse(resolveDate(b) || 0) - Date.parse(resolveDate(a) || 0),
    );

    block.textContent = '';
    if (!articles.length) {
      block.append(createTag('p', { class: 'articles-empty' }, labels.empty));
      return;
    }

    const list = createTag('ul', { class: 'articles-list', role: 'list' });
    articles.forEach((article) => list.append(buildCard(article, labels)));
    block.append(list);
  } catch {
    block.textContent = '';
    block.append(createTag('p', { class: 'articles-empty' }, labels.error));
  }
}
