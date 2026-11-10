import { uuid } from './validation.ts';
import { readWorkflowBody, type WorkflowAdmission } from './playground-workflow-handler.ts';
import { evaluationCaseSet, loadEvaluationCases } from './evaluation-cases.ts';
import { runEvaluationCase } from './evaluation-runner.ts';

type Rpc = (name: string, params: Record<string, unknown>) => Promise<unknown>;
type Admission = Extract<WorkflowAdmission, { kind: 'admin' }> & { rpc: Rpc };
type Authorize = () => Promise<Admission | Exclude<WorkflowAdmission, { kind: 'admin' }>>;
const json = (status: number, data: unknown) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
const fail = (status: number, code: string) => json(status, { error: { code } });

export function createEvaluationHandler(authorize: Authorize) {
 return async (request: Request): Promise<Response> => {
  if (!['GET', 'POST'].includes(request.method)) return fail(405, 'method_not_allowed');
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(120000)]);
  try {
   const admission = await authorize();
   if (admission.kind !== 'admin') return fail(admission.kind === 'unauthorized' ? 401 : admission.kind === 'forbidden' ? 403 : 503, admission.kind);
   const rpc = admission.rpc;
   const readCorpusFingerprint = async () => {
    const value = await rpc('panda_agent_evaluation_corpus', {});
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw Error('Corpus unavailable');
    return value;
   };
   if (request.method === 'GET') {
    const query = new URL(request.url).searchParams;
    const id = query.get('requestId');
    if ([...query.keys()].some(k => k !== 'requestId') || query.getAll('requestId').length > 1 || (id !== null && !uuid(id))) return fail(400, 'invalid_request');
    await loadEvaluationCases();
    if (!await admission.dependencies.authorize()) return fail(403, 'forbidden');
    const stored = await rpc('panda_agent_evaluation_run', { p_action: 'read', p_run: id });
    const corpusFingerprint = (stored as { corpusFingerprint: string }).corpusFingerprint;
    if (typeof corpusFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(corpusFingerprint)) throw Error('Invalid saved corpus');
    const saved = stored as { run: { corpusFingerprint: string; results: Record<string, unknown>[] } | null };
    const run = saved.run && saved.run.corpusFingerprint !== corpusFingerprint
     ? { ...saved.run, results: saved.run.results.map(result => ({ ...result, modelAnswer: null, modelEvidence: [], sourceChanged: true })) } : saved.run;
    return json(200, { caseSet: evaluationCaseSet, corpusFingerprint, run });
   }
   if (request.headers.get('origin') !== new URL(request.url).origin) return fail(403, 'forbidden');
   if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return fail(415, 'unsupported_media_type');
   let value: unknown;
   try { value = await readWorkflowBody(request, signal); } catch { return fail(400, 'invalid_request'); }
   if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(400, 'invalid_request');
   const v = value as Record<string, unknown>;
   if (Object.keys(v).sort().join(',') !== 'caseIndex,corpusFingerprint,mode,requestId' || typeof v.requestId !== 'string' || !uuid(v.requestId) || v.requestId !== v.requestId.toLowerCase()
    || !Number.isInteger(v.caseIndex) || (v.caseIndex as number) < 0 || (v.caseIndex as number) >= 20
    || !['retrieval', 'model'].includes(v.mode as string) || typeof v.corpusFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(v.corpusFingerprint)) return fail(400, 'invalid_request');
   const input = { runId: v.requestId, caseIndex: v.caseIndex as number, caseSetKey: evaluationCaseSet.key, corpusFingerprint: v.corpusFingerprint, mode: v.mode as 'retrieval' | 'model', signal };
   const pack = await loadEvaluationCases();
   const parameters = { p_run: input.runId, p_mode: input.mode, p_corpus: input.corpusFingerprint, p_index: input.caseIndex };
   const claim = await rpc('panda_agent_evaluation_run', { ...parameters, p_action: 'claim' }) as { claimed: boolean; run: unknown };
   // An existing claim may already have spent money. Read its saved state without redispatch.
   if (claim.claimed !== true) {
    if (!await admission.dependencies.authorize()) return fail(403, 'forbidden');
    return json(200, await rpc('panda_agent_evaluation_run', { p_action: 'read', p_run: input.runId }));
   }
   const result = await runEvaluationCase(input, pack, { ...admission.dependencies, readCorpusFingerprint });
   await rpc('panda_agent_evaluation_run', { ...parameters, p_action: 'finish', p_result: result });
   if (!await admission.dependencies.authorize()) return fail(403, 'forbidden');
   return json(200, await rpc('panda_agent_evaluation_run', { p_action: 'read', p_run: input.runId }));
  } catch (error) {
   if (error && typeof error === 'object' && 'code' in error && error.code === 'conflict') return fail(409, 'corpus_changed');
   return fail(503, 'unavailable');
  }
 };
}
