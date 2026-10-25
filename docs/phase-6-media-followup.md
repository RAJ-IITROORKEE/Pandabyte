# Phase 6 — original-byte media delivery

Continued after readiness commit `eb2be19` on 25 October 2026. The owner resumed remaining Phase 6 work. This checkpoint fixes repeated image conversion, adds an offline archive preflight and repeats relevant access/browser verification. Checkout/payments, live email, billing and production deployment remain deferred.

## Image change

Uploads still pass through the existing Sharp normalizer, strip metadata and store WebP. Downloads now validate the stored bytes and return them unchanged instead of lossily encoding the image again. This preserves source quality and removes the per-read encoder work. It does not add a shared cache, Next image optimization, a public storage bucket or a new storage credential.

The existing upload encoder still uses lossy WebP quality 90. Preserving stored download bytes avoids an additional generation of loss; it does not extend the offline archive's exact-pixel provenance to uploaded output. Review the normalized published candidate before approving product-image fidelity.

The server route retains canonical UUID/key checks, bounded exact downloaded/registered byte size, staff capability fallback for drafts, the public publication recheck after download, private `no-store` and `nosniff`. It additionally matches the key extension to the validated MIME type. The delivery validator requires a static WebP with bounded matching dimensions, an exact RIFF length and an allowlist of image chunks; metadata, animation, unknown chunks and trailing data are rejected. Sharp metadata alone is insufficient: `stats()` forces pixel decoding and rejects tested truncated compressed content without returning a large raw pixel Buffer to JavaScript. Native decoding still consumes CPU/memory; the existing 20MP/4MiB limits are not a concurrency guarantee.

PDFs keep the bounded signature check and attachment disposition, with exact byte-size and null image dimensions. This is not PDF sanitization, malware scanning or proof that every PDF is safe. Upload validation, private-media access, publication and withdrawal behavior remain security boundaries.

Focused tests use generated lossy/alpha/lossless/animated/metadata-bearing/truncated fixtures and assert byte-for-byte preservation. The real publishing regression additionally compares both staff and public delivery with stored normalized bytes and checks withdrawal/archive denial. No actual product photograph or customer upload is used in the CPU experiment.

## Offline preflight

`npm run check:import` is a **read-only archive preflight**, not an importer or complete application/database dry run. It scans bounded local source JSON and image manifests, fingerprints the exact files, reports review/mapping/resource/conflict blockers and checks title/slug shape using the actual application validator. It does not convert descriptions/specifications, infer variants, supply dummy app IDs, accept observed prices/stock, upload assets, create drafts or publish records. Valid title/slug shape does not establish complete document validity, referential integrity, rights or owner approval.

Exit 2 means a readable archive remains blocked; exit 1 means input/scanning failure. Current archive counts can change as the separate content chat works. Manifest image statuses and embedded capture hashes are claims in that source archive, not independent image-byte verification or a mapping into application media IDs. Preserve and review the exact fingerprints before any later mapper/import.

See [capacity profile](phase-6-capacity-profile.md), [access review](phase-6-access-followup.md), [recovery plan](phase-6-recovery.md) and phase progress for actual results. Recovery targets remain undecided and the owner explicitly deferred restore testing during this follow-up. No backup/export/restore or 100-visitor load exercise is claimed by this change; full Phase 6 exit remains open.

## Verified checkpoint results

[Evidence](verification/phase-6-media-followup.json) records the final application build, 93 unit tests, signed-out/security/identity HTTP checks, customer/profile/private-file isolation including genuine token expiry, address ownership/concurrency, role/protected-owner checks, complete publishing/media/inquiry regression and the populated storefront regression. All pass. The archive preflight reports 44 title/slug shapes valid, 0 owner-approved, 2 missing SKUs, 5 products with conflicting structured claim collections and no application mappings; exit 2 is the expected blocked result. Fourteen resource occurrences still have content verification false. The 98 manifest assets report 87 passed and 11 preserved originals; no image bytes were independently re-reviewed by this preflight.

The synthetic 1200×900 / 908,090-byte local image experiment measured a median 290 ms for decode/re-encode and 102 ms for validation/statistics plus unchanged-byte return over five timed iterations. This is processing elapsed time on this machine, not HTTP speed or production capacity. The original-size byte transfer, native decoding and publication/storage gateway calls remain.

The built-in browser loaded published catalog/gallery fixtures, switched images with Enter and decoded the generated 8×6 WebP images. Product pages fit requested 320/768/1024/1440 widths in both themes without document overflow or broken images. Thirty-two sampled opaque homepage text/background pairs passed the applicable contrast threshold in each theme; gradients/translucency/hidden text were skipped. This is not a full accessibility audit, real screen-reader test or reduced-motion emulation.

Ownership-checked cleanup and an independent read-only check removed all disposable fixtures and preserved the protected owner Admin, seven capabilities and role audit. An initial independent-check invocation lacked its local environment and stopped at preflight; the corrected invocation passed after cleanup. Private configuration is absent from all 32 client JS files; npm audit reports zero alerts. The owner's browser session/account and Admin access remain; temporary viewport settings are reset. Other-chat source/design files stay unmodified and excluded from the commit. No database/file disaster recovery, real email, production provisioning or deployment was performed.
