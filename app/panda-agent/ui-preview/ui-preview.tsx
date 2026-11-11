"use client";

import { useState } from "react";
import { ThinkingPanel } from "@/Panda-agent/src/ui/agent/thinking-panel";
import { ToolCallGroup } from "@/Panda-agent/src/ui/agent/tool-calls";
import { CitationChip, CitationProvider, SourcePanel, SourceStrip } from "@/Panda-agent/src/ui/agent/cited-answer";
import { WorkingPill } from "@/Panda-agent/src/ui/agent/working-pill";
import { ThemeToggle } from "@/components/theme-toggle";

const citations = [
  { id: "S1", n: 1, title: "PandaByte x8266 Wi-Fi development board", domain: "pandabyte-iot.vercel.app", href: "https://pandabyte-iot.vercel.app/products", date: "11 Nov 2026", quote: "The x8266 board is built around the ESP8266 microcontroller with 4 MB of SPI flash and a CH340 USB-to-serial bridge.", kind: "Product listing" },
  { id: "S2", n: 2, title: "ESP8266 technical reference: memory map and flash", domain: "docs.espressif.com", href: "https://docs.espressif.com/", date: "02 Oct 2026", quote: "External SPI flash up to 16 MB is supported; common modules ship with 4 MB.", kind: "Espressif reference" },
  { id: "S3", n: 3, title: "Getting started with Arduino on ESP8266", domain: "arduino-esp8266.readthedocs.io", href: "https://arduino-esp8266.readthedocs.io/", date: "20 Sep 2026", quote: "Select the board, set the flash size and upload over the serial port.", kind: "Web search excerpt" },
  { id: "S4", n: 4, title: "Power budget notes", domain: "PandaByte listing", quote: "Deep sleep current is listed at about 20 µA.", kind: "Product listing" },
];
const steps = ["Understanding your question", "Reading sources", "Selecting evidence", "Checking citations"];

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
  </main>;
}
