"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AdminVariantDto } from "@/lib/admin/validation";
import type { ProductPriceWrite } from "@/lib/admin/product-contract";
import { dateTimeInputFromUtc, dateTimeInputToUtc, parsePriceToPaise, priceInputFromPaise } from "./product-editor-utils";
import styles from "./admin-ui.module.css";
import pricingStyles from "./product-pricing-editor.module.css";

type ApiRequest = <T>(url: string, init?: RequestInit) => Promise<T>;
type ProductVariantInput = { id?: string; sku: string; label: string };
type PriceEdit = { regular: string; sale: string; startsAt: string; endsAt: string; reason: string };
export type ProductPricingState = { writes: ProductPriceWrite[]; dirty: boolean; errors: string[]; ready: boolean };
const EMPTY_ITEMS: AdminVariantDto[] = [];
const EMPTY_EDITS: Record<string, PriceEdit> = {};

function originalEdit(item?: AdminVariantDto): PriceEdit {
  return {
    regular: priceInputFromPaise(item?.regularPaise ?? null),
    sale: priceInputFromPaise(item?.salePaise ?? null),
    startsAt: dateTimeInputFromUtc(item?.saleFrom ?? null),
    endsAt: dateTimeInputFromUtc(item?.saleUntil ?? null),
    reason: "",
  };
}

function sameAmount(value: string, original: number | null) {
  const parsed = value.trim() ? parsePriceToPaise(value) : null;
  return parsed === original && (value.trim() === "" ? original === null : parsed !== null);
}

export function ProductPricingEditor({
  productId,
  variants,
  sourceObservation,
  refreshKey,
  skuEditKeys,
  request,
  onChange,
}: {
  productId: string;
  variants: ProductVariantInput[];
  sourceObservation: boolean;
  refreshKey: number;
  skuEditKeys: Record<string, string>;
  request: ApiRequest;
  onChange: (state: ProductPricingState) => void;
}) {
  const [loadState, setLoadState] = useState<{
    key: string;
    items: AdminVariantDto[];
    error: string;
    sourceObservation: boolean;
  }>({ key: "", items: [], error: "", sourceObservation: false });
  const [editState, setEditState] = useState<{ key: string; values: Record<string, PriceEdit> }>({ key: "", values: {} });
  const [retry, setRetry] = useState(0);
  const lastSent = useRef("");
  const requestKey = `${productId}:${refreshKey}:${retry}`;
  const editContextKey = `${productId}:${refreshKey}`;
  const loadMatches = loadState.key === requestKey;
  const items = loadMatches ? loadState.items : EMPTY_ITEMS;
  const loadError = loadMatches ? loadState.error : "";
  const loading = productId !== "new" && !loadMatches;
  const edits = editState.key === editContextKey ? editState.values : EMPTY_EDITS;

  useEffect(() => {
    if (productId === "new") return;
    let active = true;
    void request<{ items: AdminVariantDto[]; sourceObservation: boolean }>(`/api/admin/products/${encodeURIComponent(productId)}/pricing`)
      .then((result) => {
        if (!active) return;
        setLoadState({ key: requestKey, items: result.items, error: "", sourceObservation: result.sourceObservation });
      })
      .catch((reason: unknown) => {
        if (active) setLoadState({ key: requestKey, items: [], error: reason instanceof Error ? reason.message : "Price settings could not be loaded.", sourceObservation: false });
      });
    return () => { active = false; };
  }, [productId, request, requestKey]);

  const isObservation = sourceObservation || (loadMatches && loadState.sourceObservation);
  const state = useMemo<ProductPricingState>(() => {
    const writes: ProductPriceWrite[] = [];
    const errors: string[] = [];
    let dirty = false;
    const ready = productId === "new" || (loadMatches && !loadError);
    if (isObservation || !ready) return { writes, dirty, errors, ready };
    for (const variant of variants) {
      if (!variant.sku.trim()) continue;
      const base = items.find((item) => variant.id ? item.id === variant.id : item.sku === variant.sku);
      const editKey = skuEditKeys[variant.sku] ?? variant.sku;
      const edit = edits[editKey] ?? originalEdit(base);
      const regularChanged = !sameAmount(edit.regular, base?.regularPaise ?? null);
      const saleChanged = !sameAmount(edit.sale, base?.salePaise ?? null);
      const original = originalEdit(base);
      const startsAt = edit.startsAt === original.startsAt ? base?.saleFrom ?? null : dateTimeInputToUtc(edit.startsAt);
      const endsAt = edit.endsAt === original.endsAt ? base?.saleUntil ?? null : dateTimeInputToUtc(edit.endsAt);
      const startChanged = startsAt !== (base?.saleFrom ?? null);
      const endChanged = endsAt !== (base?.saleUntil ?? null);
      const changed = regularChanged || saleChanged || startChanged || endChanged;
      if (!changed) continue;
      dirty = true;

      const regularPricePaise = edit.regular.trim() ? parsePriceToPaise(edit.regular) : null;
      const salePricePaise = edit.sale.trim() ? parsePriceToPaise(edit.sale) : null;
      if (regularPricePaise === null) {
        errors.push(`${variant.sku}: enter a valid regular price in INR.`);
        continue;
      }
      if (edit.sale.trim() && salePricePaise === null) {
        errors.push(`${variant.sku}: enter a sale price with at most two decimal places.`);
        continue;
      }
      if (salePricePaise !== null) {
        if (salePricePaise > regularPricePaise) {
          errors.push(`${variant.sku}: the sale price cannot exceed the regular price.`);
          continue;
        }
        if (!startsAt || !endsAt || startsAt >= endsAt) {
          errors.push(`${variant.sku}: set valid sale start and end times in order.`);
          continue;
        }
      } else if (edit.startsAt || edit.endsAt) {
        errors.push(`${variant.sku}: clear sale dates when no sale price is set.`);
        continue;
      }
      if (!edit.reason.trim()) {
        errors.push(`${variant.sku}: enter a reason for the price change.`);
        continue;
      }
      writes.push({
        sku: variant.sku,
        expectedPriceVersion: base?.priceVersion ?? 0,
        regularPricePaise,
        salePricePaise,
        saleStartsAt: startsAt,
        saleEndsAt: endsAt,
        reason: edit.reason.trim(),
      });
    }
    return { writes, dirty, errors, ready };
  }, [edits, isObservation, items, loadError, loadMatches, productId, skuEditKeys, variants]);

  const stateJson = JSON.stringify(state);
  useEffect(() => {
    if (lastSent.current === stateJson) return;
    lastSent.current = stateJson;
    onChange(state);
  }, [onChange, state, stateJson]);

  function edit(sku: string, key: keyof PriceEdit, value: string) {
    const variant = variants.find((item) => item.sku === sku);
    const base = items.find((item) => variant?.id ? item.id === variant.id : item.sku === sku);
    const editKey = skuEditKeys[sku] ?? sku;
    setEditState((current) => {
      const currentEdits = current.key === editContextKey ? current.values : {};
      return { key: editContextKey, values: { ...currentEdits, [editKey]: { ...(currentEdits[editKey] ?? originalEdit(base)), [key]: value } } };
    });
  }

  return <section className={styles.panel} aria-label="Product prices">
    <div className={styles.sectionHeading}><div><h2>Prices</h2><p>Set prices per product variant. Changes save with the product draft.</p></div></div>
    {isObservation ? <p className={styles.fieldHint} role="status">This product is a non-purchasable source observation. Operational prices are hidden and cannot be changed.</p> :
      loading ? <p className={styles.fieldHint} role="status">Loading variant prices…</p> :
        loadError ? <div className={styles.errorBanner} role="alert"><p>{loadError}</p><button className={styles.secondaryButton} onClick={() => setRetry((value) => value + 1)} type="button">Retry</button></div> :
          !variants.some(({ sku }) => Boolean(sku.trim())) ? <p className={styles.fieldHint}>Add a variant with a SKU above before setting a price.</p> :
            <div className={pricingStyles.priceRows}>
              {variants.filter(({ sku }) => Boolean(sku.trim())).map((variant, index) => {
                const base = items.find((item) => variant.id ? item.id === variant.id : item.sku === variant.sku);
                const current = edits[skuEditKeys[variant.sku] ?? variant.sku] ?? originalEdit(base);
                return <fieldset className={pricingStyles.priceRow} key={`${variant.sku}-${index}`}>
                  <legend>{variant.label || "Default variant"} · <code>{variant.sku}</code></legend>
                  <label className={styles.field}><span className={styles.fieldLabel}>Regular price (₹)</span><input aria-label={`${variant.sku} regular price in rupees`} className={styles.input} inputMode="decimal" maxLength={14} onChange={(event) => edit(variant.sku, "regular", event.target.value)} placeholder="Not set" value={current.regular} /></label>
                  <label className={styles.field}><span className={styles.fieldLabel}>Sale price (₹), optional</span><input aria-label={`${variant.sku} sale price in rupees`} className={styles.input} inputMode="decimal" maxLength={14} onChange={(event) => edit(variant.sku, "sale", event.target.value)} placeholder="No sale" value={current.sale} /></label>
                  <label className={styles.field}><span className={styles.fieldLabel}>Sale starts</span><input aria-label={`${variant.sku} sale start time`} className={styles.input} onInput={(event) => edit(variant.sku, "startsAt", event.currentTarget.value)} onChange={(event) => edit(variant.sku, "startsAt", event.target.value)} type="datetime-local" value={current.startsAt} /></label>
                  <label className={styles.field}><span className={styles.fieldLabel}>Sale ends</span><input aria-label={`${variant.sku} sale end time`} className={styles.input} onInput={(event) => edit(variant.sku, "endsAt", event.currentTarget.value)} onChange={(event) => edit(variant.sku, "endsAt", event.target.value)} type="datetime-local" value={current.endsAt} /></label>
                  <label className={styles.field}><span className={styles.fieldLabel}>Reason for change</span><input aria-label={`${variant.sku} price change reason`} className={styles.input} maxLength={500} onChange={(event) => edit(variant.sku, "reason", event.target.value)} value={current.reason} /></label>
                </fieldset>;
              })}
            </div>}
    {state.errors.length > 0 && !isObservation && <div className={styles.inlineError} role="alert"><ul>{state.errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
    {!isObservation && state.dirty && !state.errors.length && <p className={styles.fieldHint} role="status">Price updates are ready and will be saved atomically with the product draft.</p>}
  </section>;
}
