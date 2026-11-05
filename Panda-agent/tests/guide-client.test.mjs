import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {prepareGuide,createGuideClient,verifyGuideResponse} from '../src/guide/client.ts';
const secret='fixture-secret',threadId='11111111-1111-4111-8111-111111111111',turnId='22222222-2222-4222-8222-222222222222',nonce='33333333-3333-4333-8333-333333333333';
const input={threadId,turnId,productSku:'BOARD',skill:{id:'embedded-project-guide',version:1,hash:'a'.repeat(64)},intent:{goal:'Build',board:'BOARD',components:[]},fragments:[{handle:'h',text:'MCU: RP2040'}]};
const sha=s=>createHash('sha256').update(s).digest('hex'),receipt=(body,digest)=>createHmac('sha256',secret).update(`response.v1\n${nonce}\n${digest}\n${sha(body)}`).digest('base64url');
const complete={version:1,state:'complete',guide:{template:'project',questions:['revision','wiring','framework','component-specifications'],nodes:6,workers:2},selections:[{handle:'h',quote:'MCU: RP2040'}],usage:{modelCalls:0,inputTokens:0,outputTokens:0,costNanoUsd:0}};
test('guide body binds skill, project and intent, with exact response receipt and literal quotes',()=>{
 const p=prepareGuide(input);assert.notEqual(p.requestBodySha256,prepareGuide({...input,threadId:'44444444-4444-4444-8444-444444444444'}).requestBodySha256);
 assert.notEqual(p.requestBodySha256,prepareGuide({...input,skill:{...input.skill,version:2}}).requestBodySha256);
 const check=v=>{const body=JSON.stringify(v);return verifyGuideResponse({status:200,body,receipt:receipt(body,p.requestBodySha256),secret,nonce,bodySha256:p.requestBodySha256,fragments:input.fragments});};
 assert.equal(check(complete).state,'complete');
 for(const v of [{...complete,selections:[{handle:'h',quote:'invented'}]},{...complete,selections:[{handle:'h',quote:'RP2040'}]},{...complete,usage:{...complete.usage,modelCalls:1}},{...complete,guide:{...complete.guide,nodes:7}},{...complete,extra:1}])assert.throws(()=>check(v));
 const body=JSON.stringify(complete);assert.throws(()=>verifyGuideResponse({status:200,body,receipt:'a'.repeat(43),secret,nonce,bodySha256:p.requestBodySha256,fragments:input.fragments}));
 assert.throws(()=>prepareGuide({...input,intent:{...input.intent,goal:'😀'.repeat(301)}}));
});
test('unknown run has no retry; status and cancel are separate controls',async()=>{
 const paths=[];const c=createGuideClient({baseUrl:'http://127.0.0.1:1234',secret,fetch:async url=>{paths.push(new URL(url).pathname);throw Error('lost');}}),prepared=prepareGuide(input),actor={subject:'user',sessionId:'session'};
 await assert.rejects(c.run({...actor,prepared}),/unknown/);
 await assert.rejects(c.status({...actor,threadId,turnId,productSku:'BOARD',requestBodySha256:prepared.requestBodySha256,fragments:input.fragments}),/unknown/);
 await assert.rejects(c.cancel({...actor,threadId,turnId,productSku:'BOARD',requestBodySha256:prepared.requestBodySha256}),/unknown/);
 assert.deepEqual(paths,['/v1/guides/run','/v1/guides/status','/v1/guides/cancel']);
});
