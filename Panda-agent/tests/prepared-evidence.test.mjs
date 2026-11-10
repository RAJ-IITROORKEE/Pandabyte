import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareEvidenceContext, PreparedEvidenceError } from '../src/retrieval/prepared-evidence.ts';
import { createInsforgeAdapters } from '../src/retrieval/insforge-adapters.ts';

const hash = value => createHash('sha256').update(value).digest('hex');
const product = { id: 'aaaaaaaa-1111-4111-8111-111111111111', sku: 'FIXTURE' };
const actor = { subject: 'fixture-owner' };
const question = { question: 'What does the fixture listing say?', productSku: 'FIXTURE' };
function chunk(index = 1, overrides = {}) {
    const text = `Fixture listing ${index} states 4 pins.`;
    return {
        handle: `panda:00000000-0000-0000-0000-${String(index).padStart(12, '0')}:${'a'.repeat(64)}:${'b'.repeat(64)}`,
        productId: product.id, text, textHash: hash(text), header: 'canonical header', physicalRevision: null, blocked: false,
        title: 'Fixture listing', sourceUrl: 'https://pandabyte.in/product-page/fixture', capturedAt: '2026-11-06T00:00:00Z', sectionPath: ['Specifications'], ...overrides,
    };
}
function fixture(overrides = {}) {
    const state = {
        current: true, identity: { kind: 'resolved', product: { ...product } }, scopeHash: 'c'.repeat(64),
        scope: { fingerprint: 'initial', candidate: true, sealed: true, engineeringVerified: true, manifestVerified: true, configVerified: true, generationCurrent: true, chunks: [chunk()] },
    };
    const calls = [];
    const adapters = {
        resolveIdentity: async () => { calls.push('identity'); return structuredClone(state.identity); },
        currentScope: async () => { calls.push('scope'); return state.scope === null ? null : structuredClone(state.scope); },
        lexical: async (_question, handles) => { calls.push(['lexical', handles]); return handles; },
        dense: async () => assert.fail('Native preparation must not introduce dense retrieval'),
        select: async () => assert.fail('Native preparation must not execute a selector'),
        ...overrides,
    };
    const options = { actor, input: { ...question }, adapters,
        current: async () => { calls.push('access'); return state.current; },
        readScope: async selected => { calls.push('receipt'); assert.deepEqual(selected, product); return { productId: product.id, scopeHash: state.scopeHash }; },
    };
    return { state, calls, options, prepare: () => prepareEvidenceContext(options) };
}
const unavailable = error => error instanceof PreparedEvidenceError && error.code === 'unavailable' && error.message === 'unavailable';
const output = (selections = [{ handle: 'E1', quote: '4 pins' }], fields = {}) => ({ outcome: selections.length ? 'evidence' : 'insufficient', text: selections.length ? 'The listing states 4 pins. [S1]' : 'The approved context does not establish that.', selections, ...fields });

test('preparation reuses actor-scoped lexical retrieval and returns detached bounded listing context', async () => {
    const current = fixture();
    const prepared = await current.prepare();
    assert.deepEqual(prepared.scopes, [{ productId: product.id, scopeHash: 'c'.repeat(64) }]);
    assert.equal(Object.isFrozen(prepared.scopes), true);
    const context = await prepared.context();
    assert.equal(context.coverage, 'single_product_only');
    assert.equal(context.sourceTrust, 'untrusted_listing_data_not_hardware_verification');
    assert.equal(context.identity, 'resolved');
    assert.deepEqual(context.product, { sku: product.sku, physicalRevision: null });
    assert.deepEqual(context.fragments[0], { handle: 'E1', text: chunk().text, title: chunk().title, sourceUrl: chunk().sourceUrl, capturedAt: chunk().capturedAt, sectionPath: chunk().sectionPath, physicalRevision: null });
    assert.equal(JSON.stringify(context).includes('fixture-owner'), false);
    assert.equal(JSON.stringify(context).includes('canonical header'), false);
    assert.equal(JSON.stringify(context).includes('scopeHash'), false);
    assert.equal(JSON.stringify(context).includes(product.id), false);
    assert.equal(JSON.stringify(context).includes('panda:'), false);
    assert.equal(current.calls.filter(item => item === 'scope').length, 3);
    assert.deepEqual(current.calls.find(Array.isArray), ['lexical', [chunk().handle]]);
});

test('unresolved and conflicting natural questions retain empty context and current-access checks', async () => {
    for (const kind of ['clarification', 'conflict']) {
        const current = fixture(); current.state.identity = { kind };
        current.options.input = { question: 'Hello, help me understand embedded development.' };
        const prepared = await current.prepare();
        assert.deepEqual(prepared.scopes, []);
        const context = await prepared.context();
        assert.equal(context.identity, kind); assert.equal(context.product, null); assert.deepEqual(context.fragments, []);
        for (const outcome of ['conversation', 'clarification', 'insufficient']) assert.deepEqual(await prepared.finalize(output([], { outcome, text: 'Fixture response' })), { outcome, text: 'Fixture response', citations: [] });
        await assert.rejects(prepared.finalize(output()), unavailable);
        if (kind === 'conflict') assert.equal((await prepared.finalize(output([], { outcome: 'conflict' }))).outcome, 'conflict');
        else await assert.rejects(prepared.finalize(output([], { outcome: 'conflict' })), unavailable);
        assert.equal(current.calls.includes('scope'), false);
        assert.equal(current.calls.some(Array.isArray), false);
        current.state.current = false;
        assert.equal(await prepared.revalidate(), false);
        await assert.rejects(prepared.context(), unavailable);
        await assert.rejects(prepared.finalize(output([], { outcome: 'conversation' })), unavailable);
    }
});

test('existing InsForge adapter can prepare honest empty context without a model or database service', async () => {
    const calls = [];
    const adapters = createInsforgeAdapters({ database: { rpc: async name => { calls.push(name); return { data: { items: [] }, error: null }; } } }, async () => assert.fail('No selector'));
    const prepared = await prepareEvidenceContext({ actor, input: { question: 'Hello' }, adapters, current: async () => true, readScope: async () => assert.fail('No resolved product') });
    assert.equal((await prepared.context()).identity, 'clarification');
    assert.deepEqual(calls, ['panda_agent_runtime_products', 'panda_agent_runtime_products', 'panda_agent_runtime_products']);
});

test('hardware questions prepare listing data without claiming applicability or using old proof-refusal routing', async () => {
    const current = fixture();
    current.options.input = { ...question, question: 'Which GPIO should I wire and is this hardware guaranteed safe?' };
    const context = await (await current.prepare()).context();
    assert.equal(context.fragments.length, 1);
    assert.equal(context.sourceTrust, 'untrusted_listing_data_not_hardware_verification');
    assert.equal(context.product.physicalRevision, null);
});

test('citation metadata comes only from sent canonical chunks and literal quotation membership', async () => {
    const prepared = await fixture().prepare();
    const result = await prepared.finalize(output());
    assert.deepEqual(result, { outcome: 'evidence', text: 'The listing states 4 pins. [S1]', citations: [{ id: 'S1', title: chunk().title, sourceUrl: chunk().sourceUrl, capturedAt: chunk().capturedAt, quote: '4 pins', sectionPath: chunk().sectionPath }] });
    for (const selection of [
        { handle: 'E2', quote: '4 pins' }, { handle: 'E1', quote: '5 pins' }, { handle: chunk().handle, quote: '4 pins' },
        { handle: 'E1', quote: '4 pins', sourceUrl: 'https://private.invalid/' },
        { handle: 'E1', quote: '4 pins', compiled: true }, { handle: 'E1', quote: 'x'.repeat(601) },
    ]) await assert.rejects(prepared.finalize(output([selection])), unavailable);
    await assert.rejects(prepared.finalize(output([{ handle: 'E1', quote: '4 pins' }, { handle: 'E1', quote: '4 pins' }])), unavailable);
    await assert.rejects(prepared.finalize(output(Array.from({ length: 5 }, () => ({ handle: 'E1', quote: '4 pins' })))), unavailable);
});

test('withdrawal while preparing stops evidence before it can become provider context', async () => {
    const current = fixture();
    current.options.adapters.lexical = async (_question, handles) => { current.state.scope = null; return handles; };
    await assert.rejects(current.prepare(), unavailable);
});

test('withdrawal after preparation blocks context dispatch and final release even with no selected citations', async () => {
    const current = fixture(), prepared = await current.prepare();
    assert.equal((await prepared.context()).fragments.length, 1);
    current.state.scope = null;
    assert.equal(await prepared.revalidate(), false);
    await assert.rejects(prepared.context(), unavailable);
    await assert.rejects(prepared.finalize(output()), unavailable);
    await assert.rejects(prepared.finalize(output([], { outcome: 'conversation' })), unavailable);
});

test('scope hash, generation, identity and any sent chunk change fence release', async () => {
    for (const mutate of [
        state => { state.scopeHash = 'd'.repeat(64); }, state => { state.scope.fingerprint = 'new-generation'; },
        state => { state.scope.generationCurrent = false; }, state => { state.identity.product.sku = 'OTHER'; },
        state => { state.identity.product.id = '22222222-2222-4222-8222-222222222222'; },
        state => { state.scope.chunks[0].title = 'Changed'; }, state => { state.scope.chunks[0].blocked = true; },
        state => { state.scope.chunks[0].text = 'Changed'; state.scope.chunks[0].textHash = hash('Changed'); },
    ]) {
        const current = fixture(), prepared = await current.prepare();
        mutate(current.state);
        await assert.rejects(prepared.finalize(output()), unavailable);
    }
    const current = fixture(); current.state.scope.chunks.push(chunk(2));
    const prepared = await current.prepare();
    current.state.scope.chunks[1].text = 'Changed unselected source'; current.state.scope.chunks[1].textHash = hash(current.state.scope.chunks[1].text);
    await assert.rejects(prepared.finalize(output()), unavailable);
});

test('caller edits to returned context, input or output cannot mutate captured source authority', async () => {
    const current = fixture(), prepared = await current.prepare();
    const context = await prepared.context();
    context.fragments[0].text = 'Forged 5 pins'; context.fragments[0].title = 'Forged title'; context.fragments[0].sectionPath.push('Forged');
    context.product.sku = 'Forged'; current.options.input.question = 'Forged question';
    assert.equal((await prepared.context()).fragments[0].text, chunk().text);
    await assert.rejects(prepared.finalize(output([{ handle: 'E1', quote: '5 pins' }])), unavailable);
    const first = await prepared.finalize(output()); first.citations[0].sectionPath.push('Forged');
    assert.deepEqual((await prepared.finalize(output())).citations[0].sectionPath, ['Specifications']);
});

test('complete provider context stays within 20000 serialized characters with whole-body deduplication and eight-hit limit', async () => {
    const current = fixture();
    current.state.scope.chunks = Array.from({ length: 10 }, (_, index) => { const text = index < 2 ? '界'.repeat(11000) : `distinct-${index}-` + 'x'.repeat(5000); return chunk(index + 1, { text, textHash: hash(text) }); });
    const context = await (await current.prepare()).context();
    assert.equal(JSON.stringify(context).length <= 20000, true);
    assert.equal(context.fragments.length <= 8, true);
    assert.equal(new Set(context.fragments.map(fragment => fragment.text)).size, context.fragments.length);
    assert.deepEqual(context.fragments.map(fragment => fragment.handle), context.fragments.map((_, index) => `E${index + 1}`));
    for (const fragment of context.fragments) assert.equal(current.state.scope.chunks.some(candidate => candidate.text === fragment.text), true);
});

test('native context fills eight distinct passages despite duplicate early hits', async () => {
    const current = fixture();
    const texts = ['first', 'first', ...Array.from({ length: 8 }, (_, i) => 'passage ' + i)];
    current.state.scope.chunks = texts.map((text, i) => chunk(i + 1, { text, textHash: hash(text) }));
    const prepared = await current.prepare();
    const context = await prepared.context();
    assert.deepEqual(context.fragments.map(f => f.text), ['first', ...texts.slice(2, 9)]);
    assert.equal(context.fragments.at(-1).handle, 'E8');
    current.state.scope.chunks.splice(8, 1);
    assert.equal(await prepared.revalidate(), false);
});

test('blocked, forged, private, mismatched-revision and unrated chunks cannot enter context', async () => {
    for (const override of [{ blocked: true }, { sourceUrl: 'https://private.invalid/' }, { textHash: 'x' }, { title: 'bucket: private' }, { physicalRevision: 'B' }]) {
        const current = fixture(); current.state.scope.chunks = [chunk(1, override)];
        current.options.input = { ...question, physicalRevision: 'A' };
        const prepared = await current.prepare();
        assert.deepEqual((await prepared.context()).fragments, []);
        await assert.rejects(prepared.finalize(output()), unavailable);
    }
    const foreign = fixture({ lexical: async () => [chunk(99).handle] });
    await assert.rejects(foreign.prepare(), unavailable);
    const duplicate = fixture(); duplicate.state.scope.chunks.push(chunk());
    await assert.rejects(duplicate.prepare(), unavailable);
});

test('strict output schema rejects forged references, provider metadata, private pointers and malformed text', async () => {
    const prepared = await fixture().prepare();
    for (const value of [null, [], { ...output(), rawReasoning: 'PRIVATE' }, { ...output(), citations: [] },
        output([], { outcome: 'evidence' }), output(undefined, { outcome: 'conversation' }),
        output(undefined, { text: 'Unsupported [S9]' }), output([], { text: 'Unsupported [S1]' }),
        output(undefined, { text: product.id }), output(undefined, { text: product.id.toUpperCase() }),
        output(undefined, { text: chunk().handle }), output(undefined, { text: chunk().handle.toUpperCase() }),
        output(undefined, { text: 'bucket: PRIVATE' }), output(undefined, { text: 'x'.repeat(8001) }), output(undefined, { text: '\ud800' }),
    ]) await assert.rejects(prepared.finalize(value), unavailable);
});

test('source metadata and listing text cannot forward known internal identifiers into model context', async () => {
    for (const identifier of [product.id.toUpperCase(), chunk().handle.toUpperCase()]) {
        const current = fixture();
        const text = `Listing content containing ${identifier}`;
        current.state.scope.chunks = [chunk(1, { text, textHash: hash(text) })];
        const prepared = await current.prepare();
        assert.deepEqual((await prepared.context()).fragments, []);
        await assert.rejects(prepared.finalize(output([], { outcome: 'conversation', text: identifier })), unavailable);
    }
});

test('private source revision and comment-bearing or invalid timestamps never enter context or citations', async () => {
    for (const fields of [
        { physicalRevision: 's3://private-bucket/key' }, { physicalRevision: 'bucket: secret' },
        { capturedAt: '2026-11-06 (bucket: secret)' }, { capturedAt: '2026-11-06' },
        { capturedAt: '2026-02-30T00:00:00Z' }, { capturedAt: '2026-11-06T24:00:00Z' },
    ]) {
        const current = fixture(); current.state.scope.chunks = [chunk(1, fields)];
        const prepared = await current.prepare();
        assert.deepEqual((await prepared.context()).fragments, [], JSON.stringify(fields));
        await assert.rejects(prepared.finalize(output()), unavailable);
    }
});

test('real ISO source timestamps and ordinary revision labels remain citable', async () => {
    for (const capturedAt of ['2026-11-06T00:00:00Z', '2026-11-06T12:30:00.123456789+05:30', '2024-02-29T00:00:00.000Z']) {
        const current = fixture(); current.state.scope.chunks = [chunk(1, { capturedAt, physicalRevision: 'A.1' })];
        const prepared = await current.prepare();
        assert.equal((await prepared.context()).fragments[0].physicalRevision, 'A.1');
        assert.equal((await prepared.finalize(output())).citations[0].capturedAt, capturedAt);
    }
});

test('invalid input and denied actors fail before retrieval; adapter errors never leak private details', async () => {
    const current = fixture();
    for (const input of [{ question: '' }, { question: 'x'.repeat(2001) }, { question: '\ud800' }, { question: 'x', actor: 'foreign' }, { question: 'x', model: 'foreign' }]) await assert.rejects(prepareEvidenceContext({ ...current.options, input }), error => error instanceof PreparedEvidenceError && error.code === 'invalid');
    await assert.rejects(prepareEvidenceContext({ ...current.options, actor: null }), error => error instanceof PreparedEvidenceError && error.code === 'unauthenticated');
    assert.deepEqual(current.calls, []);
    current.state.current = false;
    await assert.rejects(current.prepare(), error => error instanceof PreparedEvidenceError && error.code === 'unauthenticated');
    assert.equal(current.calls.includes('identity'), false);
    const broken = fixture({ currentScope: async () => { throw Error('PRIVATE_SERVICE_ERROR'); } });
    await assert.rejects(broken.prepare(), unavailable);
});
