# Phase 1 implementation contracts

Status: implementation handoff, not a database migration or provider setup. Fields and boundaries below are the shared contract; items called **Proposal** are safe starting points for review, not owner-approved product policy. Open owner choices are listed at the end.

## Fixed invariants

- Clerk is the sole identity and session provider. InsForge is the sole application database and file store. Custom Next.js server code owns business operations.
- Every customer-facing order requires a Clerk session before checkout. Customers may access only records tied to their verified identity.
- Catalog, company, blog, FAQ, contact, team, navigation and learning/resource content must be editable through the admin without a deployment. New component types and business rules remain code changes.
- Draft edits never replace the live revision. Public reads, search, metadata and sitemap include published content only. Preview is private, `noindex`, and outside shared caches.
- Show and enforce the ₹5,000 minimum only inside checkout before payment, never in header/catalog/PDP/cart. The qualifying subtotal and exact equality boundary remain owner decisions before implementation.
- Use integer paise for INR prices and compute current prices on the server. Never trust client amounts, stock counts, role claims or verified-purchase flags.
- Keep administrative credentials and provider secrets server-only. User-editable Clerk metadata cannot grant staff access.
- Source product/company facts and media from Pandabyte.in or owner-authored/approved material. The 44 audited products are an import seed, not a catalog limit. Unknown facts stay unknown.
- Keep the original monochrome logo unchanged. Public resource entries about IoT/embedded skills or CLI tools must be owner-approved descriptions and links; never expose local agent instructions, skill files or developer configuration.

## Shared identifiers and audit fields

Use UUIDs for business entities such as products, variants, categories, content records, inquiries and orders. Treat Clerk's verified `sub` as an opaque text identity key. Store it as text (for example, `clerk_subject`) on customer-owned records; do not cast it to UUID or assume it equals a business row ID.

Proposed shared audit fields are `created_at`, `updated_at`, and nullable `created_by_subject` / `updated_by_subject` text values. Store instants in `timestamptz`/UTC. Keep soft archive and publication state separate: archiving a referenced product must not erase order history.

## Catalog and pricing records

The following is a conceptual field contract, not a prescribed SQL layout. Relations can be normalized where useful; public responses must be deliberate projections rather than `SELECT *`.

| Record | Contract fields and rules |
| --- | --- |
| Product | UUID; stable public slug; title; short description; approved structured body; publication state/revision; ordered category links; ordered media/specification/resource links; created/updated audit fields; archive marker. Manufacturer, model, electrical specifications and compatibility are populated only from a source or owner approval. |
| Variant | UUID; `product_id`; sellable SKU; normalized SKU used for exact lookup; optional source-backed model/variant label and structured attributes; active/archive state; inventory reference. **Proposal:** represent even a single-SKU product with one variant so SKU, price and stock have one consistent owner. |
| Category | UUID; stable slug; name; approved description; optional `parent_id`; display order; publication/archive state. Parent relationships must remain acyclic. A product may belong to multiple categories. |
| Media | UUID; InsForge object key/reference; media role; `alt_text`; optional caption; display order; MIME type, byte size and dimensions; visibility/publication state; source/rights note when known. Public product media and private inquiry/customer attachments use separate access rules. |
| Specification | Product or variant relation; stable key; display label; sourced value; optional unit; display order; optional source/reference note. Preserve meaningful suffixes and distinguish supply voltage from GPIO logic voltage. Do not turn missing values into guessed values. |
| Resource link | Related product/content record; label; HTTPS URL or approved provider reference; resource kind; order; visibility. Reject executable markup and unsafe URL schemes. |
| Price window | Variant relation; price kind (`regular` or `sale`); integer `amount_paise`; `valid_from` and optional `valid_until`; audit source. Amounts cannot be negative; a window with both endpoints must have `valid_from < valid_until`. |

**Proposal:** use a sale window that applies on the half-open interval `[valid_from, valid_until)`. Define one active regular price and at most one eligible sale window per variant at an instant. The sale amount must not exceed the applicable regular amount throughout its window; reject conflicting windows and regular-price edits that would invalidate a sale. Store historical prices rather than overwriting order snapshots.

One server-side pricing service must calculate the effective regular/sale price for catalog cards, product detail, cart display, admin preview and checkout. It returns amount in paise plus the applicable price/window identity and next transition time when one exists. Checkout always recalculates. A cached public price must expire no later than the next transition; a late scheduler or stale cache cannot change the authoritative calculation.

## Editable content and publication

**Proposal:** model editable public entities as a mutable draft plus immutable published revisions. The draft has a monotonically increasing version. A mutation supplies the version it read; a mismatch returns a conflict and leaves the newer draft intact. Publishing validates the draft, creates a new immutable revision with a stable revision number, editor subject and timestamps, and advances the live pointer atomically. Restore creates a new draft from the selected historical snapshot; it never edits history or publishes without a separate authorized publish action.

Keep the live-publication pointer separate from the mutable draft so an editor can prepare a change without affecting visitors. **Proposed lifecycle:** `draft` is staff-only; `published` points to a validated immutable revision; `unpublished` has no public pointer but retains revisions; `archived` is excluded from normal staff pickers and public reads while preserving references/history. A future scheduled state is only added with an authorized durable scheduler and explicit timezone rules.

An unpublished change must disappear from catalog/content lookup, search, sitemap and metadata. A restored draft must pass the ordinary authorized validation/publication step before it can become public; record its source revision and actor without rewinding audit history. Slug redirects are owned by the content record and are reviewed for collisions before a changed slug is published.

Use an allowlisted structured block schema for page bodies. Rich text is sanitized on the server and rendered through approved block types. Do not accept arbitrary HTML, scripts, custom iframes or executable page-builder data. A future block type requires code and validation changes.

The publish validator checks each content type's required fields, route/slug collisions, referenced category and FAQ placement validity, public media visibility, and allowed resource hosts. Catalog publish also checks SKU uniqueness and required relationships; the exact required technical fields depend on the sourced product category. A failed check leaves the currently published revision available and reports actionable field errors to the editor.

| Content type | Editable fields / specific rules |
| --- | --- |
| Company/page blocks | Stable page key and slug; title/summary; approved ordered block payloads; publication state. Shared facts should have one canonical record where practical. |
| FAQ | Question; approved answer; topic; ordered page-placement relations; publication state/revision. One FAQ can appear on multiple approved pages without copied text. |
| Contact settings | Owner-approved public email/phone/hours and contact guidance; office addresses appear on Contact only. Values remain unset until supplied. |
| Inquiry | Server-generated UUID; validated name, email, optional phone, subject and message; optional private attachment references; received time; operational status and assigned staff subject. Persist before sending a receipt or notification. Keep private and apply the eventual retention policy. |
| Team member | Owner-supplied name, role, bio, approved image/alt text, order and publication state. Temporary neutral avatars are preview/draft-only unless the owner explicitly approves their publication; otherwise use real identities or omit the entry at launch. |
| Blog/article/guide | Stable slug; title; summary; sanitized structured body; approved author attribution; cover media and alt text; category/tags; draft version and published revision; timestamps. Do not invent author identities or product claims. |
| YouTube/resource entry | Owner-approved title/description; canonical YouTube video ID or validated HTTPS resource URL; resource kind; placement and order; publication state. Render a controlled provider embed from the ID; never store or execute pasted iframe markup. |
| Navigation | Label, order, parent/placement, visibility and destination. Internal destinations must resolve to approved routes/content; external destinations must pass an HTTPS allowlist policy. Never accept arbitrary redirect destinations. |

Public “Skills and CLI tools for IoT & Embedded” content is ordinary owner-approved resource content with public titles and links. It is not a portal to this repository's `.agents/`, configuration, prompts or local files. The future Agent Desktop may be mentioned on approved Solutions/About pages as Coming soon; it must not be highlighted on the homepage.

## Proposed API and validation contract

These route families are proposals for Next.js Route Handlers or server actions according to the user flow. They do not mandate a blanket `/api/v1` prefix, a universal success envelope, Zod, or another validation dependency.

| Purpose | Proposed route family | Boundary |
| --- | --- | --- |
| Public catalog | `GET /api/catalog/products`, `/api/catalog/products/[slug]`, `/api/catalog/categories` | Return published projections only; use the shared pricing service. |
| Public editorial/content | `GET /api/content/[kind]/[slug]` or server-rendered reads | Resolve only published, approved content; omit private fields. |
| Public inquiry | `POST /api/contact` | Validate and persist first; attachments are optional and private. Abuse controls and retention need owner policy. |
| Staff catalog/content | `/api/admin/products`, `/api/admin/content`, `/api/admin/.../[id]/publish` | Require a verified Clerk session and explicit server-side capability on every operation. Check expected draft version. |
| Customer records | `/api/account/...` | Require Clerk session and scope every read/write to the verified subject; return no other customer's existence or data. |
| Checkout/payment | To be specified after commerce decisions | Require Clerk; recalculate price and stock; never trust redirect state. Provider and webhook ownership are unresolved. |

Each endpoint returns its resource or collection shape directly. Collections include bounded pagination metadata and stable ordering; no mandatory `{success, data}` wrapper. **Proposal:** use a consistent error object with a stable machine code and safe message, plus field errors where useful. Never return stack traces, SQL/provider diagnostics, secrets or authorization internals.

A public product projection should contain only the fields needed to render and identify the sellable item: stable public ID/slug, SKU, approved catalog fields/media, a price with `currency: "INR"` and integer `amountPaise`, and a safe availability state derived from verified inventory. Do not expose exact stock counts, cost, private object keys, internal audit fields or staff metadata. Serialize timestamps as ISO 8601 instants. Define each resource's omitted-versus-null behavior consistently.

Validate request bodies and query parameters at the boundary: explicit fields only; length and quantity limits; normalized identifiers; allowlisted sort/filter keys; safe URL schemes; bounded page size; and stable tie-breakers. Ignore or reject unknown mutation fields rather than mass-assigning them. Parameterize database values. Do not interpolate user-controlled SQL identifiers. Validate both syntax and authorization; input validation does not replace session, ownership, capability checks, constraints or RLS.

**Proposal for catalog queries:** accept only `q`, category, integer-paise price bounds, an availability filter backed by verified inventory, an allowlisted sort and pagination cursor/size. Preserve the required search order: exact SKU/model, normalized alias/prefix, then indexed text. Use a stable ID tie-breaker. A starting page size of 24 with a hard cap of 100 is an implementation proposal to validate against query plans, not a capacity claim. An unknown sort/filter is rejected instead of becoming a database column name.

Reject negative/non-integer price bounds and `min > max`; currency is INR for this catalog contract. Normalize search for matching without dropping meaningful model/SKU suffixes. Treat cursors as opaque bounded values, and do not implement browser-side filtering by downloading the full catalog.

Admin mutations carry the expected draft version in the request; the server checks it in the same transaction as the update. Ignore/reject body-supplied actor subjects, publication state, staff capabilities, calculated price and stock availability. File checks inspect content type and actual bytes, not just a filename or browser MIME declaration; exact limits and accepted formats remain owner decisions.

**Proposed status mapping:** 400 malformed/invalid input; 401 absent or invalid session; 403 authenticated but lacking capability; 404 missing public resource (and private resources where hiding existence is appropriate); 409 stale draft/version or invalid state transition; 413/415 disallowed attachment size/type; 429 rate/abuse limit; 5xx generic failure with a correlation ID when available. Pick one validation status policy and apply it consistently when implementation begins. Public error text must not disclose private-resource existence.

## Identity, capabilities and data access

Clerk owns sessions and identity. Verify tokens through the selected official Clerk–InsForge bridge and pinned SDK; decoding a JWT is not verification. Map the verified Clerk `sub` text to business records and RLS policies. Do not accept a caller-supplied subject as proof of identity, use Clerk user-editable metadata for staff authority, or introduce InsForge Auth as a second sign-in system.

| Actor/data | Proposed access rule |
| --- | --- |
| Anonymous visitor | Read published catalog, prices through public projections, and published content only. No draft, staff, inquiry, customer, order, stock movement or private-file access. |
| Customer | Read/update their own permitted profile and addresses; read their own orders. Contact submissions return a receipt; customer inquiry-status tracking is outside the current baseline. Ownership comes from the verified `sub`, never a body/query ID. Checkout requires a session. |
| Content editor (proposed) | Create and edit drafts for company, FAQ, team, blog, learn/resources and navigation; no role grants, payment, pricing or order authority by default. |
| Catalog editor (proposed) | Edit product/category/media/specification drafts; no staff grants or order/payment authority. |
| Publisher (proposed) | Publish approved content within granted domains; publishing catalog pricing may require a separate capability. |
| Support operator (proposed) | View/respond to inquiries and support notes; no customer password/session control, price edits or refund authority by default. |
| Order operator (proposed) | Process fulfillment and permitted stock operations; no role grants or payment-secret access. Refund/void capability remains separately assignable. |
| Administrator (proposed) | Grant/revoke explicit capabilities and manage system settings. Bootstrap and high-impact actions require an owner-approved procedure and audit trail. |

Role names and allocation are proposals. Implement authorization as explicit capabilities, default deny, and audit sensitive actions; do not treat a role label or hidden button as authorization. Customers can never grant staff access to themselves.

Apply database grants and RLS together with server-side checks. Anonymous database access should expose only published public fields. Customer rows must be scoped to the verified Clerk text subject. Drafts, inquiries, staff grants, orders and private attachments stay private. Staff database access follows the same capability boundary. Public media storage and private upload storage need separate permissions and independently checked access; signed private links, if used, must be short-lived and authorized before issuance.

If an InsForge server credential bypasses RLS, every server call using it must perform equivalent session, ownership and capability checks before reading or mutating data. Keep that credential out of client bundles and responses. Test both the database policy and the application boundary; one passing layer does not prove the other.

## InsForge migration and data safety gate

This preparation document originally preceded provider access. The owner has since supplied Clerk development keys and InsForge CLI access; the existing development project and identity bridge are verified in [backend setup](backend-setup.md). Root remains the sole migration owner. Only the additive identity helper has been applied; business data, RLS/storage isolation and backup/restore gates are still pending.

When authorized, keep one migration owner and use the official InsForge CLI/workflow. Before each reviewed migration:

1. Record the target staging project and confirm it is not production; keep secrets out of Git and logs.
2. Review stable UUID keys, text Clerk-subject ownership, foreign keys, uniqueness, nonnegative integer-paise prices, valid time windows, legal state transitions and archive/history behavior.
3. Add constraints for invariants that must hold under concurrency; do not rely on form validation. Prevent duplicate normalized SKUs/slugs and invalid category parent cycles.
4. Add indexes for measured public lookup, ownership, ordering and foreign-key access patterns. Review query plans and actual InsForge/PostgreSQL support for concurrent index operations; do not copy a migration-tool example blindly.
5. Separate schema changes from large backfills. Use an expand/backfill/verify/contract sequence for changes that must coexist with deployed code. Make migrations immutable after deployment; correct production state with a reviewed forward migration.
6. Exercise migration and representative role/RLS behavior on staging data, including anonymous, one customer, another customer and each staff capability. Test storage visibility separately.
7. Verify a database backup and file-store backup can be restored together before a risky migration/import. Record recovery owner and restore evidence; rollback means a safe compensating migration or restore plan, not an assumed SQL `DOWN` in production.
8. Import only source-backed seed data with an auditable source mapping, validation report and duplicate/unknown review. The existing 44 products do not define future capacity or catalog size.

Keep InsForge-managed schemas intact unless official integration guidance requires a reviewed change. Do not add Prisma, Drizzle, a second database or external migration runner as part of this contract.

## Publication, cache and retry behavior

Draft saves require the version last read. A stale version returns a conflict with no overwrite. Publishing validates required fields and relationships, creates an immutable revision and advances the public pointer in one database transaction. The response identifies the committed revision; it does not claim every cache has refreshed.

After commit, refresh only affected public paths/tags for the changed product, categories, page, navigation, article or FAQ placement. A retry must be safe for the same revision and observable to staff. Keep a durable record of refresh attempt/result and a retry path; the specific job/outbox mechanism is undecided and must not be added speculatively. Visitors must never see draft data during a refresh failure.

Unpublish first revokes the database public projection. Completion also requires tested exclusion/purge of affected origin/CDN routes; a database pointer change alone cannot revoke already cached HTML. If those routes still serve withdrawn content while purge retries, report the withdrawal as pending/failed rather than complete and use the tested withdrawal path. Private previews use an authorized no-store path and `noindex`. Account, admin, cart, checkout and inquiry data stay outside shared caches. Search, metadata and sitemap derive from current published revisions only. Slug changes retain a reviewed redirect from the old public slug. Scheduled article publication is optional and needs durable execution if selected. Sale validity is evaluated at read time, with cache expiry bounded by the next price transition, so a delayed timer cannot make a sale apply outside its window.

## Owner decisions and blocked implementation inputs

- **Clerk:** sign-in methods, test/staging keys, verified Clerk–InsForge token template/claims and lifecycle test access. Keep Clerk as sole identity provider.
- **InsForge:** selected staging project/region, user-provided credentials/CLI access, limits, storage configuration and confirmed restore coverage. The live identity bridge passes; data/storage access and restore coverage remain separate unverified gates.
- **Staff:** final capability names/allocation, bootstrap/revocation procedure, publisher approval rules and audit retention.
- **Prices/commerce:** exact ₹5,000 qualifying subtotal and equality boundary; tax/GST/invoice basis; shipping; coupon/discount behavior; sale-window timezone and overlap policy; merchant/payment integration and webhook owner.
- **Operations/privacy:** notification provider/recipient and retry owner; contact attachment size/type, consent and retention; customer/order/inquiry retention; support/refund responsibilities.
- **Content:** real team identities, contact values, sourced product corrections, public resource/video links and publication approval. Use empty states until supplied.
- **Capacity:** expected traffic/request mix, service region, response targets and budget. Existing proposed load/performance targets are test planning values, not guarantees.

The latest user authorization has resumed development provider setup and Phase 2 access work; see [backend setup](backend-setup.md) and [access contracts](phase-2-access.md) for current implementation and verification. Remaining owner decisions apply at their dependent phase gates. This contract does not authorize payments, fabricated seed data, production provisioning or deployment.
