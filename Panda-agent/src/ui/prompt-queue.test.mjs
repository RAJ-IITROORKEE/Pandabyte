import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueuePrompt, nextQueuedPrompt, queuedModelReady } from './prompt-queue.ts';
test('bounds queued text and keeps each prompt bound to its chat',()=>{ let q=[]; for (let i=0;i<3;i++) q=enqueuePrompt(q,{id:String(i),threadId:'a',text:'hello'}); assert.equal(enqueuePrompt(q,{id:'4',threadId:'a',text:'extra'}).length,3); assert.equal(nextQueuedPrompt(q,'b'),null); assert.equal(nextQueuedPrompt(q,'a')?.id,'0'); assert.equal(enqueuePrompt([],{id:'x',threadId:'a',text:' '.repeat(5)}).length,0); });

test('queued messages retain their selected model without substitution',()=>{
 const a=enqueuePrompt([],{id:'a',threadId:'a',text:'one',modelId:'openai/gpt-6-luna'});const b=enqueuePrompt(a,{id:'b',threadId:'a',text:'two',modelId:'deepseek/deepseek-v3.2-exp'});assert.equal(nextQueuedPrompt(b,'a').modelId,'openai/gpt-6-luna');assert.equal(nextQueuedPrompt(b.slice(1),'a').modelId,'deepseek/deepseek-v3.2-exp');assert.equal(enqueuePrompt([],{id:'x',threadId:'a',text:'x',modelId:'other'}).length,0);
});

test('a queued model is never replaced when its readiness changes',()=>{
 const item={id:'x',threadId:'t',text:'follow-up',modelId:'deepseek/deepseek-v3.2-exp'};
 assert.equal(queuedModelReady(item,[{id:'openai/gpt-6-luna',enabled:true},{id:item.modelId,enabled:false}]),false);
 assert.equal(queuedModelReady(item,[{id:item.modelId,enabled:true}]),true);
 assert.equal(queuedModelReady({...item,modelId:undefined},[{id:'openai/gpt-6-luna',enabled:true}]),false);
});
