export const ADMIN_ORDER_STATUSES = ["pending", "processing", "fulfilled", "cancelled"] as const;
export const ADMIN_ORDER_SORTS = ["created_desc", "created_asc", "total_desc", "total_asc"] as const;

export type AdminOrderStatus = (typeof ADMIN_ORDER_STATUSES)[number];
export type AdminOrderListQuery = {
  q: string;
  status: "all" | AdminOrderStatus;
  sort: (typeof ADMIN_ORDER_SORTS)[number];
  limit: 10 | 20 | 50;
  offset: number;
};

export type AdminOrderSummary = {
  reference: string;
  status: AdminOrderStatus;
  totalPaise: number;
  currency: "INR";
  createdAt: string;
  updatedAt: string;
};

type FieldError = { field: string; code: "unknown_field" | "invalid"; message: string };
type ParseResult<T> = { ok: true; value: T } | { ok: false; fields: FieldError[] };

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/u;
const QUERY_KEYS = new Set(["q", "status", "sort", "limit", "offset"]);

export function parseAdminOrderListQuery(search: URLSearchParams): ParseResult<AdminOrderListQuery> {
  const fields: FieldError[] = [];
  for (const key of new Set(search.keys())) {
    if (!QUERY_KEYS.has(key)) fields.push({ field: key, code: "unknown_field", message: "This query parameter is not allowed." });
    if (search.getAll(key).length > 1) fields.push({ field: key, code: "invalid", message: "Provide this parameter once." });
  }

  const rawQuery = search.get("q") ?? "";
  const q = rawQuery.trim();
  if (Array.from(q).length > 120 || CONTROL_CHARS.test(rawQuery)) fields.push({ field: "q", code: "invalid", message: "Use at most 120 characters." });

  const status = search.get("status") ?? "all";
  if (status !== "all" && !(ADMIN_ORDER_STATUSES as readonly string[]).includes(status)) {
    fields.push({ field: "status", code: "invalid", message: "Choose a supported order status." });
  }

  const sort = search.get("sort") ?? "created_desc";
  if (!(ADMIN_ORDER_SORTS as readonly string[]).includes(sort)) fields.push({ field: "sort", code: "invalid", message: "Choose a supported sort order." });

  const rawLimit = search.get("limit") ?? "20";
  const limit = rawLimit === "10" || rawLimit === "20" || rawLimit === "50" ? Number(rawLimit) : undefined;
  if (limit === undefined) fields.push({ field: "limit", code: "invalid", message: "Choose 10, 20, or 50 rows per page." });

  const rawOffset = search.get("offset") ?? "0";
  const offset = /^(0|[1-9][0-9]*)$/.test(rawOffset) ? Number(rawOffset) : Number.NaN;
  if (!Number.isSafeInteger(offset) || offset > 10_000) fields.push({ field: "offset", code: "invalid", message: "Use a whole number from 0 to 10000." });

  if (fields.length || limit === undefined || !Number.isSafeInteger(offset)) return { ok: false, fields };
  return { ok: true, value: { q, status: status as AdminOrderListQuery["status"], sort: sort as AdminOrderListQuery["sort"], limit: limit as AdminOrderListQuery["limit"], offset } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

export function parseAdminOrderListRpcResult(value: unknown, query: Pick<AdminOrderListQuery, "limit" | "offset">): { items: AdminOrderSummary[]; total: number; limit: number; offset: number } | null {
  if (!isObject(value) || !hasExactKeys(value, ["items", "total", "limit", "offset"]) || !Array.isArray(value.items) || value.items.length > query.limit ||
    value.limit !== query.limit || value.offset !== query.offset || !Number.isSafeInteger(value.total) || (value.total as number) < value.items.length) return null;

  const items: AdminOrderSummary[] = [];
  for (const item of value.items) {
    if (!isObject(item) || !hasExactKeys(item, ["reference", "status", "totalPaise", "currency", "createdAt", "updatedAt"]) ||
      typeof item.reference !== "string" || !item.reference.trim() || Array.from(item.reference).length > 80 || CONTROL_CHARS.test(item.reference) ||
      !(ADMIN_ORDER_STATUSES as readonly unknown[]).includes(item.status) ||
      !Number.isSafeInteger(item.totalPaise) || (item.totalPaise as number) < 0 || item.currency !== "INR") return null;
    const createdAt = parseTimestamp(item.createdAt);
    const updatedAt = parseTimestamp(item.updatedAt);
    if (!createdAt || !updatedAt) return null;
    items.push({ reference: item.reference, status: item.status as AdminOrderStatus, totalPaise: item.totalPaise as number, currency: "INR", createdAt, updatedAt });
  }
  return { items, total: value.total as number, limit: query.limit, offset: query.offset };
}
