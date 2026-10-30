# Product 3D gallery integration

**Update, 30 October 2026:** The owner approved publication of the previously private xC5, xC3, xC3m, Maker UNO, WS2812B ring and xLoRa models. Their existing model/poster pairs are now public through the development catalog and hosted preview. This supersedes the earlier six-model privacy hold below. The owner also approved the BMV080, xC6, xS3, 18650 holder and OLED models; those five were integrated separately. The two Grove female headers remain on hold.

The six-model update reused existing media and version-checked product records. Independent anonymous checks verified the six product references and all twelve model/poster files on localhost and the hosted preview; the six interactive cards were also tested in the built-in browser. Models remain visual estimates, not manufacturing specifications. Earlier checkpoint counts and restrictions below are historical.

The six newly public GLBs are 3.05–3.81 MB each, with posters of 74–179 KB and at most 254,255 triangles. A frontend review confirmed activation-only model and viewer loading, one active viewer, offscreen and hidden-tab rendering pauses, a 1.5 pixel-ratio cap, and cleanup of GPU resources. Eight focused preparation and import tests passed. Physical-mobile GPU performance and frame rates have not been measured.

Owner authorization, 26 October 2026: extend the existing development catalog and Admin with image carousels and interactive product-model previews. This supersedes the earlier catalog contract's exclusion of 3D for this separate checkpoint. No production deployment or commerce work is included.

## Confirmed boundaries

- Preserve the 599 archived source files, all accepted CAD outputs and other-chat artifacts. Prepare optimized web derivatives under ignored `.bootstrap/product-models/` only.
- Include the 17 accepted product models and the corrected xLoRa V3 candidate, subject to its source/visual checks. Six vendor-derived models (xC5, xC3, xC3m, Maker UNO, WS2812B ring and xLoRa) remain private pending redistribution permission. Do not publish their binaries or derived posters.
- The owner selected interactive 3D with no download controls. Browsers necessarily receive model data; this is not extraction prevention. Never expose STEP/source files or provide model-download links.
- Keep the current product text, source-price observations, non-purchasability, publication states and owner session. Use version-guarded Admin APIs for model/media attachment, preserving concurrent edits.

## Implementation contract

- Add optional product `model3d: { mediaId, posterId, alt }`; existing ordered image-only `mediaIds` remain authoritative for photographs. The model is one extra carousel slide. No duplicate image-gallery schema.
- Add GLB v2 to editorial media with a separate trusted server validation proof at registration. Existing image/PDF registration cannot register a GLB. Keep files within the existing 4 MiB route budget; optimize derivatives rather than increasing upload/response limits.
- Persist model public-use eligibility. Pending vendor assets cannot be published. Private models remain usable only through existing staff authorization and product draft preview.
- Extend JSON validation, publication/media reference guards, public projection, Admin selection/replacement/removal and upload controls together. Model/poster references are revision-snapshotted with the product document.
- Use pinned MIT Three.js, loaded only after selecting 3D. Keep posters and ordinary images available without WebGL. Allow at most one active viewer; dispose meshes/textures/controls/context on close or slide change. Respect reduced motion and offscreen/document visibility, with keyboard controls and an explicit rotation toggle.
- Card carousels retain a normal product link and separate previous/next/pause/3D controls. No canvas or model request before 3D activation. Detail galleries show all existing photos and the model slide.
- Verify self-contained GLBs, resource bounds and supported extensions before registration/delivery. Serve model bytes only after the current public/staff authorization check with private/no-store headers; recheck publication before returning.

Root owns migrations, dependencies, secret configuration, data application and the local commit. Workers have disjoint file ownership. Evidence must record actual optimization sizes/quality checks, access/withdrawal tests, browser behavior and archive preservation. No claim of manufacturing accuracy or mobile performance follows from file validation alone.

## Selected tools and operations

The ECC snapshot at `90606c8315ee09cafc303515c5f33024db6b9882` has no dedicated product-3D skill. The selectively installed `react-performance` and `frontend-a11y` skills guide lazy loading and controls, alongside the existing API/security/migration skills. See [the pinned manifest](../.agents/skills/ecc-sources.json). No whole plugin, hooks or global configuration is installed.

Runtime: MIT Three.js 0.186.1, dynamically imported only after activation. Offline preparation: glTF Transform 4.5.1 and meshoptimizer 1.3.0 (MIT), with Sharp already installed. The browser receives ordinary self-contained geometry plus supported quantization/WebP extensions; it does not load Draco/Meshopt/WASM decoders or a remote viewer. Retained notices are in `docs/licenses/`.

Embedded texture decoding requires local Blob URLs in `connect-src` (ImageBitmapLoader) and `img-src` (image fallback). These two additions retain Clerk's default allowed origins and all nonce/strict-dynamic/script/object/frame restrictions; no remote asset origin or `wasm-unsafe-eval` is added.

`npm run models:prepare` writes ignored derivatives and measured reports. `npm run models:integrate -- --inspect` checks the local mapping; `--plan` validates all files and actual development Admin records without writes. Explicit `--apply` is a version-guarded development-only operation. Review the manifest holds and six private flags first. The importer must preserve all other document fields and refuse to publish unrelated draft edits. Set `PRODUCT_MODELS_APP_ORIGIN=http://localhost:3003` for the isolated verification server; only loopback ports 3000–3999 are accepted.

`PRODUCT_MODEL_VALIDATION_KEY` is a separate server-only local secret. Configure only its SHA-256 in `public.product_model_validation_config`; never reuse the read-only storage-delivery key. Without matching proof configuration, GLB registration fails closed. Production credentials and deployment remain unconfigured by this checkpoint.

## Completed development checkpoint

All 18 models (17 shortlisted plus xLoRa V3) are attached through real version-guarded Admin APIs. Twelve model/poster pairs and matching product revisions are published in the development catalog; the six vendor-derived pairs remain unpublished with draft-only product references. Anonymous checks return 404 for all 12 private media URLs. The 42 existing source observations, SKUs and non-purchasability remain unchanged; two missing-SKU products remain outside CMS.

Web copies total 46,962,688 bytes versus 184,329,412 source bytes (74.5% smaller), with at most 254,277 triangles per model and every GLB below 4 MiB. Quantization, bounded simplification and perceptual texture checks are recorded in the ignored manifest; these are optimized visual copies, not lossless or manufacturing models. All 599 archive files and 146 manifest-listed source/CAD paths pass unchanged SHA checks.

Cards cycle photographs/posters with pause controls, then load an interactive model only on explicit activation. Opening another model closes the previous viewer. Closing restores the poster/carousel and keyboard focus. Icon controls remain at least 44px, canvas rendering reserves toolbar space, and automatic rotation orbits the camera around the board rather than moving its origin. Admin supports model/poster selection, rights gating, private preview, removal and photograph ordering.

Final lint, typecheck, production build and 145 unit tests pass. Disposable live tests cover proof/capability/type/version/publication/reference/withdrawal boundaries and clean up their own records/users. Anonymous reconciliation covers all 42 observations and all 18 media pairs. All 18 models were visually reviewed in the built-in browser; final responsive checks cover card, detail and private Admin viewers at 320/768/1024/1440 in both themes (24 cases). See [sanitized evidence](verification/product-3d-integration.json).

The preview is a local production build at `http://localhost:3004`; this is not deployment. Runtime OS reduced-motion switching, actual browser zoom/screen-reader speech and physical-mobile GPU/frame-rate testing remain unperformed. Source-reviewed motion handling and viewport/DOM checks do not replace those checks. No load test, commerce, real email/billing or recovery operation was performed.
