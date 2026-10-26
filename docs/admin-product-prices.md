# Product prices and catalog statistics — 27 October 2026

The owner requested aligned variant inputs, visual text/highlight swatches, mandatory Set/Actual price inputs, importing captured prices from `products/`, and statistical cards above the Products table. This authorization supersedes the earlier Admin source-price prohibition only. The storefront still treats these products as dated, non-purchasable source observations. No stock, publication, checkout, payment or deployment is authorized.

## Price contract

- Set price is the original/list amount; Actual price is the persistent selling amount. Both are required in the product editor, in INR with at most two decimals; storage remains integer paise. Actual cannot exceed Set. Optional scheduled sales cannot exceed Actual and require a bounded time window. Reasons and independent document/price versions remain required for mutations.
- The additive `actual_paise` column retains existing configured base amounts. Legacy seven-argument price writes keep their old semantics (actual equals the supplied regular amount); the explicit eight-argument write supports the new pair and source-only Admin records. Atomic product saves roll back document changes if any price fails. Public source-price masks, inventory guards and cart exclusions remain in force.
- Product publication requires both Set and Actual prices, including source observations, at the database boundary. Legacy APIs can still save incomplete unpublished drafts; the editor requires complete pairs. An unpriced publication attempt is tested only for rejection, with unchanged revision/version. No product is published by this work.
- Migrations `20261026205727_required-product-prices.sql` and `20261026211809_product-publication-price-pair.sql` are development-only, additive and forward-only. Reverting callers must retain the new amounts and audit history; no destructive rollback is performed.

## Captured-price import

`scripts/catalog-price-import.mjs` supports `--plan`, `--apply` and `--verify`. It hashes the original 44-product archive and captured listing/transcript evidence, matches the 42 real SKUs to exact source URL/slug/variant identities, and uses the real development Admin API with the protected owner's existing session. It never creates products. AtomS3 Lite and M5Stack Single Live Wire Smart Switch remain outside CMS because their real SKUs are missing.

All 42 rows must pass preflight before writes begin. Only unconfigured tuples can be imported; exact pairs are skipped and manual/conflicting prices stop the import. A pending ledger precedes each mutation; unknown outcomes cannot be blindly retried. Existing product documents are resent unchanged with version guards. Original archive bytes, media, published revisions and stock are preserved. Reports/ledgers remain ignored under `.bootstrap/admin-price-followup/`.

Three captures contain explicit list/actual pairs: XLORA ₹3,500/₹3,000; PBNEO6M ₹480/₹360; PB-BMV080 ₹8,000/₹6,000. All other captured pairs are equal. These are captured source amounts, not verification of current live offers, tax or availability.

## Statistics

The private capability-gated table response includes global non-archived product totals, unpriced count, category counts and min/mean/max prices. Each priced product contributes its lowest current variant price once; average rounds to integer paise. Unpriced products are excluded from price calculations. Category membership may overlap. Table search, filters, sorting and pagination do not change these global cards. Missing statistics/prices have explicit unavailable/unconfigured states.

The scoped Mono/Geist Mono/Tabler design is retained. Cards reflow at narrow widths, and long category lists scroll within their panel. Variant inputs align at their top edges; color palettes render named, keyboard-accessible swatches rather than hexadecimal menu text. The storefront theme/layout is unchanged.

Verification and final data/import state are recorded in [evidence](verification/admin-product-prices.json), `docs/phase-progress.md` and `ui-migrate-handoff.md`. No live offer/stock verification, commerce, content publication, deployment, email/billing, load test or recovery operation is included.
