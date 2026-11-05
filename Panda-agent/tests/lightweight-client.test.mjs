import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { prepareSelect, createLightweightClient, verifyResponse, hmac } from '../src/lightweight/client.ts';
const secret = 'fixture-secret';
const turnId = '11111111-1111-4111-8111-111111111111';
const request = {turnId, productSku:'SKU', question:'Which?', fragments:[{handle:'h', text:'An exact quote.'}]};
const hex = s => createHash('sha256').update(s).digest('hex');
const receipt = (nonce, bodyHash, body) => createHmac('sha256',secret).update(`response.v1\n${nonce}\n${bodyHash}\n${hex(body)}`).digest('base64url');
const complete = JSON.stringify({version:1,state:'complete',selections:[{handle:'h',quote:'exact quote'}],usage:{modelCalls:1,inputTokens:12,outputTokens:3,costNanoUsd:0}});
test('Python and TypeScript fixed HMAC vectors agree', () => {
 assert.equal(hex('{"version":1}'),'2430f1a2ad2982d0067885488a4c89e21ad1d7c83b115ba8f1b20acc88dfaea8');
 assert.equal(hmac(secret,'eyJ2IjoxfQ'),'bJC6mFqbkzjhlQwAxBHXrsEN75d_vZE8aNUjRqz8Kl8');
 assert.equal(hmac(secret,'response.v1\n00000000-0000-4000-8000-000000000001\n2430f1a2ad2982d0067885488a4c89e21ad1d7c83b115ba8f1b20acc88dfaea8\n44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'),'4hY46ftRY0PPGzxfLY0Xr2pMtFAREAUWklYYI9klm2U');
});
test('wire bounds and exact literal binding reject tampering and extra fields', () => {
 const prepared=prepareSelect(request), nonce='22222222-2222-4222-8222-222222222222';
 assert.equal(verifyResponse({status:200,body:complete,receipt:receipt(nonce,prepared.requestBodySha256,complete),secret,nonce,bodySha256:prepared.requestBodySha256,fragments:request.fragments}).state,'complete');
 for (const body of [complete.replace('exact quote','fake quote'), complete.replace('"version":1','"version":1,"version":1'), complete.replace('"state":"complete"','"extra":0,"state":"complete"')]) assert.throws(()=>verifyResponse({status:200,body,receipt:receipt(nonce,prepared.requestBodySha256,body),secret,nonce,bodySha256:prepared.requestBodySha256,fragments:request.fragments}));
 assert.throws(()=>verifyResponse({status:200,body:complete,receipt:'bad',secret,nonce,bodySha256:prepared.requestBodySha256,fragments:request.fragments}));
 assert.throws(()=>prepareSelect({...request,question:'😀'.repeat(1001)}));
 assert.throws(()=>prepareSelect({...request,question:'\ud800'}));
});
test('transport ambiguity never retries execution and status only uses status route', async () => {
 const routes=[]; const client=createLightweightClient({baseUrl:'http://127.0.0.1:1234',secret,fetch:async url=>{routes.push(String(url)); throw Error('lost');}});
 const prepared=prepareSelect(request);
 await assert.rejects(client.select({subject:'user',sessionId:'session',prepared}), /unknown/i);
 await assert.rejects(client.status({subject:'user',sessionId:'session',turnId,productSku:'SKU',requestBodySha256:prepared.requestBodySha256,fragments:request.fragments}), /unknown/i);
 assert.deepEqual(routes.map(x=>new URL(x).pathname),['/v1/evidence/select','/v1/evidence/status']);
});
test('noncomplete response union is matched to HTTP status exactly', () => {
 const nonce='22222222-2222-4222-8222-222222222222', prepared=prepareSelect(request);
 const verify = (status, value) => {const body=JSON.stringify(value); return verifyResponse({status,body,receipt:receipt(nonce,prepared.requestBodySha256,body),secret,nonce,bodySha256:prepared.requestBodySha256,fragments:request.fragments});};
 assert.equal(verify(409,{version:1,state:'unknown',code:'outcome_unknown',usage:null}).state,'unknown');
 assert.throws(()=>verify(503,{version:1,state:'unknown',code:'outcome_unknown',usage:null}));
 assert.throws(()=>verify(409,{version:1,state:'rejected',code:'outcome_unknown',usage:null}));
 assert.throws(()=>verify(200,{version:1,state:'complete',selections:[],usage:{modelCalls:0,inputTokens:0,outputTokens:0,costNanoUsd:0}}));
 assert.throws(()=>verify(200,{version:1,state:'complete',selections:[],usage:{modelCalls:1,inputTokens:0,outputTokens:0,costNanoUsd:1}}));
});
test('mode is bound to select digest and pins receipt usage validation',async()=>{
 const mode='deterministic-mcu-v1', prepared=prepareSelect({...request,mode}), model=prepareSelect(request), nonce='22222222-2222-4222-8222-222222222222';
 assert.notEqual(prepared.requestBodySha256,model.requestBodySha256);assert.equal(JSON.parse(prepared.body).mode,mode);
 const body=JSON.stringify({version:1,state:'complete',selections:[{handle:'h',quote:'exact quote'}],usage:{modelCalls:0,inputTokens:0,outputTokens:0,costNanoUsd:0}});
 const params={status:200,body,receipt:receipt(nonce,prepared.requestBodySha256,body),secret,nonce,bodySha256:prepared.requestBodySha256,fragments:request.fragments};
 assert.equal(verifyResponse({...params,mode}).state,'complete');assert.throws(()=>verifyResponse(params));
 const modelBody=JSON.stringify({version:1,state:'complete',selections:[],usage:{modelCalls:1,inputTokens:0,outputTokens:0,costNanoUsd:0}});
 assert.throws(()=>verifyResponse({...params,body:modelBody,receipt:receipt(nonce,prepared.requestBodySha256,modelBody),mode}));
 assert.throws(()=>prepareSelect({...request,mode:'other'}));
 const client=createLightweightClient({baseUrl:'http://127.0.0.1:1234',secret,mode,fetch:async()=>assert.fail('mismatch must not send')});
 await assert.rejects(client.select({subject:'user',sessionId:'session',prepared:model}));
});
test('deterministic status uses configured mode and preserves original digest',async()=>{
 const mode='deterministic-mcu-v1',prepared=prepareSelect({...request,mode}),seen=[];
 const client=createLightweightClient({baseUrl:'http://127.0.0.1:1234',secret,mode,fetch:async (url,init)=>{
  const claims=JSON.parse(Buffer.from(init.headers.authorization.split(' ')[1].split('.')[0],'base64url').toString());
  const body=JSON.stringify({version:1,state:'complete',selections:[{handle:'h',quote:'exact quote'}],usage:{modelCalls:0,inputTokens:0,outputTokens:0,costNanoUsd:0}});
  seen.push({path:new URL(url).pathname,body:JSON.parse(init.body),claims});
  return new Response(body,{status:200,headers:{'x-panda-receipt':receipt(claims.nonce,claims.bodySha256,body)}});
 }});
 assert.equal((await client.status({subject:'user',sessionId:'session',turnId,productSku:'SKU',requestBodySha256:prepared.requestBodySha256,fragments:request.fragments})).state,'complete');
 assert.deepEqual(seen[0].body,{version:1,turnId,requestBodySha256:prepared.requestBodySha256});assert.equal(seen[0].claims.bodySha256,hex(JSON.stringify(seen[0].body)));assert.equal(seen[0].path,'/v1/evidence/status');
});
test('external abort reaches transport before or during fetch and removes its listener without retry', async () => {
 for(const abortFirst of [true,false]) {
  const controller=new AbortController();let calls=0, added=0, removed=0;
  const add=controller.signal.addEventListener.bind(controller.signal), remove=controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener=(...args)=>{added++;return add(...args);};
  controller.signal.removeEventListener=(...args)=>{removed++;return remove(...args);};
  if(abortFirst)controller.abort();
  const client=createLightweightClient({baseUrl:'http://127.0.0.1:1234',secret,fetch:async (_url,{signal})=>{
   calls++;if(!abortFirst)controller.abort();assert.equal(signal.aborted,true);throw Error('aborted');
  }});
  await assert.rejects(client.select({subject:'user',sessionId:'session',prepared:prepareSelect(request),signal:controller.signal}),/unknown/i);
  assert.equal(calls,1);assert.equal(added,1);assert.equal(removed,1);
 }
});
