# Espressif datasheet excerpts (live since 13 Nov 2026)

Owner request, 13 Nov 2026: find the Espressif documents linked from the product pages and ingest them.

## What is live

- 105 excerpts from the five module datasheets linked on PandaByte product pages, stored under each board's product source
  as version scope `technical`: ESP32-C3-WROOM-02 (xC3, xC3m), ESP32-WROOM-32E/32UE (x32, xLoRa), ESP32-C5-WROOM-1 (xC5),
  ESP32-C6-WROOM-1 (xC6), ESP32-S3-WROOM-1 (xS3). ESP8266 links only an HTML product page and is not ingested.
- Corpus candidate: 395 members, manifest `02d39754...` (migrations 20261113120000 and 20261113120001).
- Answers that cite an excerpt carry "Includes Espressif datasheet excerpts (module maker's data, not a PandaByte board
  guarantee)" instead of "Verified from the PandaByte listing". The model is told to name the datasheet as the source.
- The anonymous catalog read (`panda_agent_public_passages`) excludes `technical` versions: still 288 listing passages.

## How each excerpt was made

1. `<doc>.json`: an agent chose line ranges of the PDF text layer (pin tables, strapping/boot, ratings, DC
   characteristics, current, RF, variants).
2. The PDF text layer is damaged for tables (decimal points displaced, columns scrambled), so `<doc>.md.json` was
   transcribed from the pages rendered at 160 DPI, one agent per datasheet.
3. A number check confirmed every number token in every excerpt occurs in that page's text layer (2,078 tokens,
   0 failures). I spot-checked the xS3 pin table notes against the rendered page.

## Limits

- Excerpts, not whole datasheets: RX sensitivity, EVM, timing, schematics and dimension drawings are mostly not included.
- Two transcribers added a short orienting parenthesis (C5 boot-mode bold note; C6 two-column note), and the C6
  `pin-layout` excerpt is a table derived from a figure; review these if strict verbatim text is required.
- Module data is not the board's wiring; the PandaByte board's own pin labels are the photo passages in
  `../visual-ingestion-drafts/`.
- A board's answer sends the 5 or 6 most relevant passages (12 KB source budget, 18 KB request cap), not all of them.

## Rollback

Inverse replace in `panda_agent_runtime_candidate()`: `02d39754...` -> `a394ce08...` and `<>395` -> `<>290` (the 290
candidate is intact). This was done once on 13 Nov while the request cap was fixed, then re-applied.
