# Panda Agent chat UI plan (12 Nov 2026)

Reference: affectUI (affectui.com), viewed in the browser on 12 Nov 2026. Phase 3 of [the launch plan](agent-launch-gaps-and-plan.md).

## Licence rules

- **Free items are MIT** (affectUI Terms, "Free items"; repo `flohoeller/affectui`). We may adapt them and must keep the MIT notice at the top of each adapted file.
- **Pro items** (AI Answer, Chat Composer, Thinking State, Cited Answer, Agent Plan, Agent Trail, Model Picker, Permission Request, Approval Card) are paid. Their source is never fetched, copied or reconstructed. We only take the visible behaviour from the public preview and build our own code with our own tokens, markup and wording.
- Everything uses PandaByte theme tokens (`--surface`, `--divider`, `--muted`, `--foreground`, `--accent-ink`, `--status-soft`, `--focus-ring`), light and dark, Lucide icons only, no new dependencies.

## What each block becomes

| Our block | Reference | Source of code | Data it uses today |
| --- | --- | --- | --- |
| Thinking panel: live timer, steps appearing one by one, sources read, collapses to "Worked for 7s" | Thinking State (Pro) | Our own | SSE `activity` stages, `context` summary, citations after save |
| Working pill: spinner and shimmering phase label, settles on a check | Thinking Loader (free) | MIT adaptation | Latest stage label |
| Tool calls: "Used 2 tools · 1.4s" line that opens into one row per tool with status and time | Tool Call Card + Tool Call Group (free) | MIT adaptation | SSE `tool` events (tool id, state); no arguments or results yet |
| Cited answer: numbered source cards above the answer, citation chips that preview the quote, source tabs with Open source and Copy quote | AI Answer and Cited Answer (Pro) | Our own | Saved citations `{id,title,sourceUrl,quote,sectionPath,capturedAt}` |
| Message actions: Copy, Try again, Read aloud | Message Actions (free) | Restyle ours; adapt MIT only if it fits | Existing handlers |
| Composer: one rounded card, text area, bottom row with model pill, mic and round send | Chat Composer (Pro) | Our own (restyle current) | Existing composer |

Deferred until the hosted agent sends the data: Agent Plan / Progress Tracker (needs a plan), Permission Request (needs approvals), Related follow-ups (needs suggestions), feedback thumbs (needs storage), tool arguments and results.

## Build order

1. Thinking panel and working pill (replaces the current Activity line and Shimmer).
2. Cited answer (replaces source chips and the Sources list).
3. Tool calls (replaces ToolProgress and SavedToolCards).
4. Composer and message actions restyle.
5. Development-only preview page with fixtures, so every state can be checked locally without the live database.

## Checks

- Unit tests for any parser or state logic (timer formatting, phase selection, citation mapping).
- Typecheck and lint.
- Preview page at 375, 768, 1024 and 1440 px in light and dark; keyboard through chips, tabs and tool rows; reduced motion stops the shimmer and spinner.
- Live test on pandabyte-iot.vercel.app with Haiku and GPT-OSS after deploy.

## Live test run, 12 Nov 2026 (pandabyte-iot.vercel.app, owner account)

| # | Prompt | Model | Result |
| --- | --- | --- | --- |
| 1 | Tell me about the Panda world | GPT-6 Luna | Pass, asked which meaning (5s) |
| 2 | ESP32 Wi-Fi + MQTT flowchart | DeepSeek V4 Flash | Pass, mermaid flowchart + 3 points (6s) |
| 3 | DHT22 to ESP32 wiring diagram | Haiku | Pass after receipt-limit migration: wiring diagram, steps, code, safety callout (8s) |
| 4 | Arduino IDE setup for ESP32 | Qwen 3.8 27B | Pass after 1 MB stream fix (19s) |
| 5/11 | ESP32 current bar chart | GPT-6 Luna | Pass after chart series-name limit 40→80 (8s) |
| 6 | 3 beginner IoT projects with parts and tools | GPT-OSS 20B | Pass (4s); no PandaByte kit links yet |
| 7 | What is the PandaByte xC3? | Haiku | Pass, cited, compact "3 sources" accordion (6s) |
| 8–9 | Which PandaByte boards do you sell? → recommended option | Haiku | Pass, 6 options then a 9-board table (2s each) |
| 10 | Latest stable ESP-IDF release | Haiku | Pass after pronoun follow-up fix: honest "cannot check live sources" (8s) |
| 12 | I2C register read sequence diagram + mistakes | DeepSeek V4 Flash | Pass (9s) |
| 13 | Try again on #12 | DeepSeek V4 Flash | Pass |

Fixed during the run: router dead-ends on chip names and bare "it"; Gemini Flash replaced by DeepSeek V4 Flash (Gemini keeps prompts for safety review); answer-size receipt limits (migration 20261112110000); 64 KB stream cap; chart series names; Haiku default.

## Remaining for the agent UI

1. Chats with a failed turn stay "blocked" in the sidebar until the pending request is checked or cancelled; offer a one-click recovery.
2. Chart polish: wrap long x labels, optional log scale for values spanning several orders of magnitude.
3. Voice input in Brave: record audio and transcribe on the server with a zero-retention speech model (Brave ships without the browser speech service).
4. Sidebar, settings and Admin evaluation screens in the affectUI style (own code for Pro designs).
5. Web search toggle and research answers: control room branch `codex/opencode-web-harness` (D4, 771e290), not yet on main.
6. PandaByte kit suggestions in general answers need catalog tools (launch plan phase 2).
7. Multi-agent lanes, plan view and approvals need data from the hosted harness.
