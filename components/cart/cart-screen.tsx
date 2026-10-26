"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { CartInputLine, CartQuote, CartQuoteLine, CustomerCart } from "@/lib/cart/validation";
import { cartErrorMessage, loadCustomerCart, quoteCart, replaceCustomerCart } from "./cart-api";
import { mergeGuestCart, removeCartItem, setCartItemQuantity } from "./cart-utils";
import {
  clearGuestCartAfterMerge,
  discardUnreadableGuestCart,
  getGuestCartServerSnapshot,
  getGuestCartSnapshot,
  saveGuestCart,
  subscribeGuestCart,
} from "./guest-cart-store";
import styles from "./cart.module.css";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

type CartView =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: CartInputLine[]; quote: CartQuote; version: number | null; guestRevision: number | null };

function viewOfCustomerCart(cart: CustomerCart): CartView {
  return { status: "ready", items: cart.items, quote: cart.quote, version: cart.version, guestRevision: null };
}

function formatPaise(value: number | null) {
  return value === null ? "Price unavailable" : money.format(value / 100);
}

export function CartScreen({ embedded = false }: { embedded?: boolean }) {
  const { user, isLoaded } = useUser();
  if (!isLoaded) return <CartLoading embedded={embedded} />;
  const userId = user?.id ?? null;
  return <CartSession key={userId ?? "guest"} userId={userId} embedded={embedded} />;
}

function CartLoading({ embedded }: { embedded: boolean }) {
  if (embedded) return <section className={`${styles.page} ${styles.embedded}`} aria-label="Cart details"><p className={styles.status} role="status">Loading your cart…</p></section>;
  return <main id="main" className={styles.page} tabIndex={-1}>
    <p className={styles.kicker}>Your basket</p>
    <h1>Cart</h1>
    <p className={styles.status} role="status">Loading your cart…</p>
  </main>;
}

function CartSession({ userId, embedded }: { userId: string | null; embedded: boolean }) {
  const id = useId();
  const guest = useSyncExternalStore(subscribeGuestCart, getGuestCartSnapshot, getGuestCartServerSnapshot);
  const [view, setView] = useState<CartView>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [actionError, setActionError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const activeActions = useRef(new Set<AbortController>());
  const guestViewStale = !userId && view.status === "ready" && view.guestRevision !== guest.revision;

  useEffect(() => () => {
    for (const controller of activeActions.current) controller.abort();
    activeActions.current.clear();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    void loadCustomerCart(controller.signal).then((cart) => {
      if (!controller.signal.aborted) {
        setView(viewOfCustomerCart(cart));
        setReloadRequired(false);
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setView({ status: "error", message: cartErrorMessage(error) });
    });
    return () => controller.abort();
  }, [userId, reloadKey]);

  useEffect(() => {
    if (userId || !guest.ready || guest.invalidStoredCart) return;
    const controller = new AbortController();
    void quoteCart(guest.items, controller.signal).then((quote) => {
      if (!controller.signal.aborted) {
        setView({ status: "ready", items: guest.items, quote, version: null, guestRevision: guest.revision });
        setReloadRequired(false);
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setView({ status: "error", message: cartErrorMessage(error, "quote") });
    });
    return () => controller.abort();
  }, [userId, guest.ready, guest.invalidStoredCart, guest.items, guest.revision, reloadKey]);

  const retry = () => {
    setActionError("");
    setReloadRequired(false);
    setView({ status: "loading" });
    setReloadKey((value) => value + 1);
  };

  const clearUnreadableGuestCart = () => {
    const cleared = discardUnreadableGuestCart();
    setActionError(cleared ? "" : "This browser could not clear the unreadable saved cart. You can keep reviewing your signed-in cart, or try again later.");
    if (cleared && !userId) setView({ status: "loading" });
  };

  const changeItems = async (nextItems: CartInputLine[], successText: string) => {
    if (view.status !== "ready" || busy || reloadRequired) return;
    setBusy(true);
    setActionError("");
    setAnnouncement("");
    if (!userId) {
      if (view.guestRevision === null) {
        setBusy(false);
        setActionError("Your guest cart is still refreshing. Wait for the current cart details before editing.");
        return;
      }
      const result = saveGuestCart(nextItems, { items: view.items, revision: view.guestRevision });
      setBusy(false);
      if (result.reason) {
        setActionError(result.reason === "changed"
          ? "Your guest cart changed in another tab. The latest copy is preserved, and no edit was saved. Review the refreshed cart before trying again."
          : result.reason === "invalid"
            ? "The saved cart could not be changed. Clear the unreadable saved cart to start again."
            : "This browser could not verify the saved cart, so no edit was saved. Review the cart and try again.");
        return;
      }
      setAnnouncement(successText);
      return;
    }

    const controller = new AbortController();
    activeActions.current.add(controller);
    try {
      const cart = await replaceCustomerCart(view.version ?? 0, nextItems, controller.signal);
      if (!controller.signal.aborted) {
        setView(viewOfCustomerCart(cart));
        setAnnouncement(successText);
        setReloadRequired(false);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setActionError(cartErrorMessage(error, "update"));
        setReloadRequired(true);
      }
    } finally {
      activeActions.current.delete(controller);
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const remove = (variantId: string) => {
    if (view.status === "ready") void changeItems(removeCartItem(view.items, variantId), "Item removed from your cart.");
  };

  const updateQuantity = (variantId: string, quantity: number) => {
    if (view.status !== "ready") return;
    const items = setCartItemQuantity(view.items, variantId, quantity);
    if (!items) return;
    void changeItems(items, "Cart quantity updated.");
  };

  const merge = async () => {
    if (view.status !== "ready" || !userId || busy || reloadRequired) return;
    const guestItems = guest.items.map((item) => ({ ...item }));
    const guestRevision = guest.revision;
    const items = mergeGuestCart(view.items, guestItems);
    if (!items) {
      setActionError("These carts contain more than 50 different items. Remove guest items you do not want, then try the merge again.");
      return;
    }
    setBusy(true);
    setActionError("");
    setAnnouncement("");
    const controller = new AbortController();
    activeActions.current.add(controller);
    try {
      const cart = await replaceCustomerCart(view.version ?? 0, items, controller.signal);
      if (controller.signal.aborted) return;
      const clearedGuestCart = clearGuestCartAfterMerge(guestItems, guestRevision);
      if (!clearedGuestCart.ok) {
        setView(viewOfCustomerCart(cart));
        setActionError(clearedGuestCart.reason === "changed"
          ? "Your guest cart changed while the merge was being saved. The latest guest copy is preserved. Reload and review both carts before making another change."
          : clearedGuestCart.reason === "invalid"
            ? "The customer cart was updated, but the guest copy changed into an unreadable format. It was preserved. Reload and review both carts before making another change."
            : "The customer cart was updated, but this browser could not safely clear its guest copy. It is preserved. Reload and review both carts before making another change.");
        setReloadRequired(true);
        return;
      }
      setView(viewOfCustomerCart(cart));
      setAnnouncement("Guest items were merged. Matching items now use the higher quantity.");
      setReloadRequired(false);
    } catch (error) {
      if (!controller.signal.aborted) {
        setActionError(cartErrorMessage(error, "update"));
        setReloadRequired(true);
      }
    } finally {
      activeActions.current.delete(controller);
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  if (!userId && guest.invalidStoredCart) {
    return <CartLayout embedded={embedded}>
      <section className={styles.notice} aria-labelledby={`${id}-storage-title`}>
        <h2 id={`${id}-storage-title`}>Saved guest cart could not be read</h2>
        <p>Its contents were not changed. Clear that unreadable browser copy to start a new cart.</p>
        {actionError && <p className={styles.fieldError} role="alert">{actionError}</p>}
        <button className={styles.secondaryButton} type="button" onClick={clearUnreadableGuestCart}>
          Clear unreadable saved cart
        </button>
      </section>
    </CartLayout>;
  }

  return <CartLayout embedded={embedded}>
    {guest.storageWarning && <p className={styles.storageWarning} role="status">
      This browser could not save the guest cart. Changes are kept in memory until you leave this page.
    </p>}
    {userId && guest.invalidStoredCart && <section className={styles.notice} aria-labelledby={`${id}-storage-title`}>
      <h2 id={`${id}-storage-title`}>Saved guest cart could not be read</h2>
      <p>Your signed-in cart is separate. Clear the unreadable browser copy if you no longer need it.</p>
      <button className={styles.secondaryButton} type="button" onClick={clearUnreadableGuestCart}>
        Clear unreadable guest cart
      </button>
    </section>}
    {actionError && <div className={styles.error} role="alert">
      <p>{actionError}</p>
      {reloadRequired && <button className={styles.secondaryButton} type="button" onClick={retry}>Reload cart</button>}
    </div>}
    {announcement && <p className={styles.srOnly} role="status" aria-live="polite">{announcement}</p>}

    {userId && view.status === "ready" && guest.items.length > 0 && <section className={styles.mergeNotice} aria-labelledby={`${id}-merge-title`}>
      <div>
        <h2 id={`${id}-merge-title`}>Guest items are saved in this browser</h2>
        <p>Review the guest cart and choose whether to merge it into your signed-in cart. Matching items keep the higher quantity.</p>
        <p className={styles.smallText}>{guest.items.length} guest {guest.items.length === 1 ? "item" : "items"} · {view.items.length} signed-in {view.items.length === 1 ? "item" : "items"}</p>
        {mergeGuestCart(view.items, guest.items) === null && <p className={styles.fieldError}>The merged cart can contain at most 50 different items.</p>}
      </div>
      <button className={styles.secondaryButton} type="button" onClick={() => void merge()} disabled={busy || reloadRequired || mergeGuestCart(view.items, guest.items) === null}>
        {busy ? "Merging…" : "Merge guest cart"}
      </button>
    </section>}

    {(view.status === "loading" || guestViewStale) && <p className={styles.status} role="status">Refreshing current cart details…</p>}
    {view.status === "error" && <section className={styles.errorPanel} aria-labelledby={`${id}-load-error`}>
      <h2 id={`${id}-load-error`}>Cart details are unavailable</h2>
      <p>{view.message}</p>
      <button className={styles.secondaryButton} type="button" onClick={retry}>Try again</button>
    </section>}
    {view.status === "ready" && <CartContents
      view={view}
      id={id}
      busy={busy}
      locked={busy || reloadRequired || guestViewStale}
      refreshing={guestViewStale}
      onRemove={remove}
      onUpdateQuantity={updateQuantity}
    />}
  </CartLayout>;
}

function CartLayout({ children, embedded }: { children: ReactNode; embedded: boolean }) {
  if (embedded) return <section className={`${styles.page} ${styles.embedded}`} aria-label="Cart details">{children}</section>;
  return <main id="main" className={styles.page} tabIndex={-1}>
    <header className={styles.heading}>
      <p className={styles.kicker}>Your basket</p>
      <h1>Cart</h1>
      <p>Review items and their current catalog prices.</p>
    </header>
    {children}
  </main>;
}

function CartContents({ view, id, busy, locked, refreshing, onRemove, onUpdateQuantity }: {
  view: Extract<CartView, { status: "ready" }>;
  id: string;
  busy: boolean;
  locked: boolean;
  refreshing: boolean;
  onRemove: (variantId: string) => void;
  onUpdateQuantity: (variantId: string, quantity: number) => void;
}) {
  if (view.quote.lines.length === 0) return <section className={styles.empty} aria-labelledby={`${id}-empty-title`}>
    <h2 id={`${id}-empty-title`}>Your cart is empty</h2>
    <p>Explore the catalog and add items you would like to review.</p>
    <Link className={styles.primaryButton} href="/shop">Browse products</Link>
  </section>;

  const itemCount = view.items.reduce((total, item) => total + item.quantity, 0);

  return <div className={styles.cartLayout}>
    <section className={styles.itemsPanel} aria-labelledby={`${id}-items-title`}>
      <div className={styles.panelHeading}>
        <h2 id={`${id}-items-title`}>Items</h2>
        <span>{itemCount} {itemCount === 1 ? "item" : "items"}</span>
      </div>
      <ul className={styles.itemList}>
        {view.quote.lines.map((line) => <CartLine
          key={line.variantId}
          line={line}
          busy={busy}
          locked={locked}
          onRemove={() => onRemove(line.variantId)}
          onUpdateQuantity={(quantity) => onUpdateQuantity(line.variantId, quantity)}
        />)}
      </ul>
    </section>

    <aside className={styles.summary} aria-labelledby={`${id}-summary-title`}>
      <h2 id={`${id}-summary-title`}>Order summary</h2>
      <div className={styles.subtotalRow}><span>Current catalog subtotal</span><strong>{view.quote.subtotalPaise === null ? "Unavailable" : formatPaise(view.quote.subtotalPaise)}</strong></div>
      <p className={styles.smallText}>Prices and availability may change before an order is placed. Shipping and GST are not calculated here; final totals must be checked before ordering is enabled.</p>
      <p className={styles.setupNote}>Order placement and payment are not configured in this development build.</p>
      {locked
        ? <button className={styles.primaryButton} type="button" disabled>{refreshing ? "Refreshing current cart…" : "Wait for cart updates before checkout"}</button>
        : view.quote.readyForCheckout
        ? <Link className={styles.primaryButton} href="/checkout">Continue to checkout</Link>
        : <button className={styles.primaryButton} type="button" disabled>Review unavailable items first</button>}
      <Link className={styles.secondaryLink} href="/shop">Continue shopping</Link>
    </aside>
  </div>;
}

function CartLine({ line, busy, locked, onRemove, onUpdateQuantity }: {
  line: CartQuoteLine;
  busy: boolean;
  locked: boolean;
  onRemove: () => void;
  onUpdateQuantity: (quantity: number) => void;
}) {
  const title = line.title ?? "Unavailable catalog item";
  const variant = line.variant;
  const removeLabel = variant ? `${title}, ${variant.label}` : title;
  return <li className={styles.item}>
    <div className={styles.itemDetails}>
      <h3>{line.slug ? <Link href={`/products/${encodeURIComponent(line.slug)}`}>{title}</Link> : title}</h3>
      {variant && <p className={styles.itemMeta}>{variant.label} · SKU {variant.sku}</p>}
      {line.issue === "not_available" && <p className={styles.itemIssue}>This item is no longer available in the published catalog.</p>}
      {line.issue === "price_unavailable" && <p className={styles.itemIssue}>A current price is not available.</p>}
      {line.issue === "quantity_unavailable" && <p className={styles.itemIssue}>This variant is currently unavailable.</p>}
      <button className={styles.removeButton} type="button" onClick={onRemove} disabled={locked} aria-label={`Remove ${removeLabel} from your cart`}>
        Remove
      </button>
    </div>
    {line.issue === null
      ? <QuantityEditor variantId={line.variantId} quantity={line.quantity} busy={busy} locked={locked} onSave={onUpdateQuantity} />
      : <p className={styles.quantityValue}>Quantity {line.quantity}</p>}
    <p className={styles.lineTotal}>{formatPaise(line.lineTotalPaise)}</p>
  </li>;
}

function QuantityEditor({ variantId, quantity, busy, locked, onSave }: {
  variantId: string;
  quantity: number;
  busy: boolean;
  locked: boolean;
  onSave: (quantity: number) => void;
}) {
  const [draft, setDraft] = useState({ quantity, value: String(quantity) });
  const value = draft.quantity === quantity ? draft.value : String(quantity);
  const [error, setError] = useState("");
  const id = useId();
  const inputId = `${id}-cart-quantity-${variantId}`;
  const errorId = `${inputId}-error`;

  return <form className={styles.quantityForm} onSubmit={(event) => {
    event.preventDefault();
    if (busy || locked) return;
    const next = Number(value);
    if (!Number.isInteger(next) || next < 1 || next > 99) {
      setError("Enter a whole number from 1 to 99.");
      return;
    }
    setError("");
    onSave(next);
  }}>
    <label htmlFor={inputId}>Quantity</label>
    <div className={styles.quantityControls}>
      <input id={inputId} type="number" min={1} max={99} step={1} value={value} readOnly={busy || locked} onChange={(event) => setDraft({ quantity, value: event.currentTarget.value })} aria-disabled={busy || locked} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} />
      <button className={styles.quantityButton} type="submit" aria-disabled={busy || locked}>{busy ? "Saving…" : "Update"}</button>
    </div>
    {error && <span id={errorId} className={styles.fieldError} role="alert">{error}</span>}
  </form>;
}
