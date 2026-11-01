export const AUTH_ATTEMPT_KEY = "pandabyte-auth-attempt";
export const AUTH_FLASH_KEY = "pandabyte-auth-flash";
export const AUTH_ATTEMPT_TTL_MS = 10 * 60 * 1000;

type StorageReader = Pick<Storage, "getItem" | "removeItem">;

function isRecent(createdAt: unknown, now: number): boolean {
  return typeof createdAt === "number" && Number.isSafeInteger(createdAt) &&
    createdAt <= now && now - createdAt <= AUTH_ATTEMPT_TTL_MS;
}

export function consumeAuthAttempt(storage: StorageReader, returnPath: string, now: number): boolean {
  const value = storage.getItem(AUTH_ATTEMPT_KEY);
  storage.removeItem(AUTH_ATTEMPT_KEY);
  if (!value) return false;
  try {
    const attempt: unknown = JSON.parse(value);
    if (!attempt || typeof attempt !== "object") return false;
    const entry = attempt as Record<string, unknown>;
    return entry.returnPath === returnPath && isRecent(entry.createdAt, now);
  } catch {
    return false;
  }
}

export function consumeAuthFlash(storage: StorageReader, sessionId: string, userId: string, now: number): boolean {
  const value = storage.getItem(AUTH_FLASH_KEY);
  storage.removeItem(AUTH_FLASH_KEY);
  if (!value) return false;
  try {
    const flash: unknown = JSON.parse(value);
    if (!flash || typeof flash !== "object") return false;
    const entry = flash as Record<string, unknown>;
    return entry.sessionId === sessionId && entry.userId === userId && isRecent(entry.createdAt, now);
  } catch {
    return false;
  }
}

export function authCompletionHref(returnPath: string): string {
  return `/auth/complete?return_to=${encodeURIComponent(returnPath)}`;
}
