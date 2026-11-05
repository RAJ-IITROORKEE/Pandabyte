import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boundedAgentFetch} from '../src/server/lightweight-fetch.ts';

test('deadline covers a response body that stalls after headers without retry',async()=>{
  let calls=0;
  const transport=async(_input,init)=>{calls++;return new Response(new ReadableStream({start(controller){init.signal.addEventListener('abort',()=>controller.error(Error('aborted')),{once:true});}}));};
  await assert.rejects(boundedAgentFetch(transport,20)('https://fixture.invalid'),/aborted/);
  assert.equal(calls,1);
});
test('response cap and caller cancellation fail closed',async()=>{
  await assert.rejects(boundedAgentFetch(async()=>new Response(new Uint8Array(4*1024*1024+1)))('https://fixture.invalid'),/too large/);
  const abort=new AbortController();abort.abort();
  let seen;
  await assert.rejects(boundedAgentFetch(async(_input,init)=>{seen=init.signal.aborted;throw Error('aborted');})('https://fixture.invalid',{signal:abort.signal}));
  assert.equal(seen,true);
});
test('bounded body remains readable by the SDK and uses private nonredirecting transport',async()=>{
  let options;
  const response=await boundedAgentFetch(async(_input,init)=>{options=init;return Response.json({ok:true});})('https://fixture.invalid');
  assert.deepEqual(await response.json(),{ok:true});assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');
});
