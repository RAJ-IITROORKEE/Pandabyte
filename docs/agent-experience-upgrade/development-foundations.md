# Development foundations audit

6 November 2026. This is a development-only audit; no customer knowledge or runtime configuration was changed.

## Search and source freshness

`rg` 15.2.0 already searches local files with line numbers and reflects edits immediately, but an unrestricted repository search does not enforce a development-document boundary or prefer active material. Product RAG is a separate authorized corpus and is not a development index. `node scripts/dev-context.mjs Phase 6` reads a small allowlist on every invocation, prints at most 12 matching lines (at most two per file, 300 characters per excerpt), returns paths and line numbers, and sorts archived entries after current entries. Search terms are case-insensitive literal word fragments, ranked by number of terms matched; this is not semantic search. Read surrounding source and verify current contracts before acting; order cannot establish authority or recency. `README.md` currently records the Agent Phase 6 as in progress; use the current handoff for subsequent evidence.

The allowlist covers root README/CLAUDE/design/plan, direct Markdown/JSON files in this upgrade directory, direct Markdown archive files, and `Panda-agent/docs/lightweight-*.md`. It skips symlinks and filenames signaling secrets, credentials, customer data, private data, environment files, logs, builds or dependencies. It is not a content classifier: do not put sensitive data in allowlisted documents. AGENTS.md is intentionally excluded from excerpt output because it contains an owner identifier; read applicable instructions directly. Other documents and code remain searchable deliberately with targeted `rg` when needed. No index, cache, embedding, model, network call, or package is created.

[QMD](https://github.com/tobi/qmd) is MIT-licensed and supports local BM25 as well as vector search; its documented full workflow uses downloaded models and an index. The small, fresh keyword requirement does not justify another tool or model download now. Reconsider if measured search quality or document volume makes this insufficient. Its upstream documentation lists approximately 300 MB, 640 MB and 1.1 GB for its three default GGUF models; keyword-only search does not require an LLM.

## Task memory

`requirements.json` identifies itself as the sole task and coverage authority for this assignment; `handoff.md` is the compact current checkpoint. `scripts/agent-tasks.mjs` reads schema version `1.0` and checks unique IDs, nonempty owners, allowed statuses, optional claim-owner format, and any structured `dependsOn` references for duplicates, missing IDs and cycles. It does **not** validate the completeness or truth of requirement evidence, acceptance, free-text dependencies or verification fields. Current validation reports 97 rows, all with explicit `dependsOn` arrays. The old `dependencies` prose is not interpreted by the guard; an empty array denotes no structured prerequisites. Dependency readiness still requires each referenced task to be verified, and the parent owns coverage and evidence review.

Run from the repository root:

```text
node scripts/agent-tasks.mjs validate
node scripts/agent-tasks.mjs list
node scripts/agent-tasks.mjs show P0.1
node scripts/agent-tasks.mjs claim ID OWNER
node scripts/agent-tasks.mjs status ID OWNER partial
node scripts/agent-tasks.mjs release ID OWNER
```

Use a consistent owner string. A claim requires an explicit `dependsOn` array, all dependencies `verified`, an unclaimed and not-yet-verified row; it sets `in_progress`. Status and release require the matching claim. Releasing an `in_progress` task changes it to `partial`; other statuses remain unchanged. Status updates to `in_progress` or `verified` recheck dependency readiness; the guard does not independently prove evidence, so the owner must review it before setting `verified`. Claims persist after a status change until explicitly released. `--file PATH` before the command selects an isolated fixture, useful for tests; the normal store is the repository file.

Mutations use an exclusive adjacent `.lock`, write a temporary file and rename it over the store. Concurrent attempts against the same path cannot both acquire that lock; a loser must inspect current state and retry if appropriate. A hard process crash can leave a stale lock or temporary file. There is no lease, automatic stale-lock recovery, transaction across worktrees, or tested network-filesystem guarantee. Before removing a stale lock, confirm no process is writing that exact store and inspect the JSON/current claims; never blindly remove another worker's lock. For rollback, stop writers, inspect the current diff and preserve any other worker's updates; use Git to review or restore only the agreed task-store changes, then validate. Do not reset the worktree. Test fixtures clean up their own disposable files.

The parent reported the combined `node --test scripts/agent-tasks.test.mjs scripts/dev-context.test.mjs` passed 6/6 on Node v24.18.0. Five task tests cover fresh-process persistence, dependency gates including rechecking before verification, claim ownership/release, two competing claims, missing/cyclic dependencies, and rejection of missing structured dependencies. They use disposable fixtures, not the live store, and do not establish cross-worktree or crash recovery. [Beads](https://github.com/gastownhall/beads) is MIT-licensed and offers dependency-aware tasks, but its upstream describes Dolt storage, single-writer embedded mode, a separate server for concurrent writers, and setup that can alter hooks/instructions. Defer installation while the single JSON authority and its documented limitations are evaluated; no Beads version, install, backup or multi-worktree behavior was tested locally.

## Skills inventory

`skills-lock.json` records project-local `find-skills` from `vercel-labs/skills` and `clerk-nextjs-patterns` from `clerk/skills`; `.agents/skills/official-sources.json` records file hashes. `.agents/skills/ecc-sources.json` names the pinned ECC source and retained MIT license for API design, security, migrations, React performance and frontend accessibility. `ui-migration-sources.json` separately records frontend accessibility provenance. A local SHA-256 check matched all 7 ECC manifest entries, all 15 official manifest entries and the single UI migration entry. The two frontend-a11y manifests cite different upstream commits but the same content hash; matching bytes alone do not resolve the commit provenance discrepancy. The skill-lock computed hashes were not recalculated by the Skills CLI.

Reuse the existing project-local API/security/migration, React performance, frontend-a11y, find-skills and Clerk instructions at their documented triggers. The current host catalog also lists Ponytail, UI/UX Pro Max, Superdesign, AI Elements and another find-skills copy. Do not reinstall a duplicate merely to satisfy a name. Candidate filesystem-context, context-compression, multi-agent-patterns, systematic-debugging, verification-before-completion and using-git-worktrees were not independently verified as project-local selected upstream skills in this audit; assess a specific demonstrated gap and source/license before installation. Catalog presence does not establish a verified upstream revision, activation in a later session or an application runtime capability. No installs, lockfile or shared configuration changes were made.

## Checks and limits

- `node --test scripts/dev-context.test.mjs`: one passing test on Node v24.18.0, exercising separate Node processes, source edit refresh, path/line output, archive ordering, and excluded filenames in a disposable directory.
- A single `Phase 6` search measured via `spawnSync` took 70 ms and emitted 3,524 UTF-8 bytes on this host before later document changes; this is one observation, not a benchmark or a savings estimate. No indexing/model overhead applies. Token usage and comparative billing were not measured.
- Tests do not prove arbitrary document content is free of sensitive information, semantic relevance, cross-worktree task-store concurrency, a new session's skill activation, or multi-client operation. No private configuration was read.
