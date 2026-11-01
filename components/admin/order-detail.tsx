"use client";

import { AdminNotice } from "./admin-notice";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useUser } from "@clerk/nextjs";
import { IconArrowLeft, IconCheck, IconCopy, IconCreditCard, IconPackage, IconRefresh, IconTruck, IconUser, IconX } from "@tabler/icons-react";
import { useAdminCapabilities } from "@/components/admin/admin-shell";
import { canAdminPermission } from "@/lib/admin/access-contract";
import { AdminAccessDeniedScreen } from "@/components/admin/record-screens";
import type { AdminOrderStatus } from "@/lib/admin/orders-contract";
import type { AdminOrderActivityResponse } from "@/lib/admin/order-activity-contract";
import styles from "./admin-ui.module.css";
import detail from "./order-detail.module.css";

type Address = { recipientName: string; phone: string; line1: string; line2: string; city: string; state: string; postalCode: string; country: string };
type Shipping = { carrier: string; trackingNumber: string; trackingUrl: string };
type Order = { reference: string; status: AdminOrderStatus; totalPaise: number; version: number; paymentState: string; environment: string; createdAt?: string; updatedAt?: string; snapshot: { contact?: { firstName: string; lastName: string; email: string; phone: string }; shipping?: Address; billing?: Address; business?: string; gstin?: string; shipment?: Partial<Shipping>; fictionalShippingPaise?: number; fictionalTaxPaise?: number; chargesAreFictional?: boolean; quote?: { subtotalPaise: number; lines: { variantId: string; title: string; quantity: number; lineTotalPaise: number; variant?: { sku?: string; label?: string; effectivePricePaise?: number | null } | null }[] } } };
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value / 100);
const blankShipping = { carrier: "", trackingNumber: "", trackingUrl: "" };
const statusLabels: Record<AdminOrderStatus, string> = { pending: "Pending", processing: "Processing", fulfilled: "Fulfilled", cancelled: "Cancelled" };
function dateTime(value?: string) { return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)) + " IST" : "Not recorded"; }
function paymentLabel(value: string) { return ({ simulated: "Simulated", paid: "Paid", pending: "Pending", verified: "Verified · awaiting capture", failed: "Failed", cancelled: "Cancelled", review: "Needs review", unconfigured: "Unconfigured" } as Record<string, string>)[value] ?? value; }
function orderBackHref(returnTo?: string) { return returnTo && /^\/admin\/orders(?:\?[^#\u0000-\u001f\u007f]*)?$/.test(returnTo) ? returnTo : "/admin/orders"; }
function allowedStatuses(order: Order): AdminOrderStatus[] {
  if (order.environment === "simulation" && order.paymentState === "simulated") return order.status === "pending" ? ["pending", "processing", "cancelled"] : order.status === "processing" ? ["processing", "fulfilled", "cancelled"] : [order.status];
  if (order.environment === "razorpay_test" && order.paymentState === "paid") return order.status === "pending" ? ["pending", "processing"] : order.status === "processing" ? ["processing", "fulfilled"] : [order.status];
  return [];
}
function AddressView({ address }: { address?: Address }) { return address ? <address className={detail.address}><strong>{address.recipientName}</strong><span>{address.line1}</span>{address.line2 && <span>{address.line2}</span>}<span>{address.city}, {address.state} {address.postalCode}</span><span>{address.country}</span><span>{address.phone}</span></address> : <p className={detail.muted}>No address snapshot recorded.</p>; }
function TrackingLink({ url }: { url?: string }) { if (!url) return null; try { const parsed = new URL(url); if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null; } catch { return null; } return <a href={url} target="_blank" rel="noopener noreferrer">Track shipment</a>; }

export function AdminOrderDetail({ reference, returnTo }: { reference: string; returnTo?: string }) {
  const { isLoaded, user } = useUser();
  if (!isLoaded) return <p role="status">Loading order access…</p>;
  if (!user) return <AdminAccessDeniedScreen title="Order" />;
  return <OrderDetailSession key={`${user.id}:${reference}`} reference={reference} returnTo={returnTo} />;
}
function OrderDetailSession({ reference, returnTo }: { reference: string; returnTo?: string }) {
  const capabilities = useAdminCapabilities();
  const canManage = (capabilities.includes("staff.manage") || (capabilities.includes("__custom_role__") && capabilities.includes("orders.read"))) && canAdminPermission(capabilities, "orders", "read");
  const canUpdate = canManage && canAdminPermission(capabilities, "orders", "update");
  const [order, setOrder] = useState<Order | null>(null);
  const [status, setStatus] = useState<AdminOrderStatus>("pending");
  const [shipping, setShipping] = useState<Shipping>(blankShipping);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const [loadFailure, setLoadFailure] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activity, setActivity] = useState<AdminOrderActivityResponse | null>(null);
  const [activityError, setActivityError] = useState(false);
  useEffect(() => {
    if (!canManage) return;
    const controller = new AbortController();
    fetch(`/api/admin/orders/${encodeURIComponent(reference)}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(String(response.status));
      return response.json() as Promise<Order>;
    }).then(value => {
      if (controller.signal.aborted) return;
      setOrder(value); setLoadFailure(null); setRefreshing(false);
    }).catch(reason => { if (!controller.signal.aborted) { setLoadFailure(Number(reason instanceof Error ? reason.message : 503) || 503); setRefreshing(false); } });
    fetch(`/api/admin/orders/${encodeURIComponent(reference)}/activity`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Activity unavailable");
      return response.json() as Promise<AdminOrderActivityResponse>;
    }).then(value => { if (!controller.signal.aborted) { setActivity(value); setActivityError(false); } }).catch(() => { if (!controller.signal.aborted) setActivityError(true); });
    return () => controller.abort();
  }, [canManage, reference, reload]);
  function refresh() { setActivity(null); setActivityError(false); setRefreshing(true); setReload(n => n + 1); }
  function openEditor() { if (!canUpdate || !order) return; setStatus(order.status); setShipping({ ...blankShipping, ...order.snapshot.shipment }); setError(""); dialog?.showModal(); }
  async function copyReference() { try { await navigator.clipboard.writeText(reference); setCopied(true); setNotice("Order reference copied."); } catch { setNotice("Copy unavailable. Select the full order reference below to copy it."); } }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!canUpdate || !order || busy || refreshing || !allowedStatuses(order).includes(status)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(reference)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: order.version, status, shipping }) });
      if (!response.ok) throw new Error(response.status === 409 ? "This order changed or the transition is no longer allowed. Refresh the latest order, review the current status, and save again. Your input is preserved." : response.status === 401 || response.status === 403 ? "Your access changed. Sign in with an authorized account before saving." : "Order changes could not be saved. Check the fields and try again. Your input is preserved.");
      const value = await response.json() as Order;
      setOrder(value); setLoadFailure(null); setActivity(null); setActivityError(false); setReload(n => n + 1); setStatus(value.status); setShipping({ ...blankShipping, ...value.snapshot.shipment }); setNotice("Order updated. Customer order history uses the same saved record."); dialog?.close();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Order changes could not be saved."); }
    finally { setBusy(false); }
  }
  if (!canManage || loadFailure === 401 || loadFailure === 403) return <AdminAccessDeniedScreen title="Order" />;
  const transitions = order ? allowedStatuses(order) : [];
  const contact = order?.snapshot.contact;
  const customerName = contact ? `${contact.firstName} ${contact.lastName}`.trim() : "Customer unavailable";
  const initials = contact ? `${contact.firstName?.[0] ?? ""}${contact.lastName?.[0] ?? ""}` : "?";
  const lines = order?.snapshot.quote?.lines ?? [];
  const environment = order?.environment === "razorpay_test" ? "Razorpay test" : order?.environment === "simulation" ? "Simulation" : "Historical record";
  return <div className={`${styles.screen} ${detail.screen}`}>
    <Link className={detail.back} href={orderBackHref(returnTo)}><IconArrowLeft size={16} aria-hidden="true" /> Back to orders</Link>
    <header className={detail.heading}><div><div className={detail.titleRow}><h1>Order <span title={reference}>{reference.length > 24 ? `${reference.slice(0, 12)}…${reference.slice(-6)}` : reference}</span></h1><button className={detail.iconButton} type="button" aria-label="Copy full order reference" onClick={() => void copyReference()}>{copied ? <IconCheck size={17} aria-hidden="true" /> : <IconCopy size={17} aria-hidden="true" />}</button></div><p className={detail.placed}>Placed {dateTime(order?.createdAt)}</p>{order && <div className={detail.badges}><span className={detail.badge}>{paymentLabel(order.paymentState)}</span><span className={detail.badge}>{statusLabels[order.status]}</span><span className={detail.environment}>{environment}</span></div>}</div><div className={detail.actions}>{order?.environment === "razorpay_test" && order.paymentState === "paid" && <a className={styles.secondaryButton} href={`/api/admin/orders/${encodeURIComponent(reference)}/document`} download>Download test bill PDF</a>}<button className={styles.secondaryButton} type="button" disabled={busy || refreshing} onClick={refresh}><IconRefresh size={16} aria-hidden="true" />{refreshing ? "Refreshing…" : "Refresh"}</button>{canUpdate && order && transitions.length > 0 && <button className={styles.primaryButton} type="button" disabled={busy || refreshing} onClick={openEditor}>Update status</button>}</div></header>
    <p className={detail.fullReference}>Full reference <span>{reference}</span></p>
    {notice && <AdminNotice tone="success" onDismiss={() => setNotice("")}>{notice}</AdminNotice>}
    {loadFailure && <AdminNotice key={`${loadFailure}:${reload}`} tone="error"><div><h2>{loadFailure === 404 ? "Order not found" : "Order could not be loaded"}</h2><p>{loadFailure === 404 ? "This reference is unavailable in the current order system. Return to orders to choose another record." : "The latest details are unavailable. Refresh to try again; existing details may be out of date."}</p></div></AdminNotice>}
    {!order && !loadFailure && <div className={detail.card} role="status">Loading order details…</div>}
    {order && <>
      <div className={detail.context}><IconPackage size={18} aria-hidden="true" /><p>{order.environment === "razorpay_test" ? "Razorpay test order. No real stock was reserved; provider test payments are not live sales." : order.environment === "simulation" ? "Development simulation. No payment was collected and no real stock was reserved." : "Historical order record. Payment and stock effects are unavailable."}</p></div>
      <section className={detail.summary} aria-label="Order overview"><div><IconCreditCard size={18} aria-hidden="true" /><span>Order total</span><strong>{money(order.totalPaise)}</strong></div><div><IconCheck size={18} aria-hidden="true" /><span>Payment status</span><strong>{paymentLabel(order.paymentState)}</strong></div><div><IconTruck size={18} aria-hidden="true" /><span>Fulfillment status</span><strong>{statusLabels[order.status]}</strong></div><div><IconUser size={18} aria-hidden="true" /><span>Customer</span><strong>{customerName}</strong></div></section>
      <div className={detail.columns}><div className={detail.main}>
        <section className={detail.card}><header className={detail.cardHeading}><h2>Ordered items</h2><span>{lines.length} product {lines.length === 1 ? "line" : "lines"}</span></header><p className={detail.muted}>Purchased product and price snapshots. Images were not recorded on these orders.</p>{lines.length ? <div className={detail.tableScroll} tabIndex={0} role="region" aria-label="Purchased items"><table className={detail.items}><thead><tr><th scope="col">Product</th><th scope="col">Qty</th><th scope="col">Unit price</th><th scope="col">Line total</th></tr></thead><tbody>{lines.map((line, index) => <tr key={`${line.variantId}:${index}`}><td><div className={detail.product}><span className={detail.thumbnail} title="Purchased image not recorded"><IconPackage size={22} aria-hidden="true" /></span><div><strong>{line.title || "Product unavailable"}</strong>{line.variant?.label && <span>{line.variant.label}</span>}<span>SKU: {line.variant?.sku || "Not recorded"}</span></div></div></td><td>{line.quantity}</td><td>{line.variant?.effectivePricePaise != null ? money(line.variant.effectivePricePaise) : "Not recorded"}</td><td>{money(line.lineTotalPaise)}</td></tr>)}</tbody></table></div> : <p>No item snapshots recorded.</p>}</section>
        <section className={detail.card}><h2>Financial breakdown</h2><dl className={detail.financial}><div><dt>Subtotal</dt><dd>{order.snapshot.quote ? money(order.snapshot.quote.subtotalPaise) : "Not recorded"}</dd></div><div><dt>{order.snapshot.chargesAreFictional ? "Fictional test shipping" : "Shipping"}</dt><dd>{order.snapshot.fictionalShippingPaise != null ? money(order.snapshot.fictionalShippingPaise) : "Not recorded"}</dd></div><div><dt>{order.snapshot.chargesAreFictional ? "Fictional test tax" : "Tax"}</dt><dd>{order.snapshot.fictionalTaxPaise != null ? money(order.snapshot.fictionalTaxPaise) : "Not recorded"}</dd></div><div className={detail.total}><dt>Order total</dt><dd>{money(order.totalPaise)}</dd></div></dl>{order.snapshot.chargesAreFictional && <p className={detail.muted}>Shipping and tax are fictional test amounts, not final charges.</p>}<p className={detail.muted}>Separate discount, paid and refunded amounts are not recorded.</p></section>
        <section className={detail.card}><h2>Order activity</h2>{activity ? <>{activity.items.length ? <ol className={detail.timeline}>{activity.items.map((event, index) => <li key={`${event.occurredAt}:${index}`}><span className={detail.timelineDot} /><div><strong>{({ "order.update": "Order updated", "order.simulate": "Simulation order created", "order.razorpay_test_prepare": "Razorpay test order prepared", "order.razorpay_test_capture": "Test payment captured" } as Record<string, string>)[event.action] ?? event.action}</strong><time dateTime={event.occurredAt}>{dateTime(event.occurredAt)}</time><p>{event.action === "order.razorpay_test_capture" ? "Payment reconciliation · recorded account: " : "By "}{event.actorLabel}{event.status ? ` · Fulfillment: ${statusLabels[event.status]}` : ""}</p>{event.requiresReview === true && <p>Payment requires review.</p>}</div></li>)}</ol> : <p className={detail.muted}>No recorded activity is available for this order.</p>}{activity.truncated && <p className={detail.muted}>Showing the latest {activity.items.length} of {activity.total} recorded events.</p>}<p className={detail.muted}>Previous statuses and internal reasons were not recorded on these events.</p></> : activityError ? <AdminNotice key={reload} tone="error">Order activity could not be loaded. Refresh the order to try again.</AdminNotice> : <p className={detail.muted} role="status">Loading recorded order activity…</p>}<p className={detail.muted}>Latest record update: {dateTime(order.updatedAt)}.</p></section>
      </div><aside className={detail.sidebar} aria-label="Customer and delivery details">
        <section className={detail.card}><h2>Customer</h2><div className={detail.customer}><span className={detail.avatar} aria-hidden="true">{initials}</span><strong>{customerName}</strong></div><dl className={detail.metadata}><div><dt>Email</dt><dd>{contact?.email || "Not recorded"}</dd></div><div><dt>Contact phone</dt><dd>{contact?.phone || "Not recorded"}</dd></div></dl><p className={detail.muted}>Contact snapshot from this order.</p></section>
        <section className={detail.card}><h2>Shipping address</h2><AddressView address={order.snapshot.shipping} /></section>
        <section className={detail.card}><h2>Billing address</h2><AddressView address={order.snapshot.billing} />{order.snapshot.business && <p>{order.snapshot.business}</p>}{order.snapshot.gstin && <p>GSTIN: {order.snapshot.gstin}</p>}</section>
        <section className={detail.card}><h2>Payment information</h2><dl className={detail.metadata}><div><dt>Provider</dt><dd>{order.environment === "razorpay_test" ? "Razorpay" : "No payment provider"}</dd></div><div><dt>Environment</dt><dd>{environment}</dd></div><div><dt>Status</dt><dd>{paymentLabel(order.paymentState)}</dd></div></dl><p className={detail.muted}>{order.environment === "simulation" ? "Simulated only; no payment collected." : "Provider order and payment references are not available from this endpoint."}</p>{order.paymentState === "review" && <p>Payment requires review. Fulfillment updates are disabled.</p>}</section>
        <section className={detail.card}><h2>Shipping / fulfillment</h2><dl className={detail.metadata}><div><dt>Carrier</dt><dd>{order.snapshot.shipment?.carrier || "Not recorded"}</dd></div><div><dt>Tracking number</dt><dd>{order.snapshot.shipment?.trackingNumber || "Not recorded"}</dd></div><div><dt>Delivery method</dt><dd>Not recorded</dd></div><div><dt>Dispatch / delivery dates</dt><dd>Not recorded</dd></div></dl><TrackingLink url={order.snapshot.shipment?.trackingUrl} /><p className={detail.muted}>Fulfilled does not confirm carrier delivery.</p></section>
      </aside></div>
      {transitions.length === 0 && <p className={detail.context}>This payment history is read-only. Payment verification remains separate from fulfillment management.</p>}
    </>}
    {canUpdate && <dialog ref={setDialog} className={detail.dialog} aria-labelledby="order-update-title" aria-describedby="order-update-description" onCancel={event => { if (busy) event.preventDefault(); }}><form onSubmit={save}><header className={detail.dialogHeading}><h2 id="order-update-title">Update order status</h2><button className={detail.iconButton} type="button" aria-label="Close status update" disabled={busy} onClick={() => dialog?.close()}><IconX size={18} aria-hidden="true" /></button></header><p id="order-update-description" className={detail.muted}>Current fulfillment: {order ? statusLabels[order.status] : "Unavailable"}. Save updates fulfillment and shipment details only. Payment verification stays unchanged.</p><div className={detail.fields}><label htmlFor="order-status">Fulfillment status<select id="order-status" className={styles.input} value={status} disabled={busy || refreshing} onChange={e => setStatus(e.target.value as AdminOrderStatus)}>{!transitions.includes(status) && <option value={status} disabled>Previously selected: {statusLabels[status]} — choose an allowed status</option>}{transitions.map(value => <option key={value} value={value}>{statusLabels[value]}{value === order?.status ? " (current)" : ""}</option>)}</select></label><label htmlFor="order-carrier">Carrier<input id="order-carrier" className={styles.input} maxLength={100} value={shipping.carrier} disabled={busy} onChange={e => setShipping({ ...shipping, carrier: e.target.value })} /></label><label htmlFor="order-tracking">Tracking number<input id="order-tracking" className={styles.input} maxLength={120} value={shipping.trackingNumber} disabled={busy} onChange={e => setShipping({ ...shipping, trackingNumber: e.target.value })} /></label><label htmlFor="order-tracking-url">Tracking URL (HTTPS)<input id="order-tracking-url" className={styles.input} type="url" pattern="https://.*" maxLength={500} value={shipping.trackingUrl} disabled={busy} onChange={e => setShipping({ ...shipping, trackingUrl: e.target.value })} /></label></div>{status === "cancelled" && <p className={detail.muted}>Cancellation is final and releases only this simulation’s fixture stock. No real inventory or refund is affected.</p>}{error && <AdminNotice key={`${error}:${reload}`} tone="error" actions={<button className={styles.secondaryButton} type="button" disabled={busy || refreshing} onClick={refresh}>{refreshing ? "Refreshing…" : "Refresh latest order"}</button>}><p>{error}</p></AdminNotice>}{loadFailure && <AdminNotice key={reload} tone="error">Refresh failed. Try refreshing again before saving.</AdminNotice>}<footer className={detail.dialogActions}><button className={styles.secondaryButton} type="button" disabled={busy} onClick={() => dialog?.close()}>Cancel</button><button className={styles.primaryButton} type="submit" disabled={busy || refreshing || !transitions.includes(status)}>{busy ? "Saving…" : "Save changes"}</button></footer></form></dialog>}
  </div>;
}
