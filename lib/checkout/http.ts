import "server-only";
import { activeCartSession, cartError, cartJson } from "@/app/api/cart/http";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { isSameOriginRequest, readBoundedBody } from "@/lib/storage/http";
export { activeCartSession, cartError, cartJson };
export async function readCheckoutBody(request: Request): Promise<{ value: unknown } | Response> {
  if (!isSameOriginRequest(request)) return cartError("same_origin_required", 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return cartError("application_json_required", 415);
  const body = await readBoundedBody(request, 32768);
  if (!body.ok) return cartError(body.reason === "too_large" ? "payload_too_large" : "invalid_body", body.reason === "too_large" ? 413 : 400);
  try { return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body.bytes)) as unknown }; }
  catch { return cartError("invalid_json", 400); }
}
export async function orderRpc(name: string, args: Record<string, unknown>): Promise<Response> {
  try {
    const client = await createInsforgeServerClient();
    const { data, error } = await client.database.schema("public").rpc(name, args);
    if (error) {
      const codes: Record<string, [string, number]> = { unauthenticated: ["unauthorized", 401], forbidden: ["forbidden", 403], invalid_input: ["invalid_input", 400], not_found: ["not_found", 404], version_conflict: ["conflict", 409], price_changed: ["price_changed", 409], invalid_transition: ["invalid_transition", 409], item_unavailable: ["item_unavailable", 409], idempotency_conflict: ["idempotency_conflict", 409] };
      const mapped = error.code === "P0001" && typeof error.details === "string" ? codes[error.details] : undefined;
      return mapped ? cartError(mapped[0], mapped[1]) : cartError("backend_unavailable", 503);
    }
    return data && typeof data === "object" && !Array.isArray(data) ? cartJson(data) : cartError("backend_unavailable", 503);
  } catch { return cartError("backend_unavailable", 503); }
}
