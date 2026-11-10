# Live input, grounding and latency incident — 10 November 2026

## Goal and observed report
The owner reports that the live Panda Agent input cannot be typed into, RAG appears broken, and complete answers exceed ten seconds. Inspect both /panda-agent and /admin/rag-control-room in the signed-in browser. Earlier verification is historical evidence, not proof this incident is resolved.

## Scope
Trace the input's disabled state through readiness, pending/blocked turns, attempt recovery and session refresh. Trace retrieval, model metadata/admission, fresh session/source checks, provider generation and persistence separately. Find measured root causes before editing. Preserve quoted-source validation, Clerk/owner/Admin guards, per-request current evidence, no generation retries, saved history, uncapped hosted owner testing and the original local/native ledger. No dependencies, database migration, provider/model switch or unrelated business changes unless evidence requires one.

## Investigation and implementation order
1. Root reproduces in the existing live browser, inspecting current state and bounded status/network timings without resending pending turns.
2. Two fresh-context read-only Goldfish audits independently challenge the input/recovery and retrieval/latency paths against source. Findings require exact file/symbol references and distinguish observed evidence from hypotheses.
3. Root synthesizes the findings into a bounded file-change plan, implements the smallest complete repair, and adds meaningful regressions for the measured failure.
4. Run affected tests, TypeScript and scoped lint. Deploy a reviewed candidate and verify both actual browser journeys before updating main. Recheck origin/main before publishing to preserve concurrent work.

## Acceptance and evidence
The user can draft text in a signed-in chat without readiness/loading/recovery state trapping the input. Sending still respects access, active-turn and source guards; no duplicate provider call is used as recovery. Named product questions and supported same-chat product follow-ups produce current literal source quotations. Unsupported facts abstain. Retrieval readiness remains below two seconds in the observed live cases. Remove measured redundant application waiting from final answers, report complete-answer and provider timings separately, and do not claim a hard provider latency SLA. Verify Control Room retrieval and grounded answers independently. Record current deployment/source hashes, each Goldfish's actual report, tested cases, timings and any remaining limits.

## Initial reading list
- Panda-agent/src/ui/workspace.tsx
- Panda-agent/src/ui/reconcile-answer.ts
- Panda-agent/src/server/lightweight-handler.ts
- Panda-agent/src/server/lightweight-connection.ts
- Panda-agent/src/server/main-rag-chat.ts
- Panda-agent/src/server/basic-rag-chat-service.ts
- Panda-agent/src/server/luna-rag-openrouter.ts
- Panda-agent/src/server/hosted-rag-policy.ts
- app/api/panda-agent/capabilities/route.ts
- app/admin/rag-control-room/playground.tsx
- app/api/admin/panda-agent/playground/route.ts

This is a debugging brief, not a completed design review or convergence claim. Architecture/file changes will be narrowed after source and live observations.

## Source-backed and live findings, first Goldfish pass

Both fresh reviewers completed after reading the bundled persona, supplied readiness standard, target brief and selected source files. They performed no mutations/provider calls; this is one source-review pass, not formal multi-round convergence.

- Live: the main header was Ready, the latest `geeky board xc3` turn remained pending/claimed for over seven minutes, and the textarea was disabled. Status GET returned200 with the pending turn. The prior request was logically cancelled without a resend; history and its claim remain.
- Live: a fresh Control Room specifications query returned503/outcome_unknown. A separate document-only request returned three passages/1,703 characters in471ms. This separates functioning retrieval from failing generation. The pending model test is retained, not automatically repeated.
- Source: workspace passed send restrictions into both SDK isDisabled and textarea disabled; same-chat status remounted the composer and failed/cancelled prompt restoration could overwrite a typed follow-up.
- Source: a successful named main RAG path invokes the session helper about37times and approximately26database operations before/around generation. These are static call counts, not measured network requests. The repair shares only overlapping identical live-session requests and overlaps independent authorization pairs; no completed authorization/source result is cached.
- Source: unknown Control Room results set a tab-wide marker with no in-page action for a consciously separate new test. Explicit new-test acknowledgement will keep old claims untouched and perform no generation itself.
- Source: retrieval admits up to20,000characters while the model request enforces10,000serialized UTF-8 bytes. This is an independent limitation; it does not explain an already claimed main request. Keep byte/receipt guards enforced.

## Bounded implementation ownership and decisions

Modify ui/workspace.tsx; create ui/composer-gates.ts and its test: separate draft/send gates using installed SDK isSendDisabled, retain admission/queue guards, preserve drafts on status/cancel/recovery, provide in-page readiness retry and bounded network reads. Modify ui/reconcile-answer.ts and its tests only for exact manual history GET refresh/deadline support; never retry a mutation.

Modify server/lightweight-connection.ts and lightweight-admission tests: a capped map shares only in-flight matching actor/session reads, evicts after settlement or existing3second deadline, and does not share later revocation checks. Modify server/main-rag-chat.ts and create tests/main-rag-revalidation.test.mjs: start independent session/Admin checks together on both sides of fresh source reconstruction, retaining history/source fences and exact digest checks.

Modify server/luna-rag-openrouter.ts and its tests: fixed safe stage labels plus bounded elapsed times identify metadata/dispatch/provider/validation failures, with an explicit response-truncated tag. Never log keys, identifiers, prompts, passages or response bodies. Enable the existing server-only diagnostic flag for this investigation; model/provider/receipt bounds stay unchanged until actual failure evidence identifies a needed repair.

Modify app/admin/rag-control-room/playground.tsx: explicit separate-new-test acknowledgement resets only local UI intent, leaves prior durable claims intact, defaults evaluation off and sends no generation request; it may refresh capability status through a read-only GET. Storage failure continues to block evaluation. Use actual browser testing to prove zero generation from acknowledgement and separate new request identity on later explicit submission.

Run affected tests with the original reviewed private fixtures supplied from their existing ignored paths; report any skips. Run TypeScript/lint/build, staged signed-in browser tests for editable/guarded drafts and the failed specifications case, collect safe provider-stage metrics, then finish the diagnosed provider repair and repeat relevant tests before main publication.

## Fresh repair-review follow-up
A third fresh Goldfish review completed against d9a3a39. It found draft text could survive genuine chat-identity changes because the external-store composer outlives the keyed UI. The repair now explicitly clears on a genuine composer mount, preserves later same-chat null restore updates, and adds installed-SDK tests for chat switch/New chat/archive/delete isolation. It also corrected this brief: separate-new-test acknowledgement may refresh capabilities but makes no generation request. Neither finding was dismissed as a clean review. Final live confirmation is still in progress.

## Confirmed model failure and repair
The signed-in candidate e032ee6 reproduced the exact xC3 specifications question. Safe runtime diagnostics show metadata226ms, pre-dispatch585ms, provider round trip2457ms, then `evidence-rejected:quote-whitespace-mismatch`. The provider receipt and inner JSON were valid; this was not a retrieval failure or token truncation. An earlier candidate showed provider2932ms and the same broad evidence-rejected stage. The Vercel connector returned403; the authenticated official CLI's documented request-log endpoint supplied the fixed stage labels without disclosing model content.

Luna now reconciles only uniquely identifiable whitespace-equivalent quotations to the exact original source substring before the unchanged strict validator. Original and recovered quotes remain bounded to600characters; ambiguous occurrences, changed words/numbers/punctuation/case/soft hyphens and Unicode normalization remain rejected. The returned evaluation contains the exact source bytes for subsequent source revalidation. This changes neither stored source material nor other providers.

After a valid Luna RAG receipt, rejected inner JSON/evidence/answer markers now produce typed `response_rejected`. Main chat saves its existing fixed safe unavailable answer while retaining the consumed claim; an uncertain transport/receipt/truncated response remains unknown. Both Playground adapters and its API preserve the new code; the UI keeps a separate-test guard with distinct persisted rejection wording. No retry, refund or claim removal is introduced.

The repair reviewer rechecked draft isolation and corrected documentation, then reviewed typed rejection and quote reconciliation including the composed downstream tests. It found no remaining blocker/major in the reviewed changes. This is a targeted repair review, not five-stage EGM convergence or full native-harness acceptance.

Candidate browser input checks passed: an existing blocked chat allowed typing while Send remained disabled, status GET preserved the draft, and New chat cleared it. Final repaired model/browser verification follows the next candidate build.

The next signed-in model check exposed a second concrete rejection: `rank-duplicate`, with4479ms provider round trip and567ms admission. A specifications answer may legitimately quote several distinct facts from the same source passage. The shared evidence contract now permits distinct `(rank, quote)` pairs, while rejecting identical pairs even if reasons differ. All four-entry, exact-source, quote/answer/reason and freshness guards remain. Current main RAG and workflow citations validate each quote independently. Legacy handle selection remains conservative and rejects repeated handles. This contract also applies to other shared-validator callers; it is not described as Luna-only. Playground uses pair keys; saved truncated evaluation excerpts use index keys to prevent React collisions.

The rejected-response UI persisted its distinct warning across browser reload. Explicit separate-test acknowledgement emitted zero generation POSTs and left model evaluation unchecked. The old durable request claim was not reset.
