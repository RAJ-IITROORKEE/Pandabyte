# Phase 6 — access-boundary follow-up

25 October 2026. Read-only source review of account, Admin, private-file, editorial-media, publication, and InsForge access boundaries. No database or CLI commands were run for this review; root owns the live isolation suites and integration.

## Source review

No new cross-customer read/write path or staff-capability bypass was found in the inspected routes and migrations. The controls are enforced at more than the UI layer:

- The InsForge server client uses the active Clerk session's `insforge` token. Profile reads and writes scope by the Clerk subject; address RPCs derive the subject inside PostgreSQL. Address bodies reject foreign owner fields and mutations require same-origin requests.
- Account-file downloads require an active session, a valid file UUID, and the exact `<current Clerk subject>/<UUID>.txt` key. The table and storage also have owner-bound RLS; downloads return private, non-cacheable text attachments.
- Role management requires `staff.manage`, same-origin mutation, a uniquely resolved verified Clerk email, and a database role RPC with version, self-change, protected-Admin, and last-Admin checks. The browser's omission of internal identifiers does not replace these checks.
- Phase 3 business-table DML is revoked for runtime roles. Admin/public RPCs perform capability or published-projection checks in PostgreSQL. The media route accepts only a UUID, canonical `assets/<UUID>.(webp|pdf)` key, bounded metadata, and a currently published media projection for public delivery; it checks the published projection again after downloading. Draft delivery requires a staff capability.

The important remaining access-boundary risk is the broad server-only `INSFORGE_EDITORIAL_STORAGE_READ_KEY` used for published media. The route narrows each download using the checks above, but the InsForge key itself is a project-level privileged credential, not an object-scoped read credential. This is an operational blast-radius risk requiring protected server configuration, limited operator access, rotation planning, and verification before production; this review did not observe misuse or an application path that returns arbitrary bucket keys. See [Phase 3 operations](phase-3-operations.md) and [Phase 6 recovery](phase-6-recovery.md).

Phase 6 readiness currently records RLS enabled on 27/27 public tables, explicitly as a flag-only observation. That is not an effective grants/policies check. Earlier phase evidence reports real Clerk-token/RLS/API isolation runs, but this review did not rerun them. Current effective access should be confirmed by the existing sequential integration suites below.

Root subsequently ran and passed the current identity, customer/private-file, address, role, publishing/media and storefront suites with disposable development identities. This includes exact stored-byte staff/public image delivery and public withdrawal denial. Ownership-checked fixture cleanup and an independent read-only check passed, preserving the owner's protected Admin and seven capabilities. The real owner account/Admin browser reads also passed. These runtime results are recorded in [the follow-up evidence](verification/phase-6-media-followup.json); they do not verify production-provider settings or a disaster restore.

## Recommended local verification order

Run with the local production preview and the existing development-only `.env.local` / InsForge link. Keep these suites sequential because they create disposable Clerk users and shared backend fixture state; do not run them in parallel.

1. `npm run test:auth` — signed-out HTTP boundaries.
2. `npm run test:backend` — anonymous, malformed, and forged-token rejection.
3. `npm run test:access` — profile, capability, and private-account-file RLS/API isolation.
4. `npm run test:addresses` — address API/RPC ownership, direct-table denials, and concurrency.
5. `npm run test:roles` — role grants, revocation, protected owner, and concurrency.
6. `npm run test:publishing` — editorial RPC/API capability checks, draft/live publication, media storage/delivery, and cross-boundary customer-file denial.

Do not pass `--keep-fixtures` for this sequence. If a browser review needs retained fixtures, run one suite at a time and finish with that suite's `--cleanup` mode before continuing. After a failure, let the suite's `finally` cleanup finish. If its documented fixture file remains, run only that suite's cleanup command and verify cleanup succeeded before starting another suite. Preserve the fixture file if cleanup fails; do not delete it or manually delete backend rows. Preserve the protected owner ADMIN, the owner's Clerk session, and other `.bootstrap` / UI-chat artifacts. The suite-specific fixture files and cleanup flags are documented in [Phase 2 access](phase-2-access.md), [Phase 3 operations](phase-3-operations.md), and the corresponding test scripts.

## Restore-feasibility note

The installed InsForge CLI guide documents Cloud restore as an in-place overwrite of the project's current database and storage. It does not document restoring a project backup into a separate isolated clone. The guide does not establish current Free-plan backup or restore entitlements. The prior Phase 6 recovery review recorded an empty backup inventory; neither that inventory nor the CLI documentation proves an isolated restore is feasible on Free. No backup, export, branch, billing action, provisioning, or restore was attempted here. Treat isolated database-plus-file restore as an open release gate, not a passed check. See [Phase 6 recovery](phase-6-recovery.md).
