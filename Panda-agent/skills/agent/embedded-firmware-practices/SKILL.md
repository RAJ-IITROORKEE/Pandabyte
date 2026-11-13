---
name: embedded-firmware-practices
description: Firmware design rules for ESP32 and other microcontrollers - ISRs, FreeRTOS tasks and queues, shared data, watchdogs, memory and stack limits, power, and ESP32 panic and crash causes. Use when the user designs, reviews or debugs firmware structure, interrupts, tasks, resets, crashes or memory problems.
license: MIT
---
# Embedded firmware practices

Use for explaining designs and reviewing pasted code. You cannot compile, flash or measure anything: say what to check, not that it works.

## Workflow for a design question
1. Pin down the chip or board (ESP32, S3, C3...), core version, power source and timing needs. Ask if missing.
2. Sketch the structure: what runs in loop() or tasks, what needs an interrupt, what is shared.
3. List resource risks: RAM, stack sizes, flash, power, pins.
4. Tell the user how to verify on their side: serial logs, stack high-water mark, free heap, a logic analyser or scope for timing.

## Interrupts (ISRs)
- Keep ISRs very short: read the hardware, set a flag or push to a queue, return. No Serial.print, delay, malloc, I2C/SPI transfers or long loops inside.
- Variables shared with an ISR are `volatile`. A multi-byte value read in loop() can change mid-read, so copy it inside a critical section.
- On ESP32 mark the ISR function `IRAM_ATTR` and use the FromISR FreeRTOS calls (`xQueueSendFromISR`, `xSemaphoreGiveFromISR`).
- One approach per input: either debounced polling or interrupts, not both for the same signal.

## FreeRTOS tasks (ESP32 Arduino runs loop() as a task)
- Give each task one job and a sensible stack. Check headroom with `uxTaskGetStackHighWaterMark(NULL)`; a Stack overflow panic means raise the stack size.
- Use `vTaskDelay(pdMS_TO_TICKS(n))` or `vTaskDelayUntil` for periodic work, never a busy loop; a task that never yields can trigger the task watchdog.
- Pass data with queues; protect shared resources (an I2C bus, a Serial port, a buffer) with a mutex. Never take a mutex in an ISR.
- Do not call blocking drivers from several tasks without a mutex around the bus.

## Memory
- Prefer fixed-size buffers and `snprintf` over repeated `String` concatenation, which fragments the heap on long-running devices.
- Avoid malloc/new in loops; check for failure when you do allocate.
- Watch `ESP.getFreeHeap()` and the minimum free heap over time; a slow decline means a leak.
- Bound every array index and string copy.
- Floating point is fine in ESP32 tasks but avoid it inside ISRs.

## Reliability
- Use a watchdog for devices that run unattended, and feed it from the code that proves the system is healthy, not from a blind timer.
- Check return codes of begin(), I2C transfers and network calls; retry with a limit and log the failure.
- Use `millis()` differences (`now - last >= interval`) so rollover is harmless.

## Power
- Deep sleep cuts consumption most; only RTC memory and chosen wake sources survive, and the sketch restarts from setup().
- Turn off Wi-Fi and Bluetooth when not needed, and lower the CPU frequency if timing allows. Do not quote exact current figures; point to the chip datasheet.

## Common ESP32 crash messages
| Message | Usual cause |
|---|---|
| LoadProhibited / StoreProhibited | Null or invalid pointer, freed memory, uninitialised object |
| InstrFetchProhibited | Bad function pointer or corrupted callback |
| Stack overflow in task | Task stack too small, big local arrays |
| Stack smashing detected / Double exception | Local buffer overflow or stack corruption, often a task stack that is too small |
| IntegerDivideByZero | Unchecked divisor |
| Task watchdog got triggered | A task blocked or never yielded |
| Brownout detector | Weak supply or cable, Wi-Fi current spikes |

Ask the user to paste the full panic text including the Backtrace line.

## Reply style
Short explanation, then a small code example only if it clarifies. End with a checklist of what the user should verify on the hardware.

Adapted from https://skills.sh/jeffallan/claude-skills/embedded-systems (MIT, Copyright (c) 2025 Jeffallan), with the ESP32 crash table condensed from https://skills.sh/laurigates/mcu-tinkering-lab/esp32-debugging (MIT, Lauri Gates).
