import { parseSlug, parseRecordId } from "../admin/validation.ts";
import { parsePublicVariant, type PublicVariant } from "../editorial/public-record.ts";

export const MAX_CART_LINES = 50;
export const MAX_CART_BODY_BYTES = 8192;
export const MAX_CART_TOTAL_PAISE = 49_500_000_000_000;
const MAX_EXPECTED_VERSION = 9_007_199_254_740_990;
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export type CartInputLine = { variantId: string; quantity: number };

export type CartQuoteLine = {
  variantId: string;
  quantity: number;
  productId: string | null;
  revisionId: string | null;
  slug: string | null;
  title: string | null;
  variant: PublicVariant | null;
  lineTotalPaise: number | null;
  issue: "not_available" | "price_unavailable" | "quantity_unavailable" | null;
};

export type CartQuote = {
  lines: CartQuoteLine[];
  subtotalPaise: number | null;
  readyForCheckout: boolean;
};

export type CustomerCart = {
  version: number;
  items: CartInputLine[];
  quote: CartQuote;
};

export type CartReplaceRequest = { expectedVersion: number; items: CartInputLine[] };
export type CartQuoteRequest = { items: CartInputLine[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function safePaise(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= MAX_CART_TOTAL_PAISE;
}

function safeText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && Array.from(value).length <= max && !CONTROL_CHARS.test(value);
}

export function parseCartItems(value: unknown): CartInputLine[] | null {
  if (!Array.isArray(value) || value.length > MAX_CART_LINES) return null;

  const items: CartInputLine[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isObject(entry) || !hasExactKeys(entry, ["variantId", "quantity"])) return null;
    if (typeof entry.variantId !== "string") return null;
    const variantId = parseRecordId(entry.variantId);
    if (!variantId || !Number.isSafeInteger(entry.quantity) || Number(entry.quantity) < 1 || Number(entry.quantity) > 99) return null;
    if (seen.has(variantId)) return null;
    seen.add(variantId);
    items.push({ variantId, quantity: Number(entry.quantity) });
  }
  return items;
}

export function parseCartQuoteRequest(value: unknown): CartQuoteRequest | null {
  if (!isObject(value) || !hasExactKeys(value, ["items"])) return null;
  const items = parseCartItems(value.items);
  return items ? { items } : null;
}

export function parseCartReplaceRequest(value: unknown): CartReplaceRequest | null {
  if (!isObject(value) || !hasExactKeys(value, ["expectedVersion", "items"])) return null;
  if (!Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 0 || Number(value.expectedVersion) > MAX_EXPECTED_VERSION) return null;
  const items = parseCartItems(value.items);
  return items ? { expectedVersion: Number(value.expectedVersion), items } : null;
}

function parseQuoteLine(value: unknown): CartQuoteLine | null {
  const keys = ["variantId", "quantity", "productId", "revisionId", "slug", "title", "variant", "lineTotalPaise", "issue"] as const;
  if (!isObject(value) || !hasExactKeys(value, keys)) return null;
  if (typeof value.variantId !== "string") return null;
  const variantId = parseRecordId(value.variantId);
  if (!variantId || !Number.isSafeInteger(value.quantity) || Number(value.quantity) < 1 || Number(value.quantity) > 99) return null;
  const quantity = Number(value.quantity);
  const issue = value.issue;
  if (issue !== null && issue !== "not_available" && issue !== "price_unavailable" && issue !== "quantity_unavailable") return null;
  if (value.lineTotalPaise !== null && !safePaise(value.lineTotalPaise)) return null;

  if (issue === "not_available") {
    if (value.productId !== null || value.revisionId !== null || value.slug !== null || value.title !== null || value.variant !== null || value.lineTotalPaise !== null) return null;
    return { variantId, quantity, productId: null, revisionId: null, slug: null, title: null, variant: null, lineTotalPaise: null, issue };
  }

  if (typeof value.productId !== "string" || !parseRecordId(value.productId) ||
      typeof value.revisionId !== "string" || !parseRecordId(value.revisionId) ||
      typeof value.slug !== "string" || !parseSlug(value.slug) ||
      !safeText(value.title, 160) || !isObject(value.variant) ||
      !hasExactKeys(value.variant, ["id", "sku", "label", "regularPricePaise", "effectivePricePaise", "isOnSale", "saleEndsAt", "availability", ...("cartEligible" in value.variant ? ["cartEligible"] : [])])) return null;

  let variant: PublicVariant;
  try {
    variant = parsePublicVariant(value.variant);
  } catch {
    return null;
  }
  if (parseRecordId(variant.id) !== variantId) return null;
  variant = { ...variant, id: variantId };

  if (issue === "price_unavailable") {
    if (variant.effectivePricePaise !== null || value.lineTotalPaise !== null) return null;
  } else {
    if (variant.effectivePricePaise === null || !safePaise(value.lineTotalPaise)) return null;
    const expectedTotal = variant.effectivePricePaise * quantity;
    if (!Number.isSafeInteger(expectedTotal) || expectedTotal > MAX_CART_TOTAL_PAISE || value.lineTotalPaise !== expectedTotal) return null;
    if ((issue === null && variant.availability !== "available") ||
        (issue === "quantity_unavailable" && variant.availability !== "unavailable")) return null;
  }

  return {
    variantId,
    quantity,
    productId: parseRecordId(value.productId),
    revisionId: parseRecordId(value.revisionId),
    slug: value.slug,
    title: value.title,
    variant,
    lineTotalPaise: value.lineTotalPaise as number | null,
    issue,
  };
}

export function parseCartQuote(value: unknown): CartQuote | null {
  if (!isObject(value) || !hasExactKeys(value, ["lines", "subtotalPaise", "readyForCheckout"]) || !Array.isArray(value.lines) || value.lines.length > MAX_CART_LINES) return null;
  if (!(value.subtotalPaise === null || safePaise(value.subtotalPaise)) || typeof value.readyForCheckout !== "boolean") return null;

  const lines: CartQuoteLine[] = [];
  const seen = new Set<string>();
  for (const entry of value.lines) {
    const line = parseQuoteLine(entry);
    if (!line || seen.has(line.variantId)) return null;
    seen.add(line.variantId);
    lines.push(line);
  }

  const allPriced = lines.every((line) => line.lineTotalPaise !== null);
  const subtotal = allPriced ? lines.reduce((total, line) => total + (line.lineTotalPaise ?? 0), 0) : null;
  if (subtotal !== null && (!Number.isSafeInteger(subtotal) || subtotal > MAX_CART_TOTAL_PAISE)) return null;
  const expectedSubtotal = allPriced ? subtotal : null;
  const ready = lines.length > 0 && lines.every((line) => line.issue === null);
  if (value.subtotalPaise !== expectedSubtotal || value.readyForCheckout !== ready) return null;

  return { lines, subtotalPaise: expectedSubtotal, readyForCheckout: ready };
}

export function parseCustomerCart(value: unknown): CustomerCart | null {
  if (!isObject(value) || !hasExactKeys(value, ["version", "items", "quote"]) ||
      !Number.isSafeInteger(value.version) || Number(value.version) < 0 || Number(value.version) > Number.MAX_SAFE_INTEGER) return null;
  const items = parseCartItems(value.items);
  const quote = parseCartQuote(value.quote);
  if (!items || !quote || (value.version === 0 && items.length !== 0) || quote.lines.length !== items.length) return null;

  const itemsById = new Map(items.map((item) => [item.variantId, item.quantity]));
  if (quote.lines.some((line) => itemsById.get(line.variantId) !== line.quantity)) return null;
  return { version: Number(value.version), items, quote };
}
