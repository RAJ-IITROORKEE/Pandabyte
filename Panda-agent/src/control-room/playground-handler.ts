import { answerQuestion, parseQuestion } from '../retrieval/answers.ts';
import type { Actor, Adapters, CanonicalChunk } from '../retrieval/contracts.ts';
import { lexicalOverlap, validatePlaygroundEvaluation, type PlaygroundEvaluator } from './playground-evaluation.ts';
import { uuid } from '../server/chat-contracts.ts';

export type Admission = { kind: 'admin'; actor: Exclude<Actor, null>; adapters: Adapters } | { kind: 'unauthorized' | 'forbidden' | 'unavailable' };
const response = (status: number, value: unknown) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
const error = (status: number, code: string) => response(status, { error: { code } });

async function readJson(request: Request): Promise<{ value: unknown } | { status: number }> {
    if (!/^application\/json(?:\s*;\s*[^;]+)*\s*$/i.test(request.headers.get('content-type') ?? '')) return { status: 415 };
    if (!request.body) return { status: 400 };
    const reader = request.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > 8192) { void reader.cancel().catch(() => {}); return { status: 413 }; }
            parts.push(part.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const part of parts) { bytes.set(part, offset); offset += part.length; }
        return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) };
    } catch { return { status: 400 }; } finally { reader.releaseLock(); }
}

// Reuse the answer pipeline's canonical scope validation, ranking and revalidation. The
// selector captures only vetted fragments; an evaluator requires a trusted injected guard.
export function createPlaygroundHandler(authenticate: () => Promise<Admission>, evaluator?: PlaygroundEvaluator) {
    return async (request: Request): Promise<Response> => {
        const startedAt = performance.now();
        if (request.method !== 'POST') return error(405, 'method_not_allowed');
        let admission: Admission;
        try { admission = await authenticate(); } catch { return error(503, 'unavailable'); }
        if (admission.kind !== 'admin') return error(admission.kind === 'unauthorized' ? 401 : admission.kind === 'forbidden' ? 403 : 503, admission.kind);
        try { if (request.headers.get('origin') !== new URL(request.url).origin) return error(403, 'forbidden'); } catch { return error(403, 'forbidden'); }
        const body = await readJson(request);
        if ('status' in body) return error(body.status, body.status === 413 ? 'too_large' : body.status === 415 ? 'unsupported_media_type' : 'invalid_request');
        if (!body.value || typeof body.value !== 'object' || Array.isArray(body.value)) return error(400, 'invalid_request');
        const { evaluate, requestId, ...questionInput } = body.value as Record<string, unknown>;
        if ((evaluate !== undefined && typeof evaluate !== 'boolean') || !parseQuestion(questionInput)) return error(400, 'invalid_request');
        const runModel = evaluate === true;
        if (runModel ? !uuid(requestId) : requestId !== undefined) return error(400, 'invalid_request');
        if (request.signal.aborted) return error(503, 'unavailable');
        let scopeChunks: CanonicalChunk[] = [];
        let fragments: Array<{ handle: string; text: string }> = [];
        let evaluation: ReturnType<typeof validatePlaygroundEvaluation> = null;
        let modelError: 'quota' | 'not_admitted' | 'outcome_unknown' | null = null;
        const base = admission.adapters;
        const adapters: Adapters = {
            ...base,
            ranking: { mode: 'lexical' },
            currentScope: async (...args) => {
                const scope = await base.currentScope(...args);
                if (scope) scopeChunks = scope.chunks;
                return scope;
            },
            select: async (question, selected, context) => {
                fragments = selected;
                if (!runModel || !evaluator) return { selections: [] };
                if (!context || !await context.revalidate()) throw Error('Scope changed');
                const current = await authenticate();
                if (current.kind !== 'admin' || current.actor.subject !== admission.actor.subject) throw Error('Access changed');
                try {
                    evaluation = validatePlaygroundEvaluation(await evaluator(question, selected.map((f, i) => ({ rank:i + 1, text:f.text })), request.signal, { requestId: requestId as string }), selected);
                } catch (failure) {
                    const code = (failure as { code?: unknown })?.code;
                    if (code === 'quota' || code === 'not_admitted' || code === 'outcome_unknown') modelError = code;
                    throw Error('Evaluation unavailable');
                }
                if (!evaluation) throw Error('Invalid evaluation');
                return { selections: evaluation.selections };
            },
        };
        const outcome = await answerQuestion(admission.actor, questionInput, adapters);
        if (modelError) return error(503, modelError);
        if (request.signal.aborted || outcome.kind === 'unavailable' || outcome.kind === 'unauthorized' || outcome.kind === 'invalid') return error(503, 'unavailable');
        const byHandle = new Map(scopeChunks.map(chunk => [chunk.handle, chunk]));
        if (fragments.some(fragment => !byHandle.has(fragment.handle))) return error(503, 'unavailable');
        const passages = fragments.map((fragment, i) => {
            const c = byHandle.get(fragment.handle)!;
            return { rank: i + 1, title: c.title, sourceUrl: c.sourceUrl, capturedAt: c.capturedAt, sectionPath: c.sectionPath, text: fragment.text, lexicalOverlap: lexicalOverlap(parseQuestion(questionInput)!.question, fragment.text) };
        });
        const checked = evaluation as ReturnType<typeof validatePlaygroundEvaluation>;
        if (runModel && evaluator && fragments.length && (!checked || (checked.evidence.length > 0) !== (outcome.kind === 'evidence') || (outcome.kind === 'evidence' && checked.evidence.length !== outcome.citations.length))) return error(503, 'unavailable');
        let finalAdmission: Admission;
        try { finalAdmission = await authenticate(); } catch { return error(503, 'unavailable'); }
        if (request.signal.aborted || finalAdmission.kind !== 'admin' || finalAdmission.actor.subject !== admission.actor.subject) return error(503, 'unavailable');
        const model = checked ? { status: 'evaluated', answer: checked.answer, evidence: checked.evidence } : { status: !runModel ? 'not_requested' : !fragments.length ? 'not_run' : 'guard_unavailable' };
        const metrics = { elapsedMs: Math.round(performance.now() - startedAt), contextPassages: passages.length, contextCharacters: passages.reduce((total, passage) => total + [...passage.text].length, 0), inputTokens: null, outputTokens: null, costUsd: null };
        return response(200, { outcome: checked && !checked.evidence.length ? 'insufficient' : passages.length ? 'retrieved' : outcome.kind, passages, retrieval: 'lexical', relevance: 'unverified', model, metrics });
    };
}
