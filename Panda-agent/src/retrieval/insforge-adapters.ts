import { createHash } from 'node:crypto';
import type { Adapters, CanonicalChunk, Product, Question } from './contracts.ts';
import { BLOCKED_LOGICAL_IDS, ENGINEERING_CONFIG, ENGINEERING_MANIFEST, PRODUCT_MEMBERSHIP } from './engineering-proof.ts';

// The caller must construct this client from the active Clerk session, once per request.
type Client = { database: { rpc: (name: string, params?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> } };
type ProductRow = { id: string; sku: string; title: string; sourceUrl: string; approvedChunksCount: number };
type ChunkRow = { documentVersionId: string; logicalChunkId: string; chunkVersionId: string; text: string; textHash: string; generation: number; physicalRevision: string | null; capturedAt: string; sectionPath: string[] };
type ScopeRow = { candidate: { configHash: string; manifestHash: string; membershipHash: string; memberCount: number; state: string; sealed: boolean }; product: ProductRow; chunks: ChunkRow[] };
export type RuntimeProduct = { sku: string; title: string };
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const hex = (s: unknown) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const uuid = (s: unknown) => typeof s === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s);
const nonempty = (s: unknown, n: number): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= n;
const sourceUrl = (s: unknown) => typeof s === 'string' && /^https:\/\/(?:www\.)?pandabyte\.in\/product-page\/[a-zA-Z0-9_-]+\/?$/.test(s);
const productValid = (p: ProductRow) => !!p && uuid(p.id) && !!PRODUCT_MEMBERSHIP[sha(p.id)] && nonempty(p.sku, 128) && nonempty(p.title, 300) && sourceUrl(p.sourceUrl);
async function rpc(client: Client, name: string, params?: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.database.rpc(name, params);
    if (error || !data) throw new Error('Runtime projection unavailable');
    return data;
}
async function products(client: Client): Promise<ProductRow[]> {
    const data = await rpc(client, 'panda_agent_runtime_products') as { items?: ProductRow[] };
    if (!Array.isArray(data.items) || data.items.length > 42 || data.items.some(p => !productValid(p)) || new Set(data.items.map(p => p.id)).size !== data.items.length || new Set(data.items.map(p => p.sku.toLowerCase())).size !== data.items.length) throw new Error('Invalid product projection');
    return data.items;
}
export async function listRuntimeProducts(client: Client): Promise<RuntimeProduct[]> {
    return (await products(client)).map(({ sku, title }) => ({ sku, title })).sort((a, b) => a.title.localeCompare(b.title, 'en'));
}
function identity(rows: ProductRow[], input: Question) {
    const selected = input.productSku ? rows.find(p => p.sku.toLowerCase() === input.productSku!.toLowerCase()) : undefined;
    if (input.productSku && !selected) return { kind: 'clarification' as const };
    const q = input.question.toLowerCase();
    const contains = (s: string) => {
        const needle = s.toLowerCase();
        let at = q.indexOf(needle);
        while (at >= 0) {
            if ((at === 0 || !/[a-z0-9]/.test(q[at - 1])) && (at + needle.length === q.length || !/[a-z0-9]/.test(q[at + needle.length]))) return true;
            at = q.indexOf(needle, at + 1);
        }
        return false;
    };
    // Short model aliases come only from unambiguous title tokens in the current projection.
    const aliases = new Map<string, ProductRow[]>();
    for (const p of rows) for (const token of new Set(p.title.match(/\bx[a-z0-9]{2,}\b/gi) ?? [])) {
        const key = token.toLowerCase();
        aliases.set(key, [...(aliases.get(key) ?? []), p]);
    }
    const named = rows.filter(p => contains(p.sku) || contains(p.title) || [...aliases].some(([alias, owners]) => owners.length === 1 && owners[0].id === p.id && contains(alias)));
    if (named.length > 1 || (selected && named.some(p => p.id !== selected.id))) return { kind: 'conflict' as const };
    const resolved = selected ?? named[0];
    return resolved ? { kind: 'resolved' as const, product: { id: resolved.id, sku: resolved.sku } } : { kind: 'clarification' as const };
}
function validateScope(data: ScopeRow, product: Product): CanonicalChunk[] | null {
    const c = data?.candidate, p = data?.product, rows = data?.chunks;
    if (!c || c.configHash !== ENGINEERING_CONFIG || c.manifestHash !== ENGINEERING_MANIFEST || c.membershipHash !== ENGINEERING_MANIFEST || c.memberCount !== 284 || c.state !== 'candidate' || c.sealed !== true || !productValid(p) || p.id !== product.id || p.sku !== product.sku || !Array.isArray(rows)) return null;
    const proof = PRODUCT_MEMBERSHIP[sha(p.id)];
    if (!proof || rows.length !== proof.count) return null;
    const lines: string[] = [], chunks: CanonicalChunk[] = [];
    for (const x of rows) {
        if (!x || !uuid(x.documentVersionId) || !hex(x.logicalChunkId) || !hex(x.chunkVersionId) || !hex(x.textHash) || !nonempty(x.text, 12000) || sha(x.text) !== x.textHash || !Number.isSafeInteger(x.generation) || x.generation < 1 || (x.physicalRevision !== null && !nonempty(x.physicalRevision, 128)) || !nonempty(x.capturedAt, 50) || !Number.isFinite(Date.parse(x.capturedAt)) || !Array.isArray(x.sectionPath) || x.sectionPath.length > 12 || x.sectionPath.some(s => !nonempty(s, 200))) return null;
        lines.push([x.documentVersionId, x.logicalChunkId, x.chunkVersionId, x.textHash, String(x.generation), sha(p.sourceUrl), sha(JSON.stringify(x.sectionPath))].join(':'));
        const handle = `panda:${x.documentVersionId}:${x.logicalChunkId}:${x.chunkVersionId}`;
        chunks.push({ handle, productId: p.id, text: x.text, textHash: x.textHash, header: `lexical canonical source: ${handle}`, physicalRevision: x.physicalRevision, blocked: BLOCKED_LOGICAL_IDS.has(x.logicalChunkId), title: p.title, sourceUrl: p.sourceUrl, capturedAt: x.capturedAt, sectionPath: x.sectionPath });
    }
    if (new Set(lines).size !== lines.length || sha(lines.sort().join('\n')) !== proof.digest) return null;
    return chunks;
}
const tokens = (s: string) => [...new Set((s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(t => t.length > 2 && !new Set(['the', 'and', 'for', 'with', 'what', 'does', 'this', 'that', 'how', 'are', 'can', 'its', 'which', 'about', 'tell', 'does', 'have']).has(t)))];
export function createInsforgeAdapters(client: Client, select: Adapters['select']): Adapters {
    let current = new Map<string, CanonicalChunk>();
    return {
        ranking: { mode: 'lexical' },
        resolveIdentity: async (_actor, input) => identity(await products(client), input),
        currentScope: async (_actor, product, revision) => {
            const data = await rpc(client, 'panda_agent_runtime_scope', { p_product: product.id }) as ScopeRow;
            const chunks = validateScope(data, product);
            if (!chunks) return null;
            current = new Map(chunks.map(c => [c.handle, c]));
            const fingerprint = sha(JSON.stringify({ candidate: data.candidate, product: data.product, chunks, revision: revision ?? null }));
            return { fingerprint, candidate: true, sealed: true, engineeringVerified: true, manifestVerified: true, configVerified: true, generationCurrent: true, chunks };
        },
        lexical: async (question, eligible) => {
            const terms = tokens(question);
            return eligible.map(handle => {
                const chunk = current.get(handle);
                const text = chunk?.text.toLowerCase() ?? '';
                return { handle, score: terms.filter(t => new RegExp(`\\b${t}\\b`).test(text)).length };
            }).filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.handle.localeCompare(b.handle, 'en')).slice(0, 100).map(x => x.handle);
        },
        dense: async () => { throw new Error('Native scoped search unavailable'); },
        select,
    };
}

// Safe local engineering status: never return internal handles or source-storage metadata.
export async function inspectRuntimeScope(client: Client, sku: string): Promise<{ sku: string; title: string; eligibleChunks: number } | null> {
    const product = (await products(client)).find(p => p.sku.toLowerCase() === sku.toLowerCase());
    if (!product) return null;
    const data = await rpc(client, 'panda_agent_runtime_scope', { p_product: product.id }) as ScopeRow;
    const chunks = validateScope(data, product);
    if (!chunks) return null;
    return { sku: product.sku, title: product.title, eligibleChunks: chunks.filter(c => !c.blocked).length };
}

// This projection is intended only for a separately authorized admin inspection route.
export async function getRuntimeProductEvidence(client: Client, sku: string): Promise<{ sku: string; title: string; sourceUrl: string; retrievalMethod: 'lexical'; candidateState: 'sealed_inactive'; eligibleChunks: number; excludedChunks: number; chunks: Array<{ sectionPath: string[]; text: string; physicalRevision: string | null; capturedAt: string }> } | null> {
    const product = (await products(client)).find(p => p.sku.toLowerCase() === sku.toLowerCase());
    if (!product) return null;
    const data = await rpc(client, 'panda_agent_runtime_scope', { p_product: product.id }) as ScopeRow;
    const all = validateScope(data, product);
    if (!all || all.length > 64) return null;
    const safe = (s: string) => !/(?:s3:\/\/|["']?(?:private[_ -]?(?:bucket|key)|bucket|object[_ -]?key|storage[_ -]?(?:path|key))["']?\s*[:=]|file:\/\/|\\\\)/i.test(s);
    if (!safe(product.title) || all.some(c => !safe(c.text) || c.sectionPath.some(s => !safe(s)))) return null;
    const chunks = all.filter(c => !c.blocked).map(({ sectionPath, text, physicalRevision, capturedAt }) => ({ sectionPath, text, physicalRevision, capturedAt }));
    return { sku: product.sku, title: product.title, sourceUrl: product.sourceUrl, retrievalMethod: 'lexical', candidateState: 'sealed_inactive', eligibleChunks: chunks.length, excludedChunks: all.length - chunks.length, chunks };
}
