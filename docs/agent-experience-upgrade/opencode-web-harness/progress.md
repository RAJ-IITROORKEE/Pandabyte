# OpenCode web harness progress

Date: 2026-11-11. Branch: codex/opencode-web-harness. Starting source: 2ef90b9.

**Owner-requested pause,11November:** stop Codex implementation and hand off to Claude because of the usage limit. The goal is paused, not complete. C2 remains uncommitted/unaccepted. Latest server result1090/1122 passed,32 existing skips, zero failures; fresh production build/native strict/lint passed. Updated512MiB injected C2, B13-case and C1four-check native gates passed with zero OOM kills. Latest real native run completed three validated model calls and two searches but its240-character, nonliteral quote failed final citation validation. The proposed passage-ID citation contract in `phase-c2-citation-plan.md` is NOT implemented; targeted Goldfish readiness requires precise splitter whitespace/index semantics and projected multi-search wire-budget tests before implementation. Full web/UI/native-feature/live acceptance remains pending. No merge/push/research deployment occurred. A single Claude resume prompt was delivered in the original project folder; preserve this worktree and all private/uncertain receipts.

Execution state: **Resumed by owner, 10 November 2026.** The owner explicitly approved Overview & Goals and instructed: proceed with the technical plan, then implement OpenCode features step by step using Tavily and Goldfish reviews, testing each sub-phase before advancing. Complete the technical/file-level plan and independent reviews, then leave the design-only workflow for the authorized implementation. No repeated overview approval is required. The integration objective remains unchanged; the prior blocked state and all discovery evidence are retained in Git history once this checkpoint is committed.

| Step | State | Required result |
| --- | --- | --- |
| 0. Existing-runtime and source inventory | Discovery complete; exact custom image selected and binary 2.2.5 verified | Three completed fresh-context audits; Tavily source/configuration names found; AWS running/SSM online; three successful bounded read-only SSM probes identify the custom ARM64 gateway image/configuration and cached upstream images. Version-only probes verify exact native 2.2.5; execution/API acceptance remains B. See [receipt](aws-inventory.json). |
| 1. EGM overview and goals | Owner approved | [Draft](design_draft.md) linked to current scope and reviewed discovery; explicit approval received |
| 2. Technical plan, alternatives and file-level implementation order | A, B and C1 passed; C2 implementation in injected native verification | Readiness and source Goldfish findings resolved; 134 tests passed, four existing opt-in skips, typecheck/lint and production build passed. See [A review](phase-a-review.md) and [verification](phase-a-verification.json). [B technical plan](phase-b-plan.md) passed readiness review; new source, private authority and synthetic native matrix are implemented. All13 synthetic exact-image scenarios passed; the final server suite passed1004 tests with32 existing skips. See [B review](phase-b-review.md) and [receipt](phase-b-verification.json). |
| 3. First native web-research slice | Native Tavily search passed; hosted-model path under injected verification | OpenCode-owned tool loop with actual configured search, honest source/tool display, final citation/access/receipt validation |
| 4. Minimal native context/session and question/planning adoption | Pending ordered design | Reuse native APIs; isolate users/chats; avoid duplicate history/planners; account compaction and maintenance |
| 5. Reviewed MCP/skill exposure and regression validation | Pending ordered design | Minimal useful read-only capabilities, observable calls, replay/isolation/error cases and measured latency |
| 6. Hosted activation, live Admin/browser acceptance and publication | Not started | Test each accepted sub-phase before advancing; preserve working RAG/direct baseline |

The rows above are requested outcomes, not a decided implementation dependency order. The design must order durable-session, tool-protocol, web-search and presentation prerequisites from the actual existing code. C1 made one actual public Tavily search with synthetic model responses; no real model call, live gateway configuration change or research deployment has occurred. B now executes isolated synthetic native fixtures with separate private persistence; failures and exact cleanup are retained in its review record. These fixtures do not restart or replace the live gateway. The working hosted RAG remains unchanged. C1 passed97 focused tests,1035 server regressions and real native search/provenance acceptance; see [C1 review](phase-c1-review.md) and [receipt](phase-c1-verification.json).

C2 technical contract and scoped source reviews passed after repairs. Its injected native model/search test and shared B/C1 runtime regressions passed, as did1085 server tests, native strict checking, lint and production build. The first actual model/search turn selected and consumed Tavily, but its second model response failed transport validation; the uncertain operation is retained without replay. Bounded private diagnostics and a different documentation question are next. C2 is not accepted or live. See [C2 contract](phase-c2-plan.md) and [review](phase-c2-review.md).

Owner follow-up11November: use Terra6.1 High implementation subagents and demonstrate accepted milestones in the browser, including tool/source orchestration, retrieved information, questions and later native capabilities. Keep demonstrations tied to actually implemented/verified features; the injected native model/search milestone is not a claim that web integration or questions are already live.

Claude continuation, 11 November 2026: work resumed in Claude Code from HEAD `902cdd3` with the uncommitted C2 checkpoint preserved. The owner set Claude subagents to Sonnet 5.5 at medium effort (supersedes the Terra 6.1 High preference, which this environment lacks), and final hosted browser tests use Google sign-in with the owner's Admin account. The C2 citation plan's readiness Major (splitter conventions) was resolved and rechecked with no Blocker/Major; passage-ID selection, structural shim validation, the revised hosted instruction and projected wire-budget tests are implemented. 111 focused tests, native strict checking, scoped lint, task validation and diff checks pass. Fresh source review, native B/C1/C2 regressions and a new real C2 question remain before C2 acceptance.

Owner request, 11 November 2026: add OpenRouter models with image input to the native harness: GPT-6 Luna (`openai/gpt-6-luna`), GPT-6.1 Terra (`openai/gpt-6.1-terra`; the requested "Terra 6.21" does not exist in the public catalog, nearest chosen pending owner correction) and Claude Haiku 5.5 (`anthropic/claude-haiku-5.5`). Public catalog on 11 November lists text+image+file input, tool calling and ZDR endpoints for all three. Planned after C2 acceptance: C3 adds a reviewed per-model allowlist (routing, max price, ZDR/privacy, usage validation, policyHash) with real grounded-search and unsupported-question tests per model; C4 adds bounded image input through native OpenCode with a public sample image per model; E adds the web image attachment and model picker. These are not implemented yet.

Owner request, 11 November 2026 (UI/UX orchestration, phase E scope): build the web agent experience with the AI Elements SDK, exploring its full component set to show native OpenCode orchestration like mainstream assistants: native questions, structured output, code blocks, tool calls with expandable inputs/results, sources/citations, true-activity shimmer, reasoning/plan/task progress, and artifact-style outputs. Rich outputs requested: sandboxed JSX preview rendering, charts, schematic/connection and flowchart diagrams, step-by-step instructions, and downloadable generated files (for example `arduino_code.cpp`) with a code viewer. Constraints carried forward: render only what native tools/sources actually produced, keep model-generated code/JSX sandboxed (no execution in the app origin, no network or credential access), keep existing citation/abstention guards, and preserve current PandaByte tokens/logo and the existing assistant-ui shell unless a reviewed change replaces it. File-generating and diagram/chart outputs need a reviewed native tool or structured-output contract (likely part of phase F) before the UI can display them; they are not implemented yet.

Cross-session coordination, 11 November 2026: a parallel Claude session ("Agentic RAG local continuation") works in the original checkout on branch `claude/agentic-rag-harness` (uncommitted): chat-handler pending-turn fixes and a local-dev-only agent mode (`PANDA_AGENT_AGENT_MODE=local-opencode`, non-production) using `opencode serve` 2.2.6 with its own read-only MCP tools. File ownership is disjoint from this harness; it does not touch hosted model policy/selection, live Luna paths, the Admin Control Room or the chat UI, and this harness does not touch its files, the original checkout or localhost:3000. Agreed direction: that mode remains a local experiment; before any agent is wired into the real chat (D/E) both converge on one engine and one tool/citation contract, with this harness's passage-ID citations as the target. Candidate models from its comparison are added to C3 only with a ZDR endpoint. Real Tavily runs on the shared key are announced to the other session first. RAG evals/model testing on the hosted app use the Admin RAG Control Room.

## 11 November 2026: C4.0 native image probe and Haiku default

- **Haiku default.** The owner chose Claude Haiku 5.5 as the default harness model. The native driver and C2 helper now default to `tavily-hosted-haiku`. The library default and the live `fastHostedModel` are unchanged. D/E must default to Haiku once C3 real-call acceptance passes.
- **Probe run.** C4.0 is a standalone synthetic probe (`runtime/probe/image-probe.mjs`, `scripts/probe-native-image.mjs`). It made no change to the six immutable research files and ran with `--network none`.
  - Two Goldfish code reviews: 4 Majors fixed, then the re-review was clean.
  - Single run: fixture `64aba62f…`, SSM `bc06ffbc…`, `probe_completed` in 13.7 s, peak 366 MB, OOM 0, cleanup and slot release proven, zero real calls.
- **Findings** (details in phase-c4-plan.md "C4.0 result"):
  - 2.2.5 accepts `files:[{uri:data:…}]`.
  - It stores the attachment as `files[{data,mime,source:inline,name}]`.
  - The provider receives byte-identical `image_url` data URIs.
  - It detects the media type from the bytes.
  - It honours `media.image.auto_resize:false` (over-limit images get 400 with no provider call; by default they are silently re-encoded).
  - Text-only models get the image replaced by an appended error note.
- **Next.** C4 readiness review (size-bound choice), then implementation.
- **Peer evidence (11 Nov, "Agentic RAG local continuation" session).** It ran a local OpenCode 2.2.6 four-prompt comparison through OpenRouter. These are not this harness's guarded hosted path; see its `docs/designs/pandabyte-agentic-rag/local-rag-validation-20261111.md`.
  - **Haiku 5.5:** $0.0117 for 4 turns, 11–23 s per turn, 4 of 4 passed, with a clarifying question asked properly. This supports the Haiku default.
  - **Luna:** correct but terse, 22–50 s.
  - **Haiku's ZDR endpoint is unverified on our side.** The C3 approval pins `amazon-bedrock` and checks the live ZDR list on the first real call.
  - **Shared Tavily local quota:** 9 of 10 used.
- **C4 Worker A done.** Usage, wire bound, `research-image.ts` admission; tests: policy 16/16, image 15/15, openrouter 54/60. The 6 remaining tests wait on Worker B's gateway.
- **C4 host runs: injected, zero real calls.**
  - **Haiku run 1** (fixture `c4a58913…`, SSM `887c926b`).
    - Passed: the text flow, the vision config with `media` (accepted by `verifiedResearchConfig`, so strict echo holds), and both text turns.
    - Failed: the image turn timed out in the driver. The driver's `observation()` called `projectResearchTurn` without `imageSha256`, so the image row was correctly rejected. That is a driver bug, now fixed.
  - **Haiku run 2** (fixture `3975276f…`, SSM `43c74872`).
    - The first text turn failed natively. The tool state was `tool.execution` "No tool named \"panda_research_search\" is currently available", with 0 tool dispatches. The gateway correctly refused the continuation with 403. No OOM, cleanup exact.
    - Cause: a native MCP startup race. The model's first tool call arrived before the MCP tool list was registered. This is a pre-existing robustness gap, unrelated to C4; the identical turn passed in run 1 and in all C2/C3 runs.
    - **Finding for D:** wait for MCP tool readiness before admitting the first prompt, or give a bounded admission retry before any provider call.
  - **Haiku run 3** (fixture `d3164d53…`, SSM `3da325fd`): pass, 17 checks, peak 424.6 MB, OOM 0.
  - **Luna** (`638ddb83…`, `42e0a5de`): pass, 17 checks, peak 423.1 MB, OOM 0.
  - **Terra** (`25a9cd41…`, `5509c775`): pass, 17 checks, peak 417.1 MB, OOM 0.
  - Each vision pass: 46,415 B JPEG delivered byte-identical on both tool-round requests, follow-up refused `image_single_turn`, transparent PNG bound, text-only rows have no `files`.
- **C4 regressions (injected, zero real calls).** GPT-OSS text-only (`33947161…`, `c6d965c0`) 9 checks; C1 search (`39962443…`, `66630275`) 4 checks; B matrix (`0dc9c27d…`, `b33fe369`) 13 checks. All OOM 0. The private B/C1 helpers needed `research-image-binding.ts` added to their source lists (backups `.bak-c4`).
- **C4 status:** implemented and injected-verified; `accepted:false` until real per-model image calls under a fresh privacy lease. Record: [phase-c4-verification.json](phase-c4-verification.json). Nothing committed or deployed.
- **OpenRouter privacy review, 11 Nov 2026 (owner-approved, read-only in Brave).**
  - Account level: paid-endpoint training off, prompt publishing off, 1% data discount off. Global ZDR toggles off; each request pins ZDR itself. Free-endpoint training is on, but no free endpoint is used. No provider or author restrictions.
  - Workspace: matches the reviewed one (hash prefix `158ce549`), with no budget. Input/output logging is off.
  - LangSmith destination "PandaByte RAG evaluation": Privacy Mode on, Cost metadata on, Identity, Request context and Cost allocation off, Global region only, 100% sampling, one included key (DatummAgent).
  - Key DatummAgent (`…5be`): $20 limit with **$0.528 remaining**. No settings were changed.
- **Real Haiku C2 run 1 (fixture `f49b6bb9…`, SSM `04f1b545`): fail_closed.**
  - One real provider call; gateway 503; outcome `unknown`; `retainedUnknown:true`. Exact container removed, OOM 0. Not resent.
  - OpenRouter Logs show the generation completed on Amazon Bedrock: 1,190→100 tokens, `tool_calls`, $0.000169, "No data training".
  - Cause (reproduced with 3 structural diagnostics plus one local replay of the real client, shapes only): Haiku 5.5 streams a first delta with `reasoning_details:[{type:'reasoning.text',signature:<opaque>,format:'anthropic-claude-v1'}]` (no text) when no `reasoning` field is sent. The strict parser correctly rejects non-empty `reasoning_details`.
  - Fix: Haiku descriptor `reasoning:'omit'` → `'disabled'`, which sends `reasoning:{enabled:false}` (the existing Luna convention). Parser strictness unchanged.
  - With the field: no `reasoning_details`, 0 reasoning tokens, and the local real client validated a Haiku tool-call turn (3 tool calls, 1.8 s, $0.000151). Focused tests 91/91.
  - Diagnostic spend: about $0.0005 across 4 calls.
- **Real Haiku C2 run 2 (fixture `861474e1…`, SSM `04be8c4d`), after the reasoning fix: fail_closed.**
  - The first model call validated and settled (gateway 200). Haiku returned **two parallel** search calls.
  - Query 1 added the out-of-scope words "examples interfaces", so the scope guard refused it as designed.
  - Query 2 was fully in scope but was also refused: "Public search unavailable", with 0 tool dispatches. Root cause is under investigation.
  - Native then sent a continuation carrying the error results, and the gateway answered 403. No search call, exact cleanup, OOM 0, `retainedUnknown:false`.
  - Full suite: 1208 pass, 32 opt-in skips. The single failure is `guarded-dictation`, a client test that must run without `--conditions=react-server`; it passes 2/2 under default conditions.
- **Real-path fixes after run 2 (all offline-tested; research tests 247/247).**
  - (a) The in-container MCP shim queues parallel tool calls and sends them one at a time, failing none. Regression `research-mcp-shim-queue.test.mjs` fails on the old shim.
  - (b) The gateway binds OpenCode 2.2.5's exact errored-tool wire string `{"error":{"type":"tool.execution","message":...},"content":[]}`, restricted to the shim's two fixed failure strings. The frontier hash stays `hash([])`.
  - (c) The answer verifier also accepts a preamble followed by exactly one closing ```json block; the preamble is discarded.
  - Injected parallel host check (`49413cce…`, SSM `c9c95d7f`): 12 checks pass. One search completed, one was refused, and the continuation got 200 and an evidence answer.
- **Real Haiku run 3 (`fd45a879…`, SSM `bc2fe70c`).**
  - The native turn succeeded: 3 model calls, 1 real Tavily search, all gateway 200.
  - Two queries were refused for the out-of-scope words "examples"/"interfaces".
  - Haiku's answer cited the RP2040 datasheet passage on UART/SPI/I2C and noted it came from a Seeed-hosted copy. The verifier rejected it for its prose-plus-fence format, which led to fix (c).
- **Real Haiku run 4 (`de6cc208…`, SSM `4a1c0b95`).**
  - The native turn succeeded with 2 model calls and 1 real search. The usage and final-stop/source binding checks passed.
  - Haiku honestly returned `insufficient`: its one admitted search lacked the interface passage. The driver expects `evidence`, so the run is recorded as fail.
  - Test change: added example(s), interface(s), uart, spi and i2c to the public query vocabulary. It is still public-only, and `rp2040` and `pio` are still required.
- **Real Haiku run 5 (`bb471b73…`, SSM `7f610540`), after widening the vocabulary.**
  - **The public-docs question passed.** Two parallel real Tavily searches were queued and both completed. The evidence answer passed verification. Checks passed: usage receipts, final stop with sources bound, and the cached replay with no dispatch.
  - Model calls: call 1 was 1,205→155 tokens, 2.2 s, $0.000198; call 2 was 5,267→344 tokens, 2.5 s, $0.000699.
  - **The unsupported-board follow-up turn in the same session failed closed with `not_sent`.** Its history (≈10.9 KB of messages: two tool results ≈4.7 KB each, plus the answer) plus the system prompt and tool schema exceeds the frozen 14,000 B canonical wire bound. This was measured from private native rows; the exact wire was not captured.
  - The bound was sized on GPT-OSS runs. A design decision is needed: raise the wire byte and input-token bounds for the non-legacy models (with reservations recomputed and GPT-OSS goldens unchanged), or defer multi-turn history to native compaction (phase F).
- **Owner decision, 11 Nov 2026: raise the request bounds** for the non-legacy models.
  - Haiku, Luna and Terra now allow 32,000 input tokens and 48,000 B of canonical wire, held as per-descriptor `maxInput`/`wireMax` and bound in `policyHash`.
  - GPT-OSS keeps 16,000 / 14,000 (goldens unchanged).
  - New reservations: Luna 4,785,001, Terra 47,850,001, Haiku 6,750,001 nano-USD.
  - Also fixed: a comment had swallowed the `historyIdMax`/`historyIdSanitize` type fields.
  - Checks: tests 263/263, native strict typecheck pass.
- **Real Haiku run 6 (`f1fcb30f…`, SSM `583fa38e`).**
  - The follow-up turn now fits the wire bound: 3 calls, all gateway 200.
  - The unsupported-board answer was a helpful uncited refusal (non-empty answer, `evidence:[]`), which the verifier rejected as `invalid`.
  - Fix: no evidence now means `insufficient`, and the uncited text is never shown.
  - (A partial fixture `78fa52be…` from an expired AWS session was never admitted.)
- **Real Haiku run 7 (`c90ca03c…`, SSM `fe00f672`): C2 PASS, 6 checks.**
  - Checks: public docs with evidence and sources bound, cached replay with no dispatch, unsupported board `insufficient` with no search.
  - 4 model calls: 1,205/4,912/5,297/5,659 input tokens, 2.2–2.9 s each; total $0.0021728.
  - 2 real Tavily searches: 5.2 s and 7.1 s through release.
  - Turn times: first 32.0 s, second 7.1 s. Peak memory 407 MB, OOM 0.
- **Real Luna run 1 (`aea5466d…`, SSM `4aa51a9b`): fail_closed (`retainedUnknown:true`, not resent).**
  - The second call's first frame carried `reasoning_details:[{type:'reasoning.encrypted',data,format,id,index}]` (keys only, from the private capture). That was despite the approved `reasoning:{effort:'low',exclude:true}`.
  - The parser rejected it and cancelled the stream. OpenRouter logs: finish `cancelled`, Azure 499, 1,851→6 tokens, $0.000207.
  - Fix: exact `reasoning.encrypted` items (at most 4, bounded fields) are accepted and discarded, and never rendered, stored or forwarded. Every other `reasoning_details` shape stays invalid. Tests 263/263, typecheck pass.
- **Real Luna run 2 (`74338719…`, SSM `40c30cdf`): C2 PASS, 6 checks.**
  - 3 model calls: 571/2,090/2,223 input tokens, 2.0–3.4 s each; total $0.000476378.
  - 1 real Tavily search, 7.4 s through release.
  - Turn times: first 23.0 s, second 8.4 s. Peak memory 386 MB, OOM 0.
- **Real Terra run (`74f3da6d…`, SSM `22a27b2f`): C2 PASS, 6 checks.**
  - 3 model calls: 575/2,105/2,195 input tokens, 1.5–6.1 s each; total $0.00440121.
  - 1 real Tavily search, 7.4 s through release.
  - Turn times: first 21.6 s, second 11.7 s. Peak memory 392 MB, OOM 0.
- **All three vision models now pass the real C2 gate** (Haiku run 7, Luna run 2, Terra run 1). Real spend across all runs and diagnostics today ≈ $0.012.
- **Phase D started (owner approved, 11 Nov 2026).**
  - Owner decisions: new separate REST API; 24-hour privacy attestation; owner/Admin only; $1 per user per day.
  - Plan [phase-d-plan.md](phase-d-plan.md) went through three readiness reviews (R1/R2, then "D1 ready").
- **D1 applied to live, 11 Nov 2026.**
  - Migration `20261112090000_panda-agent-research-turns.sql`: SHA-256 `297767ea…` before the overlay test was added to the fixture; the migration itself is unchanged since the reviewed fixes.
  - An independent SQL review found 1 Blocker (fail after receipt double-released the budget) and 4 Majors. All are fixed.
  - Rollback-only fixture `scripts/check-research-turns-database.py` passed 31/31 on a disposable schema-only InsForge branch (`d1-research-test`, now deleted). It covers the cited-answer path, receipt negatives, ledger and daily cap, fail/cancel, the cross-journal fence both ways, generic finish blocked, MAC/exp/non-admin/other-owner/anon denial, and non-research reads identical to before.
  - Then applied to live `feh4966v` via the CLI. Verified: migration recorded; RPC and read granted to `authenticated` only; helpers and the pre-research read not executable; both tables RLS on with no grants; 0 research rows.
  - Live owner-session read smoke test, run by the peer session after the apply: an existing owner chat returned 200 with the same 4 assistant messages, its 2 citations intact, and no new masking.
- **D2 host research service, 12 Nov 2026.**
  - Built: `research-envelopes.ts`, `research-turn-runner.ts`, `research-service-handler.ts`, `scripts/research-service.mjs`, and `releaseStaleDockerHostSlot`.
  - Process: readiness review (2 Blockers, 6 Majors) folded in; implementation by a subagent; independent review (3 Majors plus Minors) fixed; one real handler race (concurrent identical turn) found and fixed. Research and quota tests 280/280; typecheck clean.
  - MCP readiness verified on host: OpenCode 2.2.5 auto-connects `panda_research` about 2.9 s after config. `/api/mcp` is now allowed in the transport and proxy.
  - Host gate `scripts/test-research-service.mjs --aws-service-injected` (real handler, runner and native runtime; synthetic OpenRouter/Tavily):
    - Fixture `d66400f5…`: 3/5. The follow-up turn returned `failed`, most likely a transient MemAvailable dip below 1 GiB after the first container was removed. That was not proven: the runner had no diagnostics then.
    - Fix: a bounded (15 s, cancellable) memory-recovery wait before any provider call, plus an opt-in diagnostic-code hook used only by the gate.
    - Fixtures `75a3d427…` and `dfa1e5ea…`: 5/5 each. Checks: signed evidence through the real native runtime; same-request replay with no new provider call; status returns the stored result; the follow-up reuses the epoch and native session; restart reconcile clean with no held slot. 0 real calls.
  - Deferred to D3/D4 end-to-end: a real per-model turn through the service (the same verified modules already passed real C2 on all three models), the HTTPS entrypoint, and systemd install.
- **D3 transport live (no model calls yet), 12 Nov 2026.**
  - **Contract:** D3 section in [phase-d-plan.md](phase-d-plan.md).
  - **Readiness review:** 2 Blockers, 10 Majors. The Blockers were a missing attestation mapping to `invalid` and the relay path shape. Both are fixed, along with the size caps, body bound, status semantics and unit hardening.
  - **New code:**
    - relay `runtime/research-relay/index.js`;
    - stack builder `infra/build-research-stack.mjs`;
    - app client `src/server/research-gateway-client.ts`;
    - gate script `scripts/check-research-gateway.mjs`.
  - **Service change:** the service now starts without an attestation, and a missing attestation gives `failed:attestation_expired` with no provider call.
  - **Host install:**
    - Through private SSM steps: source `/opt/panda-research-app/7d9fbbd0…` (26 files).
    - `/etc/panda-research` (0700): `service.json`; `keys.json` and `credentials.json` via a one-time RSA-OAEP/AES-GCM handoff; an EC P-256 TLS key that never leaves the host, with a 1-year certificate whose SAN is `panda-research.internal`.
    - `panda-research.service` (root, `MemoryMax=384M`, `StartLimitBurst=5`) is active on 172.31.18.90:8444. Reconcile: 0 interrupted.
  - **New stack `panda-research-17d69604`:**
    - REST API `a2lwjl2ri4`, stage `research`, three POST routes;
    - a streaming relay Lambda;
    - caller role `panda-research-17d69604-caller`, which trusts only the Vercel OIDC `environment:development` subject. The token's `sub` was checked locally; the token itself was not printed.
  - **Bug found live and fixed:**
    - The relay's pass-through path called `end(chunk)`, which skips the Lambda stream's metadata prelude, so API Gateway returned 502.
    - Fix: `write()` then `end()`. The test sink now refuses `end(chunk)`.
  - **Live gate: 13/13, 0 provider calls.**
    - A signed status for an unknown id reaches the host (404).
    - A signed turn returns a verified `failed:attestation_expired` in 215–271 ms.
    - The same request replays its stored result; status returns the same signed result.
    - Another subject cannot read the request; a different prompt on the same request gives conflict.
    - Unsigned requests are denied.
    - Unlisted paths are denied.
    - A bad dispatch MAC is rejected by the host.
    - An expired dispatch is rejected.
    - An oversize body is rejected.
    - A wrong `accept` header is not forwarded.
  - **Finding: the account root gets past the API principal deny.**
    - A signed account-root session is not stopped by the API resource policy's principal deny.
    - The existing API behaves identically (root GET status → existing relay 503).
    - On both APIs the relay's caller-ARN check refuses it before forwarding, and the host also requires the app-signed MAC.
  - **Unchanged (before/after):**
    - Existing relay configuration hash, API resources and stage deployment.
    - The existing caller role, by content (last CloudTrail change 5 Nov). A first hash mismatch came from output encoding, not a change.
    - The existing stack (last updated 2 Nov) and `panda-agent-hosted` (active since 5 Nov).
    - The host security group gained exactly one rule: 8444 from the new relay group.
  - **Tests:** research/quota/relay/client 293/293; native typecheck passes.
  - **Not done yet:** real turns through the API (they need a fresh Brave privacy re-read, then a 24 h attestation), and D4 localhost routing.
- **D3 real turns through the new API, 12 Nov 2026.**
  - **Privacy re-check:** after a fresh OpenRouter privacy re-read in Brave (read-only), a 24 h attestation was installed. It contains only hashes and booleans and expires 2026-11-12T20:14Z.
    - Unchanged since the earlier review: paid training, prompt publishing, the 1% discount, the global switches and input/output logging are all off.
    - LangSmith "PandaByte RAG evaluation" still has Privacy Mode on, sends cost fields only, and is limited to DatummAgent.
    - The key's workspace matches the UI (hash prefix `158ce549`). Key spend before the tests was $19.51 of its $25 limit.
  - **Real cited answers through the full path** (app client → SigV4 → API → relay → host → native OpenCode → Tavily → OpenRouter), each `evidence` with 2 citations:

    | Model | Time | Cost |
    |---|---|---|
    | Haiku | 26–35 s | $0.0006–0.0008 |
    | Luna | 31.6 s | $0.00036 |
    | Terra | 39.8 s | $0.0059 |

  - **Memory floor fix:** idle MemAvailable is about 1,044 MB, below the old 1 GiB floor, so Terra returned `busy` with 0 calls. The floor is now the container hard cap plus 256 MiB (768 MiB, `researchHostFloorKiB`). The cap is enforced by `--memory` equal to `--memory-swap`.
  - **Follow-up turns:**
    - The first real follow-ups (Terra, then Haiku) ended `unknown` with diagnostic `answer_invalid`. The model cited sources from the previous turn, which verification rejects by design.
    - Fix 1: the host preface now requires a fresh search for every question.
    - Fix 2: a settled but verified-invalid answer is now `failed:invalid` with its real usage, not `unknown`.
    - Injected host gate `67e15cb1…`: 6/6, including the new `unverifiable_citation_is_failed_invalid_with_usage_not_unknown`, with 0 real calls.
    - The service also logs the runner's sanitized diagnostic codes.
  - **Live gate `--real haiku`:** 15/15. The follow-up searched again and returned an honest `insufficient` (3 calls, $0.0014).
  - **Spend:** about $0.025 in total today for D3 real turns.
  - **Service:** redeployed three times by source hash (current `7112cad1…`); restart reconcile was clean each time.
- **D4 and PandaByte site search, 12 Nov 2026.**
  - **D4 (771e290):** web-search chat turns route to the research harness. It is Admin-only, uses one unit of the daily web-search allowance per turn, claims within the $1/day cap, dispatches once, and polls status by the same request id. The independent review's two Majors are fixed. Main (`83402f8`) is merged in.
  - **PixelRAG study (subagent):**
    - The repo, StarTrail-org/PixelRAG, is Apache-2.0. It renders pages to image tiles with Chromium, embeds them with Qwen3-VL-Embedding-2B, and stores them in FAISS/Qdrant.
    - That stack does not fit the t4g.small, and its images cannot be quoted as exact text.
    - We took the text-first slice of the same idea: retrieve the live page, not a stale copy. No code was copied, so no attribution is needed.
  - **`src/search/pandabyte-site.ts`:** PandaByte queries (the brand or a product code) read live pandabyte.in pages.
    - Product pages are found through `store-products-sitemap.xml`, cached for 10 min. A query reads at most 2 product pages, or the matching category page for broad queries.
    - It fetches only `https://www.pandabyte.in`, with no redirects, a 3 MB cap, a 20 s limit, and the dispatch grant requested before any fetch.
    - Results use the same signed receipt shape (provider `pandabyte_site`), so citation binding is unchanged.
    - Category listings become one "Name: price." line per product.
    - Site queries skip the prompt-word limit, because they never leave the host; web queries keep it.
  - **Live checks against pandabyte.in:** the xS3 page in 646 ms, the dev-board category in 84 ms; the service host fetches them too.
  - **Real turns through the AWS path (Haiku):**
    - The first two returned `insufficient`: the scope guard refused queries such as "price". Fixed.
    - xS3: `evidence` in 26.6 s, $0.00061, with 16 MB flash, 8 MB PSRAM, ₹1,000 and 2 citations from the product page.
    - All boards: `evidence` in 33.6 s, $0.00065, with every PandaByte board price correct after the one-line-per-product fix.
    - Known gap: one listing line was split across two 180-character passages (the xLoRa price).
  - **Service:** redeployed three times by hash (current `4af6b874…`), reconcile clean. Research/site tests 305/305; full suite 1342 with 2 pre-existing failures (also on main).
  - **Blocked on owner approval:** the CloudFormation update that lets the production Vercel login assume the research caller role (permission check: IAM trust grant), the production Vercel research env vars, and the production deploy.
