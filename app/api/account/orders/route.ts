import { activeCartSession, cartError, orderRpc } from "@/lib/checkout/http";
import { parseOrderQuery } from "@/lib/checkout/validation";
export async function GET(request: Request) {
  try {
    if (!await activeCartSession()) return cartError("unauthorized", 401);
    const query = parseOrderQuery(new URL(request.url).searchParams);
    return query ? orderRpc("customer_list_checkout_orders", { p_limit: query.limit, p_offset: query.offset }) : cartError("invalid_input", 400);
  } catch { return cartError("backend_unavailable", 503); }
}
