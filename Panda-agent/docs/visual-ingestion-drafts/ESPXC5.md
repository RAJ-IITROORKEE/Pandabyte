# Visual ingestion draft: PandaByte xC5 (SKU ESPXC5)

REVIEW DRAFT ONLY, 13 Nov 2026. Not ingested and not used by the product. Photos were viewed in the browser (enlarged
by page scaling); nothing was downloaded. Labels are copied as printed. No GPIO function, voltage or electrical
meaning is inferred from the silkscreen. Text printed inside the pinout diagram (image 3) is recorded as "printed in
the diagram" and kept separate from board silkscreen.

Product page: https://www.pandabyte.in/product-page/pandabyte-xc5-esp32c5-microcontroller-board-arduino-compatible

## Images

| # | Image (prefix `static.wixstatic.com/media/3e946a_`) | Size | Shows |
|---|---|---|---|
| 1 | `0b81fd100cca411084114cca00e19068~mv2.jpg` | 1856 x 1856 | Black board, component face with module; header pads have NO printed labels on this face; antenna at the TOP, USB-C and buttons at the bottom |
| 2 | `ecfda27888db42ff8bfcc8fe20285a96~mv2.jpg` | 1839 x 1839 | Black board back with pin labels; wordmark readable at the top |
| 3 | `1b9d124e19734fd28fbfcfea1ecae697~mv2.png` | 2341 x 2341 | Same back face with colour-coded pinout callouts (diagram built on the photo) |

Images 2 and 3 are the back; image 1 is the front. Left and right mirror between back and front.

## Printed board text

- Images 2 and 3: "PandaByte", "xC5", panda-with-glasses logo, "v1.1" (bottom right, small; medium-high confidence).
- Image 1 module shield: "ESPRESSIF", "ESP32-C5-WROOM-1", "CE", "FCC ID: 2AC7Z-ESPC5WROOM1", "IC: 21098-ESPC5WROOM1",
  "CMIIT ID:" (no value readable), a Chinese company-name line [not transcribed], "MCN8R8" (medium confidence), a 2D
  code. A small certification mark with a code beside "CE" is [unclear].

## Header labels, image 2 (back, wordmark at top), 15 pads per side

| Position (top to bottom) | Left column | Right column |
|---|---|---|
| 1 | GND | GND |
| 2 | 26 | 3V3 |
| 3 | 25 | EN |
| 4 | TX | 2 |
| 5 | RX | 3 |
| 6 | 24 | 0 |
| 7 | 23 | 1 |
| 8 | 15 | 6 |
| 9 | 27 | 7 |
| 10 | 4 | 8 |
| 11 | 5 | 9 |
| 12 | 28 | 10 |
| 13 | 3V3 | 13 |
| 14 | 5V | 14 |
| 15 | GND | 5V |

The first pad on each side has a square outline; not interpreted. Confidence: all 30 labels high (read in enlarged
crops of image 2 and matched against image 3).

## Front photo (image 1) silkscreen

| Item | Printed name | Confidence |
|---|---|---|
| Button, bottom-left | RST (printed rotated) | high |
| Button, bottom-right | BOOT (printed rotated) | high |
| Button, mid-left | IO24 | high |
| LED, lower centre-left | IO23 | high |
| Small LED above it (RGB-looking package) | IO10 | high |
| LED, lower right | PWR | high |
| Connector | USB Type-C (bottom centre) | high |
| Small IC near the regulator area | marking [unclear] | unclear |
| Header pads on this face | no printed labels | n/a |

## Pinout diagram, image 3 (printed in the diagram)

Pills on the diagram's LEFT, per left-header pad (outer to inner):

| Pad label | Pills |
|---|---|
| GND | GND |
| 26 | GPIO26 |
| 25 | GPIO25 |
| TX | TX0, GPIO11 |
| RX | RX0, GPIO12 |
| 24 | BUTTON, GPIO24 |
| 23 | LED, GPIO23 |
| 15 | GPI15 (printed exactly so, one O missing) |
| 27 | GPIO27 |
| 4 | ADC1_3, LP_RX, GPIO4 |
| 5 | ADC1_4, LP_TX, GPIO5 |
| 28 | BOOT, GPIO28 |
| 3V3 | 3V3 |
| 5V | 5V |
| GND | GND |

Pills on the diagram's RIGHT, per right-header pad (inner to outer):

| Pad label | Pills |
|---|---|
| GND | GND |
| 3V3 | 3V3 |
| EN | RST |
| 2 | GPIO2, LP_SDA, ADC1_1 |
| 3 | GPIO3, LP_SCL, ADC1_2 |
| 0 | GPIO0, SDA |
| 1 | GPIO1, SCL, ADC1_0 |
| 6 | GPIO6, CS, ADC1_5 |
| 7 | GPIO7 |
| 8 | GPIO8, MOSI |
| 9 | GPIO9, MISO |
| 10 | GPIO10, SCK, RGB |
| 13 | GPIO13, USB_D- |
| 14 | GPIO14, USB_D+ |
| 5V | 5V |

Here the pills sit on the same side as their pad and line up with the pad labels. The pad number equals the GPIO
number in every row except TX (GPIO11) and RX (GPIO12) as printed in the diagram. Confidence: pill text high; row
alignment high. The diagram says "RST" where the silkscreen says "EN".

## Comparison with stored text (panda_agent_public_passages('ESPXC5'), 8 passages)

Stored text has: ESP32-C5 RISC-V up to 240 MHz, 320 KB ROM, 384 KB HP SRAM, 16 KB LP SRAM, 8 MB Quad SPI flash and
PSRAM, dual-band Wi-Fi 6, Bluetooth 5 LE, Zigbee/Thread, "Switches: RST, FLASH, and User Programmable buttons",
"Single Color and RGB LEDs", the datasheet link, "Physical revision: unknown".

Facts in the photos NOT in the stored text:

| Fact | In stored text? |
|---|---|
| All 30 header pad labels and order | No |
| Header exposes 3V3, 5V, EN, TX, RX, GND pads | No |
| Silkscreen names RST, BOOT, IO24, IO23, IO10, PWR | Partly: text says FLASH, printed name is BOOT |
| USB Type-C connector | No |
| "v1.1" on the back | No ("Physical revision: unknown") |
| Module marking "ESP32-C5-WROOM-1" / "MCN8R8" | Model yes (intro); "MCN8R8" no |
| Diagram pills (GPIO numbers, ADC1_x, LP_SDA/LP_SCL/LP_RX/LP_TX, SDA/SCL, SPI names, USB_D+/-, TX0/RX0, BUTTON, LED, RGB, BOOT) | No |

## Links on the product page (not fetched)

- Official ESP32-C5-WROOM-1 Datasheet: https://documentation.espressif.com/esp32-c5-wroom-1_wroom-1u_datasheet_en.pdf
- "Explore Wiki Pages": https://www.pandabyte.in/ (site root)
- "Product Wiki": text with NO href (label only)
- No PDF, GitHub, schematic or other pinout link.

## Reviewer must check

1. "v1.1": confirm it is the board revision and whether "Physical revision: unknown" should change.
2. Diagram "GPI15" is a misprint in the diagram, not a board label (board pad reads "15").
3. Image 1 has no pad labels, so pad labels come from the back only; confirm pad correspondence (mirror) before
   relating front-face parts to pad labels.
4. Front names IO10/IO23/IO24 versus the diagram's RGB (GPIO10), LED (GPIO23), BUTTON (GPIO24): they agree, but the
   pairing is between two images, not printed on the board.
5. Diagram uses "RST" for EN and "TX0"/"RX0" for the pads labelled TX/RX (GPIO11/GPIO12); confirm naming.
6. Shield FCC/IC/CMIIT lines are partly unreadable; do not ingest. "MCN8R8" is medium confidence.
7. Image 3 is an edited image; the owner must say if it is authoritative.
