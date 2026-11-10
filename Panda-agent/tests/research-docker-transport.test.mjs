import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchDockerTransport } from '../src/server/research-docker-transport.ts';

const sessionID='ses_abcdef123456ABCDEFGHIJKLMN', generation='1'.repeat(64);
const ownership={binding:'2'.repeat(64),owner:'3'.repeat(64),profileHash:'4'.repeat(64)};
const base={containerId:'a'.repeat(64),sessionID,generation,directory:'/runtime/workspace',ownership};
const response={status:200,contentType:'application/json',body:'{"data":{}}'};
test('research transport binds the narrow native surface and preserves actual responses',async()=>{
 const seen=[];const transport=createResearchDockerTransport({...base,run:async q=>{seen.push(q);return response;}});
 assert.deepEqual(await transport.request('GET','/api/info'),response);
 await transport.request('GET',`/api/session/${sessionID}/message?limit=100&order=asc`);
 assert.equal(seen.length,2);assert.equal(seen[0].sessionID,sessionID);assert.deepEqual(seen[0].ownership,ownership);
 await transport.close();await assert.rejects(()=>transport.request('GET','/api/info'));
});
test('foreign, arbitrary, malformed and unclaimed mutation shapes fail before Docker',async()=>{
 let calls=0;const transport=createResearchDockerTransport({...base,run:async()=>{calls++;return response;}});
 for(const [method,path,body] of [['GET','/api/session'],['GET',`/api/session/ses_abcdef123456ZZZZZZZZZZZZZZ`],['POST',`/api/session/${sessionID}/resume`,{}],['DELETE',`/api/session/${sessionID}`],['GET','/api/info',{}],['POST',`/api/session/${sessionID}/prompt`,{text:'missing id'}],['POST','/api/session',{id:sessionID,permissions:[]}],['GET',`/api/session/${sessionID}/message?limit=100&cursor=x%2Fy`]]) await assert.rejects(()=>transport.request(method,path,body));
 assert.equal(calls,0);await transport.close();
});
test('prompt has a fixed native id and text bounds; interrupt cannot resume',async()=>{
 const seen=[];const transport=createResearchDockerTransport({...base,run:async q=>{seen.push(q);return response;}});
 await transport.request('POST',`/api/session/${sessionID}/prompt`,{id:'msg_abcdef123456ABCDEFGHIJKLMN',text:'Public fixture query.'});
 await transport.request('POST',`/api/session/${sessionID}/interrupt?resume=false`,{});
 assert.equal(seen.length,2);
 await assert.rejects(()=>transport.request('POST',`/api/session/${sessionID}/prompt`,{id:'msg_abcdef123456ABCDEFGHIJKLMN',text:'x'.repeat(98305)}));
 await assert.rejects(()=>transport.request('POST',`/api/session/${sessionID}/interrupt?resume=true`,{}));
 await transport.close();
});
test('malformed or oversized helper responses remain unavailable without replay',async()=>{
 for(const bad of [{...response,status:0},{...response,body:'x'.repeat(1048577)},{...response,contentType:'text/html'},{...response,body:'\ud800'}]){
  let calls=0;const transport=createResearchDockerTransport({...base,run:async()=>{calls++;return bad;}});
  await assert.rejects(()=>transport.request('GET','/api/info'));assert.equal(calls,1);await transport.close();
 }
});
test('actual private channel forwards bounded provider/broker frames and denies stale generation before forwarding',{timeout:15000},async()=>{
 const {spawn}=await import('node:child_process');const {createInterface}=await import('node:readline');
 const child=spawn(process.execPath,['Panda-agent/runtime/opencode/research-provider-channel.mjs'],{stdio:['pipe','pipe','pipe'],env:{...process.env,PANDA_RESEARCH_CHANNEL_TOKEN:'a'.repeat(64),PANDA_RESEARCH_GENERATION:generation}});
 const lines=createInterface({input:child.stdout}),queue=[],waiters=[];let errors='';child.stderr.on('data',part=>errors+=part);
 lines.on('line',line=>{const item=JSON.parse(line);const waiter=waiters.shift();if(waiter)waiter(item);else queue.push(item);});
 const next=()=>queue.length?Promise.resolve(queue.shift()):new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('channel timeout '+errors)),3000);waiters.push(value=>{clearTimeout(timer);resolve(value);});});
 try{
  assert.deepEqual(await next(),{version:1,type:'ready'});
  const headers={authorization:'Bearer '+'a'.repeat(64),'content-type':'application/json','x-panda-native-session':sessionID,'x-panda-native-kind':'primary','x-panda-native-generation':generation};
  const request=fetch('http://127.0.0.1:4175/v1/chat/completions',{method:'POST',headers,body:'{"model":"panda-fixture"}',signal:AbortSignal.timeout(5000)});
  const frame=await next();assert.equal(frame.channel,'provider');assert.equal(frame.headers.authorization,undefined);assert.equal(Buffer.from(frame.body,'base64').toString(),'{'+'"model":"panda-fixture"}');
  child.stdin.write(JSON.stringify({version:1,type:'response',id:frame.id,status:200,contentType:'text/event-stream',body:Buffer.from('data: [DONE]\n\n').toString('base64')})+'\n');
  const result=await request;assert.equal(await result.text(),'data: [DONE]\n\n');
  const denied=await fetch('http://127.0.0.1:4175/v1/chat/completions',{method:'POST',headers:{...headers,'x-panda-native-generation':'f'.repeat(64)},body:'{}'});assert.equal(denied.status,403);
  const brokerRequest=fetch('http://127.0.0.1:4174/echo',{method:'POST',headers:{authorization:headers.authorization,'content-type':'application/json'},body:JSON.stringify({generation}),signal:AbortSignal.timeout(5000)});
  const brokerFrame=await next();assert.equal(brokerFrame.channel,'broker');assert.equal(brokerFrame.id,frame.id+1);
  child.stdin.write(JSON.stringify({version:1,type:'response',id:brokerFrame.id,status:200,contentType:'application/json',body:Buffer.from('{"content":[]}').toString('base64')})+'\n');
  assert.equal((await brokerRequest).status,200);
 }finally{child.stdin.end();child.kill();lines.close();}
});
test('actual HTTP proxy accepts the full allowed escaped prompt wire without replay',{timeout:15000},async()=>{
 const {spawn}=await import('node:child_process');const {createServer}=await import('node:http');const {once}=await import('node:events');
 let nativeRequests=0;
 const server=createServer(async(req,res)=>{nativeRequests++;const parts=[];for await(const part of req)parts.push(part);assert.equal(JSON.parse(Buffer.concat(parts).toString()).text,'"'.repeat(48000));res.writeHead(200,{'content-type':'application/json'}).end('{"data":{"accepted":true}}');});
 server.listen(4172,'127.0.0.1');await once(server,'listening');
 const transport=createResearchDockerTransport({...base,run:async wire=>{
  assert.ok(Buffer.byteLength(JSON.stringify(wire))>110000);
  const child=spawn(process.execPath,['Panda-agent/runtime/opencode/research-http-proxy.mjs'],{stdio:['pipe','pipe','pipe'],env:{...process.env,PANDA_NATIVE_PASSWORD:'a'.repeat(64),PANDA_RESEARCH_GENERATION:generation}});
  const chunks=[];child.stdout.on('data',part=>chunks.push(part));child.stdin.end(JSON.stringify(wire));const [exit]=await once(child,'close');assert.equal(exit,0);
  const response=JSON.parse(Buffer.concat(chunks).toString());return {...response,body:Buffer.from(response.body,'base64').toString()};
 }});
 try{const result=await transport.request('POST',`/api/session/${sessionID}/prompt`,{id:'msg_abcdef123456ABCDEFGHIJKLMN',text:'"'.repeat(48000)});assert.equal(JSON.parse(result.body).data.accepted,true);assert.equal(nativeRequests,1);}
 finally{await transport.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
});
