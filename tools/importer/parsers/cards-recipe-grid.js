/* eslint-disable */
/* global WebImporter */

/**
 * Parser for the `cards-recipe-grid` variant. Base block: `cards`.
 * Source: https://www.albertsons.com/recipes/diet/pescatarian (recipe listing grid)
 * Instance selector (page-templates.json):
 *   div.-tw-ml-\[6px\].tw-mb-16   (the grid container; ~100 recipe cards inside)
 *
 * Library convention (Cards): 2-column table, multiple rows; the first row is
 * the block name. Each subsequent row is ONE card:
 *   cell 1 = Image (mandatory)
 *   cell 2 = Text content (title styled as heading + description/meta)
 *
 * Delivered block name `cards-recipe-grid` -> header "Cards Recipe Grid" ->
 * delivered classes "cards recipe-grid", handled by blocks/cards/cards.js
 * decorateRecipeGrid. This is a DA (Document Authoring) project — NO xwalk
 * field-hinting comments are emitted.
 *
 * decorateRecipeGrid reads, per authored ROW, cells it flattens into fields:
 *   - image field: a cell containing a picture/img
 *   - title link:  a[href*="/meal-plans-recipes/"] (or /recipes/ or /bundles/)
 *   - meta tokens: an authored <ul>/<li> list (preferred), else leftover short
 *                  text matching /min|cal|hr|hour/
 *
 * Emitted per card (2 cells, matching the Cards convention):
 *   cell 1 = the <img> (recipe thumbnail)
 *   cell 2 = the title <a> followed by the meta <ul><li>…</li></ul>
 *
 * Source structure (validated against
 * migration-work/block-context/cards-recipe-grid/source.html):
 *   Cards are recursively nested; the reliable per-card anchor is the recipe
 *   title link `a[href*="/meal-plans-recipes/"]`, whose:
 *     - parent div (`.tw-mt-[22px]`) also holds the meta `<ul>`
 *       (`<li>NN mins</li><li>NNN cal</li>`), and
 *     - previous element sibling (`div.css-1d8by72`) holds the thumbnail
 *       `img.css-tf5j1x` (external mealime CDN: cdn-uploads.mealime.com).
 *
 * The thumbnail src is an external mealime CDN URL — it is kept as a plain
 * image and deliberately NOT converted to Scene7 / Dynamic Media.
 */
export default function parse(element, { document }) {
  // --- Collect recipe cards -------------------------------------------------
  // Anchor on the recipe title links; each link identifies exactly one card.
  const titleLinks = Array.from(
    element.querySelectorAll(
      'a[href*="/meal-plans-recipes/"], a[href*="/recipes/"], a[href*="/bundles/"]',
    ),
  );

  const cells = [];
  const seen = new Set();

  titleLinks.forEach((titleLink) => {
    // Dedupe by recipe href (guards against nested/duplicate matches).
    const href = (titleLink.getAttribute('href') || '').trim();
    const key = href || titleLink.textContent.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);

    // The title link's parent holds the meta list; look there first, then walk
    // up a level for the image (the thumbnail lives in a sibling wrapper).
    const titleParent = titleLink.parentElement;
    const cardScope = (titleParent && titleParent.parentElement) || titleParent || titleLink;

    // Image: prefer a sibling wrapper's thumbnail; fall back to any img in the
    // card scope. Left as a plain <img> (external CDN, not Scene7/DM).
    let img = null;
    if (titleParent && titleParent.previousElementSibling) {
      img = titleParent.previousElementSibling.querySelector('img');
    }
    if (!img && cardScope.querySelector) img = cardScope.querySelector('img');

    // --- Cell 1: image (external CDN thumbnail; left as a plain <img>) ------
    const imageCell = img || '';

    // --- Cell 2: title link (heading) + meta list --------------------------
    const bodyCell = [];

    // Rebuild a clean anchor so only the recipe name (not nested wrapper divs)
    // becomes the link text that decorateRecipeGrid reads.
    const titleText = titleLink.textContent.replace(/\s+/g, ' ').trim();
    if (titleText && href) {
      const a = document.createElement('a');
      a.setAttribute('href', href);
      a.textContent = titleText;
      bodyCell.push(a);
    } else {
      bodyCell.push(titleLink);
    }

    // Meta list: prefer the authored <ul><li>…</li></ul> (e.g. "25 mins",
    // "269 cal"). It lives in the title link's parent. Rebuild it so only the
    // li text survives.
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

    cells.push([imageCell, bodyCell]);
  });

  // Empty-block guard: nothing extractable -> unwrap rather than emit an empty block.
  if (!cells.length) {
    element.replaceWith(...element.childNodes);
    return;
  }

  // Emit as the shared `cards` block with a `recipe-grid` variant so the delivered
  // wrapper is `<div class="cards recipe-grid">` (header "Cards (recipe-grid)"),
  // handled by blocks/cards/cards.js decorateRecipeGrid. Emitting name
  // 'cards-recipe-grid' would deliver a single `cards-recipe-grid` class and make
  // EDS look for a non-existent blocks/cards-recipe-grid/ folder.
  const block = WebImporter.Blocks.createBlock(document, { name: 'cards', variants: ['recipe-grid'], cells });
  element.replaceWith(block);
}
