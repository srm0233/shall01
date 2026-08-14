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

  // The grid shows two rows (up to 16 tiles at desktop; CSS trims per
  // breakpoint) and hides the overflow behind a "View More" toggle, matching
  // albertsons.com. Only add the control when there is something to reveal.
  const VISIBLE = 16; // 2 rows x 8 columns
  if (ul.children.length > VISIBLE) {
    const toggle = createTag('button', {
      type: 'button',
      class: 'cards-category-more',
      'aria-expanded': 'false',
    }, 'View More');
    toggle.addEventListener('click', () => {
      const expanded = block.classList.toggle('cards-category-expanded');
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? 'View Less' : 'View More';
    });
    block.append(toggle);
  }
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

/**
 * Split an optional leading heading row off a block. Returns the heading row
 * (or null) and leaves the remaining product/card rows in place. A heading row
 * is the first row that carries no image.
 */
function takeHeadingRow(rows) {
  if (rows[0] && !rows[0].querySelector('picture, img, a[href*="/is/image/"]')) {
    return rows.shift();
  }
  return null;
}

/** Append a decorated heading (unwrapping a single wrapper div) to a block. */
function appendHeader(block, headingRow, cls) {
  if (!headingRow) return;
  const head = createTag('div', { class: cls });
  while (headingRow.firstChild) head.append(headingRow.firstChild);
  const only = head.firstElementChild;
  if (head.children.length === 1 && only && only.tagName === 'DIV') {
    while (only.firstChild) head.append(only.firstChild);
    only.remove();
  }
  block.append(head);
}

/** Turn a Scene7/DM anchor or bare <img> into an optimized <picture>. */
function pictureFrom(el, alt, width) {
  if (!el) return null;
  const existing = el.tagName === 'PICTURE' ? el : el.querySelector('picture');
  if (existing) return existing;
  const anchor = el.tagName === 'A' ? el : el.querySelector('a[href*="/is/image/"]');
  const img = el.querySelector ? el.querySelector('img') : (el.tagName === 'IMG' ? el : null);
  const src = anchor ? anchor.getAttribute('href') : (img && img.getAttribute('src'));
  if (!src) return null;
  // AEM/Scene7 URLs benefit from optimized renditions; a bare <img> pointing at
  // a third-party CDN (e.g. the mealime recipe photo) should be used as-is so we
  // don't append query params the external host doesn't understand.
  if (img && !anchor && !/\/is\/image\/|adobeaemcloud\.com/.test(src)) {
    return img;
  }
  return createOptimizedPicture(src, alt || '', false, [{ width: String(width || 750) }]);
}

/** Attach prev/next scroll buttons to a horizontally scrolling viewport. */
function addCarouselNav(block, viewport, cls) {
  const nav = (dir, label) => {
    const btn = createTag('button', { type: 'button', class: `${cls} ${cls}-${dir}`, 'aria-label': label });
    btn.addEventListener('click', () => {
      viewport.scrollBy({ left: Math.round(viewport.clientWidth * 0.8) * (dir === 'prev' ? -1 : 1), behavior: 'smooth' });
    });
    return btn;
  };
  block.append(nav('prev', 'Previous'), nav('next', 'Next'));
}

/**
 * Decorate the "recipe" variant: Albertsons meal/bundle carousel. Each recipe
 * card shows a large hero photo, a 2x2 grid of ingredient thumbnails, and a
 * title with a trailing arrow linking to the bundle. Authored rows hold, in
 * order: a title link, the hero image, then the ingredient-thumbnail images.
 */
function decorateRecipe(block) {
  const rows = [...block.children];
  const headingRow = takeHeadingRow(rows);

  const track = createTag('ul', { class: 'cards-recipe-track' });
  rows.forEach((row) => {
    // Flatten the row's cells into field elements.
    const fields = [];
    [...row.children].forEach((cell) => {
      const kids = [...cell.children];
      if (kids.length) fields.push(...kids);
      else fields.push(cell);
    });

    // The title is the link that points at the recipe/bundle detail page.
    const titleLink = row.querySelector('a[href^="/bundles/"], a[href*="/meal-plans-recipes/"], a[href*="/recipes/"]');
    const href = titleLink ? titleLink.getAttribute('href') : '#';
    const title = titleLink ? titleLink.textContent.trim() : '';

    // Any image URL in a field — a Scene7/DM anchor (before auto-block) or the
    // <img>/<source> src of a <picture> (after the auto-block has converted it).
    const fieldImgUrl = (f) => {
      if (!f || !f.querySelector) return '';
      const a = f.querySelector('a[href*="/is/image/"]');
      if (a) return a.getAttribute('href') || '';
      const img = f.querySelector('img');
      if (img && img.getAttribute('src')) return img.getAttribute('src');
      const src = f.querySelector('source');
      return (src && src.getAttribute('srcset')) || '';
    };
    // Scene7 renditions carry "/is/image/" in their URL; the mealime hero photo
    // does not. This survives the auto-block's <picture> conversion, so it works
    // whichever decorator runs first.
    const isScene7 = (url) => /\/is\/image\//.test(url);

    const imgFields = fields.filter((f) => f.querySelector && (f.querySelector('img') || f.querySelector('a[href*="/is/image/"]')));
    let heroField = imgFields.find((f) => !isScene7(fieldImgUrl(f)));
    if (!heroField) [heroField] = imgFields;
    const thumbFields = imgFields.filter((f) => f !== heroField && isScene7(fieldImgUrl(f))).slice(0, 4);

    const li = createTag('li', { class: 'cards-recipe-card' });
    const link = createTag('a', { class: 'cards-recipe-link', href });

    const hero = createTag('div', { class: 'cards-recipe-hero' });
    const heroPic = pictureFrom(heroField, title, 750);
    if (heroPic) hero.append(heroPic);
    link.append(hero);

    if (thumbFields.length) {
      const thumbs = createTag('div', { class: 'cards-recipe-thumbs' });
      thumbFields.forEach((tf) => {
        const cell = createTag('span', { class: 'cards-recipe-thumb' });
        const pic = pictureFrom(tf, '', 200);
        if (pic) cell.append(pic);
        thumbs.append(cell);
      });
      link.append(thumbs);
    }

    const foot = createTag('div', { class: 'cards-recipe-foot' });
    foot.append(createTag('span', { class: 'cards-recipe-title' }, title));
    foot.append(createTag('span', { class: 'cards-recipe-arrow', 'aria-hidden': 'true' }));
    link.append(foot);

    li.append(link);
    track.append(li);
  });

  const viewport = createTag('div', { class: 'cards-recipe-viewport' });
  viewport.append(track);
  block.replaceChildren();
  appendHeader(block, headingRow, 'cards-recipe-header');
  block.append(viewport);
  addCarouselNav(block, viewport, 'cards-recipe-nav');
}

/**
 * Decorate the "recipe-b" variant: Albertsons recipe carousel (Breakfast
 * champions style). Each card is a large photo with a "N servings" badge
 * overlaid top-right, then a title and an "Est $X / serving" price beneath.
 * Authored rows hold, in order: an image cell (whose text is the servings
 * label), a title cell, and a price cell.
 */
function decorateRecipeB(block) {
  const rows = [...block.children];
  const headingRow = takeHeadingRow(rows);

  const track = createTag('ul', { class: 'cards-recipeb-track' });
  rows.forEach((row) => {
    const fields = [];
    [...row.children].forEach((cell) => {
      const kids = [...cell.children];
      if (kids.length) fields.push(...kids);
      else fields.push(cell);
    });

    const recipeLink = row.querySelector('a[href*="/meal-plans-recipes/"], a[href*="/recipes/"], a[href*="/bundles/"]');
    const href = recipeLink ? recipeLink.getAttribute('href') : '#';

    // Image field: the cell carrying a picture/img (its text is the "N servings"
    // badge). Works before or after the DM/auto-block conversion.
    const imgField = fields.find((f) => f.querySelector && (f.querySelector('picture') || f.querySelector('img')));
    const servings = imgField ? (imgField.textContent || '').trim() : '';

    // Remaining text fields (excluding the image) are title then price. The
    // price field is the one that mentions a currency amount / "serving".
    const textFields = fields.filter((f) => f !== imgField && (f.textContent || '').trim());
    const priceField = textFields.find((f) => /\$|per serving|\/ serving/i.test(f.textContent || ''));
    const titleField = textFields.find((f) => f !== priceField);
    const title = titleField ? titleField.textContent.trim() : '';

    // Clean the doubled price string: the source repeats it as
    // "Estimated price $4.61 per servingEst $4.61 / serving[original price $X$X]".
    // Keep the compact "Est $X / serving" form and any struck original.
    let priceHTML = '';
    if (priceField) {
      const raw = (priceField.textContent || '').trim();
      const estMatch = raw.match(/Est\s*\$[\d.,]+\s*\/\s*serving/i);
      const est = estMatch ? estMatch[0] : raw.replace(/estimated price.*?per serving/i, '').trim();
      const origMatch = raw.match(/original price\s*(\$[\d.,]+)/i);
      priceHTML = est;
      if (origMatch) priceHTML += ` <del>${origMatch[1]}</del>`;
    }

    const li = createTag('li', { class: 'cards-recipeb-card' });
    const link = createTag('a', { class: 'cards-recipeb-link', href });

    const imageWrap = createTag('div', { class: 'cards-recipeb-image' });
    const pic = pictureFrom(imgField, title, 750);
    if (pic) imageWrap.append(pic);
    if (servings) imageWrap.append(createTag('span', { class: 'cards-recipeb-servings' }, servings));
    link.append(imageWrap);

    const body = createTag('div', { class: 'cards-recipeb-body' });
    if (title) body.append(createTag('p', { class: 'cards-recipeb-title' }, title));
    if (priceHTML) {
      const price = createTag('p', { class: 'cards-recipeb-price' });
      price.innerHTML = priceHTML;
      body.append(price);
    }
    link.append(body);

    li.append(link);
    track.append(li);
  });

  const viewport = createTag('div', { class: 'cards-recipeb-viewport' });
  viewport.append(track);
  block.replaceChildren();
  appendHeader(block, headingRow, 'cards-recipeb-header');
  block.append(viewport);
  addCarouselNav(block, viewport, 'cards-recipeb-nav');
}

/**
 * Decorate the "feature" variant (Categories A): up to 4 large image cards with
 * a caption beneath. Extra rows beyond 4 are dropped. When fewer than 4 cards
 * are authored, the track reflows so the final card grows to fill the row.
 */
function decorateFeature(block) {
  const rows = [...block.children];
  const headingRow = takeHeadingRow(rows);

  const cards = rows
    .filter((row) => row.querySelector('picture, img, a[href*="/is/image/"]'))
    .slice(0, 4); // hard cap at 4

  const ul = createTag('ul', { class: 'cards-feature-track' });
  ul.dataset.count = String(cards.length);
  cards.forEach((row) => {
    const links = [...row.querySelectorAll('a[href]')];
    const navLink = links.find((a) => !/\/is\/image\//.test(a.getAttribute('href') || ''));
    // Caption: the row's plain-text (non-link) content, else the image link text.
    let caption = '';
    [...row.querySelectorAll('p')].forEach((p) => {
      if (!p.querySelector('a') && p.textContent.trim()) caption = p.textContent.trim();
    });
    if (!caption && navLink) caption = navLink.textContent.trim();
    if (!caption) {
      const imgLink = links.find((a) => /\/is\/image\//.test(a.getAttribute('href') || ''));
      caption = imgLink ? imgLink.textContent.trim() : '';
    }
    const href = navLink ? navLink.getAttribute('href') : (links[0] && links[0].getAttribute('href')) || '#';

    const li = createTag('li', { class: 'cards-feature-card' });
    const link = createTag('a', { class: 'cards-feature-link', href });
    const imageWrap = createTag('span', { class: 'cards-feature-image' });
    const pic = pictureFrom(row.querySelector('picture, a[href*="/is/image/"], img'), caption, 750);
    if (pic) imageWrap.append(pic);
    link.append(imageWrap);
    link.append(createTag('span', { class: 'cards-feature-caption' }, caption));
    li.append(link);
    ul.append(li);
  });

  block.replaceChildren();
  appendHeader(block, headingRow, 'cards-feature-header');
  block.append(ul);
}

/**
 * Decorate the "coupon" variant (Coupons & deals carousel). Each coupon card
 * shows a rewards/offer badge line, a product title, a short description, an
 * "Offer Details" link, a product image, a "Clip Coupon" button, and usage +
 * expiry text. Fields are classified by content so authoring stays flexible.
 */
function decorateCoupon(block) {
  const rows = [...block.children];
  const headingRow = takeHeadingRow(rows);

  const track = createTag('ul', { class: 'cards-coupon-track' });
  rows.forEach((row) => {
    const fields = [];
    [...row.children].forEach((cell) => {
      const kids = [...cell.children];
      if (kids.length) fields.push(...kids);
      else fields.push(cell);
    });

    // Image field: a Scene7 anchor, an already-converted <picture>, or an <img>.
    const isImageField = (f) => f && (
      (f.tagName === 'PICTURE')
      || (f.querySelector && (f.querySelector('picture') || f.querySelector('img') || f.querySelector('a[href*="/is/image/"]')))
    );
    const imgField = fields.find(isImageField);

    // Details link: an anchor whose text reads "…Details" (e.g. "Offer Details").
    let detailsLink = null;
    fields.forEach((f) => {
      if (f === imgField || !f.querySelector) return;
      const a = f.querySelector('a[href]');
      if (a && /details/i.test(a.textContent || '')) detailsLink = a;
    });

    let badge = '';
    let title = '';
    let desc = '';
    let clip = 'Clip Coupon';
    let usage = '';
    let expires = '';

    fields.forEach((el) => {
      if (el === imgField) return;
      if (detailsLink && el.contains(detailsLink)) return; // handled separately
      const t = (el.textContent || '').trim();
      if (!t) return;
      if (/^clip coupon$/i.test(t)) { clip = t; return; }
      if (/^unlimited use|^limit\b|per (household|order)/i.test(t)) { usage = t; return; }
      if (/^expires?/i.test(t)) { expires = t; return; }
      if (!badge && (/points|10x|earn|\bfor\b/i.test(t) || /\$[\d.]+\s*(each|off)/i.test(t))) { badge = t; return; }
      if (!title) { title = t; return; }
      desc = desc ? `${desc} ${t}` : t;
    });

    const li = createTag('li', { class: 'cards-coupon-card' });

    const top = createTag('div', { class: 'cards-coupon-top' });
    if (badge) top.append(createTag('span', { class: 'cards-coupon-badge' }, badge));

    const bodyRow = createTag('div', { class: 'cards-coupon-body' });
    const info = createTag('div', { class: 'cards-coupon-info' });
    if (title) info.append(createTag('p', { class: 'cards-coupon-title' }, title));
    if (desc) info.append(createTag('p', { class: 'cards-coupon-desc' }, desc));
    if (detailsLink) {
      const dl = createTag('a', { class: 'cards-coupon-details', href: detailsLink.getAttribute('href') }, detailsLink.textContent.trim() || 'Offer Details');
      info.append(dl);
    }
    bodyRow.append(info);

    const imageWrap = createTag('span', { class: 'cards-coupon-image' });
    const pic = pictureFrom(imgField, title, 300);
    if (pic) imageWrap.append(pic);
    bodyRow.append(imageWrap);

    const foot = createTag('div', { class: 'cards-coupon-foot' });
    foot.append(createTag('button', { type: 'button', class: 'cards-coupon-clip' }, clip));
    const meta = createTag('div', { class: 'cards-coupon-meta' });
    if (usage) meta.append(createTag('span', { class: 'cards-coupon-usage' }, usage));
    if (expires) meta.append(createTag('span', { class: 'cards-coupon-expires' }, expires));
    foot.append(meta);

    li.append(top, bodyRow, foot);
    track.append(li);
  });

  const viewport = createTag('div', { class: 'cards-coupon-viewport' });
  viewport.append(track);
  block.replaceChildren();
  appendHeader(block, headingRow, 'cards-coupon-header');
  block.append(viewport);
  addCarouselNav(block, viewport, 'cards-coupon-nav');
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
  } else if (block.classList.contains('recipe-b')) {
    decorateRecipeB(block);
  } else if (block.classList.contains('recipe')) {
    decorateRecipe(block);
  } else if (block.classList.contains('feature')) {
    decorateFeature(block);
  } else if (block.classList.contains('coupon')) {
    decorateCoupon(block);
  } else {
    decorateDefault(block);
  }
}
