import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { THEME_STORAGE_KEY, themeInitScript } from "../lib/theme.ts";

function bootstrapTheme({ stored = null, systemDark = false, storageBlocked = false } = {}) {
  const attributes = {};
  const root = {
    style: {},
    setAttribute(name, value) {
      attributes[name] = value;
    },
  };
  let queriedKey;
  runInNewContext(themeInitScript, {
    document: { documentElement: root },
    localStorage: {
      getItem(key) {
        queriedKey = key;
        if (storageBlocked) throw new Error("storage blocked");
        return stored;
      },
    },
    window: {
      matchMedia(query) {
        assert.equal(query, "(prefers-color-scheme: dark)");
        return { matches: systemDark };
      },
    },
  });
  return { attributes, colorScheme: root.style.colorScheme, queriedKey };
}

test("the pre-paint script accepts only a stored light or dark theme", () => {
  assert.equal(THEME_STORAGE_KEY, "pandabyte-theme");
  for (const theme of ["light", "dark"]) {
    const result = bootstrapTheme({ stored: theme, systemDark: theme !== "dark" });
    assert.equal(result.attributes["data-theme"], theme);
    assert.equal(result.colorScheme, theme);
    assert.equal(result.queriedKey, THEME_STORAGE_KEY);
  }
});

test("the pre-paint script falls back to the system theme for missing, invalid, or blocked storage", () => {
  for (const options of [
    { stored: null, systemDark: true },
    { stored: "sepia", systemDark: false },
    { storageBlocked: true, systemDark: true },
  ]) {
    const result = bootstrapTheme(options);
    const expected = options.systemDark ? "dark" : "light";
    assert.equal(result.attributes["data-theme"], expected);
    assert.equal(result.colorScheme, expected);
  }
});
