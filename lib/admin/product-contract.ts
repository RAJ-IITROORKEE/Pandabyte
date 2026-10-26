import type { FieldError, ValidationResult } from "./validation.ts";

export type ProductTableQuery = {
  q: string;
  status: "all" | "draft" | "published" | "archived";
  categoryId: string | null;
  sort: "updated_desc" | "updated_asc" | "title_asc" | "title_desc" | "price_asc" | "price_desc";
  limit: 10 | 20 | 50;
  offset: number;
};

export type ProductPriceWrite = {
  sku: string;
  expectedPriceVersion: number;
  regularPricePaise: number;
  actualPricePaise?: number;
  salePricePaise: number | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  reason: string;
};

export type ProductTableStats = {
  totalProducts: number;
  unpricedProducts: number;
  categories: { id: string; title: string; count: number }[];
  prices: { minPaise: number; maxPaise: number; avgPaise: number; pricedProducts: number } | null;
};

const STATUSES = new Set(["all", "draft", "published", "archived"]);
const SORTS = new Set(["updated_desc", "updated_asc", "title_asc", "title_desc", "price_asc", "price_desc"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const PRODUCT_TABLE_KEYS = new Set(["q", "status", "categoryId", "sort", "limit", "offset"]);
const PRICE_KEYS = new Set(["sku", "expectedPriceVersion", "regularPricePaise", "actualPricePaise", "salePricePaise", "saleStartsAt", "saleEndsAt", "reason"]);

function fail(fields: FieldError[]): ValidationResult<never> {
  return { ok: false, fields };
}

export function parseProductTableQuery(search: URLSearchParams): ValidationResult<ProductTableQuery> {
  const fields: FieldError[] = [];
  for (const key of new Set(search.keys())) {
    if (!PRODUCT_TABLE_KEYS.has(key)) fields.push({ field: key, code: "unknown_field", message: "This query parameter is not allowed." });
    if (search.getAll(key).length > 1) fields.push({ field: key, code: "invalid", message: "Provide this parameter once." });
  }

  const q = (search.get("q") ?? "").trim();
  if (Array.from(q).length > 120 || CONTROL_CHARS.test(q)) fields.push({ field: "q", code: "invalid", message: "Use at most 120 characters." });

  const status = search.get("status") ?? "all";
  if (!STATUSES.has(status)) fields.push({ field: "status", code: "invalid", message: "Choose all, draft, published, or archived." });
  const sort = search.get("sort") ?? "updated_desc";
  if (!SORTS.has(sort)) fields.push({ field: "sort", code: "invalid", message: "Choose a supported sort order." });

  const rawCategoryId = search.get("categoryId");
  const categoryId = rawCategoryId === null ? null : UUID.test(rawCategoryId) ? rawCategoryId.toLowerCase() : null;
  if (rawCategoryId !== null && !categoryId) fields.push({ field: "categoryId", code: "invalid", message: "Choose a valid category." });

  const rawLimit = search.get("limit") ?? "20";
  const limit = rawLimit === "10" || rawLimit === "20" || rawLimit === "50" ? Number(rawLimit) : undefined;
  if (limit === undefined) fields.push({ field: "limit", code: "invalid", message: "Choose 10, 20, or 50 rows per page." });

  const rawOffset = search.get("offset") ?? "0";
  const offset = /^(0|[1-9][0-9]*)$/.test(rawOffset) ? Number(rawOffset) : Number.NaN;
  if (!Number.isSafeInteger(offset) || offset > 10_000) fields.push({ field: "offset", code: "invalid", message: "Use a whole number from 0 to 10000." });

  if (fields.length || limit === undefined || !Number.isSafeInteger(offset)) return fail(fields);
  return { ok: true, value: { q, status: status as ProductTableQuery["status"], categoryId, sort: sort as ProductTableQuery["sort"], limit: limit as ProductTableQuery["limit"], offset } };
}

function nullableUtcIso(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

export function parseProductPriceWrites(value: unknown): ValidationResult<ProductPriceWrite[]> {
  if (!Array.isArray(value) || value.length > 100) return fail([{ field: "prices", code: "invalid", message: "Use a list with at most 100 variant prices." }]);
  const fields: FieldError[] = [];
  const writes: ProductPriceWrite[] = [];
  const seen = new Set<string>();
  value.forEach((row, index) => {
    const path = `prices.${index}`;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      fields.push({ field: path, code: "invalid", message: "Enter a valid variant price." });
      return;
    }
    const item = row as Record<string, unknown>;
    for (const key of Object.keys(item)) if (!PRICE_KEYS.has(key)) fields.push({ field: `${path}.${key}`, code: "unknown_field", message: "This field is not allowed." });

    const sku = typeof item.sku === "string" ? item.sku.trim() : "";
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(sku)) fields.push({ field: `${path}.sku`, code: "invalid", message: "Enter a valid SKU." });
    else if (seen.has(sku.toLowerCase())) fields.push({ field: `${path}.sku`, code: "invalid", message: "Include each SKU once." });
    else seen.add(sku.toLowerCase());

    const expectedPriceVersion = item.expectedPriceVersion;
    if (!Number.isSafeInteger(expectedPriceVersion) || (expectedPriceVersion as number) < 0) fields.push({ field: `${path}.expectedPriceVersion`, code: "invalid", message: "Enter a valid price version." });

    const regularPricePaise = item.regularPricePaise;
    if (!Number.isSafeInteger(regularPricePaise) || (regularPricePaise as number) < 0 || (regularPricePaise as number) > 10_000_000_000) fields.push({ field: `${path}.regularPricePaise`, code: "invalid", message: "Enter a valid amount in paise." });

    const hasActualPrice = Object.prototype.hasOwnProperty.call(item, "actualPricePaise");
    const actualPricePaise = item.actualPricePaise;
    if (hasActualPrice && (!Number.isSafeInteger(actualPricePaise) || (actualPricePaise as number) < 0 || (actualPricePaise as number) > 10_000_000_000)) fields.push({ field: `${path}.actualPricePaise`, code: "invalid", message: "Enter a valid selling amount in paise." });
    if (hasActualPrice && Number.isSafeInteger(regularPricePaise) && Number.isSafeInteger(actualPricePaise) && (actualPricePaise as number) > (regularPricePaise as number)) fields.push({ field: path, code: "invalid", message: "Selling price cannot exceed the list price." });

    const salePricePaise = item.salePricePaise;
    if (!(salePricePaise === null || (Number.isSafeInteger(salePricePaise) && (salePricePaise as number) >= 0 && (salePricePaise as number) <= 10_000_000_000))) fields.push({ field: `${path}.salePricePaise`, code: "invalid", message: "Enter a valid sale amount in paise or leave it unset." });

    const saleStartsAt = nullableUtcIso(item.saleStartsAt);
    const saleEndsAt = nullableUtcIso(item.saleEndsAt);
    if (saleStartsAt === undefined) fields.push({ field: `${path}.saleStartsAt`, code: "invalid", message: "Enter a UTC date and time ending in Z, or leave it unset." });
    if (saleEndsAt === undefined) fields.push({ field: `${path}.saleEndsAt`, code: "invalid", message: "Enter a UTC date and time ending in Z, or leave it unset." });
    if (salePricePaise === null && (saleStartsAt !== null || saleEndsAt !== null)) fields.push({ field: path, code: "invalid", message: "Clear sale dates when there is no sale price." });
    if (salePricePaise !== null && (saleStartsAt === null || saleEndsAt === null || saleStartsAt === undefined || saleEndsAt === undefined || Date.parse(saleStartsAt) >= Date.parse(saleEndsAt))) fields.push({ field: path, code: "invalid", message: "A sale needs a start time before its end time." });
    const saleCeiling = hasActualPrice ? actualPricePaise : regularPricePaise;
    if (salePricePaise !== null && Number.isSafeInteger(saleCeiling) && (salePricePaise as number) > (saleCeiling as number)) fields.push({ field: path, code: "invalid", message: hasActualPrice ? "Sale price cannot exceed selling price." : "Sale price cannot exceed regular price." });

    const reason = typeof item.reason === "string" ? item.reason.trim() : "";
    if (!reason || Array.from(reason).length > 500 || CONTROL_CHARS.test(reason)) fields.push({ field: `${path}.reason`, code: "invalid", message: "Enter a reason using at most 500 characters." });

    if (/^[A-Za-z0-9._-]{1,80}$/.test(sku) && Number.isSafeInteger(expectedPriceVersion) && (expectedPriceVersion as number) >= 0 &&
      Number.isSafeInteger(regularPricePaise) && (regularPricePaise as number) >= 0 && (regularPricePaise as number) <= 10_000_000_000 &&
      (!hasActualPrice || (Number.isSafeInteger(actualPricePaise) && (actualPricePaise as number) >= 0 && (actualPricePaise as number) <= 10_000_000_000)) &&
      (salePricePaise === null || (Number.isSafeInteger(salePricePaise) && (salePricePaise as number) >= 0 && (salePricePaise as number) <= 10_000_000_000)) &&
      saleStartsAt !== undefined && saleEndsAt !== undefined && reason && Array.from(reason).length <= 500 && !CONTROL_CHARS.test(reason)) {
      writes.push({ sku, expectedPriceVersion: expectedPriceVersion as number, regularPricePaise: regularPricePaise as number,
        ...(hasActualPrice ? { actualPricePaise: actualPricePaise as number } : {}),
        salePricePaise: salePricePaise as number | null, saleStartsAt, saleEndsAt, reason });
    }
  });

  return fields.length ? fail(fields) : { ok: true, value: writes };
}

export function isProductTableStats(value: unknown): value is ProductTableStats {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const stats = value as Record<string, unknown>;
  const count = (candidate: unknown) => Number.isSafeInteger(candidate) && (candidate as number) >= 0;
  if (!count(stats.totalProducts) || !count(stats.unpricedProducts) || (stats.unpricedProducts as number) > (stats.totalProducts as number) ||
    !Array.isArray(stats.categories) || stats.categories.length > 500) return false;
  if (stats.categories.some((item) => !item || typeof item !== "object" || Array.isArray(item) ||
    typeof (item as Record<string, unknown>).id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test((item as Record<string, unknown>).id as string) ||
    typeof (item as Record<string, unknown>).title !== "string" || Array.from((item as Record<string, unknown>).title as string).length > 160 ||
    !count((item as Record<string, unknown>).count) || ((item as Record<string, unknown>).count as number) > (stats.totalProducts as number))) return false;
  if (stats.prices === null) return stats.unpricedProducts === stats.totalProducts;
  if (!stats.prices || typeof stats.prices !== "object" || Array.isArray(stats.prices)) return false;
  const prices = stats.prices as Record<string, unknown>;
  return count(prices.pricedProducts) && (prices.pricedProducts as number) > 0 &&
    (prices.pricedProducts as number) <= (stats.totalProducts as number) &&
    (stats.unpricedProducts as number) + (prices.pricedProducts as number) === (stats.totalProducts as number) &&
    [prices.minPaise, prices.avgPaise, prices.maxPaise].every((amount) => Number.isSafeInteger(amount) && (amount as number) >= 0 && (amount as number) <= 10_000_000_000) &&
    (prices.minPaise as number) <= (prices.avgPaise as number) && (prices.avgPaise as number) <= (prices.maxPaise as number);
}
