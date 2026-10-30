import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { inflateSync } from "node:zlib";
import ts from "typescript";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseTestBill } from "../lib/orders/test-bill.ts";
import { orderFixture, reference } from "./test-order-bill-fixture.mjs";

// Load the real renderer while replacing only Next's server-only marker.
const require = createRequire(import.meta.url), exports = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/orders/test-bill-pdf.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { exports, Buffer, process, Intl, Error, require: name => name === "server-only" ? {} : require(name) });
const render = order => exports.renderTestBillPdf(parseTestBill(order, reference));

async function readPdf(bytes) {
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  assert.ok(bytes.length < 4 * 1024 * 1024);
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false });
  const pdf = await task.promise;
  const pages = [];
  try {
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index), text = await page.getTextContent();
      pages.push(text.items.map(item => item.str ?? "").join(" ").replace(/\s+/g, " "));
    }
  } finally { await task.destroy(); }
  return pages;
}

test("generated test PDF contains the exact order, purchased details, money, addresses and no legal invoice claims", async () => {
  const pages = await readPdf(await render(orderFixture()));
  assert.equal(pages.length, 1);
  const text = pages.join(" ");
  for (const value of [reference, "TEST — NOT A TAX INVOICE", "Purchased sensor", "SAVED-SKU", "Saved variant", "Saved Customer", "Saved address", "Kolkata", "₹60.00", "₹120.00", "₹123.45", "Fictional test shipping", "Fictional test tax", "Merchant legal address, GST and HSN details are not configured."]) assert.ok(text.includes(value), value);
  assert.doesNotMatch(text, /Example Customer|tax invoice number|GSTIN:/i);
});

test("multipage test PDF repeats its TEST notice and includes all long item names without losing totals", async () => {
  const order = orderFixture();
  order.snapshot.quote.lines = Array.from({ length: 50 }, (_, index) => ({ title: `Purchased item ${index + 1} ` + "X".repeat(230), quantity: 2, lineTotalPaise: 12000, variant: { sku: `SNAPSHOT-SKU-${index + 1}`, label: "Saved variant", effectivePricePaise: 6000 } }));
  order.snapshot.quote.subtotalPaise = 600000; order.totalPaise = 600345;
  const pages = await readPdf(await render(order));
  assert.ok(pages.length > 1); assert.ok(pages.length <= 15);
  for (const [index, page] of pages.entries()) { assert.ok(page.includes("TEST — NOT A TAX INVOICE"), `page ${index + 1}`); assert.ok(page.includes(`Page ${index + 1}`)); }
  const text = pages.join(" ");
  for (let index = 1; index <= 50; index++) assert.ok(text.includes(`SNAPSHOT-SKU-${index}`));
  assert.ok(text.includes("₹6,003.45"));
});

test("test PDF embeds Unicode font fallback and rejects unsupported glyphs instead of producing a corrupt bill", async () => {
  const order = orderFixture(); order.snapshot.billing.recipientName = "राज रबिदास";
  const bytes = await render(order), text = (await readPdf(bytes)).join(" ");
  assert.ok(text.includes("राज"));
  // Shaped Indic glyphs can be extracted in visual order; ActualText retains logical spelling.
  const actual = [];
  for (const stream of bytes.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content;
    try { content = inflateSync(Buffer.from(stream[1], "latin1")).toString("latin1"); } catch { continue; }
    for (const match of content.matchAll(/\/ActualText\s*\(([^)]*)\)/g)) {
      const escapes = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
      const value = match[1].replace(/\\([nrtbf()\\])/g, (_, escaped) => escapes[escaped]);
      if (value.startsWith("\xfe\xff")) actual.push(Buffer.from(value.slice(2), "latin1").swap16().toString("utf16le"));
    }
  }
  assert.ok(actual.includes("रबिदास"));
  order.snapshot.billing.recipientName = "Unsupported 🦄";
  await assert.rejects(render(order), /font does not support/);
});
