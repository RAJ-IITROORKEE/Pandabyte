import 'server-only';
import { createHash } from 'node:crypto';
import { evaluationCaseSet, type EvaluationCase, type EvaluationPack } from './evaluation-cases.ts';
import { runRagWorkflow, type RagWorkflowDependencies } from './rag-workflow.ts';
import { uuid } from './validation.ts';

type Workflow = Awaited<ReturnType<typeof runRagWorkflow>>;
export type EvaluationMode = 'retrieval' | 'model';
export type EvaluationCaseResult = {
    caseIndex: number; caseId: string; caseQuestion: string; status: 'passed' | 'failed' | 'unavailable' | 'outcome_unknown';
    outcome: Workflow['outcome'] | null; modelStatus: Workflow['model']['status'] | null;
    retrievalMs: number | null; elapsedMs: number; providerRoundTripMs: number | null;
    inputTokens: number | null; outputTokens: number | null; costNanoUsd: number | null; manualReviewRequired: boolean;
    modelAnswer: string | null; modelEvidence: Array<{rank: number; quote: string; reason: string}>; reviewTruncated: boolean; failureReason: string | null;
};
type CaseInput = {
    runId: string; caseIndex: number; caseSetKey: string; corpusFingerprint: string; mode: EvaluationMode; signal: AbortSignal;
};

function modelRequestId(runId: string, index: number): string {
    const bytes = createHash('sha256').update(JSON.stringify([evaluationCaseSet.key, runId.toLowerCase(), index])).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 15) | 128;
    bytes[8] = (bytes[8] & 63) | 128;
    const h = bytes.toString('hex');
    return [h.slice(0,8), h.slice(8,12), h.slice(12,16), h.slice(16,20), h.slice(20)].join('-');
}

// Match exact contiguous words/numbers while tolerating spacing between numbers and units.
function containsValue(text: string, expected: string): boolean {
    const tokens = (s: string) => s.normalize('NFKC').toLowerCase().match(/\d+(?:\.\d+)?|[a-z]+/g) ?? [];
    const list = /\band\b/i.test(expected);
    const actual = tokens(list ? text.replace(/,\s*(?:and\b\s*)?/gi, ' and ') : text), wanted = tokens(expected);
    return wanted.length > 0 && actual.some((_, i) => wanted.every((token, j) => token === actual[i+j]));
}

function comparableValues(text: string) {
    const normalized = text.normalize('NFKC').toLowerCase();
    const units = [...normalized.matchAll(/\b(\d+(?:\.\d+)?)\s*-?\s*(mb|gb|kb|cm|mm|v|pins?|leds?)\b/g)]
        .map(([,number,unit]) => ({family:unit.replace(/s$/,''),value:number}));
    const models = [...normalized.matchAll(/\b([a-z]{2,})(\d{2,}[a-z0-9]*(?:-[a-z0-9]+)*)\b/g)]
        .map(([,prefix,model]) => ({family:prefix,value:model}));
    return [...units,...models];
}

function assertedValue(answer: string, expected: string, citations: string[]): boolean {
    const evidence = citations.join('\n');
    const bluetoothVersion = /\bBluetooth\s+(\d+(?:\.\d+)*)\b/i.exec(expected);
    if (bluetoothVersion) {
        // A quoted Bluetooth LE heading can qualify the listed version. Keep every version number exact.
        if (/\bBluetooth LE\b/i.test(evidence)) answer = answer.replace(/\bBluetooth LE(?=\s+\d)/gi, 'Bluetooth');
        for (const version of answer.matchAll(/\bBluetooth\s+(?:(mesh|LE)\s+)?(\d+(?:\.\d+)*)(?:\s+or\s+(\d+(?:\.\d+)*))?/gi)) {
            if (version[1] || version[2] !== bluetoothVersion[1] || (version[3] && version[3] !== bluetoothVersion[1])) return false;
        }
    }
    if (!containsValue(answer,expected)) return false;
    const items = expected.split(/\s+and\s+/i);
    const clauses = answer.split(/[;!?\n]|\.(?=\s|$)|\bbut\b/i);
    if (clauses.some(clause => items.some(item => containsValue(clause,item)) &&
        /\b(?:not(?! only\b)|never|neither|no|without|cannot|unsupported|lacks?|absent|disabled)\b|n['’]t\b/i.test(clause))) return false;
    const families = new Set(comparableValues(expected).map(entry=>entry.family));
    const supported = comparableValues([expected,...citations].join('\n'));
    return comparableValues(answer).every(entry=>!families.has(entry.family) ||
        supported.some(value=>value.family===entry.family && value.value===entry.value));
}

function reviewExcerpt(text: string, maxJsonBytes: number): string {
    let bytes = 2, excerpt = '';
    for (const char of text) {
        bytes += Buffer.byteLength(JSON.stringify(char)) - 2;
        if (bytes > maxJsonBytes) break;
        excerpt += char;
    }
    return excerpt;
}

/** Literal source and value checks only. Model claims and accepted conditional prose require human review. */
function grade(c: EvaluationCase, r: Workflow, mode: EvaluationMode): EvaluationCaseResult['status'] {
    if (mode === 'model' && (r.model.status === 'guard_unavailable' ||
        (r.model.status === 'not_run' && r.model.reason !== 'no_retrieved_context'))) return 'unavailable';
    if (c.kind === 'negative') {
        const allowed = r.outcome === c.expected || r.outcome === c.alternate;
        return allowed ? 'passed' : 'failed';
    }
    if (r.outcome !== 'retrieved') return 'failed';
    const supports = r.passages.map(p => {
        if (p.sourceUrl !== c.sourceUrl || p.productSku !== c.sku) return [];
        const digest = createHash('sha256').update(p.text).digest('hex');
        return c.support.filter(s => s.chunkHash === digest && p.text.includes(s.quote));
    });
    if (!supports.some(list => list.length)) return 'failed';
    if (mode === 'retrieval') return 'passed';
    if (r.model.status !== 'evaluated' || !assertedValue(r.model.answer, c.expected, r.model.evidence.map(e=>e.quote))) return 'failed';
    if (!r.model.evidence.length) return 'failed';
    return r.model.evidence.every(e => supports[e.rank-1]?.some(s =>
        e.quote.includes(s.quote) || (s.quote.includes(e.quote) && containsValue(e.quote, c.expected)))) ? 'passed' : 'failed';
}

/** Executes one durably claimed index. A subsequent HTTP request must never replay an uncertain dispatch. */
export async function runEvaluationCase(input: CaseInput, pack: EvaluationPack, deps: RagWorkflowDependencies & {
    readCorpusFingerprint(): Promise<string>;
}): Promise<EvaluationCaseResult> {
    if (input.caseSetKey !== evaluationCaseSet.key || pack.descriptor.hash !== evaluationCaseSet.hash ||
        pack.cases.length !== evaluationCaseSet.count || !uuid(input.runId) || !/^[a-f0-9]{64}$/.test(input.corpusFingerprint) ||
        !Number.isInteger(input.caseIndex) || input.caseIndex < 0 || input.caseIndex >= pack.cases.length ||
        !['retrieval','model'].includes(input.mode)) throw Error('Invalid evaluation request');
    const c = pack.cases[input.caseIndex];
    const signal = AbortSignal.any([input.signal, AbortSignal.timeout(90000)]);
    const started = performance.now();
    const currentCorpus = async () => !signal.aborted && await deps.readCorpusFingerprint() === input.corpusFingerprint && !signal.aborted;
    let enteredGeneration = false;
    const result: EvaluationCaseResult = {caseIndex: input.caseIndex, caseId: c.id, caseQuestion: c.question, status: 'unavailable', outcome: null, modelStatus: null,
        retrievalMs: null, elapsedMs: 0, providerRoundTripMs: null, inputTokens: null, outputTokens: null, costNanoUsd: null,
        manualReviewRequired: false, failureReason: null, modelAnswer: null, modelEvidence: [], reviewTruncated: false};
    try {
        if (!await currentCorpus()) throw Error();
        const generate = deps.generate;
        const workflowDeps = {...deps, generate: generate && (async (request, beforeSend, abort) => {
            enteredGeneration = true;
            return generate(request, async () => await currentCorpus() && await beforeSend(), abort);
        })} satisfies RagWorkflowDependencies;
        const r = await runRagWorkflow({question: c.question, evaluate: input.mode === 'model',
            requestId: modelRequestId(input.runId, input.caseIndex), signal}, workflowDeps);
        if (!await currentCorpus() || !await deps.authorize() || signal.aborted) throw Error();
        const cost = r.metrics.costUsd;
        if (r.model.status === 'evaluated' && cost === null) throw Object.assign(Error(), {code: 'outcome_unknown'});
        Object.assign(result, {status: grade(c,r,input.mode), outcome: r.outcome, modelStatus: r.model.status,
            // Includes final source release, excludes generation, response validation, corpus fingerprint I/O and HTTP/journaling.
            retrievalMs: r.workflow.reduce((ms, stage) => ms + (['authorize','retrieve','augment','release'].includes(stage.stage) ? stage.elapsedMs : 0), 0),
            providerRoundTripMs: r.metrics.providerRoundTripMs, inputTokens: r.metrics.inputTokens, outputTokens: r.metrics.outputTokens,
            costNanoUsd: cost === null ? null : Math.round(cost * 1e9), manualReviewRequired: input.mode === 'model'});
        if (r.model.status === 'evaluated') {
            result.modelAnswer = r.model.answer;
            result.modelEvidence = r.model.evidence;
            if (Buffer.byteLength(JSON.stringify(result)) > 15000) {
                result.reviewTruncated = true;
                result.modelAnswer = reviewExcerpt(r.model.answer, 4500);
                result.modelEvidence = r.model.evidence.map(e => ({rank: e.rank, quote: reviewExcerpt(e.quote, 1600), reason: reviewExcerpt(e.reason, 700)}));
            }
        }
    } catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
        const stage = error && typeof error === 'object' && 'failureStage' in error ? error.failureStage : 'workflow';
        const safeStage = ['authorize','retrieve','augment','generate','validate','release'].includes(String(stage)) ? String(stage) : 'workflow';
        const safeCode = ['not_admitted','quota','unavailable','outcome_unknown'].includes(String(code)) ? String(code) : 'unavailable';
        result.failureReason = safeStage + ':' + safeCode;
        if (code === 'outcome_unknown' || (enteredGeneration && code !== 'not_admitted' && code !== 'unavailable')) result.status = 'outcome_unknown';
    }
    result.elapsedMs = Math.round(performance.now() - started);
    return result;
}
