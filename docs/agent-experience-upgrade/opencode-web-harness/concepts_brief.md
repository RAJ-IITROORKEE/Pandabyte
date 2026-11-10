# OpenCode web research and native feature adoption

Author: RAJ-IITROORKEE. Date: 2026-11-10. Status: owner-requested scope; discovery and design in progress.

## Owner request

Connect the existing AWS-hosted OpenCode agent harness to Panda Agent. Reuse OpenCode's own execution loop, sessions, context management, compaction, question asking, planning/next steps, tool calling, MCP and skills. Integrate only the features useful to this web chat, one validated sub-phase at a time. Do not create a competing planner, memory engine or tool loop. Models may be selected for the task under the existing privacy/access boundaries. Use Elephant Goldfish practices for artifact-first design, goal/task tracking and fresh-context review.

The first capability is external web research: when existing RAG evidence cannot answer a question, the agent can decide the next research action, call the configured search provider and return a cited answer. The interface must show which tool ran and the sources it used through expandable source/tool details. External sources must remain distinguishable from PandaByte product evidence; manufacturer chip documentation cannot establish an exact board/revision fact.

The owner called the configured search service “Davinci.” Existing repository documentation identifies Tavily. Treat this as a discovery item; do not add a new vendor or claim a Davinci connection without evidence. Reuse the configured service if confirmed.

## Existing successful baseline

The reviewed hosted release from runtime 739e0da is live; source/evidence is on main at 2ef90b9. Main and Control Room use GPT-OSS 20B/Groq directly through OpenRouter. They do not currently prove native OpenCode orchestration. The release passed 472 affected tests and live grounding/input/history/abstention/memory checks. Documents took 679 ms; main context was ready in 773/831 ms; two complete main responses took 4927/7912 ms. Provider/source/history/save timings must remain separate. Hosted owner testing has no cumulative application budget cap. Preserve the original native/local ledger and retained unknown outcomes; model-choice authorization does not authorize resetting them.

## Boundaries and scope changes

The latest request explicitly moves agent orchestration into OpenCode. The separate older `docs/designs/pandabyte-agentic-rag/design_draft.md` in the main local checkout selected application-managed research with native tool denial. Preserve it as historical; this new scope adopts the owner's explicit native-loop direction rather than silently editing that older draft. Its diagram/vision/vector-memory proposals are not added to this first text web-search feature.

Clerk remains the identity authority, InsForge the canonical customer-visible chat/evidence authority and the AWS runtime the native execution host. The browser cannot choose arbitrary native session/workspace/plugin identities or receive provider keys. Preserve source withdrawal/access checks, no automatic charged replay after uncertain outcomes, strict provider privacy and metadata-only observability. Search terms cannot silently include private submissions, account data, secrets or complete private history. Retrieved content is evidence, never instructions granting tools/access. Existing source, accounting and audit records must remain intact.

## Working environment and discovery sources

Work in the clean linked worktree `E:/Web development/PROJECTS-FULL STACK/panda-rag-input-latency`, branch `codex/opencode-web-harness`, starting at main 2ef90b9. The original checkout `E:/Web development/PROJECTS-FULL STACK/Pandabyte` has 33 modified and roughly 470 untracked entries, including substantial older AWS/native integration. Read it for reuse discovery only; do not import, stage, reset or deploy it wholesale.

Relevant original local documentation: `Panda-agent/docs/n45/native-core-adoption-plan.md`, `native-runtime-evidence-20261104.md`, `mini-runtime-integration-status-20261104.md`, `Panda-agent/docs/core-validation/opencode-feature-matrix.md`, `Panda-agent/docs/tavily-native/status.md`, `Panda-agent/docs/tavily-search-contract.md` and the prior agentic-RAG design. Claims there are dated evidence, not current live health or present authorization windows.

## Required validation outcomes

- Establish exact AWS/runtime/image/client versions and reusable source before any activation. Preserve unrelated running work and unknown/pending records.
- Native loop must demonstrably own planning/tool continuation. Do not infer capability from an API listing or pass fixture-only behavior as live success.
- Verify owned-session separation, reconnect without resend, current source validation, explicit unknown outcomes and persisted saved answers.
- Verify local-source-only answers, RAG misses requiring external evidence, unsupported board/revision facts, conflicting sources, search unavailable, unsafe URLs/content and cancellation/disconnect outcomes.
- Show tool identity and actual used sources in expandable UI details. No fabricated citations or claims that a search snippet is a fetched full page.
- Trace each model/tool/maintenance call with safe metadata, latency, usage and cost; measure retrieval separately from web research and full generation. Preserve the sub-two-second target for existing local retrieval, without claiming it for external search.
- Exercise compaction and internal maintenance with a synthetic provider before paid long sessions; native summaries are lossy execution context, not a factual product knowledge database.
- Each sub-phase needs explicit scope, acceptance evidence, an independent review and a stable build before dependent work starts. This draft does not activate or deploy a native feature.

## Task tracking

The active Codex goal tracks this integration. The adjacent `progress.md` records discovery, design approval, exact implementation sub-phases and validation evidence. Detailed architecture/file boundaries follow the EGM drafting gates after discovery; this concepts brief is not an implementation-ready plan.
