import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  createTag,
  fetchQueryIndexAll,
  getAuthoredLinks,
  normalizePath,
  resolveArticlesFromIndex,
  isUE,
} from '../../scripts/shared.js';

function buildLinksCard(article) {
  const href = normalizePath(article.path);
  const li = createTag('li');
  const link = createTag('a', { href, class: 'cards-card-link' });

  if (article.image) {
    const imageDiv = createTag('div', { class: 'cards-card-image' });
    imageDiv.append(createOptimizedPicture(article.image, article.title || '', false, [{ width: '750' }]));
    link.append(imageDiv);
  }

  const body = createTag('div', { class: 'cards-card-body' });
  body.append(createTag('p', {}, createTag('strong', {}, article.title || href)));
  if (article.description) {
    body.append(createTag('p', {}, article.description));
  }
  link.append(body);
  li.append(link);

  return li;
}

/**
 * Decorate "cards links" variant: fetch index, match paths, render cards.
 */
async function decorateLinks(block) {
  const authoredLinks = getAuthoredLinks(block);
  if (!authoredLinks.length) {
    block.textContent = '';
    block.append(createTag('p', { class: 'cards-links-empty' }, 'No links provided.'));
    return;
  }

  let indexRows = [];
  try {
    indexRows = await fetchQueryIndexAll();
  } catch {
    indexRows = [];
  }

  const articles = resolveArticlesFromIndex(authoredLinks, indexRows);

  const ul = createTag('ul');
  articles.forEach((article) => ul.append(buildLinksCard(article)));
  block.replaceChildren(ul);
}

/**
 * Decorate bento-grid cards variant.
 * Each authored row becomes a card. The first <p> in each card is treated
 * as a tag/label (e.g. "// Knowledge Base v1.0"), and the first card is
 * marked as the featured (primary) card.
 */
function decorateBento(block) {
  const ul = createTag('ul');

  [...block.children].forEach((row, idx) => {
    const li = createTag('li');
    if (idx === 0) li.classList.add('cards-card-featured');
    while (row.firstElementChild) li.append(row.firstElementChild);

    // Unwrap the single wrapper div if present
    const wrapper = li.firstElementChild;
    if (wrapper && wrapper.tagName === 'DIV' && li.children.length === 1) {
      while (wrapper.firstChild) li.append(wrapper.firstChild);
      wrapper.remove();
    }

    // Separate image into its own wrapper (consistent with default cards)
    const picture = li.querySelector('picture');
    if (picture) {
      const imageDiv = createTag('div', { class: 'cards-card-image' });
      const pictureParent = picture.parentElement;
      imageDiv.append(picture);
      li.prepend(imageDiv);
      if (pictureParent && pictureParent.tagName === 'A' && !pictureParent.children.length) {
        pictureParent.remove();
      }
    } else {
      li.classList.add('cards-card-text-only');
    }

    // Find and mark the tag/label (first <p> that looks like a category tag)
    const firstP = li.querySelector('p');
    if (firstP && !firstP.querySelector('picture') && !firstP.classList.contains('button-container')) {
      firstP.classList.add('cards-card-tag');
    }

    // Wrap remaining non-image content in a body div
    const body = createTag('div', { class: 'cards-card-body' });
    [...li.children].forEach((child) => {
      if (!child.classList.contains('cards-card-image')) body.append(child);
    });
    li.append(body);

    ul.append(li);
  });

  block.replaceChildren(ul);
}

/**
 * Decorate regular cards (authored rows with image + body).
 */
function decorateDefault(block) {
  const ul = createTag('ul');

  [...block.children].forEach((row) => {
    const li = createTag('li');
    while (row.firstElementChild) li.append(row.firstElementChild);

    const content = li.firstElementChild;
    if (content?.children?.length > 1) {
      const imageEl = [...content.children].find((el) => el.querySelector('picture'));
      if (imageEl) {
        const picture = imageEl.querySelector('picture');
        const imageDiv = createTag('div', { class: 'cards-card-image' });
        if (picture) imageDiv.append(picture);
        const bodyDiv = createTag('div', { class: 'cards-card-body' });
        [...content.children].forEach((el) => { if (el !== imageEl) bodyDiv.append(el); });
        li.replaceChildren(imageDiv, bodyDiv);
      } else {
        content.className = 'cards-card-body';
      }
    } else {
      [...li.children].forEach((div) => {
        div.className = (div.children.length === 1 && div.querySelector('picture'))
          ? 'cards-card-image' : 'cards-card-body';
      });
    }

    const linkEl = li.querySelector('.cards-card-image a[href]') || li.querySelector('.cards-card-body a[href]');
    if (linkEl) {
      if (isUE) {
        // In UE: use a <div> wrapper so the authored <a> (with its href) is preserved
        const wrapper = createTag('div', { class: 'cards-card-link' });
        while (li.firstChild) wrapper.append(li.firstChild);
        li.append(wrapper);
        //Remove the button class from the link and button-container class from the parent
        const parent = linkEl.parentElement;
        if (parent) {
          parent.classList.remove('button-container');
        }
        linkEl.classList.remove('button');
       } else {
        const wrapper = createTag('a', {
          href: linkEl.getAttribute('href'),
          title: linkEl.getAttribute('title')?.trim() || undefined,
          class: 'cards-card-link',
        });
        while (li.firstChild) wrapper.append(li.firstChild);
        li.append(wrapper);
        linkEl.replaceWith(...linkEl.childNodes);
        li.querySelectorAll('.cards-card-body a[href]').forEach((a) => a.replaceWith(...a.childNodes));
      }
    }

    const article = createTag('article');
    while (li.firstChild) article.append(li.firstChild);
    li.append(article);

    ul.append(li);
  });

  ul.querySelectorAll('picture > img').forEach((img) => {
    const picture = img.closest('picture');
    if (picture) {
      picture.replaceWith(createOptimizedPicture(img.src, img.alt || '', false, [{ width: '750' }]));
    }
  });

  block.replaceChildren(ul);
}

/**
 * Decorate the "category" variant: the Albertsons "Shop by category" tile grid.
 * Authored as a normal cards block — an optional first row holding the heading,
 * then one row per category whose cells contain the tile image and a label link.
 */
function decorateCategory(block) {
  const rows = [...block.children];

  let headingRow = null;
  if (rows[0] && !rows[0].querySelector('picture, img, a[href*="/is/image/"]')) {
    headingRow = rows.shift();
  }

  const ul = createTag('ul', { class: 'cards-category-track' });
  rows.forEach((row) => {
    const cells = [...row.children];
    if (cells.length < 2) return;
    const [imageCell, bodyCell] = cells;

    // The image cell holds either a <picture>/<img> (already converted by the
    // DM auto-block) or a bare Scene7 anchor (if this block ran first). The
    // body cell holds the navigation link whose text is the category label.
    const labelLink = bodyCell.querySelector('a[href]');
    if (!labelLink) return;
    const label = (labelLink.textContent || '').trim();
    const href = labelLink.getAttribute('href');

    const li = createTag('li', { class: 'cards-category-tile' });
    const link = createTag('a', { class: 'cards-category-link', href });
    const imageWrap = createTag('span', { class: 'cards-category-image' });

    let picture = imageCell.querySelector('picture');
    if (picture) {
      imageWrap.append(picture);
    } else {
      const imgAnchor = imageCell.querySelector('a[href*="/is/image/"]');
      const img = imageCell.querySelector('img');
      const src = imgAnchor ? imgAnchor.getAttribute('href') : (img && img.getAttribute('src'));
      if (src) {
        picture = createOptimizedPicture(src, label, false, [{ width: '400' }]);
        imageWrap.append(picture);
      }
    }

    link.append(imageWrap);
    link.append(createTag('span', { class: 'cards-category-label' }, label));
    li.append(link);
    ul.append(li);
  });

  block.replaceChildren();
  if (headingRow) {
    const head = createTag('div', { class: 'cards-category-header' });
    while (headingRow.firstChild) head.append(headingRow.firstChild);
    const only = head.firstElementChild;
    if (head.children.length === 1 && only && only.tagName === 'DIV') {
      while (only.firstChild) head.append(only.firstChild);
      only.remove();
    }
    block.append(head);
  }
  block.append(ul);
}

/**
 * Decorate the "product" variant: an Albertsons-style horizontal product
 * carousel. Authored as a normal cards block — an optional first row holding a
 * heading + "View all" link, then one row per product whose cells contain the
 * product image and its details (CTA text, price, title link, SNAP, badges).
 */
function decorateProduct(block) {
  const rows = [...block.children];

  // Optional rail heading: first row that has a link but no product picture.
  let headingRow = null;
  if (rows[0] && !rows[0].querySelector('picture, img') && rows[0].querySelector('a')) {
    headingRow = rows.shift();
  }

  const parseCard = (row) => {
    // Flatten the row's cells into a flat list of field elements: expand each
    // cell <div> into its child paragraphs (authors may put all fields in one
    // cell, or split image/body across two cells — handle both).
    const cells = [...row.children];
    const fields = [];
    cells.forEach((cell) => {
      const kids = [...cell.children];
      if (kids.length) fields.push(...kids);
      else fields.push(cell);
    });

    const li = createTag('li', { class: 'cards-card' });

    // Image
    const picture = row.querySelector('picture');
    const img = row.querySelector('img');
    const detailsLink = row.querySelector('a[href*="/product-details"], a[href]');
    const href = detailsLink ? detailsLink.getAttribute('href') : '#';
    const imageWrap = createTag('a', { class: 'cards-card-image', href });
    if (picture) imageWrap.append(picture);
    else if (img) imageWrap.append(img);
    li.append(imageWrap);

    const body = createTag('div', { class: 'cards-card-body' });

    // Walk the text fields (paragraphs) and classify.
    let cta = 'Sign in to add';
    let approx = '';
    let priceHTML = '';
    let title = img ? (img.getAttribute('alt') || '') : '';
    let snap = false;
    let badge = '';

    fields.forEach((el) => {
      if (el.querySelector && el.querySelector('picture, img')) return; // image cell
      const txt = (el.textContent || '').trim();
      if (!txt) return;
      if (el.querySelector && el.querySelector('a[href*="/product-details"]')) {
        title = el.textContent.trim();
        return;
      }
      if (/^sign in to add$/i.test(txt) || (/add$/i.test(txt) && txt.length < 20)) { cta = txt; return; }
      if (/^approx/i.test(txt)) { approx = 'approx.'; return; }
      if (/\bprice\b|\$/i.test(txt)) { priceHTML = el.innerHTML; return; }
      if (/^snap/i.test(txt)) { snap = true; return; }
      if (/^bestseller$/i.test(txt)) { badge = 'Bestseller'; }
    });

    if (badge) {
      imageWrap.append(createTag('span', { class: 'cards-product-badge' }, badge));
    }
    body.append(createTag('a', { class: 'cards-product-cta', href }, cta));
    if (approx) body.append(createTag('p', { class: 'cards-product-approx' }, approx));
    if (priceHTML) {
      const price = createTag('p', { class: 'cards-product-price' });
      // The source repeats each value twice (an a11y copy + a visible copy),
      // e.g. "Your Price $2.50 $2.50Original Price $4.49 $4.49". Strip the
      // "Your/Original Price" labels, then collapse the duplicated amount.
      price.innerHTML = priceHTML
        .replace(/your price/ig, '')
        .replace(/original price/ig, '')
        .replace(/(\$\d[\d.,]*)\s+\1(?!\d)/g, '$1')
        .trim();
      body.append(price);
    }
    body.append(createTag('a', { class: 'cards-product-title', href }, title));
    if (snap) body.append(createTag('span', { class: 'cards-product-snap' }, 'SNAP'));

    li.append(body);
    return li;
  };

  const track = createTag('ul', { class: 'cards-product-track' });
  rows.forEach((row) => {
    if (!row.querySelector('picture, img')) return;
    track.append(parseCard(row));
  });

  const viewport = createTag('div', { class: 'cards-product-viewport' });
  viewport.append(track);

  block.replaceChildren();
  if (headingRow) {
    const head = createTag('div', { class: 'cards-product-header' });
    while (headingRow.firstChild) head.append(headingRow.firstChild);
    // unwrap a single wrapper div
    const only = head.firstElementChild;
    if (head.children.length === 1 && only.tagName === 'DIV') {
      while (only.firstChild) head.append(only.firstChild);
      only.remove();
    }
    block.append(head);
  }
  block.append(viewport);

  const nav = (dir, label) => {
    const btn = createTag('button', { type: 'button', class: `cards-product-nav cards-product-nav-${dir}`, 'aria-label': label });
    btn.addEventListener('click', () => {
      viewport.scrollBy({ left: Math.round(viewport.clientWidth * 0.8) * (dir === 'prev' ? -1 : 1), behavior: 'smooth' });
    });
    return btn;
  };
  block.append(nav('prev', 'Previous products'), nav('next', 'Next products'));

  // Rebuild any remaining raw <img> into optimized pictures.
  block.querySelectorAll('picture > img').forEach((im) => {
    const p = im.closest('picture');
    if (p) p.replaceWith(createOptimizedPicture(im.src, im.alt || '', false, [{ width: '750' }]));
  });
}

export default async function decorate(block) {
  if (block.classList.contains('links')) {
    await decorateLinks(block);
  } else if (block.classList.contains('bento')) {
    decorateBento(block);
  } else if (block.classList.contains('product')) {
    decorateProduct(block);
  } else if (block.classList.contains('category')) {
    decorateCategory(block);
  } else {
    decorateDefault(block);
  }
}
