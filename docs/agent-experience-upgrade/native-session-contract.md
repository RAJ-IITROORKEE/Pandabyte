# Native session translation foundation

6 November 2026. This is the private server-side OpenCode 2.2.2 HTTP translation,
not a customer execution cutover or an execution-policy certification.

`Panda-agent/src/opencode/session-client.ts` exports
`createNativeSessionClient({baseUrl,password,directory,expectedPid,fetch?,timeoutMs?})`.
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

The methods are `create`, `get`, `messages`, `active`, `prompt`, `interrupt`,
`remove` and `absence`, all taking the persisted receipt, admission callback and optional
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
| remove | Owned inactive session only; refuses any child because native deletion cascades; requires DELETE 204 and exact typed 404 absence before `removed` |
| absence | Observation only after uncertain removal; exact typed 404 for the persisted session on the pinned process, never another DELETE |

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
client never repeats a mutation or automatically dispatches after reconciliation.
Every operation checks the configured positive OS PID and version before work and
before release. PID is not a durable boot identity; runtime generation/dedicated
secret binding remains the caller's responsibility. Durable operation fencing,
exclusive admission, effective permission enforcement, source/citation fencing,
terminal answer correlation and restart reconciliation belong to the caller.
An existing session outcome can describe an earlier run; compare busy/idle
times and the persisted current message receipt before releasing any answer.

Removal's admission callback MUST verify a durable terminal journal and exclusion
of all future prompt claims on every invocation. An unstarted session (no native
busy time) may be removed only if that callback also proves no prompt claim was
ever consumed; native inactivity by itself does not establish that fact. A
previously active session must have terminal native times/outcome. Reconciliation
uses `absence` only for an already recorded uncertain removal on the same runtime
generation, never to infer that an unknown create or prompt did not execute.
The durable journal cannot be marked retired from an acknowledgement alone.

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

The actual provider-free probe now additionally verifies empty child discovery,
owned inactive removal, typed absence and PID checks against its spawned child.
It has no possible prompt claim or model call. Unit fixtures cover five cleanup
groups, including active/child/ownership/access denial, changed process identity,
lost acknowledgement with observation-only recovery and missing absence proof.
Independent Sol review found no actionable leaf defect under the documented
durable cleanup fence; that future mounted caller remains unverified.

Verification: `node --test Panda-agent/tests/opencode-session.test.mjs` exercises
receipt forgery, cross-scope/directory ownership, revocation, JSON/deadline/body
bounds, acknowledgement versus completion, unknown dispatch, cancellation and
safe history. These are fixture checks. No real provider prompt, native live
cancellation, browser execution, deployment or customer migration is claimed.
The parent owns the separate disposable provider-free native CRUD probe and
integration acceptance evidence.

## One-prompt terminal correlation and retry policy

`opencode/turn-result.ts` correlates a private native history with the durable
message ID and SHA-256 of the exact prepared prompt. The first increment admits
one user prompt and one assistant output per session, with tools denied. Active
or non-terminal work remains pending. Wrong/multiple users, a changed prompt,
repeated/invalid message IDs, incomplete/retrying/failed success output, extra
assistant output or inconsistent terminal history remain unknown. Failure and
interruption return only a fixed terminal outcome, never partial provider text.

Pinned 2.2.2 starts a busy period before promoting the inbox user. The accepted
ordering is session-created <= busy <= expected-user-created <= assistant-created
<= assistant-completed <= terminal-idle-message, and completed <= session-idle.
A later busy period cannot settle the earlier prompt. The final idle outcome must
match the inactive session outcome. This is private correlation, not public answer
validation: the caller still parses bounded JSON, invokes prepared-evidence
finalization, rechecks current admission/source grants and persists before release.
The helper is assembled behind the inference-disabled native bridge.

The isolated 2.2.2 wire probe now drives `createNativeTurn` and
`prepareEvidenceContext` together against the actual native HTTP session client.
The `turn_success` case prepares a synthetic listing, correlates native JSON,
revalidates its scope and releases one exact literal citation. The `turn_429`
case settles the native failure with the fixed unavailable answer. Both cases
exercise versioned synthetic journal claims and repeat start/status without
another prompt. Each creates and removes one owned native session. This verifies
the native adapter pipeline using synthetic ownership and storage. Mounted Clerk,
SQL and real provider answer acceptance remains open.

The dependency-free `runtime/opencode/plugins/no-retry.ts` uses the supported
session `retry` hook to set `event.decision = {retry:false}`. The prior provider
`settings.maxRetries:0` did not control OpenCode's native retry loop. Loading the
hook requires an exact local plugin-directory integration grant in a dedicated
instance; the mock fixture verifies that plugin is active before prompting.
No global plugin/configuration or deployed runtime was changed.

Pinned source references:
[retry hook](https://github.com/anomalyco/opencode/blob/f7b4d50940caeb6991d94bfa7ebb66a5542ab0d8/packages/plugin/src/README.md),
[retry decision](https://github.com/anomalyco/opencode/blob/f7b4d50940caeb6991d94bfa7ebb66a5542ab0d8/packages/core/src/session/runner/retry.ts),
[busy-before-inbox sequence](https://github.com/anomalyco/opencode/blob/f7b4d50940caeb6991d94bfa7ebb66a5542ab0d8/packages/core/src/session/run-coordinator.ts),
and [inbox promotion](https://github.com/anomalyco/opencode/blob/f7b4d50940caeb6991d94bfa7ebb66a5542ab0d8/packages/core/src/session/runner/llm.ts).
The hook is not evidence for the separate `session/generate.ts` retry path or
`runner/step.ts` transport retry-full recovery. Those paths remain outside this
HTTP single-prompt acceptance scope. See `opencode-provider-wire-probe.json` for
the actual mock observations and the retained failing baseline. Account-specific
strict ZDR, all required fee fields, quota and live output/cost gates stay open.

## Cancellation and native context cleanup

`server/native-lifecycle.ts` adds private cancel/status/cleanup translation using
the same journal, native client, current owner and runtime-generation callbacks.
A fresh cancellation CAS winner may interrupt once; duplicate or uncertain calls
only observe. An owned inactive unstarted session can settle cancellation without
a prompt. A missing session cannot settle an unknown create that could arrive late.
Only correlated interrupted work with the durable flag becomes cancelled; another
terminal outcome uses the exact SQL unavailable answer. Native/provider text is
never released by this interface.

Cleanup requires durable completion, current ownership/generation, inactive native
context and one removal claim. A consumed claim authorizes absence observation only,
never a second DELETE. Retirement follows typed absence and a fresh journal check.
Revoked evidence or disabled new dispatch does not prevent owned cancellation and
cleanup. Changed ownership or runtime generation still fails closed.

Seventeen fixtures cover races, unknown acknowledgements, forged identity, source
withdrawal and cleanup fences. The actual isolated 2.2.2 probe also cancels an owned
unstarted session and removes it once, observes typed absence and repeats cleanup
without another DELETE: one create, zero prompts, zero interrupts, one DELETE in
this lifecycle case. Its synthetic file journal/current callback is not Clerk or
database acceptance. Child and fixture were removed.

The loopback wire probe also exercises the application lifecycle adapter against
an active OpenCode 2.2.2 session with a synthetic versioned journal. After one
partial chunk, cancellation closes the connection and correlates the interrupted
turn. The journal saves the fixed cancellation answer. Repeated cancellation and
cleanup leave the total at one prompt, one interrupt and one deletion. See
`opencode-provider-wire-probe.json`, case `cancel`.

Mounted gates still cover active cancellation through Clerk and SQL, late prompts
after early or lost interrupt acknowledgements, and recovery after a consumed
removal claim without confirmed deletion.

## Mounted admission boundary

The route assembly now uses native-owner and native-runtime admission. Owner
receipt checks call current Clerk -> actor/thread/request-authorized journal state
-> current Clerk and compare exact durable receipt + keyed thread/subject binding.
They do not repeat full history reads. Lifecycle access callbacks no longer repeat
the same owned/latest checks. The session client used for observation has a10s
operation deadline; cleanup batching has a20s request deadline. Full real Clerk +
active native latency is not certified by the smaller fixture checks.

Runtime binding is a server-HMAC over the supervisor's fresh generation, PID,
canonical directory,2.2.2, config hash, password hash and loopback origin. Authenticated
info and the owner-private descriptor are checked again before operations. Windows
ACL ownership/allowed trustees/nullDACL and POSIX owner/mode checks fail closed.
The descriptor must come from an owned isolated supervisor with fresh secret/state
per boot; the application does not start or resume a process from a descriptor.
No persistent descriptor is configured. Dispatch and returned create/prompt always
deny in source; neither this binding nor public provider metadata proves strict ZDR.
Actual disposable2.2.2 descriptor/lifecycle/rotation checks pass in the probe report.
