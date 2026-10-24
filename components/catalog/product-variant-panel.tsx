"use client";

import { useState } from "react";
import type { PublicVariant } from "@/lib/editorial/published";
import styles from "./catalog.module.css";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export function ProductVariantPanel({ variants }: { variants: PublicVariant[] }) {
  const [selectedId, setSelectedId] = useState(variants[0]?.id ?? "");
  const selected = variants.find((variant) => variant.id === selectedId) ?? variants[0];

  return <section className={styles.productPanel} aria-label="Variant and price">
    {selected && <div className={styles.productMeta}><span>{selected.sku}</span></div>}

    {variants.length > 1 && <div className={styles.variantField}>
      <label className={styles.fieldLabel} htmlFor="product-variant">Choose a variant</label>
      <select
        className={styles.select}
        id="product-variant"
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
    <p className={styles.purchaseNotice}>
      Purchasing is not available in this development preview.
    </p>
  </section>;
}
