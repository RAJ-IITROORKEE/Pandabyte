import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createDiagnosticStore} from '../src/server/diagnostic-store.ts';
import {cleanAnswer} from '../src/server/chat-store.ts';
const thread='11111111-1111-4111-8111-111111111111',request='22222222-2222-4222-8222-222222222222',key='ab'.repeat(32);
const input={errorText:'fatal error: driver/gpio.h missing',chip:'esp32',framework:'esp-idf',frameworkVersion:'5.5.1'};
const read={thread:{id:thread,title:'Test',updatedAt:'2026-01-01T00:00:00Z',status:'idle'},messages:[],turns:[]};
const citation={kind:'vendor',vendor:'espressif',chip:'esp32',framework:'esp-idf',frameworkVersion:'5.5.1',id:'S1',title:'GPIO & RTC GPIO',sourceUrl:'https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-reference/peripherals/gpio.html',capturedAt:'2026-11-05T00:00:00.000000Z',quote:'#include "driver/gpio.h"',sectionPath:['API Reference - Normal GPIO','Header File']};
test('diagnostic store binds exact HMAC domain and immutable input without leaking RPC internals',async()=>{
 const seen=[];const actor={subject:'test',client:{database:{rpc:async(name,args)=>{
  const p=JSON.parse(args.p_payload);seen.push({name,p});assert.equal(args.p_mac,createHmac('sha256',Buffer.from(key,'hex')).update('panda-diagnostic-db-v1\n'+args.p_payload).digest('hex'));
  return {data:{...read,admitted:true,privateField:'hidden'},error:null};
 }}}};
 const store=createDiagnosticStore(actor,key);const started=await store.begin(thread,request,input);assert.equal(started.admitted,true);assert.equal(started.privateField,undefined);
 await store.complete(thread,request,{outcome:'evidence',text:'Reviewed directive [S1]',citations:[citation],privateField:'hidden'},'a'.repeat(64),[{sourceId:'espressif-esp-idf-5.5.1-esp32-gpio',versionId:request,contentHash:'b'.repeat(64)}]);
 assert.equal(seen[0].name,'panda_agent_diagnostic_begin');assert.deepEqual(seen[0].p.diagnostic,input);assert.equal(seen[1].p.answer.privateField,undefined);assert.equal(seen[1].p.answer.citations[0].kind,'vendor');
 assert.deepEqual(Object.keys(seen[1].p).sort(),['action','answer','bindings','exp','request','scopeHash','subject','thread','v']);
});
test('vendor public DTO is distinct, pinned and preserves array sections and strict quote budget',()=>{
 assert.deepEqual(cleanAnswer({outcome:'evidence',text:'Reviewed',citations:[citation]}).citations,[citation]);
 for(const bad of [{...citation,frameworkVersion:'stable'},{...citation,chip:'esp32c3'},{...citation,sectionPath:'Header File'},{...citation,quote:'x'.repeat(601)},{...citation,sourceUrl:'https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/gpio.html'}])assert.throws(()=>cleanAnswer({outcome:'evidence',text:'Bad',citations:[bad]}));
});
test('diagnostic execution rejects unexpected fields and RPC errors stay generic',async()=>{
 let data={input,qaSkillEpoch:0,scopeHash:null,bindings:[],toolEpoch:null,toolDispatched:false,toolResult:null},error=null;
 const actor={subject:'test',client:{database:{rpc:async()=>({data,error})}}};const store=createDiagnosticStore(actor,key);
 assert.deepEqual((await store.execution(thread,request)).input,input);
 data={...data,secret:'hidden'};await assert.rejects(store.execution(thread,request),e=>e.code==='unavailable');
 error={code:'P0001',details:'private diagnostic error'};await assert.rejects(store.execution(thread,request),e=>e.code==='unavailable'&&!e.message.includes('private'));
});
