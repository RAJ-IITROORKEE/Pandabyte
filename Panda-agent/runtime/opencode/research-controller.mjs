// Separate persistent research entrypoint. No provider credential enters this container.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {researchProfile} from './research-profile.mjs';
const imageId='sha256:bbcbbcf6fd524caefa0063d6334e31889153e2c492713cf7f87e6eeb1cce33df',root='/runtime';
const names=['research-binding/index.ts','research-controller.mjs','research-http-proxy.mjs','research-mcp-shim.mjs','research-profile.mjs','research-provider-channel.mjs'];
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),fail=()=>{throw Error('research_controller_unavailable');};
const password=process.env.PANDA_NATIVE_PASSWORD,token=process.env.PANDA_RESEARCH_CHANNEL_TOKEN,generation=process.env.PANDA_RESEARCH_GENERATION;
if(!hex(password)||!hex(token)||!hex(generation)||process.getuid?.()!==10001)fail();
const native=fs.lstatSync(root);if(!native.isDirectory()||native.isSymbolicLink()||native.uid!==10001||(native.mode&0o777)!==0o700)fail();
const manifest=JSON.parse(fs.readFileSync('/research-code/manifest.json','utf8'));
if(!manifest||Object.keys(manifest).sort().join(',')!=='files,imageId,profileHash'||manifest.imageId!==imageId||!hex(manifest.profileHash)||!manifest.files||Object.keys(manifest.files).sort().join(',')!==names.join(','))fail();
const code=names.map(name=>{
 const path='/research-code/'+name,st=fs.lstatSync(path);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o222)!==0)fail();
 const hash=createHash('sha256').update(fs.readFileSync(path)).digest('hex');if(hash!==manifest.files[name])fail();return[name,hash];
});
const profileHash=createHash('sha256').update(JSON.stringify({image:imageId,version:'2.2.5',profile:researchProfile('0'.repeat(64),'0'.repeat(64)),code})).digest('hex');
if(profileHash!==manifest.profileHash)fail();
const marker={version:'2.2.5',imageId,profileHash};
const allowed=['research-profile.json','home','data','config','cache','state','tmp','workspace','programdata'];
if(fs.readdirSync(root).some(name=>!allowed.includes(name)))fail();
if(fs.existsSync(root+'/research-profile.json')){
 const st=fs.lstatSync(root+'/research-profile.json');if(st.isSymbolicLink()||!st.isFile()||st.uid!==10001||(st.mode&0o777)!==0o600||JSON.stringify(JSON.parse(fs.readFileSync(root+'/research-profile.json','utf8')))!==JSON.stringify(marker))fail();
}else fs.writeFileSync(root+'/research-profile.json',JSON.stringify(marker),{mode:0o600,flag:'wx'});
for(const name of allowed.slice(1)){
 const path=root+'/'+name;if(!fs.existsSync(path))fs.mkdirSync(path,{mode:0o700});
 const st=fs.lstatSync(path);if(st.isSymbolicLink()||!st.isDirectory()||st.uid!==10001||(st.mode&0o777)!==0o700)fail();
}
const config=root+'/config/opencode.json';
if(fs.existsSync(config)){const st=fs.lstatSync(config);if(st.isSymbolicLink()||!st.isFile()||st.uid!==10001||st.nlink!==1||(st.mode&0o777)!==0o600)fail();}
fs.writeFileSync(config,JSON.stringify(researchProfile(generation,token)),{mode:0o600,flag:'w'});
const env={PATH:process.env.PATH,HOME:root+'/home',TMPDIR:root+'/tmp',XDG_DATA_HOME:root+'/data',XDG_CONFIG_HOME:root+'/config',XDG_CACHE_HOME:root+'/cache',XDG_STATE_HOME:root+'/state',XDG_CONFIG_DIRS:root+'/programdata',PROGRAMDATA:root+'/programdata',
 OPENCODE_CONFIG_DIR:root+'/config',OPENCODE_CONFIG:config,OPENCODE_CONFIG_PROJECT_DISABLE:'true',OPENCODE_DISABLE_CLAUDE_CODE_SKILLS:'true',OPENCODE_DISABLE_MODELS_FETCH:'true',OPENCODE_PASSWORD:password,
 PANDA_RESEARCH_CHANNEL_TOKEN:token,PANDA_RESEARCH_GENERATION:generation,HTTP_PROXY:'http://127.0.0.1:9',HTTPS_PROXY:'http://127.0.0.1:9',NO_PROXY:'127.0.0.1,localhost'};
// Install guarded loopback channels before native can resume persisted work.
const readyDeadline=Date.now()+60000,tokenHash=createHash('sha256').update(token).digest('hex');
for(;;){
 let ready=false;
 try{const file=root+'/state/channel-ready.json',st=fs.lstatSync(file);if(st.isSymbolicLink()||!st.isFile()||st.nlink!==1||st.uid!==10001||(st.mode&0o777)!==0o600)fail();const value=JSON.parse(fs.readFileSync(file,'utf8'));ready=value.generation===generation&&value.tokenHash===tokenHash&&Number.isSafeInteger(value.pid)&&value.pid>1;}catch(error){if(error.code!=='ENOENT')throw error;}
 if(ready)break;if(Date.now()>=readyDeadline)fail();await new Promise(done=>setTimeout(done,50));
}
const log=fs.openSync(root+'/state/native.log','a',0o600);
const child=spawn('/usr/local/bin/opencode',['serve','--hostname','127.0.0.1','--port','4172'],{cwd:root+'/workspace',env,stdio:['ignore',log,log]});
let stopping=false;for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stopping=true;child.kill(signal);});
child.on('error',()=>{process.exitCode=1;});child.on('exit',()=>{fs.closeSync(log);process.exitCode=stopping?0:1;});
