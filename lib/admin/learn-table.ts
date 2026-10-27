import { operationalJson } from "@/lib/observability/events";
import { authorizedStaffClient } from "@/lib/admin/records";
import { isContentTableResult, type ContentTableItem } from "./pages-table-contract.ts";

import { parseLearnTableQuery } from "./learn-table-contract.ts";
export type LearnTableItem = ContentTableItem<"resource">;
export type LearnTableResult = { items: LearnTableItem[]; total: number };

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
type RpcError = { code?: unknown; details?: unknown; status?: unknown };
type RpcResult = { data: unknown; error: RpcError | null };

function respond(body: unknown, status = 200) {
  return operationalJson(body, status, PRIVATE_HEADERS, "admin_records");
}

function errorResponse(code: string, status: number, fields?: unknown) {
  const messages: Record<string, string> = {
    unauthorized: "Sign in to continue.",
    forbidden: "You do not have permission to do this.",
    validation_error: "Review the highlighted fields and try again.",
    backend_unavailable: "The request could not be completed. Please try again later.",
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
    };
    const result = mapped[error.details];
    if (result) return errorResponse(result.code, result.status);
  }
  if (error.status === 401) return errorResponse("unauthorized", 401);
  if (error.status === 403) return errorResponse("forbidden", 403);
  return errorResponse("backend_unavailable", 503);
}

export async function adminListLearnTable(request: Request): Promise<Response> {
  const access = await authorizedStaffClient(["content.edit"]);
  if ("response" in access) return access.response;

  const query = parseLearnTableQuery(new URL(request.url).searchParams);
  if (!query.ok) return errorResponse("validation_error", 400, query.fields);

  try {
    const result = await access.client.database.schema("public").rpc("admin_list_learn_table", {
      p_query: query.value.q,
      p_status: query.value.status,
      p_sort: query.value.sort,
      p_limit: query.value.limit,
      p_offset: query.value.offset,
      p_collection: query.value.collection,
    }) as RpcResult;
    if (result.error) return rpcErrorResponse(result.error);
    if (!isContentTableResult(result.data, query.value.limit, "resource")) return errorResponse("backend_unavailable", 503);
    return respond(result.data);
  } catch {
    return errorResponse("backend_unavailable", 503);
  }
}


