"use client";

import { useEffect, useState } from "react";

type Address = { recipientName: string; phone: string; line1: string; line2: string; city: string; state: string; postalCode: string; country: string };
type Order = { reference: string; status: string; totalPaise: number; paymentState: string; environment: string; snapshot: { shipping?: Address; billing?: Address; shipment?: { carrier?: string; trackingNumber?: string; trackingUrl?: string }; chargesAreFictional?: boolean; quote?: { lines: { title: string; quantity: number; lineTotalPaise: number; variant?: { label?: string } }[] } } };
type Orders = { items: Order[]; total: number; limit: number; offset: number };
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value / 100);

export function useAccountOrders(userId: string | undefined) {
  const [result, setResult] = useState<{ userId: string; offset: number; reload: number; orders: Orders | null; error: string } | null>(null);
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const current = result && result.userId === userId && result.offset === offset && result.reload === reload ? result : null;
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
      fetch(`/api/account/orders?limit=20&offset=${offset}`, { cache: "no-store", signal })
        .then(async response => {
          if (!response.ok) throw new Error();
          const value = await response.json() as Orders;
          if (!Array.isArray(value.items) || !Number.isSafeInteger(value.total)) throw new Error();
          return value;
        })
        .then(value => { if (!signal.aborted) { setResult({ userId: currentUserId, offset, reload, orders: value, error: "" }); } })
        .catch(() => { if (!signal.aborted) { setResult({ userId: currentUserId, offset, reload, orders: null, error: "Your orders could not be loaded. Please try again." }); } });
    }
    load();
    window.addEventListener("focus", load);
    return () => { controller.abort(); window.removeEventListener("focus", load); };
  }, [userId, offset, reload]);
  return { orders, error, setOffset, retry: () => setReload(n => n + 1) };
}

function AddressView({ address }: { address?: Address }) {
  return address ? <p>{address.recipientName}<br />{address.line1}{address.line2 && <><br />{address.line2}</>}<br />{address.city}, {address.state} {address.postalCode}<br />{address.country}<br />{address.phone}</p> : <p>Not available</p>;
}
function trackingLink(url?: string) {
  if (!url) return null;
  try { const parsed = new URL(url); return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : null; } catch { return null; }
}

export function AccountOrders({ data }: { data: ReturnType<typeof useAccountOrders> }) {
  const { orders, error, retry, setOffset } = data;
  if (error) return <><p role="alert">{error}</p><button type="button" onClick={retry}>Try again</button></>;
  if (!orders) return <p role="status">Loading orders…</p>;
  if (!orders.total) return <p>You have no orders yet.</p>;
  return <>
    {orders.items.map(order => {
      const shipment = order.snapshot.shipment;
      const tracking = trackingLink(shipment?.trackingUrl);
      return <details key={order.reference}>
        <summary>Order {order.reference} · {order.status} · {money(order.totalPaise)}</summary>
        {order.environment === "simulation" && <p>Simulated order. No payment was collected and no stock was reserved.</p>}
        {order.reference.startsWith("TST-") && <p>Razorpay test order. No real stock was reserved.</p>}
        {order.snapshot.chargesAreFictional && <p>Shipping and tax are fictional test amounts.</p>}
        <p>Payment: {order.paymentState === "simulated" ? "Simulated" : order.paymentState}</p>
        {order.snapshot.quote?.lines.map((line, index) => <p key={index}>{line.title}{line.variant?.label && ` · ${line.variant.label}`} × {line.quantity} — {money(line.lineTotalPaise)}</p>)}
        <h3>Shipping address</h3><AddressView address={order.snapshot.shipping} />
        <h3>Billing address</h3><AddressView address={order.snapshot.billing} />
        {(shipment?.carrier || shipment?.trackingNumber || tracking) && <p>Shipment: {shipment?.carrier}{shipment?.trackingNumber && ` · ${shipment.trackingNumber}`} {tracking && <a href={tracking} target="_blank" rel="noopener noreferrer">Track shipment</a>}</p>}
      </details>;
    })}
    {orders.offset > 0 && <button type="button" onClick={() => setOffset(Math.max(0, orders.offset - orders.limit))}>Previous orders</button>}
    {orders.offset < 10000 && orders.offset + orders.items.length < orders.total && <button type="button" onClick={() => setOffset(orders.offset + orders.limit)}>More orders</button>}
  </>;
}
