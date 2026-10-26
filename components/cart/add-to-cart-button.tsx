"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CartInputLine } from "@/lib/cart/validation";
import { cartErrorMessage, loadCustomerCart, replaceCustomerCart } from "./cart-api";
import { addCartItem } from "./cart-utils";
import { getGuestCartServerSnapshot, getGuestCartSnapshot, saveGuestCart, subscribeGuestCart } from "./guest-cart-store";
import styles from "./cart.module.css";

export function AddToCartButton({ variantId, available, quantity = 1 }: { variantId: string; available: boolean; quantity?: number }) {
  const { user, isLoaded } = useUser();
  if (!isLoaded) return <button className={styles.addButton} type="button" disabled>Loading account…</button>;
  const userId = user?.id ?? null;
  return <AddToCartButtonSession key={userId ?? "guest"} variantId={variantId} available={available} quantity={quantity} userId={userId} />;
}

function AddToCartButtonSession({ variantId, available, quantity, userId }: { variantId: string; available: boolean; quantity: number; userId: string | null }) {
  const guest = useSyncExternalStore(subscribeGuestCart, getGuestCartSnapshot, getGuestCartServerSnapshot);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const activeController = useRef<AbortController | null>(null);

  useEffect(() => () => activeController.current?.abort(), []);

  const addGuestLine = (items: CartInputLine[]) => {
    if (guest.invalidStoredCart) {
      setError("Your saved guest cart needs review. Open the cart and clear its unreadable saved copy before adding items.");
      return;
    }
    const nextItems = addCartItem(items, variantId, quantity);
    if (!nextItems) {
      const existing = items.find((item) => item.variantId === variantId);
      setError(existing ? "This quantity would exceed the maximum of 99 per item." : "A cart can contain at most 50 different items.");
      return;
    }
    const result = saveGuestCart(nextItems, { items, revision: guest.revision });
    if (result.reason) {
      setError(result.reason === "changed"
        ? "Your guest cart changed in another tab. Open the cart to review the latest copy before adding items."
        : result.reason === "invalid"
          ? "Your saved guest cart needs review. Open the cart and clear its unreadable saved copy before adding items."
          : "This browser could not verify the saved guest cart. Open the cart to review it before adding items.");
      return;
    }
    setAdded(true);
    setMessage(result.persisted ? "Added to your cart." : "Added for this page session. Browser storage is unavailable, so this cart may not persist after you leave.");
  };

  const addSignedInLine = async () => {
    const controller = new AbortController();
    activeController.current = controller;
    let updateAttempted = false;
    try {
      const cart = await loadCustomerCart(controller.signal);
      const nextItems = addCartItem(cart.items, variantId, quantity);
      if (!nextItems) {
        const existing = cart.items.find((item) => item.variantId === variantId);
        setError(existing ? "This quantity would exceed the maximum of 99 per item." : "A cart can contain at most 50 different items.");
        return;
      }
      updateAttempted = true;
      await replaceCustomerCart(cart.version, nextItems, controller.signal);
      if (!controller.signal.aborted) {
        setAdded(true);
        setMessage("Added to your signed-in cart. Current catalog pricing and availability are shown there.");
      }
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setError(cartErrorMessage(requestError, "update"));
        if (updateAttempted) setNeedsReview(true);
      }
    } finally {
      if (activeController.current === controller) activeController.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const handleAdd = () => {
    if (needsReview) return;
    setError("");
    setMessage("");
    setAdded(false);
    if (!userId) {
      if (!guest.ready) {
        setError("Your cart is still loading. Please try again in a moment.");
        return;
      }
      addGuestLine(guest.items);
      return;
    }
    setBusy(true);
    void addSignedInLine();
  };

  const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= 99;
  const disabled = !available || !validQuantity || busy || needsReview || (!userId && (!guest.ready || guest.invalidStoredCart));
  const initialNotice = !userId && guest.invalidStoredCart
    ? "Open your cart to review the unreadable saved guest copy before adding an item."
    : !userId && !guest.ready
      ? "Preparing your guest cart…"
      : "";
  return <div className={styles.addToCart}>
    <button className={styles.addButton} type="button" onClick={handleAdd} disabled={disabled}>
      {busy ? "Adding…" : needsReview ? "Review cart before retrying" : initialNotice ? "Cart needs attention" : available ? "Add to cart" : "Currently unavailable"}
    </button>
    {error && <p className={styles.addError} role="alert">{error}</p>}
    {initialNotice && <p className={styles.addMessage} role="status">{initialNotice}</p>}
    {message && <p className={styles.addMessage} role="status" aria-live="polite">{message}</p>}
    {added && <Link className={styles.viewCartLink} href="/cart">View cart</Link>}
    {(error || needsReview) && !added && <Link className={styles.viewCartLink} href="/cart">Open cart to review</Link>}
  </div>;
}
