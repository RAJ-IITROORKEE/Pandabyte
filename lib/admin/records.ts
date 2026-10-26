import "server-only";
import { operationalJson } from "@/lib/observability/events";

import { isJsonContentType, isSameOrigin } from "@/lib/account/profile";
import { requireCapability, type StaffCapability } from "@/lib/authorization";
import { createInsforgePublicClient } from "@/lib/insforge/public";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { readBoundedBody } from "@/lib/storage/http";
import { parseProductPriceWrites, type ProductPriceWrite } from "@/lib/admin/product-contract";
import {
  ADMIN_MODULES,
  MAX_ADMIN_BODY_BYTES,
  parseActionInput,
  parseAdminModule,
  parseCreateInput,
  parseDocument,
  parseListQuery,
  parseRecordId,
  parseSlug,
  parseUpdateInput,
  parseVariantId,
  parseVariantPriceUpdate,
  parseInventoryAdjustment,
  type AdminModule,
  type AdminVariantDto,
  type CmsKind,
  type FieldError,
  type RecordAction,
} from "@/lib/admin/validation";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const PUBLIC_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "Sign in to continue.",
  forbidden: "You do not have permission to do this.",
  validation_error: "Review the highlighted fields and try again.",
  not_found: "The requested record was not found.",
  conflict: "The record changed or cannot make this transition. Reload and try again.",
  payload_too_large: `Requests must be ${Math.floor(MAX_ADMIN_BODY_BYTES / 1024)} KiB or smaller.`,
  unsupported_media_type: "Send a JSON request.",
  backend_unavailable: "The request could not be completed. Please try again later.",
};
const RPC_DETAILS: Record<string, { status: number; code: string }> = {
  unauthenticated: { status: 401, code: "unauthorized" },
  forbidden: { status: 403, code: "forbidden" },
  not_found: { status: 404, code: "not_found" },
  inquiry_not_found: { status: 404, code: "not_found" },
  invalid_input: { status: 400, code: "validation_error" },
  media_not_found: { status: 400, code: "validation_error" },
  version_conflict: { status: 409, code: "conflict" },
  invalid_state: { status: 409, code: "conflict" },
  duplicate_route: { status: 409, code: "conflict" },
  sku_conflict: { status: 409, code: "conflict" },
  price_conflict: { status: 409, code: "conflict" },
  stock_conflict: { status: 409, code: "conflict" },
  request_conflict: { status: 409, code: "conflict" },
};

type JsonObject = Record<string, unknown>;
type RpcError = { code?: unknown; details?: unknown; status?: unknown };
type RpcResult = { data: unknown; error: RpcError | null };
type StaffClientResult =
  | { client: Awaited<ReturnType<typeof createInsforgeServerClient>> }
  | { response: Response };
type BoundedJsonResult = { ok: true; value: unknown } | { ok: false; status: 400 | 413 };
type ProductPriceEnvelope = { ok: true; body: unknown; prices?: ProductPriceWrite[] } | { ok: false; fields: unknown };

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function json(body: unknown, status = 200, headers: Record<string, string> = PRIVATE_HEADERS) {
  return operationalJson(body, status, headers, "admin_records");
}

function errorResponse(code: string, status: number, fields?: unknown, headers = PRIVATE_HEADERS) {
  return json({ error: { code, message: ERROR_MESSAGES[code] ?? ERROR_MESSAGES.backend_unavailable, ...(fields ? { fields } : {}) } }, status, headers);
}

function validationResponse(fields: unknown, headers = PRIVATE_HEADERS) {
  return errorResponse("validation_error", 400, fields, headers);
}

function rpcErrorResponse(error: RpcError | null, headers = PRIVATE_HEADERS): Response {
  if (!error) return errorResponse("backend_unavailable", 503, undefined, headers);
  if (error.code === "P0001" && typeof error.details === "string") {
    const mapped = RPC_DETAILS[error.details];
    if (mapped) return errorResponse(mapped.code, mapped.status, undefined, headers);
  }
  if (error.status === 401) return errorResponse("unauthorized", 401, undefined, headers);
  if (error.status === 403) return errorResponse("forbidden", 403, undefined, headers);
  return errorResponse("backend_unavailable", 503, undefined, headers);
}

function accessError(status: 401 | 403 | 503): Response {
  if (status === 401) return errorResponse("unauthorized", 401);
  if (status === 403) return errorResponse("forbidden", 403);
  return errorResponse("backend_unavailable", 503);
}

async function readAdminJsonBody(request: Request): Promise<BoundedJsonResult> {
  const bounded = await readBoundedBody(request, MAX_ADMIN_BODY_BYTES);
  if (!bounded.ok) return { ok: false, status: bounded.reason === "too_large" ? 413 : 400 };
  try {
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bounded.bytes)) as unknown };
  } catch {
    return { ok: false, status: 400 };
  }
}

export async function authorizedStaffClient(capabilities: readonly StaffCapability[]): Promise<StaffClientResult> {
  for (const capability of capabilities) {
    const access = await requireCapability(capability);
    if (!access.allowed) return { response: accessError(access.status) } as const;
  }
  try {
    return { client: await createInsforgeServerClient() } as const;
  } catch {
    return { response: accessError(503) } as const;
  }
}

async function authorizedClient(module: AdminModule, action?: RecordAction): Promise<StaffClientResult> {
  const capabilities: StaffCapability[] = [ADMIN_MODULES[module].editCapability];
  if (action === "publish" || action === "unpublish" || action === "archive") capabilities.push("content.publish");
  return authorizedStaffClient(capabilities);
}

async function rpc(client: Awaited<ReturnType<typeof createInsforgeServerClient>> | ReturnType<typeof createInsforgePublicClient>, name: string, args: Record<string, unknown>): Promise<RpcResult> {
  try {
    return await client.database.schema("public").rpc(name, args) as RpcResult;
  } catch {
    return { data: null, error: null };
  }
}

function parseRecordListItem(value: unknown, kind: CmsKind) {
  if (!isObject(value)) return null;
  const id = typeof value.id === "string" ? parseRecordId(value.id) : null;
  const publishedRevisionId = value.publishedRevisionId === null ? null
    : typeof value.publishedRevisionId === "string" ? parseRecordId(value.publishedRevisionId) : undefined;
  if (
    !id || value.kind !== kind || typeof value.title !== "string" || typeof value.slug !== "string" ||
    !Number.isSafeInteger(value.version) || (value.version as number) < 1 ||
    publishedRevisionId === undefined || typeof value.archived !== "boolean" ||
    typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))
  ) return null;
  return {
    id,
    kind,
    title: value.title,
    slug: value.slug,
    version: value.version as number,
    publishedRevisionId,
    archived: value.archived,
    updatedAt: value.updatedAt,
  };
}

function parseRevisions(value: unknown) {
  if (!Array.isArray(value)) return null;
  const revisions = [];
  for (const revision of value) {
    if (!isObject(revision)) return null;
    const id = typeof revision.id === "string" ? parseRecordId(revision.id) : null;
    const sourceRevisionId = revision.sourceRevisionId === null || revision.sourceRevisionId === undefined ? null
      : typeof revision.sourceRevisionId === "string" ? parseRecordId(revision.sourceRevisionId) : undefined;
    if (
      !id || !Number.isSafeInteger(revision.revisionNumber) || (revision.revisionNumber as number) < 1 ||
      typeof revision.title !== "string" || typeof revision.slug !== "string" ||
      typeof revision.publishedAt !== "string" || !Number.isFinite(Date.parse(revision.publishedAt)) ||
      (revision.publishedBySubject !== null && typeof revision.publishedBySubject !== "string") ||
      sourceRevisionId === undefined
    ) return null;
    revisions.push({
      id,
      revisionNumber: revision.revisionNumber as number,
      title: revision.title,
      slug: revision.slug,
      publishedAt: revision.publishedAt,
      publishedBySubject: revision.publishedBySubject as string | null,
      sourceRevisionId,
    });
  }
  return revisions;
}

function parseAdminRecord(value: unknown, module: AdminModule) {
  if (!isObject(value)) return null;
  const kind = ADMIN_MODULES[module].kind;
  const id = typeof value.id === "string" ? parseRecordId(value.id) : null;
  const publishedRevisionId = value.publishedRevisionId === null ? null
    : typeof value.publishedRevisionId === "string" ? parseRecordId(value.publishedRevisionId) : undefined;
  const document = parseDocument(module, value.document);
  if (
    !id || value.kind !== kind || typeof value.title !== "string" || typeof value.slug !== "string" ||
    !document.ok || document.value.title !== value.title || document.value.slug !== value.slug ||
    !Number.isSafeInteger(value.version) || (value.version as number) < 1 ||
    publishedRevisionId === undefined || typeof value.archived !== "boolean" ||
    typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))
  ) return null;
  const result = {
    id,
    kind,
    title: value.title,
    slug: value.slug,
    document: document.value,
    version: value.version as number,
    publishedRevisionId,
    archived: value.archived,
    updatedAt: value.updatedAt,
  };
  if (value.revisions === undefined) return result;
  const revisions = parseRevisions(value.revisions);
  return revisions ? { ...result, revisions } : null;
}

function parsePublicVariants(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 100) return null;
  const variants = [];
  for (const variant of value) {
    if (!isObject(variant)) return null;
    const id = typeof variant.id === "string" ? parseRecordId(variant.id) : null;
    const regularPricePaise = variant.regularPricePaise === null ? null : variant.regularPricePaise;
    const effectivePricePaise = variant.effectivePricePaise === null ? null : variant.effectivePricePaise;
    const saleEndsAt = variant.saleEndsAt === null ? null : variant.saleEndsAt;
    if (
      !id || typeof variant.sku !== "string" || typeof variant.label !== "string" ||
      !(regularPricePaise === null || (Number.isSafeInteger(regularPricePaise) && (regularPricePaise as number) >= 0)) ||
      !(effectivePricePaise === null || (Number.isSafeInteger(effectivePricePaise) && (effectivePricePaise as number) >= 0)) ||
      typeof variant.isOnSale !== "boolean" ||
      !(saleEndsAt === null || (typeof saleEndsAt === "string" && Number.isFinite(Date.parse(saleEndsAt)))) ||
      (variant.availability !== "available" && variant.availability !== "unavailable")
    ) return null;
    variants.push({
      id,
      sku: variant.sku,
      label: variant.label,
      regularPricePaise: regularPricePaise as number | null,
      effectivePricePaise: effectivePricePaise as number | null,
      isOnSale: variant.isOnSale,
      saleEndsAt,
      availability: variant.availability,
    });
  }
  return variants;
}

function parsePublishedRecord(value: unknown, module: AdminModule, includeBlocks: boolean) {
  if (!isObject(value)) return null;
  const kind = ADMIN_MODULES[module].kind;
  const id = typeof value.id === "string" ? parseRecordId(value.id) : null;
  const revisionId = typeof value.revisionId === "string" ? parseRecordId(value.revisionId) : null;
  const sourceDocument = isObject(value.document) ? value.document : {};
  const documentInput = {
    ...sourceDocument,
    title: sourceDocument.title ?? value.title,
    slug: sourceDocument.slug ?? value.slug,
    summary: sourceDocument.summary ?? value.summary,
    blocks: includeBlocks ? sourceDocument.blocks : [],
  };
  const document = parseDocument(module, documentInput);
  const variants = parsePublicVariants(value.variants);
  if (
    !id || value.kind !== kind || typeof value.title !== "string" || typeof value.slug !== "string" ||
    typeof value.summary !== "string" || !revisionId ||
    typeof value.publishedAt !== "string" || !Number.isFinite(Date.parse(value.publishedAt)) ||
    !document.ok || document.value.title !== value.title || document.value.slug !== value.slug ||
    document.value.summary !== value.summary || variants === null ||
    (module === "products" && variants === undefined) || (module !== "products" && variants !== undefined)
  ) return null;
  return {
    id,
    kind,
    title: value.title,
    slug: value.slug,
    summary: document.value.summary,
    document: document.value,
    revisionId,
    publishedAt: value.publishedAt,
    ...(variants ? { variants: module === "products" && "sourceObservation" in document.value
      ? variants.map(variant => ({ ...variant, purchasable: false })) : variants } : {}),
  };
}

function parsePublishedListItem(value: unknown, module: AdminModule) {
  const record = parsePublishedRecord(value, module, false);
  if (!record) return null;
  const rawMediaIds = "mediaIds" in record.document ? record.document.mediaIds : undefined;
  const mediaIds = Array.isArray(rawMediaIds) && rawMediaIds.every((id): id is string => typeof id === "string")
    ? rawMediaIds
    : undefined;
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    slug: record.slug,
    summary: record.summary,
    revisionId: record.revisionId,
    publishedAt: record.publishedAt,
    ...(mediaIds ? { mediaIds } : {}),
    ...(record.variants ? { variants: record.variants } : {}),
  };
}

async function mutationBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  if (!isSameOrigin(request.url, request.headers.get("origin"))) {
    return { ok: false, response: errorResponse("forbidden", 403) };
  }
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return { ok: false, response: errorResponse("unsupported_media_type", 415) };
  }
  const body = await readAdminJsonBody(request);
  if (!body.ok) {
    const response = body.status === 413
      ? errorResponse("payload_too_large", 413)
      : validationResponse([{ field: "body", code: "invalid", message: "Send valid JSON." }]);
    return { ok: false, response };
  }
  return body;
}

function splitProductPrices(module: AdminModule, value: unknown): ProductPriceEnvelope {
  if (module !== "products" || !isObject(value) || !Object.prototype.hasOwnProperty.call(value, "prices")) {
    return { ok: true, body: value };
  }
  const parsed = parseProductPriceWrites(value.prices);
  if (!parsed.ok) return { ok: false, fields: parsed.fields };
  const body = { ...value };
  delete body.prices;
  return { ok: true, body, prices: parsed.value };
}

function validateProductPriceSkus(document: unknown, prices: readonly ProductPriceWrite[]): FieldError[] {
  if (!isObject(document) || !Array.isArray(document.variants)) return [{ field: "prices", code: "invalid", message: "Prices must match variants in this product." }];
  const skus = new Set(document.variants.filter(isObject).map((variant) => typeof variant.sku === "string" ? variant.sku.toLowerCase() : ""));
  const missing = prices.filter((price) => !skus.has(price.sku.toLowerCase()));
  return missing.map((price) => ({ field: "prices", code: "invalid", message: `Price row does not match variant ${price.sku}.` }));
}

export async function adminList(request: Request, rawModule: string): Promise<Response> {
  const adminModule = parseAdminModule(rawModule);
  if (!adminModule) return errorResponse("not_found", 404);
  const access = await authorizedClient(adminModule);
  if ("response" in access) return access.response;
  const query = parseListQuery(new URL(request.url).searchParams);
  if (!query.ok) return validationResponse(query.fields);
  const result = await rpc(access.client, "admin_list_records", {
    p_kind: ADMIN_MODULES[adminModule].kind,
    p_query: query.value.q,
    p_limit: query.value.limit,
    p_offset: query.value.offset,
  });
  if (result.error) return rpcErrorResponse(result.error);
  if (!isObject(result.data) || !Array.isArray(result.data.items) || !Number.isSafeInteger(result.data.total) || (result.data.total as number) < 0) {
    return errorResponse("backend_unavailable", 503);
  }
  const items = result.data.items.map((item) => parseRecordListItem(item, ADMIN_MODULES[adminModule].kind));
  if (items.some((item) => item === null)) return errorResponse("backend_unavailable", 503);
  return json({ items, total: result.data.total });
}

export async function adminCreate(request: Request, rawModule: string): Promise<Response> {
  const adminModule = parseAdminModule(rawModule);
  if (!adminModule) return errorResponse("not_found", 404);
  const access = await authorizedClient(adminModule);
  if ("response" in access) return access.response;
  const body = await mutationBody(request);
  if (!body.ok) return body.response;
  const productInput = splitProductPrices(adminModule, body.value);
  if (!productInput.ok) return validationResponse(productInput.fields);
  const parsed = parseCreateInput(adminModule, productInput.body);
  if (!parsed.ok) return validationResponse(parsed.fields);
  const priceFields = productInput.prices?.length ? validateProductPriceSkus(parsed.value.document, productInput.prices) : [];
  if (priceFields.length) return validationResponse(priceFields);
  if (productInput.prices?.length && isObject(parsed.value.document) && "sourceObservation" in parsed.value.document &&
    productInput.prices.some((price) => price.actualPricePaise === undefined)) {
    return validationResponse([{ field: "prices", code: "invalid", message: "Source observations require an explicit selling price." }]);
  }
  const result = productInput.prices?.length
    ? await rpc(access.client, "admin_save_product_with_prices", {
      p_id: null, p_expected_version: null, p_document: parsed.value.document, p_prices: productInput.prices,
    })
    : await rpc(access.client, "admin_save_record", {
      p_id: null,
      p_kind: ADMIN_MODULES[adminModule].kind,
      p_expected_version: null,
      p_document: parsed.value.document,
    });
  if (result.error) return rpcErrorResponse(result.error);
  const record = isObject(result.data) ? parseAdminRecord(result.data.record, adminModule) : null;
  if (!record) return errorResponse("backend_unavailable", 503);
  return json({ record }, 201, { ...PRIVATE_HEADERS, Location: `/api/admin/${adminModule}/${record.id}` });
}

export async function adminGet(request: Request, rawModule: string, rawId: string): Promise<Response> {
  void request;
  const adminModule = parseAdminModule(rawModule);
  if (!adminModule) return errorResponse("not_found", 404);
  const id = parseRecordId(rawId);
  if (!id) return errorResponse("not_found", 404);
  const access = await authorizedClient(adminModule);
  if ("response" in access) return access.response;
  const result = await rpc(access.client, "admin_get_record", { p_id: id });
  if (result.error) return rpcErrorResponse(result.error);
  const record = isObject(result.data) ? parseAdminRecord(result.data.record, adminModule) : null;
  if (!record) return errorResponse("backend_unavailable", 503);
  return json({ record });
}

export async function adminUpdate(request: Request, rawModule: string, rawId: string): Promise<Response> {
  const adminModule = parseAdminModule(rawModule);
  if (!adminModule) return errorResponse("not_found", 404);
  const id = parseRecordId(rawId);
  if (!id) return errorResponse("not_found", 404);
  const access = await authorizedClient(adminModule);
  if ("response" in access) return access.response;
  const body = await mutationBody(request);
  if (!body.ok) return body.response;
  const productInput = splitProductPrices(adminModule, body.value);
  if (!productInput.ok) return validationResponse(productInput.fields);
  const parsed = parseUpdateInput(adminModule, productInput.body);
  if (!parsed.ok) return validationResponse(parsed.fields);
  const priceFields = productInput.prices?.length ? validateProductPriceSkus(parsed.value.document, productInput.prices) : [];
  if (priceFields.length) return validationResponse(priceFields);
  if (productInput.prices?.length && isObject(parsed.value.document) && "sourceObservation" in parsed.value.document &&
    productInput.prices.some((price) => price.actualPricePaise === undefined)) {
    return validationResponse([{ field: "prices", code: "invalid", message: "Source observations require an explicit selling price." }]);
  }
  const result = productInput.prices?.length
    ? await rpc(access.client, "admin_save_product_with_prices", {
      p_id: id, p_expected_version: parsed.value.expectedVersion, p_document: parsed.value.document, p_prices: productInput.prices,
    })
    : await rpc(access.client, "admin_save_record", {
      p_id: id,
      p_kind: ADMIN_MODULES[adminModule].kind,
      p_expected_version: parsed.value.expectedVersion,
      p_document: parsed.value.document,
    });
  if (result.error) return rpcErrorResponse(result.error);
  const record = isObject(result.data) ? parseAdminRecord(result.data.record, adminModule) : null;
  if (!record) return errorResponse("backend_unavailable", 503);
  return json({ record });
}

export async function adminTransition(request: Request, rawModule: string, rawId: string, rawAction: string): Promise<Response> {
  const adminModule = parseAdminModule(rawModule);
  if (!adminModule) return errorResponse("not_found", 404);
  const id = parseRecordId(rawId);
  if (!id) return errorResponse("not_found", 404);
  if (!["publish", "unpublish", "archive", "restore"].includes(rawAction)) return errorResponse("not_found", 404);
  const action = rawAction as RecordAction;
  const access = await authorizedClient(adminModule, action);
  if ("response" in access) return access.response;
  const body = await mutationBody(request);
  if (!body.ok) return body.response;
  const parsed = parseActionInput(action, body.value);
  if (!parsed.ok) return validationResponse(parsed.fields);
  const result = await rpc(access.client, "admin_transition_record", {
    p_id: id,
    p_expected_version: parsed.value.expectedVersion,
    p_action: parsed.value.action,
    p_revision_id: parsed.value.revisionId,
  });
  if (result.error) return rpcErrorResponse(result.error);
  const record = isObject(result.data) ? parseAdminRecord(result.data.record, adminModule) : null;
  if (!record) return errorResponse("backend_unavailable", 503);
  return json({ record });
}

export async function publishedList(request: Request, rawModule: string): Promise<Response> {
  const adminModule = parseAdminModule(rawModule);
  if (!adminModule) return errorResponse("not_found", 404, undefined, PUBLIC_HEADERS);
  const query = parseListQuery(new URL(request.url).searchParams);
  if (!query.ok) return validationResponse(query.fields, PUBLIC_HEADERS);
  let client;
  try {
    client = createInsforgePublicClient();
  } catch {
    return errorResponse("backend_unavailable", 503, undefined, PUBLIC_HEADERS);
  }
  const result = await rpc(client, "published_list_records", {
    p_kind: ADMIN_MODULES[adminModule].kind,
    p_query: query.value.q,
    p_limit: query.value.limit,
    p_offset: query.value.offset,
  });
  if (result.error) return rpcErrorResponse(result.error, PUBLIC_HEADERS);
  if (!isObject(result.data) || !Array.isArray(result.data.items) || !Number.isSafeInteger(result.data.total) || (result.data.total as number) < 0) {
    return errorResponse("backend_unavailable", 503, undefined, PUBLIC_HEADERS);
  }
  const items = result.data.items.map((item) => parsePublishedListItem(item, adminModule));
  if (items.some((item) => item === null)) return errorResponse("backend_unavailable", 503, undefined, PUBLIC_HEADERS);
  return json({ items, total: result.data.total }, 200, PUBLIC_HEADERS);
}

export async function publishedGet(_request: Request, rawModule: string, rawSlug: string): Promise<Response> {
  const adminModule = parseAdminModule(rawModule);
  if (!adminModule) return errorResponse("not_found", 404, undefined, PUBLIC_HEADERS);
  const slug = parseSlug(rawSlug);
  if (!slug) return errorResponse("not_found", 404, undefined, PUBLIC_HEADERS);
  let client;
  try {
    client = createInsforgePublicClient();
  } catch {
    return errorResponse("backend_unavailable", 503, undefined, PUBLIC_HEADERS);
  }
  const result = await rpc(client, "published_get_record", {
    p_kind: ADMIN_MODULES[adminModule].kind,
    p_slug: slug,
  });
  if (result.error) return rpcErrorResponse(result.error, PUBLIC_HEADERS);
  if (isObject(result.data) && typeof result.data.redirectTo === "string") {
    const redirectTo = parseSlug(result.data.redirectTo);
    if (!redirectTo || redirectTo === slug) return errorResponse("not_found", 404, undefined, PUBLIC_HEADERS);
    return new Response(null, {
      status: 307,
      headers: { ...PUBLIC_HEADERS, Location: `/api/published/${adminModule}/${encodeURIComponent(redirectTo)}` },
    });
  }
  const record = isObject(result.data) ? parsePublishedRecord(result.data.record, adminModule, true) : null;
  if (!record) return errorResponse("not_found", 404, undefined, PUBLIC_HEADERS);
  return json({ record }, 200, PUBLIC_HEADERS);
}

function parseVariantDto(value: unknown): AdminVariantDto | null {
  if (!isObject(value)) return null;
  const id = typeof value.id === "string" ? parseVariantId(value.id) : null;
  const productId = typeof value.productId === "string" ? parseRecordId(value.productId) : null;
  const stringField = (input: unknown, max: number): input is string => typeof input === "string" && input.trim().length > 0 && Array.from(input).length <= max && !/[\u0000-\u001f\u007f]/.test(input);
  const nullableInteger = (input: unknown, max: number) => input === null || (Number.isSafeInteger(input) && (input as number) >= 0 && (input as number) <= max);
  const nullableDate = (input: unknown) => input === null || (typeof input === "string" && Number.isFinite(Date.parse(input)));
  const actualPaise = value.actualPaise === undefined ? null : value.actualPaise;
  if (
    !id || !productId || !stringField(value.productTitle, 200) || !stringField(value.sku, 80) || !stringField(value.label, 120) ||
    !nullableInteger(value.regularPaise, 10_000_000_000) || !nullableInteger(actualPaise, 10_000_000_000) || !nullableInteger(value.salePaise, 10_000_000_000) ||
    !nullableDate(value.saleFrom) || !nullableDate(value.saleUntil) ||
    !Number.isSafeInteger(value.priceVersion) || (value.priceVersion as number) < 0 ||
    !nullableInteger(value.stock, 2_147_483_647) ||
    !(value.stockVersion === null || (Number.isSafeInteger(value.stockVersion) && (value.stockVersion as number) >= 0))
  ) return null;
  const saleFrom = value.saleFrom === null ? null : new Date(value.saleFrom as string).toISOString();
  const saleUntil = value.saleUntil === null ? null : new Date(value.saleUntil as string).toISOString();
  const salePaise = value.salePaise as number | null;
  const regularPaise = value.regularPaise as number | null;
  if (actualPaise !== null && (regularPaise === null || (actualPaise as number) > regularPaise)) return null;
  const saleCeiling = actualPaise === null ? regularPaise : actualPaise as number;
  if ((salePaise === null && (saleFrom !== null || saleUntil !== null)) ||
      (salePaise !== null && (saleCeiling === null || salePaise > saleCeiling || !saleFrom || !saleUntil || Date.parse(saleFrom) >= Date.parse(saleUntil)))) return null;
  return {
    id,
    productId,
    productTitle: value.productTitle,
    sku: value.sku,
    label: value.label,
    regularPaise,
    actualPaise: actualPaise as number | null,
    salePaise,
    saleFrom,
    saleUntil,
    priceVersion: value.priceVersion as number,
    stock: value.stock as number | null,
    stockVersion: value.stockVersion as number | null,
  };
}

export async function adminListPricing(request: Request): Promise<Response> {
  const access = await authorizedStaffClient(["catalog.edit"]);
  if ("response" in access) return access.response;
  const query = parseListQuery(new URL(request.url).searchParams);
  if (!query.ok) return validationResponse(query.fields);
  const result = await rpc(access.client, "admin_list_variants", {
    p_query: query.value.q,
    p_limit: query.value.limit,
    p_offset: query.value.offset,
  });
  if (result.error) return rpcErrorResponse(result.error);
  if (!isObject(result.data) || !Array.isArray(result.data.items) || !Number.isSafeInteger(result.data.total) || (result.data.total as number) < 0) {
    return errorResponse("backend_unavailable", 503);
  }
  const items = result.data.items.map(parseVariantDto);
  if (items.some((item) => item === null)) return errorResponse("backend_unavailable", 503);
  return json({ items, total: result.data.total });
}

export async function adminSetVariantPrice(request: Request, rawId: string): Promise<Response> {
  const id = parseVariantId(rawId);
  if (!id) return errorResponse("not_found", 404);
  const access = await authorizedStaffClient(["catalog.edit"]);
  if ("response" in access) return access.response;
  const body = await mutationBody(request);
  if (!body.ok) return body.response;
  const parsed = parseVariantPriceUpdate(body.value);
  if (!parsed.ok) return validationResponse(parsed.fields);
  const result = await rpc(access.client, "admin_set_variant_price", {
    p_variant_id: id,
    p_expected_version: parsed.value.expectedVersion,
    p_regular_paise: parsed.value.regularPaise,
    p_sale_paise: parsed.value.salePaise,
    p_sale_from: parsed.value.saleFrom,
    p_sale_until: parsed.value.saleUntil,
    p_reason: parsed.value.reason,
  });
  if (result.error) return rpcErrorResponse(result.error);
  const variant = isObject(result.data) ? parseVariantDto(result.data.variant) : null;
  if (!variant) return errorResponse("backend_unavailable", 503);
  return json({ variant });
}

export async function adminListInventory(request: Request): Promise<Response> {
  const access = await authorizedStaffClient(["orders.manage"]);
  if ("response" in access) return access.response;
  const query = parseListQuery(new URL(request.url).searchParams);
  if (!query.ok) return validationResponse(query.fields);
  const result = await rpc(access.client, "admin_list_variants", {
    p_query: query.value.q,
    p_limit: query.value.limit,
    p_offset: query.value.offset,
  });
  if (result.error) return rpcErrorResponse(result.error);
  if (!isObject(result.data) || !Array.isArray(result.data.items) || !Number.isSafeInteger(result.data.total) || (result.data.total as number) < 0) {
    return errorResponse("backend_unavailable", 503);
  }
  const items = result.data.items.map(parseVariantDto);
  if (items.some((item) => item === null)) return errorResponse("backend_unavailable", 503);
  return json({ items, total: result.data.total });
}

export async function adminAdjustInventory(request: Request, rawId: string): Promise<Response> {
  const id = parseVariantId(rawId);
  if (!id) return errorResponse("not_found", 404);
  const access = await authorizedStaffClient(["orders.manage"]);
  if ("response" in access) return access.response;
  const body = await mutationBody(request);
  if (!body.ok) return body.response;
  const parsed = parseInventoryAdjustment(body.value);
  if (!parsed.ok) return validationResponse(parsed.fields);
  const result = await rpc(access.client, "admin_adjust_inventory", {
    p_variant_id: id,
    p_expected_version: parsed.value.expectedVersion,
    p_delta: parsed.value.delta,
    p_reason: parsed.value.reason,
    p_request_id: parsed.value.requestId,
  });
  if (result.error) return rpcErrorResponse(result.error);
  const variant = isObject(result.data) ? parseVariantDto(result.data.variant) : null;
  if (!variant) return errorResponse("backend_unavailable", 503);
  return json({ variant });
}
