// Which models one chat turn may use (model registry, migration 20261114120000).
import type { ChatActor } from '../server/chat-contracts.ts';
import type { PoolEntry } from '../agent-loop/chat.ts';
import type { Profile } from '../server/hosted-model-openrouter.ts';
import { freePoolModel, hostedContextWindows, hostedDirectModelIds, type HostedDirectModelId } from '../hosted-model.ts';
import { MODEL_ID, parseModelRows, type ModelRow } from './registry.ts';

/** A choice the chat may send besides the built-ins: the free pool or an Admin-added model id. */
export const isTurnModelId = (id: string) => id === freePoolModel.id || (MODEL_ID.test(id) && id.length <= 120);

const entry = (r: ModelRow): PoolEntry => ({ id: r.id, contextWindow: r.contextWindow ?? hostedContextWindows[r.id] ?? null, tier: r.tier,
  ...(r.profile ? { profile: { ...r.profile, id: r.id as HostedDirectModelId } as Profile } : {}) });

/** The ordered models for a request from the rows this user may use (enabled and visible). Built-ins have no profile; added
 *  models must carry one. The free pool is every enabled free model in pool order (unordered ones last). */
export function poolFor(requested: string, rows: readonly ModelRow[]): PoolEntry[] {
  if (requested === freePoolModel.id) return rows.filter(r => r.enabled && r.tier === 'free' && !r.builtin && r.profile)
    .sort((a, b) => (a.poolOrder ?? 99) - (b.poolOrder ?? 99) || a.id.localeCompare(b.id)).map(entry);
  const row = rows.find(r => r.id === requested && r.enabled && (r.builtin ? hostedDirectModelIds.includes(r.id) : !!r.profile));
  return row ? [entry(row)] : [];
}

/** Reads the catalog with the user's session. If the registry cannot be read, a built-in still runs (as before the registry). */
export async function turnModels(actor: ChatActor, requested: string): Promise<PoolEntry[]> {
  try {
    const { data, error } = await actor.client.database.rpc('panda_agent_models_catalog');
    if (error) throw new Error('catalog unavailable');
    return poolFor(requested, parseModelRows(data));
  } catch { return hostedDirectModelIds.includes(requested) ? [{ id: requested, contextWindow: hostedContextWindows[requested] ?? null, tier: 'paid' }] : []; }
}

/** Adds one finished turn to the per-model usage rows (best effort; never blocks or fails a turn). */
export async function recordModelUsage(actor: ChatActor, model: string, usage: { inputTokens: number; outputTokens: number; costNanoUsd: number }, failed: boolean, failover: boolean) {
  await actor.client.database.rpc('panda_agent_model_usage_record', { p_model: model, p_input: Math.min(600000, usage.inputTokens), p_output: Math.min(60000, usage.outputTokens),
    p_cost: Math.min(200000000, usage.costNanoUsd), p_failed: failed, p_failover: failover });
}
