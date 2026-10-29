"use client";

import { Moon, Sun } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

type Theme = "light" | "dark";
export type ThemePreferenceValue = Theme | "system";
export const THEME_CHANGE_EVENT = "pandabyte-theme-change";

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

function readStoredTheme(): Theme | null {
  try {
    const theme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(theme) ? theme : null;
  } catch {
    return null;
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const hasExplicitChoice = useRef(false);

  useLayoutEffect(() => {
    const systemPreference = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = (selected: Theme) => {
      applyTheme(selected);
      setTheme(selected);
    };
    const stored = readStoredTheme();
    hasExplicitChoice.current = stored !== null;
    sync(stored ?? (systemPreference.matches ? "dark" : "light"));

    const handleSystemChange = () => {
      if (!hasExplicitChoice.current) sync(systemPreference.matches ? "dark" : "light");
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      const selected = event.key === THEME_STORAGE_KEY && isTheme(event.newValue)
        ? event.newValue
        : readStoredTheme();
      hasExplicitChoice.current = selected !== null;
      sync(selected ?? (systemPreference.matches ? "dark" : "light"));
    };

    const handleLocalChange = (event: Event) => {
      const value = (event as CustomEvent<{ preference: ThemePreferenceValue }>).detail?.preference;
      if (value !== "system" && !isTheme(value ?? null)) return;
      hasExplicitChoice.current = value !== "system";
      sync(value === "system" ? (systemPreference.matches ? "dark" : "light") : value);
    };
    window.addEventListener(THEME_CHANGE_EVENT, handleLocalChange);
    systemPreference.addEventListener("change", handleSystemChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleLocalChange);
      systemPreference.removeEventListener("change", handleSystemChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    hasExplicitChoice.current = true;
    applyTheme(next);
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Keep the in-memory choice when browser storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { preference: next } }));
  }

  return (
    <button
      type="button"
      className="pb-theme-toggle"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      onClick={toggleTheme}
    >
      {theme === "dark"
        ? <Sun aria-hidden="true" focusable="false" />
        : <Moon aria-hidden="true" focusable="false" />}
    </button>
  );
}
