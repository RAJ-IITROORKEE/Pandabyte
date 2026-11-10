type Passage = { rank: number; text: string };
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function collapsedSource(source: string) {
  let text = '';
  const starts: number[] = [], ends: number[] = [];
  for (const match of source.matchAll(/\s+|\S/g)) {
    const start = match.index, end = start + match[0].length;
    const whitespace = /\s/.test(match[0]);
    if (whitespace && (!text.length || end === source.length)) continue;
    text += whitespace ? ' ' : match[0];
    starts.push(start); ends.push(end);
  }
  return { text, starts, ends };
}

/** Recover only a unique whitespace-equivalent literal; strict validation still owns acceptance. */
export function reconcileLiteralEvidence(evaluation: unknown, passages: Passage[]): unknown {
  if (!record(evaluation) || !Array.isArray(evaluation.evidence) || evaluation.evidence.length > 4) return evaluation;
  let changed = false;
  const evidence = evaluation.evidence.map(entry => {
    if (!record(entry) || !Number.isSafeInteger(entry.rank) || (entry.rank as number) < 1 || typeof entry.quote !== 'string' || entry.quote.length > 600) return entry;
    const passage = passages[(entry.rank as number) - 1];
    if (!passage || passage.rank !== entry.rank || typeof passage.text !== 'string' || passage.text.length > 12000 || passage.text.includes(entry.quote)) return entry;
    const quote = entry.quote.replace(/\s+/g, ' ').trim();
    if (!quote) return entry;
    const source = collapsedSource(passage.text);
    const start = source.text.indexOf(quote);
    if (start < 0 || source.text.indexOf(quote, start + 1) >= 0) return entry;
    const literal = passage.text.slice(source.starts[start], source.ends[start + quote.length - 1]);
    if (!literal || literal.length > 600) return entry;
    changed = true;
    return { ...entry, quote: literal };
  });
  return changed ? { ...evaluation, evidence } : evaluation;
}
