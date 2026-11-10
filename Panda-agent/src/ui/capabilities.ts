import { nativeModelProfiles, isNativeModelId, profileForNativeModelId, reservationQuantumNanoUsd, type NativeModelId } from '../opencode/native-model-profiles.ts';
export const nativeToolIds = ['convert_units', 'format_bom', 'read_public_docs'] as const;
export const nativeSkillIds = ['embedded-explainer', 'project-planner', 'bom-assistant', 'engineering-reviewer'] as const;
export type ModelChoice = {id: string; label:string; enabled:boolean; reason:'unavailable'|'retention_required'|'integration_pending'|'budget_unavailable'|null};
export const modelChoices = [
 {id:nativeModelProfiles.luna.model,label:'GPT-6 Luna'},
 {id:nativeModelProfiles['deepseek-v3-2-exp'].model,label:'DeepSeek V3.2 Exp (experimental)'},
 {id:'nvidia/nemotron-3-ultra-550b-a55b:free',label:'Nemotron 3 Ultra 550B (free)'},
 {id:'deepseek/deepseek-chat-v3-0324',label:'DeepSeek Chat V3 0324'},
 {id:'openai/gpt-6.1-terra',label:'GPT-6.1 Terra'},
 {id:'anthropic/claude-haiku-5.5',label:'Claude Haiku 5.5'},
] as const;
export const disabledModelReasons = ['unavailable','unavailable','retention_required','integration_pending','integration_pending','integration_pending'] as const;
export type {NativeModelId};
export type Capabilities = { mode: 'native_assistant' | 'direct_assistant' | 'basic_rag' | 'legacy'; model: 'GPT-6 Luna' | null; status: 'ready' | 'unavailable'; models:ModelChoice[]; reason: string | null; rag: boolean; tools: string[]; skills: string[]; budget: { limitNanoUsd: number; remainingNanoUsd: number } | null };
export function parseCapabilities(value: unknown): Capabilities | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const c = value as Record<string, unknown>;
  if (!['native_assistant', 'direct_assistant', 'basic_rag', 'legacy'].includes(String(c.mode)) || ![null, 'GPT-6 Luna'].includes(c.model as null | string) || !['ready','unavailable'].includes(String(c.status)) || ![null, 'disabled', 'runtime_unavailable', 'privacy_or_budget_unavailable', 'connection_unavailable'].includes(c.reason as string | null) || typeof c.rag !== 'boolean' || !Array.isArray(c.tools) || c.tools.length > 32 || !c.tools.every(t => typeof t === 'string' && t.length <= 100)) return null;
  if (!Array.isArray(c.skills) || c.skills.length > 32 || !c.skills.every(t => typeof t === 'string' && t.length <= 100)) return null;
  if (c.mode === 'native_assistant' && (c.rag || c.tools.some(t => !nativeToolIds.includes(t as typeof nativeToolIds[number])) || c.skills.some(t => !nativeSkillIds.includes(t as typeof nativeSkillIds[number])) || new Set(c.tools).size !== c.tools.length || new Set(c.skills).size !== c.skills.length || (c.status !== 'ready' && (c.tools.length > 0 || c.skills.length > 0)))) return null;
  if (c.mode === 'direct_assistant' && (c.tools.length > 0 || c.skills.length > 0)) return null;
  if (!Array.isArray(c.models) || c.models.length!==modelChoices.length || c.models.some((m,i)=>!m||typeof m!=='object'||Array.isArray(m)||Object.keys(m).sort().join(',')!=='enabled,id,label,reason'||m.id!==modelChoices[i].id||m.label!==modelChoices[i].label||typeof m.enabled!=='boolean'||(m.enabled?(m.reason!==null||(c.mode==='direct_assistant' && m.id!=='openai/gpt-6-luna')||!isNativeModelId(m.id)||!profileForNativeModelId(m.id).dispatchEnabled||c.status!=='ready'):!(m.reason===disabledModelReasons[i]||(m.reason==='budget_unavailable' && c.status==='ready' && isNativeModelId(m.id) && profileForNativeModelId(m.id).dispatchEnabled && !!c.budget && typeof c.budget==='object' && !Array.isArray(c.budget) && Number.isSafeInteger((c.budget as Record<string,unknown>).remainingNanoUsd) && ((c.budget as Record<string,unknown>).remainingNanoUsd as number) < profileForNativeModelId(m.id).reservationQuanta*reservationQuantumNanoUsd)))))return null;
  if (c.budget !== null) {
    if (!c.budget || typeof c.budget !== 'object' || Array.isArray(c.budget)) return null;
    const b = c.budget as Record<string, unknown>;
    if (b.limitNanoUsd !== 1000000000 || !Number.isSafeInteger(b.remainingNanoUsd) || (b.remainingNanoUsd as number) < 0 || (b.remainingNanoUsd as number) > 1000000000) return null;
  }
  return c as Capabilities;
}

export function activeModelLabel(models:readonly ModelChoice[], selected:NativeModelId, active:NativeModelId|null):string {
 return models.find(model => model.id === (active ?? selected))?.label ?? 'Model unavailable';
}
