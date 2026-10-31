import assert from "node:assert/strict";
import test from "node:test";
import { structureProductSummary } from "../lib/catalog/product-summary.ts";

test("preserves source headings, indented facts and bullet text in order", () => {
  assert.deepEqual(structureProductSummary("Specifications:\nMCU:\n  ESP32-C3 processor\n  4 MB flash\nWi-Fi:\n  2.4 GHz"), [
    { type: "heading", text: "Specifications" }, { type: "heading", text: "MCU" },
    { type: "list", items: ["ESP32-C3 processor", "4 MB flash"] },
    { type: "heading", text: "Wi-Fi" }, { type: "list", items: ["2.4 GHz"] },
  ]);
});

test("keeps prose and explicit bullets as plain content", () => {
  assert.deepEqual(structureProductSummary("A practical board for IoT.\n\nFeatures:\n- USB\n• GPIO"), [
    { type: "paragraph", text: "A practical board for IoT." }, { type: "heading", text: "Features" },
    { type: "list", items: ["USB", "GPIO"] },
  ]);
});
