# Phase 6 — populated-site performance and accessibility review

Authorized 26 October 2026 after catalog commit `b531ee8`, with bounded Luna xhigh review/implementation, built-in-browser verification, fixes and a local commit. The user journey is current published catalog → filtered results → authorized image delivery → keyboard-operable product detail, with readable Admin validation and account controls. Preserve the selected design, existing content, owner session and all other-chat artifacts.

Checkout, payments, orders, load tests, deployment, billing, live email, recovery provisioning and backup/export/restore remain deferred. This checkpoint is not the full Phase 6 exit or production approval.

## Concrete changes

- URL changes reset uncontrolled search/filter inputs from the current query. Only the input/filter subtrees remount; results and the Reset all link retain their identity. This avoids stale checkboxes and preserves reset-link keyboard focus.
- Product-card links have a concise “View product: [title]” name. Their image is decorative within that already-named destination; main gallery photos retain descriptive alt text. Visible source-price caveats remain unchanged.
- Gallery thumbnails request a 96px bounding-box preview; cards request 960px. The full gallery and other original-media callers retain the original URL and bytes. Gallery preload uses the installed Next.js API.
- Admin validation focuses an alert summary with human field names. Relation pickers have named groups and polite loading/error status; selected media exposes pressed state and focuses its detail heading. Refreshing the same selected item does not move focus again.
- Address form/confirmation closure returns focus to its initiating control, or a stable Add/editor control after deletion. Error and warning text now adapts to the light/dark surfaces.

## Image boundary

`/api/media/:id` is unchanged by default. Optional `w=96` and `w=960` are the only sizes; empty, repeated and unsupported values are rejected. A size option on a PDF is rejected. No arbitrary quality, format, external URL, upload, database or storage mutation is introduced.

The route retains the public-or-authorized-editor lookup, canonical storage key, size/container/metadata/pixel validation, and final public-visibility recheck. Resizing happens only after validation, fits inside the requested square without enlargement, preserves transparency and strips metadata. Existing small images can return their original bytes. Every response stays private/no-store; no Next image-optimizer/CDN/shared cache can retain withdrawn content through this change. Customer-private file routes are untouched.

The bandwidth benefit has a CPU cost: native resize/encode adds processing. The local pass over the same 96 prepared images measured:

| Representation | Output bytes across the corpus | Reduction | Summed processing time |
| --- | ---: | ---: | ---: |
| Validated original | 10,554,386 | — | 16.664s |
| 96px preview | 198,168 | 98.12% | 18.330s |
| 960px preview | 4,156,650 | 60.62% | 35.845s |

These are aggregate representation sizes, not a page's transfer total. File reads were excluded from the sequential processing times. No inference about throughput or 100 simultaneous visitors follows.

## Verification boundary

The read-only `node tests/phase6-populated-probe.mjs --derivatives` command samples six fixed localhost pages twice and smallest/median/largest prepared images in original/96/960 forms twice. Two catalog-count guards require the clean 42-product dataset. This is 32 sequential GETs, not a load test. Reports contain body sizes and header/body elapsed time, no response/customer bodies or raw media/session IDs.

The built-in browser verifies real filter transitions, concise names, gallery selection/decoding, responsive containment, keyboard focus, both themes and Admin/account controls. Its supported read-only page scope does not expose the browser Performance API; no LCP/CLS/INP, browser network waterfall, Lighthouse score or field Web Vitals are claimed. HTTP samples are sparse, unthrottled local observations with remote development-backend costs; they are not percentiles or a controlled timing improvement claim.

Real publishing/media regression checks cover private/customer denial, allowed editor previews, public delivery, bad/repeated sizes, and withdrawal/archive denial for both derivatives while retaining original-byte equality. Other publishing/storefront fixtures are ownership-checked and cleaned. Source catalog readback verifies all 42 records and all 96 original stored-byte deliveries.

Address Add/Cancel is exercised without changing the owner's saved data. Save/delete focus branches are source-reviewed; a destructive UI action on real addresses is not claimed. Reduced-motion CSS is reviewed; runtime preference emulation and a real screen-reader audit remain unverified. Production provider settings, content/rights review, capacity budget/measurements and recovery remain release gates. See [recorded evidence](verification/phase-6-populated-review.json) for actual results.
