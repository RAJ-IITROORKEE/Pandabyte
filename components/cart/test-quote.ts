import type { CartInputLine } from "@/lib/cart/validation";

export type TestQuote = { testMode: true; subtotalPaise: number; shippingPaise: number; taxPaise: number; totalPaise: number; taxRateBasisPoints: 1800; chargesAreFictional: true; policyVersion: "local-test-v1" };

export function parseTestQuote(value: unknown, expectedSubtotal: number | null): TestQuote | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const amounts = [v.subtotalPaise, v.shippingPaise, v.taxPaise, v.totalPaise];
  if (!amounts.every(amount => Number.isSafeInteger(amount) && (amount as number) >= 0)) return null;
  if (v.testMode !== true || v.chargesAreFictional !== true || v.taxRateBasisPoints !== 1800 || v.policyVersion !== "local-test-v1" || v.subtotalPaise !== expectedSubtotal || (v.subtotalPaise as number) + (v.shippingPaise as number) + (v.taxPaise as number) !== v.totalPaise) return null;
  return v as TestQuote;
}

export function testQuoteKey(items: CartInputLine[], subtotal: number | null, catalogQuote?: unknown) {
  return JSON.stringify({ items, subtotal, catalogQuote });
}

export async function fetchTestQuote(items: CartInputLine[], subtotal: number | null, signal: AbortSignal): Promise<TestQuote> {
  const response = await fetch("/api/checkout/razorpay-test/quote", { method: "POST", cache: "no-store", signal, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ items }) });
  if (!response.ok) throw new Error("Test quote unavailable");
  const quote = parseTestQuote(await response.json(), subtotal);
  if (!quote) throw new Error("Invalid test quote");
  return quote;
}
