import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentationHandler} from '../src/server/documentation-api.ts';
import {parseDocumentationDTO} from '../src/diagnostics/documentation-contracts.ts';
import {searchVendorManifest} from '../src/diagnostics/tool-broker.ts';
import {ChatStoreError} from '../src/server/chat-store.ts';
const id='espressif-esp-idf-5.5.1-esp32-gpio';
const directive='#include "driver/gpio.h"';
const req=(method,body,origin='http://localhost')=>new Request('http://localhost/api/admin/panda-agent/documentation',{method,headers:{origin,'content-type':'application/json'},...(body===undefined?{}:{body})});
function fixture(){let admin=true,current=true,fetches=0,captures=[];const store={documentation:async()=>({documents:[],tools:[]}),capture:async(...args)=>captures.push(args),changeVendor:async()=>{},changeTool:async()=>{}};const handler=createDocumentationHandler({authenticate:async()=>({subject:'actor',sessionId:'session'}),current:async()=>current,canAdmin:async()=>admin,store:()=>store,fetchDocument:async()=>{fetches++;return {contentHash:'a'.repeat(64),fetchedAt:'2026-11-05T00:00:00Z',fragments:['unreviewed prose',directive]}}});return {handler,setAdmin:v=>admin=v,setCurrent:v=>current=v,get:()=>({fetches,captures})};}
test('non-admin and invalid requests never fetch or mutate',async()=>{const f=fixture();f.setAdmin(false);assert.equal((await f.handler(req('POST',JSON.stringify({catalogId:id,rightsEvidence:'source',attribution:'Espressif'})))).status,403);assert.equal(f.get().fetches,0);f.setAdmin(true);for(const s of ['{"catalogId":"x","catalogId":"y"}',JSON.stringify({catalogId:id,rightsEvidence:'ok',attribution:'ok',url:'x'})])assert.equal((await f.handler(req('POST',s))).status,400);assert.equal(f.get().fetches,0)});
test('capture retains only licensed directive and fails closed when current session revoked',async()=>{const f=fixture();assert.equal((await f.handler(req('POST',JSON.stringify({catalogId:id,rightsEvidence:'source',attribution:'Espressif'})))).status,200);assert.deepEqual(f.get().captures[0][1].fragments,[directive]);f.setCurrent(false);assert.equal((await f.handler(req('GET'))).status,401)});
test('invalid UTF-8, foreign origin and conflicting changes fail safely',async()=>{
 const f=fixture();const bad=new Request('http://localhost/api/admin/panda-agent/documentation',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:new Uint8Array([255])});assert.equal((await f.handler(bad)).status,400);
 assert.equal((await f.handler(req('POST','{}','https://evil.example'))).status,403);assert.equal(f.get().fetches,0);
 const s={documentation:async()=>({documents:[],tools:[]}),capture:async()=>{},changeVendor:async()=>{throw new ChatStoreError('conflict')},changeTool:async()=>{throw new ChatStoreError('conflict')}};
 const h=createDocumentationHandler({authenticate:async()=>({subject:'x',sessionId:'s'}),current:async()=>true,canAdmin:async()=>true,store:()=>s});
 assert.equal((await h(req('PATCH',JSON.stringify({target:'tool',toolId:'search_vendor_docs',expectedVersion:1,enabled:true,reason:'test'})))).status,409);
});
test('session revocation while a fetch is in flight prevents capture',async()=>{
 let current=true,called=0;const store={documentation:async()=>({documents:[],tools:[]}),capture:async()=>called++,changeVendor:async()=>{},changeTool:async()=>{}};
 const h=createDocumentationHandler({authenticate:async()=>({subject:'x',sessionId:'s'}),current:async()=>current,canAdmin:async()=>true,store:()=>store,fetchDocument:async()=>{current=false;return {contentHash:'a'.repeat(64),fetchedAt:'2026-11-05T00:00:00Z',fragments:[directive]}}});
 assert.equal((await h(req('POST',JSON.stringify({catalogId:id,rightsEvidence:'source',attribution:'Espressif'})))).status,401);assert.equal(called,0);
});
test('session revocation after database read withholds projection and patch strips routing tag',async()=>{
 let current=true,changed;const store={documentation:async()=>{current=false;return {documents:[],tools:[]}},capture:async()=>{},changeVendor:async(v)=>{changed=v},changeTool:async()=>{}};
 const h=createDocumentationHandler({authenticate:async()=>({subject:'x',sessionId:'s'}),current:async()=>current,canAdmin:async()=>true,store:()=>store});
 const patch={target:'document',versionId:'11111111-1111-4111-8111-111111111111',expectedVersion:2,action:'approve',rights:'permitted',rightsEvidence:' evidence ',reason:' reason '};
 assert.equal((await h(req('PATCH',JSON.stringify(patch)))).status,401);assert.deepEqual(changed,{versionId:patch.versionId,expectedVersion:2,action:'approve',rights:'permitted',rightsEvidence:'evidence',reason:'reason'});
});
test('safe DTO projects approved fields and rejects forged manifest or source',()=>{
 const {hash,...manifest}=searchVendorManifest;const dto={documents:[{catalogId:id,title:'GPIO & RTC GPIO',sourceUrl:'https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-reference/peripherals/gpio.html',chip:'esp32',framework:'esp-idf',frameworkVersion:'5.5.1',version:1,currentVersion:null,versions:[],history:[],actor:'sensitive'}],tools:[{id:'search_vendor_docs',enabled:false,version:0,manifest,hash,history:[],actor:'sensitive'}]};
 const projected=parseDocumentationDTO(dto);assert.ok(projected);assert.equal(JSON.stringify(projected).includes('sensitive'),false);
 assert.equal(parseDocumentationDTO({...dto,documents:[{...dto.documents[0],sourceUrl:'https://evil.example'}]}),null);
 assert.equal(parseDocumentationDTO({...dto,tools:[{...dto.tools[0],manifest:{...manifest,inputSchema:{...manifest.inputSchema,private:'bad'}}}]}),null);
});
test('version values beyond SQL nine-digit bound are rejected before mutation',async()=>{
 let calls=0;const s={documentation:async()=>({documents:[],tools:[]}),capture:async()=>{},changeVendor:async()=>{},changeTool:async()=>calls++};
 const h=createDocumentationHandler({authenticate:async()=>({subject:'x',sessionId:'s'}),current:async()=>true,canAdmin:async()=>true,store:()=>s});
 assert.equal((await h(req('PATCH',JSON.stringify({target:'tool',toolId:'search_vendor_docs',expectedVersion:1000000000,enabled:true,reason:'test'})))).status,400);assert.equal(calls,0);
});
test('deadline during fetch never admits a late capture',async()=>{
 let release,calls=0;const barrier=new Promise(resolve=>release=resolve);const s={documentation:async()=>({documents:[],tools:[]}),capture:async()=>calls++,changeVendor:async()=>{},changeTool:async()=>{}};
 const h=createDocumentationHandler({deadlineMs:10,authenticate:async()=>({subject:'x',sessionId:'s'}),current:async()=>true,canAdmin:async()=>true,store:()=>s,fetchDocument:async()=>{await barrier;return {contentHash:'a'.repeat(64),fetchedAt:'2026-11-05T00:00:00Z',fragments:[directive]}}});
 assert.equal((await h(req('POST',JSON.stringify({catalogId:id,rightsEvidence:'source',attribution:'Espressif'})))).status,503);release();await new Promise(resolve=>setTimeout(resolve,5));assert.equal(calls,0);
});
test('slow body is canceled and cannot reach fetch',async()=>{
 let canceled=false,fetches=0;const body=new ReadableStream({pull:()=>new Promise(()=>{}),cancel:()=>{canceled=true}});
 const h=createDocumentationHandler({deadlineMs:200,bodyDeadlineMs:10,authenticate:async()=>({subject:'x',sessionId:'s'}),current:async()=>true,canAdmin:async()=>true,store:()=>({}),fetchDocument:async()=>{fetches++;throw Error()}});
 const r=new Request('http://localhost/api/admin/panda-agent/documentation',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body,duplex:'half'});assert.equal((await h(r)).status,408);assert.equal(canceled,true);assert.equal(fetches,0);
});
test('late current-session check cannot initiate a mutation',async()=>{
 let release,checks=0,calls=0;const held=new Promise(resolve=>release=resolve);const s={documentation:async()=>({documents:[],tools:[]}),capture:async()=>{},changeVendor:async()=>{},changeTool:async()=>calls++};
 const h=createDocumentationHandler({deadlineMs:10,authenticate:async()=>({subject:'x',sessionId:'s'}),current:async()=>{checks++;if(checks===3)await held;return true},canAdmin:async()=>true,store:()=>s});
 const pending=h(req('PATCH',JSON.stringify({target:'tool',toolId:'search_vendor_docs',expectedVersion:0,enabled:true,reason:'test'})));assert.equal((await pending).status,503);release();await new Promise(resolve=>setTimeout(resolve,5));assert.equal(calls,0);
});
