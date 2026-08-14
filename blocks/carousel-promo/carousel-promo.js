import { moveInstrumentation } from '../../ue/scripts/ue-utils.js';

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

let carouselId = 0;
export default async function decorate(block) {
  carouselId += 1;
  block.setAttribute('id', `carousel-promo-${carouselId}`);
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
    const slide = createSlide(row, idx, carouselId);
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
