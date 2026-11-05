# Panda Agent Phase 5 Implementation Plan

> **For agentic workers:** Use the existing bounded Terra implementation workers and Sol review with Root owning shared integration, migrations, operations and commits. Track each task below before advancing.

**Goal:** Connect optional private screenshot processing and pasted-error diagnostics to the existing chat, backed by reviewed, version-scoped vendor evidence and separately controlled read-only tools.

**Architecture:** Clerk and InsForge retain identity, owner/thread authority, source approval and durable chat records. The existing private FastAPI worker holds only bounded volatile image-processing scratch. TypeScript validates images, owns evidence policy and controls the chat transport. With no approved free vision route, production image reading stays unavailable and the working diagnostic path uses explicitly pasted text; constructor-injected vision fixtures cannot become a runtime fake mode.

**Tech Stack:** Existing Next.js/TypeScript, Sharp 0.35.5, InsForge PostgreSQL/RPC, private FastAPI/SQLite journal, standard Node HTTPS/DNS and existing htmlparser2. No new package is selected.

**Spec:** `Panda-agent/docs/lightweight-phase5-contract.md` and Phase 5 in the owner's `Downloads/prompt (1).md`.

## Global constraints

- Phase 4 is closed at `cee343e0b4fb62de012369af3eb8ff5b4521477d`; retain its tests, source protections, guide and ordinary QA path.
- Keep zero paid fallback, no live vision/model activation, no device operation, code execution, image generation, arbitrary URL or remote installation.
- Root alone writes/applies forward migrations; existing applied files stay immutable. No global Clerk/InsForge auth, commerce, Vercel, IAM or public-listener change.
- New UI requires approval of the actual Phase 5 Superdesign drafts. Backend preparation and testing proceed independently under the user's explicit execution instruction.
- Distinguish actual authenticated/hosted results, injected provider fixtures and unavailable vision. Do not label image contents as observed when no image reader ran.

## Review focus

1. A late upload after deletion/expiry must not recreate bytes; keep tombstones and fence the final rename.
2. A withdrawn or wrong-chip/version vendor source must disappear from new answers, history and replay without stranding a turn.
3. A repeated UUID with different public workflow/input must never reuse another workflow's authority or repeat an external invocation.
4. A disabled optional tool or interrupted image transfer must preserve the draft and ordinary QA, with bounded, honest outcomes.
5. DNS rebinding, mixed/special addresses, redirect tricks and private pasted error text must never reach an outbound document request.

## Frozen interfaces and budgets

- Public message union adds exactly `{requestId, diagnostic:{errorText,chip,framework,frameworkVersion,screenshotId?}}` alongside the existing question and guide unions. `errorText` is required, trimmed, <=1500 UTF-16 units; chip is `esp32|esp32c3|esp32c6|esp32s3`, framework is `esp-idf`; the initial server catalog accepts only exact `5.5.1`. A canonical diagnostic question includes scope and text and stays <=2000. No browser-supplied source/tool grant or URL.
- `src/diagnostics/contracts.ts` owns strict diagnostic and vendor DTO parsing. Public vendor citations have `kind:'vendor'`, `vendor:'espressif'`, exact chip/framework/frameworkVersion plus the existing safe citation fields. Product citations keep their existing validator. Public DTOs omit internal source/version IDs and private pointers.
- New diagnostic metadata shares existing owner/chat/request identity and protected answer hashing. It has its own HMAC namespace, immutable input, QA activation epoch and final vendor snapshot. Generic product/guide prepare/complete calls cannot operate a diagnostic turn. Reconciliation repeats only local reads; unknown external dispatch or save never grants retry.
- Screenshot API: `POST /api/panda-agent/chats/[id]/screenshots` accepts one bounded multipart PNG/JPEG, `assetId` and explicit `private-diagnostic-v1` consent; `GET .../screenshots/[assetId]` proxies current bytes; `DELETE` tombstones/removes only that owner's asset. InsForge reserves owner/thread/server expiry before transfer. Original filenames/paths are not authority or persisted history.
- BFF limits: one active decode before Sharp, input/output <=2 MiB, one page, <=4,194,304 pixels and <=2048 each dimension, full decode and PNG re-encode without metadata, <=5 seconds. Only a local thumbnail is rendered in chat; full-resolution bytes never enter history.
- Private image protocol: POST `/v1/images/upload|status|read|delete`; upload body is normalized PNG, controls are exact `{version:1,threadId,assetId}`. Capabilities have exactly `v,aud,action,sub,sid,threadId,assetId,bodySha256,imageSha256,mediaType,width,height,bytes,expiresAt,exp,nonce`. They bind `v:1`, `aud:'panda-image-v1'`, action `uploadimage|statusimage|readimage|deleteimage`, SHA-256 owner/current session, thread/asset UUID, separate request-body and normalized-image hashes, PNG MIME, integer dimensions/bytes/asset Unix expiry, <=60-second token expiry and one-use UUID nonce. For uploads both hashes match; controls hash their own JSON. Response receipt header `X-Panda-Image-Receipt` is hex HMAC-SHA256 of `panda-image-response-v1\n<nonce>\n<status>\n<SHA256(body)>\n<contentType>`. Content-Type is exactly `application/json` or `image/png`.
- Private image results: upload/status ready HTTP200 `{version:1,state:'ready',assetId,expiresAt,width,height,bytes,sha256}`; pending HTTP202 `{version:1,state:'pending'}`; missing/expired/deleted status/read HTTP410 `{version:1,state:'missing'|'expired'|'deleted'}`; delete HTTP200 `{version:1,state:'deleted'}`; failures `{version:1,state:'rejected',code:'invalid'|'replayed'|'conflict'|'quota'|'busy'|'unavailable'}` with 400/409/409/429/503/503. Read-ready is HTTP200 raw PNG. Only authenticated responses have receipts. Foreign owner/thread reads are missing, never existence disclosures. Match claims to immutable stored dimensions/bytes/hash/expiry; the BFF independently checks read bytes against InsForge's authoritative hash and current owner/session/expiry.
- Image request token uses the existing capability encoding: `base64url(JSON UTF-8) + '.' + base64url(HMAC-SHA256(secret, encodedSegment))` in the Bearer header. The exact audience/action/claims prevent cross-protocol use. Keep this request encoding distinct from the image response's explicitly hex-encoded receipt.
- Private cache: fixed 0700 `/tmp/panda-diagnostic-images`, only UUID leaves, no symlink following, <=16 assets/32 MiB including pending reservations, <=3 per owner, one active upload. Asset lifetime <=900 seconds; normal BFF lifetime is 900 seconds. Atomic temp write/rename plus shared SQLite metadata; no SQLite image blobs. Delete/expiry tombstones prevent delayed upload resurrection and remain until at least asset expiry+65 seconds; newly minted controls cannot renew an asset. Use the shared journal's one-use global nonce budget, with no reset or second unbounded nonce ledger. Startup/orphan sweep and a 60-second janitor work even when feature flags are off. Restart can expire scratch earlier; disclose that. A new current session of the same owner can access a still-valid asset; old session claims alone never replace fresh Clerk checks.
- Vendor evidence is separate from the sealed PandaByte source corpus: fixed official pinned catalog, pending immutable content versions, reviewed rights/attribution, exact chip/framework/version, current approved pointer and withdrawal epoch. SQL rechecks expiry, current source/rights, exact literal quote and scope after locks before save and before every public read/replay. Invalidated work becomes a fixed no-quote terminal note.
- `search_vendor_docs` is separately enabled and uses a fixed catalog ID/topic, never a client URL or pasted log. One read-only HTTPS lookup, <=2 redirects, one total <=10-second deadline, <=1 MiB wire HTML / <=20,000 text units, all DNS answers validated and the connection pinned with hostname-verified TLS. Results are dated external references, never automatic canonical evidence. Tool manifests include version/hash, schemas, permission, timeout, result cap, cost class and enabled state. Fake HTTP and vision providers exist only through constructor injection in tests; future MQTT/execution/image-generation providers stay disabled interfaces.

## Task 1 — Contracts, reviewed vendor extraction and optional tool boundary

**Files:** new `Panda-agent/src/diagnostics/{contracts,vendor-catalog,vendor-fetch,vendor-answer,tool-broker}.ts`; focused corresponding tests. Root owns shared citation/chat integration.

- [ ] Write failing strict-union, wrong chip/version, quote mismatch, unreviewed/withdrawn evidence and disabled-tool tests.
- [ ] Implement the pure contracts and fixed catalog. Verify pinned official text and its actual source/license attribution before any development ingestion.
- [ ] Implement bounded HTTPS transport/extraction and an injected read-only HTTP adapter; test private/mixed IPv4/IPv6, rebinding, redirect, encoding, byte/deadline and cancellation cases.
- [ ] Implement deterministic local-first evidence selection with current-snapshot revalidation. Never infer wiring or an executed fix.
- [ ] Run `node --test Panda-agent/tests/diagnostic-*.test.mjs` and targeted lint; independent review before integration.

## Task 2 — Normalized image and volatile scratch lifecycle

**Files:** new `src/diagnostics/{image-normalize,image-client}.ts`, `services/lightweight/lightweight/images.py`, focused TS/Python tests. Root modifies the private app entry/lifespan and public routes.

- [ ] Watch the image tests fail before implementation: malformed/animated/oversized/type mismatch, metadata retention, wrong owner/session/thread, duplicate nonce, quota, expiry and held upload -> delete -> release.
- [ ] Implement bounded Sharp normalization and the signed private image client. Keep every public response private/no-store.
- [ ] Implement scratch storage with atomic quota reservation, pending/ready/tombstone states, hash validation, startup/orphan cleanup and flag-independent janitor. A missing cache is unavailable, never permission to automatically reupload.
- [ ] Run all image tests and the existing private runtime suite; measure the updated ARM image under the existing limits.

## Task 3 — Root-owned schema, authority and chat integration

**Files:** new forward migration(s) after `20261105090003`, new diagnostic/image stores and handlers, existing chat contracts/store/handler, namespaced API routes and Admin APIs.

- [ ] Write rollback SQL assertions first for owner isolation, immutable UUID input, cross-kind calls, quote/rights withdrawal, epoch change, expiry after locks and protected single terminal save.
- [ ] Add private screenshot metadata/reservations, vendor version/review tables, tool state/events and diagnostic turn metadata with bounded RPCs and current-role checks. No source widening or old source edits.
- [ ] Wire typed diagnostic begin/read/complete/cancel and safe public citation parsing. Keep legacy raw helpers revoked and restore only independently validated diagnostic history after the existing product-source fence.
- [ ] Add real Admin pending/review/withdraw and separate search-tool enable/disable CAS. A changed document hash becomes a pending version.
- [ ] Run rollback and actual two-connection barriers; apply exact reviewed files only through the verified development CLI target.

## Task 4 — Approved diagnostic and documentation UI

**Files:** one diagnostic form plus bounded image preview, existing workspace single submit/cancel state owner, namespaced Admin documentation page/panel and focused input tests.

- [ ] Obtain approval of the generated Phase 5 drafts before UI code. Preserve the exact logo and existing chat/Admin styling.
- [ ] Implement destination/retention disclosure and explicit upload consent, actual availability, preserved draft and required paste fallback. Keep guide/diagnostic forms mutually exclusive.
- [ ] Render scoped vendor citations and dated unreviewed external references without presenting them as board evidence. Admin sees real state/hash/rights/version and guards, with no fabricated examples.
- [ ] Test keyboard/narrow layouts, failed/unknown upload, image removal, vision-off and fixture-readable/blurred paths with the one existing busy/cancel/progress owner.

## Task 5 — Actual integration, cleanup and handoff

- [ ] Build the final app and worker; run agent regressions, lint, typecheck and production build. Verify no model/graph/secret/large-image bytes in browser bundles or unrelated storefront routes.
- [ ] Use genuine disposable Clerk identities and Codex browser for synthetic image staging, paste fallback, scoped vendor answer/citation/reload, actual Admin review/withdrawal, disabled search with ordinary QA preserved and wrong chip/version denial.
- [ ] Prove actual physical scratch expiry with a clearly labeled short private fixture lease, plus normal 900-second public metadata, owner isolation and flag-off cleanup. Keep live interpretation unavailable; report injected image-reader fixtures separately.
- [ ] Reconcile saved turns/call bounds, remove only marked disposable fixtures, restore owner/current feature state and retain audit history.
- [ ] Sol updates per-page/phase handoff with actual evidence and limitations. Root commits the reviewed checkpoint; do not mark Phase 5 PASS until all required checks have their stated evidence.

## Recorded calls

- **Root interpretation:** bounded, volatile private-worker image scratch is transient processing, not a second customer-file backend. InsForge remains the owner/thread/expiry/status and durable-data authority. This avoids adding a project-wide storage credential solely for TTL deletion. If durable image retrieval is later required, design actual InsForge file storage and expiry rather than extending this scratch cache.
- **Root choice:** keep live vision off because no verified free/price/privacy/profile route exists. Implement the permitted pasted-error fallback and test image-reader contracts only with explicit injected fixtures; make this limitation visible in the UI and evidence.
