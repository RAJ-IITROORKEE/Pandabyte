import { activeCartSession, cartError, cartJson, orderRpc } from "@/lib/checkout/http";

export async function GET(request: Request) {
  const host = new URL(request.url).hostname;
  if (process.env.NODE_ENV !== "development" || process.env.PANDABYTE_COMMERCE_SIMULATION !== "true" || !["localhost", "127.0.0.1", "[::1]"].includes(host) || !process.env.COMMERCE_SIMULATION_KEY) return cartJson({ simulationAvailable: false });
  try {
    if (!await activeCartSession()) return cartError("unauthorized", 401);
    return orderRpc("customer_simulation_capabilities", { p_proof: process.env.COMMERCE_SIMULATION_KEY });
  } catch { return cartError("backend_unavailable", 503); }
}
