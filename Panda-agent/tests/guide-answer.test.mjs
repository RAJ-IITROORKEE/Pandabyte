import test from 'node:test';
import assert from 'node:assert/strict';
import {answerGuide,createGuideAnswer} from '../src/guide/answer.ts';
import {createGuideClient} from '../src/guide/client.ts';
import {createHash,createHmac} from 'node:crypto';
test('unavailable or revoked actor fails closed before any retrieval or guide dispatch',async()=>{
 let calls=0;
 const common={subject:'user',sessionId:'session',threadId:'11111111-1111-4111-8111-111111111111',turnId:'22222222-2222-4222-8222-222222222222',productSku:'BOARD',productId:'id',scopeHash:null,skill:{id:'embedded-project-guide',version:1,hash:'a'.repeat(64)},input:{goal:'Goal',board:'BOARD',components:[],expectedVersion:0},ragClient:{database:{rpc:()=>{calls++;throw Error('must not query');}}},client:{run:()=>{calls++;}},beforeDispatch:async()=>{calls++;}};
 assert.equal((await answerGuide({...common,current:async()=>false})).kind,'unavailable');
 assert.equal((await answerGuide({...common,current:async()=>{throw Error('expired');}})).kind,'unavailable');
 assert.equal(calls,0);
});
test('guide evidence uses signed client, validates current source and renders reviewed version',async()=>{
 const hash=s=>createHash('sha256').update(s).digest('hex'),secret='fixture-secret',id='11111111-1111-4111-8111-111111111111',handle=`panda:00000000-0000-4000-8000-000000000001:${'a'.repeat(64)}:${'b'.repeat(64)}`,text='MCU: RP2040',calls=[];
 for(const scenario of ['v1','v2','generic','revoked-before-send','revoked-after-selection','conceptual']){
  let current=true;const stages=[];const scope={fingerprint:'g1',candidate:true,sealed:true,engineeringVerified:true,manifestVerified:true,configVerified:true,generationCurrent:true,chunks:[{handle,productId:id,text,textHash:hash(text),header:'header',physicalRevision:null,blocked:false,title:'Fixture',sourceUrl:'https://pandabyte.in/product-page/fixture',capturedAt:'2026-01-01T00:00:00Z',sectionPath:['Specifications']}]};
  const createAdapters=()=>({ranking:{mode:'lexical'},resolveIdentity:async()=>({kind:'resolved',product:{id,sku:'BOARD'}}),currentScope:async()=>current?structuredClone(scope):null,lexical:async()=>[handle],dense:async()=>[],select:async()=>{throw Error('replaced');}});
  const client=createGuideClient({baseUrl:'http://127.0.0.1:1234',secret,fetch:async(_url,init)=>{
   calls.push(scenario);const claim=JSON.parse(Buffer.from(init.headers.authorization.split(' ')[1].split('.')[0],'base64url').toString()),request=JSON.parse(init.body);
   const body=JSON.stringify({version:1,state:'complete',guide:{template:scenario==='generic'?'project':'parking-monitor',questions:['revision','wiring','framework','component-specifications'],nodes:6,workers:2},selections:request.fragments.length?[{handle,quote:text}]:[],usage:{modelCalls:0,inputTokens:0,outputTokens:0,costNanoUsd:0}});
   const receipt=createHmac('sha256',secret).update(`response.v1\n${claim.nonce}\n${claim.bodySha256}\n${hash(body)}`).digest('base64url');
   if(scenario==='revoked-after-selection')current=false;
   return new Response(body,{status:200,headers:{'x-panda-receipt':receipt}});
  }});
  const ragClient={database:{rpc:async name=>{assert.equal(name,'panda_agent_guide_products');return {data:{items:[{id,sku:'BOARD',title:'Board'}]},error:null};}}};
  const result=await createGuideAnswer({createAdapters})({subject:'user',sessionId:'session',threadId:'11111111-1111-4111-8111-111111111111',turnId:'22222222-2222-4222-8222-222222222222',productSku:'BOARD',productId:id,scopeHash:scenario==='conceptual'?null:'c'.repeat(64),skill:{id:'embedded-project-guide',version:scenario==='v2'?2:1,hash:'d'.repeat(64)},input:{goal:'Parking <script>',board:'BOARD',components:['sensor'],expectedVersion:0},ragClient,client,current:async()=>true,activity:stage=>stages.push(stage),beforeDispatch:async()=>{if(scenario==='revoked-before-send')current=false;}});
  if(scenario.startsWith('revoked'))assert.equal(result.kind,'unavailable');else{
   assert.equal(result.kind,'complete');assert.match(result.text,/TRIG and ECHO/);assert.match(result.text,/\\<script\\>/);assert.equal(result.citations.length,scenario==='conceptual'?0:1);assert.equal(result.text.includes('observation checklist'),scenario==='v2');
   assert.equal((result.text.match(/^## /gm)??[]).length,8);assert.ok(result.text.length<=8000);assert.doesNotMatch(result.text,/\bGPIO\s*\d+\b/i);
   if(scenario==='generic'){assert.match(result.text,/input.*process.*output/i);assert.doesNotMatch(result.text,/occupied\/free\/unknown/);}
   else {for(const term of [/validity/i,/occupied\/free\/unknown/i,/calibrat/i,/debounc/i,/invalid/i,/noisy/i,/uncompiled/i,/untested/i,/empty/i,/sensor/i])assert.match(result.text,term);}
  }
  assert.equal(stages.includes('selecting_evidence'),scenario!=='revoked-before-send');
 }
 assert.ok(!calls.includes('revoked-before-send'));assert.ok(calls.includes('revoked-after-selection'));
});
