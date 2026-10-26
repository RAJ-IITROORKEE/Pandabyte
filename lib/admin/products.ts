import { operationalJson } from "@/lib/observability/events";
import { requireCapability } from "@/lib/authorization";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { isProductTableStats, parseProductTableQuery, type ProductTableStats } from "./product-contract.ts";
import {
  parseRecordId,
  type AdminVariantDto,
} from "@/lib/admin/validation";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
type JsonObject = Record<string, unknown>;
type RpcError = { code?: unknown; details?: unknown; status?: unknown };
type RpcResult = { data: unknown; error: RpcError | null };

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function respond(body: unknown, status = 200) {
  return operationalJson(body, status, PRIVATE_HEADERS, "admin_products");
}

function errorResponse(code: string, status: number, fields?: unknown) {
  const messages: Record<string, string> = {
    unauthorized: "Sign in to continue.",
    forbidden: "You do not have permission to do this.",
    not_found: "The requested product was not found.",
    validation_error: "Review the highlighted fields and try again.",
    conflict: "The record changed or cannot make this transition. Reload and try again.",
    backend_unavailable: "The request could not be completed. Please try again later.",
  };
  return respond({ error: { code, message: messages[code] ?? messages.backend_unavailable, ...(fields ? { fields } : {}) } }, status);
}

function validationResponse(fields: unknown) {
  return errorResponse("validation_error", 400, fields);
}

function rpcErrorResponse(error: RpcError | null): Response {
  if (!error) return errorResponse("backend_unavailable", 503);
  if (error.code === "P0001" && typeof error.details === "string") {
    const mapped: Record<string, { status: number; code: string }> = {
      unauthenticated: { status: 401, code: "unauthorized" },
      forbidden: { status: 403, code: "forbidden" },
      not_found: { status: 404, code: "not_found" },
      invalid_input: { status: 400, code: "validation_error" },
      version_conflict: { status: 409, code: "conflict" },
      invalid_state: { status: 409, code: "conflict" },
      duplicate_route: { status: 409, code: "conflict" },
      sku_conflict: { status: 409, code: "conflict" },
    };
    const result = mapped[error.details];
    if (result) return errorResponse(result.code, result.status);
  }
  if (error.status === 401) return errorResponse("unauthorized", 401);
  if (error.status === 403) return errorResponse("forbidden", 403);
  return errorResponse("backend_unavailable", 503);
}

async function authorizedProductClient() {
  type ProductClient = NonNullable<Awaited<ReturnType<typeof createInsforgeServerClient>>>;
  const access = await requireCapability("catalog.edit");
  if (!access.allowed) return { response: errorResponse(access.status === 401 ? "unauthorized" : access.status === 403 ? "forbidden" : "backend_unavailable", access.status) } as const;
  try {
    const client = await createInsforgeServerClient();
    if (!client) return { response: errorResponse("backend_unavailable", 503) } as const;
    return { client: client as ProductClient } as const;
  } catch {
    return { response: errorResponse("backend_unavailable", 503) } as const;
  }
}

async function rpc(client: NonNullable<Awaited<ReturnType<typeof createInsforgeServerClient>>>, name: string, args: Record<string, unknown>): Promise<RpcResult> {
  try {
    return await client.database.schema("public").rpc(name, args) as RpcResult;
  } catch {
    return { data: null, error: null };
  }
}

function safeText(value: unknown, max: number): value is string {
  return typeof value === "string" && Array.from(value).length <= max && !CONTROL_CHARS.test(value);
}

export function isProductTableResult(value: unknown, limit: number): value is { items: unknown[]; total: number; categoryOptions: unknown[]; stats: ProductTableStats } {
  return isObject(value) && Array.isArray(value.items) && value.items.length <= limit && Number.isSafeInteger(value.total) && (value.total as number) >= value.items.length &&
    Array.isArray(value.categoryOptions) && value.categoryOptions.length <= 500 && isProductTableStats(value.stats);
}

export function isProductTableItem(value: unknown): boolean {
  if (!isObject(value) || typeof value.id !== "string" || !parseRecordId(value.id) || !safeText(value.title, 160) || !safeText(value.slug, 160) ||
    !Number.isSafeInteger(value.version) || (value.version as number) < 1 || !["draft", "published", "archived"].includes(String(value.status)) ||
    typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt)) || typeof value.sourceObservation !== "boolean" ||
    !Array.isArray(value.categories) || value.categories.length > 50) return false;
  if (value.image !== null && (!isObject(value.image) || typeof value.image.mediaId !== "string" || !parseRecordId(value.image.mediaId) || !safeText(value.image.alt, 300))) return false;
  if (value.categories.some((category) => !isObject(category) || typeof category.id !== "string" || !parseRecordId(category.id) || !safeText(category.title, 160))) return false;
  if (value.price !== null) {
    if (!isObject(value.price) || !Number.isSafeInteger(value.price.regularPricePaise) || (value.price.regularPricePaise as number) < 0 ||
      !Number.isSafeInteger(value.price.effectivePricePaise) || (value.price.effectivePricePaise as number) < 0 ||
      (value.price.effectivePricePaise as number) > (value.price.regularPricePaise as number) || typeof value.price.isOnSale !== "boolean" || typeof value.price.from !== "boolean") return false;
  }
  return true;
}

export function parseAdminVariantDto(value: unknown): AdminVariantDto | null {
  if (!isObject(value)) return null;
  const id = typeof value.id === "string" ? parseRecordId(value.id) : null;
  const productId = typeof value.productId === "string" ? parseRecordId(value.productId) : null;
  const stringField = (input: unknown, max: number) => typeof input === "string" && input.trim().length > 0 && Array.from(input).length <= max && !CONTROL_CHARS.test(input);
  const nullableInteger = (input: unknown, max: number) => input === null || (Number.isSafeInteger(input) && (input as number) >= 0 && (input as number) <= max);
  const nullableDate = (input: unknown) => input === null || (typeof input === "string" && Number.isFinite(Date.parse(input)));
  const actualPaise = value.actualPaise === undefined ? null : value.actualPaise;
  if (!id || !productId || !stringField(value.productTitle, 200) || !stringField(value.sku, 80) || !stringField(value.label, 120) ||
    !nullableInteger(value.regularPaise, 10_000_000_000) || !nullableInteger(actualPaise, 10_000_000_000) || !nullableInteger(value.salePaise, 10_000_000_000) || !nullableDate(value.saleFrom) || !nullableDate(value.saleUntil) ||
    !Number.isSafeInteger(value.priceVersion) || (value.priceVersion as number) < 0 || !nullableInteger(value.stock, 2_147_483_647) ||
    !(value.stockVersion === null || (Number.isSafeInteger(value.stockVersion) && (value.stockVersion as number) >= 0))) return null;
  const saleFrom = value.saleFrom === null ? null : new Date(value.saleFrom as string).toISOString();
  const saleUntil = value.saleUntil === null ? null : new Date(value.saleUntil as string).toISOString();
  const salePaise = value.salePaise as number | null;
  const regularPaise = value.regularPaise as number | null;
  if (actualPaise !== null && (regularPaise === null || (actualPaise as number) > regularPaise)) return null;
  const saleCeiling = actualPaise === null ? regularPaise : actualPaise as number;
  if ((salePaise === null && (saleFrom !== null || saleUntil !== null)) ||
    (salePaise !== null && (saleCeiling === null || salePaise > saleCeiling || !saleFrom || !saleUntil || Date.parse(saleFrom) >= Date.parse(saleUntil)))) return null;
  return { id, productId, productTitle: value.productTitle as string, sku: value.sku as string, label: value.label as string, regularPaise, actualPaise: actualPaise as number | null, salePaise,
    saleFrom, saleUntil, priceVersion: value.priceVersion as number, stock: value.stock as number | null, stockVersion: value.stockVersion as number | null };
}

export async function adminListProducts(request: Request): Promise<Response> {
  const access = await authorizedProductClient();
  if (!("client" in access)) return access.response;
  if (!access.client) return errorResponse("backend_unavailable", 503);
  const query = parseProductTableQuery(new URL(request.url).searchParams);
  if (!query.ok) return validationResponse(query.fields);
  const result = await rpc(access.client, "admin_list_products", {
    p_query: query.value.q,
    p_status: query.value.status,
    p_category_id: query.value.categoryId,
    p_sort: query.value.sort,
    p_limit: query.value.limit,
    p_offset: query.value.offset,
  });
  if (result.error) return rpcErrorResponse(result.error);
  if (!isProductTableResult(result.data, query.value.limit) || result.data.items.some((item) => !isProductTableItem(item)) ||
    result.data.categoryOptions.some((item) => !isObject(item) || typeof item.id !== "string" || !parseRecordId(item.id) || !safeText(item.title, 160))) return errorResponse("backend_unavailable", 503);
  return respond(result.data);
}

export async function adminListProductPrices(request: Request, rawProductId: string): Promise<Response> {
  const productId = parseRecordId(rawProductId);
  if (!productId) return errorResponse("not_found", 404);
  if (new URL(request.url).searchParams.size > 0) return validationResponse([{ field: "query", code: "unknown_field", message: "Query parameters are not allowed." }]);
  const access = await authorizedProductClient();
  if (!("client" in access)) return access.response;
  if (!access.client) return errorResponse("backend_unavailable", 503);
  const result = await rpc(access.client, "admin_list_product_prices", { p_product_id: productId });
  if (result.error) return rpcErrorResponse(result.error);
  const data = result.data;
  if (!isObject(data) || !Array.isArray(data.items) || data.items.length > 100 || typeof data.sourceObservation !== "boolean") return errorResponse("backend_unavailable", 503);
  const parsed = data.items.map((item) => parseAdminVariantDto(item));
  if (parsed.some((item) => item === null || item.productId !== productId)) return errorResponse("backend_unavailable", 503);
  const items = (parsed as AdminVariantDto[]).map((item) => ({ ...item, stock: null, stockVersion: null }));
  return respond({ items, sourceObservation: data.sourceObservation });
}
