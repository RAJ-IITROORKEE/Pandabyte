# Visual ingestion draft: PandaByte x32 (SKU ESPX32)

REVIEW DRAFT, 13 Nov 2026. Not ingested and not used by the product. Written from two listing photos viewed in the
browser (magnified 2x to 3x; no files saved). Format follows `../visual-ingestion-pilot-xc3.md`.

Product page: https://www.pandabyte.in/product-page/esp32-x32-microcontroller-board-arduino-compatible

## Images

| # | Image | Natural size | Shows |
|---|---|---|---|
| 1 | `static.wixstatic.com/media/3e946a_34ebb5e8a6d341e59b0151bf16f54268~mv2.jpg` | 1835 x 1835 | Board front (component side), antenna at the top |
| 2 | `static.wixstatic.com/media/3e946a_5c083a6b0ba64017a807b085ba05440e~mv2.jpg` | 1793 x 1793 | Board back, antenna at the top |

Left/right are as seen in each photo. Front and back are mirrored: the left row in image 1 is the right row in image 2.
Labels are copied as printed. No GPIO number, function or voltage is claimed from any label.

## Transcription, image 2 (back, antenna at the top, text upright when the photo is turned)

Printed text: "GeekyBoard x32", "V1.1", a panda logo, and a white box reading "B1 - 4", "LED - 2", "RGB - 12".
Header labels sit beside the pads and are printed sideways (they read top-to-bottom, rotated). Two rows of 20 pads.

| Position (top to bottom) | Left row label | Right row label |
|---|---|---|
| 1 | GND | GND |
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
| 15 | 15 | GND |
| 16 | GND | GND |
| 17 | GND | GND |
| 18 | [unclear: 3 characters, resembles 3V3] | VCC |
| 19 | [unclear: 2 characters, resembles 5V] | VCC |
| 20 | [unclear: 3 characters, resembles 3V3] | VCC |

Row confidence:
- Left rows 1-17: high (TX, RX read clearly; "GND" on position 1 is a boxed label, medium-high).
- Left rows 18-20: unclear. The boxed glyphs are blurred; 3 characters / 2 characters / 3 characters wide.
- Right rows 1-14: high. Right rows 15-17 GND: high. Right rows 18-20 "VCC": medium-high (letters V, C, C visible, blurred).
- Count of 20 pads per row was counted from labels and pad spacing; cross-checked against image 1 (below).
- Printed names "VP" and "VN" are exactly as printed.

Centre box: "B1 - 4", "LED - 2", "RGB - 12" (high). The photo does not say what the numbers mean; no interpretation here.

## Transcription, image 1 (front, antenna at the top)

Header labels are printed sideways on the inner side of each row, pads on the outer edge. Mirrors image 2.

Left row, top to bottom (equals image 2 right row): GND (boxed, corner; medium), EN, VP, VN, 34, 35, 32, 33, 25,
26, 27, 14, 12, 13 (all high), GND, GND, GND (high), VCC (high), one pad with no label read [unclear], then a boxed
label that resembles VCC (medium).
Right row, top to bottom (equals image 2 left row): GND (boxed, corner; medium), 23, 22, TX, RX, 21, 19, 18, 5, 17,
16, 4, 0, 2, 15 (high), GND, GND (medium-high), then three boxed labels [unclear, resemble 3V3 / 5V / 3V3].

- Module shield: "ESPRESSIF" (medium). Model line below it is [unclear]; it appears to begin "ESP32-" but the rest
  is not readable at this size. Other shield markings (CE mark, QR-like block) not transcribed.
- Bottom edge: button labelled "RST" (bottom-left, high); button labelled "B1" (upper right, high); button labelled
  "Flash" (lower right, high); USB Type-C connector (shape; no printed text).
- One RGB-style LED package left of the USB connector and a yellow component near the left row; no printed names on
  them that I could read. [unclear]

## Compare with stored text (public passages for ESPX32, 9 passages)

Stored text covers: WROOM-32 module, WiFi/Bluetooth, onboard single-colour LED, RGB LED (WS2812B), "a dedicated
switch", interfaces list, buttons "RST, FLASH, and User Programmable", 4 MB flash, 3.3 V, datasheet link.

Facts from the photos NOT in stored text:

| Fact | In stored text? |
|---|---|
| All 40 header pad labels and their order (incl. EN, VP, VN, TX, RX, 5, 15, 25-27, 32-35, VCC, GND) | No, there is no pin list |
| Silkscreen "GeekyBoard x32" and revision mark "V1.1" | No (text says "Physical revision: unknown") |
| Back-box text "B1 - 4", "LED - 2", "RGB - 12" | No |
| Button silkscreen names "RST", "B1", "Flash" | Partly: text says "FLASH" and "User Programmable", not "B1" |
| USB connector is Type-C | No |
| Header has both GND, VCC and (probably) 3V3/5V pads | No |
| Both rows are 20 pads | No |

## Product page documents

Anchors found: "Official ESP32-WROOM-32E Datasheet" -> https://documentation.espressif.com/esp32-wroom-32e_esp32-wroom-32ue_datasheet_en.pdf
(third-party chip document). "Explore Wiki Pages" -> https://www.pandabyte.in/ (site home, not a pinout or wiki
page). The text "Product Wiki" has no href. No PandaByte PDF, pinout or GitHub link found. Not fetched.

## Reviewer must check

1. Left row positions 18-20 on the back (and front right row last three): are they 3V3, 5V, 3V3? Check the full-size photo.
2. Back right row last three: confirm VCC, VCC, VCC (not e.g. 5V or VIN).
3. Front photo: the unlabelled pad and the shield model line ("WROOM-32E?" vs "WROOM-32"). The stored text says WROOM-32; the datasheet link says WROOM-32E.
4. Corner boxed label on each row reads "GND" at low resolution on both photos.
5. Whether "B1 - 4 / LED - 2 / RGB - 12" should be ingested as printed text only, since the meaning is not stated in the photo.
6. Reconcile silkscreen "B1" and "Flash" with the stored names "User Programmable" and "FLASH".
7. Row order: positions are counted from the antenna end in each photo; left/right mirror between front and back.
