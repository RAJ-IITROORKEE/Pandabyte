# Native OpenCode feature evidence

Date: 2026-11-10. Fresh-context EGM source audit of tagged OpenCode 2.2.5 and 2.2.6, compared with both local code trees. No runtime/model/search call, dependency install or upgrade was performed. The reviewer read its installed Codebase Details persona, implementation-readiness standard, concepts brief and exact selected source. This is a targeted source audit, not an activated feature or full EGM convergence.

| Feature | Native capability | Required application integration |
| --- | --- | --- |
| Sessions/history | Lifecycle, messages, server-created prompt IDs and queued prompt admission | Owned chat-to-session binding, private durable state, restart/reconnect reconciliation and canonical answer persistence |
| Agent/tool loop | Native runner executes tools, records results and continues | Remove only the reviewed fixed-one-tool assumptions; account every allowed continuation and retain uncertain-outcome fences |
| Events | Live shared event connection; tagged versions use a bounded 4096-event subscriber queue and no automatic reconnect | Subscribe before prompt, recover owned state after loss/overflow without resending; sanitize tool/result/source associations |
| Context/compaction | Automatic/manual compaction, recent-context retention and structured summaries | Exact model context/keep/buffer settings, synthetic near-limit checks, every maintenance attempt observed/accounted; summaries are lossy and cannot replace product sources |
| Questions | Native question tool uses the session Form API and can suspend for choices/custom answers | Owned pending-form list/get/reply/cancel, UI and reconnect; legacy question.reply examples are not the tagged contract |
| Planning | Native agent continuation and optional todowrite; coding Plan agent has its own plan-file workspace | Use only planning useful to a read-only research chat; do not build a second application planner or assume coding Plan mode is required |
| MCP/skills | Native MCP registration and reviewed skill loading/invocation | Minimal server-owned allowlist and secret broker; skill text does not grant network/tool access |

Exact-version differences matter. Original AWS source pins a 2.2.5 image; clean local execution pins 2.2.6 and the older observation path pins 2.2.2. No one of these is selected as the future AWS contract by this report. The exact active AWS image/configuration remains unverified. The original N1 packages identify 2.2.5, while the older UI spike identifies 2.2.2; the root app has no official OpenCode client dependency.

2.2.5 todo availability uses experimental.todo; 2.2.6 uses flag resolution with environment/config/build-channel precedence. Compaction behavior changed between tags, including background lead, cached summary age and retained tail. Native title, summary, context-overflow recovery, output continuation and retries can make additional model calls. Agent step count is not a complete charged-call limit. 2.2.6 includes unreachable-network retry behavior extending up to an hour; a retry hook alone is not proof that every maintenance/recovery path is fenced. These must be exercised with a synthetic provider before paid long-session acceptance.

## Primary evidence

- Tagged client manifests: [2.2.5](https://raw.githubusercontent.com/anomalyco/opencode/v2.2.5/packages/client/package.json), [2.2.6](https://raw.githubusercontent.com/anomalyco/opencode/v2.2.6/packages/client/package.json).
- Tagged session implementation: [2.2.5](https://raw.githubusercontent.com/anomalyco/opencode/v2.2.5/packages/core/src/session/session.ts), [2.2.6](https://raw.githubusercontent.com/anomalyco/opencode/v2.2.6/packages/core/src/session/session.ts).
- [2.2.6 generated network client](https://raw.githubusercontent.com/anomalyco/opencode/v2.2.6/packages/client/src/promise/generated/client.ts), [shared events](https://raw.githubusercontent.com/anomalyco/opencode/v2.2.6/packages/client/src/shared-events.ts).
- [2.2.6 runner](https://raw.githubusercontent.com/anomalyco/opencode/v2.2.6/packages/core/src/session/runner/llm.ts), [retry policy](https://raw.githubusercontent.com/anomalyco/opencode/v2.2.6/packages/core/src/model-retry.ts), [title generation](https://raw.githubusercontent.com/anomalyco/opencode/v2.2.6/packages/core/src/session/title.ts).
- Compaction: [2.2.5](https://raw.githubusercontent.com/anomalyco/opencode/v2.2.5/packages/core/src/session/compaction.ts), [2.2.6](https://raw.githubusercontent.com/anomalyco/opencode/v2.2.6/packages/core/src/session/compaction.ts).
- Questions: [2.2.5](https://raw.githubusercontent.com/anomalyco/opencode/v2.2.5/packages/core/src/tool/plugin/question.ts), [2.2.6](https://raw.githubusercontent.com/anomalyco/opencode/v2.2.6/packages/core/src/tool/plugin/question.ts).
- [Plan plugin](https://raw.githubusercontent.com/anomalyco/opencode/v2.2.5/packages/core/src/plugin/plan.ts); todos: [2.2.5](https://raw.githubusercontent.com/anomalyco/opencode/v2.2.5/packages/core/src/tool/plugin/todo.ts), [2.2.6](https://raw.githubusercontent.com/anomalyco/opencode/v2.2.6/packages/core/src/tool/plugin/todo.ts).
- [MCP registration](https://raw.githubusercontent.com/anomalyco/opencode/v2.2.6/packages/core/src/config/plugin/mcp.ts), [skill invocation](https://raw.githubusercontent.com/anomalyco/opencode/v2.2.6/packages/core/src/tool/plugin/skill.ts), [flag resolver](https://raw.githubusercontent.com/anomalyco/opencode/v2.2.6/packages/core/src/flag.ts).

Moving upstream documentation may describe later behavior. Use the selected tagged image/client/schema evidence when drafting the implementation contract; do not silently upgrade the runtime to make a moving example fit.
