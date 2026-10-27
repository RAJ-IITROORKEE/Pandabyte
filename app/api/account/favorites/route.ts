import { auth } from "@clerk/nextjs/server";
import { cartError, cartJson, readCartBody } from "@/app/api/cart/http";
import { parseFavorites, parseFavoritesRequest } from "@/lib/favorites/validation";
import { createInsforgeServerClient } from "@/lib/insforge/server";

async function run(name: "customer_get_favorites" | "customer_replace_favorites", args: Record<string, unknown> = {}): Promise<Response> {
  try {
    const client = await createInsforgeServerClient();
    const { data, error } = await client.database.schema("public").rpc(name, args);
    if (error) {
      const mapped: Record<string, [string, number]> = { unauthenticated: ["unauthorized", 401], invalid_input: ["invalid_favorites", 400], version_conflict: ["conflict", 409], item_unavailable: ["item_unavailable", 409] };
      const entry = error.code === "P0001" && typeof error.details === "string" ? mapped[error.details] : undefined;
      return entry ? cartError(...entry) : cartError("backend_unavailable", 503);
    }
    const favorites = parseFavorites(data);
    return favorites ? cartJson(favorites) : cartError("backend_unavailable", 503);
  } catch { return cartError("backend_unavailable", 503); }
}

async function checkOwner(request: Request): Promise<Response | null> {
  const session = await auth();
  if (!session.isAuthenticated || session.sessionStatus !== "active" || !session.userId) return cartError("unauthorized", 401);
  return request.headers.get("x-account-owner") === session.userId ? null : cartError("account_changed", 409);
}

export async function GET(request: Request): Promise<Response> {
  try {
    const failure = await checkOwner(request);
    if (failure) return failure;
    return await run("customer_get_favorites");
  } catch { return cartError("backend_unavailable", 503); }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const failure = await checkOwner(request);
    if (failure) return failure;
    const body = await readCartBody(request);
    if (body instanceof Response) return body;
    const input = parseFavoritesRequest(body.value);
    if (!input) return cartError("invalid_favorites", 400);
    return await run("customer_replace_favorites", { p_expected_version: input.expectedVersion, p_product_ids: input.productIds });
  } catch { return cartError("backend_unavailable", 503); }
}
