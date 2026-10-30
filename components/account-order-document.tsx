"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatPaise } from "./cart/checkout-money";
import styles from "./account-order-document.module.css";

type Address = { recipientName?: string | null; phone?: string | null; line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; postalCode?: string | null; country?: string | null };
type Line = { title: string; quantity: number; lineTotalPaise: number; variant?: { sku?: string | null; label?: string | null; effectivePricePaise?: number | null } | null };
type Order = { reference: string; createdAt?: string | null; status: string; paymentState: string; environment: string; totalPaise: number; snapshot: { shipping?: Address | null; billing?: Address | null; fictionalShippingPaise?: number | null; fictionalTaxPaise?: number | null; chargesAreFictional?: boolean | null; quote?: { subtotalPaise?: number | null; lines: Line[] } | null } };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const optionalText = (value: unknown) => value == null || typeof value === "string";
const money = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const optionalMoney = (value: unknown) => value == null || money(value);
const address = (value: unknown) => value == null || (object(value) && ["recipientName", "phone", "line1", "line2", "city", "state", "postalCode", "country"].every(key => optionalText(value[key])));

export function validOrderDocument(value: unknown, reference: string): value is Order {
  if (!object(value) || value.reference !== reference || !optionalText(value.createdAt) || typeof value.status !== "string" || typeof value.paymentState !== "string" || typeof value.environment !== "string" || !money(value.totalPaise) || !object(value.snapshot)) return false;
  const s = value.snapshot;
  if (!address(s.shipping) || !address(s.billing) || !optionalMoney(s.fictionalShippingPaise) || !optionalMoney(s.fictionalTaxPaise) || !(s.chargesAreFictional == null || typeof s.chargesAreFictional === "boolean")) return false;
  if (s.quote == null) return true;
  if (!object(s.quote) || !optionalMoney(s.quote.subtotalPaise) || !Array.isArray(s.quote.lines)) return false;
  return s.quote.lines.every((line: unknown) => object(line) && typeof line.title === "string" && Number.isSafeInteger(line.quantity) && (line.quantity as number) > 0 && money(line.lineTotalPaise) && (line.variant == null || (object(line.variant) && optionalText(line.variant.sku) && optionalText(line.variant.label) && optionalMoney(line.variant.effectivePricePaise))));
}

function AddressView({ value }: { value?: Address | null }) {
  if (!value) return <p>Not available</p>;
  const lines = [value.recipientName, value.line1, value.line2, [value.city, value.state, value.postalCode].filter(Boolean).join(", "), value.country, value.phone].filter(Boolean);
  return lines.length ? <p>{lines.map((line, index) => <span key={index}>{line}<br /></span>)}</p> : <p>Not available</p>;
}

export function AccountOrderDocument({ reference }: { reference: string }) {
  const { isLoaded, user } = useUser();
  if (!isLoaded) return <main id="main" className={styles.page}><p role="status">Loading order access…</p></main>;
  if (!user) return <main id="main" className={styles.page}><p>Sign in to view your order summary.</p><Link href={`/sign-in?redirect_url=${encodeURIComponent(`/account/order-summary/${encodeURIComponent(reference)}`)}`}>Sign in</Link></main>;
  return <DocumentSession key={`${user.id}:${reference}`} reference={reference} />;
}

function DocumentSession({ reference }: { reference: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/account/orders/${encodeURIComponent(reference)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 ? "Your session has expired. Sign in again to view your order." : response.status === 403 || response.status === 404 ? "This order is unavailable." : "Your order could not be loaded. Please try again.");
        const value: unknown = await response.json();
        if (!validOrderDocument(value, reference)) throw new Error("Your order could not be loaded. Please try again.");
        if (!controller.signal.aborted) { setOrder(value); setError(""); }
      } catch (reason) {
        if (!controller.signal.aborted) { setOrder(null); setError(reason instanceof Error ? reason.message : "Your order could not be loaded. Please try again."); }
      }
    }
    void load();
    return () => controller.abort();
  }, [reference, reload]);
  const date = order?.createdAt && !Number.isNaN(Date.parse(order.createdAt)) ? new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "Not available";
  return <main id="main" tabIndex={-1} className={styles.page}>
    <div className={styles.actions}><Link href="/account#orders">Back to orders</Link>{order && <><button type="button" onClick={() => window.print()}>Print / Save as PDF</button>{order.environment === "razorpay_test" && order.paymentState === "paid" && <a href={`/api/account/orders/${encodeURIComponent(reference)}/document`} download>Download test bill PDF</a>}</>}</div>
    <article className={styles.document}>
      <h1>ORDER SUMMARY — NOT A TAX INVOICE</h1>
      <p>This is an order summary, not an issued invoice.</p>
      <p>PandaByte Innovations Pvt Ltd · Merchant address and tax details: not configured.</p>
      {!order ? <div role={error ? "alert" : "status"}><p>{error || "Loading order summary…"}</p>{error && <button type="button" onClick={() => setReload(n => n + 1)}>Retry</button>}</div> : <>
        <dl className={styles.details}><div><dt>Order number</dt><dd>{order.reference}</dd></div><div><dt>Order date</dt><dd>{date}</dd></div><div><dt>Order status</dt><dd>{order.status.replaceAll("_", " ")}</dd></div><div><dt>Payment status</dt><dd>{order.paymentState.replaceAll("_", " ")}</dd></div><div><dt>Environment</dt><dd>{order.environment === "razorpay_test" ? "Razorpay test mode" : order.environment === "simulation" ? "Simulation" : order.environment}</dd></div></dl>
        {(order.environment === "razorpay_test" || order.environment === "simulation") && <p className={styles.notice}>Test order; this is not a live purchase.</p>}
        <section><h2>Items</h2>{order.snapshot.quote?.lines.length ? <div className={styles.tableWrap}><table><thead><tr><th scope="col">Item</th><th scope="col">Quantity</th><th scope="col">Amount</th></tr></thead><tbody>{order.snapshot.quote.lines.map((line, index) => <tr key={index}><td><strong>{line.title}</strong>{line.variant?.label && <div>{line.variant.label}</div>}{line.variant?.sku && <div>SKU: {line.variant.sku}</div>}{line.variant?.effectivePricePaise != null && <div>{formatPaise(line.variant.effectivePricePaise)} each</div>}</td><td>{line.quantity}</td><td>{formatPaise(line.lineTotalPaise)}</td></tr>)}</tbody></table></div> : <p>Purchased items are unavailable.</p>}</section>
        <section><h2>Totals</h2><dl className={styles.totals}>{order.snapshot.quote?.subtotalPaise != null && <div><dt>Subtotal</dt><dd>{formatPaise(order.snapshot.quote.subtotalPaise)}</dd></div>}{order.snapshot.fictionalShippingPaise != null && <div><dt>Fictional test shipping</dt><dd>{formatPaise(order.snapshot.fictionalShippingPaise)}</dd></div>}{order.snapshot.fictionalTaxPaise != null && <div><dt>Fictional test tax</dt><dd>{formatPaise(order.snapshot.fictionalTaxPaise)}</dd></div>}<div><dt>Order total</dt><dd>{formatPaise(order.totalPaise)}</dd></div></dl>{order.snapshot.chargesAreFictional && <p>Shipping and tax are fictional test amounts.</p>}</section>
        <div className={styles.addresses}><section><h2>Shipping address</h2><AddressView value={order.snapshot.shipping} /></section><section><h2>Billing address</h2><AddressView value={order.snapshot.billing} /></section></div>
      </>}
    </article>
  </main>;
}
