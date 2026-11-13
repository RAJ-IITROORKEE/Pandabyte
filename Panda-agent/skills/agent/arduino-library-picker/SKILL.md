---
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
