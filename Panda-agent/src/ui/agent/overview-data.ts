// Pure helpers for the home overview and session panel; inputs are the chat list and saved citations the page already has.
const DAY = 86_400_000;
const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** Chats per day by last activity for the last `weeks` weeks, oldest first, ending today; one entry per day. */
export function activityDays(updatedAt: readonly string[], now: number, weeks = 12): { day: number; count: number }[] {
  const today = dayStart(now), first = today - (weeks * 7 - 1) * DAY;
  const counts = new Map<number, number>();
  for (const value of updatedAt) {
    const t = Date.parse(value);
    if (!Number.isFinite(t)) continue;
    const d = dayStart(t);
    if (d >= first && d <= today) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const out: { day: number; count: number }[] = [];
  for (let d = first; d <= today; d = dayStart(d + DAY + 3_600_000)) out.push({ day: d, count: counts.get(d) ?? 0 });
  return out;
}

/** Chats active this calendar month and last month. */
export function monthCounts(updatedAt: readonly string[], now: number): { thisMonth: number; lastMonth: number } {
  const n = new Date(now), thisStart = new Date(n.getFullYear(), n.getMonth(), 1).getTime(), lastStart = new Date(n.getFullYear(), n.getMonth() - 1, 1).getTime();
  let thisMonth = 0, lastMonth = 0;
  for (const value of updatedAt) { const t = Date.parse(value); if (!Number.isFinite(t)) continue; if (t >= thisStart) thisMonth++; else if (t >= lastStart) lastMonth++; }
  return { thisMonth, lastMonth };
}

export function relativeTime(value: string, now: number): string {
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return '';
  const minutes = Math.floor((now - t) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Yesterday' : days < 7 ? `${days} days ago` : new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export type SessionSource = { key: string; title: string; domain: string; href?: string; web: boolean; uses: number };
/** Unique sources across a chat's answers, most used first; `web` marks pages from web search. */
export function sessionSources(citations: readonly { title: string; domain: string; href?: string; web: boolean }[]): SessionSource[] {
  const map = new Map<string, SessionSource>();
  for (const c of citations) {
    const key = c.href ?? `${c.domain}|${c.title}`;
    const found = map.get(key);
    if (found) found.uses++; else map.set(key, { key, title: c.title, domain: c.domain, href: c.href, web: c.web, uses: 1 });
  }
  return [...map.values()].sort((a, b) => b.uses - a.uses);
}
