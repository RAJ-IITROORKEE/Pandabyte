"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useSyncExternalStore } from "react";
import { parseFavorites as parseAccountFavorites } from "../../lib/favorites/validation.ts";
import { FAVORITES_KEY, getFavoritesServerSnapshot, getFavoritesSnapshot, parseFavorites, subscribeFavorites, toggleFavorite, mergeFavoriteIds, type Favorite } from "./favorites-store";

type AccountFavorites = NonNullable<ReturnType<typeof parseAccountFavorites>>;
type Item = AccountFavorites["items"][number];
type Snapshot = { owner: string | null; data: AccountFavorites | null; loading: boolean; error: string | null };
const empty: Snapshot = { owner: null, data: null, loading: true, error: null };
let snapshot = empty;
let generation = 0;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getSnapshot = () => snapshot;
const getServerSnapshot = () => empty;
function publish(next: Snapshot) { snapshot = next; listeners.forEach(listener => listener()); }

async function request(owner: string, method: "GET" | "PUT", body?: { expectedVersion: number; productIds: string[] }): Promise<AccountFavorites> {
  const response = await fetch("/api/account/favorites", { method, cache: "no-store", headers: { "x-account-owner": owner, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (response.status === 409) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error?.code === "conflict" ? "conflict" : "request_failed");
  }
  if (!response.ok) throw new Error("request_failed");
  const data = parseAccountFavorites(await response.json());
  if (!data) throw new Error("invalid_response");
  return data;
}
async function replaceWithRetry(owner: string, data: AccountFavorites, transform: (items: Item[]) => string[] | null, current: () => boolean): Promise<AccountFavorites> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!current()) throw new Error("changed_account");
    const productIds = transform(data.items);
    if (!productIds) throw new Error("limit");
    try { return await request(owner, "PUT", { expectedVersion: data.version, productIds }); }
    catch (error) {
      if (!(error instanceof Error) || error.message !== "conflict" || attempt === 1 || !current()) throw error;
      data = await request(owner, "GET");
    }
  }
  throw new Error("conflict");
}
function activate(owner: string) {
  if (snapshot.owner !== owner) { generation++; pending = null; publish({ owner, data: null, loading: true, error: null }); }
  if (pending || snapshot.data || snapshot.error) return;
  const started = generation;
  const current = () => generation === started && snapshot.owner === owner;
  const job = (async () => {
    try {
      let data = await request(owner, "GET");
      if (!current()) return;
      const raw = getFavoritesSnapshot();
      const guest = parseFavorites(raw);
      if (!guest) throw new Error("browser_data");
      if (guest.length) {
        data = await replaceWithRetry(owner, data, items => mergeFavoriteIds(items, guest), current);
        if (!current()) return;
        // Do not erase browser changes made while the request was in flight.
        if (getFavoritesSnapshot() === raw) localStorage.removeItem(FAVORITES_KEY);
      }
      if (current()) publish({ owner, data, loading: false, error: null });
    } catch {
      if (current()) publish({ owner, data: null, loading: false, error: "Favorites could not be synced. Your browser favorites were kept." });
    }
  })().finally(() => { if (pending === job) pending = null; });
  pending = job;
}
function deactivate() {
  if (snapshot.owner !== null) { generation++; pending = null; publish(empty); }
}
async function toggleAccount(owner: string, item: Favorite): Promise<boolean> {
  if (snapshot.owner !== owner || !snapshot.data || snapshot.loading || pending) return false;
  const started = generation;
  const current = () => generation === started && snapshot.owner === owner;
  const wasSaved = snapshot.data.items.some(entry => entry.productId === item.productId);
  const data = snapshot.data;
  publish({ ...snapshot, loading: true, error: null });
  let ok = false;
  const job = (async () => {
    try {
      const updated = await replaceWithRetry(owner, data, items => {
        const ids = items.map(entry => entry.productId).filter(id => id !== item.productId);
        if (!wasSaved) ids.push(item.productId);
        return ids.length <= 50 ? ids : null;
      }, current);
      if (current()) { publish({ owner, data: updated, loading: false, error: null }); ok = true; }
    } catch { if (current()) publish({ owner, data, loading: false, error: "Favorites could not be saved. Please try again." }); }
  })().finally(() => { if (pending === job) pending = null; });
  pending = job;
  await job;
  return ok;
}
export function useFavorites() {
  const { isLoaded, user } = useUser();
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const raw = useSyncExternalStore(subscribeFavorites, getFavoritesSnapshot, getFavoritesServerSnapshot);
  const owner = isLoaded ? user?.id ?? null : null;
  useEffect(() => { if (!isLoaded) return; if (owner) activate(owner); else deactivate(); }, [isLoaded, owner]);
  const account = Boolean(owner);
  const guest = parseFavorites(raw);
  const ready = isLoaded && (!account || state.owner === owner);
  const items = ready ? (account ? state.data?.items ?? null : guest) : null;
  return {
    items, account, loading: !ready || (account && state.loading),
    error: account ? (state.owner === owner ? state.error : null) : guest ? null : "Favorites could not be read from this browser.",
    toggle: async (item: Favorite) => account && owner ? toggleAccount(owner, item) : isLoaded && toggleFavorite(item),
  };
}
