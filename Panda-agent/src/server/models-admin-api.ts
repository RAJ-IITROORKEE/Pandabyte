import 'server-only';
import { authenticateLightweight, currentLightweightSession } from './lightweight-connection';
import { strictJson } from '../lightweight/client';
import { MODEL_ID, parseModelAdd, parseModelPatch, parseModelRows, parseModelTest, profileFromEndpoint, type ModelRow } from '../models/registry.ts';
import { catalogEntryFor, endpointsFor, searchCatalog } from '../models/openrouter-catalog.ts';
import { probeModel, probeProfileFor } from '../models/probe.ts';
import { profiles } from './hosted-model-openrouter.ts';
import { cachedOpenRouterKey } from '../models/openrouter-key.ts';
import type { HostedDirectModelId } from '../hosted-model.ts';

// Admin API for the model registry (migration 20261114120000). Admin proof: panda_agent_models_admin and the write RPCs are Admin-only in the
// database; the catalog and test routes prove Admin with the existing Admin-only panda_agent_mcp_servers_admin RPC.
const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
const errorCodes = { forbidden: 403, not_found: 404, conflict: 409, invalid: 400, unauthenticated: 401 } as Record<string, number>;
class Refused extends Error { constructor(readonly status: number, readonly code: string, readonly detail?: string) { super(code); } }

async function readBody(request: Request, url: URL): Promise<unknown> {
 if (request.headers.get('origin') !== url.origin) throw new Refused(403, 'forbidden');
 if (!/^application\/json(?:\s*;[^;]+)*\s*$/i.test(request.headers.get('content-type') ?? '') || !request.body) throw new Refused(415, 'invalid');
 const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
 try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 4096) { await reader.cancel(); throw new Refused(413, 'invalid'); } chunks.push(value); } } finally { reader.releaseLock(); }
 try { return strictJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); } catch { throw new Refused(400, 'invalid'); }
}

type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<unknown>;
async function run(request: Request, methods: string[], work: (ctx: { url: URL; rpc: Rpc }) => Promise<unknown>) {
 try {
  if (!methods.includes(request.method)) return json({ error: 'invalid' }, 405);
  const actor = await authenticateLightweight(); if (!actor?.sessionId) return json({ error: 'unauthenticated' }, 401);
  if (!await currentLightweightSession(actor.subject, actor.sessionId)) return json({ error: 'unauthenticated' }, 401);
  const rpc: Rpc = async (fn, args = {}) => {
   const { data, error } = await actor.client.database.rpc(fn, args);
   if (error) { const d = (error as { details?: string }).details ?? ''; throw new Refused(errorCodes[d] ?? 503, d in errorCodes ? d : 'unavailable'); }
   return data;
  };
  const result = await work({ url: new URL(request.url), rpc });
  if (!await currentLightweightSession(actor.subject, actor.sessionId)) return json({ error: 'unauthenticated' }, 401);
  return json(result);
 } catch (e) {
  if (e instanceof Refused) return json(e.detail ? { error: e.code, message: e.detail } : { error: e.code }, e.status);
  return json({ error: 'unavailable' }, 503);
 }
}

const adminRows = async (rpc: Rpc) => parseModelRows(await rpc('panda_agent_models_admin'));
const proveAdmin = (rpc: Rpc) => rpc('panda_agent_mcp_servers_admin');
const one = (data: unknown): ModelRow => { const row = parseModelRows([data])[0]; if (!row) throw new Refused(503, 'unavailable'); return row; };

const perM = (price: string) => Number((Number(price) * 1e6).toFixed(6));
/** What the table shows per row; built-in rows read their reviewed code profile (the database holds none). */
export type ModelView = { tag: string; privacy: 'zdr' | 'logged'; promptPerM: number; completionPerM: number };
export type ModelRowView = ModelRow & { view: ModelView | null };
function viewOf(row: ModelRow): ModelView | null {
 const p = row.builtin ? profiles[row.id as HostedDirectModelId] : row.profile;
 return p ? { tag: p.tag, privacy: row.builtin ? 'zdr' : (p as { privacy: 'zdr' | 'logged' }).privacy, promptPerM: perM(p.pricing.prompt), completionPerM: perM(p.pricing.completion) } : null;
}

export const modelsGET = (request: Request) => run(request, ['GET'], async ({ url, rpc }) => {
 if (url.search) throw new Refused(400, 'invalid');
 const models = (await adminRows(rpc)).map((r): ModelRowView => ({ ...r, view: viewOf(r) })), key = process.env.OPENROUTER_API_KEY?.trim();
 // Read only after the Admin-only registry read succeeded; a failed read shows "unavailable", never blocks the page.
 return { models, openrouterConfigured: !!key, openrouterKey: key ? await cachedOpenRouterKey(key).catch(() => null) : null };
});

export const modelsPOST = (request: Request) => run(request, ['POST'], async ({ url, rpc }) => {
 if (url.search) throw new Refused(400, 'invalid');
 const body = parseModelAdd(await readBody(request, url)); if (!body) throw new Refused(400, 'invalid');
 await proveAdmin(rpc);
 // The profile is built here from the live catalog; nothing about it comes from the client.
 let entry; try { entry = await catalogEntryFor(body.id, body.tag); } catch { throw new Refused(503, 'unavailable', 'OpenRouter catalog could not be read right now.'); }
 if (!entry) throw new Refused(404, 'not_found', 'That model or endpoint is not in the OpenRouter catalog.');
 const built = profileFromEndpoint(entry.model, entry.endpoint, entry.zdrTags);
 if ('error' in built) throw new Refused(400, 'invalid', built.error);
 return { model: one(await rpc('panda_agent_model_save', { p_id: body.id, p_label: body.label, p_tier: built.tier, p_profile: built.profile, p_context: built.contextWindow, p_note: null, p_expected: 0 })) };
});

export const modelsPATCH = (request: Request) => run(request, ['PATCH'], async ({ url, rpc }) => {
 if (url.search) throw new Refused(400, 'invalid');
 const p = parseModelPatch(await readBody(request, url)); if (!p) throw new Refused(400, 'invalid');
 if (p.action === 'set') return { model: one(await rpc('panda_agent_model_set', { p_id: p.id, p_enabled: p.enabled, p_members: p.members, p_pool_order: p.poolOrder, p_expected: p.expectedVersion })) };
 if (p.action === 'remove') return await rpc('panda_agent_model_remove', { p_id: p.id, p_expected: p.expectedVersion });
 const row = (await adminRows(rpc)).find(r => r.id === p.id);
 if (!row) throw new Refused(404, 'not_found');
 return { model: one(await rpc('panda_agent_model_save', { p_id: p.id, p_label: p.label, p_tier: row.tier, p_profile: row.profile ?? {}, p_context: row.contextWindow, p_note: p.note, p_expected: p.expectedVersion })) };
});

export const openrouterGET = (request: Request) => run(request, ['GET'], async ({ url, rpc }) => {
 await proveAdmin(rpc);
 const params = [...url.searchParams.keys()];
 try {
  if (params.length === 1 && params[0] === 'id') {
   const id = url.searchParams.get('id') ?? '';
   if (!MODEL_ID.test(id) || id.length > 120) throw new Refused(400, 'invalid');
   return { endpoints: await endpointsFor(id) };
  }
  if (params.some(k => k !== 'q' && k !== 'filter') || params.length > 2) throw new Refused(400, 'invalid');
  const q = (url.searchParams.get('q') ?? '').trim(); const filter = url.searchParams.get('filter') ?? 'all';
  if (q.length > 80 || (filter !== 'all' && filter !== 'free' && filter !== 'paid')) throw new Refused(400, 'invalid');
  return { models: await searchCatalog(q, filter) };
 } catch (e) {
  if (e instanceof Refused) throw e;
  throw new Refused(503, 'unavailable', 'OpenRouter catalog could not be read right now.');
 }
});

let testing = false; // shortcut: one test at a time per server instance; use a shared lock if the app runs many instances.
export const testPOST = (request: Request) => run(request, ['POST'], async ({ url, rpc }) => {
 if (url.search) throw new Refused(400, 'invalid');
 const body = parseModelTest(await readBody(request, url)); if (!body) throw new Refused(400, 'invalid');
 await proveAdmin(rpc);
 const key = process.env.OPENROUTER_API_KEY?.trim();
 if (!key) throw new Refused(503, 'unavailable', 'No OpenRouter key is configured on the server.');
 const row = (await adminRows(rpc)).find(r => r.id === body.id);
 const profile = row && probeProfileFor(row);
 if (!row || !profile) throw new Refused(404, 'not_found');
 if (testing) throw new Refused(429, 'busy', 'Another test is running. Try again in a moment.');
 testing = true;
 try { return { test: await probeModel(profile, row.id, key) }; } finally { testing = false; }
});
