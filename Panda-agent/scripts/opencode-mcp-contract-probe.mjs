// One disposable provider-free MCP management attempt; OpenCode is the only MCP client.
import { createReadStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { createDescriptorLease, inspectionConfig, inspectionEnvironment, matchesPinnedVersion, verifiedConfig } from './start-native-inspection.mjs';

const binaryHash = 'e49134e14f29f0ab586035c3e6e486a7aa9c3e721d556661eff9f4eee0e1dae4';
const archiveIntegrity = 'tFS9vYp0/+VOeYpcWvAy1e2iMEx6x5/XagVpwtjG33ocvumn5R2qaKGhqhI56Wu8Hfet+VYaw8nwbx9BqxJCqQ==';
const requireValue = value => { if (!value) throw Error('probe_contract'); };
const inside = (parent, path) => { const rel = relative(parent,path); return rel && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel); };

export function syntheticReply(message) {
  if (!message || typeof message !== 'object' || message.id === undefined) return null;
  let result;
  if (message.method === 'initialize') result = {protocolVersion:message.params.protocolVersion,capabilities:{tools:{listChanged:false}},serverInfo:{name:'Disposable fixture',version:'1.0.0'}};
  else if (message.method === 'tools/list') result = {tools:[{name:'fixture_readonly',description:'Harmless capability-discovery fixture; never executed.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}}]};
  else if (message.method === 'resources/list') result = {resources:[]};
  else if (message.method === 'resources/templates/list') result = {resourceTemplates:[]};
  else if (message.method === 'prompts/list') result = {prompts:[]};
  else if (message.method === 'ping') result = {};
  else return {jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Fixture operation unavailable'}};
  return {jsonrpc:'2.0',id:message.id,result};
}

export function syntheticServerSource() {
  return `import {createInterface} from 'node:readline';
import {appendFileSync} from 'node:fs';
const log=process.argv[2],nonce=process.argv[3],reply=${syntheticReply.toString()};
const record=value=>appendFileSync(log,JSON.stringify(value)+'\\n');
record({event:'started',pid:process.pid,ppid:process.ppid,nonce});
const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{if(Buffer.byteLength(line)>16384)process.exit(1);const message=JSON.parse(line);const methods=['initialize','notifications/initialized','tools/list','tools/call','resources/list','resources/templates/list','prompts/list','ping'];record({event:methods.includes(message.method)?message.method:'other'});const output=reply(message);if(output)process.stdout.write(JSON.stringify(output)+'\\n')});
input.on('close',()=>process.exit(0));
setTimeout(()=>process.exit(0),90000).unref();
`;
}

export function probePolicy(name) {
  requireValue(/^fixture-[a-f0-9]{32}$/.test(name));
  const config = inspectionConfig();
  config.policies.push({action:'integration.use',resource:`mcp:${name}`,effect:'allow'});
  return config;
}

export function mutationFor(method, path, name) {
  const base = '/api/experimental/mcp/' + encodeURIComponent(name);
  return method === 'PUT' && path === base ? 'add' : method === 'DELETE' && path === base ? 'remove'
    : method === 'POST' && path === base + '/connect' ? 'connect' : method === 'POST' && path === base + '/disconnect' ? 'disconnect' : null;
}

export function probeTransport({baseUrl,name,mutations,signal,fetch:transport = fetch}) {
  const reads = new Set(['/api/info','/api/model','/api/skill','/api/mcp','/api/mcp/resource','/api/config']);
  return async (input, init = {}) => {
    const url = new URL(input), method = init.method ?? 'GET';
    requireValue(url.origin === baseUrl && !url.username && !url.password && !url.hash);
    const mutation = mutationFor(method,url.pathname,name);
    requireValue(mutation || (method === 'GET' && reads.has(url.pathname)));
    if (mutation) { requireValue(mutations[mutation] === 0); mutations[mutation]++; }
    const bounded = AbortSignal.any([signal,AbortSignal.timeout(12000),...(init.signal ? [init.signal] : [])]);
    const response = await transport(url,{...init,signal:bounded,redirect:'error',credentials:'omit',cache:'no-store'});
    requireValue(!response.redirected);
    if (response.status === 204) { void response.body?.cancel().catch(()=>{}); return new Response(null,{status:204}); }
    requireValue(/^application\/json(?:\s*;[^\r\n]*)?$/i.test(response.headers.get('content-type') ?? '') && response.body);
    const reader=response.body.getReader(),chunks=[];let size=0;
    try { while(true){const part=await reader.read();bounded.throwIfAborted();if(part.done)break;size+=part.value.length;requireValue(size<=1_000_000);chunks.push(part.value);} }
    finally { void reader.cancel().catch(()=>{});reader.releaseLock(); }
    return new Response(Buffer.concat(chunks),{status:response.status,headers:{'content-type':'application/json'}});
  };
}

async function digest(path,algorithm,encoding,size) {
  const stat=await lstat(path);requireValue(stat.isFile()&&!stat.isSymbolicLink()&&stat.size===size);
  const hash=createHash(algorithm);let bytes=0;
  for await(const chunk of createReadStream(path)){bytes+=chunk.length;requireValue(bytes<=size);hash.update(chunk);}
  requireValue(bytes===size);return hash.digest(encoding);
}

async function fixtureProcesses(logPath) {
  try {
    const bytes=await readFile(logPath);requireValue(bytes.length<=65536);
    return bytes.toString('utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  } catch(error) { if(error.code==='ENOENT')return [];throw error; }
}

async function stopFixtureProcess(value) {
  requireValue(Number.isSafeInteger(value.pid)&&value.pid>0&&Number.isSafeInteger(value.parent)&&value.parent>0&&/^[a-f0-9]{32}$/.test(value.nonce));
  // A retained process handle and exact owned executable/script/nonce/parent checks precede any stop.
  const script = `$ErrorActionPreference='Stop';[Console]::InputEncoding=[System.Text.UTF8Encoding]::new($false);$v=[Console]::In.ReadToEnd()|ConvertFrom-Json;
try{$p=[System.Diagnostics.Process]::GetProcessById([int]$v.pid);$null=$p.Handle}catch{[Console]::Out.Write('absent');exit 0};
$c=Get-CimInstance Win32_Process -Filter ('ProcessId = '+[int]$v.pid);
if($null -eq $c){[Console]::Out.Write('absent');exit 0};
if($c.ExecutablePath -ne $v.executable -or $c.ParentProcessId -ne $v.parent -or !$c.CommandLine.Contains([string]$v.script) -or !$c.CommandLine.Contains([string]$v.nonce)){exit 1};
$p.Kill();if(!$p.WaitForExit(5000)){exit 1};[Console]::Out.Write('stopped')`;
  const result=await new Promise(resolve=>{
    const child=execFile(join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:10000,maxBuffer:64},
      (error,stdout)=>resolve(!error&&(stdout==='absent'||stdout==='stopped')));
    child.stdin?.end(JSON.stringify(value));child.stdin?.on('error',()=>{});
  });
  return result;
}

async function run(args) {
  requireValue(process.platform==='win32'&&args.length===2&&args[0]==='--client-root'&&isAbsolute(args[1]));
  const workspace=resolve(dirname(fileURLToPath(import.meta.url)),'..','..');
  const clientRoot=await realpath(args[1]);
  for(const name of ['client','protocol','schema']){
    const pkg=JSON.parse(await readFile(join(dirname(clientRoot),name,'package.json'),'utf8'));
    requireValue(pkg.name===`@opencode/${name}`&&pkg.version==='2.2.2');
  }
  const {OpenCode}=await import(pathToFileURL(join(clientRoot,'dist','promise','index.js')).href);
  requireValue(typeof OpenCode.make==='function');
  const output=await open(join(workspace,'docs','agent-experience-upgrade','opencode-mcp-probe.json'),'wx');
  const summary={version:'2.2.2',nativeClientVersion:'2.2.2',scope:'disposable provider-free native MCP capability probe',checks:{},mutations:{add:0,connect:0,disconnect:0,remove:0},modelRequests:0,toolCalls:0,sharedRuntimeChanged:false,result:'stopped'};
  let root,rootIdentity,child,exited,lease,client,stage='provenance',name,scriptPath,logPath,nonce,node,unknown=false;
  const attempts=new Set(),signal=AbortSignal.timeout(90000),controller=new AbortController();
  const stop=()=>controller.abort();process.once('SIGINT',stop);process.once('SIGTERM',stop);
  const active=AbortSignal.any([signal,controller.signal]);
  let reference,guard;
  try {
    const assets=join(workspace,'tmp','opencode-2.2.2-review'),executable=join(assets,'opencode.exe');
    requireValue(await digest(executable,'sha256','hex',254943112)===binaryHash&&await digest(join(assets,'opencode-cli-windows-x64-2.2.2.tgz'),'sha512','base64',119436377)===archiveIntegrity);
    summary.checks.binaryProvenance=true;
    root=await realpath(await mkdtemp(join(await realpath(tmpdir()),'pandabyte-native-mcp-probe-')));rootIdentity=await lstat(root);
    for(const part of ['home','programdata','tmp','config','data','cache','state','workspace','private'])await mkdir(join(root,part));
    nonce=randomBytes(16).toString('hex');name='fixture-'+nonce;node=await realpath(process.execPath);
    requireValue(isAbsolute(node)&&process.release.name==='node'&&Number(process.versions.node.split('.')[0])===24);
    scriptPath=join(root,'fixture-'+nonce+'.mjs');logPath=join(root,'fixture-receipt.jsonl');
    await writeFile(scriptPath,syntheticServerSource(),{flag:'wx',mode:0o600});
    const config=probePolicy(name),configBytes=JSON.stringify(config),configPath=join(root,'config','opencode.json'),password=randomBytes(32).toString('hex');
    await writeFile(configPath,configBytes,{flag:'wx',mode:0o600});
    const env=inspectionEnvironment(root,password);
    stage='version';const version=await promisify(execFile)(executable,['--version'],{env,cwd:join(root,'workspace'),windowsHide:true,timeout:5000,maxBuffer:128,signal:active});requireValue(matchesPinnedVersion(version.stdout));
    const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise((done,fail)=>server.close(error=>error?fail(error):done()));
    child=spawn(executable,['serve','--hostname','127.0.0.1','--port',String(port)],{env,cwd:join(root,'workspace'),stdio:'ignore',windowsHide:true,detached:true});
    exited=new Promise(done=>{child.once('exit',done);child.once('error',done);});
    const baseUrl=`http://127.0.0.1:${port}`,directory=join(root,'workspace');reference={location:{directory}};
    const transport=probeTransport({baseUrl,name,mutations:summary.mutations,signal:active});
    client=OpenCode.make({baseUrl,headers:{Authorization:`Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`,'x-opencode-directory':encodeURIComponent(directory)},fetch:transport});
    guard=async()=>{const info=await client.server.info({signal:active});requireValue(info.version==='2.2.2'&&info.pid===child.pid);};
    stage='identity';const deadline=Date.now()+25000;
    while(true){try{await guard();break;}catch{requireValue(!active.aborted&&child.exitCode===null&&child.signalCode===null&&Date.now()<deadline);await new Promise(done=>setTimeout(done,100));}}
    summary.checks.spawnedProcessPinned=true;
    stage='initial_catalogs';const models=await client.model.list(reference,{signal:active});const skills=await client.skill.list(reference,{signal:active});const initial=await client.mcp.list(reference,{signal:active});
    requireValue(models.data.length===0&&skills.data.length===0&&initial.data.length===0);requireValue(verifiedConfig(await client.config.get(reference,{signal:active}),config,root));
    summary.checks.denyProviderAndTools=true;summary.checks.onlyExactOwnedMcpIntegrationAllowed=true;summary.checks.initialCatalogsEmpty=true;summary.checks.mcpGetApiAvailable=typeof client.mcp.get==='function';summary.checks.ownedReadUsesNativeList=true;
    const generation=randomBytes(32).toString('hex');lease=await createDescriptorLease(root,join(root,'private','runtime.json'),generation);
    await lease.publish({version:1,generation,pid:child.pid,baseUrl,directory,configHash:createHash('sha256').update(configBytes).digest('hex'),password});summary.checks.privateDescriptor=true;
    const own=async()=>{await guard();const result=await client.mcp.list(reference,{signal:active});requireValue(result.location.directory===directory&&result.data.length<=1&&result.data.every(item=>item.name===name));return result.data[0]??null;};
    const mutate=async(key,operation)=>{
      requireValue(!attempts.has(key));attempts.add(key);await guard();
      await writeFile(join(root,'mutation-receipt.json'),JSON.stringify({attempts:[...attempts],mutations:summary.mutations}));
      try{await operation();summary.checks[key]='acknowledged';return true;}catch{summary.checks[key]='unknown';unknown=true;return false;}
    };
    const local={type:'local',command:[node,scriptPath,logPath,nonce],cwd:directory,disabled:true,codemode:false,protocol:'legacy',timeout:{startup:5000,catalog:5000,execution:1000}};
    stage='add';const added=await mutate('add',()=>client.experimental.mcp.add({...reference,server:name,config:local},{signal:active}));
    let current=await own();summary.checks.ownedEntryAfterAdd=Boolean(current);summary.checks.addState=current?.status.status??'absent';
    if(added&&current){
      stage='connect';const connected=await mutate('connect',()=>client.experimental.mcp.connect({...reference,server:name},{signal:active}));
      current=await own();const settle=Date.now()+10000;
      while(connected&&current?.status.status==='pending'&&Date.now()<settle){await new Promise(done=>setTimeout(done,200));current=await own();}
      summary.checks.connected=connected&&current?.status.status==='connected';
      const receipt=await fixtureProcesses(logPath);summary.checks.initializeRequests=receipt.filter(item=>item.event==='initialize').length;summary.checks.toolListRequests=receipt.filter(item=>item.event==='tools/list').length;summary.toolCalls=receipt.filter(item=>item.event==='tools/call').length;
      requireValue(summary.toolCalls===0);
      if(connected&&current?.status.status==='connected'){
        stage='resources';const resources=await client.mcp.resource.catalog(reference,{signal:active});summary.checks.resourceCatalogEmpty=resources.data.resources.length===0&&resources.data.templates.length===0;
        stage='disconnect';await mutate('disconnect',()=>client.experimental.mcp.disconnect({...reference,server:name},{signal:active}));current=await own();summary.checks.disconnectedState=current?.status.status??'absent';
      }
    }
    stage='remove';if(await own())await mutate('remove',()=>client.experimental.mcp.remove({...reference,server:name},{signal:active}));
    summary.checks.ownedEntryAbsent=await own()===null;summary.checks.sourceConfigurationUnchanged=await readFile(configPath,'utf8')===configBytes;
    requireValue((await client.model.list(reference,{signal:active})).data.length===0);await guard();summary.checks.finalModelsEmpty=true;
    summary.result=!unknown&&summary.checks.connected&&summary.checks.toolListRequests>=1&&summary.checks.ownedEntryAbsent?'completed':'partial';
  } catch { summary.reason=stage;summary.result='stopped'; }
  finally {
    if(client&&guard&&reference&&!active.aborted&&!attempts.has('remove')){
      try{await guard();const entries=await client.mcp.list(reference,{signal:active});if(entries.data.some(item=>item.name===name)){attempts.add('remove');await client.experimental.mcp.remove({...reference,server:name},{signal:active});}}catch{summary.checks.cleanupRemovalUnknown=true;}
    }
    summary.descriptorRemoved=lease?await lease.release():true;
    let stopped=!child;
    if(child){if(child.exitCode===null&&child.signalCode===null)child.kill();let timer;try{stopped=await Promise.race([exited.then(()=>true),new Promise(done=>{timer=setTimeout(()=>done(false),5000);})]);}finally{clearTimeout(timer);}}
    summary.childStopped=stopped;
    let fixtureStopped=true;
    if(logPath){try{const receipt=await fixtureProcesses(logPath);for(const item of receipt.filter(item=>item.event==='started')){requireValue(item.nonce===nonce&&item.ppid===child.pid);fixtureStopped=await stopFixtureProcess({pid:item.pid,parent:child.pid,nonce,executable:node,script:scriptPath})&&fixtureStopped;}summary.toolCalls=receipt.filter(item=>item.event==='tools/call').length;}catch{fixtureStopped=false;}}
    summary.fixtureChildrenStopped=fixtureStopped;
    summary.fixtureRemoved=false;
    if(root&&stopped&&fixtureStopped&&summary.descriptorRemoved){try{const parent=await realpath(tmpdir()),stat=await lstat(root);requireValue(inside(parent,root)&&basename(root).startsWith('pandabyte-native-mcp-probe-')&&!stat.isSymbolicLink()&&stat.dev===rootIdentity.dev&&stat.ino===rootIdentity.ino&&await realpath(root)===root);await rm(root,{recursive:true,force:true});summary.fixtureRemoved=true;}catch{}}
    summary.modelRequests=0;summary.limitations=['Synthetic local stdio catalog only; no tool invocation or model request.','No dedicated MCP get API in this client; ownership is checked through native list.','No durable restart, remote transport, shared Admin mutation, deployment, or privacy proof.'];
    process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
    await output.writeFile(JSON.stringify(summary,null,2)+'\n');await output.close();
  }
  process.stdout.write(JSON.stringify(summary,null,2)+'\n');
  if(summary.result!=='completed'||!summary.childStopped||!summary.fixtureChildrenStopped||!summary.descriptorRemoved||!summary.fixtureRemoved||summary.toolCalls!==0)process.exitCode=1;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))run(process.argv.slice(2)).catch(()=>{process.stderr.write('native MCP probe unavailable\n');process.exitCode=1;});
