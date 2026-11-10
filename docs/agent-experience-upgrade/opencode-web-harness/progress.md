# OpenCode web harness progress

Date: 2026-11-10. Branch: codex/opencode-web-harness. Starting source: 2ef90b9.

Execution state: **Resumed by owner, 10 November 2026.** The owner explicitly approved Overview & Goals and instructed: proceed with the technical plan, then implement OpenCode features step by step using Tavily and Goldfish reviews, testing each sub-phase before advancing. Complete the technical/file-level plan and independent reviews, then leave the design-only workflow for the authorized implementation. No repeated overview approval is required. The integration objective remains unchanged; the prior blocked state and all discovery evidence are retained in Git history once this checkpoint is committed.

| Step | State | Required result |
| --- | --- | --- |
| 0. Existing-runtime and source inventory | Discovery complete; exact custom image selected and binary 2.2.5 verified | Three completed fresh-context audits; Tavily source/configuration names found; AWS running/SSM online; three successful bounded read-only SSM probes identify the custom ARM64 gateway image/configuration and cached upstream images. Version-only probes verify exact native 2.2.5; execution/API acceptance remains B. See [receipt](aws-inventory.json). |
| 1. EGM overview and goals | Owner approved | [Draft](design_draft.md) linked to current scope and reviewed discovery; explicit approval received |
| 2. Technical plan, alternatives and file-level implementation order | A passed; B technical contract in preparation | Readiness and source Goldfish findings resolved; 133 tests passed, four existing opt-in skips, typecheck/lint and production build passed. See [A review](phase-a-review.md) and [verification](phase-a-verification.json). [B technical plan](phase-b-plan.md) is being frozen before its source edits. |
| 3. First native web-research slice | Not started | OpenCode-owned tool loop with actual configured search, honest source/tool display, final citation/access/receipt validation |
| 4. Minimal native context/session and question/planning adoption | Pending ordered design | Reuse native APIs; isolate users/chats; avoid duplicate history/planners; account compaction and maintenance |
| 5. Reviewed MCP/skill exposure and regression validation | Pending ordered design | Minimal useful read-only capabilities, observable calls, replay/isolation/error cases and measured latency |
| 6. Hosted activation, live Admin/browser acceptance and publication | Not started | Test each accepted sub-phase before advancing; preserve working RAG/direct baseline |

The rows above are requested outcomes, not a decided implementation dependency order. The design must order durable-session, tool-protocol, web-search and presentation prerequisites from the actual existing code. No live native/search call, runtime configuration change or deployment has been performed for this new task. The AWS SSM inventory created only its management-command record and read container/service state; it did not restart or activate anything. The working hosted RAG remains unchanged.

