import { createOptimizedPicture } from '../../scripts/aem.js';
import { createTag } from '../../scripts/shared.js';
import { moveInstrumentation } from '../../ue/scripts/ue-utils.js';

const EAGER_CARDS = 6; // first desktop row — eager-load for LCP, lazy-load the rest

/**
 * Build a performance-tuned thumbnail <picture> for a recipe card.
 * The card renders small (≈190px desktop, up to ~290px mobile), so request
 * card-sized renditions instead of the default 750/2000 breakpoints:
 *   - AEM media images (imported/authored, `./media_*` or same-origin) are
 *     rebuilt via createOptimizedPicture with small widths (400 / 300).
 *   - External CDN images (e.g. mealime, local preview before DA ingests them)
 *     get their Cloudflare Image Resizing width rewritten to 400.
 * All cards get explicit 400x400 dims (kills CLS in the aspect-ratio 1/1 cell),
 * async decoding, and eager loading for the first row (LCP), lazy for the rest.
 * @param {Element} cell the image cell (may hold a picture/img/anchor)
 * @param {string} alt image alt text (recipe title)
 * @param {boolean} eager whether to eager-load (first row) vs lazy
 * @returns {Element|null} a <picture> ready to append, or null
 */
function buildCardPicture(cell, alt, eager) {
  if (!cell) return null;
  const existing = cell.querySelector('picture');
  const img = cell.querySelector('img');
  const src = img ? img.getAttribute('src') || '' : '';
  if (!existing && !src) return null;

  const isExternalCdn = /^https?:\/\//.test(src) && !src.includes(window.location.host);
  let pic;
  if (src && !isExternalCdn) {
    // AEM media — rebuild with small, cell-appropriate breakpoints.
    pic = createOptimizedPicture(src, alt, eager, [
      { media: '(min-width: 600px)', width: '400' },
      { width: '300' },
    ]);
  } else if (existing) {
    pic = existing;
    if (img && isExternalCdn) {
      const resized = src.replace(/(\/cdn-cgi\/image\/)[^/]*(\/)/, '$1width=400,quality=75$2');
      if (resized !== src) img.setAttribute('src', resized);
    }
  } else if (src) {
    // Bare external <img> with no <picture> wrapper.
    const resized = src.replace(/(\/cdn-cgi\/image\/)[^/]*(\/)/, '$1width=400,quality=75$2');
    pic = createTag('picture');
    const newImg = createTag('img', { src: resized, alt });
    pic.append(newImg);
  } else {
    return null;
  }

  const finalImg = pic.tagName === 'IMG' ? pic : pic.querySelector('img');
  if (finalImg) {
    finalImg.setAttribute('loading', eager ? 'eager' : 'lazy');
    finalImg.setAttribute('decoding', 'async');
    finalImg.setAttribute('width', '400');
    finalImg.setAttribute('height', '400');
    if (alt && !finalImg.getAttribute('alt')) finalImg.setAttribute('alt', alt);
  }
  return pic;
}

/**
 * Decorate a single recipe "card" block.
 *
 * Expected authored content — one row, two cells:
 *   cell 1: the recipe thumbnail image
 *   cell 2: the recipe title (a link) followed by a short meta list
 *           (e.g. <ul><li>25 mins</li><li>269 cal</li></ul>)
 *
 * The block is resilient to fields arriving in any order or in a single cell:
 * it locates the image, the title link, and the meta list by content.
 *
 * @param {Element} block
 */
export default function decorate(block) {
  // Determine this card's position among sibling cards in the section so the
  // first row can eager-load (LCP) while the rest lazy-load.
  const section = block.closest('.section') || block.parentElement;
  const siblings = section ? [...section.querySelectorAll('.card')] : [block];
  const eager = siblings.indexOf(block) > -1 && siblings.indexOf(block) < EAGER_CARDS;

  // Flatten every cell into a flat list of field elements.
  const fields = [];
  [...block.children].forEach((row) => {
    [...row.children].forEach((cell) => {
      const kids = [...cell.children];
      if (kids.length) fields.push(...kids);
      else fields.push(cell);
    });
  });

  // Image cell: whichever field carries a picture/img.
  const imgField = fields.find((f) => f.querySelector
    && (f.querySelector('picture') || f.querySelector('img')));

  // Title: the anchor pointing at the recipe detail page (fall back to any link).
  const titleLink = block.querySelector('a[href*="/meal-plans-recipes/"], a[href*="/recipes/"], a[href*="/bundles/"]')
    || block.querySelector('a[href]');
  const href = titleLink ? titleLink.getAttribute('href') : '#';
  const title = titleLink ? titleLink.textContent.trim() : '';

  // Meta tokens ("25 mins" / "269 cal"): from an authored list first, then any
  // short leftover text fields that look like time/calorie values.
  const meta = [];
  const metaList = block.querySelector('ul, ol');
  if (metaList) {
    [...metaList.querySelectorAll('li')].forEach((li) => {
      const t = (li.textContent || '').trim();
      if (t) meta.push(t);
    });
  }
  if (!meta.length) {
    fields.forEach((f) => {
      if (f === imgField || (titleLink && f.contains(titleLink))) return;
      const t = (f.textContent || '').trim();
      if (t && /\d/.test(t) && /min|cal|hr|hour/i.test(t)) meta.push(t);
    });
  }

  const link = createTag('a', { class: 'card-link', href });

  const imageWrap = createTag('div', { class: 'card-image' });
  const pic = buildCardPicture(imgField, title, eager);
  if (pic) imageWrap.append(pic);
  link.append(imageWrap);

  const body = createTag('div', { class: 'card-body' });
  if (title) body.append(createTag('p', { class: 'card-title' }, title));
  if (meta.length) {
    const metaEl = createTag('ul', { class: 'card-meta' });
    meta.forEach((m) => metaEl.append(createTag('li', {}, m)));
    body.append(metaEl);
  }
  link.append(body);

  // Preserve Universal Editor instrumentation from the first authored row.
  const firstRow = block.firstElementChild;
  if (firstRow) moveInstrumentation(firstRow, link);

  block.replaceChildren(link);
}
