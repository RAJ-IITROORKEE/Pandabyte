import { checkoutOwnerError, cartError, orderRpc, readCheckoutBody } from "@/lib/checkout/http";
import { parseSimulationRecovery } from "@/lib/checkout/validation";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development" || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname)) return cartError("simulation_unavailable", 503);
  try {
    const ownerError = await checkoutOwnerError(request);
    if (ownerError) return ownerError;
    const body = await readCheckoutBody(request);
    if (body instanceof Response) return body;
    const key = parseSimulationRecovery(body.value);
    if (!key) return cartError("invalid_input", 400);
    const proof = process.env.PANDABYTE_COMMERCE_SIMULATION === "true" ? process.env.COMMERCE_SIMULATION_KEY ?? null : null;
    return orderRpc("customer_recover_simulated_checkout", { p_request_key: key, p_proof: proof });
  } catch { return cartError("backend_unavailable", 503); }
}
