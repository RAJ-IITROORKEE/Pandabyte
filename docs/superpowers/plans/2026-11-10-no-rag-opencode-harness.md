# Panda Agent No-RAG OpenCode Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the selected embedded-help MVP with native OpenCode execution, approved read-only MCP tools, lazy skills, bounded children, owned multi-chat/long-session context and a reviewed assistant-ui interface.

**Architecture:** Next.js authenticates and journals requests; a private pinned OpenCode runtime owns execution. One guarded provider gateway enforces per-call privacy, identity, bounded transcripts and the shared allowance. InsForge owns application data and assistant-ui renders a normalized native-event projection.

**Tech Stack:** Existing Next.js/React/TypeScript, Clerk, InsForge, OpenRouter Luna/Azure strict ZDR, pinned OpenCode V2, assistant-ui and selected AI Elements components. No second agent framework, RAG engine or memory processor.

**Spec:** [Reviewed-scope design proposal](../../agent-experience-upgrade/no-rag-harness-design.md), [original specification](../../agent-experience-upgrade/specification.md), [single requirement authority](../../agent-experience-upgrade/requirements.json). The owner approved implementation on 10 November, then explicitly waived Superdesign for changes in the current branch. This is implementation authorization, not a release claim.

## Global Constraints

- Embedded help, project plans and structured BOMs; approved read-only tools.
- One main agent, optional bounded subagents, approval before external writes.
- USD1 cumulative prototype cap across every OpenRouter call; strict ZDR unchanged.
- RAG paused and separately owned; reintegration requires owner notification.
- Preserve real owner access, signed histories, source withdrawal and unknown outcomes.
- No deployment, push, merge, global installation, commerce change or new processor.
- Apply the approved direction directly in the current branch; the owner's latest instruction skips Superdesign for this iteration.
- Existing 97 requirements remain the coverage authority; task checkboxes below are execution steps, not a competing requirements register.

## Review Focus

- Native configuration inheritance must not expose global skills, credentials or broad child permissions.
- Auxiliary/child/compaction/schema-repair calls must not escape financial or privacy admission.
- Event loss or a duplicate request must not create another model dispatch or false saved result.
- Structured BOMs must not invent prices, verified stock, electrical safety or board compatibility.
- Long-session summaries and project memory must preserve ownership and disclose loss/uncertainty.

## File boundaries and execution ownership

Root owns integration, all migrations, lockfiles, deployment decisions and local
checkpoints. A bounded implementation worker may own the native adapter/gateway;
another may own reviewed UI components. A separate reviewer checks security and
cross-surface correctness. Do not share file ownership or reset another owner's
changes. Preserve the current drafts until individually reviewed.

| Slice | Files / responsibility | Existing requirements |
| --- | --- | --- |
| Compatibility/runtime | `Panda-agent/scripts/basic-llm-cli.mjs`, new `Panda-agent/scripts/start-native-execution.mjs`, native client/runtime modules | P1.1, P1.5, P1.8 |
| Provider admission | `server/luna-rag-openrouter.ts`, `server/basic-rag-runtime.ts`, `server/prototype-rag-budget.ts`, `opencode/basic-llm-relay.ts` | P1.1, P1.3, P1.5, P1.8 |
| Owned sessions | `server/native-chat-service.ts`, `native-run-store.ts`, `native-turn.ts`, `lightweight-handler.ts`; root-owned additive migrations only if required | P1.3, P1.5, P1.8 |
| Skills/MCP | Dedicated `Panda-agent/runtime/opencode/` execution config, approved agent/skill bundles, new bounded MCP adapters | P1.5, P1.6 |
| Session/project memory | Native compaction adapter, existing `guide-store.ts` and `project-memory-panel.tsx` only where compatible | P1.3, P1.7 |
| UI/event projection | `ui/workspace.tsx`, `ui/chat-stream.ts`, new normalized event types and focused run/tool/approval/artifact components | P1.2, P1.3, P1.6, P1.8 |
| Evidence | `handoff.md`, existing verification JSON/register, test fixtures | P1.8 |

The direct-LLM migration/service currently in the worktree is a **draft**, not a
mandatory new parallel engine. First decide whether native journal reuse makes
it unnecessary. Do not apply an extra persistence path merely because a draft exists.

### Task 1: Freeze the checkpoint and validate the V2 compatibility boundary

**Files:** current handoff/register; `Panda-agent/scripts/start-native-inspection.mjs` (read-only baseline); new version compatibility fixture/evidence. Preserve `current_RAG.md` for the separate owner.

**Interfaces:** produce one selected `NativeExecutionDescriptor` containing version, PID, private URL, directory, config hash and generation. Reuse existing runtime identity semantics; no provider key in descriptor output.

- [x] Inventory uncommitted files, migration state, active ports/build and remaining allowance without exposing secrets.
- [ ] Reproduce 2.2.2 contract tests; separately verify pinned 2.2.6 schema/OpenAPI and binary origin/hash without modifying global installation.
- [ ] Explicitly set `compaction.auto:false`, background compaction off and warming off before any prompt; prove context-overflow cannot create an unaccounted summary/retry.
- [x] Write and run fixtures for foreign PID, inherited global config, unsupported fields and V1/V2 request mismatch.
- [x] Implement the smallest selected-version adapter; rerun contract tests, types and scoped lint.
- [x] Record version decision, rollback and limitations. Exact binary OpenAPI/overflow/LSP remain open; bounded one-call admission independently denies auxiliary calls.

**Exit:** installed-version feature assumptions resolved; native live readiness remains false.

### Task 2: Prove real native plain chat and every-call admission

**Files:** existing Luna policy/transport, new execution supervisor/gateway, native owner/session/run adapters and their tests. Review `plain-llm-chat.ts` and its unapplied migration; choose reuse or explicit retirement in the plan record before SQL changes.

**Interfaces:** `admitProviderCall({owner,rootRun,session,message,step,kind,bodyHash})` yields a single-use server-bound ticket; `kind` distinguishes main/child/maintenance. Native gateway preserves approved prompt/history rather than substituting a separate agent loop. Actual field names must match verified native hook/API contracts.

- [ ] Add failing tests for real system-role prompt, history preservation, secret isolation, duplicate/unknown calls and auxiliary request rejection.
- [x] Reuse the same existing USD1 ledger; bind admitted calls to an owned root request and actual native execution identity.
- [x] Keep exact provider/model/ZDR/price/byte/token/usage checks and no ambiguous-outcome retry. Test 429, expired privacy and budget exhaustion.
- [x] Prove real OpenRouter native answers with exact receipts, within the existing allowance; no RAG data.
- [x] Test a multi-turn application chat, owner-only saved/reloaded history and cancellation/status without redispatch. Each model turn still uses independent native context; shared history is not claimed.
- [x] Update the handoff and local checkpoint before adding tools; see native-mvp-verification.json. The original history-preservation and auxiliary/long-session feature gates remain open.

**Exit:** OpenCode, not the single-question rewrite relay, demonstrably owns the execution path.

### Task 3: Approved skills and actual read-only MCP execution

**Files:** execution config; new approved runtime agent/skill bundles; bounded deterministic MCP server/adapters; existing Admin skills/inspection adapters where reusable.

**Interfaces:** versioned skill hash and capability catalog; tool invocation binds owner/run/session/tool ID/input hash and policy epoch. Result is bounded typed data, never a permission grant.

- [ ] Define small embedded-explainer/project-planner/BOM/reviewer skills and license/source records.
- [ ] Write failing native dispatch tests for disallowed tool, unknown skill, changed bundle, foreign server, oversized output and untrusted instructions.
- [ ] Implement unit conversion and BOM formatting/validation tools with explicit input limits; prove native allow invokes once and deny invokes zero times.
- [ ] Verify exact Luna endpoint tool support and the full tool-call receipt/transcript under strict ZDR before enabling the feature.
- [ ] Test connect/disconnect, timeout, cancellation and versioned revoke/refresh behavior.
- [ ] Record evidence and checkpoint; keep arbitrary shell/filesystem/external writes off.

**Exit:** actual dispatched tools and loaded skills work; catalog discovery alone cannot pass.

### Task 4: Bounded children and owned multi-chat lifecycle

**Files:** native execution adapter/journal, custom main/planner/reviewer agents, budget call attribution and lifecycle tests; root-only additive migration if existing CAS journal cannot represent required child state.

**Interfaces:** each `ChildRun` has owner/root request/parent/native child binding, independent policy and terminal status. Native children are not customer chat IDs and cannot read another chat.

- [ ] Write failing tests for recursive delegation, over-cap child launch, foreign child events, conflicting prompt IDs and disconnected consumers.
- [ ] Enforce proposed main4/child2 steps, max2 children/depth1 and aggregate8 calls in both native permissions and server admission; child rules are explicitly restricted.
- [ ] Test simple questions launch no child; a planning/review request launches a bounded child and returns its result through the parent.
- [ ] Verify multiple owned chats, reload/fork, cancellation cascade and uncertain child outcome without a new dispatch.
- [ ] Reconcile from durable state after lost events; record checkpoint and overhead/cost.

**Exit:** optional delegation is useful and bounded, with no cross-chat leakage or hidden accounting.

### Task 5: Long sessions and explicit project memory

**Files:** native compaction integration; existing project-memory APIs/UI where compatible; owner-scoped persistence and tests. No Mem0 installation or external export in this slice.

**Interfaces:** working-context snapshot/summary version is separate from saved history and explicit `ProjectMemory`. Provenance and user edits survive reconstruction.

- [ ] Write a frozen long-session test retaining requirements, quantities, decisions and explicit unknowns.
- [ ] Add bounded manual compaction first; charge/validate its actual native call and disable unsupported automatic recovery/retry behavior.
- [ ] Test the full serialized context fits the existing financial envelope; do not silently enlarge the allowance or drop required facts.
- [ ] Verify resume after restart, no cross-chat extraction, review/correct/delete project facts and revoked owner access.
- [ ] Test corrected/deleted/disabled facts already injected into native context, children and summaries. Bind memory revision/tombstones to reconstruction; disclose that saved historical messages are retained separately.
- [ ] Enable automatic compaction only if all auxiliary calls and loss/cancellation tests pass; record remaining Mem0 scope honestly.

**Exit:** long sessions work within stated limits; permanent or lossless memory is not claimed.

### Task 6: Concrete design review and unified native UI

**Files:** `.superdesign/` target owned by the visual workflow; reviewed `ui/workspace.tsx` split, `ui/chat-stream.ts`, normalized native part reducer and selected AI Elements presentation components. Root owns dependencies/lockfile.

**Interfaces:** typed events include run lifecycle, text draft, tool state, approval, child state, artifact and terminal result. Keep owner IDs/internal payloads out of public UI; expose only approved capability metadata. assistant-ui remains the single runtime/state owner.

- [x] Record the owner's explicit Superdesign waiver and implement the current branch UI directly. Preserve the earlier draft as historical evidence only.
- [ ] Apply the [21-pattern mapping](../../agent-experience-upgrade/ai-elements-component-plan.md): current shadcn compositions, compatible Radix variant, one assistant-ui state/composer/scroll owner. No old-registry bulk install, hidden reasoning, fake execution widgets or V1/demo transport adoption.
- [ ] Obtain approval of the actual draft before substantive TSX replacement; preserve the exact logo and existing customer/Admin theme boundaries.
- [ ] Add failing reducer tests for duplicates/out-of-order events/disconnect/unknown state and invalid structured artifact.
- [ ] Render streamed prose as a draft and mark saved only after owned persistence. Render plans/BOMs only after schema validation; do not show private reasoning.
- [ ] Add read-only effective-model/readiness/allowance, native run/tool/child timeline, approval controls, artifact panel and separate Agent settings.
- [ ] Verify keyboard/focus/status announcements and mobile drawers in Codex Browser; load React best-practices/verification skills and run appropriate types/build/lint.
- [ ] Update the per-page handoff after chat, skills/tools and context/settings acceptance; checkpoint each reviewed slice.

**Exit:** UI reflects real native capabilities and outcomes; no decorative or simulated working controls.

### Task 7: Representative acceptance and separate RAG integration gate

**Files:** frozen prompt cases, existing requirement/evidence JSON, main handoff and scoped documentation.

- [ ] Freeze prompts before final changes; distinguish development-visible fixtures from held-out cases.
- [ ] Run offline/native mock matrix; use actual service checks and a small budgeted live subset, with exact reservation deltas.
- [ ] Test: concise MCU explanation; ambiguous hardware request; project plan; quantity-bounded BOM; invalid quantity; unit conversion; requested child review; unauthorized tool/write; malicious tool instructions; two-turn recall; two-chat separation; long summary; expired privacy; 429; cap exhaustion; cancel; reconnect/restart.
- [ ] Test two disposable authenticated users and foreign chat/run/approval/memory access; preserve owner histories and record cleanup.
- [ ] Measure initial feedback, first text, full response and durable save separately. Do not promise subsecond total latency; report native/tool/subagent overhead.
- [ ] Run final scoped/full regression as justified, types/build/lint, requirement validation and independent review; fix important findings before claiming acceptance.
- [ ] Leave RAG/LangSmith disconnected until the owner explicitly returns its integration handoff. No Phase2/deployment advancement by inference.

**Exit:** a tested no-RAG MVP, reviewed UI and honest remaining gates; then request the separate RAG handoff for integration review.
