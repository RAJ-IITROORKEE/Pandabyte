"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Package } from "lucide-react";
import { useEffect, useState } from "react";
import { formatPaise } from "./checkout-money";
import { OrderSuccessAnimation } from "./order-success-animation";
import styles from "./order-confirmation.module.css";

type Address = { recipientName: string; phone: string; line1: string; line2: string; city: string; state: string; postalCode: string; country: string };
type Line = { title: string; quantity: number; lineTotalPaise: number; variant?: { sku?: string; label?: string; regularPricePaise?: number | null; effectivePricePaise?: number | null } };
type Order = { reference: string; createdAt: string; status: string; paymentState: string; environment: string; totalPaise: number; snapshot: { shipping?: Address; billing?: Address; shipment?: { carrier?: string; trackingNumber?: string; trackingUrl?: string }; fictionalShippingPaise?: number; fictionalTaxPaise?: number; chargesAreFictional?: boolean; quote?: { subtotalPaise?: number; lines: Line[] } } };

export function confirmed(order: Order) { return order.environment === "razorpay_test" && order.paymentState === "paid" && ["processing", "fulfilled"].includes(order.status); }
export function pending(order: Order) { return order.environment === "razorpay_test" && ["pending", "verified"].includes(order.paymentState) && order.status !== "cancelled"; }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
const optionalText = (value: unknown) => value == null || typeof value === "string";
const optionalPaise = (value: unknown) => value == null || (Number.isSafeInteger(value) && Number(value) >= 0);
function validAddress(value: unknown) {
  return value == null || (record(value) && ["recipientName", "phone", "line1", "city", "state", "postalCode", "country"].every(key => typeof value[key] === "string") && optionalText(value.line2));
}
export function validOrder(value: unknown, reference: string): value is Order {
  if (!record(value) || value.reference !== reference || typeof value.status !== "string" || typeof value.paymentState !== "string" || typeof value.environment !== "string" || !optionalText(value.createdAt) || !Number.isSafeInteger(value.totalPaise) || Number(value.totalPaise) < 0 || !record(value.snapshot)) return false;
  const snapshot = value.snapshot;
  if (!validAddress(snapshot.shipping) || !validAddress(snapshot.billing) || !optionalPaise(snapshot.fictionalShippingPaise) || !optionalPaise(snapshot.fictionalTaxPaise) || (snapshot.chargesAreFictional != null && typeof snapshot.chargesAreFictional !== "boolean")) return false;
  if (snapshot.shipment != null && (!record(snapshot.shipment) || ![snapshot.shipment.carrier, snapshot.shipment.trackingNumber, snapshot.shipment.trackingUrl].every(optionalText))) return false;
  const quote = snapshot.quote;
  return quote == null || (record(quote) && optionalPaise(quote.subtotalPaise) && Array.isArray(quote.lines) && quote.lines.every(line => record(line) && typeof line.title === "string" && Number.isSafeInteger(line.quantity) && Number(line.quantity) > 0 && Number.isSafeInteger(line.lineTotalPaise) && Number(line.lineTotalPaise) >= 0 && (line.variant == null || (record(line.variant) && optionalText(line.variant.label) && optionalText(line.variant.sku) && optionalPaise(line.variant.regularPricePaise) && optionalPaise(line.variant.effectivePricePaise)))));
}
function trackingLink(value?: string) { try { const url = new URL(value ?? ""); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; } }
function AddressView({ address }: { address?: Address }) { return address ? <p>{address.recipientName}<br />{address.line1}{address.line2 && <><br />{address.line2}</>}<br />{address.city}, {address.state} {address.postalCode}<br />{address.country}<br />{address.phone}</p> : <p>Not available</p>; }

export function OrderConfirmation({ reference }: { reference: string }) {
  const { isLoaded, user } = useUser();
  if (!isLoaded) return <main id="main" className={styles.page}><p role="status">Loading order access…</p></main>;
  if (!user) return <main id="main" className={styles.page}><p>Sign in to view your order.</p><Link href={`/sign-in?redirect_url=${encodeURIComponent(`/checkout/confirmation/${encodeURIComponent(reference)}`)}`}>Sign in</Link></main>;
  return <ConfirmationSession key={`${user.id}:${reference}`} userId={user.id} reference={reference} />;
}

function ConfirmationSession({ userId, reference }: { userId: string; reference: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    async function load() {
      try {
        const response = await fetch(`/api/account/orders/${encodeURIComponent(reference)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 ? "Your session has expired. Sign in again to view your order." : response.status === 403 || response.status === 404 ? "This order is unavailable." : "Your order could not be loaded. Please try again.");
        const value: unknown = await response.json();
        if (!validOrder(value, reference)) throw new Error("Your order could not be loaded. Please try again.");
        if (controller.signal.aborted) return;
        setOrder(value); setError("");
        if (pending(value) && ++attempts < 4) timer = setTimeout(load, 5000);
      } catch (reason) {
        if (!controller.signal.aborted) { setOrder(null); setError(reason instanceof Error ? reason.message : "Your order could not be loaded. Please try again."); }
      }
    }
    void load();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [reference, reload]);

  const success = order && confirmed(order);
  const simulated = order?.environment === "simulation" && order.paymentState === "simulated";
  const shipment = order?.snapshot.shipment;
  const tracking = trackingLink(shipment?.trackingUrl);
  const discount = (order?.snapshot.quote?.lines ?? []).reduce((sum, line) => {
    const regular = line.variant?.regularPricePaise, actual = line.variant?.effectivePricePaise;
    return Number.isSafeInteger(regular) && Number.isSafeInteger(actual) && regular! > actual! && actual! >= 0 ? sum + (regular! - actual!) * line.quantity : sum;
  }, 0);
  const date = order?.createdAt && !Number.isNaN(Date.parse(order.createdAt)) ? new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "Not available";
  return <main id="main" tabIndex={-1} className={styles.page}>
    <header className={styles.header}>
      {success && <OrderSuccessAnimation userId={userId} reference={reference} />}
      <div role="status" aria-live="polite"><h1>{success ? "Thank you for your order!" : simulated ? "Simulated order" : order ? "Order status" : error ? "Order unavailable" : "We’re confirming your payment…"}</h1>
        <p>{success ? "Your PandaByte order is confirmed." : simulated ? "This is a simulation. No payment was collected." : order ? pending(order) ? "Your payment is still being checked. Check again before making another payment." : order.paymentState === "review" ? "This test order requires review. Contact support before attempting another payment." : "This order is not confirmed. See the current status below." : error || "Please wait while we retrieve your order."}</p></div>
      {error && <button type="button" onClick={() => setReload(n => n + 1)}>Retry</button>}
    </header>
    {order && <>
      <div className={styles.strip}><div><small>Order number</small><strong>{order.reference}</strong></div><div><small>Order date</small><strong>{date}</strong></div><span className={styles.badge}>{order.status.replaceAll("_", " ")}</span></div>
      <div className={styles.columns}><div className={styles.stack}>
        <section className={styles.card}><h2>Items ordered</h2>{order.snapshot.quote?.lines?.length ? <ul className={styles.items}>{order.snapshot.quote.lines.map((line, index) => <li key={index}><span className={styles.placeholder} aria-label="Purchased image unavailable"><Package size={22} aria-hidden="true" /></span><div><strong>{line.title}</strong>{line.variant?.label && <span>{line.variant.label}</span>}{line.variant?.sku && <span>SKU: {line.variant.sku}</span>}<span>Qty: {line.quantity}{line.variant?.effectivePricePaise != null && ` · ${formatPaise(line.variant.effectivePricePaise)} each`}</span></div><strong>{formatPaise(line.lineTotalPaise)}</strong></li>)}</ul> : <p>Purchased items are unavailable.</p>}</section>
        <section className={styles.card}><h2>Totals</h2><dl className={styles.totals}>{order.snapshot.quote?.subtotalPaise != null && <div><dt>Subtotal</dt><dd>{formatPaise(order.snapshot.quote.subtotalPaise)}</dd></div>}{discount > 0 && Number.isSafeInteger(discount) && <div><dt>Discount included</dt><dd>{formatPaise(discount)}</dd></div>}{order.snapshot.fictionalShippingPaise != null && <div><dt>Fictional test shipping</dt><dd>{formatPaise(order.snapshot.fictionalShippingPaise)}</dd></div>}{order.snapshot.fictionalTaxPaise != null && <div><dt>Fictional test tax</dt><dd>{formatPaise(order.snapshot.fictionalTaxPaise)}</dd></div>}<div className={styles.total}><dt>Order total</dt><dd>{formatPaise(order.totalPaise)}</dd></div></dl>{order.snapshot.chargesAreFictional && <p>Shipping and tax are fictional test amounts.</p>}</section>
      </div><div className={styles.stack}>
        <section className={styles.card}><h2>Shipping address</h2><AddressView address={order.snapshot.shipping} />{shipment?.carrier && <p>Carrier: {shipment.carrier}</p>}{shipment?.trackingNumber && <p>Tracking: {shipment.trackingNumber}</p>}</section>
        {order.snapshot.billing && <section className={styles.card}><h2>Billing address</h2><AddressView address={order.snapshot.billing} /></section>}
        <section className={styles.card}><h2>Payment</h2><p>{order.environment === "razorpay_test" ? "Razorpay test mode" : simulated ? "Simulation" : "Unavailable"}</p><p>Status: {order.paymentState.replaceAll("_", " ")}</p>{order.environment === "razorpay_test" && <p>Test payment only; no real charge or stock reservation.</p>}</section>
        <section className={`${styles.card} ${styles.actions}`} aria-label="Order actions">{pending(order) && <button type="button" onClick={() => setReload(n => n + 1)}>Check again</button>}<Link href="/account#orders">View orders</Link>{tracking && <a href={tracking} target="_blank" rel="noopener noreferrer">Track shipment</a>}<button type="button" onClick={() => window.print()}>Print order</button><Link href="/shop">Continue shopping</Link></section>
      </div></div>
    </>}
  </main>;
}
