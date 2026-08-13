/* eslint-disable */
/* global WebImporter */

/**
 * Transformer: albertsons site-wide cleanup.
 *
 * Scope note: the import script passes `document.body` as `element` and returns
 * the whole body as the import root. Only the authorable page content lives in
 * `<main class="main-wrapper www-wrapper nextgen-main-wrapper">` (verified in
 * migration-work/cleaned.html: <main> is a direct child of <body>, and every
 * authored section — hero carousel + product-card rails — sits inside it).
 * Everything else on the page is site shell / chrome that dedicated header and
 * footer migration workflows own, or non-authorable widgets and 3rd-party ad
 * slots. This transformer strips all of that so the markdown output contains
 * only what an author would create when authoring the homepage.
 *
 * ALL selectors below were verified against migration-work/cleaned.html — none
 * are guessed. Source class/id strings are documented inline next to each entry.
 */

const TransformHook = { beforeTransform: 'beforeTransform', afterTransform: 'afterTransform' };

// Non-authorable siblings of <main> and in-<main> widgets/ads to remove.
// Every selector was confirmed present in migration-work/cleaned.html.
const NON_AUTHORABLE_SELECTORS = [
  // --- Multi-tier HEADER (handled by the header migration workflow) ---
  // cleaned.html: <div class="unified-header unified-header--sticky-enabled header-version-4">
  '.unified-header',

  // --- FOOTER (handled by the footer migration workflow) ---
  // cleaned.html: <div class="unified-footer-v2 unified-footer aem-GridColumn ...">
  '.unified-footer-v2',
  // cleaned.html: <footer class="body-wrapper-footer ">
  'footer.body-wrapper-footer',
  // cleaned.html: <nav ... id="footerNav"> (footer navigation region)
  '#footerNav',

  // --- Cookie consent (OneTrust) ---
  // cleaned.html: <div id="onetrust-consent-sdk"> plus banner/pc chrome
  '#onetrust-consent-sdk',
  '#onetrust-banner-sdk',
  '.onetrust-pc-dark-filter',

  // --- Modals / overlays / interstitials (non-authorable app chrome) ---
  // cleaned.html: <div class="store-fulfillment-modal aem-GridColumn ...">
  '.store-fulfillment-modal',
  // cleaned.html: <div class="abs-modal-popup aem-GridColumn ...">
  '.abs-modal-popup',
  // cleaned.html: <div class="modal fade splash-modal modal-window">
  '.splash-modal',
  // cleaned.html: <div class="toast-alert aem-GridColumn ...">
  '.toast-alert',
  // cleaned.html: <div class="pds-survey survey-wrapper">
  '.pds-survey',
  // cleaned.html: <div class="progressive-profile parbase aem-GridColumn ...">
  //           and <div class="progressive-profile-v2-proxy progressive-profile ...">
  '.progressive-profile',

  // --- Sponsored 3rd-party ad slots that render INSIDE <main> ---
  // cleaned.html (inside main): <div id="gamcontainer_92967" class="ab-lazy-function">
  //   wrapping <div id="google_ads_iframe_/22389494054/albertsons/home/...__container__">
  //   with a safeframe.googlesyndication.com <iframe>. Six gamcontainer_* slots
  //   plus a hidden gam-ad-container. Strip the whole slot, not just the iframe.
  '[id^="gamcontainer_"]',
  '.gam-ad-container',
  '[id^="google_ads_iframe_"]',
];

export default function transform(hookName, element, payload) {
  if (hookName === TransformHook.beforeTransform) {
    // Primary isolation: only <main> is authorable (see scope note above). The
    // header (body > div:nth-of-type(1)), footer XF + modals (body > div:nth-of-type(2)),
    // OneTrust SDK, and #apps-flyer-wrapper are all direct siblings of <main>.
    // Class-based removal is brittle on this SPA because the live-import DOM can
    // hydrate different wrapper classes than the captured cleaned.html. Removing
    // every direct body child that is NOT <main> is structure-based and robust,
    // and it preserves <main> in place so the body-rooted block selectors
    // (`body > main.main-wrapper > ...`) still resolve for the parsers.
    const doc = element.ownerDocument;
    const body = doc.body || element;
    const main = body.querySelector('main');
    if (main) {
      [...body.children].forEach((child) => {
        if (child !== main && !main.contains(child)) child.remove();
      });
    }

    // Belt-and-suspenders: remove overlay/interstitial chrome and the cookie
    // consent SDK in case any of them render inside <main>. Selectors verified
    // in cleaned.html.
    WebImporter.DOMUtils.remove(element, [
      '#onetrust-consent-sdk',
      '#onetrust-banner-sdk',
      '.onetrust-pc-dark-filter',
      '.store-fulfillment-modal',
      '.abs-modal-popup',
      '.splash-modal',
      '.toast-alert',
      '.pds-survey',
      '.progressive-profile',
    ]);
  }

  if (hookName === TransformHook.afterTransform) {
    // Final cleanup: strip all non-authorable content (header, footer, remaining
    // modal/widget chrome, in-main sponsored ad slots). Parsers have already run
    // and extracted the hero carousel and product-card rails into block tables,
    // so removing everything else here leaves only authorable content.
    WebImporter.DOMUtils.remove(element, NON_AUTHORABLE_SELECTORS);

    // Remove leftover non-authorable / non-content elements. `iframe` covers the
    // remaining tracking/ad iframes (safeframe, doubleclick, clinch) that sit
    // outside <main>; these never carry authorable content. Counts verified in
    // cleaned.html.
    WebImporter.DOMUtils.remove(element, ['iframe']);

    // Attribute cleanup: strip event handlers and analytics/tracking hooks that
    // are meaningless in authored content. Only removes attributes that exist in
    // the source DOM; harmless no-op where absent.
    element.querySelectorAll('*').forEach((el) => {
      el.removeAttribute('onclick');
      el.removeAttribute('onload');
      el.removeAttribute('data-track');
      el.removeAttribute('data-analytics');
    });

    // Strip HTML comment nodes. The Albertsons product rails are Angular-rendered
    // and leave hundreds of empty `<!---->` placeholder comments in the DOM; they
    // carry no authorable content and only clutter the generated markup.
    const doc = element.ownerDocument;
    const walker = doc.createTreeWalker(element, 0x80 /* NodeFilter.SHOW_COMMENT */);
    const comments = [];
    let node = walker.nextNode();
    while (node) {
      comments.push(node);
      node = walker.nextNode();
    }
    comments.forEach((c) => c.remove());
  }
}
