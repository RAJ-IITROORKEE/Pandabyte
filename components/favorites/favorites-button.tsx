"use client";

import { Heart } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { getFavoritesServerSnapshot, getFavoritesSnapshot, parseFavorites, subscribeFavorites, toggleFavorite } from "./favorites-store";
import styles from "./favorites.module.css";

export function FavoritesButton({ productId, title, slug, onRemoved }: { productId: string; title: string; slug: string; onRemoved?: (button: HTMLButtonElement) => void }) {
  const raw = useSyncExternalStore(subscribeFavorites, getFavoritesSnapshot, getFavoritesServerSnapshot);
  const saved = parseFavorites(raw)?.some((item) => item.productId === productId) ?? false;
  const [error, setError] = useState(false);
  return <span className={styles.buttonWrap}>
    <button data-favorite-toggle className={styles.button} type="button" aria-pressed={saved} aria-label={`${saved ? "Remove" : "Save"} ${title} ${saved ? "from" : "to"} favorites`} title={saved ? "Saved in this browser" : "Save in this browser"} onClick={event => {
      const button = event.currentTarget;
      const focused = document.activeElement === button;
      const success = toggleFavorite({ productId, title, slug });
      setError(!success);
      if (success && saved && focused) onRemoved?.(button);
    }}>
      <Heart size={19} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
    </button>
    {error && <span role="alert" className={styles.error}>Could not save favorites in this browser.</span>}
  </span>;
}
