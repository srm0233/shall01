# Handover — Albertsons Homepage (shall01 / srm0233)

**Live:** https://main--shall01--srm0233.aem.live/albertsons-home/
**Preview:** https://main--shall01--srm0233.aem.page/albertsons-home/
**Stack:** AEM Edge Delivery Services (Document Authoring); Experience Workspace authoring.
**Last updated:** 2026-08-17

> Scratch artifacts (cleaned HTML, screenshots, downloaded images, the original
> step-by-step `migration-plan.md`) live in `migration-work/`, which is
> git-ignored. This file is the durable, tracked handover.

---

## 1. Overview

The Albertsons homepage was migrated to a self-contained Document Authoring site
section `albertsons-home` (page + nav + footer + images), then refreshed to match
albertsons.com with a set of reusable `cards` variants, a bento hero, and global
layout/editor fixes. Content is served at the **folder URL** `/albertsons-home/`
(not `/albertsons-home/index`).

- **Content source of truth:** Document Authoring (DA). Repo `content/` is
  git-ignored; edit content in DA, not the repo.
- **Code:** deploys from `main` via the AEM code bus.

---

## 2. Site structure (DA)

- `/albertsons-home/` — homepage (page metadata points nav→`/albertsons-home/nav`,
  footer→`/albertsons-home/footer`).
- `/albertsons-home/nav`, `/albertsons-home/footer` — header/footer fragments.
- `/albertsons-home/images/albertsons-logo.png` — logo.
- `docs/library/blocks/*` — DA block library (includes a `carousel-promo` entry
  with color variants, listed in `blocks.json`).

Design system: `styles/brand.css` (Poppins headings, Nunito Sans body,
`--brand-blue: #04a`, `--brand-ink: #2a2928`), fonts in `head.html`.

---

## 3. Blocks

### 3.1 `blocks/cards` — one block, seven variants
Author picks a variant via the block's "Variant" option (or block-name token in
DA). Each card row preserves UE instrumentation via `moveInstrumentation`.

| Variant | Class | Used for | Notes |
|---|---|---|---|
| Default | `cards` | generic | image + body |
| Links | `cards links` | link lists | resolves query-index |
| Product | `cards product` | Lean proteins, Salad essentials, Top picks, Beverages | "Sign in to add" pill, price + struck original, SNAP, Bestseller, arrows |
| Category | `cards category` | Shop by category | 2×8 grid + "View More" toggle |
| Recipe | `cards recipe` | Sheet pan classics, Easy breakfast | hero photo + 2×2 ingredient thumbs + title/arrow |
| Recipe B | `cards recipe-b` | Breakfast champions | photo + "N servings" badge + "Est $X / serving" |
| Feature | `cards feature` | What's in season | ≤4 image+caption cards; last widens if <4 |
| Coupon | `cards coupon` | Coupons & deals (sample) | badge, title, desc, Offer Details, Clip Coupon pill, expiry |

Variant gotchas:
- **Product price** is doubled in the source content; the decorator dedupes it.
- **Product/category images** are DM (`$grid-product-card$`) rendered ~2000px
  wide; tiles use `object-fit: cover` (not `contain`, which letterboxed).
- **Recipe hero** photos are mealime CDN `<img>` (localized by DA on publish);
  ingredient thumbs are Scene7 — classified by URL so it works before/after the
  DM auto-block runs.

### 3.2 `blocks/carousel-promo` — bento hero
- Rotating hero carousel (left ~2/3) + stacked promo rail (right ~1/3).
- **Per-slide panel colour:** add a hex/`rgb()` line (or `Color: <value>`) to a
  slide → that slide renders a 50/50 **colour panel + image split** with
  auto-contrast text and a matching arrow pill. **A slide with no colour renders
  a full-width image** (no half-panel). A block-level colour (preset variant
  class or the "Default panel color (fallback)" option) applies only to slides
  without their own. Drives `--promo-panel-color` / `-dark` / `-text`.
- Promo rail cards show the full-bleed banner art with heading + CTA overlaid
  (peach card's "Shop now" forced white).
- Slide dots removed; paired bottom-left arrows kept.
- No dark text-over-image shadow (solid split panel instead).

---

## 4. Global styles / layout

- **White background:** `body` background overridden to solid `#fff` (theme's
  warm gold/rust radial gradients removed).
- **Non-sticky header:** nav-wrapper `position: static` (was `fixed`); `header`
  uses `min-height`. Fixes the desktop two-row header (~142px) overlapping content.
- **Section spacers:** `spacer-top/bottom-{s,m,l}` (Section Style Utils) rescoped
  to authored sections at higher specificity so they add visible padding
  (top-m = 32+16 = 48px).

---

## 5. Authoring / editor

- **Primary authoring surface: Experience Workspace / Document Authoring** —
  blocks are edited via the **content source (block tables)**, not an in-canvas
  properties dialog. In-page dialog authoring is a Universal-Editor-only feature
  and is not available here.
- Universal Editor support IS wired for the case where the project is opened in
  UE: `component-{definition,models,filters}.json` (built from `ue/models/*` via
  `npm run build:json`), per-variant cards options, a `carousel-promo` model, and
  a MutationObserver in `ue/scripts/ue.js` that re-instruments variant cards and
  hero slides after decoration.

---

## 6. Build & deploy

- **Code:** `main` → AEM code bus → aem.page (preview) / aem.live (live). Allow a
  few minutes after push; spot-check with `curl --compressed` (gzipped). A stalled
  code-bus sync can be nudged with a trivial commit.
- **Content:** `POST admin.da.live/source/{org}/{repo}/{path}.html`, then
  `POST admin.hlx.page/preview|live/{org}/{repo}/main/{path}`.
- **Lint:** `npm run lint` (ESLint airbnb + Stylelint standard) must pass.
- After editing UE models, run `npm run build:json` to regenerate the root
  `component-*.json`.

---

## 7. Delivery / git

- Homepage refresh delivered as **PR #1** (`albertsons-homepage-refresh` → `main`,
  merged). All work is on `main` and live.
- Original migration commits: `087cc83` and the `carousel-promo`/`cards` series.

---

## 8. Known limitations / follow-ups

- In-page dialog authoring of blocks is unavailable in Experience Workspace (see
  §5). Authors edit block content in the DA source.
- The rich card variants (product/recipe/coupon) render styled sub-elements that
  don't all round-trip cleanly as individual editable fields; block-level and
  simple fields (image, primary text) are the reliable edit points.
- Some non-product rails (bundle collections, recipe-link lists) are left as-is
  where they don't map to a card variant.
