import "server-only";
import { requireCapability, type StaffCapability } from "@/lib/authorization";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { isSameOriginRequest, readBoundedBody } from "@/lib/storage/http";

export const editorialHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export const editorialJson = (value: unknown, status = 200) => Response.json(value, { status, headers: editorialHeaders });
export const editorialError = (code: string, status: number) => editorialJson({ error: { code, message: code.replaceAll("_", " ") } }, status);

export async function editorialAccess(capability: StaffCapability) {
  const access = await requireCapability(capability);
  return access.allowed ? access : editorialError(access.status === 401 ? "unauthorized" : access.status === 403 ? "forbidden" : "backend_unavailable", access.status);
}

export async function editorialBody(request: Request, maxBytes = 16384): Promise<{ value: unknown } | Response> {
  if (!isSameOriginRequest(request)) return editorialError("same_origin_required", 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return editorialError("application_json_required", 415);
  const body = await readBoundedBody(request, maxBytes);
  if (!body.ok) return editorialError(body.reason === "too_large" ? "payload_too_large" : "invalid_body", body.reason === "too_large" ? 413 : 400);
  try { return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body.bytes)) }; }
  catch { return editorialError("invalid_json", 400); }
}

export function editorialDatabaseError(error: { details?: string; code?: string } | null) {
  const code = error?.details ?? "backend_unavailable";
  const status = code === "unauthenticated" ? 401 : code === "forbidden" ? 403 :
    ["not_found", "media_not_found", "inquiry_not_found"].includes(code) ? 404 :
    ["version_conflict", "invalid_state", "media_referenced", "request_conflict"].includes(code) ? 409 :
    code === "rate_limited" ? 429 : code === "invalid_input" ? 400 : 503;
  return editorialError(status === 503 ? "backend_unavailable" : code, status);
}

export async function editorialRpc(name: string, args: Record<string, unknown>, status = 200) {
  try {
    const client = await createInsforgeServerClient();
    const { data, error } = await client.database.schema("public").rpc(name, args);
    return error ? editorialDatabaseError(error) : editorialJson(data, status);
  } catch { return editorialError("backend_unavailable", 503); }
}
