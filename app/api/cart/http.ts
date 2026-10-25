import "server-only";
import { operationalJson } from "@/lib/observability/events";

import { auth } from "@clerk/nextjs/server";
import { createInsforgePublicClient } from "@/lib/insforge/public";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { isSameOriginRequest, readBoundedBody } from "@/lib/storage/http";
import { MAX_CART_BODY_BYTES } from "@/lib/cart/validation";

const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export function cartJson(value: unknown, status = 200): Response {
  return operationalJson(value, status, HEADERS, "cart");
}

export function cartError(code: string, status: number): Response {
  return cartJson({ error: { code } }, status);
}

export async function activeCartSession(): Promise<boolean> {
  const session = await auth();
  return Boolean(session.isAuthenticated && session.sessionStatus === "active" && session.userId);
}

export async function readCartBody(request: Request): Promise<{ value: unknown } | Response> {
  if (!isSameOriginRequest(request)) return cartError("same_origin_required", 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return cartError("application_json_required", 415);
  }
  const body = await readBoundedBody(request, MAX_CART_BODY_BYTES);
  if (!body.ok) {
    return cartError(body.reason === "too_large" ? "payload_too_large" : "invalid_body", body.reason === "too_large" ? 413 : 400);
  }
  try {
    return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body.bytes)) as unknown };
  } catch {
    return cartError("invalid_json", 400);
  }
}

const RPC_ERRORS: Record<string, { code: string; status: number }> = {
  unauthenticated: { code: "unauthorized", status: 401 },
  forbidden: { code: "forbidden", status: 403 },
  invalid_input: { code: "invalid_cart", status: 400 },
  version_conflict: { code: "conflict", status: 409 },
  item_unavailable: { code: "item_unavailable", status: 409 },
};

export function cartRpcError(error: unknown): Response {
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; details?: unknown };
    if (candidate.code === "P0001" && typeof candidate.details === "string") {
      const mapped = RPC_ERRORS[candidate.details];
      if (mapped) return cartError(mapped.code, mapped.status);
    }
  }
  return cartError("backend_unavailable", 503);
}

export async function privateCartRpc(
  name: "customer_get_cart" | "customer_replace_cart",
  args: Record<string, unknown> = {},
): Promise<{ data: unknown } | { response: Response }> {
  try {
    const client = await createInsforgeServerClient();
    const result = await client.database.schema("public").rpc(name, args);
    if (result.error) return { response: cartRpcError(result.error) };
    return { data: result.data };
  } catch {
    return { response: cartError("backend_unavailable", 503) };
  }
}

export async function publicCartRpc(
  name: "published_quote_cart",
  args: Record<string, unknown>,
): Promise<{ data: unknown } | { response: Response }> {
  try {
    const client = createInsforgePublicClient();
    const result = await client.database.schema("public").rpc(name, args);
    if (result.error) return { response: cartRpcError(result.error) };
    return { data: result.data };
  } catch {
    return { response: cartError("backend_unavailable", 503) };
  }
}
