import { parseCartItems } from "../cart/validation.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).length === expected.length && Object.keys(v).every(k => expected.includes(k));
function text(v: unknown, max: number, required = true): string | null {
  if (typeof v !== "string" || CONTROL.test(v) || Array.from(v).length > max) return null;
  const s = v.trim();
  return required && !s ? null : s;
}
function phone(v: unknown): string | null {
  const s = text(v, 30);
  return s && /^[+0-9 ()-]+$/.test(s) && /^[0-9]{7,15}$/.test(s.replace(/\D/g, "")) ? s : null;
}
const addressKeys = ["recipientName", "phone", "line1", "line2", "city", "state", "postalCode", "country"];
function address(v: unknown) {
  if (!object(v) || !keys(v, addressKeys)) return null;
  const recipientName = text(v.recipientName, 120), p = phone(v.phone), line1 = text(v.line1, 200), line2 = text(v.line2, 200, false), city = text(v.city, 100), state = text(v.state, 100), postalCode = text(v.postalCode, 6), country = text(v.country, 5);
  if (!recipientName || !p || !line1 || line2 === null || !city || !state || !postalCode || !/^[0-9]{6}$/.test(postalCode) || country !== "India") return null;
  return { recipientName, phone: p, line1, line2, city, state, postalCode, country };
}
export function parseSimulationRequest(v: unknown) {
  if (!object(v) || !keys(v, ["idempotencyKey", "mode", "expectedCartVersion", "expectedSubtotalPaise", "items", "contact", "shipping", "billing", "business", "gstin"])) return null;
  if (!Number.isSafeInteger(v.expectedSubtotalPaise) || Number(v.expectedSubtotalPaise) < 0) return null;
  if (typeof v.idempotencyKey !== "string" || !UUID.test(v.idempotencyKey) || (v.mode !== "cart" && v.mode !== "buy-now")) return null;
  if (v.mode === "cart" ? !Number.isSafeInteger(v.expectedCartVersion) || Number(v.expectedCartVersion) < 0 || Number(v.expectedCartVersion) > Number.MAX_SAFE_INTEGER - 1 : v.expectedCartVersion !== null) return null;
  const items = parseCartItems(v.items), shipping = address(v.shipping), billing = address(v.billing);
  if (!items?.length || (v.mode === "buy-now" && items.length !== 1) || !shipping || !billing || !object(v.contact) || !keys(v.contact, ["email", "firstName", "lastName", "phone"])) return null;
  const email = text(v.contact.email, 254), firstName = text(v.contact.firstName, 120), lastName = text(v.contact.lastName, 120), p = phone(v.contact.phone), business = text(v.business, 160, false), gstin = text(v.gstin, 15, false)?.toUpperCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !firstName || !lastName || !p || business === null || gstin === undefined || (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(gstin))) return null;
  return { idempotencyKey: v.idempotencyKey, mode: v.mode, expectedCartVersion: v.expectedCartVersion, expectedSubtotalPaise: v.expectedSubtotalPaise, items, contact: { email, firstName, lastName, phone: p }, shipping, billing, business, gstin };
}
export function parseSimulationRecovery(v: unknown): string | null {
  return object(v) && keys(v, ["idempotencyKey"]) && typeof v.idempotencyKey === "string" && UUID.test(v.idempotencyKey) ? v.idempotencyKey : null;
}
export function parseOrderQuery(q: URLSearchParams) {
  if ([...q.keys()].some(k => !["limit", "offset"].includes(k) || q.getAll(k).length !== 1)) return null;
  const limit = q.get("limit") ?? "20", offset = q.get("offset") ?? "0";
  if (!["10", "20", "50"].includes(limit) || !/^(0|[1-9][0-9]*)$/.test(offset) || Number(offset) > 10000) return null;
  return { limit: Number(limit), offset: Number(offset) };
}
export const isOrderReference = (v: string) => /^SIM-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function parseAdminOrderUpdate(v: unknown) {
  if (!object(v) || !keys(v, ["expectedVersion", "status", "shipping"]) || !Number.isSafeInteger(v.expectedVersion) || Number(v.expectedVersion) < 1 || !["pending", "processing", "fulfilled", "cancelled"].includes(v.status as string) || !object(v.shipping) || !keys(v.shipping, ["carrier", "trackingNumber", "trackingUrl"])) return null;
  const carrier = text(v.shipping.carrier, 100, false), trackingNumber = text(v.shipping.trackingNumber, 120, false), trackingUrl = text(v.shipping.trackingUrl, 500, false);
  if (carrier === null || trackingNumber === null || trackingUrl === null) return null;
  if (trackingUrl) { try { const url = new URL(trackingUrl); if (url.protocol !== "https:" || url.username || url.password) return null; } catch { return null; } }
  return { expectedVersion: v.expectedVersion, status: v.status, shipping: { carrier, trackingNumber, trackingUrl } };
}
