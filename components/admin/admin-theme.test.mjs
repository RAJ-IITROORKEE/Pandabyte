import assert from "node:assert/strict";
import test from "node:test";
import { readAdminThemePreference, resolveAdminTheme } from "./admin-theme-preference.ts";

test("admin theme preference defaults safely and resolves system mode", () => {
  for (const value of [null, "", "auto", "DARK"]) assert.equal(readAdminThemePreference(value), "system");
  assert.equal(readAdminThemePreference("light"), "light");
  assert.equal(readAdminThemePreference("dark"), "dark");
  assert.equal(resolveAdminTheme("system", true), "dark");
  assert.equal(resolveAdminTheme("system", false), "light");
  assert.equal(resolveAdminTheme("dark", false), "dark");
});
