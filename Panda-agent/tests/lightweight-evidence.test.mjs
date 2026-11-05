import test from 'node:test';
import assert from 'node:assert/strict';
import { answerWithLightweight } from '../src/lightweight/evidence.ts';

test('missing injected RAG client fails closed without calling selector', async () => {
 let called = 0;
 const result = await answerWithLightweight({subject:'user',sessionId:'session',turnId:'11111111-1111-4111-8111-111111111111',productSku:'SKU',question:'what?',ragClient:null,client:{select:async()=>{called++;}},beforeDispatch:async()=>{called++;}});
 assert.equal(result.outcome.kind,'unavailable');
 assert.equal(called,0);
});

test('only the supplied RAG client receives projection calls', async () => {
 let calls = 0, selected = 0;
 const ragClient = {database:{rpc:async()=>{calls++; return {data:null,error:'unavailable'};}}};
 const result = await answerWithLightweight({subject:'user',sessionId:'session',turnId:'11111111-1111-4111-8111-111111111111',productSku:'SKU',question:'what?',ragClient,client:{select:async()=>{selected++;}},beforeDispatch:async()=>{selected++;}});
 assert.equal(result.outcome.kind,'unavailable');
 assert.equal(calls,1);
 assert.equal(selected,0);
});
