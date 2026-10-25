# Phase 3 data and operations

24 October 2026. Migration `20261023212810_phase3-publishing.sql` has been applied to the linked development project. The final clean-fixture production-build integration run and browser journeys pass; [verification evidence](verification/phase-3.json) records their scope and limits. Production provisioning, deployment, and production data changes are outside the current authorization.

See the [Phase 3 implementation contract](phase-3-contract.md), [Phase 2 access model](phase-2-access.md), and the [applied migration](../migrations/20261023212810_phase3-publishing.sql) for the controlling details.

## Identity and capability checks

Clerk remains the identity provider. RPCs use `public.requesting_user_id()` and the authenticated Clerk subject as text; InsForge Auth IDs, user-editable profile metadata, and client-supplied roles do not grant business access. Mutating and administrative RPCs check `public.staff_capabilities` themselves. Relevant `SECURITY DEFINER` functions pin `search_path`; helper functions are not granted to runtime roles.

The migration extends the existing capability allowlist with `media.manage` and `inquiries.manage`. It creates no grants. Capabilities map to the database operations as follows:

| Capability | Database operation |
| --- | --- |
| `catalog.edit` | List/read/save products and categories; set variant prices; participate in variant listing. |
| `content.edit` | List/read/save blog, page, FAQ, team, navigation, contact, solution, resource, and video records. |
| `content.publish` | Required in addition to the record's edit capability for publish, unpublish, and archive. Restore requires the record's edit capability and makes a draft only. Publishing or withdrawing media also requires `content.publish`. |
| `orders.manage` | Adjust inventory and participate in variant listing. Stock and stock-version fields are returned only to this capability. |
| `media.manage` | Upload, list, and manage editorial media; it also permits staff reads of draft media. |
| `inquiries.manage` | Read and update private inquiry records and notes. |
| `staff.manage` | Existing capability key; this migration does not add staff-grant UI or automatically grant it. |

`admin_list_variants` accepts either `catalog.edit` or `orders.manage`. For an orders-only caller it returns price and sale fields as `null` and `priceVersion` as `0`; a catalog editor sees prices but no exact stock unless they also have `orders.manage`.

Runtime roles (`PUBLIC`, `anon`, and `authenticated`) have no direct table DML on Phase 3 business tables. RLS is enabled and table privileges are revoked; supported access is through the narrowly granted RPCs below. Public listing/detail RPCs are executable by `anon` and `authenticated`. Admin RPCs are executable by `authenticated` and still enforce capabilities inside the function.

### Grant and revoke procedure

Use the official InsForge CLI linked to the development project and the `project_admin`-only `public.set_staff_capability(target_user_id, capability_name, enabled, reason)` function. Before granting, verify the exact Clerk subject through the trusted operator process, select only the capability needed, and provide a bounded reason. The function updates the grant and appends `staff_capability_events` in the same transaction. Revoke temporary grants through the same function and verify the resulting grant state. Do not grant by editing a profile, Clerk metadata, application request, or runtime database table.

The capability audit records `current_user` (the database role) and the reason; it does not establish a durable human operator identity. Operator identity attribution and audit retention are still policy decisions. No capability is seeded for a user by this migration, and the owner's normal customer access is unchanged.

## Editorial and catalog data

The supported editorial kinds are `product`, `category`, `blog`, `page`, `faq`, `team`, `navigation`, `contact`, `solution`, `resource`, and `video`. `cms_records` holds one validated draft, a record version, actor/timestamps, archive state, and a pointer to the current published revision. `cms_revisions` stores published snapshots with per-record revision numbers, source version/revision, publisher, and timestamp. `cms_live_routes` holds the current public route and revision pointer. `cms_slug_redirects` belongs to the record that owned the old path and resolves only while that record has a current published route. A collision is rejected instead of taking another record's redirect.

Application roles cannot update or delete revision, price-event, inventory-movement, or audit history: table writes are revoked and no runtime RPC mutates those history rows. Database operators remain privileged. Content shape is bounded JSON with per-kind allowlists and structured rich-text blocks; it is not executable HTML or an unrestricted table editor. Full field rules are in the [implementation contract](phase-3-contract.md) and validators.

Saving an existing record requires `expectedVersion`; stale versions raise `P0001` with detail `version_conflict`, which the API maps to a conflict response. A successful save advances the version. Publishing validates references and creates the next immutable revision and live route in the same transaction. Restore copies a selected old revision into the draft, records its source revision, advances the record version, and leaves publication to a separate action. Unpublish and archive remove public visibility. Public queries project only the current published pointer; draft previews remain capability-gated. The application uses `no-store`; the live tests confirmed draft/live separation and withdrawal without shared-cache delay.

The core record RPCs are:

| RPC | Purpose and return shape |
| --- | --- |
| `admin_list_records(p_kind, p_query, p_limit, p_offset)` | Capability-checked, bounded `{items,total}` list; list rows omit document bodies and revision history. |
| `admin_get_record(p_id)` | Returns `{record}` after an early signed-in staff check and the kind-specific edit check. |
| `admin_save_record(p_id, p_kind, p_expected_version, p_document)` | Creates or saves a validated draft and returns `{record}`. Create uses a null ID/version; updates require the current version. |
| `admin_transition_record(p_id, p_expected_version, p_action, p_revision_id)` | `publish`, `unpublish`, `archive`, or `restore`; returns `{record}`. `revision_id` is required only for restore. |
| `published_list_records(p_kind, p_query, p_limit, p_offset)` | Anonymous/current-user `{items,total}` projection over live published records only. |
| `published_get_record(p_kind, p_slug)` | Returns `{record}` for the current live revision or `{redirectTo: slug}` for a valid same-kind historical slug; unpublished or archived destinations are not returned as redirects. |

Catalog variants are normalized in `catalog_variants`; category links live in `product_categories`. A variant SKU is immutable after creation, so changing it requires a new variant. A product cannot publish until each desired variant has a regular price. `regular_paise` and optional `sale_paise` are integer paise; a sale requires a bounded half-open interval `[sale_from, sale_until)` and cannot exceed the regular price. Price changes are operational updates and do not create a new prose revision.

`inventory_balances` starts at version `0` and quantity `0`. `variant_price_events` and `inventory_movements` are append-only from application roles. `cms_audit_events` records the actor subject, action, entity, bounded details, optional reason, and time. Price and stock operations use expected versions that may be `0` on first write. Inventory adjustment requires a nonzero delta no greater than one million in either direction, a bounded reason, and a request UUID. The same request UUID is replayable only for the same actor, variant, delta, and reason; mismatched reuse returns `request_conflict`. Resulting available quantity must remain nonnegative. This is manual inventory adjustment, not order reservation or payment processing.

Variant RPCs:

| RPC | Authorization and behavior |
| --- | --- |
| `admin_list_variants(p_query, p_limit, p_offset)` | `catalog.edit` or `orders.manage`; bounded `{items,total}` with capability-masked price/stock fields. |
| `admin_set_variant_price(p_variant_id, p_expected_version, p_regular_paise, p_sale_paise, p_sale_from, p_sale_until, p_reason)` | `catalog.edit`; regular price is required and cannot be cleared; appends price history and an audit event; returns `{variant}`. |
| `admin_adjust_inventory(p_variant_id, p_expected_version, p_delta, p_reason, p_request_id)` | `orders.manage`; serializes and records a bounded idempotent balance movement plus audit event; returns `{variant}`. |

## Editorial media

The separate `cms_media` metadata table and `editorial_media_events` history back editorial assets in `editorial-media`; customer account files remain in their Phase 2 private bucket. New object keys use `assets/<uuid>.webp` or `assets/<uuid>.pdf`. The storage policy bounds declared WebP objects to 4 MiB and PDF objects to 2 MiB, requires the authenticated uploader to match the Clerk subject, and prevents overwrites. The upload route validates/decodes the bytes before upload; registration checks the object metadata against the uploaded object. The API serves the stable `/api/media/{id}` path.

New media is private until explicitly published. Editors with `content.edit` or `catalog.edit` may read non-archived draft media; `media.manage` can upload and manage it. The RLS policy allows only published, non-archived editorial media, but restricted Cloud projects also deny anon storage-schema privileges; public delivery uses the bounded server-only path described below. A referenced asset cannot be withdrawn from publication while a live revision uses it; archiving is blocked while any draft or revision references it. Registered media cannot be deleted through the storage cleanup policy. Storage metadata and file contents require separate backup and restore handling.

Media RPCs are `admin_register_media(...)` and `admin_list_media(p_query,p_limit,p_offset)` (`media.manage`), `admin_update_media(p_id,p_expected_version,p_alt,p_source,p_published,p_archive)` (`media.manage`, plus `content.publish` when publication changes), `editor_get_media(p_id)` (editorial read capability), and `public_get_media(p_id)` (published media only). Admin calls return `{media}` or `{items,total}`. The public media RPC returns metadata only; the application route handles object delivery.

## Restricted Cloud storage delivery

The attempted anon grants in the core migration and `20261023220441_phase3-editorial-read-grants.sql` were recorded as applied but had no effective grant. InsForge executes custom migrations as `project_admin`; the platform owns schema `storage`, and project_admin has no grant option. PostgreSQL emits a warning and grants nothing. `has_schema_privilege` and `has_table_privilege` remained false, and anonymous SDK downloads returned403. Unrestricted SQL is disabled and was not enabled. Sources: [InsForge execution context](https://github.com/InsForge/InsForge/blob/main/backend/src/services/database/user-context.service.ts), [platform privileges](https://github.com/InsForge/InsForge/blob/main/backend/src/infra/database/migrations/045_project-admin-public-privileges.sql), [runtime defaults](https://github.com/InsForge/InsForge/blob/main/backend/src/infra/database/migrations/047_harden-internal-runtime-defaults.sql), and [PostgreSQL GRANT](https://www.postgresql.org/docs/current/sql-grant.html). The CLI feedback report was accepted as `b9b904f2-2b79-42fc-8360-12fb90c02cea`.

/api/media/{id} therefore makes a narrow server-only exception: anonymous public_get_media must identify a currently published asset; the UUID, bucket-relative key and bounded size must match; only then does a local privileged SDK client download that editorial object. The route validates actual bytes and rechecks publication before returning a no-store response. Draft media still uses the authenticated user client. The client is never exported, no arbitrary bucket/key or stored URL is accepted, no write uses it, and customer-file UUIDs cannot select a customer bucket. INSFORGE_EDITORIAL_STORAGE_READ_KEY belongs only in protected server configuration; the development value is ignored. It is a broad project credential, so rotation, deployment access and isolation remain operational risks. If the platform supports the documented anon storage grants later, retest them and remove this exception. Never turn the mixed draft bucket public.

## Inquiries and notification state

`inquiries`, `inquiry_notes`, and `inquiry_notifications` have RLS enabled and direct runtime table access revoked. The original `submit_inquiry` function remains internal: the subsequent [contact abuse boundary](contact-abuse.md) revoked its anonymous/authenticated execution and requires server-verified Turnstile plus a scoped proof through `submit_verified_inquiry`. Inquiry and outbox creation remain atomic and idempotent, with bounded inputs and database quotas. The later [notification preparation](inquiry-notifications.md) adds durable state, capped attempts and staff controls. Real email remains disabled under the owner's Free-plan decision; no delivery guarantee is claimed.

`admin_list_inquiries(p_query,p_status,p_limit,p_offset)`, `admin_get_inquiry(p_id)`, and `admin_update_inquiry(p_id,p_expected_version,p_status,p_note)` require `inquiries.manage`. Updates use optimistic versions, add a staff note with the actor subject, and update status atomically. Inquiry content and notes are private.

## Development recovery and rollback

The applied migrations are historical records and must not be edited or replayed as an ad hoc rollback. Before a destructive development recovery, stop application writes and take a schema/data snapshot plus a database backup and a separate copy/manifest of `editorial-media` objects. Database backup alone does not restore stored files. Confirm the target is the linked development project, review the live migration/dependency state, and decide whether to preserve Phase 3 records, revision history, inquiry data, media metadata, and uploaded objects.

If preserving data, prefer repairing forward with a reviewed additive/compensating migration. If discarding only development fixtures is explicitly intended, prepare a dependency-ordered compensating migration that removes only Phase 3-owned policies/functions/tables and policies for `editorial-media`, without `CASCADE`; preserve Phase 2 customer data, the existing storage RLS state, and the applied migration history. Restore database and corresponding storage objects together when recovery is required. Verify restoration in an isolated development target before resuming writes. Content revision restoration is tested separately from infrastructure recovery. No database-plus-file restore drill or destructive rollback has been performed.

## Pending checks and policies

Live development checks pass for record save/publish/restore and withdrawal, direct-SDK permission denials, concurrent version/stock behavior, sale windows, media upload/publication/withdrawal, inquiry idempotency/rate limits and the documented browser-to-database journeys. Test users, grants, rows and files were removed and independently checked. See [Phase progress](phase-progress.md) and [verification evidence](verification/phase-3.json).

The current development baseline also retains these limits: registration transport uncertainty can produce a503 after a committed media row (the object is preserved and a retry may duplicate it); archived media has no restore UI; and the 100/hour global inquiry quota is an availability tradeoff until trusted edge/IP abuse controls are selected.

Production policies remain open: staff operator identity and approval, capability allocation and revocation ownership, audit retention, inquiry retention and notification recipient/provider, backup and file-store retention, recovery objectives, tested database-plus-file restore, capacity, monitoring, and a production migration/rollback runbook. No production readiness, restore guarantee, notification delivery, payment workflow, or production deployment is claimed here.
