"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CartInputLine } from "@/lib/cart/validation";
import { cartErrorMessage, loadCustomerCart, replaceCustomerCart } from "./cart-api";
import { addCartItem, removeCartItem, setCartItemQuantity } from "./cart-utils";
import { setBuyNowSelection } from "./buy-now-store";
import { getGuestCartServerSnapshot, getGuestCartSnapshot, saveGuestCart, subscribeGuestCart } from "./guest-cart-store";
import { getCustomerCartServerSnapshot, getCustomerCartSnapshot, prepareCustomerCart, publishCustomerCart, subscribeCustomerCart } from "./customer-cart-store";
import styles from "./cart.module.css";

export function AddToCartButton({ variantId, available, quantity = 1, showBuyNow = false, compactLabel }: { variantId: string; available: boolean; quantity?: number; showBuyNow?: boolean; compactLabel?: string }) {
  const { user, isLoaded } = useUser();
  if (!isLoaded) return <button className={compactLabel ? styles.compactButton : styles.addButton} type="button" disabled aria-label="Loading account">{compactLabel ? <ShoppingCart aria-hidden="true" size={19} /> : "Loading account…"}</button>;
  const userId = user?.id ?? null;
  return <AddToCartButtonSession key={userId ?? "guest"} variantId={variantId} available={available} quantity={quantity} userId={userId} showBuyNow={showBuyNow} compactLabel={compactLabel} />;
}

function AddToCartButtonSession({ variantId, available, quantity, userId, showBuyNow, compactLabel }: { variantId: string; available: boolean; quantity: number; userId: string | null; showBuyNow: boolean; compactLabel?: string }) {
  const router = useRouter();
  const guest = useSyncExternalStore(subscribeGuestCart, getGuestCartSnapshot, getGuestCartServerSnapshot);
  const customer = useSyncExternalStore(subscribeCustomerCart, getCustomerCartSnapshot, getCustomerCartServerSnapshot);
  useEffect(() => { if (userId && compactLabel) prepareCustomerCart(userId); }, [userId, compactLabel]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const activeController = useRef<AbortController | null>(null);
  const compactAddRef = useRef<HTMLButtonElement>(null);
  const removalStatusRef = useRef<HTMLSpanElement>(null);
  const focusAfterRemoval = useRef(false);

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
      const updated = await replaceCustomerCart(cart.version, nextItems, controller.signal);
      publishCustomerCart(userId!, updated);
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

  const handleAdd = (checkout = false) => {
    if (checkout) {
      if (!available || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return;
      if (!setBuyNowSelection([{ variantId, quantity }])) {
        setError("This browser could not save your checkout selection. Enable session storage and try again.");
        return;
      }
      router.push("/checkout?mode=buy-now");
      return;
    }
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

  const currentItems = userId ? (customer.userId === userId ? customer.cart?.items : undefined) : guest.items;
  const currentQuantity = currentItems?.find(item => item.variantId === variantId)?.quantity ?? 0;
  useEffect(() => {
    if (focusAfterRemoval.current && currentQuantity === 0 && !busy) {
      const target = compactAddRef.current;
      if (target && !target.disabled) target.focus();
      else removalStatusRef.current?.focus();
      focusAfterRemoval.current = false;
    }
  }, [currentQuantity, busy]);
  const changeCompactQuantity = async (delta: number) => {
    if (!currentItems || busy || needsReview) return;
    setError("");
    setMessage("");
    setAdded(false);
    const nextQuantity = currentQuantity + delta;
    const nextItems = nextQuantity === 0 ? removeCartItem(currentItems, variantId) : setCartItemQuantity(currentItems, variantId, nextQuantity);
    if (!nextItems) return;
    if (!userId) {
      focusAfterRemoval.current = nextQuantity === 0;
      const result = saveGuestCart(nextItems, { items: currentItems, revision: guest.revision });
      if (result.reason) { focusAfterRemoval.current = false; setError("Your guest cart changed or could not be verified. Open the cart to review it."); }
      else if (!result.persisted) setMessage("Updated for this page session. Browser storage is unavailable, so this cart may not persist.");
      return;
    }
    const cart = customer.userId === userId ? customer.cart : null;
    if (!cart) return;
    const controller = new AbortController();
    activeController.current = controller;
    setBusy(true);
    try {
      const updated = await replaceCustomerCart(cart.version, nextItems, controller.signal);
      if (!controller.signal.aborted) { focusAfterRemoval.current = nextQuantity === 0; publishCustomerCart(userId, updated); }
    } catch (requestError) {
      if (!controller.signal.aborted) { setError(cartErrorMessage(requestError, "update")); setNeedsReview(true); }
    } finally {
      if (activeController.current === controller) activeController.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= 99;
  const disabled = !available || !validQuantity || busy || needsReview || (!userId && (!guest.ready || guest.invalidStoredCart));
  const initialNotice = !userId && guest.invalidStoredCart
    ? "Open your cart to review the unreadable saved guest copy before adding an item."
    : !userId && !guest.ready
      ? "Preparing your guest cart…"
      : "";
  const buttonText = busy ? "Adding…" : needsReview ? "Review cart before retrying" : initialNotice ? "Cart needs attention" : available ? "Add to cart" : "Currently unavailable";
  const compactUnavailable = !!compactLabel && !!userId && (customer.userId !== userId || !customer.cart);
  return <div className={compactLabel ? styles.compactCart : styles.addToCart}>
    {compactLabel && currentQuantity > 0 ? <div className={styles.compactSelected}><div className={styles.compactQuantity} aria-label={`Cart quantity for ${compactLabel}`}>
      <button type="button" onClick={() => void changeCompactQuantity(-1)} disabled={busy || needsReview} aria-label={`Remove one ${compactLabel} from cart`}><Minus size={16} aria-hidden="true" /></button>
      <span aria-live="polite">{currentQuantity}</span>
      <button type="button" onClick={() => void changeCompactQuantity(1)} disabled={busy || needsReview || !available || currentQuantity >= 99} aria-label={`Add one ${compactLabel} to cart`}><Plus size={16} aria-hidden="true" /></button>
    </div><Link className={`${styles.compactButton} ${styles.compactActive}`} href="/cart" aria-label={`View cart: ${compactLabel}, quantity ${currentQuantity}`} title="View cart"><ShoppingCart aria-hidden="true" size={19} /></Link></div> : <button ref={compactLabel ? compactAddRef : undefined} className={compactLabel ? styles.compactButton : styles.addButton} type="button" onClick={() => handleAdd()} disabled={disabled || compactUnavailable} aria-label={compactLabel ? `${buttonText}: ${compactLabel}` : undefined} title={compactLabel ? buttonText : undefined}>
      <ShoppingCart aria-hidden="true" size={18} /> {buttonText}
    </button>}
    {compactLabel && currentQuantity === 0 && <span ref={removalStatusRef} tabIndex={-1} className={styles.srOnly}>Cart quantity is zero for {compactLabel}. {available ? "Use Add to cart to select this product." : "This product is currently unavailable."}</span>}
    {compactUnavailable && customer.error && <p className={styles.addError} role="alert">Could not load your cart. <Link href="/cart">Open cart to review</Link></p>}
    {showBuyNow && <button className={styles.buyButton} type="button" onClick={() => handleAdd(true)} disabled={!available || !validQuantity || busy}>Buy now</button>}
    {error && <p className={styles.addError} role="alert">{error}</p>}
    {initialNotice && <p className={styles.addMessage} role="status">{initialNotice}</p>}
    {message && <p className={styles.addMessage} role="status" aria-live="polite">{message}</p>}
    {added && <Link className={styles.viewCartLink} href="/cart">View cart</Link>}
    {(error || needsReview) && !added && <Link className={styles.viewCartLink} href="/cart">Open cart to review</Link>}
  </div>;
}
