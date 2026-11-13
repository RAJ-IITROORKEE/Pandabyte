---
name: pandabyte-board-selection
description: Recommend PandaByte development boards and modules for a project by reading and comparing their listings. Use when the user asks which PandaByte board to use, compares PandaByte boards, or asks about the PandaByte range.
---
# PandaByte board selection

## Steps
1. search_catalog with the need (for example "ESP32-S3", "LoRa", "battery", "Grove").
2. read_product for the strongest candidates, at most 3, with a focus such as "wireless USB pins battery".
3. Recommend from what the excerpts say and cite them in final_answer. Put general engineering advice in general.

## Compare on
- Chip family and module.
- Wireless: Wi-Fi, BLE, LoRa.
- USB connector and USB-to-serial chip.
- On-board parts: LEDs, buttons, display, battery charging, sensors.
- Connectors and headers (for example Grove).
- Any notes or limits in the listing.

When two boards fit, give a short comparison table built only from listing facts and mark anything missing as "not in listing".

## Rules
- Never state price or stock; say they are on the product page.
- An excerpt that starts "Espressif datasheet excerpt" describes the module, not the board's own pins or wiring.
- Do not fill gaps from memory about other makers' boards with the same chip.
- If no PandaByte board fits, say so. If web search is on, a web search can cover other makers; otherwise give general guidance labelled as such.
