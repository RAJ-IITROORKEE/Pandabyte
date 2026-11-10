// Opt-in, zero-provider-cost acceptance on the already selected AWS host.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {researchCodeFiles,researchImageId,researchProfileHash,researchConfig,verifiedResearchConfig,verifyResearchContainer} from '../src/opencode/research-runtime.ts';
import {createNativeReceipt,createNativeMessageID} from '../src/opencode/session-contracts.ts';
import {projectResearchTurn} from '../src/opencode/research-transcript.ts';
import {createResearchProviderGateway,deriveResearchFrontier,hashResearchValue} from '../src/opencode/research-provider-gateway.ts';
import {openResearchRuntimeStore,hashResearchJSON} from '../src/server/research-runtime-store.ts';
import {createResearchDockerTransport} from '../src/server/research-docker-transport.ts';
import {reserveDockerHostSlot} from '../src/server/native-docker-host-quota.ts';

const exec=promisify(execFile),digest=value=>createHash('sha256').update(value).digest('hex'),hex=()=>randomBytes(32).toString('hex');
const operationIdentity=({kind,key,requestHash})=>({kind,key,requestHash});
const pause=ms=>new Promise(done=>setTimeout(done,ms)),root=process.argv[3];
if(process.argv[2]!=='--aws-synthetic'||process.env.PANDA_RESEARCH_AWS_FIXTURE!=='i-05bcf2573a0b77f7a'||process.platform!=='linux'||process.getuid?.()!==0||!/^\/opt\/panda-research-tests\/[a-f0-9]{32}\/runtime$/.test(root??''))throw Error('Explicit selected-host synthetic invocation required');
const command=async(args,env)=> (await exec('docker',args,{timeout:65000,maxBuffer:2097152,env:env?{PATH:process.env.PATH,...env}:undefined})).stdout.trim();
let stage='preflight',runtimeStep='preflight',active,store,codeDirectory,profileHash,retainedUnknown=false;
const counts={providerDispatches:0,toolDispatches:0,deniedAuxiliary:0,unknownReplayDenials:0},checks=[],started=performance.now();
const rootStat=await fs.lstat(root);assert.ok(rootStat.isDirectory()&&!rootStat.isSymbolicLink()&&rootStat.uid===0&&(rootStat.mode&0o777)===0o700);
const image=JSON.parse(await command(['image','inspect',researchImageId]));assert.equal(image.length,1);assert.equal(image[0].Id,researchImageId);assert.equal(image[0].Architecture,'arm64');
const mem=await fs.readFile('/proc/meminfo','utf8');assert.ok(Number(/^MemAvailable:\s+(\d+)/m.exec(mem)?.[1])>=1048576);
const disk=await promisify(execFile)('df',['-Pk',root]);assert.ok(Number(disk.stdout.trim().split('\n').at(-1).trim().split(/\s+/)[3])>=2097152);
const codeSource=fileURLToPath(new URL('../runtime/opencode/',import.meta.url));
const source=Object.fromEntries(await Promise.all(researchCodeFiles.map(async name=>[name,await fs.readFile(path.join(codeSource,name))])));
profileHash=researchProfileHash(source);

async function prepareCode(){
 await fs.mkdir(path.join(root,'code'),{mode:0o700});codeDirectory=path.join(root,'code','mount');await fs.mkdir(codeDirectory,{mode:0o755});
 const files={},directories=new Set();for(const name of researchCodeFiles){const file=path.join(codeDirectory,name),directory=path.dirname(file);if(directory!==codeDirectory&&!directories.has(directory)){await fs.mkdir(directory,{mode:0o700});directories.add(directory);}await fs.writeFile(file,source[name],{mode:0o444,flag:'wx'});await fs.chmod(file,0o444);files[name]=digest(source[name]);}for(const directory of directories)await fs.chmod(directory,0o555);
 const manifest=path.join(codeDirectory,'manifest.json');await fs.writeFile(manifest,JSON.stringify({imageId:researchImageId,profileHash,files}),{mode:0o444,flag:'wx'});await fs.chmod(manifest,0o444);await fs.chmod(codeDirectory,0o555);
}
async function json(transport,method,route,body){const r=await transport.request(method,route,body);assert.equal(r.status,200);return JSON.parse(r.body);}
async function owned(ctx){
 const info=await json(ctx.transport,'GET','/api/info');assert.equal(info.version,'2.2.5');assert.ok(Number.isSafeInteger(info.pid)&&info.pid>0);if(ctx.pid)assert.equal(info.pid,ctx.pid);else ctx.pid=info.pid;
 const data=(await json(ctx.transport,'GET','/api/session/'+ctx.binding.sessionID)).data;
 assert.equal(data.id,ctx.binding.sessionID);assert.deepEqual(data.metadata.pandaResearch,{binding:ctx.binding.binding,owner:ctx.binding.owner,profileHash});return data;
}
async function messages(ctx){
 const rows=[];let cursor;for(let page=0;page<4;page++){
  const query=cursor?'limit=100&cursor='+encodeURIComponent(cursor):'limit=100&order=asc';
  const result=await json(ctx.transport,'GET',`/api/session/${ctx.binding.sessionID}/message?${query}`);assert.ok(Array.isArray(result.data));rows.push(...result.data);assert.ok(rows.length<=200&&Buffer.byteLength(JSON.stringify(rows))<=1048576);
  cursor=result.cursor?.next;if(!cursor)return rows;
 }throw Error('message_bounds');
}
async function observation(ctx){
 const state=await owned(ctx),activeMap=(await json(ctx.transport,'GET','/api/session/active')).data,rows=await messages(ctx);
 return {state,rows,result:projectResearchTurn({messageID:ctx.run.messageID,promptHash:ctx.run.promptHash},{...(state.outcome?{outcome:state.outcome}:{}),time:state.time},Object.hasOwn(activeMap,ctx.binding.sessionID),rows,['panda_research_echo'])};
}
async function terminalProof(ctx){const o=await observation(ctx);if(o.result.state!=='terminal')return null;return {sessionID:ctx.binding.sessionID,messageID:ctx.run.messageID,promptHash:ctx.run.promptHash,outcome:o.result.outcome,active:false};}
async function waitTerminal(ctx,limit=30000){const end=Date.now()+limit;for(;;){const o=await observation(ctx);if(o.result.state==='terminal')return o;if(Date.now()>end)throw Error('native_terminal_timeout');await pause(100);}}
async function replayMcpConnection(ctx,value){
 const envelope=Object.fromEntries(['sessionID','assistantMessageID','toolID','generation','inputHash'].map(key=>[key,value[key]]));
 const child=spawn('docker',['exec','-i',ctx.containerId,'node','/research-code/research-mcp-shim.mjs'],{stdio:['pipe','pipe','ignore']});
 return new Promise((resolve,reject)=>{
  let buffer='',done=false,bytes=0;const finish=error=>{if(done)return;done=true;clearTimeout(timer);child.stdin.end();child.kill();if(error)reject(error);else resolve();};
  const timer=setTimeout(()=>finish(Error('mcp_replay_timeout')),10000);child.on('error',()=>finish(Error('mcp_replay_unavailable')));child.stdin.on('error',()=>finish(Error('mcp_replay_unavailable')));
  child.stdout.on('data',part=>{try{bytes+=part.length;if(bytes>65536)throw Error();buffer+=part.toString('utf8');let at;while((at=buffer.indexOf('\n'))!==-1){const reply=JSON.parse(buffer.slice(0,at));buffer=buffer.slice(at+1);if(reply.id===2){assert.ok(reply.result&&!reply.result.isError);assert.ok(JSON.stringify(reply.result).includes('synthetic-public-evidence'));finish();}}}catch{finish(Error('mcp_replay_invalid'));}});
  child.on('close',()=>{if(!done)finish(Error('mcp_replay_closed'));});
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'synthetic-reconnect',version:'1'}}})+'\n');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'echo',arguments:{...value.input,__pandaNative:envelope},_meta:{'ai.opencode/sessionID':value.sessionID}}})+'\n');
 });
}
async function disconnectChannel(ctx){
 const program="const f=require('node:fs'),c=require('node:crypto');const p='/runtime/state/channel-ready.json',s=f.lstatSync(p),r=JSON.parse(f.readFileSync(p,'utf8'));if(!s.isFile()||s.isSymbolicLink()||s.uid!==10001||(s.mode&511)!==384||r.generation!==process.env.PANDA_RESEARCH_GENERATION||r.tokenHash!==c.createHash('sha256').update(process.env.PANDA_RESEARCH_CHANNEL_TOKEN).digest('hex')||!Number.isSafeInteger(r.pid)||r.pid<2||r.pid===process.pid||!f.readFileSync('/proc/'+r.pid+'/cmdline','utf8').split(String.fromCharCode(0)).includes('/research-code/research-provider-channel.mjs'))throw Error('unverified channel');process.kill(r.pid,'SIGKILL');process.stdout.write('channel disconnected');";
 assert.equal(await command(['exec',ctx.containerId,'node','-e',program]),'channel disconnected');
}

async function attach(ctx){
 runtimeStep='attach_channels';
 ctx.transport=createResearchDockerTransport({containerId:ctx.containerId,sessionID:ctx.binding.sessionID,generation:ctx.generation,directory:'/runtime/workspace',ownership:{binding:ctx.binding.binding,owner:ctx.binding.owner,profileHash}});
 const options={token:ctx.environment.PANDA_RESEARCH_CHANNEL_TOKEN,sessionID:ctx.binding.sessionID,generation:ctx.generation,signal:new AbortController().signal,
  denied:async()=>{counts.deniedAuxiliary++;},
  authorize:async identity=>{
   if(!ctx.run||!await store.current(ctx.run)){counts.unknownReplayDenials++;return null;}
   await owned(ctx);const record=await store.readRun(ctx.run);if(!record)return null;
   const duplicate=record.operations.find(op=>op.kind==='primary'&&op.requestHash===identity.requestHash);
   if(duplicate)return{receipt:ctx.run,operation:{kind:duplicate.kind,key:duplicate.key,requestHash:duplicate.requestHash}};
   const attempts=[];for(const op of record.operations.filter(op=>op.kind==='primary'&&op.state==='settled')){const recovered=await store.recoverOperation(ctx.run,operationIdentity(op));if(recovered.state!=='cached')return null;attempts.push({attemptKey:op.key,result:recovered.result,...(op.association?{assistantMessageID:op.association.assistantMessageID}:{})});}
   const nativeRows=await messages(ctx),frontier=deriveResearchFrontier(ctx.run,nativeRows,attempts,identity.body);if(!frontier){await fs.writeFile(path.join(path.dirname(root),'private-frontier.json'),JSON.stringify({expected:{messageID:ctx.run.messageID,promptHash:ctx.run.promptHash},nativeMessages:nativeRows,attempts,providerBody:identity.body}),{mode:0o600,flag:'wx'});return null;}
   for(const association of frontier.associations){const op=record.operations.find(op=>op.key===association.attemptKey);const step=frontier.frontier.steps.find(step=>step.attemptKey===association.attemptKey);if(!op||!step||!await store.associateOperation(ctx.run,operationIdentity(op),{assistantMessageID:association.assistantMessageID,callsDigest:hashResearchValue(step.calls)}))return null;}
   return {receipt:ctx.run,operation:{kind:'primary',key:hashResearchValue(frontier.frontier),requestHash:identity.requestHash}};
  },
  current:binding=>store.current(binding.receipt),claim:binding=>store.claimOperation(binding.receipt,binding.operation),beforeSend:binding=>store.markSending(binding.receipt,binding.operation),
  settle:async(binding,grant,result)=>{assert.equal(await store.settleOperation(binding.receipt,binding.operation,grant.grant,result),true);if(ctx.scenario==='retire_after_settle')assert.equal(await store.cancelRun(ctx.run,'source_retired'),true);},
  authorizeRelease:(binding,result)=>store.authorizeRelease(binding.receipt,binding.operation,hashResearchJSON(result)),
  complete:async(body,beforeSend)=>{
   if(ctx.scenario==='claim_disconnect')throw Error('synthetic_disconnect_before_send');
   assert.equal(await beforeSend(),true);counts.providerDispatches++;ctx.lastProviderBody=body;
   if(ctx.scenario==='hold'){ctx.holdStarted?.();return new Promise((resolve,reject)=>{ctx.rejectHeld=reject;});}
   if(ctx.scenario==='tool'&&!body.messages.some(m=>m.role==='tool'))return{toolCalls:[{id:'call_fixture_'+ctx.run.runID,name:'panda_research_echo',arguments:{query:'Public I2C fixture'}}],usage:{inputTokens:100,outputTokens:20,costNanoUsd:0}};
   if(ctx.scenario==='recall')assert.ok(JSON.stringify(body.messages).includes('SYNTHETIC-ORCHID-47'));
   if(ctx.scenario==='tool')assert.ok(JSON.stringify(body.messages).includes('synthetic-public-evidence'));
   return {content:ctx.scenario==='tool'?'Synthetic evidence is available.':'SYNTHETIC-ORCHID-47 retained.',usage:{inputTokens:100,outputTokens:20,costNanoUsd:0}};
  }};
 ctx.gateway=createResearchProviderGateway(options);
 await ctx.transport.provider(async request=>{
  ctx.gatewayRequests=(ctx.gatewayRequests??0)+1;
  if(ctx.gatewayRequests===1)await fs.writeFile(path.join(path.dirname(root),'private-provider-'+ctx.binding.binding+'.json'),request.body,{mode:0o600,flag:'wx'});
  const result=await ctx.gateway.handle({...request,headers:{...request.headers,authorization:'Bearer '+ctx.environment.PANDA_RESEARCH_CHANNEL_TOKEN}});
  (ctx.gatewayStatuses??=[]).push(result.status);
  if(result.status===200&&ctx.scenario==='settled_disconnect'){await disconnectChannel(ctx);throw Error('synthetic_connection_lost_after_settlement');}
  if(result.status===200&&ctx.scenario==='native_http_429')return{status:429,contentType:'application/json',body:'{"error":{"message":"Synthetic channel fault"}}'};
  return result;
 });
 await ctx.transport.broker(async request=>{
  const error=()=>({status:403,contentType:'application/json',body:'{}'});
  if(!ctx.run||!await store.current(ctx.run))return error();
  const value=JSON.parse(request.body.toString('utf8'));if(!value||Object.keys(value).sort().join(',')!=='assistantMessageID,generation,input,inputHash,sessionID,toolID'||value.generation!==ctx.generation||value.sessionID!==ctx.binding.sessionID||hashResearchValue(value.input)!==value.inputHash)return error();
  await owned(ctx);const rows=await messages(ctx),user=rows.findIndex(row=>row.id===ctx.run.messageID&&row.type==='user'&&digest(row.text)===ctx.run.promptHash);if(user<0||rows.slice(user+1).some(row=>row.type==='user'))return error();
  const matches=rows.slice(user+1).filter(row=>row.type==='assistant'&&row.id===value.assistantMessageID).flatMap(row=>row.content??[]).filter(part=>part.type==='tool'&&part.id===value.toolID&&part.name==='panda_research_echo'&&part.state?.status==='running'&&hashResearchValue(part.state.input)===value.inputHash);
  if(matches.length!==1)return error();
  const op={kind:'tool',key:hashResearchValue({runID:ctx.run.runID,messageID:value.assistantMessageID,toolID:value.toolID}),requestHash:hashResearchValue({name:'panda_research_echo',input:value.input})};
  const claim=await store.claimOperation(ctx.run,op);let result;
  if(claim.state==='cached'){result=claim.result;ctx.duplicateCached=(ctx.duplicateCached??0)+1;}else if(claim.state==='dispatch'){
   const grant=await store.markSending(ctx.run,op);if(!grant)return error();counts.toolDispatches++;
   result={content:[{type:'text',text:JSON.stringify({query:value.input.query,marker:'synthetic-public-evidence'})}]};
   assert.equal(await store.settleOperation(ctx.run,op,grant.grant,result),true);
  }else return error();
  if(ctx.probeMcp&&!ctx.probeMcpStarted){ctx.probeMcpStarted=true;const before=counts.toolDispatches;await replayMcpConnection(ctx,value);assert.equal(counts.toolDispatches,before);assert.equal(ctx.duplicateCached,1);checks.push('mcp_fresh_connection_duplicate_cached');}
  if(!await store.authorizeRelease(ctx.run,op,hashResearchJSON(result)))return error();return {status:200,contentType:'application/json',body:JSON.stringify(result)};
 });
 runtimeStep='native_readiness';const end=Date.now()+60000;for(;;){try{const info=await json(ctx.transport,'GET','/api/info');assert.equal(info.version,'2.2.5');ctx.pid=info.pid;break;}catch{if(Date.now()>end)throw Error('native_readiness_timeout');await pause(100);}}
 runtimeStep='loaded_config';
 const loaded=await json(ctx.transport,'GET','/api/config');assert.equal(verifiedResearchConfig(loaded,researchConfig(ctx.generation,ctx.environment.PANDA_RESEARCH_CHANNEL_TOKEN)),true);
}
async function launch(ctx){
 runtimeStep='create_container';
 const labels={'panda.research.binding':ctx.binding.binding,'panda.research.profile':profileHash,'panda.native.lease':ctx.lease};
 ctx.environment={PANDA_NATIVE_PASSWORD:hex(),PANDA_RESEARCH_CHANNEL_TOKEN:hex(),PANDA_RESEARCH_GENERATION:ctx.generation};
 const args=['create','--pull=never','--name',ctx.lease,'--network','none','--user','10001:10001','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','384m','--memory-swap','384m','--cpus','1','--pids-limit','128','--workdir','/runtime/workspace','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=16777216,uid=10001,gid=10001,mode=0700','--mount',`type=bind,source=${ctx.nativeDirectory},target=/runtime`,'--mount',`type=bind,source=${codeDirectory},target=/research-code,readonly`];
 for(const[k,v]of Object.entries(labels))args.push('--label',k+'='+v);for(const key of Object.keys(ctx.environment))args.push('--env',key);args.push('--entrypoint','node',researchImageId,'/research-code/research-controller.mjs');
 ctx.createOutcome='uncertain';const created=await command(args,ctx.environment);if(ctx.loseCreateReceipt)throw Error('synthetic_lost_create_receipt');assert.match(created,/^[a-f0-9]{64}$/);ctx.containerId=created;ctx.createOutcome='created';
 runtimeStep='inspect_container';const inspect=JSON.parse(await command(['inspect',ctx.containerId]))[0];
 ctx.inspection={image:inspect.Image===researchImageId,platform:inspect.Platform==='linux',labels:hashResearchValue(inspect.Config.Labels)===hashResearchValue({...image[0].Config.Labels,...labels}),entrypoint:JSON.stringify(inspect.Config.Entrypoint)==='["node"]',command:JSON.stringify(inspect.Config.Cmd)==='["/research-code/research-controller.mjs"]',mountCount:inspect.Mounts.length,networkNames:Object.keys(inspect.NetworkSettings.Networks),state:inspect.State.Status};
 assert.equal(verifyResearchContainer(inspect,{containerId:ctx.containerId,nativeDirectory:ctx.nativeDirectory,codeDirectory,labels,environment:ctx.environment,imageMetadata:image[0]}),true);
 await command(['start',ctx.containerId]);await attach(ctx);
}
async function remove(ctx,release=true){
 await ctx.transport?.close();ctx.rejectHeld?.(Error('synthetic_connection_lost'));await ctx.gateway?.close();
 if(!ctx.containerId&&ctx.createOutcome==='uncertain'){const found=await command(['ps','-aq','--no-trunc','--filter','name=^/'+ctx.lease+'$']);assert.match(found,/^[a-f0-9]{64}$/,'uncertain_create_retains_slot');ctx.containerId=found;}
 if(ctx.containerId){const inspect=JSON.parse(await command(['inspect',ctx.containerId]))[0];assert.equal(inspect.Image,researchImageId);assert.equal(inspect.Config.Labels['panda.native.lease'],ctx.lease);assert.equal(inspect.Config.Labels['panda.research.binding'],ctx.binding.binding);assert.equal(inspect.Config.Labels['panda.research.profile'],profileHash);await command(['rm','-f',ctx.containerId]);assert.equal(await command(['ps','-aq','--no-trunc','--filter','id='+ctx.containerId]),'');ctx.containerId=null;ctx.createOutcome='removed';}
 if(release)await ctx.slot.release();
}
async function newOwner(loseCreateReceipt=false){
 const lease='panda-n45-'+randomBytes(16).toString('hex'),slot=await reserveDockerHostSlot('/opt/panda-n45-admission',lease,true);assert.ok(slot,'native_capacity_occupied');
 const bindingHash=hex(),binding={binding:bindingHash,owner:hex(),sessionID:createNativeReceipt('playground',bindingHash).sessionID,profileHash,imageId:researchImageId,created:Date.now()};
 const ctx={lease,slot,binding,generation:hex(),pid:null,loseCreateReceipt};active=ctx;
 if(!store){await prepareCode();store=await openResearchRuntimeStore(root,{isCurrent:()=>true});}
 assert.equal((await store.createBinding(binding)).state,'created');assert.equal(await store.startGeneration(binding,null,ctx.generation),true);
 ctx.nativeDirectory=path.join(root,'bindings',bindingHash,'native');await fs.mkdir(ctx.nativeDirectory,{mode:0o700});await fs.chown(ctx.nativeDirectory,10001,10001);await fs.mkdir(path.join(ctx.nativeDirectory,'workspace'),{mode:0o700});await fs.chown(path.join(ctx.nativeDirectory,'workspace'),10001,10001);
 await launch(ctx);assert.equal((await store.claimCreate(binding,ctx.generation)).state,'dispatch');
 runtimeStep='create_session';await json(ctx.transport,'POST','/api/session',ctx.transport.createBody);await owned(ctx);assert.equal(await store.markCreated(binding,ctx.generation,{sessionID:binding.sessionID,profileHash}),true);return ctx;
}
async function prompt(ctx,text,scenario){
 runtimeStep='native_prompt_'+scenario;
 ctx.scenario=scenario;ctx.run={binding:ctx.binding.binding,owner:ctx.binding.owner,runID:randomUUID(),messageID:createNativeMessageID(),promptHash:digest(text),sourceRevision:'0'.repeat(64),generation:ctx.generation};
 assert.equal((await store.admitRun(ctx.run)).state,'admitted');assert.equal((await store.claimPrompt(ctx.run)).state,'dispatch');
 const result=await json(ctx.transport,'POST',`/api/session/${ctx.binding.sessionID}/prompt`,{id:ctx.run.messageID,text});assert.ok(result.data);const accepted=await store.markPromptAccepted(ctx.run);if(!accepted){const recorded=await store.readRun(ctx.run);assert.equal(scenario,'retire_after_settle');assert.equal(recorded.cancelled,'source_retired');assert.ok(recorded.operations.length&&recorded.operations.every(op=>op.state==='settled'));}
}
let output;
try{
 stage='native_tool_loop';const first=await newOwner();first.probeMcp=true;await prompt(first,'Use the synthetic public echo fixture.','tool');const tool=await waitTerminal(first);assert.equal(tool.result.outcome,'succeeded');assert.equal(tool.result.tools.length,1);assert.equal(counts.toolDispatches,1);assert.equal(counts.providerDispatches,2);const readCount=counts.providerDispatches;assert.equal(await store.finishRun(first.run,()=>terminalProof(first)),true);assert.equal(await store.current(first.run),false);for(const op of (await store.readRun(first.run)).operations)assert.equal((await store.recoverOperation(first.run,operationIdentity(op))).state,'cached');assert.equal(await store.current(first.run),false);assert.equal(counts.providerDispatches,readCount);checks.push('settled_receipt_read_without_activation');checks.push('native_tool_continuation');
 stage='native_multiturn';await prompt(first,'Remember SYNTHETIC-ORCHID-47 for this synthetic conversation.','plain');assert.equal((await waitTerminal(first)).result.outcome,'succeeded');checks.push('native_two_turn_history');
 stage='native_persistence_restart';const oldGeneration=first.generation;await remove(first,false);first.generation=hex();first.pid=null;assert.equal(await store.startGeneration(first.binding,oldGeneration,first.generation),true);const beforeRestart=counts.providerDispatches;await launch(first);await owned(first);assert.equal(await store.reconcileTerminal(first.binding,first.generation,()=>terminalProof(first)),true);assert.equal(counts.providerDispatches,beforeRestart);checks.push('settled_restart_terminal_reconciliation');await prompt(first,'Recall the earlier synthetic marker.','recall');assert.equal((await waitTerminal(first)).result.outcome,'succeeded');assert.equal(await store.finishRun(first.run,()=>terminalProof(first)),true);checks.push('native_persistent_restart');
 stage='unknown_restart_fence';let hold;const held=new Promise(done=>hold=done);first.holdStarted=hold;await prompt(first,'Synthetic disconnect after send.','hold');await Promise.race([held,pause(15000).then(()=>{throw Error('hold_not_reached');})]);const before=counts.providerDispatches,unknownReceipt=first.run,unknownGeneration=first.generation;await remove(first,false);first.generation=hex();first.pid=null;assert.equal(await store.startGeneration(first.binding,unknownGeneration,first.generation),true);await launch(first);await pause(1000);assert.equal(counts.providerDispatches,before);assert.equal(await store.current(unknownReceipt),false);assert.equal(await store.reconcileTerminal(first.binding,first.generation,()=>terminalProof(first)),false);assert.ok((await store.readRun(unknownReceipt)).operations.some(op=>op.state==='sent'));retainedUnknown=true;checks.push('unknown_restart_no_dispatch');
 await remove(first);active=null;
 stage='second_owner_isolation';const second=await newOwner();const state=await json(second.transport,'GET','/api/session/'+second.binding.sessionID);assert.equal(state.data.id,second.binding.sessionID);await assert.rejects(()=>second.transport.request('GET','/api/session/'+first.binding.sessionID));assert.equal(await store.readRun({...unknownReceipt,owner:second.binding.owner}),null);await prompt(second,'Separate synthetic conversation.','plain');assert.equal((await waitTerminal(second)).result.outcome,'succeeded');const secondRows=await messages(second);assert.equal(JSON.stringify(secondRows).includes('Use the synthetic public echo fixture.'),false);assert.equal(await store.finishRun(second.run,()=>terminalProof(second)),true);checks.push('two_owner_isolation');
 for(const scenario of ['native_http_429','settled_disconnect','retire_after_settle']){
  stage=scenario;const before=counts.providerDispatches;await prompt(second,'Synthetic native transport failure fixture.',scenario);assert.equal((await waitTerminal(second)).result.outcome,'failed');await pause(500);assert.equal(counts.providerDispatches,before+1);const record=await store.readRun(second.run);assert.equal(record.operations.length,1);assert.equal((await store.recoverOperation(second.run,operationIdentity(record.operations[0]))).state,'cached');if(scenario==='retire_after_settle'){assert.equal(await store.current(second.run),false);assert.equal(await store.reconcileTerminal(second.binding,second.generation,()=>terminalProof(second)),true);}else assert.equal(await store.finishRun(second.run,()=>terminalProof(second)),true);checks.push(scenario+'_no_redispatch');
  if(scenario==='settled_disconnect'){const previous=second.generation;await remove(second,false);second.generation=hex();second.pid=null;assert.equal(await store.startGeneration(second.binding,previous,second.generation),true);await launch(second);await owned(second);assert.equal(counts.providerDispatches,before+1);}
 }
 stage='claim_disconnect';const beforeClaim=counts.providerDispatches;await prompt(second,'Synthetic disconnect before transport send.','claim_disconnect');assert.equal((await waitTerminal(second)).result.outcome,'failed');assert.equal(counts.providerDispatches,beforeClaim);const claimed=(await store.readRun(second.run)).operations;assert.equal(claimed.length,1);assert.equal(claimed[0].state,'claimed');assert.equal((await store.claimOperation(second.run,operationIdentity(claimed[0]))).state,'unknown');assert.equal(await store.reconcileTerminal(second.binding,second.generation,()=>terminalProof(second)),false);checks.push('claim_disconnect_no_dispatch');await remove(second);active=null;
 stage='lost_container_create_receipt';const dispatchesBeforeCreate=counts.providerDispatches;await assert.rejects(()=>newOwner(true),/synthetic_lost_create_receipt/);assert.equal(active.createOutcome,'uncertain');assert.equal(active.containerId,undefined);await remove(active);active=null;assert.equal(counts.providerDispatches,dispatchesBeforeCreate);checks.push('lost_container_create_receipt_exact_cleanup');
 output={state:'initial_smoke_passed',fullPhaseBGate:false,version:'2.2.5',profileHash,checks,counts,retainedUnknown,realProviderCalls:0,realSearchCalls:0,durationMs:Math.round(performance.now()-started)};
}catch(error){
 const inspection=active?.inspection;let nativeDiagnostic;
 if(active?.run&&active.transport)try{
  const observed=await observation(active);await fs.writeFile(path.join(path.dirname(root),'private-native.json'),JSON.stringify({state:observed.state,rows:observed.rows}),{mode:0o600,flag:'wx'});
  nativeDiagnostic={outcome:observed.state.outcome??null,projection:observed.result.state,records:observed.rows.map(row=>({type:row.type,...(row.type==='assistant'?{finish:row.finish??null,contentTypes:(row.content??[]).map(part=>part.type),errorKeys:row.error&&typeof row.error==='object'?Object.keys(row.error):[],timeKeys:Object.keys(row.time??{})}:{})})),gatewayRequests:active.gatewayRequests??0,gatewayStatuses:active.gatewayStatuses??[]};
 }catch{}
 let cleanup='not_needed';if(active)try{await remove(active);active=null;cleanup='exact_container_removed';}catch{cleanup='needs_review';}
 output={state:'failed',stage,failureAt:runtimeStep,version:'2.2.5',profileHash,checks,counts,retainedUnknown,cleanup,...(nativeDiagnostic?{nativeDiagnostic}:{}),...(runtimeStep==='inspect_container'?{inspection}:{}),realProviderCalls:0,realSearchCalls:0,errorClass:error instanceof assert.AssertionError?'assertion':'unavailable',durationMs:Math.round(performance.now()-started)};process.exitCode=1;
}
await fs.writeFile(path.join(path.dirname(root),'evidence.json'),JSON.stringify(output,null,2),{mode:0o600,flag:'wx'});console.log(JSON.stringify(output));
