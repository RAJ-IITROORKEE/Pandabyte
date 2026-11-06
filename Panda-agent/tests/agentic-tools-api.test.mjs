import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgenticToolsHandler} from '../src/server/agentic-tools-api.ts';
import {agenticManifests} from '../src/agentic/manifests.ts';
const endpoint='https://example.test/api/admin/panda-agent/tools';
const payload={toolId:'fetch_public_docs_mcp',enabled:true,expectedVersion:0,reason:'Reviewed development fixture'};
const request=body=>new Request(endpoint,{method:'PATCH',headers:{origin:'https://example.test','content-type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)});
const tools=agenticManifests.map(m=>({...m,version:0,enabled:false,history:[],health:'not_checked'}));
test('malformed and injected tool requests cannot invoke registry mutation',async()=>{
 let calls=0;
 const actor={subject:'actor',sessionId:'session',client:{database:{rpc:async()=>{calls++;return {data:{tools},error:null};}}}};
 const handle=createAgenticToolsHandler({authenticate:async()=>actor,current:async()=>true});
 for(const body of ['{','{"toolId":"fetch_public_docs_mcp","toolId":"convert_units"}',{...payload,toolId:'shell'},{...payload,url:'http://169.254.169.254'},{...payload,expectedVersion:'0'},{...payload,reason:'x'.repeat(301)}])assert.equal((await handle(request(body))).status,400);
 assert.equal(calls,0);
 assert.equal((await handle(request(payload))).status,200);assert.equal(calls,1);
});
test('genuine actor, origin and current membership errors stay closed',async()=>{
 let calls=0,active=true;
 const actor={subject:'actor',sessionId:'session',client:{database:{rpc:async()=>{calls++;return {data:null,error:{details:'forbidden'}};}}}};
 assert.equal((await createAgenticToolsHandler({authenticate:async()=>null,current:async()=>true})(new Request(endpoint))).status,401);
 const handle=createAgenticToolsHandler({authenticate:async()=>actor,current:async()=>active});
 assert.equal((await handle(new Request(endpoint,{method:'PATCH',headers:{origin:'https://foreign.test','content-type':'application/json'},body:JSON.stringify(payload)}))).status,403);assert.equal(calls,0);
 assert.equal((await handle(request(payload))).status,403);assert.equal(calls,1);
 active=false;assert.equal((await handle(new Request(endpoint))).status,401);assert.equal(calls,1);
});
test('revocation while the registry is read prevents response release',async()=>{
 let active=true;
 const actor={subject:'actor',sessionId:'session',client:{database:{rpc:async()=>{active=false;return {data:{tools},error:null};}}}};
 const response=await createAgenticToolsHandler({authenticate:async()=>actor,current:async()=>active})(new Request(endpoint));
 assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'unauthenticated'});
});
