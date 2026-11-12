# Visual ingestion DRAFT: Maker UNO (SKU MAKERUNO)

REVIEW DRAFT ONLY. Not ingested, not used by the product. Transcribed 13 Nov 2026 by an assistant viewing the
listing photos enlarged in the browser (no files saved). Photos are only 800 px, so some small text is [unclear].

Page: https://www.pandabyte.in/product-page/maker-uno-simplifying-arduino-for-education
Photo base: `https://static.wixstatic.com/media/3e946a_<id>`

| # | Photo id | Size | Shows |
|---|---|---|---|
| 1 | `d4e76faae916418985a2581628109a88~mv2.jpg` | 800 x 800 | Angled front view (viewed only; labels taken from photo 3) |
| 2 | `e027ebc9b9dd44658e350a624723c1a8~mv2.jpg` | 800 x 681 | Illustration with callouts (a drawing, not the board) |
| 3 | `82478f98c9fb4fd79338693260dd8e84~mv2.jpg` | 800 x 800 | Top-down front view, USB at top |
| 4 | `eaba94fcbac04bf099942e6a711cab14~mv2.jpg` | 800 x 800 | Back of the board with printed text |

Orientation (photo 3): USB connector at the top edge, power and analog headers on the left, digital headers on the
right, ICSP at the bottom. Photo 4 is the back, so left/right are mirrored relative to the front.
Names only are transcribed; no function or electrical meaning is inferred.

## Board text (photo 3, front)

Logo text "MAKER UNO" and "Rev1.1" (high); small face logo. Other silkscreen: "BUZZER" (high), "3.3VREG" (high),
"USB5V" (high), "USB-UART" with "CH340" and possibly one more character [unclear] (medium), "ATMEGA" and a second line
(likely a part number, [unclear]), "16MHZ" (high), "TX" and "RX" labels beside LEDs near the USB end (high), "BUTTON" (high),
a second button label beginning "RES" (cut off; likely RESET) (medium), group labels "POWER", "ANALOG IN", "DIGITAL (PWM~)" (high).
Speaker and crossed-speaker icons beside the slide switch (icons only).
Small labels beside indicator LEDs at the left edge: "L3V" and "L5V" (high).

## Header label tables (photo 3)

### Power header (left, 8 sockets)
Labels are printed beside the sockets; their alignment to individual sockets is uncertain.

| Order, top to bottom | Printed label |
|---|---|
| 1 | no label (top socket) |
| 2 | IOREF |
| 3 | RESET |
| 4 | 3.3V |
| 5 | 5V |
| 6 | GND |
| 7 | no visible label [unclear] |
| 8 | no visible label [unclear] |

Confidence: IOREF, RESET, 3.3V, 5V, GND high as text; mapping of labels to sockets and the last two sockets unclear.

### Analog header (left, 6 sockets, labelled on both sides)
A0, A1, A2, A3, A4, A5 top to bottom (high).

### Digital header, upper (right, 10 sockets), top to bottom
SCL, SDA, AREF, GND, 13, 12, ~11, ~10, ~9, 8 (high). SCL and SDA are also printed on the other side of the row (high).

### Digital header, lower (right, 8 sockets), top to bottom
7, ~6, ~5, 4, ~3, 2, "TX >" 1, "RX <" 0 (high). The arrows are printed.

### LED labels beside the digital header (right edge)
L13, L12, L11, L10, L9, L8, L7, L6, L5, L4, L3, L2 (high). No L1 or L0 label seen.
That is 12 labels, matching the stored text's "12x LEDs" in number.

### ICSP header (bottom centre, 2 x 3 pins)
Printed pairs: MISO / 5V, SCK / MOSI, RST / GND (medium-high; the two columns of text are read as one pair per row).
A small triangle marks one end (pin 1 presumably; not stated). Header type by appearance only.

### Connectors and controls
- Micro-USB connector at the top (by appearance) with label "USB5V" (medium on connector type; photo 2 callout says "common micro USB cable").
- Slide switch with speaker and muted-speaker icons; photo 2 callout "Slide Switch To Mute Buzzer".
- Two push buttons at top right: one labelled "BUTTON", one beginning "RES".
- Arduino-style socket headers (as above): sockets, not pins.

## Photo 2 callouts (drawing text, high)
"Slide Switch To Mute Buzzer", "Uses the common micro USB cable", "On-board Piezo Buzzer", "Programmable Button",
"Regulated 3.3v up to 500mAmp", "LEDs as indicator", "ATmega328P @16MHz, 5V".

## Photo 4 back text (high unless marked)
"In collaboration with" ARUS ("LEARN MAKE INNOVATE"), "rero", "Cytron Technologies", "PRODUCT OF MALAYSIA",
"This MAKER UNO belongs to" (blank write-in area), "Rev1.1".
Paragraph: "This board is specially designed for students learning electronics and programming for the first time.
Featuring LEDs at every digital pin, onboard buzzer at pin 8, and 1 programmable push button at pin 2 - configure as
pinMode(2, INPUT_PULLUP). Powers only at 5V USB. Start your maker journey today!" and "www.cytron.io".
(Line starts and the pinMode call confirmed enlarged; the right-hand ends of lines were read at reduced size: medium.)

## Comparison with stored text (public passages for MAKERUNO)

Stored text covers: Arduino-compatible, same pin sequence and spacing as UNO, 12 LEDs, 1 buzzer, 1 button, LED
indicators, a "Product Wiki" link to cytron.io, education description.

Facts from the photos NOT in stored text:
- Printed pin labels per header (IOREF, RESET, 3.3V, 5V, GND, A0-A5, SCL, SDA, AREF, 13 to 0 with ~ marks, TX/RX on 1 and 0) and ICSP labels.
- LED names L13 to L2 (names pair LEDs with digital pins).
- Buzzer at pin 8 and push button at pin 2 with INPUT_PULLUP (back text).
- "Powers only at 5V USB" (back text); regulated 3.3 V up to 500 mA and ATmega328P @ 16 MHz, 5 V (photo 2 callouts).
- Micro-USB connector, "USB-UART CH340" marking, slide switch to mute the buzzer, TX/RX and L3V/L5V indicator LEDs.
- "Rev1.1" revision text, Cytron / ARUS / rero credits, "Product of Malaysia".
- Review note: the back text "Powers only at 5V USB" sits beside a power header with 5V and 3.3V labels; do not infer more.

## Links on the product page (not fetched)
- Product Wiki: https://www.cytron.io/p-maker-uno-simplifying-arduino-for-education (third-party manufacturer page)
- "Explore Wiki Pages": https://www.pandabyte.in/ (home page)
No datasheet, pinout or PDF link.

## Reviewer must check
1. Power header: the unlabelled first, seventh and eighth sockets and which label belongs to which socket.
2. Second button label (RESET?), exact USB-UART marking and the ATmega part-number line.
3. ICSP label pairing and pin-1 orientation.
4. Whether the drawing (photo 2) counts as product evidence; it is not the board.
5. Revision: stored text says unknown; photos say Rev1.1.
6. The design is credited to Cytron; confirm attribution wording before use.
