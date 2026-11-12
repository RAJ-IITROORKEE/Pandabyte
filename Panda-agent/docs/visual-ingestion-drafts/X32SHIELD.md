# Draft transcription: X32SHIELD (x32 xLoRa Grove Expansion Board Shield HAT)

REVIEW DRAFT. Not ingested, not used by the product. Transcribed by the assistant from the browser view only.

Product page: https://www.pandabyte.in/product-page/x32-xlora-grove-expansion-board-shield-hat

## Image

One gallery image: `https://static.wixstatic.com/media/3e946a_b3a8eccafd4146ceb6d6e71df7003f4f~mv2.png` (2000 x 2000).
It is a 3D render of the board (component side up), not a photograph. Orientation: Wi-Fi style trace logo at the
top left; two header columns left of centre; Grove connectors in three columns on the right; slide switch top right.
Read in magnified sections.

## Printed text

| Item | Printed text | Confidence |
|---|---|---|
| Centre left | "PandaByte HAT v1", "Compatible with:", "GeekyBoard x32", "GeekyBoard xLoRa" | high ("v1" medium; line near the edge) |
| Slide switch (top right) | "GROVE VCC"; "3V3" at left end; "5V" at right end (the V is partly hidden) | high / medium for "5V" |
| Bottom right | "I2C" under the right-hand connector column, "PWR" beside a small LED | high |

## Left female header (top to bottom, labels at outer left edge)

GND, EN, VP, VN, 34, 35, 32, 33, 25, 26, 27, 14, 12, 13, GND, GND, GND, 5V, 5V, 5V

20 rows. Confidence: high, except the first GND (partly cut off at the top; medium). Several labels are
partly overlapped by pins at the right end ("GND" shows as "GNL").

## Centre header (two parallel pin columns, labels printed once to the right)

GND, 23, 22 [SCL], TX0, RX0, 21 [SDA], 19, 18, 5, 17 [TX2], 16 [RX2], 4, 0, 2, 15, GND, GND, 3V3, 3V3, 3V3

Bracketed words are printed beside 22, 21, 17 and 16. 20 rows. Confidence: high.

## Grove connectors (16 visible, three columns, labels printed vertically above each socket)

Left column, top to bottom:

| # | Printed labels | Confidence |
|---|---|---|
| 1 | two labels hidden by the housing [unclear], then VCC, GND | unclear |
| 2 | 2, 4, VCC, GND | high |
| 3 | 4, 5, VCC, GND | high |
| 4 | 12, 13, VCC, GND | high |
| 5 | 14, 15, VCC, GND | high |
| 6 | 18, 19, VCC, GND | high |

Middle column, top to bottom:

| # | Printed labels | Confidence |
|---|---|---|
| 1 | 25 (first digit could be "3"), 26, VCC, GND | medium |
| 2 | 27, 32, VCC, GND | high |
| 3 | 33, 34, VCC, GND | high |
| 4 | 34, 35, VCC, GND | high |
| 5 | RX0, TX0, VCC, GND | high |
| 6 | RX2, TX2, VCC, GND | high |

Right column: four sockets inside a white outlined box, each labelled SCL, SDA, VCC, GND; "I2C" printed below the box. High.

## Compared with stored text

Stored text (6 passages): compatible with PandaByte x32 and xLoRa boards; up to 16 Grove connections; selectable
3.3V / 5V; 2.54 mm male headers. No pin list. The count of 16 Grove sockets agrees with the render (6 + 6 + 4).

Not in stored text, readable in the render:
- Both header label lists, with [SCL], [SDA], [TX2], [RX2] markings.
- The label pairs of every Grove socket, including RX0/TX0, RX2/TX2 and SCL/SDA.
- Silkscreen "PandaByte HAT v1", "Compatible with: GeekyBoard x32 / GeekyBoard xLoRa", "GROVE VCC", "PWR", "I2C".

## Document anchors on the product page

Only "Explore Wiki Pages" -> https://www.pandabyte.in/ (site home). No PDF, pinout or datasheet link found.

## Reviewer must check

- Top-left Grove socket labels (hidden) and middle-column socket 1 (25 vs 35).
- Whether "v1" is right in "PandaByte HAT v1".
- The centre block has two pin columns but one label per pair; which pin a label belongs to is not stated, so do not claim it.
- Render, not a photo; physical revision unknown. No electrical meaning is inferred.
