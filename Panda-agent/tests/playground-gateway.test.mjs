import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaygroundGatewayClient } from '../src/control-room/playground-gateway.ts';

const turn = { question: 'What is this?', productSku: 'SKU-1', userToken: 'a'.repeat(32), requestId: '12345678-1234-1234-1234-123456789abc', contextDigest: 'b'.repeat(64) };
const signer = async ({ headers }) => ({ ...headers, host: 'abc123def4.execute-api.ap-south-1.amazonaws.com', Authorization: 'AWS4-HMAC-SHA256 test' });
const endpoint = 'https://abc123def4.execute-api.ap-south-1.amazonaws.com/agent/v1/turns';
const response = value => Response.json(value);
const complete = () => ({ version: 3, requestId: turn.requestId, status: 'complete', contextDigest: turn.contextDigest, rawModel: '{"answer":"test"}' });
const make = fetcher => createPlaygroundGatewayClient({ enabled: true, endpoint, serviceToken: 'c'.repeat(64), signer, fetcher });
const rejects = (promise, code) => assert.rejects(promise, error => error.code === code);

test('noncanonical UUIDs fail before signing or network dispatch',async()=>{
 let calls=0;const run=createPlaygroundGatewayClient({enabled:true,endpoint,serviceToken:'c'.repeat(64),signer:async()=>{calls++;throw Error('must not sign');},fetcher:async()=>{calls++;throw Error('must not send');}});
 await rejects(run({...turn,requestId:'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'}),'outcome_unknown');assert.equal(calls,0);
});

test('sends the bounded v3 request once and returns the correlated output', async () => {
  let calls = 0;
  const run = make(async (url, init) => {
    calls++;
    assert.equal(url.href, endpoint);
    assert.equal(init.redirect, 'error');
    assert.deepEqual(JSON.parse(init.body), { version: 3, mode: 'playground', requestId: turn.requestId, question: turn.question, productSku: turn.productSku, contextDigest: turn.contextDigest });
    return response(complete());
  });
  assert.equal(await run(turn), '{"answer":"test"}');
  assert.equal(calls, 1);
});

test('disabled and malformed signed headers never send', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return response(complete()); };
  await rejects(createPlaygroundGatewayClient({ enabled: false, endpoint, serviceToken: 'c'.repeat(64), signer, fetcher })(turn), 'outcome_unknown');
  const badSigner = async ({ headers }) => ({ ...headers, 'x-panda-user-token': 'altered', Authorization: 'AWS4-HMAC-SHA256 test' });
  await rejects(createPlaygroundGatewayClient({ enabled: true, endpoint, serviceToken: 'c'.repeat(64), signer: badSigner, fetcher })(turn), 'outcome_unknown');
  assert.equal(calls, 0);
});

test('only exact correlated not-admitted and quota statuses are definitive', async () => {
  for (const status of ['not_admitted', 'quota']) {
    await rejects(make(async () => response({ version: 3, requestId: turn.requestId, status }))(turn), status);
    await rejects(make(async () => response({ version: 3, requestId: turn.requestId, status, extra: true }))(turn), 'outcome_unknown');
  }
  await rejects(make(async () => response({ ...complete(), contextDigest: 'd'.repeat(64) }))(turn), 'outcome_unknown');
  await rejects(make(async () => new Response('', { status: 429 }))(turn), 'outcome_unknown');
});

test('cancellation and oversized responses are ambiguous without retry', async () => {
  const controller = new AbortController(); let calls = 0;
  const run = make(async () => { calls++; return new Promise(() => {}); });
  const pending = run({ ...turn, signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await rejects(pending, 'outcome_unknown');
  assert.equal(calls, 1);
  await rejects(make(async () => response({ ...complete(), rawModel: 'x'.repeat(33000) }))(turn), 'outcome_unknown');
});

test('product profile is an explicit correlated v3 extension',async()=>{
 const product={...turn,requestId:'11111111-1111-4111-8111-111111111111',profile:'product-playground-v1'};
 const run=make(async (_url,init)=>{const body=JSON.parse(init.body);assert.equal(body.profile,'product-playground-v1');assert.equal(body.question,turn.question);assert.equal(body.productSku,turn.productSku);assert.equal(body.contextDigest,turn.contextDigest);return response({...complete(),requestId:product.requestId});});
 assert.equal(await run(product),'\u007b"answer":"test"}');
 await rejects(run({...turn,profile:'invalid'}),'outcome_unknown');
 await rejects(run({...product,productSku:undefined}),'outcome_unknown');
 await rejects(run({...product,question:'x'.repeat(2001)}),'outcome_unknown');
});
test('product usage is observed only after exact correlation; mini and invalid usage fail closed',async()=>{
 const product={...turn,requestId:'11111111-1111-4111-8111-111111111111',profile:'product-playground-v1'},usage={inputTokens:100,outputTokens:10,costNanoUsd:21000},seen=[];
 const runFor=value=>createPlaygroundGatewayClient({enabled:true,endpoint,serviceToken:'c'.repeat(64),signer,fetcher:async()=>response(value),onUsage:x=>seen.push(x)});
 const good={...complete(),requestId:product.requestId,usage};assert.equal(await runFor(good)(product),complete().rawModel);assert.deepEqual(seen,[usage]);
 for(const bad of [{...good,requestId:turn.requestId},{...good,contextDigest:'d'.repeat(64)},{...good,usage:{...usage,costNanoUsd:0}},{...good,usage:{...usage,extra:1}}])await rejects(runFor(bad)(product),'outcome_unknown');
 await rejects(runFor({...complete(),usage})(turn),'outcome_unknown');assert.equal(seen.length,1);
});
