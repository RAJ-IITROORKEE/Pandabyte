export const ADMIN_THEME_STORAGE_KEY = "pandabyte-admin-theme";

export type AdminThemePreference = "light" | "dark" | "system";

export function readAdminThemePreference(raw: string | null): AdminThemePreference {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

export function resolveAdminTheme(preference: AdminThemePreference, systemDark: boolean): "light" | "dark" {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}
