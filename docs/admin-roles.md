> Historical built-in-role checkpoint. The [1 November Users & custom roles contract](admin-users-roles.md) supersedes the directory restriction, fixed-role-only rule, capability-only access administration and initial-assignment DTO below. Retained for migration provenance.

# Admin roles and non-commerce hardening

24 October 2026: the owner explicitly deferred checkout/payments and authorized securing the remaining backend, role-based administration, and default ADMIN access for `rajrabidas001@gmail.com`. This supersedes the prior instruction that the owner remain a normal customer. No payment configuration, order implementation, deployment or Phase 6 migration/capacity work is resumed. Production readiness remains evidence-based, with release limits recorded separately.

## Identity and authorization

Resolve the exact verified email in the existing Clerk development instance once, verify a unique existing account, then bind its opaque Clerk subject in InsForge. Do not create a second account, use email/client metadata as runtime authority, or grant every newly registered matching email automatically. Root applies the approved owner bootstrap via a project-admin-only RPC; no privileged key enters the app runtime for roles.

Keep all existing seven capability checks and owner RLS. Roles atomically materialize the same `staff_capabilities` rows so every existing direct database check remains effective. One role per assigned subject; adopting a role replaces all manual grants for that subject, shown explicitly in UI. Manual operator capability RPC must refuse changes for role-managed subjects. Customers without a role retain their previous customer permissions. Never grant access to private customer profiles, addresses or uploads merely because someone is staff.

| Role | Capabilities |
| --- | --- |
| ADMIN | all seven existing capabilities |
| EDITOR | content.edit, content.publish, media.manage |
| CATALOG | catalog.edit, media.manage, orders.manage (current inventory permission; payments/order placement remain deferred) |
| SUPPORT | inquiries.manage |
| CUSTOMER | no staff capabilities (revocation tombstone retains optimistic version) |

Only `staff.manage` may list/manage staff roles. No self-role changes, no modifying a protected bootstrap admin through the app, and no removing the last ADMIN. Serialize role changes and reject stale expected versions. Audit actor, target, old/new role and reason. Limits: 100 active staff memberships, list ≤50 per page, ≤5000 offset; closed inputs and bounded JSON. No credential/session/Clerk settings changes in this workflow.

## Shared implementation contract

Root owns migrations, owner bootstrap, authorization integration, verification and commits. API worker owns `lib/admin/roles-validation.ts`, `app/api/admin/roles/**`, `tests/admin-roles-validation.test.mjs`. UI worker owns `components/admin/roles-screen.tsx`, `components/admin/roles.module.css`, `app/admin/users/page.tsx`; reuse existing approved admin shell/tokens rather than generating a new design. Security reviewer is read-only until root assigns a concrete fix.

- SQL table `staff_role_memberships`: user_id text PK, role enum allowlist above, version positive safe integer, protected boolean, timestamps/assigned_by. Owner-only or staff.manage SELECT RLS; direct DML revoked. Role audit events private, no direct customer writes/reads.
- `staff_list_roles(p_limit integer DEFAULT 25,p_offset integer DEFAULT 0)` requires `staff.manage`, returns `{items:[{userId,role,version,protected,updatedAt}],total}` ordered updated_at descending then user_id. Do not expose a whole Clerk directory. Existing legacy capability holders may not yet have a role; bootstrap adoption is explicit.
- `staff_set_role(p_user_id text,p_role text,p_expected_version bigint,p_reason text)` requires `staff.manage`, derives actor, applies constraints/lock/version, returns the membership DTO. Role assignment is only to an existing uniquely matched verified Clerk identity through the app API. Direct RPC permission is Admin's explicit authority to manage opaque subjects; no customer-access bypass.
- `project_admin_set_staff_role(p_user_id text,p_role text,p_protected boolean,p_reason text)` executable only by project_admin for initial/recovery setup. No app key/client calls it. Root verifies identity before bootstrap; ownership is not recreated from email on each request.
- `GET /api/admin/roles?limit=25&offset=0` returns SQL list, active Clerk + staff.manage, no-store/nosniff, bounded closed query. `POST /api/admin/roles` body `{email,role,expectedVersion,reason}`. Resolve exact case-insensitive verified existing Clerk email using server-only Clerk SDK, with a bounded query; reject missing/unverified/ambiguous matches. Existing row updates must match expectedVersion; initial version 0. No user IDs, capabilities, protected flags or other fields accepted from client. Return `{membership:<DTO>}`. SQL forbids self/protected/last-admin transitions even if called directly.
- Safe errors `{error:{code}}`: unauthorized 401, forbidden 403, invalid_role_request 400, identity_not_found 404 (Admin-only), conflict 409, protected_admin 409, self_change 409, last_admin 409, staff_limit 409, backend_unavailable 503; same-origin JSON body ≤4096 bytes and standard safe body errors. Never echo SQL/provider errors or keys.
- UI shows role matrix, page of memberships/versions, protected marker, exact verified target email + role + mandatory reason form. For changing a listed row, show/select its current subject/version and require confirmed target email resolves to that same subject: API body additionally accepts `targetUserId` only for existing changes and validates it against Clerk lookup. Initial assignment `targetUserId:null,expectedVersion:0`. Existing changes require targetUserId matching membership subject, expectedVersion>0. Root/API worker update strict validator accordingly. Do not hide that role assignment replaces manual grants. CUSTOMER removes staff access. No self/protected controls. User must review successful changes; errors preserve form and require reloading on conflicts.

## Required evidence

Focused parser tests; two disposable development Clerk identities for role boundaries, spoofed metadata, privilege escalation/direct DML denial, stale versions and grant/revoke effects across real admin APIs/database checks. Test protected-owner/self/last-admin invariants without removing the owner's access. Clean fixture-only memberships/events/grants; preserve owner ADMIN and its audit trail. Built-in browser verifies owner admin access, role listing/form and responsive states; restore owner Google session. Run lint/typecheck/build, existing relevant regressions and dependency audit; commit verified changes locally. Report what remains untested, particularly deployment/CSP enforcement, workload limits, notifications and recovery.
