# Control Room development verification

31 October 2026. This checkpoint implements Admin intake metadata and quarantined private uploads. Customer chat, external fetching, parsing, indexing, promotion and evaluation execution remain unavailable.

## Implemented and checked

`src/control-room/clerk.ts` requires an active Clerk session and the caller's exact ADMIN membership through a fresh user-scoped InsForge client. No browser role, email shortcut or privileged application key. Reviewed migrations `90003` and `90004` were applied to the selected development project: separate intake/audit tables, narrow Admin RPCs and restrictive private-storage policies. Raw intake SELECT remains denied to anon/authenticated.

Links register bounded HTTPS DNS-name metadata only, without query strings or any network request. Uploads accept one PDF/MD/TXT up to 3 MiB; PDF magic is a literal byte check, not a parser or malware scan. An atomic reservation discriminator prevents replay writes. Successful server readback remains an untrusted report: integrity stays pending. Unknown outcomes are not blindly retried. Reviews use expected versions and cannot activate retrieval.

The UI chat exercised the genuine owner in the browser using normal same-origin credentials, without extracting JWTs:

| Check | Observed result |
| --- | --- |
| Exact Admin page guard | Owner page rendered |
| Eight anonymous API method checks | 401, private/no-store |
| Owner overview, intake and case-set reads | 200, private/no-store |
| Link create and exact replay | 200, same reference/version 1 |
| Same key, changed payload | 409 |
| Link rejection and stale review | Rejected version 2; stale request 409 |
| Detail and filtered list | 200, rejected fixture present |
| Private TXT upload and exact replay | 200, same reference/version 2, integrity pending |
| Uploaded fixture rejection | Rejected version 3 |
| Evaluation submission | 503 runtime_unavailable, no job/model call |

Root separately tested the owned private object and download-strategy GET without credentials: both returned **401**. Actual database inspection confirmed the private bucket, enabled storage RLS, five target policies, three rejected fixtures, seven audit events and one retained private 62-byte validation object. No SQL fixture actors remain. Canonical counts stay 44 sources, 292 chunks and 284 sealed inactive candidate members. The labeled fixtures/audit are intentionally retained; no product or commerce records changed.

Handler/store tests passed **22/22**; combined retrieval/answer/Control Room tests passed **47/47**. Panda lint/typecheck, parent route typecheck and the isolated production build passed. The first build found stale generated types for a removed temporary browser probe; regenerating route types resolved that failure. Ignored build output stayed inside Panda-agent; generated parent configuration changes were removed and default route types regenerated.

The local upload flag was enabled only for testing, then disabled by restarting development. Credential files and hosted settings were untouched. Enable `PANDA_AGENT_CONTROL_ROOM_UPLOADS_ENABLED` only after validating the deployment's private bucket and policies.

## Remaining gates

The official CLI gateway rejected `tests/sql/control-room-smoke.sql` because SET ROLE/session configuration is unsupported. It and the storage rollback fixture remain **unexecuted** operator reference source; no disguised workaround was attempted. Historical passed Phase 4 operator SQL tests are separate.

Real second-user/non-Admin Clerk isolation, simultaneous idempotency/revocation races and real PDF/Markdown upload paths remain unverified. Source review and mocks do not replace them. Parsing is absent, so no hostile-file parsing acceptance is claimed.

Trusted customer adapters, a durable authenticated runtime, a maintained native image baseline and independent held-out product evaluation remain open. Source-visible engineering cases are not a held-out benchmark. No Phase 6 activation or general Phase 8 resumption is implied.

Applied source SHA-256: `90003` = `7d2cac219f1c22fc94a53deae1ec163ec818a2cd8b1829c4d0223fa14f4ff1be`; `90004` = `d6798463aafcd53356a7881e6c24059992e884ea04dd169f7ea7b42266748b7e`.
