import 'server-only';
import { MODEL_ID } from './registry.ts';

// Cached read-only view of OpenRouter's public catalog for the Admin "Add model" dialog (no API key is sent).
const API = 'https://openrouter.ai/api/v1';
const TTL_MS = 5 * 60_000;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

async function get(path: string): Promise<unknown> {
 const hit = cache.get(path);
 if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
 const value = fetch(API + path, { redirect: 'error', cache: 'no-store', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) }).then(async r => {
  if (!r.ok) throw new Error('openrouter_' + r.status);
  const body: unknown = await r.json();
  if (!record(body) || !('data' in body)) throw new Error('openrouter_shape');
  return body.data;
 });
 if (cache.size >= 200) cache.delete(cache.keys().next().value as string);
 cache.set(path, { at: Date.now(), value });
 value.catch(() => { if (cache.get(path)?.value === value) cache.delete(path); });
 return value;
}

const list = async (path: string) => { const d = await get(path); return Array.isArray(d) ? d.filter(record) : []; };
const perMillion = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Number((n * 1e6).toFixed(6)) : null; };

/** zdr tags per model id (only endpoints that do not retain prompts for safety review). */
async function zdrByModel(): Promise<Map<string, string[]>> {
 const out = new Map<string, string[]>();
 for (const e of await list('/endpoints/zdr')) {
  if (typeof e.model_id !== 'string' || typeof e.tag !== 'string' || e.safety_retention !== false) continue;
  out.set(e.model_id, [...(out.get(e.model_id) ?? []), e.tag]);
 }
 return out;
}

export type CatalogModel = { id: string; name: string; context: number | null; promptPerM: number | null; completionPerM: number | null; tools: boolean; free: boolean; zdrEndpoints: number };
export type CatalogEndpoint = { tag: string; provider: string; promptPerM: number | null; completionPerM: number | null; context: number | null; zdr: boolean; tools: boolean };

export async function searchCatalog(q: string, filter: 'all' | 'free' | 'paid'): Promise<CatalogModel[]> {
 const [models, zdr] = await Promise.all([list('/models'), zdrByModel()]);
 const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
 const out: CatalogModel[] = [];
 for (const m of models) {
  if (typeof m.id !== 'string' || !MODEL_ID.test(m.id) || m.id.length > 120) continue;
  const name = typeof m.name === 'string' ? m.name.slice(0, 120) : m.id;
  const id = m.id; const hay = `${id} ${name}`.toLowerCase();
  if (words.some(w => !hay.includes(w))) continue;
  const pricing = record(m.pricing) ? m.pricing : {};
  const free = Number(pricing.prompt) === 0 && Number(pricing.completion) === 0;
  if ((filter === 'free' && !free) || (filter === 'paid' && free)) continue;
  const params = Array.isArray(m.supported_parameters) ? m.supported_parameters : [];
  out.push({ id, name, context: typeof m.context_length === 'number' ? m.context_length : null, promptPerM: perMillion(pricing.prompt), completionPerM: perMillion(pricing.completion),
   tools: params.includes('tools'), free, zdrEndpoints: zdr.get(id)?.length ?? 0 });
  if (out.length >= 40) break;
 }
 return out;
}

export async function endpointsFor(id: string): Promise<CatalogEndpoint[]> {
 const { endpoints, zdrTags } = await rawEndpoints(id);
 return endpoints.flatMap(e => {
  if (typeof e.tag !== 'string') return [];
  const pricing = record(e.pricing) ? e.pricing : {};
  const params = Array.isArray(e.supported_parameters) ? e.supported_parameters : [];
  return [{ tag: e.tag, provider: typeof e.provider_name === 'string' ? e.provider_name : e.tag, promptPerM: perMillion(pricing.prompt), completionPerM: perMillion(pricing.completion),
   context: typeof e.context_length === 'number' ? e.context_length : null, zdr: zdrTags.includes(e.tag), tools: params.includes('tools') }];
 });
}

async function rawEndpoints(id: string) {
 if (!MODEL_ID.test(id) || id.length > 120) throw new Error('invalid_model');
 const [detail, zdr] = await Promise.all([get(`/models/${id.split('/').map(encodeURIComponent).join('/')}/endpoints`), zdrByModel()]);
 const endpoints = record(detail) && Array.isArray(detail.endpoints) ? detail.endpoints.filter(record) : [];
 return { endpoints, zdrTags: zdr.get(id) ?? [], model: record(detail) ? detail : null };
}

/** Everything profileFromEndpoint needs for one model + endpoint tag, from the live catalog. Null when the model or tag is unknown. */
export async function catalogEntryFor(id: string, tag: string) {
 const [models, { endpoints, zdrTags }] = await Promise.all([list('/models'), rawEndpoints(id)]);
 const model = models.find(m => m.id === id);
 const endpoint = endpoints.find(e => e.tag === tag);
 return model && endpoint ? { model, endpoint, zdrTags } : null;
}
