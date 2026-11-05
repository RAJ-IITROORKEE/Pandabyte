import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createGuideStore} from '../src/server/guide-store.ts';
const thread='11111111-1111-4111-8111-111111111111',request='22222222-2222-4222-8222-222222222222',key='ab'.repeat(32),guide={goal:'Build',board:'BOARD',components:[],expectedVersion:0};
const read={thread:{id:thread,title:'Test',updatedAt:'2026-01-01T00:00:00Z',status:'idle'},messages:[],turns:[],projectMemory:{version:0,guideTurns:0,compactions:0,intent:null,questions:[],recentGoals:[]}};
test('guide store signs exact domain and projects only safe public fields',async()=>{
 const seen=[];const actor={subject:'user',client:{database:{rpc:async(name,args)=>{const payload=JSON.parse(args.p_payload);seen.push({name,payload});assert.equal(args.p_mac,createHmac('sha256',Buffer.from(key,'hex')).update(`panda-guide-db-v1\n${args.p_payload}`).digest('hex'));return {data:{...read,privateField:'hidden',...(payload.action==='begin'?{admitted:true}:{})},error:null};}}}};
 const store=createGuideStore(actor,key),start=await store.begin(thread,request,guide);
 assert.equal(start.admitted,true);assert.equal(start.privateField,undefined);assert.deepEqual(start.projectMemory,read.projectMemory);
 await store.complete(thread,request,{outcome:'insufficient',text:'Safe',citations:[],privateField:'hidden'},false);
 assert.deepEqual(Object.keys(seen[0].payload).sort(),['action','exp','guide','request','subject','thread','v']);
 assert.deepEqual(Object.keys(seen[1].payload).sort(),['action','answer','exp','request','subject','success','thread','v']);assert.equal(seen[1].payload.success,false);assert.equal(seen[1].payload.answer.privateField,undefined);
});
test('guide execution rejects invalid fields and maps RPC errors safely',async()=>{
 let data={input:guide,skill:{id:'embedded-project-guide',version:1,hash:'a'.repeat(64)},epoch:1,prepared:false,digest:null,productId:null,productSku:null,scopeHash:null},error=null;
 const actor={subject:'user',client:{database:{rpc:async()=>({data,error})}}},store=createGuideStore(actor,key);
 assert.equal((await store.execution(thread,request)).prepared,false);
 data={...data,extra:'private'};await assert.rejects(store.execution(thread,request),e=>e.code==='unavailable');
 error={code:'P0001',details:'secret'};await assert.rejects(store.execution(thread,request),e=>e.code==='unavailable' && !e.message.includes('secret'));
});
