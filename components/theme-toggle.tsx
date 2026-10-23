"use client";

import { Moon, Sun } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

type Theme = "light" | "dark";

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

    systemPreference.addEventListener("change", handleSystemChange);
    window.addEventListener("storage", handleStorage);
    return () => {
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
