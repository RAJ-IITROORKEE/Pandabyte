# Catalog source integration contract

This document records the bounded local-development workflow for the 44-product archive. It is a contract and usage note, not evidence that records or media were imported, published, or fully verified. The detailed source and implementation prompt is [catalog-44-integration.md](prompts/catalog-44-integration.md).

## Scope and commands

The archive remains the read-only source of truth for captured product facts. Integration is restricted to the verified development application and its development InsForge project. The integration script checks the configured project, Clerk development identity, active owner session, and required Admin capabilities before it calls the local Admin API. Never point it at production or infer environment from a project label.

1. Run `npm run check:import` for the offline, read-only archive preflight. It is not an application/database dry run or importer. A blocked archive can exit 2; that reports readiness blockers, not a scanning failure.
2. Prepare the three accepted PNG inputs that exceed the 4 MiB upload limit by running `node --conditions=react-server scripts/catalog-prepare-media.mjs`. This creates owner-approved smaller WebP copies outside the archive; it does not replace or rewrite the archived PNGs.
3. With the verified local app running and the authorized Admin session available, run `node --env-file=.env.local scripts/catalog-integrate.mjs --dry-run` to inspect application mappings. This mode reads through Admin APIs and reports planned work; it does not upload, create, update, or publish.
4. Use `node --env-file=.env.local scripts/catalog-integrate.mjs --apply` only within the authorized local-development scope. It uploads through existing Admin media controls, then creates or updates and publishes eligible development records through existing role/version guarded APIs. Preserve its reports and inspect any stopped or ambiguous result before continuing.

The script uses stable archive `sourceId` values and relative folders as source identity; source UUIDs are not application IDs. It verifies current product and manifest JSON fingerprints, manifest-selected original/output paths and hashes, review status, alt-text evidence, gallery order, and bounded sizes. It resolves source categories to actual application category records. Resources remain excluded unless HTTPS, exact destination, reachability evidence, and product relevance checks agree. Unsupported media above the current 4 MiB upload boundary stays held; do not raise limits to force it through.

## Product and price dispositions

The current plan accounts for 44 products: 42 potential CMS candidates and two held outside the CMS because AtomS3 Lite and M5Stack Single Live Wire Smart Switch have no source SKU. The application requires a real `{sku, label}` variant during both save and publication. Do not fabricate a SKU, reuse an archive/Wix variant ID, or submit an empty variant. This hold does not mean the two archive entries were imported.

Source prices are dated observations only. The internal provenance record retains the source price observations, listing text, source URL, capture timestamp and its provenance caveat, raw source hash, and review issues. The product document can expose only the selected formatted price text, capture time, and source URL. The UI labels it **“Source observation · not a current offer”** and explains that capture timing is unverified and may reflect scrape-job start. It does not turn that text into operational price or stock.

Keep operational variant prices and availability unset. Records carrying a source observation are exposed as non-purchasable; the product detail panel disables purchase controls. Never use observations to enable cart or checkout, infer tax/HSN, sale, discounts, shipping, stock, or current availability. A `not_present` kit-content finding means no separate claim was observed, not an empty shipment or quantity zero. Keep conflicting and unresolved claims in staff review rather than public factual fields.

## Media and archive preservation

Only manifest-selected files whose exact bytes and current review evidence pass the source map are candidates. Preserve manifest gallery order and evidence-based alt text. The upload route re-encodes PNG, JPEG, and WebP as lossy WebP at quality 90; the media delivery route returns validated stored bytes unchanged. That protects the stored normalized output from another lossy encode, but it does not make uploaded files byte-identical to archive PNGs or establish rights/engineering certification.

The three accepted PNG inputs above the upload limit remain PNGs in the archive. The approved smaller WebP copies are prepared outside it, with their own hashes, for the authorized upload path. They are working copies, not archive replacements. Do not modify or stage anything under `products/`, `.firecrawl/`, `.superdesign/`, design-delivery records, or unrelated generated media. The source archive must remain exact.

No 3D work is part of this integration: ignore any product `3d/` subdirectories and do not add model viewers, CAD assets, Three.js, or GLB/GLTF handling. Recovery remains deferred: do not create, export, copy, or restore backups or provision a recovery target. Commerce remains outside scope: no pricing setup, cart/order placement, payments, checkout, billing changes, or live email.

## Provenance, reruns, and failure handling

The integration ledger and preparation/report files live under ignored `.bootstrap/catalog-import/`. The ledger contains internal application IDs, fingerprints, source mappings, and provenance; keep it local and private, never commit it or expose internal IDs in public UI/logs. The committed source map and state helpers are the reviewable logic; the ignored ledger is runtime state, not the archive.

Before a product create or media upload, the script records a pending marker. A retry after an unknown media-upload outcome fails closed and requires reconciliation; it does not blindly upload again. A pending product create may be reconciled only when the existing record at the expected slug exactly matches the expected document. Any collision or ambiguous result stops for review.

For a created or updated product, the ledger records `awaitingPublication` before the guarded publish call. If that response is lost, a rerun compares the expected source/document fingerprint, version, and published revision: it retries publish only when the same draft is still present, or records publication as confirmed when the matching published revision is visible. Other state changes are reported as Admin edits or stop as conflicts; they are not overwritten. Media publication uses its own expected-version guard; if its outcome is uncertain, reconcile the Admin media record before retrying. Do not re-upload, delete a pending marker, or repeat a request until the development Admin state is reconciled.

Tracked records include the application ID, expected version, published revision, document fingerprint, and source fingerprint. A version, document, archive, or publication change is detected. If the document/version/revision shows an Admin edit, the importer preserves it and reports `admin-edited`; source changes against an importer-owned record require the guarded update path. Expected-version checks protect concurrent edits. On conflict, stop and reconcile instead of overwriting staff work. A rerun with unchanged source and importer-owned application state should be a no-op; confirm that with the actual report before claiming it.

## UI treatment

The catalog call-to-action uses a small CSS-only shimmer on hover and keyboard focus. It is inspired by [Aceternity UI’s Tailwind CSS Buttons](https://ui.aceternity.com/components/tailwindcss-buttons); consult the [official license](https://ui.aceternity.com/licence) for licensing terms. This attribution does not claim MIT licensing. The effect adds no Aceternity Pro asset, Motion package, or animation dependency, and reduced-motion preferences disable it.

Portrait photographs use a fixed contain frame so their intrinsic height cannot clip the product. Admin media selectors load bounded pages on request and retain assigned assets while later pages load; an unloaded current selection has a human-readable fallback. No visible raw identifier is needed to edit an assignment.

## Verification and safe withdrawal

After a complete integration, run `npm run test:catalog-import` for read-only reconciliation against the ledger, source hashes, public documents, gallery order, unconfigured operational values and exact public stored-media bytes. It refuses an incomplete ledger. Use a no-op `--apply` rerun to verify idempotency; retain and review any `admin-edited` disposition instead of replacing staff edits.

To withdraw a development record, use the existing version-guarded Admin unpublish/archive controls. Do not reverse the schema migration while source-observation documents depend on it. A schema rollback would require a separately reviewed forward migration that safely withdraws affected records first; no database reset, backup or restore is part of this workflow.

## Evidence still required

This document alone does not establish that a preflight, dry run, apply, upload, publication, rerun, or browser check passed. Record actual command results and reconciliation counts in the authorized progress/evidence documents only after those actions have occurred. Keep the two SKU holds, unresolved source claims/resources, owner review status, and development-only scope explicit in that evidence.
