export type SummaryPart = { type: "heading" | "paragraph"; text: string } | { type: "list"; items: string[] };

// Imported summaries retain indentation from the source; never infer new product facts.
export function structureProductSummary(summary: string): SummaryPart[] {
  const parts: SummaryPart[] = [];
  for (const raw of summary.split(/\r?\n/)) {
    const text = raw.trim();
    if (!text) continue;
    const listItem = /^(?: {2,}|\t|\s*[-*•]\s+)/.test(raw);
    if (listItem) {
      const item = text.replace(/^[-*•]\s+/, "");
      const previous = parts[parts.length - 1];
      if (previous?.type === "list") previous.items.push(item);
      else parts.push({ type: "list", items: [item] });
    } else if (text.length <= 60 && (text.endsWith(":") || /^specifications?$/i.test(text))) {
      parts.push({ type: "heading", text: text.replace(/\s*:\s*$/, "") });
    } else {
      parts.push({ type: "paragraph", text });
    }
  }
  return parts;
}
