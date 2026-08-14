import { moveInstrumentation } from '../../ue/scripts/ue-utils.js';

/*
 * cards-product — renders an Albertsons-style horizontal product carousel.
 *
 * The imported content is a flat sequence of <p> elements: an optional rail
 * heading ("Lean proteins  View all"), then, per product, a product-image
 * anchor followed by the CTA ("Sign in to add"), an optional "approx." note,
 * a price line, the title link, and optional badges ("Bestseller", "snapSNAP").
 * Each product-image anchor (…/is/image/ABS/…grid-product-card…) starts a new
 * card. We group the flats into cards and lay them out as scroll-snap rail.
 */

/* A product-image paragraph either still holds the DM carrier anchor
   (…/is/image/…grid-product-card…) or, if the scripts.js DM auto-block has
   already run, a rebuilt <picture>/<img>. Detect both. */
const isProductImageLink = (p) => {
  const a = p.querySelector(':scope > a[href*="/is/image/"]');
  if (a && /grid-product-card/i.test(a.getAttribute('href') || '')) return true;
  // rebuilt picture/img whose source is a grid-product-card DM rendition
  const media = p.querySelector(':scope > picture img, :scope > img');
  if (media && /grid-product-card/i.test(media.getAttribute('src') || media.currentSrc || '')) return true;
  return false;
};

const isDetailsLink = (p) => !!p.querySelector(':scope > a[href*="/product-details"]');

function buildCard(group) {
  const li = document.createElement('li');
  li.className = 'cards-product-card';

  const [imgP, ...rest] = group;
  const imgLink = imgP.querySelector('a');
  const picture = imgP.querySelector('picture, img');
  // href: prefer the DM carrier anchor; fall back to any link in the group.
  const href = (imgLink && imgLink.getAttribute('href'))
    || (rest.find((p) => p.querySelector('a[href*="/product-details"]'))?.querySelector('a')?.getAttribute('href'))
    || '#';
  const alt = (imgLink && imgLink.textContent.trim())
    || (picture && (picture.querySelector?.('img')?.alt || picture.alt))
    || '';

  // Image tile.
  const imageWrap = document.createElement('a');
  imageWrap.className = 'cards-product-card-image';
  imageWrap.href = href;
  imageWrap.setAttribute('aria-label', alt);
  if (picture) imageWrap.append(picture); // rebuilt <picture>/<img>
  else if (imgLink) imageWrap.append(imgLink.cloneNode(true)); // carrier anchor for DM auto-block
  li.append(imageWrap);

  // Parse the remaining flats into fields.
  let cta = 'Sign in to add';
  let approx = '';
  let priceHTML = '';
  let title = alt;
  let titleHref = href;
  let badge = '';
  let snap = false;

  rest.forEach((p) => {
    const txt = p.textContent.trim();
    if (isDetailsLink(p)) {
      const a = p.querySelector('a');
      title = a.textContent.trim();
      titleHref = a.getAttribute('href');
      return;
    }
    if (/^sign in to add$/i.test(txt) || /add$/i.test(txt) && txt.length < 20) { cta = txt; return; }
    if (/^approx/i.test(txt)) { approx = 'approx.'; return; }
    if (/your price|\$/i.test(txt)) { priceHTML = p.innerHTML; return; }
    if (/^snap/i.test(txt)) { snap = true; return; }
    if (/bestseller/i.test(txt)) { badge = 'Bestseller'; return; }
  });

  // Full alt title is sometimes provided as a lone <p> (untruncated) — prefer it.
  const fullTitleP = rest.find((p) => !p.querySelector('a') && p.textContent.trim() === alt);
  if (fullTitleP) title = alt;

  const body = document.createElement('div');
  body.className = 'cards-product-card-body';

  if (badge) {
    const b = document.createElement('span');
    b.className = 'cards-product-badge';
    b.textContent = badge;
    imageWrap.append(b);
  }

  const ctaBtn = document.createElement('a');
  ctaBtn.className = 'cards-product-cta';
  ctaBtn.href = titleHref;
  ctaBtn.textContent = cta;
  body.append(ctaBtn);

  if (approx) {
    const ap = document.createElement('p');
    ap.className = 'cards-product-approx';
    ap.textContent = approx;
    body.append(ap);
  }

  if (priceHTML) {
    const price = document.createElement('p');
    price.className = 'cards-product-price';
    // "Your Price $8.06 $8.06" → keep first price; <del>…</del> becomes strikethrough
    price.innerHTML = priceHTML
      .replace(/your price/i, '')
      .replace(/original price/ig, '');
    body.append(price);
  }

  const titleEl = document.createElement('a');
  titleEl.className = 'cards-product-title';
  titleEl.href = titleHref;
  titleEl.textContent = title;
  body.append(titleEl);

  if (snap) {
    const s = document.createElement('span');
    s.className = 'cards-product-snap';
    s.textContent = 'SNAP';
    body.append(s);
  }

  li.append(body);
  return li;
}

/* A bare product image can arrive as a direct <picture>/<img> child when the
   scripts.js DM auto-block has unwrapped its <p>. Treat those as card starts. */
const isBareProductImage = (el) => {
  if (el.tagName !== 'PICTURE' && el.tagName !== 'IMG') return false;
  const img = el.tagName === 'IMG' ? el : el.querySelector('img');
  return img && /grid-product-card/i.test(img.getAttribute('src') || img.currentSrc || '');
};

export default function decorate(block) {
  // Iterate ALL direct children (paragraphs, and any bare <picture>/<img> the
  // DM auto-block may have unwrapped from a <p>).
  const nodes = [...block.children].filter(
    (el) => el.tagName === 'P' || el.tagName === 'PICTURE' || el.tagName === 'IMG',
  );
  if (!nodes.length) return;

  // Rail heading: first node that has a "/home/…" View all link and isn't an image.
  let heading = null;
  if (nodes[0] && nodes[0].tagName === 'P' && !isProductImageLink(nodes[0])
      && nodes[0].querySelector('a[href*="/home/"]')) {
    heading = nodes.shift();
  }

  // Group nodes into products; each starts at a product image (anchor, or a
  // bare picture the auto-block unwrapped). Wrap bare images in a <p> so the
  // rest of buildCard's paragraph logic works uniformly.
  const groups = [];
  let current = null;
  nodes.forEach((el) => {
    let startP = null;
    if (el.tagName === 'P' && isProductImageLink(el)) {
      startP = el;
    } else if (isBareProductImage(el)) {
      startP = document.createElement('p');
      el.replaceWith(startP);
      startP.append(el);
    }
    if (startP) {
      current = [startP];
      groups.push(current);
    } else if (current) {
      current.push(el);
    }
  });

  block.textContent = '';

  // Header row (title + View all)
  if (heading) {
    const head = document.createElement('div');
    head.className = 'cards-product-header';
    while (heading.firstChild) head.append(heading.firstChild);
    block.append(head);
  }

  // Viewport + track
  const viewport = document.createElement('div');
  viewport.className = 'cards-product-viewport';
  const ul = document.createElement('ul');
  ul.className = 'cards-product-track';
  groups.forEach((group) => {
    const card = buildCard(group);
    moveInstrumentation(group[0], card);
    ul.append(card);
  });
  viewport.append(ul);
  block.append(viewport);

  // Prev/next controls
  const nav = (dir, label) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `cards-product-nav cards-product-nav-${dir}`;
    btn.setAttribute('aria-label', label);
    btn.addEventListener('click', () => {
      const amount = Math.round(viewport.clientWidth * 0.8) * (dir === 'prev' ? -1 : 1);
      viewport.scrollBy({ left: amount, behavior: 'smooth' });
    });
    return btn;
  };
  block.append(nav('prev', 'Previous products'));
  block.append(nav('next', 'Next products'));
}
