"use client";

import { AdminNotice } from "./admin-notice";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Clipboard, Clock3, PackageCheck, PackageOpen, Truck, XCircle } from "lucide-react";
import { useAdminCapabilities } from "@/components/admin/admin-shell";
import { canAdminPermission } from "@/lib/admin/access-contract";
import { AdminAccessDeniedScreen } from "@/components/admin/record-screens";
import { parseAdminOrderListQuery, type AdminOrderListResponse } from "@/lib/admin/orders-contract";
import styles from "./admin-ui.module.css";
import css from "./orders-screen.module.css";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
export function OrderCustomerAvatar({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  const [failed, setFailed] = useState(false);
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] ?? "").join("").toUpperCase() || "?";
  return <span className={css.avatar} aria-hidden="true">{imageUrl && !failed ? <Image src={imageUrl} alt="" width={36} height={36} unoptimized referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : initials}</span>;
}
const groups = [
  { key: "all", label: "Total orders", icon: PackageOpen, help: "Orders in this environment and date range" },
  { key: "pending", label: "Pending", icon: Clock3, help: "Awaiting confirmation or review" },
  { key: "active", label: "Active", icon: Truck, help: "Processing or fulfilled" },
  { key: "delivered", label: "Delivered", icon: PackageCheck, help: "Delivery confirmation is not recorded" },
  { key: "cancelled", label: "Cancelled", icon: XCircle, help: "Cancelled orders" },
] as const;

export function AdminOrdersScreen() {
  const capabilities = useAdminCapabilities();
  const canRead = (capabilities.includes("staff.manage") || (capabilities.includes("__custom_role__") && capabilities.includes("orders.read"))) && canAdminPermission(capabilities, "orders", "read");
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const raw = params.toString();
  const parsed = parseAdminOrderListQuery(new URLSearchParams(raw));
  const defaults = parseAdminOrderListQuery(new URLSearchParams());
  if (!defaults.ok) throw new Error("Invalid order defaults");
  const query = parsed.ok ? parsed.value : defaults.value;
  const [draft, setDraft] = useState({ key: query.q, value: query.q });
  const input = draft.key === query.q ? draft.value : query.q;
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ key: string; data: AdminOrderListResponse } | null>(null);
  const [problem, setProblem] = useState<{ key: string; text: string } | null>(null);
  const [showCustomer, setShowCustomer] = useState(true);
  const [showItems, setShowItems] = useState(true);
  const [copied, setCopied] = useState("");
  const request = new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)])).toString();
  const key = `${request}#${refresh}`;
  const data = result?.key === key ? result.data : null;
  const error = problem?.key === key ? problem.text : "";
  const stats = data?.stats ?? (!error && result?.data.scope.environment === query.environment && result.data.scope.from === query.from && result.data.scope.to === query.to ? result.data.stats : null);
  const loading = canRead && !data && !error;
  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    void fetch(`/api/admin/orders?${request}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(response.status === 403 ? "Your role no longer allows access to orders." : "Orders could not be loaded. Try again.");
      if (!body || typeof body !== "object" || !("items" in body) || !("total" in body) || !("stats" in body) || !Array.isArray(body.items) || !Number.isSafeInteger(body.total)) throw new Error("Orders could not be loaded. Try again.");
      return body as AdminOrderListResponse;
    }).then(value => { if (!controller.signal.aborted) setResult({ key, data: value }); }).catch((reason: unknown) => { if (!controller.signal.aborted) setProblem({ key, text: reason instanceof Error ? reason.message : "Orders could not be loaded." }); });
    return () => controller.abort();
  }, [canRead, request, key]);
  function change(changes: Record<string, string>, reset = true) {
    const next = new URLSearchParams(request);
    for (const [name, value] of Object.entries(changes)) next.set(name, value);
    if (reset) next.set("offset", "0");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }
  function submit(event: FormEvent) { event.preventDefault(); change({ q: input.trim() }); }
  function clear() { setDraft({ key: "", value: "" }); router.replace(pathname, { scroll: false }); setRefresh(n => n + 1); }
  if (!canRead) return <AdminAccessDeniedScreen title="Orders" />;
  const countKey = { all: "total", pending: "pending", active: "active", delivered: "delivered", cancelled: "cancelled" } as const;
  return <div className={`${styles.screen} ${css.screen}`}>
    <header className={styles.pageHeading}><div><h1>Orders</h1><p className={styles.lede}>Review orders, payment status and fulfillment. Test and simulation records are kept separate.</p></div></header>
    <div className={css.scope}><strong>{query.environment === "razorpay_test" ? "Razorpay test" : query.environment === "simulation" ? "Simulation" : "Legacy"} orders</strong><span>Counts cover this environment and date range; search and status filters do not change them.</span></div>
    <div className={css.stats} aria-label="Order status filters">{groups.map(group => { const Icon = group.icon; return <button type="button" key={group.key} aria-pressed={query.group === group.key} className={css.stat} onClick={() => change({ group: group.key, status: "all" })}><span className={css.statHeading}><span>{group.label}</span><Icon size={17} aria-hidden="true" /></span><strong>{stats ? stats[countKey[group.key]] : "—"}</strong><small>{group.help}</small></button>; })}</div>
    {stats && stats.exceptional > 0 && <p className={css.note}>{stats.exceptional} exceptional {stats.exceptional === 1 ? "order is" : "orders are"} included in Total orders.</p>}
    <form className={css.toolbar} onSubmit={submit} role="search" aria-label="Search and filter orders">
      <label className={css.searchField}><span>Search orders</span><input className={styles.input} type="search" maxLength={120} value={input} onChange={event => setDraft({ key: query.q, value: event.target.value })} placeholder="Reference, customer or email" /></label>
      <label><span>Environment</span><select className={styles.input} value={query.environment} onChange={event => change({ environment: event.target.value })}><option value="razorpay_test">Razorpay test</option><option value="simulation">Simulation</option><option value="legacy">Legacy</option></select></label>
      <label><span>Order status</span><select className={styles.input} value={query.status} onChange={event => change({ status: event.target.value, group: "all" })}><option value="all">All statuses</option><option value="pending">Pending</option><option value="processing">Processing</option><option value="fulfilled">Fulfilled</option><option value="cancelled">Cancelled</option></select></label>
      <label><span>Payment</span><select className={styles.input} value={query.payment} onChange={event => change({ payment: event.target.value })}><option value="all">All payments</option>{["unconfigured", "simulated", "pending", "verified", "paid", "failed", "cancelled", "review"].map(value => <option value={value} key={value}>{value}</option>)}</select></label>
      <label><span>From</span><input className={styles.input} type="date" value={query.from} max={query.to || undefined} onChange={event => change({ from: event.target.value })} /></label>
      <label><span>To</span><input className={styles.input} type="date" value={query.to} min={query.from || undefined} onChange={event => change({ to: event.target.value })} /></label>
      <label><span>Sort</span><select className={styles.input} value={query.sort} onChange={event => change({ sort: event.target.value })}><option value="created_desc">Newest first</option><option value="created_asc">Oldest first</option><option value="total_desc">Highest total</option><option value="total_asc">Lowest total</option></select></label>
      <button className={styles.secondaryButton} type="submit">Search</button><button className={styles.secondaryButton} type="button" onClick={clear}>Clear filters</button>
      <details className={css.columnsMenu}><summary>Columns</summary><label><input type="checkbox" checked={showCustomer} onChange={event => setShowCustomer(event.target.checked)} /> Name</label><label><input type="checkbox" checked={showItems} onChange={event => setShowItems(event.target.checked)} /> Items</label></details>
    </form>
    {error && <AdminNotice tone="error" key={`${error}:${refresh}`} className={styles.errorBanner} actions={<button className={styles.secondaryButton} type="button" onClick={() => setRefresh(n => n + 1)}>Try again</button>}><p>{error}</p></AdminNotice>}
    <section aria-label="Order records" aria-busy={loading}>
      <div className={`${styles.tableFrame} ${css.tableFrame}`} role="region" tabIndex={0} aria-label="Order records table"><table className={styles.table}>
        <caption className={styles.visuallyHidden}>Orders, customer name, items, payment, fulfillment and date</caption><thead><tr><th scope="col">Order</th>{showCustomer && <th scope="col">Name</th>}{showItems && <th scope="col">Items</th>}<th scope="col">Total</th><th scope="col">Payment</th><th scope="col">Order status</th><th scope="col">Placed</th><th scope="col">Actions</th></tr></thead>
        <tbody>{loading && <tr><td colSpan={8} className={styles.tableMessage}>Loading orders…</td></tr>}{!loading && !error && !data?.items.length && <tr><td colSpan={8} className={styles.tableMessage}>No orders match this view.</td></tr>}{data?.items.map(order => <tr key={order.reference}>
          <td className={css.reference}>{order.environment === "legacy" ? <span title={order.reference}>{order.reference}</span> : <Link href={`/admin/orders/${encodeURIComponent(order.reference)}?returnTo=${encodeURIComponent(`/admin/orders?${request}`)}`} title={order.reference}>{order.reference}</Link>}<button type="button" className={css.copy} aria-label={`Copy order reference ${order.reference}`} onClick={() => { void (async () => { try { await navigator.clipboard.writeText(order.reference); setCopied("Order reference copied."); } catch { setCopied("Could not copy order reference."); } })(); }}><Clipboard size={15} aria-hidden="true" /></button><small>{order.environment === "razorpay_test" ? "Test" : order.environment === "simulation" ? "Simulation" : "Legacy"}</small></td>
          {showCustomer && <td><div className={css.customer}><OrderCustomerAvatar key={order.customerAvatarUrl ?? "initials"} name={order.customer?.name || ""} imageUrl={order.customerAvatarUrl} /><div><strong>{order.customer?.name || "Customer unavailable"}</strong>{order.customer?.email && <small className={css.secondary} title={order.customer.email}>{order.customer.email}</small>}</div></div></td>}{showItems && <td className={css.itemCount}>{order.unitCount ?? "Unavailable"}</td>}
          <td className={css.total}>{currency.format(order.totalPaise / 100)}</td><td><span className={styles.statusPill}>{order.paymentState.replaceAll("_", " ")}</span></td><td><span className={styles.statusPill}>{order.status}</span></td><td className={css.date}>{dateFormat.format(new Date(order.createdAt))}</td><td>{order.environment === "legacy" ? "Detail unavailable" : <Link href={`/admin/orders/${encodeURIComponent(order.reference)}?returnTo=${encodeURIComponent(`/admin/orders?${request}`)}`}>View order</Link>}</td>
        </tr>)}</tbody></table></div><span className={styles.visuallyHidden} role="status">{copied}</span>
      <nav className={css.pagination} aria-label="Order pages"><span aria-live="polite">{loading ? "Loading orders…" : data ? data.total ? `${query.offset + 1}–${Math.min(query.offset + data.items.length, data.total)} of ${data.total}` : "0 orders" : "Orders unavailable"}</span><div><label className={css.pageSize}><span>Rows per page</span><select className={styles.input} value={query.limit} onChange={event => change({ limit: event.target.value })}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label><button className={styles.secondaryButton} type="button" onClick={() => change({ offset: String(Math.max(0, query.offset - query.limit)) }, false)} disabled={loading || query.offset === 0}>Previous</button><button className={styles.secondaryButton} type="button" onClick={() => change({ offset: String(query.offset + query.limit) }, false)} disabled={loading || !data || query.offset + query.limit >= data.total || query.offset + query.limit > 10000}>Next</button></div></nav>
    </section>
  </div>;
}
