# Native development tooling

Verified 6 November 2026. The adopted master is preserved verbatim in
`specification.md`; its instructions are adopted by the user's explicit request.
Historical product evidence is not rewritten by this setup.

10 November native-MVP follow-up: an isolated official2.2.6 Windows binary is
now used by the enabled local native preview, with its origin/hash and effective
configuration recorded in [native-v2-compatibility.json](native-v2-compatibility.json).
The global installation and2.2.2 inspection path were not upgraded. Runtime,
provider gateway, owner journal, budget and browser evidence are separately
recorded in [native-mvp-verification.json](native-mvp-verification.json). This
bounded one-call path has no RAG, tools, skills or children, no shared native
history, and no automatic compaction/retry. Full Phase1 and hosted execution
remain unverified; the later sections retain their original scope and dates.

## Configuration and routing

Installed `codex-cli 0.167.0-alpha.3.2`; help and `debug models --bundled` were
inspected. Bundled catalog contains `gpt-6-luna`, `gpt-6.1-terra` and
`gpt-6.1-sol`, all with `high` reasoning supported. Native delegation accepted
explicit Luna/high and Terra/high overrides in this chat. Execution model identity
is not returned by the collaboration status API, so routing is configured but
execution identity is unverified. No claim of cheaper billing is made.

Project-only `.codex/agents/` defines a read-only Luna explorer, scoped Terra
implementer and Sol integration reviewer. `.codex/config.toml` caps subagent
concurrency at three. Existing user configuration, permissions, hooks and plugins
were not modified. Official configuration supports these project agent files:
[subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
TOML files parse locally; recognition by this ongoing desktop session is not yet
verified. No restart was forced and native explicit delegation remains available.

## Native memory

Before the change, `codex features list` reported memories stable/false. After the
project setting, a fresh process reports stable/true and multi_agent stable/true.
This establishes CLI recognition, not generated memories or active recall in this
existing desktop chat. Native memory is supplemental to repository rules, coverage
and handoff. Generation is bounded to two candidates per startup with 50% quota
remaining threshold. No inference model override or external memory service was
added. Background generation delay and token use are unmeasured; current session
activation and generated-memory verification remain pending. See official
[memories](https://learn.chatgpt.com/docs/customization/memories) and
[configuration](https://learn.chatgpt.com/docs/config-file/config-reference).

`codex --strict-config features list` is unsupported by this installed CLI; its
failure is not reported as validation. `codex features list` succeeds normally.
Claude, Beads and QMD were not resolved on PATH. No Claude compatibility execution
is claimed. A future client can use the same repository task and document sources.

`codex agents` is an interactive command center in this build; `codex agents list`
is unsupported. It is not used as proof of custom-agent discovery. User-level MCP
registration names were inventoried without reading credential values: node_repl,
copperhead-smartmark, solidcraft-smartmark, open-design, firecrawl, janction-render
and copperhead-pandabyte-xs3. Registration does not prove connected capability.
The available host plugin/skill catalog was inspected; its unrelated integrations
and existing settings were preserved.

## Rollback and separation

Remove only the added project `.codex/config.toml` and three project agent files
to roll back this setup, after checking for concurrent edits. Do not delete user
memory stores or reset sessions. All configuration here is development-only;
customer memory, OpenCode runtime skill discovery and Admin permissions are separate.
