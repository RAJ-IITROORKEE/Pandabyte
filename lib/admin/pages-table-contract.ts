import type { FieldError, ValidationResult } from "./validation.ts";
import { parseRecordId } from "./validation.ts";

export type ContentTableModule = "pages" | "blog" | "faqs";
export type ContentTableKind = "page" | "blog" | "faq";

export type ContentTableQuery = {
  q: string;
  status: "all" | "draft" | "published" | "archived";
  sort: "updated_desc" | "updated_asc" | "title_asc" | "title_desc";
  limit: 10 | 20 | 50;
  offset: number;
};

export type PagesTableQuery = ContentTableQuery;

export type ContentTableItem<K extends ContentTableKind = ContentTableKind> = {
  id: string;
  kind: K;
  title: string;
  slug: string;
  version: number;
  publishedRevisionId: string | null;
  archived: boolean;
  updatedAt: string;
};

export type PagesTableItem = ContentTableItem<"page">;
export type BlogTableItem = ContentTableItem<"blog">;
export type ContentTableResult<K extends ContentTableKind = ContentTableKind> = { items: ContentTableItem<K>[]; total: number };
export type PagesTableResult = ContentTableResult<"page">;
export type BlogTableResult = ContentTableResult<"blog">;

const STATUSES = new Set(["all", "draft", "published", "archived"]);
const SORTS = new Set(["updated_desc", "updated_asc", "title_asc", "title_desc"]);
const TABLE_KEYS = new Set(["q", "status", "sort", "limit", "offset"]);
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/u;

function fail(fields: FieldError[]): ValidationResult<never> {
  return { ok: false, fields };
}

export function parseContentTableQuery(search: URLSearchParams): ValidationResult<ContentTableQuery> {
  const fields: FieldError[] = [];
  for (const key of new Set(search.keys())) {
    if (!TABLE_KEYS.has(key)) fields.push({ field: key, code: "unknown_field", message: "This query parameter is not allowed." });
    if (search.getAll(key).length > 1) fields.push({ field: key, code: "invalid", message: "Provide this parameter once." });
  }

  const rawQuery = search.get("q") ?? "";
  const q = rawQuery.trim();
  if (Array.from(rawQuery).length > 120 || CONTROL_CHARS.test(rawQuery)) fields.push({ field: "q", code: "invalid", message: "Use at most 120 characters." });

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
    : { ok: true, value: { q, status: status as ContentTableQuery["status"], sort: sort as ContentTableQuery["sort"], limit: limit as ContentTableQuery["limit"], offset } };
}

export const parsePagesTableQuery = parseContentTableQuery;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}

function safeText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && Array.from(value).length <= max && !CONTROL_CHARS.test(value);
}

export function isContentTableItem<K extends ContentTableKind>(value: unknown, kind: K): value is ContentTableItem<K> {
  if (!isObject(value) || !hasExactKeys(value, ["id", "kind", "title", "slug", "version", "publishedRevisionId", "archived", "updatedAt"]) ||
    typeof value.id !== "string" || !parseRecordId(value.id) || value.kind !== kind || !safeText(value.title, 160) || !safeText(value.slug, 160) ||
    !Number.isSafeInteger(value.version) || (value.version as number) < 1 ||
    !(value.publishedRevisionId === null || (typeof value.publishedRevisionId === "string" && parseRecordId(value.publishedRevisionId))) ||
    typeof value.archived !== "boolean" || typeof value.updatedAt !== "string" || value.updatedAt.length > 64 || !Number.isFinite(Date.parse(value.updatedAt))) return false;
  return true;
}

export function isPagesTableItem(value: unknown): value is PagesTableItem {
  return isContentTableItem(value, "page");
}

export function isBlogTableItem(value: unknown): value is BlogTableItem {
  return isContentTableItem(value, "blog");
}

export function isContentTableResult<K extends ContentTableKind>(value: unknown, limit: number, kind: K): value is ContentTableResult<K> {
  return isObject(value) && hasExactKeys(value, ["items", "total"]) && Array.isArray(value.items) && value.items.length <= limit &&
    value.items.every((item: unknown) => isContentTableItem(item, kind)) && Number.isSafeInteger(value.total) && (value.total as number) >= value.items.length;
}

export function isPagesTableResult(value: unknown, limit: number): value is PagesTableResult {
  return isContentTableResult(value, limit, "page");
}

export function isBlogTableResult(value: unknown, limit: number): value is BlogTableResult {
  return isContentTableResult(value, limit, "blog");
}
