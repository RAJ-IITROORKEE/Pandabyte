"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { parsePublicVariant, type PublicVariant } from "@/lib/editorial/public-record";
import { cardImageIds } from "@/components/catalog/card-image-selection";
import { FavoritesButton } from "./favorites-button";
import { getFavoritesServerSnapshot, getFavoritesSnapshot, parseFavorites, subscribeFavorites, type Favorite } from "./favorites-store";
import styles from "./favorites.module.css";

export function FavoritesList() {
  const raw = useSyncExternalStore(subscribeFavorites, getFavoritesSnapshot, getFavoritesServerSnapshot);
  const items = parseFavorites(raw);
  const section = useRef<HTMLElement>(null);
  const removed = useRef<{ index: number; button: HTMLButtonElement } | null>(null);
  useEffect(() => {
    const pending = removed.current;
    removed.current = null;
    if (!pending || (document.activeElement !== document.body && document.activeElement !== pending.button)) return;
    const buttons = section.current?.querySelectorAll<HTMLButtonElement>("[data-favorite-toggle]");
    (buttons?.[Math.min(pending.index, buttons.length - 1)] ?? section.current)?.focus();
  }, [raw]);
  if (!items) return <p role="alert">Favorites could not be read from this browser.</p>;
  return <section ref={section} tabIndex={-1} className={styles.region} aria-label="Saved favorites"><p>Favorites are saved only in this browser.</p>{items.length ? <ul className={styles.list}>{items.map((item, index) => <FavoriteItem key={item.productId} item={item} onRemoved={button => { removed.current = { index, button }; }} />)}</ul> : <p>No favorites saved yet. Browse the catalog and select a heart to save one.</p>}</section>;
}

function FavoriteItem({ item, onRemoved }: { item: Favorite; onRemoved: (button: HTMLButtonElement) => void }) {
  const [result, setResult] = useState<{ title: string; slug: string; image?: string; variants: PublicVariant[] } | "unavailable" | "error" | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/published/products/${encodeURIComponent(item.slug)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) return "unavailable" as const;
        if (!response.ok) return "error" as const;
        const { record } = await response.json();
        if (record?.id !== item.productId || typeof record.title !== "string" || typeof record.slug !== "string" || !Array.isArray(record.document?.mediaIds) || !Array.isArray(record.variants) || record.variants.length > 100) return "unavailable" as const;
        const ids = record.document.mediaIds.filter((id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id));
        const variants = record.variants.map((variant: unknown) => ({ ...parsePublicVariant(variant), purchasable: !record.document.sourceObservation }));
        return { title: record.title as string, slug: record.slug as string, image: cardImageIds(item.productId, ids)[0], variants };
      }).then((value) => { if (!controller.signal.aborted) setResult(value); }).catch(() => { if (!controller.signal.aborted) setResult("error"); });
    return () => controller.abort();
  }, [item.productId, item.slug]);
  return <li className={styles.item}>
    {result && typeof result === "object" && result.image && <Image src={`/api/media/${encodeURIComponent(result.image)}?w=96`} alt="" width={96} height={96} unoptimized />}
    <div>{result && typeof result === "object" ? <Link href={`/products/${encodeURIComponent(result.slug)}`}>{result.title}</Link> : <strong>{item.title}</strong>}
      {result === null && <p>Loading current product…</p>}{result === "unavailable" && <p>This product is no longer available in the published catalog.</p>}{result === "error" && <p>Current product details could not be loaded.</p>}
    </div>
    {result && typeof result === "object" && (result.variants.length === 1 ? (() => {
      const variant = result.variants[0];
      const eligible = variant.cartEligible === true || (variant.purchasable !== false && variant.availability === "available" && variant.effectivePricePaise !== null);
      return eligible ? <AddToCartButton variantId={variant.id} available compactLabel={result.title} /> : null;
    })() : result.variants.length > 1 ? <Link href={`/products/${encodeURIComponent(result.slug)}`}>Choose options</Link> : null)}
    <FavoritesButton {...item} onRemoved={onRemoved} />
  </li>;
}
