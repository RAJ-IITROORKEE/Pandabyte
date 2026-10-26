import type { FieldError, ValidationResult } from "./validation.ts";
import { parseRecordId } from "./validation.ts";

export type CategoryTableQuery = {
  q: string;
  status: "all" | "draft" | "published" | "archived";
  sort: "updated_desc" | "updated_asc" | "title_asc" | "title_desc" | "position_asc" | "position_desc" | "products_desc";
  limit: 10 | 20 | 50;
  offset: number;
};

export type CategoryTableItem = {
  id: string;
  title: string;
  slug: string;
  version: number;
  status: "draft" | "published" | "archived";
  updatedAt: string;
  parent: { id: string; title: string } | null;
  productCount: number;
  position: number;
  image: { mediaId: string; alt: string } | null;
};

export type CategoryTableResult = { items: CategoryTableItem[]; total: number };

const STATUSES = new Set(["all", "draft", "published", "archived"]);
const SORTS = new Set(["updated_desc", "updated_asc", "title_asc", "title_desc", "position_asc", "position_desc", "products_desc"]);
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const TABLE_KEYS = new Set(["q", "status", "sort", "limit", "offset"]);

function fail(fields: FieldError[]): ValidationResult<never> {
  return { ok: false, fields };
}

export function parseCategoryTableQuery(search: URLSearchParams): ValidationResult<CategoryTableQuery> {
  const fields: FieldError[] = [];
  for (const key of new Set(search.keys())) {
    if (!TABLE_KEYS.has(key)) fields.push({ field: key, code: "unknown_field", message: "This query parameter is not allowed." });
    if (search.getAll(key).length > 1) fields.push({ field: key, code: "invalid", message: "Provide this parameter once." });
  }

  const q = (search.get("q") ?? "").trim();
  if (Array.from(q).length > 120 || CONTROL_CHARS.test(q)) fields.push({ field: "q", code: "invalid", message: "Use at most 120 characters." });

  const status = search.get("status") ?? "all";
  if (!STATUSES.has(status)) fields.push({ field: "status", code: "invalid", message: "Choose all, draft, published, or archived." });
  const sort = search.get("sort") ?? "updated_desc";
  if (!SORTS.has(sort)) fields.push({ field: "sort", code: "invalid", message: "Choose a supported sort order." });

  const rawLimit = search.get("limit") ?? "20";
  const limit = rawLimit === "10" || rawLimit === "20" || rawLimit === "50" ? Number(rawLimit) : undefined;
  if (limit === undefined) fields.push({ field: "limit", code: "invalid", message: "Choose 10, 20, or 50 rows per page." });

  const rawOffset = search.get("offset") ?? "0";
  const offset = /^(0|[1-9][0-9]*)$/.test(rawOffset) ? Number(rawOffset) : Number.NaN;
  if (!Number.isSafeInteger(offset) || offset > 10_000) fields.push({ field: "offset", code: "invalid", message: "Use a whole number from 0 to 10000." });

  return fields.length || limit === undefined || !Number.isSafeInteger(offset)
    ? fail(fields)
    : { ok: true, value: { q, status: status as CategoryTableQuery["status"], sort: sort as CategoryTableQuery["sort"], limit: limit as CategoryTableQuery["limit"], offset } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && Array.from(value).length <= max && !CONTROL_CHARS.test(value);
}

export function isCategoryTableItem(value: unknown): value is CategoryTableItem {
  if (!isObject(value) || Object.keys(value).some((key) => !["id", "title", "slug", "version", "status", "updatedAt", "parent", "productCount", "position", "image"].includes(key)) ||
    Object.keys(value).length !== 10 || typeof value.id !== "string" || !parseRecordId(value.id) || !safeText(value.title, 160) || !safeText(value.slug, 160) ||
    !Number.isSafeInteger(value.version) || (value.version as number) < 1 || !["draft", "published", "archived"].includes(String(value.status)) ||
    typeof value.updatedAt !== "string" || value.updatedAt.length > 64 || !Number.isFinite(Date.parse(value.updatedAt)) ||
    !Number.isSafeInteger(value.productCount) || (value.productCount as number) < 0 || !Number.isSafeInteger(value.position) || (value.position as number) < 0) return false;
  if (value.image !== null && (!isObject(value.image) || Object.keys(value.image).length !== 2 || Object.keys(value.image).some((key) => !["mediaId", "alt"].includes(key)) || typeof value.image.mediaId !== "string" || !parseRecordId(value.image.mediaId) || typeof value.image.alt !== "string" || Array.from(value.image.alt).length > 300 || CONTROL_CHARS.test(value.image.alt))) return false;
  if (value.parent === null) return true;
  return isObject(value.parent) && Object.keys(value.parent).length === 2 && Object.keys(value.parent).every((key) => ["id", "title"].includes(key)) &&
    typeof value.parent.id === "string" && !!parseRecordId(value.parent.id) && safeText(value.parent.title, 160);
}

export function isCategoryTableResult(value: unknown, limit: number): value is CategoryTableResult {
  return isObject(value) && Object.keys(value).length === 2 && Object.keys(value).every((key) => ["items", "total"].includes(key)) &&
    Array.isArray(value.items) && value.items.length <= limit && value.items.every(isCategoryTableItem) &&
    Number.isSafeInteger(value.total) && (value.total as number) >= value.items.length;
}
