"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAdminCapabilities } from "@/components/admin/admin-shell";
import { AdminAccessDeniedScreen } from "@/components/admin/record-screens";
import styles from "./inquiries-screen.module.css";

type ApiProblem = { error?: { message?: string } };
type InquiryStatus = "new" | "in_progress" | "resolved" | "spam";
type InquirySort = "created_desc" | "created_asc" | "name_asc" | "name_desc";
type NotificationStatus = "unconfigured" | "leased" | "sending" | "accepted" | "failed" | "uncertain" | "suppressed";
type InquiryNotification = { status: NotificationStatus; version: number; attempts: number; lastAttemptAt: string | null; acceptedAt: string | null };
type Inquiry = { id: string; name: string; email: string; phone: string | null; subject: string; message: string; status: InquiryStatus; version: number; createdAt: string; notificationStatus: NotificationStatus; notification: InquiryNotification };
type InquiryNote = { id: string; text: string; actor: string; createdAt: string };
type InquiryResponse = { inquiry: Inquiry & { notes?: InquiryNote[] }; notificationAvailable: boolean };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => null) as T | ApiProblem | null;
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body ? body.error?.message : undefined;
    throw Object.assign(new Error(message || (response.status === 409 ? "This item changed since it was opened. Reload the latest values before saving." : "The action could not be completed. Try again.")), { status: response.status });
  }
  return body as T;
}

const statusLabels: Record<InquiryStatus, string> = { new: "New", in_progress: "In progress", resolved: "Resolved", spam: "Spam" };

function notificationLabel(status: NotificationStatus) {
  return ({
    unconfigured: "Not sent",
    leased: "Preparing to send",
    sending: "Sending",
    accepted: "Accepted by email service · delivery not confirmed",
    failed: "Send failed",
    uncertain: "Result unknown · do not retry",
    suppressed: "Suppressed",
  } as const)[status];
}

function date(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : "Date unavailable";
}

export function InquiriesScreen() {
  const capabilities = useAdminCapabilities();
  const canManage = capabilities.includes("inquiries.manage");
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InquiryStatus | "">("");
  const [sort, setSort] = useState<InquirySort>("created_desc");
  const [listState, setListState] = useState<{ key: string; value: { items: Inquiry[]; total: number } } | null>(null);
  const [listErrorState, setListErrorState] = useState<{ key: string; message: string } | null>(null);
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [notes, setNotes] = useState<InquiryNote[]>([]);
  const [nextStatus, setNextStatus] = useState<InquiryStatus>("new");
  const [note, setNote] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationRefreshing, setNotificationRefreshing] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [notificationAvailable, setNotificationAvailable] = useState<boolean | null>(null);
  const [notificationError, setNotificationError] = useState("");
  const [notificationNotice, setNotificationNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const detailRequest = useRef(0);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset), sort });
  params.set("q", search);
  if (statusFilter) params.set("status", statusFilter);
  const requestUrl = `/api/admin/inquiries?${params.toString()}`;
  const requestKey = `${requestUrl}#${refresh}`;
  const result = listState?.key === requestKey ? listState.value : null;
  const items = result?.items ?? [];
  const total = result?.total ?? null;
  const error = listErrorState?.key === requestKey ? listErrorState.message : "";
  const loading = canManage && !result && !error;

  useEffect(() => { if (formError) formErrorRef.current?.focus(); }, [formError]);

  useEffect(() => {
    if (!canManage) return;
    const controller = new AbortController();
    void request<{ items: Inquiry[]; total: number }>(requestUrl, { signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) return;
        setListState({ key: requestKey, value });
        const lastOffset = value.total === 0 ? 0 : Math.min(Math.floor((value.total - 1) / pageSize) * pageSize, 1_000_000);
        setOffset((current) => current > lastOffset ? lastOffset : current);
        setSelected((current) => {
          if (!current) return current;
          const latest = value.items.find((item) => item.id === current.id);
          if (!latest || current.notification.version > latest.notification.version) return current;
          return { ...current, notification: latest.notification, notificationStatus: latest.notificationStatus };
        });
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setListErrorState({ key: requestKey, message: reason instanceof Error ? reason.message : "Inquiries could not be loaded." });
      });
    return () => controller.abort();
  }, [canManage, pageSize, requestKey, requestUrl]);

  async function open(item: Inquiry) {
    if (busy) return;
    const requestId = ++detailRequest.current;
    setDetailLoading(true);
    setSelected(item);
    setNotes([]);
    setNextStatus(item.status);
    setNote("");
    setNotice("");
    setDetailError("");
    setFormError("");
    setNotificationError("");
    setNotificationNotice("");
    setNotificationAvailable(null);
    try {
      const result = await request<InquiryResponse>(`/api/admin/inquiries/${item.id}`);
      if (requestId !== detailRequest.current) return;
      setSelected(result.inquiry);
      setNextStatus(result.inquiry.status);
      setNotes(result.inquiry.notes ?? []);
      setNotificationAvailable(result.notificationAvailable);
    } catch (reason) {
      if (requestId === detailRequest.current) setDetailError(reason instanceof Error ? reason.message : "Inquiry details could not be loaded.");
    } finally { if (requestId === detailRequest.current) setDetailLoading(false); }
  }

  async function update(event: FormEvent) {
    event.preventDefault();
    if (!selected || busy || detailLoading) return;
    setFormError("");
    if (note.length > 2000) { setFormError("Notes must be 2,000 characters or fewer."); return; }
    setBusy(true);
    setNotice("");
    try {
      const result = await request<InquiryResponse>(`/api/admin/inquiries/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: selected.version, status: nextStatus, note: note.trim() }),
      });
      setSelected(result.inquiry);
      setNotes(result.inquiry.notes ?? []);
      setNotificationAvailable(result.notificationAvailable);
      setNote("");
      setNotice("Inquiry updated.");
      setRefresh((value) => value + 1);
    } catch (reason) {
      const status = reason && typeof reason === "object" && "status" in reason ? reason.status : undefined;
      setFormError(status === 409 ? "Another staff member changed this inquiry. Reopen it to review the latest details before saving. Your note has been kept." : "Inquiry could not be updated. Try again.");
    } finally { setBusy(false); }
  }

  async function sendNotification() {
    if (!selected || busy || detailLoading || notificationBusy || notificationAvailable !== true || selected.status === "spam" || selected.notification.attempts >= 5 || !["unconfigured", "failed"].includes(selected.notification.status)) return;
    setBusy(true);
    setNotificationBusy(true);
    setNotificationRefreshing(false);
    setNotificationError("");
    setNotificationNotice("");
    try {
      const result = await request<InquiryResponse>(`/api/admin/inquiries/${selected.id}/notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: selected.notification.version }),
      });
      setSelected((current) => current?.id === result.inquiry.id ? { ...current, notification: result.inquiry.notification, notificationStatus: result.inquiry.notificationStatus } : current);
      setNotes(result.inquiry.notes ?? []);
      setNotificationAvailable(result.notificationAvailable);
      setNotificationNotice(notificationLabel(result.inquiry.notification.status));
    } catch (reason) {
      const status = reason && typeof reason === "object" && "status" in reason ? reason.status : undefined;
      setNotificationError(status === 409 ? "This inquiry changed. Refresh its email status before trying again." : status === 503 ? "Email sending is unavailable right now. Check setup before trying again." : status === 403 ? "You no longer have permission to manage this inquiry." : "The email request could not be completed.");
    } finally { setBusy(false); setNotificationBusy(false); }
  }

  async function refreshNotificationStatus() {
    if (!selected || busy || detailLoading) return;
    const requestId = ++detailRequest.current;
    setBusy(true);
    setNotificationBusy(true);
    setNotificationRefreshing(true);
    setNotificationError("");
    setNotificationNotice("");
    try {
      const result = await request<InquiryResponse>(`/api/admin/inquiries/${selected.id}`);
      if (requestId !== detailRequest.current) return;
      // Email refresh must not advance the saved edit version while a staff draft is open.
      setSelected((current) => current?.id === result.inquiry.id ? { ...current, notification: result.inquiry.notification, notificationStatus: result.inquiry.notificationStatus } : current);
      setNotes(result.inquiry.notes ?? []);
      setNotificationAvailable(result.notificationAvailable);
      setNotificationNotice("Email status refreshed.");
    } catch (reason) {
      const status = reason && typeof reason === "object" && "status" in reason ? reason.status : undefined;
      setNotificationError(status === 409 ? "This inquiry changed. Refresh its email status before trying again." : status === 503 ? "Email sending is unavailable right now. Check setup before trying again." : status === 403 ? "You no longer have permission to manage this inquiry." : "Email status could not be refreshed.");
    } finally {
      if (requestId === detailRequest.current) {
        setBusy(false);
        setNotificationBusy(false);
        setNotificationRefreshing(false);
      }
    }
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(query.trim());
    setOffset(0);
    setRefresh((value) => value + 1);
  }

  function clearFilters() {
    setQuery("");
    setSearch("");
    setStatusFilter("");
    setSort("created_desc");
    setOffset(0);
    setRefresh((value) => value + 1);
  }

  if (!canManage) return <AdminAccessDeniedScreen title="Inquiries" />;

  return <div className={styles.screen}>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>Operations</p><h1>Inquiries</h1><p className={styles.lede}>Review messages, update their status, and leave private notes.</p></div>
    </header>

    <form className={styles.toolbar} onSubmit={submitSearch} role="search" aria-label="Search and filter inquiries">
      <label className={styles.searchBox}>
        <span className={styles.visuallyHidden}>Search inquiries by name, email, or subject</span>
        <input type="search" maxLength={100} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, or subject" />
      </label>
      <label className={styles.filterField}><span className={styles.visuallyHidden}>Filter by status</span>
        <select className={styles.select} value={statusFilter} onChange={(event) => { setOffset(0); setStatusFilter(event.target.value as InquiryStatus | ""); }}>
          <option value="">All statuses</option><option value="new">New</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="spam">Spam</option>
        </select>
      </label>
      <label className={styles.filterField}><span className={styles.visuallyHidden}>Sort inquiries</span>
        <select className={styles.select} value={sort} onChange={(event) => { setSort(event.target.value as InquirySort); setOffset(0); }}>
          <option value="created_desc">Newest first</option><option value="created_asc">Oldest first</option><option value="name_asc">Name: A–Z</option><option value="name_desc">Name: Z–A</option>
        </select>
      </label>
      <button className={styles.button} type="submit">Search</button>
      {(search || statusFilter || sort !== "created_desc" || query) && <button className={styles.clearButton} type="button" onClick={clearFilters}>Clear filters</button>}
      <span className={styles.resultCount} aria-live="polite">{loading ? "Loading…" : total === null ? "Unavailable" : `${total} ${total === 1 ? "inquiry" : "inquiries"}`}</span>
    </form>

    {error && <div className={styles.errorBanner} role="alert"><p>{error}</p><button type="button" className={styles.button} onClick={() => setRefresh((value) => value + 1)}>Try again</button></div>}

    <div className={styles.layout}>
      <section className={styles.listPanel} aria-labelledby="inquiry-list-heading" aria-busy={loading}>
        <div className={styles.panelHeading}><div><h2 id="inquiry-list-heading">Inbox</h2><p>Customer messages</p></div></div>
        <div className={styles.tableFrame} role="region" aria-label="Inquiry list" tabIndex={0}>
          <table className={styles.table}>
            <thead><tr><th scope="col">Name / subject</th><th scope="col">Status</th><th scope="col">Received</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={3} className={styles.tableMessage}>Loading inquiries…</td></tr>}
              {!loading && !error && !items.length && <tr><td colSpan={3} className={styles.tableMessage}>No inquiries match this view.</td></tr>}
              {!loading && items.map((item) => <tr key={item.id} className={selected?.id === item.id ? styles.selectedRow : undefined}>
                <td><button className={styles.rowButton} type="button" aria-pressed={selected?.id === item.id} onClick={() => void open(item)}><span className={styles.rowName}>{item.name}</span><span className={styles.rowSubject}>{item.subject}</span></button></td>
                <td><span className={`${styles.status} ${styles[`status_${item.status}`]}`}>{statusLabels[item.status]}</span></td>
                <td className={styles.dateCell}>{date(item.createdAt)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? <section className={styles.detailPanel} aria-labelledby="inquiry-detail-heading" aria-busy={detailLoading}>
        <header className={styles.detailHeading}>
          <div><p className={styles.eyebrow}>Customer message</p><h2 id="inquiry-detail-heading">{selected.subject || "No subject"}</h2><p className={styles.contact}>{selected.name} · {selected.email}{selected.phone ? ` · ${selected.phone}` : ""}</p></div>
          <span className={`${styles.status} ${styles[`status_${selected.status}`]}`}>{statusLabels[selected.status]}</span>
        </header>
        {detailLoading && <p className={styles.loadingNote} role="status">Loading inquiry details…</p>}
        {detailError && <p className={styles.inlineError} role="alert">{detailError}</p>}
        <div className={styles.messageBody}>{selected.message}</div>

        <div className={styles.notificationPanel}>
          <div className={styles.notificationTitle}><strong>Email notification</strong><span>{notificationLabel(selected.notification.status)}</span></div>
          {notificationAvailable === false && <p className={styles.hint}>Setup required before email can be sent.</p>}
          {notificationAvailable === null && <p className={styles.hint}>Email setup status could not be confirmed.</p>}
          {selected.notification.attempts > 0 && <p className={styles.hint}>Attempt {selected.notification.attempts} of 5{selected.notification.lastAttemptAt ? ` · Last attempt ${date(selected.notification.lastAttemptAt)}` : ""}</p>}
          {selected.notification.acceptedAt && selected.notification.status === "accepted" && <p className={styles.hint}>Accepted {date(selected.notification.acceptedAt)}. Delivery is not confirmed.</p>}
          {(selected.notification.status === "unconfigured" || selected.notification.status === "failed") && <button className={styles.button} type="button" onClick={() => void sendNotification()} disabled={busy || detailLoading || notificationAvailable !== true || selected.status === "spam" || selected.notification.attempts >= 5}>{notificationBusy && !notificationRefreshing ? "Sending…" : selected.notification.status === "unconfigured" ? "Send email" : "Retry email"}</button>}
          {(selected.notification.status === "unconfigured" || selected.notification.status === "failed") && selected.notification.attempts >= 5 && <p className={styles.hint}>Maximum of 5 attempts reached; no further retry is available.</p>}
          <button className={styles.secondaryButton} type="button" onClick={() => void refreshNotificationStatus()} disabled={busy || detailLoading}>{notificationRefreshing ? "Refreshing…" : "Refresh email status"}</button>
          {notificationError && <p className={styles.inlineError} role="alert">{notificationError}</p>}
          {notificationNotice && <p className={styles.hint} role="status">{notificationNotice}</p>}
        </div>

        <form onSubmit={update} className={styles.noteForm} aria-describedby={formError ? "inquiry-form-error" : undefined} aria-busy={busy}>
          <label className={styles.field}><span>Status</span><select className={styles.select} value={nextStatus} onChange={(event) => setNextStatus(event.target.value as InquiryStatus)} disabled={detailLoading}><option value="new">New</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="spam">Spam</option></select></label>
          <label className={styles.field}><span>Internal note</span><textarea className={styles.textarea} value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={4} placeholder="Add context for staff" disabled={detailLoading} /></label>
          {formError && <p id="inquiry-form-error" ref={formErrorRef} className={styles.inlineError} role="alert" tabIndex={-1}>{formError}</p>}
          {notice && <p className={styles.successBanner} role="status">{notice}</p>}
          <button className={styles.primaryButton} type="submit" disabled={busy || detailLoading}>{busy && !notificationBusy ? "Saving…" : "Save inquiry"}</button>
        </form>

        <section className={styles.noteHistory} aria-labelledby="staff-notes-heading"><h3 id="staff-notes-heading">Staff notes</h3>{notes.length ? notes.map((item) => <article key={item.id}><p>{item.text}</p><small>Staff · {date(item.createdAt)}</small></article>) : <p className={styles.hint}>No staff notes yet.</p>}</section>
      </section> : <section className={styles.emptyPanel}><p>Select an inquiry to review its message and notes.</p></section>}
    </div>

    <nav className={styles.pagination} aria-label="Inquiry pages">
      <span aria-live="polite">{total === null || total === 0 ? "" : `${offset + 1}–${Math.min(offset + items.length, total)} of ${total}`}</span>
      <div>
        <label className={styles.pageSizeField}><span>Rows per page</span><select className={styles.select} value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setOffset(0); }}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label>
        <button className={styles.secondaryButton} type="button" onClick={() => setOffset((current) => Math.max(0, current - pageSize))} disabled={loading || offset === 0}>Previous</button>
        <button className={styles.secondaryButton} type="button" onClick={() => setOffset((current) => Math.min(current + pageSize, 1_000_000))} disabled={loading || total === null || offset + pageSize >= total || offset >= 1_000_000}>Next</button>
      </div>
    </nav>
  </div>;
}
