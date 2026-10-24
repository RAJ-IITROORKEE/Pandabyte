import { parseCartQuote, parseCartQuoteRequest } from "@/lib/cart/validation";
import { cartError, cartJson, publicCartRpc, readCartBody } from "../http";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readCartBody(request);
    if (body instanceof Response) return body;
    const input = parseCartQuoteRequest(body.value);
    if (!input) return cartError("invalid_cart", 400);
    const result = await publicCartRpc("published_quote_cart", { p_items: input.items });
    if ("response" in result) return result.response;
    const quote = parseCartQuote(result.data);
    return quote ? cartJson(quote) : cartError("backend_unavailable", 503);
  } catch {
    return cartError("backend_unavailable", 503);
  }
}
