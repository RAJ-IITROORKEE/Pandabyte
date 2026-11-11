// Phase D signed envelopes between the app and the host research service (phase-d-plan.md R1/R2).
// The app signs dispatches; the host signs results. Separate keys and domain prefixes; canonical sorted-key JSON.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalResearchJSON } from '../opencode/research-provider-gateway.ts';

export const researchChatProfiles = Object.freeze({
  'tavily-hosted-haiku': 'anthropic/claude-haiku-5.5',
  'tavily-hosted-luna': 'openai/gpt-6-luna',
  'tavily-hosted-terra': 'openai/gpt-6.1-terra',
} as const);
export type ResearchChatProfile = keyof typeof researchChatProfiles;
export type ResearchUsage = { calls: number; inputTokens: number; outputTokens: number; costNanoUsd: number };
export type ResearchFailure = 'busy' | 'attestation_expired' | 'tool_not_ready' | 'invalid';
export type DispatchFields = { v: 1; action: 'turn' | 'status' | 'cancel'; subjectHash: string; chatId: string; requestId: string; profile: ResearchChatProfile; modelId: string; promptHash: string; exp: number };
export type ResultFields = { v: 1; subjectHash: string; chatId: string; requestId: string; runId: string; profile: ResearchChatProfile; modelId: string; promptHash: string;
  state: 'evidence' | 'insufficient' | 'unknown' | 'failed'; reason?: ResearchFailure; answerHash?: string; usage: ResearchUsage; exp: number };

const dispatchDomain = 'panda-research-dispatch-v1\n', resultDomain = 'panda-research-result-v1\n';
const hex64 = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const keysExactly = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const count = (v: unknown, max: number) => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= max;
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const validKey = (key: unknown): key is Buffer => Buffer.isBuffer(key) && key.length === 32;

export const researchSubjectHash = (clerkSubject: string) => sha('panda-research-subject-v1\n' + clerkSubject);
export const researchRunId = (subjectHash: string, chatId: string, requestId: string) => sha('panda-research-run-v1\n' + subjectHash + '\n' + chatId + '\n' + requestId);
export const researchPromptHash = (prompt: string) => sha(prompt);

function mac(key: Buffer, domain: string, fields: object): string {
  if (!validKey(key)) throw Error('research_key_invalid');
  return createHmac('sha256', key).update(domain + canonicalResearchJSON(fields), 'utf8').digest('hex');
}
function macEqual(expected: string, supplied: unknown): boolean {
  return hex64(supplied) && timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'));
}
const profileMatches = (profile: unknown, modelId: unknown) => typeof profile === 'string' && Object.hasOwn(researchChatProfiles, profile)
  && researchChatProfiles[profile as ResearchChatProfile] === modelId;

export function validDispatch(v: unknown, now: number): v is DispatchFields {
  return plain(v) && keysExactly(v, ['v', 'action', 'subjectHash', 'chatId', 'requestId', 'profile', 'modelId', 'promptHash', 'exp']) && v.v === 1
    && (v.action === 'turn' || v.action === 'status' || v.action === 'cancel') && hex64(v.subjectHash) && uuid(v.chatId) && uuid(v.requestId)
    && profileMatches(v.profile, v.modelId) && hex64(v.promptHash) && Number.isSafeInteger(v.exp) && (v.exp as number) > now && (v.exp as number) <= now + 65;
}
export function validResult(v: unknown, now: number): v is ResultFields {
  if (!plain(v)) return false;
  const terminal = v.state === 'evidence' || v.state === 'insufficient', failed = v.state === 'failed';
  const keys = ['v', 'subjectHash', 'chatId', 'requestId', 'runId', 'profile', 'modelId', 'promptHash', 'state', 'usage', 'exp', ...(terminal ? ['answerHash'] : []), ...(failed ? ['reason'] : [])];
  const u = v.usage;
  return keysExactly(v, keys) && v.v === 1 && hex64(v.subjectHash) && uuid(v.chatId) && uuid(v.requestId) && hex64(v.runId) && profileMatches(v.profile, v.modelId)
    && hex64(v.promptHash) && (terminal || failed || v.state === 'unknown') && (!terminal || hex64(v.answerHash))
    && (!failed || ['busy', 'attestation_expired', 'tool_not_ready', 'invalid'].includes(v.reason as string))
    && plain(u) && keysExactly(u, ['calls', 'inputTokens', 'outputTokens', 'costNanoUsd']) && count(u.calls, 6) && count(u.inputTokens, 192000)
    && count(u.outputTokens, 4200) && count(u.costNanoUsd, 1000000000) && Number.isSafeInteger(v.exp) && (v.exp as number) > now && (v.exp as number) <= now + 125;
}

/** `now` is epoch seconds. Throws on invalid fields so a malformed envelope is never signed. */
export function signDispatch(key: Buffer, fields: DispatchFields, now = Math.floor(Date.now() / 1000)): string {
  if (!validDispatch(fields, now)) throw Error('research_dispatch_invalid');
  return mac(key, dispatchDomain, fields);
}
export function verifyDispatch(key: Buffer, fields: unknown, supplied: unknown, now = Math.floor(Date.now() / 1000)): fields is DispatchFields {
  try { return validDispatch(fields, now) && macEqual(mac(key, dispatchDomain, fields), supplied); } catch { return false; }
}
export function signResult(key: Buffer, fields: ResultFields, now = Math.floor(Date.now() / 1000)): string {
  if (!validResult(fields, now)) throw Error('research_result_invalid');
  return mac(key, resultDomain, fields);
}
export function verifyResult(key: Buffer, fields: unknown, supplied: unknown, now = Math.floor(Date.now() / 1000)): fields is ResultFields {
  try { return validResult(fields, now) && macEqual(mac(key, resultDomain, fields), supplied); } catch { return false; }
}
