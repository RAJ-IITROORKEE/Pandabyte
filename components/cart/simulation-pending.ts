import { parseSimulationRequest } from "../../lib/checkout/validation.ts";

const key = (userId: string) => `pandabyte:simulation-pending:${userId}`;
const memory = new Map<string, string>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function readPending(storage: Storage, userId: string): { pending: boolean; raw: string | null; marker: string | null } {
  const marker = storage.getItem(key(userId));
  if (marker === null) return { pending: false, raw: null, marker: null };
  if (!uuid.test(marker)) throw new Error("Invalid simulation marker");
  const raw = memory.get(userId) ?? null;
  if (!raw) return { pending: true, raw: null, marker };
  const request = parseSimulationRequest(JSON.parse(raw));
  if (!request || request.idempotencyKey !== marker) throw new Error("Invalid simulation request");
  return { pending: true, raw, marker };
}
export function savePending(storage: Storage, userId: string, raw: string) {
  if (raw.length > 32768) throw new Error("Invalid simulation request");
  const request = parseSimulationRequest(JSON.parse(raw));
  if (!request) throw new Error("Invalid simulation request");
  const existing = storage.getItem(key(userId));
  if (existing !== null && existing !== request.idempotencyKey) throw new Error("Simulation already pending");
  storage.setItem(key(userId), request.idempotencyKey);
  memory.set(userId, raw);
}
export function clearPending(storage: Storage, userId: string, expectedKey: string) {
  if (storage.getItem(key(userId)) !== expectedKey) return false;
  storage.removeItem(key(userId));
  memory.delete(userId);
  return true;
}

export function forgetPending() { memory.clear(); }
