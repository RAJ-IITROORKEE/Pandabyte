import { parseCartItems, type CartInputLine } from "../../lib/cart/validation.ts";

const KEY = "pandabyte.buy-now.v1";
let snapshot: CartInputLine[] | null = null;
let ready = false;
const listeners = new Set<() => void>();
function notify() { listeners.forEach(listener => listener()); }
export function subscribeBuyNowSelection(listener: () => void) {
  listeners.add(listener);
  if (!ready && typeof window !== "undefined") {
    ready = true;
    try {
      const raw = window.sessionStorage.getItem(KEY);
      const items = raw && raw.length < 512 ? parseCartItems(JSON.parse(raw)) : null;
      snapshot = items?.length === 1 ? items : null;
    } catch { snapshot = null; }
    notify();
  }
  return () => { listeners.delete(listener); };
}
export function getBuyNowSelection() { return snapshot; }
export function getBuyNowServerSnapshot() { return null; }
export function setBuyNowSelection(items: CartInputLine[]): boolean {
  const parsed = parseCartItems(items);
  if (!parsed || parsed.length !== 1) return false;
  try { window.sessionStorage.setItem(KEY, JSON.stringify(parsed)); } catch { return false; }
  ready = true;
  snapshot = parsed;
  notify();
  return true;
}
export function clearBuyNowSelection() {
  try { window.sessionStorage.removeItem(KEY); } catch { /* The active selection still clears in this page session. */ }
  ready = true;
  snapshot = null;
  notify();
}
