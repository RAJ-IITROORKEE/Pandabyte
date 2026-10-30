import { requireCapability } from "@/lib/authorization";
import { cartError, orderRpc } from "@/lib/checkout/http";
import { isOrderReference } from "@/lib/checkout/validation";
import { hasPaidTestBill, parseTestBill } from "@/lib/orders/test-bill";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  try {
    const access = await requireCapability("staff.manage");
    if (!access.allowed) return cartError(access.status === 401 ? "unauthorized" : access.status === 403 ? "forbidden" : "backend_unavailable", access.status);
    const { reference } = await params;
    if (!isOrderReference(reference)) return cartError("not_found", 404);
    const response = await orderRpc("admin_get_checkout_order", { p_reference: reference });
    if (!response.ok) return response;
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || !("environment" in value) || !("paymentState" in value) || typeof value.environment !== "string" || typeof value.paymentState !== "string") return cartError("backend_unavailable", 503);
    if (!hasPaidTestBill({ environment: value.environment, paymentState: value.paymentState })) return cartError("document_unavailable", 409);
    const bill = parseTestBill(value, reference);
    if (!bill) return cartError("backend_unavailable", 503);
    const { renderTestBillPdf } = await import("@/lib/orders/test-bill-pdf");
    const bytes = await renderTestBillPdf(bill);
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="pandabyte-test-bill-${reference}.pdf"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch { return cartError("backend_unavailable", 503); }
}
