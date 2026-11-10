import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCapabilities } from './capabilities.ts';
const valid = {mode:'native_assistant',model:'GPT-6 Luna',status:'ready',reason:null,rag:false,tools:[],budget:{limitNanoUsd:1000000000,remainingNanoUsd:750000000}};
test('accepts a bounded native capability response',()=>assert.deepEqual(parseCapabilities(valid),valid));
test('rejects invalid budgets and malformed modes',()=>{ assert.equal(parseCapabilities({...valid,budget:{limitNanoUsd:1000000000,remainingNanoUsd:1000000001}}),null); assert.equal(parseCapabilities({...valid,mode:'other'}),null); assert.equal(parseCapabilities({...valid,tools:['x'.repeat(500)]}),null); });
test('rejects unknown reason codes and impossible native claims',()=>{ assert.equal(parseCapabilities({...valid,reason:'private error details'}),null); assert.equal(parseCapabilities({...valid,rag:true}),null); });
