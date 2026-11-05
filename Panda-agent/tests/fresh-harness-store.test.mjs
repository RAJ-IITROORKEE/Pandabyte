import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createLightweightStore } from '../src/server/lightweight-store.ts';
import { createLightweightAnswer } from '../src/server/lightweight-answer.ts';

const tid='11111111-1111-4111-8111-111111111111', rid='22222222-2222-4222-8222-222222222222', key='ab'.repeat(32), digest='cd'.repeat(32);
const actor={subject:'user',sessionId:'session',client:{database:{schema:()=>({rpc:async()=>({})}),rpc:async()=>({})}}};
test('store signs scoped prepare and preserves repeat prepare result',async()=>{
 const calls=[]; let execute=true;
 const a={...actor,client:{database:{schema:()=>({rpc:async()=>({})}),rpc:async(name,args)=>{calls.push({name,args});const value=execute;execute=false;return {data:{execute:value},error:null};}}}};
 const store=createLightweightStore(a,key),scope={productId:tid,sku:'x8266',scopeHash:'ef'.repeat(32)};
 assert.equal(await store.prepare(tid,rid,'question',scope,digest),true);
 assert.equal(await store.prepare(tid,rid,'question',scope,digest),false);
 assert.deepEqual(calls.map(c=>c.name),['panda_agent_lightweight_prepare','panda_agent_lightweight_prepare']);
 for(const {args} of calls){const payload=JSON.parse(args.p_payload);assert.equal(payload.digest,digest);assert.equal(payload.subject,'user');assert.equal(payload.scopeHash,scope.scopeHash);assert.equal(args.p_mac,createHmac('sha256',Buffer.from(key,'hex')).update(`panda-lightweight-db-v1\n${args.p_payload}`).digest('hex'));}
});
test('ambiguous first execution after durable preparation reconciles with status only',async()=>{
 const calls=[];let prepared=false;
 const store={scope:async()=>({productId:tid,sku:'x8266',scopeHash:'ef'.repeat(32)}),prepare:async()=>{calls.push('prepare');const first=!prepared;prepared=true;return first;}};
 const client={select:async()=>{calls.push('select');throw Error('lost');},status:async()=>{calls.push('status');return {version:1,state:'pending',code:'pending',usage:null};}};
 const coordinator=createLightweightAnswer({current:async()=>true,clientForActor:()=>client,resolveIdentity:async()=>({kind:'resolved',product:{id:tid,sku:'x8266'}}),evidence:async i=>{await i.beforeDispatch({requestBodySha256:digest,productSku:'x8266'});try {const wire=await i.client.select({subject:'user',sessionId:'session',prepared:{requestBodySha256:digest,input:{fragments:[{handle:'h',text:'x'}]}}});return {outcome:{kind:'unavailable'},wire};}catch{return {outcome:{kind:'unavailable'},wire:'unknown'};}}});
 const input={thread:tid,requestId:rid,question:'question',productSku:'x8266',store};
 for(let n=0;n<2;n++)await assert.rejects(coordinator(actor,input,new Request('http://localhost'),()=>{}));
 assert.deepEqual(calls,['prepare','select','prepare','status']);
});
test('revocation before preparation prevents dispatch and durable preparation',async()=>{
 let calls=0;
 const store={scope:async()=>({productId:tid,sku:'x8266',scopeHash:'ef'.repeat(32)}),prepare:async()=>{calls++;return true;}};
 const coordinator=createLightweightAnswer({current:async()=>false,clientForActor:()=>({select:async()=>{calls++;},status:async()=>{calls++;}}),resolveIdentity:async()=>({kind:'resolved',product:{id:tid,sku:'x8266'}}),evidence:async i=>{await i.beforeDispatch({requestBodySha256:digest,productSku:'x8266'});assert.fail('must not proceed');}});
 await assert.rejects(coordinator(actor,{thread:tid,requestId:rid,question:'question',productSku:'x8266',store},new Request('http://localhost'),()=>{}));
 assert.equal(calls,0);
});
test('store rejects malformed RPC results and does not surface provider error details',async()=>{
 const a={...actor,client:{database:{schema:()=>({rpc:async()=>({})}),rpc:async()=>({data:null,error:{code:'P0001',details:'private provider details'}})}}};
 const store=createLightweightStore(a,key);
 await assert.rejects(store.prepare(tid,rid,'question',{productId:tid,sku:'x8266',scopeHash:'ef'.repeat(32)},digest),e=>e.code==='unavailable' && !e.message.includes('private'));
 assert.throws(()=>createLightweightStore(a,'bad'),e=>e.code==='unavailable');
});
test('reconciliation checks stored digest, SKU, product and scope before status',async()=>{
 const scope={productId:tid,sku:'x8266',scopeHash:'ef'.repeat(32)}, execution={prepared:true,digest,...scope};
 for(const modified of [{digest:'00'.repeat(32)},{sku:'different'},{productId:rid},{scopeHash:'00'.repeat(32)}]) {
  let calls=0;
  const store={scope:async()=>scope,prepare:async()=>assert.fail('GET cannot prepare')};
  const coordinator=createLightweightAnswer({current:async()=>true,clientForActor:()=>({select:async()=>{calls++;},status:async()=>{calls++;}}),resolveIdentity:async()=>({kind:'resolved',product:{id:tid,sku:'x8266'}}),evidence:async i=>{await i.beforeDispatch({requestBodySha256:digest,productSku:'x8266'});return {outcome:{kind:'insufficient'},wire:null};}});
  await assert.rejects(coordinator(actor,{thread:tid,requestId:rid,question:'question',productSku:'x8266',store,reconcileOnly:true,execution:{...execution,...modified}},new Request('http://localhost'),()=>{}));assert.equal(calls,0);
 }
});
test('abort while prepare is in flight prevents model dispatch',async()=>{
 const controller=new AbortController();let calls=0;
 const store={scope:async()=>({productId:tid,sku:'x8266',scopeHash:'ef'.repeat(32)}),prepare:async()=>{controller.abort();return true;}};
 const coordinator=createLightweightAnswer({current:async()=>true,clientForActor:()=>({select:async()=>{calls++;},status:async()=>{calls++;}}),resolveIdentity:async()=>({kind:'resolved',product:{id:tid,sku:'x8266'}}),evidence:async i=>{await i.beforeDispatch({requestBodySha256:digest,productSku:'x8266'});await i.client.select({subject:'user',sessionId:'session',prepared:{requestBodySha256:digest,input:{fragments:[]}}});return {outcome:{kind:'insufficient'},wire:null};}});
 await assert.rejects(coordinator(actor,{thread:tid,requestId:rid,question:'question',productSku:'x8266',store},new Request('http://localhost',{signal:controller.signal}),()=>{}));assert.equal(calls,0);
});
test('execution metadata is owner-scoped and rejects incomplete projections',async()=>{
 let data={prepared:true,digest,sku:'x8266',scopeHash:'ef'.repeat(32),productId:tid}, args;
 const a={...actor,client:{database:{schema:()=>({rpc:async()=>({})}),rpc:async(name,params)=>{assert.equal(name,'panda_agent_lightweight_execution');args=params;return {data,error:null};}}}};
 const store=createLightweightStore(a,key);
 assert.deepEqual(await store.execution(tid,rid),data);assert.deepEqual(args,{p_thread:tid,p_request:rid});
 data={prepared:true,digest,sku:'x8266',scopeHash:null,productId:tid};await assert.rejects(store.execution(tid,rid));
 data={prepared:false,digest:null,sku:null,scopeHash:null,productId:null};assert.equal((await store.execution(tid,rid)).prepared,false);
});
test('cancel signs only owner turn and nullable digest',async()=>{
 let payload;
 const projection={thread:{id:tid,title:'Test',updatedAt:'2026-01-01T00:00:00Z',status:'idle'},messages:[],turns:[]};
 const a={...actor,client:{database:{schema:()=>({rpc:async()=>({})}),rpc:async(name,args)=>{assert.equal(name,'panda_agent_lightweight_cancel');payload=JSON.parse(args.p_payload);assert.equal(args.p_mac,createHmac('sha256',Buffer.from(key,'hex')).update(`panda-lightweight-db-v1\n${args.p_payload}`).digest('hex'));return {data:projection,error:null};}}}};
 const store=createLightweightStore(a,key);
 for(const d of [null,digest]){await store.cancel(tid,rid,d);assert.deepEqual(Object.keys(payload).sort(),['action','digest','exp','request','subject','thread','v']);assert.equal(payload.action,'cancel');assert.equal(payload.digest,d);}
});
