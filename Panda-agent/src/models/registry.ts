// Model registry (migration 20261114120000): pure parsing and profile building, no server imports.
// An added model's profile holds exactly the endpoint facts that approvedEndpoint() in hosted-model-openrouter.ts compares.
export type ModelPrivacy = 'zdr' | 'logged';
export type DynamicProfile = {
 tag: string; providerName: string; endpointName: string; tokenizer: string; reported: string[];
 pricing: { prompt: string; completion: string; input_cache_read?: string }; pricingKeys: string[]; implicitCaching: boolean; params: string[];
 maxPrice: { prompt: number; completion: number }; nano2: { prompt: number; cached: number; write: number; completion: number };
 reasoning: Record<string, unknown>; discount?: number; tokenParam?: 'max_tokens' | 'max_completion_tokens'; exactTag?: boolean; encryptedReasoning?: boolean;
 privacy: ModelPrivacy;
};
export type ModelUsage = { turns: number; failovers: number; failures: number; inputTokens: number; outputTokens: number; costNano: number };
export type ModelRow = { id: string; label: string; tier: 'paid' | 'free'; enabled: boolean; members: boolean; poolOrder: number | null; builtin: boolean;
 profile: DynamicProfile | null; contextWindow: number | null; note: string | null; version: number; updatedAt: string; usage30d?: ModelUsage };

export const MODEL_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/;
export const ALLOWED_PARAMS = ['response_format', 'structured_outputs', 'reasoning', 'include_reasoning', 'tool_choice'] as const;
// OpenRouter endpoint tags have up to three parts, e.g. sail-research/fp4/us.
const TAG = /^[a-z0-9._-]+(\/[a-z0-9._-]+){0,2}$/;
const PRICE = /^\d{1,3}(\.\d{1,20})?$/;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length >= 1 && v.length <= max;
const int = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const strings = (v: unknown, maxItems: number, max: number, re?: RegExp): v is string[] => Array.isArray(v) && v.length <= maxItems && v.every(s => text(s, max) && (!re || re.test(s)));
const KEYS = ['tag', 'providerName', 'endpointName', 'tokenizer', 'reported', 'pricing', 'pricingKeys', 'implicitCaching', 'params', 'maxPrice', 'nano2', 'reasoning', 'privacy'];
const OPTIONAL = ['discount', 'tokenParam', 'exactTag', 'encryptedReasoning'];

export function parseDynamicProfile(raw: unknown): DynamicProfile | null {
 if (!record(raw) || Object.keys(raw).some(k => !KEYS.includes(k) && !OPTIONAL.includes(k)) || KEYS.some(k => !(k in raw))) return null;
 const { tag, providerName, endpointName, tokenizer, reported, pricing, pricingKeys, implicitCaching, params, maxPrice, nano2, reasoning, privacy } = raw;
 if (typeof tag !== 'string' || tag.length > 80 || !TAG.test(tag) || !text(providerName, 120) || !text(endpointName, 200) || !text(tokenizer, 40)) return null;
 if (!strings(reported, 4, 120) || reported.length < 1 || !strings(pricingKeys, 20, 40, /^[a-z0-9_]+$/) || typeof implicitCaching !== 'boolean') return null;
 if (!Array.isArray(params) || params.length > ALLOWED_PARAMS.length || params.some(p => !(ALLOWED_PARAMS as readonly string[]).includes(p as string))) return null;
 if (!record(pricing) || Object.keys(pricing).some(k => !['prompt', 'completion', 'input_cache_read'].includes(k)) || typeof pricing.prompt !== 'string' || typeof pricing.completion !== 'string'
  || !PRICE.test(pricing.prompt) || !PRICE.test(pricing.completion) || (pricing.input_cache_read !== undefined && (typeof pricing.input_cache_read !== 'string' || !PRICE.test(pricing.input_cache_read)))) return null;
 if (!record(maxPrice) || Object.keys(maxPrice).sort().join() !== 'completion,prompt' || ![maxPrice.prompt, maxPrice.completion].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1000)) return null;
 if (!record(nano2) || Object.keys(nano2).sort().join() !== 'cached,completion,prompt,write' || !Object.values(nano2).every(n => int(n, 0, 1e9))) return null;
 if (!record(reasoning) || Object.keys(reasoning).length > 4 || JSON.stringify(reasoning).length > 200
  || Object.entries(reasoning).some(([k, v]) => !['enabled', 'effort', 'exclude', 'max_tokens'].includes(k) || !['boolean', 'string', 'number'].includes(typeof v))) return null;
 if (privacy !== 'zdr' && privacy !== 'logged') return null;
 if (privacy === 'logged' && (pricing.prompt !== '0' || pricing.completion !== '0')) return null;
 if (raw.discount !== undefined && !(typeof raw.discount === 'number' && raw.discount > 0 && raw.discount < 1)) return null;
 if (raw.tokenParam !== undefined && raw.tokenParam !== 'max_tokens' && raw.tokenParam !== 'max_completion_tokens') return null;
 if (raw.exactTag !== undefined && typeof raw.exactTag !== 'boolean') return null;
 if (raw.encryptedReasoning !== undefined && typeof raw.encryptedReasoning !== 'boolean') return null;
 return { tag, providerName, endpointName, tokenizer, reported: [...reported], pricing: pricing as DynamicProfile['pricing'], pricingKeys: [...pricingKeys], implicitCaching, params: [...params] as string[],
  maxPrice: maxPrice as DynamicProfile['maxPrice'], nano2: nano2 as DynamicProfile['nano2'], reasoning: { ...reasoning }, privacy,
  ...(raw.discount !== undefined ? { discount: raw.discount as number } : {}), ...(raw.tokenParam ? { tokenParam: raw.tokenParam as 'max_tokens' } : {}),
  ...(raw.exactTag !== undefined ? { exactTag: raw.exactTag as boolean } : {}), ...(raw.encryptedReasoning !== undefined ? { encryptedReasoning: raw.encryptedReasoning as boolean } : {}) };
}

const count = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
function parseUsage(v: unknown): ModelUsage | undefined {
 if (!record(v)) return undefined;
 return { turns: count(v.turns), failovers: count(v.failovers), failures: count(v.failures), inputTokens: count(v.inputTokens), outputTokens: count(v.outputTokens), costNano: count(v.costNano) };
}

/** Rows from the database RPCs; malformed rows are dropped. Built-in rows carry no profile. */
export function parseModelRows(raw: unknown): ModelRow[] {
 if (!Array.isArray(raw)) return [];
 const rows: ModelRow[] = [];
 for (const r of raw) {
  if (!record(r) || typeof r.id !== 'string' || r.id.length > 120 || !MODEL_ID.test(r.id) || typeof r.label !== 'string' || r.label.trim().length < 2 || r.label.length > 60) continue;
  if ((r.tier !== 'paid' && r.tier !== 'free') || typeof r.enabled !== 'boolean' || typeof r.members !== 'boolean' || typeof r.builtin !== 'boolean') continue;
  if (!(r.poolOrder === null || int(r.poolOrder, 1, 50)) || !int(r.version, 1, 1e9) || typeof r.updatedAt !== 'string') continue;
  let profile: DynamicProfile | null = null;
  if (!r.builtin) { profile = parseDynamicProfile(r.profile); if (!profile) continue; }
  else if (!record(r.profile) || Object.keys(r.profile).length) continue;
  const usage = parseUsage(r.usage30d);
  rows.push({ id: r.id, label: r.label, tier: r.tier, enabled: r.enabled, members: r.members, poolOrder: r.poolOrder as number | null, builtin: r.builtin, profile,
   contextWindow: int(r.contextWindow, 1000, 1e7) ? r.contextWindow : null, note: typeof r.note === 'string' ? r.note : null, version: r.version, updatedAt: r.updatedAt, ...(usage ? { usage30d: usage } : {}) });
 }
 return rows;
}

const nano = (price: string) => Math.ceil(Number((Number(price) * 2e9).toFixed(6)));
const perMillion = (price: string) => Number((Number(price) * 1e6).toFixed(6));
const isPrice = (v: unknown): v is string => typeof v === 'string' && PRICE.test(v);

/** Build the profile for one OpenRouter endpoint. zdrTags: tags of this model's endpoints with safety_retention === false. */
export function profileFromEndpoint(model: unknown, endpoint: unknown, zdrTags: readonly string[]):
 { tier: 'paid' | 'free'; profile: DynamicProfile; contextWindow: number | null } | { error: string } {
 if (!record(model) || !record(endpoint) || typeof model.id !== 'string' || !MODEL_ID.test(model.id)) return { error: 'Model entry is not valid.' };
 const arch = record(model.architecture) ? model.architecture : {};
 const { tag, name, provider_name: provider } = endpoint;
 if (typeof tag !== 'string' || !TAG.test(tag) || tag.length > 80) return { error: 'Endpoint tag is not supported.' };
 if (!text(name, 200) || !text(provider, 120) || !text(arch.tokenizer, 40)) return { error: 'Endpoint details are incomplete.' };
 if (endpoint.status !== 0) return { error: 'This endpoint is not currently healthy.' };
 const pricing = record(endpoint.pricing) ? endpoint.pricing : null;
 if (!pricing || !isPrice(pricing.prompt) || !isPrice(pricing.completion)) return { error: 'Endpoint prices are missing.' };
 for (const k of ['input_cache_read', 'input_cache_write']) if (pricing[k] !== undefined && !isPrice(pricing[k])) return { error: 'Endpoint prices are not valid.' };
 const supported = Array.isArray(endpoint.supported_parameters) ? endpoint.supported_parameters.filter((p): p is string => typeof p === 'string') : [];
 const choice = record(endpoint.supports_tool_choice) ? endpoint.supports_tool_choice : {};
 if (!supported.includes('tools') || choice.auto !== true || choice.none !== true) return { error: 'The agent needs tool calling: this endpoint does not support it.' };
 if (typeof endpoint.supports_implicit_caching !== 'boolean' || typeof endpoint.max_completion_tokens !== 'number') return { error: 'Endpoint details are incomplete.' };
 const free = Number(pricing.prompt) === 0 && Number(pricing.completion) === 0;
 const zdr = zdrTags.includes(tag);
 if (!free && !zdr) return { error: 'Paid models must use a zero-data-retention endpoint.' };
 if (free && (pricing.prompt !== '0' || pricing.completion !== '0')) return { error: 'Endpoint prices are not valid.' };
 const slug = typeof model.canonical_slug === 'string' && text(model.canonical_slug, 120) ? model.canonical_slug : model.id;
 const discount = pricing.discount === undefined ? 0 : Number(pricing.discount);
 if (!Number.isFinite(discount) || discount < 0 || discount >= 1) return { error: 'Endpoint prices are not valid.' };
 const cachedPrice = (pricing.input_cache_read as string | undefined) ?? pricing.prompt;
 const writePrice = (pricing.input_cache_write as string | undefined) ?? pricing.prompt;
 const profile: DynamicProfile = {
  tag, providerName: provider, endpointName: name, tokenizer: arch.tokenizer, reported: [...new Set([model.id, slug])],
  pricing: { prompt: pricing.prompt, completion: pricing.completion, ...(pricing.input_cache_read !== undefined ? { input_cache_read: pricing.input_cache_read as string } : {}) },
  pricingKeys: Object.keys(pricing).filter(k => /^[a-z0-9_]+$/.test(k)).slice(0, 20), implicitCaching: endpoint.supports_implicit_caching,
  params: ALLOWED_PARAMS.filter(p => supported.includes(p)),
  maxPrice: { prompt: perMillion(pricing.prompt), completion: perMillion(pricing.completion) },
  nano2: { prompt: nano(pricing.prompt), cached: nano(cachedPrice), write: nano(writePrice), completion: nano(pricing.completion) },
  reasoning: supported.includes('reasoning') ? { enabled: false } : {}, exactTag: true,
  tokenParam: supported.includes('max_tokens') ? 'max_tokens' : 'max_completion_tokens', privacy: zdr ? 'zdr' : 'logged',
  ...(discount > 0 ? { discount } : {}),
 };
 const ctx = typeof endpoint.context_length === 'number' ? endpoint.context_length : model.context_length;
 return { tier: free ? 'free' : 'paid', profile, contextWindow: int(ctx, 1000, 1e7) ? ctx : null };
}

// ---- Request bodies (strict: exactly the listed keys) ----
const keysOf = (v: Record<string, unknown>) => Object.keys(v).sort().join();
const label = (v: unknown): v is string => typeof v === 'string' && v.trim().length >= 2 && v.length <= 60;
const version = (v: unknown): v is number => int(v, 1, 1e9);

export function parseModelAdd(v: unknown): { id: string; tag: string; label: string } | null {
 if (!record(v) || keysOf(v) !== 'id,label,tag' || typeof v.id !== 'string' || !MODEL_ID.test(v.id) || v.id.length > 120 || typeof v.tag !== 'string' || !TAG.test(v.tag) || !label(v.label)) return null;
 return { id: v.id, tag: v.tag, label: v.label.trim() };
}

export type ModelPatch =
 | { action: 'set'; id: string; enabled: boolean; members: boolean; poolOrder: number | null; expectedVersion: number }
 | { action: 'rename'; id: string; label: string; note: string | null; expectedVersion: number }
 | { action: 'remove'; id: string; expectedVersion: number };
export function parseModelPatch(v: unknown): ModelPatch | null {
 if (!record(v) || typeof v.id !== 'string' || !MODEL_ID.test(v.id) || v.id.length > 120 || !version(v.expectedVersion)) return null;
 if (v.action === 'set' && keysOf(v) === 'action,enabled,expectedVersion,id,members,poolOrder' && typeof v.enabled === 'boolean' && typeof v.members === 'boolean' && (v.poolOrder === null || int(v.poolOrder, 1, 50)))
  return { action: 'set', id: v.id, enabled: v.enabled, members: v.members, poolOrder: v.poolOrder as number | null, expectedVersion: v.expectedVersion };
 if (v.action === 'rename' && keysOf(v) === 'action,expectedVersion,id,label,note' && label(v.label) && (v.note === null || (typeof v.note === 'string' && v.note.length <= 300)))
  return { action: 'rename', id: v.id, label: v.label.trim(), note: v.note as string | null, expectedVersion: v.expectedVersion };
 if (v.action === 'remove' && keysOf(v) === 'action,expectedVersion,id') return { action: 'remove', id: v.id, expectedVersion: v.expectedVersion };
 return null;
}

export const parseModelTest = (v: unknown): { id: string } | null =>
 record(v) && keysOf(v) === 'id' && typeof v.id === 'string' && MODEL_ID.test(v.id) && v.id.length <= 120 ? { id: v.id } : null;
