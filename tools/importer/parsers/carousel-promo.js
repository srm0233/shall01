/* eslint-disable */
/* global WebImporter */

/**
 * Parser for the `carousel-promo` variant. Base block: `carousel`.
 * Source: https://www.albertsons.com/ (homepage hero promotional region)
 * Instance selector (page-templates.json):
 *   body > main.main-wrapper > div.full-bleed-container > div.full-bleed-row
 *     > div.marker-component:nth-of-type(1)
 *
 * Block model (blocks/carousel-promo/_carousel-promo.json), item = carousel-promo-item:
 *   - media_image    (reference/richtext) -> Background Image
 *   - media_imageAlt (text, COLLAPSED into the <img> alt attribute)
 *   - content_text   (richtext)           -> heading + subheading + CTA
 *
 * Library convention (Carousel): container block with no own properties; the
 * first table row is the block name, every subsequent row is a single slide.
 * Per the model each slide row has TWO cells:
 *   cell 1 = media_image  (grouped prefix "media"; media_imageAlt is Alt-suffixed
 *            so it collapses into the <img alt> and gets no field comment)
 *   cell 2 = content_text (richtext holding heading, description and CTA)
 *
 * Source structure (validated against migration-work/block-context/carousel-promo/source.html):
 *  - The authored hero region (`.marker-component`) holds a rotating slick
 *    carousel (`.hero-carousel__slides`) plus a right-hand promo rail
 *    (`.hero-flex`). Both surface the same promotional unit: background image +
 *    heading + optional subheading + "Shop now"/"Save now"/"Chat now" CTA.
 *  - Real rotating slides are `.hero-canvas.clickableSlide`; sponsored ad slides
 *    lack `.clickableSlide` (they carry `.google-adManager`) and are excluded.
 *  - slick duplicates its slides as `.slick-cloned`; those are excluded and a
 *    heading+image dedupe guards against any residual duplication on the live DOM.
 *  - Right-rail promo tiles are `.hero-flex__card` (each wraps an
 *    `a.hero-flex-full-bleed-link-wrapper`); their ad-only siblings
 *    (`.gam-ad-container`) carry no image/heading and are skipped by the guard.
 *
 * DM / Scene7: image `src` on the live page is a Dynamic Media URL. The parser
 * leaves the <img> in the media_image cell verbatim; the afterTransform
 * DM-images transformer rewrites it into a carrier anchor (see
 * xwalk-parser-requirements.md §6). No parser-side handling required.
 */
export default function parse(element, { document }) {
  const CTA_SELECTOR = '.hero-canvas__text-plate__cta, .hero-flex-full-bleed__text-box__cta-link, [class*="cta-link"], [class*="__cta"]';
  const DESC_SELECTOR = '.hero-canvas__text-plate__description, [class*="text-plate__description"]';

  // --- Collect the promotional units in visual order ---------------------
  // 1) Rotating hero carousel slides (real, non-cloned, non-ad).
  let heroSlides = Array.from(
    element.querySelectorAll('.hero-carousel__slides .slick-track > .slick-slide:not(.slick-cloned) .hero-canvas.clickableSlide'),
  );
  // Fallback when slick has not initialised on the live fetch (no slick-track):
  // take every clickable hero canvas that is not inside a cloned slide.
  if (!heroSlides.length) {
    heroSlides = Array.from(element.querySelectorAll('.hero-canvas.clickableSlide'))
      .filter((el) => !el.closest('.slick-cloned'));
  }

  // 2) Right-hand promo rail tiles.
  const flexCards = Array.from(element.querySelectorAll('.hero-flex__card'));

  const rawUnits = [...heroSlides, ...flexCards];

  // Dedupe by heading + image (guards against slick clone leakage on live DOM).
  const seen = new Set();
  const units = [];
  rawUnits.forEach((unit) => {
    const h = unit.querySelector('h1, h2, h3, h4, h5, h6');
    const im = unit.querySelector('picture img, img');
    const key = `${h ? h.textContent.trim() : ''}::${im ? (im.getAttribute('src') || '').trim() : ''}`;
    if (key === '::') return; // no heading and no image -> ad-only / empty tile
    if (seen.has(key)) return;
    seen.add(key);
    units.push(unit);
  });

  const cells = [];

  units.forEach((unit) => {
    const img = unit.querySelector('picture img, img');
    const heading = unit.querySelector('h1, h2, h3, h4, h5, h6');
    const description = unit.querySelector(DESC_SELECTOR);
    const ctaEl = unit.querySelector(CTA_SELECTOR);
    const linkEl = unit.querySelector('a[href]');
    const href = linkEl ? (linkEl.getAttribute('href') || '').trim() : '';

    // Skip a tile only if it has neither image nor heading (pure ad slot).
    if (!img && !heading) return;

    // --- Cell 1: media_image (media_imageAlt collapses into <img alt>) ---
    const imageFrag = document.createDocumentFragment();
    if (img) {
      imageFrag.appendChild(document.createComment(' field:media_image '));
      imageFrag.appendChild(img);
    }

    // --- Cell 2: content_text (richtext: heading + description + CTA) ----
    const contentFrag = document.createDocumentFragment();
    contentFrag.appendChild(document.createComment(' field:content_text '));

    if (heading) {
      const h = document.createElement(heading.tagName.toLowerCase());
      h.textContent = heading.textContent.trim();
      contentFrag.appendChild(h);
    }

    if (description) {
      const text = description.textContent.trim();
      if (text) {
        const p = document.createElement('p');
        p.textContent = text;
        contentFrag.appendChild(p);
      }
    }

    if (ctaEl) {
      const ctaText = ctaEl.textContent.trim();
      if (ctaText) {
        const p = document.createElement('p');
        if (href) {
          const a = document.createElement('a');
          a.setAttribute('href', href);
          a.textContent = ctaText;
          p.appendChild(a);
        } else {
          // No destination in source (JS-driven slide) — preserve the CTA copy.
          p.textContent = ctaText;
        }
        contentFrag.appendChild(p);
      }
    } else if (href) {
      // CTA styling absent but the tile is linked — keep the destination.
      const p = document.createElement('p');
      const a = document.createElement('a');
      a.setAttribute('href', href);
      a.textContent = href;
      p.appendChild(a);
      contentFrag.appendChild(p);
    }

    cells.push([imageFrag, contentFrag]);
  });

  // Empty-block guard: nothing extractable -> unwrap rather than emit an empty block.
  if (!cells.length) {
    element.replaceWith(...element.childNodes);
    return;
  }

  const block = WebImporter.Blocks.createBlock(document, { name: 'carousel-promo', cells });
  element.replaceWith(block);
}
