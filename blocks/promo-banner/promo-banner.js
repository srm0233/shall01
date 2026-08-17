import { moveInstrumentation } from '../../ue/scripts/ue-utils.js';

/*
 * Promo Banner — a full-width two-column teaser.
 *
 * Authoring (block rows):
 *   [ Background color | #hex ]   (optional config row)
 *   [ Image side       | left|right ]   (optional config row; default right)
 *   [ image cell | text cell ]    (content row: title + description + CTA link)
 *
 * Behaviour:
 *  - HEX supplied  -> split layout: solid colour panel behind the text on one
 *    side, image on the other side. Author picks the image side (default right).
 *  - No HEX        -> the image is the full-width background of the whole block,
 *    with the text overlaid.
 *
 * Text cell holds: a heading (Title), one or more paragraphs (Description), and
 * a link (CTA) which is rendered with a trailing arrow.
 */

const COLOUR_RE = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%/]+\)|[a-z]+)$/i;

/* A config row: a 2-cell row whose first cell is a known key and which carries
   no image/heading/link. Returns the value string or null, and removes the row. */
function takeConfigRow(rows, keyRe) {
  const idx = rows.findIndex((row) => {
    if (row.querySelector('picture, img, a[href], h1, h2, h3, h4, h5, h6')) return false;
    const cells = [...row.children];
    if (cells.length < 2) return false;
    return keyRe.test((cells[0].textContent || '').trim());
  });
  if (idx === -1) return null;
  const [row] = rows.splice(idx, 1);
  const value = (row.children[1].textContent || '').trim();
  row.remove();
  return value;
}

export default function decorate(block) {
  const rows = [...block.children];

  // Optional config rows.
  const colourRaw = takeConfigRow(rows, /^(background )?colou?r$/i);
  const colour = colourRaw && COLOUR_RE.test(colourRaw) ? colourRaw : '';
  const sideRaw = (takeConfigRow(rows, /^image side$/i) || '').toLowerCase();
  const imageSide = sideRaw === 'left' ? 'left' : 'right';

  // The content row: an image cell and a text cell.
  const contentRow = rows.find((row) => row.querySelector('picture, img'))
    || rows.find((row) => row.children.length >= 2)
    || rows[0];
  if (!contentRow) return;

  const cells = [...contentRow.children];
  const imageCell = cells.find((c) => c.querySelector('picture, img')) || cells[0];
  const textCell = cells.find((c) => c !== imageCell && (c.textContent || '').trim())
    || cells.find((c) => c !== imageCell);

  const picture = imageCell ? imageCell.querySelector('picture') : null;

  // Build media + content wrappers.
  const media = document.createElement('div');
  media.className = 'promo-banner-media';
  if (picture) media.append(picture);

  const content = document.createElement('div');
  content.className = 'promo-banner-content';
  if (textCell) {
    while (textCell.firstChild) content.append(textCell.firstChild);
  }

  // Mark the CTA (last link in the content) so CSS can add the arrow. Strip the
  // pipeline's button styling so it renders as a plain text link with arrow.
  const links = [...content.querySelectorAll('a[href]')];
  const cta = links[links.length - 1];
  if (cta) {
    cta.classList.remove('button', 'primary', 'secondary');
    cta.classList.add('promo-banner-cta');
    const wrap = cta.parentElement;
    if (wrap && wrap !== content) {
      wrap.classList.remove('button-container');
      wrap.classList.add('promo-banner-cta-wrap');
    }
  }

  // Preserve editor instrumentation from the content row onto the block.
  moveInstrumentation(contentRow, block);

  block.replaceChildren(media, content);

  // Apply layout mode.
  if (colour) {
    block.classList.add('promo-banner-split');
    block.classList.add(`promo-banner-image-${imageSide}`);
    block.style.setProperty('--promo-banner-color', colour);
    // Auto-contrast text colour (dark panels -> white text, light -> dark).
    block.style.setProperty(
      '--promo-banner-text',
      `oklch(from ${colour} clamp(0, (0.62 - l) * 1000, 1) 0 0)`,
    );
  } else {
    block.classList.add('promo-banner-full');
  }
}
