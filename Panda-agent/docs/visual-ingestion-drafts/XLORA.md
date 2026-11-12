# Visual ingestion DRAFT: PandaByte xLoRa (SKU XLORA)

REVIEW DRAFT ONLY. Not ingested, not used by the product. Transcribed 13 Nov 2026 by an assistant viewing the
listing photos enlarged in the browser (no files saved). Reviewer must verify against the full-size photos.

Page: https://www.pandabyte.in/product-page/pandabyte-xlora-esp32-lora-microcontroller-board-arduino-compatible
Photo base: `https://static.wixstatic.com/media/3e946a_<id>`

| # | Photo id | Size | Shows |
|---|---|---|---|
| 1 | `c485b6ac03f941f294bcf0c33d1b2914~mv2.jpg` | 1821 x 1821 | Component side, ESP32 module end at top |
| 2 | `b6f40d5dcbc4484599f44e45928c1d81~mv2.jpg` | 1890 x 1890 | Back side, same end at top, LoRa module on this side |
| 3 | `4eaf0f6d3d1a4ab4b98047af27773162~mv2.jpg` | 719 x 719 | Usage photo: board with antenna wire, solar panel and Li-ion pack |

Left and right MIRROR between photo 1 (component side) and photo 2 (back). Labels below say which photo they come from.
The photos do not state that a number is a GPIO number; none is claimed. No electrical meaning is inferred.

## Photo 1 (component side, ESP32 module at top)

Module shield: "ESPRESSIF", "ESP32-WROOM-32E" (high). Smaller certification lines: [unclear].
Pin labels are printed rotated 90 degrees beside each pad, 20 pads per side. The top pad on each side is square.

| Pos (top to bottom) | Left row | Right row |
|---|---|---|
| 1 (square pad) | [unclear] boxed symbol, resembles "G" | [unclear] boxed symbol, resembles "G" |
| 2 | EN | 23 |
| 3 | VP | 22 |
| 4 | VN | TX |
| 5 | 34 | RX |
| 6 | 35 | 21 |
| 7 | 32 | 19 |
| 8 | 33 | 18 |
| 9 | 25 | 5 |
| 10 | 26 | 17 |
| 11 | 27 | 16 |
| 12 | 14 | 4 |
| 13 | 12 | 0 |
| 14 | 13 | 2 |
| 15 | G | 15 |
| 16 | G | G |
| 17 | G | G |
| 18 | 5V | [unclear] boxed, resembles "5V" |
| 19 | 5V | [unclear] boxed, resembles "5V" |
| 20 | 5V | [unclear] boxed, resembles "5V" |

"G" is printed in a box as a single letter (not "GND").
Confidence: rows 2 to 17 left and right high; left 5V rows high; right rows 18 to 20 medium/unclear (same glyph shape as
the left "5V" at low resolution; photo 2 shows the equivalent labels clearly as 5V); row 1 both sides unclear.

Other silkscreen and parts, bottom of board:
- Two-pin JST-style battery connector at lower left with a "+" mark beside it (type by appearance, no text) (medium).
- Button labelled "RST", lower left (high).
- USB Type-C connector, bottom centre (by appearance; no text) (high).
- Two buttons at lower right. The lower one is labelled "Flash" (high). The upper one has a small boxed label that is [unclear] (may read "B1"; compare photo 2 "B1 - 4").

## Photo 2 (back side; left/right mirrored vs photo 1)

Shield text on the LoRa module: "Ra-01H" (high), "Ai-Thinker" (high, with logo). Other lines are printed rotated and
partly legible: a line containing "PA: +15dBm" [unclear], "LoRa/FSK/OOK" (medium), an "ISM ..." line [unclear].
Also visible: a u.FL style antenna socket (by appearance, no text) and the "PandaByte" wordmark with panda logo (high).

| Pos (top to bottom) | Left row (as seen in photo 2) | Right row (as seen in photo 2) |
|---|---|---|
| 1 (square pad) | [unclear] | [unclear] boxed, resembles "G" |
| 2 | 23 | EN |
| 3 | 22 | VP |
| 4 | TX | VN |
| 5 | RX | 34 |
| 6 | 21 | 35 |
| 7 | 19 | 32 |
| 8 | 18 | 33 |
| 9 | 5 | 25 |
| 10 | 17 | 26 |
| 11 | 16 | 27 |
| 12 | 4 | 14 |
| 13 | 0 | 12 |
| 14 | 2 | 13 |
| 15 | 15 | G |
| 16 | G | G |
| 17 | G | G |
| 18 | [unclear] | 5V |
| 19 | [unclear] | 5V |
| 20 | [unclear] | 5V |

Confidence: right rows 2 to 20 high (rows 18 to 20 read 5V clearly); left rows 2 to 17 high; left rows 18 to 20 are a
blurred white-on-green block, probably the same labels as photo 1 but not legible here (left row 17 read as G in this
photo by position; medium).
The two photos agree: both sides carry the same label set in mirrored order.

Printed legend near the bottom of the back (high): "B1 - 4", "LED - 2", "RGB - 15".
Near the lower right edge: "+" and "-" marks and a rotated label beginning "BAT" (rest [unclear]) (medium).

## Photo 3 (usage photo)

Printed caption (high): "Battery and Solar Panel Not Included. Buy Seperately." (spelling as printed).
Shows a board with an external wire antenna, a solar panel connected by two wires and an orange Li-ion style pack with a
label ("CAUTION", a barcode); pack text is [unclear]. No pin labels readable.

## Comparison with stored text (public passages for XLORA)

Stored text covers: ESP32-WROOM-32 dual-core Wi-Fi/Bluetooth, onboard single-colour LED, WS2812B RGB LED, "dedicated
switch", battery charging and protection, 40 MHz crystal, 4 MB flash, Ra-01H LoRa details (803~930 MHz, SPI/I2C/UART),
"RST, FLASH, and User Programmable buttons", 3.7 V Li-ion, 6 V solar max 0.5 A.

Facts from the photos NOT in stored text:
- The 40 header labels (both sides) and that the header carries EN, VP, VN, TX, RX, 5V and G pads.
- The legend "B1 - 4", "LED - 2", "RGB - 15" (pairs button, LED and RGB names with numbers; whether these are GPIO numbers is not stated on the board).
- Button silkscreen names "RST" and "Flash"; the third (upper right) button label is unclear; the text calls it "User Programmable".
- Connector types: USB Type-C and a two-pin JST-style battery socket (stored text gives no connector type).
- Shield markings "ESP32-WROOM-32E" (stored prose says WROOM-32; 32E only in a link label) and "Ra-01H Ai-Thinker".
- "PandaByte" silkscreen and a u.FL style antenna socket on the back.
- Caption that battery and solar panel are not included.

## Links on the product page (not fetched)

- Official ESP32-WROOM-32E Datasheet: https://documentation.espressif.com/esp32-wroom-32e_esp32-wroom-32ue_datasheet_en.pdf
- Official RA-01H Datasheet: https://ai-thinker.eu/product/ai-thinker-sx1276-soc-chip-868mhz-ultra-long-distance-wireless-spread-spectrum-lora-module-ra-01h/
- "Explore Wiki Pages": https://www.pandabyte.in/ (home page, not a wiki)
No PandaByte pinout or PDF link found.

## Reviewer must check

1. Square pad 1 symbol on both sides (G or something else).
2. Right-row pads 18 to 20 in photo 1 and left-row pads 18 to 20 in photo 2 are 5V.
3. The upper-right button's printed label in photo 1 and whether it is the "B1" of the legend.
4. Wording of the module lines on the Ra-01H shield and the "BAT" label.
5. That the photos match the current revision (stored text says revision unknown; listing title says "xLoRa V2").
6. "B1 - 4 / LED - 2 / RGB - 15": the board does not say these are GPIO numbers; do not ingest as GPIO unless the owner confirms.
