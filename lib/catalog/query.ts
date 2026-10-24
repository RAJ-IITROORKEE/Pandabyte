export type CatalogQuery = {
  q: string;
  categories: string[];
  minPaise: number | null;
  maxPaise: number | null;
  availability: "all" | "available" | "unavailable";
  sort: "relevance" | "newest" | "price_asc" | "price_desc" | "title_asc";
  page: number;
  limit: number;
};

export type CatalogQueryFieldError = {
  field: string;
  code: "unknown_field" | "duplicate" | "invalid";
  message: string;
};

export type CatalogQueryResult =
  | { ok: true; value: CatalogQuery }
  | { ok: false; fields: CatalogQueryFieldError[] };

type SearchParamRecord = Record<string, string | string[] | undefined>;
type SearchParamsInput = URLSearchParams | SearchParamRecord;
type QueryEntry = [string, string[]];

const MAX_PRICE_PAISE = 10_000_000_000;
const MAX_OFFSET = 10_000;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 48;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const ALLOWED = new Set(["q", "category", "min", "max", "availability", "sort", "page", "limit"]);

function entriesOf(input: SearchParamsInput): QueryEntry[] {
  if (input instanceof URLSearchParams) {
    const keys = new Set(input.keys());
    return Array.from(keys, (key): QueryEntry => [key, input.getAll(key)]);
  }
  return Object.entries(input).map(([key, value]): QueryEntry => [
    key,
    value === undefined ? [] : Array.isArray(value) ? value : [value],
  ]);
}

function parseInteger(value: string | undefined, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseInrToPaise(value: string): number | null {
  const match = /^(0|[1-9]\d{0,8})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const paise = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
  return Number.isSafeInteger(paise) && paise <= MAX_PRICE_PAISE ? paise : null;
}

function addError(fields: CatalogQueryFieldError[], field: string, code: CatalogQueryFieldError["code"], message: string) {
  fields.push({ field, code, message });
}

export function parseCatalogQuery(input: SearchParamsInput): CatalogQueryResult {
  const fields: CatalogQueryFieldError[] = [];
  const values = new Map(entriesOf(input));

  for (const [key] of values) {
    if (!ALLOWED.has(key)) addError(fields, key, "unknown_field", "This query parameter is not supported.");
  }
  for (const [key, items] of values) {
    if (key !== "category" && items.length > 1) addError(fields, key, "duplicate", "Use this query parameter once.");
  }

  const value = (key: string) => values.get(key)?.[0];
  const rawQuery = value("q") ?? "";
  const q = rawQuery.trim();
  if (Array.from(q).length > 120 || CONTROL_CHARS.test(rawQuery)) addError(fields, "q", "invalid", "Use at most 120 characters without control characters.");

  const rawCategories = values.get("category") ?? [];
  if (rawCategories.length > 20) addError(fields, "category", "invalid", "Choose at most 20 categories.");
  const categories: string[] = [];
  for (const categoryValue of rawCategories.slice(0, 20)) {
    const category = categoryValue.trim().toLowerCase();
    if (!category || category.length > 160 || (!UUID.test(category) && !SLUG.test(category))) {
      addError(fields, "category", "invalid", "Use a category slug or UUID.");
      continue;
    }
    if (!categories.includes(category)) categories.push(category);
  }

  const rawMin = value("min") || undefined;
  const minPaise = rawMin === undefined ? null : parseInrToPaise(rawMin);
  if (rawMin !== undefined && minPaise === null) addError(fields, "min", "invalid", "Enter an INR amount with up to two decimal places, within the supported range.");
  const rawMax = value("max") || undefined;
  const maxPaise = rawMax === undefined ? null : parseInrToPaise(rawMax);
  if (rawMax !== undefined && maxPaise === null) addError(fields, "max", "invalid", "Enter an INR amount with up to two decimal places, within the supported range.");
  if (minPaise !== null && maxPaise !== null && minPaise > maxPaise) {
    addError(fields, "min", "invalid", "Minimum price cannot exceed maximum price.");
  }

  const rawAvailability = value("availability") ?? "all";
  const availability = rawAvailability === "available" || rawAvailability === "unavailable" ? rawAvailability : "all";
  if (rawAvailability !== "all" && rawAvailability !== "available" && rawAvailability !== "unavailable") {
    addError(fields, "availability", "invalid", "Choose all, available, or unavailable.");
  }

  const rawSort = value("sort") ?? "relevance";
  const sorts = ["relevance", "newest", "price_asc", "price_desc", "title_asc"] as const;
  const sort = sorts.includes(rawSort as (typeof sorts)[number]) ? rawSort as (typeof sorts)[number] : "relevance";
  if (!sorts.includes(rawSort as (typeof sorts)[number])) addError(fields, "sort", "invalid", "Choose a supported sort order.");

  const rawLimit = parseInteger(value("limit"), DEFAULT_LIMIT);
  const limit = rawLimit ?? DEFAULT_LIMIT;
  if (rawLimit === null || limit > MAX_LIMIT) addError(fields, "limit", "invalid", `Choose a page size from 1 to ${MAX_LIMIT}.`);

  const rawPage = parseInteger(value("page"), 1);
  const page = rawPage ?? 1;
  if (rawPage === null || (page - 1) * limit > MAX_OFFSET) {
    addError(fields, "page", "invalid", "Choose a page that starts within the supported result range.");
  }

  if (fields.length) return { ok: false, fields };
  return {
    ok: true,
    value: { q, categories, minPaise, maxPaise, availability, sort, page, limit },
  };
}
