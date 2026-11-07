import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelCatalogHandler, projectModelCatalog } from '../src/control-room/model-catalog.ts';
const item=(id='openai/example')=>({id,name:'Example',context_length:128000,pricing:{prompt:'0.00000015',completion:'0.0000006'}});
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
test('projects only bounded model names, IDs, contexts and price strings',()=>{
 const result=projectModelCatalog({data:[item(),item(),{...item('bad id')},{...item('x'),pricing:{prompt:'-1',completion:'0'}},{...item('y'),context_length:0},{...item('z'),name:'bad\nname'}]});
 assert.deepEqual(result,[{id:'openai/example',name:'Example',context:128000,promptPerToken:'0.00000015',completionPerToken:'0.0000006'}]);
 assert.throws(()=>projectModelCatalog({data:[]}));assert.throws(()=>projectModelCatalog({data:new Array(5001).fill(item())}));
});
test('authorizes every call, caches public data and rechecks access before release',async()=>{
 let checks=0,calls=0,time=0,allowed=true;
 const handler=createModelCatalogHandler(async()=>{checks++;return allowed?{allowed:true}:{allowed:false,status:403};},async(url,options)=>{calls++;assert.equal(url,'https://openrouter.ai/api/v1/models');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,undefined);return json({data:[item()]});},()=>time);
 assert.equal((await handler()).status,200);assert.equal((await handler()).status,200);assert.equal(calls,1);assert.equal(checks,4);allowed=false;assert.equal((await handler()).status,403);assert.equal(calls,1);allowed=true;time=300001;assert.equal((await handler()).status,200);assert.equal(calls,2);
});
test('denied access or revoked access never receives cached models',async()=>{
 let step=0,calls=0;const handler=createModelCatalogHandler(async()=>++step===1?{allowed:true}:{allowed:false,status:403},async()=>{calls++;return json({data:[item()]});});const response=await handler();assert.equal(response.status,403);assert.equal((await response.json()).models,undefined);assert.equal(calls,1);assert.equal(response.headers.get('cache-control'),'private, no-store');
 const denied=createModelCatalogHandler(async()=>({allowed:false,status:401}),async()=>{throw Error('must not call');});assert.equal((await denied()).status,401);
});
test('provider failures, malformed data, wrong content type and oversized body are unavailable',async()=>{
 for(const response of [new Response('{}',{status:503}),new Response('{}'),json({data:[]}),new Response('x'.repeat(8*1024*1024+1),{headers:{'content-type':'application/json'}})]) {
  const handler=createModelCatalogHandler(async()=>({allowed:true}),async()=>response);assert.equal((await handler()).status,503);
 }
});
