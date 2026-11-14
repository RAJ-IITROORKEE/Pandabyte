// Free models that just hit a rate limit sit out for a while, so each turn starts with a model that can answer.
// shortcut: per server instance (Vercel reuses instances, each learns on its own); move to a shared table if limits are still hit often.
type Cool = { until: number; strikes: number };
const cooling = new Map<string, Cool>();
const MINUTE = 60000, MAX_MS = 60 * MINUTE;

/** A 429: 1 minute out, doubling on each repeat (2, 4 ... 60 minutes) until the model answers again. */
export function noteLimited(id: string, now = Date.now()) {
  const strikes = (cooling.get(id)?.strikes ?? 0) + 1;
  cooling.set(id, { strikes, until: now + Math.min(MAX_MS, MINUTE * 2 ** (strikes - 1)) });
}
export const noteAnswered = (id: string) => { cooling.delete(id); };

/** Ready models first in pool order, then cooling ones (soonest ready first), so a turn still runs when every model is cooling. */
export function readyFirst<T extends { id: string }>(entries: readonly T[], now = Date.now()): T[] {
  const until = (e: T) => { const c = cooling.get(e.id); return c && c.until > now ? c.until : 0; };
  return entries.map((e, i) => ({ e, i, u: until(e) })).sort((a, b) => Number(a.u > 0) - Number(b.u > 0) || a.u - b.u || a.i - b.i).map(x => x.e);
}
