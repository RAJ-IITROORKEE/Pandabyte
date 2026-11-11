export type CitationView = { id: string; n: number; title: string; domain: string; href?: string; date?: string; quote: string; kind?: string };

export function shortTitle(title: string, max = 48): string {
  const t = title.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export function excerpt(quote: string, max = 180): string {
  const q = quote.trim().replace(/\s+/g, " ");
  if (q.length <= max) return q;
  const cut = q.slice(0, Math.max(1, max - 1));
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).trimEnd().replace(/[,;:.\-–]+$/, "")}…`;
}

export function visibleCards<T>(items: T[], max = 3): { shown: T[]; more: number } {
  return { shown: items.slice(0, max), more: Math.max(0, items.length - max) };
}
