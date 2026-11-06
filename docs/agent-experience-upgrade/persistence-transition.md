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
The native client remains unwired until durable admission, source-fenced release,
runtime identity, provider policy and rollback tests pass. No deployment is implied.

The additive `20261106090004_panda-agent-native-journal.sql` migration and typed
`native-run-store.ts` now implement this journal contract. Nine rollback-only
development SQL guard groups passed, including QA epoch revocation, old-engine
cancellation denial, create/prompt CAS, unknown no-redispatch, retirement-before-
deletion and four expired replay paths. The latter uses an injected delay after
entry verification, not real concurrent lock contention. The UUID case test uses
an injected scope helper; no canonical source was withdrawn. Existing rows,
functions, triggers and ACLs matched after rollback; the candidate table is absent.
See `native-journal-verification.json`. The migration is **not applied**.

Current native admission inherits the existing QA skill capability even for
conversation. Its captured epoch is checked before prompt dispatch and answer
completion/replay. This is an explicit first-increment limitation, not a final
general capability policy. Canonical product scopes/citations are supported by
this journal; approved vendor evidence still needs its corresponding fence.
Native context retirement is recorded only after a future caller verifies owned,
inactive removal and absence on the same runtime; the current native leaf has no
removal method, so customer activation remains blocked at that lifecycle gate.

The next connected increment should extract the existing bounded retrieval and
current-scope checks from `retrieval/answers.ts`, not reuse its finite selector as
native orchestration. Supply eligible context to one native prompt per natural
message and validate structured citations before release. Do not dispatch through
the old lightweight/guide/diagnostic/composite controllers. Full harness-selected
knowledge tools require a verified native extension or MCP surface: the preserved
`rag-mcp` POST `/search` facade is not an MCP endpoint. Keep this limited
context-fed generation distinct from complete native tool routing.
