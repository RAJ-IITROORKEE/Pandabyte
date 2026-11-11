# Panda Agent: launch gaps and phased plan (12 Nov 2026)

Plan only. Nothing here is implemented or approved yet. Judged as a product for real customers, not a preview.

## Live evidence (pandabyte-iot.vercel.app, owner signed in, 12 Nov)

| Question | Reply |
| --- | --- |
| M5Stack AtomS3 Lite schematic: LED GPIO and Grove pins | "Please include one exact PandaByte product name or model." |
| Latest stable ESP-IDF release, search the web and cite | Same dead-end reply, no search attempted |
| Arduino blink code for the PandaByte xC3 with the LED pin | "The available approved sources do not establish an answer to this question." |
| Which MCU does the PandaByte x8266 use? (earlier) | Correct, with a cited source |
| Plan a battery temperature sensor (earlier) | One uncited paragraph from GPT-OSS 20B |

## Blockers: backend and agent orchestration

| # | Blocker | Evidence |
| --- | --- | --- |
| B1 | No agent loop in production. The live model is called once with tools forbidden. | `src/server/hosted-model-openrouter.ts:179` sends `tool_choice:'none'`; `lightweight-chat.ts:11-27` hardcodes every agent flag `false` |
| B2 | Web search cannot run. The request is rejected, no code path reads the flag, the Tavily client refuses to run in production, and no search key exists in Vercel. | `lightweight-handler.ts:110`; `search/tavily.ts:70`; `vercel env ls` |
| B3 | Two competing agent harnesses. The hosted one (control room, branch `codex/opencode-web-harness`) and a local one (uncommitted, branch `claude/agentic-rag-harness`, based 75 commits behind main). | both branches |
| B4 | The hosted harness is not reachable from the website. Its relay (AWS Lambda + REST API) and the website bridge are not built; its only tool is web search. | control room `phase-d-plan.md`, D3/D4 open |
| B5 | Router dead ends. Any product-like wording forces strict product RAG, which refuses code, pinouts, schematics and comparisons. | `main-rag-chat.ts:67-77`; `conversation-route.ts:32` |
| B6 | Knowledge is product listings only: 42 products, 284 chunks, word matching. Vector search is configured but unwired; uploaded documents never reach customer chat. | `insforge-adapters.ts:79-96`; `config/hybrid-v1.json` |
| B7 | Visual RAG does not exist. No page rendering, no OCR, no vision model call anywhere; the `panda_agent_document_pages` table is never written or read. | `parse-document.mjs:24`; `pdf-text-worker.mjs:3-4` |
| B8 | Corpus is not ready. 98 images and 16 PDFs are captured locally but all marked not reviewed for redistribution; no M5Stack documents or schematics at all. | `rag-documents/resource-manifest.json` |
| B9 | Per-user web search limit exists in the database but nothing calls it. | `panda_agent_web_search_consume` has no caller |
| B10 | Admin cannot configure the agent: model list, default model, search on/off and limits are code or env flags. | `ui/capabilities.ts:8-14`; `app/panda-agent/page.tsx:12-13` |
| B11 | MCP connectors: Admin tab exists with disabled buttons; no table, no client, runtime denies MCP. | `app/admin/agent-skills/agent-skills.tsx:58`; `opencode/execution-runtime.ts:23-24` |
| B12 | Skills: three hardcoded bundles, enable/disable only; the agent never loads one on demand. | `agentic/skills.ts:7-10`; `20261105090002` migration line 3 |
| B13 | No evaluation set for web search, code, documents or images; only x8266 listing questions. | `evaluation/playground/mini-cases.mjs` |
| B14 | Cost and privacy: OpenRouter key is at about $19.5 of $25; free-model training is ON; zero-data-retention is off at account level. | OpenRouter dashboard, earlier check |

## Blockers: UI/UX behaviour

| # | Issue | Evidence |
| --- | --- | --- |
| U1 | No streaming. The answer appears all at once after 5 to 20 seconds. | `chat-stream.ts:3,9` |
| U2 | Dead-end replies give no next step (no suggestions, no offer to search). | live tests above |
| U3 | No clarifying question with choices. | `agentic/controller.ts:128` is plain text only |
| U4 | No regenerate, no edit-and-resend. | none in `workspace.tsx` |
| U5 | Activity is one generic list, not per step; tool calls show name and state only, no input or result. | `workspace.tsx:432-438,471-473` |
| U6 | No "not enough information" state distinct from an answer. | answer contract has `insufficient`, UI does not |
| U7 | Web search has no toggle, no "searching the web" state, no remaining-quota hint. | `workspace.tsx:128,186,352` |
| U8 | Cannot attach an image or PDF to a question. | no file input in `workspace.tsx` |
| U9 | General answers are an unstructured paragraph (no headings, steps, code blocks). | live test |

## Blockers: interface

| # | Issue | Evidence |
| --- | --- | --- |
| I1 | Code blocks have no syntax highlighting and no copy button on main (copy exists only in the uncommitted branch). | `workspace.module.css:182` |
| I2 | Header says "GPT-OSS 20B · Ready" and "PREVIEW"; the page title is "Development Preview". Not customer wording. | live page |
| I3 | Model picker lists models customers cannot use. | `ui/capabilities.ts:8-14` |
| I4 | Sources cannot show a page image or page number. | `retrieval/contracts.ts:63-70` |
| I5 | Mobile and light theme were never checked on the live agent page; keyboard and screen-reader checks not done. | design doc line 50 |
| I6 | Charts are built but never seen in a live answer. | no live case |
| I7 | Error states (limit reached, search failed, model timeout) are generic. | 429 showed as a silent failure before the cap fix |

## Decisions needed from the owner before phase 1

1. One harness: DECIDED by the owner on 12 Nov 2026. The control room's hosted harness is the only production agent; tools and UI pieces are salvaged from the local branch, which is otherwise retired.
2. Search provider: recommend Tavily (free 1,000 credits a month, already built into the hosted harness). The owner creates the account and enters the key; Claude cannot create accounts or handle keys.
3. Default customer model: Haiku 5.5 (also reads images), with a daily spend cap.
4. Document rights: which manufacturer documents (M5Stack, Espressif, Bosch) may be stored and shown.
5. Limits: web searches per user per day, messages per user per day.

## Phased plan (each phase ends with a live test before the next starts)

| Phase | Goal | Main work | Owner | Pass test |
| --- | --- | --- | --- | --- |
| 1 | Hosted agent answers the owner on the website with web search | Real model turn through the host service; AWS relay; website bridge behind an owner-only allowlist; Tavily key on the host; per-user search limit wired | Control room builds; this session tests | ESP-IDF question returns a cited web answer; limit blocks at the cap |
| 2 | One agent, PandaByte tools, no dead ends | Add catalog search, product documents and official chip documents as agent tools; retire the fixed router for allowlisted users; allow code with cited facts; "not enough information" result | This session (tools), control room (harness contract) | The three failed live questions pass; no-data question still refuses |
| 3 | Chat experience | Text streaming; code highlight and copy; per-step tool cards; clarifying question with choices; web toggle and quota hint; regenerate; error states; customer wording | This session | 320/768/1024/1440 px, both themes, keyboard |
| 4 | Visual and document RAG | Render PDF pages to images; vision caption and OCR with Haiku; store pages; embeddings and hybrid search; document-page tool; sources with page thumbnail; image attach in chat; load approved M5Stack/Espressif/Bosch documents | This session | Schematic and datasheet questions answered with page citations; 20-case eval set |
| 5 | Admin control | Settings (default model, search on/off, limits); editable skills with 3 to 4 defaults loaded on demand; MCP connectors (table, encrypted secret, tool allowlist, address safety checks) with one free test server | This session | Admin adds a skill and a connector, agent uses both |
| 6 | Launch | Eval gate across all question types; spend caps and alerts; OpenRouter privacy settings; open to all signed-in users; remove preview labels | Both | Eval pass rate agreed with owner; 100-visitor browse plan unaffected |

## Not checked

- Which env flags are set in production (values are hidden).
- Whether the AWS host and playground stack are up.
- The control room's reply to the status request (queued, unanswered at time of writing).
