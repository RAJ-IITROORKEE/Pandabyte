# Agent Experience Upgrade: runtime capability contract

Status: **audit and proposed contract, 6 November 2026**. This document does not certify a live OpenCode connection or authorize deployment. The [requirements authority](requirements.json) tracks implementation and acceptance. The historical Panda Agent Phase 6 remains **in progress**, Phase 5 is the last full PASS, and its original held-out multi-hop gate is not established; preserve its [handoff](../../Panda-agent/docs/lightweight-harness-handoff.md) and [verification](../../Panda-agent/docs/verification/lightweight-phase6-20261106.json).

## Active and preserved integration

The current customer API mounts `Panda-agent/src/server/lightweight-chat.ts` and `lightweight-handler.ts`: Clerk/InsForge admission, owned chats, durable turn admission, approved scoped retrieval, the private FastAPI worker and finite guide/diagnostic/agentic flows. `retrieval/answers.ts` and `insforge-adapters.ts` constrain product scope, source eligibility and literal citations; the store and migrations fence finalization and replay. The active runtime is identified as `lightweight_fastapi`, not OpenCode. `services/lightweight/README.md` describes an empty model profile and a deterministic MCU path; it is not a general conversational LLM. Current agentic skills and four tools are fixed PandaByte bundles/manifests, with a restricted fixed-document stdio MCP implementation; these are not OpenCode discovery.

The prior OpenCode integration survives on Git branch `codex/panda-agent-lightweight-rag` and in the preserved original checkout `E:/Web development/PROJECTS-FULL STACK/Pandabyte/Panda-agent`. Commit `f5d7419` removed `src/server/opencode-selector.ts` from the replacement path. Its historical selector created nonce-owned temporary native sessions, checked ownership and terminal state, and deleted only after safe completion; it used a fixed model and no tools. It is a reference, not an active integration or a complete implementation of this upgrade. Historical `docs/core-validation/opencode-feature-matrix.md` reports limited genuine session/chat checks, not complete isolation or live token streaming; skills/MCP were disabled or unwired and cancellation of admitted inference was not wired. The current regression `Panda-agent/tests/fresh-harness-handler.test.mjs` asserts no old OpenCode imports: a deliberate transition must update its scope with equivalent protection against unsafe fallback, not silently claim it already passes with the new path.

The master assignment now directs OpenCode to own product execution; it supersedes the earlier instruction prohibiting an OpenCode executor for new work. It does not erase Phase 6 evidence or authorize deployment. The transition must preserve existing user data and behavior, not introduce parallel execution as a permanent fallback or mislabel a past gate as complete.

## Versioned evidence and capability limits

Local `opencode --version` reported **2.1.3**, installed as global `@opencode/cli@2.1.3`. The preserved original spike pins and has installed `@opencode/client`, `@opencode/protocol` and `@opencode/schema` **2.2.2**. Current application `npm ls @opencode-ai/sdk --depth=0` is empty; `@opencode-ai/sdk` is a different package family and is not evidence for this 2.x contract. No service was started or queried in this audit. The 2.1.3 binary must not be assumed compatible with the 2.2.2 declarations; choose a version-aligned runtime/client and verify actual behavior in an isolated authorized environment before use.

The preserved `spikes/opencode-ui/adapter.ts` demonstrates typed `session.create`, `session.prompt`, `session.interrupt`, `session.active`, `message.list` and `event.subscribe` for a trusted local spike. It does not implement customer admission. In its installed 2.2.2 protocol declarations:

| Surface | Declared interface | Status and limit |
| --- | --- | --- |
| Skills | `GET /api/skill` (`groups/skill.d.ts`) returns ID, name, optional description, path and content | Schema evidence only; runtime list, enablement, install and removal are not verified. Do not expose absolute paths or unreviewed instructions blindly. |
| MCP | `GET /api/mcp`, resource catalog, experimental PUT/DELETE server and POST connect/disconnect (`groups/mcp.d.ts`) | Location-scoped declarations, not proof of safe persistence, tool discovery, transport availability or current permissions. Treat returned errors as potentially sensitive. |
| Config | `GET /api/config`; experimental `PATCH /api/experimental/config` (`groups/config.d.ts`) | The declared PATCH body only covers `shell`; it is not a general runtime-configuration API. File-backed changes require a separately verified supported mechanism. |
| Models | `GET /api/model` and `/api/model/default` (`groups/model.d.ts`) | Discovery declaration only; no customer model-selection policy or provider readiness established. |
| Events | `groups/event.d.ts` includes session lifecycle, skill activation, tool and MCP status events | Existence of event types does not prove attribution or delivery. The historical spike resynchronizes after reconnect; do not expose reasoning or unfiltered payloads. |
| Session | Prior selector and typed spike use creation, prompt, active/history and interrupt; events are live-only in the historical integration | Verify chosen version's schemas and real cancel/terminal behavior. Prompt acknowledgement is not an answer or proof of completion. |

The declarations are located under the preserved original `spikes/opencode-ui/node_modules/@opencode/protocol/dist/groups/`; they are not application dependencies or runtime verification. The original `opencode-runtime.md` records the 2.2.2 image and historical provider-free probes, but neither establishes a currently available service. No general skill installer, runtime tool-permission editor, or restart-free change propagation has been demonstrated. Show unsupported/unverified state rather than fabricating controls or statuses.

## Required application boundary

- Recheck Clerk identity and current session at admission and release. Use existing per-request InsForge actor clients and owner checks; never accept a browser-supplied subject, native session ID, runtime URL, filesystem location, source grant, or provider override as authority. Keep native sessions mapped server-side to owned application conversations and request IDs.
- Every Admin read and mutation must independently check real `ADMIN` membership, as the current Control Room does in `src/control-room/clerk.ts`. Validate origin, method, bounded input, version and applicable audit semantics. Playground sessions must be a separate Admin test scope, inaccessible to customers and unable to read or write customer chats or memory. Tool side effects require explicit authorization and confirmation; default deny until execution-layer enforcement is proven.
- The server-owned approved retrieval boundary must be shared by customer and Playground. Give OpenCode only scoped, bounded, current-authority access through a verified supported harness interface. Refresh authorization and eligible source state at retrieval, final release and replay; validate exact citation-to-current-evidence membership. A retrieved or remembered withdrawn source cannot become new evidence. Do not substitute the old broker's syntactically valid capability for its required current authorization and execution receipt.
- Allow only reviewed runtime capabilities and intersect current Admin grants, scoped actor authorization and harness permissions. A UI toggle alone is not enforcement. Keep secret values and credential references server-side; do not forward raw config, private tool arguments, error payloads or internal paths to browsers. Validate actual local executable and process access in the runtime environment, not the administrator's computer.
- Persist admission and dispatch identity before a potentially consequential call. Record a prompt acknowledgement as accepted/pending, not completed. On disconnect, timeout or restart, read authoritative status/history under the same owner and scope; never automatically redispatch an unknown result. Cancellation is confirmed only after the harness reports a terminal interrupt and any owned work has stopped; otherwise retain an explicit unknown/reconciliation state. Existing source-fenced saved history must remain accessible under its current policy.
- Filter events by mapped session and allowlisted types/fields, then recheck ownership and current grants. Do not expose model reasoning, credentials, raw private payloads, or events from other sessions. A dropped live stream triggers authoritative resynchronization, not a retry. Display latency, usage and skill/tool attribution only when actually returned and safely attributable.
- Validate Admin config changes against a versioned allowlist and expected version; identify the target scope and whether restart/reload is required. Store only safe references, audit actor and before/after metadata, and verify effective state before reporting success. A write with uncertain outcome must remain uncertain until readback; rollback must restore the last verified reviewed configuration without resetting sessions or journals.

## Memory and evaluation

No separately supplied Mem0 plan was located by filename in Downloads or the original repository, or by text search in their relevant Markdown documents; the master prompt refers to it but does not supply its data-flow. Do not add Mem0 processing until the plan and its isolation/retention/withdrawal contract are available. Existing `Panda-agent/docs/lightweight-phase4-contract.md` defines owner/thread-scoped, versioned structured project intent, not factual source grants; preserve it and refresh evidence. Development task memory stays separate from customer and test memory.

The existing Control Room records private intake and rights review; `control-room/handlers.ts` returns `runtime_unavailable` for evaluation, and its UI explicitly disables evaluation. `Panda-agent/scripts/phase6-eval.mjs` is a separate bounded evaluation, not an Admin execution endpoint. Source ingestion/publication, runtime retrieval testing, live evaluations and shared configuration propagation remain implementation work, not already supported operations.

## First integration increment and gates

Start with offline contract tests against a version-aligned native client fixture, using the existing retrieval and chat boundaries. Cover owned session mapping, per-request Admin/customer admission, strict input and event projection, current-source revalidation, revoked grants, isolated test scope, prompt acknowledgement versus terminal result, lost stream/status-only recovery, and cancellation/unknown outcomes. Prove the fixture exercises actual 2.2.2 shapes and distinguish it from live behavior. Then implement the smallest server-side authenticated translation to verified OpenCode APIs; OpenCode owns execution, MCP and tool invocation. The adapter must not add an agent loop, independent MCP client, or duplicate RAG engine. A live provider, supported extension management, general conversational quality and cross-user isolation remain separate explicit acceptance checks.

## Isolated native 2.2.2 read-only probe

On 6 November, `scripts/opencode-contract-probe.mjs` started the pinned local 2.2.2 executable in a disposable Windows workspace with isolated USERPROFILE/XDG/temp directories, a minimal child environment, the reviewed deny configuration and a generated in-memory password. The responding PID matched the spawned child. Authenticated info returned 200/version 2.2.2; anonymous info returned 401. Config returned three entries (two documents and one directory), with the reviewed deny fields matching and their paths lexically inside the fixture. MCP and model discovery returned empty arrays. The child stopped and its fixture was removed; see [sanitized evidence](opencode-probe.json).

Skill discovery returned **OpenCode** and **Report**. Their names and virtual path labels match the [pinned upstream skill plugin](https://github.com/anomalyco/opencode/blob/f7b4d50940caeb6991d94bfa7ebb66a5542ab0d8/packages/core/src/plugin/skill.ts); the [API handler](https://github.com/anomalyco/opencode/blob/f7b4d50940caeb6991d94bfa7ebb66a5542ab0d8/packages/server/src/handlers/skill.ts) lists that service. An initial lexical classification called these labels outside the fixture; the source comparison resolved them as builtin labels, not evidence of reading external files. Empty configured skills do not mean no builtins. The probe records comparison booleans without storing paths or instructions.

The first raw skills read could return those two builtins before policy activation,
then return zero after model discovery. This was reproduced without the application
adapter, ruling out its headers as the cause. The pinned native
[model handler](https://github.com/anomalyco/opencode/blob/f7b4d50940caeb6991d94bfa7ebb66a5542ab0d8/packages/server/src/handlers/model.ts)
waits for plugin activation, while skill listing does not. The late
[policy plugin](https://github.com/anomalyco/opencode/blob/f7b4d50940caeb6991d94bfa7ebb66a5542ab0d8/packages/core/src/config/plugin/policy.ts)
removes integrations denied by the reviewed configuration. The adapter now reads
info, models, skills and MCP in that order. Its regression covers early builtin
visibility and later policy removal. Repeating the isolated native probe through
the actual adapter returned zero for all three catalogs, matching direct reads
after the native activation barrier. This is a discovery snapshot, not a
transactional configuration or execution authorization receipt.

The official npm `@opencode/cli-windows-x64@2.2.2` archive was downloaded into ignored `tmp/opencode-2.2.2-review` without install scripts or global changes. Its SHA-512 integrity matched registry metadata:
`sha512-tFS9vYp0/+VOeYpcWvAy1e2iMEx6x5/XagVpwtjG33ocvumn5R2qaKGhqhI56Wu8Hfet+VYaw8nwbx9BqxJCqQ==`.
The archive is 119,436,377 bytes and the extracted binary 254,943,112 bytes. Registry metadata declares MIT; this fixture is not a redistributed application dependency. The original global CLI stays 2.1.3.

No prompt, tool invocation, external MCP or provider request was made by the probe. These checks prove neither behavioral permission enforcement, comprehensive discovery isolation, egress restriction, customer admission nor provider readiness. No application execution cutover or deployment occurred.

## Integrated read-only Admin adapter

`GET /api/admin/panda-agent/runtime` reuses the real Control Room Clerk/ADMIN
admission before discovery and again before releasing data. It accepts no routing
or configuration fields from the browser. The client fixes the native version,
requires a literal server-configured loopback origin and opaque server password,
uses a total deadline and bounded JSON bodies, and follows no redirects. Responses
are private/no-store and contain only counts and explicit discovery-only status;
raw configuration, instructions, paths and provider errors are excluded.

The environment example leaves `PANDA_AGENT_OPENCODE_INSPECTION_ENABLED=false`.
The server-only URL/password settings are separate from existing worker credentials.
Enabling this read-only endpoint does not switch customer execution or enable
installation, configuration mutation or tool calls. Its fixture tests exercise
admission/revocation, malformed requests, payload projection, version mismatch,
limits, abort/deadline behavior and the native activation order. The provider-free
probe exercises the actual client with the isolated native service. A signed-in
browser success against the mounted route has not been established: the existing
localhost:3001 application is retained, and the attempted separate development
server correctly refused the occupied port. No live runtime configuration was changed.
