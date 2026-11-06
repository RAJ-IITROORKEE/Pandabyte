# Pandabyte — Master Codex Implementation Prompt

You are the lead implementation agent working in the EXISTING Pandabyte repository and ongoing Codex project session. Panda Agent is part of this existing e-commerce and agentic application. Continue from the true current state; do not restart the project or discard prior implementation evidence.

Execute this complete assignment in two phases:

- **Phase 0: development environment, targeted repository refactoring, skills installation, persistent development memory, model routing, and workflow optimization.**
- **Phase 1: implement the complete Panda Agent conversational UI, RAG integration, Admin Agent Skills/MCP/Tools management, memory integration, and Admin Playground specification included below, step by step.**

This is an implementation assignment, not a request for advice. Audit, implement, validate, integrate, and hand off. Use bounded subagents where useful. Continue through authorized work without asking for permission for routine reversible actions.

## Contract, scope, and precedence

The **Original Product Specification** at the end of this prompt is an integral, mandatory part of this assignment. It is reproduced in full so no product requirement, security constraint, test requirement, or acceptance criterion is lost. Do not treat it as optional background or require a second prompt to activate it.

This master prompt controls sequencing and development practices. The original specification controls product behavior and acceptance. Its historical Phases A–G map to Phase 1 steps below; its references to the existing project's Phase 6 refer to the prior project checkpoint. Do not rename or overwrite historical Phase 6 evidence. Use a distinct milestone such as `Agent Experience Upgrade / P0` and `P1.x` if necessary.

If a detail is repeated, implement it once. If a real conflict remains, identify the exact conflict and continue unaffected work. Do not silently narrow scope, omit requirements, invent missing APIs, or label unsupported behavior as complete.

The design review requested in the original specification remains a gate: prepare reviewable desktop/mobile light/dark proposals BEFORE replacing the production customer UI. If equivalent explicit approval already exists, reuse it. Otherwise present the concrete proposal and obtain the design decision. Continue independent authorized backend, tooling, or test work while waiting; elapsed time is not approval.

## Non-negotiable boundaries

1. **OpenCode owns product agent execution and supported orchestration, skills discovery/loading, MCP connectivity/discovery, tool execution, permissions, model integration, and lifecycle.** Verify the installed integration and its real APIs.
2. **Existing Pandabyte services own authentication, authorization, approved RAG knowledge, application rules, customer persistence, memory isolation, and auditing.** Reuse Next.js, Clerk, InsForge, FastAPI, and other existing components where applicable.
3. **Admin owns configuration interfaces, visibility, and testing.** Use the smallest supported adapter; never turn it into another agent engine.
4. Do not build a second agent runner, skills engine, MCP client/gateway, tool executor, model orchestration framework, RAG engine, or separate Playground execution backend.
5. **Development memory and development skills are separate from product/customer memory and runtime skills.** Installing a Codex skill must not automatically expose it to customers or the Admin runtime. Keep separate allowlists, configuration, storage, and permissions.
6. Preserve working authentication, ownership protections, RAG restrictions, sessions, streaming, cancellation, recovery, persistence, Admin functions, and existing e-commerce behavior.
7. “Full refactoring” means completing the behavior-preserving refactoring justified by this assignment: remove verified duplication, clarify ownership, simplify context, and prepare reuse. It does not authorize a speculative rewrite, broad framework migration, or unrelated dependency upgrades.
8. Preserve unrelated changes and active work. Do not reset, clean, force-checkout, overwrite, or stash another worker's changes. Inspect concurrent activity before editing shared configuration.
9. No deployment, publishing, pushing, merging, production-data cleanup, or destructive database migration without the applicable explicit authorization. Use development/test services and isolated records for validation.
10. Development tooling should use local capabilities and existing signed-in access. Do not introduce paid services, new hosted inference requirements, credential extraction, or external uploads. This does not prohibit the product's already authorized real LLM provider and existing services required by the original specification.

## Execution discipline for both phases

### Parent agent and worker ownership

You are explicitly authorized to delegate independent audit, implementation, and review tasks to subagents. Use native Codex delegation if available. Normally keep two or three workers active, bounded by actual client limits and task independence. Do not manufacture parallelism for trivial or dependent work.

The parent owns requirement coverage, architecture, integration, shared interfaces, acceptance, and the current handoff. Assign non-overlapping file ownership; use isolated worktrees when useful and supported. Agree shared contracts before workers edit clients and servers independently. Protect database migrations, shared lockfiles, routing, and common configuration from concurrent edits.

Each worker receives a bounded task packet: objective, requirement IDs, source paths, relevant decisions, dependency status, allowed edits, acceptance criteria, verification commands, and return format. Prefer fresh/minimal context where supported. Workers return concise findings, changed paths, checks, evidence, unresolved issues, and exact next action—not raw logs or full transcript copies.

### Model and reasoning routing

Discover available models and supported reasoning settings from the installed client; verify model IDs rather than assuming labels are valid. Prefer native model selection over an additional routing framework.

| Role | Initial preference, when available | Scope and escalation |
| --- | --- | --- |
| Explorer / context retriever | GPT-6 Luna | Read-heavy repository/document discovery; escalate ambiguous evidence |
| Scoped implementer | GPT-6 Luna or suitable GPT-6.1 Terra | Clear, small changes; escalate expanding scope or unexplained failures |
| UI / visual checker | GPT-6.1 Terra | Screenshots, responsive inspection, scoped frontend work |
| Integration implementer / debugger | GPT-6.1 Sol | Multi-file changes, contracts, integration, difficult debugging |
| Architect / high-risk reviewer | GPT-6.1 Sol or GPT-6 Astra | Ambiguous design, orchestration boundaries, authorization, isolation, complex reviews |

Use task-appropriate supported reasoning. Do not use maximum reasoning for everything or assume a model is cheaper solely because it is listed here. Benchmark suitability where practical. Make actual model overrides through supported mechanisms; descriptive instructions alone do not establish routing. Verify execution metadata where accessible. Report unavailable models and explicit fallbacks; do not silently claim cheaper routing when all workers inherit the parent.

After one meaningful unsuccessful attempt on an unclear issue, reassess context and task scope before repeatedly spending on the same worker. Escalate risk or ambiguity promptly; avoid endless cheap-agent retries or review loops. Keep security-sensitive acceptance with a capable reviewer. Delegation is intended to improve total outcomes, not maximize agent count.

### Durable progress and compact context

Use one authoritative task store, one current handoff, and stable architecture/decision documents. Record task status, ownership, dependencies, acceptance, and evidence. Scope work so the next session can continue without reconstructing the whole conversation.

At each stage boundary, update the same compact handoff with what changed, reused functionality, actual checks, remaining issues, current task IDs, and next action. Before compaction or context exhaustion, checkpoint pending worker outputs and unresolved decisions. A context reset is not completion or permission to restart.

Use targeted search and progressive retrieval. Do not mandate reading every document before every edit. Treat retrieved notes as potentially stale; verify against current code, tests, configuration, and approved decisions. Separate confirmed facts from hypotheses. Keep raw logs and generated indexes outside routine prompt context and outside Git where appropriate.

## Phase 0 — Refactor, install, and optimize development foundations

### P0.1 — Establish the true baseline and preserve ongoing work

Inspect repository identity, branch/worktree, Git status, applicable instructions, current handoff, active sessions, package managers, stack, and existing verification commands. First report the actual historical Phase 6 status. Complete already authorized outstanding Phase 6 work when feasible; otherwise checkpoint it accurately and identify dependencies. Never declare it finished from an old summary alone.

Inspect existing Panda Agent frontend/backend, Admin RAG controls and evaluations, OpenCode integration, session lifecycle, skills/MCP/tools/configuration, and the separately provided Mem0 plan. Locate that plan in the authorized repository/session context. If absent, record the specific missing dependency, preserve current memory behavior, and continue independent work rather than inventing a Mem0 design.

Inventory Codex version, native memories, custom agents, installed skills/plugins/MCPs, model access, and configuration scope. Identify equivalent development memory/task/retrieval tools before adding anything. Record baseline failures and distinguish them from regressions.

Create a compact requirement coverage matrix in the existing task/planning mechanism. Cover every section and acceptance criterion of the Original Product Specification plus Phase 0. Each row or task needs: requirement, existing implementation evidence, planned change/reuse, dependency, owner, verification, and status. A prose “done” summary is insufficient to establish coverage.

### P0.2 — Verify native Codex support and configure specialists

Use the installed client's help and current official documentation. References to verify, not assumed configuration schemas:
- https://learn.chatgpt.com/docs/agent-configuration/subagents
- https://learn.chatgpt.com/docs/customization/memories
- https://learn.chatgpt.com/docs/config-file/config-reference
- https://learn.chatgpt.com/docs/build-skills

Configure native specialist agents, actual model overrides, supported reasoning settings, and modest concurrency. Prefer project-scoped configuration; document unavoidable user-level changes and rollback. Preserve existing settings, instructions, and hooks. Do not bypass host permissions or organization restrictions.

Enable native local Codex memory if supported and appropriate. Check whether settings are recognized and whether a restart is needed. Account for background generation delay and usage. Keep mandatory rules and shared project state in repository-owned sources; native recall is a supplement. Do not force-restart this ongoing session just to activate a feature. Mark installed, recognized, active, verified, and pending-restart states separately.

If Claude is installed, preserve compatibility with the shared development task/document sources; configure only necessary adapters. Native Claude memory is not automatically shared Codex memory. Do not claim multi-client validation unless actually tested.

### P0.3 — Establish persistent development task memory

Evaluate Beads: https://github.com/gastownhall/beads

Use it if no existing equivalent meets the need. Verify its current license, stable version, dependencies/storage backend, install method, integration behavior, export/backup route, and multi-worktree behavior. Do not assume AI summarization/compaction needs no inference access.

Install the CLI using a supported method; initialize project state without cloning the upstream source tree into Pandabyte. Prefer local project configuration and reproducible versions. Inspect installers before execution; merge instructions and hooks instead of overwriting them. Do not blindly pipe unknown scripts into a shell.

Migrate active tasks, blockers, dependencies, acceptance criteria, and durable facts from current plans. Preserve provenance and unique unresolved requirements. Establish one task authority, not a second synchronized pile of Markdown task lists. Keep necessary human-facing guidance readable.

If Beads is redundant or impractical, retain the existing capable system and document the decision. The requirement is reliable shared task memory, not a specific package at any cost.

### P0.4 — Implement selective development-document retrieval

First test the existing development search/RAG mechanism. It must return relevant excerpts with source paths, prefer current guidance over archived notes, refresh after changes, and avoid new hosted API dependencies. Product RAG does not automatically qualify: do not mix development documents into customer knowledge or alter source restrictions to make this easier.

If a gap remains, evaluate QMD: https://github.com/tobi/qmd

Start with local keyword retrieval. Add local semantic models only if useful, resource-appropriate, and validated. Explicitly account for downloads, disk, memory, and indexing cost. Index an allowlist of relevant development docs; exclude secrets, credentials, customer data, dependencies, builds, and raw logs. Keep model files, indexes, and caches out of Git. Configure search-first, excerpt-first behavior and source rechecks.

Basic Memory and Claude-Mem are alternatives for a demonstrated remaining need, not default additions:
- https://github.com/basicmachines-co/basic-memory
- https://github.com/thedotmack/claude-mem

Do not install multiple competing memory systems or add an inference observer when native recall plus task/document retrieval is sufficient. Verify current licenses and processing/data flows before selecting any alternative.

### P0.5 — Install a small, verified set of development skills

Candidate sources:
- https://github.com/vercel-labs/skills
- https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering
- https://github.com/obra/superpowers
- https://github.com/vercel-labs/agent-skills

Inspect actual instructions, scripts, compatibility, licensing, activation rules, and dependencies. Prefer official upstreams, stable versions or pinned revisions, project scope, and supported lockfiles. Do not install whole catalogs or duplicate plugin/package versions. Skills are instructions unless they actually supply executable capabilities; they cannot grant model access or override the harness.

Prioritize demonstrated gaps:
- filesystem-context, context-compression, multi-agent-patterns;
- systematic-debugging, verification-before-completion, using-git-worktrees;
- relevant React performance, accessibility, and design guidance.

The Original Product Specification names UI/UX Pro Max, Superdesign, AI Elements guidance, shadcn/ui, frontend accessibility, React performance, and Ponytail. Inventory existing installations and verify exact upstream identities. Some names may identify libraries or guidance rather than installable skills. Use compatible, relevant options; do not invent a repository for an ambiguous name. Report unresolved identities and use existing design-system capabilities while preserving the required design outcomes.

Keep one coherent UI component strategy and conversation state owner. A development skill installation is not an application runtime dependency and must not be exposed automatically through Admin Agent Skills.

Do not impose heavyweight brainstorming, planning, testing, or review ceremonies on trivial edits. Bind skills to specific tasks and keep descriptions concise.

### P0.6 — Complete justified repository refactoring and cleanup

Identify duplicated instructions, stale handoffs, redundant wrappers, inconsistent boundaries, dead code, and generated clutter. Tie each refactor to an observed issue or Phase 1 requirement. Preserve behavior and public contracts; use small reviewable changes and relevant regression checks. Defer product-coupled refactoring until its Phase 1 step rather than performing speculative rewrites now.

Aim for clear responsibilities using existing filenames when possible:
- README: product overview and setup;
- AGENTS.md: concise development policy, commands, routing, context pointers;
- CLAUDE.md: compatible entry point to shared guidance without duplication;
- architecture documentation: current boundaries and a small verified Mermaid diagram;
- decisions: enduring rationale and constraints;
- one current handoff: checkpoint and exact next actions;
- task store: dependencies, owners, acceptance, and status.

Before removing old documents, preserve unique requirements, decisions, and unresolved tasks, reconcile contradictions, update links, and keep recovery through Git or a narrow necessary archive. Do not remove evidence just to reduce file count. Do not compress source code into opaque summaries or use lossy summaries as the only record of requirements.

If applicable, evaluate Knip in report mode: https://github.com/webpro-nl/knip . Configure real framework entry points and account for dynamic loading. Findings are deletion candidates, not proof. Run relevant validation after removals.

Optional only for measured gaps:
- Serena: https://github.com/oraios/serena — symbol-level discovery; verify current component licenses.
- RTK: https://github.com/rtk-ai/rtk — choose the Apache-only OSS edition if selected; preserve full diagnostic output when needed.

Do not add an external model gateway for native Codex routing. Avoid redundant frameworks around the already existing product OpenCode harness.

### P0.7 — Validate and close the setup phase

Demonstrate configuration recognition, skill discovery, and actual specialist routing. Verify model identity using execution metadata when exposed, not a worker's self-description. If unavailable, state “configured but execution model unverified.”

Demonstrate task persistence from a fresh process/session, dependencies/claims, and retrieval of representative known facts with correct source paths. Check that edited docs refresh and archived guidance does not override current facts. Clean up temporary test records. Verify integration did not break existing hooks or commands. Verify Claude access only if present and authorized.

Run relevant baseline checks. Measure representative context read volume, tool-output volume, time, retries, and model usage when available, including memory/indexing overhead. Do not invent savings percentages or equate output compression with total billing savings.

Phase 0 passes when there is a reproducible working development setup, preserved project state, a coverage matrix, clear memory/task ownership, validated capabilities or accurately documented activation limitations, and a concrete Phase 1 backlog. Missing optional tools must not block product implementation indefinitely.

## Phase 1 — Implement the full product scope step by step

Execute the following dependency order. The complete Original Product Specification below supplies the required details and acceptance criteria for every step.

### P1.1 — Confirm product audit and supported capability contracts

Map original Phase A and sections 1–2, 9–10 here. Reuse Phase 0 findings; do not repeat the entire audit. Produce a capability matrix for actual skills discovery/install/configuration/removal, MCP transports/connectivity/tool discovery, tool permissions, model selection, lifecycle events, RAG controls, evaluations, and memory behavior. Record supported interfaces and unsupported operations.

Define a single execution path and minimal adapters. Establish Admin/customer/test authorization boundaries, safe configuration-write scope, validation/rollback behavior, and redacted execution evidence. Determine whether changes apply immediately or require reload/restart; make this visible rather than pretending success. Preserve existing concurrent configuration/version protections.

### P1.2 — Prepare and review the complete design proposal

Map original Phase B and sections 3–4, 6–8 here. Produce concrete inspectable desktop/mobile and light/dark proposals for customer chat, sidebar, composer, memory/settings/account, Admin RAG refinements, Agent Skills tabs, MCP configuration, Tools, Configuration, and Playground with optional inspection panel.

Show loading, empty, streaming, cancellation, upload, error/recovery, disabled/unsupported, and connection-status states. Specify keyboard navigation, focus handling, labels, screen-reader feedback, contrast, touch layout, responsive drawers, and reduced-motion behavior. Preserve PandaByte branding. Use existing dependencies and one conversation state owner.

Present the proposal for the required review before replacement customer UI implementation. Do not fabricate approval. Complete independent work while awaiting the decision.

### P1.3 — Build the unified customer conversation experience

Map original Phase C and sections 3–4 here. Implement the approved shell, sidebar, history/search/new chat, Memory & Context, settings/account, composer, supported attachments/dictation, server-authorized model selection, draft preservation, upload states, Markdown/code/copy, evidence-backed citations, compact activity, streaming, cancellation, and recovery.

Remove mandatory Guide/Diagnostics/Structured Task mode selection from the customer workflow. Preserve useful underlying capabilities through natural-language routing and authorized harness behavior. Maintain sessions, ownership, persistence, accessibility, and mobile/light/dark behavior. Do not display fake or unsupported functionality.

### P1.4 — Complete shared conversational RAG and existing Admin RAG improvements

Map original Phase D and sections 5–6 here. Use the real authorized provider and current retrieval services. Implement the original answering flow and all source/catalog/evidence/citation requirements. Improve the EXISTING Admin controls for Knowledge Sources, Review & Publication, Retrieval Testing, Evaluations, and Diagnostics; retain existing capabilities.

Customer chat and Playground must use the same authorized RAG engine and configuration. Verify ingestion, review/publication, withdrawal, relevant caching, citations, evaluations, and measured diagnostics. Test withdrawal after evidence has already been retrieved or remembered. Historical chat display may remain according to retention policy, but withdrawn content must not become new authoritative evidence through caches or memory.

### P1.5 — Implement Admin Agent Skills, MCP, Tools, and Configuration

Map original Phase E and sections 7, 9 here. Build the dedicated Agent Skills sidebar entry and four compact tabs. Implement the full original metadata, status, configuration, discovery, installation, removal/disablement, permission, and Playground-link requirements through verified OpenCode interfaces.

External runtime skill installation is a separate administrator-authorized operation. Validate source, license, target scope, and supported installer; never silently execute arbitrary scripts. Avoid shared-global configuration changes that accidentally affect unintended users/runtimes.

For MCP, use the harness's existing client/transport mechanisms. Validate local executable/process/filesystem availability in the DEPLOYED harness environment and supported remote transports. Never suggest the server can access the administrator's local machine. Keep credential references server-side, redact displays/logs, and preserve actual connectivity/error evidence.

Enforce tool/model/skill permissions in execution, not only UI. A skill may be instructions rather than an observable callable tool; report only the loading/invocation evidence the harness exposes, and clearly state when skill attribution cannot be verified. Unsupported management actions must remain visibly unsupported, with a documented supported alternative where feasible.

### P1.6 — Implement the isolated Admin Agent Playground

Map original Phase F and section 8 here. Reuse conversation components and the existing runtime/RAG path. Implement isolated Admin test sessions, compact configuration, model/agent controls where supported, Send/Stop, streaming, citations, tool activity, resets, status/error recovery, and the optional execution inspection panel.

Support the complete install/configure → discover/validate → test → inspect → correct → retest loop inside Admin. Use actual selected models, tool/MCP activity, retrieved evidence, errors, and measured usage/latency where exposed. Never expose private reasoning, secrets, credentials, or sensitive payloads.

Enforce Admin authorization server-side for every relevant operation. Isolate test sessions, history, memory, and side effects from customers. Use supported sandbox/dry-run mechanisms when available, clearly distinguished from real executions. Require the appropriate authorization and confirmation for externally consequential test tools. Do not weaken permissions to make tests pass.

### P1.7 — Complete customer memory integration and cross-surface configuration behavior

Apply original section 10 and the existing Mem0 plan throughout earlier steps; this step closes integration, not a postponement of isolation design. Reuse owner-scoped customer conversation/project memory, supported review/correction/deletion/privacy controls, and documented processing boundaries. Never feed development memory into customers or real customer memory into Playground tests.

Verify deletion/correction and withdrawn-source behavior across caches and memory according to the existing architecture. If Mem0 instructions or credentials are missing, name the exact blocked requirement, retain safe existing behavior, and complete independent scope without silently marking memory integration done.

### P1.8 — Perform complete regression, live integration, browser QA, and handoff

Map original Phase G and sections 12–14 here. Execute every required test group in the original specification plus relevant regressions for existing e-commerce and Admin behavior. Check types/build, desktop/mobile, light/dark, keyboard/accessibility, permissions, user/test isolation, lifecycle, real RAG evidence, supported runtime skill operations, MCP success/failure, configuration propagation, and recovery.

Use authorized test identities, non-sensitive records, and safe representative tools. Tests with mocks are useful but do not prove real provider/MCP/skill execution. Distinguish unit results, integration results, browser observations, mocks, and verified live runs. If a service is unavailable, keep the requirement blocked or unverified and state the exact prerequisite. Never fabricate citations, connection states, evaluation results, token metrics, or passing tests.

Reconcile the full requirement coverage matrix before claiming completion. Every requirement must have evidence, a verified supported limitation, or an explicit unresolved blocker. Unsupported conditional features do not disappear; their limitation must be visible where requested and documented. Missing supported functionality remains unfinished.

## Stage gates and final report

At every completed stage: update the existing task store and compact handoff, integrate worker results, run relevant checks, and continue to the next authorized stage. Do not ask “shall I continue?” after each routine step. Ask only for a genuinely missing required decision, unavailable credential/service access, or consequential authorization; explain the specific dependency and continue unaffected work.

Do not let Phase 0 become endless tooling work or treat it as completion of the product task. Do not use a passing build as a substitute for behavior verification. Do not start a second orchestration engine to compensate for an unsupported harness operation.

The final report should identify:
- True starting Phase 6 checkpoint and work preserved/completed.
- Phase 0 tools installed/reused/skipped, versions/revisions/licenses, actual routing, memory ownership, checks, and rollback instructions.
- Phase 1 implemented behavior, reuse, changed paths, design review status, real test evidence, and requirement coverage.
- Unsupported operations, blocked live checks, pending restarts, and remaining work without overstating readiness.
- Current checkpoint and exact next action.

Keep logs and screenshots in appropriate existing evidence locations, reference them concisely, and avoid new piles of redundant reports. Do not expose secrets in evidence.

**Start now by identifying the repository and current branch/worktree, reporting the true historical Phase 6 checkpoint, and inspecting the existing OpenCode harness and Admin RAG implementation. Then execute Phase 0 and the ordered Phase 1 steps under this complete contract.**

---

# Original Product Specification — Mandatory Scope, Preserved in Full

The following is the original supplied scope. Its complete contents are part of this single prompt. Apply its historical phase labels through the mapping above; preserve all requirements and acceptance criteria.


# Panda Agent — Final Conversational UI/UX, RAG & Agent Harness Integration Prompt

## 1. Main Objective

Redesign Panda Agent into a modern, minimal, responsive conversational AI application inspired by ChatGPT and Codex.

Replace the existing Guide / Diagnostics / Structured Task interface with one unified conversational experience.

At the same time, improve the existing Admin dashboard to support:

- RAG management, testing, and evaluations.
- Agent Skills management.
- External skills installation and configuration.
- MCP server/plugin configuration.
- Agent tool management.
- Model/runtime configuration.
- A dedicated Admin Agent Playground for end-to-end testing.

**CRITICAL ARCHITECTURAL RULE: Reuse the existing OpenCode agent harness and its supported features. Do not build another agent orchestration system, skills engine, MCP client, or tool execution framework from scratch.**

The primary work is UI/UX development, configuration integration, and connecting existing harness capabilities to the application.

Preserve the current working backend, authentication, RAG, sessions, cancellation, persistence, and Admin functionality.

---

## 2. First: Inspect the Existing Implementation

Before making changes:

1. Inspect the current repository, Git branch, and latest handoff.
2. Check the actual Phase 6 completion status.
3. Complete or accurately checkpoint outstanding authorized Phase 6 work.
4. Review the existing Panda Agent frontend and backend.
5. Inspect the existing Admin RAG control system.
6. Identify its current testing, retrieval diagnostics, and evaluation features.
7. Inspect the actual OpenCode harness integration and available APIs.
8. Identify existing skill, MCP, plugin, tool, configuration, and session capabilities.
9. Review the separately provided Mem0 plan.
10. Identify which functions already exist and which need only UI integration.

Produce a short implementation audit explaining:

- Existing reusable components.
- Existing agent harness capabilities.
- Existing Admin functionality.
- Missing UI connections.
- Actual backend integration gaps.
- Required design changes.

Do not assume that a harness capability exists without verifying it.

Do not overwrite unrelated code or reset existing implementation evidence.

---

## 3. Customer-Facing Panda Agent

Create a unified ChatGPT/Codex-style interface.

### Main Layout

- One conversation column.
- One natural-language composer.
- Compact header.
- Collapsible sidebar.
- Minimal neutral styling.
- Light/dark mode.
- Responsive mobile experience.

### Sidebar

Include:

1. New Chat
2. Search Chats
3. Chat History
4. Memory & Context
5. Settings
6. Account

Remove mandatory Guide, Diagnostics, and Structured Task modes.

Users should ask questions naturally without selecting internal tools or skills.

The existing agent harness should route requests to available, authorized capabilities.

### Message Composer

Include:

- Auto-expanding input.
- Send/Stop controls.
- Optional file attachments.
- Voice dictation when supported.
- Server-authorized model selector.
- Draft preservation.
- Upload previews and status.

Do not expose unsupported capabilities.

### Message Rendering

Support:

- Markdown and code blocks.
- Copy actions.
- Evidence-backed citations.
- Compact expandable tool activity.
- Streaming responses.
- Request cancellation.
- Clear error and recovery states.

Preserve existing sessions and ownership protections.

---

## 4. Visual Design Direction

Use ChatGPT and Codex as interaction and layout references while preserving PandaByte branding.

Design principles:

- Clean and minimal.
- Neutral surfaces.
- Subtle borders and accents.
- Comfortable typography.
- Compact configuration controls.
- Accessible menus and dialogs.
- Responsive drawers.
- Fast, restrained animations.
- Reduced-motion support.
- No unnecessary cards or oversized panels.

Use relevant existing design skills such as:

- UI/UX Pro Max.
- Superdesign.
- AI Elements guidance.
- shadcn/ui.
- Frontend accessibility.
- React performance.
- Ponytail.

Inspect installed dependencies before introducing new ones.

Use one coherent conversation runtime and state owner.

Verify compatibility and licenses.

Prepare desktop/mobile light/dark design proposals for review before implementing the replacement customer UI.

---

## 5. Real Conversational RAG

The primary answering flow should be:

User Message
→ Authentication
→ Agent Harness / Request Routing
→ Approved Knowledge Retrieval
→ Evidence Assembly
→ Configured LLM Generation
→ Citation Validation
→ Persistent Conversation History

Requirements:

1. Use a real authorized LLM provider.
2. Reuse existing RAG services and retrieval APIs.
3. Preserve approved knowledge-source restrictions.
4. Automatically route natural-language questions.
5. Resolve products from the approved catalog.
6. Clarify genuinely ambiguous questions.
7. Validate evidence before presenting factual claims.
8. Prevent fabricated product information and citations.
9. Preserve cancellation, recovery, and history.
10. Keep credentials server-side.

Reuse existing Next.js, Clerk, InsForge, FastAPI, and OpenCode integration where appropriate.

Do not replace working services merely to reorganize the architecture.

Do not create a second agent execution engine.

---

## 6. Existing Admin RAG Control — Reuse and Improve

**IMPORTANT: The Admin dashboard already contains a RAG control and testing system. Reuse and improve this implementation rather than creating a new RAG dashboard.**

Inspect its current code, UI, backend endpoints, configuration, tests, and evaluation functionality first.

Keep existing capabilities and make their UI easier to understand.

### RAG Admin Sections

Organize the current controls into:

**A. Knowledge Sources**
- Upload and ingest documents.
- Manage approved sources.
- Add external sources/URLs where already supported.
- Inspect ingestion status.
- Review document processing and chunks.

**B. Review & Publication**
- Approve and reject sources.
- Publish approved knowledge.
- Withdraw or disable outdated content.
- Preserve version and audit history.

**C. Retrieval Testing**
- Run sample retrieval queries.
- Inspect returned chunks.
- View similarity/ranking information where available.
- Inspect actual source citations.
- Test relevance and retrieval behavior.
- Adjust supported retrieval parameters.

**D. RAG Evaluations**
- Reuse the existing evaluation pipeline.
- Manage representative test questions.
- Test answer correctness.
- Evaluate citation support.
- Measure retrieval relevance and answer coverage.
- Review failures and insufficient-evidence responses.
- Compare measured results between configurations.

**E. Diagnostics**
- Retrieval errors.
- Processing failures.
- Request logs and safe diagnostics.
- Actual latency and token metrics where available.

All evaluation results must come from real execution, not mock metrics.

### Critical RAG Requirement

Admin configuration must affect the same RAG engine used by:

1. The customer-facing Panda Agent.
2. The new Admin Agent Playground.

Do not implement separate retrieval engines for each interface.

Approved source changes must affect subsequent answers. Withdrawn sources must stop contributing evidence, including through caches or saved memory.

Preserve all existing security, source ownership, version checks, and audit protections.

---

## 7. New Admin Sidebar — Agent Skills

Add a dedicated Admin sidebar item:

**Agent Skills**

This section will serve as the configuration and management interface for the existing OpenCode agent harness.

It should have a clean, compact interface similar in simplicity to Codex/ChatGPT skills and MCP configuration experiences.

### Agent Skills Page Structure

Use a simple tabbed layout:

1. Skills
2. MCP Servers
3. Tools
4. Configuration

Avoid building a complicated dashboard with excessive cards, metrics, or unnecessary settings.

### 7.1 Skills Management

Display skills discovered from the actual OpenCode harness.

For each skill, show:

- Skill name.
- Short description.
- Source/origin.
- Enabled/disabled or availability state, where supported.
- Configuration requirements.
- Actual validation status.

Allow Admin users to:

- View installed skills.
- Inspect supported skill instructions/metadata.
- Configure supported parameters.
- Enable/disable skills where supported.
- Install external skills using verified harness-supported methods.
- Remove/uninstall skills where supported.
- Refresh the discovered skills list.
- Run skill tests through the Admin Playground.

**Do not implement a custom skills loader, parser, registry, or execution engine if the existing harness already handles these functions.**

External installation must use supported OpenCode-compatible mechanisms.

Validate sources and installation permissions before making changes.

Do not silently execute arbitrary third-party installation scripts.

If any requested management action is unsupported by the actual harness, clearly show the limitation rather than fabricating its functionality.

### 7.2 MCP Server / Plugin Management

Provide a minimal MCP configuration UI.

Display the actual configured MCP servers and their supported connection states.

For each server, show:

- Name.
- Transport/connection type.
- Configuration summary.
- Enabled/disabled state where supported.
- Connection status from actual checks.
- Available tools discovered from the server.
- Last verified error/status where available.

Support Admin operations through the existing OpenCode configuration and MCP interfaces:

- Add MCP server.
- Edit configuration.
- Configure supported local/remote transports.
- Configure environment variables or credential references.
- Enable/disable when supported.
- Remove MCP server.
- Connect/reconnect or validate connectivity.
- Discover available tools.
- Test MCP-backed capabilities in the Playground.

Handle secrets securely.

Never expose raw credential values in the browser.

For local MCP servers, explicitly verify whether the deployed harness environment supports the required executable, filesystem, and process access.

Do not pretend that a server-side cloud process can access the Admin user's local computer.

**Important:** Do not build an independent MCP client, protocol layer, transport manager, or MCP orchestration engine.

OpenCode must remain responsible for MCP configuration, discovery, and execution through its verified supported interfaces.

### 7.3 Tools Management

Display actual tools available to the agent harness.

Group them by their source when useful:

- Built-in harness tools.
- Skill-related capabilities.
- MCP-provided tools.
- Other existing approved integrations.

For each tool, display its name, description, source, and actual availability.

Allow only supported configuration or permission changes.

Provide a direct route to test the tool through the Playground.

Tool availability must be enforced by the execution layer, not only by hiding switches in the UI.

### 7.4 Harness Configuration

Provide a minimal settings interface exposing only supported OpenCode configuration controls.

Possible controls, only when genuinely supported:

- Default agent/model.
- Available model providers.
- Agent permissions.
- Skill discovery/configuration.
- MCP connections.
- Tool availability.
- Runtime limits and status.

Keep advanced configurations compact or inside an expandable section.

Do not recreate OpenCode's complete internal configuration system as a second application backend.

Use its verified APIs and supported configuration mechanisms.

---

## 8. Admin Agent Playground — New Feature

Add a dedicated section inside the Admin dashboard:

**Agent Playground**

This is a mini version of the main Panda Agent chat, intended exclusively for Admin testing and debugging.

### Purpose

Allow Admin users to verify agent changes directly inside the Admin panel rather than repeatedly switching to the customer-facing Panda Agent.

Use it to test:

- Installed skills.
- External skills.
- MCP connections and tools.
- Agent routing.
- RAG retrieval and citations.
- Model responses.
- Tool invocation.
- Memory/context behavior.
- Agent configuration changes.

### Playground UI

Create a compact conversational interface with:

- Chat message history for the current test.
- Natural-language input.
- Model selection where available.
- Test session controls.
- Send/Stop.
- Streaming agent responses.
- Expandable activity/tool execution.
- Source citations.
- Clear success/error statuses.

Use the same conversation components and design language as the main Panda Agent wherever possible.

### Playground Configuration

Provide a compact test configuration area containing:

- Active model/agent.
- Available skills.
- Available MCP connections.
- Permitted tools.
- RAG configuration or test profile.
- Test session reset.

Only show controls supported by the actual runtime.

### Playground Behavior

Examples:

**Skill Test**

Admin installs or configures a skill → Opens Playground → Sends a relevant prompt → Inspects the actual skill/tool activity and response.

**MCP Test**

Admin configures an MCP server → Runs a real connection/discovery check → Opens Playground → Requests an MCP-backed action → Inspects execution status and result.

**RAG Test**

Admin updates an approved knowledge source → Opens Playground → Asks a relevant question → Inspects actual retrieved evidence, citations, and generated answer.

**Routing Test**

Admin sends a natural-language request → Verifies which permitted tools or skills the agent actually selected.

### Execution and Isolation Requirements

The Playground must use the existing OpenCode harness and the same authorized RAG services as the customer-facing agent.

Do not create a new agent runtime to support Playground chat.

However, test sessions must remain isolated from customer sessions.

- Admin-only authorization.
- Dedicated test-session scope.
- No accidental modification of customer memory.
- No mixing of customer chat history.
- No unintended production side effects.
- No bypassing harness tool permissions.
- Safe logging and trace inspection.

When a test tool has external side effects, require appropriate authorization and confirmation.

If a dry-run or sandbox is available, use the harness's verified support; do not claim simulation is equivalent to a real execution.

### Debug / Inspection Panel

Provide a compact optional inspection panel showing actual available execution evidence:

- Request status.
- Selected model.
- Skills/tools invoked.
- MCP tool calls.
- Retrieval evidence.
- Citations.
- Execution errors.
- Latency and token usage when measured.

Display only actual supported information.

Do not expose private model reasoning, secrets, raw credentials, or sensitive tool payloads.

### Playground Acceptance

An Admin should be able to:

1. Install/configure a supported skill.
2. Verify its discovery.
3. Open the Playground.
4. Send a test request.
5. Observe its actual invocation and output.
6. Inspect errors or execution evidence.
7. Correct configuration and retest.

This entire workflow should happen within the Admin panel.

---

## 9. Critical OpenCode Harness Reuse Rule

**This is a mandatory architecture constraint for the entire Agent Skills, MCP, Tools, and Playground integration.**

The existing OpenCode harness is the execution and capability-management foundation.

Responsibilities must be separated clearly.

### OpenCode Harness Owns

- Agent execution and orchestration.
- Supported skills discovery/loading.
- Tool invocation.
- MCP connectivity and tool discovery.
- Supported plugin mechanisms.
- Agent configuration and permissions.
- Model execution integration.
- Runtime execution lifecycle.

### PandaByte Admin UI Owns

- Displaying existing skills and tools.
- Providing configuration forms.
- Connecting to supported harness APIs.
- Triggering validated configuration changes.
- Displaying actual connection states.
- Providing the Admin Playground.
- Displaying execution results and diagnostics.

### Existing PandaByte Backend Owns

- Authentication and authorization.
- RAG knowledge management.
- Approved source retrieval.
- Customer conversation persistence.
- Customer memory isolation.
- Existing application-specific rules and audit protections.

Integrate these layers through the smallest supported adapter required.

An adapter may handle authentication, authorization, validation, persistence, and translation between existing API contracts.

It must not become another agent orchestration engine.

**Do not build from scratch:**

- Another agent runner.
- Another skills runtime.
- Another MCP client or gateway.
- Another tool execution engine.
- Another model orchestration framework.
- A second RAG implementation.
- A separate Playground agent backend.

If the actual harness does not expose a requested management operation, document that limitation and use a supported configuration mechanism where feasible.

Do not invent OpenCode APIs or assume every feature is remotely configurable.

---

## 10. Memory Integration

Follow the existing Mem0 instructions and handoff.

Keep development memory separate from customer memory.

### Development Memory

Use compact project summaries, targeted retrieval, and efficient handoffs.

Never expose development memory to customer sessions.

### Customer Memory

Reuse owner-scoped conversation/project memory.

Preserve supported controls for review, correction, deletion, and privacy.

The Admin Playground must not accidentally write to real customer memories.

Do not introduce new Mem0 processing without a documented data-flow and isolation design.

---

## 11. Implementation Sequence

Proceed in small, reviewable stages.

### Phase A — Audit & Checkpoint

- Finish or accurately record the Phase 6 checkpoint.
- Review current frontend/backend.
- Audit existing Admin RAG controls.
- Inspect OpenCode harness capabilities and integration.
- Identify supported APIs and missing configuration UI.

### Phase B — Design Proposal

Produce:

- Main Panda Agent desktop/mobile designs.
- Light/dark variants.
- Admin RAG layout refinements.
- Agent Skills page.
- MCP configuration interface.
- Tools management UI.
- Admin Agent Playground.
- Responsive and accessibility specifications.

Present for review before production UI changes.

### Phase C — Main Conversation UI

- Build unified chat shell.
- Implement composer/sidebar/history.
- Preserve existing backend lifecycle and persistence.
- Connect conversational routing.

### Phase D — RAG Integration

- Integrate real LLM-backed responses.
- Reuse the existing RAG control system.
- Validate Admin retrieval tests and evaluations.
- Ensure citations and approved-source behavior.

### Phase E — Agent Skills & MCP Admin

- Build minimal Skills/Tools/MCP configuration UI.
- Connect supported OpenCode harness interfaces.
- Verify installation, configuration, and discovery.
- Enforce Admin authorization and safe secret handling.

### Phase F — Agent Playground

- Reuse the existing agent and conversation runtime.
- Add isolated Admin test sessions.
- Connect real skills, MCP, and RAG capabilities.
- Add execution inspection and test controls.
- Verify configuration changes using real execution.

### Phase G — Final QA & Handoff

- Run browser tests.
- Run integration tests.
- Check types and production build.
- Test desktop/mobile responsiveness.
- Verify authentication and isolation.
- Document limitations and final state.

Do not deploy or publish unrelated changes without authorization.

---

## 12. Required End-to-End Tests

Verify the following against real supported services.

### Main Panda Agent

- Natural-language chat.
- LLM generation.
- RAG retrieval and citations.
- Session persistence.
- Streaming and cancellation.
- Error recovery.
- User isolation.
- Mobile accessibility.

### Admin RAG

- Source ingestion.
- Approval/publication.
- Withdrawal enforcement.
- Retrieval testing.
- Evaluation runs.
- Configuration propagation to the answering engine.

### Agent Skills

- List installed skills.
- Install a supported external skill.
- Validate its availability.
- Configure supported settings.
- Test a skill in the Playground.
- Verify disablement/uninstallation where supported.

### MCP

- Add a supported MCP server.
- Validate connectivity.
- Discover tools.
- Test an MCP-backed action.
- Handle connection failures.
- Remove/disable configuration safely.

### Playground

- Admin-only access.
- Real agent response.
- Real tool activity.
- Real RAG citations.
- Model selection.
- Test-session isolation.
- Cancellation/error recovery.
- No accidental production side effects.

Distinguish unit-test results, browser observations, mocked results, and verified live executions.

Do not display fabricated metrics or success indicators.

---

## 13. Final Handoff Requirements

After every completed stage, update the compact project handoff with:

- What was implemented.
- What existing functionality was reused.
- What was changed and why.
- Actual tests performed.
- Browser verification evidence.
- Remaining limitations.
- Current checkpoint.
- Exact next action.

Reuse bounded implementation/review workers where authorized and keep integration ownership explicit.

Avoid unnecessary refactoring or duplicated infrastructure.

---

## 14. Final Expected Product

### Customer Experience

A polished ChatGPT/Codex-style Panda Agent where users naturally ask questions and receive reliable, evidence-backed answers.

### Admin Experience

A minimal, well-organized control interface with:

**RAG Control** — Manage knowledge, retrieval, testing, and evaluations using the existing implementation.

**Agent Skills** — Discover, install, configure, and manage supported skills and MCP integrations through the existing OpenCode harness.

**Agent Playground** — Test the actual agent, RAG, skills, tools, and MCP behavior directly inside the Admin dashboard.

### Non-Negotiable Principle

**OpenCode powers the agent. Existing PandaByte services power authentication, approved knowledge, and persistence. The Admin dashboard provides configuration, visibility, and testing.**

Reuse what works. Do not rebuild core agent infrastructure unnecessarily.

**Start by reporting the true Phase 6 checkpoint and inspecting the existing OpenCode harness and Admin RAG implementation. Then produce the revised design proposal and proceed through the approved implementation stages.**