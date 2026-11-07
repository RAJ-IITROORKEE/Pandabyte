import test from 'node:test';
import assert from 'node:assert/strict';
import { mutationFor, probePolicy, probeTransport, syntheticReply, syntheticServerSource } from '../scripts/opencode-mcp-contract-probe.mjs';

const name='fixture-'+'a'.repeat(32),baseUrl='http://127.0.0.1:43210';
const counters=()=>({add:0,connect:0,disconnect:0,remove:0});

test('synthetic MCP server advertises one readonly tool and refuses all tool execution',()=>{
  const initialized=syntheticReply({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}});
  assert.equal(initialized.result.protocolVersion,'2025-11-25');assert.deepEqual(initialized.result.capabilities,{tools:{listChanged:false}});
  const tools=syntheticReply({id:2,method:'tools/list'}).result.tools;
  assert.equal(tools.length,1);assert.deepEqual(tools[0].inputSchema,{type:'object',properties:{},additionalProperties:false});
  assert.equal(tools[0].annotations.readOnlyHint,true);assert.equal(tools[0].annotations.destructiveHint,false);
  assert.equal(syntheticReply({id:3,method:'tools/call',params:{name:tools[0].name}}).error.code,-32601);
  assert.equal(syntheticReply({method:'notifications/initialized'}),null);
  assert.equal(syntheticServerSource().includes("JSON.stringify(output)+'\\n'"),true);
});

test('isolated policy retains all denies with only one exact owned MCP integration exception',()=>{
  const policy=probePolicy(name);
  assert.deepEqual(policy.permissions,[{action:'*',resource:'*',effect:'deny'}]);
  assert.deepEqual(policy.policies,[...['tool.use','provider.use','integration.use'].map(action=>({action,resource:'*',effect:'deny'})),{action:'integration.use',resource:'mcp:'+name,effect:'allow'}]);
  assert.deepEqual(policy.plugins,[]);assert.deepEqual(policy.skills,[]);assert.deepEqual(policy.mcp,{servers:{}});
  for(const bad of ['*','other','fixture-*','fixture-'+ 'a'.repeat(33)])assert.throws(()=>probePolicy(bad));
});

test('transport rejects outside origins, unrelated integrations, inference and tool execution before network',async()=>{
  let calls=0;
  const transport=probeTransport({baseUrl,name,mutations:counters(),signal:new AbortController().signal,fetch:async()=>{calls++;return Response.json({});}});
  for(const [method,path] of [['POST','/api/session'],['POST','/api/experimental/generate/text'],['PUT','/api/experimental/mcp/unowned'],['GET','/api/provider'],['POST','/api/mcp/resource']])await assert.rejects(transport(baseUrl+path,{method}));
  await assert.rejects(transport('https://outside.invalid/api/info'));
  assert.equal(calls,0);
});

test('each native management mutation has one transport attempt, including lost responses',async()=>{
  const mutations=counters();let calls=0;
  const transport=probeTransport({baseUrl,name,mutations,signal:new AbortController().signal,fetch:async()=>{calls++;throw Error('private transport error');}});
  for(const [method,path,key] of [['PUT','/api/experimental/mcp/'+name,'add'],['POST','/api/experimental/mcp/'+name+'/connect','connect'],['POST','/api/experimental/mcp/'+name+'/disconnect','disconnect'],['DELETE','/api/experimental/mcp/'+name,'remove']]){
    assert.equal(mutationFor(method,path,name),key);
    await assert.rejects(transport(baseUrl+path,{method}));await assert.rejects(transport(baseUrl+path,{method}));
  }
  assert.deepEqual(mutations,{add:1,connect:1,disconnect:1,remove:1});assert.equal(calls,4);
});

test('bounded transport preserves native JSON and empty acknowledgements without redirects',async()=>{
  let mode='json',init;
  const transport=probeTransport({baseUrl,name,mutations:counters(),signal:new AbortController().signal,fetch:async(_url,options)=>{
    init=options;if(mode==='empty')return new Response(null,{status:204});
    if(mode==='large')return new Response('x'.repeat(1_000_001),{headers:{'content-type':'application/json'}});
    if(mode==='redirect'){const response=Response.json({});Object.defineProperty(response,'redirected',{value:true});return response;}
    return Response.json({data:[]});
  }});
  assert.deepEqual(await (await transport(baseUrl+'/api/mcp',{method:'GET'})).json(),{data:[]});
  assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.cache,'no-store');
  mode='empty';assert.equal((await transport(baseUrl+'/api/experimental/mcp/'+name,{method:'PUT'})).status,204);
  for(const value of ['large','redirect']){mode=value;await assert.rejects(transport(baseUrl+'/api/mcp',{method:'GET'}));}
});
