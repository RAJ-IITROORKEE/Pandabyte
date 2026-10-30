import "server-only";
import path from "node:path";
import type { TestBill, TestBillAddress } from "./test-bill.ts";

const NOTICE = "TEST — NOT A TAX INVOICE";
const formatMoney = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
const addressText = (value: TestBillAddress) => [value.recipientName, value.line1, value.line2, `${value.city}, ${value.state} ${value.postalCode}`, value.country, value.phone].filter(Boolean).join("\n");

export async function renderTestBillPdf(bill: TestBill): Promise<Buffer> {
  const { default: PDFDocument } = await import("pdfkit");
  const fonts = path.join(process.cwd(), "public", "fonts", "noto-sans");
  const regular = path.join(fonts, "NotoSans-Regular.ttf");
  const doc = new PDFDocument({ autoFirstPage: false, size: "A4", margin: 44, font: regular, info: { Title: `PandaByte test bill ${bill.reference}`, Author: "PandaByte.in", Subject: NOTICE } });
  const output = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    doc.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 4 * 1024 * 1024) doc.destroy(new Error("Document size limit exceeded.")); else chunks.push(chunk); });
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  // Rendering is synchronous; attach a rejection handler before any layout error can stop it.
  void output.catch(() => {});
  try {
    doc.registerFont("Body", regular);
    doc.registerFont("Strong", path.join(fonts, "NotoSans-Bold.ttf"));
    doc.registerFont("Devanagari", path.join(fonts, "NotoSansDevanagari-Regular.ttf"));
    const left = 44, width = 507, bottom = 770;
    let cursor = 120, pageNumber = 0;
    // PDFKit's pinned embedded-font wrapper retains Fontkit's coverage API.
    const coverage = Object.fromEntries(["Body", "Strong", "Devanagari"].map(name => {
      doc.font(name);
      return [name, (doc as unknown as { _font: { font: { hasGlyphForCodePoint(code: number): boolean } } })._font.font];
    }));
    function runs(value: string, bold: boolean) {
      const result: { font: string; value: string }[] = [];
      for (const char of value) {
        const code = char.codePointAt(0)!;
        const primary = bold ? "Strong" : "Body";
        const font = (code === 0x200c || code === 0x200d) && result.length ? result.at(-1)!.font : coverage[primary].hasGlyphForCodePoint(code) ? primary : coverage.Devanagari.hasGlyphForCodePoint(code) ? "Devanagari" : null;
        if (!font) throw new Error("The document font does not support this character.");
        if (result.at(-1)?.font === font) result.at(-1)!.value += char;
        else result.push({ font, value: char });
      }
      return result;
    }
    function lineWidth(value: string, size: number, bold: boolean) { return runs(value, bold).reduce((sum, run) => sum + doc.font(run.font).fontSize(size).widthOfString(run.value), 0); }
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    function layout(value: string, size: number, bold: boolean, textWidth: number) {
      const lines: string[] = [];
      for (const paragraph of value.split("\n")) {
        let line = "";
        for (const word of paragraph.match(/\S+\s*|\s+/gu) ?? []) {
          if (line && lineWidth(line + word, size, bold) > textWidth) { lines.push(line.trimEnd()); line = ""; }
          if (lineWidth(word, size, bold) <= textWidth) { line += word; continue; }
          for (const { segment } of segmenter.segment(word)) {
            if (line && lineWidth(line + segment, size, bold) > textWidth) { lines.push(line.trimEnd()); line = ""; }
            line += segment;
          }
        }
        lines.push(line.trimEnd());
      }
      return lines;
    }
    const lineHeight = (size: number) => size * 1.6;
    function measure(value: string, size: number, bold = false, textWidth = width) { return layout(value, size, bold, textWidth).length * lineHeight(size); }
    function draw(value: string, x: number, y: number, size: number, bold = false, textWidth = width) {
      for (const [index, line] of layout(value, size, bold, textWidth).entries()) {
        let runX = x;
        for (const run of runs(line, bold)) {
          doc.markContent("Span", { actual: run.value });
          doc.font(run.font).fontSize(size).fillColor("#222222").text(run.value, runX, y + index * lineHeight(size), { lineBreak: false });
          doc.endMarkedContent();
          runX += doc.widthOfString(run.value);
        }
      }
    }
    function newPage() {
      doc.addPage(); pageNumber += 1;
      draw("PandaByte.in", left, 33, 16, true);
      draw(NOTICE, left, 60, 12, true);
      draw(`Order ${bill.reference}`, left, 82, 9);
      draw(`${NOTICE} · Page ${pageNumber}`, left, 782, 8);
      cursor = 120;
    }
    function ensure(height: number) { if (cursor + height > bottom) newPage(); }
    function paragraph(value: string, size = 10, bold = false) {
      const height = measure(value, size, bold); ensure(height + 9); draw(value, left, cursor, size, bold); cursor += height + 9;
    }
    newPage();
    paragraph("Order-specific test bill", 17, true);
    paragraph(`Order date: ${new Date(bill.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`);
    paragraph(`Payment: paid in Razorpay test mode · Fulfillment: ${bill.status}`);
    paragraph("No live payment was collected. This document does not issue a legal invoice. Merchant legal address, GST and HSN details are not configured.");
    const addresses = [{ label: "Bill to", value: addressText(bill.billing) }, { label: "Ship to", value: addressText(bill.shipping) }];
    const columnWidth = 240;
    const addressHeight = Math.max(...addresses.map(item => measure(item.value, 10, false, columnWidth))) + 27;
    ensure(addressHeight + 18);
    for (const [index, item] of addresses.entries()) { const x = left + index * 267; draw(item.label, x, cursor, 11, true, columnWidth); draw(item.value, x, cursor + 25, 10, false, columnWidth); }
    cursor += addressHeight + 18;
    paragraph("Purchased items", 12, true);
    for (const [index, line] of bill.lines.entries()) {
      const description = `${index + 1}. ${line.title}${line.variant ? ` · ${line.variant}` : ""}`;
      const detail = `SKU: ${line.sku}\nQty: ${line.quantity} · Unit: ${formatMoney(line.unitPaise)} · Line: ${formatMoney(line.totalPaise)}`;
      const headingHeight = measure(description, 10, true), detailHeight = measure(detail, 9);
      ensure(headingHeight + detailHeight + 22);
      draw(description, left, cursor, 10, true); cursor += headingHeight + 4;
      draw(detail, left, cursor, 9); cursor += detailHeight + 10;
      doc.moveTo(left, cursor).lineTo(left + width, cursor).strokeColor("#dddddd").lineWidth(0.5).stroke(); cursor += 10;
    }
    ensure(155);
    paragraph(`Subtotal: ${formatMoney(bill.subtotalPaise)}`);
    paragraph(`Fictional test shipping: ${formatMoney(bill.shippingPaise)}`);
    paragraph(`Fictional test tax: ${formatMoney(bill.taxPaise)}`);
    paragraph(`Test order total: ${formatMoney(bill.totalPaise)}`, 12, true);
    paragraph("Shipping and tax are fictional test amounts. This bill is for local test review only.", 9);
    doc.end();
    return await output;
  } catch (error) { doc.destroy(error instanceof Error ? error : new Error("Document unavailable.")); throw error; }
}
