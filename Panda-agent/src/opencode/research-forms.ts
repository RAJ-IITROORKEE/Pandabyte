import { researchJSON, researchObject, researchText } from './research-values.ts';

type Option = { value: string; label: string; description?: string };
type FieldBase = { key: string; title?: string; description?: string; required: boolean; custom: boolean; options?: Option[] };
export type ResearchQuestionField = FieldBase & ({ type: 'string'; minLength: number; maxLength: number } | { type: 'multiselect'; options: Option[]; minItems: number; maxItems: number });
export type ResearchAnswer = Record<string, string | string[]>;
export type ResearchQuestion = { id: string; sessionID: string; title: string; assistantMessageID: string; toolID: string; fields: ResearchQuestionField[];
 state: { status: 'pending' | 'cancelled' } | { status: 'answered'; answer: ResearchAnswer } };
export type ResearchQuestionBinding = { sessionID: string; expectedGeneration: string; currentGeneration: string; assistantMessageID: string; toolID: string };
export type ResearchQuestionResult = { state: 'invalid' | 'unavailable' } | { state: 'available'; question: ResearchQuestion };
const nativeID = (v: unknown, prefix: string): v is string => typeof v === 'string' && new RegExp('^' + prefix + '[a-f0-9]{12}[A-Za-z0-9]{14}$').test(v);
const generation = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const callID = (v: unknown): v is string => typeof v === 'string' && /^[\x20-\x7e]{1,256}$/.test(v) && !!v.trim();
const integer = (v: unknown, max: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
function fields(raw: unknown): ResearchQuestionField[] | null {
 if (!Array.isArray(raw) || raw.length < 1 || raw.length > 8) return null;
 const result: ResearchQuestionField[] = [], keys = new Set<string>();
 for (const f of raw) {
  if (!researchObject(f) || typeof f.key !== 'string' || !/^q[0-7]$/.test(f.key) || keys.has(f.key)
   || (f.type !== 'string' && f.type !== 'multiselect') || Object.keys(f).some(k => !['key', 'type', 'title', 'description', 'required', 'options', 'custom', 'minLength', 'maxLength', 'minItems', 'maxItems'].includes(k))
   || (f.title !== undefined && !researchText(f.title, 300)) || (f.description !== undefined && !researchText(f.description, 1000))
   || (f.required !== undefined && typeof f.required !== 'boolean') || (f.custom !== undefined && typeof f.custom !== 'boolean')) return null;
  keys.add(f.key);
  const rawOptions = f.options === undefined ? [] : f.options, options: Option[] = [], values = new Set<string>();
  if (!Array.isArray(rawOptions) || rawOptions.length > 8 || f.type === 'multiselect' && !rawOptions.length) return null;
  for (const o of rawOptions) {
   if (!researchObject(o) || Object.keys(o).some(k => !['value', 'label', 'description'].includes(k)) || !researchText(o.value, 200) || !o.value.trim()
    || !researchText(o.label, 200) || !o.label.trim() || values.has(o.value) || o.description !== undefined && !researchText(o.description, 500)) return null;
   values.add(o.value); options.push({ value: o.value, label: o.label, ...(o.description === undefined ? {} : { description: o.description as string }) });
  }
  const base: FieldBase = { key: f.key, ...(f.title === undefined ? {} : { title: f.title as string }), ...(f.description === undefined ? {} : { description: f.description as string }), required: f.required === true, custom: f.custom === true, ...(f.options === undefined ? {} : { options }) };
  if (f.type === 'string') {
   const minLength = f.minLength === undefined ? 0 : f.minLength, maxLength = f.maxLength === undefined ? 2000 : f.maxLength;
   if (f.minItems !== undefined || f.maxItems !== undefined || !integer(minLength, 2000) || !integer(maxLength, 2000) || minLength > maxLength) return null;
   result.push({ ...base, type: 'string', minLength, maxLength });
  } else {
   const minItems = f.minItems === undefined ? 0 : f.minItems, maxItems = f.maxItems === undefined ? 8 : f.maxItems;
   if (f.minLength !== undefined || f.maxLength !== undefined || !integer(minItems, 8) || !integer(maxItems, 8) || minItems > maxItems) return null;
   result.push({ ...base, type: 'multiselect', options, minItems, maxItems });
  }
 }
 return result;
}
function answerForFields(list: ResearchQuestionField[], raw: unknown): ResearchAnswer | null {
 if (!researchJSON(raw, 4000) || !researchObject(raw) || Object.keys(raw).some(k => !list.some(f => f.key === k))) return null;
 const answer: ResearchAnswer = {};
 for (const f of list) {
  const value = raw[f.key];
  if (value === undefined) { if (f.required) return null; continue; }
  const allowed = (v: unknown): v is string => researchText(v, 2000) && (f.custom || f.type === 'string' && f.options === undefined || f.options?.some(o => o.value === v) === true);
  if (f.type === 'string') {
   if (!allowed(value) || value.length < f.minLength || value.length > f.maxLength || f.required && !value.trim()) return null;
   answer[f.key] = value;
  } else {
   if (!Array.isArray(value) || value.length < f.minItems || value.length > f.maxItems || f.required && !value.length
    || value.some(v => !allowed(v) || !v.trim()) || new Set(value).size !== value.length) return null;
   answer[f.key] = [...value] as string[];
  }
 }
 return answer;
}

/** Native Form.Detail only. Generation and run/tool binding come from server authority, never the form. */
export function parseResearchQuestion(raw: unknown, binding: unknown): ResearchQuestionResult {
 const invalid: ResearchQuestionResult = { state: 'invalid' };
 if (!researchJSON(binding, 4096) || !researchObject(binding) || Object.keys(binding).sort().join(',') !== 'assistantMessageID,currentGeneration,expectedGeneration,sessionID,toolID'
  || !nativeID(binding.sessionID, 'ses_') || !nativeID(binding.assistantMessageID, 'msg_') || !callID(binding.toolID)
  || !generation(binding.expectedGeneration) || !generation(binding.currentGeneration)) return invalid;
 if (binding.expectedGeneration !== binding.currentGeneration) return { state: 'unavailable' };
 if (!researchJSON(raw, 32768) || !researchObject(raw) || !nativeID(raw.id, 'frm_') || raw.sessionID !== binding.sessionID || !researchText(raw.title, 300) || !raw.title.trim()
  || !researchObject(raw.metadata) || raw.metadata.kind !== 'question' || !researchObject(raw.metadata.tool)
  || raw.metadata.tool.messageID !== binding.assistantMessageID || raw.metadata.tool.id !== binding.toolID || !researchObject(raw.state)) return invalid;
 const parsed = fields(raw.fields); if (!parsed) return invalid;
 let state: ResearchQuestion['state'];
 if (raw.state.status === 'pending') state = { status: 'pending' };
 else if (raw.state.status === 'cancelled') state = { status: 'cancelled' };
 else if (raw.state.status === 'answered') { const answer = answerForFields(parsed, raw.state.answer); if (!answer) return invalid; state = { status: 'answered', answer }; }
 else return invalid;
 return { state: 'available', question: { id: raw.id, sessionID: binding.sessionID, title: raw.title, assistantMessageID: binding.assistantMessageID, toolID: binding.toolID, fields: parsed, state } };
}

export function validateResearchAnswer(question: ResearchQuestion, raw: unknown): ResearchAnswer | null {
 if (!researchJSON(question, 32768) || !researchObject(question) || !researchObject(question.state) || question.state.status !== 'pending') return null;
 const parsed = fields(question.fields); return parsed ? answerForFields(parsed, raw) : null;
}
