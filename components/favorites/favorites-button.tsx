"use client";

import { Heart } from "lucide-react";
import { useState } from "react";
import { useFavorites } from "./use-favorites";
import styles from "./favorites.module.css";

export function FavoritesButton({ productId, title, slug, onRemoved }: { productId: string; title: string; slug: string; onRemoved?: (button: HTMLButtonElement) => void }) {
  const { items, account, loading, toggle } = useFavorites();
  const saved = items?.some((item) => item.productId === productId) ?? false;
  const [error, setError] = useState(false);
  return <span className={styles.buttonWrap}>
    <button data-favorite-toggle className={styles.button} type="button" disabled={loading || !items} aria-pressed={saved} aria-label={`${saved ? "Remove" : "Save"} ${title} ${saved ? "from" : "to"} favorites`} title={saved ? (account ? "Saved to your account" : "Saved in this browser") : "Save to favorites"} onClick={async event => {
      const button = event.currentTarget;
      const focused = document.activeElement === button;
      const success = await toggle({ productId, title, slug });
      setError(!success);
      if (success && saved && focused) onRemoved?.(button);
    }}>
      <Heart size={19} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
    </button>
    {error && <span role="alert" className={styles.error}>Could not save favorites. Please try again.</span>}
  </span>;
}
