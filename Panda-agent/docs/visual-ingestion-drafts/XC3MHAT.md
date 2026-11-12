# Draft transcription: XC3MHAT (xC3m Grove Expansion Board Shield HAT)

REVIEW DRAFT. Not ingested, not used by the product. Transcribed by the assistant from the browser view only.

Product page: https://www.pandabyte.in/product-page/xc3m-grove-expansion-board-shield-hat

## Image

One gallery image: `https://static.wixstatic.com/media/3e946a_644af074075f450caaf9b1b9d5f6b6d4~mv2.png` (2000 x 2000).
It is a 3D render of the board (component side up), not a photograph. Orientation: landscape board; the Wi-Fi
style trace logo is at the top left, a long female header on the far left and another beside the logo, three
columns of Grove sockets in the middle-right, and the two power header blocks plus a slide switch at the right
edge. Read in magnified sections.

## Printed text

| Item | Printed text | Confidence |
|---|---|---|
| Board centre-left | "PandaByte", "XC3m HAT", "v1.1" (panda logo above) | high |
| Top-right header block (2 rows x 3 visible pin pairs) | "3V3" above, "GND" below | high |
| Second right header block | "5V" above, "GND" below | high |
| Slide switch, bottom right | "3V3" left, "5V" right, "GROVE VCC" below | high |
| I2C group | "I2C" printed above the box around the right-hand column of sockets; "SCL:0" and "SDA:1" printed below it | high |

## Far-left female header (10 rows, labels at outer left edge)

Top to bottom as far as legible: 0 [partly hidden], 1 [partly hidden], 2 [partly hidden], 3 [partly hidden],
"12" or "13" [unclear], 18, TX, RX, 10, GND.

Confidence: unclear for the first five rows (pin bodies cover the labels), medium for 18, TX, RX, 10, GND.

## Second female header (10 rows, labels printed to the right of its twin pin columns)

3V3, EN, 4, 5, 6, 7, 8, 9, GND, 5V

Confidence: high.

## Grove connectors (9 visible, 3 columns x 3 rows; labels printed vertically above each socket)

| Row (top to bottom) | Left column | Middle column | Right column (I2C box) |
|---|---|---|---|
| 1 | 2, 3, VCC, GND | 6, 7, VCC, GND | 0, 1, VCC, GND |
| 2 | 4, 5, VCC, GND | 8, 9, VCC, GND | 0, 1, VCC, GND |
| 3 | RX, TX, VCC, GND | 18, 19, VCC, GND | 0, 1, VCC, GND |

Confidence: high for every cell.

## Compared with stored text

Stored text (6 passages) says: compatible with PandaByte xC3m; up to 9 Grove connections; selectable 3.3V / 5V;
2.54 mm male headers; additional 3.3V and 5V power headers; a marketing paragraph about 4-pin Grove connectors.
No pin list, no version.

Not in stored text, readable in the render:
- Printed name and version "PandaByte XC3m HAT v1.1".
- Labels of the second header (3V3, EN, 4 to 9, GND, 5V).
- Grove socket label pairs (2/3, 4/5, RX/TX, 6/7, 8/9, 18/19, and 0/1 on the three I2C sockets).
- "SCL:0", "SDA:1" printed under the I2C column, and the "I2C" box.
- Switch printed "3V3 / 5V / GROVE VCC".
The count of 9 Grove sockets agrees with the stored text.

## Document anchors on the product page

Only "Explore Wiki Pages" -> https://www.pandabyte.in/ (site home). No PDF, pinout or datasheet link found.

## Reviewer must check

- Far-left header labels, rows 1 to 5, against the full-size image.
- "v1.1" and "XC3m" spelling and case.
- Render, not a photo; physical revision unknown (the stored text also says so).
- No electrical meaning is inferred from any label.
