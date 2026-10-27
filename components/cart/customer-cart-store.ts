import type { CustomerCart } from "@/lib/cart/validation";
import { loadCustomerCart } from "./cart-api.ts";

const empty = { userId: null as string | null, cart: null as CustomerCart | null, error: false };
let snapshot = empty;
let owner: string | null = null;
let pending: Promise<void> | null = null;
let generation = 0;
const listeners = new Set<() => void>();

export function subscribeCustomerCart(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function getCustomerCartSnapshot() { return snapshot; }
export function getCustomerCartServerSnapshot() { return empty; }
export function publishCustomerCart(userId: string, cart: CustomerCart) {
  if (owner !== userId) return;
  if (snapshot.cart && snapshot.cart.version > cart.version) return;
  snapshot = { userId, cart, error: false };
  listeners.forEach(listener => listener());
}
export function activateCustomerCart(userId: string) {
  if (owner !== userId) {
    generation++;
    owner = userId;
    snapshot = empty;
    pending = null;
  }
}
export function clearCustomerCart() {
  if (owner === null) return;
  generation++;
  owner = null;
  snapshot = empty;
  pending = null;
  listeners.forEach(listener => listener());
}
export function prepareCustomerCart(userId: string) {
  activateCustomerCart(userId);
  if (snapshot.cart || pending || snapshot.error) return;
  const requestedOwner = userId;
  const requestedGeneration = generation;
  const request = loadCustomerCart().then(cart => {
    if (generation === requestedGeneration) publishCustomerCart(requestedOwner, cart);
  }).catch(() => {
    if (generation === requestedGeneration && owner === requestedOwner && !snapshot.cart) {
      snapshot = { userId: requestedOwner, cart: null, error: true };
      listeners.forEach(listener => listener());
    }
  }).finally(() => { if (pending === request) pending = null; });
  pending = request;
}
