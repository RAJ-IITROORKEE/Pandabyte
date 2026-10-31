"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package, Search, ExternalLink, RefreshCw } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import styles from "./account-orders.module.css";

type Address = { recipientName: string; phone: string; line1: string; line2: string; city: string; state: string; postalCode: string; country: string };
type Order = { reference: string; createdAt?: string; status: string; totalPaise: number; paymentState: string; environment: string; snapshot: { fictionalShippingPaise?: number; fictionalTaxPaise?: number; shipping?: Address; billing?: Address; shipment?: { carrier?: string; trackingNumber?: string; trackingUrl?: string }; chargesAreFictional?: boolean; quote?: { subtotalPaise?: number; lines: { title: string; slug?: string | null; quantity: number; lineTotalPaise: number; variant?: { label?: string; effectivePricePaise?: number | null } }[] } } };
type Orders = { items: Order[]; total: number; limit: number; offset: number };
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value / 100);

export function useAccountOrders(userId: string | undefined) {
  const [result, setResult] = useState<{ userId: string; offset: number; reload: number; query: string; status: string; orders: Orders | null; error: string } | null>(null);
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const current = result && result.userId === userId && result.offset === offset && result.reload === reload && result.query === query && result.status === status ? result : null;
  const orders = current?.orders ?? null;
  const error = current?.error ?? "";
  useEffect(() => {
    if (!userId) return;
    const currentUserId = userId;
    let controller: AbortController;
    function load() {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      fetch(`/api/account/orders?limit=20&offset=${offset}&q=${encodeURIComponent(query)}&status=${status}`, { cache: "no-store", signal })
        .then(async response => {
          if (!response.ok) throw new Error();
          const value = await response.json() as Orders;
          if (!Array.isArray(value.items) || !Number.isSafeInteger(value.total)) throw new Error();
          return value;
        })
        .then(value => { if (!signal.aborted) { setResult({ userId: currentUserId, offset, reload, query, status, orders: value, error: "" }); } })
        .catch(() => { if (!signal.aborted) { setResult({ userId: currentUserId, offset, reload, query, status, orders: null, error: "Your orders could not be loaded. Please try again." }); } });
    }
    load();
    window.addEventListener("focus", load);
    return () => { controller.abort(); window.removeEventListener("focus", load); };
  }, [userId, offset, reload, query, status]);
  return { orders, error, setOffset, query, status, search: (value: string) => { setOffset(0); setQuery(value.trim()); }, filter: (value: string) => { setOffset(0); setStatus(value); }, retry: () => setReload(n => n + 1) };
}

function AddressView({ address }: { address?: Address }) {
  return address ? <p>{address.recipientName}<br />{address.line1}{address.line2 && <><br />{address.line2}</>}<br />{address.city}, {address.state} {address.postalCode}<br />{address.country}<br />{address.phone}</p> : <p>Not available</p>;
}
function trackingLink(url?: string) {
  if (!url) return null;
  try { const parsed = new URL(url); return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : null; } catch { return null; }
}

export function AccountOrders({ data }: { data: ReturnType<typeof useAccountOrders> }) {
  const { orders, error, retry, setOffset, query, status, search, filter } = data;
  const [searchText, setSearchText] = useState(query);
  const filtered = !!query || status !== "all";
  return <div className={styles.history}>
    <header><h1>My Orders</h1><p>Track current orders and revisit your PandaByte purchases.</p></header>
    <div className={styles.toolbar}>
      <div className={styles.filters} role="group" aria-label="Filter orders">
        {[["all", "All"], ["active", "Active"], ["delivered", "Delivered"], ["cancelled", "Cancelled"], ["fulfilled", "Fulfilled"]].map(([value, label]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => filter(value)}>{label}</button>)}
      </div>
      <form className={styles.search} onSubmit={event => { event.preventDefault(); search(searchText); }} role="search" aria-label="Search your orders">
        <input aria-label="Order number" placeholder="Search order number" value={searchText} onChange={event => setSearchText(event.target.value)} maxLength={80} pattern={"[A-Za-z0-9\\-]*"} title="Use letters, numbers and hyphens" />
        <button className={buttonClassName({ variant: "ghost", size: "icon" })} type="submit" aria-label="Search orders"><Search size={18} aria-hidden="true" /></button>
      </form>
    </div>
    <div className={styles.refresh}><span>Newest first · Updates on return to this window</span><button className={buttonClassName({ variant: "ghost", size: "compact" })} type="button" onClick={retry}><RefreshCw size={14} aria-hidden="true" />Refresh</button></div>
    {error ? <div className={styles.empty} role="alert"><p>{error}</p><button className={buttonClassName({ variant: "secondary" })} type="button" onClick={retry}>Retry</button></div>
      : !orders ? <div role="status" aria-label="Loading orders" className={styles.skeletons}>{[1, 2, 3].map(n => <div className={styles.skeleton} key={n} />)}<span>Loading orders…</span></div>
      : !orders.total ? <div className={styles.empty}><Package aria-hidden="true" size={28} /><h2>{filtered ? "No matching orders" : "No orders yet"}</h2><p>{status === "delivered" ? "Confirmed delivery is not recorded yet. Check Fulfilled for completed fulfillment." : filtered ? "Try another order number or clear the filters." : "Your PandaByte purchases will appear here."}</p>{filtered ? <button className={buttonClassName({ variant: "secondary" })} type="button" onClick={() => { setSearchText(""); search(""); filter("all"); }}>Clear filters</button> : <Link className={buttonClassName()} href="/shop">Explore the shop</Link>}</div>
      : <div className={styles.list}>{orders.items.map(order => {
      const shipment = order.snapshot.shipment;
      const tracking = trackingLink(shipment?.trackingUrl);
      const lines = order.snapshot.quote?.lines ?? [];
      const units = lines.reduce((sum, line) => sum + line.quantity, 0);
      const date = order.createdAt && !Number.isNaN(Date.parse(order.createdAt)) ? new Date(order.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST" : "Date unavailable";
      return <article key={order.reference} className={styles.card}>
        <div className={styles.cardTop}>
          <div className={styles.thumbnails} aria-label={`${lines.length} product lines; purchased images unavailable`}>
            {lines.slice(0, 3).map((line, index) => <span key={index} title={`${line.title} — purchased image unavailable`}><Package size={22} aria-hidden="true" /></span>)}
            {lines.length > 3 && <span>+{lines.length - 3}</span>}
          </div>
          <div className={styles.metadata}><div className={styles.reference}><strong>{order.reference}</strong><span className={styles.badge} data-status={order.status}>{order.status.charAt(0).toUpperCase() + order.status.slice(1)}</span></div><p>{date} · {units} {units === 1 ? "unit" : "units"} · {lines.length} product {lines.length === 1 ? "line" : "lines"}</p><p>Payment: {order.paymentState.replaceAll("_", " ")}</p>{shipment?.trackingNumber && <p>Tracking: {shipment.trackingNumber}</p>}</div>
          <div className={styles.total}><small>Order total</small><strong>{money(order.totalPaise)}</strong>{tracking && <a href={tracking} target="_blank" rel="noopener noreferrer">Track <ExternalLink size={14} aria-hidden="true" /></a>}</div>
        </div>
        <details className={styles.details}>
        <summary>View order <span className={styles.srOnly}>{order.reference}</span></summary>
        <div className={styles.detailBody}>
        {(order.environment === "simulation" || order.environment === "razorpay_test") && <p className={styles.notice}>{order.environment === "simulation" ? "Simulated order. No payment was collected and no stock was reserved." : "Razorpay test order. No real stock was reserved."}{order.snapshot.chargesAreFictional && " Shipping and tax are fictional test amounts."}</p>}
        <section aria-label="Ordered items"><h3>Items in this order</h3>{lines.length ? <ul className={styles.items}>{lines.map((line, index) => <li className={styles.item} key={index}><span className={styles.itemIcon}><Package size={20} aria-hidden="true" /></span><div className={styles.itemInfo}>{line.slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(line.slug) ? <Link href={`/products/${line.slug}`}>{line.title}</Link> : <strong>{line.title}</strong>}{line.variant?.label && line.variant.label !== line.title && <span>{line.variant.label}</span>}<span>Qty {line.quantity}{typeof line.variant?.effectivePricePaise === "number" && ` · ${money(line.variant.effectivePricePaise)} each`}</span></div><strong>{money(line.lineTotalPaise)}</strong></li>)}</ul> : <p>Item details are unavailable for this order.</p>}</section>
        <div className={styles.detailGrid}><section><h3>Delivery details</h3><h4>Shipping address</h4><AddressView address={order.snapshot.shipping} /><h4>Billing address</h4><AddressView address={order.snapshot.billing} />{(shipment?.carrier || shipment?.trackingNumber) && <p>Shipment: {shipment?.carrier}{shipment?.trackingNumber && ` · ${shipment.trackingNumber}`}</p>}{tracking ? <a href={tracking} target="_blank" rel="noopener noreferrer">Track shipment</a> : <p>Tracking link is not available.</p>}</section>
        <section><h3>Order summary</h3><dl>{order.snapshot.quote?.subtotalPaise !== undefined && <><dt>Subtotal</dt><dd>{money(order.snapshot.quote.subtotalPaise)}</dd></>}{order.snapshot.fictionalShippingPaise !== undefined && <><dt>Test shipping</dt><dd>{money(order.snapshot.fictionalShippingPaise)}</dd></>}{order.snapshot.fictionalTaxPaise !== undefined && <><dt>Test tax</dt><dd>{money(order.snapshot.fictionalTaxPaise)}</dd></>}<dt className={styles.grandTotal}>Order total</dt><dd className={styles.grandTotal}>{money(order.totalPaise)}</dd></dl><p>Payment: {order.paymentState === "simulated" ? "Simulated" : order.paymentState.replaceAll("_", " ")}</p></section></div>
        <div className={styles.documents}><Link href={`/account/order-summary/${encodeURIComponent(order.reference)}`}>Print or save order summary</Link>{order.environment === "razorpay_test" && order.paymentState === "paid" ? <a href={`/api/account/orders/${encodeURIComponent(order.reference)}/document`} download>Download test bill PDF (not a tax invoice)</a> : <span>No issued invoice is available.</span>}</div>
        </div></details>
      </article>;
    })}</div>}
    {orders && <footer className={styles.pagination}><span role="status">{orders.total ? `${orders.offset + 1}–${orders.offset + orders.items.length} of ${orders.total}` : "0"} {filtered ? "matching orders" : "orders"}</span><div>{orders.offset > 0 && <button type="button" onClick={() => setOffset(Math.max(0, orders.offset - orders.limit))}>Previous</button>}{orders.offset < 10000 && orders.offset + orders.items.length < orders.total && <button type="button" onClick={() => setOffset(orders.offset + orders.limit)}>Next</button>}</div></footer>}
  </div>;
}
