"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import Image from "next/image";
import { Minus, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
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
import { getCustomerCartSnapshot, activateCustomerCart, publishCustomerCart, subscribeCustomerCart } from "./customer-cart-store";
import styles from "./cart.module.css";
import { fetchTestQuote, testQuoteKey, type TestQuote } from "./test-quote";
import { cardImageIds } from "@/components/catalog/card-image-selection";

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
  const [view, setView] = useState<CartView>(() => {
    const customer = getCustomerCartSnapshot();
    return userId && customer.userId === userId && customer.cart ? viewOfCustomerCart(customer.cart) : { status: "loading" };
  });
  const [storefrontTest, setStorefrontTest] = useState(false);
  const [testResult, setTestResult] = useState<{ key: string; quote: TestQuote | null } | null>(null);
  const [testQuoteAttempt, setTestQuoteAttempt] = useState(0);
  const testItems = view.status === "ready" ? view.items : [];
  const testSubtotal = view.status === "ready" ? view.quote.subtotalPaise : null;
  const testKey = testQuoteKey(testItems, testSubtotal, view.status === "ready" ? view.quote : null);
  const currentTestQuote = storefrontTest && testResult?.key === testKey ? testResult.quote : null;
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/checkout/razorpay-test/capabilities", { cache: "no-store", signal: controller.signal, headers: userId ? { "x-account-owner": userId } : {} }).then(response => response.ok ? response.json() : null).then(body => {
      if (!controller.signal.aborted) setStorefrontTest(body?.razorpayTestAvailable === true && body?.storefrontTest === true);
    }).catch(() => {});
    return () => controller.abort();
  }, [userId]);
  useEffect(() => {
    const { items, subtotal } = JSON.parse(testKey) as { items: CartInputLine[]; subtotal: number | null };
    if (!storefrontTest || view.status !== "ready" || !items.length || subtotal === null) return;
    const controller = new AbortController();
    void fetchTestQuote(items, subtotal, controller.signal).then(quote => {
      if (!controller.signal.aborted) setTestResult({ key: testKey, quote });
    }).catch(() => { if (!controller.signal.aborted) setTestResult({ key: testKey, quote: null }); });
    return () => controller.abort();
  }, [storefrontTest, testKey, testQuoteAttempt, view.status]);
  const [busy, setBusy] = useState(false);
  const [customerRefreshing, setCustomerRefreshing] = useState(!!userId);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [actionError, setActionError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const activeActions = useRef(new Set<AbortController>());
  const removedVariantId = useRef<string | null>(null);
  const contentsHeading = useRef<HTMLHeadingElement>(null);
  const guestViewStale = !userId && view.status === "ready" && view.guestRevision !== guest.revision;

  useEffect(() => {
    if (view.status !== "ready") {
      removedVariantId.current = null;
      return;
    }
    if (guestViewStale || removedVariantId.current === null || view.items.some(item => item.variantId === removedVariantId.current)) return;
    removedVariantId.current = null;
    contentsHeading.current?.focus();
  }, [view, guestViewStale]);

  useEffect(() => () => {
    for (const controller of activeActions.current) controller.abort();
    activeActions.current.clear();
  }, []);

  useEffect(() => {
    if (!userId) return;
    activateCustomerCart(userId);
    const controller = new AbortController();
    void loadCustomerCart(controller.signal).then((cart) => {
      if (!controller.signal.aborted) {
        publishCustomerCart(userId, cart);
        const latest = getCustomerCartSnapshot();
        setView(viewOfCustomerCart(latest.userId === userId && latest.cart ? latest.cart : cart));
        setReloadRequired(false);
        setCustomerRefreshing(false);
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) { setCustomerRefreshing(false); setView({ status: "error", message: cartErrorMessage(error) }); }
    });
    return () => controller.abort();
  }, [userId, reloadKey]);

  useEffect(() => subscribeCustomerCart(() => {
    const customer = getCustomerCartSnapshot();
    if (userId && customer.userId === userId && customer.cart) {
      const cart = customer.cart;
      setView(previous => previous.status === "ready" && previous.version !== null && previous.version > cart.version ? previous : viewOfCustomerCart(cart));
    }
  }), [userId]);

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
    if (userId) setCustomerRefreshing(true);
    setView({ status: "loading" });
    setReloadKey((value) => value + 1);
  };

  const clearUnreadableGuestCart = () => {
    const cleared = discardUnreadableGuestCart();
    setActionError(cleared ? "" : "This browser could not clear the unreadable saved cart. You can keep reviewing your signed-in cart, or try again later.");
    if (cleared && !userId) setView({ status: "loading" });
  };

  const changeItems = async (nextItems: CartInputLine[], successText: string, removedId?: string) => {
    if (view.status !== "ready" || busy || reloadRequired || customerRefreshing || guestViewStale) return;
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
      removedVariantId.current = removedId ?? null;
      setAnnouncement(successText);
      return;
    }

    const controller = new AbortController();
    activeActions.current.add(controller);
    try {
      const cart = await replaceCustomerCart(view.version ?? 0, nextItems, controller.signal);
      publishCustomerCart(userId, cart);
      if (!controller.signal.aborted) {
        removedVariantId.current = removedId ?? null;
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
    if (view.status === "ready") void changeItems(removeCartItem(view.items, variantId), "Item removed from your cart.", variantId);
  };

  const updateQuantity = (variantId: string, quantity: number) => {
    if (view.status !== "ready") return;
    const items = setCartItemQuantity(view.items, variantId, quantity);
    if (!items) return;
    void changeItems(items, "Cart quantity updated.");
  };

  const merge = async () => {
    if (view.status !== "ready" || !userId || busy || reloadRequired || customerRefreshing) return;
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
      publishCustomerCart(userId, cart);
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

  return <CartLayout embedded={embedded} itemCount={view.status === "ready" ? view.items.reduce((total, item) => total + item.quantity, 0) : undefined}>
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
      <button className={styles.secondaryButton} type="button" onClick={() => void merge()} disabled={busy || reloadRequired || customerRefreshing || mergeGuestCart(view.items, guest.items) === null}>
        {busy ? "Merging…" : "Merge guest cart"}
      </button>
    </section>}

    {(view.status === "loading" || guestViewStale || customerRefreshing) && <p className={styles.status} role="status">Refreshing current cart details…</p>}
    {view.status === "error" && <section className={styles.errorPanel} aria-labelledby={`${id}-load-error`}>
      <h2 id={`${id}-load-error`}>Cart details are unavailable</h2>
      <p role="alert">{view.message}</p>
      <button className={styles.secondaryButton} type="button" onClick={retry}>Try again</button>
    </section>}
    {view.status === "ready" && <CartContents
      view={view}
      storefrontTest={storefrontTest}
      testQuote={busy || guestViewStale || customerRefreshing || reloadRequired ? null : currentTestQuote}
      onRetryTestQuote={() => setTestQuoteAttempt(value => value + 1)}
      id={id}
      locked={busy || reloadRequired || guestViewStale || customerRefreshing}
      refreshing={guestViewStale || customerRefreshing}
      headingRef={contentsHeading}
      onRemove={remove}
      onUpdateQuantity={updateQuantity}
    />}
  </CartLayout>;
}

function CartLayout({ children, embedded, itemCount }: { children: ReactNode; embedded: boolean; itemCount?: number }) {
  if (embedded) return <section className={`${styles.page} ${styles.embedded}`} aria-label="Cart details">{children}</section>;
  return <main id="main" className={styles.page} tabIndex={-1}>
    <header className={styles.heading}>
      <h1>Shopping Cart</h1>
      <p>{itemCount === undefined ? "Review items and their current catalog prices." : `${itemCount} ${itemCount === 1 ? "item" : "items"} in your cart`}</p>
    </header>
    {children}
  </main>;
}

function CartContents({ view, storefrontTest, testQuote, onRetryTestQuote, id, locked, refreshing, headingRef, onRemove, onUpdateQuantity }: {
  view: Extract<CartView, { status: "ready" }>;
  storefrontTest: boolean;
  testQuote: TestQuote | null;
  onRetryTestQuote: () => void;
  id: string;
  locked: boolean;
  refreshing: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onRemove: (variantId: string) => void;
  onUpdateQuantity: (variantId: string, quantity: number) => void;
}) {
  if (view.quote.lines.length === 0) return <section className={styles.empty} aria-labelledby={`${id}-empty-title`}>
    <h2 id={`${id}-empty-title`} ref={headingRef} tabIndex={-1}>Your cart is empty</h2>
    <p>Explore the catalog and add items you would like to review.</p>
    <Link className={styles.primaryButton} href="/shop">Browse products</Link>
  </section>;

  const itemCount = view.items.reduce((total, item) => total + item.quantity, 0);

  return <div className={styles.cartLayout}>
    <section className={styles.itemsPanel} aria-labelledby={`${id}-items-title`}>
      <div className={styles.panelHeading}>
        <h2 id={`${id}-items-title`} ref={headingRef} tabIndex={-1}>Items</h2>
        <span>{itemCount} {itemCount === 1 ? "item" : "items"}</span>
      </div>
      <ul className={styles.itemList}>
        {view.quote.lines.map((line) => <CartLine
          key={line.variantId}
          line={line}
          locked={locked}
          onRemove={() => onRemove(line.variantId)}
          onUpdateQuantity={(quantity) => onUpdateQuantity(line.variantId, quantity)}
        />)}
      </ul>
    </section>

    <aside className={styles.summary} aria-labelledby={`${id}-summary-title`}>
      <h2 id={`${id}-summary-title`}>Order summary</h2>
      <div className={styles.summaryRows}>
        <div><span>Subtotal</span><strong>{view.quote.subtotalPaise === null ? "Unavailable" : formatPaise(view.quote.subtotalPaise)}</strong></div>
        <div><span>{storefrontTest ? "Shipping (test)" : "Shipping"}</span><span>{testQuote ? formatPaise(testQuote.shippingPaise) : "Pending"}</span></div>
        <div><span>{storefrontTest ? "GST (18%, test)" : "GST"}</span><span>{testQuote ? formatPaise(testQuote.taxPaise) : "Pending"}</span></div>
        <div className={styles.summaryTotal}><strong>Total</strong><strong>{testQuote ? formatPaise(testQuote.totalPaise) : "Pending"}</strong></div>
      </div>
      {storefrontTest ? <p className={styles.smallText}>Provisional TEST totals; test payment only. Stock is unverified. {!testQuote && <>Test total unavailable. <button type="button" onClick={onRetryTestQuote}>Retry quote</button></>}</p> : <><p className={styles.smallText}>Prices and availability may change. Shipping and GST must be checked before ordering is enabled.</p><p className={styles.setupNote}>Order placement and payment are not configured in this development build.</p></>}
      {locked
        ? <button className={styles.primaryButton} type="button" disabled>{refreshing ? "Refreshing current cart…" : "Wait for cart updates before checkout"}</button>
        : view.quote.lines.every((line) => line.issue === null || (line.issue === "quantity_unavailable" && line.variant?.cartEligible === true))
        ? <Link className={styles.primaryButton} href="/checkout">Review checkout</Link>
        : <button className={styles.primaryButton} type="button" disabled>Review unavailable items first</button>}
      <Link className={styles.secondaryLink} href="/shop">Continue shopping</Link>
    </aside>
  </div>;
}

function CartLine({ line, locked, onRemove, onUpdateQuantity }: {
  line: CartQuoteLine;
  locked: boolean;
  onRemove: () => void;
  onUpdateQuantity: (quantity: number) => void;
}) {
  const title = line.title ?? "Unavailable catalog item";
  const variant = line.variant;
  const removeLabel = variant ? `${title}, ${variant.label}` : title;
  const imageKey = `${line.productId}:${line.revisionId}:${line.slug}`;
  const [image, setImage] = useState<{ key: string; id: string } | null>(null);
  useEffect(() => {
    if (!line.slug || !line.productId || !line.revisionId) return;
    const controller = new AbortController();
    void fetch(`/api/published/products/${encodeURIComponent(line.slug)}`, { signal: controller.signal, cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        const record = data?.record;
        if (controller.signal.aborted || record?.id !== line.productId || record?.revisionId !== line.revisionId || !Array.isArray(record.document?.mediaIds)) return;
        const ids = record.document.mediaIds.filter((id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id));
        const id = cardImageIds(line.productId!, ids)[0];
        if (id) setImage({ key: imageKey, id });
      }).catch(() => {});
    return () => controller.abort();
  }, [imageKey, line.slug, line.productId, line.revisionId]);
  return <li className={styles.item}>
    <div className={styles.itemImage}>{image?.key === imageKey ? <Image src={`/api/media/${encodeURIComponent(image.id)}?w=96`} alt="" width={96} height={96} unoptimized onError={() => setImage(null)} /> : <span>No image</span>}</div>
    <div className={styles.itemDetails}>
      <h3>{line.slug ? <Link href={`/products/${encodeURIComponent(line.slug)}`}>{title}</Link> : title}</h3>
      {variant && <p className={styles.itemMeta}>{variant.label !== title && `${variant.label} · `}SKU {variant.sku}</p>}
      {variant?.effectivePricePaise !== null && variant?.effectivePricePaise !== undefined && <p className={styles.itemPrice}>{formatPaise(variant.effectivePricePaise)} each {variant.regularPricePaise !== null && variant.regularPricePaise > variant.effectivePricePaise && <del>{formatPaise(variant.regularPricePaise)}</del>}</p>}
      {line.issue === "not_available" && <p className={styles.itemIssue}>This item is no longer available in the published catalog.</p>}
      {line.issue === "price_unavailable" && <p className={styles.itemIssue}>A current price is not available.</p>}
      {line.issue === "quantity_unavailable" && <p className={styles.itemIssue}>{line.variant?.cartEligible === true ? "Stock is unverified for this item." : "This variant is currently unavailable."}</p>}
    </div>
    <div className={styles.itemActions}>
      {(line.issue === null || (line.issue === "quantity_unavailable" && line.variant?.cartEligible === true))
        ? <QuantityEditor title={title} quantity={line.quantity} locked={locked} onSave={onUpdateQuantity} />
        : <p className={styles.quantityValue}>Quantity {line.quantity}</p>}
      <button className={styles.removeButton} type="button" onClick={onRemove} disabled={locked} aria-label={`Remove ${removeLabel} from your cart`}>
        Remove
      </button>
    </div>
    <p className={styles.lineTotal}>{formatPaise(line.lineTotalPaise)}</p>
  </li>;
}

function QuantityEditor({ title, quantity, locked, onSave }: {
  title: string;
  quantity: number;
  locked: boolean;
  onSave: (quantity: number) => void;
}) {
  return <div className={styles.quantityForm}>
    <span>Quantity</span>
    <div className={styles.quantityControls}>
      <button type="button" aria-label={`Decrease quantity of ${title}`} aria-disabled={locked || quantity <= 1} onClick={() => { if (!locked && quantity > 1) onSave(quantity - 1); }}><Minus size={16} aria-hidden="true" /></button>
      <span aria-live="polite">{quantity}</span>
      <button type="button" aria-label={`Increase quantity of ${title}`} aria-disabled={locked || quantity >= 99} onClick={() => { if (!locked && quantity < 99) onSave(quantity + 1); }}><Plus size={16} aria-hidden="true" /></button>
    </div>
  </div>;
}
