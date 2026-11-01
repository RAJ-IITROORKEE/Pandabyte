# Admin media library

Updated 1 November 2026. This checkpoint replaces the text-first Media workspace with a preview table, global active-library statistics and a shared accessible morphing dialog. It changes no existing content publication or asset eligibility flags.

## Interface

- Statistics count all non-archived assets, grouped into images, documents and GLB models, with published/private counts and total bytes. Search and filters affect the table, not these global totals.
- Search filename/alt text; filter by type and visibility; sort by name or upload date. Reads are paginated, with at most 50 rows per API request.
- Image thumbnails and the larger dialog use `object-fit: contain`. GLB files load the existing interactive viewer only after explicit activation. Documents have a labeled file link rather than embedded active-document execution.
- The dialog includes type, dimensions, size, upload/update dates, source/rights notes, editable alt text and current publication state. Attached records distinguish draft, published and saved-revision use.
- The upload surface accepts one file through drag/drop or a keyboard-accessible chooser and previews eligible local images. All uploads use the existing validated server pipeline and start private. PNG/JPEG/WebP/GLB/DOCX are limited to 4 MiB, PDF to 2 MiB and safe SVG to 256 KiB; image inputs are normalized to WebP where required. Unsupported and multiple-file selections are rejected.

## Access and lifecycle

`admin_media_workspace` and `admin_media_details` require authenticated coarse editorial access plus the custom-role `media.read` permission. Detail usage is filtered by each content module's read permission **before** its count and 50-row limit; no unauthorized record titles, links or counts are returned. The existing global reference boolean still prevents unsafe archiving, with a generic explanation for references outside the user's accessible sections.

The response projection omits storage keys/URLs, provider credentials, creator subjects and revision documents. Images and models use the existing `/api/media/{id}` delivery endpoint. Private reads remain protected and publication is rechecked by that endpoint.

“Copy public URL” copies the current environment's stable media endpoint only for published, non-archived assets; GLB assets also require recorded redistribution eligibility. A localhost URL is local to that machine. Public links remain dependent on the asset's publication state; they are not signed or permanent sharing grants.

The trash action opens an explicit **archive** warning. It does not destroy storage bytes or erase history. Draft, published, archived-record and historical revision references block archiving. The server retains its version check, advisory lock, reference check and audit event; the UI never unlinks content automatically. Publishing/withdrawing still uses existing publish capabilities, eligibility and live-reference guards.

## Verification

See [structured evidence](verification/admin-media-library.json). Focused API/contract tests cover bounded filters, unsafe projections, valid multiline metadata, permission denials and backend failures. The real development integration uses disposable Clerk identities, a private media upload and an unpublished blog draft; existing public assets are read-only checks. No real content is published by this verification.

Run the focused checks:

```sh
node --test tests/admin-media-api.test.mjs tests/admin-media-contract.test.mjs
node --conditions=react-server --test tests/editorial-media-upload.test.mjs tests/editorial-media-delivery.test.mjs tests/product-docx.test.mjs
```

The live integration harness is `tests/admin-media-workspace-integration.mjs`; supply the already approved development configuration privately and set `PHASE2_APP_BASE_URL=http://localhost:3012`. Its `--cleanup` mode handles a persisted disposable-fixture journal. Never point it at a production project or substitute real customers/assets.

No deployment, payment flags, invoice issuance, live email, recovery operation or Panda Agent changes are part of this checkpoint.
