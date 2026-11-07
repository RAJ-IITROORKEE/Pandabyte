// Provider-free local skill loading and explicit non-resuming activation; no general installer.
import { createReadStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { createNativeReceipt } from '../src/opencode/session-contracts.ts';
import { createNativeSessionClient } from '../src/opencode/session-client.ts';
import { createDescriptorLease, inspectionConfig, inspectionEnvironment, matchesPinnedVersion, verifiedConfig } from './start-native-inspection.mjs';

const binaryHash='e49134e14f29f0ab586035c3e6e486a7aa9c3e721d556661eff9f4eee0e1dae4';
const archiveIntegrity='tFS9vYp0/+VOeYpcWvAy1e2iMEx6x5/XagVpwtjG33ocvumn5R2qaKGhqhI56Wu8Hfet+VYaw8nwbx9BqxJCqQ==';
const requireValue=value=>{if(!value)throw Error('probe_contract');};
const inside=(parent,path)=>{const rel=relative(parent,path);return rel&&rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel);};
const body='This document is an inert fixture for local capability inspection.\n';
const activationEvent = 'session.skill.activated';

export function syntheticSkill(name) {
  requireValue(/^fixture-[a-f0-9]{32}$/.test(name));
  return `---\nname: ${name}\ndescription: Synthetic inert local capability fixture.\ndisable-model-invocation: true\n---\n\n${body}`;
}

export function skillPolicy(name,path) {
  syntheticSkill(name);requireValue(isAbsolute(path));
  const config=inspectionConfig();config.skills=[path];
  config.policies.push({action:'integration.use',resource:'skill:'+name,effect:'allow'});
  return config;
}

export async function readSkillHistory(list) {
  const messages=[];let cursor;
  for(let page=0;page<2;page++){
    const result=await list(cursor);requireValue(Array.isArray(result.data)&&messages.length+result.data.length<=1&&result.cursor);
    messages.push(...result.data);const next=result.cursor.next;
    if(next==null)return messages;
    requireValue(result.data.length>0&&typeof next==='string'&&next.length<=2048&&/^[A-Za-z0-9_-]+={0,2}$/.test(next)&&next!==cursor);
    cursor=next;
  }
  throw Error('probe_contract');
}

export async function verifyLiveSkillActivation(events, activate, sessionID, skill) {
  const iterator = events[Symbol.asyncIterator]();
  try {
    const connected = await iterator.next();
    requireValue(!connected.done && connected.value?.type === 'server.connected');
    await activate();

    const { value: event, done } = await iterator.next();
    requireValue(!done && event?.type === activationEvent
      && event.data?.sessionID === sessionID && event.durable?.aggregateID === sessionID
      && event.data.id === skill.id && event.data.name === skill.name && event.data.text === skill.content);
  } finally {
    await iterator.return?.();
  }
}

export function skillTransport({baseUrl,directory,receipt,skillID,mutations,signal,fetch:transport=fetch}) {
  const owned='/api/session/'+receipt.sessionID,activation='/api/experimental/session/'+receipt.sessionID+'/skill',log='/api/experimental/session/'+receipt.sessionID+'/log';
  const reads=new Set(['/api/info','/api/model','/api/skill','/api/mcp','/api/config','/api/session','/api/session/active',owned,owned+'/message',log]);
  let liveReadStarted = false;
  return async(input,init={})=>{
    const url=new URL(input),method=init.method??'GET';requireValue(url.origin===baseUrl&&!url.username&&!url.password&&!url.hash);
    let mutation;
    if(method==='POST'&&url.pathname==='/api/session'){
      const input=JSON.parse(init.body);requireValue(Object.keys(input).sort().join(',')==='id,location,metadata,permissions,title'&&input.id===receipt.sessionID&&input.title===receipt.title&&input.location?.directory===directory
        &&input.metadata?.pandaAgent?.nonce===receipt.nonce&&input.metadata.pandaAgent.binding===receipt.binding&&input.metadata.pandaAgent.scope==='playground'
        &&JSON.stringify(input.permissions)==='[{"action":"*","resource":"*","effect":"deny"}]');mutation='create';
    }else if(method==='POST'&&url.pathname===activation){
      const input=JSON.parse(init.body);requireValue(Object.keys(input).sort().join(',')==='id,resume'&&input.id===skillID&&input.resume===false);mutation='activate';
    }else if(method==='DELETE'&&url.pathname===owned)mutation='remove';
    else if (method === 'GET' && url.pathname === '/api/event') {
      requireValue(!liveReadStarted && !url.search && mutations.create === 1 && mutations.activate === 0);
      liveReadStarted = true;
      // OpenCode.make applies its subscription filter client-side. Limit the wire feed too.
      url.searchParams.set('types', activationEvent);
    }
    else requireValue(method==='GET'&&reads.has(url.pathname));
    if(url.pathname===log)requireValue(url.searchParams.get('follow')==='false');
    if(mutation){requireValue(mutations[mutation]===0);mutations[mutation]++;}
    const bounded=AbortSignal.any([signal,AbortSignal.timeout(12000),...(init.signal?[init.signal]:[])]);
    const response=await transport(url,{...init,signal:bounded,redirect:'error',credentials:'omit',cache:'no-store'});requireValue(!response.redirected);
    if(response.status===204){void response.body?.cancel().catch(()=>{});return new Response(null,{status:204});}
    const type=response.headers.get('content-type')??'';
    const eventStream = /^text\/event-stream(?:\s*;[^\r\n]*)?$/i.test(type);
    requireValue(response.body&&(/^application\/json(?:\s*;[^\r\n]*)?$/i.test(type)||((url.pathname===log || url.pathname==='/api/event')&&eventStream)));
    if (url.pathname === '/api/event' && eventStream) {
      let bytes = 0;
      const body = response.body.pipeThrough(new TransformStream({
        transform(chunk, controller) {
          bytes += chunk.length;
          requireValue(bytes <= 1_000_000);
          controller.enqueue(chunk);
        },
      }), { signal: bounded });
      return new Response(body, { status: response.status, headers: { 'content-type': type } });
    }
    const reader=response.body.getReader(),chunks=[];let size=0;
    try{while(true){const part=await reader.read();bounded.throwIfAborted();if(part.done)break;size+=part.value.length;requireValue(size<=1_000_000);chunks.push(part.value);}}
    finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
    return new Response(Buffer.concat(chunks),{status:response.status,headers:{'content-type':type}});
  };
}

async function digest(path,algorithm,encoding,size) {
  const stat=await lstat(path);requireValue(stat.isFile()&&!stat.isSymbolicLink()&&stat.size===size);const hash=createHash(algorithm);let bytes=0;
  for await(const chunk of createReadStream(path)){bytes+=chunk.length;requireValue(bytes<=size);hash.update(chunk);}requireValue(bytes===size);return hash.digest(encoding);
}

async function run(args) {
  requireValue(process.platform==='win32'&&args.length===2&&args[0]==='--client-root'&&isAbsolute(args[1]));
  const workspace=resolve(dirname(fileURLToPath(import.meta.url)),'..','..'),clientRoot=await realpath(args[1]);
  for(const name of ['client','protocol','schema']){const pkg=JSON.parse(await readFile(join(dirname(clientRoot),name,'package.json'),'utf8'));requireValue(pkg.name===`@opencode/${name}`&&pkg.version==='2.2.2');}
  const {OpenCode}=await import(pathToFileURL(join(clientRoot,'dist','promise','index.js')).href);
  const summary={version:'2.2.2',nativeClientVersion:'2.2.2',scope:'disposable provider-free local skill load and non-resuming activation',checks:{},mutations:{create:0,activate:0,remove:0},promptRequests:0,modelRequests:0,toolRequests:0,sharedRuntimeChanged:false,result:'stopped'};
  let root,rootIdentity,child,exited,lease,native,access,stage='provenance';
  const controller=new AbortController(),stop=()=>controller.abort();process.once('SIGINT',stop);process.once('SIGTERM',stop);
  const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(90000)]);
  const receipt=createNativeReceipt('playground',randomBytes(32).toString('hex'));
  try{
    const assets=join(workspace,'tmp','opencode-2.2.2-review'),executable=join(assets,'opencode.exe');
    requireValue(await digest(executable,'sha256','hex',254943112)===binaryHash&&await digest(join(assets,'opencode-cli-windows-x64-2.2.2.tgz'),'sha512','base64',119436377)===archiveIntegrity);summary.checks.binaryProvenance=true;
    root=await realpath(await mkdtemp(join(await realpath(tmpdir()),'pandabyte-native-skill-probe-')));rootIdentity=await lstat(root);
    for(const part of ['home','programdata','tmp','config','data','cache','state','workspace','private','fixture-skills'])await mkdir(join(root,part));
    const name='fixture-'+randomBytes(16).toString('hex'),skillRoot=join(root,'fixture-skills'),skillFolder=join(skillRoot,name);await mkdir(skillFolder);
    const skillPath=join(skillFolder,'SKILL.md');await writeFile(skillPath,syntheticSkill(name),{flag:'wx',mode:0o600});
    const config=skillPolicy(name,skillRoot),configBytes=JSON.stringify(config),configPath=join(root,'config','opencode.json'),password=randomBytes(32).toString('hex'),directory=join(root,'workspace');
    await writeFile(configPath,configBytes,{flag:'wx',mode:0o600});const env=inspectionEnvironment(root,password);
    stage='version';const reported=await promisify(execFile)(executable,['--version'],{env,cwd:directory,windowsHide:true,timeout:5000,maxBuffer:128,signal});requireValue(matchesPinnedVersion(reported.stdout));
    const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise((done,fail)=>server.close(error=>error?fail(error):done()));
    child=spawn(executable,['serve','--hostname','127.0.0.1','--port',String(port)],{env,cwd:directory,stdio:'ignore',windowsHide:true,detached:true});exited=new Promise(done=>{child.once('exit',done);child.once('error',done);});
    const baseUrl=`http://127.0.0.1:${port}`,transport=skillTransport({baseUrl,directory,receipt,skillID:name,mutations:summary.mutations,signal});
    const client=OpenCode.make({baseUrl,headers:{Authorization:`Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`,'x-opencode-directory':encodeURIComponent(directory)},fetch:transport});
    const reference={location:{directory}},guard=async()=>{const info=await client.server.info({signal});requireValue(info.version==='2.2.2'&&info.pid===child.pid);};
    stage='identity';const deadline=Date.now()+25000;while(true){try{await guard();break;}catch{requireValue(!signal.aborted&&child.exitCode===null&&child.signalCode===null&&Date.now()<deadline);await new Promise(done=>setTimeout(done,100));}}
    stage='catalog';requireValue((await client.model.list(reference,{signal})).data.length===0&&(await client.mcp.list(reference,{signal})).data.length===0);
    const catalog=await client.skill.list(reference,{signal});requireValue(catalog.location.directory===directory&&catalog.data.length===1);
    const skill=catalog.data[0];requireValue(skill.id===name&&skill.name===name&&skill.path===skillPath&&skill.autoinvoke===false&&skill.content.trim()===body.trim());
    requireValue(verifiedConfig(await client.config.get(reference,{signal}),config,root));summary.checks.onlyOwnedSyntheticSkillLoaded=true;summary.checks.autoinvokeDisabled=true;summary.checks.providersToolsAndOtherIntegrationsDenied=true;
    const generation=randomBytes(32).toString('hex');lease=await createDescriptorLease(root,join(root,'private','runtime.json'),generation);
    await lease.publish({version:1,generation,pid:child.pid,baseUrl,directory,configHash:createHash('sha256').update(configBytes).digest('hex'),password});
    const receiptPath=join(root,'private','session-receipt.json');await writeFile(receiptPath,JSON.stringify(receipt),{flag:'wx',mode:0o600});
    access=async candidate=>JSON.stringify(candidate)===await readFile(receiptPath,'utf8');
    native=createNativeSessionClient({baseUrl,password,directory,expectedPid:child.pid,fetch:transport,timeoutMs:10000});
    stage='create';await native.create(receipt,access,signal);summary.checks.ownedSessionCreated=true;
    stage='activation_live';await guard();
    await verifyLiveSkillActivation(client.event.subscribe({ types: [activationEvent], signal }), async () => {
      await writeFile(join(root,'private','activation-claim.json'),JSON.stringify({receipt,skill:name,resume:false}),{flag:'wx',mode:0o600});
      await client.experimental.session.skill({sessionID:receipt.sessionID,id:skill.id,resume:false},{signal});
      summary.checks.activationAcknowledged = true;
    }, receipt.sessionID, skill);
    summary.checks.ownedLiveActivationEvent = true;
    stage='history';let pages=0;const messages=await readSkillHistory(cursor=>{pages++;return client.message.list({sessionID:receipt.sessionID,limit:100,...(cursor?{cursor}:{order:'asc'})},{signal});});
    summary.checks.historyPages=pages;requireValue(messages.length===1);const message=messages[0];
    requireValue(message.type==='skill'&&message.skill===skill.id&&message.name===skill.name&&message.text===skill.content);summary.checks.exactSkillMessagePersisted=true;
    stage='inactive';const state=await native.get(receipt,access,signal),active=await native.active(receipt,access,signal);
    requireValue(!active.active&&state.time.busy===undefined&&state.outcome===undefined);summary.checks.sessionStayedUnstarted=true;
    stage='activation_log_read';const events=[];for await(const event of client.experimental.session.log({sessionID:receipt.sessionID,follow:false},{signal})){requireValue(events.length<100);events.push(event);}
    stage='activation_log_watermark';
    requireValue(events.length === 1 && events[0]?.type === 'log.synced' && events[0].aggregateID === receipt.sessionID);
    summary.checks.historicalLog = 'watermark_only';
    stage='remove';await native.remove(receipt,access,signal);summary.sessionRemoved=(await native.absence(receipt,access,signal)).absent;
    requireValue((await client.model.list(reference,{signal})).data.length===0);await guard();summary.checks.finalModelsEmpty=true;summary.result='completed';
  }catch{summary.reason=stage;}
  finally{
    if(native&&access&&summary.mutations.create===1&&summary.mutations.remove===0&&!signal.aborted){try{const state=await native.get(receipt,access,signal);requireValue(state.time.busy===undefined);await native.remove(receipt,access,signal);summary.sessionRemoved=(await native.absence(receipt,access,signal)).absent;}catch{summary.sessionRemoved=false;}}
    summary.descriptorRemoved=lease?await lease.release():true;
    let stopped=!child;if(child){if(child.exitCode===null&&child.signalCode===null)child.kill();let timer;try{stopped=await Promise.race([exited.then(()=>true),new Promise(done=>{timer=setTimeout(()=>done(false),5000);})]);}finally{clearTimeout(timer);}}
    summary.childStopped=stopped;summary.fixtureRemoved=false;
    if(root&&stopped&&summary.descriptorRemoved){try{const parent=await realpath(tmpdir()),stat=await lstat(root);requireValue(inside(parent,root)&&basename(root).startsWith('pandabyte-native-skill-probe-')&&!stat.isSymbolicLink()&&stat.dev===rootIdentity.dev&&stat.ino===rootIdentity.ino&&await realpath(root)===root);await rm(root,{recursive:true,force:true});summary.fixtureRemoved=true;}catch{}}
    summary.limitations=['Synthetic reviewed local skill only; no external installation or shared Admin mutation.',
      'Live delivery is volatile. Stock serve does not retain historical event payloads. Session history provides activation readback.',
      'No model, tool, restart-persistence, privacy or customer-isolation proof.'];
    process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
  }
  process.stdout.write(JSON.stringify(summary,null,2)+'\n');if(summary.result!=='completed'||!summary.sessionRemoved||!summary.descriptorRemoved||!summary.childStopped||!summary.fixtureRemoved)process.exitCode=1;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))run(process.argv.slice(2)).catch(()=>{process.stderr.write('native skill probe unavailable\n');process.exitCode=1;});
