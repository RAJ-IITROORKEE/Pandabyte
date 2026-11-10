import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { answerQuestion, prepareQuestionEvidence, reciprocalRankFusion } from '../src/retrieval/answers.ts';
const hash = s => createHash('sha256').update(s).digest('hex');
const actor = { subject: 'user-1' };
const chunk = (handle = 'panda:00000000-0000-0000-0000-000000000001:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', overrides = {}) => ({ handle, productId: 'p1', text: 'The listing claims 4 pins.', textHash: hash('The listing claims 4 pins.'), header: 'canonical header', physicalRevision: null, blocked: false, title: 'Product listing', sourceUrl: 'https://pandabyte.in/product-page/a', capturedAt: '2026-10-30T00:00:00Z', sectionPath: ['Specifications'], ...overrides });
const make = (overrides = {}) => {
    const calls = [];
    const scope = { fingerprint: 'g1', candidate: true, sealed: true, engineeringVerified: true, manifestVerified: true, configVerified: true, generationCurrent: true, chunks: [chunk()] };
    const adapters = {
        ranking: { mode: 'rrf', admission: 'engineering_experiment', evidenceSha256: 'a'.repeat(64) },
        resolveIdentity: async () => { calls.push('identity'); return { kind: 'resolved', product: { id: 'p1', sku: 'SKU1' } }; },
        currentScope: async () => { calls.push('scope'); return structuredClone(scope); },
        lexical: async (_q, handles) => { calls.push(['lexical', handles]); return ['panda:00000000-0000-0000-0000-000000000001:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']; },
        dense: async (_q, handles) => { calls.push(['dense', handles]); return [{ handle: 'panda:00000000-0000-0000-0000-000000000001:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', text: scope.chunks[0].text, textHash: scope.chunks[0].textHash, header: scope.chunks[0].header, score: 0.5 }]; },
        select: async () => { calls.push('model'); return { selections: [{ handle: 'panda:00000000-0000-0000-0000-000000000001:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', quote: '4 pins' }] }; }, ...overrides
    };
    return { calls, scope, adapters };
};
const ask = (a, q = { question: 'How many pins?', productSku: 'SKU1' }) => answerQuestion(actor, q, a);
test('ranked passages beyond eighth place backfill duplicate and oversized hits', async () => {
    const x = make({ ranking: { mode: 'lexical' }, lexical: async (_question, handles) => handles });
    const texts = ['a'.repeat(11000), 'b'.repeat(10000), ...Array(6).fill('duplicate'), 'Late USB evidence'];
    x.scope.chunks = texts.map((text, i) => chunk(chunk().handle.replace('000000000001:', String(i + 1).padStart(12, '0') + ':'), { text, textHash: hash(text) }));
    const result = await prepareQuestionEvidence(actor, { question: 'What USB connector?', productSku: 'SKU1' }, x.adapters);
    assert.equal(result.kind, 'ready');
    assert.deepEqual(result.fragments.map(f => f.text), [texts[0], 'duplicate', 'Late USB evidence']);
    assert.equal(result.completeEligibleScope, false);
    x.scope.chunks.pop();
    assert.equal(await result.revalidate(), false);
});
test('retrieval-only preparation avoids selection and checks current source before release', async () => {
    const x = make({ ranking: { mode: 'lexical' }, select: async () => assert.fail('retrieval must not invoke a selector') });
    const prepared = await prepareQuestionEvidence(actor, { question: 'How many pins?', productSku: 'SKU1' }, x.adapters);
    assert.equal(prepared.kind, 'ready');
    assert.equal(x.calls.filter(c => c === 'scope').length, 1);
    assert.equal(await prepared.revalidate(), true);
    assert.equal(x.calls.filter(c => c === 'scope').length, 2);
    x.scope.chunks[0].text = 'Changed text';
    x.scope.chunks[0].textHash = hash('Changed text');
    assert.equal(await prepared.revalidate(), false);
    assert.ok(!x.calls.includes('model'));
});
test('evidence keeps its original fingerprint when an adapter reuses a mutable scope object', async () => {
    const x = make({ ranking: { mode: 'lexical' } });
    x.adapters.currentScope = async () => x.scope;
    const prepared = await prepareQuestionEvidence(actor, { question: 'How many pins?', productSku: 'SKU1' }, x.adapters);
    assert.equal(prepared.kind, 'ready');
    x.scope.fingerprint = 'new-source-generation';
    assert.equal(await prepared.revalidate(), false);
});
test('valid answer projects trusted citation and rechecks scope', async () => {
    const x = make();
    const result = await ask(x.adapters);
    assert.deepEqual(result, { kind: 'evidence', citations: [{ id: 'S1', title: 'Product listing', sourceUrl: 'https://pandabyte.in/product-page/a', capturedAt: '2026-10-30T00:00:00Z', quote: '4 pins', sectionPath: ['Specifications'] }] });
    assert.equal(x.calls.filter(c => c === 'scope').length, 3);
});
test('selector context reports complete coverage only when every eligible full body is included',async()=>{
 for(const mode of ['complete','omitted','duplicate','overbudget','morethan8']) {
  const x=make({ranking:{mode:'lexical'}}), base=chunk().handle;
  const count=mode==='morethan8'?9:mode==='complete'?1:2;
  x.scope.chunks=Array.from({length:count},(_,i)=>{const h=base.replace('000000000001:',`${String(i+1).padStart(12,'0')}:`),text=mode==='duplicate'?'same':mode==='overbudget'?`${i}`+'x'.repeat(11000):`text ${i}`;return chunk(h,{text,textHash:hash(text)});});
  x.adapters.lexical=async()=>x.scope.chunks.slice(0,mode==='omitted'?1:count).map(c=>c.handle);
  let coverage; x.adapters.select=async(_q,fs,context)=>{coverage=context.completeEligibleScope;return {selections:[]};};
  assert.equal((await ask(x.adapters)).kind,'insufficient');assert.equal(coverage,mode==='complete',mode);
 }
});
test('coverage-gated selector never dispatches incomplete or revoked scope',async()=>{
 for(const scenario of ['overflow','duplicate','revoked']){
  const x=make({ranking:{mode:'lexical'}}),base=chunk().handle;let dispatches=0, reads=0;
  const count=scenario==='overflow'?9:scenario==='duplicate'?2:1;
  x.scope.chunks=Array.from({length:count},(_,i)=>{const h=base.replace('000000000001:',`${String(i+1).padStart(12,'0')}:`),text=scenario==='duplicate'?'same':`text ${i}`;return chunk(h,{text,textHash:hash(text)});});
  x.adapters.lexical=async(_q,handles)=>handles;
  x.adapters.currentScope=async()=>++reads===2 && scenario==='revoked'?null:structuredClone(x.scope);
  x.adapters.select=async(_q,_f,context)=>{if(!context.completeEligibleScope || !await context.revalidate())throw Error('incomplete');dispatches++;return {selections:[]};};
  assert.equal((await ask(x.adapters)).kind,'unavailable');assert.equal(dispatches,0,scenario);
 }
});
test('signed out and spoofed or oversized input reject before adapters', async () => {
    const x = make();
    assert.equal((await answerQuestion(null, { question: 'x' }, x.adapters)).kind, 'unauthorized');
    for (const key of ['actor', 'model', 'release', 'workspace', 'session', 'url', 'ranking'])
        assert.equal((await ask(x.adapters, { question: 'x', [key]: 'x' })).kind, 'invalid');
    assert.equal((await ask(x.adapters, { question: 'x'.repeat(2001) })).kind, 'invalid');
    assert.deepEqual(x.calls, []);
});
test('identity ambiguity and contradictory SKU stop before search', async () => {
    for (const kind of ['clarification', 'conflict']) {
        const x = make({ resolveIdentity: async () => ({ kind }) });
        assert.equal((await ask(x.adapters)).kind, kind);
        assert.deepEqual(x.calls, []);
    }
    const x = make();
    assert.equal((await ask(x.adapters, { question: 'ESP chip?', productSku: 'OTHER' })).kind, 'clarification');
    assert.deepEqual(x.calls, ['identity']);
});
test('missing proof, stale generation, and unknown revision do not search', async () => {
    for (const field of ['candidate', 'sealed', 'engineeringVerified', 'manifestVerified', 'configVerified', 'generationCurrent']) {
        const x = make();
        x.scope[field] = false;
        assert.equal((await ask(x.adapters)).kind, 'unavailable');
        assert.deepEqual(x.calls, ['identity', 'scope']);
    }
    const x = make();
    assert.equal((await ask(x.adapters, { question: 'Number of pins?', physicalRevision: 'A' })).kind, 'insufficient');
    assert.deepEqual(x.calls, ['identity', 'scope']);
});
test('questions requiring absent physical or execution proof stop before scope', async () => {
    for (const question of ['Which pin should I wire?', 'Is this guaranteed safe?', 'Is the code proven compiling?', 'What is my physical revision?', 'What ratings are in the linked datasheet?']) {
        const x = make();
        assert.equal((await ask(x.adapters, { question })).kind, 'insufficient', question);
        assert.deepEqual(x.calls, ['identity']);
    }
});
test('RRF deduplicates and orders deterministically', () => assert.deepEqual(reciprocalRankFusion(['b', 'a', 'b'], ['a', 'c']), ['a', 'b', 'c']));
test('blocked mixed-board chunk is excluded before both searches', async () => {
    const x = make();
    x.scope.chunks.push(chunk('panda:00000000-0000-0000-0000-000000000002:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', { blocked: true }));
    assert.equal((await ask(x.adapters)).kind, 'evidence');
    for (const c of x.calls.filter(Array.isArray))
        assert.deepEqual(c[1], ['panda:00000000-0000-0000-0000-000000000001:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']);
});
test('dense hit must be eligible and match hash, header, span and finite score', async () => {
    for (const hit of [{ handle: 'panda:00000000-0000-0000-0000-000000000003:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' }, { score: Infinity }, { textHash: 'bad' }, { header: 'bad' }, { text: 'forged', textHash: hash('forged') }]) {
        const x = make({ dense: async () => [{ handle: 'panda:00000000-0000-0000-0000-000000000001:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', text: 'The listing claims 4 pins.', textHash: hash('The listing claims 4 pins.'), header: 'canonical header', score: 1, ...hit }] });
        assert.equal((await ask(x.adapters)).kind, 'unavailable');
        assert.ok(!x.calls.includes('model'));
    }
});
test('forged model quote, source, fields and private pointers cannot become citations', async () => {
    for (const selection of [{ handle: 'panda:00000000-0000-0000-0000-000000000003:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', quote: '4 pins' }, { handle: 'panda:00000000-0000-0000-0000-000000000001:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', quote: '5 pins' }, { handle: 'panda:00000000-0000-0000-0000-000000000001:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', quote: '4 pins', sourceUrl: 'https://evil.test' }, { handle: 'panda:00000000-0000-0000-0000-000000000001:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', quote: '4 pins', compiled: true }]) {
        const x = make({ select: async () => ({ selections: [selection] }) });
        assert.equal((await ask(x.adapters)).kind, 'unavailable');
    }
    for (const overrides of [{ sourceUrl: 'https://evil.test/a' }, { title: 'bucket: secret' }, { sourceUrl: 'https://pandabyte.in/a?token=secret' }]) {
        const x = make();
        x.scope.chunks = [chunk('panda:00000000-0000-0000-0000-000000000001:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', overrides)];
        assert.equal((await ask(x.adapters)).kind, 'insufficient');
    }
});
test('revocation after model discards answer and engine errors do not retry', async () => {
    const x = make();
    let count = 0;
    x.adapters.currentScope = async () => { count++; return count <= 2 ? structuredClone(x.scope) : { ...x.scope, fingerprint: 'g2', chunks: [] }; };
    assert.equal((await ask(x.adapters)).kind, 'unavailable');
    assert.ok(x.calls.includes('model'));
    let calls = 0;
    const y = make({ dense: async () => { calls++; throw Error('private error'); } });
    assert.equal((await ask(y.adapters)).kind, 'unavailable');
    assert.equal(calls, 1);
    assert.ok(!y.calls.includes('model'));
});
test('default adapter remains unavailable', async () => assert.equal((await answerQuestion(actor, { question: 'x' })).kind, 'unavailable'));
test('revocation during retrieval stops before sending evidence to the selector', async () => {
    const x = make();
    let count = 0;
    x.adapters.currentScope = async () => ++count === 1 ? structuredClone(x.scope) : { ...x.scope, fingerprint: 'revoked', chunks: [] };
    assert.equal((await ask(x.adapters)).kind, 'unavailable');
    assert.ok(!x.calls.includes('model'));
});
test('whole context fragments stay within the total 20000-character budget', async () => {
    const x = make(), first = chunk().handle, second = first.replace('000000000001:', '000000000002:');
    const text = 'x'.repeat(11000) + ' 4 pins';
    x.scope.chunks = [chunk(first, { text, textHash: hash(text) }), chunk(second, { text, textHash: hash(text) })];
    x.adapters.lexical = async () => [first, second];
    let supplied;
    x.adapters.select = async (_q, fragments) => { supplied = fragments; return { selections: [{ handle: first, quote: '4 pins' }] }; };
    assert.equal((await ask(x.adapters)).kind, 'evidence');
    assert.equal(supplied.length, 1);
    assert.equal(supplied[0].text, text);
    assert.ok(supplied.reduce((n, fragment) => n + fragment.text.length, 0) <= 20000);
});
test('default is lexical-only and RRF requires a trusted explicit experimental or evaluated selection', async () => {
    const x = make({ ranking: undefined, dense: async () => assert.fail('default lexical mode must not invoke dense') });
    assert.equal((await ask(x.adapters)).kind, 'evidence');
    for (const ranking of [{ mode: 'rrf' }, { mode: 'rrf', admission: 'public', evidenceSha256: 'a'.repeat(64) }, { mode: 'rrf', admission: 'engineering_experiment', evidenceSha256: 'wrong' }]) {
        const y = make({ ranking });
        assert.equal((await ask(y.adapters)).kind, 'unavailable');
        assert.deepEqual(y.calls, []);
    }
});
test('dense-only partial hits cannot promote unreturned canonical context', async () => {
    const h = chunk().handle;
    const x = make({ ranking: { mode: 'dense' }, lexical: async () => assert.fail('dense mode must not invoke lexical'),
        dense: async () => [{ handle: h, text: '4 pins', textHash: hash('4 pins'), header: 'canonical header', score: 0.5 }],
        select: async (_q, fragments) => { assert.deepEqual(fragments, [{ handle: h, text: '4 pins' }]); return { selections: [{ handle: h, quote: 'The listing' }] }; } });
    assert.equal((await ask(x.adapters)).kind, 'unavailable');
});
test('canonical citation paths and private provenance JSON are rejected before search', async () => {
    for (const overrides of [{ sourceUrl: 'https://pandabyte.in/api/private/secret' }, { sourceUrl: 'https://pandabyte.in:444/product-page/a' },
        { text: '{"private_bucket":"private","private_key":"originals/secret"}', textHash: hash('{"private_bucket":"private","private_key":"originals/secret"}') }]) {
        const x = make();
        x.scope.chunks = [chunk(chunk().handle, overrides)];
        assert.equal((await ask(x.adapters)).kind, 'insufficient');
        assert.ok(!x.calls.some(Array.isArray));
        assert.ok(!x.calls.includes('model'));
    }
});

test('deduplicates ranked whole bodies and reports the backfilled context size', async () => {
    const x = make(), handles = Array.from({length: 9}, (_, i) => chunk().handle.replace('000000000001:', `${String(i + 1).padStart(12, '0')}:`));
    const texts = ['x'.repeat(6000) + ' 4 pins', 'x'.repeat(6000) + ' 4 pins', ...Array.from({length: 7}, (_, i) => `unique ${i}` + 'z'.repeat(1900))];
    x.scope.chunks = handles.map((h, i) => chunk(h, {text: texts[i], textHash: hash(texts[i])}));
    x.adapters.ranking = {mode: 'lexical'}; x.adapters.lexical = async () => handles;
    const activity = []; x.adapters.activity = (...args) => activity.push(args);
    let supplied; x.adapters.select = async (_q, fragments) => { supplied = fragments; return {selections: [{handle: handles[0], quote: '4 pins'}]}; };
    assert.equal((await ask(x.adapters)).kind, 'evidence');
    assert.deepEqual(supplied.map(f => f.handle), [handles[0], ...handles.slice(2)]);
    assert.deepEqual(activity.find(row => row[1])?.[1], {fragments: 8, characters: texts[0].length + texts.slice(2).reduce((n, s) => n + s.length, 0), duplicatesRemoved: 1, limitCharacters: 20000});
});
test('empty selector result is insufficient only after a successful current scope recheck', async () => {
    const x = make({select: async () => ({selections: []})});
    assert.deepEqual(await ask(x.adapters), {kind: 'insufficient'});
    assert.equal(x.calls.filter(c => c === 'scope').length, 3);
    let count = 0; x.adapters.currentScope = async () => ++count <= 2 ? structuredClone(x.scope) : null;
    assert.deepEqual(await ask(x.adapters), {kind: 'unavailable'});
});
test('context is not emitted on a stale scope and callback errors do not alter answers', async () => {
    const events = [], x = make({activity: (...args) => events.push(args)}); let count = 0;
    x.adapters.currentScope = async () => ++count === 1 ? structuredClone(x.scope) : null;
    assert.equal((await ask(x.adapters)).kind, 'unavailable');
    assert.ok(events.every(row => row.length === 1));
    const y = make({activity: () => {throw Error('presentation');}});
    assert.equal((await ask(y.adapters)).kind, 'evidence');
});

test('empty selection does not weaken selector shape limits', async () => {
    for (const result of [{selections: [], extra: true}, {selections: Array(5).fill({handle: chunk().handle, quote: '4 pins'})}]) {
        const x = make({select: async () => result});
        assert.equal((await ask(x.adapters)).kind, 'unavailable');
    }
});

test('trusted selector can recheck all retrieved fragments before release', async () => {
    const x = make();
    x.adapters.select = async (_question, fragments, context) => {
        assert.equal(await context.revalidate(), true);
        x.scope.chunks = [];
        assert.equal(await context.revalidate(), false);
        return { selections: [{ handle: fragments[0].handle, quote: '4 pins' }] };
    };
    assert.equal((await ask(x.adapters)).kind, 'unavailable');
});
test('selector cannot shrink the captured revalidation set by mutating its fragment array', async () => {
    const x = make();
    x.adapters.select = async (_question, fragments, context) => {
        fragments.length = 0;
        x.scope.chunks = [];
        assert.equal(await context.revalidate(), false);
        throw Error('withdrawn');
    };
    assert.equal((await ask(x.adapters)).kind, 'unavailable');
});

test('redundant exact source label is removed only after literal validation and citations renumber',async()=>{
 const h1='panda:00000000-0000-0000-0000-000000000001:'+ 'a'.repeat(64)+':'+ 'a'.repeat(64),h2='panda:00000000-0000-0000-0000-000000000002:'+ 'b'.repeat(64)+':'+ 'b'.repeat(64),url='https://pandabyte.in/product-page/a',meta=`Source: ${url}`;
 const x=make({lexical:async(_q,h)=>h,dense:async()=>[],select:async()=>({selections:[{handle:h1,quote:meta},{handle:h2,quote:'4 pins'}]})});x.scope.chunks=[chunk(h1,{text:meta,textHash:hash(meta)}),chunk(h2)];
 const answer=await ask(x.adapters);assert.equal(answer.kind,'evidence');assert.deepEqual(answer.citations.map(c=>({id:c.id,quote:c.quote,sourceUrl:c.sourceUrl})),[{id:'S1',quote:'4 pins',sourceUrl:url}]);
 x.scope.chunks[0]={...x.scope.chunks[0],text:'A different listing',textHash:hash('A different listing')};assert.equal((await ask(x.adapters)).kind,'unavailable');
});
test('metadata-only selection is insufficient and labels from other sources are removed',async()=>{
 const h1='panda:00000000-0000-0000-0000-000000000001:'+ 'a'.repeat(64)+':'+ 'a'.repeat(64),h2='panda:00000000-0000-0000-0000-000000000002:'+ 'b'.repeat(64)+':'+ 'b'.repeat(64),url='https://pandabyte.in/product-page/b',meta=`Source: ${url}`;
 let picks=[{handle:h1,quote:meta}];const x=make({lexical:async(_q,h)=>h,dense:async()=>[],select:async()=>({selections:picks})});x.scope.chunks=[chunk(h1,{text:meta,textHash:hash(meta),sourceUrl:url}),chunk(h2)];
 let answer=await ask(x.adapters);assert.equal(answer.kind,'insufficient');picks=[{handle:h1,quote:meta},{handle:h2,quote:'4 pins'}];answer=await ask(x.adapters);assert.equal(answer.kind,'evidence');assert.deepEqual(answer.citations.map(c=>[c.id,c.quote,c.sourceUrl]),[['S1','4 pins','https://pandabyte.in/product-page/a']]);
});
test('source-like but nonexact literal quote is never removed',async()=>{
 const h1='panda:00000000-0000-0000-0000-000000000001:'+ 'a'.repeat(64)+':'+ 'a'.repeat(64),h2='panda:00000000-0000-0000-0000-000000000002:'+ 'b'.repeat(64)+':'+ 'b'.repeat(64),meta='Source: https://pandabyte.in/product-page/a (captured)';const x=make({lexical:async(_q,h)=>h,dense:async()=>[],select:async()=>({selections:[{handle:h1,quote:meta},{handle:h2,quote:'4 pins'}]})});x.scope.chunks=[chunk(h1,{text:meta,textHash:hash(meta)}),chunk(h2)];const answer=await ask(x.adapters);assert.equal(answer.kind,'evidence');assert.deepEqual(answer.citations.map(c=>c.quote),[meta,'4 pins']);
});

test('withdrawal of a droppable metadata handle after selection still rejects the answer',async()=>{
 const h1='panda:00000000-0000-0000-0000-000000000001:'+'a'.repeat(64)+':'+'a'.repeat(64),h2='panda:00000000-0000-0000-0000-000000000002:'+'b'.repeat(64)+':'+'b'.repeat(64),meta='Source: https://pandabyte.in/product-page/a';let x;
 x=make({lexical:async(_q,h)=>h,dense:async()=>[],select:async()=>{x.scope.chunks[0]={...x.scope.chunks[0],blocked:true};return {selections:[{handle:h1,quote:meta},{handle:h2,quote:'4 pins'}]};}});x.scope.chunks=[chunk(h1,{text:meta,textHash:hash(meta)}),chunk(h2)];
 const answer=await ask(x.adapters);assert.equal(answer.kind,'unavailable');assert.equal(x.scope.fingerprint,'g1');assert.equal(x.calls.filter(v=>v==='scope').length,3);
});
