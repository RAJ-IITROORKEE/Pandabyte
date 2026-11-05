import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiagnosticAnswer} from '../src/server/diagnostic-answer.ts';
import {searchVendorManifest} from '../src/diagnostics/tool-broker.ts';
const input={errorText:'fatal error: driver/gpio.h missing',chip:'esp32',framework:'esp-idf',frameworkVersion:'5.5.1'};
const execution={input,qaSkillEpoch:0,scopeHash:null,bindings:[],toolEpoch:null,toolDispatched:false,toolResult:null};
const actor={subject:'actor',sessionId:'session'};
test('optional lookup transmits only fixed public scope and returns labeled references without canonical citations',async()=>{
 let calls=0,claims=0;const records=[];const store={scope:async()=>null,toolState:async()=>({id:'search_vendor_docs',enabled:true,version:2,hash:searchVendorManifest.hash}),claimTool:async()=>{claims++;return true},recordTool:async(...args)=>records.push(args)};
 const answer=await createDiagnosticAnswer({current:async()=>true,externalEnabled:()=>true,fetchDocument:async(id)=>{calls++;assert.equal(id,'espressif-esp-idf-5.5.1-esp32-gpio');return {fetchedAt:'2026-11-05T00:00:00Z',fragments:[],contentHash:'a'.repeat(64)};}})(actor,'thread','request',execution,store,new Request('http://localhost/test'),()=>{});
 assert.equal(calls,1);assert.equal(claims,1);assert.equal(records.length,1);assert.deepEqual(answer.answer.citations,[]);assert.match(answer.answer.text,/unreviewed external reference/i);assert.match(answer.answer.text,/2026-11-05/);assert.doesNotMatch(answer.answer.text,/compiled successfully/i);
});
test('status reconciliation never repeats an external request and unknown lookup stays honest',async()=>{
 let calls=0;const store={scope:async()=>null,toolState:async()=>{throw Error('not used')}};
 const answer=await createDiagnosticAnswer({current:async()=>true,externalEnabled:()=>true,fetchDocument:async()=>{calls++;throw Error('not used')}})(actor,'thread','request',{...execution,toolDispatched:true,toolEpoch:1},store,new Request('http://localhost/test'),()=>{},true);
 assert.equal(calls,0);assert.match(answer.answer.text,/not repeated/i);assert.deepEqual(answer.bindings,[]);
});
test('revoked session stops before corpus or optional lookup',async()=>{
 let reads=0;const run=createDiagnosticAnswer({current:async()=>false,externalEnabled:()=>true});
 await assert.rejects(run(actor,'thread','request',execution,{scope:async()=>{reads++}},new Request('http://localhost/test'),()=>{}),e=>e.code==='unauthenticated');assert.equal(reads,0);
});
test('conflicting chip, framework or version never claims an external lookup',async()=>{
 for(const errorText of ['Arduino GPIO error','ESP32-C3 GPIO error','ESP-IDF v5.4.3 GPIO error','GPIO wiring pinout']){
  let calls=0;const run=createDiagnosticAnswer({current:async()=>true,externalEnabled:()=>true,fetchDocument:async()=>{calls++;throw Error('unexpected')}});
  const store={scope:async()=>null,toolState:async()=>{calls++;throw Error('unexpected')}};
  const result=await run(actor,'thread','request',{...execution,input:{...input,errorText}},store,new Request('http://localhost/test'),()=>{});
  assert.equal(calls,0);assert.deepEqual(result.answer.citations,[]);
 }
});
