# Visual ingestion draft: PandaByte xC3m (SKU ESPXC3M)

REVIEW DRAFT ONLY, 13 Nov 2026. Not ingested and not used by the product. Photos were viewed in the browser (enlarged
by page scaling); nothing was downloaded. Labels are copied as printed. No GPIO function, voltage or electrical
meaning is inferred from the silkscreen. Text printed inside the pinout diagram (image 3) is recorded as "printed in
the diagram" and kept separate from board silkscreen.

Product page: https://www.pandabyte.in/product-page/pandabyte-xc3m-esp32-c3-microcontroller-board-arduino-compatible

## Images

| # | Image (prefix `static.wixstatic.com/media/3e946a_`) | Size | Shows |
|---|---|---|---|
| 1 | `b796f3587814419d9e0ccda8f3385602~mv2.jpg` | 1717 x 1717 | Green board, face WITHOUT the radio module (buttons, LEDs, USB-C), USB at the bottom |
| 2 | `dcf91ed0946b4ad98ad0cfad0d9b9751~mv2.jpg` | 1672 x 1672 | Green board, module face, PCB antenna at the TOP |
| 3 | `a9e6750a8feb48128a970890602906a2~mv2.png` | 2156 x 2156 | Black rendered board with colour-coded pinout callouts (a diagram, not a photo) |

Images 1 and 2 are opposite faces of the board, so left and right mirror between them: the header on the left in
image 1 is on the right in image 2. Image 3 shows the same face as image 1.

## Printed board text

- Image 1: "Geeky Board" (two words here; the xC3 pilot read "GeekyBoard"), "xC3m".
- Image 3 (render): "PandaByte", "xC3m". Image 2: panda-with-glasses logo, no wordmark read.
- Image 2 module shield: "ESPRESSIF", "ESP32-C3-WROOM-02", "FCC ID: 2AC7Z-ESPC3WROOM" (tail partly unclear),
  "IC: 21098-ESPC3WROOM" (tail partly unclear), "CMIIT ID:" followed by digits [unclear], a Chinese company-name
  line [not transcribed], "M4N4", a 2D code.

## Header labels, image 1 (silkscreen, USB at bottom), 10 pads per side

| Position (top to bottom) | Left column | Right column |
|---|---|---|
| 1 | 0 | 3V |
| 2 | 1 | EN |
| 3 | 2 | 4 |
| 4 | 3 | 5 |
| 5 | 19 | 6 |
| 6 | 18 | 7 |
| 7 | TX | 8 |
| 8 | RX | 9 |
| 9 | 10 | G |
| 10 | G | 5V |

The top-right label is printed "3V" (not "3V3") in images 1 and 2; "G" is printed for ground. Image 2 shows the same
labels on mirrored sides (left: 3V, EN, 4, 5, 6, 7, 8, 9, G, 5V; right: 0, 1, 2, 3, 19, 18, TX, RX, 10, G).

Confidence: all 20 pad labels high (read in enlarged crops of images 1 and 2; both agree). "3V" is printed as "3V": high.

## Components and silkscreen names (image 1)

| Item | Printed name | Confidence |
|---|---|---|
| Button, top-left | RST | high |
| Button, top-right | BOOT | high |
| Small LED between them | Power | high |
| Button, lower-left | I07 | high as printed ("I07"; the font makes I/1 and O/0 ambiguous) |
| LED, lower centre | I05 | high as printed |
| Large white RGB-style LED, right | I06 | high as printed |
| Connector | USB Type-C (bottom centre) | high |
| Other parts (small IC, tantalum capacitor, diode, resistors) | no readable text | not transcribed |

## Pinout diagram, image 3 (printed in the diagram)

The diagram shows the face of image 1 with a callout pill beside each pad. The callouts appear to sit on the
opposite side from the silkscreen they match.

Pills on the diagram's LEFT, top to bottom (outer to inner):

| Row | Pills |
|---|---|
| 1 | 3V3 |
| 2 | SCK, RST |
| 3 | ADC1_4, GPIO4 |
| 4 | MISO, LED, ADC2_0, GPIO5 |
| 5 | MOSI, RGB, GPIO6 |
| 6 | BUTTON, GPIO7 |
| 7 | GPIO8 |
| 8 | BOOT, GPIO9 |
| 9 | GND |
| 10 | 5V |

Pills on the diagram's RIGHT, top to bottom (inner to outer):

| Row | Pills |
|---|---|
| 1 | GPIO0, ADC1_0, SCL |
| 2 | GPIO1, ADC1_1, SDA |
| 3 | GPIO2, ADC1_2, BOOT |
| 4 | GPIO3, ADC1_3, CS |
| 5 | GPIO19, USB_D+ |
| 6 | GPIO18, USB_D- |
| 7 | GPIO21, TX0 |
| 8 | GPIO20, RX0 |
| 9 | GPIO10 |
| 10 | GND |

Alignment problem: the left pills (3V3, RST, GPIO4 ... 5V) are in the same order as the image-1 RIGHT header labels
(3V, EN, 4 ... 5V), and the right pills (GPIO0, GPIO1, GPIO2, GPIO3, GPIO19, GPIO18, GPIO21, GPIO20, GPIO10, GND) are
in the same order as the image-1 LEFT header labels (0, 1, 2, 3, 19, 18, TX, RX, 10, G). But the diagram's connector
lines attach each pill to the pad on its own side, so a literal reading puts "3V3" against the pad printed "0" and
"GPIO0" against the pad printed "3V". The two readings contradict. Do NOT ingest any diagram row until the owner
confirms which is right. Also "BOOT" appears twice (left row 8, right row 3) and the diagram says "RST" where the
silkscreen says "EN".

Confidence: pill text high. Row-to-pad assignment: UNCLEAR. Pill colours were not interpreted.

## Comparison with stored text (panda_agent_public_passages('ESPXC3M'), 12 passages)

Stored text has: Wi-Fi and Bluetooth LE specs, an "Interfaces: GPIO, SPI, UART, I2C, I2S, ... USB 1.1 ..." line,
"Switches: RST, FLASH, and User Programmable buttons", "LED: Programmable Single Color and RGB LEDs", 4 MB flash, the
ESP32-C3-WROOM-02 datasheet link, "Physical revision: unknown".

Facts in the photos NOT in the stored text:

| Fact | In stored text? |
|---|---|
| All 20 header pad labels and order | No (no pin list) |
| Header exposes 3V, EN, 5V, G, TX, RX pads | No |
| Silkscreen names RST, BOOT, Power, I05, I06, I07 | Partly: text says RST, FLASH, User; printed name is BOOT, not FLASH |
| Connector is USB Type-C | No (text says "USB 1.1" only) |
| Module marking "ESP32-C3-WROOM-02" / "M4N4" | Model yes (intro); "M4N4" no |
| Board name "Geeky Board xC3m" | No |
| Diagram pills (GPIO numbers, ADC1_x, ADC2_0, SCL/SDA, SCK/MISO/MOSI/CS, USB_D+/-, TX0/RX0, LED, RGB, BUTTON, BOOT) | No |

## Links on the product page (not fetched)

- Official ESP32-C3-WROOM-2 Datasheet: https://documentation.espressif.com/esp32-c3-wroom-02_datasheet_en.pdf
- "Explore Wiki Pages": https://www.pandabyte.in/ (site root, not a wiki page)
- "Product WiKi": text with NO href (label only)
- No PDF, GitHub, schematic or pinout link other than the datasheet.

## Reviewer must check

1. Diagram pill-to-pad alignment (image 3), as described above. Blocks ingestion of any diagram-derived row.
2. Whether I05/I06/I07 mean IO5/IO6/IO7, and how they relate to the LED, RGB and BUTTON pills in image 3.
3. Top-right label "3V" (printed) versus "3V3" (diagram).
4. "BOOT" appears twice in the diagram; stored text says FLASH where the board prints BOOT.
5. Module shield FCC/IC/CMIIT lines were read only partly; do not ingest them.
6. Which board revision is pictured (stored text: unknown; no revision text read).
7. Image 3 is a render with information not seen on the physical board; the owner must say if it is authoritative.
