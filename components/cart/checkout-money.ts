import type { CartQuoteLine } from "@/lib/cart/validation";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
export function formatPaise(value: number | null | undefined) { return value == null ? "Unavailable" : money.format(value / 100); }
export function includedDiscount(lines: CartQuoteLine[]) {
  return lines.reduce((sum, line) => {
    const regular = line.variant?.regularPricePaise;
    const current = line.variant?.effectivePricePaise;
    return sum + (regular != null && current != null && regular > current ? (regular - current) * line.quantity : 0);
  }, 0);
}
