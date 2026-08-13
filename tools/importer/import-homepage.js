/* eslint-disable */
/* global WebImporter */

// PARSER IMPORTS
import carouselPromoParser from './parsers/carousel-promo.js';
import cardsProductParser from './parsers/cards-product.js';

// TRANSFORMER IMPORTS
import cleanupTransformer from './transformers/albertsons-cleanup.js';
import sectionsTransformer from './transformers/albertsons-sections.js';
import dmImagesTransformer from './transformers/albertsons-dm-images.js';

// PARSER REGISTRY
const parsers = {
  'carousel-promo': carouselPromoParser,
  'cards-product': cardsProductParser,
};

// PAGE TEMPLATE CONFIGURATION - Embedded from page-templates.json
const PAGE_TEMPLATE = {
  name: 'homepage',
  description: 'Albertsons grocery homepage: hero promotional carousel and featured items / sponsored product carousels within <main>. Header and footer are handled by dedicated workflows.',
  urls: [
    'https://www.albertsons.com/',
  ],
  blocks: [
    {
      name: 'carousel-promo',
      instances: [
        'body > main.main-wrapper > div.full-bleed-container > div.full-bleed-row > div.marker-component:nth-of-type(1)',
      ],
    },
    {
      name: 'cards-product',
      instances: [
        'body > main.main-wrapper > div.full-bleed-container > div.full-bleed-row > div.master-product-carousel.section.static-carousel',
      ],
    },
  ],
  sections: [
    {
      id: 'rc-hero',
      name: 'section-hero',
      selector: [
        'body > main.main-wrapper > div.full-bleed-container > div.full-bleed-row > div.marker-component:nth-of-type(1)',
      ],
      style: null,
      blocks: ['carousel-promo'],
      defaultContent: [],
    },
    {
      id: 'rc-featured',
      name: 'section-featured',
      selector: [
        'body > main.main-wrapper > div.full-bleed-container > div.full-bleed-row > div.master-product-carousel.section.static-carousel',
      ],
      style: 'grey',
      blocks: ['cards-product'],
      defaultContent: [],
    },
  ],
};

// TRANSFORMER REGISTRY
// cleanup handles both beforeTransform and afterTransform; sections and
// dm-images run only in afterTransform. Section transformer runs after
// cleanup and only when the template has 2+ sections.
const transformers = [
  cleanupTransformer,
  ...(PAGE_TEMPLATE.sections && PAGE_TEMPLATE.sections.length > 1 ? [sectionsTransformer] : []),
  dmImagesTransformer,
];

/**
 * Execute all page transformers for a specific hook.
 * @param {string} hookName - 'beforeTransform' or 'afterTransform'
 * @param {Element} element - The DOM element to transform (document.body)
 * @param {Object} payload - { document, url, html, params }
 */
function executeTransformers(hookName, element, payload) {
  const enhancedPayload = {
    ...payload,
    template: PAGE_TEMPLATE,
  };

  transformers.forEach((transformerFn) => {
    try {
      transformerFn.call(null, hookName, element, enhancedPayload);
    } catch (e) {
      console.error(`Transformer failed at ${hookName}:`, e);
    }
  });
}

/**
 * Find all blocks on the page based on the embedded template configuration.
 * @param {Document} document
 * @param {Object} template - The embedded PAGE_TEMPLATE object
 * @returns {Array} Array of block instances found on the page
 */
function findBlocksOnPage(document, template) {
  const pageBlocks = [];

  template.blocks.forEach((blockDef) => {
    blockDef.instances.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      if (elements.length === 0) {
        console.warn(`Block "${blockDef.name}" selector not found: ${selector}`);
      }
      elements.forEach((element) => {
        pageBlocks.push({
          name: blockDef.name,
          selector,
          element,
          section: blockDef.section || null,
        });
      });
    });
  });

  console.log(`Found ${pageBlocks.length} block instances on page`);
  return pageBlocks;
}

// EXPORT DEFAULT CONFIGURATION
export default {
  transform: (payload) => {
    const {
      document, url, html, params,
    } = payload;

    const main = document.body;

    // 1. beforeTransform (initial cleanup)
    executeTransformers('beforeTransform', main, payload);

    // 2. Find blocks on page using embedded template
    const pageBlocks = findBlocksOnPage(document, PAGE_TEMPLATE);

    // 3. Parse each block using registered parsers
    pageBlocks.forEach((block) => {
      if (!block.element.parentNode) return; // Already replaced by earlier parser
      const parser = parsers[block.name];
      if (parser) {
        try {
          parser(block.element, { document, url, params });
        } catch (e) {
          console.error(`Failed to parse ${block.name} (${block.selector}):`, e);
        }
      } else {
        console.warn(`No parser found for block: ${block.name}`);
      }
    });

    // 4. afterTransform (final cleanup + section breaks/metadata + DM image anchors)
    executeTransformers('afterTransform', main, payload);

    // 5. WebImporter built-in rules
    const hr = document.createElement('hr');
    main.appendChild(hr);
    WebImporter.rules.createMetadata(main, document);
    WebImporter.rules.transformBackgroundImages(main, document);
    WebImporter.rules.adjustImageUrls(main, url, params.originalURL);

    // 6. Generate sanitized path. Map the root/homepage URL to `/index`.
    const rawPath = new URL(params.originalURL).pathname
      .replace(/\/$/, '')
      .replace(/\.html?$/, '');
    const path = WebImporter.FileUtils.sanitizePath(rawPath === '' ? '/index' : rawPath);

    return [{
      element: main,
      path,
      report: {
        title: document.title,
        template: PAGE_TEMPLATE.name,
        blocks: pageBlocks.map((b) => b.name),
      },
    }];
  },
};
