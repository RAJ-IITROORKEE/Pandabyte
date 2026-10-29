"use client";

import { UserAvatar, useClerk, useUser } from "@clerk/nextjs";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { RefreshCw, Save } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { parseBillingProfile, type BillingProfile } from "@/lib/account/billing-profile";
import styles from "@/components/account-profile-card.module.css";

export function AccountProfileCard() {
  const { isLoaded, user } = useUser();
  if (!isLoaded) return <p role="status">Loading your profile…</p>;
  if (!user) return <p role="alert">Sign in to manage your profile.</p>;
  return <ProfileCardSession key={user.id} user={user} />;
}

function ProfileCardSession({ user }: { user: NonNullable<ReturnType<typeof useUser>["user"]> }) {
  const clerk = useClerk();
  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const [savedName, setSavedName] = useState({ first: user.firstName ?? "", last: user.lastName ?? "" });
  const [phone, setPhone] = useState("");
  const [savedPhone, setSavedPhone] = useState("");
  const [email, setEmail] = useState("");
  const [billing, setBilling] = useState<BillingProfile | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const sessionController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    sessionController.current = controller;
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const loadController = new AbortController();
    async function load() {
      try {
        const options = { cache: "no-store" as const, signal: loadController.signal, headers: { "x-account-owner": user.id } };
        const [contactResponse, billingResponse] = await Promise.all([
          fetch("/api/account/profile", options), fetch("/api/account/billing-profile", options),
        ]);
        if (!contactResponse.ok || !billingResponse.ok) throw new Error();
        const contact: unknown = await contactResponse.json();
        const body: unknown = await billingResponse.json();
        const profile = body && typeof body === "object" && "billingProfile" in body ? parseBillingProfile(body.billingProfile) : null;
        if (!profile || !contact || typeof contact !== "object" || !("profile" in contact)) throw new Error();
        const contactProfile = contact.profile;
        if (contactProfile !== null && (!contactProfile || typeof contactProfile !== "object" || !("phone" in contactProfile) || typeof contactProfile.phone !== "string")) throw new Error();
        if (loadController.signal.aborted) return;
        const value = contactProfile === null ? "" : (contactProfile as { phone: string }).phone;
        setPhone(value); setSavedPhone(value); setBilling(profile); setEmail(profile.contactEmail); setError("");
      } catch {
        if (!loadController.signal.aborted) setError("Your profile details could not be loaded. Please try again.");
      } finally { if (!loadController.signal.aborted) setLoading(false); }
    }
    void load();
    return () => loadController.abort();
  }, [user.id, reload]);

  const dirty = firstName !== savedName.first || lastName !== savedName.last || phone !== savedPhone || email !== billing?.contactEmail || !!photo;
  const clearFeedback = () => { setMessage(""); setError(""); };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!billing || saving || !dirty) return;
    setSaving(true); setError(""); setMessage("");
    const controller = sessionController.current;
    if (!controller || controller.signal.aborted) { setSaving(false); return; }
    const saved: string[] = []; const failed: string[] = [];
    const active = () => !controller.signal.aborted && clerk.user?.id === user.id;
    const attempt = async (label: string, action: () => Promise<void>) => {
      if (!active()) return;
      try { await action(); if (active()) saved.push(label); }
      catch { if (active()) failed.push(label); }
    };
    if (firstName !== savedName.first || lastName !== savedName.last) await attempt("name", async () => {
      const updated = await user.update({ firstName: firstName.trim(), lastName: lastName.trim() });
      if (!active()) return;
      setFirstName(updated.firstName ?? ""); setLastName(updated.lastName ?? "");
      setSavedName({ first: updated.firstName ?? "", last: updated.lastName ?? "" });
    });
    if (photo) await attempt("photo", async () => {
      await user.setProfileImage({ file: photo });
      if (active()) setPhoto(null);
    });
    if (phone !== savedPhone) await attempt("contact phone", async () => {
      const response = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json", "x-account-owner": user.id }, signal: controller.signal, body: JSON.stringify({ phone: phone.trim() }) });
      if (!response.ok) throw new Error();
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("profile" in body) || !body.profile || typeof body.profile !== "object" || !("phone" in body.profile) || typeof body.profile.phone !== "string") throw new Error();
      if (active()) { setPhone(body.profile.phone); setSavedPhone(body.profile.phone); }
    });
    if (email !== billing.contactEmail) await attempt("billing email", async () => {
      const response = await fetch("/api/account/billing-profile", { method: "PUT", headers: { "Content-Type": "application/json", "x-account-owner": user.id }, signal: controller.signal, body: JSON.stringify({ expectedVersion: billing.version, businessName: billing.businessName, contactEmail: email, gstin: billing.gstin }) });
      if (!response.ok) throw new Error();
      const body: unknown = await response.json();
      const updated = body && typeof body === "object" && "billingProfile" in body ? parseBillingProfile(body.billingProfile) : null;
      if (!updated) throw new Error();
      if (active()) { setBilling(updated); setEmail(updated.contactEmail); }
    });
    if (!active()) return;
    if (saved.length) setMessage(`Saved: ${saved.join(", ")}.`);
    if (failed.length) setError(`Could not confirm: ${failed.join(", ")}. Your entries are still here. Reload saved details before retrying if they may have changed elsewhere.`);
    setSaving(false);
  }

  return <section className={styles.card} aria-labelledby="profile-card-heading">
    <header><h1 id="profile-card-heading">Profile</h1><p>Manage your personal and contact details.</p></header>
    {loading ? <p role="status">Loading your profile details…</p> : !billing ? <div role="alert"><p>{error}</p><button className={buttonClassName({ variant: "secondary" })} type="button" onClick={() => { setLoading(true); setReload(value => value + 1); }}><RefreshCw aria-hidden="true" size={16} />Try again</button></div> :
      <form onSubmit={event => void save(event)} aria-busy={saving}>
        <div className={styles.photoRow}>
          <span className={styles.avatar}><UserAvatar rounded appearance={{ elements: { avatarBox: styles.avatarBox, avatarImage: styles.avatarImage } }} /></span>
          <div><label className={styles.upload} htmlFor="profile-photo">Choose photo</label><input id="profile-photo" className={styles.fileInput} type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} onChange={event => {
            const file = event.target.files?.[0] ?? null;
            if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) { setPhoto(null); setError("Choose a JPEG, PNG or WebP image up to 5 MB."); event.target.value = ""; return; }
            setPhoto(file); event.target.value = ""; setError(""); setMessage("");
          }} /><p>{photo ? photo.name : "JPEG, PNG or WebP, up to 5 MB."}</p></div>
        </div>
        <div className={styles.fields}>
          <label>First name<input autoComplete="given-name" maxLength={100} value={firstName} onChange={event => { setFirstName(event.target.value); clearFeedback(); }} disabled={saving} /></label>
          <label>Last name<input autoComplete="family-name" maxLength={100} value={lastName} onChange={event => { setLastName(event.target.value); clearFeedback(); }} disabled={saving} /></label>
          <label className={styles.full}>Billing email <span>(optional)</span><input type="email" autoComplete="email" maxLength={254} value={email} onChange={event => { setEmail(event.target.value); clearFeedback(); }} disabled={saving} /><small>For future billing use; this does not change your sign-in email.</small></label>
          <label className={styles.full}>Contact phone <span>(optional)</span><input type="tel" autoComplete="tel" maxLength={48} value={phone} onChange={event => { setPhone(event.target.value); clearFeedback(); }} disabled={saving} /><small>Unverified contact detail. Leave blank to clear it.</small></label>
        </div>
        {error && <div className={styles.error} role="alert"><p>{error}</p><button className={buttonClassName({ variant: "secondary" })} type="button" disabled={saving} onClick={() => { setLoading(true); setReload(value => value + 1); }}><RefreshCw aria-hidden="true" size={16} />Reload saved contact and billing details</button></div>}
        {message && <p role="status">{message}</p>}
        <div className={styles.actions}><button className={buttonClassName()} type="submit" disabled={saving || !dirty}><Save aria-hidden="true" size={16} />{saving ? "Saving…" : "Save changes"}</button></div>
      </form>}
  </section>;
}
