export const CATEGORY_TABLE_PAGE_SIZES = [10, 20, 50] as const;

export type CategoryTableStatus = "all" | "draft" | "published" | "archived";
export type CategoryTableSort = "updated_desc" | "updated_asc" | "title_asc" | "title_desc" | "position_asc" | "position_desc" | "products_desc";
export type CategoryTablePageSize = (typeof CATEGORY_TABLE_PAGE_SIZES)[number];

export type CategoryTableQuery = {
  q: string;
  status: CategoryTableStatus;
  sort: CategoryTableSort;
  limit: CategoryTablePageSize;
  offset: number;
};

export const DEFAULT_CATEGORY_TABLE_QUERY: CategoryTableQuery = {
  q: "",
  status: "all",
  sort: "updated_desc",
  limit: 20,
  offset: 0,
};

const STATUSES = new Set<CategoryTableStatus>(["all", "draft", "published", "archived"]);
const SORTS = new Set<CategoryTableSort>([
  "updated_desc", "updated_asc", "title_asc", "title_desc", "position_asc", "position_desc", "products_desc",
]);
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

export function parseCategoryTableQuery(search: string): CategoryTableQuery {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const status = params.get("status") as CategoryTableStatus | null;
  const sort = params.get("sort") as CategoryTableSort | null;
  const limit = Number(params.get("limit"));
  const offset = Number(params.get("offset"));

  const q = (params.get("q") ?? "").trim();
  return {
    q: Array.from(q).length <= 120 && !CONTROL_CHARS.test(q) ? q : "",
    status: status && STATUSES.has(status) ? status : DEFAULT_CATEGORY_TABLE_QUERY.status,
    sort: sort && SORTS.has(sort) ? sort : DEFAULT_CATEGORY_TABLE_QUERY.sort,
    limit: CATEGORY_TABLE_PAGE_SIZES.includes(limit as CategoryTablePageSize) ? limit as CategoryTablePageSize : DEFAULT_CATEGORY_TABLE_QUERY.limit,
    offset: Number.isSafeInteger(offset) && offset >= 0 && offset <= 10_000 ? offset : DEFAULT_CATEGORY_TABLE_QUERY.offset,
  };
}

export function serializeCategoryTableQuery(query: CategoryTableQuery): string {
  const params = new URLSearchParams();
  const q = query.q.trim();
  if (q) params.set("q", q);
  params.set("status", query.status);
  params.set("sort", query.sort);
  params.set("limit", String(query.limit));
  params.set("offset", String(query.offset));
  return params.toString();
}
