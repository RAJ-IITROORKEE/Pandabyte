# Visual ingestion drafts: review pack (13 Nov 2026)

Thirteen draft transcriptions of listing photos, written by five Sonnet 5.5 subagents for owner review.

Status, 13 Nov 2026 (later the same day): the owner approved "Ingest suggested five". INGESTED and live: the header tables of
ESPX8266, ESPXC5, ESPXC6, ESPXS3 and ESPXC3M (migrations 20261113110000 and 20261113110001, 290-member candidate), plus the
earlier xC3 pilot passage. Only header labels and printed names were ingested; the pinout diagrams, front-photo silkscreen
names (except xC3m's) and printed marks beyond the board name were not. In ESPXS3 the two top-left labels were no reader
could confirm are stored as "not legible in the photo" (the draft's 3V3 was an inference). Every other draft below is
still NOT ingested. xC6, xS3 and xC3m were independently re-read blind by a second agent (no mismatches; the xS3 two
cells unconfirmed); x8266 and xC5 were checked by me against the full-size photo.
Ingesting a batch is one more migration (new sealed candidate, dual-accept code, switch), so each product below needs
the owner's explicit yes first. A misread pin label would make the agent give wrong wiring advice with a citation, so
the bar is accuracy, not coverage.

## What was checked

- Checked by me against the full-size photo: **ESPX8266** (all 30 header labels, back photo) and **ESPXC5** (all 30
  header labels and "v1.1", back photo). Both matched the drafts exactly.
- Everything else is the subagent's own reading, not independently checked. Each draft has confidence notes and a
  "Reviewer must check" list.
- Method limit: the browser zoom only crops, so agents enlarged images with page scaling. Photos are 800 to 2300 px.

## Recommendation

| Draft | Evidence | Recommendation | Main caveat |
|---|---|---|---|
| ESPX8266 | Two photos | Ingest after owner yes | Verified 30/30 by me. LED name near B1 unclear (not needed). |
| ESPXC5 | Three images | Ingest header table after owner yes | Verified 30/30 by me. Diagram prints "GPI15" (misprint) and uses RST for EN: keep the diagram out or labelled as the listing's drawing. |
| ESPXC6 | Two photos | Ingest after owner yes, with the one medium pad marked | 31 of 32 high; the boxed top-left "3V3" pad is medium. Not independently checked. |
| ESPXS3 | Two photos and a pinout diagram | Ingest after owner yes | 42 of 44 high; two boxed labels medium. The diagram is the listing's drawing, not silkscreen, and adds GPIO function tags. Not independently checked. |
| ESPXC3M | Two photos and a diagram | Ingest the header table only | 20 header labels high. The diagram's callouts sit on the opposite side from the silkscreen: do NOT ingest the diagram rows until checked against a real board. |
| ESPX32 | Two photos | Hold | Three labels unclear and three medium at the row ends (look like 3V3 / 5V / 3V3 and VCC); needs a closer photo or the board. |
| XLORA | Two photos | Hold | About 18 of 80 cells unclear or medium, including the square corner pads and bottom pads that look like 5V. |
| MAKERUNO | Photos 800 px | Hold | Power header sockets 1, 7, 8 unclear, a button label and the chip number line unclear. Cytron's wiki page is the better source. |
| XC3MHAT, X32SHIELD, NODEMCUHAT | One 3D render each | Do not ingest as photo evidence | Renders show the design, not the shipped board; several labels medium or unclear. |
| xC3KITV2 | Marketing graphic | Skip | Adds only "Active Buzzer". |
| LORAKIT | Marketing graphic | Skip | The graphic disagrees with the stored text (Dupont "5 Units" vs "5 Packs"; "USB Type-C" vs "USB Cables"): the listing itself needs the owner's attention. Contact details printed in the graphic are not transcribed. |

## Cross-cutting findings

- No product page links a PandaByte pinout PDF. The "Product WiKi" text has no link and "Explore Wiki Pages" goes to the
  site home. Only Espressif chip datasheets are linked (third-party; out of scope until the owner decides on official
  chip documents). Maker UNO links Cytron's product wiki.
- Stored listing text has no pin list for any board.
- Silkscreen names differ from the stored text (printed "BOOT" and "BUT" vs stored "FLASH" and "User programmable").
  Drafts record both; ingestion should keep printed names labelled as printed.
- xC5 back photo shows "v1.1" while the stored text says the revision is unknown; a photo mark is not a verified
  physical revision, so any ingestion should say "printed mark", not "revision".

## Decision for the owner

Approve which drafts to ingest (suggested: ESPX8266, ESPXC5, ESPXC6, ESPXS3 and the ESPXC3M header table), and say
whether the held ones should get better photos or a board-in-hand check first.
