---
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
