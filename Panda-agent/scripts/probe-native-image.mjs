// C4.0 opt-in probe on the selected host: one synthetic image-attachment run in the immutable native image.
// --network none: no provider, Tavily or other external call is possible. Separate from hosted research code.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes,createHash} from 'node:crypto';
import {researchImageId,researchMemoryBytes} from '../src/opencode/research-runtime.ts';
import {reserveDockerHostSlot} from '../src/server/native-docker-host-quota.ts';

const exec=promisify(execFile),digest=b=>createHash('sha256').update(b).digest('hex'),pause=ms=>new Promise(d=>setTimeout(d,ms));
const mode=process.argv[2],root=process.argv[3];
if(mode!=='--aws-image-probe'||process.argv.length!==4||process.env.PANDA_RESEARCH_AWS_FIXTURE!=='i-05bcf2573a0b77f7a'||process.platform!=='linux'||process.getuid?.()!==0||!/^\/opt\/panda-research-tests\/[a-f0-9]{32}\/runtime$/.test(root??''))throw Error('Explicit selected-host probe invocation required');
const docker=async(args,timeout=30000)=>(await exec('docker',args,{timeout,maxBuffer:4194304})).stdout.trim();
const scrub=s=>String(s).replace(/[a-f0-9]{64}/g,'[hash]').slice(0,300);
const fixture=path.dirname(root),evidencePath=path.join(fixture,'evidence.json'),started=Date.now();
// Cleanup proof fields are first so a truncated SSM stdout still shows them.
const evidence={state:'running',stage:'preflight',containerRemoved:null,slotReleased:null,slotRetained:false,memory:null,elapsedMs:null,realProviderCalls:0,realSearchCalls:0,network:'none',error:null,cases:null,phases:null};
let slot,containerId,lease,native,result;
async function readResult(){try{result=JSON.parse(await fs.readFile(path.join(native,'out','probe-result.json'),'utf8'));}catch{}return result;}
async function keepResult(){
 if(!result)return;
 try{await fs.writeFile(path.join(fixture,'private-probe-result.json'),JSON.stringify(result),{mode:0o600});}catch{}
 // Compact public summary; full structure stays in the private file and is read by a separate command.
 evidence.version=result.version??null;evidence.openapi=result.openapi?{path:result.openapi.path,promptRoutes:result.openapi.promptRoutes??null}:null;
 evidence.phases=(result.phases??[]).map(p=>({name:p.name,ready:p.ready,exitCode:p.exitCode??null,configStatus:p.configStatus??null,configMedia:p.configMedia??null}));
 evidence.cases=(result.phases??[]).flatMap(p=>Object.entries(p.cases??{}).map(([name,c])=>({phase:p.name,name,create:c.createStatus,prompt:c.promptStatus??null,providerRequests:(c.providerRequests??[]).length,
  userParts:(c.providerRequests??[]).flatMap(r=>(r.messages??[]).filter(m=>m.role==='user').map(m=>Array.isArray(m.content)?m.content.map(part=>part?.type+(part?.image_url?.url?.dataUri?':'+part.image_url.url.dataUri+':'+part.image_url.url.decodedBytes:'')):typeof m.content)).slice(-1)})));
 evidence.probeComplete=!!result.complete;evidence.probeError=result.error??null;
}
try{
 const rootStat=await fs.lstat(root);assert.ok(rootStat.isDirectory()&&!rootStat.isSymbolicLink()&&rootStat.uid===0&&(rootStat.mode&0o777)===0o700);
 const image=JSON.parse(await docker(['image','inspect',researchImageId]));assert.equal(image.length,1);assert.equal(image[0].Id,researchImageId);assert.equal(image[0].Architecture,'arm64');
 assert.ok(Number(/^MemAvailable:\s+(\d+)/m.exec(await fs.readFile('/proc/meminfo','utf8'))?.[1])>=1048576,'host_memory_floor');
 const source=fileURLToPath(new URL('../runtime/probe/',import.meta.url)),files={},probeDir=path.join(root,'probe');native=path.join(root,'native');
 await fs.mkdir(probeDir,{mode:0o755});
 for(const name of ['image-probe.mjs','fixtures.json']){const bytes=await fs.readFile(path.join(source,name));await fs.writeFile(path.join(probeDir,name),bytes,{mode:0o444,flag:'wx'});await fs.chmod(path.join(probeDir,name),0o444);files[name]=digest(bytes);}
 await fs.chmod(probeDir,0o555);evidence.probeFiles=files;
 for(const dir of [native,path.join(native,'out')]){await fs.mkdir(dir,{mode:0o700});await fs.chown(dir,10001,10001);}
 evidence.stage='admission';lease='panda-n45-'+randomBytes(16).toString('hex');slot=await reserveDockerHostSlot('/opt/panda-n45-admission',lease,true);assert.ok(slot,'native_capacity_occupied');
 evidence.stage='create';
 containerId=await docker(['create','--pull=never','--name',lease,'--network','none','--user','10001:10001','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory',`${researchMemoryBytes/1048576}m`,'--memory-swap',`${researchMemoryBytes/1048576}m`,'--cpus','1','--pids-limit','128','--workdir','/runtime','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=16777216,uid=10001,gid=10001,mode=0700','--mount',`type=bind,source=${native},target=/runtime`,'--mount',`type=bind,source=${probeDir},target=/probe,readonly`,'--label','panda.native.lease='+lease,'--label','panda.probe=c4-image','--entrypoint','node',researchImageId,'/probe/image-probe.mjs'],60000);
 assert.match(containerId,/^[a-f0-9]{64}$/);
 const inspect=JSON.parse(await docker(['inspect',containerId]))[0];assert.equal(inspect.Image,researchImageId);assert.equal(inspect.HostConfig.NetworkMode,'none');assert.equal(inspect.HostConfig.ReadonlyRootfs,true);assert.equal(inspect.Config.User,'10001:10001');
 assert.deepEqual(inspect.Mounts.map(m=>m.Destination).sort(),['/probe','/runtime']);assert.equal(inspect.Mounts.find(m=>m.Destination==='/probe').RW,false);
 evidence.stage='run';await docker(['start',containerId]);
 const end=Date.now()+300000;
 for(;;){if((await readResult())?.finished)break;const state=JSON.parse(await docker(['inspect',containerId]))[0].State;if(!state.Running)throw Error('probe_exited_early_'+state.ExitCode);if(Date.now()>end)throw Error('probe_timeout');await pause(500);}
 await keepResult();
 evidence.stage='memory_proof';
 try{
  const pid=JSON.parse(await docker(['inspect',containerId]))[0].State.Pid;assert.ok(Number.isSafeInteger(pid)&&pid>0);
  const group=(await fs.readFile(`/proc/${pid}/cgroup`,'utf8')).trim();assert.equal(group,`0::/system.slice/docker-${containerId}.scope`);
  const dir=`/sys/fs/cgroup/system.slice/docker-${containerId}.scope`,peak=Number((await fs.readFile(dir+'/memory.peak','utf8')).trim()),events=Object.fromEntries((await fs.readFile(dir+'/memory.events','utf8')).trim().split('\n').map(l=>l.split(' ')).map(([k,v])=>[k,Number(v)]));
  evidence.memory={peakBytes:peak,oomKill:events.oom_kill};
 }catch(error){evidence.memory={proof:'unavailable',error:scrub(error?.message??error)};}
 await fs.writeFile(path.join(native,'out','release'),'',{flag:'wx',mode:0o644});
 try{await exec('docker',['wait',containerId],{timeout:30000});}catch{evidence.exitWait='timeout_forced_remove';}
 evidence.state=result.complete&&evidence.memory?.oomKill===0?'probe_completed':'probe_incomplete';
}catch(error){
 evidence.state='failed';evidence.error=scrub(error?.message??error);process.exitCode=1;
 if(native&&!result){await readResult();await keepResult();}
 if(containerId){try{evidence.containerLogTail=(await docker(['logs','--tail','20',containerId])).split('\n').map(scrub);}catch{}}
}finally{
 // Remove by lease name; release the global slot only after removal is proven, otherwise keep it held and say so.
 if(lease&&slot){
  try{
   if(!containerId)await pause(2000);
   const found=await docker(['ps','-aq','--no-trunc','--filter','name=^/'+lease+'$']);
   if(found){assert.match(found,/^[a-f0-9]{64}$/);if(containerId)assert.equal(found,containerId);await docker(['rm','-f',found],60000);}
   assert.equal(await docker(['ps','-aq','--no-trunc','--filter','name=^/'+lease+'$']),'');evidence.containerRemoved=true;
   await slot.release();evidence.slotReleased=true;
  }catch(error){evidence.slotRetained=true;evidence.slotReleased=false;evidence.cleanupError=scrub(error?.message??error);process.exitCode=1;}
 }
 evidence.elapsedMs=Date.now()-started;
 try{await fs.writeFile(evidencePath,JSON.stringify(evidence),{mode:0o600,flag:'wx'});}catch{process.stdout.write(JSON.stringify(evidence));}
}
