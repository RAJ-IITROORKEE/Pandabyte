import { nativeModelProfiles, isNativeModelId, profileForNativeModelId, reservationQuantumNanoUsd, type NativeModelId } from '../opencode/native-model-profiles.ts';
import { fastHostedModel, flashHostedModel, haikuHostedModel, hostedDirectModelIds, qwenHostedModel, type HostedDirectModelId } from '../hosted-model.ts';
/** Built-ins, plus models from the Admin registry and the free pool (any `vendor/model` id; the server checks it is enabled). */
export type ChatModelId = NativeModelId | HostedDirectModelId | `${string}/${string}`;
const extraModelId = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/;
export const isChatModelId = (id: unknown): id is ChatModelId => isNativeModelId(id) || hostedDirectModelIds.includes(id as string) || (typeof id === 'string' && id.length <= 120 && extraModelId.test(id));
/** Hosted chats start on Haiku when it is available; otherwise the first enabled model. */
export const preferredModelId = haikuHostedModel.id;
export const nativeToolIds = ['convert_units', 'format_bom', 'read_public_docs'] as const;
export const nativeSkillIds = ['embedded-explainer', 'project-planner', 'bom-assistant', 'engineering-reviewer'] as const;
/** tier/privacy are set on registry models (after the built-in list): 'logged' = a free endpoint that may keep prompts. */
export type ModelChoice = {id: string; label:string; enabled:boolean; reason:'unavailable'|'retention_required'|'integration_pending'|'budget_unavailable'|null; tier?:'free'|'paid'; privacy?:'zdr'|'logged'};
export const MAX_EXTRA_MODELS = 30;
function validExtras(extras: unknown[]): boolean {
  const ids = new Set<string>();
  return extras.length <= MAX_EXTRA_MODELS && extras.every(m => {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
    const x = m as Record<string, unknown>, keys = Object.keys(x).sort().join(',');
    if (keys !== 'enabled,id,label,privacy,reason,tier' || typeof x.id !== 'string' || !isChatModelId(x.id) || hostedDirectModelIds.includes(x.id) || ids.has(x.id)
      || typeof x.label !== 'string' || !x.label.trim() || x.label.length > 60 || x.enabled !== true || x.reason !== null || (x.tier !== 'free' && x.tier !== 'paid') || (x.privacy !== 'zdr' && x.privacy !== 'logged')
      || (x.privacy === 'logged' && x.tier !== 'free')) return false;
    ids.add(x.id); return true;
  });
}
export const modelChoices = [
 {id:nativeModelProfiles.luna.model,label:'GPT-6 Luna'},
 {id:nativeModelProfiles['deepseek-v3-2-exp'].model,label:'DeepSeek V3.2 Exp (experimental)'},
 {id:'nvidia/nemotron-3-ultra-550b-a55b:free',label:'Nemotron 3 Ultra 550B (free)'},
 {id:'deepseek/deepseek-chat-v3-0324',label:'DeepSeek Chat V3 0324'},
 {id:'openai/gpt-6.1-terra',label:'GPT-6.1 Terra'},
 {id:'anthropic/claude-haiku-5.5',label:'Claude Haiku 5.5'},
] as const;
export const disabledModelReasons = ['unavailable','unavailable','retention_required','integration_pending','integration_pending','integration_pending'] as const;
export const hostedModelChoices = [...modelChoices, { id: fastHostedModel.id, label: fastHostedModel.label }, { id: flashHostedModel.id, label: flashHostedModel.label }, { id: qwenHostedModel.id, label: qwenHostedModel.label }] as const;
export const hostedDisabledModelReasons = [...disabledModelReasons, 'unavailable', 'unavailable', 'unavailable'] as const;
export type {NativeModelId};
export type Capabilities = { mode: 'native_assistant' | 'direct_assistant' | 'basic_rag' | 'legacy'; model: 'GPT-6 Luna' | typeof fastHostedModel.label | null; status: 'ready' | 'unavailable'; models:ModelChoice[]; reason: string | null; rag: boolean; tools: string[]; skills: string[]; budget: { limitNanoUsd: number; remainingNanoUsd: number } | null };
export function parseCapabilities(value: unknown): Capabilities | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const c = value as Record<string, unknown>;
  if (!['native_assistant', 'direct_assistant', 'basic_rag', 'legacy'].includes(String(c.mode)) || ![null, 'GPT-6 Luna', fastHostedModel.label].includes(c.model as null | string) || !['ready','unavailable'].includes(String(c.status)) || ![null, 'disabled', 'runtime_unavailable', 'privacy_or_budget_unavailable', 'connection_unavailable'].includes(c.reason as string | null) || typeof c.rag !== 'boolean' || !Array.isArray(c.tools) || c.tools.length > 32 || !c.tools.every(t => typeof t === 'string' && t.length <= 100)) return null;
  if (!Array.isArray(c.skills) || c.skills.length > 32 || !c.skills.every(t => typeof t === 'string' && t.length <= 100)) return null;
  if (c.mode === 'native_assistant' && (c.rag || c.tools.some(t => !nativeToolIds.includes(t as typeof nativeToolIds[number])) || c.skills.some(t => !nativeSkillIds.includes(t as typeof nativeSkillIds[number])) || new Set(c.tools).size !== c.tools.length || new Set(c.skills).size !== c.skills.length || (c.status !== 'ready' && (c.tools.length > 0 || c.skills.length > 0)))) return null;
  if (c.mode === 'direct_assistant' && (c.tools.length > 0 || c.skills.length > 0)) return null;
  // Registry models follow the fixed hosted list (ready hosted chats only).
  const hosted = Array.isArray(c.models) && c.models.length >= hostedModelChoices.length && c.models.length <= hostedModelChoices.length + MAX_EXTRA_MODELS
    && c.models.slice(0, hostedModelChoices.length).every((m, i) => !!m && typeof m === 'object' && (m as ModelChoice).id === hostedModelChoices[i].id);
  if (hosted) {
    if (c.mode !== 'direct_assistant' || c.budget !== null || (c.status === 'ready' ? c.model !== fastHostedModel.label || c.reason !== null : c.model !== null || c.reason === null || c.rag)) return null;
    const extras = (c.models as unknown[]).slice(hostedModelChoices.length);
    if (extras.length && (c.status !== 'ready' || !validExtras(extras))) return null;
    if ((c.models as ModelChoice[]).slice(0, hostedModelChoices.length).some((m, i) => !m || typeof m !== 'object' || Array.isArray(m) || Object.keys(m).sort().join(',') !== 'enabled,id,label,reason' || m.id !== hostedModelChoices[i].id || m.label !== hostedModelChoices[i].label || (m.enabled && !(c.status === 'ready' && hostedDirectModelIds.includes(m.id))) || typeof m.enabled !== 'boolean' || m.reason !== (m.enabled ? null : hostedDisabledModelReasons[i]))) return null;
  } else {
    if (c.model === fastHostedModel.label) return null;
    if (!Array.isArray(c.models) || c.models.length!==modelChoices.length || c.models.some((m,i)=>!m||typeof m!=='object'||Array.isArray(m)||Object.keys(m).sort().join(',')!=='enabled,id,label,reason'||m.id!==modelChoices[i].id||m.label!==modelChoices[i].label||typeof m.enabled!=='boolean'||(m.enabled?(m.reason!==null||(c.mode==='direct_assistant' && m.id!=='openai/gpt-6-luna')||!isNativeModelId(m.id)||!profileForNativeModelId(m.id).dispatchEnabled||c.status!=='ready'):!(m.reason===disabledModelReasons[i]||(m.reason==='budget_unavailable' && c.status==='ready' && isNativeModelId(m.id) && profileForNativeModelId(m.id).dispatchEnabled && !!c.budget && typeof c.budget==='object' && !Array.isArray(c.budget) && Number.isSafeInteger((c.budget as Record<string,unknown>).remainingNanoUsd) && ((c.budget as Record<string,unknown>).remainingNanoUsd as number) < profileForNativeModelId(m.id).reservationQuanta*reservationQuantumNanoUsd)))))return null;
    if (c.mode === 'direct_assistant' && (c.status === 'ready' ? c.model !== 'GPT-6 Luna' || c.reason !== null || !c.models[0].enabled : c.model !== null || c.reason === null)) return null;
  }
  if (c.budget !== null) {
    if (!c.budget || typeof c.budget !== 'object' || Array.isArray(c.budget)) return null;
    const b = c.budget as Record<string, unknown>;
    if (b.limitNanoUsd !== 1000000000 || !Number.isSafeInteger(b.remainingNanoUsd) || (b.remainingNanoUsd as number) < 0 || (b.remainingNanoUsd as number) > 1000000000) return null;
  }
  return c as Capabilities;
}

export function activeModelLabel(models:readonly ModelChoice[], selected:ChatModelId, active:ChatModelId|null):string {
 return models.find(model => model.id === (active ?? selected))?.label ?? 'Model unavailable';
}
