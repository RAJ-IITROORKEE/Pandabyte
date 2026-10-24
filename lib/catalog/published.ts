import "server-only";
import { createInsforgePublicClient } from "@/lib/insforge/public";
import { getPublishedRecord, parsePublishedRecord, type PublishedRecord } from "@/lib/editorial/published";
import { parseCatalogQuery, type CatalogQuery } from "@/lib/catalog/query";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function paiseAsInr(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000_000_000) throw new Error("Invalid catalog price filter.");
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

function normalizeQuery(input: Partial<CatalogQuery>): CatalogQuery {
  const params = new URLSearchParams();
  if (input.q !== undefined) params.set("q", input.q);
  for (const category of input.categories ?? []) params.append("category", category);
  const min = paiseAsInr(input.minPaise);
  const max = paiseAsInr(input.maxPaise);
  if (min !== null) params.set("min", min);
  if (max !== null) params.set("max", max);
  if (input.availability !== undefined) params.set("availability", input.availability);
  if (input.sort !== undefined) params.set("sort", input.sort);
  if (input.page !== undefined) params.set("page", String(input.page));
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  const parsed = parseCatalogQuery(params);
  if (!parsed.ok) throw new Error("Invalid catalog query.");
  return parsed.value;
}

async function resolveCategoryId(value: string): Promise<string | null> {
  if (UUID.test(value)) return value.toLowerCase();
  let record = await getPublishedRecord("categories", value);
  if (record && "redirectTo" in record) record = await getPublishedRecord("categories", record.redirectTo);
  return record && !("redirectTo" in record) ? record.id : null;
}

export async function listCatalogProducts(partialQuery: Partial<CatalogQuery> = {}): Promise<{
  items: PublishedRecord<"products">[];
  total: number;
}> {
  const query = normalizeQuery(partialQuery);
  const resolvedCategories = await Promise.all(query.categories.map(resolveCategoryId));
  if (resolvedCategories.some((id) => id === null)) return { items: [], total: 0 };

  const offset = (query.page - 1) * query.limit;
  const { data, error } = await createInsforgePublicClient().database.schema("public").rpc("published_list_products", {
    p_query: query.q,
    p_category_ids: resolvedCategories,
    p_min_price_paise: query.minPaise,
    p_max_price_paise: query.maxPaise,
    p_availability: query.availability,
    p_sort: query.sort,
    p_limit: query.limit,
    p_offset: offset,
  });
  if (error || !data || !Array.isArray(data.items) || data.items.length > query.limit ||
    !Number.isSafeInteger(data.total) || data.total < 0) throw new Error("The catalog is temporarily unavailable.");

  return {
    items: data.items.map((item: unknown) => parsePublishedRecord("products", item)),
    total: data.total,
  };
}
