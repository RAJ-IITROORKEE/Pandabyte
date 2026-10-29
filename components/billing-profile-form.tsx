"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useState, type FormEvent } from "react";
import { parseBillingProfile, type BillingProfile } from "@/lib/account/billing-profile";
import styles from "@/components/account-dashboard.module.css";
import formStyles from "@/components/account.module.css";

export function BillingProfileForm() {
  const { user, isLoaded } = useUser();
  if (!isLoaded) return <p role="status">Loading billing access…</p>;
  if (!user) return <p role="alert">Sign in to manage billing details.</p>;
  return <BillingSession key={user.id} userId={user.id} />;
}
function BillingSession({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<BillingProfile | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [gstin, setGstin] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/account/billing-profile", { cache: "no-store", signal: controller.signal, headers: { "x-account-owner": userId } }).then(async response => {
      if (!response.ok) throw new Error();
      const body: unknown = await response.json();
      const value = body && typeof body === "object" && "billingProfile" in body ? parseBillingProfile(body.billingProfile) : null;
      if (!value) throw new Error();
      return value;
    }).then(value => {
      if (controller.signal.aborted) return;
      setProfile(value); setBusinessName(value.businessName); setContactEmail(value.contactEmail); setGstin(value.gstin); setError(""); setLoading(false);
    }).catch(() => { if (!controller.signal.aborted) { setError("Billing details could not be loaded. Try again."); setLoading(false); } });
    return () => controller.abort();
  }, [userId, reload]);
  const dirty = !!profile && (businessName !== profile.businessName || contactEmail !== profile.contactEmail || gstin !== profile.gstin);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/account/billing-profile", { method: "PUT", cache: "no-store", headers: { "Content-Type": "application/json", "x-account-owner": userId }, body: JSON.stringify({ expectedVersion: profile.version, businessName, contactEmail, gstin }) });
      if (!response.ok) throw new Error(response.status === 409 ? "Your account or billing details changed. Reload before saving; your current entries have not been saved." : "Billing details could not be saved. Check your entries and try again.");
      const body: unknown = await response.json();
      const value = body && typeof body === "object" && "billingProfile" in body ? parseBillingProfile(body.billingProfile) : null;
      if (!value) throw new Error("Billing details could not be confirmed. Reload before trying again.");
      setProfile(value); setBusinessName(value.businessName); setContactEmail(value.contactEmail); setGstin(value.gstin); setMessage("Billing details saved to your account.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Billing details could not be saved."); }
    finally { setSaving(false); }
  }
  return <section className={styles.panel} aria-labelledby="billing-profile-heading">
    <h2 id="billing-profile-heading">Billing details</h2>
    <p>Business name and GSTIN can prefill future checkouts. Billing email is saved for future use. GSTIN format is checked, not verified.</p>
    {loading ? <p role="status">Loading billing details…</p> : <>
      {error && <div role="alert"><p>{error}</p><button type="button" disabled={saving} onClick={() => { setLoading(true); setReload(n => n + 1); }}>Reload saved details</button></div>}
      {profile && <form onSubmit={event => void save(event)}>
        <div className={formStyles.formGrid}>
          <label className={formStyles.field}>Business name (optional)<input maxLength={160} value={businessName} onChange={event => { setBusinessName(event.target.value); setMessage(""); }} disabled={saving} /></label>
          <label className={formStyles.field}>Billing email (optional)<input type="email" maxLength={254} value={contactEmail} onChange={event => { setContactEmail(event.target.value); setMessage(""); }} disabled={saving} /></label>
          <label className={formStyles.field}>GSTIN (optional)<input maxLength={15} value={gstin} onChange={event => { setGstin(event.target.value.toUpperCase()); setMessage(""); }} disabled={saving} /></label>
        </div>
        {dirty && <p>Unsaved changes.</p>}
        <button className={formStyles.primaryAction} type="submit" disabled={saving || !dirty}>{saving ? "Saving…" : "Save billing details"}</button>
      </form>}
      {message && <p role="status">{message}</p>}
    </>}
  </section>;
}
