# DRAFT visual-ingestion transcription: PandaByte xC6 (SKU ESPXC6)

Review draft only, 13 Nov 2026. Nothing here is ingested or used by the product. Photos were viewed in the browser
and enlarged in sections; no image file was saved. Labels are copied as printed; no GPIO function, voltage or
electrical meaning is inferred.

Product page: https://www.pandabyte.in/product-page/pandabyte-xc6-esp32-c6-microcontroller-board-arduino-compatible

## Images

| # | Image (prefix `static.wixstatic.com/media/3e946a_`) | Size | Shows |
|---|---|---|---|
| 1 | `0ab04075c7b8401792f31ca121d906d3~mv2.jpg` | 767 x 767 | Component side, antenna at the top |
| 2 | `c78b836f7e1e4df8958f0910a324870c~mv2.jpg` | 807 x 807 | Board back, antenna at the top |

Left and right mirror between the two photos: the left row in image 1 is the right row in image 2.

## Printed names

- Back: "GeekyBoard xC6", "V1.0", panda logo, and three lines "B1 - 22", "LED - 3", "RGB - 23" (high).
- Back, module underside strip at the top: "ESP32-C6-WROOM-1 V1.2" (medium: the line is partly clipped at the
  edge), HF / Pb-free / WEEE-style symbols, and a boxed number that starts "233" [unclear after that].
- Front shield: "ESPRESSIF", "ESP32-C6-WROOM-1" (trailing characters after "-1" are faint; medium),
  "FCC ID: 2AC7Z-ESPC6WROOM1", "IC ID: 21098-ESPC6WROOM1", "CMIIT ID:" with no value, a line of Chinese company
  text (not transcribed), "MAN8" (high for FCC/IC/MAN8 lines).
- Front: large IC marked "CH340C" (medium-high).

## Header labels, image 1 (component side, antenna up)

Two headers of 16 pads each. The top pad of each row is a square pad.

| Pos (top to bottom) | Left row | Right row |
|---|---|---|
| 1 (square pad) | 3V3 (boxed, rotated; medium) | GND (boxed; high) |
| 2 | EN | TX |
| 3 | 4 | RX |
| 4 | 5 | 15 |
| 5 | 6 | 23 |
| 6 | 7 | 22 |
| 7 | 0 | 21 |
| 8 | 1 | 20 |
| 9 | 8 | 19 |
| 10 | 10 | 18 |
| 11 | 11 | 9 |
| 12 | 2 | GND |
| 13 | 3 | 13 |
| 14 | VCC | 12 |
| 15 | VCC | GND |
| 16 | GND | GND |

Image 2 (back) shows the same strings mirrored: its left row is GND, TX, RX, 15, 23, 22, 21, 20, 19, 18, 9, GND, 13,
12, GND, GND and its right row is a boxed label that looks like 3V3, then EN, 4, 5, 6, 7, 0, 1, 8, 10, 11, 2, 3, VCC,
VCC, GND. This agrees with image 1.

Confidence: positions 2 to 16 of both columns high (numbers, EN, TX, RX, GND, VCC). Position 1 left (3V3) medium,
boxed and rotated, read in both photos.

## Connectors, buttons, LEDs (image 1, bottom)

- Two USB Type-C connectors side by side at the bottom. Silkscreen under them: "UART" (left) and "USB" (right).
  High for the words; medium for whether each word names the connector or the LED beside it.
- Buttons: "Reset" and "Flash" (high), and a third button next to the right header labelled "B1" (high).
- Two small LEDs are visible (one near the centre, one between the connectors); neither has its own legible label
  [unclear].

## Comparison with stored listing text (panda_agent_public_passages ESPXC6)

Stored text already has: chip and memory (ROM 320 KB, HP SRAM 512 KB, 8 MB flash), Wi-Fi/Bluetooth/Zigbee/Thread,
"RST, FLASH, and User Programmable buttons", "Programmable Single Color and RGB LEDs", "Dual USB Type C ports
(1: UART, 2: Native USB)", ESP32-C6-WROOM-1 datasheet link, "Product WiKi" label.

Facts in the photos that are NOT in the stored text:

| Fact | In stored text? |
|---|---|
| All 32 header labels and their order (3V3, EN, TX, RX, VCC, GND pads) | No, no pin list |
| Silkscreen "GeekyBoard xC6 V1.0" | No |
| Back silkscreen "B1 - 22", "LED - 3", "RGB - 23" | No |
| Button silkscreen names "Reset", "Flash", "B1" | Partly ("RST", "FLASH", "User Programmable") |
| "UART" and "USB" captions under the two connectors | Partly (text says UART and Native USB) |
| CH340C marking | No |
| Shield markings, FCC/IC IDs, "MAN8" | Module name only |
| Board marking "V1.0" | No (text says physical revision unknown) |

## Links on the product page (not fetched)

- https://www.espressif.com/sites/default/files/documentation/esp32-c6-wroom-1_wroom-1u_datasheet_en.pdf
  (Official ESP32-C6-WROOM-1 Datasheet; third-party chip document)
- "Explore Wiki Pages" anchor points only to https://www.pandabyte.in/ (no wiki URL). The stored "Product WiKi"
  label has no usable href.
- https://www.youtube.com/@PandaByteInnovations (channel)
- No pinout, PDF or GitHub link on the page.

## Reviewer must check

1. Position 1 left "3V3" and the boxed label at the top of the back photo: confirm on the physical board.
2. Whether "B1 - 22", "LED - 3", "RGB - 23" are GPIO numbers; the photos do not say so. Do not state it without
   owner confirmation.
3. Module underside text "V1.2" and the boxed number.
4. Which LED is the power / UART / USB indicator.
5. That the Chinese line on the shield should be omitted.
6. Whether button "B1" and the stored "User Programmable button" are the same part.
