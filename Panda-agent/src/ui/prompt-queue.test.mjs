import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueuePrompt, nextQueuedPrompt } from './prompt-queue.ts';
test('bounds queued text and keeps each prompt bound to its chat',()=>{ let q=[]; for (let i=0;i<3;i++) q=enqueuePrompt(q,{id:String(i),threadId:'a',text:'hello'}); assert.equal(enqueuePrompt(q,{id:'4',threadId:'a',text:'extra'}).length,3); assert.equal(nextQueuedPrompt(q,'b'),null); assert.equal(nextQueuedPrompt(q,'a')?.id,'0'); assert.equal(enqueuePrompt([],{id:'x',threadId:'a',text:' '.repeat(5)}).length,0); });
