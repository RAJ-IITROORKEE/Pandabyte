import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCapabilities, modelChoices, disabledModelReasons, hostedModelChoices, hostedDisabledModelReasons, activeModelLabel, isChatModelId } from './capabilities.ts';
const models=modelChoices.map((m,i)=>({...m,enabled:i===0,reason:i===0?null:disabledModelReasons[i]}));
const valid = {models,mode:'native_assistant',model:'GPT-6 Luna',status:'ready',reason:null,rag:false,tools:[],skills:[],budget:{limitNanoUsd:1000000000,remainingNanoUsd:750000000}};
test('accepts a bounded native capability response',()=>assert.deepEqual(parseCapabilities(valid),valid));
test('rejects invalid budgets and malformed modes',()=>{ assert.equal(parseCapabilities({...valid,budget:{limitNanoUsd:1000000000,remainingNanoUsd:1000000001}}),null); assert.equal(parseCapabilities({...valid,mode:'other'}),null); assert.equal(parseCapabilities({...valid,tools:['x'.repeat(500)]}),null); });
test('rejects unknown reason codes and impossible native claims',()=>{ assert.equal(parseCapabilities({...valid,reason:'private error details'}),null); assert.equal(parseCapabilities({...valid,rag:true}),null); });

test('native tools and skills require bounded known IDs and ready status',()=>{
 const tools=['convert_units','format_bom','read_public_docs'],skills=['embedded-explainer','project-planner','bom-assistant','engineering-reviewer'];
 assert.deepEqual(parseCapabilities({...valid,tools,skills}),{...valid,tools,skills});
 assert.equal(parseCapabilities({...valid,tools:['shell']}),null);
 assert.equal(parseCapabilities({...valid,skills:['foreign']}),null);
 assert.equal(parseCapabilities({...valid,tools:['convert_units','convert_units']}),null);
 assert.equal(parseCapabilities({...valid,status:'unavailable',tools}),null);
});

test('only bounded approved choices may be enabled',()=>{
 assert.deepEqual(modelChoices.slice(2).map(m=>m.id),['nvidia/nemotron-3-ultra-550b-a55b:free','deepseek/deepseek-chat-v3-0324','openai/gpt-6.1-terra','anthropic/claude-haiku-5.5']);
 for (const index of [3,4,5]) assert.ok(parseCapabilities({...valid,models:models.map((m,i)=>i===index?{...m,enabled:true,reason:null}:m)}));
 assert.equal(parseCapabilities({...valid,models:models.map((m,i)=>i===2?{...m,enabled:true,reason:null}:m)}),null);
 for (let index=2;index<models.length;index++) assert.equal(parseCapabilities({...valid,models:models.map((m,i)=>i===index?{...m,reason:'unavailable'}:m)}),null);
 assert.equal(parseCapabilities({...valid,models:models.map((m,i)=>i===0?{...m,id:'foreign'}:m)}),null);
});

test('the running model label stays tied to the active request',()=>{
 assert.equal(activeModelLabel(models,'deepseek/deepseek-v3.2-exp','openai/gpt-6-luna'),'GPT-6 Luna');
 assert.equal(activeModelLabel(models,'deepseek/deepseek-v3.2-exp',null),'DeepSeek V3.2 Exp (experimental)');
 assert.equal(activeModelLabel([],'openai/gpt-6-luna',null),'Model unavailable');
});

test('budget reason requires an enabled profile and insufficient bounded allowance',()=>{
 const low={...valid,budget:{limitNanoUsd:1000000000,remainingNanoUsd:10000000}};
 const marked=low.models.map((m,i)=>i===5?{...m,reason:'budget_unavailable'}:m);
 assert.ok(parseCapabilities({...low,models:marked}));
 assert.equal(parseCapabilities({...valid,models:marked}),null);
 assert.equal(parseCapabilities({...low,models:low.models.map((m,i)=>i===2?{...m,reason:'budget_unavailable'}:m)}),null);
});

test('direct assistant exposes Luna only with no native tools or skills',()=>{
 const direct={...valid,mode:'direct_assistant',rag:true};
 assert.ok(parseCapabilities(direct));
 assert.equal(parseCapabilities({...direct,tools:['read_public_docs']}),null);
 assert.equal(parseCapabilities({...direct,skills:['embedded-explainer']}),null);
 assert.equal(parseCapabilities({...direct,models:models.map((m,i)=>i===3?{...m,enabled:true,reason:null}:m)}),null);
});

test('hosted direct capabilities enable only the reviewed zero-retention models', () => {
 const hosted = { ...valid, mode:'direct_assistant', model:'GPT-OSS 20B', budget:null, rag:true, models:hostedModelChoices.map((m,i)=>({...m,enabled:[0,5,6,7,8].includes(i),reason:[0,5,6,7,8].includes(i)?null:hostedDisabledModelReasons[i]})) };
 assert.deepEqual(parseCapabilities(hosted),hosted);
 assert.equal(activeModelLabel(hosted.models,'openai/gpt-oss-20b',null),'GPT-OSS 20B');
 const off={...hosted,model:null,status:'unavailable',reason:'connection_unavailable',rag:false,models:hostedModelChoices.map((m,i)=>({...m,enabled:false,reason:hostedDisabledModelReasons[i]}))};
 assert.deepEqual(parseCapabilities(off),off);
 for(const change of [{mode:'native_assistant'},{mode:'basic_rag'},{model:'GPT-6 Luna'},{status:'unavailable'},{reason:'disabled'},{budget:valid.budget},{tools:['convert_units']},{models:hosted.models.map((m,i)=>i===2?{...m,enabled:true,reason:null}:m)},{models:hosted.models.map((m,i)=>i===6?{...m,label:'Invented',extra:true}:m)}]) assert.equal(parseCapabilities({...hosted,...change}),null);
 assert.equal(parseCapabilities({...off,model:'GPT-OSS 20B'}),null);
 assert.equal(parseCapabilities({...off,rag:true}),null);
 assert.equal(parseCapabilities({...valid,model:'GPT-OSS 20B'}),null);
 assert.equal(isChatModelId('openai/gpt-oss-20b'),true);
 assert.equal(isChatModelId('unverified-model'),false);
 assert.equal(modelChoices.length,6);
});
