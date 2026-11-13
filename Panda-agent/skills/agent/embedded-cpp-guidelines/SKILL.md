---
name: embedded-cpp-guidelines
description: C++ guidance for Arduino and ESP32 code - const correctness, ownership, RAII wrappers, enum class, strong types, constexpr, avoiding heap and String, error handling without exceptions, and ISR-safe code. Use when the user writes, reviews or refactors C++ for Arduino IDE or ESP32, or asks about classes, templates or memory in sketches.
license: MIT
---
# Embedded C++ guidelines

For explaining and reviewing C++ in sketches. Based on the C++ Core Guidelines, adapted for small microcontrollers. You cannot compile the code, so say "should compile" and ask the user to build it.

## Context first
- AVR boards (Arduino UNO class) build without exception support; the ESP32 Arduino core can use them, but embedded code normally avoids them. Do not design around `throw`/`try`; avoid `dynamic_cast` and RTTI. Report errors with a `bool`, an error enum or a small result struct.
- The available C++ standard depends on the esp32 board package version; if a feature does not compile, suggest the older equivalent rather than assuming.
- Memory is limited and heap fragmentation matters on long-running devices.

## Core rules
- Start with `const` and `constexpr`; mutability is the exception. Mark member functions that do not change state `const`.
- Initialise every variable where it is declared. Use braces `{}` to catch narrowing conversions.
- Prefer `enum class` and `constexpr` constants over plain `enum` and `#define`: `enum class State : uint8_t { Idle, Reading, Error };`
- Use `nullptr`, not `0` or `NULL`. Use `static_cast`, not C-style casts.
- Make interfaces explicit and typed: `uint8_t pin`, `uint32_t intervalMs` (unit in the name) instead of bare `int`.
- Mark single-argument constructors `explicit`.
- Keep functions short with one job; return a small struct instead of several output pointers.
- Pass cheap types (ints, pointers) by value and larger ones by `const&`.
- Avoid non-const globals; where a global is natural on a microcontroller (a sensor object), keep it in one file with a small interface.

## Resources and ownership (RAII)
- Tie a resource to an object lifetime: a small class that takes a mutex in its constructor and releases it in the destructor, so every return path unlocks.
- Prefer fixed-size members and static allocation. Avoid `new`/`delete` and `malloc` in loops; if you must allocate, do it once in `setup()` and check for failure.
- Never transfer ownership with a raw pointer. If heap allocation is justified, `std::unique_ptr` states ownership; avoid `shared_ptr` on small chips.
- Avoid `String` concatenation in loops and `std::vector` growth in time-critical code; use `std::array`, `char[N]` and `snprintf`.
- Rule of zero: let members clean themselves up. If you write a destructor, decide copy and move too; delete copying for classes that own hardware.

## Classes
- One class per device or concern (sensor driver, button, state machine). Keep data private and inject the pin or bus in the constructor.
- Do not call virtual functions from constructors. Use `override`. Avoid deep hierarchies; a plain struct plus functions is often enough.
- Call hardware `begin()` from `setup()`, not from a global constructor, because the hardware may not be ready at static-initialisation time.

## Interrupt and concurrency safety
- Data shared with an ISR or another task: `volatile` for simple ISR flags, a critical section or `std::atomic` for multi-byte values.
- ISR handlers are free functions or static members, `IRAM_ATTR` on ESP32; they must not allocate, print or block.

## Templates
- Use small templates with compile-time sizes (`template <size_t N> class RingBuffer`). Deep template code bloats flash and gives unreadable errors.

## Style
- Descriptive names, no magic numbers (`constexpr uint8_t kLedPin = 2;`), include guards in headers, no `using namespace` in headers.

## Review checklist
No raw owning pointers; no exceptions for normal errors; no heap in loops; const where possible; enum class; bounds checked; ISR-shared data safe; names clear.

Adapted from https://skills.sh/affaan-m/ecc/cpp-coding-standards (MIT, Copyright (c) 2026 Affaan Mustafa), with embedded constraints informed by https://skills.sh/jeffallan/claude-skills/cpp-pro (MIT).
