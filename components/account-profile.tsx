"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import styles from "@/components/account.module.css";

type Profile = {
  display_name: string;
  phone: string;
  created_at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseProfile(value: unknown): Profile | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.display_name !== "string" ||
    typeof value.phone !== "string" ||
    typeof value.created_at !== "string"
  ) return null;

  return {
    display_name: value.display_name,
    phone: value.phone,
    created_at: value.created_at,
  };
}

function parseProfileResponse(value: unknown): Profile | null | undefined {
  if (!isRecord(value) || !("profile" in value)) return undefined;
  return value.profile === null ? null : parseProfile(value.profile) ?? undefined;
}

export function AccountProfile() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Loading your contact details.");
  const [error, setError] = useState("");

  const loadProfile = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/account/profile", { cache: "no-store", signal });
      if (!response.ok) throw new Error("Your contact details could not be loaded.");
      const body: unknown = await response.json();
      const profile = parseProfileResponse(body);
      if (profile === undefined) throw new Error("Your contact details could not be loaded.");

      setPhone(profile?.phone ?? "");
      setLoaded(true);
      setError("");
      setStatus(profile ? "Contact details loaded." : "No contact details saved yet.");
    } catch {
      if (!signal?.aborted) {
        setError("Your contact details could not be loaded. Please try again.");
        setStatus("");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadProfile(controller.signal);
    });
    return () => controller.abort();
  }, [loadProfile]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      if (!response.ok) {
        if (response.status === 401) throw new Error("Your session expired. Sign in again and retry.");
        if (response.status === 400) throw new Error("Please check the contact details and try again.");
        throw new Error("Your contact details could not be saved. Please try again.");
      }

      const body: unknown = await response.json();
      const profile = parseProfileResponse(body);
      if (!profile) throw new Error("Your saved contact details could not be confirmed. Reload and try again.");

      setPhone(profile.phone);
      setStatus("Contact details saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your contact details could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="account-profile-heading">
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="account-profile-heading">Contact details</h2>
          <p>These details are saved to your PandaByte account profile.</p>
        </div>
      </div>

      <form className={styles.contactForm} onSubmit={saveProfile}>
        {loading ? (
          <p className={styles.loadingState} role="status">Loading your contact details…</p>
        ) : !loaded ? (
          <div className={styles.contactActions}>
            <div className={styles.errorState} role="alert">
              <p>{error || "Your contact details could not be loaded. Please try again."}</p>
              <button
                className={styles.secondaryAction}
                type="button"
                onClick={() => {
                  setLoading(true);
                  setError("");
                  setStatus("");
                  void loadProfile();
                }}
              >
                Try again
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.contactFields}>
            <div className={styles.field}>
              <label htmlFor="account-contact-phone">Contact phone</label>
              <input
                id="account-contact-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                maxLength={48}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                aria-describedby="account-contact-phone-help"
                disabled={saving}
              />
              <small id="account-contact-phone-help">Optional contact detail, not verified here. Leave blank and save to clear it.</small>
            </div>
          </div>
        )}

        {!loading && loaded && (
          <div className={styles.contactActions}>
            {error && (
              <div className={styles.errorState} role="alert">
                <p>{error}</p>
              </div>
            )}
            <div className={styles.formActions}>
              <button className={styles.primaryAction} type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save contact details"}
              </button>
            </div>
          </div>
        )}
        {!loading && loaded && !error && status && <p className={styles.liveStatus} role="status" aria-live="polite">{status}</p>}
      </form>
    </section>
  );
}
