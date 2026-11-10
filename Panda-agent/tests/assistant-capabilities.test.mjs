import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantCapabilities } from '../src/server/assistant-capabilities.ts';
test('capabilities require actor, runtime, privacy and budget together and stay private', async () => {
  for (const [actor, enabled, current, runtime, admitted, expected] of [[null,true,true,true,true,401],[{},false,true,true,true,'disabled'],[{},true,false,true,true,'connection_unavailable'],[{},true,true,false,true,'runtime_unavailable'],[{},true,true,true,false,'privacy_or_budget_unavailable'],[{},true,true,true,true,null]]) {
    const r = await createAssistantCapabilities({ enabled: () => enabled, authenticate: async () => actor, inspect: async () => ({ current, runtime, admitted, remainingNanoUsd: 982011800 }) })();
    assert.equal(r.headers.get('cache-control'), 'private, no-store');
    const value = await r.json();
    if (expected === 401) assert.equal(r.status,401);
    else { assert.equal(value.reason,expected); assert.equal(value.status,expected===null?'ready':'unavailable'); assert.equal(value.rag,false); assert.deepEqual(value.tools,[]); assert.equal(value.model,expected===null?'GPT-6 Luna':null); }
  }
});
test('broken inspection or malformed allowance cannot enable inference',async()=>{
  for (const inspect of [async()=>{throw Error('private');},async()=>({current:true,runtime:true,admitted:true,remainingNanoUsd:1000000001})]) {
    const r=await createAssistantCapabilities({enabled:()=>true,authenticate:async()=>({}),inspect})(); const v=await r.json();assert.equal(v.status,'unavailable');assert.equal(JSON.stringify(v).includes('private'),false);
  }
});
