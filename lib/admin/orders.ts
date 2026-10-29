import { operationalJson } from "@/lib/observability/events";
import { requireCapability } from "@/lib/authorization";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { parseAdminOrderListQuery, parseAdminOrderListRpcResult } from "./orders-contract.ts";
import { parseAdminOrderActivity } from "./order-activity-contract.ts";
import { isOrderReference } from "@/lib/checkout/validation";
import { clerkClient } from "@clerk/nextjs/server";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
type RpcError = { code?: unknown; details?: unknown; status?: unknown };
type RpcResult = { data: unknown; error: RpcError | null };

function respond(body: unknown, status = 200) {
  return operationalJson(body, status, PRIVATE_HEADERS, "admin_records");
}

function errorResponse(code: string, status: number, fields?: unknown) {
  const messages: Record<string, string> = {
    unauthorized: "Sign in to continue.",
    forbidden: "You do not have permission to view orders.",
    validation_error: "Review the order query and try again.",
    backend_unavailable: "The request could not be completed. Please try again later.",
    not_found: "The requested order was not found.",
  };
  return respond({ error: { code, message: messages[code] ?? messages.backend_unavailable, ...(fields ? { fields } : {}) } }, status);
}

function rpcErrorResponse(error: RpcError | null): Response {
  if (!error) return errorResponse("backend_unavailable", 503);
  if (error.code === "P0001" && typeof error.details === "string") {
    const mapped: Record<string, { status: number; code: string }> = {
      unauthenticated: { status: 401, code: "unauthorized" },
      forbidden: { status: 403, code: "forbidden" },
      invalid_input: { status: 400, code: "validation_error" },
      not_found: { status: 404, code: "not_found" },
    };
    const result = mapped[error.details];
    if (result) return errorResponse(result.code, result.status);
  }
  if (error.status === 401) return errorResponse("unauthorized", 401);
  if (error.status === 403) return errorResponse("forbidden", 403);
  return errorResponse("backend_unavailable", 503);
}

export async function adminOrderActivity(reference: string): Promise<Response> {
  const access = await requireCapability("staff.manage");
  if (!access.allowed) return errorResponse(access.status === 401 ? "unauthorized" : access.status === 403 ? "forbidden" : "backend_unavailable", access.status);
  if (!isOrderReference(reference)) return errorResponse("not_found", 404);
  try {
    const client = await createInsforgeServerClient();
    if (!client) return errorResponse("backend_unavailable", 503);
    const result = await client.database.schema("public").rpc("admin_get_order_activity", { p_reference: reference }) as RpcResult;
    if (result.error) return rpcErrorResponse(result.error);
    const data = parseAdminOrderActivity(result.data);
    return data ? respond(data) : errorResponse("backend_unavailable", 503);
  } catch { return errorResponse("backend_unavailable", 503); }
}

export async function adminListOrders(request: Request): Promise<Response> {
  const access = await requireCapability("staff.manage");
  if (!access.allowed) return errorResponse(access.status === 401 ? "unauthorized" : access.status === 403 ? "forbidden" : "backend_unavailable", access.status);

  const query = parseAdminOrderListQuery(new URL(request.url).searchParams);
  if (!query.ok) return errorResponse("validation_error", 400, query.fields);

  try {
    const client = await createInsforgeServerClient();
    if (!client) return errorResponse("backend_unavailable", 503);
    const result = await client.database.schema("public").rpc("admin_search_orders", {
      p_query: query.value.q,
      p_status: query.value.status,
      p_sort: query.value.sort,
      p_limit: query.value.limit,
      p_offset: query.value.offset,
      p_group: query.value.group,
      p_payment: query.value.payment,
      p_environment: query.value.environment,
      p_from: query.value.from || null,
      p_to: query.value.to || null,
    }) as RpcResult;
    if (result.error) return rpcErrorResponse(result.error);
    const data = parseAdminOrderListRpcResult(result.data, query.value);
    if (!data) return errorResponse("backend_unavailable", 503);
    if (data.items.length) {
      try {
        const identities = await client.database.schema("public").rpc("admin_order_customer_identities", { p_references: data.items.map(item => item.reference) });
        if (!identities.error && Array.isArray(identities.data)) {
          const rows = identities.data.filter((row: unknown): row is { reference: string; subject: string } => !!row && typeof row === "object" && "reference" in row && typeof row.reference === "string" && data.items.some(item => item.reference === row.reference) && "subject" in row && typeof row.subject === "string" && /^user_[A-Za-z0-9]+$/.test(row.subject));
          const subjects = [...new Set(rows.map(row => row.subject))];
          if (subjects.length && subjects.length <= 50) {
            const users = await (await clerkClient()).users.getUserList({ userId: subjects, limit: 50, offset: 0 });
            const photos = new Map(users.data.filter(user => subjects.includes(user.id)).map(user => [user.id, user.hasImage && /^https:\/\/img\.clerk\.com\//.test(user.imageUrl) ? user.imageUrl : null]));
            for (const item of data.items) item.customerAvatarUrl = photos.get(rows.find(row => row.reference === item.reference)?.subject ?? "") ?? null;
          }
        }
      } catch { /* Optional directory failures leave initials without hiding orders. */ }
    }
    return respond(data);
  } catch {
    return errorResponse("backend_unavailable", 503);
  }
}
