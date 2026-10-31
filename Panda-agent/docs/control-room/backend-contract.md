# RAG Control Room backend contract

Implementation update: the bounded intake APIs are implemented and development-verified. See [actual results and limits](verification.md). The proposal language below records the original design; it does not imply that deferred fetching, indexing, evaluation or customer-runtime capabilities exist.

31 October 2026. Source-only contract for the owner's specific authorization to add documents/external knowledge, test/evaluate, and browser-validate the existing `/admin/rag-control-room` shell. Root owns subsequent implementation coordination, one additive migration and any development apply. This document performs no service, database, storage, model, UI or source mutation. It does not activate P6–P9, customer transport, payments, email, worker execution, release promotion or deployment.

## First usable checkpoint

Connect genuine-ADMIN overview metadata, a bounded intake list/detail, external-link metadata submissions, and private document submissions. New material remains separate, quarantined and unavailable to retrieval. Show actual runtime/evaluation unavailability; saving an intake must not pretend to parse, embed, schedule a worker or publish knowledge. The existing Admin theme and UI ownership remain unchanged.

The applied P4 `panda_agent_sources.canonical_url` constraint accepts only PandaByte product pages. Preserve it and every existing canonical source/version/chunk/release/job constraint and grant. External URLs and uploaded documents go into **new intake relations**, never that canonical table or CMS. Accepting an intake for preparation is not canonical approval or promotion.

## Exact existing identity and HTTP reuse

| Existing source | Reuse and boundary |
| --- | --- |
| `lib/insforge/server.ts` → `createInsforgeServerClient()` | Calls Clerk `auth()`, requires `isAuthenticated` and `sessionStatus === 'active'`, obtains `getToken({ template: 'insforge' })`, creates a user-scoped InsForge SDK client. No token failure/operator-key fallback. |
| `lib/authorization.ts` → `requireCapability()` / `getStaffAccess()` | Existing capability helpers; neither proves genuine ADMIN membership. A user with `staff.manage`, media/content permissions or any staff access is not automatically admitted here. No existing `requireAdmin` helper was found. |
| `public.requesting_user_id()` in `migrations/20261023171953_clerk-identity.sql` | Derives the **TEXT** subject from `auth.jwt()->>'sub'`; no browser actor/email/metadata role input. |
| `public.staff_role_memberships` and `staff_roles_select` in `migrations/20261024115158_staff-roles.sql` | Holds actual `role='ADMIN'`. Its SELECT policy permits a user's own membership read; use that row, not a directory/listing capability as an Admin shortcut. Preserve protected owner membership. |
| `lib/storage/http.ts` → `isSameOriginRequest()` / `readBoundedBody()` | Apply same-origin checking to every mutation and bounded byte reads **before** JSON/multipart parsing. |
| `lib/observability/events.ts` → `operationalJson()` | Reuse bounded allowlisted diagnostics/private response patterns, as in `app/api/admin/roles/route.ts`; no raw SQL/provider/body/file content in errors. |

Application admission: get the active Clerk `userId`; use `createInsforgeServerClient()` to select only `role` from the caller's own `staff_role_memberships` row with `user_id=userId` and a one-row bound. Missing/non-ADMIN membership is 403, missing session 401, token/database failure 503. This proposed small Panda-local assertion must be implemented; it is not an existing helper.

Every new RPC and storage policy independently requires a nonempty `public.requesting_user_id()` with an existing `staff_role_memberships(user_id = requesting_user_id(), role = 'ADMIN')` row. Check current membership on every request/mutation; route protection alone is insufficient. Use narrow SECURITY DEFINER RPCs with a fixed safe search path and explicit EXECUTE revocations. An internal ADMIN assertion helper need not be directly executable by clients. No raw table grants, new identity provider, added staff capability, email allowlist or client role flag is needed.

## Proposed endpoint surface

Paths below are proposals to coordinate with the UI/root implementer, not existing routes. All responses use `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`. All operations require genuine ADMIN, including reads and unavailable evaluation endpoints.

| Endpoint | Request and actual behavior |
| --- | --- |
| `GET /api/admin/panda-agent/overview` | Narrow aggregate metadata from current canonical/intake state plus server-known availability. Report sealed inactive candidates as inactive, never active production knowledge. Counts are queried, not constants copied from old reports. |
| `GET /api/admin/panda-agent/intakes` | Allowlisted `status`, `limit` (default 20, max 50), bounded cursor. Stable `created_at,id` order; no arbitrary columns/sort expressions or unbounded search. Return only safe DTOs. |
| `GET /api/admin/panda-agent/intakes/:reference` | Opaque access-checked reference; safe metadata only. No original download, raw text, object URL or raw provenance. |
| `POST /api/admin/panda-agent/intakes` | JSON link metadata, max 8 KiB: allowlisted `kind='link'`, `title` (1–180 chars), `sourceUrl` (max 2,048), `publisher` (optional, max 120), `purpose` (max 500), rights statement/evidence (max 1,000). Persist pending review; **no request to the URL, DNS lookup, preview fetch or crawler**. |
| `POST /api/admin/panda-agent/intakes/upload` | Exactly one multipart `file`, plus bounded title/publisher/purpose/rights metadata. Accept PDF/MD/TXT only, file size **1–3,145,728 bytes (3 MiB)**, total request max 3 MiB + 32 KiB. Save privately/quarantined; no parser, OCR, embedding or inference call. |
| `PATCH /api/admin/panda-agent/intakes/:reference/review` | Allowlisted `decision='accept_for_preparation'|'reject'`, `expectedVersion`, bounded reason and explicit rights decision/evidence. A reviewed intake remains outside canonical retrieval. No client may set worker success, eligibility generation, canonical IDs, active state or scores. |
| `GET /api/admin/panda-agent/evaluation-case-sets` | Server-registered case-set keys, immutable file hash, counts and honest classification (`source_visible_engineering`, `heldOut=false`). Do not send expected answers, quotations or private handles to the browser. Missing owner pack remains missing. |
| `POST /api/admin/panda-agent/evaluations` | JSON max 4 KiB: server-known `caseSetKey` and expected admitted corpus fingerprint only. Reject arbitrary questions/cases, answer keys, source IDs, native workspace URLs, prompts, tools, models and ranking controls. While verified durable evaluation execution is absent, return **503 `runtime_unavailable`**, create no fake queued/successful run, and spend nothing. |

Keep job/release/extension management controls disabled unless their actual separately gated operations exist. Do not introduce generic proxy, arbitrary SQL/filter, fetch, purge, download or promotion endpoints to make UI buttons appear functional. Evaluation availability can be false while metadata/intake endpoints work.

## Safe DTOs and review semantics

- Overview: `{ counts, candidateSummary, intakeSummary, availability }`. Availability separately covers metadata, private upload, retrieval and evaluation; include bounded reason codes. A temporary worker that was cleaned up is not an available durable runtime. No internal service hostnames, model secrets, native collections or object locators.
- Intake: `{ reference, title, kind, status, rightsStatus, createdAt, updatedAt, version, uploadSummary?, sourceSummary?, reviewSummary? }`. `uploadSummary` contains normalized display filename, detected type and byte count; `sourceSummary` contains only validated candidate public URL/publisher and `fetched=false`; review summary has bounded decision/reason/time. No actor Clerk subjects, database/session IDs printed in UI, private bucket/key, signed URL, provider response, full provenance or file contents. Controls may carry an opaque reference/version without displaying database identifiers.
- Statuses distinguish `upload_pending`, `pending_review`, `accepted_for_preparation`, `rejected`, `upload_failed` and `upload_outcome_unknown`. Only verified private write/readback may move pending upload to pending review. `accepted_for_preparation` does not mean parsed, technically verified, eligible, indexed or published.
- Rights are separate (`unknown`, `permitted`, `denied`) with bounded evidence and server-derived reviewer/time. A browser checkbox is an attributed permission statement to review; it cannot certify source truth, redistribution or engineering applicability. Unknown/denied rights cannot advance into preparation.
- Future canonical citation DTOs must project only necessary capture time, canonical URL and safe locator fields. Current canonical provenance contains private object pointers. Historical locator `pending_review` and earlier readback quarantine are not current source/version approval authority.

## Private upload boundary

Use a dedicated private intake bucket, not the public editorial-media path. Root must verify the actual InsForge storage schema/configuration/policies before implementing the reviewed migration; do not guess bucket/object SQL columns. Enforce genuine ADMIN for writing the fixed intake prefix; deny anonymous/customer/non-ADMIN reads and writes. Do not expose object keys or upload responses to the browser. The Next handler uses the existing user-scoped client; no service/admin key is introduced for the request.

Check byte limit before multipart parsing, reject duplicate/unknown fields and multiple files, then check filename extension, declared MIME and actual content. PDF must have the expected PDF signature and remains an unexecuted quarantined binary; signature checking is not a parse/malware/engineering validation claim. MD/TXT require valid UTF-8, no NUL/binary payload; retain exact bytes and treat Markdown/HTML as untrusted text, never render/execute it. Reject archives, Office files, images, executable content, empty files and extension/MIME mismatches. Normalize display filenames independently of storage names; never use user paths as object keys.

Server-compute SHA-256 and a new immutable object name under a fixed prefix. Reserve a durable intake/upload intent first, then write private bytes, verify the actual result/readback identity and finalize metadata. Database and storage are not one transaction. If a write outcome is unknown, retain an explicit unknown state for reconciliation; do not blindly overwrite/retry, claim successful ingestion or delete unrelated objects. Cleanup/compensation may target only a newly created object proven to belong to that exact failed attempt. Preserve all canonical originals and other-chat artifacts. If bucket/config/policy validation is missing, uploads return 503 while metadata intake remains usable.

A user-scoped JWT can call its granted RPC/storage operations directly; a server-only module is not an additional database credential boundary. Therefore direct calls must not be able to manufacture a trusted `verified=true`, parser-success or hash-readback receipt. Verify the actual storage binding in the trusted finalization path using the observed storage metadata/policy capabilities; where it cannot be independently enforced, keep that metadata explicitly unverified/pending and require real readback before any preparation step. Do not add a guessed storage schema, elevated request key or fake validation marker to conceal this boundary. DTO omission prevents app responses from disclosing object pointers; it is not a claim that an authorized ADMIN's native storage privileges are inaccessible with that ADMIN's token.

## External-source boundary

Initial intake accepts only bounded HTTPS candidate URLs with no credentials, fragments, sensitive query tokens or nonstandard ports; reject localhost/private/link-local/metadata IP literals and obviously local names. This is input validation, **not SSRF certification**: no DNS/network request happens during intake. Store an explicitly unfetched submission, independent of canonical product mappings. Do not infer an external document's rights or content from its URL/title.

Before a future fetch capability is enabled, separately implement and verify an approved host/path allowlist, all-address DNS resolution and public-address checking, redirect-by-redirect scheme/host/IP validation, DNS-rebinding protection tied to the actual connection, metadata/loopback/private IPv4/IPv6 and IPv4-mapped denial, credential/unsafe-scheme denial, bounded redirects/time/bytes/decompression and isolated parsers. Do not fetch a submitted URL as a “validation” or form-preview convenience in this checkpoint. An unrestricted URL queue is not authorized fetch execution.

## One additive migration and audit

Root can prepare one additive migration for minimal `panda_agent_intakes` and `panda_agent_intake_events`, narrow genuine-ADMIN read/create/finalize/review RPCs, optimistic versions, idempotency and the verified private storage policy where supported. Keep full object pointers, binary hashes, original filename and actor TEXT subjects internal. Mutation actor/time come from the database/request identity, never request JSON. Bound every text, JSON field and list.

Use a client-generated bounded idempotency key scoped to the authenticated actor and operation, with a server-computed request fingerprint binding metadata and exact file hash when applicable. Same key/same fingerprint returns the same DTO; changed payload returns 409. A pending/unknown upload is not silently retried. Review requires expected version and appends an immutable event recording decision/rights/reason/version/derived actor. Duplicate review, stale version and incompatible state return 409. No generic UPDATE/PATCH bypass, automatic canonical mapping or applied P4 constraint widening.

Do not reuse project-admin-only P4 ingestion RPCs from a customer/Admin web handler using an elevated key. This migration adds no worker, model credentials, scheduler, parser-success receipt, active-release pointer or promotion route. Existing protected owner access and all CMS/commerce records remain unchanged.

## Failure and verification contract

Return bounded `{ error: { code } }`: 400 invalid/unknown/duplicate input; 401 missing/inactive Clerk session; 403 non-ADMIN or cross-origin mutation; 404 unknown accessible reference; 409 idempotency/version/state conflict; 413 byte limit; 415 unsupported content type; 429 bounded abuse limit where enforced; 503 database/storage/runtime unavailable. Never surface raw SQL/storage/provider errors. All failures retain private/no-store headers, and no unavailable response records a successful or queued worker/evaluation.

After root implementation, verify disposable fixtures only:

1. Signed-out, CUSTOMER, each non-ADMIN staff role, a capability-only non-ADMIN and genuine ADMIN; forged role/subject fields denied; role removal denies subsequent route **and direct RPC/storage** calls. SQL/JWT-claim simulation is labeled simulation; real Clerk browser/API checks remain separate.
2. Exact 3 MiB boundary and oversized streamed bodies without trusted Content-Length; malformed UTF-8/NUL, fake PDF, MIME/extension mismatch, duplicate multipart fields, second file and unsafe names. Inspect private access denial; never upload source archives or canonical originals as fixtures.
3. Concurrent duplicate intake and changed-payload key reuse, stale review versions, unknown upload outcome, storage failure and interrupted finalize. No duplicate effective submission, blind overwrite, unrelated cleanup or false success.
4. External URL intake creates metadata only: network spies show zero HTTP/DNS/redirect requests, including localhost/metadata/private-IP attempts. Future fetch safety is not reported as passed from this no-fetch test.
5. Overview/list DTO allowlist and raw-object-pointer exclusion; current queried counts and inactive release labels; pagination bounds; no raw text, actor IDs, secrets or provider errors in browser/logs.
6. Server-known case sets only; arbitrary client cases/model/ranking/proxy inputs rejected. With runtime unavailable, evaluation returns 503 with zero model/job-success writes. A saved intake never changes canonical membership or CMS.
7. Browser flow: existing genuine Admin session → overview → disposable link/file intake → honest pending/review states and errors; refresh/list persistence and denied non-ADMIN access. Preserve owner session, Admin theme and disabled runtime controls. Record actual browser → API → data evidence and limits.

No tests or browser/runtime actions in this section were executed by this contract-writing task. Uploaded-document parsing, external fetching, automatic ingestion, full evaluation, canonical promotion and customer activation require their actual implemented gates; this specific Control Room authorization does not imply they have passed.
