/* eslint-disable */
/* global WebImporter */

/**
 * Transformer: albertsons section breaks + section metadata.
 *
 * Runs in afterTransform only. Reads section definitions from
 * payload.template.sections and, for each section:
 *   - inserts a <hr> before the section when it is not the first section
 *     (and there is content before it), producing an EDS section break;
 *   - appends a "Section Metadata" block after the section content when the
 *     section defines a `style`, so the style band is applied to that section.
 *
 * Sections are processed in reverse order so that inserting nodes does not
 * shift the positions of not-yet-processed sections.
 *
 * Anchor resolution (dual-path — required for this template):
 * The homepage section selectors in page-templates.json are document-rooted
 * (`body > main.main-wrapper > ... > div.marker-component:nth-of-type(1)` and
 * `... > div.master-product-carousel.section.static-carousel`) and are
 * IDENTICAL to the carousel-promo / cards-product block instance selectors.
 *   - During transformer validation both hooks run with no block parsing in
 *     between, so the raw section elements are still present and
 *     `section.selector` resolves.
 *   - During the real import, block parsers run between beforeTransform and
 *     afterTransform and `element.replaceWith(block)` swaps each section
 *     element for a block <table> at the same DOM position, so
 *     `section.selector` no longer matches. In that case we locate the block
 *     table by matching its header cell to the section's first block name
 *     (the same position the section element occupied).
 * Both paths place the <hr>/metadata at the correct section boundary.
 *
 * Selectors are taken verbatim from payload.template.sections (populated by the
 * page analysis / block mapping steps from the captured DOM); none are guessed.
 * The resolver additionally derives relaxed variants from those same captured
 * selectors (see selectorVariants) to tolerate minor DOM drift between the
 * captured DOM and the live fetch performed during import.
 */

const TransformHook = { beforeTransform: 'beforeTransform', afterTransform: 'afterTransform' };

// Expected on the homepage template: exactly 1 <hr> (before rc-featured, the
// second/non-first section) and 1 "Section Metadata" block (rc-featured has
// style "grey"; rc-hero has style null so it gets none).

// Mirror of WebImporter.Blocks.computeBlockName so the post-parse fallback can
// match a section's block name against a parsed block table's header cell
// (helix-importer builds that header via the same transformation). Kept local
// so the fallback does not depend on the util being exposed on WebImporter.
function computeBlockName(str) {
  return String(str)
    .replace(/-/g, ' ')
    .replace(/\s(.)/g, (s) => s.toUpperCase())
    .replace(/^(.)/g, (s) => s.toUpperCase());
}

/**
 * Derive resilient fallback selectors from a captured section selector.
 * All variants are derived from the SAME captured selector — nothing is
 * guessed. The homepage selectors use `>` combinators and a
 * `:nth-of-type(1)` pseudo; both are fragile against minor DOM drift between
 * capture time and the live fetch during import (extra wrapper divs, shifted
 * ordering). We progressively relax them:
 *   0. the selector verbatim (most specific);
 *   1. with `:nth-of-type()` / `:nth-child()` pseudos stripped (keeps chain);
 *   2. #1 with `>` child combinators relaxed to descendant combinators
 *      (tolerates intervening wrappers).
 */
function selectorVariants(sel) {
  const variants = [sel];
  const noNth = sel.replace(/:nth-(?:of-type|child)\([^)]*\)/g, '');
  if (noNth !== sel) variants.push(noNth);
  const descendant = noNth.replace(/\s*>\s*/g, ' ');
  if (descendant !== noNth) variants.push(descendant);
  return variants;
}

/**
 * Resolve the element that marks the start of a section, in either the
 * pre-parse (validation) or post-parse (real import) DOM. Returns null when
 * the section cannot be located.
 */
function resolveSectionAnchor(doc, section) {
  // 1) Pre-parse / validation: the raw section element is still present.
  //    Try the verbatim selector first, then progressively relaxed variants
  //    derived from it (see selectorVariants).
  const selectors = Array.isArray(section.selector)
    ? section.selector
    : [section.selector];
  for (const sel of selectors) {
    if (!sel) continue;
    for (const variant of selectorVariants(sel)) {
      const el = doc.querySelector(variant);
      if (el) return el;
    }
  }

  // 2) Post-parse / real import: the section element was replaced by a block
  //    <table>. Match the table whose header cell equals the section's first
  //    block name (ignoring any "(variant)" suffix helix appends).
  if (Array.isArray(section.blocks) && section.blocks.length) {
    const wanted = computeBlockName(section.blocks[0]);
    const tables = doc.querySelectorAll('table');
    for (const table of tables) {
      const th = table.querySelector('th');
      if (!th) continue;
      const headerName = th.textContent.trim().split(' (')[0].trim();
      if (headerName === wanted) return table;
    }
  }

  return null;
}

export default function transform(hookName, element, payload) {
  if (hookName !== TransformHook.afterTransform) return;

  const template = payload && payload.template;
  const sections = template && template.sections;
  if (!Array.isArray(sections) || sections.length < 2) return;

  const doc = element.ownerDocument;

  // Iterate in reverse so earlier insertions do not shift later anchors.
  for (let i = sections.length - 1; i >= 0; i -= 1) {
    const section = sections[i];
    const anchor = resolveSectionAnchor(doc, section);
    if (!anchor) {
      // eslint-disable-next-line no-console
      console.warn('Section anchor not found, skipping section:', section && section.id);
      continue;
    }

    // Section Metadata block (only when the section defines a style).
    // Placed AFTER the section content so the style applies to this section.
    if (section.style) {
      const metadataBlock = WebImporter.Blocks.createBlock(doc, {
        name: 'Section Metadata',
        cells: { style: section.style },
      });
      anchor.after(metadataBlock);
    }

    // Section break before every non-first section that has content before it.
    if (i > 0 && anchor.previousElementSibling) {
      anchor.before(doc.createElement('hr'));
    }
  }
}
