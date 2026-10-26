"use client";

import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ADMIN_THEME_STORAGE_KEY, readAdminThemePreference, resolveAdminTheme, type AdminThemePreference } from "./admin-theme-preference";
import styles from "./admin-theme.module.css";
import { Toaster } from "sonner";

type AdminThemeValue = {
  preference: AdminThemePreference;
  resolvedTheme: "light" | "dark";
  setPreference: (preference: AdminThemePreference) => void;
  ready: boolean;
};

const AdminThemeContext = createContext<AdminThemeValue | null>(null);

export function AdminThemeProvider({ children, className, fontFamily }: {
  children: ReactNode;
  className?: string;
  fontFamily?: string;
}) {
  const [preference, setPreferenceState] = useState<AdminThemePreference>("system");
  const [systemDark, setSystemDark] = useState(false);
  const [ready, setReady] = useState(false);

  function setPreference(next: AdminThemePreference) {
    setPreferenceState(next);
    try { window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, next); } catch { /* Preferences are optional. */ }
  }

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const frame = window.requestAnimationFrame(() => {
      try { setPreferenceState(readAdminThemePreference(window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY))); } catch { /* Storage is optional. */ }
      setSystemDark(media.matches);
      setReady(true);
    });
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener("change", update);
    };
  }, []);

  const value = { preference, resolvedTheme: resolveAdminTheme(preference, systemDark), setPreference, ready };

  return (
    <AdminThemeContext.Provider value={value}>
      <div className={`${styles.scope} ${className ?? ""}`} data-admin-theme={preference}
        style={fontFamily ? { fontFamily } as CSSProperties : undefined}>
        {children}
        <Toaster theme={value.resolvedTheme} position="bottom-right" closeButton richColors={false}
          toastOptions={{ style: { fontFamily: "inherit", background: "var(--surface)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: "8px" } }} />
      </div>
    </AdminThemeContext.Provider>
  );
}

export function useAdminTheme() {
  const value = useContext(AdminThemeContext);
  if (!value) throw new Error("useAdminTheme must be used within AdminThemeProvider");
  return value;
}

export function AdminThemeSelect() {
  const { preference, setPreference, ready } = useAdminTheme();
  return (
    <label className={styles.themeControl}>
      <span>Mono</span>
      <select className={styles.themeSelect} aria-label="Admin theme" value={preference} disabled={!ready}
        onChange={(event) => setPreference(event.target.value as AdminThemePreference)}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
