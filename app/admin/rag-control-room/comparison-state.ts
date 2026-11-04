export type Operation = { model:string; requestId:string };
export type ComparisonPassage = { rank:number; title:string; sourceUrl:string; capturedAt:string; sectionPath:string[]; text:string };
export type ComparisonResult = { model:string; requestId:string; status:'evaluated'|'not_admitted'|'quota'|'outcome_unknown'|'skipped'; answer?:string; evidence?:{rank:number;quote:string;reason:string}[]; metrics?:{elapsedMs:number|null;inputTokens:number|null;outputTokens:number|null;costUsd:number|null} };
export type ComparisonResponse = { context:{ passages:ComparisonPassage[]; digest:string }; results:ComparisonResult[] };
export type ComparisonCapability = { execution:'unconfigured'|'configured_unverified'; models:string[]; maxModels:4 };
const uuid = (value:unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const modelId = (value:unknown) => typeof value === 'string' && value.length <= 200 && /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value);
export function parseComparisonCapability(value:unknown):ComparisonCapability | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data=value as ComparisonCapability;
  if (!['unconfigured','configured_unverified'].includes(data.execution) || data.maxModels !== 4 || !Array.isArray(data.models) || data.models.length > 100 || data.models.some(model => !modelId(model)) || new Set(data.models).size !== data.models.length) return null;
  return data;
}
export function parseOperations(value:unknown):Operation[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 4 || value.some(item => !item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).sort().join(',') !== 'model,requestId' || !modelId(item.model) || !uuid(item.requestId))) return null;
  if (new Set(value.map(item => item.model)).size !== value.length || new Set(value.map(item => item.requestId)).size !== value.length) return null;
  return value;
}
export function parseComparison(value:unknown, operations:Operation[]):ComparisonResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const response = value as ComparisonResponse;
  if (!response.context || !/^[a-f0-9]{64}$/.test(response.context.digest) || !Array.isArray(response.context.passages) || response.context.passages.length > 8 || !Array.isArray(response.results) || response.results.length !== operations.length) return null;
  if (response.context.passages.some((passage,index) => !passage || passage.rank !== index + 1 || typeof passage.title !== 'string' || typeof passage.sourceUrl !== 'string' || !/^https:\/\//.test(passage.sourceUrl) || typeof passage.capturedAt !== 'string' || typeof passage.text !== 'string' || !passage.text.trim() || !Array.isArray(passage.sectionPath) || passage.sectionPath.some(part => typeof part !== 'string'))) return null;
  const validMetric = (value:unknown) => value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (response.results.some((result,index) => {
    if (!result || result.model !== operations[index].model || result.requestId !== operations[index].requestId || !['evaluated','not_admitted','quota','outcome_unknown','skipped'].includes(result.status)) return true;
    if (result.status !== 'evaluated') return result.answer !== undefined || result.evidence !== undefined;
    if (typeof result.answer !== 'string' || !Array.isArray(result.evidence) || result.evidence.length > 4 || result.evidence.some(item => !item || !Number.isSafeInteger(item.rank) || item.rank < 1 || item.rank > response.context.passages.length || typeof item.quote !== 'string' || !item.quote.trim() || !response.context.passages[item.rank-1].text.includes(item.quote) || typeof item.reason !== 'string')) return true;
    return !result.metrics || !['elapsedMs','inputTokens','outputTokens','costUsd'].every(key => validMetric(result.metrics![key as keyof typeof result.metrics]));
  })) return null;
  return response;
}
