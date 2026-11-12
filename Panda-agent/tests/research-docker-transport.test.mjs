import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchDockerTransport } from '../src/server/research-docker-transport.ts';
import { researchProfileSelection } from '../runtime/opencode/research-profile.mjs';

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

test('selected search transport binds profile on the proxy wire and permits only its create permissions', async () => {
 const seen = [], transport = createResearchDockerTransport({ ...base, profile: 'tavily-search', run: async wire => { seen.push(wire); return response; } });
 assert.deepEqual(transport.createBody.permissions, [{ action: '*', resource: '*', effect: 'deny' }, { action: 'panda_research_search', resource: '*', effect: 'allow' }]);
 await transport.request('POST', '/api/session', transport.createBody);
 assert.equal(seen[0].profile, 'tavily-search');
 await assert.rejects(() => transport.request('POST', '/api/session', { ...transport.createBody, permissions: [{ action: '*', resource: '*', effect: 'deny' }, { action: 'panda_research_echo', resource: '*', effect: 'allow' }] }));
 await transport.close(); assert.throws(() => createResearchDockerTransport({ ...base, profile: 'foreign' }));
});

test('hosted transport creates only the guarded hosted model and denies a synthetic model under that profile', async () => {
 const seen = [], transport = createResearchDockerTransport({ ...base, profile: 'tavily-hosted', run: async wire => { seen.push(wire); return response; } });
 assert.deepEqual(transport.createBody.model, { providerID: 'panda-research-hosted', id: 'openai/gpt-oss-20b' });
 await transport.request('POST', '/api/session', transport.createBody); assert.equal(seen[0].profile, 'tavily-hosted');
 await assert.rejects(() => transport.request('POST', '/api/session', { ...transport.createBody, model: { providerID: 'panda-research-fixture', id: 'panda-fixture' } }));
 await transport.close();
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
 await transport.request('POST',`/api/session/${sessionID}/compact`,{});
 assert.equal(seen.length,3);
 await assert.rejects(()=>transport.request('POST',`/api/session/${sessionID}/compact`,{auto:true}));
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
for(const profile of ['synthetic-echo','tavily-search','tavily-hosted','tavily-hosted-luna','tavily-hosted-terra','tavily-hosted-haiku'])test('actual private channel fixes broker path and generation for '+profile,{timeout:15000},async()=>{
 const {spawn}=await import('node:child_process');const {createInterface}=await import('node:readline');
 const child=spawn(process.execPath,['Panda-agent/runtime/opencode/research-provider-channel.mjs'],{stdio:['pipe','pipe','pipe'],env:{...process.env,PANDA_RESEARCH_CHANNEL_TOKEN:'a'.repeat(64),PANDA_RESEARCH_GENERATION:generation,PANDA_RESEARCH_PROFILE:profile}});
 const lines=createInterface({input:child.stdout}),queue=[],waiters=[];let errors='';child.stderr.on('data',part=>errors+=part);
 lines.on('line',line=>{const item=JSON.parse(line);const waiter=waiters.shift();if(waiter)waiter(item);else queue.push(item);});
 const next=()=>queue.length?Promise.resolve(queue.shift()):new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('channel timeout '+errors)),3000);waiters.push(value=>{clearTimeout(timer);resolve(value);});});
 try{
  assert.deepEqual(await next(),{version:1,type:'ready'});
  const headers={authorization:'Bearer '+'a'.repeat(64),'content-type':'application/json','x-panda-native-session':sessionID,'x-panda-native-kind':'primary','x-panda-native-generation':generation};
  const body=JSON.stringify({model:researchProfileSelection(profile).modelID});
  const request=fetch('http://127.0.0.1:4175/v1/chat/completions',{method:'POST',headers,body,signal:AbortSignal.timeout(5000)});
  const frame=await next();assert.equal(frame.channel,'provider');assert.equal(frame.headers.authorization,undefined);assert.equal(Buffer.from(frame.body,'base64').toString(),body);
  child.stdin.write(JSON.stringify({version:1,type:'response',id:frame.id,status:200,contentType:'text/event-stream',body:Buffer.from('data: [DONE]\n\n').toString('base64')})+'\n');
  const result=await request;assert.equal(await result.text(),'data: [DONE]\n\n');
  const denied=await fetch('http://127.0.0.1:4175/v1/chat/completions',{method:'POST',headers:{...headers,'x-panda-native-generation':'f'.repeat(64)},body:'{}'});assert.equal(denied.status,403);
  const path=profile==='synthetic-echo'?'/echo':'/search',foreign=profile==='synthetic-echo'?'/search':'/echo';
  const rejected=await fetch('http://127.0.0.1:4174'+foreign,{method:'POST',headers:{authorization:headers.authorization,'content-type':'application/json'},body:JSON.stringify({generation})});assert.equal(rejected.status,403);
  const brokerRequest=fetch('http://127.0.0.1:4174'+path,{method:'POST',headers:{authorization:headers.authorization,'content-type':'application/json'},body:JSON.stringify({generation}),signal:AbortSignal.timeout(5000)});
  const brokerFrame=await next();assert.equal(brokerFrame.channel,'broker');assert.equal(brokerFrame.path,path);assert.equal(brokerFrame.id,frame.id+1);
  child.stdin.write(JSON.stringify({version:1,type:'response',id:brokerFrame.id,status:200,contentType:'application/json',body:Buffer.from('{"content":[]}').toString('base64')})+'\n');
  assert.equal((await brokerRequest).status,200);
 }finally{const {once}=await import('node:events');const exit=once(child,'close');child.stdin.end();child.kill();await exit;lines.close();}
});
test('actual HTTP proxy accepts the full allowed escaped prompt wire without replay',{timeout:15000},async()=>{
 const {spawn}=await import('node:child_process');const {createServer}=await import('node:http');const {once}=await import('node:events');
 let nativeRequests=0;
 const server=createServer(async(req,res)=>{nativeRequests++;const parts=[];for await(const part of req)parts.push(part);assert.equal(JSON.parse(Buffer.concat(parts).toString()).text,'"'.repeat(48000));res.writeHead(200,{'content-type':'application/json'}).end('{"data":{"accepted":true}}');});
 server.listen(4172,'127.0.0.1');await once(server,'listening');
 const transport=createResearchDockerTransport({...base,run:async wire=>{
  assert.ok(Buffer.byteLength(JSON.stringify(wire))>110000);
  const child=spawn(process.execPath,['Panda-agent/runtime/opencode/research-http-proxy.mjs'],{stdio:['pipe','pipe','pipe'],env:{...process.env,PANDA_NATIVE_PASSWORD:'a'.repeat(64),PANDA_RESEARCH_GENERATION:generation,PANDA_RESEARCH_PROFILE:'synthetic-echo'}});
  const chunks=[];child.stdout.on('data',part=>chunks.push(part));child.stdin.end(JSON.stringify(wire));const [exit]=await once(child,'close');assert.equal(exit,0);
  const response=JSON.parse(Buffer.concat(chunks).toString());return {...response,body:Buffer.from(response.body,'base64').toString()};
 }});
 try{const result=await transport.request('POST',`/api/session/${sessionID}/prompt`,{id:'msg_abcdef123456ABCDEFGHIJKLMN',text:'"'.repeat(48000)});assert.equal(JSON.parse(result.body).data.accepted,true);assert.equal(nativeRequests,1);}
 finally{await transport.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
});

test('actual HTTP proxy binds hosted create identity and rejects a changed model or profile before native admission', { timeout: 15000 }, async () => {
 const { spawn } = await import('node:child_process'), { createServer } = await import('node:http'), { once } = await import('node:events');
 let nativeRequests = 0;
 const server = createServer(async (request, reply) => {
  nativeRequests++; const parts = []; for await (const part of request) parts.push(part);
  assert.equal(request.url, '/api/session');
  assert.deepEqual(JSON.parse(Buffer.concat(parts).toString()).model, { providerID: 'panda-research-hosted', id: 'openai/gpt-oss-20b' });
  reply.writeHead(200, { 'content-type': 'application/json' }).end('{"data":{"accepted":true}}');
 });
 server.listen(4172, '127.0.0.1'); await once(server, 'listening');
 const transport = createResearchDockerTransport({ ...base, profile: 'tavily-hosted' });
 const wire = { sessionID, generation, profile: 'tavily-hosted', directory: '/runtime/workspace', ownership, method: 'POST', path: '/api/session', body: JSON.stringify(transport.createBody) };
 async function proxy(input) {
  const child = spawn(process.execPath, ['Panda-agent/runtime/opencode/research-http-proxy.mjs'], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PANDA_NATIVE_PASSWORD: 'a'.repeat(64), PANDA_RESEARCH_GENERATION: generation, PANDA_RESEARCH_PROFILE: 'tavily-hosted' } });
  child.stdin.end(JSON.stringify(input)); const [exit] = await once(child, 'close'); return exit;
 }
 try {
  assert.equal(await proxy(wire), 0);
  assert.equal(await proxy({ ...wire, profile: 'tavily-search' }), 1);
  assert.equal(await proxy({ ...wire, body: JSON.stringify({ ...transport.createBody, model: { providerID: 'panda-research-fixture', id: 'panda-fixture' } }) }), 1);
  assert.equal(nativeRequests, 1);
 } finally { await transport.close(); server.closeAllConnections(); await new Promise(done => server.close(done)); }
});

test('research transport accepts every hosted profile and rejects unknown ones',()=>{
 for(const profile of ['tavily-hosted','tavily-hosted-luna','tavily-hosted-terra','tavily-hosted-haiku'])assert.ok(createResearchDockerTransport({...base,profile,run:async()=>response}),profile);
 assert.throws(()=>createResearchDockerTransport({...base,profile:'tavily-hosted-sonnet',run:async()=>response}));
});

const imgPng = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('synthetic png body')]), imgJpg = Buffer.concat([Buffer.from('ffd8ff', 'hex'), Buffer.from('synthetic jpeg body')]);
const pngUri = 'data:image/png;base64,' + imgPng.toString('base64'), jpgUri = 'data:image/jpeg;base64,' + imgJpg.toString('base64');
const msgID = 'msg_abcdef123456ABCDEFGHIJKLMN', promptPath = `/api/session/${sessionID}/prompt`;
const maxPng = (() => { const b = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(49152 - 8, 7)]); return 'data:image/png;base64,' + b.toString('base64'); })();
const visionProfiles = ['tavily-hosted-luna', 'tavily-hosted-terra', 'tavily-hosted-haiku'], plainProfiles = ['synthetic-echo', 'tavily-search', 'tavily-hosted'];
const nonCanonical = uri => { const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', at = uri.replace(/=+$/, '').length - 1, changed = uri.slice(0, at) + alphabet[alphabet.indexOf(uri[at]) | 1] + uri.slice(at + 1); assert.notEqual(changed, uri); assert.deepEqual(Buffer.from(changed.split(',')[1], 'base64'), Buffer.from(uri.split(',')[1], 'base64')); return changed; };
const imageBody = (over = {}) => ({ id: msgID, text: 'describe', files: [{ uri: pngUri, name: 'image.png' }], ...over });
const badImageBodies = () => [
 imageBody({ text: 'x'.repeat(4001) }), imageBody({ text: 'é'.repeat(2001) }), imageBody({ files: [] }),
 imageBody({ files: [{ uri: pngUri, name: 'image.png' }, { uri: pngUri, name: 'image.png' }] }),
 imageBody({ files: [{ uri: pngUri, name: 'image.jpg' }] }), imageBody({ files: [{ uri: pngUri, name: 'photo.png' }] }),
 imageBody({ files: [{ uri: jpgUri, name: 'image.png' }] }), imageBody({ files: [{ uri: pngUri, name: 'image.png', extra: 1 }] }),
 imageBody({ files: [{ uri: pngUri }] }), imageBody({ files: [{ name: 'image.png' }] }), imageBody({ files: { uri: pngUri, name: 'image.png' } }),
 imageBody({ files: [{ uri: pngUri.replace('image/png', 'image/jpeg'), name: 'image.jpg' }] }),
 imageBody({ files: [{ uri: 'data:image/gif;base64,R0lGODlh', name: 'image.png' }] }),
 imageBody({ files: [{ uri: 'https://example.test/a.png', name: 'image.png' }] }), imageBody({ files: [{ uri: 'data:image/png;base64,' + 'A'.repeat(65540), name: 'image.png' }] }),
 imageBody({ files: [{ uri: pngUri.replace(/=+$/, ''), name: 'image.png' }] }), imageBody({ files: [{ uri: pngUri + '=', name: 'image.png' }] }),
 imageBody({ files: [{ uri: 'data:image/png;base64,', name: 'image.png' }] }), imageBody({ text: ' ' }), imageBody({ extra: 1 }),
 { id: msgID, files: [{ uri: pngUri, name: 'image.png' }] },
 // Non-canonical base64: same decoded bytes, but unused low bits set in the last data character (review C4 mutation 13).
 imageBody({ files: [{ uri: nonCanonical(pngUri), name: 'image.png' }] }),
];

test('image prompt bodies pass transport only for vision profiles and only in the exact shape', async () => {
 for (const profile of visionProfiles) {
  let calls = 0; const transport = createResearchDockerTransport({ ...base, profile, run: async () => { calls++; return response; } });
  await transport.request('POST', promptPath, imageBody());
  await transport.request('POST', promptPath, imageBody({ files: [{ uri: jpgUri, name: 'image.jpg' }] }));
  await transport.request('POST', promptPath, imageBody({ files: [{ uri: maxPng, name: 'image.png' }] }));
  await transport.request('POST', promptPath, { id: msgID, text: 'x'.repeat(96000) });
  await transport.request('POST', promptPath, imageBody({ text: 'x'.repeat(4000) }));
  assert.equal(calls, 5, profile);
  for (const body of badImageBodies()) await assert.rejects(() => transport.request('POST', promptPath, body), JSON.stringify(body).slice(0, 80));
  assert.equal(calls, 5, profile); await transport.close();
 }
});
test('image prompt bodies are rejected for every non-vision profile before Docker', async () => {
 for (const profile of plainProfiles) {
  let calls = 0; const transport = createResearchDockerTransport({ ...base, profile, run: async () => { calls++; return response; } });
  await assert.rejects(() => transport.request('POST', promptPath, imageBody())); await transport.request('POST', promptPath, { id: msgID, text: 'plain' });
  assert.equal(calls, 1, profile); await transport.close();
 }
});

test('actual HTTP proxy mirrors the per-profile image allowlist and size bounds', { timeout: 90000 }, async () => {
 const { spawn } = await import('node:child_process'), { createServer } = await import('node:http'), { once } = await import('node:events');
 let nativeRequests = 0;
 const server = createServer(async (request, reply) => { nativeRequests++; for await (const part of request) void part; reply.writeHead(200, { 'content-type': 'application/json' }).end('{"data":{}}'); });
 server.listen(4172, '127.0.0.1'); await once(server, 'listening');
 async function proxy(profile, body) {
  const wire = { sessionID, generation, profile, directory: '/runtime/workspace', ownership, method: 'POST', path: promptPath, body: JSON.stringify(body) };
  const child = spawn(process.execPath, ['Panda-agent/runtime/opencode/research-http-proxy.mjs'], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PANDA_NATIVE_PASSWORD: 'a'.repeat(64), PANDA_RESEARCH_GENERATION: generation, PANDA_RESEARCH_PROFILE: profile } });
  child.stdin.end(JSON.stringify(wire)); const [exit] = await once(child, 'close'); return exit;
 }
 try {
  for (const profile of visionProfiles) {
   const before = nativeRequests;
   assert.equal(await proxy(profile, imageBody()), 0, profile);
   assert.equal(await proxy(profile, imageBody({ files: [{ uri: jpgUri, name: 'image.jpg' }] })), 0);
   assert.equal(await proxy(profile, imageBody({ files: [{ uri: maxPng, name: 'image.png' }] })), 0);
   assert.equal(await proxy(profile, imageBody({ text: 'x'.repeat(4000) })), 0);
   assert.equal(await proxy(profile, { id: msgID, text: 'x'.repeat(96000) }), 0);
   assert.equal(nativeRequests - before, 5);
   for (const body of badImageBodies()) assert.equal(await proxy(profile, body), 1, JSON.stringify(body).slice(0, 80));
   assert.equal(nativeRequests - before, 5, 'rejected bodies never reach native');
  }
  for (const profile of plainProfiles) { const before = nativeRequests; assert.equal(await proxy(profile, imageBody()), 1, profile); assert.equal(await proxy(profile, { id: msgID, text: 'plain' }), 0); assert.equal(nativeRequests - before, 1); }
 } finally { server.closeAllConnections(); await new Promise(done => server.close(done)); }
});
