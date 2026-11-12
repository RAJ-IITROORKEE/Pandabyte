# Draft transcription: NODEMCUHAT (NodeMCU Grove Expansion Board Shield HAT)

REVIEW DRAFT. Not ingested, not used by the product. Transcribed by the assistant from the browser view only.

Product page: https://www.pandabyte.in/product-page/nodemcu-grove-expansion-board-shield-hat

## Image

One gallery image: `https://static.wixstatic.com/media/3e946a_1053b0370e174024a47284068bb7241d~mv2.png` (2000 x 2000).
It is a 3D render of the board (component side up), not a photograph. Orientation: the Wi-Fi style trace logo
and the two power header blocks are at the top; the Grove connectors run down the right edge. Read in magnified
sections. The render overlaps some labels with parts, so some labels are partial.

## Printed text

| Item | Printed text | Confidence |
|---|---|---|
| Centre of board | "PandaByte", "Compatible with: NodeMCU v3" (panda logo above) | high |
| Top-left header block (2 rows x 4) | "3V3" above, "GND" below | high |
| Second header block (2 rows x 4) | "5V" above, "GND" below | high |
| Parts at top | "RGB" (under it a square LED package), "SW" (tactile switch), "POWER" (small LED/resistor pair) | high |
| Slide switch, bottom right | "GROVE VCC"; "3V" at its left end, "5V" at its right end | high (the switch position shown is not asserted) |

## Left female header column (top to bottom, labels printed at the outer left edge)

A0, GND, VU, S3, S2, S1, SC, SO, SK, GND, 3V, EN, RST, GND, VIN

Confidence: medium. Pin bodies overlap the right end of several labels, so "VU", "SC", "SO", "SK" and "3V" may be
cut off (for example "3V" may be "3V3"). 15 rows.

## Centre female header column (top to bottom, labels printed to the right of it)

D0, D1, D2, D3, D4, 3V, GND, D5, D6 [RGB], D7 [SW], D8, RX, TX, GND, 3V

The bracketed words "[RGB]" and "[SW]" are printed next to D6 and D7. Confidence: high. 15 rows.

## Grove connectors (13 visible, two columns, labels printed vertically above each socket)

Left column, top to bottom:

| # | Printed labels (left to right) | Confidence |
|---|---|---|
| 1 | partly hidden: ends "VCC", "GND"; first two labels [unclear] | unclear |
| 2 | partly hidden: ends "VCC", "GND"; first two labels look like "?X", "?X" [unclear] | unclear |
| 3 | D0, D1, VCC, GND | high |
| 4 | D2, D3, VCC, GND | high |
| 5 | D3, D5, VCC, GND | medium (repeated D3 as read) |
| 6 | D5, D6, VCC, GND | high |
| 7 | D6, D7, VCC, GND | high |

Right column, top to bottom:

| # | Printed labels | Confidence |
|---|---|---|
| 1 | partly hidden: ends "VCC", "GND"; first two [unclear] | unclear |
| 2 | partly hidden, looks like "D8", "D4", VCC, GND [unclear] | unclear |
| 3 to 6 | D1, D2, VCC, GND on each of four sockets, inside a white outlined box labelled "I2C PINS" | high |

Next to the lowest right-hand socket two labels are printed: "D1:SCL" and "D2:SDA". Confidence: high.

## Compared with stored text

Stored text (6 passages) says: compatible with NodeMCU v3; NOT compatible with PandaByte x8266; up to 13 Grove
connections; integrated WS2812B RGB LED and switch (pull-up); selectable 3.3V / 5V; 2.54 mm male headers; extra
3.3V and 5V power headers. It has no pin list.

Not in stored text, readable in the render:
- Both female header pin label lists (above), including that D6 is marked [RGB] and D7 is marked [SW].
- Grove socket labels (D0/D1, D2/D3, D5/D6, D6/D7 pairs) and the four sockets inside an "I2C PINS" box, each D1/D2.
- "D1:SCL" and "D2:SDA" are printed beside the I2C sockets.
- The slide switch is printed "GROVE VCC" with "3V" / "5V" ends.
- Silkscreen "POWER", "RGB", "SW".
The count of 13 Grove sockets agrees with the stored text (7 left, 6 right, as counted in the render).

## Document anchors on the product page

Only "Explore Wiki Pages" -> https://www.pandabyte.in/ (site home, not a document). No PDF, pinout or datasheet link found.

## Reviewer must check

- Compare against the full-size image: the left header labels (VU, SC, SO, SK, 3V) and the four partly hidden Grove labels.
- Confirm "D3, D5" on connector 5 is as printed and not "D4, D5".
- This is a render of a board design, not a photo of the shipped product; the physical revision is unknown.
- Nothing here states electrical function (for example what "VU" or "S1" mean). Do not infer one.
