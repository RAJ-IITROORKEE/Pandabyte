# Agent Experience Upgrade — current handoff

6 November 2026. Branch: `codex/panda-agent-fastapi-replacement`.
Use `git log -1` for this local checkpoint; previous checkpoint `7779007`.
No push, merge, application deployment, payment or invoice configuration change.
This file records current state; prior detailed checkpoints remain in Git and the
verification JSON records. Do not treat their earlier activation limits as current.

## Authority and phase boundary

The complete adopted1,029-line master is `specification.md`, SHA256
`a502bffef09a7c0bbf89920a9f25499ddc88f4085526873501c1b35a4965b067`.
`requirements.json` is the single97-row task/coverage authority; all embedded
Original Product Specification requirements remain mandatory.
P0 VERIFIED with documented activation limits; P1.1 VERIFIED; P1.2 proposal APPROVED.
P1.3 customer integration, P1.4 conversational RAG/native execution and P1.5 Admin
management remain IN PROGRESS, claimed by Parent. Do not advance to later phases.
Historical Phase6 remains IN PROGRESS, last full PASS5; its broad held-out multi-hop
gate is unestablished. Preserve blocked synthetic fixtures, histories and evidence.

Latest request: integrate remaining native routes/admission; keep zero-cost and
strict ZDR unchanged, leave inference OFF until verified, use Codex browser and
update this handoff. Earlier request resolved provider access: use the existing
key directly, no OpenRouter account login. Do not ask for login/model-choice again.

## Current implementation

The approved unified customer shell retains assistant-ui's external store, current
Clerk identity, history/drafts/keyboard/focus, source disclosure, Markdown, uncertain
status and cancellation recovery. Mandatory mode controls are removed. Model
selection, attachments and Search remain honestly unavailable. Memory & Context
shows existing owner/thread intent read-only; Settings/Account retain destinations.
No separate Mem0 plan was found; owner authorized compatible configuration as
needed. Hosted extraction/embedding or invented retention is not activated.

Admin Agent Skills has four tabs and guarded discovery/unsupported states. Owner
access was repaired at `f02d1f4` by respecting the retained Clerk JWT template helper
and existing `INSFORGE_CLERK_JWT_TEMPLATE` selector. No login bypass, backend/issuer,
role/grant or global environment change. Existing RAG controls remain available;
live native management/discovery is still unavailable. No fake capabilities.

`native-chat-service.ts` now assembles the existing private turn, lifecycle, journal,
prepared-evidence and native-client adapters inside the existing HTTP shell. This
is not a second runner, model gateway or MCP executor. OpenCode owns execution.
The app owns admission, approved source authority, persistence and public release.

- Fresh native selection occurs before any legacy begin. Durable journal lookup
  classifies existing requests before legacy read/cancel handling. Unknown native
  work never falls back. Existing old engine kinds retain their original handlers.
- History uses `native_read -> parseChatRead -> publicRead`, with current Clerk
  checks before/after release. Terminal replay works without a native process.
- `native-owner.ts` captures Clerk subject/session/client and uses a distinct HMAC
  namespace for subject/thread binding. Receipt checks use current Clerk -> signed
  actor/thread/request-authorized journal -> current Clerk, then exact comparison.
- Create/prompt claims remain CAS-once; acknowledgements are pending, uncertain
  mutations observe instead of redispatching. Current message/prompt SHA, native
  terminal/idle ordering and structured source finalization precede atomic save.
- Cancellation is sticky; one fresh winner can interrupt. Cleanup has one removal
  claim, owned inactive/no-child checks and typed absence before retirement. Lost
  claims/acknowledgements cannot authorize a second interrupt or DELETE.
- Same-origin POST `/api/panda-agent/chats/[id]/cleanup` accepts only `{requestId}`.
  Normal Delete fetches up to four owned terminal cleanup candidates within20s;
  pending/more/unknown retains conflict. SQL's delete guard remains authoritative.
- The context kernel supports0/1 product, at most8 whole fragments and20,000 context
  characters, E1..E8 aliases and fresh source/QA fences. Literal membership is not
  semantic entailment/hardware applicability or complete multi-product/vendor RAG.

## Runtime and provider admission

`native-runtime.ts` accepts a closed owner-private supervisor descriptor; bounded,
authenticated loopback info must match2.2.2/PID. Re-read pins a server-HMAC over
fresh generation, canonical directory, config/auth hashes and origin. Changed
bindings fail closed; journals are never rebound. `native-runtime-file.ts` checks
Windows current-SID/strictDACL, null/empty/shared ACLs, or POSIX owner/mode, and file
identity. Missing descriptor means native observation unavailable.

**Inference remains hard OFF in source**, including returned native create/prompt;
no environment switch or descriptor can assert missing strict-ZDR proof. There is
no persistent application supervisor/descriptor configured. The probe owns only a
disposable isolated process with fresh auth, generation and state, then removes it.
Full real Clerk/SQL/native guard latency and active cancellation remain unverified.
Late prompt versus early/lost interrupt and consumed-removal uncertainty remain
explicit recovery limits; do not hide them with automatic mutation retries.

The supported native session retry hook already passes429/503/full-body disconnect/
synthetic SSE tests with one attempt. The failing3-attempt baseline is preserved.
Auxiliary generation and websocket retry-full paths are not certified. See
`opencode-provider-wire-probe.json` and `native-session-contract.md`.

Existing-key `/key` and `/models/user` authenticate and establish eligibility only.
The candidate's public exact ZDR row has `safety_retention:false` and token prices0;
effective key Safety Retention/logging and required request/image fees remain
unverified. Management-only guardrails returned401; do not retry or request login.
No inference request/account-wide setting/new key. See
`provider-policy-verification.json`; profile remains OFF.

## Development schema and actual verification

Journal0004 is now applied to the selected existing development InsForge project,
exact reviewed SHA256
`9f60e3b08c7b74e9d057f33219f6d61990b31fc8dfdc4cf87d307c1203f5e9bd`.
Ten rollback-only groups passed before installation, restoring rows/schema/ACLs.
Installation changed no existing rows; raw journal/verifier access denied.
Real API checks then found PGRST202 stale discovery after direct SQL application.
Separate forward0005 performs documented PostgREST schema-cache reload;0004 was
not edited after installation. Native journal remains0 after API checks. See
`native-journal-verification.json` and `native-journal-installation.json`.
Rollback is to leave additive schema unused; never drop dispatched receipts.

Current source:414/414 Agent tests PASS; application/native TypeScript and scoped
ESLint PASS. Candidate build PASS, BUILD_ID `HxxtysgGlUVWp8Zw57GCI`; it is not the
running dev server. Generated tsconfig includes removed. Prior storefront checks
at `f02d1f4`:486pass/3archive-dependent skips out489, plus10media; not rerun because
this increment changes Agent routing only. Independent high-risk review clean.

Actual pinned2.2.2 provider-free probe PASS: private descriptor admission, hard
create/prompt/dispatch denial with0requests, same-binding lifecycle, generation
rotation rejection before network and unchanged journal. Lifecycle case counts:
1fixture-create,0prompt,0interrupt,1DELETE. Child and fixture removed. File journal
and current callback are synthetic, not real Clerk/database integration. See
`opencode-session-probe.json`.

Real development Clerk/API isolation PASS: create201; disabled native message503;
GET absent/empty; missing cleanup404; anonymous401; foreign read/cancel/cleanup/
Delete404; wrong origin403; extra receipt400; owned Delete200 then404. All private/
no-store. Final2disposable identities/application fixture cleaned with absence
verified; initial failed/debug2empty app fixtures cleaned under exact owner/title/
zero-turn guards. All5temporary identities are deleted, debug absence verified.
No role writes or unrelated history mutation. Detailed sanitized results are in
`p1-implementation-verification.json`.

## Codex browser verification

Real signed-in localhost3001 browser PASS. With fresh-native selection temporarily
ON, one new owned question was rejected; generic uncertain UI kept its draft and
Check status controls. After the cache fix, status reported no saved turn; explicit
cancellation confirmed the absent attempt without native inference and restored
the composer. Only this empty disposable chat was archived.

With native journal/recovery routing still ON and new selection OFF, a fresh
`Which MCU does the x8266 use?` returned literal `Microcontroller: ESP8266`, S1,
listing section/capture and approved link. Saved answer/citation survived reload
through native_read. Only this second completed disposable chat was archived;
composer is empty/enabled and both fixtures are absent from recent. Owner session,
old histories and Phase6 blocked fixture preserved. Admin Configuration still
reports native discovery unavailable, with Edit disabled. No UI redesign or new
screen-reader/zoom/motion claim. Ignored screenshots:
`tmp/agent-phase1-native-admission-off.png`,
`tmp/agent-phase1-native-routes-baseline.png`,
`tmp/agent-phase1-native-routes-cleanup.png`.
This is real disabled-admission + deterministic RAG/SQL integration; not live native
LLM generation, token streaming or active inference cancellation acceptance.

## Local state and next work

Running UI: session31613, localhost3001, `.next-agent-experience-dev`, existing
baseline launcher. Worktree-only `.env.local` now retains
`PANDA_AGENT_NATIVE_JOURNAL_ENABLED=true` and
`PANDA_AGENT_NATIVE_NEW_MESSAGES=false`; original E: environment unchanged.
New selection was temporarily ON only for disabled-admission tests. Keep journal
classification/replay/recovery enabled even if new dispatch is disabled.
`PANDA_AGENT_NATIVE_RUNTIME_FILE` remains unset; no global CLI/config change.
Existing datumm credentials restored private SSM tunnel session9211 on8182; no new
sign-in, container update or AWS deployment. Original dirty E: checkout preserved.

Next permitted work: complete the owned isolated supervisor and full Clerk/SQL/
native observation, cancellation and latency acceptance. Keep inference OFF until
effective strict-ZDR, all required zero-fee/quota and output gates pass. Preserve
unknown claims and source/QA fences. Full native tools/MCP/skills management,
isolated Playground and customer memory remain unfinished mandatory scope.
