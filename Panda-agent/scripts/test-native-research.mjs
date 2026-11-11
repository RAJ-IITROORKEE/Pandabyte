// Opt-in acceptance on the selected host; only the explicit model-real mode can pay for inference.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {researchCodeFiles,researchMemoryBytes,researchImageId,researchProfileHash,researchConfig,verifiedResearchConfig,verifyResearchContainer} from '../src/opencode/research-runtime.ts';
import {createNativeReceipt,createNativeMessageID} from '../src/opencode/session-contracts.ts';
import {projectResearchTurn} from '../src/opencode/research-transcript.ts';
import {createResearchProviderGateway,deriveResearchFrontier,hashResearchValue,matchResearchStopResult} from '../src/opencode/research-provider-gateway.ts';
import {openResearchRuntimeStore,hashResearchJSON} from '../src/server/research-runtime-store.ts';
import {createResearchDockerTransport} from '../src/server/research-docker-transport.ts';
import {reserveDockerHostSlot} from '../src/server/native-docker-host-quota.ts';
import {createResearchSearchBroker,verifyResearchSearchFixtureAnswer,verifyResearchAnswer,isPublicResearchQuery} from '../src/server/research-search-broker.ts';
import {searchHostedPublicWeb,hostedTavilyRequestHash} from '../src/search/tavily.ts';
import {createResearchOpenRouter} from '../src/server/research-openrouter.ts';
import {hostedResearchModel} from '../src/server/hosted-model-policy.ts';
import {researchProfileSelection,isVisionResearchProfile} from '../runtime/opencode/research-profile.mjs';
import {buildResearchPromptBody,nativeUserImageMatches,decodeResearchImageDataUri} from '../src/opencode/research-image-binding.ts';

const exec=promisify(execFile),digest=value=>createHash('sha256').update(value).digest('hex'),hex=()=>randomBytes(32).toString('hex');
const operationIdentity=({kind,key,requestHash})=>({kind,key,requestHash});
const pause=ms=>new Promise(done=>setTimeout(done,ms)),root=process.argv[3],mode=process.argv[2];
const modelMode=mode==='--aws-model-injected'?'injected':mode==='--aws-model-real'?'real':null;
const hostedProfiles=['tavily-hosted','tavily-hosted-luna','tavily-hosted-terra','tavily-hosted-haiku'],requestedModelProfile=process.env.PANDA_RESEARCH_MODEL_PROFILE??'tavily-hosted-haiku';
if(modelMode&&!hostedProfiles.includes(requestedModelProfile))throw Error('Unknown hosted research profile');
const searchMode=modelMode??(mode==='--aws-search-injected'?'injected':mode==='--aws-search-real'?'real':null),profile=modelMode?requestedModelProfile:searchMode?'tavily-search':'synthetic-echo',toolName=searchMode?'panda_research_search':'panda_research_echo';
const hostedModel=modelMode?hostedResearchModel(researchProfileSelection(profile).modelID):null;if(modelMode&&!hostedModel)throw Error('Hosted research model unavailable');
// C4: opt-in synthetic image runs (injected vision profiles only; zero real calls).
const imageMode=process.env.PANDA_RESEARCH_IMAGE_FIXTURE==='1';
// Parallel-tool diagnostic: injected only; one in-scope and one out-of-scope search in the same provider response.
const parallelMode=process.env.PANDA_RESEARCH_PARALLEL_FIXTURE==='1';if(parallelMode&&modelMode!=='injected')throw Error('Parallel fixture requires injected model mode');if(imageMode&&(modelMode!=='injected'||!isVisionResearchProfile(profile)))throw Error('Image fixture requires an injected vision profile');
if(!['--aws-synthetic','--aws-search-injected','--aws-search-real','--aws-model-injected','--aws-model-real'].includes(mode)||process.argv.length!==4||process.env.PANDA_RESEARCH_AWS_FIXTURE!=='i-05bcf2573a0b77f7a'||process.platform!=='linux'||process.getuid?.()!==0||!/^\/opt\/panda-research-tests\/[a-f0-9]{32}\/runtime$/.test(root??''))throw Error('Explicit selected-host fixture invocation required');
const command=async(args,env)=> (await exec('docker',args,{timeout:65000,maxBuffer:2097152,env:env?{PATH:process.env.PATH,...env}:undefined})).stdout.trim();
let mcpStatus=null,configDiagnostic=null,stage='preflight',runtimeStep='preflight',active,store,codeDirectory,profileHash,retainedUnknown=false;
const counts={providerDispatches:0,toolDispatches:0,deniedAuxiliary:0,unknownReplayDenials:0},checks=[],started=performance.now();
const publicQuery='RP2040 PIO official documentation',publicScope={words:['rp2040','pio','raspberry','pi','official','documentation','docs','programmable','input','output','state','machine','machines','microcontroller','datasheet','reference','manual','programming','guide','example','examples','interface','interfaces','uart','spi','i2c'],required:['rp2040','pio']};
let realSearchCalls=0,realProviderCalls=0,searchReceipt,searchKey,modelKey,privacyLease;
const modelReceipts=[],searchTimings=[],modelObservations=[],modelCaptures=[],memoryEvidence=[];
function parseMemoryProof(containerId,cgroup,peak,events){
 assert.match(containerId,/^[a-f0-9]{64}$/);assert.equal(cgroup.trim(),`0::/system.slice/docker-${containerId}.scope`);
 const numeric=value=>{assert.match(value,/^(0|[1-9][0-9]{0,15})$/);const n=Number(value);assert.ok(Number.isSafeInteger(n));return n;};
 const peakBytes=numeric(peak.trim()),rows=events.trim().split('\n').map(line=>line.split(' '));
 assert.ok(rows.every(row=>row.length===2&&/^[a-z_]+$/.test(row[0])));assert.equal(new Set(rows.map(row=>row[0])).size,rows.length);
 const values=Object.fromEntries(rows.map(([key,value])=>[key,numeric(value)]));assert.ok(Object.hasOwn(values,'oom_kill'));
 return {peakBytes,oomKill:values.oom_kill};
}
{
 const id='a'.repeat(64),group=`0::/system.slice/docker-${id}.scope\n`;
 assert.deepEqual(parseMemoryProof(id,group,'123\n','oom 0\noom_kill 0\n'),{peakBytes:123,oomKill:0});
 for(const [g,p,e] of [[group.replace(id,'b'.repeat(64)),'123','oom_kill 0'],[group,'max','oom_kill 0'],[group,'123','oom 0'],[group,'123','oom_kill 0\noom_kill 1']])assert.throws(()=>parseMemoryProof(id,g,p,e));
}
if(searchMode==='real'){
 const credential=path.join(path.dirname(root),'credentials.json'),stat=await fs.lstat(credential);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&stat.uid===0&&(stat.mode&0o777)===0o600);
 const value=JSON.parse(await fs.readFile(credential,'utf8'));assert.deepEqual(Object.keys(value).sort(),modelMode?['OPENROUTER_API_KEY','TAVILY_API_KEY','privacyLease']:['TAVILY_API_KEY']);assert.ok(typeof value.TAVILY_API_KEY==='string'&&value.TAVILY_API_KEY.trim()&&!/[\r\n\0]/.test(value.TAVILY_API_KEY));searchKey=value.TAVILY_API_KEY;
 if(modelMode){modelKey=value.OPENROUTER_API_KEY;privacyLease=value.privacyLease;assert.match(modelKey,/^sk-or-v1-[a-f0-9]{64}$/i);assert.deepEqual(Object.keys(privacyLease).sort(),['expiresAt','keySha256','privacy','reviewedAt','version','workspaceSha256']);assert.equal(privacyLease.version,1);assert.equal(privacyLease.keySha256,digest(modelKey));assert.match(privacyLease.workspaceSha256,/^[a-f0-9]{64}$/);assert.deepEqual(privacyLease.privacy,{paidTraining:false,publicPrompts:false,dataDiscount:false,logging:false,traces:'langsmith_metadata_only'});assert.ok(Date.parse(privacyLease.reviewedAt)<=Date.now()&&Date.now()<Date.parse(privacyLease.expiresAt)&&Date.parse(privacyLease.expiresAt)-Date.parse(privacyLease.reviewedAt)<=1800000);}
 await fs.unlink(credential);
}
const leaseCurrent=()=>modelMode!=='real'||Date.now()<Date.parse(privacyLease.expiresAt);
const rootStat=await fs.lstat(root);assert.ok(rootStat.isDirectory()&&!rootStat.isSymbolicLink()&&rootStat.uid===0&&(rootStat.mode&0o777)===0o700);
const image=JSON.parse(await command(['image','inspect',researchImageId]));assert.equal(image.length,1);assert.equal(image[0].Id,researchImageId);assert.equal(image[0].Architecture,'arm64');
const mem=await fs.readFile('/proc/meminfo','utf8');assert.ok(Number(/^MemAvailable:\s+(\d+)/m.exec(mem)?.[1])>=1048576);
const disk=await promisify(execFile)('df',['-Pk',root]);assert.ok(Number(disk.stdout.trim().split('\n').at(-1).trim().split(/\s+/)[3])>=2097152);
const codeSource=fileURLToPath(new URL('../runtime/opencode/',import.meta.url));
const source=Object.fromEntries(await Promise.all(researchCodeFiles.map(async name=>[name,await fs.readFile(path.join(codeSource,name))])));
profileHash=researchProfileHash(source,profile);

async function prepareCode(){
 await fs.mkdir(path.join(root,'code'),{mode:0o700});codeDirectory=path.join(root,'code','mount');await fs.mkdir(codeDirectory,{mode:0o755});
 const files={},directories=new Set();for(const name of researchCodeFiles){const file=path.join(codeDirectory,name),directory=path.dirname(file);if(directory!==codeDirectory&&!directories.has(directory)){await fs.mkdir(directory,{mode:0o700});directories.add(directory);}await fs.writeFile(file,source[name],{mode:0o444,flag:'wx'});await fs.chmod(file,0o444);files[name]=digest(source[name]);}for(const directory of directories)await fs.chmod(directory,0o555);
 const manifest=path.join(codeDirectory,'manifest.json');await fs.writeFile(manifest,JSON.stringify({imageId:researchImageId,profileHash,profile,files}),{mode:0o444,flag:'wx'});await fs.chmod(manifest,0o444);await fs.chmod(codeDirectory,0o555);
}
async function json(transport,method,route,body){const r=await transport.request(method,route,body);assert.equal(r.status,200);return JSON.parse(r.body);}
async function owned(ctx){
 const [info,session]=await Promise.all([json(ctx.transport,'GET','/api/info'),json(ctx.transport,'GET','/api/session/'+ctx.binding.sessionID)]);assert.equal(info.version,'2.2.5');assert.ok(Number.isSafeInteger(info.pid)&&info.pid>0);if(ctx.pid)assert.equal(info.pid,ctx.pid);else ctx.pid=info.pid;
 const data=session.data;
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
 const [state,activity,rows]=await Promise.all([owned(ctx),json(ctx.transport,'GET','/api/session/active'),messages(ctx)]),activeMap=activity.data;
 const active=Object.hasOwn(activeMap,ctx.binding.sessionID);return {state,rows,active,result:projectResearchTurn({messageID:ctx.run.messageID,promptHash:ctx.run.promptHash,...(ctx.run.imageSha256?{imageSha256:ctx.run.imageSha256}:{})},{...(state.outcome?{outcome:state.outcome}:{}),time:state.time},active,rows,[toolName])};
}
async function terminalProof(ctx){const o=await observation(ctx);if(o.result.state!=='terminal')return null;return {sessionID:ctx.binding.sessionID,messageID:ctx.run.messageID,promptHash:ctx.run.promptHash,outcome:o.result.outcome,active:false};}
async function waitTerminal(ctx,limit=30000){const end=Date.now()+limit;for(;;){const o=await observation(ctx);if(o.result.state==='terminal')return o;if(Date.now()>end)throw Error('native_terminal_timeout');await pause(100);}}
async function replayMcpConnection(ctx,value){
 const envelope=Object.fromEntries(['sessionID','assistantMessageID','toolID','generation','inputHash'].map(key=>[key,value[key]]));
 const child=spawn('docker',['exec','-i',ctx.containerId,'node','/research-code/research-mcp-shim.mjs'],{stdio:['pipe','pipe','ignore']});
 return new Promise((resolve,reject)=>{
  let buffer='',done=false,bytes=0;const finish=error=>{if(done)return;done=true;clearTimeout(timer);child.stdin.end();child.kill();if(error)reject(error);else resolve();};
  const timer=setTimeout(()=>finish(Error('mcp_replay_timeout')),10000);child.on('error',()=>finish(Error('mcp_replay_unavailable')));child.stdin.on('error',()=>finish(Error('mcp_replay_unavailable')));
  child.stdout.on('data',part=>{try{bytes+=part.length;if(bytes>65536)throw Error();buffer+=part.toString('utf8');let at;while((at=buffer.indexOf('\n'))!==-1){const reply=JSON.parse(buffer.slice(0,at));buffer=buffer.slice(at+1);if(reply.id===2){assert.ok(reply.result&&!reply.result.isError);assert.ok(JSON.stringify(reply.result).includes(searchMode?'tavily_excerpt':'synthetic-public-evidence'));finish();}}}catch{finish(Error('mcp_replay_invalid'));}});
  child.on('close',()=>{if(!done)finish(Error('mcp_replay_closed'));});
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'synthetic-reconnect',version:'1'}}})+'\n');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:searchMode?'search':'echo',arguments:{...value.input,__pandaNative:envelope},_meta:{'ai.opencode/sessionID':value.sessionID}}})+'\n');
 });
}
async function disconnectChannel(ctx){
 const program="const f=require('node:fs'),c=require('node:crypto');const p='/runtime/state/channel-ready.json',s=f.lstatSync(p),r=JSON.parse(f.readFileSync(p,'utf8'));if(!s.isFile()||s.isSymbolicLink()||s.uid!==10001||(s.mode&511)!==384||r.generation!==process.env.PANDA_RESEARCH_GENERATION||r.tokenHash!==c.createHash('sha256').update(process.env.PANDA_RESEARCH_CHANNEL_TOKEN).digest('hex')||!Number.isSafeInteger(r.pid)||r.pid<2||r.pid===process.pid||!f.readFileSync('/proc/'+r.pid+'/cmdline','utf8').split(String.fromCharCode(0)).includes('/research-code/research-provider-channel.mjs'))throw Error('unverified channel');process.kill(r.pid,'SIGKILL');process.stdout.write('channel disconnected');";
 assert.equal(await command(['exec',ctx.containerId,'node','-e',program]),'channel disconnected');
}

async function captureModelResponse(response){
 if(response.redirected){void response.body?.cancel().catch(()=>{});throw Error('private_capture_redirected');}
 const file=path.join(path.dirname(root),'private-provider-response-'+counts.providerDispatches+'.json'),reader=response.body?.getReader(),chunks=[];let bytes=0,saving,truncated=false,completed;
 modelCaptures.push(new Promise(resolve=>{completed=resolve;}));
 const save=(cancelled=false)=>saving??=(async()=>{try{await fs.writeFile(file,JSON.stringify({status:response.status,contentType:response.headers.get('content-type'),bytes,cancelled,truncated,bodyBase64:Buffer.concat(chunks).toString('base64')}),{mode:0o600,flag:'wx'});}finally{completed();}})();
 if(!reader){await save();return response;}
 const body=new ReadableStream({async pull(controller){try{const part=await reader.read();if(part.done){await save();controller.close();return;}const portion=part.value.subarray(0,1048576-bytes);chunks.push(Buffer.from(portion));bytes+=portion.byteLength;if(portion.byteLength!==part.value.byteLength){truncated=true;void reader.cancel().catch(()=>{});throw Error('private_capture_bound');}controller.enqueue(part.value);}catch(error){await save(true);controller.error(error);}},async cancel(){await save(true);void reader.cancel().catch(()=>{});}});
 return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
}
async function modelFetch(ctx,url,init){
 if(init.method==='GET')ctx.externalMetadataRequests=(ctx.externalMetadataRequests??0)+1;
 if(url==='https://openrouter.ai/api/v1/chat/completions'){counts.providerDispatches++;if(modelMode==='real')realProviderCalls++;}
 if(modelMode==='real'){const response=await fetch(url,init);return url==='https://openrouter.ai/api/v1/chat/completions'?captureModelResponse(response):response;}
 const m=hostedModel,id=m.id,legacy=m.legacy,slug=m.reportedModels.at(-1);
 if(url.endsWith('/endpoints/zdr'))return Response.json({data:[{model_id:id,tag:m.endpointTag,safety_retention:false}]});
 if(url.endsWith('/endpoints')){
  assert.equal(url,'https://openrouter.ai/api/v1/models/'+id+'/endpoints');
  const endpoint=legacy?{tag:'groq',model_id:id,name:'Groq | openai/gpt-oss-20b',provider_name:'Groq',status:0,pricing:{prompt:'0.000000075',completion:'0.0000003',input_cache_read:'0.0000000375',discount:0},context_length:131072,max_completion_tokens:65536,max_prompt_tokens:null,supports_implicit_caching:true,supports_tool_choice:{none:true,auto:true},supported_parameters:['response_format','reasoning','include_reasoning','tool_choice','tools','max_tokens']}
   :{tag:m.endpointTag,model_id:id,name:m.endpointName,provider_name:m.providerName,status:0,pricing:{...m.pricing,overrides:[Object.fromEntries(m.overrideKeys.map(key=>[key,key==='min_prompt_tokens'?272000:String(m.pricing[key]??'0.000001')]))]},context_length:1000000,max_completion_tokens:128000,max_prompt_tokens:null,supports_implicit_caching:false,supports_tool_choice:{none:true,auto:true,required:false,function:false},supported_parameters:['reasoning','include_reasoning',m.outputParam,'tools','tool_choice','response_format','reasoning_effort']};
  return Response.json({data:{id,architecture:{tokenizer:m.tokenizer},endpoints:[endpoint]}});
 }
 if(url.endsWith('/key'))return Response.json({data:{workspace_id:'SYNTHETIC_WORKSPACE'}});
 assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');const wire=JSON.parse(init.body),identity={id:'gen-SYNTHETIC_'+counts.providerDispatches,model:slug,provider:m.providerName};
 // C3: exact per-model wire routing, output parameter, reasoning policy and message keys before any synthetic answer.
 assert.equal(wire.model,id);assert.deepEqual(wire.provider.only,[m.endpointTag]);assert.equal(wire[m.outputParam],700);assert.equal(wire[m.outputParam==='max_tokens'?'max_completion_tokens':'max_tokens'],undefined);
 assert.deepEqual(wire.reasoning,m.reasoning==='disabled'?{enabled:false}:{effort:'low',exclude:true});
 for(const message of wire.messages)assert.ok(Object.keys(message).every(key=>['role','content','tool_calls','tool_call_id','name'].includes(key)),'unexpected native message key');
 // C4: the admitted image reaches every request byte-identical, once, as the last part of the bound user message; never otherwise.
 const images=wire.messages.flatMap((message,index)=>Array.isArray(message.content)?message.content.filter(part=>part?.type==='image_url').map(part=>({index,url:part.image_url?.url})):[]);
 if(ctx.expectImage){const bound=wire.messages.findLastIndex(message=>message.role==='user'),parts=wire.messages[bound].content;assert.equal(images.length,1);assert.equal(images[0].index,bound);assert.equal(parts.at(-1).type,'image_url');assert.equal(decodeResearchImageDataUri(images[0].url)?.sha256,ctx.expectImage);ctx.imageDeliveries=(ctx.imageDeliveries??0)+1;}
 else assert.equal(images.length,0);
 const tool=wire.messages.slice(wire.messages.findLastIndex(message=>message.role==='user')+1).findLast(message=>message.role==='tool'),frames=[];
 const chunk=(delta,finish_reason=null)=>({...identity,choices:[{index:0,delta,finish_reason}]});frames.push(chunk({role:'assistant'}));
 if(ctx.scenario==='model_unsupported')frames.push(chunk({content:JSON.stringify({answer:'',evidence:[]})},'stop'));
 else if(!tool&&ctx.scenario==='model_parallel'){const a=('call.a:'+ctx.run.runID).slice(0,64),b=('call.b:'+ctx.run.runID).slice(0,64);frames.push(chunk({content:'Checking two public sources.',tool_calls:[{index:0,id:a,type:'function',function:{name:toolName,arguments:JSON.stringify({query:publicQuery})}},{index:1,id:b,type:'function',function:{name:toolName,arguments:JSON.stringify({query:'rp2040 pio examples interfaces'})}}]},'tool_calls'));}
 else if(ctx.scenario==='model_parallel'){const tools=wire.messages.slice(wire.messages.findLastIndex(message=>message.role==='user')+1).filter(message=>message.role==='tool'),ok=tools.find(message=>{try{return !!JSON.parse(typeof message.content==='string'?message.content:message.content.map(part=>part.text).join('')).sources;}catch{return false;}});assert.ok(ok,'parallel_success_result_missing');const source=JSON.parse(typeof ok.content==='string'?ok.content:ok.content.map(part=>part.text).join('')).sources[0];frames.push(chunk({content:JSON.stringify({answer:'PIO provides programmable input/output state machines.',evidence:[{handle:source.handle,passage:source.passages[0].id}]})},'stop'));}
 else if(!tool){const call=('call.model:'+ctx.run.runID+'x'.repeat(64)).slice(0,64);frames.push(chunk({content:'I will check public documentation.',tool_calls:[{index:0,id:call,type:'function',function:{name:toolName,arguments:JSON.stringify({query:publicQuery})}}]},'tool_calls'));}
 else{const payload=JSON.parse(typeof tool.content==='string'?tool.content:tool.content.map(part=>part.text).join('')),source=payload.sources[0],passage=source.passages[0].id;frames.push(chunk({content:JSON.stringify({answer:'PIO provides programmable input/output state machines.',evidence:[{handle:source.handle,passage}]})},'stop'));}
 frames.push({...identity,choices:[],usage:{prompt_tokens:100,completion_tokens:40,total_tokens:140,cost:0.00001875,prompt_tokens_details:{cached_tokens:20,cache_write_tokens:5},completion_tokens_details:{reasoning_tokens:8}}});
 return captureModelResponse(new Response(frames.map(frame=>'data: '+JSON.stringify(frame)+'\n\n').join('')+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}}));
}

async function attach(ctx){
 runtimeStep='attach_channels';
 ctx.transport=createResearchDockerTransport({containerId:ctx.containerId,sessionID:ctx.binding.sessionID,generation:ctx.generation,profile,directory:'/runtime/workspace',ownership:{binding:ctx.binding.binding,owner:ctx.binding.owner,profileHash}});
 ctx.modelAdmission=new Map();ctx.searchAdmission=new Map();
 if(modelMode){const generation=ctx.generation;ctx.model=createResearchOpenRouter({profile,apiKey:modelKey??'synthetic-model-key',workspaceSha256:modelMode==='real'?privacyLease.workspaceSha256:digest('SYNTHETIC_WORKSPACE'),privacyProfileHash:modelMode==='real'?hashResearchJSON(privacyLease):digest('synthetic-operator-lease'),nativeProfileHash:profileHash,
  policyCurrent:async()=>leaseCurrent()&&!!ctx.run&&await store.current(ctx.run),dispatchCurrent:()=>ctx.generation===generation&&!!ctx.containerId&&leaseCurrent(),fetcher:(url,init)=>modelFetch(ctx,url,init),observe:value=>modelObservations.push(value)});}
 const options={token:ctx.environment.PANDA_RESEARCH_CHANNEL_TOKEN,sessionID:ctx.binding.sessionID,generation:ctx.generation,profile,signal:new AbortController().signal,
  denied:async()=>{counts.deniedAuxiliary++;},
  authorize:async identity=>{
   const authorizationStartedAt=performance.now();
   if(!ctx.run||!await store.current(ctx.run)){counts.unknownReplayDenials++;return null;}
   await owned(ctx);const record=await store.readRun(ctx.run);if(!record)return null;
   const duplicate=record.operations.find(op=>op.kind==='primary'&&op.requestHash===identity.requestHash);
   if(duplicate)return{receipt:ctx.run,operation:{kind:duplicate.kind,key:duplicate.key,requestHash:duplicate.requestHash},prepared:null};
   const attempts=[];for(const op of record.operations.filter(op=>op.kind==='primary'&&op.state==='settled')){const recovered=await store.recoverOperation(ctx.run,operationIdentity(op));if(recovered.state!=='cached')return null;attempts.push({attemptKey:op.key,requestHash:op.requestHash,resultHash:op.resultHash,result:recovered.result,...(op.association?{assistantMessageID:op.association.assistantMessageID}:{})});}
   const nativeRows=await messages(ctx),frontier=deriveResearchFrontier(ctx.run,nativeRows,attempts,identity.body,profile,modelMode?attempt=>ctx.model.verifyResult(attempt.result,attempt.requestHash):undefined);if(!frontier){await fs.writeFile(path.join(path.dirname(root),'private-frontier.json'),JSON.stringify({expected:{messageID:ctx.run.messageID,promptHash:ctx.run.promptHash},nativeMessages:nativeRows,attempts,providerBody:identity.body}),{mode:0o600,flag:'wx'});return null;}
   for(const association of frontier.associations){const op=record.operations.find(op=>op.key===association.attemptKey);const step=frontier.frontier.steps.find(step=>step.attemptKey===association.attemptKey);if(!op||!step||!await store.associateOperation(ctx.run,operationIdentity(op),{assistantMessageID:association.assistantMessageID,callsDigest:hashResearchValue(step.calls)}))return null;}
   const prepareStartedAt=performance.now(),prepared=modelMode?await ctx.model.prepare(identity.body,new AbortController().signal):null;
   if(modelMode)ctx.modelAdmission.set(identity.requestHash,{authorizationStartedAt,prepareStartedAt,preparedAt:performance.now()});
   return Object.freeze({receipt:structuredClone(ctx.run),operation:{kind:'primary',key:hashResearchValue(frontier.frontier),requestHash:identity.requestHash},prepared});
  },
  current:binding=>store.current(binding.receipt),claim:binding=>{if(modelMode&&binding.prepared)ctx.modelAdmission.get(binding.operation.requestHash).claimStartedAt=performance.now();return store.claimOperation(binding.receipt,binding.operation);},
  beforeSend:async binding=>{const grant=await store.markSending(binding.receipt,binding.operation);if(modelMode&&grant)ctx.modelAdmission.get(binding.operation.requestHash).grantAt=performance.now();return grant;},
  settle:async(binding,grant,result)=>{assert.equal(await store.settleOperation(binding.receipt,binding.operation,grant.grant,result),true);if(modelMode)ctx.modelAdmission.get(binding.operation.requestHash).settledAt=performance.now();if(ctx.scenario==='retire_after_settle')assert.equal(await store.cancelRun(ctx.run,'source_retired'),true);},
  authorizeRelease:(binding,result)=>store.authorizeRelease(binding.receipt,binding.operation,hashResearchJSON(result)),
  ...(modelMode?{verifyHostedResult:(binding,result,identity)=>ctx.model.verifyResult(result,identity.requestHash)&&(!binding.prepared||result.receipt.wireRequestHash===binding.prepared.wireRequestHash)}:{}),
  complete:async(body,beforeSend,signal,binding)=>{
   if(modelMode){assert.ok(binding.prepared);assert.equal(binding.prepared.nativeRequestHash,hashResearchValue(body));ctx.lastProviderBody=body;const result=await ctx.model.complete(binding.prepared,beforeSend,signal);ctx.modelAdmission.get(binding.operation.requestHash).verifiedAt=performance.now();return result;}
   if(ctx.scenario==='claim_disconnect')throw Error('synthetic_disconnect_before_send');
   assert.equal(await beforeSend(),true);counts.providerDispatches++;ctx.lastProviderBody=body;
   if(ctx.scenario==='search'){
    const tool=body.messages.findLast(message=>message.role==='tool');if(!tool)return{toolCalls:[{id:'call_search_'+ctx.run.runID,name:toolName,arguments:{query:publicQuery}}],usage:{inputTokens:100,outputTokens:20,costNanoUsd:0}};
    const evidence=JSON.parse(typeof tool.content==='string'?tool.content:tool.content.map(part=>part.text).join(''));assert.equal(evidence.kind,'tavily_excerpt');assert.ok(Array.isArray(evidence.sources));
    const source=evidence.sources[0],passage=source?.passages[0];
    return{content:JSON.stringify({answer:passage?passage.text:'',evidence:source?[{handle:source.handle,passage:passage.id}]:[]}),usage:{inputTokens:100,outputTokens:50,costNanoUsd:0}};
   }
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
  if(parallelMode&&ctx.gatewayRequests>1)try{const body=JSON.parse(request.body.toString()),tools=body.messages.slice(body.messages.findLastIndex(message=>message.role==='user')+1).filter(message=>message.role==='tool');(ctx.continuationTools??=[]).push({status:result.status,tools:tools.map(message=>({contentType:Array.isArray(message.content)?'array:'+message.content.length:typeof message.content,partTypes:Array.isArray(message.content)?message.content.map(part=>part?.type):null,textLength:(Array.isArray(message.content)?message.content.map(part=>part?.text??'').join(''):String(message.content)).length,shortText:(t=>t.length<=120?t:null)(Array.isArray(message.content)?message.content.map(part=>part?.text??'').join(''):String(message.content))}))});}catch{}
  if(result.status===200&&ctx.scenario==='settled_disconnect'){await disconnectChannel(ctx);throw Error('synthetic_connection_lost_after_settlement');}
  if(result.status===200&&ctx.scenario==='native_http_429')return{status:429,contentType:'application/json',body:'{"error":{"message":"Synthetic channel fault"}}'};
  return result;
 });
 const searchBroker=searchMode?createResearchSearchBroker({store,binding:ctx.binding,generation:ctx.generation,currentReceipt:()=>ctx.run??null,
  readNative:async()=>{const [session,activity,rows]=await Promise.all([owned(ctx),json(ctx.transport,'GET','/api/session/active'),messages(ctx)]);return{session,active:Object.hasOwn(activity.data,ctx.binding.sessionID),messages:rows};},
  allowPublicQuery:query=>modelMode?isPublicResearchQuery(query,publicScope):query===publicQuery,
  observe:event=>{const timing=ctx.searchAdmission.get(event.operationKey);if(!timing)return;timing[event.stage+'At']=event.at;if(event.stage==='released'){assert.ok(timing.startedAt<=timing.grantAt&&timing.grantAt<=timing.verifiedAt&&timing.verifiedAt<=timing.settledAt&&timing.settledAt<=event.at);searchTimings.push({admissionMs:Math.round(timing.grantAt-timing.startedAt),providerAndVerificationMs:Math.round(timing.verifiedAt-timing.grantAt),providerThroughSettlementMs:Math.round(timing.settledAt-timing.grantAt),totalThroughReleaseMs:Math.round(event.at-timing.startedAt)});ctx.searchAdmission.delete(event.operationKey);}},
  search:async(query,beforeSend,signal,operation)=>{
   if(searchMode==='real'||modelMode){const timing={startedAt:performance.now()};ctx.searchAdmission.set(operation.key,timing);
    searchReceipt=await searchHostedPublicWeb(query,{apiKey:searchKey??'synthetic-search-key',beforeSend:async()=>{const allowed=await beforeSend();if(allowed){counts.toolDispatches++;timing.grantAt=performance.now();if(searchMode==='real')realSearchCalls++;}return allowed;},signal,
     ...(modelMode==='injected'?{lookupImpl:async()=>[{address:'93.184.216.34',family:4}],fetchImpl:async()=>Response.json({request_id:'synthetic search receipt',usage:{credits:1},results:[{url:'https://www.raspberrypi.com/documentation/microcontrollers/rp2040.html',title:'RP2040 documentation',content:'PIO provides programmable input/output state machines.'}]})}:{})});
    assert.ok(timing.grantAt!==undefined);timing.adapterReturnedAt=performance.now();
   }
   else{assert.equal(await beforeSend(),true);counts.toolDispatches++;const capturedAt=new Date().toISOString(),url='https://www.raspberrypi.com/documentation/microcontrollers/rp2040.html',content='PIO provides programmable input/output state machines.';searchReceipt={version:1,provider:'tavily',operation:'search',requestHash:hostedTavilyRequestHash(query),requestId:null,startedAt:capturedAt,completedAt:capturedAt,durationMs:0,usage:{credits:null,costNanoUsd:null},sources:[{handle:`web:${digest(url)}:${digest(content)}:${digest(content)}`,url,title:'RP2040 documentation',content,capturedAt}]};}
   return searchReceipt;
  }}):null;
 await ctx.transport.broker(async request=>{
  if(searchBroker){const result=await searchBroker.handle(request);if(result.status===200&&ctx.probeMcp&&!ctx.probeMcpStarted){ctx.probeMcpStarted=true;const before=counts.toolDispatches;await replayMcpConnection(ctx,JSON.parse(request.body.toString()));assert.equal(counts.toolDispatches,before);checks.push('native_search_duplicate_cached');}return result;}
  const error=()=>({status:403,contentType:'application/json',body:'{}'});
  if(!ctx.run||!await store.current(ctx.run))return error();
  const value=JSON.parse(request.body.toString('utf8'));if(!value||Object.keys(value).sort().join(',')!=='assistantMessageID,generation,input,inputHash,sessionID,toolID'||value.generation!==ctx.generation||value.sessionID!==ctx.binding.sessionID||hashResearchValue(value.input)!==value.inputHash)return error();
  await owned(ctx);const rows=await messages(ctx),user=rows.findIndex(row=>row.id===ctx.run.messageID&&row.type==='user'&&digest(row.text)===ctx.run.promptHash&&nativeUserImageMatches(row,ctx.run.imageSha256));if(user<0||rows.slice(user+1).some(row=>row.type==='user'))return error();
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
 const loaded=await json(ctx.transport,'GET','/api/config'),expectedConfig=researchConfig(ctx.generation,ctx.environment.PANDA_RESEARCH_CHANNEL_TOKEN,profile);
 if(!verifiedResearchConfig(loaded,expectedConfig)){const info=Array.isArray(loaded)?loaded[0]?.info:null,model=cfg=>Object.values(cfg?.providers??{})[0]?.models;configDiagnostic={shape:Array.isArray(loaded)?loaded.map(entry=>entry?.type):typeof loaded,topKeysMissing:Object.keys(expectedConfig).filter(key=>!info||!Object.hasOwn(info,key)),topKeysExtra:info?Object.keys(info).filter(key=>!Object.hasOwn(expectedConfig,key)):null,mediaLoaded:info?.media??null,modelLoaded:model(info)??null};}
 assert.equal(verifiedResearchConfig(loaded,expectedConfig),true);
 // D2 readiness probe: record only MCP server names and statuses (never error text) at attach and after a short wait.
 if(!mcpStatus){const project=r=>Array.isArray(r?.data)?r.data.map(s=>({name:s?.name,status:s?.status?.status})):typeof r;const t0=performance.now(),first=project(await json(ctx.transport,'GET','/api/mcp'));let after=first,waitedMs=0;for(let i=0;i<50&&!(Array.isArray(after)&&after.some(s=>s.status==='connected'));i++){await pause(200);after=project(await json(ctx.transport,'GET','/api/mcp'));waitedMs=Math.round(performance.now()-t0);}mcpStatus={first,after,waitedMs};}
}
async function launch(ctx){
 runtimeStep='create_container';
 const labels={'panda.research.binding':ctx.binding.binding,'panda.research.profile':profileHash,'panda.native.lease':ctx.lease};
 ctx.environment={PANDA_NATIVE_PASSWORD:hex(),PANDA_RESEARCH_CHANNEL_TOKEN:hex(),PANDA_RESEARCH_GENERATION:ctx.generation,PANDA_RESEARCH_PROFILE:profile};
 const args=['create','--pull=never','--name',ctx.lease,'--network','none','--user','10001:10001','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory',`${researchMemoryBytes / 1048576}m`,'--memory-swap',`${researchMemoryBytes / 1048576}m`,'--cpus','1','--pids-limit','128','--workdir','/runtime/workspace','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=16777216,uid=10001,gid=10001,mode=0700','--mount',`type=bind,source=${ctx.nativeDirectory},target=/runtime`,'--mount',`type=bind,source=${codeDirectory},target=/research-code,readonly`];
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
 let proofError;
 if(ctx.containerId){
  const inspect=JSON.parse(await command(['inspect',ctx.containerId]))[0];assert.equal(inspect.Image,researchImageId);assert.equal(inspect.Config.Labels['panda.native.lease'],ctx.lease);assert.equal(inspect.Config.Labels['panda.research.binding'],ctx.binding.binding);assert.equal(inspect.Config.Labels['panda.research.profile'],profileHash);
  try{
   const pid=inspect.State.Pid;
   if(pid===0&&ctx.loseCreateReceipt&&inspect.State.Status==='created')memoryEvidence.push({unstarted:true});
   else{
    assert.ok(Number.isSafeInteger(pid)&&pid>0);assert.match(ctx.containerId,/^[a-f0-9]{64}$/);
    const group=await fs.readFile(`/proc/${pid}/cgroup`,'utf8'),directory=`/sys/fs/cgroup/system.slice/docker-${ctx.containerId}.scope`;
    assert.equal(group.trim(),`0::/system.slice/docker-${ctx.containerId}.scope`);assert.equal(await fs.realpath(directory),directory);
    const proof=parseMemoryProof(ctx.containerId,group,await fs.readFile(directory+'/memory.peak','utf8'),await fs.readFile(directory+'/memory.events','utf8'));memoryEvidence.push(proof);assert.equal(proof.oomKill,0,'container_oom_kill');
   }
  }catch(error){proofError=error;memoryEvidence.push({proof:'unavailable_or_failed'});}
  await command(['rm','-f',ctx.containerId]);assert.equal(await command(['ps','-aq','--no-trunc','--filter','id='+ctx.containerId]),'');ctx.containerId=null;ctx.createOutcome='removed';
 }
 if((release||proofError)&&ctx.slot){await ctx.slot.release();ctx.slot=null;}
 if(proofError)throw proofError;
}
async function newOwner(loseCreateReceipt=false){
 const lease='panda-n45-'+randomBytes(16).toString('hex'),slot=await reserveDockerHostSlot('/opt/panda-n45-admission',lease,true);assert.ok(slot,'native_capacity_occupied');
 const bindingHash=hex(),binding={binding:bindingHash,owner:hex(),sessionID:createNativeReceipt('playground',bindingHash).sessionID,profileHash,imageId:researchImageId,created:Date.now()};
 const ctx={lease,slot,binding,generation:hex(),pid:null,loseCreateReceipt};active=ctx;
 if(!store){await prepareCode();store=await openResearchRuntimeStore(root,{isCurrent:()=>leaseCurrent()});}
 assert.equal((await store.createBinding(binding)).state,'created');assert.equal(await store.startGeneration(binding,null,ctx.generation),true);
 ctx.nativeDirectory=path.join(root,'bindings',bindingHash,'native');await fs.mkdir(ctx.nativeDirectory,{mode:0o700});await fs.chown(ctx.nativeDirectory,10001,10001);await fs.mkdir(path.join(ctx.nativeDirectory,'workspace'),{mode:0o700});await fs.chown(path.join(ctx.nativeDirectory,'workspace'),10001,10001);
 await launch(ctx);assert.equal((await store.claimCreate(binding,ctx.generation)).state,'dispatch');
 runtimeStep='create_session';await json(ctx.transport,'POST','/api/session',ctx.transport.createBody);await owned(ctx);assert.equal(await store.markCreated(binding,ctx.generation,{sessionID:binding.sessionID,profileHash}),true);return ctx;
}
async function prompt(ctx,text,scenario,image=null){
 runtimeStep='native_prompt_'+scenario;
 const messageID=createNativeMessageID(),built=buildResearchPromptBody({messageID,text,image,vision:isVisionResearchProfile(profile)});assert.ok(!('error' in built),'prompt_rejected_before_admission');
 ctx.scenario=scenario;ctx.expectImage=built.imageSha256??null;ctx.run={binding:ctx.binding.binding,owner:ctx.binding.owner,runID:randomUUID(),messageID,promptHash:digest(text),sourceRevision:'0'.repeat(64),generation:ctx.generation,...(built.imageSha256?{imageSha256:built.imageSha256}:{})};
 assert.equal((await store.admitRun(ctx.run)).state,'admitted');assert.equal((await store.claimPrompt(ctx.run)).state,'dispatch');
 const result=await json(ctx.transport,'POST',`/api/session/${ctx.binding.sessionID}/prompt`,built.body);assert.ok(result.data);const accepted=await store.markPromptAccepted(ctx.run);if(!accepted){const recorded=await store.readRun(ctx.run);assert.equal(scenario,'retire_after_settle');assert.equal(recorded.cancelled,'source_retired');assert.ok(recorded.operations.length&&recorded.operations.every(op=>op.state==='settled'));}
}
async function verifiedModelTurn(ctx){
 const observed=await waitTerminal(ctx,180000);assert.equal(observed.result.outcome,'succeeded');const record=await store.readRun(ctx.run),attempts=[],primary=record.operations.filter(op=>op.kind==='primary');
 for(let index=1;index<=counts.providerDispatches;index++){const capture=JSON.parse(await fs.readFile(path.join(path.dirname(root),'private-provider-response-'+index+'.json'),'utf8'));assert.equal(capture.status,200);assert.equal(capture.cancelled,false);assert.ok(capture.bytes>0&&capture.bytes<=1048576);assert.equal(Buffer.from(capture.bodyBase64,'base64').length,capture.bytes);}
 for(const op of primary){const recovered=await store.recoverOperation(ctx.run,operationIdentity(op));assert.equal(recovered.state,'cached');assert.equal(ctx.model.verifyResult(recovered.result,op.requestHash),true);attempts.push({attemptKey:op.key,requestHash:op.requestHash,resultHash:op.resultHash,result:recovered.result,...(op.association?{assistantMessageID:op.association.assistantMessageID}:{})});}
 const proof=matchResearchStopResult({profile,receipt:ctx.run,record,session:observed.state,active:observed.active,messages:observed.rows,attempts},attempt=>ctx.model.verifyResult(attempt.result,attempt.requestHash));assert.ok(proof);
 const final=primary.find(op=>op.key===proof.operationKey);assert.ok(final);assert.equal(await store.associateOperation(ctx.run,operationIdentity(final),{assistantMessageID:proof.assistantMessageID,callsDigest:proof.callsDigest}),true);
 const user=observed.rows.findIndex(row=>row.id===ctx.run.messageID),assistants=observed.rows.slice(user+1).filter(row=>row.type==='assistant');assert.equal(assistants.length,attempts.length);
 for(const [index,attempt]of attempts.entries()){
  const result=attempt.result,usage=result.usage,receipt=result.receipt,write=receipt.usageReceipt.prompt_tokens_details?.cache_write_tokens??0,expected={input:Math.max(0,usage.inputTokens-receipt.cachedTokens-write),output:Math.max(0,usage.outputTokens-receipt.reasoningTokens),reasoning:receipt.reasoningTokens,cache:{read:receipt.cachedTokens,write}};
  const timing=ctx.modelAdmission.get(attempt.requestHash),stamps=['authorizationStartedAt','prepareStartedAt','preparedAt','claimStartedAt','grantAt','verifiedAt','settledAt'].map(key=>timing?.[key]);assert.ok(stamps.every((stamp,index)=>Number.isFinite(stamp)&&(!index||stamp>=stamps[index-1])));
  const admission={nativeAuthorizationMs:Math.round(timing.prepareStartedAt-timing.authorizationStartedAt),metadataPreparationMs:Math.round(timing.preparedAt-timing.prepareStartedAt),durableClaimToGrantMs:Math.round(timing.grantAt-timing.claimStartedAt),totalAuthorizationToGrantMs:Math.round(timing.grantAt-timing.authorizationStartedAt),grantToVerifiedMs:Math.round(timing.verifiedAt-timing.grantAt),grantToSettledMs:Math.round(timing.settledAt-timing.grantAt)};
  assert.deepEqual(assistants[index].tokens,expected);modelReceipts.push({generationSha256:digest(receipt.generationId),usage,timing:receipt.timing,admission,nativeTokens:expected});
 }
 checks.push('native_model_usage_matches_verified_receipts');
 const catalog=[];
 for(const tool of observed.result.tools){if(tool.status!=='completed')continue;assert.equal(tool.name,toolName);const key=hashResearchJSON({runID:ctx.run.runID,assistantMessageID:tool.assistantMessageID,toolID:tool.id}),op=record.operations.find(value=>value.kind==='tool'&&value.key===key);assert.ok(op);
  const recovered=await store.recoverOperation(ctx.run,operationIdentity(op));assert.equal(recovered.state,'cached');assert.deepEqual(tool.content,recovered.result.mcp.content.map(part=>part.text));assert.equal(await store.authorizeRelease(ctx.run,operationIdentity(op),op.resultHash),true);catalog.push({operationKey:op.key,resultHash:op.resultHash,receipt:recovered.result.receipt});}
 const answer=verifyResearchAnswer(observed.result.text,catalog,proof.content);assert.notEqual(answer.state,'invalid');
 if(answer.state==='evidence')for(const use of answer.usedSources){const op=record.operations.find(value=>value.key===use.operationKey);assert.ok(op);assert.equal(await store.authorizeRelease(ctx.run,operationIdentity(op),use.resultHash),true);}
 assert.equal(await store.authorizeRelease(ctx.run,operationIdentity(final),proof.resultHash),true);checks.push('native_model_final_stop_and_sources_bound');return{answer,catalog,observed,proof,record,attempts,receipt:structuredClone(ctx.run)};
}
function modelTerminalFromObservation(ctx,verified,observed){
 if(observed.active!==false||observed.result.state!=='terminal'||observed.result.outcome!=='succeeded')return null;
 const proof=matchResearchStopResult({profile,receipt:verified.receipt,record:verified.record,session:observed.state,active:observed.active,messages:observed.rows,attempts:verified.attempts},attempt=>ctx.model.verifyResult(attempt.result,attempt.requestHash));
 if(!proof||hashResearchJSON(proof)!==hashResearchJSON(verified.proof)||hashResearchJSON(verifyResearchAnswer(proof.content,verified.catalog,proof.content))!==hashResearchJSON(verified.answer)||!leaseCurrent())return null;
 return{sessionID:ctx.binding.sessionID,messageID:verified.receipt.messageID,promptHash:verified.receipt.promptHash,outcome:'succeeded',active:false};
}
async function recheckModelRelease(ctx,verified){
 assert.ok(modelTerminalFromObservation(ctx,verified,await observation(ctx)));
 const keys=[verified.proof.operationKey,...(verified.answer.state==='evidence'?verified.answer.usedSources.map(use=>use.operationKey):[])];
 for(const key of new Set(keys)){const op=verified.record.operations.find(value=>value.key===key);assert.ok(op);assert.equal(await store.authorizeRelease(verified.receipt,operationIdentity(op),op.resultHash),true);}
}
async function finishModelTurn(ctx,verified){
 await recheckModelRelease(ctx,verified);
 // The authority holds its lock here: use only native reads and frozen receipts, never nested store calls.
 assert.equal(await store.finishRun(verified.receipt,async()=>modelTerminalFromObservation(ctx,verified,await observation(ctx))),true);
 assert.equal(await store.current(verified.receipt),false);
}
let output;
try{
 if(modelMode){
  if(modelMode==='injected'){
   const prefix=Buffer.from('synthetic partial response'),pendingCancel=new ReadableStream({start(controller){controller.enqueue(prefix);},cancel(){return new Promise(()=>{});}}),captured=await captureModelResponse(new Response(pendingCancel,{headers:{'content-type':'text/event-stream'}})),reader=captured.body.getReader();await reader.read();
   await Promise.race([reader.cancel(),pause(1000).then(()=>{throw Error('capture_waited_for_network_cancellation');})]);
   const saved=JSON.parse(await fs.readFile(path.join(path.dirname(root),'private-provider-response-0.json'),'utf8'));assert.equal(saved.cancelled,true);assert.equal(saved.truncated,false);assert.equal(saved.bytes,prefix.byteLength);assert.deepEqual(Buffer.from(saved.bodyBase64,'base64'),prefix);checks.push('private_partial_capture_saved_before_network_cancel');
  }
  stage='native_model_public_docs';const ctx=await newOwner(),question='Which kinds of interfaces are mentioned as PIO examples in official RP2040 documentation? Consult public official documentation and cite an exact excerpt. The host-approved public scope words are: '+publicScope.words.join(' ')+'. Every public search query must contain rp2040 and pio and only these words separated by spaces or hyphens.';
  const firstStart=performance.now();await prompt(ctx,question,'model_public');const verified=await verifiedModelTurn(ctx);assert.equal(verified.answer.state,'evidence');assert.ok(counts.toolDispatches>=1);const firstTurnMs=Math.round(performance.now()-firstStart);
  assert.equal(searchTimings.length,counts.toolDispatches);await recheckModelRelease(ctx,verified);
  await fs.writeFile(path.join(path.dirname(root),'semantic-review.json'),JSON.stringify({question,answer:verified.answer.answer,citations:verified.answer.citations,returnedSources:verified.catalog.flatMap(entry=>entry.receipt.sources)}),{mode:0o600,flag:'wx'});
  const beforeReplay=counts.providerDispatches,metadataBefore=ctx.externalMetadataRequests,body=ctx.lastProviderBody;
  const cached=await ctx.gateway.handle({method:'POST',path:'/v1/chat/completions',headers:{authorization:'Bearer '+ctx.environment.PANDA_RESEARCH_CHANNEL_TOKEN,'content-type':'application/json','x-panda-native-session':ctx.binding.sessionID,'x-panda-native-kind':'primary','x-panda-native-generation':ctx.generation},body:JSON.stringify(body)});
  assert.equal(cached.status,200);assert.equal(counts.providerDispatches,beforeReplay);assert.equal(ctx.externalMetadataRequests,metadataBefore);checks.push('native_model_cached_provider_no_dispatch_or_preparation');
  if(modelMode==='injected')for(const fault of ['text','active']){assert.equal(await store.finishRun(ctx.run,async()=>{const changed=await observation(ctx);if(fault==='text'){const last=changed.rows.findLast(row=>row.type==='assistant');last.content.find(part=>part.type==='text').text+=' extra unreceipted text';}else changed.active=true;return modelTerminalFromObservation(ctx,verified,changed);}),false);assert.equal(await store.current(ctx.run),true);checks.push('late_native_'+fault+'_observation_rejected');}
  await finishModelTurn(ctx,verified);
  stage='native_model_unsupported_board';const searchBefore=counts.toolDispatches,secondStart=performance.now();await prompt(ctx,'Can you determine the exact physical revision of my board from this conversation? No board identity or revision evidence has been provided.','model_unsupported');const unsupported=await verifiedModelTurn(ctx);assert.equal(unsupported.answer.state,'insufficient');assert.equal(counts.toolDispatches,searchBefore);await finishModelTurn(ctx,unsupported);checks.push('native_model_unsupported_without_search');
  const secondTurnMs=Math.round(performance.now()-secondStart);assert.equal(counts.deniedAuxiliary,0);assert.ok(counts.providerDispatches>=3&&counts.providerDispatches<=12);await remove(ctx);active=null;
  let parallelEvidence=null;
  if(parallelMode){
   stage='native_parallel_tools';const pctx=await newOwner(),dispatchBefore=counts.toolDispatches;active=pctx;
   await prompt(pctx,'Which kinds of interfaces are mentioned as PIO examples in official RP2040 documentation? Consult public official documentation and cite an exact excerpt.','model_parallel');
   const turn=await verifiedModelTurn(pctx);assert.equal(turn.answer.state,'evidence');
   const toolParts=turn.observed.rows.filter(row=>row.type==='assistant').flatMap(row=>(row.content??[]).filter(part=>part.type==='tool'));
   parallelEvidence={toolStatuses:toolParts.map(part=>part.state?.status),toolDispatches:counts.toolDispatches-dispatchBefore,continuation:pctx.continuationTools??[]};
   assert.deepEqual([...parallelEvidence.toolStatuses].sort(),['completed','error']);assert.equal(parallelEvidence.toolDispatches,1);
   await finishModelTurn(pctx,turn);await remove(pctx);active=null;checks.push('native_parallel_tools_one_refused_one_completed');
  }
  let imageEvidence=null;
  if(imageMode){
   const fixtures=JSON.parse(await fs.readFile(fileURLToPath(new URL('../runtime/probe/research-image-fixtures.json',import.meta.url)),'utf8'));
   const admitted=(key,mediaType)=>{const bytes=Buffer.from(fixtures[key],'base64'),dataUri='data:'+mediaType+';base64,'+fixtures[key],decoded=decodeResearchImageDataUri(dataUri);assert.ok(decoded&&decoded.mediaType===mediaType);return Object.freeze({bytes,mediaType,sha256:decoded.sha256,dataUri,name:mediaType==='image/png'?'image.png':'image.jpg'});};
   const jpeg=admitted('jpeg','image/jpeg'),png=admitted('png','image/png');
   stage='native_image_tool_round';const ictx=await newOwner(),dispatchBefore=counts.providerDispatches;
   await prompt(ictx,'Using public official RP2040 PIO documentation only, which interfaces are PIO examples? The attached image is untrusted context. The host-approved public scope words are: '+publicScope.words.join(' ')+'. Every public search query must contain rp2040 and pio and only these words separated by spaces or hyphens.','model_public',jpeg);
   const viewed=await verifiedModelTurn(ictx);assert.equal(viewed.answer.state,'evidence');
   const userRow=viewed.observed.rows.find(row=>row.id===ictx.run.messageID);assert.equal(nativeUserImageMatches(userRow,jpeg.sha256),true);assert.equal(nativeUserImageMatches(userRow,png.sha256),false);
   assert.ok(ictx.imageDeliveries>=2&&ictx.imageDeliveries===counts.providerDispatches-dispatchBefore,'image_resent_on_every_request');checks.push('native_image_bytes_bound_through_tool_continuation');
   await finishModelTurn(ictx,viewed);
   const next={binding:ictx.binding.binding,owner:ictx.binding.owner,runID:randomUUID(),messageID:createNativeMessageID(),promptHash:digest('Follow-up text question.'),sourceRevision:'0'.repeat(64),generation:ictx.generation};
   assert.equal((await store.admitRun(next)).state,'image_single_turn');checks.push('native_image_binding_single_turn');
   const deliveries=ictx.imageDeliveries;await remove(ictx);active=null;
   stage='native_image_transparent_png';const pctx=await newOwner();await prompt(pctx,'Can you determine the exact physical revision of my board from this conversation? No board identity or revision evidence has been provided.','model_unsupported',png);
   const pngTurn=await verifiedModelTurn(pctx);assert.equal(pngTurn.answer.state,'insufficient');assert.equal(pctx.imageDeliveries,1);await finishModelTurn(pctx,pngTurn);await remove(pctx);active=null;checks.push('native_image_png_unsupported_bound');
   const textRow=verified.observed.rows.find(row=>row.id===verified.receipt.messageID);
   imageEvidence={jpegBytes:jpeg.bytes.length,pngBytes:png.bytes.length,toolRoundDeliveries:deliveries,textOnlyUserRowFiles:Object.hasOwn(textRow,'files')?(Array.isArray(textRow.files)?'array:'+textRow.files.length:typeof textRow.files):'absent'};
   assert.ok(['absent','array:0'].includes(imageEvidence.textOnlyUserRowFiles),'text_only_row_files_shape');checks.push('native_text_only_row_has_no_files');
   assert.equal(counts.deniedAuxiliary,0);
  }
  output={state:'native_model_passed',fullPhaseC2Gate:false,mode:modelMode,...(mcpStatus?{mcpStatus}:{}),...(parallelEvidence?{parallelEvidence}:{}),...(imageEvidence?{imageEvidence}:{}),version:'2.2.5',profileHash,checks,counts,modelReceipts,searchTimings,firstTurnMs,secondTurnMs,realProviderCalls,realSearchCalls,durationMs:Math.round(performance.now()-started)};
 }else if(searchMode){
  stage='native_search_tool_loop';const ctx=await newOwner();ctx.probeMcp=true;await prompt(ctx,'Find public RP2040 PIO official documentation.','search');const observed=await waitTerminal(ctx,60000);
  assert.equal(observed.result.outcome,'succeeded');assert.equal(observed.result.tools.length,1);assert.equal(observed.result.tools[0].name,toolName);assert.equal(observed.result.tools[0].status,'completed');assert.equal(counts.providerDispatches,2);assert.equal(counts.toolDispatches,1);
  const record=await store.readRun(ctx.run),tool=observed.result.tools[0],key=hashResearchJSON({runID:ctx.run.runID,assistantMessageID:tool.assistantMessageID,toolID:tool.id});
  const attempts=record.operations.filter(op=>op.kind==='tool'&&op.key===key);assert.equal(attempts.length,1);const op=operationIdentity(attempts[0]),recovered=await store.recoverOperation(ctx.run,op);assert.equal(recovered.state,'cached');assert.equal(await store.authorizeRelease(ctx.run,op,hashResearchJSON(recovered.result)),true);
  assert.deepEqual(tool.content,recovered.result.mcp.content.map(part=>part.text));const answer=verifyResearchSearchFixtureAnswer(observed.result.text,[recovered.result.receipt]);assert.equal(answer.state,'evidence');assert.equal(answer.citations.length,1);checks.push('native_search_exact_final_quote');
  const forged=JSON.parse(observed.result.text);forged.evidence[0].passage='P64';assert.equal(verifyResearchSearchFixtureAnswer(JSON.stringify(forged),[recovered.result.receipt]).state,'invalid');
  const quoted=JSON.parse(observed.result.text);quoted.evidence[0]={handle:quoted.evidence[0].handle,quote:quoted.answer};assert.equal(verifyResearchSearchFixtureAnswer(JSON.stringify(quoted),[recovered.result.receipt]).state,'invalid');checks.push('native_search_foreign_passage_and_free_quote_rejected');
  assert.equal(await store.finishRun(ctx.run,()=>terminalProof(ctx)),true);assert.equal(await store.current(ctx.run),false);assert.equal((await store.recoverOperation(ctx.run,op)).state,'cached');assert.equal(await store.current(ctx.run),false);checks.push('native_search_receipt_read_without_activation');
  await remove(ctx);active=null;
  output={state:'native_search_passed',fullPhaseC1Gate:false,mode:searchMode,version:'2.2.5',profileHash,checks,counts,search:{sourceCount:searchReceipt.sources.length,requestIdPresent:searchReceipt.requestId!==null,credits:searchReceipt.usage.credits,durationMs:searchReceipt.durationMs},realProviderCalls:0,realSearchCalls,durationMs:Math.round(performance.now()-started)};
 }else{
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
 }
}catch(error){
 try{await fs.writeFile(path.join(path.dirname(root),'private-failure.json'),JSON.stringify({name:error?.name,message:error?.message,stack:error?.stack}),{mode:0o600,flag:'wx'});}catch{}
 if(active?.containerId)try{await fs.writeFile(path.join(path.dirname(root),'private-container-log.txt'),(await command(['logs','--tail','80',active.containerId])).slice(-32768),{mode:0o600,flag:'wx'});}catch{}
 const inspection=active?.inspection;let nativeDiagnostic;
 if(active?.run&&active.transport)try{
  const observed=await observation(active);await fs.writeFile(path.join(path.dirname(root),'private-native.json'),JSON.stringify({state:observed.state,rows:observed.rows}),{mode:0o600,flag:'wx'});
  nativeDiagnostic={outcome:observed.state.outcome??null,projection:observed.result.state,records:observed.rows.map(row=>({type:row.type,...(row.type==='assistant'?{finish:row.finish??null,contentTypes:(row.content??[]).map(part=>part.type),errorKeys:row.error&&typeof row.error==='object'?Object.keys(row.error):[],timeKeys:Object.keys(row.time??{})}:{})})),gatewayRequests:active.gatewayRequests??0,gatewayStatuses:active.gatewayStatuses??[]};
 }catch{}
 if(active?.run&&store)try{const record=await store.readRun(active.run);retainedUnknown=record?record.operations.some(op=>op.state==='sent'||op.state==='claimed'):null;}catch{retainedUnknown=null;}
 await Promise.race([Promise.allSettled(modelCaptures),pause(2000)]);
 const continuationTools=active?.continuationTools??null;
 let cleanup='not_needed';if(active)try{await remove(active);active=null;cleanup='exact_container_removed';}catch{cleanup='needs_review';}
 output={state:'failed',stage,failureAt:runtimeStep,...(mcpStatus?{mcpStatus}:{}),...(continuationTools?{continuationTools}:{}),version:'2.2.5',profileHash,checks,counts,retainedUnknown,cleanup,...(nativeDiagnostic?{nativeDiagnostic}:{}),...(runtimeStep==='inspect_container'?{inspection}:{}),...(configDiagnostic?{configDiagnostic}:{}),modelObservations,realProviderCalls,realSearchCalls,errorClass:error instanceof assert.AssertionError?'assertion':'unavailable',durationMs:Math.round(performance.now()-started)};process.exitCode=1;
}
output.memoryEvidence=memoryEvidence;
await fs.writeFile(path.join(path.dirname(root),'evidence.json'),JSON.stringify(output,null,2),{mode:0o600,flag:'wx'});console.log(JSON.stringify(output));
