/* eslint-disable */
/* global WebImporter */

/**
 * Parser for the `cards-product` variant. Base block: `cards`.
 * Source: https://www.albertsons.com/ (homepage featured-items / product rail)
 * Instance selector (page-templates.json):
 *   body > main.main-wrapper > div.full-bleed-container > div.full-bleed-row
 *     > div.master-product-carousel.section.static-carousel
 *
 * Block model (blocks/cards-product/_cards-product.json), item = card:
 *   - image (reference/richtext) -> product image
 *   - text  (richtext)           -> product title (linked) + price
 *   (No `imageAlt` field exists in the model; the alt text stays on the <img>
 *    element itself, so it needs no field comment.)
 *
 * Library convention (Cards): container block with no own properties; each row
 * is a single card. Per the model each card row has TWO cells:
 *   cell 1 = image (mandatory; may be empty but the cell must still exist)
 *   cell 2 = text  (richtext holding the title heading + price/CTA)
 *
 * Source structure (validated against migration-work/block-context/cards-product/source.html):
 *  - The product rail (`.master-product-carousel`) wraps a slick carousel whose
 *    grid (`.slick-track.pc-carousel-grid`) holds product tiles
 *    (`product-carousel-item-al-v2`). Each tile has:
 *      image  -> `.pc__tc__imgc img` (Dynamic Media / Scene7 src, meaningful alt)
 *      title  -> `a.title-xxs` (id `pg<sku>`) linking to `/shop/product-details.*`
 *      price  -> `.product-comp-v1__price__text` (contains an `.sr-only` duplicate
 *                that must be stripped so only the visible price remains)
 *      label  -> optional `.pc__label-container` qualifier ("approx." for
 *                weight-priced items) placed before the price.
 *  - slick clones its slides as `.slick-cloned`; those are excluded, and a
 *    product-link/title dedupe guards against any residual clone leakage on the
 *    live DOM the validator fetches.
 *
 * Deliberately excluded (not authorable card content):
 *  - "Sign in to add" (`button.btn-stppr`) — an auth-gated, JS-driven cart
 *    control with no href, whose label changes with sign-in/quantity state.
 *  - SNAP / eligibility badges (`.pc__tags`) — payment-method chrome.
 *  - The rail header ("Lean proteins" title + "View all" link in `.carousel-nav`)
 *    — the Cards model has no rail-title field, and emitting it as a sibling of
 *    the block would land on the wrong side of the section break inserted by the
 *    section transformer. The section (rc-featured) defines defaultContent: [].
 * The product title is emitted as a linked heading, which doubles as the card's
 * navigational CTA (same pattern as the cards-article reference parser).
 *
 * DM / Scene7: image `src` on the live page is a Dynamic Media URL. The parser
 * leaves the <img> in the image cell verbatim; the afterTransform DM-images
 * transformer rewrites it into a carrier anchor (see xwalk-parser-requirements.md
 * §6). No parser-side handling required.
 */
export default function parse(element, { document }) {
  // --- Collect product tiles (real, non-cloned) -------------------------
  let tiles = Array.from(
    element.querySelectorAll('.slick-track .slick-slide:not(.slick-cloned) product-carousel-item-al-v2'),
  );
  // Fallbacks when slick has not initialised or custom element is renamed.
  if (!tiles.length) {
    tiles = Array.from(element.querySelectorAll('product-carousel-item-al-v2'))
      .filter((el) => !el.closest('.slick-cloned'));
  }
  if (!tiles.length) {
    tiles = Array.from(element.querySelectorAll('.pc--carousel, .pc'))
      .filter((el) => !el.closest('.slick-cloned'));
  }

  // Dedupe by product link / title (guards against slick clone leakage).
  const seen = new Set();
  const cards = [];
  tiles.forEach((tile) => {
    const titleLink = tile.querySelector('a.title-xxs, a[id^="pg"], .pc__bc a[href*="product-details"]');
    const img = tile.querySelector('.pc__tc__imgc img, picture img, img');
    const key = titleLink
      ? (titleLink.getAttribute('href') || titleLink.textContent.trim())
      : (img ? (img.getAttribute('src') || '').trim() : '');
    if (!key) return;
    if (seen.has(key)) return;
    seen.add(key);
    cards.push(tile);
  });

  const cells = [];

  cards.forEach((tile) => {
    const img = tile.querySelector('.pc__tc__imgc img, picture img, img');
    const titleLink = tile.querySelector('a.title-xxs, a[id^="pg"], .pc__bc a[href*="product-details"]');
    const tapZone = tile.querySelector('a.pc__tap-zone[href]');
    // Sale / "your price" span only. NOTE: do NOT fall back to the container
    // `.product-comp-v1__price` here — it also holds the struck-through original
    // price, which would flatten into the sale price as one ambiguous run
    // ("$15.99 $16.99"). The original price is captured separately below and
    // preserved as a <del> so the sale-vs-was relationship survives.
    const salePriceEl = tile.querySelector('.product-comp-v1__price__text, [class*="price__text"]');
    const origPriceEl = tile.querySelector('.product-comp-v1__price del, [class*="__price"] del');
    const labelEl = tile.querySelector('.pc__label-container');

    // --- Cell 1: image (alt stays on the <img>; no imageAlt field) ------
    const imageFrag = document.createDocumentFragment();
    if (img) {
      imageFrag.appendChild(document.createComment(' field:image '));
      imageFrag.appendChild(img);
    }
    // Cell must exist even if empty (library note); an empty fragment yields
    // an empty cell with no field comment, which is correct.

    // --- Cell 2: text (linked title heading + price) --------------------
    const textFrag = document.createDocumentFragment();
    textFrag.appendChild(document.createComment(' field:text '));

    const titleText = titleLink ? titleLink.textContent.replace(/\s+/g, ' ').trim() : '';
    const href = titleLink
      ? (titleLink.getAttribute('href') || '').trim()
      : (tapZone ? (tapZone.getAttribute('href') || '').trim() : '');

    if (titleText) {
      const h = document.createElement('h3');
      if (href) {
        const a = document.createElement('a');
        a.setAttribute('href', href);
        a.textContent = titleText;
        h.appendChild(a);
      } else {
        h.textContent = titleText;
      }
      textFrag.appendChild(h);
    }

    // Price: strip the .sr-only duplicate ("Your Price $8.06") so only the
    // visible price remains; prefix the optional weight qualifier ("approx.").
    // Helper: visible text of a price node with the .sr-only twin removed.
    const visiblePrice = (node) => {
      if (!node) return '';
      const clone = node.cloneNode(true);
      clone.querySelectorAll('.sr-only').forEach((sr) => sr.remove());
      return clone.textContent.replace(/\s+/g, ' ').trim();
    };

    let saleText = visiblePrice(salePriceEl);
    const labelText = labelEl ? labelEl.textContent.replace(/\s+/g, ' ').trim() : '';
    if (labelText) saleText = `${labelText} ${saleText}`.replace(/\s+/g, ' ').trim();

    if (saleText) {
      const p = document.createElement('p');
      p.appendChild(document.createTextNode(saleText));
      // Preserve the struck-through original ("was") price as a <del> so the
      // markdown keeps the sale-vs-original distinction instead of merging both
      // numbers into one ambiguous string.
      const origText = visiblePrice(origPriceEl);
      if (origText) {
        p.appendChild(document.createTextNode(' '));
        const del = document.createElement('del');
        del.textContent = origText;
        p.appendChild(del);
      }
      textFrag.appendChild(p);
    }

    // Include the card only when it has real content (image or title).
    if (!img && !titleText) return;
    cells.push([imageFrag, textFrag]);
  });

  // Empty-block guard: nothing extractable -> unwrap rather than emit an empty block.
  if (!cells.length) {
    element.replaceWith(...element.childNodes);
    return;
  }

  const block = WebImporter.Blocks.createBlock(document, { name: 'cards-product', cells });
  element.replaceWith(block);
}
