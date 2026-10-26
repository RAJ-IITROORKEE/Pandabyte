export const SIDEBAR_STORAGE_KEY = "pandabyte-admin-layout-v1";
export const SIDEBAR_DEFAULT_WIDTH = 256;
export const SIDEBAR_MIN_WIDTH = 224;
export const SIDEBAR_MAX_WIDTH = 360;
export const SIDEBAR_GROUPS = ["Workspace", "Products & catalog", "Operations", "Site content", "Assets", "Access control"] as const;

export function clampSidebarWidth(width: unknown): number {
  return typeof width === "number" && Number.isFinite(width)
    ? Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)))
    : SIDEBAR_DEFAULT_WIDTH;
}

export function readSidebarLayout(raw: string | null) {
  const fallback = { version: 1, width: SIDEBAR_DEFAULT_WIDTH, collapsed: false, closedGroups: [] as string[] };
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || value.version !== 1) return fallback;
    return {
      version: 1,
      width: clampSidebarWidth(value.width),
      collapsed: value.collapsed === true,
      closedGroups: SIDEBAR_GROUPS.filter((group) => Array.isArray(value.closedGroups) && value.closedGroups.includes(group)) as string[],
    };
  } catch {
    return fallback;
  }
}

export function sidebarMode(viewport: number, collapsed: boolean) {
  return viewport < 768 ? "drawer" : viewport < 1024 || collapsed ? "rail" : "expanded";
}
