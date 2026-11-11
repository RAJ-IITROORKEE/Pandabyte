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
