"use client";

import { FormEvent, useEffect, useState } from "react";

type ProfileResponse = {
  profile: { display_name: string; created_at: string } | null;
};

export function AccountProfile() {
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Loading your profile.");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    fetch("/api/account/profile", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Your profile could not be loaded.");
        return (await response.json()) as ProfileResponse;
      })
      .then(({ profile }) => {
        if (!mounted) return;
        setDisplayName(profile?.display_name ?? "");
        setStatus(profile ? "Profile loaded." : "No profile details saved yet.");
      })
      .catch(() => {
        if (mounted) setError("Your profile could not be loaded. Please try again later.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const result = (await response.json()) as ProfileResponse | { error?: string };

      if (!response.ok || !("profile" in result) || !result.profile) {
        throw new Error("Your profile could not be saved.");
      }

      setDisplayName(result.profile.display_name);
      setStatus("Profile saved.");
    } catch {
      setError("Your profile could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="status-panel" aria-labelledby="account-profile-heading">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Profile</p>
          <h2 id="account-profile-heading">Your details</h2>
        </div>
      </div>
      <form onSubmit={saveProfile}>
        <p>
          <label htmlFor="display-name">Display name</label>
        </p>
        <p>
          <input
            id="display-name"
            name="displayName"
            type="text"
            autoComplete="name"
            maxLength={240}
            value={displayName}
            onChange={(event) => {
              setDisplayName(Array.from(event.target.value).slice(0, 120).join(""));
            }}
            aria-describedby="display-name-help"
            disabled={loading || saving}
          />
        </p>
        <p id="display-name-help" className="auth-description">
          Maximum 120 characters.
        </p>
        <button type="submit" disabled={loading || saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
        <p role="status" aria-live="polite">{status}</p>
        {error && <p role="alert">{error}</p>}
      </form>
    </section>
  );
}
