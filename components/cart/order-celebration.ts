export const celebrationKey = (userId: string, reference: string) => `pandabyte:order-celebration:${userId}:${reference}`;

export function markCelebration(userId: string, reference: string) {
  try { sessionStorage.setItem(celebrationKey(userId, reference), "1"); } catch { /* The static success icon remains available. */ }
}

export function consumeCelebration(userId: string, reference: string) {
  try {
    const key = celebrationKey(userId, reference);
    const marked = sessionStorage.getItem(key) === "1";
    sessionStorage.removeItem(key);
    return marked;
  } catch { return false; }
}
