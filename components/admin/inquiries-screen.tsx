"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Eye, Trash2, X } from "lucide-react";
import { useAdminCapabilities } from "@/components/admin/admin-shell";
import { AdminAccessDeniedScreen } from "@/components/admin/record-screens";
import {
  MorphingDialog, MorphingDialogCard, MorphingDialogClose, MorphingDialogContainer,
  MorphingDialogContent, MorphingDialogDescription, MorphingDialogTitle, MorphingDialogTrigger,
} from "@/components/core/morphing-dialog";
import styles from "./inquiries-screen.module.css";

type ApiProblem = { error?: { message?: string } };
type InquiryStatus = "new" | "in_progress" | "resolved" | "spam";
type InquirySort = "created_desc" | "created_asc" | "name_asc" | "name_desc";
type NotificationStatus = "unconfigured" | "leased" | "sending" | "accepted" | "failed" | "uncertain" | "suppressed";
type InquiryNotification = { status: NotificationStatus; version: number; attempts: number; lastAttemptAt: string | null; acceptedAt: string | null };
type Inquiry = { id: string; name: string; email: string; phone: string | null; subject: string; message: string; status: InquiryStatus; version: number; createdAt: string; notificationStatus: NotificationStatus; notification: InquiryNotification };
type InquiryNote = { id: string; text: string; actor: string; createdAt: string };
type InquiryAttachment = { id: string; filename: string; mimeType: string; size: number; ready: boolean };
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

function responseStatus(reason: unknown) {
  return reason && typeof reason === "object" && "status" in reason && typeof reason.status === "number" ? reason.status : undefined;
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
  const [attachments, setAttachments] = useState<InquiryAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState("");
  const [nextStatus, setNextStatus] = useState<InquiryStatus>("new");
  const [note, setNote] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationRefreshing, setNotificationRefreshing] = useState(false);
  const [notificationAvailable, setNotificationAvailable] = useState<boolean | null>(null);
  const [notificationError, setNotificationError] = useState("");
  const [notificationNotice, setNotificationNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Inquiry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteNotice, setDeleteNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const detailRequest = useRef(0);
  const activeInquiryId = useRef<string | null>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const focusSearchAfterDelete = useRef(false);
  const refreshListAfterClose = useRef(false);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
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
  const actionsDisabled = busy || detailLoading || notificationBusy || notificationRefreshing || deleting || !!selected || !!deleteTarget;

  useEffect(() => {
    const dialog = deleteDialog.current;
    if (!dialog) return;
    if (deleteTarget && !dialog.open) dialog.showModal();
    else if (!deleteTarget && dialog.open) dialog.close();
  }, [deleteTarget]);

  useEffect(() => { if (formError) formErrorRef.current?.focus(); }, [formError]);

  useEffect(() => {
    if (!canManage) return;
    const controller = new AbortController();
    void request<{ items: Inquiry[]; total: number }>(requestUrl, { signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) return;
        setListState({ key: requestKey, value });
        setOffset((current) => {
          const lastOffset = value.total === 0 ? 0 : Math.min(Math.floor((value.total - 1) / pageSize) * pageSize, 1_000_000);
          return current > lastOffset ? lastOffset : current;
        });
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
    if (busy || deleting || detailLoading || selected) return;
    activeInquiryId.current = item.id;
    const requestId = ++detailRequest.current;
    setDetailLoading(true);
    setSelected(item);
    setNotes([]);
    setAttachments([]);
    setAttachmentsLoading(true);
    setAttachmentsError("");
    setNextStatus(item.status);
    setNote("");
    setNotice("");
    setDetailError("");
    setFormError("");
    setNotificationAvailable(null);
    setNotificationError("");
    setNotificationNotice("");
    setDeleteNotice("");
    try {
      const value = await request<InquiryResponse>(`/api/admin/inquiries/${encodeURIComponent(item.id)}`);
      if (requestId !== detailRequest.current) return;
      setSelected(value.inquiry);
      setNextStatus(value.inquiry.status);
      setNotes(value.inquiry.notes ?? []);
      setNotificationAvailable(value.notificationAvailable);
      try {
        const files = await request<{ attachments: InquiryAttachment[] }>(`/api/admin/inquiries/${encodeURIComponent(item.id)}/attachments`);
        if (requestId === detailRequest.current) setAttachments(files.attachments);
      } catch {
        if (requestId === detailRequest.current) setAttachmentsError("Attachments could not be loaded. Close and reopen this inquiry to try again.");
      } finally {
        if (requestId === detailRequest.current) setAttachmentsLoading(false);
      }
    } catch (reason) {
      if (requestId === detailRequest.current) {
        setAttachmentsLoading(false);
        setDetailError(reason instanceof Error ? reason.message : "Inquiry details could not be loaded.");
      }
    } finally {
      if (requestId === detailRequest.current) setDetailLoading(false);
    }
  }

  function closeDetail(id: string) {
    if (activeInquiryId.current !== id) return;
    activeInquiryId.current = null;
    detailRequest.current += 1;
    setSelected(null);
    setDetailLoading(false);
    setAttachmentsLoading(false);
    if (refreshListAfterClose.current) {
      refreshListAfterClose.current = false;
      setRefresh((current) => current + 1);
    }
  }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy || detailLoading || detailError) return;
    setFormError("");
    if (note.length > 2000) { setFormError("Notes must be 2,000 characters or fewer."); return; }
    setBusy(true);
    setNotice("");
    try {
      const value = await request<InquiryResponse>(`/api/admin/inquiries/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: selected.version, status: nextStatus, note: note.trim() }),
      });
      if (activeInquiryId.current === value.inquiry.id) {
        setSelected((current) => current?.id === value.inquiry.id ? value.inquiry : current);
        setNotes(value.inquiry.notes ?? []);
        setNextStatus(value.inquiry.status);
        setNote("");
        setNotice("Inquiry updated.");
        setNotificationAvailable(value.notificationAvailable);
        setListState((current) => current ? { ...current, value: { ...current.value, items: current.value.items.map((item) => item.id === value.inquiry.id ? { ...item, ...value.inquiry } : item) } } : current);
        refreshListAfterClose.current = true;
      } else setRefresh((current) => current + 1);
    } catch (reason) {
      setFormError(responseStatus(reason) === 409
        ? "Another staff member changed this inquiry. Close and reopen it to review the latest details before saving. Your note has been kept."
        : "Inquiry could not be updated. Try again.");
    } finally { setBusy(false); }
  }

  async function sendNotification() {
    if (!selected || busy || detailLoading || notificationBusy || notificationAvailable !== true || selected.status === "spam" || selected.notification.attempts >= 5 || !["unconfigured", "failed"].includes(selected.notification.status)) return;
    const inquiryId = selected.id;
    setBusy(true);
    setNotificationBusy(true);
    setNotificationRefreshing(false);
    setNotificationError("");
    setNotificationNotice("");
    try {
      const value = await request<InquiryResponse>(`/api/admin/inquiries/${encodeURIComponent(inquiryId)}/notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: selected.notification.version }),
      });
      setSelected((current) => current?.id === value.inquiry.id ? { ...current, notification: value.inquiry.notification, notificationStatus: value.inquiry.notificationStatus } : current);
      if (activeInquiryId.current === inquiryId) {
        setNotes(value.inquiry.notes ?? []);
        setNotificationAvailable(value.notificationAvailable);
        setNotificationNotice(notificationLabel(value.inquiry.notification.status));
      }
    } catch (reason) {
      const status = responseStatus(reason);
      setNotificationError(status === 409 ? "This inquiry changed. Refresh its team notification status before trying again." : status === 503 ? "Team notification sending is unavailable right now. Check setup before trying again." : status === 403 ? "You no longer have permission to manage this inquiry." : "The team notification request could not be completed.");
    } finally { setBusy(false); setNotificationBusy(false); }
  }

  async function refreshNotificationStatus() {
    if (!selected || busy || detailLoading) return;
    const inquiryId = selected.id;
    setBusy(true);
    setNotificationBusy(true);
    setNotificationRefreshing(true);
    setNotificationError("");
    setNotificationNotice("");
    try {
      const value = await request<InquiryResponse>(`/api/admin/inquiries/${encodeURIComponent(inquiryId)}`);
      setSelected((current) => current?.id === value.inquiry.id ? { ...current, notification: value.inquiry.notification, notificationStatus: value.inquiry.notificationStatus } : current);
      if (activeInquiryId.current === inquiryId) {
        setNotes(value.inquiry.notes ?? []);
        setNotificationAvailable(value.notificationAvailable);
        setNotificationNotice("Team notification status refreshed.");
      }
    } catch (reason) {
      const status = responseStatus(reason);
      setNotificationError(status === 409 ? "This inquiry changed. Refresh its team notification status before trying again." : status === 503 ? "Team notification setup is unavailable right now." : status === 403 ? "You no longer have permission to manage this inquiry." : "Team notification status could not be refreshed.");
    } finally { setBusy(false); setNotificationBusy(false); setNotificationRefreshing(false); }
  }

  function requestDelete(item: Inquiry) {
    if (busy || detailLoading || notificationBusy || deleting) return;
    setDeleteTarget(item);
    setDeleteError("");
    setDeleteNotice("");
  }

  async function removeFromInbox() {
    if (!deleteTarget || busy || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const value = await request<{ deleted: boolean }>(`/api/admin/inquiries/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: deleteTarget.version }),
      });
      if (value?.deleted !== true) throw new Error("The inbox removal could not be confirmed. Refresh the list before trying again.");
      if (selected?.id === deleteTarget.id) setSelected(null);
      setDeleteNotice("Inquiry removed from the inbox. Its records and attachments remain retained.");
      setDeleteTarget(null);
      focusSearchAfterDelete.current = true;
      setRefresh((current) => current + 1);
    } catch (reason) {
      const status = responseStatus(reason);
      setDeleteError(status === 409
        ? "This inquiry changed since the list loaded. Cancel, refresh the inbox and review the latest inquiry before removing it."
        : status === 404 ? "This inquiry is no longer in the inbox. Refresh the list to see the latest items."
          : status === 401 || status === 403 ? "You no longer have permission to manage this inquiry."
            : reason instanceof Error ? reason.message : "The inquiry could not be removed from the inbox. Try again.");
    } finally { setDeleting(false); }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(query.trim());
    setOffset(0);
    setRefresh((current) => current + 1);
  }

  function clearFilters() {
    setQuery("");
    setSearch("");
    setStatusFilter("");
    setSort("created_desc");
    setOffset(0);
    setRefresh((current) => current + 1);
  }

  if (!canManage) return <AdminAccessDeniedScreen title="Inquiries" />;

  return <div className={styles.screen} ref={setPortalContainer}>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>Operations</p><h1>Inquiries</h1><p className={styles.lede}>Review customer messages, update status and leave private notes.</p></div>
    </header>

    <form className={styles.toolbar} onSubmit={submitSearch} role="search" aria-label="Search and filter inquiries">
      <label className={styles.searchBox}>
        <span className={styles.visuallyHidden}>Search inquiries by name, email or subject</span>
        <input ref={searchInput} type="search" maxLength={100} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email or subject" />
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

    {error && <div className={styles.errorBanner} role="alert"><p>{error}</p><button type="button" className={styles.button} onClick={() => setRefresh((current) => current + 1)}>Try again</button></div>}
    {deleteNotice && <p className={styles.successBanner} role="status">{deleteNotice}</p>}

    <section className={styles.tablePanel} aria-labelledby="inquiry-list-heading" aria-busy={loading}>
      <div className={styles.panelHeading}><div><h2 id="inquiry-list-heading">Inbox</h2><p>Customer messages</p></div></div>
      <div className={styles.tableFrame} role="region" aria-label="Inquiry list" tabIndex={0}>
        <table className={styles.table}>
          <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Subject</th><th scope="col">Status</th><th scope="col">Received</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className={styles.tableMessage}>Loading inquiries…</td></tr>}
            {!loading && !error && !items.length && <tr><td colSpan={6} className={styles.tableMessage}>No inquiries match this view.</td></tr>}
            {!loading && items.map((item) => <tr key={item.id}>
              <td className={styles.nameCell}>{item.name}</td>
              <td className={styles.emailCell}>{item.email}</td>
              <td className={styles.subjectCell}>{item.subject || "No subject"}</td>
              <td><span className={`${styles.status} ${styles[`status_${item.status}`]}`}>{statusLabels[item.status]}</span></td>
              <td className={styles.dateCell}>{date(item.createdAt)}</td>
              <td><div className={styles.rowActions}>
                <MorphingDialog transition={{ type: "spring", bounce: 0.05, duration: 0.25 }} onOpenChange={(isOpen) => { if (isOpen) void open(item); else closeDetail(item.id); }}>
                  <MorphingDialogCard className={styles.morphSource}>
                    <MorphingDialogTrigger className={styles.iconButton} aria-label={`View inquiry from ${item.name}: ${item.subject || "No subject"}`} disabled={actionsDisabled}>
                      <Eye aria-hidden="true" size={18} />
                    </MorphingDialogTrigger>
                  </MorphingDialogCard>
                  <MorphingDialogContainer container={portalContainer}>
                    {selected?.id === item.id && <MorphingDialogContent className={styles.detailMorph}>
                      <header className={styles.dialogHeader}>
                        <div><p className={styles.eyebrow}>Customer message</p><MorphingDialogTitle expanded className={styles.dialogTitle}>{selected.subject || "No subject"}</MorphingDialogTitle></div>
                        <MorphingDialogClose className={styles.dialogClose} aria-label="Close inquiry details"><X aria-hidden="true" size={19} /></MorphingDialogClose>
                      </header>
                      <MorphingDialogDescription className={styles.visuallyHidden}>Review the message, attachments and staff notes. Update its status or add an internal note.</MorphingDialogDescription>
                      {detailLoading && <p className={styles.loadingNote} role="status">Loading inquiry details…</p>}
                      {detailError && <p className={styles.inlineError} role="alert">{detailError}</p>}
                      <dl className={styles.contactDetails}>
                        <div><dt>Name</dt><dd>{selected.name}</dd></div>
                        <div><dt>Email</dt><dd>{selected.email}</dd></div>
                        {selected.phone && <div><dt>Phone</dt><dd><a href={`tel:${selected.phone.replace(/[^+\d]/g, "")}`}>{selected.phone}</a></dd></div>}
                        <div><dt>Received</dt><dd>{date(selected.createdAt)}</dd></div>
                        <div><dt>Status</dt><dd><span className={`${styles.status} ${styles[`status_${selected.status}`]}`}>{statusLabels[selected.status]}</span></dd></div>
                      </dl>
                      <section className={styles.messageSection} aria-labelledby="inquiry-message-heading"><h3 id="inquiry-message-heading">Message</h3><div className={styles.messageBody}>{selected.message}</div></section>

                      <section className={styles.attachmentPanel} aria-labelledby="inquiry-attachments-heading">
                        <h3 id="inquiry-attachments-heading">Attachments</h3>
                        {attachmentsLoading ? <p className={styles.hint} role="status">Loading attachments…</p>
                          : attachmentsError ? <p className={styles.inlineError} role="alert">{attachmentsError}</p>
                            : attachments.length ? <><p className={styles.hint}>Files are not malware scanned. Open only if you trust the sender.</p><ul className={styles.attachmentList}>{attachments.map((file) => <li key={file.id}>
                              {file.ready ? <a href={`/api/admin/inquiries/${encodeURIComponent(selected.id)}/attachments/${encodeURIComponent(file.id)}`} download>{file.filename}</a> : <span>{file.filename} · Upload incomplete</span>}
                              <small>{Math.ceil(file.size / 1024)} KB</small>
                            </li>)}</ul></> : <p className={styles.hint}>No attachments.</p>}
                      </section>

                      <details className={styles.notificationDisclosure}>
                        <summary><strong>Team notification</strong><span>{notificationLabel(selected.notification.status)}</span></summary>
                        <div className={styles.notificationContent}>
                          <p className={styles.hint}>Send the inquiry to the configured team inbox. This is not an email reply to the customer.</p>
                          {notificationAvailable === false && <p className={styles.hint}>Setup is required before a team notification can be sent.</p>}
                          {notificationAvailable === null && <p className={styles.hint}>Team notification setup could not be confirmed.</p>}
                          {selected.notification.attempts > 0 && <p className={styles.hint}>Attempt {selected.notification.attempts} of 5{selected.notification.lastAttemptAt ? ` · Last attempt ${date(selected.notification.lastAttemptAt)}` : ""}</p>}
                          {selected.notification.acceptedAt && selected.notification.status === "accepted" && <p className={styles.hint}>Accepted {date(selected.notification.acceptedAt)}. Delivery is not confirmed.</p>}
                          {(selected.notification.status === "unconfigured" || selected.notification.status === "failed") && <button className={styles.button} type="button" onClick={() => void sendNotification()} disabled={busy || detailLoading || notificationAvailable !== true || selected.status === "spam" || selected.notification.attempts >= 5}>{notificationBusy && !notificationRefreshing ? "Sending…" : selected.notification.status === "unconfigured" ? "Send team notification" : "Retry team notification"}</button>}
                          {(selected.notification.status === "unconfigured" || selected.notification.status === "failed") && selected.notification.attempts >= 5 && <p className={styles.hint}>Maximum of 5 attempts reached; no further retry is available.</p>}
                          <button className={styles.secondaryButton} type="button" onClick={() => void refreshNotificationStatus()} disabled={busy || detailLoading}>{notificationRefreshing ? "Refreshing…" : "Refresh status"}</button>
                          {notificationError && <p className={styles.inlineError} role="alert">{notificationError}</p>}
                          {notificationNotice && <p className={styles.hint} role="status">{notificationNotice}</p>}
                        </div>
                      </details>

                      <form onSubmit={update} className={styles.noteForm} aria-describedby={formError ? "inquiry-form-error" : undefined} aria-busy={busy}>
                        <label className={styles.field} htmlFor="inquiry-status"><span>Status</span><select id="inquiry-status" className={styles.select} value={nextStatus} onChange={(event) => setNextStatus(event.target.value as InquiryStatus)} disabled={busy || detailLoading || !!detailError}><option value="new">New</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="spam">Spam</option></select></label>
                        <label className={styles.field} htmlFor="inquiry-note"><span>Internal note</span><textarea id="inquiry-note" className={styles.textarea} value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={4} placeholder="Add context for staff" disabled={busy || detailLoading || !!detailError} /></label>
                        {formError && <p id="inquiry-form-error" ref={formErrorRef} className={styles.inlineError} role="alert" tabIndex={-1}>{formError}</p>}
                        {notice && <p className={styles.successBanner} role="status">{notice}</p>}
                        <button className={styles.primaryButton} type="submit" disabled={busy || detailLoading || !!detailError}>{busy ? "Saving…" : "Save changes"}</button>
                      </form>

                      <section className={styles.noteHistory} aria-labelledby="staff-notes-heading"><h3 id="staff-notes-heading">Staff notes</h3>{notes.length ? notes.map((entry) => <article key={entry.id}><p>{entry.text}</p><small>Staff · {date(entry.createdAt)}</small></article>) : <p className={styles.hint}>No staff notes yet.</p>}</section>
                    </MorphingDialogContent>}
                  </MorphingDialogContainer>
                </MorphingDialog>
                <button className={`${styles.iconButton} ${styles.deleteIcon}`} type="button" aria-label={`Remove inquiry from inbox from ${item.name}: ${item.subject || "No subject"}`} onClick={() => requestDelete(item)} disabled={actionsDisabled}>
                  <Trash2 aria-hidden="true" size={18} />
                </button>
              </div></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    <nav className={styles.pagination} aria-label="Inquiry pages">
      <span aria-live="polite">{total === null || total === 0 ? "" : `${offset + 1}–${Math.min(offset + items.length, total)} of ${total}`}</span>
      <div>
        <label className={styles.pageSizeField}><span>Rows per page</span><select className={styles.select} value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setOffset(0); }}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label>
        <button className={styles.secondaryButton} type="button" onClick={() => setOffset((current) => Math.max(0, current - pageSize))} disabled={loading || offset === 0}>Previous</button>
        <button className={styles.secondaryButton} type="button" onClick={() => setOffset((current) => Math.min(current + pageSize, 1_000_000))} disabled={loading || total === null || offset + pageSize >= total || offset >= 1_000_000}>Next</button>
      </div>
    </nav>

    <dialog ref={deleteDialog} className={`${styles.detailDialog} ${styles.confirmDialog}`} aria-labelledby="inquiry-delete-title" aria-describedby="inquiry-delete-warning" onClose={() => {
      setDeleteTarget(null);
      if (focusSearchAfterDelete.current) requestAnimationFrame(() => searchInput.current?.focus());
      focusSearchAfterDelete.current = false;
    }} onCancel={(event) => { if (deleting) event.preventDefault(); }}>
      {deleteTarget && <>
        <header className={styles.dialogHeader}>
          <div className={styles.confirmTitle}><span className={styles.warningIcon}><AlertTriangle aria-hidden="true" size={19} /></span><h2 id="inquiry-delete-title">Remove from inbox?</h2></div>
          <button className={styles.dialogClose} type="button" aria-label="Close remove confirmation" disabled={deleting} onClick={() => deleteDialog.current?.close()}><X aria-hidden="true" size={19} /></button>
        </header>
        <p id="inquiry-delete-warning" className={styles.confirmWarning}>{deleteTarget.name} · {deleteTarget.subject || "No subject"}</p>
        <p className={styles.confirmCopy}>This inquiry will leave the staff inbox. Its message, notes, attachments, receipt and audit history remain retained. No files are deleted. This action does not send a new email; any email already in progress keeps its recorded outcome.</p>
        {deleteError && <p className={styles.inlineError} role="alert">{deleteError}</p>}
        <div className={styles.confirmActions}>
          <button className={styles.secondaryButton} type="button" autoFocus disabled={deleting} onClick={() => deleteDialog.current?.close()}>Cancel</button>
          <button className={styles.deleteConfirm} type="button" disabled={deleting} onClick={() => void removeFromInbox()}>{deleting ? "Removing…" : "Remove from inbox"}</button>
        </div>
      </>}
    </dialog>
  </div>;
}
