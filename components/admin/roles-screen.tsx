"use client";

import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import { IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AdminNotice } from "@/components/admin/admin-notice";
import { useAdminCapabilities } from "@/components/admin/admin-shell";
import ui from "@/components/admin/admin-ui.module.css";
import { PERMISSION_CATALOG, type RoleDefinition } from "@/lib/admin/access-contract";
import styles from "./roles.module.css";

const PAGE_SIZE = 25;
const RESOURCES: Record<string, readonly string[]> = Object.fromEntries(PERMISSION_CATALOG.map(({ resource, actions }) => [resource, actions]));
const ACTIONS = ["read", "create", "update", "publish", "delete"];
type Account = { userId: string; name: string | null; email: string | null; imageUrl: string | null; verified: boolean; removalPending: boolean; role: string; version: number; protected: boolean; updatedAt: string | null; createdAt: string | null; lastActiveAt: string | null; orderCount: number };
type Role = RoleDefinition;
type UsersResult = { items: Account[]; total: number; stats: { totalUsers: number; staffUsers: number; customerUsers: number; totalRoles: number; byRole: { role: string; count: number }[] } };
type ApiError = Error & { status?: number; code?: string };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error: ApiError = new Error(body?.error?.message || "The request could not be completed. Please try again.");
    error.status = response.status;
    error.code = body?.error?.code;
    throw error;
  }
  return body as T;
}
function date(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "—" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(parsed);
}
function label(value: string) { return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
function roleLabel(key: string, roles: Role[]) { return roles.find((role) => role.key === key)?.name ?? (key.startsWith("custom_") ? "Custom role" : label(key)); }
function actionLabel(resource: string, action: string) { return action === "delete" ? (resource === "inquiries" ? "Delete" : "Archive") : label(action); }

export function RolesScreen() {
  const { user, isLoaded } = useUser();
  if (!isLoaded) return <div className={ui.screen}><p role="status">Loading users…</p></div>;
  if (!user) return <div className={ui.screen}><p role="alert">Your account could not be loaded. Refresh and try again.</p></div>;
  return <RoleSession key={user.id} userId={user.id} />;
}

function RoleSession({ userId }: { userId: string }) {
  const capabilities = useAdminCapabilities();
  const canManage = capabilities.includes("staff.manage") && !capabilities.includes("__custom_role__");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<UsersResult | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<Account | null>(null);
  const [chosenRole, setChosenRole] = useState("");
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roleReason, setRoleReason] = useState("");
  const [tab, setTab] = useState<"details" | "custom">("details");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [removalTarget, setRemovalTarget] = useState<Account | null>(null);
  const [removalConfirm, setRemovalConfirm] = useState("");
  const [removalReason, setRemovalReason] = useState("");
  const assignmentDialog = useRef<HTMLDialogElement>(null);
  const roleDialog = useRef<HTMLDialogElement>(null);
  const removalDialog = useRef<HTMLDialogElement>(null);
  const removalInvoker = useRef<HTMLButtonElement | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const removed = useRef(false);
  const mutation = useRef<AbortController | null>(null);
  const active = useRef(true);

  useEffect(() => { active.current = true; return () => { active.current = false; mutation.current?.abort(); }; }, []);
  useEffect(() => { if (query === search) return; const timer = setTimeout(() => { setLoading(true); setSearch(query); setOffset(0); }, 300); return () => clearTimeout(timer); }, [query, search]);
  useEffect(() => {
    if (!canManage) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ query: search, limit: String(PAGE_SIZE), offset: String(offset) });
    Promise.all([
      request<UsersResult>(`/api/admin/users?${params}`, { signal: controller.signal }),
      request<{ items: Role[] }>("/api/admin/role-definitions", { signal: controller.signal }),
    ]).then(([users, definitions]) => { if (!controller.signal.aborted) { setData(users); setRoles(definitions.items); setError(""); setErrorDismissed(false); setLoading(false); } })
      .catch((failure: unknown) => { if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : "Users could not be loaded."); setErrorDismissed(false); if ((failure as ApiError)?.status === 401 || (failure as ApiError)?.status === 403) { setData(null); setRoles([]); } setLoading(false); } });
    return () => controller.abort();
  }, [canManage, search, offset, reload]);
  function refresh() { setLoading(true); setError(""); setErrorDismissed(false); setReload((value) => value + 1); }
  function openAssignment(account: Account) {
    if (!account.verified || !account.email || account.removalPending || account.protected || account.userId === userId) return;
    setSelected(account); setChosenRole(account.role); setReason(""); setFormError(""); setConflict(false); assignmentDialog.current?.showModal();
  }
  function openRole(role?: Role) {
    setEditing(role ?? null); setRoleName(role?.name ?? ""); setDescription(role?.description ?? ""); setPermissions(role?.permissions ?? []); setRoleReason(""); setFormError(""); setConflict(false); roleDialog.current?.showModal();
  }
  async function save(url: string, body: unknown, dialog: HTMLDialogElement | null, success: string) {
    if (busy || conflict) return;
    const controller = new AbortController(); mutation.current = controller; setBusy(true); setFormError("");
    try {
      await request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      if (!active.current || controller.signal.aborted) return;
      dialog?.close(); toast.success(success); refresh();
    } catch (failure) {
      if (!active.current || controller.signal.aborted) return;
      const e = failure as ApiError;
      if (e.code === "conflict" || e.status === 409) { setConflict(true); setFormError("This record changed since it was loaded. Close this dialog, reload and review the latest details before trying again."); }
      else { setFormError(e.message || "The request could not be completed."); toast.error(e.message || "The request could not be completed."); }
    } finally { if (mutation.current === controller) mutation.current = null; if (active.current && !controller.signal.aborted) setBusy(false); }
  }
  function submitAssignment(event: FormEvent) {
    event.preventDefault();
    if (!selected?.email || !selected.verified || selected.removalPending || selected.protected || selected.userId === userId || !chosenRole || !reason.trim()) return;
    void save("/api/admin/roles", { email: selected.email, role: chosenRole, expectedVersion: selected.version, reason: reason.trim(), targetUserId: selected.userId }, assignmentDialog.current, "Role updated.");
  }
  function submitRole(event: FormEvent) {
    event.preventDefault();
    if (!roleName.trim() || !roleReason.trim()) return;
    void save("/api/admin/role-definitions", { key: editing?.key ?? null, name: roleName.trim(), description: description.trim(), permissions, expectedVersion: editing?.version ?? 0, reason: roleReason.trim() }, roleDialog.current, editing ? "Role updated." : "Role created.");
  }
  function openRemoval(account: Account, invoker: HTMLButtonElement) {
    if (busy || account.protected || account.userId === userId) return;
    removalInvoker.current = invoker; removed.current = false; setRemovalTarget(account); setRemovalConfirm(""); setRemovalReason(""); setFormError(""); setConflict(false); removalDialog.current?.showModal();
  }
  async function removeAccount(event: FormEvent) {
    event.preventDefault();
    const account = removalTarget;
    if (!account || account.protected || account.userId === userId || busy || conflict || removalConfirm !== "DELETE" || !removalReason.trim()) return;
    const controller = new AbortController(); mutation.current = controller; setBusy(true); setFormError("");
    try {
      await request(`/api/admin/users/${encodeURIComponent(account.userId)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: account.version, reason: removalReason.trim() }), signal: controller.signal });
      if (!active.current || controller.signal.aborted) return;
      removed.current = true; removalDialog.current?.close(); setData((current) => current ? { ...current, items: current.items.filter((item) => item.userId !== account.userId) } : current); toast.success("Account deleted."); refresh();
    } catch (failure) {
      if (!active.current || controller.signal.aborted) return;
      const e = failure as ApiError;
      if (e.code === "removal_pending") { setConflict(true); setFormError("Staff access removed; account removal is pending. Reload to retry."); }
      else if (e.code === "conflict" || e.status === 409) { setConflict(true); setFormError("This account changed since it was loaded. Close this dialog and reload before trying again."); }
      else { const message = e.message || "Account could not be deleted."; setFormError(message); toast.error(message); }
    } finally { if (mutation.current === controller) mutation.current = null; if (active.current && !controller.signal.aborted) setBusy(false); }
  }
  function toggle(resource: string, action: string, checked: boolean) {
    setPermissions((current) => {
      const next = new Set(current); const key = `${resource}.${action}`;
      if (checked) { next.add(key); if (action !== "read") next.add(`${resource}.read`); if (action === "publish" || action === "delete") next.add(`${resource}.update`); }
      else { next.delete(key); if (action === "read") RESOURCES[resource].forEach((item) => next.delete(`${resource}.${item}`)); if (action === "update") { next.delete(`${resource}.publish`); next.delete(`${resource}.delete`); } }
      return [...next];
    });
  }
  if (!canManage) return <div className={ui.screen}><section className={ui.panel}><h1>Access denied</h1><p className={ui.lede}>Your role does not allow you to manage users and roles.</p></section></div>;
  const stats = data?.stats;
  return <div className={ui.screen}>
    <div className={ui.pageHeading}><div><h1>Users &amp; roles</h1><p className={ui.lede}>Manage account access and review role permissions.</p></div></div>
    {error && !errorDismissed && <AdminNotice tone="error" onDismiss={() => setErrorDismissed(true)}><p>{error}</p><button type="button" className={ui.secondaryButton} onClick={refresh}>Reload</button></AdminNotice>}
    <div className={styles.stats} aria-label="Account summary">{[["Roles", stats?.totalRoles], ["All accounts", stats?.totalUsers], ["Staff accounts", stats?.staffUsers], ["Customers", stats?.customerUsers]].map(([title, count]) => <div className={styles.stat} key={title}><span>{title}</span><strong>{count ?? "—"}</strong></div>)}</div>
    {stats && <div className={styles.distribution}><span>Role distribution</span>{stats.byRole.map((item) => <span className={ui.statusPill} key={item.role}>{roleLabel(item.role, roles)}: {item.count}</span>)}</div>}
    <section className={ui.panel} aria-labelledby="users-title">
      <div className={ui.sectionHeading}><div><h2 id="users-title">Accounts</h2><p>Choose a verified account to assign or change its role.</p></div></div>
      <label className={styles.search}><span className={ui.visuallyHidden}>Search accounts</span><input ref={searchInput} className={ui.input} type="search" placeholder="Search name or email" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className={`${ui.tableFrame} ${styles.tableFrame}`} role="region" aria-label="Accounts" tabIndex={0}><table className={`${ui.table} ${styles.table}`}><thead><tr><th scope="col">Account</th><th scope="col">Verification</th><th scope="col">Role</th><th scope="col">Orders</th><th scope="col">Updated</th><th scope="col">Action</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={6} className={ui.tableMessage}>Loading accounts…</td></tr> : error ? <tr><td colSpan={6} className={ui.tableMessage}>Could not load accounts. <button type="button" className={ui.secondaryButton} onClick={refresh}>Reload</button></td></tr> : !data?.items.length ? <tr><td colSpan={6} className={ui.tableMessage}>No accounts found.</td></tr> : data.items.map((account, index) => <tr key={account.userId}><td><div className={styles.identity}><span className={styles.avatar}>{account.imageUrl ? <Image src={account.imageUrl} alt="" width={36} height={36} unoptimized /> : (account.name || account.email || "?").charAt(0).toUpperCase()}</span><span><strong>{account.name || "Unnamed account"}</strong><small>{account.email || "Email unavailable"}</small></span></div></td><td>{account.verified ? "Verified" : "Unverified"}</td><td><span className={ui.statusPill}>{roleLabel(account.role, roles)}</span></td><td>{account.orderCount ?? 0}</td><td>{date(account.updatedAt)}</td><td>{account.protected ? "Protected" : account.userId === userId ? "Your account" : <div className={styles.rowActions}><button type="button" className={ui.secondaryButton} disabled={busy || account.removalPending || !account.verified || !account.email} onClick={() => openAssignment(account)}>{account.role === "CUSTOMER" ? "Assign role" : "Change role"}</button><button type="button" className={styles.removeButton} disabled={busy} aria-label={`${account.removalPending ? "Retry removal of" : "Delete"} ${account.name || account.email || "account"}${account.name && account.email ? `, ${account.email}` : ""}, row ${offset + index + 1}`} title={account.removalPending ? "Retry removal" : "Delete account"} onClick={(event) => openRemoval(account, event.currentTarget)}><IconTrash size={17} aria-hidden="true" />{account.removalPending && <span>Retry removal</span>}</button></div>}</td></tr>)}
      </tbody></table></div>
      <div className={ui.pagination}><span>{data && data.total > 0 ? `${offset + 1}–${Math.min(offset + data.items.length, data.total)} of ${data.total}` : ""}</span><div><button className={ui.secondaryButton} type="button" disabled={loading || offset === 0} onClick={() => { setLoading(true); setOffset(Math.max(0, offset - PAGE_SIZE)); }}>Previous</button><button className={ui.secondaryButton} type="button" disabled={loading || !data || offset + PAGE_SIZE >= data.total || offset + PAGE_SIZE > 5000} onClick={() => { setLoading(true); setOffset(offset + PAGE_SIZE); }}>Next</button></div></div>
    </section>
    <section className={ui.panel} aria-labelledby="roles-title"><div className={ui.sectionHeading}><div><h2 id="roles-title">Role catalog</h2><p>Built-in roles are read-only. Access administration is reserved for administrators.</p></div><button className={ui.primaryButton} type="button" onClick={() => openRole()}>Create role</button></div>
      <div className={styles.tabs} aria-label="Role catalog views"><button type="button" aria-pressed={tab === "details"} onClick={() => setTab("details")}>Role details</button><button type="button" aria-pressed={tab === "custom"} onClick={() => setTab("custom")}>Custom roles</button></div>
      <div className={styles.roleGrid}>{roles.filter((role) => tab === "details" || !role.builtIn).map((role) => <article className={styles.roleCard} key={role.key}><div><h3>{role.name}</h3><p>{role.description || "No description."}</p><p>{role.memberCount} {role.memberCount === 1 ? "explicit assignment" : "explicit assignments"} · {role.builtIn ? "Built-in" : "Custom"}</p></div><details className={styles.permissionDetails}><summary>View permissions</summary>{role.permissions.length ? <ul>{PERMISSION_CATALOG.map(({ resource, label: resourceLabel, actions }) => { const selectedActions = actions.filter((action) => role.permissions.includes(`${resource}.${action}`)); return selectedActions.length ? <li key={resource}><strong>{resourceLabel}:</strong> {selectedActions.map((action) => actionLabel(resource, action)).join(", ")}</li> : null; })}</ul> : <p>No staff permissions</p>}</details>{!role.builtIn && <button className={ui.secondaryButton} type="button" onClick={() => openRole(role)}>Edit role</button>}</article>)}{tab === "custom" && !roles.some((role) => !role.builtIn) && <p>No custom roles yet.</p>}</div>
    </section>
    <dialog ref={removalDialog} className={styles.dialog} aria-labelledby="remove-account-title" aria-describedby="remove-account-warning" onCancel={(event) => { if (busy) event.preventDefault(); }} onClose={() => { if (conflict) refresh(); const target = removed.current ? searchInput.current : removalInvoker.current; requestAnimationFrame(() => { if (target?.isConnected) target.focus(); else searchInput.current?.focus(); }); }}><form onSubmit={removeAccount}><h2 id="remove-account-title">{removalTarget?.removalPending ? "Retry account removal?" : "Delete account?"}</h2><p><strong>{removalTarget?.name || "Account"}</strong> · {removalTarget?.email || "Email unavailable"}</p><p id="remove-account-warning">This permanently deletes the sign-in account and revokes its sessions. Past orders and admin history are retained. This cannot be undone.</p><label className={ui.field}><span className={ui.fieldLabel}>Type DELETE to confirm</span><input className={ui.input} value={removalConfirm} onChange={(event) => setRemovalConfirm(event.target.value)} disabled={busy} autoComplete="off" /></label><label className={ui.field}><span className={ui.fieldLabel}>Reason</span><textarea className={ui.textarea} required maxLength={500} value={removalReason} onChange={(event) => setRemovalReason(event.target.value)} disabled={busy} /></label>{formError && <AdminNotice tone="error" onDismiss={() => setFormError("")}>{formError}</AdminNotice>}<div className={styles.actions}><button autoFocus type="button" className={ui.secondaryButton} disabled={busy} onClick={() => removalDialog.current?.close()}>Cancel</button><button type="submit" className={styles.dangerButton} disabled={busy || conflict || removalConfirm !== "DELETE" || !removalReason.trim()}>{busy ? "Deleting…" : removalTarget?.removalPending ? "Retry removal" : "Delete account"}</button></div></form></dialog>
    <dialog ref={assignmentDialog} className={styles.dialog} aria-labelledby="assignment-title" onCancel={(event) => { if (busy) event.preventDefault(); }} onClose={() => { if (conflict) refresh(); }}><form onSubmit={submitAssignment}><h2 id="assignment-title">Change account role</h2><p>{selected?.name || "Account"} · {selected?.email}</p><label className={ui.field}><span className={ui.fieldLabel}>Role</span><select autoFocus className={ui.input} value={chosenRole} onChange={(event) => setChosenRole(event.target.value)} required disabled={busy}>{roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}</select></label><label className={ui.field}><span className={ui.fieldLabel}>Reason</span><textarea className={ui.textarea} required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} /></label><p className={ui.fieldHint}>This replaces the account’s current permissions.</p>{formError && <AdminNotice tone="error" onDismiss={() => setFormError("")}>{formError}</AdminNotice>}<div className={styles.actions}><button type="button" className={ui.secondaryButton} disabled={busy} onClick={() => assignmentDialog.current?.close()}>Cancel</button><button type="submit" className={ui.primaryButton} disabled={busy || conflict}>{busy ? "Saving…" : "Save role"}</button></div></form></dialog>
    <dialog ref={roleDialog} className={`${styles.dialog} ${styles.roleDialog}`} aria-labelledby="role-editor-title" onCancel={(event) => { if (busy) event.preventDefault(); }} onClose={() => { if (conflict) refresh(); }}><form onSubmit={submitRole}><h2 id="role-editor-title">{editing ? "Edit custom role" : "Create custom role"}</h2><label className={ui.field}><span className={ui.fieldLabel}>Name</span><input autoFocus className={ui.input} required maxLength={80} value={roleName} onChange={(event) => setRoleName(event.target.value)} disabled={busy} /></label><label className={ui.field}><span className={ui.fieldLabel}>Description</span><textarea className={ui.textarea} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} disabled={busy} /></label><h3>Permissions</h3><p className={ui.fieldHint}>Changes require read access; publish and archive/delete also require update. Staff and users are managed by administrators only.</p><div className={styles.matrixFrame} role="region" aria-label="Permissions matrix" tabIndex={0}><table className={styles.matrix}><thead><tr><th scope="col">Resource</th>{ACTIONS.map((action) => <th scope="col" key={action}>{action === "delete" ? "Archive/delete" : label(action)}</th>)}</tr></thead><tbody>{Object.entries(RESOURCES).map(([resource, actions]) => <tr key={resource}><th scope="row">{label(resource)}</th>{ACTIONS.map((action) => <td key={action}>{actions.includes(action) ? <input type="checkbox" aria-label={`${label(action === "delete" ? "archive/delete" : action)} ${resource}`} checked={permissions.includes(`${resource}.${action}`)} disabled={busy} onChange={(event) => toggle(resource, action, event.target.checked)} /> : "—"}</td>)}</tr>)}</tbody></table></div><label className={ui.field}><span className={ui.fieldLabel}>Reason</span><textarea className={ui.textarea} required maxLength={500} value={roleReason} onChange={(event) => setRoleReason(event.target.value)} disabled={busy} /></label>{formError && <AdminNotice tone="error" onDismiss={() => setFormError("")}>{formError}</AdminNotice>}<div className={styles.actions}><button type="button" className={ui.secondaryButton} disabled={busy} onClick={() => roleDialog.current?.close()}>Cancel</button><button type="submit" className={ui.primaryButton} disabled={busy || conflict}>{busy ? "Saving…" : "Save role"}</button></div></form></dialog>
  </div>;
}
