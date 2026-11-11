"use client";

import { useState } from "react";
import { ThinkingPanel } from "@/Panda-agent/src/ui/agent/thinking-panel";
import { ToolCallGroup } from "@/Panda-agent/src/ui/agent/tool-calls";
import { CitationChip, CitationProvider, SourceAccordion, SourcePanel, SourceStrip } from "@/Panda-agent/src/ui/agent/cited-answer";
import { WorkingPill } from "@/Panda-agent/src/ui/agent/working-pill";
import { ThemeToggle } from "@/components/theme-toggle";
import { RichMarkdown } from "@/Panda-agent/src/ui/rich-markdown";
import { MermaidBlock } from "@/Panda-agent/src/ui/blocks/mermaid-block";
import { WiringBlock } from "@/Panda-agent/src/ui/blocks/wiring-block";
import { FlowBlock } from "@/Panda-agent/src/ui/blocks/flow-block";
import { StepsBlock } from "@/Panda-agent/src/ui/blocks/steps-block";
import { CalloutBlock } from "@/Panda-agent/src/ui/blocks/callout-block";

const citations = [
  { id: "S1", n: 1, title: "PandaByte x8266 Wi-Fi development board", domain: "pandabyte-iot.vercel.app", href: "https://pandabyte-iot.vercel.app/products", date: "11 Nov 2026", quote: "The x8266 board is built around the ESP8266 microcontroller with 4 MB of SPI flash and a CH340 USB-to-serial bridge.", kind: "Product listing" },
  { id: "S2", n: 2, title: "ESP8266 technical reference: memory map and flash", domain: "docs.espressif.com", href: "https://docs.espressif.com/", date: "02 Oct 2026", quote: "External SPI flash up to 16 MB is supported; common modules ship with 4 MB.", kind: "Espressif reference" },
  { id: "S3", n: 3, title: "Getting started with Arduino on ESP8266", domain: "arduino-esp8266.readthedocs.io", href: "https://arduino-esp8266.readthedocs.io/", date: "20 Sep 2026", quote: "Select the board, set the flash size and upload over the serial port.", kind: "Web search excerpt" },
  { id: "S4", n: 4, title: "Power budget notes", domain: "PandaByte listing", quote: "Deep sleep current is listed at about 20 µA.", kind: "Product listing" },
];
const listing = "PandaByte NodeMCU x8266 WiFi Development Board";
const sameListing = [
  { id: "S1", n: 1, title: listing, domain: "www.pandabyte.in", date: "30 Oct 2026", section: "Product info", quote: "Pandabyte x8266 is a compact ESP8266-based microcontroller board designed for modern IoT projects." },
  { id: "S2", n: 2, title: listing, domain: "www.pandabyte.in", date: "30 Oct 2026", section: "Features", quote: "USB Type-C interface for programming and power, with a built-in user programmable switch." },
  { id: "S3", n: 3, title: listing, domain: "www.pandabyte.in", date: "30 Oct 2026", quote: "Includes an on-board RGB LED for status indication." },
];
const steps = ["Understanding your question", "Reading sources", "Selecting evidence", "Checking citations"];
const mermaidSample = "flowchart LR\n  A[USB power] --> B[3.3V regulator]\n  B --> C[ESP32]\n  C -->|GPIO4| D[DHT22]";
const wiringSample = JSON.stringify({ title: "ESP32 to DHT22", parts: [{ id: "esp", label: "ESP32", pins: ["3V3", "GND", "GPIO4"] }, { id: "dht", label: "DHT22", pins: ["VCC", "DATA", "GND"] }, { id: "r", label: "10k resistor", pins: ["A", "B"] }], wires: [{ from: "esp.3V3", to: "dht.VCC", color: "red" }, { from: "esp.GND", to: "dht.GND", color: "black" }, { from: "esp.GPIO4", to: "dht.DATA", color: "yellow", label: "data" }, { from: "dht.DATA", to: "r.A", color: "green", label: "pull-up" }, { from: "esp.3V3", to: "r.B", color: "orange" }] });
const stepsSample = JSON.stringify({ title: "Flash the board", steps: [{ title: "Install the driver", detail: "Plug in the board over USB Type-C and install the USB serial driver." }, { title: "Upload the sketch", code: "arduino-cli upload -p COM3 --fqbn esp32:esp32:esp32", lang: "bash" }, { title: "Open the serial monitor", detail: "Set the baud rate to 115200." }] });
const calloutSample = JSON.stringify({ tone: "warning", title: "Check the voltage", text: "ESP32 GPIO pins are 3.3V only. Do not connect a 5V signal directly." });
const flowSample = JSON.stringify({ title: "ESP32 relay circuit", nodes: [
  { id: "usb", label: "USB 5V", kind: "power", detail: "USB supplies 5V from a phone charger or PC. Keep the cable short to limit voltage drop when the relay switches." },
  { id: "reg", label: "3.3V regulator", kind: "process", detail: "Steps 5V down to 3.3V for the ESP32 logic. Most dev boards already include one." },
  { id: "esp", label: "ESP32", kind: "mcu", detail: "Reads the sensor and drives the relay from a GPIO. GPIO output is 3.3V and only a few mA." },
  { id: "dht", label: "DHT22 sensor", kind: "sensor", detail: "Temperature and humidity on a single data pin, with a 10k pull-up to 3.3V." },
  { id: "q1", label: "NPN transistor", kind: "signal", detail: "Switches the relay coil. A base resistor (about 1k) limits GPIO current; add a flyback diode across the coil." },
  { id: "rly", label: "Relay", kind: "actuator", detail: "Isolates the motor circuit from logic. The coil draws about 70 mA at 5V." },
  { id: "mot", label: "Motor", kind: "actuator", detail: "Runs from its own supply through the relay contacts, never from ESP32 pins." }],
  edges: [{ from: "usb", to: "reg", label: "5V", type: "power" }, { from: "reg", to: "esp", label: "3.3V", type: "power" }, { from: "dht", to: "esp", label: "1-wire", type: "data" }, { from: "esp", to: "q1", label: "GPIO" }, { from: "usb", to: "rly", label: "coil 5V", type: "power" }, { from: "q1", to: "rly" }, { from: "rly", to: "mot", label: "switch", type: "power" }] });

const wiringBad = JSON.stringify({ parts: [{ id: "esp", label: "ESP32", pins: ["3V3"] }, { id: "dht", label: "DHT22", pins: ["VCC"] }], wires: [{ from: "esp.GPIO9", to: "dht.VCC" }] });

const richSample = `## Reading a DHT22 on the x8266

Use the **x8266** \`D4\` pin with a 10k pull-up [S1]. The board has 4 MB of flash [S2]; unknown marker [S9] stays plain.

| Board | Flash | Wi-Fi |
|---|---|---|
| x8266 | 4 MB | 2.4 GHz |
| xS3 | 16 MB | 2.4 GHz + BLE |

- [x] Install the driver
- [x] Select the board
- [ ] Upload the sketch

1. Wire the sensor
2. Open the serial monitor
3. Read the values

> Keep GPIO signals at 3.3 V.

\`\`\`cpp
#include <DHT.h>
DHT dht(D4, DHT22);
void setup() { Serial.begin(115200); dht.begin(); }
\`\`\`

\`\`\`bash
arduino-cli upload -p COM3 --fqbn esp8266:esp8266:nodemcuv2
\`\`\`

\`\`\`json
{ "baud": 115200, "sensor": "DHT22" }
\`\`\`

Divider output: $$V_{out} = V_{in} \\cdot \\frac{R_2}{R_1 + R_2}$$ inline, and as a block:

$$V_{out} = V_{in}\\,\\frac{R_2}{R_1+R_2}$$

\`\`\`mermaid
flowchart LR
  A[USB] --> B[3.3V] --> C[ESP]
\`\`\`

\`\`\`chart
{"type":"bar","title":"Flash (MB)","x":["x8266","xS3"],"series":[{"name":"MB","values":[4,16]}]}
\`\`\`

\`\`\`wiring
${wiringSample}
\`\`\`

\`\`\`steps
${stepsSample}
\`\`\`

\`\`\`callout
${calloutSample}
\`\`\`

\`\`\`flow
${flowSample}
\`\`\`

`;
const hostileSample = `![tracker](https://evil.example/t.png) ![d](data:image/png;base64,AAAA)

<script>alert(1)</script> <img src=x onerror=alert(1)> <iframe src="https://evil.example"></iframe>

[js link](javascript:alert(1)) [data link](data:text/html,hi) [rel](/account) [ok link](https://example.com/docs) [S9]`;
export function UiPreview() {
  const [started] = useState(() => Date.now());
  return <main style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px 80px", display: "grid", gap: 28, background: "var(--background)", color: "var(--foreground)", minHeight: "100dvh" }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h1 style={{ fontSize: 20, margin: 0 }}>Panda Agent UI preview</h1><ThemeToggle /></header>
    <section><h2 style={{ fontSize: 14 }}>Working pill</h2><div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><WorkingPill label="Searching sources" /><WorkingPill label="Done" done doneLabel="Thought for 6s" /></div></section>
    <section><h2 style={{ fontSize: 14 }}>Thinking panel: running</h2><ThinkingPanel steps={steps.slice(0, 3)} busy complete={false} startedAt={started} finishedAt={null} note="Read 3 fragments, 2,140 characters" /></section>
    <section><h2 style={{ fontSize: 14 }}>Thinking panel: finished</h2><ThinkingPanel steps={steps} busy={false} complete startedAt={started - 7400} finishedAt={started} sources={citations.map(({ id, title, domain }) => ({ id, title, domain }))} /></section>
    <section><h2 style={{ fontSize: 14 }}>Thinking panel: stopped</h2><ThinkingPanel steps={steps.slice(0, 2)} busy={false} complete={false} startedAt={started - 3100} finishedAt={started} /></section>
    <section><h2 style={{ fontSize: 14 }}>Tool calls: live</h2><ToolCallGroup live calls={[{ id: "1", name: "catalog_search", label: "Approved sources", state: "complete", durationMs: 820 }, { id: "2", name: "read_public_docs", label: "Official documentation", state: "running" }]} /></section>
    <section><h2 style={{ fontSize: 14 }}>Tool calls: finished</h2><ToolCallGroup live={false} calls={[{ id: "1", name: "catalog_search", label: "Approved sources", state: "complete", durationMs: 820 }, { id: "2", name: "read_public_docs", label: "Official documentation", state: "failed" }, { id: "3", name: "format_bom", label: "Component outline", state: "unknown" }]} /></section>
    <section><h2 style={{ fontSize: 14 }}>Cited answer</h2><CitationProvider messageId="preview" citations={citations}><SourceStrip /><p style={{ lineHeight: 1.65 }}>The x8266 uses the ESP8266 microcontroller <CitationChip id="S1">[S1]</CitationChip> with 4 MB of SPI flash <CitationChip id="S2">[S2]</CitationChip>. To program it from Arduino, select the board and flash size first <CitationChip id="S3">[S3]</CitationChip>.</p><SourcePanel /></CitationProvider></section>
    <section><h2 style={{ fontSize: 14 }}>Cited answer: one listing, three sections</h2><CitationProvider messageId="preview-same" citations={sameListing}><SourceStrip /><p style={{ lineHeight: 1.65 }}>The x8266 is a compact ESP8266 board <CitationChip id="S1">[S1]</CitationChip> with USB Type-C <CitationChip id="S2">[S2]</CitationChip> and an on-board RGB LED <CitationChip id="S3">[S3]</CitationChip>.</p><SourcePanel /></CitationProvider></section>
    <section><h2 style={{ fontSize: 14 }}>Answer blocks</h2><div style={{ display: "grid", gap: 4 }}><MermaidBlock code={mermaidSample} /><WiringBlock code={wiringSample} /><StepsBlock code={stepsSample} /><CalloutBlock code={calloutSample} /><WiringBlock code={wiringBad} /></div></section>
    <section><h2 style={{ fontSize: 14 }}>Flow guide</h2><div style={{ display: "grid", gap: 4 }}><FlowBlock code={flowSample} /><FlowBlock code="{broken" /></div></section>
    <section><h2 style={{ fontSize: 14 }}>Source accordion</h2><CitationProvider messageId="preview-acc" citations={citations}><p style={{ lineHeight: 1.65 }}>The x8266 uses the ESP8266 <CitationChip id="S1">[S1]</CitationChip> with 4 MB of flash <CitationChip id="S2">[S2]</CitationChip>.</p><SourceAccordion /></CitationProvider><CitationProvider messageId="preview-acc-same" citations={sameListing}><p style={{ lineHeight: 1.65 }}>Compact board <CitationChip id="S1">[S1]</CitationChip> with USB Type-C <CitationChip id="S2">[S2]</CitationChip>.</p><SourceAccordion /></CitationProvider></section>
    <section><h2 style={{ fontSize: 14 }}>Rich answer (Streamdown)</h2><CitationProvider messageId="rich" citations={citations}><RichMarkdown text={richSample} citations={{ messageId: "rich", ids: citations.map(c => c.id) }} /><SourceAccordion /></CitationProvider></section>
    <section><h2 style={{ fontSize: 14 }}>Rich answer: hostile sample</h2><CitationProvider messageId="hostile" citations={citations}><RichMarkdown text={hostileSample} citations={{ messageId: "hostile", ids: citations.map(c => c.id) }} /></CitationProvider></section>
  </main>;
}
