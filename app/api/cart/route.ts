import { parseCartReplaceRequest, parseCustomerCart } from "@/lib/cart/validation";
import { activeCartSession, cartError, cartJson, privateCartRpc, readCartBody } from "./http";

export async function GET(): Promise<Response> {
  try {
    if (!(await activeCartSession())) return cartError("unauthorized", 401);
    const result = await privateCartRpc("customer_get_cart");
    if ("response" in result) return result.response;
    const cart = parseCustomerCart(result.data);
    return cart ? cartJson(cart) : cartError("backend_unavailable", 503);
  } catch {
    return cartError("backend_unavailable", 503);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    if (!(await activeCartSession())) return cartError("unauthorized", 401);
    const body = await readCartBody(request);
    if (body instanceof Response) return body;
    const input = parseCartReplaceRequest(body.value);
    if (!input) return cartError("invalid_cart", 400);
    const result = await privateCartRpc("customer_replace_cart", {
      p_expected_version: input.expectedVersion,
      p_items: input.items,
    });
    if ("response" in result) return result.response;
    const cart = parseCustomerCart(result.data);
    return cart ? cartJson(cart) : cartError("backend_unavailable", 503);
  } catch {
    return cartError("backend_unavailable", 503);
  }
}
