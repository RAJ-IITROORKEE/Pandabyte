import { createInsforgeAdapters } from './insforge-adapters.ts';
import type { Adapters, CanonicalChunk } from './contracts.ts';

type Client = { database: { rpc: (name: string, params?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> } };
type Config = { configHash: string; evidenceSha256: string };
const hex = (value: string) => /^[a-f0-9]{64}$/.test(value);
export function validEmbedding(value: unknown): value is number[] {
    return Array.isArray(value) && value.length === 1024 && value.every(x => typeof x === 'number' && Number.isFinite(x)) && value.some(x => x !== 0);
}
export function createHybridInsforgeAdapters(client: Client, select: Adapters['select'], embed: (text: string) => Promise<number[]>, config: Config, activity?: (stage: 'searching_sources') => void): Adapters {
    if (!hex(config.configHash) || !hex(config.evidenceSha256)) throw new Error('Invalid hybrid configuration');
    const base = createInsforgeAdapters(client, select);
    let current = new Map<string, CanonicalChunk>(), productId: string | null = null;
    return {
        ...base,
        ranking: { mode: 'rrf', admission: 'engineering_experiment', evidenceSha256: config.evidenceSha256 },
        currentScope: async (actor, product, revision) => {
            current = new Map(); productId = null;
            const scope = await base.currentScope(actor, product, revision);
            if (scope) { current = new Map(scope.chunks.map(chunk => [chunk.handle, chunk])); productId = product.id; }
            return scope;
        },
        dense: async (question, handles) => {
            if (!productId || !Array.isArray(handles) || handles.length > 100 || new Set(handles).size !== handles.length || handles.some(h => !current.has(h) || current.get(h)!.blocked)) throw new Error('Invalid dense scope');
            if (!handles.length) return [];
            activity?.('searching_sources');
            const query = await embed(question);
            if (!validEmbedding(query)) throw new Error('Invalid query embedding');
            const { data, error } = await client.database.rpc('panda_agent_runtime_dense', { p_product: productId, p_config: config.configHash, p_query: query, p_handles: handles });
            const rows = (data as { items?: unknown })?.items;
            if (error || !Array.isArray(rows) || rows.length > Math.min(handles.length, 100)) throw new Error('Dense search unavailable');
            const allowed = new Set(handles), seen = new Set<string>();
            return rows.map((row: unknown) => {
                const hit = row as { handle?: unknown; text?: unknown; textHash?: unknown; score?: unknown };
                if (!hit || typeof hit.handle !== 'string' || !allowed.has(hit.handle) || seen.has(hit.handle)) throw new Error('Invalid dense hit');
                const canonical = current.get(hit.handle)!;
                if (hit.text !== canonical.text || hit.textHash !== canonical.textHash || typeof hit.score !== 'number' || !Number.isFinite(hit.score)) throw new Error('Invalid dense hit');
                seen.add(hit.handle);
                return { handle: hit.handle, text: canonical.text, textHash: canonical.textHash, header: canonical.header, score: hit.score };
            });
        },
    };
}
