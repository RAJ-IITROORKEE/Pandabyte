# Phase 2 customer, staff and private-file foundation

Target: the existing owner-selected **development** Clerk instance and InsForge project. This work does not provision production, publish a repository, assign the owner's customer account staff access, or implement Phase 3 publishing/commerce.

## Access contracts

| Resource | Customer | Staff capability | Administrative tooling |
| --- | --- | --- | --- |
| Customer profile | Read/insert own row; update only display name | No extra access | Controlled development cleanup only |
| Capability grants | Read own grants; no writes | No self-grants, including staff.manage | Grant/revoke through the restricted, audited SQL function |
| Capability audit | No access | No runtime access | Project administrator only |
| File metadata | Read/insert/delete own records; immutable ownership/key | No extra access | Scoped recovery/cleanup |
| Private storage | Own subject, uploader and path for read/insert/delete; overwrite denied | No extra access | Scoped recovery/cleanup |

Profiles use text Clerk subjects, RLS and explicit column grants. API bodies accept only `{ displayName }`, bounded to 1 KiB, with a 120-character limit. Unknown fields, role injection, cross-origin cookie mutations and oversized streams are rejected. Ownership and creation time cannot be updated by runtime users.

The initial staff shell at `/staff` and `/api/staff/access` requires `content.edit`. Other defined capability keys are `catalog.edit`, `content.publish`, `orders.manage` and `staff.manage`; each later business endpoint must enforce its required capability. No role label or user-editable Clerk metadata grants access. The initial shell confirms access only; it does not claim to implement content editing or inventory operations.

`public.set_staff_capability(target_user_id, capability_name, enabled, reason)` is executable only by `project_admin`. It updates grants and records an event in the same transaction. Runtime users, even a content editor, cannot invoke it or mutate the grant/audit tables. A human bootstrap remains an owner decision: verify the intended Clerk subject before a deliberate CLI grant. The audit currently identifies the database administrator role and reason; a production operator identity and retention policy still need definition.

## Private storage

The bucket `private-account-files` is explicitly **private**. The account UI accepts nonempty UTF-8 `.txt` files up to 64 KiB, and caps the actual multipart request stream at 96 KiB. Both upload and download check actual bytes, forbidden controls, MIME and safe filenames. Server-generated UUIDs bind metadata IDs to keys. Downloads use the owner-checked key rather than the stored URL, return an attachment with `nosniff`, and use `private, no-store`.

The storage RLS policies separately enforce owner subject/uploader/path. A restrictive INSERT policy validates upload metadata: declared size up to 64 KiB, declared `text/plain`, and canonical UUID `.txt` paths. The app separately checks the actual request/file bytes. Database policies cannot inspect payload bytes: direct SDK users may store invalid text in their own private object; the app download endpoint rejects it. No arbitrary metadata URL is fetched. Per-user total storage/count quotas and additional file types remain release/policy work; the list is bounded to the 50 newest files.

Uploads compensate a failed metadata insert by removing the object. That cleanup is best effort; a provider failure can leave an owner-private orphan requiring reconciliation. Delete removes the object before metadata and treats an already-missing object as successful cleanup, so a retry can complete metadata deletion. No external side effect and SQL transaction are falsely described as atomic.

## Migrations and recovery

Root owns the three new migrations: [access controls](../migrations/20261023173124_phase2-access-controls.sql), [direct-upload limits](../migrations/20261023173853_private-file-limits.sql), and [restrictive storage boundaries](../migrations/20261023180315_private-storage-boundaries.sql). Independent Luna review approved the grant/RLS structure before application. The development target initially had no business tables/buckets, storage RLS enabled and zero policies. Bucket creation then installed four permissive provider owner policies, which ORed with the custom policies and allowed a disposable user to create an object under another subject’s path. The corrective restrictive boundary and UPDATE denial preserve provider defaults while constraining this bucket. Live regression results determine whether the gate passes. These are additive changes on that isolated development target; no existing production data was touched and no paid EC2 branch was provisioned.

Applied migrations are immutable. A compensating migration must first remove only the six `private_account_files_*` storage policies, then the application functions/tables in dependency order, without `CASCADE`. Keep storage RLS enabled, as it was enabled before this work. Review existing storage grants before revoking any shared privilege. Preserve actual customer data; destroying tables is not a routine production rollback.

The CLI's pre-change schema export returned text in JSON mode and did not write its requested output file. The original committed identity migration remains the baseline. A current schema snapshot and migration history can support review; neither proves a database/file backup restore. Full restore drills remain a production release gate.

## Repeatable checks

- `npm run check`: lint, TypeScript and production build.
- `npm run test:unit`: focused validation/stream-bound checks.
- `npm run test:auth`: signed-out HTTP checks with localhost running.
- `npm run test:backend`: anonymous/malformed/forged token rejection.
- `npm run test:access`: explicitly creates two disposable development Clerk users, obtains real provider sessions/tokens, tests SDK RLS and app APIs, and cleans up in `finally`. It refuses mismatched project/instance IDs or live keys. It requires the existing ignored CLI linkage and `.env.local`.

For an interactive built-in-browser check, run `npm run test:access -- --keep-fixtures`; this retains only fixture identifiers/session IDs in ignored `.bootstrap/phase2-test-fixtures.json`, never raw tokens/passwords/keys. Finish with `npm run test:access -- --cleanup`. This privileged fixture workflow is deliberately separate from ordinary build/unit checks and is not automatically run in CI.

Live check results and any remaining Phase 2 gates are recorded in [phase progress](phase-progress.md) and the verification evidence; do not infer a passed gate from this contract document alone.
