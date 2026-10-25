import { createHash } from "node:crypto";

export function fingerprint(value) {
  const ordered = (v) => Array.isArray(v) ? v.map(ordered) : v && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, ordered(v[key])])) : v;
  return createHash("sha256").update(JSON.stringify(ordered(value))).digest("hex");
}

export function recordDecision(tracked, current, sourceFingerprint) {
  if (!tracked) return current ? "collision" : "create";
  if (!current || current.archived || current.id !== tracked.id) return "conflict";
  if (tracked.awaitingPublication) {
    if (sourceFingerprint !== tracked.sourceFingerprint) return "conflict";
    const sameDocument = fingerprint(current.document) === tracked.documentFingerprint;
    if (sameDocument && current.version === tracked.version && current.publishedRevisionId === tracked.publishedRevisionId) return "publish";
    if (sameDocument && current.version === tracked.version + 1 && current.publishedRevisionId && current.publishedRevisionId !== tracked.publishedRevisionId) return "publication-confirmed";
    return "admin-edited";
  }
  if (current.version !== tracked.version || fingerprint(current.document) !== tracked.documentFingerprint ||
    current.publishedRevisionId !== tracked.publishedRevisionId) return "admin-edited";
  return sourceFingerprint === tracked.sourceFingerprint ? "unchanged" : "update";
}

export function trackRecord(record, sourceFingerprint, awaitingPublication = false) {
  return { id: record.id, version: record.version, publishedRevisionId: record.publishedRevisionId,
    documentFingerprint: fingerprint(record.document), sourceFingerprint, ...(awaitingPublication ? { awaitingPublication: true } : {}) };
}

export function documentWithoutVariantIds(document) {
  return Array.isArray(document.variants) ? { ...document, variants: document.variants.map(({ sku, label }) => ({ sku, label })) } : document;
}

function reviewText(value, maxLength = 2000) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\b[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}\b/giu, "[id omitted]")
    .replace(/\b[a-f\d]{64}\b/giu, "[hash omitted]")
    .replace(/https?:\/\/[^\s)]+/giu, "[link omitted]")
    .replace(/(?:[a-z]:[\\/]|\\\\)[^\s·|,;]+/giu, "[path omitted]")
    .replace(/\/(?:[\w.-]+\/)+[\w.-]+/gu, "[path omitted]")
    .replace(/\s+/gu, " ").trim().slice(0, maxLength);
}

function heldItemText(field, item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return "";

  if (field === "specifications") {
    const name = reviewText(item.name, 160);
    const value = reviewText(item.value, 600);
    return name && value ? `${name}: ${value}` : name || value;
  }
  if (field === "compatibility") return reviewText(item.text, 760);
  if (field === "kitContents") {
    const title = reviewText(item.title, 400);
    const quantityUnit = reviewText(item.quantityUnit, 80);
    const quantity = Number.isSafeInteger(item.quantity) ? `${item.quantity}${quantityUnit ? ` ${quantityUnit}` : ""}` : "";
    return [title, quantity].filter(Boolean).join(" · ");
  }
  return "";
}

export function sourceReviewNotes(entry) {
  const issues = Array.isArray(entry?.reviewIssues) ? entry.reviewIssues.slice(0, 63) : [];
  const notes = ["Development source integration; owner factual and publication review remains pending."];
  for (const issue of issues) {
    if (!issue || typeof issue !== "object" || Array.isArray(issue)) continue;
    const code = reviewText(issue.code, 120).replaceAll("_", " ");
    const field = reviewText(issue.field, 120);
    const details = [issue.meaning, issue.rationale, issue.detail].map((text) => reviewText(text)).filter(Boolean);
    const summary = [code, field, ...details].filter(Boolean).join(" · ");
    const items = Array.isArray(issue.items) ? issue.items.slice(0, 32)
      .map((item) => heldItemText(field, item)).filter(Boolean) : [];
    const note = [summary, items.length ? `Held source claims: ${items.join("; ")}` : ""].filter(Boolean).join(" · ");
    if (note) notes.push(note.slice(0, 2000));
  }
  return notes.slice(0, 64);
}
