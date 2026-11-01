# Users and custom roles — 1 November 2026

This checkpoint implements the owner's account-first Users & Roles brief. It supersedes the fixed-role-only and staff-only-directory restrictions in the historical [role contract](admin-roles.md). Development backend migrations, disposable actors, browser verification, commit and push are authorized. Deployment and commerce configuration are unchanged.

## Page and identity

Top cards show role count, actual Clerk account count, active staff accounts and default/customer accounts. The searchable, bounded directory includes avatar, name, verified email, verification state, role name, actual recorded order count and last-updated date. Zero orders means no matching recorded orders; service errors never become fabricated zero counts. No database identifiers or Clerk subjects are rendered as labels.

Clerk remains the sole identity authority. The API pages/searches Clerk, then joins only those subjects to private InsForge summaries. One additional lookup of at most 100 staff subjects reconciles retained assignments with accounts still present in Clerk. Summary cards are global; the table total follows the search. Role catalog counts explicitly describe stored assignments, including retained history, rather than claiming they are live accounts.

The bottom catalog has Role details and Custom roles views, with collapsible permission details. Built-in definitions are read-only. Create/edit custom role uses a labeled matrix; assignment starts from a selected existing verified account. Account verification is rechecked through Clerk on each assignment, not trusted from the browser. Self changes and protected owner changes remain unavailable.

## Account removal and feedback

The owner additionally requested account deletion and dismissible feedback. Each ordinary account has a danger action; self and protected-owner deletion are blocked. The centered warning requires a reason and typed `DELETE`. `DELETE /api/admin/users/{id}` accepts only `{expectedVersion,reason}` and applies the same ADMIN, same-origin, bounded-body and version rules.

Removal stages a private receipt and revokes staff grants atomically before contacting Clerk. A pending/deleted receipt prevents reassignment; that check and renewed role-manager authority run **after** the membership advisory lock, so queued writes observe committed removals. The server verifies Clerk even for a completed receipt, reconciles unknown provider results and permits safe retry. It never reports successful provider deletion solely from a database receipt.

Clerk identity/session removal is permanent. Orders, financial/test history, private profile/address/file records and administrative history remain retained under their existing access controls; this is not a personal-data erasure workflow. No retention purge is added. The directory indicates pending removal and disables role assignment while retry remains available.

Success feedback in Users & Roles uses the existing themed Sonner toaster with its close button. Shared Admin notices elsewhere expose a dismiss action, preserve failure/conflict state and keep Retry/Reload controls after dismissal. Form validation stays visible.

## Permissions and enforcement

Built-ins retain their original effective capability checks. Custom definitions use a separate allowlisted `resource.action` set:

| Sections | Actions |
| --- | --- |
| Products, categories, pages, blog, FAQs, team, contact, navigation, solutions, learning resources, videos | Read, create, update, publish, archive |
| Inventory and orders | Read, update |
| Inquiries | Read, update, remove from inbox |
| Media | Read, create/upload, update |

Each mutation requires read for that section. Publish/archive also requires update. Publish governs unpublish as well. CMS archive withdraws the record; it does not hard-delete it. Restore requires update. Inquiry removal retains the message, notes, attachments and audit history. Media update includes publication/public-use flags and archival; its existing publication guards also apply. Related category/product labels may appear as contextual data in authorized product/inventory views without granting access to those other editors.

Custom roles never administer users/roles. `staff_can_manage_roles()` requires an actual ADMIN membership and the existing staff-management capability. In particular, a custom order-reader's compatibility grant cannot grant access to the directory, role RPCs or other people's membership rows. Clerk metadata is never an authorization source.

Custom roles materialize existing coarse capability rows for compatibility. Those rows are insufficient on their own: 51 authenticated privileged RPC signatures have explicit section/action or role-manager assertions. Generic CMS RPCs derive the resource from the requested/persisted kind. Original function OIDs, defaults, ACLs, validation, version guards and audit paths are preserved. Future migrations replacing these functions must retain the fine permission assertions; new authenticated Admin RPCs must be added to the permission inventory and isolation tests.

The product-save transaction has private initial-price helpers so create-only roles can price a new draft. Direct price updates still require Products → Update. Both internal overloads are revoked from anonymous/authenticated execution. Private media access uses media grants; custom upload compensation may remove only the uploader's own unregistered object. Published public media and private customer-file boundaries remain unchanged.

Navigation and action controls follow the fine grants. The database remains authoritative even when a stale browser still shows an old control. Changes to a definition refresh all affected compatibility grants and membership versions in the same serialized transaction; subsequent requests use the revised definition. No self-grant, protected-owner change or removal of the last ADMIN is permitted. Empty custom roles grant no Admin entry.

## API and data contract

- `GET /api/admin/users?query=&limit=25&offset=0`: ADMIN-only directory, limit 1–50, offset 0–5000, search up to 100 characters. Private/no-store and bounded projections.
- `GET /api/admin/role-definitions`: built-in/custom catalog. Up to 50 custom definitions; no definition deletion is exposed.
- `POST /api/admin/role-definitions`: `{key:null|string,name,description,permissions,expectedVersion,reason}`. Null key/version zero creates a server-generated key. Updates require the current version and cannot alter built-ins. Unique case-insensitive names, closed permission inputs, bounded reasons and audit events.
- `POST /api/admin/roles`: `{email,role,expectedVersion,reason,targetUserId}`. Selected unassigned accounts use explicit subject/version zero; existing memberships use their current version. API resolves the verified email and requires it to match the selected subject. `CUSTOMER` removes staff access. Same-origin bounded JSON; conflict requires reloading/reviewing the latest state.
- `staff_role_definitions` and definition events have RLS and no runtime direct table grants. Membership direct writes remain revoked. The protected owner's assignment was preserved.

Applied development migrations: `20261101143000_custom-staff-roles.sql`, `20261101143500_staff-user-summaries.sql`, `20261101144000_custom-media-cleanup.sql`, `20261101150000_staff-user-removal.sql` and `20261101151000_serialized-removal-guard.sql`. The summary/cleanup migrations are forward fixes for the correlated subject lookup and uploader cleanup boundary; applied migrations are not edited in place.

## Verification

The [sanitized evidence record](verification/admin-custom-roles.json) records the checks. Use Node 24 with the linked development project:

```sh
node --test tests/admin-access-contract.test.mjs tests/admin-roles-validation.test.mjs tests/admin-user-removal.test.mjs tests/admin-notice.test.mjs components/admin/admin-search.test.mjs
node --env-file=.env.local tests/admin-custom-roles-isolation.mjs
```

The isolation harness defaults to localhost:3000; set `PHASE2_APP_BASE_URL` for another localhost port. It creates two disposable development identities, uses real sessions/APIs/RPCs and removes its own fixtures. An interrupted run leaves an ignored checkpoint and requires `--cleanup` before another run. Never use it against live credentials or real customer accounts.

Browser checks used the owner's existing session without changing identity: directory/search, actual nonzero historical order counts, protected row, custom-role creation, dependency selection, CUSTOMER revocation of a disposable account, success feedback, light/dark, 390px viewport, modal initial focus/Escape and internal horizontal scrolling. Permission-negative tests use disposable sessions through APIs/direct RPCs; a separate browser sign-in as every custom permission combination was not performed. No real orders, stock, payments, email or invoices were changed.

Additional verification: real disposable identity deletion via both API and browser, idempotent retry, self/protected/stale-request denial, unchanged order-history snapshots, warning/cancel/typed-confirmation, focus returned to search after removal, success-toast close, and dismissed errors retaining disabled conflict saves. Both disposable identities and their receipts were cleaned. Independent review found and fixed the queued-assignment race; live function inspection confirmed the receipt check is inside the lock. Deliberate provider-timeout cases use offline injected tests; no account other than this checkpoint’s disposable users was removed.
