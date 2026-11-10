import type { EvaluationCaseResult, EvaluationMode } from '@/Panda-agent/src/control-room/evaluation-runner';

export type Run = { requestId: string; mode: EvaluationMode; corpusFingerprint: string; results: EvaluationCaseResult[]; claimedIndex: number | null };
export type State = { corpusFingerprint: string; caseSet: { count: number; hash: string }; run: Run | null };

export function parseRun(value: unknown): Run | null {
 if (!value || typeof value !== 'object') return null;
 const v = value as Run;
 const timing = (n: unknown) => n === null || (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 120000);
 if (typeof v.requestId !== 'string' || !['retrieval', 'model'].includes(v.mode) || !/^[a-f0-9]{64}$/.test(v.corpusFingerprint)
  || !Array.isArray(v.results) || v.results.length > 20 || !v.results.every((r, i) => r && r.caseIndex === i && typeof r.caseId === 'string' && (r.caseQuestion === undefined || typeof r.caseQuestion === 'string') && ['passed', 'failed', 'unavailable', 'outcome_unknown'].includes(r.status)
   && (r.failureReason === undefined || r.failureReason === null || typeof r.failureReason === 'string')
   && timing(r.retrievalMs) && timing(r.elapsedMs) && (r.modelStatus === null || ['not_requested','guard_unavailable','not_run','evaluated'].includes(r.modelStatus))
   && (r.modelAnswer === null || typeof r.modelAnswer === 'string') && Array.isArray(r.modelEvidence)
   && r.modelEvidence.every(e => e && Number.isInteger(e.rank) && typeof e.quote === 'string' && typeof e.reason === 'string'))
  || (v.claimedIndex !== null && (!Number.isInteger(v.claimedIndex) || v.claimedIndex !== v.results.length))) return null;
 return { ...v, results: v.results.map(r => ({ ...r, caseQuestion: r.caseQuestion ?? 'Question unavailable for this older run.' })) };
}

