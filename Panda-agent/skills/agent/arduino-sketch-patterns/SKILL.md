---
name: arduino-sketch-patterns
description: Reliable patterns for writing Arduino IDE sketches for ESP32 - non-blocking millis timing, button debounce, sensor read and filtering, I2C scan and error checks, state machines, safe strings and a standard answer structure. Use when the user asks for sketch code, a driver or a fix for timing, buttons, sensors or I2C.
license: MIT
---
# Arduino sketch patterns

Write sketches users can paste into Arduino IDE 2 with the esp32 board package (esp32 by Espressif Systems). You cannot compile or run them, so state assumptions and what is unverified.

## Before writing code
Know or ask: exact board, pins, supply voltage (ESP32 GPIOs are 3.3 V), the sensor or module and its library. Do not guess pins; ask or tell the user to check their board pinout. Never invent PandaByte product facts: use read_product for those.

## Answer structure
1. Assumptions (board, pins, library names).
2. Wiring summary (power, ground, signal pins).
3. The sketch in one cpp block.
4. How to test: expected Serial Monitor output and baud rate.
5. Limitations: build and hardware are not tested by you.

## Non-blocking timing
Avoid `delay()` when the sketch must do several things. Use unsigned arithmetic so millis() rollover (about 49 days) is harmless:
```cpp
const uint32_t kIntervalMs = 1000;
uint32_t lastRun = 0;
void loop() {
  uint32_t now = millis();
  if (now - lastRun >= kIntervalMs) {
    lastRun = now;
    // timed action
  }
}
```
Always use `unsigned long` or `uint32_t` for time, never `int`. A short `delay()` is fine in simple one-job demos.

## Button debounce
```cpp
const uint8_t kButtonPin = 4;           // use INPUT_PULLUP, button to GND
const uint32_t kDebounceMs = 50;
bool stable = HIGH, lastRead = HIGH;
uint32_t changedAt = 0;
bool pressedEvent() {
  bool r = digitalRead(kButtonPin);
  if (r != lastRead) { lastRead = r; changedAt = millis(); }
  if (millis() - changedAt > kDebounceMs && r != stable) {
    stable = r;
    return stable == LOW;               // true once per press
  }
  return false;
}
```
Poll or use an interrupt for one input, not both.

## Sensor reading
- Check that the sensor started: `if (!sensor.begin()) { Serial.println("Sensor not found"); }` and decide what to do (retry, stop, run without it).
- Check results: DHT and similar return NaN on failure, so test `isnan(value)` before using it.
- Smooth noisy ADC readings with a moving average or median of N samples; mention the ESP32 ADC is nonlinear and that ADC2 pins cannot be used while Wi-Fi is on.
- Read slow sensors at their allowed rate (for example DHT22 about every 2 s, DHT11 about every 1 s), not in a tight loop.

## I2C
- Scan to confirm the address, and check `Wire.endTransmission()` returns 0 (nonzero means no ACK or a bus error).
- Typical ESP32 default pins are SDA 21 and SCL 22 on the classic ESP32, but they differ by board; use `Wire.begin(SDA_PIN, SCL_PIN)` with the user's pins.
- Check pull-ups (modules often include them), a shared ground and the correct 3.3 V level.

## State machine for modes
```cpp
enum class Mode : uint8_t { Idle, Measuring, Error };
Mode mode = Mode::Idle;
void loop() {
  switch (mode) {
    case Mode::Idle: /* wait for timer */ break;
    case Mode::Measuring: /* read, then go Idle or Error */ break;
    case Mode::Error: /* report, then retry or stop */ break;
  }
}
```

## Memory-safe habits
- Use `char buf[N]` with `snprintf(buf, sizeof(buf), ...)` instead of long `String` chains; check lengths before copying.
- Give magic numbers names (`constexpr`). Print clear Serial messages for failures, and call `Serial.begin(115200)` in setup().
- Keep loop() short and non-blocking; for several concurrent jobs, point to FreeRTOS tasks.

## Do not
Block for seconds in loop(), ignore return values, assume a sensor is present, use 5 V signals on ESP32 pins, or claim the code was tested.

Adapted from https://skills.sh/wedsamuel1230/embedded-engineering-skills/arduino-code-generator (MIT, Copyright (c) 2026 Samuel F.). Some source claims were dropped as unverified or overstated.
