---
name: chat-diagram-blocks
description: Draw wiring diagrams, system block diagrams, step-by-step build cards, callouts, charts and Mermaid diagrams that the PandaByte chat renders visually. Use when the user asks for a diagram, block diagram, flowchart, wiring picture, visual steps, or when a wiring or architecture answer would be clearer as a picture.
---
# Chat diagram blocks

The chat renders these fenced blocks as visuals. Each block body must be exact JSON (no comments, no trailing commas) or valid Mermaid; anything else shows as plain text. Put blocks in your general guidance, one or two per answer, next to a short explanation. Keep full code in normal ```cpp blocks.

## wiring: connections between 2-4 parts
```wiring
{"title":"DHT11 to ESP32","parts":[{"id":"mcu","label":"ESP32 board","pins":["3V3","GND","GPIO4"]},{"id":"dht","label":"DHT11","pins":["VCC","GND","DATA"]}],
"wires":[{"from":"mcu.3V3","to":"dht.VCC","color":"red"},{"from":"mcu.GND","to":"dht.GND","color":"black"},{"from":"mcu.GPIO4","to":"dht.DATA","label":"data","color":"yellow"}]}
```
- parts: 2-4, id starts with a letter (letters, digits, - or _), label <= 40 chars, 1-24 pins, pin names without dots.
- wires: 1-32, from/to as "partId.pin" using listed pins, label <= 40, color one of red, black, yellow, green, blue, orange, white.
- Use red for power, black for ground. For PandaByte boards use pin names from read_product excerpts or say to check the board pinout.

## flow: system block diagram (2-12 nodes)
```flow
{"title":"Weather station","nodes":[{"id":"bat","label":"LiPo battery","kind":"power"},{"id":"mcu","label":"ESP32","kind":"mcu"},{"id":"bme","label":"BME280","kind":"sensor"},{"id":"cloud","label":"MQTT broker","kind":"cloud"}],
"edges":[{"from":"bat","to":"mcu","type":"power"},{"from":"bme","to":"mcu","label":"I2C","type":"signal"},{"from":"mcu","to":"cloud","label":"Wi-Fi","type":"data"}]}
```
- kind: power, mcu, sensor, actuator, signal, process, decision, data, cloud, user, storage, network.
- label <= 32, detail optional <= 400; edges 1-20, label <= 24, type power, signal or data.

## steps: numbered build or setup cards (1-12)
```steps
{"title":"First upload","steps":[{"title":"Install the ESP32 package","detail":"Boards Manager: esp32 by Espressif Systems."},{"title":"Upload blink","detail":"Select your board and port, then Upload.","code":"digitalWrite(LED_PIN, HIGH);","lang":"cpp"}]}
```
- title <= 80, detail <= 600, code <= 1500 (short snippets only), lang <= 20.

## callout: one highlighted note
```callout
{"tone":"warning","title":"3.3 V logic","text":"ESP32 pins are not 5 V tolerant. Use a level shifter for 5 V signals."}
```
- tone info, tip or warning; title <= 80; text <= 600. Use warning for safety.

## chart: small bar or line chart
```chart
{"type":"line","title":"Battery voltage","x":["0 h","2 h","4 h"],"series":[{"name":"Volts","values":[4.1,3.9,3.7]}]}
```
- 1-50 x labels (<= 40 chars), 1-4 series, values are numbers, one per x label. Only chart numbers the user gave or that you clearly label as an example.

## mermaid: flowcharts, sequences, states
```mermaid
flowchart LR
  S[Read sensor] --> C{Valid?}
  C -- yes --> P[Publish MQTT]
  C -- no --> R[Retry]
```
- Prefer flowchart, sequenceDiagram, stateDiagram-v2, classDiagram, erDiagram, gantt. Keep it under about 15 nodes and quote labels with symbols: A["Temp (°C)"].
- Do not use click, href, links, %%{ init }%% directives, callbacks or HTML; they are blocked.
- For sequence, state, class, ER or gantt syntax, load the mermaid-diagram-syntax skill.

## Choosing
- Physical connections: wiring. System overview: flow. Procedure: steps. Logic, protocols or state machines: mermaid. A single risk or tip: callout. Measurements: chart.
- If a block would repeat a table you already gave, skip the block.
