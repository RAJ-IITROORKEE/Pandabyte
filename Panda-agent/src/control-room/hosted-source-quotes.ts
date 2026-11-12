import { randomUUID } from 'node:crypto';
import { validatePlaygroundEvaluation } from './playground-evaluation.ts';

export type HostedSourceQuote = { id: string; rank: number; text: string };
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string) => Object.keys(value).sort().join(',') === expected;

function excerptEnd(text: string, start: number) {
  const limit = Math.min(text.length, start + 450);
  if (limit === text.length) return limit;
  let paragraph = 0, line = 0, sentence = 0, space = 0, forward = 0, beforeRun = 0;
  for (const match of text.slice(start).matchAll(/\s+/g)) {
    const position = start + match.index, end = position + match[0].length;
    if (end > limit) {
      if (position < limit) { if (end <= start + 600) forward = end; if (position > start) beforeRun = position; }
      break;
    }
    space = end;
    if (/(?:\r?\n)[^\S\r\n]*(?:\r?\n)/.test(match[0])) paragraph = end;
    if (/[\r\n]/.test(match[0])) line = end;
    if (/[.!?]/.test(text[position - 1] ?? '')) sentence = end;
  }
  let end = paragraph || line || sentence || space || forward || beforeRun || limit;
  // JavaScript offsets count UTF-16 code units; keep an astral character together.
  if (/[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) end--;
  return end;
}

// Sources sent to the hosted model are capped in bytes. Whole passages are taken in rank (relevance) order and a passage that would
// overflow is skipped, so a table is never cut in half. 16 KB stays well inside the 11k-token RAG input limit.
const SOURCE_BYTES = 16000;
export function buildHostedSourceQuotes(passages: Array<{ rank: number; text: string }>, requestTag: string = randomUUID()): { quotes: HostedSourceQuote[] } {
  if (!Array.isArray(passages) || passages.length > 24 || typeof requestTag !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(requestTag)) throw new Error('Invalid hosted source context');
  const ranks = new Set<number>();
  for (const passage of passages) {
    if (!passage || !Number.isSafeInteger(passage.rank) || passage.rank < 1 || ranks.has(passage.rank) || typeof passage.text !== 'string' || passage.text.length > 12000 || !passage.text.isWellFormed()) throw new Error('Invalid hosted source passage');
    ranks.add(passage.rank);
  }
  const result: { quotes: HostedSourceQuote[] } = { quotes: [] };
  for (const passage of [...passages].sort((a, b) => a.rank - b.rank)) {
    const quotes: HostedSourceQuote[] = [];
    for (let start = 0; start < passage.text.length;) {
      const end = excerptEnd(passage.text, start);
      quotes.push({ id: `${requestTag}:q${result.quotes.length + quotes.length + 1}`, rank: passage.rank, text: passage.text.slice(start, end) });
      start = end;
    }
    const next = { quotes: [...result.quotes, ...quotes] };
    if (new TextEncoder().encode(JSON.stringify(next)).byteLength <= SOURCE_BYTES) result.quotes = next.quotes;
  }
  return result;
}

export function resolveHostedSourceEvaluation(raw: unknown, quotes: readonly HostedSourceQuote[]): { answer: string; evidence: Array<{ rank: number; quote: string; reason: string }> } | null {
  if (!record(raw) || !keys(raw, 'answer,evidence') || typeof raw.answer !== 'string' || raw.answer.length > 6000 || !raw.answer.isWellFormed() || !Array.isArray(raw.evidence) || raw.evidence.length > 4) return null;
  const allowed = new Map<string, HostedSourceQuote>();
  for (const quote of quotes) {
    if (!quote || typeof quote.id !== 'string' || allowed.has(quote.id) || !Number.isSafeInteger(quote.rank) || quote.rank < 1 || typeof quote.text !== 'string' || quote.text.length > 600) return null;
    allowed.set(quote.id, quote);
  }
  const used = new Set<string>(), evidence: Array<{ rank: number; quote: string; reason: string }> = [];
  for (const entry of raw.evidence) {
    if (!record(entry) || !keys(entry, 'id,reason') || typeof entry.id !== 'string' || typeof entry.reason !== 'string' || !entry.reason.isWellFormed()) return null;
    const quote = allowed.get(entry.id);
    if (!quote) return null;
    // Validate even redundant selections before keeping the first reason for each ID.
    if (!validatePlaygroundEvaluation({ answer: 'Source excerpt selected.', evidence: [{ rank: 1, quote: quote.text, reason: entry.reason }] }, [{ handle: 'selected', text: quote.text }])) return null;
    if (used.has(entry.id)) continue;
    used.add(entry.id);
    evidence.push({ rank: quote.rank, quote: quote.text, reason: entry.reason });
  }
  // Some models copy the supplied excerpt ids ("[<request>:q6]") into the answer despite the instruction; they are internal, so they are removed.
  const ids = new Set(quotes.map(q => q.id));
  const answer = raw.answer.replace(/ ?\[([^\[\]]{1,400}:q\d{1,3})\]/g, (all: string, list: string) => list.split(/\s*[,;]\s*|\s+/).every(id => ids.has(id)) ? '' : all);
  return { answer: evidence.length ? answer : '', evidence };
}
