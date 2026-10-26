# Product administration checkpoint

27 October 2026. The owner authorized the product-table/editor upgrade, its necessary development backend changes, and pricing inside product add/edit. The existing public theme, logo and unrelated storefront behavior stay unchanged. Categories are a later checkpoint.

## Contracts

- Admin stays Mono, Geist Mono and Tabler. Products have a dedicated bounded table endpoint; the generic record-list API remains compatible with other modules and import tooling. Query controls support title/SKU/model search, lifecycle status, draft category membership, deterministic sorting and 10/20/50-row pagination. Serial numbers include the page offset. Images use the existing private/staff-safe media delivery route.
- Deleting a product uses the existing, version-guarded archive action and an explicit warning dialog. It retains history and existing dependency/stock checks. The interface must not promise a restoration workflow that does not exist.
- Pricing sits after product information. Amounts remain integer paise; sale periods, reasons, capability checks, per-price versions and audit events remain authoritative. Product draft plus changed price rows save in one database transaction. Source observations are read-only for operational prices; their dated source prices are never selling prices. Empty prices stay unconfigured.
- `/admin/pricing` redirects to Products; the sidebar, overview shortcuts and command search omit Pricing. The pricing API remains available to existing callers.
- Optional product tags are bounded and distinct. Slugs are generated from titles for new products, with a manual override. Existing record slugs do not silently change.
- Gallery maximum: five photographs. A development aggregate before enforcement found 42 products, maximum four photographs, zero above five. Rich-description images are separately limited to 30. Uploads retain `media.manage`; catalog editing alone does not grant file-upload authority. Newly uploaded media remain private until separately approved for publication.
- Rich descriptions use closed TipTap JSON, not executable HTML. Legacy structured blocks remain readable. Supported formatting includes headings, text marks, limited colors/highlights/font sizes, alignment, lists, links, code, quotes, tables and managed images. Database and application validators bound hierarchy, size and references. Embedded media participate in existing publication and withdrawal checks.
- The owner chose a **separate DOCX layout preview**, not import into the rich editor. Original DOCX bytes are preserved. A bounded ZIP/XML preflight rejects macros, active/HTML parts, external resources, entities, invalid relationships and expansion bombs. Only ordinary embedded raster images and fonts are accepted; remote fonts/resources are not fetched. Server registration requires the existing server-only binary-validation proof; exact SHA-256 is checked on delivery. Original files remain gated by existing staff/publication rules.
- Word rendering is lazy and isolated in a scriptless sandbox. Text, tables and embedded images are supported. Browser HTML cannot reproduce every Word feature; the original download preserves the complete document. No promise of lossless browser layout or complete field/SmartArt rendering is made.
- Existing GLB/poster selection and private 3D preview remain available.

## Dependencies and licensing

TipTap 3.32.0 (MIT) is used instead of the reference project's 3.28.0 because the earlier core has current security advisories. Sonner 2.0.7 is MIT. DOCX preview 0.4.1 is Apache-2.0, explicitly retained as a document-rendering dependency; JSZip is used under its MIT option. Saxes 6.0.0 is ISC. Notices are in `docs/licenses/`. The AnatoLearn repository was inspected for behavior only; its application source was not copied without a repository license.

Primary references: [TipTap](https://github.com/ueberdosis/tiptap), [DOCX rendering API and limits](https://github.com/VolodymyrBaydalka/docxjs), [Sonner](https://github.com/emilkowalski/sonner), [Saxes](https://github.com/lddubeau/saxes). These sources do not authorize unrelated provider or service changes.

## Verification and boundaries

The integration and browser checks pass, including actual private image/DOCX uploads, rich-content saves, atomic pricing, source-observation protection, 24 measured responsive/theme cases, model controls and cleanup. The 165 unit tests and 10 auth/security/diagnostics HTTP tests pass. Five public regression routes return 200 and both summary lists retain the 42-product catalog without full rich bodies. Final build status and the local commit are recorded in `docs/verification/admin-products.json`, `ui-migrate-handoff.md` and `docs/phase-progress.md`. Browser viewport checks are distinct from real zoom, assistive-technology speech and physical-device testing.

No real product prices, stock, publication state or owner roles are changed by this checkpoint. Test mutations use unpublished disposable records. No checkout/payment, deployment, real email, billing, load test or recovery operation is performed. Original source/CAD/design artifacts remain outside this work.
