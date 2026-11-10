import type { Selection } from '../retrieval/contracts.ts';
export type PlaygroundEvaluator = (question: string, passages: Array<{ rank: number; text: string }>, signal?: AbortSignal, intent?: { requestId: string }) => Promise<unknown>;
type Evidence = { rank: number; quote: string; reason: string };
export type PlaygroundEvaluationRejection = 'exact-keys' | 'answer-bounds' | 'evidence-bounds' | 'evidence-entry'
    | 'rank-bounds' | 'rank-duplicate' | 'quote-bounds' | 'reason-bounds' | 'quote-whitespace-mismatch' | 'quote-not-literal';
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/(?:s3:\/\/|file:\/\/|\\\\|["']?(?:private[_ -]?(?:bucket|key)|bucket|object[_ -]?key|storage[_ -]?(?:path|key))["']?\s*[:=])/i.test(v);
export function validatePlaygroundEvaluation(value: unknown, fragments: Array<{ handle: string; text: string }>, onRejected?: (reason: PlaygroundEvaluationRejection) => void): { answer: string; evidence: Evidence[]; selections: Selection[] } | null {
    const reject = (reason: PlaygroundEvaluationRejection): null => {
        try { onRejected?.(reason); } catch { /* Diagnostics cannot change validation. */ }
        return null;
    };
    if (!value || typeof value !== 'object' || Array.isArray(value)) return reject('exact-keys');
    const v = value as Record<string, unknown>;
    if (Object.keys(v).sort().join(',') !== 'answer,evidence') return reject('exact-keys');
    if (!Array.isArray(v.evidence) || v.evidence.length > 4) return reject('evidence-bounds');
    if (v.evidence.length === 0) return v.answer === '' ? { answer:'', evidence:[], selections:[] } : reject('answer-bounds');
    if (!text(v.answer, 2000)) return reject('answer-bounds');
    const seen = new Set<number>(), evidence: Evidence[] = [], selections: Selection[] = [];
    for (const entry of v.evidence) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).sort().join(',') !== 'quote,rank,reason') return reject('evidence-entry');
        const e = entry as Record<string, unknown>;
        if (!Number.isSafeInteger(e.rank) || (e.rank as number) < 1 || (e.rank as number) > fragments.length) return reject('rank-bounds');
        if (seen.has(e.rank as number)) return reject('rank-duplicate');
        if (!text(e.quote, 600)) return reject('quote-bounds');
        if (!text(e.reason, 500)) return reject('reason-bounds');
        const rank = e.rank as number, fragment = fragments[rank - 1];
        if (!fragment.text.includes(e.quote)) return reject(fragment.text.replace(/\s+/g, ' ').trim().includes(e.quote.replace(/\s+/g, ' ').trim())
            ? 'quote-whitespace-mismatch' : 'quote-not-literal');
        seen.add(rank); evidence.push({ rank, quote:e.quote, reason:e.reason }); selections.push({ handle:fragment.handle, quote:e.quote });
    }
    return { answer:v.answer, evidence, selections };
}
export function lexicalOverlap(question: string, passage: string): { matched: number; total: number } {
    const terms = new Set((question.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(x => x.length > 2));
    const words = new Set(passage.toLowerCase().match(/[a-z0-9]+/g) ?? []);
    return { matched:[...terms].filter(x => words.has(x)).length, total:terms.size };
}
