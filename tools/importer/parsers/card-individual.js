/* eslint-disable */
/* global WebImporter */

/**
 * Parser: individual recipe `card` blocks (pescatarian listing).
 * Source: https://www.albertsons.com/recipes/diet/pescatarian
 * Instance selector (page-templates.json):
 *   div.-tw-ml-\[6px\].tw-mb-16   (the grid container; ~100 recipe cards inside)
 *
 * Unlike `cards-recipe-grid` (one shared `cards` block holding every recipe),
 * this parser emits ONE `card` block PER recipe, so each recipe is its own
 * independent component in the authoring outline. The grid container is
 * replaced by N sibling `card` block tables; the responsive grid that arranges
 * them is applied at the section level (styles/lazy-styles.css .card-container).
 *
 * Each emitted `card` block is a 2-column, single-row table:
 *   header row: "Card"
 *   body row:   cell 1 = the recipe thumbnail <img> (external mealime CDN,
 *                        kept as a plain image — NOT Scene7 / Dynamic Media)
 *               cell 2 = the title <a> + meta <ul><li>NN mins</li><li>NNN cal</li></ul>
 *
 * DA (Document Authoring) project — no xwalk field-hinting comments.
 *
 * Source structure (validated against
 * migration-work/block-context/cards-recipe-grid/source.html): cards are
 * recursively nested; the reliable per-card anchor is the recipe title link
 * `a[href*="/meal-plans-recipes/"]`, whose parent (`.tw-mt-[22px]`) also holds
 * the meta <ul>, and whose parent's previous sibling holds the thumbnail.
 */
export default function parse(element, { document }) {
  const titleLinks = Array.from(
    element.querySelectorAll(
      'a[href*="/meal-plans-recipes/"], a[href*="/recipes/"], a[href*="/bundles/"]',
    ),
  );

  const blocks = [];
  const seen = new Set();

  titleLinks.forEach((titleLink) => {
    const href = (titleLink.getAttribute('href') || '').trim();
    const key = href || titleLink.textContent.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);

    const titleParent = titleLink.parentElement;
    const cardScope = (titleParent && titleParent.parentElement) || titleParent || titleLink;

    // Image: sibling wrapper thumbnail, else any img in the card scope.
    let img = null;
    if (titleParent && titleParent.previousElementSibling) {
      img = titleParent.previousElementSibling.querySelector('img');
    }
    if (!img && cardScope.querySelector) img = cardScope.querySelector('img');

    const imageCell = img || '';

    // Title (clean anchor) + meta list.
    const bodyCell = [];
    const titleText = titleLink.textContent.replace(/\s+/g, ' ').trim();
    if (titleText && href) {
      const a = document.createElement('a');
      a.setAttribute('href', href);
      a.textContent = titleText;
      bodyCell.push(a);
    } else {
      bodyCell.push(titleLink);
    }

    const metaList = (titleParent && titleParent.querySelector('ul'))
      || cardScope.querySelector('ul');
    if (metaList) {
      const items = Array.from(metaList.querySelectorAll('li'))
        .map((li) => (li.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      if (items.length) {
        const ul = document.createElement('ul');
        items.forEach((t) => {
          const li = document.createElement('li');
          li.textContent = t;
          ul.appendChild(li);
        });
        bodyCell.push(ul);
      }
    }

    // One `card` block per recipe (single body row).
    const cardBlock = WebImporter.Blocks.createBlock(document, {
      name: 'card',
      cells: [[imageCell, bodyCell]],
    });
    blocks.push(cardBlock);
  });

  // Empty-block guard: nothing extractable -> unwrap rather than emit nothing.
  if (!blocks.length) {
    element.replaceWith(...element.childNodes);
    return;
  }

  // Replace the grid container with the N sibling card blocks (in order).
  element.replaceWith(...blocks);
}
