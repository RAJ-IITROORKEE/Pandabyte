---
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
