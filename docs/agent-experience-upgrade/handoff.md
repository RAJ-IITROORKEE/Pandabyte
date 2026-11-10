# Agent Experience Upgrade — current handoff

10 November 2026. Current release branch: `codex/conversation-memory-speed`; native development remains in its original checkout.
Use `git log -1` for the local checkpoint. Latest native/UI follow-up is below; earlier Control Room and grounded RAG evidence is retained. Prior basic-history checkpoint is `72b2a20`.
The owner now authorizes commit, merge to main and push after the requested local
experience works and is validated. The latest direct-demo request authorizes its Vercel update; commerce and provider-policy
changes remain excluded. Historical restrictions below describe earlier scope.
Prior detailed evidence remains in the verification JSON and Git history.

## Conversation-memory and latency follow-up, 10 November 2026

The owner authorized automatic same-chat follow-ups, response-speed work, subagents, Codex Browser tests, main publication and a live update. Code **139fa22** is pushed to main and deployed as **dpl_8wLq3Lr2ayRfyxx6RNewC2bHhqLa**, Ready and promoted at https://pandabyte-iot.vercel.app/panda-agent. Active release checkout: C:/Users/rajra/.codex/worktrees/direct-llm-release/Pandabyte, branch codex/conversation-memory-speed. Original native checkout and unfinished work remain preserved. Separate RAG source/documentation through ec5529a is retained; no main-chat retrieval or AWS/OpenCode execution was enabled.

The additive v2 signed RPC selects up to six preceding verified direct-journal turns, intersected with existing masked history. Cancelled, pending, foreign, cited/RAG and unverified records are excluded. A context fingerprint is rechecked before dispatch and publication. Whole oldest pairs are dropped until the exact serialized request fits 7,000 UTF-8 bytes, preserving the 8,024-input/700-output bounds and one 1,597,640-nanoUSD reservation. This is recent same-chat context, not unlimited or cross-chat memory or full Mem0 acceptance. No external memory service or new dependency.

Migration 20261110140000_direct-conversation-memory.sql is applied; v1 remains unchanged. Six disposable real-database checks passed with cleanup and zero provider calls. See [database evidence](conversation-memory-database-verification.json). TypeScript, scoped lint, production builds and 97 affected automated tests passed. The 97-task register validates; broad Phase1 statuses remain partial. Terra high implementation workers and an independent integration review found no material blocker.

Real Codex Browser checks passed locally (MaplePanda/ESP32-C3/SCD41 recall after reload) and on the hosted domain: CopperLeaf/ESP32-C6/BME280 recall after reload; sensor correction to SHT31; subsequent correct recall; persisted answer after reopening; and a fresh chat correctly reported no knowledge from another chat. All six updated live message POSTs returned200 and saved. [Release evidence](conversation-memory-release-verification.json).

Independent current read-only session/history/token checks overlap; new direct requests skip legacy classification probes. Fresh policy, endpoint/ZDR and pre-send checks overlap where independent. No completed privacy/session cache or retries. A same-prompt hosted comparison completed in 4,899 ms versus 6,657 ms before (26.4% lower for one sample); first headers were 2,456 versus 2,238 ms. Updated varied-prompt completions ranged 3,670–7,903 ms. This is limited evidence, not a sub-second SLA or latency distribution. [Baseline](conversation-memory-baseline.json).

Strict ZDR, pinned Azure US Luna, no fallbacks, no response cache and metadata-only tracing remain. Current account privacy/destination settings were reviewed read-only; no account or hosted profile changes. Nine real calls in this checkpoint (one old-code baseline, two local, six hosted). The original USD1 cumulative ledger is unchanged: 936,631,200 nanoUSD reserved and **63,368,800 nanoUSD (USD0.0633688) remaining**. This conservative reservation balance is not billed spend; no refund/reset. A bounded 50-row runtime sample had six message POST200s, no error/fatal rows and no HTTP5xx.

Context validation and POST/finish are separate operations: a checked snapshot, not a provider-spanning transaction. No history-edit/withdraw operation is introduced. Next: owner tests follow-ups on the live demo within the small remaining allowance. RAG, broader memory management and native harness integration remain separate; Phase2 stays gated. Rollback candidate a45fc29 / dpl_QyaEmLUPfCsHe2s4LCC9HsTHKcNb is retained; no rollback executed.

## Historical direct-release priority: client demo (10 November 2026)

The owner explicitly deferred new RAG and AWS/OpenCode harness integration. Ship the existing Panda Agent UI with a direct OpenRouter LLM and system prompt first. Commit, push to main, Vercel deployment, server-only required keys and Codex Browser validation are authorized for this checkpoint. Preserve separately owned Control Room source and deployment work. This supersedes older no-deploy statements below only for this release.

The direct route uses Luna on the exact Azure US endpoint, strict ZDR/data-collection denial, no provider fallbacks, no reasoning/tools/plugins and no response cache. A server-only reviewed privacy profile binds the original owner, key, workspace and original cumulative USD1 budget. New direct turns have their own signed receipt journal; they do not fabricate OpenCode execution evidence. Only enabled Luna is offered in this first direct release. Existing native model work stays deferred.

Applied development schema: 20261110130000_direct-assistant.sql; a valid-receipt test exposed PostgreSQL 42702 from a variable/alias collision, repaired by 20261110131000_direct-receipt-budget-alias.sql. Five real-database fixture checks pass: readiness, ownership/replay/one-quantum admission, exact receipt/answer/cost binding and saved history, mismatched receipt withholding, cancellation/archive. Independently confirmed fixture cleanup; zero provider posts in that pack.

First actual direct Codex Browser question reached a single claim but had no receipt or terminal answer. It was reconciled and logically cancelled without replay or refund. Original reservation allowance after this claim: 87,333,400 nanoUSD (USD0.0873334). Latest after all seven direct claims: 77,747,560 nanoUSD (USD0.07774756). This is conservative reserved allowance, not billed spend. Four subsequent actual direct questions passed: a short electronics answer, a practical ESP32 plan, fenced Arduino code, and an automatically dispatched queued follow-up. Each reached HTTP200, validated receipt and durable finish; saved answer survived browser reload. Warm localhost message requests took 18.0–19.7 seconds; this is not a sub-second acceptance claim. Do not replay the earlier uncertain request. Server diagnostics emit fixed stages and HTTP status only, without payloads or identifiers.

Clean release candidate: codex/direct-llm-release in the separate direct-llm-release checkout, preserving Control Room source ab763c9. Dependency installation and TypeScript passed; production build passed (42 static pages), scoped lint passed and 27 focused tests passed. Local saved/reload and queue acceptance passed; hosted-domain validation passed: a general answer and fenced Arduino code both saved and survived reload in Codex Browser. Production direct profile and enable flag are configured server-only. Code commit a45fc29 is pushed to main and deployed as dpl_QyaEmLUPfCsHe2s4LCC9HsTHKcNb, promoted to https://pandabyte-iot.vercel.app. Final alias inspection confirms this Ready deployment. A 50-row bounded runtime sample had two message POST200 results, zero error/fatal rows and zero HTTP5xx. See [release evidence](direct-assistant-release-verification.json).

This first direct release sends the current question plus system prompt. Saved history is displayed and receipt-verified but is not yet supplied as conversational context. Long-session memory and agent orchestration remain deferred; this is not full harness or Phase1 acceptance. The prototype is still owner-bound. Do not present warm-local 18–20-second results as sub-second hosted acceptance.

Tavily is deferred: no configured key was found and existing search code is production-disabled. Original historical/native evidence below remains historical. Phase2 remains gated.

## Admission repair and verified remaining blocker, 10 November 2026

See [requested model admission](requested-model-admission.md). Native privacy
was freshly reviewed read-only, the matching native-only lease renewed, and
Codex Browser verified Ready with the existing shared allowance. The model
header now reaches the factory policy and budget; invalid IDs deny admission.
Luna reservations retain compatibility with the installed journal by omitting
its implicit default model field. Focused regressions and native TypeScript pass.

Live browser diagnostics reached OpenRouter HTTP200. Receipt validation rejects
actual prompt cache writes: the last diagnostic reported cached_tokens=0 and
cache_write_tokens=1078. Model, provider, cost, reasoning and completion checks
passed. The receipt contract currently demands zero cache reads/writes. Do not
merely drop that check: review ZDR-compatible in-memory caching AND include
cache-write prices in worst-case reservations before accepting it. OpenRouter
documents in-memory prompt caching as ZDR-compatible separately from response
caching; X-OpenRouter-Cache:false remains set. No answer publication is claimed.
Uncertain diagnostics were logically cancelled without replay or refunds.
Final ledger readback: 72,307,960 nanoUSD reserved, 927,692,040 remaining,
five native call rows and zero accepted native receipts. These conservative
reservations are not a claim that the full reserved amount was billed. Final
focused run:22 tests passed; native TypeScript and scoped lint passed.

Authenticated metadata confirms ZDR/safety-retention-off endpoints for the
requested DeepSeek0324, Terra and Haiku models. Their selector labels now say
Integration pending; runtime profiles, token/framing bounds, model-aware journal
accounting and browser acceptance are still incomplete. NVIDIA's requested free
route is absent from the ZDR endpoint list and explicitly logs session data, so
it remains disabled with Requires data retention. No change to strict ZDR or
the USD1 cap, no migration application, merge, push or Phase2 advancement.

## Composer and service verification in progress, 10 November 2026

The owner supplied four model IDs: `nvidia/nemotron-3-ultra-550b-a55b:free`,
`deepseek/deepseek-chat-v3-0324`, `openai/gpt-6.1-terra`, and
`anthropic/claude-haiku-5.5`. They are listed as disabled pending verified
admission and runtime integration; listing them is not evidence of working
inference or strict ZDR. The composer selector is aligned with voice and send
on the right. Codex Browser confirmed the layout and all four labels. The
current preview reports privacy or budget requirements unmet, disabling the
composer and selector. Thirteen capability/queue tests passed and scoped UI
lint passed. No new inference was sent.

AWS CLI authorization was refreshed through the owner's Brave session. Read-only
AWS checks found `panda-agent-phase1` running and its SSM agent online. The
existing `panda-lightweight-replacement` container reports healthy; host-local
port 8182 returned `ok` from `/health` and `ready` from `/ready`. This does not
prove that native OpenCode chat calls that service. No AWS configuration changed.

The composer now exposes a model selector with server-reviewed availability;
queued prompts retain their selected model and cannot silently substitute another.
The owner will provide the additional model identifiers. DeepSeek and NVIDIA
options are not established as executable. Codex Browser showed the selector
and Luna as selected; this is not proof of a successful model switch or live
tool-enabled answer. Thirteen focused capability and queue tests and TypeScript
passed. No inference was sent in this verification step.

The standalone lightweight FastAPI service started locally with a disposable
deterministic profile and reported health and readiness OK. Its 83 Python tests
passed using an isolated Windows test environment; they use fixtures and do not
prove a deployed container or OpenCode-to-FastAPI integration. The AWS CLI session
was expired, and a fresh sign-in is awaiting the owner's completion in Codex
Browser. Current AWS host health remains unverified.

The last tool-enabled Luna request remains unresolved as described below. The
native model choice is not fully connected end to end, and strict ZDR, the shared
USD1 cumulative cap and fresh privacy admission still apply. Do not replay the
uncertain request. The existing main checkout contains unrelated modifications
and conflicting untracked files; preserve them. The requested merge and push are
conditional on successful integration validation and a safe reconciliation of
those changes. No merge, push or deployment has occurred in this checkpoint.

## In-progress native tools and model selector, 10 November 2026

The owner requested a dynamic no-RAG OpenCode agent, official-documentation tools, skills, and a model selector in the composer. The owner subsequently allowed metadata-only LangSmith tracing for native tests; prompt/completion exclusion was observed in OpenRouter. Strict ZDR and the existing shared USD1 cap remain required. RAG is separately owned.

The native MCP tools, pinned skill profile, model selector and model-aware runtime are in the working tree. Isolated OpenCode 2.2.6 fixtures passed answer and tool-continuation cases; the real official ESP32 documentation fetch succeeded. Development migrations 20261110070000 and 20261110071000 were applied; 17 disposable journal checks passed and fixtures were cleaned. The 20261110072000 model-budget successor is NOT applied: its rollback-only schema compilation now passes, but accounting review, disposable tests, server routing and live model verification remain. DeepSeek is disabled; NVIDIA free entries lack verified ZDR endpoints.

The first live Luna tool-enabled browser request returned a provider tool call but no durable model receipt or chat answer. It was not replayed; the user-facing request was cancelled and the native context retained. The shared reservation is retained. Sanitized provider diagnostics were added to source but are not yet in the running build. Investigate the returned tool-call shape with a new, separately admitted test; never replay the uncertain request. Model selection is not yet connected end to end and Phase 1 remains incomplete; do not advance to Phase 2.

The last observed shared budget reservation was 65,917,400 nanoUSD after the live test (remaining 934,082,600), subject to concurrent RAG activity. Check the ledger again before any inference. The native metadata-only privacy lease expires after 30 minutes and requires fresh verification before renewal. Preserve concurrent RAG changes, unrelated files and test histories. See the newer conditional publication authorization above.

## Current priority — native plain-chat and UI checkpoint, 10 November 2026

The owner approved the no-RAG plan and Terra6.1/high bounded implementation,
then explicitly waived Superdesign for direct current-branch UI changes.
RAG stays separately owned in [current_RAG.md](../../current_RAG.md). Preserve
the concurrent RAG commits and remaining dirty files. No Phase2 advancement,
push, merge, deployment, commerce or account-wide privacy change.

**Working locally:** the mounted ordinary-message path now uses isolated pinned
OpenCode2.2.6 execution through the server-owned provider gateway. It is not the
direct single-question rewrite factory. Durable owner-bound attach/create/prompt/
provider claims and immutable reservation-linked usage precede publication.
Luna/Azure US strict-ZDR receipts were validated; two answers saved in main chat,
including a FIFO queued follow-up, and reload retained the first answer.
Saved-turn journal elapsed times were31,478ms and26,227ms, not fast-response
acceptance. The upstream completion is buffered before SSE delivery.

Requested UI is implemented: footer three-dot navigation contains Memory,
Account/settings and Appearance; the standalone Workspace block and header theme
toggle are removed. Conversation and composer are wider/aligned at960px. The
existing reduced-motion-aware Shimmer marks actual running work. Stop and a
three-entry removable page-local FIFO queue passed browser checks. Stop,
uncertainty and chat changes pause the queue; resume requires an idle reconciled
owning chat. Reload discards queued text. Each native request has independent
context; saved history/project memory are not supplied. MCP/tools/children are off.

The first live native turn completed internally but application observation was
unconfirmed. It was never replayed. Redundant actor checks were removed and
independent native reads parallelized; subsequent answers persisted. The precise
historical swallowed failure is unproven. The first turn was logically cancelled
and its private context retained. A queued Stop after a later provider receipt
also blocked late publication. Neither reservation was refunded. Offline matching
of retained native data does not establish restart provenance or safe auto-resume.

Development migrations20261110030000 and20261110031500 are applied, with11
rolled-back function compile checks and a full rollback-only successor check.
Thirteen authenticated journal checks, seven retirement checks and two legacy
route-fence checks passed; all
disposable identities/chats/synthetic budgets were cleaned and absence verified.
Successful verified runtime cleanup records retirement. Any attached unretired
context blocks direct/cascade history deletion. Migration20261110033500 also
blocks legacy retrieval preparation of a native-classified turn. Native journal
registration is opt-in, so older projects do not require the new RPCs by default.
Keep PANDA_AGENT_ASSISTANT_JOURNAL_ENABLED=true after activation even when
PANDA_AGENT_ASSISTANT_NEW_MESSAGES is disabled, so status/cancel recovery remains.
The final route fixture needed scoped follow-up cleanup after its normal RPC
returned unavailable; absence was verified, but that transient cause is unproven.
Uncertain contexts remain an
explicit reconciliation/cleanup gate; do not erase their journal or replay them.

The same USD1 cumulative allowance remains shared with RAG; no reset/reseed/refund.
Last readback reserved25,976,400nanoUSD and remaining974,023,600nanoUSD, including
the original full cent carry-in. Four native receipts total266,860nanoUSD actual
reported usage; conservative reservations remain larger. Native preview has its
own private30-minute privacy lease so renewal does not invalidate RAG's lease.
Logging/traces/data discount/public prompts were checked read-only; no settings
changed. Expiry or endpoint/budget/key/session mismatch denies admission.

Verification and remaining scope: [native-mvp-verification.json](native-mvp-verification.json),
[UI implementation](native-agent-ui-implementation.md), and
[version compatibility](native-v2-compatibility.json). Current test run:
780 server cases,754PASS/26existing fixture skips/0FAIL; two dictation cases pass
separately without react-server conditions. Twelve focused runtime/runner cases
pass, including actual2.2.6 one-request429/no retry and retained/retired context. Production
build and trace review are recorded below after final integration. All97 tasks
validate and original specification SHA256 is unchanged.

Next remain in Phase1: exact binary contract/overflow/LSP proofs; approved native
read-only MCP/skills with actual dispatch; bounded children and shared native
session/context lifecycle; long-session memory/compaction accounting; persisted
structured plan/BOM events and complete acceptance. Do not present this bounded
one-call increment or UI queue as the complete harness or native durable inbox.

## Historical plan-first native MVP, 10 November 2026

The owner separated RAG improvement into [current_RAG.md](../../current_RAG.md).
RAG changes and paid RAG tests are paused; do not reintegrate until the owner
returns its handoff. Preserve the complete original specification and97 requirements.
Full Phase1 remains partial; Phase2 is gated.

Answered MVP: embedded help, project plans and structured BOMs; approved read-only
tools; one main agent with optional bounded subagents; approval before external
writes; **USD1 cumulative total across every OpenRouter call**, strict ZDR unchanged.
See [design and observed gaps](no-rag-harness-design.md) and
[implementation plan](../superpowers/plans/2026-11-10-no-rag-opencode-harness.md).
The owner requested the plan before further implementation. All21 current shadcn AI Elements patterns are reviewed in [the component mapping](ai-elements-component-plan.md); assistant-ui remains the sole chat-state owner. No component/skill dependency was installed. No new UI draft is
approved, no2.2.6 install/upgrade occurred, and no native live readiness is claimed.

Read-only current research: npm latest V2 is2.2.6; pinned tested binary is2.2.2.
Some SDK/server documentation redirects to V1. V2 prompt/schema, event recovery,
child permissions and effective provider settings require version-specific proofs.
Codex Browser inspected the existing3001 preview without submitting a new prompt.
Disabled model/search/attachment controls and saved historical RAG outcomes remain.

Uncommitted drafts preserved: direct plain-Luna transport, owner-bound chat service,
route selection/copy changes and isolated single-question CLI/relay. Synthetic
checks:42 shared transport/policy,8 service/store,21 routing; CLI7 offline tests
include actual2.2.2 to mock provider. These are separate test runs, not a combined
new full-suite count. New plain-chat migration20261110030000 has7 rolled-back
compile checks and is NOT APPLIED. No final production build/browser acceptance
of these drafts. Current preview build remains tkofjVcUMfIFq9Kl4xn-k.

The earlier USD1 shared-budget migration20261109210000 IS applied in development;
12 real authenticated Clerk/InsForge fixture checks passed and cleanup was verified,
with0 provider calls in those checks. Full earlier cent carried in; last readback
17,988,200nanoUSD reserved (5 new reservations), leaving0.9820118USD conservative
allowance. Never reset/refund/reseed. Existing old4 markers remain. Privacy proof
expires independently; verify again before later live execution.

Last live RAG total21,430ms vs2,170ms provider roundtrip; further IO changes have
synthetic coverage only. Main USB citation/saved reload and standalone/compound
unsupported-voltage abstention were tested. Bulk Evaluation remains unavailable;
LangSmith is disabled. No paid call occurred after the pause. No push/merge/deploy,
provider-account change, commerce change or recovery operation.

Historical sections below retain their original dates/results. Their cent-only
activation and older operating status are superseded by this current checkpoint.

## Historical checkpoint — cent-only live basic RAG, 10 November 2026

The owner's current priority is Control Room LLM output first, then basic main
chat; OpenCode is optional for this prototype. The original specification remains
verbatim and all97 requirements remain tracked. Full P1 is partial; Phase2 is gated.

The owner explicitly approved USD0.01 TOTAL Luna testing, with strict ZDR retained.
Fresh signed-in OpenRouter privacy review found logging/traces/data-discount/public
prompts off; no settings changed. Fresh endpoint/ZDR APIs pin `azure/us`, with
safety retention false, no fallback/tools/plugins/caching/reasoning. Default free
Phala recheck still429; no automatic retry or relaxed privacy fallback.

Actual live results:
- Synthetic diagnostic HTTP200: TEST8266;156input/47output, zero reasoning tokens,
  USD0.00004301. OpenRouter returned the exact catalog alias, not the dated endpoint
  name. The retained response was revalidated offline after the exact-identity fix;
  no second diagnostic POST.
- Codex Browser Control Room: x8266 → ESP8266, literal supporting quote,2passages/
  638characters,277input/56output tokens, USD0.00006127. Total41,335ms; retrieval
  6217ms, generate26493ms, release7297ms. Generate includes admission; provider-only
  latency was not measured. This is working output, not fast-response acceptance.
- Codex Browser main chat: ESP8266 with S1 citation, current source disclosure and
  saved answer retained after reload. The owned prototype chat is retained; earlier
  histories and sources are unchanged. Main UI does not expose usage metrics.

One earlier Control Room attempt was definitively not admitted before POST but
consumed a conservative reservation. That marker was never refunded or reset.
There were3 actual paid POSTs and4 permanent reservations. The narrowed fourth
call keeps even the mixed worst-case reservations below USD0.00969056. A fifth
claim is denied. Keep every private budget marker; never reseed to retry.

Shared adapters now use owner-bound local profile/diagnostic receipts, fresh
workspace/model/session checks, persistent one-use claims and final synchronous
profile/receipt/budget snapshots. Admin evaluation stays outside customer history
and memory. Main basic RAG now uses existing activity SSE and releases only a
saved owner-checked answer. The live positive main call preceded that progress-only
change; its stream/abort/no-provisional-output behavior passed injected route tests.

Verification: broad regression676total/660PASS/16existing private-fixture skips/
0FAIL; final optimized policy/budget/transport29PASS and affected handler/SSE70PASS.
Final production build/types and scoped ESLint pass. Earlier parallel ACL fixtures
failed closed under build contention; serial focused checks passed. No dependency
or migration change. See `p1-implementation-verification.json.controlRoomBasicRagLive20261110`.

Paid profile paths are unmounted after testing. Localhost3001 retains basic route
intent and history access, with provider admission off; neither paid default nor
ongoing paid budget is authorized. Native new-message admission remains false.
Private profile/receipt/budget files stay ignored. No deployment/push/merge.

Remaining: reduce measured latency, separate provider/admission/source timings,
complete representative quality/abstention tests, and obtain an ongoing operating
budget or successful strict-free capacity before enabling a reusable live demo.
Normal-process file exclusivity is tested; power-loss durability, malicious local
marker removal and atomic Windows ACL revocation are not certified. The reservation
uses conservative GPT byte/framing bounds, not a provider absolute-dollar cap.

Proof: `tmp/control-room-luna-live-20261110.png` and
`tmp/main-chat-luna-live-20261110.png` (local ignored artifacts).

## Previous checkpoint — basic RAG history, 10 November 2026

The revised basic-RAG-first plan remains active. Main-chat messages/read/cancel
now use durable basic-RAG classification and the tested one-call core behind an
OFF admission gate. Native/legacy/guide/composite histories retain their own
paths. Existing signed lightweight admission, quotas, prepare, completion and
source-fenced reads are preserved; no old unfenced completion was revived.

Applied development migration `20261109183521_basic-rag-chat.sql` adds an owner-only
sidecar, server-HMAC RPCs and cross-kind guards. Private renamed wrappers remain
revoked. SHA256 `7c5aac4a761ff10bbbfb00b0c2c9b6ddbc8223bfd57eb0e0a940cc34bc1f5995`.
Official CLI selected the version and applied exactly this migration to the Agent
backend after matching the worktree host. Nine intentional rollback schema units
passed. Root storefront CLI config still points elsewhere; do not use it here.
The isolated task CLI credential copy is removed after use.

One atomic scope/digest claim admits a single completion. Duplicate POST, GET/
status and restart recovery never prompt again. Claimed/unknown states remain
pending until a verified result or explicit logical cancellation. Basic cancel
does not use the worker no-dispatch contract: it says the provider may still
process, and its transaction fences every late application answer save. Cancel
before claim says no model request sent. Current session/owner/source guards and
private/no-store output remain. HTTP success requires fresh completed history.

Independent review caught the existing skill-epoch fallback substituting a fixed
answer. An internal transactional completing phase now accepts only the existing
approved hash, then verifies actual complete status/hash before terminalizing.
No intermediate phase can return/commit. The real disposable epoch-mismatch test
confirmed the fallback and exact final hash; no global skill was changed.

Actual development checks:26PASS with two disposable Clerk users and their own
chat. They cover one concurrent claim, cross-owner rejection, replay, cross-kind
takeover denial, bad signatures, direct-table/private-alias denial, logical
cancellation/late completion, normal completion and skill fallback. A disposable
persisted stale scope hash rejected completion and remained pending. That is not
an actual source withdrawal. Test identities/threads were deleted and404 verified.
An initial fixture email exceeded64local characters; its one created actor was
cleaned before the shorter-address retry. No role/source-publication writes.

Mounted localhost checks used the real owner session. With basic route intent
true, hardfalse provider admission returned503 before begin; subsequent attempt
read was absent with no messages. A separate synthetic persisted claim produced
pending GET200 and duplicate POST503, changed question409, foreign origin403 and
anonymous401. No provider call occurred. Codex Browser opened this owned pending
chat, checked status without resending, cancelled to the truthful saved response,
observed the composer re-enabled, and retained the response after reload. The
disposable chat was deleted through the mounted API and404 confirmed. Owner
session and other histories preserved; welcome restored and fixture absent.
Proof: `tmp/basic-rag-cancellation-20261110.png`.

Regressions663total/647PASS/16existing private-fixture skips/0FAIL; two dictation
tests separately PASS. Forty-one focused core/transport/service/route cases are
included. Production compilation/application TypeScript, native/direct-module
TypeScript and scoped ESLint pass. Independent review found no new defects after
the fallback fix. Final build `vMHixWHEaexSs_yE0cJLv` in `.next-agent-basic-rag`;
normal preview session47222 on localhost3001. Both new-basic and new-native flags
are false. Classifier/status/cancel remain wired regardless of those flags.
Generated build includes were removed from tsconfig. No new UI design or package.

Current public metadata still lists exact free Phala prices0 and explicit
safety_retention:false. There were ZERO new inference requests in this checkpoint;
the cumulative prior diagnostic count remains3. The last POST on9November was429
with no retry time or zero-cost receipt. Do not describe this as a fresh successful
or fresh rate-limited inference test. Admission and policyCurrent remain hardfalse
in `basic-rag-runtime.ts`, independent of route-intent env. No account privacy
setting, processor, paid fallback, deployment, push, merge or Phase2 change.

Next: implement the reviewed live profile/activation after fresh exact privacy
proof and a successful strict-free response; verify real main-chat grounded
answer/citations/lifecycle/quality, shared Playground generation/configuration,
and measured fast response. The prior9171ms retrieval measurement remains an open
performance gate. Only then resume deferred harness/tools/MCP/web-search/memory
expansion. Full original P1 remains open. Current evidence:
`p1-implementation-verification.json.basicRagHistoryIntegration`.

## Prior checkpoint — basic RAG first, 9 November 2026

The owner now wants a simple practical RAG LLM chatbot in the existing main chat
before harness expansion. This dated override supersedes OpenCode-first ordering
only for that prototype. Keep the adopted specification unchanged and the full
97-row register. The new [milestone plan](basic-rag-milestone.md) is mapped inside
that register, not a second task authority. Reuse the approved UI, Clerk and
InsForge, one bounded context and one completion. No new platform, agent loop,
MCP, web search or memory extraction is required for this milestone.

Actual diagnosis: main chat is the deterministic MCU quote selector; copied paid
GPT-4o-mini evaluation is intentionally off. The new provider-independent basic RAG
core and strict-free OpenRouter transport are tested but NOT wired into customer
persistence. Existing prepared-turn read/cancel assumes the FastAPI worker, so
safe plain-RAG execution classification/status/cancel integration is still needed.
Do not replace the answer callback alone or revive historical unfenced SQL finish.
This unfinished independent work is explicit, not hidden behind the provider gate.

Evidence preparation now reuses the real shared retrieval directly instead of an
empty selector. Per-product scope reads fall4to2 before context return,5to3 with
final workflow release. Normal answer pre/post-selector checks remain. Current
catalog and source rereads run concurrently between authorization/abort checks;
all exact identity and scope results must pass. No shared cache was added.

The core makes at most one guarded completion and validates zero-cost usage,
literal evidence and current ownership/sources before release. The transport pins
the exact free Xing4/Phala endpoint, strict ZDR and safety-retention exclusion,
denied data collection, no fallback/tools/plugins, disabled supported reasoning
and four zero-price ceilings. It requires a trusted policy proof and durable
one-use claim callback. No activation resolver is installed. Quote membership
does not prove semantic support; live quality acceptance remains required.

Fresh read-only Brave privacy inspection showed logging off, no trace destination,
data discount off and public prompt publication off. Approved-key workspace match
passed. Current metadata lists12eligible free models but only1strict-free route.
One synthetic diagnostic through the new adapter returned429 in1697ms, no
Retry-After, usage or cost receipt. Cumulative diagnostics total3. No retry,
customer data, paid fallback or account-setting change. Application inference OFF.

Final regressions638total/622PASS/16existing private-fixture skips/0FAIL; two
dictation tests separately PASS. Sixteen new core/transport cases are included.
Production build, application/native/direct-module TypeScript and scoped lint
pass. Independent review found and verified the corrected rate-limit mapping.
Final build `oY9rNV8bmr4T5IafOsCCg`, directory `.next-agent-basic-rag`,
app session26714 on localhost3001; provider-free inspection remains62226.
Temporary build includes removed from tsconfig. The stopped previous memory
build was preserved on E: to free C: space. An empty local sharp directory broke
the first build/suite; exact locked sharp0.35.5 and nested semver7.8.5 were restored
from integrity-checked registry tarballs without scripts or dependency changes.

Codex Browser retrieved the same2approved passages/638characters naming ESP8266.
Elapsed samples were8826ms before,8968ms after extraction and9171ms after parallel
reads. Thus there is NO demonstrated speed improvement. Final stage timings are
authorize708/retrieve5446/release2994ms; generation and validation skipped.
Remote I/O remains the performance gate. Main chat's existing signed-in shell
loads with unsupported controls disabled; no live main-chat LLM result claimed.
No customer chats, roles, sources, histories or settings were changed. Local proof
`tmp/basic-rag-retrieval-20261109.png`. Anonymous mounted Playground/chats checks
return401/private-no-store. Real new cancellation, isolation, screen-reader,
light/dark and deployed-site acceptance are not claimed by these synthetic tests.

Next: finish safe plain-RAG chat persistence/recovery and shared activation; obtain
a successful strict-free provider response; validate main-chat grounded answers,
source withdrawal, isolated ownership and measured fast response. Then resume
preserved harness/tools/MCP/web-search/memory scope. Full P1 remains open and
Phase2 gated. No push, merge or deployment. Details in
`p1-implementation-verification.json.basicRagPrototype`.

## Authority and phase boundary

The adopted complete 1,029-line master is `specification.md`, SHA256
`a502bffef09a7c0bbf89920a9f25499ddc88f4085526873501c1b35a4965b067`.
`requirements.json` is the single 97-row task/coverage authority. P0 VERIFIED with
activation limits; P1.1 VERIFIED; P1.2 proposal APPROVED. P1.3/P1.4/P1.5 remain
IN PROGRESS, claimed by Parent. Do not advance dependent phases. Historical
Phase6 remains IN PROGRESS, last full PASS 5; broad held-out multi-hop acceptance
is unestablished. Preserve its histories, blocked fixtures and evidence.

Latest owner request: reuse the exact already working main RAG system in this
branch, make Agent Skills useful, test Playground/main chat/OpenRouter, and use
bounded memory-efficient multi-agent work. Zero-cost and strict ZDR remain
unchanged. Use the existing key directly; do not request OpenRouter account login,
model-choice or credentials again. Native application inference stays OFF pending successful bounded-provider receipt and shared execution acceptance.

## Main RAG reuse

The complete working RAG was in the dirty/untracked owner-selected main checkout,
`E:/Web development/PROJECTS-FULL STACK/Pandabyte` at `a3a4756`, rather than that
commit alone. Original checkout was read-only and preserved. Selected 79 source,
test, migration and notice files were ported; 61 have identical working-tree bytes
before Git line-ending normalization. Source hashes, the 18 exceptions and checks are in `p1-implementation-verification.json.mainRagReuse`.
No old agent broker, private configs, credentials, artifacts or model fixtures copied.

The original six-view Control Room is restored: Sources, Intake, Ingestion,
Documents, Playground and Evaluation. Reused bounded lexical/product retrieval,
private parser, context proofs and original LangGraph authorize/retrieve/augment/
generate/validate/release workflow. Private passages remain in request closures;
graph state is numeric and ambient tracing is rejected. OpenCode still owns native
execution; no competing agent executor was added. Existing native journal,
prepared-source guards, connection helper and customer interface remain intact.

Safety exceptions: final same-Admin/subject/abort check after document DETAIL's
last read (regression reproduced before fix); hard-null branch configuration at
all four HTTP model entrypoints prevents historical paid GPT-4o-mini activation;
source-label-only answer filtering merged without losing native exports; visible
mojibake/EOF whitespace repair (including 9 additional copied files); explicit PDF-worker/font build tracing. Original config parser
and its tests remain, with a regression proving the paid lease cannot activate.

Existing selected development database already has document/chunk/signing tables
and the document-read RPC. No migration or key rotation. Exact source migration
retained. After owner-completed AWS authorization, the remaining private upload
configuration was verified and enabled only in the worktree environment: existing
private bucket, all 5 policies, source-identical SECURITY DEFINER storage guard,
RLS enabled and raw signing-key SELECT denied to anon/authenticated. Existing
active signing key reused server-side; original E: environment/hosted flags untouched.
Local server environment ACL restricted to owner, SYSTEM and local administrators.

A self-authored 187-byte Markdown fixture uploaded, rights reviewed, prepared
privately into 1 chunk, inspected and searched in Codex browser. Anonymous object GET
and 4 mounted APIs returned 401 and no bytes. Existing real owner Clerk session verified
mounted read 200, wrong-origin 403 and stale-version 409. No users/sessions/roles created.
Only this fixture withdrawn via mounted Admin API: 200, version 2; stale read/search: 503
release no old marker, repeated stale withdrawal: 409. Cached browser search clears
old result; reload shows withdrawn row with no inspect control/inspector. Active
upload counts return to 2 documents / 2 chunks; product counts remain42/282. Original 2 uploads
preserved. Private fixture bytes/receipt/audit remain retained. No customer publication
or canonical source grant. This earlier API-only checkpoint is retained under
mainRagReuse.authorizationFollowup. The current follow-up completes its missing
withdrawal UI, real PDF upload and non-Admin isolation checks below.

Current guarded withdrawal UI uses the approved P1.2 direction and existing styles.
It requires exact typed WITHDRAW and an expected document version; persists and
verifies a sessionStorage recovery receipt before one 30s-bounded POST. Unknown
outcomes never auto-retry. Status-only readback is bounded to5pages/50rows/10s;
prepared/absent/fallback states do not resolve uncertainty. Definitive access/version
rejections need fresh Admin metadata and explicit typed re-review. Dismissal clears
only the notice, retaining recovery/access/version guards. Local cleanup failure
retains truthful confirmed state and blocks further mutations. Tests cover these
branches; no browser network failure is fabricated. Scoped controls use44px minima.

Real Codex browser uploaded a self-authored1619-byte PDF, reviewed rights, prepared
one page/chunk, inspected and searched its own marker. Empty/lowercase confirmation
cannot submit; Cancel restores trigger focus and leaves prepared state. Exact
WITHDRAW confirmed withdrawal; counts return2uploads/2chunks and42listings/282chunks.
Dismissal/reload preserve withdrawn row, no inspection action. Only this new PDF
withdrawn, private source bytes/receipt/audit retained, original2sources unchanged.
Stale mounted owner read/search503 release no old marker; stale withdrawal409.

One real disposable development Clerk user/session had verified InsForge identity,
no memberships and no role writes. Document list/detail/search/withdraw and upload
APIs403/private-no-store; private object404/zero bytes and direct read RPC denied.
User deletion and provider404 verified; owner browser identity preserved. Private
IDs/tokens stay ignored. Evidence is phase1WithdrawalAndNativeFollowup in the existing
P1 verification JSON. Concurrent in-flight withdrawal/customer-memory propagation
remains unverified.

Pinned 8 direct runtime dependencies add 55 lock paths; no existing package version
changed and no lifecycle scripts run. Notices for 17 packages are retained from
main, with 38 additional packages and 7 bundled LangSmith licenses in the supplemental
notice. See `docs/licenses/main-rag-runtime-dependencies.txt`.

## Agent Skills and native runtime

Approved four-tab Agent Skills now embeds the real existing RAG skill/tool panels,
separate from sanitized native discovery. Visited tabs stay mounted, preserving
unsaved drafts and conflict/unknown guards. Existing5bundles and 4 fixed manifests
load through real guarded APIs. No grant/review/enable/disable writes performed.
Native installation/configuration/MCP writes and native tool catalog remain
unsupported, clearly disabled; catalog records never imply effective permission.

`Panda-agent/scripts/start-native-inspection.mjs` starts a pinned 2.2.2 provider-free
owned supervisor with verified binary/archive provenance, fresh isolated boot,
loopback authentication, deny policies and empty catalogs. It writes a private
seven-field descriptor only after actual readiness. Old leases are refused. Own
shutdown invalidates descriptor before stopping child and cleans only owned temp
files; an actual worker-owned launch/shutdown passed. Unrelated OpenCode preserved.

Admin discovery uses that same fresh runtime binding before and after its reads.
Generation/PID rotation discards results. Windows owner-ACL subprocess deadline5s
and Admin inspection admission10s handle observed load delays; execution defaults,
strict ACL/binding predicates and fresh checks unchanged. No cached authority.
Actual root-owned development supervisor is session88618; descriptor is ignored
`private/native-runtime.json`. Native catalogs are all 0. Native create/prompt/
dispatch remain hard-denied; no provider credentials enter this process.

Prior native journal 0004/0005 and f5c063f off-gate API/isolation/persistence evidence
are retained in `native-journal-verification.json`, installation and P1 records.
No new native dispatch, active inference cancellation or token-stream claim.

New isolated pinned2.2.2 probes use the actual native client, one exact synthetic
integration allowance and provider/tool/all-other denies. Native local stdio MCP
add -> disabled, connect -> connected, disconnect -> disabled, remove -> absent
passed; initialize1/tools-list1/tools-call0. Source config and shared supervisor
unchanged, all owned child/descriptor/fixture cleanup verified. See opencode-mcp-probe.json.

Native live skill delivery now passes in the isolated OpenCode 2.2.2 probe. Stock
`serve` updates session history with event payload retention disabled. Its historical
stream returned a `log.synced` watermark. The earlier probe failed because it
expected the activation payload there. The corrected probe waits for `server.connected`
on a server-filtered subscription, sends one `resume:false` activation, checks the
exact owned live event and reads back the saved skill message. The session stayed
unstarted. Both new runs cleaned all owned state and made zero prompt, model or tool
requests. Nine focused tests passed. The evidence preserves both earlier attempts
and the latest diagnostic run. Live delivery is volatile. Product delivery and
reconnect behavior remain open. See [skill probe evidence](opencode-skill-probe.json).

The native MCP permission check also passes. With the fixture connected, OpenCode
allowed a synthetic control resource and denied the resource used by the MCP tool
despite the same session-level allow. This exercises the native permission evaluator.
The session stayed unstarted, the fixture received zero tool calls and all owned
state was cleaned. The mounted Admin discovery endpoint also checks the original
Clerk subject and session again before release. Both account and session replacement
return a generic private 403. [MCP permission evidence](opencode-mcp-probe.json)

Actual native tool dispatch now passes in two disposable OpenCode 2.2.2 instances.
Both used a scripted model on loopback, the same fixture code and a session-level
allow for the tool. In each case the model saw and requested the tool. The allow
policy produced exactly one MCP `tools/call` and a saved result. The deny policy
produced a saved native tool error and zero MCP calls. The overall turn completed
in both cases, so tool success is checked independently of turn success. All
owned sessions, processes and temporary state were cleaned. The four model HTTP
requests went to the local fixture. Live inference remained off.
[Dispatch evidence and diagnostic attempts](opencode-mcp-probe.json)

## OpenRouter zero-cost / strict privacy

Supported existing-key GET metadata succeeds: `/key`, `/models/user`, exact model
endpoints and public ZDR list. Candidate `xingchen-agi/xing4.0-29b-a4b:free` is
eligible; matching `phala` row explicitly has `safety_retention:false`, token prices0.
The official :free no-billing contract supports this text-only route; missing
image/request catalog fields are not silently zero and are no longer a separate
blocker. Future admission still needs fresh exact pinned provider/variant metadata,
no fallback/tools/plugins, zero max-price ceilings and actual zero-cost receipt.

The ordinary key cannot inspect management-only workspace policy fields. This
initially blocked privacy acceptance. The later signed-in Brave check below
resolves that metadata limitation for the bounded route test. Future admission
still needs fresh exact model, provider and workspace evidence. See
`provider-policy-verification.json` for the chronological observations.

On 9 November, the signed-in Brave dashboard showed input and output logging off
and no configured trace destinations in the Default Workspace. The account's
workspace data discount permission was off. The selected ESP32 key was present,
but the project's stored credential had a different masked label, spend limit
and expiry. The selected key was absent from the checked local project
environments. Read-only metadata still listed the free Phala route with ZDR,
`safety_retention:false` and zero token prices. The authorized live test requires
the selected credential and fresh eligibility checks with that credential.
No inference request was sent. See
`provider-policy-verification.json.braveWorkspaceCheck`.

The owner subsequently selected the credential saved in the main checkout's
`Panda-agent/.env` as the intended default. OpenRouter returned HTTP 401 for
that credential and HTTP 200 for the previous local default. Keep the previous
default until the replacement authenticates and its workspace policy is verified.
The latest recheck confirmed one correctly formatted assignment with no unexpected
whitespace. OpenRouter returned HTTP 401 and `User not found.`. The replacement
credential needed correction at that checkpoint. No live inference was submitted.

The owner then explicitly approved the earlier working key. It was copied into
the ignored worktree `.env.local` and main checkout `Panda-agent/.env`, with
matching readback. The primary checkout's older `.env.local` was the source.
The key authenticates with HTTP 200. A fresh dedicated Brave tab worked after the
existing-tab connection attempts timed out. Its displayed Default Workspace ID
matched the key's workspace through a SHA-256 comparison. Input and output logging
was off, no trace destinations were configured, and account permission for workspace
data discount sharing was off. No privacy settings were changed.

Fresh catalogs showed one eligible exact free Phala endpoint, one matching ZDR
row with `safety_retention:false`, zero token prices and JSON format support.
One synthetic direct diagnostic used `only:phala`, no fallback, `zdr:true`,
`data_collection:deny`, four zero price ceilings, disabled cache and no plugins.
OpenRouter returned HTTP 429. No model answer, token usage or actual cost receipt
was available. The one-shot private receipt prevents automatic resubmission.
This diagnostic sent no customer data and did not enable native application
inference. See `provider-policy-verification.json.boundedConnectivityDiagnostic`.

## Verification and browser state

Agent/Admin-state suite: 582 PASS, 16 private-fixture skips, 0 fail, 598 total with
server-only condition and concurrency 1. Dictation separately 2 PASS under client
React condition. Native MCP5/skill7 focused cases included. Application/native
TypeScript, scoped ESLint, 97-task validation and whitespace checks pass.
Standard Turbopack production build PASS, final BUILD_ID `KXe1M1uW4KmYImU1q49gv`.
PDF route trace contains parser/worker/fonts and no environment/private credentials.
Separate webpack build fails on existing unchanged commerce print-module global
selectors; no commerce source edited. Do not claim webpack parity.

Real signed-in Codex browser verified document inventory: 42 listings / 282 chunks and
2 existing uploads / 2 chunks; x8266 filter and 8 eligible source passages; single-product
flash retrieval: 5 passages / 2672 characters / 8905 ms including literal 4 MB listing claim.
Final built app xC3/xS3 retrieval: 4 passages / 1813 characters / 9827 ms with separate product
identities. Authorize/retrieve/augment/release complete; generation/validation skipped.
No model call, token counts or invented cost reported. Screenshot:
`tmp/agent-main-rag-playground.png` (ignored local proof).

Native 2.2.2 browser discovery and existing 5 bundle / 4 manifest inspection pass. Keyboard
End/ArrowLeft moves focus; unsaved skill draft survives tabs and was cleared.
Unsupported writes stay disabled. No real screen-reader speech, zoom or runtime
motion-switching acceptance added. Owner session and all earlier histories preserved.
Main chat final build renders approved unified preview and disabled model/search/
attachment controls. Owner finished AWS sign-in; existing datumm CLI authenticated
and expected account verified. Private worker ready 200; existing SSM tunnel restored.
One-time transfer file removed and auth tab closed; no credential/code printed.
Fresh MCU question returned literal ESP8266/S1 with source link, section and capture.
Observed activity shows 8 fragments / 2819 characters. Reload then explicitly reopen saved
chat restores answer/citation (automatic active-chat restoration is not claimed).
Only the new owned chat archived; absent from recent, composer empty/enabled and
other histories preserved. No LLM inference. Proof: `tmp/agent-main-rag-chat-restored.png`.

Current final-build checks: supported MCU question returned literal ESP8266/S1,
activity8fragments/2819characters; added test-marker question was safely refused
by constrained deterministic matching. Only that owned two-turn chat archived;
absence from Recent and blank enabled composer verified. Playground MCU retrieval:
2passages/638characters/8784ms, authorize/retrieve/augment/release complete,
generate/validate skipped. Native discovery still2.2.2/empty catalogs with writes
disabled. No model response/usage/cost inferred. Proof:
`tmp/agent-phase1-chat-current.png`, `tmp/agent-phase1-playground-current.png`,
`tmp/agent-phase1-withdrawal-confirmed.png`.

Withdrawal mobile requested320 measuredCSS267 under existing scale, document254:
no horizontal overflow, controls~44CSSpx. Default viewport and System theme restored;
light and System-dark checked. No actual zoom, motion switching or new screen-reader
speech claim. Codex tabs retained for chat, RAG and Agent Skills.

## Local state and next work

The earlier built app in session77432 is stopped. Current final built app runs in
session32845 on localhost3001 with the development Clerk and InsForge services. Build `IMMiNJueGSBKsBd1GET-K` uses
`.next-agent-experience-browser-fix` and passed compilation and type checking.
Worktree `.env.local` retains journalON, new-native-messagesOFF, document-libraryON,
inspectionON, upload/preparationON, existing server-only signing key and owned
descriptor path. Provider-free inspection session62226 now publishes
`private/native-runtime-phase1-20261109.json`. The ignored worktree env and current
preview launch point to this owned descriptor. Codex Browser verified OpenCode
2.2.2 discovery after reconnecting. The private SSM tunnel
is currently closed. Existing deterministic chat worker tests require the tunnel.

C: ran out of space during pinned install. Reversible moves preserved old candidate
and dev build outputs in `E:/CodexTemporary/panda-agent-main-rag-reuse-20261107`.
Two ignored workspace output junctions and a task-specific dependency junction
support those old outputs. Final candidate uses a normal C: directory. No archives,
source or credentials moved/deleted. Initial recursive old-build deletion was
rejected by automatic approval review as blocked by policy; the reversible move
succeeded instead. Disk capacity remains limited; do not delete unrelated files.

The preceding mounted API checkpoint ran while browser control was unavailable.
On the mounted localhost APIs, anonymous
runtime and Playground reads returned 401. The existing development Admin received
OpenCode 2.2.2 discovery with all three catalogs empty and install, configure and
execute disabled. A caller-controlled runtime selector was rejected with 400.
Playground reported model evaluation unconfigured. The x8266 retrieval-only query
returned two passages in 8313 ms and skipped generation and validation. All six
responses were private and no-store. There were zero model calls. The latest
targeted suite passed 38 tests and the 97-task register validated. See
`p1-implementation-verification.json.phase1MountedHttpFollowup` for the evidence.

The owner confirmed in Codex browser that OpenCode discovery connected and that
the Playground opened with the evaluation button disabled. The Playground had
defaulted to evaluation even when the branch reported the model unconfigured.
The form now opens in retrieval mode and keeps retrieval available while model
status loads or is unavailable. Evaluation requires explicit opt-in and keeps the
existing availability and unknown-outcome guards. Agent Skills now describes the
successful connection as read-only discovery and points to the RAG Playground.
The legacy GPT-4o-mini evaluator remains gated by the zero-cost and strict ZDR
requirements. See `p1-implementation-verification.json.phase1PlaygroundRetrievalUx`.
The rebuilt application passed 34 focused tests, scoped lint and the mounted
Admin and retrieval checks. The explicit Browser plugin tag restored access for
the signed-in browser check on the same build. The evaluation toggle was disabled
and unchecked after reload. Entering the x8266 question enabled **Inspect retrieval**
and returned two passages with 638 context characters in 9522 ms. The retrieved
product listing identifies the ESP8266. Generation and validation were skipped.
Agent Skills refreshed to the OpenCode 2.2.2 read-only discovery banner, and native
tool and configuration controls remained disabled. Both result tabs were left open.

### Mounted tool permission check

On 7 November, the signed-in owner used the local Admin Playground in Codex
Browser to dispatch both fixed cases through OpenCode 2.2.2. The allowed case
returned `pandabyte_fixture_tool_result` with one MCP invocation. The denied case
displayed the native tool permission error with zero MCP invocations. Both
mounted responses returned 200 and preserved the distinction between a verified
tool error and a failed request. Reloading and submitting the spent allow case
returned 409 before dispatch. Anonymous requests returned 401, a foreign origin
returned 403, and an unknown case or nonempty body returned 400. The first browser
submission returned 400 before dispatch because Next exposed an empty POST stream.
The corrected guard checks HTTP framing. The regression covers this behavior.

The launcher `Panda-agent/scripts/start-playground-tool-fixture.mjs` accepts the
absolute development env path and pinned 2.2.2 SDK path. It requires the verified
owner's Clerk subject SHA-256 in `PANDA_PLAYGROUND_FIXTURE_OWNER`, the dev Clerk
instance and localhost:3001. Its loopback relay has a 30-minute lease and spends
each case once. The browser sends only the fixed case and receives the verified
tool status and invocation count. The route rechecks the same Admin subject and
Clerk session before release. After a lost response, reconcile the launcher log
before considering another test window.

Both disposable sessions, MCP processes and fixture directories were removed by
the probe. The launcher was stopped, and the normal built preview was restored.
Codex Browser confirmed the fixture controls were absent. On the fixture build,
the x8266 query still returned two approved passages identifying ESP8266 with
GPT-4o-mini disabled and no model answer. The two dispatch cases used only the
scripted loopback model. There were zero external inference calls. See
`p1-implementation-verification.json.phase1MountedToolFixture`.

The isolated OpenCode 2.2.2 wire probe now verifies active cancellation using the
application lifecycle adapter and a synthetic versioned journal. A partial response
from the loopback model confirmed the session was active. Cancellation closed the
model connection, recorded the interrupted turn and saved the fixed cancellation
message. Repeating cancel and cleanup kept the totals at one prompt, one interrupt
and one deletion. All five wire cases and 49 focused lifecycle, correlation and
session tests passed. Mounted Clerk and SQL cancellation acceptance remains open.
See `opencode-provider-wire-probe.json`, case `cancel`.

The latest Agent and Admin regression run passed 593 tests with 16 private-fixture
skips and no failures. Two dictation tests passed under the client React condition.
Native TypeScript and scoped wire-probe lint passed. The 97-task register validated.
The preview was restarted on localhost3001. A fresh signed-in Codex Browser tab
verified retrieval of two passages and 638 characters in 8435 ms for the x8266
query. The approved listing identifies ESP8266. Model evaluation stayed disabled.
Anonymous runtime and Playground reads returned 401 with private/no-store headers.
The result tab is retained. See
`p1-implementation-verification.json.phase1RegressionRecheck`.

### Native integration and upstream rate-limit follow-up

The owner resumed testing after the first 429. A fresh Brave privacy check
confirmed logging off, no trace destinations, data discount off and public prompt
publication off. The approved key still matches that workspace. The current
eligible catalog has only one free route with strict ZDR, the pinned Phala route.
One additional synthetic diagnostic preserved the same privacy and zero-price
constraints. Its 429 response identifies Phala and reports an upstream rate
limit, with no Retry-After or reset headers. No further inference request was
attempted. External inference requests across the two diagnostic windows total 2.
Successful response, provider usage and zero-cost receipt acceptance remain open.
See `provider-policy-verification.json.upstream429Diagnosis`.

The native wire probe now verifies two additional integration cases against
actual OpenCode 2.2.2. Both use the application turn adapter, prepared evidence
validation, native HTTP client and a synthetic versioned journal. Success releases
a literal citation from a disposable synthetic listing. HTTP 429 releases only the
fixed unavailable answer. Duplicate start/status does not resend. Each case
records one create, one prompt and one deletion, with no interrupt. All seven
wire cases and 57 focused turn/evidence/correlation/lifecycle tests passed. Scoped
lint and syntax checks passed. Shared Clerk/SQL execution remains unverified.
See `p1-implementation-verification.json.phase1NativeTurnPipelineFollowup`.

The provider-free discovery connection was restored by launching the pinned
supervisor and restarting the preview with its new owned descriptor. Codex Browser
confirmed the connected banner and disabled native execution/tool configuration.
The customer composer retained disabled model, search and attachment controls.
The post-restart Playground query retrieved two passages and 638 characters in
7091 ms with model evaluation disabled. The discovery proof is retained locally
at `tmp/phase1-native-discovery-20261109.png`.

Phase 1 remains open. Workspace privacy and bounded-route preflight are verified
for the approved key. The live diagnostic is rate limited and has no answer or
zero-cost receipt. Remaining acceptance covers shared native chat and Playground,
structured responses and citations, lifecycle and latency, supported native Admin
management, effective permissions in shared execution, and customer memory. The 97-row register
tracks these gates before Phase 2.

## Project-context controls checkpoint, 9 November 2026

The approved Memory & context view now supports add, review, correction and typed
CLEAR for bounded owner/thread project intent in existing InsForge storage.
Clerk is checked before and after the RPC. Same-origin PATCH, strict bounded JSON,
private/no-store responses, owner-only RPCs and table restrictions remain enforced.
The development migration `20261109155410_project-memory-controls.sql` was applied
through the official CLI to the selected Agent backend after target matching and
a rolled-back schema rehearsal. Its SHA256 is `a100a73c943c1e6fdf484e923b667e0c02bf34fc9e2cdbabb505ea5203635278`.
The repository-root CLI config points elsewhere and must not be used for this
Agent migration. The isolated task CLI credential copy is removed after use.

Corrections use expected-version comparison under the parent chat lock. Pending
turns and archived chats block writes. Clear retains a null-intent version fence
and usage counters, empties questions/recent goals and preserves chat history.
Exact replay does not increment again. The browser persists operation ID/version
only before sending; unknown writes block further changes and never auto-retry.
Status-only readback of the old version does not unlock. Later responses cannot
update another selected chat. Source evidence authority is unchanged.

Mounted development checks passed 23 HTTP assertions with two real disposable
Clerk identities. They cover anonymous/foreign-owner/origin rejection, invalid
fields, replay, concurrent conflict, versioned clear, stale restore, archive and
thread deletion. Direct foreign RPC/table access was denied. The pending guard
was exercised with one synthetic SQL row, not an agent-dispatched turn. Both
fixture identities, the pending row and their chat were removed; provider404 was
verified, and no role writes occurred.

Codex Browser checked add/save, correction/save, reopen persistence and Cancel.
The final built app checked clear confirmation (lowercase rejected), empty-context
persistence after reload/reopen and correct Cancel/success focus. The 320 CSS-pixel
form fits without horizontal overflow. Resizing with the desktop sidebar open
activates its existing mobile focus trap, so geometry is not claimed as a complete
mobile keyboard journey. No new real screen-reader speech, zoom, light theme or
runtime reduced-motion acceptance. The separate disposable zero-message owner
chat was removed through the normal API and its read returned404. The owner
session is preserved, viewport reset, welcome restored, and fixture absent.
Local cropped proof: `tmp/phase1-project-context-cleared.png`.

Final Agent/Admin regressions: 617 total, 601 PASS,16 existing private-fixture
skips,0 FAIL. Eight memory cases are included. Two dictation tests pass separately.
Scoped ESLint and production compilation/application TypeScript pass. Final
BUILD_ID `Q3eLaidRCzNq5Dz4QbCFZ`, directory
`.next-agent-phase1-memory-final`, app session32845 on localhost3001. Inspection
supervisor remains session62226 with the owned descriptor recorded above.
Generated temporary build includes were removed from tsconfig. All 97 tasks validate;
whitespace checks pass and 15 changed/new files pass credential-pattern scanning.

This checkpoint makes zero external inference calls. The historical two diagnostics
remain the total; no paid fallback, processor, Mem0, embedding or privacy-policy
change was introduced. Native application inference remains OFF. Phala429 is still
unresolved, with no provider reset time or successful zero-cost receipt. Shared
native chat/Playground/citation/lifecycle acceptance, supported native Admin
management/effective shared-execution permissions, full memory integration and
held-out/a11y acceptance remain open. Mem0 still requires the runtime/store,
processing and retention decisions in `memory-contract.md`.

See `p1-implementation-verification.json.phase1ProjectMemoryControls` and the
P1.3/P1.7/P1.8 evidence in the single 97-row register. Their statuses remain
in_progress/partial. Complete the Phase 1 gates before Phase 2. No push, merge,
deployment or commerce configuration change.
