# Native persistence transition

6 November 2026. This is the next integration increment, not a completed cutover.

The existing `panda_agent_lightweight_*` completion contract is single-product and
excludes the `conversation` outcome. TypeScript `cleanAnswer` accepts conversation
with no citations; the current SQL does not. Keep those SQL predicates unchanged.
Native execution must not reuse a prepared lightweight digest or reinterpret an old
pending request. Existing guide, diagnostic and composite receipts remain intact.

Use one native session per application turn, with bounded, currently authorized
conversation context supplied by the application. OpenCode owns inference and its
supported execution; the application journal owns admission, dispatch identity,
history and source authority. No application agent loop or MCP executor is added.

An additive private native-run journal references the existing owned chat turn and
stores the native receipt, current message ID, prepared-prompt hash, opaque runtime
binding, source-scope set, phase/version and sticky create/prompt claim flags.
Persist IDs before dispatch. Claims are atomic and consumed once. Unknown mutation
outcomes are observed through native status/history; never repeat create or prompt.
A prompt acknowledgement is pending. Finalization requires the caller's verified
current-message/terminal receipt and current sources, not just an old native outcome.

Use the existing private BFF signer with a distinct native namespace. Require the
current Clerk-derived text subject, owned thread, expiring signed input and exact
version on every state change. Raw journals/helpers remain inaccessible to browser
roles. A native marker prevents old preparation/completion/cancellation RPCs from
taking over the same turn. Existing historical reads remain source fenced.

The first journal increment supports customer scope only. Playground must use a
separate test-history/memory namespace and ADMIN admission before being enabled;
accepting a `playground` label on a native receipt alone does not provide isolation.
Live native execution remains disabled until durable admission, source-fenced release,
runtime identity, provider policy and rollback tests pass. No deployment is implied.

The additive `20261106090004_panda-agent-native-journal.sql` migration and typed
`native-run-store.ts` now implement this journal contract. Nine rollback-only
development SQL guard groups passed, including QA epoch revocation, old-engine
cancellation denial, create/prompt CAS, unknown no-redispatch, retirement-before-
deletion and four expired replay paths. The latter uses an injected delay after
entry verification, not real concurrent lock contention. The UUID case test uses
an injected scope helper; no canonical source was withdrawn. Existing rows,
functions, triggers and ACLs matched after rollback; the candidate table is absent.
See `native-journal-verification.json` for that historical rollback checkpoint.
It is now applied in development with inference OFF; see the mounted-route section below.

Current native admission inherits the existing QA skill capability even for
conversation. Its captured epoch is checked before prompt dispatch and answer
completion/replay. This is an explicit first-increment limitation, not a final
general capability policy. Canonical product scopes/citations are supported by
this journal; approved vendor evidence still needs its corresponding fence.
Native context retirement is recorded only after a future caller verifies owned,
inactive removal and absence on the same runtime. The native leaf now supports
no-child removal and typed absence with PID checks; the mounted durable cleanup
fence and runtime generation/secret binding are still activation gates.

Before removal, `claimRemoval(thread,request,expectedVersion)` consumes a separate
durable terminal-only CAS claim. A second claim conflicts. The winning caller may
perform one native DELETE; uncertain acknowledgement permits observation through
`absence`, never another DELETE. Retirement requires the consumed claim and the
caller's actual same-generation cleanup proof. An absent session does not settle
an unknown create or prompt. The revised migration and these removal/retirement
guards passed the rollback checker again; its current SHA is in the JSON record.

The next connected increment should extract the existing bounded retrieval and
current-scope checks from `retrieval/answers.ts`, not reuse its finite selector as
native orchestration. Supply eligible context to one native prompt per natural
message and validate structured citations before release. Do not dispatch through
the old lightweight/guide/diagnostic/composite controllers. Full harness-selected
knowledge tools require a verified native extension or MCP surface: the preserved
`rag-mcp` POST `/search` facade is not an MCP endpoint. Keep this limited
context-fed generation distinct from complete native tool routing.

## Prepared evidence kernel

`retrieval/prepared-evidence.ts` now reuses the existing actor-scoped identity,
canonical scope, lexical search and validators. It does not call the old selector
or proof-refusal routing. Construct `prepareEvidenceContext` with the current
actor/input, `createInsforgeAdapters` retrieval methods, current-session callback
and existing read-only `lightweightStore.scope(product.id)` callback. Private
`scopes` feed the native journal; `context()` returns a detached snapshot after
revalidation. The whole serialized context is at most 20,000 characters, with
up to eight whole fragments and one resolved product in this first increment.
Unresolved/conflicting questions retain honest empty context instead of becoming
finite canned answers. General routing still belongs to the future native caller.

Service-supplied internal IDs/headers/hashes are excluded from model context;
fragment aliases E1..E8 map privately to canonical chunks. The user's own question
is retained. `finalize` accepts only `{outcome,text,selections:[{handle,quote}]}`,
assigns citation metadata from sent chunks, rejects private metadata/internal-ID
echoes and rechecks current access, identity, scope hash, fingerprint and sent
chunk membership before release. Withdrawn evidence blocks even citation-free
answers from that prepared context. Source timestamp and revision metadata have
explicit privacy/date validation; trusted empty identity conflicts remain conflict.

Sixteen kernel fixtures pass, including withdrawal before context/finalization,
empty-context access checks, detached mutation, spoofed aliases/metadata and the
independently reproduced metadata-escape regressions. This proves literal quote
membership and current-source fencing, not semantic entailment, hardware
applicability, multi-product/vendor coverage or live native answering. The kernel
is now assembled behind the inference-disabled native bridge. `npm run typecheck:agent-native` explicitly checks these
unwired modules; the application's import graph alone does not include them.

## Thin turn adapter

`server/native-turn.ts` connects the existing session client, private run store,
prepared evidence and current-turn correlator. It is assembled behind the inference-disabled native bridge. `start` and
`status` accept only an owned application thread/request/question and return
pending, unknown or saved. The caller reads the existing current-source-checked
history projection after saved; native text/IDs are never the public response.

One prompt is prepared and hashed before durable admission. Only the fresh
admission winner can consume create/prompt CAS claims. Native dispatch callbacks
require the exact claimed version/phase, immutable receipt/message/prompt/scope/
runtime identity and current owner access. Duplicate starts and uncertain writes
become status-only observations, never replacement execution. Status reconstructs
only identical prepared context; changed context or source scope remains unknown.
There is no polling, model/tool orchestration loop or second knowledge engine.

The root supplies `authorizeRuntime('dispatch'|'observe')`. Both purposes must
verify the owned current runtime generation/policy binding. Dispatch additionally
requires the current zero-cost/ZDR profile, quota and new-call permission.
Disabling new calls must not block observation of already admitted work on the
same verified generation. A changed generation remains unknown. These callbacks
are not implemented or certified by a fixture's returned opaque binding.

Correlated successful output passes the existing strict JSON parser and prepared
evidence finalizer before current admission/source rechecks and atomic completion.
Failure uses the exact SQL-defined unavailable answer. A native interruption is
cancelled only when the latest journal has its durable cancellation flag; an
unsolicited interruption is unavailable. Independent review caught and fixed
both SQL contract mismatches; the fake store now enforces these predicates.
Eighteen adapter tests cover CAS races, lost acknowledgements, source withdrawal,
runtime/owner changes, invalid JSON/citations, dispatch disablement and recovery.

The private `server/native-lifecycle.ts` now supplies cancellation/status and
terminal native cleanup through these same dependencies. Cancellation is sticky;
only a fresh CAS winner can interrupt. Cleanup claims removal once and retires only
after current ownership/generation/version checks and typed native absence.
Consumed claims recover by observation, never repeated DELETE. Seventeen fixtures
and the actual provider-free unstarted-session case pass; the latter uses a
synthetic file journal, not real Clerk/database integration. See the session
contract for explicit late-prompt/interrupt and consumed-claim recovery limits.

The private route bridge and current owner/runtime callbacks are now assembled.
The development journal is installed, with new inference hard OFF; no live native
customer cutover occurred. See the mounted-route section below.

## Mounted routes with inference disabled

The existing lightweight HTTP shell now accepts an optional actor-scoped native
bridge. It selects a fresh native request before any legacy begin; durable journal
classification handles existing native work regardless of new-message selection.
Old guide/diagnostic/composite/unprepared requests retain their original handlers.
Unknown native operations never become replacement legacy executions.

The bridge reads through native_read -> parseChatRead -> the existing public
projection, with current Clerk checks before/after release. Terminal replay does
not require a runtime. Same-origin POST cleanup and normal Delete use the same
owned lifecycle adapter; Delete fetches only four cleanup candidates and retains
conflict for pending/more/unknown work, within20s, before SQL's final delete guard.

The reviewed0004 journal is applied to the selected existing development project;
0005 reloads PostgREST's schema cache. This follow-up was required by real PGRST202
observations, after SQL-only fixture validation passed. No existing rows changed
at installation; native rows remain0 after real admission/isolation tests.
Schema/recovery routing stays enabled locally; fresh native selection is off.
Even when selection was temporarily on, source hard-denies new dispatch and native
create/prompt before inference. A persistent isolated supervisor, strict provider
privacy/fee proof and full live observation/cancellation/latency remain open gates.
