export type Favorite = { productId: string; slug: string; title: string };
export const FAVORITES_KEY = "pandabyte.favorites.v1";
const EMPTY = "[]";

export function parseFavorites(raw: string): Favorite[] | null {
  if (raw.length > 20000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 50) return null;
    const ids = new Set<string>();
    for (const item of value) {
      if (!item || typeof item !== "object" || !/^[0-9a-f-]{36}$/i.test(item.productId) ||
        typeof item.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) || item.slug.length > 200 ||
        typeof item.title !== "string" || !item.title.trim() || item.title.length > 200 || ids.has(item.productId)) return null;
      ids.add(item.productId);
    }
    return value.map(({ productId, slug, title }) => ({ productId, slug, title }));
  } catch { return null; }
}

export function getFavoritesSnapshot() {
  try { return localStorage.getItem(FAVORITES_KEY) ?? EMPTY; } catch { return "!unavailable"; }
}
export function getFavoritesServerSnapshot() { return EMPTY; }
export function subscribeFavorites(callback: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === FAVORITES_KEY || event.key === null) callback(); };
  window.addEventListener("storage", onStorage);
  window.addEventListener("pandabyte-favorites", callback);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("pandabyte-favorites", callback); };
}
export function toggleFavorite(item: Favorite): boolean {
  try {
    const current = parseFavorites(getFavoritesSnapshot());
    if (!current) return false;
    const next = current.some((entry) => entry.productId === item.productId)
      ? current.filter((entry) => entry.productId !== item.productId) : [...current, item];
    const raw = JSON.stringify(next);
    if (!parseFavorites(raw)) return false;
    localStorage.setItem(FAVORITES_KEY, raw);
    window.dispatchEvent(new Event("pandabyte-favorites"));
    return true;
  } catch { return false; }
}
