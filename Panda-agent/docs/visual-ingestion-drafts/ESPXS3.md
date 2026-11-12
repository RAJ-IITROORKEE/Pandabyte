# DRAFT visual-ingestion transcription: PandaByte xS3 (SKU ESPXS3)

Review draft only, 13 Nov 2026. Nothing here is ingested or used by the product. Photos were viewed in the browser
and enlarged in sections; no image file was saved. Labels are copied as printed. The third image is a labelled
pinout diagram; its wording is transcribed separately and comes from the listing drawing, not board silkscreen.

Product page: https://www.pandabyte.in/product-page/pandabyte-xs3-esp32-s3-microcontroller-board-arduino-compatible

## Images

| # | Image (prefix `static.wixstatic.com/media/3e946a_`) | Size | Shows |
|---|---|---|---|
| 1 | `ac9a0f579eb84eb49ef01b3d031ca5c3~mv2.jpg` | 1107 x 1107 | Component side, antenna at the top |
| 2 | `be1c04b7fddc42fe821afb6beb932e07~mv2.jpg` | 1169 x 1169 | Board back, antenna at the top, male header pins fitted |
| 3 | `161816ea894d433d97500808ae2d9c2b~mv2.png` | 2070 x 2070 | Colour pinout diagram of the board |

Left and right mirror between images 1 and 2.

## Printed names

- Back (image 2): "GeekyBoard xS3", "V1.0", panda logo, "B1 - 21", "LED - 2", "RGB - 12" (high for the first
  lines; the third line read from the overview, medium-high).
- Back underside module strip: boxed number reading "2340" (medium), HF/Pb/WEEE-style symbols; the module name line
  is clipped [unclear].
- Front shield (image 1): "ESPRESSIF" and logo legible; all smaller lines (module name, IDs) too small [unclear].
  No module name is read from the photos.

## Header labels, image 1 (component side)

Two headers of 22 pads each.

| Pos (top to bottom) | Left row | Right row |
|---|---|---|
| 1 | 3V3 (boxed, rotated; medium) | GND (boxed; high) |
| 2 | 3V3 (boxed, rotated; medium) | TX |
| 3 | EN | RX |
| 4 | 4 | 1 |
| 5 | 5 | 2 |
| 6 | 6 | 42 |
| 7 | 7 | 41 |
| 8 | 15 | 40 |
| 9 | 16 | 39 |
| 10 | 17 | 38 |
| 11 | 18 | 37 |
| 12 | 8 | 36 |
| 13 | 3 | 35 |
| 14 | 46 | 0 |
| 15 | 9 | 45 |
| 16 | 10 | 48 |
| 17 | 11 | 47 |
| 18 | 12 | 21 |
| 19 | 13 | 20 |
| 20 | 14 | 19 |
| 21 | VCC | GND |
| 22 | GND (boxed, square pad) | GND (boxed, square pad) |

Note on the top two left labels: in the component-side photo they are too small to read. The back photo shows two
boxed labels that read 3V3 in both positions, and the pinout diagram (image 3) labels both as 3V3. Treated as 3V3 with
medium confidence.

The back photo (image 2) shows the same strings mirrored: left row GND, TX, RX, 1, 2, 42 ... 19, GND, GND; right row
3V3, 3V3 (boxed), EN, 4, 5, 6, 7, 15, 16, 17, 18, 8, 3, 46, 9, 10, 11, 12, 13, 14, VCC, GND. Agrees with image 1.

Confidence: numbers, EN, TX, RX, GND, VCC high. Positions 1 and 2 left (3V3) medium. The last GND on each side
(boxed, rotated) medium-high.

## Connectors, buttons, LEDs (image 1, bottom)

- One USB Type-C connector at the bottom centre (high). No "UART"/"USB" caption on this board.
- Buttons: "Reset" (left), "Flash" (right), and "B1" (lower right, beside the right header). High.
- One larger LED in the middle of the board with no label, plus small LEDs without legible labels [unclear].

## Pinout diagram transcription, image 3 (listing drawing)

Text copied as drawn. Function names below come from the diagram, not the silkscreen.

Left side, top to bottom (diagram pad label, GPIO box, extra labels): 3V3; 3V3; RST (at the EN pad); GPIO4 ADC1_3;
GPIO5 ADC1_4; GPIO6 ADC1_5; GPIO7 ADC1_6; GPIO15 ADC2_4; GPIO16 ADC2_5; GPIO17 ADC2_6 TX1; GPIO18 ADC2_7 RX2;
GPIO8 ADC1_7 SDA; GPIO3 ADC1_2; GPIO46; GPIO9 ADC1_8 SCL; GPIO10 ADC1_9 CS; GPIO11 ADC2_0 MOSI;
GPIO12 ADC2_1 SCK and RGB; GPIO13 ADC2_2 MISO; GPIO14 ADC2_3; 5V (at the VCC pad); GND.

Right side, top to bottom: GND; GPIO43 TX0; GPIO44 RX0; GPIO1 ADC1_0; GPIO2 ADC1_1 LED; GPIO42; GPIO41; GPIO40;
GPIO39; GPIO38; GPIO37; GPIO36; GPIO35; GPIO0 BOOT; GPIO45; GPIO48; GPIO47; GPIO21 BUTTON; GPIO20 ADC2_9 U1-CTS
USB_D+; GPIO19 ADC2_8 U1-RTS USB_D-; GND; GND. The drawing also names the Reset, Flash and B1 buttons.

Confidence: high for all diagram text (large, clean print); pad numbers agree with images 1 and 2.
Observed coincidences, not asserted: back "B1 - 21" and diagram BUTTON on GPIO21; "LED - 2" and LED on GPIO2;
"RGB - 12" and RGB on GPIO12.

## Comparison with stored listing text (panda_agent_public_passages ESPXS3)

Stored text has: ESP32-S3 CPU/memory (384 KB ROM, 512 KB SRAM, 16 KB RTC SRAM, 16 MB flash, 8 MB PSRAM), Wi-Fi and
Bluetooth details, "RST, FLASH, and User Programmable buttons", "Programmable Single Color and RGB LEDs", datasheet
link, "Product Wiki" label. It has no ports line and no pin list.

Facts from the photos NOT in the stored text:

| Fact | In stored text? |
|---|---|
| All 44 header labels and order | No |
| Pin-to-function map from the diagram (ADC, TX0/RX0, TX1/RX2, SDA/SCL, CS/MOSI/SCK/MISO, BOOT, LED, BUTTON, RGB, USB_D+/-, U1-CTS/RTS) | No |
| Diagram labels 3V3, 5V (at VCC pad), RST (at EN pad) | No |
| Single USB Type-C port | No |
| "GeekyBoard xS3 V1.0", "B1 - 21", "LED - 2", "RGB - 12" | No |
| Button silkscreen names Reset, Flash, B1 | Partly |
| Male header pins fitted in the back photo | No |

## Links on the product page (not fetched)

- https://documentation.espressif.com/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf (official datasheet, third-party)
- "Explore Wiki Pages" -> https://www.pandabyte.in/ (no wiki URL); the "Product Wiki" label has no usable href
- https://www.youtube.com/@PandaByteInnovations
- No separate pinout PDF, docs or GitHub link; the pinout drawing is image 3 in the gallery.

## Reviewer must check

1. Left positions 1 and 2 (3V3) on the physical board, and that the diagram's 5V at the VCC pad matches the board.
2. Whether the diagram (image 3) is PandaByte-owned and may be a source of function names.
3. Module marking: not read from any photo; fill from the physical board if wanted.
4. The "2340" number on the back module strip (medium).
5. That "B1 - 21 / LED - 2 / RGB - 12" are GPIO numbers, as the diagram suggests.
6. Whether the board is sold with headers fitted (back photo shows them; front photo shows plain through-holes).
