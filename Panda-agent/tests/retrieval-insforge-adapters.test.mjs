import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runtimeSnapshot as snapshot } from './fixtures/runtime-snapshot.mjs';
import { createInsforgeAdapters, listRuntimeProducts, getRuntimeProductEvidence, isCanonicalSourceLabel } from '../src/retrieval/insforge-adapters.ts';
import { answerQuestion } from '../src/retrieval/answers.ts';
import { prepareProductContextSet } from '../src/retrieval/product-context-set.ts';
import { ENGINEERING_CONFIG, ENGINEERING_MANIFEST } from '../src/retrieval/engineering-proof.ts';

const actor = { subject: 'test-subject' };
function fixture(productTitle) {
    const grouped = new Map();
    for (const x of snapshot.chunks) { if (!grouped.has(x.product_id)) grouped.set(x.product_id, []); grouped.get(x.product_id).push(x); }
    const rows = [...grouped].map(([id, chunks], i) => ({ id, sku: `TEST${i}X`, title: chunks[0].locator.section_path[0], sourceUrl: chunks[0].source_url, approvedChunksCount: chunks.length }));
    const p = productTitle ? rows.find(row => row.title === productTitle) : rows[0];
    assert.ok(p);
    const result = { candidate: { configHash: ENGINEERING_CONFIG, manifestHash: ENGINEERING_MANIFEST, membershipHash: ENGINEERING_MANIFEST, memberCount: 284, state: 'candidate', sealed: true }, product: p, chunks: grouped.get(p.id).map(x => ({ documentVersionId: x.version_id, logicalChunkId: x.logical_chunk_id, chunkVersionId: x.chunk_version_id, text: x.text, textHash: x.content_sha256, generation: x.generation, physicalRevision: null, capturedAt: '2026-10-31T00:00:00Z', sectionPath: x.locator.section_path })) };
    const client = { database: { rpc: async (name) => ({ data: name === 'panda_agent_runtime_products' ? { items: rows } : result, error: null }) } };
    return { rows, p, result, client };
}
const skip = !snapshot && 'private snapshot is unavailable';

test('only the exact standalone canonical URL label is excluded from product ranking', () => {
    const sourceUrl = 'https://pandabyte.in/product-page/fixture';
    const label = `Source: ${sourceUrl}`;
    assert.equal(isCanonicalSourceLabel({ sourceUrl, text: label }), true);
    for (const text of [label + '\nUSB connector: Type-C', label + ' (captured)', label + '-other', sourceUrl]) {
        assert.equal(isCanonicalSourceLabel({ sourceUrl, text }), false);
    }
});

test('captured x8266 evidence supports MCU and USB questions while proof and ambiguous requests withhold passages', { skip }, async (t) => {
    const f = fixture('PandaByte NodeMCU x8266 WiFi Development Board');
    const cases = [
        ['Which MCU does the x8266 use?', 'ready', /microcontroller:\s*ESP8266/i],
        ['Which USB connector does the x8266 use?', 'ready', /USB Interface:\s*USB Type-C/i],
        ['What is the safe GPIO voltage on x8266?', 'insufficient'],
        ['Which USB connector does x8266 use and what GPIO voltage is safe?', 'insufficient'],
        ['Which ESP32 board has a USB connector?', 'clarification'],
    ];
    for (const [question, kind, claim] of cases) await t.test(question, async (t) => {
        const result = await prepareProductContextSet({
            actor, question, client: f.client, authorizeCurrent: async () => true,
            createAdapters: () => createInsforgeAdapters(f.client, () => assert.fail('retrieval must not call a model')),
        });
        assert.equal(result.kind, kind, question);
        if (kind === 'ready') {
            assert.ok(result.passages.every(passage => passage.sourceUrl === f.p.sourceUrl), question);
            assert.ok(result.passages.every(passage => passage.text !== `Source: ${passage.sourceUrl}`), 'a source URL by itself cannot support an answer');
            const rank = result.passages.findIndex(passage => claim.test(passage.text)) + 1;
            t.diagnostic(`Listing field rank ${rank || 'absent'} among ${result.passages.length} passages`);
            assert.ok(rank > 0, question);
        } else {
            assert.equal('passages' in result, false, question);
        }
    });
});
test('user-scoped RPC denial and unknown product fail closed', { skip }, async () => {
    const f = fixture();
    await assert.rejects(listRuntimeProducts({ database: { rpc: async () => ({ data: null, error: 'denied' }) } }));
    const a = createInsforgeAdapters(f.client, async () => ({ selections: [] }));
    assert.deepEqual(await a.resolveIdentity(actor, { question: 'question', productSku: 'UNKNOWN' }), { kind: 'clarification' });
    assert.deepEqual(await a.resolveIdentity(actor, { question: `Compare ${f.rows[0].sku} and ${f.rows[1].sku}`, productSku: f.p.sku }), { kind: 'conflict' });
    assert.deepEqual(Object.keys((await listRuntimeProducts(f.client))[0]).sort(), ['sku', 'title']);
});
test('snapshot membership is pinned; stale metadata and altered bodies fail', { skip }, async () => {
    const f = fixture(), a = createInsforgeAdapters(f.client, async () => ({ selections: [] }));
    assert.ok(await a.currentScope(actor, f.p));
    for (const change of [r => r.candidate.configHash = 'a'.repeat(64), r => r.candidate.membershipHash = 'a'.repeat(64), r => r.candidate.memberCount--, r => r.candidate.sealed = false, r => r.chunks[0].generation++, r => r.chunks[0].text += 'x', r => r.chunks.pop(), r => r.chunks[0].sectionPath = ['forged'], r => r.product.sourceUrl += 'changed']) {
        const prior = structuredClone(f.result); change(f.result);
        assert.equal(await a.currentScope(actor, f.p), null);
        Object.assign(f.result, prior);
    }
});
test('lexical search uses eligible matching chunks and never calls dense', { skip }, async () => {
    const f = fixture(), a = createInsforgeAdapters(f.client, async (_q, fragments) => ({ selections: [{ handle: fragments[0].handle, quote: fragments[0].text.slice(0, 20) }] }));
    const scope = await a.currentScope(actor, f.p);
    const eligible = scope.chunks.filter(c => !c.blocked);
    const word = eligible[0].text.match(/[a-zA-Z]{5,}/)[0];
    assert.ok((await a.lexical(word, eligible.map(c => c.handle))).length);
    // Whole-product context: a question with no matching word still gets the product's passages.
    const unmatched = await a.lexical('zzznomatchingtermzzz', eligible.map(c => c.handle));
    assert.ok(unmatched.length > 0 && unmatched.every(h => eligible.some(c => c.handle === h)));
    await assert.rejects(a.dense(word, []));
    assert.equal((await answerQuestion(actor, { question: word, productSku: f.p.sku }, a)).kind, 'evidence');
});
test('reviewed mixed-board chunks are blocked', { skip }, async () => {
    const f = fixture();
    for (const row of f.rows) {
        const chunks = snapshot.chunks.filter(x => x.product_id === row.id);
        if (!chunks.some(x => ['21638b9445898f6a03aa24d24a7e60cc344c6bbb2bccd33959537178c2bd4fb4', '3ea5b9267d4102142b48cf8e5393e1f9a42fe0c3ff283c13cff04b5bdf3864ac'].includes(x.logical_chunk_id))) continue;
        Object.assign(f.result, { product: row, chunks: chunks.map(x => ({ documentVersionId: x.version_id, logicalChunkId: x.logical_chunk_id, chunkVersionId: x.chunk_version_id, text: x.text, textHash: x.content_sha256, generation: x.generation, physicalRevision: null, capturedAt: '2026-10-31T00:00:00Z', sectionPath: x.locator.section_path })) });
        const a = createInsforgeAdapters(f.client, async () => ({ selections: [] }));
        assert.equal((await a.currentScope(actor, row)).chunks.filter(c => c.blocked).length, 1);
    }
});

test('withdrawing a different product does not block an eligible product', { skip }, async () => {
    const f = fixture(); f.rows.pop();
    assert.equal((await listRuntimeProducts(f.client)).length, 41);
    const a = createInsforgeAdapters(f.client, async () => ({ selections: [] }));
    assert.equal((await a.resolveIdentity(actor, { question: 'details', productSku: f.p.sku })).kind, 'resolved');
    assert.ok(await a.currentScope(actor, f.p));
});

test('admin evidence projection contains no canonical IDs or handles', { skip }, async () => {
    const f = fixture();
    const result = await getRuntimeProductEvidence(f.client, f.p.sku);
    assert.equal(result.retrievalMethod, 'lexical');
    assert.equal(result.candidateState, 'sealed_inactive');
    assert.deepEqual(Object.keys(result.chunks[0]).sort(), ['capturedAt', 'physicalRevision', 'sectionPath', 'text']);
    assert.equal(JSON.stringify(result).includes(f.p.id), false);
    assert.equal(JSON.stringify(result).includes('panda:'), false);
    assert.ok(result.chunks.some(chunk => chunk.text === `Source: ${result.sourceUrl}`), 'inspection retains the original metadata passage');
});
