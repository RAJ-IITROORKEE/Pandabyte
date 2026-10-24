import type { CartInputLine } from "@/lib/cart/validation";

const MAX_LINES = 50;
const MAX_QUANTITY = 99;

export function sameCartItems(left: CartInputLine[], right: CartInputLine[]) {
  if (left.length !== right.length) return false;
  const rightById = new Map(right.map((item) => [item.variantId, item.quantity]));
  return left.every((item) => rightById.get(item.variantId) === item.quantity);
}

export function mergeGuestCart(serverItems: CartInputLine[], guestItems: CartInputLine[]): CartInputLine[] | null {
  const merged = serverItems.map((item) => ({ ...item }));
  const positions = new Map(merged.map((item, index) => [item.variantId, index]));

  for (const guestItem of guestItems) {
    const position = positions.get(guestItem.variantId);
    if (position !== undefined) {
      merged[position] = { ...merged[position], quantity: Math.max(merged[position].quantity, guestItem.quantity) };
      continue;
    }
    if (merged.length >= MAX_LINES) return null;
    positions.set(guestItem.variantId, merged.length);
    merged.push({ ...guestItem });
  }

  return merged;
}

export function addCartItem(items: CartInputLine[], variantId: string): CartInputLine[] | null {
  const current = items.find((item) => item.variantId === variantId);
  if (current) {
    if (current.quantity >= MAX_QUANTITY) return null;
    return items.map((item) => item.variantId === variantId ? { ...item, quantity: item.quantity + 1 } : item);
  }
  if (items.length >= MAX_LINES) return null;
  return [...items, { variantId, quantity: 1 }];
}

export function setCartItemQuantity(items: CartInputLine[], variantId: string, quantity: number): CartInputLine[] | null {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY || !items.some((item) => item.variantId === variantId)) return null;
  return items.map((item) => item.variantId === variantId ? { ...item, quantity } : item);
}

export function removeCartItem(items: CartInputLine[], variantId: string): CartInputLine[] {
  return items.filter((item) => item.variantId !== variantId);
}
