# Phase 6 — frontend, accessibility, and performance source review

25 October 2026. Source-only review of the selected Home v26, shared navigation, interactive circuit, FAQ/video pattern, catalog/editorial image components, and representative account/Admin shell behavior. The review followed the Phase 6 contract and the UI/UX Pro Max accessibility guidance. It did not edit application code or claim browser, assistive-technology, contrast, or performance measurements.

## Findings

### P2 — Public media requests repeat full image processing and bypass response caching

`app/api/media/[id]/route.ts:17-24,37-49` resolves the media record, downloads the stored object, calls `prepareEditorialFile`, and rechecks publication state on each successful public image request. `lib/editorial/media.ts:13-20` decodes supported images with Sharp and writes a WebP result; the upload path already normalizes images to WebP. The shared `editorialHeaders` in `lib/editorial/http.ts:7` returns `Cache-Control: private, no-store` for this route, including published media.

Public image components also opt out of Next's image optimizer: `components/catalog/product-card.tsx:34-40`, `components/catalog/product-gallery.tsx:16-35`, and `components/published-document.tsx:12,23`. `sizes` does not produce smaller responsive downloads while these images are unoptimized. The media validator permits images up to 4 MiB and 20 megapixels (`lib/editorial/validation.ts:2`; `lib/editorial/media.ts:14,17`), so image-heavy pages can repeat substantial storage, database, and CPU work.

This was a source-level performance risk, not a measured browser-latency finding. The later [media follow-up](phase-6-media-followup.md) removes per-read encoding while keeping validation, publication withdrawal checks and private no-store responses. A shared cache/optimizer remains a separate withdrawal/security decision; no such cache was added. Gateway/storage reads, native decoding and original-size downloads still have costs that need representative measurement.

### P3 — Circuit live region announces a “selection cleared” message on initial render

The baseline effect scheduled `announcementFor(active)` on mount while `active` was initially `null`; `announcementFor(null)` returns “Selection cleared…”. This could produce an unsolicited screen-reader announcement on page load before a user interacts with the circuit. Root added a ref guard so the region stays empty until a device/cable becomes active, while subsequent clear announcements remain. Browser DOM/state checks cover this behavior; real screen-reader confirmation remains pending.

### Measurement constraint — Every route is forced dynamic

`app/layout.tsx:13-14` sets `dynamic = "force-dynamic"` for the entire app, with the comment that publication and private identity require request-time data. This is an intentional current architecture choice, not by itself a defect. It means public pages cannot rely on full-route static prerendering; record the localhost timing/body baseline and measure production-like TTFB/cache behavior before making performance claims or changing the rendering boundary.

## Reviewed strengths and coverage limits

- The selected landing implementation has source-level keyboard paths for circuit controls and a persistent keyboard-operable logo-animation pause control; v26 also has explicit reduced-motion rules for the marquee, entrance effects, and circuit effects (`components/home-circuit.tsx:265-317`; `components/home-circuit.module.css:343-356`; `components/home-brands.tsx:13-25`; `components/home.module.css:126-134`). Prior landing evidence records keyboard interaction checks but says reduced-motion preference emulation was unavailable (`docs/verification/landing-v26.json`).
- The shared navigation uses native links/buttons/details, exposes expanded state and focus styling, and has an Escape path; the account menu has a button trigger and close-on-Escape (`components/site-header.tsx:111-194,219-267`; `components/site-header.css:436-439`; `components/account-menu.tsx:43-62,89-103`). The representative Admin mobile navigation already implements focus entry/containment and restoration (`components/admin/admin-shell.tsx:127-168`). These are source observations, not fresh keyboard certification.
- FAQ answers use native `details`/`summary`; the YouTube iframe is added only after an explicit Play action (`components/storefront/faq-list.tsx:5-12`; `components/editorial/video-player.tsx:14-33`).
- `package.json` has no dedicated Lighthouse/Web Vitals or automated accessibility audit command. The current `test:readiness` script is a bounded sequential localhost HTML timing/body probe, not an accessibility or performance certification. `axe-core` appears transitively in the lockfile, which does not establish that an app audit is configured.

## Not checked

No browser interaction, screen reader, keyboard-only journey, OS reduced-motion emulation, automated contrast scan, Lighthouse/Web Vitals run, image-network measurement, production cache/TTFB check, or exhaustive audit of all Admin/account forms was performed in this source review. Root owns the built-in-browser checks and the bounded local readiness probe. No claim of Phase 6 exit or production readiness follows from this document.
