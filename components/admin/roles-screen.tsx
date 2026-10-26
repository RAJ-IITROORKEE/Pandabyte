"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAdminCapabilities } from "@/components/admin/admin-shell";
import ui from "@/components/admin/admin-ui.module.css";
import { parseStaffRoleList, parseStaffRoleMembership, STAFF_ROLES, type StaffRole, type StaffRoleChange, type StaffRoleMembership } from "@/lib/admin/roles-validation";
import styles from "./roles.module.css";

const PAGE_SIZE = 25;
type SignedInUser = NonNullable<ReturnType<typeof useUser>["user"]>;

type RoleApiErrorBody = { error?: { code?: unknown } };
type RoleMembershipResponse = { membership: StaffRoleMembership };

class RoleRequestError extends Error {
  constructor(readonly status: number, readonly code?: string) {
    super("Role request failed.");
  }
}

function parseRoleMembershipResponse(value: unknown): RoleMembershipResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  if (Object.keys(response).length !== 1 || !Object.hasOwn(response, "membership")) return null;
  const membership = parseStaffRoleMembership(response.membership);
  return membership ? { membership } : null;
}

async function request<T>(url: string, parse: (value: unknown) => T | null, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body && typeof body === "object" && !Array.isArray(body) && "error" in body
      ? (body as RoleApiErrorBody).error
      : undefined;
    throw new RoleRequestError(response.status, error && typeof error.code === "string" ? error.code : undefined);
  }
  const parsed = parse(body);
  if (!parsed) throw new RoleRequestError(503, "backend_unavailable");
  return parsed;
}

function messageFor(reason: unknown) {
  if (!(reason instanceof RoleRequestError)) return "Role services could not be reached. Try again.";
  switch (reason.code) {
    case "unauthorized": return "Your sign-in has expired. Sign in again before managing roles.";
    case "forbidden": return "Your account does not have permission to manage roles.";
    case "invalid_role_request": return "Check the verified email, role, and reason, then try again.";
    case "identity_not_found": return "That email did not match one verified account or the selected membership. Recheck the email and row.";
    case "conflict": return "The role changed after it was loaded. Reload the list and review the current membership before retrying.";
    case "protected_admin": return "The protected administrator cannot be changed here.";
    case "self_change": return "You cannot change your own role.";
    case "last_admin": return "At least one administrator must remain assigned.";
    case "staff_limit": return "The staff membership limit has been reached.";
    case "backend_unavailable": return "Role services are temporarily unavailable. Try again shortly.";
    default:
      if (reason.status === 401) return "Your sign-in has expired. Sign in again before managing roles.";
      if (reason.status === 403) return "Your account does not have permission to manage roles.";
      return "Role services could not complete the request. Try again.";
  }
}

function statusOf(reason: unknown) {
  return reason instanceof RoleRequestError ? reason.status : null;
}

const ROLE_DETAILS: Record<StaffRole, { description: string; capabilities: readonly string[] }> = {
  ADMIN: {
    description: "Full access to the admin workspace.",
    capabilities: ["catalog.edit", "content.edit", "content.publish", "orders.manage", "media.manage", "inquiries.manage", "staff.manage"],
  },
  EDITOR: {
    description: "Edit and publish site content, and manage media.",
    capabilities: ["content.edit", "content.publish", "media.manage"],
  },
  CATALOG: {
    description: "Edit the catalog and media, and adjust inventory.",
    capabilities: ["catalog.edit", "media.manage", "orders.manage"],
  },
  SUPPORT: {
    description: "Manage customer inquiries.",
    capabilities: ["inquiries.manage"],
  },
  CUSTOMER: {
    description: "Access to the storefront and personal account.",
    capabilities: [],
  },
};

const CAPABILITY_LABELS: Record<string, string> = {
  "catalog.edit": "Catalog editing",
  "content.edit": "Content editing",
  "content.publish": "Content publishing",
  "orders.manage": "Orders and inventory",
  "media.manage": "Media library",
  "inquiries.manage": "Customer inquiries",
  "staff.manage": "Staff access",
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date)
    : "Unknown";
}

export function RolesScreen() {
  const { user, isLoaded } = useUser();
  if (!isLoaded) return <div className={ui.screen}><p className={ui.loadingState} role="status">Loading staff access…</p></div>;
  if (!user) return <div className={ui.screen}><p className={ui.inlineError} role="alert">Your account could not be loaded. Refresh the page and try again.</p></div>;
  return <RoleSession key={user.id} user={user} />;
}

function RoleSession({ user }: { user: SignedInUser }) {
  const capabilities = useAdminCapabilities();
  const canManage = capabilities.includes("staff.manage");
  const [memberships, setMemberships] = useState<StaffRoleMembership[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole | "">("");
  const [reason, setReason] = useState("");
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [expectedVersion, setExpectedVersion] = useState(0);
  const [submitError, setSubmitError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflictPending, setConflictPending] = useState(false);
  const [conflictReloaded, setConflictReloaded] = useState(false);
  const conflictPendingRef = useRef(false);
  const sessionActiveRef = useRef(true);
  const mutationControllerRef = useRef<AbortController | null>(null);
  const verifiedEmails = new Set((user?.emailAddresses ?? [])
    .filter((address) => address.verification?.status === "verified")
    .map((address) => address.emailAddress.trim().toLowerCase()));
  const isSelfEmail = Boolean(email.trim() && verifiedEmails.has(email.trim().toLowerCase()));
  const accessBlocked = statusOf(loadError) === 401 || statusOf(loadError) === 403;

  useEffect(() => {
    sessionActiveRef.current = true;
    return () => {
      sessionActiveRef.current = false;
      mutationControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!canManage) return;
    let active = true;
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });

    request(`/api/admin/roles?${params}`, parseStaffRoleList, { signal: controller.signal })
      .then((result) => {
        if (!active) return;
        setMemberships(result.items);
        setTotal(result.total);
        if (conflictPendingRef.current) setConflictReloaded(true);
      })
      .catch((error: unknown) => {
        if (active && !controller.signal.aborted) setLoadError(error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; controller.abort(); };
  }, [canManage, offset, reloadKey]);

  function startNewAssignment() {
    setEmail("");
    setRole("");
    setReason("");
    setTargetUserId(null);
    setExpectedVersion(0);
    setSubmitError("");
    setNotice("");
    setConflictPending(false);
    setConflictReloaded(false);
    conflictPendingRef.current = false;
  }

  function selectMembership(membership: StaffRoleMembership) {
    if (busy || loading || loadError || membership.protected || membership.userId === user.id) return;
    if (conflictPending && conflictReloaded) {
      setTargetUserId(membership.userId);
      setExpectedVersion(membership.version);
      setSubmitError("");
      setNotice("Latest role selected. Confirm the account email and change details before saving.");
      setConflictPending(false);
      setConflictReloaded(false);
      conflictPendingRef.current = false;
      return;
    }
    if (conflictPending) return;
    if (targetUserId === membership.userId) return;
    setTargetUserId(membership.userId);
    setExpectedVersion(membership.version);
    setEmail(membership.identity?.email ?? "");
    setRole(membership.role);
    setReason("");
    setSubmitError("");
    setNotice("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || busy || accessBlocked || !role || !email.trim() || !reason.trim() || isSelfEmail || conflictPending) return;
    const body: StaffRoleChange = {
      email: email.trim(),
      role,
      expectedVersion: targetUserId ? expectedVersion : 0,
      reason: reason.trim(),
      targetUserId,
    };
    setBusy(true);
    setSubmitError("");
    setNotice("");
    const controller = new AbortController();
    mutationControllerRef.current = controller;
    try {
      const result = await request("/api/admin/roles", parseRoleMembershipResponse, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!sessionActiveRef.current || controller.signal.aborted) return;
      const savedRole = result.membership.role;
      setEmail("");
      setRole("");
      setReason("");
      setTargetUserId(null);
      setExpectedVersion(0);
      setConflictPending(false);
      setConflictReloaded(false);
      conflictPendingRef.current = false;
      setNotice(`${savedRole} role saved. The membership list is refreshing.`);
      setLoading(true);
      setLoadError(null);
      setMemberships([]);
      setTotal(null);
      setOffset(0);
      setReloadKey((value) => value + 1);
    } catch (error) {
      if (!sessionActiveRef.current || controller.signal.aborted) return;
      setSubmitError(messageFor(error));
      if (error instanceof RoleRequestError && error.code === "conflict") {
        setConflictPending(true);
        setConflictReloaded(false);
        conflictPendingRef.current = true;
      }
    } finally {
      if (mutationControllerRef.current === controller) mutationControllerRef.current = null;
      if (sessionActiveRef.current && !controller.signal.aborted) setBusy(false);
    }
  }

  function reloadRoles() {
    setLoading(true);
    setLoadError(null);
    setMemberships([]);
    setTotal(null);
    setConflictReloaded(false);
    if (conflictPending) setOffset(0);
    setReloadKey((value) => value + 1);
  }

  function changePage(nextOffset: number) {
    setLoading(true);
    setLoadError(null);
    setMemberships([]);
    setTotal(null);
    setOffset(nextOffset);
  }

  if (!canManage) {
    return <div className={ui.screen}><section className={ui.panel}>
      <h1 className={styles.deniedTitle}>Access denied</h1>
      <p className={ui.lede}>Your role does not allow you to view or change staff access.</p>
    </section></div>;
  }

  return <div className={ui.screen}>
    <div className={ui.pageHeading}><div>
      <h1>Users &amp; roles</h1>
      <p className={ui.lede}>Assign one role to an existing verified account.</p>
    </div></div>

    <section className={ui.panel} aria-labelledby="role-matrix-title">
      <div className={ui.sectionHeading}><div><h2 id="role-matrix-title">What each role can do</h2><p>Each role replaces the person’s current staff permissions.</p></div></div>
      <div className={styles.roleGrid}>
        {STAFF_ROLES.map((staffRole) => <article className={styles.roleCard} key={staffRole}>
          <div className={styles.roleHeading}><h3>{staffRole}</h3><p>{ROLE_DETAILS[staffRole].description}</p></div>
          {ROLE_DETAILS[staffRole].capabilities.length
            ? <ul className={styles.roleCapabilities}>{ROLE_DETAILS[staffRole].capabilities.map((capability) => <li key={capability}>{CAPABILITY_LABELS[capability]}</li>)}</ul>
            : <p className={styles.noCapabilities}>No staff access</p>}
        </article>)}
      </div>
    </section>

    <section className={ui.panel} aria-labelledby="memberships-title">
      <div className={ui.sectionHeading}><div>
        <h2 id="memberships-title">Role memberships</h2>
        <p>{loading ? "Loading memberships…" : total === null ? "Membership count unavailable." : `${total} role ${total === 1 ? "membership" : "memberships"}.`}</p>
      </div></div>
      {loadError !== null && <div className={ui.errorBanner} role="alert"><p>{messageFor(loadError)}</p><button className={ui.secondaryButton} type="button" onClick={reloadRoles} disabled={loading}>Reload roles</button></div>}
      {conflictPending && <div className={ui.errorBanner} role="alert"><p>{conflictReloaded
        ? "The list is current. Select the intended role again to confirm the change; your email, requested role, and reason are preserved."
        : "This membership changed after it was loaded. Reload and review the latest row before retrying; your form is preserved."}</p>{!conflictReloaded && <button className={ui.secondaryButton} type="button" onClick={reloadRoles} disabled={loading}>Reload roles</button>}</div>}
      <div className={`${ui.tableFrame} ${styles.roleTableFrame}`} role="region" aria-label="Role memberships" tabIndex={0}>
        <table className={`${ui.table} ${styles.roleTable}`}>
          <thead><tr><th scope="col">Account</th><th scope="col">Role</th><th scope="col">Last updated</th><th scope="col">Protection</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4} className={ui.tableMessage}>Loading role memberships…</td></tr>}
            {!loading && loadError !== null && <tr><td colSpan={4} className={ui.tableMessage}>Role memberships could not be loaded.</td></tr>}
            {!loading && !loadError && memberships.length === 0 && <tr><td colSpan={4} className={ui.tableMessage}>No role memberships yet. Enter a verified account email below to assign a role.</td></tr>}
            {!loading && !loadError && memberships.map((membership) => {
              const isSelf = membership.userId === user.id;
              const locked = membership.protected || isSelf;
              const reviewWait = conflictPending && !conflictReloaded;
              const accountEmail = membership.identity?.email?.trim() || "";
              const accountName = membership.identity?.name?.trim() || accountEmail || "Account unavailable";
              const accountLabel = accountEmail && accountEmail !== accountName ? `${accountName}, ${accountEmail}` : accountName;
              return <tr className={targetUserId === membership.userId ? ui.selectedRow : ui.selectableRow} key={membership.userId}>
                <td><div className={styles.memberIdentity}>
                  <div className={styles.memberIdentityDetails}><strong>{accountName}</strong>{accountEmail && accountEmail !== accountName && <span>{accountEmail}</span>}</div>
                  {locked ? <span>{membership.protected ? "Protected admin" : "Your account"}</span> : <button className={styles.membershipSelect} type="button" onClick={() => selectMembership(membership)} disabled={busy || loading || Boolean(loadError) || reviewWait} aria-label={`${conflictPending ? "Review" : "Select"} ${membership.role} membership for ${accountLabel}`}>
                    {conflictPending ? "Review latest role" : targetUserId === membership.userId ? "Selected" : "Select membership"}
                  </button>}
                </div></td>
                <td><span className={ui.statusPill}>{membership.role}</span></td>
                <td>{formatDate(membership.updatedAt)}</td>
                <td>{membership.protected ? <span className={styles.protectedLabel}>Protected</span> : isSelf ? "You" : "—"}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className={ui.pagination}>
        <span>{total === null || total === 0 ? "" : `${offset + 1}–${Math.min(offset + memberships.length, total)} of ${total}`}</span>
        <div>
          <button className={ui.secondaryButton} type="button" onClick={() => changePage(Math.max(0, offset - PAGE_SIZE))} disabled={loading || offset === 0}>Previous</button>
          <button className={ui.secondaryButton} type="button" onClick={() => changePage(offset + PAGE_SIZE)} disabled={loading || total === null || offset + PAGE_SIZE >= total || offset + PAGE_SIZE > 5000}>Next</button>
        </div>
      </div>
    </section>

    <section className={ui.panel} aria-labelledby="assign-role-title">
      <div className={ui.sectionHeading}><div><h2 id="assign-role-title">Assign or change a role</h2><p>Select a membership above, or enter a verified email for a new assignment.</p></div></div>
      {conflictPending && <p className={styles.reviewHint} role="status">{conflictReloaded
        ? "Select the intended role above to continue. Your email, requested role, and reason will stay filled."
        : "Reload and review the membership list above before selecting the target again."}</p>}
      <form className={styles.roleForm} onSubmit={submit}>
        <fieldset className={styles.roleFieldset} disabled={busy || accessBlocked}>
          <legend className={ui.visuallyHidden}>Role membership change details</legend>
          <div className={styles.roleFormFields}>
            <label className={ui.field} htmlFor="role-target-email"><span className={ui.fieldLabel}>Verified account email</span><input className={ui.input} id="role-target-email" type="email" autoComplete="off" required maxLength={254} value={email} onChange={(event) => { setEmail(event.target.value); setSubmitError(""); setNotice(""); }} aria-describedby="role-email-hint" /><span className={ui.fieldHint} id="role-email-hint">For an existing role, confirm the verified email shown in its row.</span></label>
            <label className={ui.field} htmlFor="role-choice"><span className={ui.fieldLabel}>Role</span><select className={`${ui.input} ${styles.roleSelect}`} id="role-choice" value={role} onChange={(event) => { setRole(event.target.value as StaffRole | ""); setSubmitError(""); setNotice(""); }} required><option value="">Choose a role</option>{STAFF_ROLES.map((staffRole) => <option value={staffRole} key={staffRole}>{staffRole}</option>)}</select><span className={ui.fieldHint}>{role ? ROLE_DETAILS[role].description : "Choose one of the five fixed roles."}</span></label>
            <label className={`${ui.field} ${styles.reasonField}`} htmlFor="role-reason"><span className={ui.fieldLabel}>Reason</span><textarea className={ui.textarea} id="role-reason" rows={3} maxLength={500} required value={reason} onChange={(event) => { setReason(event.target.value); setSubmitError(""); setNotice(""); }} aria-describedby="role-reason-hint" /><span className={ui.fieldHint} id="role-reason-hint">Required audit reason, up to 500 characters.</span></label>
          </div>
          <p className={styles.replacementNotice}>This replaces the person’s current staff permissions. CUSTOMER removes staff access.</p>
          {targetUserId && <p className={ui.fieldHint}>Selected account. Confirm the verified email above before saving.</p>}
          {isSelfEmail && <p className={ui.inlineError} role="status">This verified email belongs to your signed-in account. Self role changes are unavailable.</p>}
          {submitError && !conflictPending && <div className={ui.errorBanner} role="alert"><p>{submitError}</p></div>}
          {notice && <p className={ui.successBanner} role="status">{notice}</p>}
          <div className={styles.formActions}>
            <button className={ui.secondaryButton} type="button" onClick={startNewAssignment} disabled={busy}>Start new assignment</button>
            <button className={ui.primaryButton} type="submit" disabled={busy || accessBlocked || !role || !email.trim() || !reason.trim() || isSelfEmail || conflictPending}>{busy ? "Saving role…" : targetUserId ? "Save role change" : "Assign role"}</button>
          </div>
        </fieldset>
      </form>
    </section>
  </div>;
}
