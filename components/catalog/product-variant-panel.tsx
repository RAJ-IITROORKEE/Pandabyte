"use client";

import { useId, useState } from "react";
import type { PublicVariant } from "@/lib/editorial/published";
import type { SourceObservation } from "@/lib/admin/validation";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import styles from "./catalog.module.css";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export function ProductVariantPanel({ variants, observation }: { variants: PublicVariant[]; observation?: SourceObservation }) {
  const fieldId = useId();
  const [selectedId, setSelectedId] = useState(variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const quantityValue = Number(quantity);
  const validQuantity = Number.isInteger(quantityValue) && quantityValue >= 1 && quantityValue <= 99;
  const selected = variants.find((variant) => variant.id === selectedId) ?? variants[0];

  if (observation || variants.some(variant => variant.purchasable === false)) return <section className={styles.productPanel} aria-label="Archived source item">
    {selected && <div className={styles.productMeta}><span>{selected.sku}</span></div>}
    {observation && <div className={styles.sourceObservation}>
      <h2 className={styles.sourceObservationLabel}>Source observation · not a current offer</h2>
      <p className={styles.currentPrice}>{observation.priceText || "No source price recorded"}</p>
      <p className={styles.purchaseNotice}><time dateTime={observation.capturedAt}>{observation.capturedAt.slice(0, 10)}</time> · Archive capture time; not independently verified.</p>
      <a href={observation.sourceUrl} rel="noopener noreferrer">View original source listing</a>
    </div>}
    <p className={styles.purchaseNotice}>Archived source information. Current price and availability are not configured; purchasing is disabled.</p>
  </section>;

  return <section className={styles.productPanel} aria-label="Variant and price">
    {selected && <div className={styles.productMeta}><span>{selected.sku}</span></div>}

    {variants.length > 1 && <div className={styles.variantField}>
      <label className={styles.fieldLabel} htmlFor={`${fieldId}-variant`}>Choose a variant</label>
      <select
        className={styles.select}
        id={`${fieldId}-variant`}
        value={selected?.id ?? ""}
        onChange={(event) => setSelectedId(event.currentTarget.value)}
      >
        {variants.map((variant) => <option key={variant.id} value={variant.id}>
          {variant.label} · {variant.sku}
        </option>)}
      </select>
    </div>}

    {selected ? <div className={styles.selectedPrice} aria-live="polite">
      <span className={styles.currentPrice}>
        {selected.effectivePricePaise === null ? "Price unavailable" : money.format(selected.effectivePricePaise / 100)}
      </span>
      {selected.isOnSale && selected.regularPricePaise !== null && <del className={styles.regularPrice}>
        {money.format(selected.regularPricePaise / 100)}
      </del>}
    </div> : <p className={styles.availabilityLine}>Variant and pricing details have not been published.</p>}

    {selected && <p className={styles.availabilityLine}>
      {selected.availability === "available" ? "Currently available" : "Currently unavailable"}
    </p>}
    {selected && selected.purchasable !== false && <>
      <div className={styles.variantField}>
        <label className={styles.fieldLabel} htmlFor={`${fieldId}-quantity`}>Quantity</label>
        <input className={styles.input} id={`${fieldId}-quantity`} type="number" min={1} max={99} step={1} inputMode="numeric" value={quantity} onChange={event => setQuantity(event.currentTarget.value)} aria-invalid={!validQuantity} aria-describedby={!validQuantity ? `${fieldId}-quantity-error` : undefined} />
        {!validQuantity && <p id={`${fieldId}-quantity-error`} role="alert">Enter a whole number from 1 to 99.</p>}
      </div>
      <AddToCartButton variantId={selected.id} quantity={quantityValue} available={selected.availability === "available" && selected.effectivePricePaise !== null} showBuyNow />
    </>}
    <p className={styles.purchaseNotice}>
      Cart totals use current catalog prices. Shipping, GST, final availability checks, and order placement are not configured yet.
    </p>
  </section>;
}
