import { moveInstrumentation } from './ue-utils.js';

// Re-apply UE instrumentation from the block's original row <div>s onto the
// decorated card <li>s. Works for the default cards layout (a flat <ul>) and
// for the Albertsons variants (product/category/recipe/recipe-b/feature/coupon),
// which nest the <ul> inside a viewport wrapper and may prepend a heading row.
// The row <div>s and the card <li>s are matched in document order, ignoring any
// non-card rows (heading) that don't produce an <li>.
const reinstrumentCards = (blockEl, removedNodes) => {
  const removedRows = [...removedNodes].filter((n) => n.tagName === 'DIV');
  const cardEls = [...blockEl.querySelectorAll(':scope li')];
  if (!cardEls.length) return;
  // If a heading row was consumed, there will be one more removed row than card;
  // drop leading rows so the tail lines up card-for-card.
  const offset = Math.max(0, removedRows.length - cardEls.length);
  cardEls.forEach((li, i) => {
    const row = removedRows[i + offset];
    if (row && !li.getAttribute('data-aue-resource')) moveInstrumentation(row, li);
  });
};

const setupObservers = () => {
  const mutatingBlocks = document.querySelectorAll('div.cards, div.journey-map, div.carousel-promo');
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.target.tagName === 'DIV') {
        const addedElements = mutation.addedNodes;
        const removedElements = mutation.removedNodes;

        // detect the mutation type of the block or picture (for cards)
        const type = mutation.target.classList.contains('cards-card-image')
          ? 'cards-image'
          : mutation.target.attributes['data-aue-component']?.value;

        switch (type) {
          case 'cards': {
            // The default layout replaces rows with a flat <ul>; the Albertsons
            // variants nest the <ul> in a viewport wrapper (± a heading row).
            // Re-instrument by matching rows to card <li>s in document order.
            const blockEl = mutation.target.closest('.cards') || mutation.target;
            reinstrumentCards(blockEl, mutation.removedNodes);
            break;
          }
          case 'cards-image':
            // handle card-image picture replacements
            if (mutation.target.classList.contains('cards-card-image')) {
              const addedPictureEl = [...mutation.addedNodes].filter((node) => node.tagName === 'PICTURE');
              const removedPictureEl = [...mutation.removedNodes].filter((node) => node.tagName === 'PICTURE');
              if (addedPictureEl.length === 1 && removedPictureEl.length === 1) {
                const oldImgEl = removedPictureEl[0].querySelector('img');
                const newImgEl = addedPictureEl[0].querySelector('img');
                if (oldImgEl && newImgEl) {
                  moveInstrumentation(oldImgEl, newImgEl);
                }
              }
            }
            break;
          case 'journey-map':
            // handle row div → article replacements (custom block)
            if (addedElements.length === 1 && addedElements[0].tagName === 'ARTICLE') {
              if (removedElements.length === 1) {
                moveInstrumentation(removedElements[0], addedElements[0]);
              }
            }
            break;
          case 'carousel-promo': {
            // The hero decorator moves each row's columns into a <li> slide or a
            // promo-rail card. Re-instrument by matching removed rows to the
            // rendered slides + cards in document order.
            const blockEl = mutation.target.closest('.carousel-promo') || mutation.target;
            const removedRows = [...mutation.removedNodes].filter((n) => n.tagName === 'DIV');
            const targets = [
              ...blockEl.querySelectorAll('.carousel-promo-slide'),
              ...blockEl.querySelectorAll('.carousel-promo-card'),
            ];
            targets.forEach((el, i) => {
              const row = removedRows[i];
              if (row && !el.getAttribute('data-aue-resource')) moveInstrumentation(row, el);
            });
            break;
          }
          default:
            break;
        }
      }
    });
  });

  mutatingBlocks.forEach((block) => {
    observer.observe(block, { childList: true, subtree: true });
  });
};

const setupUEEventHandlers = () => {
  // For each picture or img element change, update the srcsets of the picture element sources
  document.body.addEventListener('aue:content-patch', ({ detail: { patch, request } }) => {
    let element = document.querySelector(`[data-aue-resource="${request.target.resource}"]`);
    if (element && element.getAttribute('data-aue-prop') !== patch.name) element = element.querySelector(`[data-aue-prop='${patch.name}']`);
    if (element?.getAttribute('data-aue-type') !== 'media') return;

    const picture = element.tagName === 'IMG' ? element.closest('picture') : element;
    picture?.querySelectorAll('source').forEach((source) => source.remove());
    picture?.querySelector('img')?.removeAttribute('srcset');
  });

  document.body.addEventListener('aue:ui-select', (event) => {
    const { detail } = event;
    const resource = detail?.resource;

    if (resource) {
      const element = document.querySelector(`[data-aue-resource="${resource}"]`);
      if (!element) {
        return;
      }
      const blockEl = element.parentElement?.closest('.block[data-aue-resource]') || element?.closest('.block[data-aue-resource]');
      if (blockEl) {
        const block = blockEl.getAttribute('data-aue-component');

        switch (block) {
          case 'journey-map': {
            // Click the toggle for the selected step
            const toggle = element.querySelector('.journey-map-step-toggle');
            if (toggle && !toggle.disabled) toggle.click();
            break;
          }
          case 'tabs':
            if (element === blockEl) {
              return;
            }
            blockEl.querySelectorAll('[role=tabpanel]').forEach((panel) => {
              panel.setAttribute('aria-hidden', true);
            });
            element.setAttribute('aria-hidden', false);
            blockEl.querySelector('.tabs-list').querySelectorAll('button').forEach((btn) => {
              btn.setAttribute('aria-selected', false);
            });
            blockEl.querySelector(`[aria-controls=${element?.id}]`).setAttribute('aria-selected', true);
            break;
          default:
            break;
        }
      }
    }
  });
};

export default () => {
  setupObservers();
  setupUEEventHandlers();
};