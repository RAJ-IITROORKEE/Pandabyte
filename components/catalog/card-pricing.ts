import type { PublicVariant } from "../../lib/editorial/public-record.ts";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export function cardPricing(variants: PublicVariant[], sourcePriceText?: string) {
  const unverified = sourcePriceText !== undefined || variants.some((variant) => variant.purchasable === false);
  const priced = variants.length > 0 && variants.every((variant) => variant.effectivePricePaise !== null && (!unverified || variant.cartEligible === true));
  const prices = variants.map((variant) => variant.effectivePricePaise as number);
  const sourcePrice = unverified && !priced && !!sourcePriceText?.trim();
  const price = priced ? `${Math.min(...prices) !== Math.max(...prices) ? "From " : ""}${money.format(Math.min(...prices) / 100)}` :
    sourcePriceText?.trim() || "Price unavailable";
  const availability = unverified ? "Availability unverified" : !variants.length ? "Availability unavailable" :
    variants.some((variant) => variant.availability === "available") ? "Available" : "Unavailable";
  const variant = variants.length === 1 && priced ? variants[0] : null;
  const originalPrice = variant && variant.isOnSale && variant.effectivePricePaise !== null && variant.regularPricePaise !== null && variant.effectivePricePaise < variant.regularPricePaise ? money.format(variant.regularPricePaise / 100) : null;
  return { price, availability, originalPrice, sourcePrice };
}
