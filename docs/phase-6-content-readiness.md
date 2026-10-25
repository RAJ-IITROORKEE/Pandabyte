# Phase 6 — content readiness audit

> Historical snapshot at checkpoint `eb2be19`. The separate content chat has since completed its Stage 1 source/image review. The later [offline preflight](phase-6-media-followup.md) reads the actual current archive; its follow-up evidence records 87 image-manifest assets marked passed and 11 preserved unchanged, with owner approval and application mappings still missing. Earlier zero-processed-image and resource-access counts below describe the original audit only; do not treat them as current.

**Checked:** 25 October 2026. **Status:** the local archive is useful source evidence, but it is not ready for a safe application import dry run. No drafts, media, or backend records were created or changed. This is a content/import-readiness finding, not a Phase 6 exit claim.

## What the source counts mean

| Evidence set | Count and meaning |
| --- | --- |
| 23 October public audit | 44 catalog-listed product routes; 43 rendered product bodies and the historical RGB Matrix route returned not found. This is a dated public-site snapshot, not the current archive inventory. See [the audit summary](../current_pandabyte_findings.in#L9) and [the failed route](../current_pandabyte_findings.in#L150). |
| 25 October local archive | 44 products listed, captured, structured, and source-compared. **0/44 owner-approved.** The archive's image gate remains blocked, so Stage 1 is still incomplete. See [archive status](../products/README.md#L3), [coverage](../products/reports/coverage.json#L2), and [source comparison](../products/reports/content-qa.json#L2). |
| Category membership | 45 assignments across 44 unique products: microcontroller 11, sensors 23, shields 3, accessories 6, IoT kits 2, courses 0. One M5Stack Smart Switch is cross-listed in microcontroller and sensors. The one-folder archive totals 44; `products/sensors` therefore has 22 folders. These are membership versus unique-folder counts, not a lost product. [Coverage](../products/reports/coverage.json#L14), [issue note](../products/reports/issues.md#L19). |
| Route discovery | All 44 listing routes are represented. The map also found one extra, map-only M5Stack LoRaWAN-unit candidate that returned 404; it is excluded from the 44 current products. Do not count it as a 45th product. [Coverage](../products/reports/coverage.json#L31), [archive note](../products/README.md#L15). |

The RGB Matrix discrepancy is a route change, not evidence of a 45th product: the October 23 audit records the old `/product-page/pandabyte-rgb-led-matrix-ws2812b-xiao-footprint` route as not found. The October 25 archive captures `/product-page/rgb-led-matrix-ws2812b-xiao-footprint` with SKU `RGB4X4`; the old URL has no implemented redirect. Preserve both source URLs in any later idempotency/redirect review and do not invent a redirect policy. [Current archive note](../products/README.md#L15).

## Archive coverage and limits

The 44 product folders each contain `product.json`, `information.md`, `review.md`, a source transcript, documentation/resource links, and an image manifest. The archive captured 98 distinct original gallery assets (54,564,532 bytes); all were visually classified, 87 were considered eligible for processing, 11 technical/promotional graphics were retained unchanged, and **zero processed images are accepted**. Six pilot edits failed the edge/fidelity review. Original Wix CDN variants are not verified camera masters or rights approval. [Archive README](../products/README.md#L5), [coverage](../products/reports/coverage.json#L49), [image issues](../products/reports/issues.md#L3).

Twelve unique product-linked resource URLs received HEAD checks: nine returned reachable headers and three remain blocked or unverified. **None has content/model/revision relevance verified**, and no PDF or video was downloaded. HEAD success is not evidence that a link is correct for a product. [Archive README](../products/README.md#L8), [resource issues](../products/reports/issues.md#L26).

The archive records scrape-job creation time when using its UUIDv7 timestamp fallback; it does not claim response-completion time. It is public-site capture evidence, not an owner Wix export, private stock record, rights ledger, manufacturer certification, or approval of the displayed price/availability. [Archive schema](../products/tools/schema.md#L29), [archive README](../products/README.md#L17).

## Claims that remain unresolved

The current product-level source comparison records five finding entries: two compatibility conflicts, one unrelated RGB-copy finding, one kit-count reconciliation, and one RGB voltage conflict. The separate structured review covered 132 specification/compatibility/kit-content collections: 2 specification collections are conflicting, 3 compatibility collections are conflicting, and 1 kit-content collection is conflicting. Those report counts have different scopes and should not be added together. Source comparison means the capture was checked against its public source; it does **not** establish engineering truth or owner approval. [Product QA summary](../products/reports/content-qa.json#L5), [structured review](../products/reports/structured-field-review.json#L5), [issue details](../products/reports/issues.md#L9), [review limits](../products/README.md#L13).

Specific carry-forward blockers include:

- x32/xLoRa HAT and NodeMCU HAT Product Info/compatibility wording conflicts; TEMT6000 contains unrelated RGB-module copy.
- RGB LED voltage claims differ between its specifications and description. PandaPulse's “21 Units”/free-module claim does not reconcile cleanly to the itemized list; preserve stated pack/cable units instead of treating every row as a unit.
- MiniScale and RGB LCD wording needs relevance review; BMV080's free-board offer is not approved as current. Thirteen products have “Product Wiki” labels without usable destination URLs.
- AtomS3 Lite and M5Stack Smart Switch have no source SKU. The Smart Switch also has two source category memberships and no owner-approved primary assignment.
- The two missing SKUs leave two products unable to meet the current admin product contract's required `{sku,label}` variant row without owner-provided identifiers or an explicit disposition. No SKU should be invented.

The archive marks all 44 owners as `awaiting-owner-review`; `factualQA: passed` denotes source comparison only. `kitContents.status: not_present` means no separate source claim was extracted, not that an itemized package is authoritatively empty. [Issues](../products/reports/issues.md#L9), [archive schema](../products/tools/schema.md#L34), [coverage](../products/reports/coverage.json#L46).

## Mapping to the existing editorial product contract

The current editor validates `CommonDocument` plus product fields in [lib/admin/validation.ts](../lib/admin/validation.ts#L25). The database publication validator enforces the product document shape and bounds in [the Phase 3 publishing migration](../migrations/20261023212810_phase3-publishing.sql#L458); later storefront code stores/reconciles model numbers separately in [the Phase 4 migration](../migrations/20261024002013_phase4-storefront.sql#L4). The archive's versioned evidence format is intentionally independent of that application schema ([archive schema](../products/tools/schema.md#L1)).

| Archive evidence | Existing app field | Readiness rule |
| --- | --- | --- |
| `identity.title`, captured source route slug | `title`, `slug` | Use only after owner review. The route slug is a source candidate; the corrected RGB Matrix slug needs an explicit legacy URL/redirect mapping. |
| Product-specific reviewed copy/sections | `summary`, allowlisted `blocks` | Convert to supported paragraph, heading, list, code, link, image, or table blocks after review. Do not pass source HTML/Ricos data through as executable or arbitrary rich content. Keep source transcript and evidence separately. |
| `categories.sourceSlugs` / source category records | `categoryIds` (application category UUIDs) | Resolve through an explicit category map. Archive/Wix category identifiers and folder names are not new app IDs; the Smart Switch overlap still needs its primary/secondary mapping. |
| `identity.sku`, observed `variants.items` | `variants: [{sku,label}]` | 42 of 44 product records have a SKU; two do not. The archive's variant IDs are legacy source IDs, not application variant UUIDs. Create app variant identities only in a separately approved import plan. |
| Source-reviewed specs and compatibility | `specifications: [{name,value}]`, `compatibility: string[]` | Import only owner-approved, non-conflicting claims. The app fields do not preserve per-claim evidence/status; keep source URLs, section references, hashes, and unresolved states in a separate import ledger. |
| `kitContents.items` | `kitContents: [{productId?,title,quantity}]` | Map only explicit quantities that are source-reviewed and owner-approved. Resolve optional `productId` through approved app product IDs; do not convert an unitemized/`not_present` source state to a factual empty bill of materials. |
| `resources` | `resources: [{label,url}]` | The app requires a safe HTTPS/internal URL. A reachable HEAD is insufficient; approve the destination and relevance first. Do not use unresolved redirects as substitutes. |
| `product-images/manifest.json` and local files | `mediaIds` | App IDs exist only after acceptable, rights-reviewed assets are uploaded through the authorized media path. Current result is 0 accepted processed images and no application media IDs. Preserve image order/alt text only from approved evidence. |
| `commercialObservations` and public variant observations | Separate price/inventory records, not editorial product fields | Do not import source price/availability as approved price or stock. The app product document does not contain price/quantity; source quantities are expressly observational. Use integer paise and current owner-authorized price/stock reconciliation when separately in scope. |
| `sourceId`, legacy URL/ID, `rawSha256`, evidence pointers | No public product-document field | Retain in a private/local import ledger for idempotency, provenance, and review. Do not reuse source UUIDs as app IDs or display internal IDs. |

## Dry-run finding and next gates

No application import dry run was executed. Read-only search found no existing app importer/dry-run command; `products/tools/validate.py` validates the offline archive contract, not the app's `parseDocument()` plus database RPC and category/media/variant relationships. Building a mapper here would require unresolved SKU/category/media/approval choices and would be a new root-owned implementation, not a truthful run of existing import code. No API, database, storage, or application draft call was made.

Before an app-schema dry run can report a meaningful complete result:

1. Record owner approval/disposition for each of the 44 products and the source claims/media intended for draft use; resolve the named conflicts without silently selecting a value.
2. Obtain/confirm authoritative product/category/variant source export and rights status; provide the two missing SKUs or approve an explicit exclusion/exception.
3. Map category and product relationships to existing or reviewed new app records; accept and upload only approved assets, then resolve resource destinations and media IDs.
4. Prepare a root-owned, no-write mapper/dry-run against the current admin validator and database validation, reporting create/update/skip/error counts and preserving source hashes/legacy URLs. It must not use the public archive as live price/stock authority.

The audit found a stale instruction in [docs/content-inventory.md](content-inventory.md#L34) to retain the former ₹5,000 checkout minimum. Root corrected it to the later owner decision removing that minimum for Razorpay. No commerce data was prepared here.

## Checks performed

- Read the Phase 6 migration scope in [plan.md](../plan.md#L139), current content inventory, October 23 public findings, and the archive plan/reports/schema.
- Read-only inventory of `products/**/product.json`: 44 files; cross-checked category counts, file coverage, image/resource totals, QA counts, approval state, and missing SKU count against the local archive reports.
- Read the app's TypeScript product validator and relevant database validator/migration shape; searched local product/admin tooling for an existing import or dry-run command.
- No source files in `products/` or `product_scrape_plan.md` were modified. No tests, app/API calls, backend reads/writes, uploads, publication, or network crawl were performed for this audit.
