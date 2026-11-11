export type CitationView = { id: string; n: number; title: string; domain: string; href?: string; date?: string; quote: string; kind?: string; section?: string };
export type SourceLabel = { primary: string; secondary?: string };

/** Turns a stored section heading into a readable label: "PRODUCT INFO" -> "Product info". */
export function sectionLabel(path: readonly string[], title: string): string | undefined {
  const last = path[path.length - 1]?.trim().replace(/\s+/g, " ");
  if (!last || last === title.trim()) return undefined;
  return last === last.toUpperCase() && /[A-Z]/.test(last) ? last.charAt(0) + last.slice(1).toLowerCase() : last;
}

/** The title every source shares, when there are at least two and all match; shown once above the cards. */
export function sharedTitle(views: readonly CitationView[]): string | undefined {
  return views.length > 1 && views.every(v => v.title === views[0].title) ? views[0].title : undefined;
}

/** Card and tab labels: sources whose title repeats are named by section (or "Excerpt n") with a quote preview, so they can be told apart. */
export function sourceLabels(views: readonly CitationView[]): Map<string, SourceLabel> {
  const counts = new Map<string, number>();
  for (const v of views) counts.set(v.title, (counts.get(v.title) ?? 0) + 1);
  return new Map(views.map(v => [v.id, (counts.get(v.title) ?? 0) > 1
    ? { primary: v.section ?? `Excerpt ${v.n}`, secondary: v.quote ? excerpt(v.quote, 70) : undefined }
    : { primary: v.title, secondary: v.section }]));
}

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
