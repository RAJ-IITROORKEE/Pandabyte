// A single database observation for one retrieval-only request. No network fallback or model dispatch.
const maxBytes = 4 * 1024 * 1024;
const uuid = (value: unknown): value is string => typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object'
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
function requireValid(condition: unknown): asserts condition {
    if (!condition) throw Error('Invalid retrieval snapshot');
}
function fields(value: unknown, names: string[]): value is Record<string, unknown> {
    return record(value) && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
}

// Accept only JSON data properties and retain a private, immutable copy. This also bounds nesting
// and rejects special keys before any snapshot object is used as a lookup table.
function copyJson(value: unknown, budget: {remaining: number}, depth = 0): unknown {
    requireValid(depth <= 8);
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value)) {
        requireValid(typeof value !== 'string' || value.length <= budget.remaining);
        budget.remaining -= Buffer.byteLength(JSON.stringify(value), 'utf8');
        requireValid(budget.remaining >= 0);
        return value;
    }
    const array = Array.isArray(value);
    requireValid(array || record(value));
    if (array) requireValid(Object.getPrototypeOf(value) === Array.prototype && value.length <= 285);
    const result: Record<string, unknown> | unknown[] = array ? [] : {};
    const keys = Object.keys(value);
    requireValid(keys.length <= 285 && (!array || keys.length === value.length));
    budget.remaining -= 2 + Math.max(0, keys.length - 1); // braces/brackets and commas
    requireValid(budget.remaining >= 0);
    for (const [index, key] of keys.entries()) {
        requireValid(array ? key === String(index) : !['__proto__', 'prototype', 'constructor'].includes(key));
        if (!array) {
            requireValid(key.length <= budget.remaining);
            budget.remaining -= Buffer.byteLength(JSON.stringify(key), 'utf8') + 1;
            requireValid(budget.remaining >= 0);
        }
        const property = Object.getOwnPropertyDescriptor(value, key);
        requireValid(property && Object.hasOwn(property, 'value'));
        Object.defineProperty(result, key, {value: copyJson(property.value, budget, depth + 1), enumerable: true});
    }
    return Object.freeze(result);
}

const productFields = ['id', 'sku', 'title', 'sourceUrl'];
const chunkFields = ['documentVersionId', 'logicalChunkId', 'chunkVersionId', 'text', 'textHash', 'generation', 'physicalRevision', 'capturedAt', 'sectionPath'];
const candidateFields = ['configHash', 'manifestHash', 'membershipHash', 'memberCount', 'state', 'sealed'];

/** Hashes, engineering membership, blocked chunks and provenance still pass through createInsforgeAdapters. */
export function createSnapshotClient(value: unknown) {
    const snapshot = copyJson(value, {remaining: maxBytes});
    requireValid(fields(snapshot, ['subject', 'catalog', 'scopes']));
    requireValid(typeof snapshot.subject === 'string' && snapshot.subject.trim().length > 0 && snapshot.subject.length <= 512);
    requireValid(fields(snapshot.catalog, ['items']) && Array.isArray(snapshot.catalog.items) && snapshot.catalog.items.length <= 42);
    requireValid(record(snapshot.scopes) && Object.keys(snapshot.scopes).length <= 42);
    const {subject, catalog, scopes} = snapshot;
    const products = new Map<string, Record<string, unknown>>();
    const skus = new Set<string>();
    for (const product of snapshot.catalog.items) {
        requireValid(fields(product, [...productFields, 'approvedChunksCount']) && uuid(product.id)
            && typeof product.sku === 'string' && product.sku.trim() && typeof product.title === 'string' && typeof product.sourceUrl === 'string'
            && typeof product.approvedChunksCount === 'number' && Number.isSafeInteger(product.approvedChunksCount)
            && product.approvedChunksCount > 0 && product.approvedChunksCount <= 285);
        const sku = product.sku.toLowerCase();
        requireValid(!products.has(product.id) && !skus.has(sku));
        products.set(product.id, product);
        skus.add(sku);
    }
    const seenChunks = new Set<string>();
    for (const [id, scope] of Object.entries(scopes)) {
        const product = products.get(id);
        requireValid(product && fields(scope, ['candidate', 'product', 'chunks']));
        const {candidate, product: source, chunks} = scope;
        requireValid(fields(candidate, candidateFields) && typeof candidate.configHash === 'string'
            && typeof candidate.manifestHash === 'string' && typeof candidate.membershipHash === 'string'
            && Number.isSafeInteger(candidate.memberCount) && typeof candidate.state === 'string' && typeof candidate.sealed === 'boolean'
            && fields(source, productFields)
            && productFields.every(key => source[key] === product[key]));
        requireValid(Array.isArray(chunks) && chunks.length === product.approvedChunksCount && seenChunks.size + chunks.length <= 285);
        for (const chunk of chunks) {
            requireValid(fields(chunk, chunkFields) && uuid(chunk.documentVersionId) && typeof chunk.logicalChunkId === 'string'
                && typeof chunk.chunkVersionId === 'string' && typeof chunk.textHash === 'string' && typeof chunk.text === 'string'
                && Number.isSafeInteger(chunk.generation) && (chunk.physicalRevision === null || typeof chunk.physicalRevision === 'string')
                && typeof chunk.capturedAt === 'string' && Array.isArray(chunk.sectionPath) && chunk.sectionPath.length <= 12
                && chunk.sectionPath.every((part: unknown) => typeof part === 'string'));
            const identity = chunk.documentVersionId + ':' + chunk.logicalChunkId;
            requireValid(!seenChunks.has(identity));
            seenChunks.add(identity);
        }
    }
    const database = Object.freeze({
        async rpc(name: string, params?: Record<string, unknown>) {
            if (name === 'panda_agent_runtime_products' && (params === undefined || fields(params, []))) return {data: catalog, error: null};
            if (name === 'panda_agent_runtime_scope' && fields(params, ['p_product'])
                && uuid(params.p_product) && Object.hasOwn(scopes, params.p_product)) return {data: scopes[params.p_product], error: null};
            return {data: null, error: 'Runtime projection unavailable'};
        },
    });
    return Object.freeze({subject, database});
}
