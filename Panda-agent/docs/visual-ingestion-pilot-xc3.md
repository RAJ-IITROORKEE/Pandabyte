# Visual ingestion pilot: PandaByte xC3 (SKU ESPXC3)

Status, 13 Nov 2026: the board-back pin table below is ingested. The owner approved it ("Yes, ingest it");
migration 20261113100000 stored it as one passage and sealed a 285-member candidate, and 20261113100001 switched the
runtime to it. The front-photo notes are not ingested. No paid model call or file download was involved: the two
listing photos were viewed in the browser and transcribed by the assistant.

Product page: https://www.pandabyte.in/product-page/pandabyte-xc3-esp32c3-microcontroller-board-arduino-compatible

## Images on the listing

| # | Image | Size | What it shows |
|---|---|---|---|
| 1 | `static.wixstatic.com/media/3e946a_fd039445823348c2873f60b3f1958b20~mv2.jpg` | 1119 x 1119 | Board front (component side) |
| 2 | `static.wixstatic.com/media/3e946a_39223cc48ebc497ab7c9d79816ede3e8~mv2.jpg` | 1100 x 1100 | Board back with pin labels |

The page has no pinout diagram, dimension drawing or PandaByte PDF. Its only document link is the Espressif
ESP32-C3-WROOM-02 datasheet (`documentation.espressif.com/esp32-c3-wroom-02_datasheet_en.pdf`), which is a
third-party chip document and out of scope until the owner decides on official chip documents.

## Transcription, image 2 (board back, antenna at the top)

Printed text: "GeekyBoard", "xC3", panda logo. Two rows of 15 header pads. Labels are copied exactly as printed; the
photo does not say that a number is a GPIO number, so none is claimed here.

| Position (top to bottom) | Left row label | Right row label |
|---|---|---|
| 1 | 0 | 3V3 |
| 2 | 1 | EN |
| 3 | 2 | 4 |
| 4 | 3 | 5 |
| 5 | 19 | 6 |
| 6 | 18 | 7 |
| 7 | TX0 | 8 |
| 8 | RX0 | 9 |
| 9 | 10 | GND |
| 10 | GND | GND |
| 11 | GND | 5V |
| 12 | 3V3 | 5V |
| 13 | 5V | 3V3 |
| 14 | GND | GND |
| 15 | GND | GND |

"Left" and "right" are as seen in this back-side photo; from the component side they are mirrored.

## Transcription, image 1 (board front, antenna at the top)

- Module shield marking: "ESPRESSIF", "ESP32-C3-WROOM-02". Smaller lines on the shield are not legible at this size.
- Bottom edge, left to right: button labelled "RST", button labelled "BUT", USB Type-C connector, LED labelled
  "POW", button labelled "BOOT".
- One RGB LED package is visible left of centre. Other parts are unlabelled passives and regulators; not transcribed.

## What this adds to the stored listing text

Stored text for ESPXC3: 8 passages, 2,813 characters. It already states the buttons (RST, FLASH, user button on
GPIO 7), power and RGB LEDs, interfaces, 4 MB flash and 3.0 to 3.6 V supply.

| Fact from the photos | In stored text? |
|---|---|
| The 30 header pad labels and their order | No. The stored text has no pin list at all. |
| Header exposes 5V, 3V3, EN, TX0, RX0 and GND pads | No |
| Silkscreen name "GeekyBoard xC3" | No |
| Button silkscreen names "BUT" and "BOOT", LED "POW" | Partly: the text says "FLASH" and "User programmable button", not the printed names |
| USB connector is Type-C | No (text says only "USB 1.1" as an interface) |

So questions such as "which pins does the xC3 break out?" or "does the xC3 have a 5V pin?" cannot be answered from
the stored text today and could be after ingestion.

## Limits of this pilot

- One product, two photos. Photos of other products may be less legible.
- The transcription was read at reduced size; a reviewer should check it against the full-size photo before use.
- Label positions are read from a photo, not from a schematic. No electrical meaning (GPIO function, 5V source,
  current limit) is inferred.
- The front photo's "BUT"/"BOOT" names and the text's "FLASH"/"User" names are not reconciled here.

## Decisions needed before any ingestion

1. Who reviews and approves each transcription (owner, or a named reviewer in the Admin RAG Control Room).
2. Which vision model transcribes at scale (a paid provider call), or continue assistant-transcribed drafts per product.
3. Approval of a migration to store an approved transcription as a passage that cites the image. The corpus release
   is pinned in SQL by hashes and a member count of 284, so every added passage needs a migration; ingestion and
   research migrations belong to the control room session.
4. How the answer cites an image passage (link to the product page, to the image, or both).
