# Native session translation foundation

6 November 2026. This is an unwired server-side OpenCode 2.2.2 HTTP translation,
not a customer execution cutover or an execution-policy certification.

`Panda-agent/src/opencode/session-client.ts` exports
`createNativeSessionClient({baseUrl,password,directory,fetch?,timeoutMs?})`.
Routing, credentials and the exact native canonical directory are server-owned.
Every native request includes the encoded `x-opencode-directory` header to bind
location-scoped active/catalog reads to that directory rather than process cwd.
The client accepts only a literal HTTP IPv4 loopback origin, verifies 2.2.2 on
every operation, rejects redirects, bounds each JSON response to 1 MB, and uses
one total deadline of at most ten seconds, including admission and body reads.

The caller must persist `createNativeReceipt(scope,binding)` before create.
`scope` is customer or playground; binding is an opaque server HMAC encoded as
64 lowercase hex characters, never a raw subject/email. Receipt identity includes
the native session ID, random nonce, exact generated title, scope and binding.
Every operation requires `checkAccess(receipt): Promise<boolean>` to verify the
durable mapping, current Clerk identity/access and scope before dispatch and
before release. Mutations recheck immediately before the native request.
Native responses must match receipt ID/title/metadata/directory and must not be
forked or child sessions. Native IDs are never browser authority.

The six methods are `create`, `get`, `messages`, `active`, `prompt` and
`interrupt`, all taking the persisted receipt, admission callback and optional
abort signal. Prompt additionally takes `{messageID,text}` before the callback.
The caller generates/persists the message ID using `createNativeMessageID()`
before a possible dispatch. ID encoding follows the installed native generator:
twelve hex time/counter characters and fourteen random base-62 characters;
session time is complemented and message time is ascending. No global runner
state, provider selection, tool execution or orchestration is introduced.

| Operation | Return / boundary |
| --- | --- |
| create/get | Owned `{outcome?,time:{created,updated,busy?,idle?}}`; outcome alone is not proof that the current turn finished |
| active | `{active:boolean}` for the owned session only |
| messages | At most 100 messages across four native pages; user/assistant text, idle outcome and opaque activity markers only |
| prompt | `{status:'accepted',messageID}` from a validated native user inbox acknowledgement; never an answer or terminal completion |
| interrupt | `cancelled` only after actual interruption, new terminal interrupted state and inactive drain; otherwise `already_terminal` or `unknown` |

Create/prompt await native model discovery as the verified plugin activation
barrier. Create adds native deny-all session permissions; no tool capability is
enabled by this foundation. Message projection discards model reasoning, raw
tool inputs/results, instructions, metadata and provider errors. Internal IDs
and times are for application reconciliation; the public DTO remains the
application boundary's responsibility. Native messages are fetched only from
the verified owned session route; history has no independent browser cursor.

`NativeSessionError` exposes only a fixed code and an outcome of
`not_dispatched` or `unknown`. Once a mutating call may have been sent, timeout,
disconnect, malformed acknowledgement or revoked access stays unknown. The
client never repeats a mutation, deletes a session or automatically dispatches
after reconciliation. Durable operation fencing, exclusive admission, native
process identity, effective permission enforcement, source/citation fencing,
terminal answer correlation and restart reconciliation belong to the caller.
An existing session outcome can describe an earlier run; compare busy/idle
times and the persisted current message receipt before releasing any answer.

Verified source: installed preserved `@opencode/protocol`, `schema` and `client`
2.2.2 under the original Panda-agent spike, plus pinned upstream
[protocol](https://github.com/anomalyco/opencode/blob/f7b4d50940caeb6991d94bfa7ebb66a5542ab0d8/packages/protocol/src/groups/session.ts)
and [session handler](https://github.com/anomalyco/opencode/blob/f7b4d50940caeb6991d94bfa7ebb66a5542ab0d8/packages/server/src/handlers/session.ts).
The native interrupt response is top-level `{interrupted:boolean}`, active is
`{data:{[sessionID]:{type:'running'}}}`, and prompt is a nested user inbox receipt
with `payload.text`, `delivery`, native message/session IDs and created time.
Native history has `{data:[...],cursor:{previous?,next?}}`. Although the installed
declarations describe optional strings, the actual isolated 2.2.2 probe returned
`{data:[],cursor:{previous:null,next:null}}`; runtime evidence takes precedence.
The parser accepts null or omitted terminal cursors, bounded opaque strings for
continuation, and no unknown cursor fields. Fixtures cover both terminal shapes;
the real-shape regression failed before this correction and passes afterward.
See [probe evidence](opencode-session-probe.json).

Verification: `node --test Panda-agent/tests/opencode-session.test.mjs` exercises
receipt forgery, cross-scope/directory ownership, revocation, JSON/deadline/body
bounds, acknowledgement versus completion, unknown dispatch, cancellation and
safe history. These are fixture checks. No real provider prompt, native live
cancellation, browser execution, deployment or customer migration is claimed.
The parent owns the separate disposable provider-free native CRUD probe and
integration acceptance evidence.
