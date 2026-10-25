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

export function sourceReviewNotes(entry) {
  return ["Development source integration; owner factual and publication review remains pending.",
    ...entry.reviewIssues.map((issue) => [issue.code?.replaceAll("_", " "), issue.field, issue.meaning, issue.rationale].filter(Boolean).join(" · "))]
    .map((note) => note.slice(0, 2000)).slice(0, 64);
}
