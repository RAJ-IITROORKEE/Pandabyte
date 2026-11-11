# Phase D: canonical chat integration

Date: 11 November 2026. Status: design draft for readiness review. No D code, migration, AWS resource or flag has changed.
Branch: `codex/opencode-web-harness` at `981d0c0` (real C2 passed on Haiku, Luna and Terra).

## Goal

A signed-in user's chat turn on the website can be answered by the native OpenCode research harness on the AWS host, saved in InsForge as a cited answer, with the existing direct chat path unchanged and still the default. D ends when the owner can use it locally against the real host. Hosted (Vercel) activation and UI polish are E/G.

## Current state (survey, 11 Nov 2026)

- **Live chat never reaches AWS.** `app/api/panda-agent/chats/[id]/messages/route.ts` → `lightweightChatHandlers.messagePOST` (`src/server/lightweight-chat.ts:11-34`) → `directAssistantForActor` (single OpenRouter completion, no tools, Vercel). Persistence: InsForge `panda_agent_chats`, `panda_agent_chat_turns`, `panda_agent_direct_turns` via HMAC-signed SECURITY DEFINER RPCs (`panda_agent_direct_chat_v2`, `panda_agent_lightweight_read`). Direct `receipt`/`finish` force `outcome:'conversation'` and `citations:[]`.
- **`lightweight-handler.ts` already supports alternative bridges** (`llm`, `native`, `basicRag`) with `start/status/cancel/state`, SSE via `streamWork`, and reconciliation of pending/unknown turns. The old `native` bridge is wired but disabled.
- **The research harness runs only from the SSM test driver** (`scripts/test-native-research.mjs`), as root, with a file store under `/opt/panda-research-tests/<id>`, one Docker admission slot (`/opt/panda-n45-admission`), keys in a root-owned `credentials.json` and a ≤20-minute privacy lease.
- **The only Vercel → AWS path** is the Admin playground: Vercel OIDC SigV4 → REST API `panda-agent-hosted-45fa9949-agent` (`/v1/turns`, `/v1/status`) → streaming Lambda relay `panda-agent-hosted-45fa9949-relay` (Node 24, VPC, 150 s) → host private TLS gateway port with a service token. That gateway (`panda-agent-hosted.service`) and relay must stay unchanged.
- **Host:** t4g.small, ~1.9 GB RAM, one 512 MiB research container at a time. Measured real turns: first 21–32 s (includes cold start), follow-up 7–12 s.

## Sub-phases (each gated before the next)

### D1. Research turn records in InsForge (additive migration)

- New table `panda_agent_research_turns` (chat_id, request_id, owner subject, profile, state `claimed|terminal|cancelled|unknown`, body_hash, run/binding ids as opaque host refs, usage, cost_nano_usd, response_hash, timestamps). RLS on, no table grants; owner via `public.requesting_user_id()`.
- New HMAC-signed SECURITY DEFINER RPC `panda_agent_research_chat_v1(p_payload,p_mac)` with ops `begin`, `claim`, `receipt`, `finish`, `cancel`, `state`. `finish` writes `panda_agent_chat_turns.response` as a `ChatAnswer` with outcome `evidence` + citations (bounded: ≤2 citations, quote ≤180 chars, http(s) URL) or `insufficient`. Answer hash must match the receipt.
- Cross-journal fence: one request id may live in exactly one of `lightweight_turns`/`direct_turns`/`native_runs`/`research_turns` (extend the `native-route-fence` trigger pattern).
- One active research turn per chat (row lock on the chat, like `begin` today). Extend `panda_agent_lightweight_read` to include research turns (status + citations), additively.
- Gate: migration applied once to the development project, rollback script tested on a disposable copy, ACL checks (anon/other-user denied, owner allowed), concurrent begin on the same chat → one wins, fence collision rejected, direct path regression tests pass.

### D2. Host research service

- New systemd unit `panda-research.service` (Node 24, root), separate from `panda-agent-hosted.service`. Listens on a new private-IP TLS port with its own certificate and service token.
- Endpoints: `POST /v1/research/turns` (NDJSON stream: progress stages `admitted|searching|answering` then one final `{state:'evidence'|'insufficient', answer, citations, usage, costNanoUsd}` or `{state:'unknown'|'failed'}`), `GET /v1/research/turns/:id` (status), `POST /v1/research/turns/:id/cancel`.
- Body: `{subject, chatId, requestId, profile, prompt, history?}` plus an HMAC from the relay. Profile allowlist = the three vision profiles (+ GPT-OSS). Images stay out of D (E).
- It wraps exactly the driver's verified flow (store `admitRun` → `claimPrompt` → native prompt → gateway/broker → `projectResearchTurn` → `verifyResearchAnswer`), reusing the same modules. **Fix from C4:** wait for native MCP tool readiness (tool listed) before the first prompt.
- Isolation: one native binding per chat (persisted native data dir per chat under `/opt/panda-research/<subject-hash>/<chat-hash>`), fresh container per turn, existing one-slot lease (busy → `503 busy`, the UI says "try again shortly"). No replay of uncertain charged work; unknown stays unknown.
- Keys: host-only root-owned file; never sent to Vercel, the container, logs or responses.
- Gate: offline tests of the service handler; injected host run through the service (synthetic model/search); then one real owner turn per model.

### D3. Vercel → host transport

- New Lambda relay `panda-research-relay` (copy of the relay pattern, same VPC/subnet, response streaming, 150 s), and new routes `/v1/research/turns`, `/v1/research/turns/{id}`, `/v1/research/turns/{id}/cancel` on a **new** REST API stage (or new resources on the existing API, see decision 1). IAM auth with the existing Vercel OIDC role, plus the per-request user token check as the playground does.
- Gate: SigV4 from local dev with the owner's session reaches the service; unsigned/foreign-role requests rejected; existing playground routes unchanged (read-only verification).

### D4. App routing

- New research bridge (`src/server/research-chat.ts`) plugged into `lightweight-handler.ts` next to `llm`, selected when `PANDA_AGENT_RESEARCH_ENABLED==='true'` **and** the user is the owner/Admin allowlist **and** the `X-Panda-Model` header names a research model. Otherwise the direct path is unchanged.
- SSE progress via existing `streamWork`/`activityStages` (`searching_web` already exists); status/cancel routed to the originating journal.
- Gate: local dev (owner Google session) → real host turn → cited answer saved and reloaded; direct chat regression; reconnect does not resend; cancel; busy slot.

## Owner decisions (11 Nov 2026, answered)

1. AWS: **a new separate REST API** for research (the existing API, relay and gateway are not changed).
2. Privacy attestation: **24 hours**, renewed by the owner after a fresh OpenRouter privacy review; checked before every turn.
3. Access in D: **owner/Admin only**.
4. Budget: **$1 per user per day**, plus the per-user web-search limit.

## Original decision questions

1. **AWS changes**: create a new host service, a new Lambda relay and new API routes (separate from the live gateway). Option A: new resources on the existing REST API (one stage redeploy, existing routes byte-identical). Option B: a new REST API (no change to the existing API at all, one more endpoint/role permission). Recommendation: **B**.
2. **Privacy attestation for hosted use**: the test lease is ≤20 minutes per run. For owner testing, use a host-held attestation the owner renews after a fresh OpenRouter privacy review (proposed: 24 hours), checked before every turn.
3. **Who can use it in D**: owner/Admin allowlist only (recommended) until E/G acceptance.
4. **Budget**: per-turn cost is bounded by the model reservation (Haiku ≤$0.0068, Luna ≤$0.0048, Terra ≤$0.048 per call). Add a per-user daily cap (proposed $1/day) and reuse the per-user web-search limit migration from the other session (`panda_agent_web_search_consume`).

## Out of scope for D

Images in chat, model picker UI changes, AI Elements presentation (E); multi-turn native memory/compaction and the profile context limit (F); Vercel production activation and public users (G).

## D1 exact contract (draft for review)

Template: `20261110130000_direct-assistant.sql`, `20261110150000_direct-unmetered.sql` and `20261110140000_direct-conversation-memory.sql`. One new forward-only migration `Panda-agent/migrations/20261112090000_panda-agent-research-turns.sql`; its rollback is a separately reviewed migration, rehearsed on a disposable project.

- **Table `panda_agent_research_turns`**: `thread_id uuid, request_id uuid, owner_subject text, profile text CHECK in ('tavily-hosted-haiku','tavily-hosted-luna','tavily-hosted-terra'), claimed bool, terminal bool, cancelled bool, body_hash, reserved_nano_usd bigint, usage jsonb, answer_hash, response_hash, created_at`. PK `(thread_id,request_id)`, `UNIQUE(owner_subject,request_id)`, FK to `panda_agent_lightweight_turns` ON DELETE CASCADE, same claim/usage/terminal CHECKs as direct. RLS on; `REVOKE ALL` from PUBLIC/anon/authenticated.
- **Cross-journal fence**: `begin` uses the existing `panda_agent_chat_begin_v2` and inserts the `panda_agent_lightweight_turns` row, so a request id admitted by direct/llm/native cannot also be a research turn (PK + not-admitted → `conflict` unless the research row exists for the same owner). Plus `panda_agent_research_write_guard` on `panda_agent_chat_turns` (copy of the direct write guard).
- **Daily budget table `panda_agent_research_daily`**: `(owner_subject, day date, reserved_nano_usd, charged_nano_usd)`, PK `(owner_subject,day)`, cap 1,000,000,000 nano-USD ($1). `claim` atomically adds the turn reservation (profile per-call reservation × 6 provider calls) and refuses (`execute:false, reason:'budget'`) above the cap; `receipt` replaces the reservation with the charged cost.
- **RPC `panda_agent_research_chat_v1(p_payload,p_mac)`**: verified with `panda_agent_llm_verify(...,'research_chat')`; every op calls `panda_agent_control_room_admin()` (owner/Admin only in D). Ops:
  - `begin {question}` like direct begin (also stores profile).
  - `state` returns `{question,status,claimed,cancelled,profile}`.
  - `claim {bodyHash}`: budget reservation, sets `claimed`.
  - `receipt {bodyHash,answer,usage}`: answer `{outcome:'evidence'|'insufficient', text 1..8000 (insufficient may be the fixed host text), citations ≤2 of exact {id,title,sourceUrl,capturedAt,quote,sectionPath:[]}; sourceUrl https?, quote ≤180, title ≤300}`; `evidence` requires ≥1 citation, `insufficient` requires none; usage `{inputTokens ≤ 6×32000, outputTokens ≤ 6×700, costNanoUsd ≤ reservation}`; idempotent on equal usage/answer hash.
  - `finish {answer}`: hash must equal the receipt's answer hash.
  - `cancel`: same fixed texts as direct.
- **Read**: rename the current `panda_agent_lightweight_read` to `_before_research` and wrap it (same pattern as direct). For research rows the saved answer is shown only when terminal, hashes match, and the shape is valid evidence/insufficient; otherwise the standard "unavailable" text. Existing direct/llm/native rendering is unchanged because the wrapper only rewrites research request ids.
- **Not changed**: `panda_agent_direct_context` keeps excluding research turns (research answers do not feed direct history in D).
- **D1 tests** (disposable development fixtures, exact cleanup): owner begin/claim/receipt/finish/read; non-admin and other-user denied; anon denied; same request id via direct then research → conflict, and the reverse; concurrent `begin` on one chat → one admitted; budget cap → `execute:false`; receipt cost above reservation rejected; tampered answer hash at finish rejected; cancel before/after claim texts; direct path regression suite unchanged.

## Revision R1 (after readiness review 1: 6 Blockers, 9 Majors). Authoritative where it differs from above.

### Trust and data flow (decided first; D1 depends on it)

- **The app is the only writer of InsForge.** Vercel/local Next authenticates the user (Clerk), checks owner/Admin with the existing `authenticateLightweight({admin:true})` / `panda_agent_control_room_admission`, and signs every RPC with `PANDA_AGENT_LIGHTWEIGHT_DB_KEY` exactly as the direct path does. The host never holds the DB key or any user JWT.
- **App → host request envelope**: SigV4 (Vercel OIDC role) to the new API, plus a body signed with a new app↔host key `PANDA_RESEARCH_DISPATCH_KEY` (HMAC-SHA256 over the canonical JSON `{v:1,action:'turn'|'status'|'cancel',subjectHash,chatId,requestId,profile,promptHash,exp}`; `exp` ≤60 s). The prompt is sent alongside and must hash to `promptHash`. The host trusts the app's signature (the app already verified the user); it never trusts a raw subject. Request body ≤16,384 B (prompt ≤8,000 chars like the direct path).
- **Host → app result envelope**: the final NDJSON line carries `{v:1,requestId,runId,profile,state:'evidence'|'insufficient'|'unknown'|'failed',answer?,usage:{calls,inputTokens,outputTokens,costNanoUsd},exp}` signed with a separate key `PANDA_RESEARCH_RESULT_KEY`. The app verifies it before calling `receipt`. A missing or invalid MAC → the turn stays `unknown`; nothing is saved.
- **Idempotency and replay**: the host derives `runId` deterministically from `(chatId,requestId)`. A repeated `turn` for the same request returns the stored result or current status and never re-prompts. A different prompt hash for the same request → `conflict`.
- **History**: the persisted native session per chat is the only context source. No `history` field in the body.

### D1 revisions

- Forward-only migration (repo convention); "rollback" means a separately reviewed follow-up migration, rehearsed on a disposable project.
- `begin` mirrors direct: `panda_agent_chat_begin_v2` (which already allows only one pending turn per chat), then insert `panda_agent_lightweight_turns` **and** `panda_agent_research_turns`. Not admitted and no research row for this owner → `conflict`.
- **Fence**: every journal begins through `chat_begin_v2` on the same `(thread,request)`, so a request id is admitted once, and the other journal's begin then fails `conflict`. Defense in depth: a `BEFORE INSERT` trigger on `panda_agent_research_turns` fails if a direct/llm/native row exists for the same `(thread,request)`. Tests cover both directions.
- **Aggregate receipt**: `usage = {calls 1..6, inputTokens ≤ 6×32000, outputTokens ≤ 6×700, costNanoUsd ≤ reserved}` plus `runId` (64-hex) and the verified `answerHash`. Answer: `evidence` needs 1–2 citations of exact shape `{id,title,sourceUrl(https?),capturedAt,quote ≤180,sectionPath:[]}`; `insufficient` needs none; text 1..8000. Must also pass the base chat-turn citation checks.
- **States**: `claimed` without a receipt after the request deadline = `unknown` (shown as "may still be processing"; never re-dispatched). `cancel` uses the direct texts. The `state` op returns the exact keys `{question,status,claimed,cancelled,profile}`. Payload `exp` is enforced exactly as in direct.
- **Daily budget**: new table `panda_agent_research_daily(owner_subject, day date (UTC), reserved_nano_usd, charged_nano_usd)`. `claim` reserves profile per-call reservation × 6 atomically under the $1 cap. `receipt` converts it to the charged cost. `unknown` keeps its reservation counted. No reuse of `panda_agent_rag_budgets`.
- **Read overlay**: wrap again (`_before_research`). For research request ids only, re-validate terminal state, response hash = approved hash = answer hash, and shape, then **restore** the answer that the base layer blanked (it has no product/scope). Web citations are not in `panda_agent_sources` and are not passed through `lightweight_citations_current`. Their currency is the host's verified capture. Non-research turns stay byte-identical; a regression test covers the direct overlay.

### D2 revisions (host service)

- New `panda-research.service` runs a new entrypoint `Panda-agent/runtime/research-service/server.mjs`. It reuses the driver's modules but not the driver: no fixture-id/argv gates.
- **Keys**: `/etc/panda-research/credentials.json` (root 0600, never unlinked, re-read per turn). **Attestation**: `/etc/panda-research/attestation.json` `{reviewedAt,expiresAt ≤24h,keySha256,workspaceSha256,privacy:{…}}`, written only by an owner-run SSM step after a fresh OpenRouter review. It is checked before every prompt; expired → `failed:'attestation_expired'`, not charged.
- **Binding per chat**: a deterministic binding id from `(subjectHash,chatId,epoch)`, stored in `/opt/panda-research/<subjectHash>/<chatId>/binding.json`. A crashed or `unknown` run keeps its old binding (fenced, never replayed); the next turn in that chat starts a new epoch (fresh native session). Lost context is noted to the user.
- **Restart reconciliation**: on service start, every binding with an active run is marked interrupted. Its unknown operations stay unknown, and status for that run answers `unknown`. Containers are removed by lease name, and the slot is released only after removal is proven (the probe pattern).
- **MCP readiness**: before `claimPrompt`, poll native tool status until `panda_research_search` is connected (≤20 s). On timeout → `failed:'tool_not_ready'` (no provider call, safe to retry), and the container is removed.
- **Slot**: the existing one-slot admission dir with a service-specific lease prefix; busy → `503 busy` immediately.
- Profiles: `tavily-hosted-haiku|luna|terra` only in D.

### D3 revisions (transport)

- New, separate signer config: a research allowlist (`POST /v1/research/turns`, `GET /v1/research/turns/{id}`, `POST /v1/research/turns/{id}/cancel`) in a new module `src/server/research-gateway-client.ts`. The existing `aws-gateway-signer.ts` and `hosted-bff-config.ts` allowlists stay unchanged; the signing primitive is reused through an exported helper only if needed.
- Streaming: a new NDJSON client (the existing playground client buffers ≤32 KB). Progress lines map to `activityStages` (`searching_web`, `checking_citations`, `saving_answer`). On a mid-stream disconnect the host continues, and the app polls `status` with the same request id; it never re-dispatches.
- No user JWT is forwarded; identity is the app-signed envelope above.

### D4 revisions (routing)

- A router inside `directAssistantForActor` (`direct-assistant-runtime.ts`), which already reads `X-Panda-Model`. A new turn goes to research when `PANDA_AGENT_RESEARCH_ENABLED==='true'`, the actor passes the admin check, and the model header is a research model. `state/status/cancel` are delegated to the journal that owns the request id (research, else direct). `lightweight-chat.ts` stays unchanged except the env read.
- The admin check is re-run at dispatch and inside every research RPC op.

### Revised order and gates

D0 (contracts above + key generation plan) → D1 (migration + RPC + tests) → D2 (host service offline tests → injected host run through the service → one real owner turn per model via SSM-invoked client) → D3 (new API, relay, signer, deny matrix) → D4 (routing, local dev end-to-end with the owner session). Test lists per sub-phase are as in readiness review 1 §5.

## Revision R2 (after readiness review 2: 1 Blocker, 7 Majors). Authoritative where it differs.

### Envelopes (closes the Blocker)

- Canonical form: `canonicalResearchJSON` (sorted keys, no whitespace), the existing research helper. HMAC-SHA256 with domain prefixes `panda-research-dispatch-v1\n` and `panda-research-result-v1\n`.
- Dispatch signs `{v:1,action,subjectHash,chatId,requestId,profile,modelId,promptHash,exp}`, where `subjectHash = sha256('panda-research-subject-v1\n' + clerkSubject)`.
- Result signs `{v:1,subjectHash,chatId,requestId,runId,profile,modelId,promptHash,state,answerHash,usage,exp}`; `exp` = now + 120 s.
- The app checks every field against what it dispatched and against the claim's stored `prompt_hash`/`profile` before `receipt`. It rejects expired results, but `receipt` is still idempotent for an equal `answerHash`. A result for another chat, prompt or model cannot be accepted.
- **Host seen-request store** keyed by `(subjectHash,chatId,requestId)` storing `promptHash`. The same prompt returns the stored status or result; a different prompt returns `conflict`. `status`/`cancel` need a valid dispatch MAC for that exact key and return only that request's data.
- **Keys:**
  - `PANDA_AGENT_LIGHTWEIGHT_DB_KEY`: app only (Vercel/local env); the host never receives it.
  - `PANDA_RESEARCH_DISPATCH_KEY` and `PANDA_RESEARCH_RESULT_KEY`: separate random 32-byte keys, in the app env and in host `/etc/panda-research/keys.json` (root 0600).
  - Rotation: replace in both places; old in-flight turns become `unknown`.
  - The host verifies SigV4-authenticated arrival (API/Lambda), then the dispatch MAC, before touching any store or path. The OIDC role alone is not enough.
- The host cannot re-check admin status. The app's admin check at dispatch (and in every RPC op) is the only access control; the host enforces only the attestation and the slot.

### D1 exact DDL and ops

- `panda_agent_research_turns`:
  - Identity and ownership: `thread_id uuid, request_id uuid, owner_subject text`, PK `(thread_id,request_id)`, `UNIQUE(owner_subject,request_id)`, FK `(thread_id,request_id)` → `panda_agent_lightweight_turns` ON DELETE CASCADE.
  - `profile text NOT NULL CHECK (profile IN ('tavily-hosted-haiku','tavily-hosted-luna','tavily-hosted-terra'))`.
  - `prompt_hash text CHECK ~'^[a-f0-9]{64}$'`, `run_id text CHECK ~'^[a-f0-9]{64}$'`.
  - Flags: `claimed bool default false`, `claimed_at timestamptz`, `terminal bool default false`, `cancelled bool default false`, `failed bool default false`.
  - `reserved_nano_usd bigint`, `usage jsonb`, `answer_hash text`, `response_hash text`.
  - Constraints:
    - `CHECK(claimed=(prompt_hash IS NOT NULL AND run_id IS NOT NULL AND claimed_at IS NOT NULL AND reserved_nano_usd IS NOT NULL))`
    - `CHECK((usage IS NULL)=(answer_hash IS NULL))`, `CHECK(usage IS NULL OR claimed)`
    - `CHECK(terminal=(response_hash IS NOT NULL))`, `CHECK(NOT cancelled OR terminal)`, `CHECK(NOT failed OR terminal)`
  - RLS on, `REVOKE ALL`.
- **Unknown** is derived: `claimed AND NOT terminal AND claimed_at < now() - interval '10 minutes'`. The host turn deadline is 5 minutes. It is never re-dispatched.
- **Reservations (nano-USD)**: per turn = per-call reservation × 6 calls.

  | Profile | Reservation per turn |
  |---|---|
  | Haiku | 40,500,006 |
  | Luna | 28,710,006 |
  | Terra | 287,100,006 |

  Daily cap 1,000,000,000 per owner per UTC day (`panda_agent_research_daily(owner_subject, day, reserved_nano_usd, charged_nano_usd)`, PK `(owner_subject,day)`, RLS on, no grants).
  - `receipt` moves the turn's reservation to `charged = min(costNanoUsd, reservation)`.
  - `unknown` and cancelled-after-claim keep the full reservation counted for that day.
  - `fail` releases the reservation only when the app-verified host result says `usage.calls=0` and `costNanoUsd=0`.
- **Ops** (`panda_agent_research_chat_v1`, `panda_agent_llm_verify(...,'research_chat')`, `PERFORM public.panda_agent_control_room_admin()` first in every op, `exp` enforced as direct):
  - `begin {question,profile}`: as direct begin; not admitted and no research row for this owner → `conflict`. Returns `panda_agent_lightweight_read(tid)||{admitted}`.
  - `state` returns exact `{question,status,claimed,cancelled,failed,unknown,profile}`, or `null`.
  - `claim {promptHash,runId}`: already claimed → `{execute:false}`; daily cap exceeded → `{execute:false,reason:'budget'}`; else reserve, set claimed fields, `{execute:true}`.
  - `receipt {promptHash,runId,answer,usage}`: must match claim. Usage `{calls 1..6, inputTokens ≤ 6×32000, outputTokens ≤ 6×700, costNanoUsd ≤ reserved}`; the profile maxima are equal for the three in D. Answer: `evidence` with 1–2 citations, or `insufficient` with none. Text 1..8000, ≤24,000 B; quote ≤180. Quote/answer containment is verified on the host (`verifyResearchAnswer`) and trusted through the result MAC. Idempotent on equal answer hash and usage.
  - `finish {answer}`: hash = receipt answer hash; idempotent when already terminal with the same hash.
  - `fail {reason ∈ 'busy'|'attestation_expired'|'tool_not_ready'|'invalid', usage}`: terminal with fixed insufficient text per reason; releases the reservation only when calls=0 and cost=0.
  - `cancel`: the direct texts.
- **Triggers**:
  - (1) `panda_agent_research_write_guard` BEFORE UPDATE OF response,status ON `panda_agent_chat_turns`: a research-owned turn may become complete only when `research_turns.terminal` and `response_hash = sha256(NEW.response)`.
  - (2) BEFORE INSERT ON `panda_agent_research_turns`: fail if a row exists in `panda_agent_direct_turns`, `panda_agent_llm_turns` or `panda_agent_native_runs` for the same `(thread_id,request_id)`. Check the actual key columns of `native_runs` during implementation.
  - (3) BEFORE INSERT ON `panda_agent_direct_turns` (a new trigger on an existing table, additive): fail if a research row exists.
  - Test that the existing generic finish/complete RPCs cannot complete a research-owned turn.
- **Read overlay**: research rows are restored only when `owner_subject = requesting_user_id()`, terminal, all three hashes equal, and the shape is valid. A pending (not yet unknown) row shows the normal pending state; `unknown` shows "may still be processing; this answer will not be saved late".

## Readiness review 3: D1 ready (no Blocker). Folded-in additions

- `claim_day date` is set at claim and included in the claimed CHECK. Every ledger update (receipt, fail, cancel-after-claim) uses it, not today's date.
- `fail` works before or after claim; `busy`/`attestation_expired` may be decided before claim. A reservation is released only for a claimed turn with calls=0 and cost=0. The usage CHECK becomes `CHECK(usage IS NULL OR failed OR answer_hash IS NOT NULL)`, plus `CHECK(answer_hash IS NULL OR usage IS NOT NULL)`.
- Fence trigger tables, all keyed `(thread_id,request_id)`: `panda_agent_direct_turns`, `panda_agent_llm_turns`, `panda_agent_native_runs` (the last is not an FK child of `lightweight_turns`, so it gets its own test).
- `state` and the read overlay use one shared SQL helper for derived `unknown`.

## D2 file-level contract (draft for readiness review)

No change to the test driver `scripts/test-native-research.mjs` (it stays the regression harness). New files only, plus tests. Host run only; no relay or app changes in D2.

1. **`src/server/research-envelopes.ts`** (pure, shared by app and host). The canonical form is `canonicalResearchJSON`.
   - `signDispatch(key,fields)` / `verifyDispatch(key,raw,mac,now)`: domain `panda-research-dispatch-v1\n`; exact fields `{v:1,action:'turn'|'status'|'cancel',subjectHash,chatId,requestId,profile,modelId,promptHash,exp}`. `exp` must be in `(now, now+65s]`. `chatId`/`requestId` are UUIDs, hashes 64-hex, and the profile must be one of the three, with `modelId` matching its descriptor.
   - `signResult` / `verifyResult`: domain `panda-research-result-v1\n`; fields `{v:1,subjectHash,chatId,requestId,runId,profile,modelId,promptHash,state:'evidence'|'insufficient'|'unknown'|'failed',reason?,answerHash?,usage:{calls,inputTokens,outputTokens,costNanoUsd},exp}`. `exp` is at most now + 120 s. `answerHash` is present exactly for `evidence`/`insufficient`, and `reason ∈ busy|attestation_expired|tool_not_ready|invalid` exactly for `failed`.
   - `subjectHash(clerkSubject)` and `researchRunId(subjectHash,chatId,requestId)` (sha256 with domain prefixes).
   - Keys are 32 random bytes and are never logged.
   - Tests: round trip, every field tamper, wrong key, expiry, domain separation (a dispatch MAC never verifies as a result).
2. **`src/server/research-turn-runner.ts`**: `createResearchTurnRunner(options)` with `run(input, {onProgress, signal}) → RunnerResult`. It reuses exactly the driver's verified module calls:
   - binding/store
   - container launch and inspection (`verifyResearchContainer`)
   - attach (gateway `authorize/claim/beforeSend/settle/authorizeRelease/complete` with `createResearchOpenRouter`; broker with `searchHostedPublicWeb`)
   - prompt: `admitRun`/`claimPrompt`/POST/`markPromptAccepted`
   - `waitTerminal` → recover attempts → `matchResearchStopResult` → `verifyResearchAnswer` → `finishRun` → remove.

   It drops the test-only paths: scenarios, synthetic frames, captures, assertions, probes. Inputs and options:
   - Input `{subjectHash, chatId, runId, profile, prompt}`.
   - Options `{root:'/opt/panda-research', codeSource, keys(), attestation(), slotDir:'/opt/panda-n45-admission', leasePrefix:'panda-research-', fetcher?, searchFetch?, searchLookup?}`. The last three are injection seams, used only by the injected host test.
   - **Binding**: `/opt/panda-research/<subjectHash>/<chatId>/binding.json` holds `{epoch,bindingHash,owner,sessionID,created}`. `bindingHash = sha256('panda-research-binding-v1\n'+subjectHash+chatId+epoch)`. The store root is per chat. When the current binding has an active (unfinished) run, the epoch increments; the old binding is never reused or replayed.
   - **Session**: created once per epoch (store `claimCreate`/`markCreated`). Later turns relaunch a fresh container on the same native dir, and `startGeneration(prev,next)` is called first.
   - **MCP readiness**: after config verification, poll native `GET /api/mcp` (or the equivalent status route from upstream 2.2.5) until `panda_research_search` is connected. The timeout is 20 s, giving `failed:tool_not_ready` with calls=0.
   - **Attestation** `/etc/panda-research/attestation.json` `{version:1,reviewedAt,expiresAt,keySha256,workspaceSha256,privacy:{paidTraining:false,publicPrompts:false,dataDiscount:false,logging:false,traces:'langsmith_metadata_only'}}`, with `expiresAt-reviewedAt ≤ 24h`. It is checked before launch and as the `policyCurrent` of every provider call. Expired → `failed:attestation_expired`.
   - **Search scope**: real hosted turns use a public-query guard (`isPublicResearchQuery` with no fixed vocabulary is not possible). D2 keeps the existing broker contract and passes `allowPublicQuery = query => publicQueryShape(query)` (≤400 chars, letters/digits/space/hyphen only, 1–12 words). That is a new, explicitly tested helper; the test vocabulary stays only in the driver.
   - **Usage**: the sum over settled primary attempts (calls = count, tokens, cost). For `evidence`/`insufficient` the answer is the `ChatAnswer` mapped from `verifyResearchAnswer`: citations `{id:'S1'|'S2',title,sourceUrl:url,capturedAt,quote,sectionPath:[]}`.
   - **Turn deadline**: 300 s → remove the container and return `unknown` with the usage so far.
3. **`src/server/research-service-handler.ts`** (testable with a fake runner and an in-memory or temp-dir request store): `handle(request) → {status, ndjson stream | json}`.
   - It verifies the service token (constant-time, from `/etc/panda-research/service-token`) and the dispatch MAC before anything else.
   - The seen-request store `/opt/panda-research/requests/<sha256(subjectHash,chatId,requestId)>.json` holds `{promptHash,runId,state,result?}`.
   - `turn`:
     - same prompt → stored result or `{state:'running'}`;
     - different prompt → `409`;
     - slot busy → a signed `failed:busy` result;
     - otherwise run, streaming progress lines `{type:'progress',stage}` and then one `{type:'result',payload,mac}`.
   - `status` returns the stored state/result. `cancel` signals the runner (`unknown` if a provider call was sent).
   - Restart reconciliation on startup: `running` entries become `unknown`.
4. **`scripts/research-service.mjs`**: the entrypoint. It is a Node HTTPS server bound to the host private IP and a new port (8444) with its own self-signed certificate under `/etc/panda-research/tls/`. It wires the handler and runner, with a request body ≤16,384 B. It refuses to start unless running as root with the expected file modes.
5. **Tests**:
   - `tests/research-envelopes.test.mjs`
   - `tests/research-service-handler.test.mjs` (fake runner: same-prompt replay, different prompt 409, busy, bad token, bad MAC, expired, restart reconciliation, cancel, stream shape, result MAC verifies with the app's verifier)
   - `tests/research-turn-runner-helpers.test.mjs` (binding derivation/epoch rule, usage aggregation, citation mapping, `publicQueryShape`, attestation validation).
6. **Host gate**:
   - an injected run through the service handler via SSM (loopback client, synthetic model/search injected through the runner seams);
   - then one real owner-attested turn per model;
   - then a restart-reconciliation check.
   - No relay/API until D3.

**Open question for review:** the exact OpenCode 2.2.5 route for MCP connection status. If none exists, readiness becomes "tool listed in the native tool list route".

### D2 revision R1 (readiness review: 2 Blockers, 6 Majors). Authoritative over the D2 draft.

- **Lease**: keep `panda-n45-`+32 hex (`reserveDockerHostSlot` and `verifyResearchContainer` require it). There is no lease-prefix option. The slot dir is the shared one-slot `/opt/panda-n45-admission`; the research service contends with any other native user of that slot, and the existing gateway does not use it.
- **Layout**:
  - `/opt/panda-research/chats/<subjectHash>/<chatId>/meta.json` is the sidecar, holding the full `ResearchBinding` per epoch: `{epoch, binding:{binding,owner:subjectHash,sessionID,profileHash,imageId,created}}`. It is written (tmp+fsync+rename) before `createBinding`, and retries rebuild from it.
  - `.../<chatId>/store` is the store root (`bindings`/`code` only).
  - The code mount is shared read-only at `/opt/panda-research/code/<profileHash>/mount`, prepared once per profile hash (0444/0555 + manifest).
- **Per-turn binding sequence**:
  1. `store.reconcile(binding)` gives the current generation.
  2. Start a new epoch when any of these holds:
     - there is an unfinished `activeRun` that `reconcileTerminal` cannot settle;
     - create is `claimed` (crash mid-create);
     - `createBinding` returns `conflict`;
     - the profile hash differs from the stored binding (model switch).
  3. `startGeneration(b,cur,next)`.
  4. Skip `claimCreate` and session POST when create is `created`.
  5. `owned()` checks: version 2.2.5, stable pid, session metadata.
- **MCP readiness**: add exactly `GET /api/mcp` to the research transport allowlist. Poll it at 200 ms steps for up to 20 s until `name==='panda_research' && status.status==='connected'`, projecting only name and status. **Before relying on it**, verify with one injected host run whether 2.2.5 auto-connects config-declared servers. If it does not, the fallback is the explicit connect route, reviewed separately.
- **Search scope**: a new helper `researchQueryInScope(query, promptText)`:
  - letters/digits/space/hyphen, ≤12 words, ≤400 chars;
  - every lower-cased word must appear in the user's prompt text, or in a fixed generic-doc list (`datasheet documentation docs official reference manual guide pinout example examples tutorial specification specs`).
  - It is applied by a per-run closure. A short host preface in the prompt states these rules.
  - The envelope `promptHash` is the user's text hash; the store `run.promptHash` is the digest of the prefaced text, and both are recorded.
  - Gate: never widen to non-Admin users without trusted scope derivation (C1 plan line 54).
- **Credentials**: `/etc/panda-research/credentials.json` `{OPENROUTER_API_KEY,TAVILY_API_KEY}`, root 0600, nlink 1, shape-checked. The attestation `keySha256` must equal the key hash. The keys file holds `{dispatchKey,resultKey,serviceToken}` (base64 32 bytes each). The attestation is ≤24 h (a deliberate owner-approved loosening of the ≤30 min test lease).
- **Attestation currency in three places**: `store.isCurrent`, `policyCurrent`/`dispatchCurrent` (plus `generation===gen && containerId`), and the final terminal check before `finishRun`.
- **Handler**:
  - Request files `/opt/panda-research/requests/<sha256(subjectHash,chatId,requestId)>.json`, root 0700 dir and 0600 files, created with `O_EXCL`. They hold `{promptHash,runId,lease?,state,result?}` with an **unsigned** stored result, signed fresh (exp 120 s) on every response.
  - The result is persisted (tmp+fsync+rename) before it is streamed.
  - The MAC `action` must equal the route, and `promptHash` must match on status and cancel.
  - The runner is detached from the HTTP response (stream write errors are swallowed).
  - All runner errors map to `unknown` (provider call possibly sent) or `failed:tool_not_ready|attestation_expired|busy|invalid` (none sent), with cleanup in `finally`.
  - Body ≤16,384 B and prompt ≤8,000 UTF-8 bytes.
- **Cancel**: `store.cancelRun(run,'cancelled')`, then native interrupt (`resume=false`), abort the gateway, remove the container. The result is `unknown` with the settled usage (never `evidence`). No store calls inside a `finishRun` verify callback.
- **Restart/slot recovery**: the lease name is recorded in the request file before reserving. On service start, every `running` entry → `unknown`; remove its container by lease name, prove removal (`ps` empty), then unlink the stale slot file through a new helper `releaseStaleDockerHostSlot(dir, lease)` in `native-docker-host-quota.ts`.
- **Kept driver checks**:
  - image inspect (arm64, exact id), MemAvailable ≥1 GiB, disk ≥2 GiB, root dir mode/uid;
  - `remove()` with the uncertain-create-by-name path, the `ps` proof and slot retention on failure;
  - `recheckModelRelease` + `authorizeRelease` on the final op and each used source, then `finishRun`;
  - `claimPrompt`/`markPromptAccepted` non-dispatch paths → `unknown`;
  - OOM/cgroup proof failure → `unknown`, not a crash.
- **Retention**: request files older than 7 days are deleted on startup (results are already saved in InsForge by the app).

### MCP readiness, verified (11 Nov 2026)

- Injected host run `1e0d3b49…`, SSM `f6dea663`: 9 checks, 0 real calls.
- `GET /api/mcp` (newly allowed in both the host transport and the in-container proxy) returned `[]` right after config verification, then `[{name:'panda_research',status:'connected'}]` after 2,876 ms. OpenCode 2.2.5 auto-connects config-declared servers; no connect route is needed.
- This confirms the Haiku run-2 startup race. Readiness = poll until `panda_research` is `connected` (200 ms steps, 20 s cap) before the first `claimPrompt`.

## D3 file-level contract (draft for readiness review, 12 Nov 2026)

Survey facts (read-only, 12 Nov):
- The existing stack `panda-agent-hosted-45fa9949` (CloudFormation) has the pattern to copy:
  - a relay security group whose egress goes to host/32 only, plus an ingress rule on the host security group from that group;
  - a 1-day log group;
  - a Lambda role with the VPC deny-from-code fence;
  - a Node 24 arm64 streaming relay (256 MB, 150 s);
  - a REST API (`AWS_IAM`, `AWS_PROXY`, `ResponseTransferMode: STREAM`, resource policy fixed to one caller role, throttle 1/1).
- The caller role `PandaAgentHostedVercel` trusts Vercel OIDC for **production only**, and its inline policies allow only the existing API. It is not reused or changed.
- The Vercel CLI is logged in and the worktree is linked to `pandabyte-iot`. `vercel env pull --environment development` provides a 12 h `VERCEL_OIDC_TOKEN` for local dev.
- Host Node is `/opt/panda-agent/hosted-runtime/bin/node`. The D2 sources run without `node_modules`.

1. **New stack `panda-research-<8hex>`** (template `Panda-agent/infra/research-stack.json`; no existing stack changes):
   - **Parameters:**
     - VpcId, SubnetId, HostSecurityGroup, HostPrivateIp;
     - HostTlsName `panda-research.internal`, HostCaPem;
     - ServiceToken (NoEcho, base64 of 32 bytes);
     - OidcProviderArn (the existing Vercel provider);
     - OidcSubject (`owner:unfiltered-iit-ians:project:pandabyte-iot:environment:development`).
   - **Network:** RelayGroup egress tcp 8444 to host/32; HostIngress tcp 8444 from RelayGroup only.
   - **CallerRole `<stack>-caller`:**
     - trust `sts:AssumeRoleWithWebIdentity` from the Vercel provider, with `aud` and `sub` StringEquals (development only in D; production is added in G);
     - MaxSession 3600;
     - inline policy: allow `execute-api:Invoke` on exactly the three routes, deny other Invoke resources, deny NotAction.
   - **Function `<stack>-relay`** (code below): env as the existing relay, but port 8444, caller ARN = CallerRole ARN, timeout 130000.
   - **Api `<stack>-research`:**
     - REGIONAL; stage `research`; throttle rate 2 / burst 4; logging off;
     - resource policy: allow CallerRole on the three routes; deny any other principal; deny any other resource.
   - **Routes** (all POST, `AWS_IAM`, streaming proxy, 150 s), with one Lambda permission each:
     - `/v1/research/turns`
     - `/v1/research/turns/{id}/status`
     - `/v1/research/turns/{id}/cancel`
2. **Relay `Panda-agent/runtime/research-relay/index.js`** (CommonJS, no dependencies; `createRelay` exported for tests; Lambda handler only when `awslambda` exists). Adapted from the existing relay; it authorizes nothing about the user.
   - **Accepted requests:**
     - stage `research`;
     - resource and path exactly one of the three routes, `{id}` a lowercase UUID equal to the path segment;
     - POST only, no query strings;
     - body a non-base64 string ≤16,384 B that parses as a JSON object;
     - multi-value headers consistent;
     - caller ARN equals the role or its assumed-role session.
   - **Headers:** `content-type: application/json`; `accept: application/x-ndjson` for turns and `application/json` for status/cancel.
   - **Forwarding:** to `https://<ip>:8444/v1/research/turns[/<id>/(status|cancel)]` with `rejectUnauthorized`, the pinned CA and TLS name, and `authorization: Bearer <serviceToken>`.
   - **Responses:**
     - 200 with a matching content type is streamed (ndjson ≤262,144 B, json ≤16,384 B);
     - host statuses 202/400/403/404/409/413 with JSON ≤2,048 B pass through;
     - anything else, or an error before streaming, gives `503 {"error":"unavailable"}`;
     - an error after streaming starts ends the stream; the app treats it as unknown and polls status.
3. **Host install** (private SSM helper outside Git, reusing the D2 upload/handoff pattern):
   - **Source** at `/opt/panda-research-app/<archive sha256>/` (root 0700): the D2 runtime list plus `scripts/research-service.mjs`, without test scripts.
   - **`/etc/panda-research`** (root 0700):
     - `service.json {address:'172.31.18.90',port:8444}`;
     - `keys.json` and `credentials.json`, through the encrypted RSA-OAEP/AES-GCM handoff (keys generated locally, never in SSM parameters or output);
     - `tls/key.pem` (0600, generated on the host, never leaves);
     - `tls/cert.pem` (SAN `panda-research.internal`, 90 days; the public cert is read back as the relay CA).
   - **Attestation:** `attestation.json` is written only after a fresh OpenRouter privacy re-read in Brave. Code change: the service now starts without it, and a missing or invalid attestation gives a signed `failed:attestation_expired` with no provider call.
   - **Unit** `/etc/systemd/system/panda-research.service`:
     - root, `ExecStart=<node> --disable-warning=MODULE_TYPELESS_PACKAGE_JSON <src>/Panda-agent/scripts/research-service.mjs`;
     - `Restart=on-failure`, `RestartSec=5`, `TimeoutStopSec=320`, `PrivateTmp=yes`, `ProtectHome=yes`;
     - enabled and started once, then its status read back.
   - **App-side secrets** (dispatch key, result key, endpoint, caller role ARN) go only in the gitignored worktree `.env.local`.
4. **App client `Panda-agent/src/server/research-gateway-client.ts`** (`server-only`; new signer; the existing signer and allowlists are unchanged):
   - `createResearchGatewayClient({endpoint, roleArn, dispatchKey, resultKey, credentials?, fetch?, now?})` validates the endpoint host `^[a-z0-9]{10}\.execute-api\.ap-south-1\.amazonaws\.com$` and the path prefix `/research`.
   - SigV4 (`execute-api`, ap-south-1) uses Vercel OIDC credentials. The signer accepts only the three paths, POST, the two exact headers and a body ≤16,384 B.
   - **`turn({subject, chatId, requestId, profile, prompt}, {onProgress, signal})`:**
     - signs a dispatch (exp now+50 s);
     - streams NDJSON (line ≤65,536 B, total ≤262,144 B) and maps progress stages through an allowlist;
     - accepts exactly one `result` line;
     - verifies the MAC and that every field equals the dispatch (`runId = researchRunId(...)`);
     - for answers, verifies `sha256(canonical(answer)) === answerHash` and that the answer passes the D1 answer shape.
   - **`status(...)` / `cancel(...)`** do the same with a JSON body.
   - **Outcomes:**
     - `{state:'evidence'|'insufficient', answer, answerHash, usage}`
     - `{state:'failed', reason, usage}`
     - `{state:'running'}`, `{state:'conflict'}`, `{state:'not_found'}`
     - `{state:'unknown'}`: any transport, parse or verification failure. Nothing is auto-retried.
5. **Tests:**
   - `tests/research-relay.test.mjs` (fake connector): allowlist, caller, headers, body bounds, pass-through statuses, stream cap, 503 mapping.
   - `tests/research-gateway-client.test.mjs` (fake signer/fetch):
     - the happy path;
     - a tampered result, or one for another chat, prompt or model;
     - a wrong answer hash;
     - an oversize line or total;
     - two result lines;
     - status/cancel shapes;
     - unknown on a transport error.
   - The startup change for a missing attestation.
6. **Live gate** (opt-in local script `Panda-agent/scripts/check-research-gateway.mjs`, using the dev OIDC token):
   - **Reachability:**
     - a signed status for a new id is answered by the host with `404` through the API;
     - a signed turn with no attestation returns a verified `failed:attestation_expired` (no provider call).
   - **Deny matrix:**
     - unsigned → 403;
     - signed by account root → 403;
     - wrong method or path → 403/404 and not forwarded;
     - bad dispatch MAC → host 403;
     - wrong service token → host 401 (offline relay test);
     - oversize body → rejected;
     - the host security group allows 8444 only from the relay group.
   - **Unchanged:** before/after snapshots match for the existing API resources and stage deployment, the relay function configuration hash, the caller role trust and policies, and the existing service unit.
   - **Real turns:**
     1. A fresh Brave privacy re-read, then a 24 h attestation.
     2. One real turn per model (Haiku, Luna, Terra) through the API, each a verified `evidence` or `insufficient` result.
     3. One follow-up on one chat.
     4. A service restart, then a check that reconcile left no held slot.

     About $0.01 total.
