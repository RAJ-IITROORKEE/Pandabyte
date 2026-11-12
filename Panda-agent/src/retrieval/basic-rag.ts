import { validatePlaygroundEvaluation } from '../control-room/playground-evaluation.ts';
import { cleanAnswer } from '../server/chat-store.ts';
import type { ChatAnswer } from '../server/chat-contracts.ts';
import type { ReadyProductContext } from './product-context-set.ts';

type Prepared = ReadyProductContext | { kind: 'clarification' | 'insufficient' | 'unavailable' };
type Usage = { inputTokens: number; outputTokens: number; costNanoUsd: number };
export type BasicRagUsagePolicy = 'zero_cost' | 'bounded_luna_test';
export type RagTiming = { admissionMs: number; providerRoundTripMs: number };
type Metrics = { retrievalMs: number | null; generationMs: number | null; totalMs: number; admissionMs: number | null; providerRoundTripMs: number | null; contextRevalidationMs: number | null; contextRevalidationCount: number };
type BasicRagResult =
  | { status: 'answered'; answer: ChatAnswer; usage: Usage; metrics: Metrics }
  | { status: 'clarification' | 'insufficient' | 'invalid' | 'unavailable' | 'outcome_unknown'; metrics: Metrics };
type Dependencies = {
  usagePolicy?: BasicRagUsagePolicy;
  authorize: () => Promise<boolean>;
  prepare: (question: string, signal: AbortSignal) => Promise<Prepared>;
  // A trusted transport must await beforeSend immediately before its only dispatch.
  complete: (input: { question: string; passages: Array<{ rank: number; text: string }> }, beforeSend: () => Promise<boolean>, signal: AbortSignal) => Promise<{ evaluation: unknown; usage?: unknown; timing?: unknown }>;
};

export function safeRagTiming(value: unknown): RagTiming | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const v = value as Record<string, unknown>;
    if (Object.keys(v).sort().join(',') !== 'admissionMs,providerRoundTripMs'
      || ![v.admissionMs, v.providerRoundTripMs].every(n => Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= 120000)) return null;
    return { admissionMs: v.admissionMs as number, providerRoundTripMs: v.providerRoundTripMs as number };
  } catch { return null; }
}

export function basicRagUsage(value: unknown, policy: BasicRagUsagePolicy = 'zero_cost'): Usage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'costNanoUsd,inputTokens,outputTokens'
    || (policy === 'zero_cost' ? v.costNanoUsd !== 0 : !Number.isSafeInteger(v.costNanoUsd) || (v.costNanoUsd as number) < 0 || (v.costNanoUsd as number) > 2697640)
    || !Number.isSafeInteger(v.inputTokens) || (v.inputTokens as number) < 0 || (v.inputTokens as number) > 128000
    || !Number.isSafeInteger(v.outputTokens) || (v.outputTokens as number) < 0 || (v.outputTokens as number) > 1600
    || (policy === 'bounded_luna_test' && ((v.inputTokens as number) > 21024 || (v.outputTokens as number) > 1600))) return null; // matches the hosted grounded output room; the cost ceiling is unchanged
  return { inputTokens: v.inputTokens as number, outputTokens: v.outputTokens as number, costNanoUsd: v.costNanoUsd as number };
}

export async function runBasicRag(input: { question: string; signal: AbortSignal }, deps: Dependencies): Promise<BasicRagResult> {
  const start = performance.now();
  let retrievalMs: number | null = null, generationMs: number | null = null, timing: RagTiming | null = null;
  let contextRevalidationCount = 0, contextRevalidationElapsed = 0;
  const metrics = (): Metrics => ({ retrievalMs, generationMs, totalMs: Math.round(performance.now() - start), admissionMs: timing?.admissionMs ?? null,
    providerRoundTripMs: timing?.providerRoundTripMs ?? null, contextRevalidationMs: Number.isFinite(contextRevalidationElapsed) && contextRevalidationElapsed >= 0 && contextRevalidationElapsed <= 120000 ? Math.round(contextRevalidationElapsed) : null, contextRevalidationCount });
  const fail = (status: Exclude<BasicRagResult['status'], 'answered'>): BasicRagResult => ({ status, metrics: metrics() });
  if (!input || typeof input.question !== 'string' || !input.question.isWellFormed() || !input.question.trim()
    || input.question.length > 2000 || Buffer.byteLength(input.question, 'utf8') > 8192) return fail('invalid');
  const question = input.question.trim(), signal = input.signal;
  let attempted = false, gateCalls = 0, gatePassed = false;
  try {
    if (!signal || signal.aborted || await deps.authorize() !== true || signal.aborted) return fail('unavailable');
    const retrievalStart = performance.now();
    const context = await deps.prepare(question, signal);
    retrievalMs = Math.round(performance.now() - retrievalStart);
    if (signal.aborted || await deps.authorize() !== true || signal.aborted) return fail('unavailable');
    if (context.kind !== 'ready') return fail(context.kind);
    if (context.products.length !== 1) return fail('clarification');
    const passages = context.passages.map(p => ({ ...p, sectionPath: [...p.sectionPath] }));
    if (!passages.length || passages.length > 24 || passages.some((p, i) => p.rank !== i + 1
      || p.productSku !== context.products[0].sku || typeof p.text !== 'string' || !p.text.isWellFormed()
      || !p.text.trim() || p.text.length > 12000) || passages.reduce((total, p) => total + p.text.length, 0) > 20000) return fail('unavailable');
    const revalidate = async () => {
      const started = performance.now(); contextRevalidationCount++;
      try { return await context.revalidate(); } finally { contextRevalidationElapsed += performance.now() - started; }
    };
    const current = async () => !signal.aborted && (context.authorizedBy === deps.authorize
      ? await revalidate() === true
      : await deps.authorize() === true && !signal.aborted && await revalidate() === true
        && !signal.aborted && await deps.authorize() === true) && !signal.aborted;
    // The post-prepare actor check precedes only synchronous validation here.
    // Other context factories still need their independent generation-entry proof.
    if (signal.aborted || (context.authorizedBy !== deps.authorize && !await current())) return fail('unavailable');
    const beforeSend = async () => {
      gateCalls++;
      if (gateCalls !== 1) return false;
      gatePassed = await current();
      return gatePassed;
    };
    const generationStart = performance.now();
    attempted = true;
    let raw: { evaluation: unknown; usage?: unknown; timing?: unknown };
    try {
      raw = await deps.complete({ question, passages: passages.map(({ rank, text }) => ({ rank, text })) }, beforeSend, signal);
    } finally { generationMs = Math.round(performance.now() - generationStart); }
    if (signal.aborted || (gateCalls > 0 && !gatePassed)) return fail('unavailable');
    if (gateCalls !== 1 || !raw || typeof raw !== 'object') return fail('outcome_unknown');
    try { timing = safeRagTiming(raw.timing); } catch { timing = null; }
    const checked = validatePlaygroundEvaluation(raw.evaluation, passages.map(p => ({ handle: String(p.rank), text: p.text })));
    if (!checked || !checked.answer.isWellFormed() || checked.evidence.some(e => !e.quote.isWellFormed() || !e.reason.isWellFormed())
      || checked.evidence.some(e => /^source\s*:\s*https?:\/\/\S+\s*$/i.test(e.quote))
      || /(?:\[S\d+\]|https?:\/\/|www\.)/i.test(checked.answer)) return fail('outcome_unknown');
    const verifiedUsage = basicRagUsage(raw.usage, deps.usagePolicy);
    if (!verifiedUsage) return fail('unavailable');
    if (!await current()) return fail('unavailable');
    if (!checked.evidence.length) return fail('insufficient');
    const citations = checked.evidence.map((e, i) => {
      const p = passages[e.rank - 1];
      return { id: `S${i + 1}`, title: p.title, sourceUrl: p.sourceUrl, capturedAt: p.capturedAt, quote: e.quote, sectionPath: p.sectionPath };
    });
    const answer = cleanAnswer({ outcome: 'evidence', text: `${checked.answer.trim()}\n\n${citations.map(c => `[${c.id}]`).join(' ')}`, citations });
    return { status: 'answered', answer, usage: verifiedUsage, metrics: metrics() };
  } catch (error) {
    if (signal?.aborted || (gateCalls > 0 && !gatePassed)) return fail('unavailable');
    const code = (error as { code?: unknown } | null)?.code;
    if (!attempted || code === 'quota' || code === 'rate_limited' || code === 'not_admitted' || code === 'response_rejected') return fail('unavailable');
    return fail('outcome_unknown');
  }
}
