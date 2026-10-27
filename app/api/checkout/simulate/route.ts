import { activeCartSession, cartError, orderRpc, readCheckoutBody } from "@/lib/checkout/http";
import { parseSimulationRequest } from "@/lib/checkout/validation";
export async function POST(request: Request) {
  const host = new URL(request.url).hostname;
  const proof = process.env.COMMERCE_SIMULATION_KEY;
  if (process.env.NODE_ENV !== "development" || process.env.PANDABYTE_COMMERCE_SIMULATION !== "true" || !["localhost", "127.0.0.1", "[::1]"].includes(host) || !proof) return cartError("simulation_unavailable", 503);
  try {
    if (!await activeCartSession()) return cartError("unauthorized", 401);
    const body = await readCheckoutBody(request);
    if (body instanceof Response) return body;
    const input = parseSimulationRequest(body.value);
    return input ? orderRpc("customer_simulate_checkout", { p_request: input, p_proof: proof }) : cartError("invalid_input", 400);
  } catch { return cartError("backend_unavailable", 503); }
}
