// Pure helper for the chat details panel: unique sources across a chat's answers, most used first; `web` marks pages from web search.
export type SessionSource = { key: string; title: string; domain: string; href?: string; web: boolean; uses: number };

export function sessionSources(citations: readonly { title: string; domain: string; href?: string; web: boolean }[]): SessionSource[] {
  const map = new Map<string, SessionSource>();
  for (const c of citations) {
    const key = c.href ?? `${c.domain}|${c.title}`;
    const found = map.get(key);
    if (found) found.uses++; else map.set(key, { key, title: c.title, domain: c.domain, href: c.href, web: c.web, uses: 1 });
  }
  return [...map.values()].sort((a, b) => b.uses - a.uses);
}
