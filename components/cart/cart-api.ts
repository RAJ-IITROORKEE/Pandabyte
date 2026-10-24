import {
  parseCartQuote,
  parseCustomerCart,
  type CartInputLine,
  type CartQuote,
  type CustomerCart,
} from "@/lib/cart/validation";

export class CartRequestError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = "CartRequestError";
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function checkedJson(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = object(body) && object(body.error) ? body.error : null;
    const code = error && typeof error.code === "string" ? error.code : "request_failed";
    throw new CartRequestError(response.status, code);
  }
  return body;
}

export async function loadCustomerCart(signal?: AbortSignal): Promise<CustomerCart> {
  const response = await fetch("/api/cart", { method: "GET", cache: "no-store", credentials: "same-origin", signal, headers: { Accept: "application/json" } });
  const cart = parseCustomerCart(await checkedJson(response));
  if (!cart) throw new CartRequestError(response.status, "invalid_response");
  return cart;
}

export async function replaceCustomerCart(expectedVersion: number, items: CartInputLine[], signal?: AbortSignal): Promise<CustomerCart> {
  const response = await fetch("/api/cart", {
    method: "PUT",
    cache: "no-store",
    credentials: "same-origin",
    signal,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ expectedVersion, items }),
  });
  const cart = parseCustomerCart(await checkedJson(response));
  if (!cart) throw new CartRequestError(response.status, "invalid_response");
  return cart;
}

export async function quoteCart(items: CartInputLine[], signal?: AbortSignal): Promise<CartQuote> {
  const response = await fetch("/api/cart/quote", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    signal,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  const quote = parseCartQuote(await checkedJson(response));
  if (!quote) throw new CartRequestError(response.status, "invalid_response");
  return quote;
}

export function cartErrorMessage(error: unknown, operation: "read" | "update" | "quote" = "read") {
  if (error instanceof CartRequestError) {
    if (error.status === 401) return "Your sign-in session changed. Sign in again to view your saved cart.";
    if (error.status === 409 && error.code === "conflict") return "Your cart changed in another tab or device. Reload it to review the latest version before making another change.";
    if (error.status === 409 && error.code === "item_unavailable") return "One or more items are no longer available. Reload the cart to review them.";
    if (error.status === 503 || error.status >= 500) return operation === "quote"
      ? "Current catalog prices could not be checked. Your cart is kept; try refreshing the prices shortly."
      : "The cart service is temporarily unavailable. Your current cart has been kept.";
    if (error.code === "invalid_response") return "The cart service returned data we could not verify. Reload before trying again.";
  }
  return operation === "quote"
    ? "Current prices could not be refreshed. Your cart is kept; try again shortly."
    : "We could not confirm the cart update. Reload the cart to check its current state before trying again.";
}
