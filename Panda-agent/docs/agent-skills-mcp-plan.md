# Panda Agent: suggestions, skills, MCP and datasheet retrieval plan

Status: **plan only** (13 Nov 2026). Nothing here is built until the owner starts a phase. Migrations need owner approval.

## Owner decisions (13 Nov 2026)

| Question | Decision |
| --- | --- |
| Where MCP tools and skills run | The agent loop on Vercel (`src/agent-loop/`), registered from Admin. The OpenCode research server (control room) may reuse the same SKILL.md files later. Supersedes the earlier "skills/MCP via OpenCode only" pick. |
| Follow-up suggestions | Ghost text in the empty composer (Tab fills, Enter sends) plus chips under the answer. |
| Pinouts, schematics, diagrams | Datasheet text with page numbers, links to official pinout/schematic images, a `find_pinout` tool and an optional one-page vision read. No page-image embeddings. |
| Rollout | Admin only first; signed-in users after evals and per-user budgets. |

## What exists today (survey, 13 Nov 2026)

- Admin `app/admin/agent-skills/agent-skills.tsx`: Skills / MCP Servers / Tools / Configuration tabs, read-only; "Configure native tools" disabled.
- `panda_agent_skills` (migration `20261105090002`): id CHECK-constrained to two ids; versions table with review flag. Skills reach only the old guide/agentic paths (env-gated), not the agent loop or research harness.
- MCP: no general client, no server table. `src/agentic/mcp-client.ts` is a single fixed-document fetcher. `src/opencode/execution-runtime.ts` denies MCP/skills.
- Retrieval: lexical ranking over 282 listing chunks; embeddings code (`pgvector-adapter.ts`, `config/hybrid-v1.json`) present but not wired; `panda_agent_document_pages` unused; no stored product/pinout images.
- Composer: six static start chips (`QuickActions`); no follow-up suggestions.

## Status (13 Nov 2026)
- Phase 1 (follow-up suggestions): live.
- Phase 2 (skills): live; migrations 20261113180000/1; 10 skills (5 built-in, 5 custom incl. 4 adapted MIT community skills).
- Phase 3 (MCP): live; migration 20261113190000; built-in Streamable HTTP client (no SDK); Context7 registered, both tools allowed; Admin chats only.
- Cost work: Claude prompt-cache breakpoints (system prompt + latest user message) live; tool_choice 'required' only where the pinned endpoint publishes support (not Claude Haiku).
- Done 13 Nov: condensed system prompt, skills listed by trigger only, MCP servers one line each with tools on demand (open_mcp_server),
  per-step trimming (history first, then older tool results) under the 48 KB cap. Same test question: $0.0076 (before) -> $0.010 (skills+MCP) -> $0.0059.
- Phase 4 (pinout retrieval): live; migration 20261113200000. `find_pinout` quotes by section (board-photo header labels, then module
  pin tables, then strapping pins; 8,000 bytes) and attaches the board's own published pinout image. Its fixed focus avoids the words the
  evidence reader refuses (GPIO, pinout, wiring). Live xS3 check: header table + datasheet UART defaults, 4 citations, image shown, $0.0056.
  Pin tables exist for xS3, xC5, xC6, xC3, xC3m, x32, xLoRa; board-photo labels for x8266, xC5, xC6, xS3, xC3, xC3m.
- Open cost items: repair-instead-of-reject in final_answer (pin answers often try more than 4 ids), read_product by name, regional Vertex endpoint for cache hits (profile owned by the control room session).

## Phases (each: tests, deploy, live check before the next)

### 1. Follow-up suggestions
- `final_answer` gains an optional `suggestions` (0-3 short next prompts, each <= 120 chars, plain text, no URLs/prices); same model call, no extra cost. Plain replies: none.
- Not stored in the answer journal (no migration): returned with the turn result and shown for the latest answer only.
- UI: first suggestion as ghost text in the empty composer (Tab inserts, Enter sends; Tab moves focus as usual once text exists); others as chips under the answer. `aria-live` announcement; chips are real buttons.

### 2. Skills registry (SKILL.md, on demand)
- Format: Agent Skills spec (agentskills.io): `name` (<= 64, kebab-case), `description` (<= 1024), body <= ~5k tokens.
- Migration: a new skills table (or relax the id CHECK) with versions, content hash, review state, enabled flag; Admin-only writes.
- Loop: each step lists enabled skills by name + description (~100 tokens each); new tool `load_skill(name)` returns the body once per turn.
- Admin Skills tab: list with search/filters, detail panel (SKILL.md preview, triggers, tools needed, run count), new skill by editor or upload with frontmatter validation; built-in skills can be disabled, not removed.
- Starter skills (owner-reviewed): ESP32 Arduino project planner; sensor wiring and safety check; Arduino library picker; serial/debug triage; PandaByte board pin reference (from listing excerpts). Community skills only after a licence and quality check.

### 3. MCP registry and client
- Remote Streamable HTTP servers only; no stdio/commands on Vercel.
- Migration: server table (name, URL, auth mode, status, pinned tool-definition hash, per-tool allow/ask/never, owner, last test); secrets server-side only.
- Safety: HTTPS only; block private/link-local addresses and re-check every redirect (reuse the DNS checks in `src/search/tavily.ts`); never forward the user's Clerk token; disable a tool when its definition hash changes until an Admin re-approves; cap tool output (e.g. 4 KB) and treat it as untrusted data; per-turn call cap.
- Loop: enabled tools offered as `<server>_<tool>`; "ask" tools pause for an in-chat approval card.
- Admin MCP tab: add server (name, URL, auth) -> Test connection lists tools before Save; detail panel with health, last test, per-tool switch and level, recent calls.
- New dependency (official MCP TypeScript SDK) to be confirmed before adding.

### 4. Datasheet and pinout retrieval
- Index maker datasheets for catalogue boards/modules as text with page numbers (reviewed, like the Espressif excerpts).
- Store links to official pinout/schematic images (or owner images cleared for redistribution).
- Tools: `find_pinout(sku)` / `read_datasheet(sku, topic)`; optional vision read of one page.
- Wire the existing embeddings (hybrid lexical + dense) for "same meaning, different words".

### 5. Harness upgrades (from OpenCode / Claude Code)
- Clear old tool results after use (keep the call, drop the bulky output).
- Per-tool output caps; lazy skill loading (phase 2).
- Plan/todo tool for multi-step projects, shown as a checklist.
- Web-research helper in its own context returning a short summary.
- Allow/Ask/Never approval cards.

### 6. Device tools (later)
- Compile with `arduino-cli` in a container on the AWS host.
- Flash from the user's browser with Espressif `esptool-js` over Web Serial after explicit confirmation (Chrome/Edge; check Brave).

## Not chosen
- Page-image embeddings (ColQwen / Jina v4: research or non-commercial licences, GPU; revisit Voyage multimodal later).
- Mirroring the official MCP Registry (preview, no private servers).
- Copying affectUI Pro code; the Admin page uses original components inspired by its patterns.
