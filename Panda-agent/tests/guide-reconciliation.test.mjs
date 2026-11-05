import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuideAnswer} from '../src/server/guide-answer.ts';

const thread='11111111-1111-4111-8111-111111111111';
const turn='22222222-2222-4222-8222-222222222222';
const product='33333333-3333-4333-8333-333333333333';
function fixture(catalog){
 const actor={subject:'fixture-owner',sessionId:'fixture-session',client:{database:{rpc:async name=>{
  assert.equal(name,'panda_agent_guide_products');return catalog;
 }}}};
 const execution={input:{goal:'Parking monitor',board:'x8266',components:['sensor'],expectedVersion:0},skill:{id:'embedded-project-guide',version:1,hash:'a'.repeat(64)},epoch:4,prepared:true,digest:'b'.repeat(64),productId:product,productSku:'x8266',scopeHash:'c'.repeat(64)};
 const answer=createGuideAnswer({current:async()=>true,baseUrl:'http://127.0.0.1:1',secret:'fixture-secret'});
 const run=(value=execution,reconcile=true)=>answer(actor,thread,turn,value,{prepare:async()=>assert.fail('must not prepare a reconciliation')},new Request('http://localhost/'),()=>{},reconcile);
 return {run,execution};
}

test('prepared guide with withdrawn catalog identity returns only a terminal note for SQL fencing',async t=>{
 const network=t.mock.method(globalThis,'fetch',async()=>assert.fail('must not execute or read a worker'));
 for(const catalog of [
  {data:{items:[]},error:null},
  {data:{items:[{id:'44444444-4444-4444-8444-444444444444',sku:'x8266',title:'x8266 board'}]},error:null},
 ]){
  const answer=await fixture(catalog).run();
  assert.equal(answer.outcome,'insufficient');assert.deepEqual(answer.citations,[]);assert.equal(answer.guideSucceeded,false);
  assert.doesNotMatch(answer.text,/\[S\d+\]|Microcontroller:|MCU:/);
 }
 assert.equal(network.mock.callCount(),0);
});

test('catalog outage or malformed projection preserves unknown reconciliation instead of terminalizing',async t=>{
 const network=t.mock.method(globalThis,'fetch',async()=>assert.fail('must not contact worker'));
 for(const catalog of [{data:null,error:{}},{data:{items:null},error:null},{data:{items:[{id:product,sku:'x8266'}]},error:null}]){
  await assert.rejects(fixture(catalog).run());
 }
 const f=fixture({data:{items:[]},error:null});
 await assert.rejects(f.run({...f.execution,prepared:false,digest:null,productId:null,productSku:null,scopeHash:null}));
 assert.equal(network.mock.callCount(),0);
});
