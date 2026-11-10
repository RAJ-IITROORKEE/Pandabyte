import type { Actor, Adapters, CanonicalChunk, Product, Question } from './contracts.ts';
import type { ChatAnswer } from '../server/chat-contracts.ts';
import { parseQuestion, privatePointer, validChunk, validScope } from './answers.ts';

type ScopeReceipt = { productId: string; scopeHash: string };
type Retrieval = Pick<Adapters, 'resolveIdentity' | 'currentScope' | 'lexical'>;
export type PreparedEvidenceContext = {
    version: 1;
    coverage: 'single_product_only';
    sourceTrust: 'untrusted_listing_data_not_hardware_verification';
    question: string;
    identity: 'resolved' | 'clarification' | 'conflict';
    product: { sku: string; physicalRevision: string | null } | null;
    fragments: Array<Pick<CanonicalChunk, 'handle' | 'text' | 'title' | 'sourceUrl' | 'capturedAt' | 'sectionPath' | 'physicalRevision'>>;
};
export type PreparedEvidence = {
    scopes: readonly Readonly<ScopeReceipt>[];
    context(): Promise<PreparedEvidenceContext>;
    revalidate(): Promise<boolean>;
    finalize(output: unknown): Promise<ChatAnswer>;
};
export class PreparedEvidenceError extends Error {
    readonly code: 'invalid' | 'unauthenticated' | 'unavailable';
    constructor(code: PreparedEvidenceError['code'] = 'unavailable') { super(code); this.name = 'PreparedEvidenceError'; this.code = code; }
}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const bounded = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max && value.isWellFormed();
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const hex = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function requireValue(value: unknown, code: PreparedEvidenceError['code'] = 'unavailable'): asserts value { if (!value) throw new PreparedEvidenceError(code); }
function timestamp(value: unknown): value is string {
    if (!bounded(value, 50) || privatePointer(value) || !Number.isFinite(Date.parse(value))) return false;
    const match = /^([0-9]{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,9})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$/.exec(value);
    if (!match) return false;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return year > 0 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
function eligible(chunks: CanonicalChunk[], product: Product, input: Question) {
    const result = chunks.filter(chunk => validChunk(chunk, product.id, input.physicalRevision)
        && bounded(chunk.sourceUrl, 500) && bounded(chunk.text, 12000) && bounded(chunk.title, 300)
        && timestamp(chunk.capturedAt) && (chunk.physicalRevision === null || (bounded(chunk.physicalRevision, 128) && !privatePointer(chunk.physicalRevision)))
        && chunk.sectionPath.every(part => bounded(part, 200)));
    requireValue(new Set(result.map(chunk => chunk.handle)).size === result.length);
    return result;
}

// Construct only after application admission, using current actor-scoped adapters and the existing read-only scope RPC.
// This prepares data and checks literal membership; it never runs a selector, model or task workflow.
export async function prepareEvidenceContext(options: {
    actor: Actor;
    input: Question;
    adapters: Retrieval;
    current: () => Promise<boolean>;
    readScope: (product: Product) => Promise<ScopeReceipt>;
}): Promise<PreparedEvidence> {
    requireValue(object(options.actor) && bounded(options.actor.subject, 512), 'unauthenticated');
    const actor = Object.freeze({ subject: options.actor.subject });
    let parsed;
    try { parsed = parseQuestion(options.input); } catch { throw new PreparedEvidenceError('invalid'); }
    const input = parsed && Object.freeze(parsed);
    requireValue(input && bounded(input.question, 2000) && (input.productSku === undefined || bounded(input.productSku, 128)) && (input.physicalRevision === undefined || bounded(input.physicalRevision, 128)), 'invalid');
    const { adapters, current, readScope } = options;
    requireValue(adapters && ['resolveIdentity', 'currentScope', 'lexical'].every(key => typeof adapters[key as keyof Retrieval] === 'function') && typeof current === 'function' && typeof readScope === 'function');
    const access = async () => { requireValue(await current() === true, 'unauthenticated'); };
    try {
        await access();
        const resolved = await adapters.resolveIdentity(actor, input);
        requireValue(resolved && ['resolved', 'clarification', 'conflict'].includes(resolved.kind));
        let identity = resolved.kind;
        if (resolved.kind === 'resolved' && input.productSku && resolved.product?.sku.toLowerCase() !== input.productSku.toLowerCase()) identity = 'clarification';
        const product = resolved.kind === 'resolved' && identity === 'resolved' ? Object.freeze({ id: resolved.product?.id, sku: resolved.product?.sku }) : null;
        requireValue(product === null || (uuid(product.id) && bounded(product.sku, 128)));
        const context: PreparedEvidenceContext = { version: 1, coverage: 'single_product_only', sourceTrust: 'untrusted_listing_data_not_hardware_verification', question: input.question, identity, product: product ? { sku: product.sku, physicalRevision: input.physicalRevision ?? null } : null, fragments: [] };
        const scopes: ScopeReceipt[] = [];
        let fingerprint: string | undefined;
        const sent = new Map<string, CanonicalChunk>();
        const aliases = new Map<string, string>();
        const internal = product ? [product.id.toLowerCase()] : [];
        async function scopeReceipt() {
            requireValue(product);
            const value = await readScope(product);
            requireValue(value && value.productId === product.id && hex(value.scopeHash));
            return { productId: value.productId, scopeHash: value.scopeHash };
        }
        if (product) {
            scopes.push(await scopeReceipt());
            const scope = await adapters.currentScope(actor, product, input.physicalRevision);
            requireValue(validScope(scope));
            fingerprint = scope.fingerprint;
            const chunks = eligible(scope.chunks, product, input);
            internal.push(...chunks.map(chunk => chunk.handle.toLowerCase()));
            const byHandle = new Map(chunks.map(chunk => [chunk.handle, structuredClone(chunk)]));
            const ranked = await adapters.lexical(input.question, [...byHandle.keys()].sort());
            requireValue(Array.isArray(ranked) && ranked.length <= 100 && ranked.every(handle => byHandle.has(handle)));
            const bodies = new Set<string>();
            for (const handle of new Set(ranked)) {
                const chunk = byHandle.get(handle)!;
                if (bodies.has(chunk.text)) continue;
                const { text, title, sourceUrl, capturedAt, sectionPath, physicalRevision } = chunk;
                const alias = `E${context.fragments.length + 1}`;
                const fragment = { handle: alias, text, title, sourceUrl, capturedAt, sectionPath: [...sectionPath], physicalRevision };
                if (internal.some(identifier => JSON.stringify(fragment).toLowerCase().includes(identifier))) continue;
                context.fragments.push(fragment);
                // Bound the complete serialized context, including the question and citation metadata.
                if (JSON.stringify(context).length > 20000) { context.fragments.pop(); continue; }
                bodies.add(text);
                sent.set(handle, chunk);
                aliases.set(alias, handle);
                if (context.fragments.length === 8) break;
            }
        }
        requireValue(scopes.length <= 4 && JSON.stringify(context).length <= 20000);
        const initialIdentity = identity;
        const revalidate = async () => {
            try {
                await access();
                const latest = await adapters.resolveIdentity(actor, input);
                let latestKind = latest.kind;
                if (latest.kind === 'resolved' && input.productSku && latest.product?.sku.toLowerCase() !== input.productSku.toLowerCase()) latestKind = 'clarification';
                requireValue(latestKind === initialIdentity);
                if (product) {
                    requireValue(latest.kind === 'resolved' && latest.product.id === product.id && latest.product.sku === product.sku);
                    requireValue(JSON.stringify(await scopeReceipt()) === JSON.stringify(scopes[0]));
                    const scope = await adapters.currentScope(actor, product, input.physicalRevision);
                    requireValue(validScope(scope) && scope.fingerprint === fingerprint);
                    const byHandle = new Map(eligible(scope.chunks, product, input).map(chunk => [chunk.handle, chunk]));
                    requireValue([...sent].every(([handle, chunk]) => JSON.stringify(byHandle.get(handle)) === JSON.stringify(chunk)));
                }
                await access();
                return true;
            } catch { return false; }
        };
        requireValue(await revalidate());
        return {
            scopes: Object.freeze(scopes.map(value => Object.freeze({ ...value }))),
            async context() { requireValue(await revalidate()); return structuredClone(context); },
            revalidate,
            async finalize(output): Promise<ChatAnswer> {
                requireValue(object(output) && Object.keys(output).sort().join(',') === 'outcome,selections,text'
                    && ['evidence', 'conversation', 'clarification', 'insufficient', 'conflict'].includes(output.outcome as string)
                    && bounded(output.text, 8000) && !privatePointer(output.text) && Array.isArray(output.selections) && output.selections.length <= 4);
                const generatedText = output.text.toLowerCase();
                requireValue(!internal.some(identifier => generatedText.includes(identifier)));
                requireValue((output.outcome === 'evidence') === (output.selections.length > 0));
                requireValue(context.fragments.length > 0 || ['conversation', 'clarification', 'insufficient'].includes(output.outcome as string)
                    || (initialIdentity === 'conflict' && output.outcome === 'conflict'));
                const seen = new Set<string>();
                const citations = output.selections.map((value, index) => {
                    requireValue(object(value) && Object.keys(value).sort().join(',') === 'handle,quote' && typeof value.handle === 'string'
                        && /^E[1-8]$/.test(value.handle) && !seen.has(value.handle) && bounded(value.quote, 600) && !privatePointer(value.quote));
                    const canonical = aliases.get(value.handle);
                    const chunk = canonical === undefined ? undefined : sent.get(canonical);
                    requireValue(chunk && chunk.text.includes(value.quote));
                    seen.add(value.handle);
                    return { id: `S${index + 1}`, title: chunk.title, sourceUrl: chunk.sourceUrl, capturedAt: chunk.capturedAt, quote: value.quote, sectionPath: [...chunk.sectionPath] };
                });
                const references = [...output.text.matchAll(/\[S([0-9]+)\]/g)].map(match => `S${match[1]}`);
                requireValue(references.every(id => citations.some(citation => citation.id === id)));
                const answer: ChatAnswer = { outcome: output.outcome as ChatAnswer['outcome'], text: output.text, citations };
                requireValue(Buffer.byteLength(JSON.stringify(answer), 'utf8') <= 23000 && await revalidate());
                return answer;
            },
        };
    } catch (error) { throw error instanceof PreparedEvidenceError ? error : new PreparedEvidenceError(); }
}
