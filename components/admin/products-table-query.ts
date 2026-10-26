export const PRODUCT_TABLE_PAGE_SIZES = [10, 20, 50] as const;

export type ProductTableStatus = "all" | "draft" | "published" | "archived";
export type ProductTableSort = "updated_desc" | "updated_asc" | "title_asc" | "title_desc" | "price_asc" | "price_desc";
export type ProductTablePageSize = (typeof PRODUCT_TABLE_PAGE_SIZES)[number];

export type ProductTableQuery = {
  q: string;
  status: ProductTableStatus;
  categoryId: string;
  sort: ProductTableSort;
  limit: ProductTablePageSize;
  offset: number;
};

export type ProductTablePrice = { regularPricePaise: number; effectivePricePaise: number; isOnSale: boolean; from: boolean } | null;
export type ProductPricePresentation = { current: string; regular: string | null; discount: string | null; sourceObservation: boolean };

export const DEFAULT_PRODUCT_TABLE_QUERY: ProductTableQuery = {
  q: "",
  status: "all",
  categoryId: "",
  sort: "updated_desc",
  limit: 20,
  offset: 0,
};

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export function presentProductPrice(price: ProductTablePrice, sourceObservation: boolean): ProductPricePresentation {
  if (!price) return { current: "Not configured", regular: null, discount: null, sourceObservation };
  const hasSale = price.isOnSale && price.effectivePricePaise < price.regularPricePaise;
  const prefix = price.from ? "From " : "";
  const discountPercent = hasSale ? Math.round((1 - price.effectivePricePaise / price.regularPricePaise) * 100) : 0;
  return {
    current: `${prefix}${money.format(price.effectivePricePaise / 100)}`,
    regular: hasSale ? money.format(price.regularPricePaise / 100) : null,
    discount: hasSale ? discountPercent > 0 ? `${discountPercent}% off` : "Sale" : null,
    sourceObservation,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set<ProductTableStatus>(["all", "draft", "published", "archived"]);
const SORTS = new Set<ProductTableSort>(["updated_desc", "updated_asc", "title_asc", "title_desc", "price_asc", "price_desc"]);

export function parseProductTableQuery(search: string): ProductTableQuery {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const status = params.get("status") as ProductTableStatus | null;
  const sort = params.get("sort") as ProductTableSort | null;
  const limit = Number(params.get("limit"));
  const offset = Number(params.get("offset"));
  const categoryId = params.get("categoryId") ?? "";

  return {
    q: (params.get("q") ?? "").trim(),
    status: status && STATUSES.has(status) ? status : DEFAULT_PRODUCT_TABLE_QUERY.status,
    categoryId: UUID.test(categoryId) ? categoryId.toLowerCase() : "",
    sort: sort && SORTS.has(sort) ? sort : DEFAULT_PRODUCT_TABLE_QUERY.sort,
    limit: PRODUCT_TABLE_PAGE_SIZES.includes(limit as ProductTablePageSize) ? limit as ProductTablePageSize : DEFAULT_PRODUCT_TABLE_QUERY.limit,
    offset: Number.isSafeInteger(offset) && offset >= 0 ? offset : DEFAULT_PRODUCT_TABLE_QUERY.offset,
  };
}

export function serializeProductTableQuery(query: ProductTableQuery): string {
  const params = new URLSearchParams();
  const q = query.q.trim();
  if (q) params.set("q", q);
  params.set("status", query.status);
  if (query.categoryId) params.set("categoryId", query.categoryId.toLowerCase());
  params.set("sort", query.sort);
  params.set("limit", String(query.limit));
  params.set("offset", String(query.offset));
  return params.toString();
}
