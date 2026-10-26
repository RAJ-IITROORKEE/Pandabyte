export const EDITORIAL_MEDIA_BUCKET = "editorial-media";
export const MAX_MEDIA_BYTES = 4 * 1024 * 1024;
export const MAX_MEDIA_REQUEST_BYTES = MAX_MEDIA_BYTES + 32 * 1024;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const INQUIRY_STATUSES = ["new", "in_progress", "resolved", "spam"] as const;

export function objectWithKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.includes(key));
}

export function boundedText(value: unknown, max: number, required = false): string | null {
  if (typeof value !== "string" || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) return null;
  const text = value.trim();
  return text.length <= max && (!required || text.length > 0) ? text : null;
}

export function parseMediaPatch(value: unknown) {
  if (!objectWithKeys(value, ["expectedVersion", "altText", "source", "published", "publicUseAllowed"]) ||
    !Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 1 || typeof value.published !== "boolean") return null;
  if ("publicUseAllowed" in value && typeof value.publicUseAllowed !== "boolean") return null;
  const altText = boundedText(value.altText, 300, true);
  const source = boundedText(value.source, 500);
  return altText !== null && source !== null
    ? { expectedVersion: Number(value.expectedVersion), altText, source, published: value.published,
      ...("publicUseAllowed" in value ? { publicUseAllowed: value.publicUseAllowed as boolean } : {}) } : null;
}

export function parseInquiryInput(value: unknown) {
  if (!objectWithKeys(value, ["name", "email", "phone", "subject", "message", "idempotencyKey"])) return null;
  const name = boundedText(value.name, 120, true), email = boundedText(value.email, 254, true);
  const phone = boundedText(value.phone ?? "", 40), subject = boundedText(value.subject, 200, true);
  const message = boundedText(value.message, 5000, true);
  if (name === null || email === null || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    phone === null || subject === null || message === null || typeof value.idempotencyKey !== "string" || !UUID_PATTERN.test(value.idempotencyKey)) return null;
  return { name, email: email.toLowerCase(), phone, subject, message, idempotencyKey: value.idempotencyKey };
}

export function parseInquiryPatch(value: unknown) {
  if (!objectWithKeys(value, ["expectedVersion", "status", "note"]) ||
    !Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 1 ||
    !INQUIRY_STATUSES.includes(value.status as typeof INQUIRY_STATUSES[number])) return null;
  const note = boundedText(value.note ?? "", 2000);
  return note === null ? null : { expectedVersion: Number(value.expectedVersion), status: String(value.status), note };
}

export function parseListQuery(url: string) {
  const params = new URL(url).searchParams;
  if ([...params.keys()].some((key) => !["q", "limit", "offset", "status"].includes(key)) ||
    [...new Set(params.keys())].some((key) => params.getAll(key).length > 1)) return null;
  const query = boundedText(params.get("q") ?? "", 100);
  const limitText = params.get("limit") ?? "25", offsetText = params.get("offset") ?? "0";
  if (query === null || !/^\d{1,2}$/.test(limitText) || !/^\d{1,7}$/.test(offsetText)) return null;
  const limit = Number(limitText), offset = Number(offsetText), status = params.get("status") || null;
  if (limit < 1 || limit > 50 || offset > 1000000 || (status && !INQUIRY_STATUSES.includes(status as typeof INQUIRY_STATUSES[number]))) return null;
  return { query, limit, offset, status };
}
