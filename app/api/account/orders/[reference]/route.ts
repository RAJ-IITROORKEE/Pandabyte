import { activeCartSession, cartError, orderRpc } from "@/lib/checkout/http";
import { isOrderReference } from "@/lib/checkout/validation";
export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  try {
    if (!await activeCartSession()) return cartError("unauthorized", 401);
    const { reference } = await params;
    return isOrderReference(reference) ? orderRpc("customer_get_checkout_order", { p_reference: reference }) : cartError("not_found", 404);
  } catch { return cartError("backend_unavailable", 503); }
}
