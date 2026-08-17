import { moveInstrumentation } from '../../ue/scripts/ue-utils.js';

/* Carousel promo hero: rotating slides + promo rail, with an author-selectable
   panel colour (preset variant classes or a "Panel color" config row). */

/* This project has no placeholders module; use inline English defaults. */
const placeholders = {
  carousel: 'Carousel',
  carouselSlideControls: 'Carousel Slide Controls',
  previousSlide: 'Previous Slide',
  nextSlide: 'Next Slide',
  showSlide: 'Show Slide',
  of: 'of',
};

function updateActiveSlide(slide) {
  const block = slide.closest('.carousel-promo');
  const slideIndex = parseInt(slide.dataset.slideIndex, 10);
  block.dataset.activeSlide = slideIndex;

  const slides = block.querySelectorAll('.carousel-promo-slide');

  slides.forEach((aSlide, idx) => {
    aSlide.setAttribute('aria-hidden', idx !== slideIndex);
    aSlide.querySelectorAll('a').forEach((link) => {
      if (idx !== slideIndex) {
        link.setAttribute('tabindex', '-1');
      } else {
        link.removeAttribute('tabindex');
      }
    });
  });

  const indicators = block.querySelectorAll('.carousel-promo-slide-indicator');
  indicators.forEach((indicator, idx) => {
    if (idx !== slideIndex) {
      indicator.querySelector('button').removeAttribute('disabled');
    } else {
      indicator.querySelector('button').setAttribute('disabled', 'true');
    }
  });
}

export function showSlide(block, slideIndex = 0, behavior = 'smooth') {
  const slides = block.querySelectorAll('.carousel-promo-slide');
  let realSlideIndex = slideIndex < 0 ? slides.length - 1 : slideIndex;
  if (slideIndex >= slides.length) realSlideIndex = 0;
  const activeSlide = slides[realSlideIndex];

  activeSlide.querySelectorAll('a').forEach((link) => link.removeAttribute('tabindex'));
  block.querySelector('.carousel-promo-slides').scrollTo({
    top: 0,
    left: activeSlide.offsetLeft,
    behavior,
  });
}

function bindEvents(block) {
  const slideIndicators = block.querySelector('.carousel-promo-slide-indicators');
  if (!slideIndicators) return;

  slideIndicators.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', (e) => {
      const slideIndicator = e.currentTarget.parentElement;
      showSlide(block, parseInt(slideIndicator.dataset.targetSlide, 10));
    });
  });

  block.querySelector('.slide-prev').addEventListener('click', () => {
    showSlide(block, parseInt(block.dataset.activeSlide, 10) - 1);
  });
  block.querySelector('.slide-next').addEventListener('click', () => {
    showSlide(block, parseInt(block.dataset.activeSlide, 10) + 1);
  });

  const slideObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) updateActiveSlide(entry.target);
    });
  }, { threshold: 0.5 });
  block.querySelectorAll('.carousel-promo-slide').forEach((slide) => {
    slideObserver.observe(slide);
  });
}

function createSlide(row, slideIndex, carouselId) {
  const slide = document.createElement('li');
  slide.dataset.slideIndex = slideIndex;
  slide.setAttribute('id', `carousel-promo-${carouselId}-slide-${slideIndex}`);
  slide.classList.add('carousel-promo-slide');

  row.querySelectorAll(':scope > div').forEach((column, colIdx) => {
    column.classList.add(`carousel-promo-slide-${colIdx === 0 ? 'image' : 'content'}`);
    slide.append(column);
  });

  const labeledBy = slide.querySelector('h1, h2, h3, h4, h5, h6');
  if (labeledBy) {
    slide.setAttribute('aria-labelledby', labeledBy.getAttribute('id'));
  }

  return slide;
}

/* Promo rail card: the source art is a single full-bleed banner (tinted panel
   baked in on one side, product photo on the other). We render that image as a
   background layer and overlay the heading + CTA on top, like albertsons.com —
   rather than splitting it into image/text columns, which would crop the wide
   banner and distort the product. */
function createPromoCard(row) {
  const card = document.createElement('div');
  card.classList.add('carousel-promo-card');
  const cols = row.querySelectorAll(':scope > div');
  cols.forEach((column, colIdx) => {
    column.classList.add(`carousel-promo-card-${colIdx === 0 ? 'image' : 'content'}`);
    card.append(column);
  });
  // If the card content has a single CTA link, make the whole card clickable.
  const cta = card.querySelector('.carousel-promo-card-content a[href]');
  if (cta) card.dataset.href = cta.getAttribute('href');
  return card;
}

/* A row is a promo rail card when its content column leads with an h3 (the
   import models rail cards as h3 + CTA); hero slides lead with h2. */
function isPromoRow(row) {
  return !!row.querySelector(':scope > div h3');
}

/* A colour value the author can type: a hex code, an rgb()/hsl() function, or a
   plain CSS colour keyword. Kept permissive but safe — only these forms are
   accepted, so arbitrary text can't be injected as a style value. A bare hex
   like "#c2185b" is also matched (common when an author just types the code). */
const COLOUR_RE = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/]+\)|[a-z]+)$/i;

/* Apply a panel colour to an element via custom properties: the colour itself,
   a derived darker shade (arrow pill), and an auto-contrast text colour. */
function applyPanelColour(el, value) {
  el.style.setProperty('--promo-panel-color', value);
  el.style.setProperty('--promo-panel-color-dark', `color-mix(in srgb, ${value} 78%, black)`);
  el.style.setProperty('--promo-panel-text', `oklch(from ${value} clamp(0, (0.62 - l) * 1000, 1) 0 0)`);
}

/* Optional block-level config row: first cell is a "colour" key, second cell
   holds any CSS colour value — a fallback colour for slides that don't set
   their own. Returns { row, value } (value null if none/invalid). */
function readColourConfig(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  const configRow = rows.find((row) => {
    if (row.querySelector('picture, img, a[href], h1, h2, h3, h4, h5, h6')) return false;
    const cells = [...row.children];
    if (cells.length < 2) return false;
    const key = (cells[0].textContent || '').trim().toLowerCase();
    return /(^|\s)colou?r$/.test(key) || key === 'panel colour' || key === 'panel color';
  });
  if (!configRow) return { row: null, value: null };
  const value = (configRow.children[1].textContent || '').trim();
  if (value && COLOUR_RE.test(value)) {
    applyPanelColour(block, value);
    return { row: configRow, value };
  }
  return { row: configRow, value: null };
}

/* An explicit colour marker: a hex code or an rgb()/hsl() function, optionally
   prefixed with "Color:"/"Colour:". Deliberately does NOT accept a bare word
   (unlike COLOUR_RE) so ordinary body text like "sub"/"now" isn't mistaken for
   a CSS colour keyword. Authors who want a named colour use the "Color:" form. */
const SLIDE_COLOUR_RE = /^(?:colou?r\s*[:=]\s*)?(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/]+\))$/i;
const SLIDE_COLOUR_NAMED_RE = /^colou?r\s*[:=]\s*([a-z]+)$/i;

/* Pull an optional per-slide colour out of a slide row. An author sets a slide
   colour by adding a paragraph that is just a hex/rgb value (e.g. "#c2185b") or
   a labelled "Color: <value>" line. Returns the colour string, or null, and
   removes the marker paragraph so it doesn't render as body text. */
function takeSlideColour(row) {
  const ps = [...row.querySelectorAll(':scope > div > p, :scope > p')];
  const marker = ps.find((p) => {
    if (p.querySelector('a, picture, img, strong, em')) return false;
    const t = (p.textContent || '').trim();
    return SLIDE_COLOUR_RE.test(t) || SLIDE_COLOUR_NAMED_RE.test(t);
  });
  if (!marker) return null;
  const t = marker.textContent.trim();
  const m = t.match(SLIDE_COLOUR_RE) || t.match(SLIDE_COLOUR_NAMED_RE);
  marker.remove();
  return m[1];
}

let carouselId = 0;
export default async function decorate(block) {
  carouselId += 1;
  block.setAttribute('id', `carousel-promo-${carouselId}`);

  // Consume an optional block-level "Panel color" config row (fallback colour
  // for slides that don't set their own) before partitioning slides.
  const { row: colourRow, value: blockColour } = readColourConfig(block);
  if (colourRow) colourRow.remove();
  // A block-level colour also comes from a preset variant class (green/purple/…).
  const hasBlockColour = !!blockColour
    || ['blue', 'green', 'purple', 'peach', 'ink'].some((c) => block.classList.contains(c));

  const allRows = [...block.querySelectorAll(':scope > div')];
  const heroRows = allRows.filter((r) => !isPromoRow(r));
  const promoRows = allRows.filter(isPromoRow);
  // Fallback: if partitioning found no hero rows, treat everything as hero.
  const slidesRows = heroRows.length ? heroRows : allRows;
  const railRows = heroRows.length ? promoRows : [];
  const isSingleSlide = slidesRows.length < 2;

  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', placeholders.carousel || 'Carousel');

  // Bento grid: carousel (left) + promo rail (right, when rail cards exist).
  const bento = document.createElement('div');
  bento.classList.add('carousel-promo-bento');
  if (railRows.length) bento.classList.add('has-rail');

  const container = document.createElement('div');
  container.classList.add('carousel-promo-slides-container');

  const slidesWrapper = document.createElement('ul');
  slidesWrapper.classList.add('carousel-promo-slides');

  let slideIndicators;
  if (!isSingleSlide) {
    const slideNavButtons = document.createElement('div');
    slideNavButtons.classList.add('carousel-promo-navigation-buttons');
    slideNavButtons.innerHTML = `
      <button type="button" class= "slide-prev" aria-label="${placeholders.previousSlide || 'Previous Slide'}"></button>
      <button type="button" class="slide-next" aria-label="${placeholders.nextSlide || 'Next Slide'}"></button>
    `;
    container.append(slideNavButtons);
  }

  slidesRows.forEach((row, idx) => {
    // Per-slide colour: a bare hex/colour paragraph in the slide. Falls back to
    // the block-level colour. If neither, the slide has no colour panel and its
    // image renders full-width.
    const slideColour = takeSlideColour(row);
    const slide = createSlide(row, idx, carouselId);
    if (slideColour) {
      applyPanelColour(slide, slideColour);
      slide.classList.add('carousel-promo-slide-split');
    } else if (hasBlockColour) {
      slide.classList.add('carousel-promo-slide-split');
    }
    moveInstrumentation(row, slide);
    slidesWrapper.append(slide);
    row.remove();
  });

  container.append(slidesWrapper);

  if (!isSingleSlide) {
    const slideIndicatorsNav = document.createElement('nav');
    slideIndicatorsNav.setAttribute('aria-label', placeholders.carouselSlideControls || 'Carousel Slide Controls');
    slideIndicators = document.createElement('ol');
    slideIndicators.classList.add('carousel-promo-slide-indicators');
    slideIndicatorsNav.append(slideIndicators);
    slidesRows.forEach((row, idx) => {
      const indicator = document.createElement('li');
      indicator.classList.add('carousel-promo-slide-indicator');
      indicator.dataset.targetSlide = idx;
      indicator.innerHTML = `<button type="button" aria-label="${placeholders.showSlide || 'Show Slide'} ${idx + 1} ${placeholders.of || 'of'} ${slidesRows.length}"></button>`;
      slideIndicators.append(indicator);
    });
    container.append(slideIndicatorsNav);
  }

  bento.append(container);

  if (railRows.length) {
    const rail = document.createElement('div');
    rail.classList.add('carousel-promo-rail');
    railRows.forEach((row) => {
      const card = createPromoCard(row);
      moveInstrumentation(row, card);
      rail.append(card);
      row.remove();
    });
    // Delegate clicks on a card to its CTA link.
    rail.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      const card = e.target.closest('.carousel-promo-card[data-href]');
      if (card) window.location.assign(card.dataset.href);
    });
    bento.append(rail);
  }

  block.prepend(bento);

  if (!isSingleSlide) {
    bindEvents(block);
  }
}
