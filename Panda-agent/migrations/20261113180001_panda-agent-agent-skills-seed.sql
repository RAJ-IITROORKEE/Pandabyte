-- Seed: the five built-in starter skills (source files Panda-agent/skills/agent/*/SKILL.md), enabled. Generated from those files.
-- Admins can edit or disable them in Admin > Agent Skills; built-in skills cannot be removed.
-- Rollback: DELETE FROM public.panda_agent_agent_skill_versions WHERE created_by='migration'; DELETE FROM public.panda_agent_agent_skills WHERE source='built-in';
WITH seed(name, description, content) AS (VALUES
 ('arduino-library-picker', $d$Pick well-known Arduino libraries for common sensors, displays, LEDs, motors and networking, named exactly as in the Arduino Library Manager with their authors. Use when writing Arduino code or a parts and libraries list.$d$, $skill_0$---
name: arduino-library-picker
description: Pick well-known Arduino libraries for common sensors, displays, LEDs, motors and networking, named exactly as in the Arduino Library Manager with their authors. Use when writing Arduino code or a parts and libraries list.
---
# Arduino library picker

Name a library only if it is in this list or you are certain of its exact Library Manager name and author. Otherwise tell the user to search the part name in Library Manager (Sketch > Include Library > Manage Libraries) and pick a widely used one.

| Part | Library Manager name | Author |
| --- | --- | --- |
| DHT11 / DHT22 | DHT sensor library (also install Adafruit Unified Sensor) | Adafruit |
| BME280 | Adafruit BME280 Library | Adafruit |
| BMP280 | Adafruit BMP280 Library | Adafruit |
| MPU6050 | Adafruit MPU6050 | Adafruit |
| INA219 | Adafruit INA219 | Adafruit |
| DS18B20 | OneWire, plus DallasTemperature | Paul Stoffregen and others; Miles Burton |
| SSD1306 OLED | Adafruit SSD1306, plus Adafruit GFX Library | Adafruit |
| Many monochrome OLED/LCD | U8g2 | oliver |
| 16x2 LCD with I2C backpack | LiquidCrystal I2C | Frank de Brabander |
| WS2812 / NeoPixel | Adafruit NeoPixel, or FastLED | Adafruit; Daniel Garcia |
| Servo on ESP32 | ESP32Servo | Kevin Harrington |
| HC-SR04 | none needed (pulseIn), or NewPing | Tim Eckel |
| GPS (NMEA) | TinyGPSPlus | Mikal Hart |
| RC522 RFID | MFRC522 | GithubCommunity |
| MQTT | PubSubClient | Nick O'Leary |
| JSON | ArduinoJson | Benoit Blanchon |

## Built into the ESP32 Arduino core (no install)
WiFi.h, WebServer.h, HTTPClient.h, Preferences.h (flash key-value storage), the BLE libraries, and esp_sleep.h for deep sleep. The core itself is the Boards Manager package "esp32 by Espressif Systems".

## Rules
- Give the include line that matches the library (for example #include <DHT.h> for DHT sensor library).
- Note dependencies the user must also install.
- Prefer one library per part; do not mix two libraries for the same device.
- If code targets ESP32, avoid AVR-only libraries (for example the standard Servo library); use the ESP32 alternative.
$skill_0$),
 ('esp32-project-planner', $d$Plan an ESP32 or Arduino build from an idea to a tested prototype - goal, board choice, parts list, wiring table, firmware outline and test steps. Use for "I want to build...", "make a plan" or "step by step" project requests.$d$, $skill_1$---
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
$skill_1$),
 ('pandabyte-board-selection', $d$Recommend PandaByte development boards and modules for a project by reading and comparing their listings. Use when the user asks which PandaByte board to use, compares PandaByte boards, or asks about the PandaByte range.$d$, $skill_2$---
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
$skill_2$),
 ('sensor-wiring-safety-check', $d$Check an ESP32 or Arduino wiring plan before power-up - logic voltage levels, common ground, I2C pull-ups, load current, LiPo and mains safety, and ESP32 flash, strapping and input-only pins. Use when giving or reviewing any wiring table.$d$, $skill_3$---
name: sensor-wiring-safety-check
description: Check an ESP32 or Arduino wiring plan before power-up - logic voltage levels, common ground, I2C pull-ups, load current, LiPo and mains safety, and ESP32 flash, strapping and input-only pins. Use when giving or reviewing any wiring table.
---
# Sensor wiring safety check

Run this checklist on any wiring you give or review. Mention only the items that apply.

## Logic voltage
- ESP32-family GPIOs use 3.3 V logic and are not 5 V tolerant. A 5 V signal into a GPIO needs a level shifter or a resistor divider.
- Common 5 V parts (relay modules, HC-SR04 echo pin, some LCDs) can be powered from 5 V, but their outputs must be shifted down to 3.3 V.
- ATmega328P boards (Arduino UNO class) use 5 V logic; 3.3 V-only modules need shifting there.

## Power and ground
- Every module shares GND with the board.
- A GPIO only drives signals and small LEDs (with a resistor). Motors, relay coils, solenoids, pumps and LED strips need a driver (transistor, MOSFET or driver board) and a supply sized for the load; add a flyback diode across inductive loads.
- Addressable LED strips (WS2812): separate 5 V supply, common ground, a series resistor of a few hundred ohms on the data line and a large capacitor across the supply.
- LiPo cells: charge only through a protected charger; never connect a raw cell (about 3.0-4.2 V) to a 3.3 V pin.
- Mains (230 V AC): do not wire it directly. Use certified modules and a qualified electrician.

## I2C
- SDA and SCL need pull-ups to 3.3 V (typically 2.2k-10k); many breakout boards already have them.
- Keep wires short, check for address conflicts, and run an I2C scanner sketch first.
- On ESP32 the I2C pins can be chosen in code: Wire.begin(SDA_PIN, SCL_PIN).

## Classic ESP32 (ESP32-WROOM-32 and similar)
- GPIO6-11 are connected to the flash chip: never use them.
- GPIO34-39 are input only and have no internal pull-ups.
- Strapping pins GPIO0, 2, 5, 12 and 15 affect boot; do not let connected parts pull them at reset (GPIO12 high at boot can select the wrong flash voltage).
- ADC2 pins cannot be read while Wi-Fi is on; use ADC1 pins (GPIO32-39) for analog sensors.

## ESP32-S3 and ESP32-C3
- ESP32-S3 strapping pins: GPIO0, 3, 45, 46. Modules with octal flash or PSRAM reserve GPIO33-37.
- ESP32-C3 strapping pins: GPIO2, 8, 9.

## Before power-up
1. Supply voltage matches every module.
2. All grounds are joined.
3. No 5 V signal reaches a 3.3 V pin.
4. Loads have their own driver and supply.
5. No flash, strapping or input-only pin is misused.
6. Check every pin against the board's own pinout or datasheet. PandaByte board pin facts come only from read_product excerpts.
$skill_3$),
 ('serial-debug-triage', $d$Diagnose ESP32 and Arduino upload and runtime problems from serial output or symptoms - missing port, upload failures, garbled text, boot loops, brownouts, crashes, watchdog resets and sensors not found. Use when the user pastes an error or says something does not work.$d$, $skill_4$---
name: serial-debug-triage
description: Diagnose ESP32 and Arduino upload and runtime problems from serial output or symptoms - missing port, upload failures, garbled text, boot loops, brownouts, crashes, watchdog resets and sensors not found. Use when the user pastes an error or says something does not work.
---
# Serial and upload debug triage

Reply with the most likely cause first, then numbered checks, then one small test if it helps. If the board, the exact error text or the wiring is missing and matters, ask for it.

## No port / upload fails
- No COM port appears: try a data USB cable (many are charge-only), another USB port, and install the USB-UART driver the board uses (CP210x or CH340/CH9102) on Windows.
- "Failed to connect ... No serial data received" or "Wrong boot mode": hold BOOT (GPIO0) while the upload starts and release it once it says Connecting or Writing; make sure nothing wired to the board pulls boot or strapping pins.
- Port busy or access denied: close the Serial Monitor and any other program using the port.
- ESP32-S3 / ESP32-C3 with native USB: if Serial prints nothing, enable "USB CDC On Boot" in the Tools menu; the port can change after a reset.

## Garbled serial text
- The baud rate in the Serial Monitor must match Serial.begin (usually 115200).
- Unreadable lines right after reset can be boot ROM messages printed at a different baud; ignore them if your own prints are clean.

## Resets and boot loops
- "Brownout detector was triggered": the supply sags, often when Wi-Fi starts or a motor, relay or LED strip switches. Use a better USB port or cable, a proper 5 V supply, a capacitor near the board, and power loads separately.
- "Guru Meditation Error" with a backtrace: a crash. Decode the backtrace with an ESP exception decoder. Common causes: null or dangling pointers, out-of-range array indexes, stack overflow in a task, or heavy work inside an interrupt handler.
- Task watchdog messages: a loop or task blocks too long. Avoid long busy-waits, add short delays, and keep interrupt handlers tiny.
- Boot loop right after wiring a part: suspect a strapping pin being pulled at reset.

## Sensors not working
- I2C device not found: run an I2C scanner; check power, GND, SDA/SCL swap, pull-ups, the address, and pass the right pins with Wire.begin(SDA_PIN, SCL_PIN).
- DHT reads NaN: wrong pin or sensor type (DHT11 vs DHT22), missing pull-up on a bare sensor, or reading more often than the sensor allows (about every 2 seconds is safe).
- Analog reads stuck at 0 or 4095 on classic ESP32: ADC2 pins do not work while Wi-Fi is on; use ADC1 pins; check the input range.

## Wi-Fi
- Will not connect: check the SSID and password, use a 2.4 GHz network (most ESP32 chips do not support 5 GHz), and print WiFi.status() while connecting.
$skill_4$)
), skills AS (
 INSERT INTO public.panda_agent_agent_skills(name, source, version, description, content, content_sha256, enabled, updated_by)
 SELECT name, 'built-in', 1, description, content, encode(sha256(convert_to(content,'UTF8')),'hex'), true, 'migration' FROM seed
 RETURNING name, version, description, content, content_sha256, enabled
)
INSERT INTO public.panda_agent_agent_skill_versions(name, version, action, description, content_sha256, content, enabled, created_by)
SELECT name, version, 'create', description, content_sha256, content, enabled, 'migration' FROM skills;
