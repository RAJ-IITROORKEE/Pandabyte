import type { FieldError, ValidationResult } from "./validation.ts";

export const ADMIN_INVENTORY_STOCK_FILTERS = ["all", "unverified", "in_stock", "out_of_stock"] as const;
export const ADMIN_INVENTORY_SORTS = ["updated_desc", "title_asc", "title_desc", "sku_asc", "sku_desc", "stock_asc", "stock_desc"] as const;

export type AdminInventoryStockFilter = (typeof ADMIN_INVENTORY_STOCK_FILTERS)[number];
export type AdminInventorySort = (typeof ADMIN_INVENTORY_SORTS)[number];
export type AdminInventoryQuery = {
  q: string;
  stock: AdminInventoryStockFilter;
  sort: AdminInventorySort;
  limit: number;
  offset: number;
};

const QUERY_KEYS = new Set(["q", "stock", "sort", "limit", "offset"]);
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/u;

export function parseAdminInventoryQuery(search: URLSearchParams): ValidationResult<AdminInventoryQuery> {
  const fields: FieldError[] = [];
  for (const key of new Set(search.keys())) {
    if (!QUERY_KEYS.has(key)) fields.push({ field: key, code: "unknown_field", message: "This query parameter is not allowed." });
    if (search.getAll(key).length > 1) fields.push({ field: key, code: "invalid", message: "Provide this parameter once." });
  }

  const rawQuery = search.get("q") ?? "";
  const q = rawQuery.trim();
  if (Array.from(rawQuery).length > 120 || CONTROL_CHARS.test(rawQuery)) fields.push({ field: "q", code: "invalid", message: "Use at most 120 characters." });

  const stock = search.get("stock") ?? "all";
  if (!(ADMIN_INVENTORY_STOCK_FILTERS as readonly string[]).includes(stock)) fields.push({ field: "stock", code: "invalid", message: "Choose a supported stock filter." });

  const sort = search.get("sort") ?? "updated_desc";
  if (!(ADMIN_INVENTORY_SORTS as readonly string[]).includes(sort)) fields.push({ field: "sort", code: "invalid", message: "Choose a supported sort order." });

  const parseInteger = (key: "limit" | "offset", defaultValue: number, min: number, max: number) => {
    const raw = search.get(key);
    if (raw === null) return defaultValue;
    if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
      fields.push({ field: key, code: "invalid", message: "Enter a whole number." });
      return undefined;
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      fields.push({ field: key, code: "invalid", message: `Use a value from ${min} to ${max}.` });
      return undefined;
    }
    return value;
  };

  const limit = parseInteger("limit", 24, 1, 100);
  const offset = parseInteger("offset", 0, 0, 10_000);
  if (fields.length || limit === undefined || offset === undefined) return { ok: false, fields };
  return {
    ok: true,
    value: {
      q,
      stock: stock as AdminInventoryStockFilter,
      sort: sort as AdminInventorySort,
      limit,
      offset,
    },
  };
}
