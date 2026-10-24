import { parseCartItems, type CartInputLine } from "../../lib/cart/validation.ts";
import { sameCartItems } from "./cart-utils.ts";

const STORAGE_KEY = "pandabyte.guest-cart.v1";
const MAX_STORAGE_CHARS = 8192;

export type GuestCartSnapshot = {
  ready: boolean;
  items: CartInputLine[];
  storageWarning: boolean;
  invalidStoredCart: boolean;
  revision: number;
};

const EMPTY_SNAPSHOT: GuestCartSnapshot = {
  ready: false,
  items: [],
  storageWarning: false,
  invalidStoredCart: false,
  revision: 0,
};

let snapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();
let listeningToStorage = false;

type GuestCartContent = Omit<GuestCartSnapshot, "revision">;

function notify() {
  for (const listener of listeners) listener();
}

function setSnapshot(next: Omit<GuestCartSnapshot, "revision">) {
  snapshot = { ...next, revision: snapshot.revision + 1 };
  notify();
}

function parseStoredCart(stored: string | null): GuestCartContent {
  if (stored === null) return { ready: true, items: [], storageWarning: false, invalidStoredCart: false };
  if (stored.length > MAX_STORAGE_CHARS) return { ready: true, items: [], storageWarning: true, invalidStoredCart: true };
  try {
    const value: unknown = JSON.parse(stored);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ready: true, items: [], storageWarning: true, invalidStoredCart: true };
    }
    const envelope = value as Record<string, unknown>;
    const items = envelope.version === 1 && Object.keys(envelope).length === 2 && parseCartItems(envelope.items);
    if (!items) return { ready: true, items: [], storageWarning: true, invalidStoredCart: true };
    return { ready: true, items, storageWarning: false, invalidStoredCart: false };
  } catch {
    return { ready: true, items: [], storageWarning: true, invalidStoredCart: true };
  }
}

function readSnapshotFromStorage(): GuestCartContent {
  try {
    return parseStoredCart(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ready: true, items: [], storageWarning: true, invalidStoredCart: false };
  }
}

function refreshFromStorage() {
  if (typeof window === "undefined") return;
  setSnapshot(readSnapshotFromStorage());
}

function onStorage(event: StorageEvent) {
  // A failed write leaves a newer memory-only cart; external events must not erase it.
  if (snapshot.storageWarning && !snapshot.invalidStoredCart) return;
  if (event.key === STORAGE_KEY || event.key === null) refreshFromStorage();
}

export function subscribeGuestCart(listener: () => void) {
  const firstSubscriber = listeners.size === 0;
  listeners.add(listener);
  if (typeof window !== "undefined") {
    if (!snapshot.ready || (firstSubscriber && !(snapshot.storageWarning && !snapshot.invalidStoredCart))) refreshFromStorage();
    if (!listeningToStorage) {
      window.addEventListener("storage", onStorage);
      listeningToStorage = true;
    }
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined" && listeningToStorage) {
      window.removeEventListener("storage", onStorage);
      listeningToStorage = false;
    }
  };
}

export function getGuestCartSnapshot() {
  return snapshot;
}

export function getGuestCartServerSnapshot() {
  return EMPTY_SNAPSHOT;
}

type GuestCartCheck =
  | { ok: true }
  | { ok: false; reason: "changed" | "storage" | "invalid" };

function checkGuestCartCurrent(expectedItems: CartInputLine[], expectedRevision: number): GuestCartCheck {
  if (!snapshot.ready || snapshot.invalidStoredCart) return { ok: false, reason: "invalid" };
  if (snapshot.revision !== expectedRevision || !sameCartItems(snapshot.items, expectedItems)) {
    return { ok: false, reason: "changed" };
  }
  if (snapshot.storageWarning) return { ok: false, reason: "storage" };
  try {
    const stored = parseStoredCart(window.localStorage.getItem(STORAGE_KEY));
    if (stored.invalidStoredCart) {
      setSnapshot(stored);
      return { ok: false, reason: "invalid" };
    }
    if (!sameCartItems(stored.items, expectedItems)) {
      setSnapshot(stored);
      return { ok: false, reason: "changed" };
    }
  } catch {
    setSnapshot({ ...snapshot, storageWarning: true });
    return { ok: false, reason: "storage" };
  }
  return { ok: true };
}

export function saveGuestCart(
  itemsValue: unknown,
  expected?: { items: CartInputLine[]; revision: number },
): { persisted: boolean; invalid: boolean; reason?: "changed" | "storage" | "invalid" } {
  const items = parseCartItems(itemsValue);
  if (!items) return { persisted: false, invalid: true, reason: "invalid" };
  const expectedItems = expected?.items ?? snapshot.items;
  const expectedRevision = expected?.revision ?? snapshot.revision;
  const memoryWasCurrent = snapshot.ready && !snapshot.invalidStoredCart && snapshot.revision === expectedRevision && sameCartItems(snapshot.items, expectedItems);
  const check = checkGuestCartCurrent(expectedItems, expectedRevision);
  if (!check.ok) {
    if (check.reason === "storage" && memoryWasCurrent) {
      setSnapshot({ ready: true, items, storageWarning: true, invalidStoredCart: false });
      return { persisted: false, invalid: false };
    }
    return { persisted: false, invalid: check.reason === "invalid", reason: check.reason };
  }
  let persisted = true;
  // shortcut: compare-then-write cannot serialize simultaneous cross-tab writers; use Web Locks if strict guest-cart serialization is needed.
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, items }));
  } catch {
    persisted = false;
  }
  setSnapshot({ ready: true, items, storageWarning: !persisted, invalidStoredCart: false });
  return { persisted, invalid: false };
}

export function clearGuestCartAfterMerge(expectedItems: CartInputLine[], expectedRevision: number):
  | { ok: true }
  | { ok: false; reason: "changed" | "storage" | "invalid" } {
  const check = checkGuestCartCurrent(expectedItems, expectedRevision);
  if (!check.ok) return check;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    setSnapshot({ ...snapshot, storageWarning: true });
    return { ok: false, reason: "storage" };
  }
  setSnapshot({ ready: true, items: [], storageWarning: false, invalidStoredCart: false });
  return { ok: true };
}

export function discardUnreadableGuestCart(): boolean {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    setSnapshot({ ...snapshot, ready: true, storageWarning: true, invalidStoredCart: true });
    return false;
  }
  setSnapshot({ ready: true, items: [], storageWarning: false, invalidStoredCart: false });
  return true;
}
