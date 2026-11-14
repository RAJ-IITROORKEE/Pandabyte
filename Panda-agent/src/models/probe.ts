import 'server-only';
import { profiles } from '../server/hosted-model-openrouter.ts';
import type { HostedDirectModelId } from '../hosted-model.ts';
import type { DynamicProfile, ModelRow } from './registry.ts';

export type ProbeResult = { ok: boolean; latencyMs: number; toolCall: boolean; servedBy: string | null; error: string | null };
type ProbeProfile = Pick<DynamicProfile, 'tag' | 'reasoning' | 'privacy'> & { tokenParam?: DynamicProfile['tokenParam'] };

/** The profile a row is probed with: built-in rows use the reviewed code profile (zero retention), added rows their stored profile. */
export function probeProfileFor(row: ModelRow): ProbeProfile | null {
 if (row.builtin) { const p = profiles[row.id as HostedDirectModelId]; return p ? { tag: p.tag, reasoning: p.reasoning, privacy: 'zdr', tokenParam: p.tokenParam } : null; }
 return row.profile;
}

const tool = { type: 'function', function: { name: 'search_catalog', description: 'Search the PandaByte product catalog by words in product titles.',
 parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } } };

/** One non-streamed request pinned to the profile's endpoint. Never returns or logs the key. */
export async function probeModel(profile: ProbeProfile, modelId: string, apiKey: string, fetcher: typeof fetch = fetch): Promise<ProbeResult> {
 const started = Date.now();
 const done = (r: Omit<ProbeResult, 'latencyMs'>): ProbeResult => ({ ...r, latencyMs: Date.now() - started });
 try {
  const zdr = profile.privacy === 'zdr';
  const body = { model: modelId, stream: false, [profile.tokenParam ?? 'max_tokens']: 300, tools: [tool], tool_choice: 'auto',
   messages: [{ role: 'user', content: 'Which PandaByte ESP32 boards do you sell?' }],
   provider: { only: [profile.tag], allow_fallbacks: false, require_parameters: true, zdr, data_collection: zdr ? 'deny' : 'allow' },
   ...(Object.keys(profile.reasoning).length ? { reasoning: profile.reasoning } : {}) };
  const response = await fetcher('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30_000),
   headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data: unknown = await response.json().catch(() => null);
  const rec = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  if (!response.ok) {
   const message = rec.error && typeof rec.error === 'object' && typeof (rec.error as Record<string, unknown>).message === 'string' ? (rec.error as { message: string }).message.slice(0, 160) : '';
   return done({ ok: false, toolCall: false, servedBy: null, error: `OpenRouter returned ${response.status}${message ? `: ${message}` : ''}` });
  }
  const choice = Array.isArray(rec.choices) && rec.choices[0] && typeof rec.choices[0] === 'object' ? rec.choices[0] as { message?: { tool_calls?: unknown } } : null;
  const calls = Array.isArray(choice?.message?.tool_calls) ? choice.message.tool_calls as Array<{ function?: { name?: unknown } }> : [];
  return done({ ok: true, toolCall: calls.some(c => c?.function?.name === 'search_catalog'), servedBy: typeof rec.provider === 'string' ? rec.provider.slice(0, 80) : null, error: null });
 } catch (e) {
  return done({ ok: false, toolCall: false, servedBy: null, error: e instanceof Error && e.name === 'TimeoutError' ? 'The model did not answer within 30 seconds.' : 'The request failed.' });
 }
}
