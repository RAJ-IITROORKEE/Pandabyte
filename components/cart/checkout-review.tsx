"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { CreditCard, MapPin, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import type { CustomerCart } from "@/lib/cart/validation";
import { cartErrorMessage, loadCustomerCart } from "./cart-api";
import styles from "./checkout-review.module.css";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

export function CheckoutReview() {
  const { user, isLoaded } = useUser();
  if (!isLoaded) return <p role="status">Loading your checkout review…</p>;
  if (!user) return <section className={styles.panel}>
    <p>Your session has changed. Sign in to review your cart.</p>
    <Link className="shell-button" href="/sign-in?redirect_url=%2Fcheckout">Sign in</Link>
  </section>;
  return <CheckoutSession key={user.id} />;
}

function CheckoutSession() {
  const [cart, setCart] = useState<CustomerCart | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    loadCustomerCart(controller.signal).then(value => {
      if (!controller.signal.aborted) setCart(value);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cartErrorMessage(cause));
    });
    return () => controller.abort();
  }, [attempt]);

  if (error) return <section className={styles.panel} aria-label="Checkout could not load">
    <p role="alert">{error}</p>
    <button className="shell-button" type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Try again</button>
    <Link className={styles.link} href="/cart">Return to cart</Link>
  </section>;
  if (!cart) return <p role="status">Loading your checkout review…</p>;
  if (!cart.items.length) return <section className={styles.panel} aria-labelledby="checkout-empty">
    <ShoppingBag aria-hidden="true" size={28} />
    <h2 id="checkout-empty">Your cart is empty</h2>
    <p>Add an available product to review it here. Guest items can be merged from your cart after sign-in.</p>
    <Link className="shell-button" href="/cart">Open cart</Link>
    <Link className={styles.link} href="/shop">Browse products</Link>
  </section>;

  return <div className={styles.layout}>
    <div className={styles.stack}>
      <section className={styles.panel} aria-labelledby="checkout-items">
        <h2 id="checkout-items"><ShoppingBag aria-hidden="true" size={22} /> Your items</h2>
        <ul className={styles.items}>{cart.quote.lines.map(line => <li key={line.variantId}>
          <div>{line.slug ? <Link href={`/products/${encodeURIComponent(line.slug)}`}>{line.title}</Link> : <strong>Unavailable item</strong>}<p>Quantity {line.quantity}{line.variant ? ` · ${line.variant.label}` : ""}</p>{line.issue && <p className={styles.notice}>Review this item in your cart before continuing.</p>}</div>
          <strong>{line.lineTotalPaise === null ? "Price unavailable" : money.format(line.lineTotalPaise / 100)}</strong>
        </li>)}</ul>
        <Link className={styles.link} href="/cart">Edit cart or refresh prices</Link>
      </section>
      <section className={styles.panel} aria-labelledby="checkout-address">
        <h2 id="checkout-address"><MapPin aria-hidden="true" size={22} /> Delivery details</h2>
        <p>You can manage your shipping and billing addresses in your account. Address confirmation will be available when order setup is complete.</p>
        <Link className={styles.link} href="/account">Manage addresses</Link>
      </section>
    </div>
    <aside className={styles.panel} aria-labelledby="checkout-summary">
      <h2 id="checkout-summary">Review summary</h2>
      <dl className={styles.totals}><div><dt>Product subtotal</dt><dd>{cart.quote.subtotalPaise === null ? "Unavailable" : money.format(cart.quote.subtotalPaise / 100)}</dd></div><div><dt>Shipping</dt><dd>Pending setup</dd></div><div><dt>GST</dt><dd>Pending setup</dd></div></dl>
      {!cart.quote.readyForCheckout && <p className={styles.notice}>Some items need attention. Return to the cart to review current availability and pricing.</p>}
      <p>Final totals and payment are not configured yet. Reviewing this page does not reserve stock or place an order.</p>
      <button className={styles.payment} type="button" disabled><CreditCard aria-hidden="true" size={18} /> Payment coming soon</button>
    </aside>
  </div>;
}
