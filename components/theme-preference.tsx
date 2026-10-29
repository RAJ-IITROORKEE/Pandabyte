"use client";

import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { THEME_CHANGE_EVENT, type ThemePreferenceValue } from "@/components/theme-toggle";
import styles from "@/components/account.module.css";

function preference(value: string | null): ThemePreferenceValue {
  return value === "light" || value === "dark" ? value : "system";
}

export function ThemePreference() {
  const [value, setValue] = useState<ThemePreferenceValue>("system");
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try { setValue(preference(window.localStorage.getItem(THEME_STORAGE_KEY))); } catch { /* System remains the fallback. */ }
      setReady(true);
    });
    const local = (event: Event) => {
      const next = (event as CustomEvent<{ preference: ThemePreferenceValue }>).detail?.preference;
      if (next === "system" || next === "light" || next === "dark") { window.cancelAnimationFrame(frame); setReady(true); setValue(next); }
    };
    const storage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) { window.cancelAnimationFrame(frame); setReady(true); setValue(preference(event.key === null ? null : event.newValue)); }
    };
    window.addEventListener(THEME_CHANGE_EVENT, local);
    window.addEventListener("storage", storage);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener(THEME_CHANGE_EVENT, local); window.removeEventListener("storage", storage); };
  }, []);

  function change(next: ThemePreferenceValue) {
    setValue(next);
    try {
      if (next === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
      setStorageError(false);
    } catch { setStorageError(true); }
    const resolved = next === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : next;
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.style.colorScheme = resolved;
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { preference: next } }));
  }

  return <section className={styles.section} aria-labelledby="appearance-heading">
    <div className={styles.sectionHeading}><div className={styles.sectionTitle}><div><h2 id="appearance-heading">Appearance</h2><p>Choose a theme for the storefront.</p></div></div></div>
    <div className={styles.field}><label htmlFor="theme-preference">Theme</label><select id="theme-preference" style={{ padding: "10px 12px", minHeight: 44, color: "var(--foreground)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }} value={value} disabled={!ready} onChange={event => change(event.target.value as ThemePreferenceValue)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div>
    {storageError && <p role="status">Your choice applies now but could not be saved in this browser.</p>}
  </section>;
}
