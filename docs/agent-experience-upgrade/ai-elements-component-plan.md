# AI Elements component mapping for Panda Agent

10 November 2026. Plan-only supplement to the [MVP design](no-rag-harness-design.md)
and [implementation plan](../superpowers/plans/2026-11-10-no-rag-opencode-harness.md).
All21 individual patterns in the supplied shadcn catalog were reviewed using
official documentation, split across root and two read-only subagents. Codex
Browser also inspected the introduction, Tool example, Radix variant and source
composition. No components, skills or dependencies were installed.

## Current documentation and skills

The [supplied page](https://ui.shadcn.com/docs/ai-elements) describes copied shadcn
compositions. Existing copied wrappers can remain; adopting the patterns does not
require replacing their public APIs. The [older AI Elements site](https://elements.ai-sdk.dev/)
announces migration and deprecation at the end of November2026. Use current shadcn
documentation for new work rather than automatically installing the older registry.

The installed `ai-elements` skill was read. Its local references cover the older
registry and AI SDK examples; current official docs supersede that historical
installation guidance. An official [shadcn skill](https://ui.shadcn.com/docs/skills)
was found in documentation, but not in the inspected local skill roots; it was not
installed. It can be selectively vetted during implementation. These development
skills must not be copied into the customer OpenCode runtime catalog.

## Integration rule

**assistant-ui ExternalStoreRuntime stays the only chat-state owner.** OpenCode
owns execution; Next.js owns authorization, projection and persistence. AI Elements
provides views driven by validated native parts. No second `useChat`, message
store, scripted demo transport, AI Gateway account or autonomous execution loop.

Examples offer Base UI, React Aria and Radix variants. Prefer a compatible Radix
variant after reviewing existing primitives/dependencies. No root `components.json`
was found. Check aliases and actual local components before any initialization;
generators must not overwrite theme, logo, global CSS or authentication layouts.
Pin selected source and retain upstream notices rather than installing everything.

## Full pattern inventory

Each linked individual page was reviewed. Decisions below are proposals, not a
claim that components or their backend capabilities already work here.

| Pattern | Documented composition | MVP use and execution gate |
| --- | --- | --- |
| [Chat](https://ui.shadcn.com/docs/ai-elements/base/chat) | Message Scroller, Message, Bubble, Input Group | **Use presentation.** Retain one assistant-ui viewport/scroll owner, stable IDs and live-edge behavior; no nested competing auto-scroll providers. |
| [Message](https://ui.shadcn.com/docs/ai-elements/base/message) | Message, Bubble, Tooltip | **Use.** User bubble, assistant Markdown, copy/read-aloud and saved status. Preserve safe Markdown/URL rendering; retry/edit require a real server lifecycle. |
| [Prompt Input](https://ui.shadcn.com/docs/ai-elements/base/prompt-input) | Input Group; optional Attachment/Dropdown Menu | **Use.** Compose around existing input/Stop/draft/dictation state. Preserve Enter/Shift+Enter and IME; attachments and model controls remain capability-gated. |
| [Chain of Thought](https://ui.shadcn.com/docs/ai-elements/base/chain-of-thought) | Trace, nested collapsibles, Code Block, Badge | **Adapt as public Activity.** Only observed actions/results and concise status; never request or reveal private reasoning. |
| [Task](https://ui.shadcn.com/docs/ai-elements/base/task) | Trace and collapsible tasks | **Use.** Emergent native steps with real running/error/finished state; retain cancelled/unknown states and avoid fabricated percentages. |
| [Tool](https://ui.shadcn.com/docs/ai-elements/base/tool) | Trace, Code Block | **Use.** Named MCP invocation with bounded sanitized input/output. The primitive does not interpret OpenCode events; explicit adapter required. |
| [Subagent](https://ui.shadcn.com/docs/ai-elements/base/subagent) | Trace, nested Trace, Code Block, Badge | **Use after child-execution gate.** Task, approved model, observed tools and result summary. Preliminary results are not complete; native IDs remain private. |
| [Plan](https://ui.shadcn.com/docs/ai-elements/base/plan) | Trace/collapsible | **Use.** Known-ahead project plan or actual execution plan. Advice for the user is distinct from executed agent work; stable server step IDs drive progress. |
| [Confirmation](https://ui.shadcn.com/docs/ai-elements/base/confirmation) | Item, Button | **Conditional.** Actual pending permission outside the activity trace; exact action/target/expiry, approve once/reject and stale/unknown states. Cannot enable a forbidden write. |
| [Context](https://ui.shadcn.com/docs/ai-elements/base/context) | Hover Card, Progress, trigger Button | **Conditional advanced view.** Trustworthy token/window data; unknown is not0%. Separate context, project memory and dollar allowance; keyboard/touch access. |
| [Model Selector](https://ui.shadcn.com/docs/ai-elements/base/model-selector) | Dropdown Menu, Input Group | **Effective-model label first.** Interactive choices require server eligibility and per-run pinning. Omit effort controls while reasoning is off; no silent fallback. |
| [Suggestion](https://ui.shadcn.com/docs/ai-elements/base/suggestion) | Button | **Use.** Embedded explanation, plan and BOM starters through normal composer/admission. Disabled while pending; no duplicate submission. |
| [Queue](https://ui.shadcn.com/docs/ai-elements/base/queue) | Trace with To do/Completed sections | Native todo projection remains deferred. The owner's later explicit follow-up separately authorizes a three-item page-local prompt queue with serial admission and pause/reconciliation guards; do not describe it as native durable inbox recovery. |
| [Checkpoint](https://ui.shadcn.com/docs/ai-elements/base/checkpoint) | Marker, Button | **Display-only or defer.** Restore needs an owned fork/revision contract. Never truncate retained history, reset allowance or imply external effects were reversed. |
| [Reasoning](https://ui.shadcn.com/docs/ai-elements/base/reasoning) | Trace/collapsible | **Exclude.** Provider reasoning remains disabled. Use public Activity/Task without private thought text or invented thinking duration. |
| [Inline Citation](https://ui.shadcn.com/docs/ai-elements/base/inline-citation) | Hover Card, focusable Button | **Conditional.** Actual validated references from an approved docs tool; no citations inferred from prose or automatic RAG integration. Preserve legacy saved citations. |
| [Sources](https://ui.shadcn.com/docs/ai-elements/base/sources) | Trace/collapsible | **Conditional.** Observed tool provenance, validated/deduplicated URLs and correct count. Hidden for ungrounded general answers. |
| [File Tree](https://ui.shadcn.com/docs/ai-elements/base/file-tree) | Collapsible, Button | **Defer.** Filesystem edits are outside MVP. BOM artifacts are tables, not fabricated changed-file trees. |
| [Stack Trace](https://ui.shadcn.com/docs/ai-elements/base/stack-trace) | Trace, Code Block | **Defer raw traces.** Show sanitized tool failure and safe reference, without server paths, credentials or raw exception frames. |
| [Terminal](https://ui.shadcn.com/docs/ai-elements/base/terminal) | Trace, Code Block | **Defer.** No shell execution in MVP. A code example is not executed command output. |
| [Test Results](https://ui.shadcn.com/docs/ai-elements/base/test-results) | Trace, Code Block | **Defer.** No software/hardware runner. Deterministic BOM validation is a Tool result, not a fabricated test suite. |

Documentation examples of destructive commands, broad model choices and automatic
continuation do not authorize these behaviors in this product. “Chain of Thought”
and “Reasoning” are pattern names, not permission to expose private model reasoning.

## Supporting compositions

- **BOM/plan artifact:** Card + Table + Tabs/Collapsible + Button/Tooltip with
  typed quantities, assumptions and optional JSON/Code Block. Current guidance
  provides no standalone replacement `artifact.tsx`; build this small view.
- **Schema detail:** Collapsible + Badge + Code Block over validated data;
  displaying JSON is not schema validation.
- **Code examples:** preserve escaping, safe links, bounded rendering/copy and
  contained horizontal scrolling. Do not replace working Markdown unnecessarily.
- **Clarifying input:** assess Questionnaire after native question/form contracts
  pass; ordinary conversational clarification remains available.
- **Shimmer:** reuse existing reduced-motion-aware wrapper and Apache-2.0 notice.
- **Mobile:** accessible session/artifact drawers. No workflow canvas, arbitrary
  JSX execution, web-preview iframe or voice-platform migration in MVP.

## Event and state adapter

Proposed parts: `run_status`, `task_status`, `tool_status`, `approval_required`,
`approval_resolved`, `artifact_ready`, `answer_saved`, `error`. Use opaque app
correlation and monotonic sequence, bounded schemas and current owner/run checks.
Never forward raw location-wide native events. Reconcile durable state after
disconnect instead of posting another prompt.

Tool states include pending/running/awaiting approval/denied/succeeded/failed/
cancelled/unknown. A stream ending does not prove a native tool completed or failed.
Children may finish before the parent; “Answer saved” requires owned persistence.
Approval binds action fingerprint, policy and expiry and maps to one native reply;
no persistent project-wide `always` grant from customer UI.

## Design and acceptance sequence

1. Generate the real reviewed Superdesign draft using these selected patterns,
   covering desktop/mobile, light/dark, tasks/tools/children, confirmations,
   BOM/plan artifacts, memory and privacy/budget/connection failures.
2. Obtain approval of the actual draft before substantive UI replacement; existing
   old screen approvals do not silently cover this expanded refactor.
3. Audit/pin the smallest primitive sources/dependencies, theme/API compatibility,
   notices and lockfile diff. No bulk registry install or template overwrite.
4. Adapt presentation to assistant-ui parts with one composer, scroll owner and
   message store; retain original cancel/recovery and legacy history rendering.
5. Verify reducers against real native states, then use Codex Browser for keyboard/
   focus,320px layout, long BOMs, errors/denials/expired approvals, child activity,
   interrupted stream/reload, saved artifacts, themes and status announcements.

No token-by-token screen-reader spam or focus stealing; Stop/approval reachable
with mobile keyboard open; no duplicate dispatch after Retry/reconnect. RAG and
LangSmith stay separate. This changes the plan only, not the live UI.
