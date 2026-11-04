# Lightweight assistant baseline review

Date: 5 November 2026. Read-only review of base `a3a4756fa514af780ae6a1e138d7aeddd36c77bc`, with committed comparison source `4fcaf73b38d22b92874414fcf3f33130a35936c6` and explicitly identified local working-source dependencies. This document supplements the root-owned `lightweight-harness-handoff.md`.

Feature checkout: `C:/Users/rajra/.codex/worktrees/panda-agent-lightweight-rag/Pandabyte`, branch `codex/panda-agent-lightweight-rag`. At the end of testing, its only untracked file was the root-created handoff; this review then added this document. No application source was edited by this reviewer.

The assigned role was Sol high contract/review lead. Runtime model identity and reasoning effort are not independently exposed by a tool in this review; the parent owns the observable worker launch configuration. Developer-agent selection must never become customer runtime behavior.

## Phase 1 conclusion

The committed base has a reusable, guarded TypeScript product-retrieval implementation and the customer chat interface. It does not have the complete tracked database migration history needed to reproduce durable customer chat. Reuse that implementation; do not rebuild RAG, silently switch bases, merge the release branch, or copy the dirty checkout wholesale.

A reproducible existing failure is a valid Phase 1 baseline result under the supplied brief. These findings do not alone prevent Phase 1 PASS. The authenticated browser baseline, anonymous boundary, branch build and cold JavaScript comparison remain root-owned pending gates at this report. This document claims no browser or live authenticated integration pass.

No network provider request, cloud/configuration operation, credential read, deployment or database write was performed. Docker was reported unavailable by the parent; container gates cannot be claimed from these Node fixtures.

## File-backed map at the requested base

| Boundary | Tracked source and behavior |
| --- | --- |
| Customer page | `app/panda-agent/page.tsx`: active Clerk session required; anonymous redirect to sign-in. Production passes `previewReadOnly=true`. |
| Browser state and transport | `Panda-agent/src/ui/workspace.tsx`: existing assistant-ui `useExternalStoreRuntime`; create/list/read/archive/delete chat transport and one messages POST with request ID. `src/ui/chat-stream.ts` normalizes bounded SSE. Do not add a second `useChat` state owner. |
| Root APIs | `app/api/panda-agent/chats/route.ts`, `chats/[id]/route.ts`, `chats/[id]/messages/route.ts` delegate to `src/server/clerk-chat.ts`; answer/product wrappers also exist. |
| Identity and client | `src/server/clerk-chat.ts`: derives subject/client from active Clerk session and `createInsforgeServerClient`; never trusts a supplied actor. `src/server/clerk-answer.ts` creates the standalone answer handler. |
| Routing and durable admission | `src/server/chat-handler.ts`: ownership read before `begin`; exact input keys, same origin, bounded body; saved-question scope resolution; duplicate/pending handling; durable finish before final event. `src/retrieval/chat-scope.ts` and `conversation-route.ts` distinguish product, ambiguity, general and manufacturer questions. |
| Persistence owner | `src/server/chat-store.ts`: user-scoped RPCs for create/read/list/archive/delete/begin/finish; validates public result shape. Runtime/chat SQL definitions are missing from tracked main, described below. |
| RAG domain | `src/retrieval/answers.ts`: `answerQuestion(actor, question, adapters)`. Validates identity, revision, candidate proofs, current generation, blocked chunks, literal quotations and current-scope fingerprint; eligible-set-first lexical default; eight fragments / 20,000 characters / four selections / 600-character quotes. Returns distinct outcomes. |
| Trusted database adapter | `src/retrieval/insforge-adapters.ts`: `panda_agent_runtime_products` and `panda_agent_runtime_scope`; validates engineering membership/hashes, source URLs, chunk bytes and provenance. `engineering-proof.ts` pins the reviewed engineering candidate, not production approval. |
| Selector seam | `src/retrieval/contracts.ts`: `Adapters.select(question, fragments, {revalidate})`. The selected quotes, never model URLs, produce server-owned citation DTOs. Preserve this seam for a private worker. |
| Default lexical path | `src/server/local-hybrid.ts`: defaults to `createInsforgeAdapters`; hybrid is a separate explicit local engineering experiment. Embeddings are not permission to enable hybrid. |
| Legacy worker | `src/server/local-runtime.ts`: non-production and `PANDA_AGENT_LOCAL_WORKFLOW_ENABLED=true` only; reads an ignored local runtime descriptor and returns OpenCode selectors. `opencode-selector.ts` calls bounded native session/info/prompt/history/delete APIs over the admitted local tunnel, verifies model/provider/native terminal state and nonce-owned cleanup. No call was made in this review. |
| Source ingestion | Base has canonical knowledge/control-room migrations and retrieval, but not tracked ingestion/runtime services/package manifest. `4fcaf73` adds committed `src/ingestion/listings.ts` and `uploaded-document.ts`, Admin comparison/context code and runtime-read migration; it still does not supply the complete customer-chat schema. None is needed to justify reingestion for this task. |

The main README lines 7–9 explicitly says the hosted integration uses a reviewed combined source snapshot including uncommitted Agent source. `docs/vercel-preview-deployment.md` lines 10–23 records a 565-path Agent source manifest and deployment-only pilot settings. Therefore the tracked main caller above is repository evidence, not proof of the current hosted AWS revision or deployed caller. The dated local/hosted repair reports in the dirty checkout are not equivalent to tracked baseline behavior.

The release branch's `src/control-room/rag-workflow.ts` is an Admin comparison workflow using LangGraph, while `src/retrieval/product-context-set.ts` binds multi-product retrieval and current authorization. Do not expose the Admin route to customers or bring its graph dependencies into the lightweight runtime. Single-product Phase 2 can reuse main directly. If later multi-product behavior needs release helpers, adopt exact reviewed files and their dependency closure separately.

## Offline test evidence

Environment: Windows developer host, Node `v24.18.0`, fixture mode, base application source unmodified. These tests ran before the parent's clean-worktree `npm ci` completed. They use Node's TypeScript stripping and their exercised imports resolved; they do not establish installed dependency integrity, full typecheck, production build, database migrations or browser behavior. Node emitted a module-type warning, not a test failure.

Run from the feature checkout:

```powershell
node --test Panda-agent/tests/retrieval-answers.test.mjs Panda-agent/tests/answer-handler.test.mjs Panda-agent/tests/chat-handler.test.mjs Panda-agent/tests/opencode-selector.test.mjs Panda-agent/tests/chat-scope.test.mjs Panda-agent/tests/conversation-route.test.mjs Panda-agent/tests/chat-stream.test.mjs
```

Observed exit `0`: **96 tests, 96 pass, 0 fail, 0 skipped**. Coverage includes literal citation binding, source changes during retrieval, ambiguity, wrong-product/blocked/private-source protection, native session cleanup, duplicate replay, pending unknown outcomes, bounded history, SSE and authentication/input boundaries. The native HTTP requests in those tests use injected fixture transports, not the AWS worker.

### First schema dependency failure

The following offline contract assertion checks whether the source tree contains definitions for the RPC names its tracked adapters call. It does not query the development database.

```powershell
$reviewScript = @'
import pathlib,re,sys
sql='\n'.join(p.read_text(encoding='utf-8-sig') for p in sorted(pathlib.Path('Panda-agent/migrations').glob('*.sql')))
required=['panda_agent_runtime_products','panda_agent_runtime_scope','panda_agent_chats_list_v2','panda_agent_chat_create','panda_agent_chat_read','panda_agent_chat_begin_v2','panda_agent_chat_finish','panda_agent_chat_archive','panda_agent_chat_delete']
missing=[n for n in required if not re.search(r'CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.'+n+r'\s*\(',sql,re.I)]
print('Tracked-schema dependency check:',len(required)-len(missing),'present;',len(missing),'missing')
for n in missing: print('MISSING',n)
sys.exit(bool(missing))
'@
python -c $reviewScript
```

Observed exit `1`: **0 present, 9 missing**. Tracked main contains only Agent migrations `90000` through `90004`. This is a clean-clone reproducibility failure, not evidence that an already-configured development database lacks those functions.

### First behavioral failure: history bypasses current publication guard

This fixture supplies a syntactically valid stored citation and a current publication guard that denies release. It proves that GET reload bypasses that guard. The sentinel's name does not prove an actual source withdrawal in a database; actual withdrawal remains a required integration test.

```powershell
$reviewScript = @'
import assert from 'node:assert/strict';
import {createChatHandler} from './Panda-agent/src/server/chat-handler.ts';
const id='11111111-1111-4111-8111-111111111111', now='2026-11-05T00:00:00Z';
const citation={id:'S1',title:'Fixture listing',sourceUrl:'https://pandabyte.in/product-page/fixture',capturedAt:now,quote:'WITHDRAWN_FIXTURE_QUOTE',sectionPath:['Specifications']};
let checks=0;
const client={database:{schema:()=>({rpc:async()=>({data:{thread:{id,title:'Fixture',updatedAt:now,status:'idle'},messages:[{id:'33333333-3333-4333-8333-333333333333',role:'assistant',text:'WITHDRAWN_FIXTURE_QUOTE [S1]',createdAt:now,citations:[citation]}],turns:[]}})})}};
const handlers=createChatHandler({authenticate:async()=>({subject:'fixture-owner',client}),products:async()=>[],answer:async()=>null,authorizePresentation:async()=>{checks++;return false;}});
const response=await handlers.readGET(new Request('https://localhost:3000/api/panda-agent/chats/'+id),id);
const body=await response.text();
console.log(JSON.stringify({mode:'offline fixture',route:'GET chat reload',status:response.status,currentAuthorizationChecks:checks,withdrawnQuoteReleased:body.includes('WITHDRAWN_FIXTURE_QUOTE')}));
assert.equal(body.includes('WITHDRAWN_FIXTURE_QUOTE'),false,'reload must not release a citation after current authorization denies publication');
'@
node --input-type=module -e $reviewScript
```

Observed exit `1`: `status=200`, `currentAuthorizationChecks=0`, `withdrawnQuoteReleased=true`; assertion `true !== false`.

## Required save/replay fixes

- `chat-handler.ts:69` returns stored history immediately after ownership/shape validation. It performs no current publication or source eligibility check.
- Completed replay at `:88–92` uses optional `currentAccess('final')`; in `clerk-chat.ts` this callback is installed only under a non-production native-streaming flag and checks session/turn status, not citation eligibility.
- Save at `chat-handler.ts:123` precedes final current-access check at `:125`. `answerQuestion` rechecks sources before returning, but there is no source fence spanning the later save. A withdrawal in that gap is not protected by the tracked customer path.
- `chat-store.ts` validates citation URL/shape but cannot establish current source rights. The local working-source chat finish migrations likewise validate shape, owner and finish token rather than current canonical eligibility.

Phase 2 needs current Clerk/owner authority and full current citation binding before save, final publication, GET reload and completed replay. Preserve private source/version/product binding or validate the complete public citation against current eligible chunks, including exact quote, URL, title, capture time and section. Never use a stale summary as evidence. The save/withdrawal race needs an atomic database fence shared with withdrawal, not only a TypeScript check followed by a separate write. Preserve durable one-answer uniqueness and pending-unknown semantics.

The local `20261101160105_panda-agent-source-fences.sql` contains useful locking/checking precedent, but its complete file depends on native bindings/attestation/operation migrations. Importing that stack is not the smallest solution. Root should own a narrow additive lightweight fence after reviewing the actual development schema; do not edit already-applied migrations or apply anything remotely in this baseline review.

## Explicit dependency resolution recommendation

Keep the branch based on fetched main. Select the committed runtime-read migration from `8b71868` (also present at `4fcaf73`) only. The following five additional files exist solely as local-untracked working source in the original checkout; `git log --all -- <paths>` returned no commits for them. Selective review and adoption of these named dependencies is preferable to rebuilding RAG or copying the full dirty Agent tree. Record their local provenance and exact bytes; do not describe them as committed/hosted parity.

All paths below are under `Panda-agent/migrations/`:

| File | Provenance | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `20261031090005_panda-agent-runtime-reads.sql` | Committed `8b71868` / `4fcaf73`; local bytes match | 12244 | `a9a07efd996041dc8aa7a236a65ce42bba53957b94700621ab7ab65f4ad6a998` |
| `20261031090006_panda-agent-account-chats.sql` | Local-untracked only | 12223 | `0f121727cf804c3694792c1a3f6d75c3f38d7302a28f0634cdfd8bc1663fa0bf` |
| `20261031090008_panda-agent-chat-lifecycle.sql` | Local-untracked only | 6469 | `977ce3a70ed05d6b9e729bd4a748e1b1395731475c16b9bb3ea9a00926fb906a` |
| `20261031090009_panda-agent-chat-answer-modes.sql` | Local-untracked only | 3920 | `54dd560ec2e1d6fbc42c4a0e670962cfb9b089e22cfa08ba7eaa0a8b32af947e` |
| `20261031090010_panda-agent-web-search-citations.sql` | Local-untracked only | 4809 | `fa51a7593ba895876b4a47f318d4e42ffa1dc6b10b8316b0868db833a338aba1` |
| `20261031090011_panda-agent-search-admission.sql` | Local-untracked only | 1412 | `8e66047e2cc25db0ad126f53a03612840c9e5aa29dfd671675954a40408e29a5` |

`90006` establishes owner-scoped chats/turns and finish-token admission; `90008` provides existing archive/delete/list-v2 calls; `90009` preserves conversation/official citation outcomes; `90010` preserves existing web citation validation; `90011` provides the begin-v2 call and search-consent idempotency. Phase 2 itself should enable only product evidence. Keeping schema compatible with the unchanged default path does not authorize new external tools. Hybrid `90007` and native/cloud migrations are unnecessary for the core lightweight slice. A separate `Panda-agent/package.json` is unnecessary to run the existing root-owned npm/Node source tests.

This is a recommendation to review narrowly before adoption, not an assertion that those untracked migrations were applied or independently SQL-tested. Local database fixture execution, current target schema verification and real Clerk/InsForge ownership checks remain open.

## Proposed Phase 2 contract (design only in Phase 1)

1. Root defines server-only `PANDA_AGENT_LIGHTWEIGHT_ENABLED=true`, default false. Wire selection in Phase 2 only. False continues the existing caller; true must not construct or call local/AWS/OpenCode selectors, even on failure. No silent legacy fallback. Preserve unrelated production/pilot guards; local development switch testing is not hosted enablement.
2. Retain one same-origin authenticated Next messages transport and assistant-ui state owner. Derive Clerk subject/session and owner-scoped InsForge client per request; ownership and durable turn admission happen before worker work. Client-supplied hints never choose scope or actor.
3. Keep canonical retrieval, rights, validation and final release in TypeScript. Reuse `answerQuestion` / `createInsforgeAdapters` with lexical ranking. For the simplest handoff, Next executes retrieval and the existing `Adapters.select` callback sends only bounded question/fragments to private FastAPI. FastAPI returns bounded exact selections; TypeScript validates them and builds citations. No database credentials, broad Clerk token, Admin search, filesystem, shell or unrestricted fetch tool enters the worker.
4. Bind a short-lived server-signed capability to user/session/turn, exact question digest, authorized scope/SKU, fragment digest, allowed action, audience, expiry and nonce. Reject replay, expiry, changed question/scope and second selection. Use durable nonce/turn admission rather than relying on worker memory. Expose only allowlisted progress and public final DTOs. Revalidate before sending context/provider work and before final release.
5. Start with one async worker, one product-evidence capability and at most one model call. Keep the current 2,000-character / 8,192-byte input and 8-fragment / 20,000-character / 4-selection / 600-character quote bounds. Any deterministic answer path must use an authorized formatter with validated evidence, not substitute a keyword heuristic for the selector contract.
6. Free-only OpenRouter defaults fail closed until current endpoint price, modality, privacy and compatibility are verified. Zero allowance includes retries/fallbacks. Provider mocks prove fixture behavior only. Keep provider/network admission and container measurements distinct from offline contract checks.
7. Finalize exactly once through the existing durable owner/finish-token contract, with current source/authorization fencing. Reload and replay filter or withhold now-ineligible evidence without re-running model work. Preserve honest unavailable, clarification, conflict and insufficient outcomes.

Suggested disjoint Terra scopes after Phase 1 PASS and root agreement:

| Worker | Permitted scope | Initial failing contract |
| --- | --- | --- |
| Runtime | New narrowly named lightweight FastAPI service, its Python tests and service docs; no root manifests/migrations | Capability replay/expiry, bounded selection, cancellation, queue-full and zero-paid fallback; enabled path makes zero legacy calls |
| Evidence | New lightweight TypeScript adapter/contract tests, named retrieval/source checks; coordinate existing shared handler edits with root | Reload fixture above; source loss before save/final/replay must withhold evidence |
| UI | Thin existing chat presentation/keyboard/source/cancel behavior and focused UI tests, with root-owned route selection | One submission/save, citation expansion/reload, accessible error/cancel and no duplicate state owner |

Root retains handoff, shared manifests/lockfiles, route selection, shared handler/store contracts, migration adoption/design and integration. No worker should import the release Admin workflow wholesale. Phase 2 cannot PASS a real persisted-answer gate solely from these fixtures; Docker, authorized provider/account allowance, current database schema and genuine authenticated browser evidence remain explicit environment gates.
