"use client";

import Link from "next/link";
import { useAdminCapabilities } from "@/components/admin/admin-shell";
import { AdminAccessDeniedScreen } from "@/components/admin/record-screens";
import type { AdminOrderListQuery, AdminOrderStatus, AdminOrderSummary } from "@/lib/admin/orders-contract";
import { useEffect, useState, type FormEvent } from "react";
import styles from "./admin-ui.module.css";
import ordersStyles from "./orders-screen.module.css";

type OrdersResponse = { items: AdminOrderSummary[]; total: number; limit: number; offset: number };
type ApiProblem = { error?: { message?: string } };

const statuses: Record<AdminOrderStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: ordersStyles.status_pending },
  processing: { label: "Processing", className: ordersStyles.status_processing },
  fulfilled: { label: "Fulfilled", className: ordersStyles.status_fulfilled },
  cancelled: { label: "Cancelled", className: ordersStyles.status_cancelled },
};
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const moneyFormat = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

function formatDate(value: string) {
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? dateFormat.format(timestamp) : "Date unavailable";
}

function formatTotal(order: AdminOrderSummary) {
  return Number.isSafeInteger(order.totalPaise) ? moneyFormat.format(order.totalPaise / 100) : "Amount unavailable";
}

export function AdminOrdersScreen() {
  const capabilities = useAdminCapabilities();
  const canRead = capabilities.includes("staff.manage");
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AdminOrderListQuery["status"]>("all");
  const [sort, setSort] = useState<AdminOrderListQuery["sort"]>("created_desc");
  const [refresh, setRefresh] = useState(0);
  const queryString = new URLSearchParams({ q: search, status, sort, limit: String(pageSize), offset: String(offset) }).toString();
  const requestKey = `${queryString}#${refresh}`;
  const [responseState, setResponseState] = useState<{ key: string; value: OrdersResponse } | null>(null);
  const [errorState, setErrorState] = useState<{ key: string; message: string } | null>(null);
  const response = responseState?.key === requestKey ? responseState.value : null;
  const items = response?.items ?? [];
  const total = response?.total ?? null;
  const error = errorState?.key === requestKey ? errorState.message : "";
  const loading = canRead && responseState?.key !== requestKey && errorState?.key !== requestKey;

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();

    void fetch(`/api/admin/orders?${queryString}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as unknown;
        if (!response.ok) {
          const message = body && typeof body === "object" && "error" in body ? (body as ApiProblem).error?.message : undefined;
          throw new Error(response.status === 403 ? "Your role no longer allows access to orders." : message || "Orders could not be loaded. Try again.");
        }
        if (!body || typeof body !== "object" || !("items" in body) || !("total" in body) || !Array.isArray(body.items) || !Number.isSafeInteger(body.total)) {
          throw new Error("Orders could not be loaded. Try again.");
        }
        return body as OrdersResponse;
      })
      .then((result) => {
        setResponseState({ key: requestKey, value: result });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setErrorState({ key: requestKey, message: reason instanceof Error ? reason.message : "Orders could not be loaded. Try again." });
      });

    return () => controller.abort();
  }, [canRead, queryString, requestKey]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(query.trim());
    setOffset(0);
    setRefresh((current) => current + 1);
  }

  function clearFilters() {
    setQuery("");
    setSearch("");
    setStatus("all");
    setSort("created_desc");
    setOffset(0);
    setRefresh((current) => current + 1);
  }

  if (!canRead) return <AdminAccessDeniedScreen title="Orders" />;

  return <div className={styles.screen}>
    <header className={styles.pageHeading}>
      <div><p className={styles.eyebrow}>Operations</p><h1>Orders</h1><p className={styles.lede}>Review development simulation and test orders and their status.</p></div>
    </header>

    <form className={ordersStyles.toolbar} onSubmit={submitSearch} role="search" aria-label="Search and filter orders">
      <label className={ordersStyles.searchField}>
        <span className={styles.visuallyHidden}>Search orders by reference</span>
        <input className={styles.input} type="search" maxLength={120} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order reference" />
      </label>
      <label className={ordersStyles.filterField}>
        <span className={styles.visuallyHidden}>Filter orders by status</span>
        <select className={styles.input} value={status} onChange={(event) => { setStatus(event.target.value as AdminOrderListQuery["status"]); setOffset(0); }}>
          <option value="all">All statuses</option><option value="pending">Pending</option><option value="processing">Processing</option><option value="fulfilled">Fulfilled</option><option value="cancelled">Cancelled</option>
        </select>
      </label>
      <label className={ordersStyles.filterField}>
        <span className={styles.visuallyHidden}>Sort orders</span>
        <select className={styles.input} value={sort} onChange={(event) => { setSort(event.target.value as AdminOrderListQuery["sort"]); setOffset(0); }}>
          <option value="created_desc">Newest first</option><option value="created_asc">Oldest first</option><option value="total_desc">Highest total</option><option value="total_asc">Lowest total</option>
        </select>
      </label>
      <button className={styles.secondaryButton} type="submit">Search</button>
      {(search || status !== "all" || sort !== "created_desc" || query) && <button className={styles.secondaryButton} type="button" onClick={clearFilters}>Clear filters</button>}
      <span className={styles.toolbarCount} aria-live="polite">{loading ? "Loading orders…" : total === null ? "Orders unavailable" : `${total} ${total === 1 ? "order" : "orders"}`}</span>
    </form>

    {error && <div className={styles.errorBanner} role="alert"><p>{error}</p><button className={styles.secondaryButton} type="button" onClick={() => setRefresh((current) => current + 1)}>Try again</button></div>}

    <section aria-label="Order records" aria-busy={loading}>
      <div className={`${styles.tableFrame} ${ordersStyles.tableFrame}`} role="region" tabIndex={0} aria-label="Order records table">
        <table className={styles.table}>
          <caption className={styles.visuallyHidden}>Order references, status, total and timestamps</caption>
          <thead><tr><th scope="col">Order reference</th><th scope="col">Status</th><th scope="col">Total</th><th scope="col">Created</th><th scope="col">Updated</th></tr></thead>
          <tbody>
            {loading && <tr><td className={styles.tableMessage} colSpan={5}>Loading orders…</td></tr>}
            {!loading && !error && items.length === 0 && <tr><td className={styles.tableMessage} colSpan={5}>No orders match this view.</td></tr>}
            {!loading && items.map((order) => {
              const statusInfo = statuses[order.status];
              const label = statusInfo?.label ?? (order.status || "Status unavailable");
              return <tr key={order.reference}>
                <td className={ordersStyles.reference}>{/^(SIM|TST)-/.test(order.reference) ? <Link href={`/admin/orders/${encodeURIComponent(order.reference)}`}>{order.reference}</Link> : order.reference}</td>
                <td><span className={`${styles.statusPill} ${ordersStyles.status} ${statusInfo?.className ?? ""}`}>{label}</span></td>
                <td className={ordersStyles.total}>{formatTotal(order)}</td>
                <td className={ordersStyles.date}>{formatDate(order.createdAt)}</td>
                <td className={ordersStyles.date}>{formatDate(order.updatedAt)}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <nav className={ordersStyles.pagination} aria-label="Order pages">
        <span aria-live="polite">{total === null || total === 0 ? "" : `${offset + 1}–${Math.min(offset + items.length, total)} of ${total}`}</span>
        <div>
          <label className={ordersStyles.pageSize}><span>Rows per page</span><select className={styles.input} value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setOffset(0); }}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label>
          <button className={styles.secondaryButton} type="button" onClick={() => setOffset((current) => Math.max(0, current - pageSize))} disabled={loading || offset === 0}>Previous</button>
          <button className={styles.secondaryButton} type="button" onClick={() => setOffset((current) => current + pageSize)} disabled={loading || total === null || offset + pageSize >= total || offset + pageSize > 10000}>Next</button>
        </div>
      </nav>
    </section>
  </div>;
}
