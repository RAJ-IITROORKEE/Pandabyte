import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { executionConfig, executionIdentityMatches, verifiedExecutionConfig } from '../src/opencode/execution-runtime.ts';
import { startNativeExecution } from '../scripts/start-native-execution.mjs';
const root=resolve('tmp/native-fixture'), plugin=resolve(root,'retry-plugin');
const config=executionConfig('http://127.0.0.1:4567/v1',plugin);

test('fixed V2 config refuses foreign providers and disables automatic behavior',()=>{
 assert.throws(()=>executionConfig('https://example.com/v1',plugin));
 assert.throws(()=>executionConfig('http://127.0.0.1:99999/v1',plugin));
 assert.deepEqual(config.compaction,{auto:false}); assert.equal(config.experimental.background_compaction,false); assert.equal(config.warming,false);
 assert.equal(config.snapshots,false); assert.deepEqual(config.permissions,[{action:'*',resource:'*',effect:'deny'}]);
 assert.equal('permission' in config,false); assert.equal('provider' in config,false);
});
test('configuration identity rejects inherited, changed, or V1 configuration',()=>{
 const path=resolve(root,'config','opencode.json'); const loaded=[{path,info:config}];
 assert.equal(verifiedExecutionConfig(loaded,config,root),true);
 assert.equal(verifiedExecutionConfig([...loaded,{path:resolve('foreign.json'),info:{}}],config,root),false);
 assert.equal(verifiedExecutionConfig([{path,info:{...config,compaction:{auto:true}}}],config,root),false);
 const v1={...config}; delete v1.permissions; v1.permission={};
 assert.equal(verifiedExecutionConfig([{path,info:v1}],config,root),false);
});
test('identity binds PID, version, generation and config hash',()=>{
 const generation='a'.repeat(64), configHash='b'.repeat(64), descriptor={version:'2.2.6',pid:55,baseUrl:'http://127.0.0.1:1',directory:root,generation,configHash};
 assert.equal(executionIdentityMatches(descriptor,{pid:55,version:'2.2.6'},generation,configHash),true);
 assert.equal(executionIdentityMatches(descriptor,{pid:56,version:'2.2.6'},generation,configHash),false);
 assert.equal(executionIdentityMatches(descriptor,{pid:55,version:'2.2.6'},'c'.repeat(64),configHash),false);
 assert.equal(executionIdentityMatches(descriptor,{pid:55,version:'2.2.6'},generation,'d'.repeat(64)),false);
});
test('actual isolated 2.2.6 effective config', {skip:process.platform!=='win32' || process.env.PANDA_NATIVE_226_TEST!=='true',timeout:60000},async()=>{
 const runtime=await startNativeExecution({gatewayUrl:'http://127.0.0.1:4567/v1',token:'a'.repeat(64)});
 try {assert.equal(await runtime.current(),true); assert.equal(runtime.descriptor.version,'2.2.6');} finally {await runtime.close();}
});

test('native 2.2.6 sends the fixed system and user message to a scripted local model', {skip:process.platform!=='win32' || process.env.PANDA_NATIVE_226_TEST!=='true',timeout:90000},async()=>{
 const {createServer}=await import('node:http'); const {once}=await import('node:events'); const {createNativeSessionClient}=await import('../src/opencode/session-client.ts');
 const {createNativeReceipt,createNativeMessageID}=await import('../src/opencode/session-contracts.ts');
 const {assistantSystemPrompt}=await import('../src/opencode/assistant-artifacts.ts');
 const token='a'.repeat(64), question='Explain I2C briefly.', seen=[];
 const server=createServer(async(req,res)=>{
   const chunks=[]; for await(const part of req) chunks.push(part);
   const body=JSON.parse(Buffer.concat(chunks).toString()); seen.push({body,authorization:req.headers.authorization,path:req.url});
   res.writeHead(200,{'content-type':'text/event-stream'});
   const write=(delta,finish_reason=null)=>res.write(`data: ${JSON.stringify({id:'chatcmpl-fixture',object:'chat.completion.chunk',created:1,model:'openai/gpt-6-luna',choices:[{index:0,delta,finish_reason}]})}\n\n`);
   write({role:'assistant',content:'{"version":1,"type":"answer","answer":"I2C is a serial bus."}'}); write({},'stop'); res.end('data: [DONE]\n\n');
 });
 server.listen(0,'127.0.0.1'); await once(server,'listening'); let runtime;
 try {
   runtime=await startNativeExecution({gatewayUrl:`http://127.0.0.1:${server.address().port}/v1`,token});
   const native=createNativeSessionClient({...runtime.descriptor,password:runtime.password,expectedPid:runtime.descriptor.pid,expectedVersion:'2.2.6',timeoutMs:10000});
   const receipt=createNativeReceipt('playground','b'.repeat(64)), access=async()=>await runtime.current(), messageID=createNativeMessageID();
   await native.create(receipt,access); await native.prompt(receipt,{messageID,text:question},access);
   let state,active; const deadline=Date.now()+30000;
   do { await new Promise(done=>setTimeout(done,150)); state=await native.get(receipt,access); active=await native.active(receipt,access); } while ((!state.outcome || active.active) && Date.now()<deadline);
   assert.equal(state.outcome,'succeeded'); const messages=await native.messages(receipt,access);
   assert.ok(JSON.stringify(messages).includes('I2C is a serial bus.'));
   assert.equal(seen.length,1); assert.equal(seen[0].path,'/v1/chat/completions'); assert.equal(seen[0].authorization,`Bearer ${token}`);
   const system=seen[0].body.messages.find(x=>x.role==='system').content;
   assert.ok(system.startsWith(assistantSystemPrompt));
   assert.ok(system.includes('PandaByte') || system.includes('PandaByteAgentRuntime'));
   assert.equal(system.toLowerCase().includes(process.cwd().toLowerCase()),false);
   if (process.env.USERNAME) assert.equal(system.toLowerCase().includes(process.env.USERNAME.toLowerCase()),false);
   assert.equal(JSON.stringify(seen[0].body.messages).includes('MAXIMUM STEPS REACHED'),false);
   assert.equal(seen[0].body.stream,true); assert.ok(seen[0].body.messages.some(x=>x.role==='system' && typeof x.content==='string' && x.content.includes(assistantSystemPrompt)));
   assert.ok(seen[0].body.messages.some(x=>x.role==='user' && JSON.stringify(x.content).includes(question))); assert.ok(!seen[0].body.tools?.length);
   await native.remove(receipt,access);
 } finally { await runtime?.close(); server.closeAllConnections(); await new Promise(done=>server.close(done)); }
});






test('native 2.2.6 does not retry a scripted provider 429', {skip:process.platform!=='win32' || process.env.PANDA_NATIVE_226_TEST!=='true',timeout:60000},async()=>{
 const {createServer}=await import('node:http'); const {once}=await import('node:events');
 const {createNativeSessionClient}=await import('../src/opencode/session-client.ts'); const {createNativeReceipt,createNativeMessageID}=await import('../src/opencode/session-contracts.ts');
 let requests=0; const server=createServer((req,res)=>{ requests++; req.resume(); res.writeHead(429,{'content-type':'application/json'}); res.end('{"error":{"message":"synthetic rate limit"}}'); });
 server.listen(0,'127.0.0.1'); await once(server,'listening'); let runtime;
 try {
  runtime=await startNativeExecution({gatewayUrl:`http://127.0.0.1:${server.address().port}/v1`,token:'a'.repeat(64)});
  const native=createNativeSessionClient({...runtime.descriptor,password:runtime.password,expectedPid:runtime.descriptor.pid,expectedVersion:'2.2.6',timeoutMs:10000});
  const receipt=createNativeReceipt('playground','c'.repeat(64)), access=async()=>await runtime.current();
  await native.create(receipt,access); await native.prompt(receipt,{messageID:createNativeMessageID(),text:'Synthetic retry check.'},access);
  let state, active; const deadline=Date.now()+20000;
  do { await new Promise(done=>setTimeout(done,150)); state=await native.get(receipt,access); active=await native.active(receipt,access); } while ((!state.outcome || active.active) && Date.now()<deadline);
  assert.equal(state.outcome,'failed'); assert.equal(requests,1);
  await new Promise(done=>setTimeout(done,1000)); assert.equal(requests,1);
  await native.remove(receipt,access);
 } finally { await runtime?.close(); server.closeAllConnections(); await new Promise(done=>server.close(done)); }
});

test('ambiguous outcome close retains only the isolated private instance', {skip:process.platform!=='win32' || process.env.PANDA_NATIVE_226_TEST!=='true',timeout:60000},async()=>{
 const fs=await import('node:fs/promises'); const path=await import('node:path');
 const runtime=await startNativeExecution({gatewayUrl:'http://127.0.0.1:4567/v1',token:'a'.repeat(64)});
 const root=path.dirname(runtime.descriptor.directory), parent=path.dirname(root), identity=await fs.lstat(root);
 await runtime.close({preserveContext:true});
 assert.equal(await runtime.current(),false);
 const marker=await fs.readFile(path.join(root,'.pandabyte-marker'),'utf8'); assert.match(marker,/^[a-f0-9]{64}$/);
 // The synthetic test fixture is safe to remove only after the same ownership checks as the supervisor.
 assert.ok(['C:\\ProgramData\\PandaByte\\AgentRuntime','C:\\PandaByteAgentRuntime'].some(p=>path.resolve(p).toLowerCase()===parent.toLowerCase()));
 assert.match(path.basename(root),/^pandabyte-native-execution-/); assert.equal((await fs.realpath(root)).toLowerCase(),root.toLowerCase());
 const after=await fs.lstat(root); assert.equal(after.isSymbolicLink(),false); assert.equal(after.dev,identity.dev); assert.equal(after.ino,identity.ino);
 await fs.rm(root,{recursive:true,force:true});
});
