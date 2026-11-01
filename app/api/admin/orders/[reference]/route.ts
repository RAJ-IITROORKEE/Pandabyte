import { requireOrderPermission } from "@/lib/authorization";
import { cartError, orderRpc, readCheckoutBody } from "@/lib/checkout/http";
import { isOrderReference, parseAdminOrderUpdate } from "@/lib/checkout/validation";
type Context = { params: Promise<{ reference: string }> };
async function access(action: "read" | "update") { const result = await requireOrderPermission(action); return result.allowed ? null : cartError(result.status === 401 ? "unauthorized" : result.status === 403 ? "forbidden" : "backend_unavailable", result.status); }
export async function GET(_request: Request, { params }: Context) {
  try { const denied = await access("read"); if (denied) return denied; const { reference } = await params; return isOrderReference(reference) ? orderRpc("admin_get_checkout_order", { p_reference: reference }) : cartError("not_found", 404); } catch { return cartError("backend_unavailable", 503); }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    const denied = await access("update"); if (denied) return denied;
    const { reference } = await params; if (!isOrderReference(reference)) return cartError("not_found", 404);
    const body = await readCheckoutBody(request); if (body instanceof Response) return body;
    const input = parseAdminOrderUpdate(body.value);
    return input ? orderRpc("admin_update_checkout_order", { p_reference: reference, p_expected_version: input.expectedVersion, p_status: input.status, p_shipping: input.shipping }) : cartError("invalid_input", 400);
  } catch { return cartError("backend_unavailable", 503); }
}
