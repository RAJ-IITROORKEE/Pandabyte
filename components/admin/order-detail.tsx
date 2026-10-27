"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useUser } from "@clerk/nextjs";
import { useAdminCapabilities } from "@/components/admin/admin-shell";
import { AdminAccessDeniedScreen } from "@/components/admin/record-screens";
import type { AdminOrderStatus } from "@/lib/admin/orders-contract";
import styles from "./admin-ui.module.css";
import detail from "./order-detail.module.css";

type Address = { recipientName: string; phone: string; line1: string; line2: string; city: string; state: string; postalCode: string; country: string };
type Shipping = { carrier: string; trackingNumber: string; trackingUrl: string };
type Order = { reference: string; status: AdminOrderStatus; totalPaise: number; version: number; paymentState: string; environment: string; snapshot: { contact?: { firstName: string; lastName: string; email: string; phone: string }; shipping?: Address; billing?: Address; business?: string; gstin?: string; shipment?: Partial<Shipping>; fictionalShippingPaise?: number; fictionalTaxPaise?: number; chargesAreFictional?: boolean; quote?: { subtotalPaise: number; lines: { variantId: string; title: string; quantity: number; lineTotalPaise: number; variant: { sku: string; label: string } }[] } } };
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value / 100);
const blankShipping = { carrier: "", trackingNumber: "", trackingUrl: "" };
function AddressView({ address }: { address?: Address }) { return address ? <p>{address.recipientName}<br />{address.line1}{address.line2 && <><br />{address.line2}</>}<br />{address.city}, {address.state} {address.postalCode}<br />{address.country}<br />{address.phone}</p> : <p>Not available</p>; }
export function AdminOrderDetail({ reference }: { reference: string }) {
  const { isLoaded, user } = useUser();
  if (!isLoaded) return <p role="status">Loading order access…</p>;
  if (!user) return <AdminAccessDeniedScreen title="Order" />;
  return <OrderDetailSession key={`${user.id}:${reference}`} reference={reference} />;
}
function OrderDetailSession({ reference }: { reference: string }) {
  const canManage = useAdminCapabilities().includes("staff.manage");
  const [order, setOrder] = useState<Order | null>(null);
  const [status, setStatus] = useState<AdminOrderStatus>("pending");
  const [shipping, setShipping] = useState<Shipping>(blankShipping);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!canManage) return;
    const controller = new AbortController();
    fetch(`/api/admin/orders/${encodeURIComponent(reference)}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Order details could not be loaded.");
      return response.json() as Promise<Order>;
    }).then(value => {
      if (controller.signal.aborted) return;
      setOrder(value); setStatus(value.status); setShipping({ ...blankShipping, ...value.snapshot.shipment }); setError("");
    }).catch(() => { if (!controller.signal.aborted) setError("Order details could not be loaded."); });
    return () => controller.abort();
  }, [canManage, reference, reload]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!order || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(reference)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: order.version, status, shipping }) });
      if (!response.ok) throw new Error(response.status === 409 ? "This order changed or the status transition is not allowed. Reload before trying again." : "Order changes could not be saved. Check the fields and try again.");
      const value = await response.json() as Order;
      setOrder(value); setStatus(value.status); setShipping({ ...blankShipping, ...value.snapshot.shipment }); setNotice("Order updated.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Order changes could not be saved."); }
    finally { setBusy(false); }
  }
  if (!canManage) return <AdminAccessDeniedScreen title="Order" />;
  return <div className={styles.screen}>
    <Link href="/admin/orders">← All orders</Link>
    <header className={styles.pageHeading}><div><p className={styles.eyebrow}>Operations</p><h1>Order {reference}</h1><p className={styles.lede}>Development simulation. No payment was collected and no stock was reserved.</p></div></header>
    {error && <div className={styles.errorBanner} role="alert"><p>{error}</p><button className={styles.secondaryButton} type="button" disabled={busy} onClick={() => setReload(n => n + 1)}>Reload order</button></div>}
    {notice && <p role="status">{notice}</p>}
    {!order && !error && <p role="status">Loading order…</p>}
    {order && <>
      <section className={detail.card}><h2>Order summary</h2><p>Status: {order.status} · Payment: {order.paymentState === "simulated" ? "Simulated, no payment collected" : "Unconfigured"} · Environment: {order.environment}</p><p>Total: {money(order.totalPaise)}</p>{order.snapshot.chargesAreFictional && <p>Shipping and tax are fictional test amounts, not final charges.</p>}
      {order.snapshot.quote?.lines.map(line => <p key={line.variantId}>{line.title} {line.variant?.label && `· ${line.variant.label}`} × {line.quantity} — {money(line.lineTotalPaise)}</p>)}
      {order.snapshot.quote && <p>Subtotal: {money(order.snapshot.quote.subtotalPaise)} · Test shipping: {money(order.snapshot.fictionalShippingPaise ?? 0)} · Test tax: {money(order.snapshot.fictionalTaxPaise ?? 0)}</p>}</section>
      <div className={detail.columns}><section className={detail.card}><h2>Contact</h2>{order.snapshot.contact ? <p>{order.snapshot.contact.firstName} {order.snapshot.contact.lastName}<br />{order.snapshot.contact.email}<br />{order.snapshot.contact.phone}</p> : <p>Not available</p>}{order.snapshot.business && <p>{order.snapshot.business}</p>}{order.snapshot.gstin && <p>GSTIN: {order.snapshot.gstin}</p>}</section><section className={detail.card}><h2>Shipping address</h2><AddressView address={order.snapshot.shipping} /></section><section className={detail.card}><h2>Billing address</h2><AddressView address={order.snapshot.billing} /></section></div>
      <form className={detail.card} onSubmit={save}><h2>Update order</h2><div className={detail.fields}>
        <label>Status<select className={styles.input} value={status} onChange={e => setStatus(e.target.value as AdminOrderStatus)}><option value="pending">Pending</option><option value="processing">Processing</option><option value="fulfilled">Fulfilled</option><option value="cancelled">Cancelled</option></select></label>
        <label>Carrier<input className={styles.input} maxLength={100} value={shipping.carrier} onChange={e => setShipping({ ...shipping, carrier: e.target.value })} /></label>
        <label>Tracking number<input className={styles.input} maxLength={120} value={shipping.trackingNumber} onChange={e => setShipping({ ...shipping, trackingNumber: e.target.value })} /></label>
        <label>Tracking URL<input className={styles.input} type="url" maxLength={500} value={shipping.trackingUrl} onChange={e => setShipping({ ...shipping, trackingUrl: e.target.value })} /></label>
      </div><button className={styles.primaryButton} type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></form>
    </>}
  </div>;
}
