import type { PublicVariant } from "../../lib/editorial/public-record.ts";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export function cardPricing(variants: PublicVariant[], sourcePriceText?: string) {
  const unverified = sourcePriceText !== undefined || variants.some((variant) => variant.purchasable === false);
  const prices = variants.map((variant) => variant.effectivePricePaise);
  const sourcePrice = !!sourcePriceText?.trim();
  const price = sourcePrice ? sourcePriceText!.trim() : unverified || !prices.length || prices.some((value) => value === null) ? "Price unavailable" :
    `${Math.min(...prices as number[]) !== Math.max(...prices as number[]) ? "From " : ""}${money.format(Math.min(...prices as number[]) / 100)}`;
  const availability = unverified || !variants.length ? "Availability unavailable" :
    variants.some((variant) => variant.availability === "available") ? "Available" : "Unavailable";
  const variant = variants.length === 1 && !unverified ? variants[0] : null;
  const originalPrice = variant && variant.isOnSale && variant.effectivePricePaise !== null && variant.regularPricePaise !== null && variant.effectivePricePaise < variant.regularPricePaise ? money.format(variant.regularPricePaise / 100) : null;
  return { price, availability, originalPrice, sourcePrice };
}
