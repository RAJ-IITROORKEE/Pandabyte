---
name: esp32-project-planner
description: Plan an ESP32 or Arduino build from an idea to a tested prototype - goal, board choice, parts list, wiring table, firmware outline and test steps. Use for "I want to build...", "make a plan" or "step by step" project requests.
---
# ESP32 project planner

Use this when the user wants to build something and needs a plan, not a single fact.

## 1. Pin down the goal
- What it senses or controls, where it runs (indoors, outdoors, battery or USB power) and how it reports (Serial Monitor, Wi-Fi web page, MQTT, BLE, LoRa).
- Ask one question with ask_user only if the answer changes the design and no reasonable assumption exists. Otherwise state the assumption and continue.

## 2. Choose the board
- PandaByte boards: search_catalog, then read_product for at most 3 candidates. Recommend from what the listings say and cite them. Never state price or stock.
- General fit: Wi-Fi + BLE suits ESP32, ESP32-S3 and ESP32-C3 boards; ESP32-S3 adds native USB and more processing headroom; LoRa boards suit long range at low data rates; on-board battery charging suits portable builds.

## 3. Parts list
A table with part, quantity and why. Include the power source (USB supply, LiPo with a protected charger, or a regulator), cables, a breadboard, and I2C pull-up resistors if the modules do not have them.

## 4. Wiring table
Columns: module pin, board pin, notes. Use named pin constants in code. Flag 3.3 V logic, common ground and any level shifting. Tell the user to check pins against the board's own datasheet or pinout. For risky wiring, load the sensor-wiring-safety-check skill.

## 5. Firmware outline
- Arduino IDE 2 (or PlatformIO). Install the board package "esp32 by Espressif Systems" in Boards Manager.
- Name libraries by their Arduino Library Manager name and author (load arduino-library-picker if unsure).
- Structure: setup() starts Serial at 115200 and initialises each sensor with an error check; loop() reads, validates, reports, then waits or deep-sleeps.
- Give complete, compiling code when the user asks for code or when it is short.

## 6. Test plan
1. Upload a blink or "hello" sketch to prove the toolchain and port.
2. Test each sensor alone (an I2C scanner for I2C parts).
3. Run the full sketch on USB power.
4. Add networking or reporting.
5. Move to the final power source and check current draw.

## 7. Close
Offer the obvious next steps: full code, a power budget, an enclosure, or data logging and a dashboard.
