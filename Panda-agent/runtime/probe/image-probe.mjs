// C4.0 synthetic image-attachment probe. Runs inside the immutable native image with --network none.
// Separate from the six-file research code list; never used by hosted research. Records structure only:
// key names, part types, URL scheme/media prefix, byte lengths and sha256 digests. No provider credential exists.
import fs from 'node:fs';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
const fixtures=JSON.parse(fs.readFileSync('/probe/fixtures.json','utf8'));
const root='/runtime',out=root+'/out/probe-result.json',sha=b=>createHash('sha256').update(b).digest('hex');
if(process.getuid?.()!==10001)throw Error('probe_uid');
const nativeID=descending=>{const t=BigInt(Date.now())*4096n+1n,v=descending?~t:t;const time=Array.from({length:6},(_,i)=>Number((v>>BigInt(40-i*8))&255n).toString(16).padStart(2,'0')).join('');const c='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';return time+Array.from(randomBytes(14),b=>c[b%62]).join('');};
const password=randomBytes(32).toString('hex'),token=randomBytes(32).toString('hex');
const result={version:null,openapi:null,phases:[],fixtures:Object.fromEntries(Object.entries(fixtures).map(([k,v])=>{const b=Buffer.from(v,'base64');return[k,{bytes:b.length,sha256:sha(b),magic:b.subarray(0,4).toString('hex')}];}))};
const save=()=>fs.writeFileSync(out,JSON.stringify(result,null,1),{mode:0o600});
// Structural summary: long strings become {len,sha256,prefix}; data: URIs keep only the part before the comma plus decoded length/hash.
function shape(value,depth=0){
 if(depth>12)return '[depth]';
 if(typeof value==='string'){
  if(value.startsWith('data:')){const comma=value.indexOf(',');const head=value.slice(0,Math.min(comma<0?60:comma,60));const body=comma<0?Buffer.alloc(0):Buffer.from(value.slice(comma+1),head.endsWith(';base64')?'base64':'utf8');return{dataUri:head,decodedBytes:body.length,sha256:sha(body),magic:body.subarray(0,4).toString('hex')};}
  if(value.startsWith('file:'))return{fileUri:value.slice(0,120)};
  return value.length>160?{len:value.length,sha256:sha(value),head:value.slice(0,40)}:value;
 }
 if(Array.isArray(value))return value.slice(0,40).map(v=>shape(v,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,60).map(([k,v])=>[k,shape(v,depth+1)]));
 return value;
}
// Synthetic openai-compatible provider: records every request shape, answers with a fixed short stream.
const providerRequests=[];
const provider=http.createServer(async(req,res)=>{
 const chunks=[];let size=0;for await(const p of req){size+=p.length;if(size>16777216){res.writeHead(413).end();return;}chunks.push(p);}
 const raw=Buffer.concat(chunks);let body=null;try{body=JSON.parse(raw.toString('utf8'));}catch{}
 const record={method:req.method,url:req.url,bytes:raw.length,authorized:req.headers.authorization==='Bearer '+token,topKeys:body&&typeof body==='object'?Object.keys(body).sort():null,model:body?.model??null,
  messages:Array.isArray(body?.messages)?body.messages.map(m=>({role:m.role,keys:Object.keys(m).sort(),content:shape(m.content)})):null};
 providerRequests.push(record);
 if(req.method!=='POST'||!/\/chat\/completions$/.test(req.url??'')){res.writeHead(404,{'content-type':'application/json'}).end('{}');return;}
 const id='chatcmpl-probe-'+providerRequests.length,frame=o=>'data: '+JSON.stringify({id,object:'chat.completion.chunk',created:1,model:body?.model??'probe',...o})+'\n\n';
 res.writeHead(200,{'content-type':'text/event-stream'});
 res.end(frame({choices:[{index:0,delta:{role:'assistant',content:'Synthetic probe reply.'},finish_reason:null}]})+frame({choices:[{index:0,delta:{},finish_reason:'stop'}]})+frame({choices:[],usage:{prompt_tokens:10,completion_tokens:4,total_tokens:14}})+'data: [DONE]\n\n');
});
await new Promise(done=>provider.listen(4175,'127.0.0.1',done));
const pause=ms=>new Promise(d=>setTimeout(d,ms));
const api=async(method,path,body)=>{const r=await fetch('http://127.0.0.1:4172'+path,{method,headers:{authorization:'Basic '+Buffer.from('opencode:'+password).toString('base64'),'content-type':'application/json','x-opencode-directory':encodeURIComponent(root+'/workspace')},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});const text=await r.text();let json=null;try{json=JSON.parse(text);}catch{}return{status:r.status,json,text:json?null:text.slice(0,600)};};
function config(media){
 const deny=[{action:'*',resource:'*',effect:'deny'}],model=(id,input)=>({modelID:id,capabilities:{tools:true,input,output:['text'],reasoning:{supported:false}},limit:{context:16000,output:256}});
 return{default_agent:'panda-probe',agents:{'panda-probe':{mode:'primary',system:'Describe the attached content briefly.',steps:1,permissions:deny}},
  model:{providerID:'probe',model:'probe-vision'},
  providers:{probe:{name:'Probe synthetic',package:'@opencode/ai/providers/openai-compatible',env:['PANDA_PROBE_TOKEN'],settings:{baseURL:'http://127.0.0.1:4175/v1',encoding:'none'},compatibility:{supportsPromptCacheKey:false},models:{'probe-vision':model('probe-vision',['text','image']),'probe-text':model('probe-text',['text'])}}},
  permissions:deny,policies:[...['provider.use','integration.use','tool.use','mcp.use','skill.use','plugin.use'].map(action=>({action,resource:'*',effect:'deny'})),{action:'provider.use',resource:'probe',effect:'allow'},{action:'integration.use',resource:'probe',effect:'allow'}],
  plugins:['-opencode.tool.*','-opencode.skill'],skills:[],formatter:false,warming:false,snapshots:false,share:'disabled',update:'disable',compaction:{auto:false},experimental:{background_compaction:false,schedules:false,subagent_depth:0},
  ...(media?{media:{image:{auto_resize:false,max_width:2000,max_height:2000}}}:{})};
}
const uri=(mime,key)=>'data:'+mime+';base64,'+fixtures[key];
const cases={
 png_vision:{model:'probe-vision',files:[{uri:uri('image/png','png'),name:'probe.png'}]},
 jpeg_vision:{model:'probe-vision',files:[{uri:uri('image/jpeg','jpeg'),name:'probe.jpg'}]},
 mismatch_vision:{model:'probe-vision',files:[{uri:uri('image/png','jpeg'),name:'probe.png'}]},
 wide_vision:{model:'probe-vision',files:[{uri:uri('image/png','widePng'),name:'wide.png'}]},
 png_text_only:{model:'probe-text',files:[{uri:uri('image/png','png'),name:'probe.png'}]},
};
async function phase(name,media,caseNames){
 const dirs=['home','data','config','cache','state','tmp','workspace','programdata'];for(const d of dirs)fs.mkdirSync(root+'/'+name+'-'+d,{recursive:true,mode:0o700});
 const p=n=>root+'/'+name+'-'+n,file=p('config')+'/opencode.json';fs.writeFileSync(file,JSON.stringify(config(media)),{mode:0o600});
 const env={PATH:process.env.PATH,HOME:p('home'),TMPDIR:p('tmp'),XDG_DATA_HOME:p('data'),XDG_CONFIG_HOME:p('config'),XDG_CACHE_HOME:p('cache'),XDG_STATE_HOME:p('state'),XDG_CONFIG_DIRS:p('programdata'),PROGRAMDATA:p('programdata'),
  OPENCODE_CONFIG_DIR:p('config'),OPENCODE_CONFIG:file,OPENCODE_CONFIG_PROJECT_DISABLE:'true',OPENCODE_DISABLE_CLAUDE_CODE_SKILLS:'true',OPENCODE_DISABLE_MODELS_FETCH:'true',OPENCODE_PASSWORD:password,PANDA_PROBE_TOKEN:token,HTTP_PROXY:'http://127.0.0.1:9',HTTPS_PROXY:'http://127.0.0.1:9',NO_PROXY:'127.0.0.1,localhost'};
 const log=fs.openSync(p('state')+'/native.log','a',0o600),child=spawn('/usr/local/bin/opencode',['serve','--hostname','127.0.0.1','--port','4172'],{cwd:p('workspace'),env,stdio:['ignore',log,log]});
 const record={name,mediaConfig:media,ready:false,configMedia:null,cases:{}};result.phases.push(record);
 try{
  const end=Date.now()+60000;for(;;){try{const info=await api('GET','/api/info');if(info.status===200){result.version=info.json?.version??info.json?.data?.version??null;record.ready=true;break;}}catch{}if(Date.now()>end||child.exitCode!==null)break;await pause(200);}
  if(!record.ready){record.exitCode=child.exitCode;return;}
  const loaded=await api('GET','/api/config');record.configStatus=loaded.status;record.configMedia=shape(loaded.json?.media??loaded.json?.data?.media??null);
  if(!result.openapi)for(const path of ['/doc','/api/doc','/openapi.json','/api/openapi.json']){const d=await api('GET',path);if(d.status===200&&d.json){const paths=d.json.paths??{},hit=Object.keys(paths).filter(k=>/prompt/.test(k));result.openapi={path,promptRoutes:hit,promptOperations:Object.fromEntries(hit.map(k=>[k,paths[k]])),components:d.json.components?Object.fromEntries(Object.entries(d.json.components.schemas??{}).filter(([k])=>/prompt|file|attach|part|media/i.test(k)).slice(0,40)):null};const s=JSON.stringify(result.openapi);if(s.length>120000)result.openapi={path,promptRoutes:hit,truncated:s.length};break;}}
  for(const key of caseNames){
   const c=cases[key],before=providerRequests.length,sessionID='ses_'+nativeID(true),messageID='msg_'+nativeID(false),entry={};record.cases[key]=entry;
   const created=await api('POST','/api/session',{id:sessionID,title:'panda-probe-'+key,agent:'panda-probe',model:{providerID:'probe',id:c.model},location:{directory:p('workspace')},permissions:[{action:'*',resource:'*',effect:'deny'}]});
   entry.createStatus=created.status;if(created.status!==200){entry.createError=created.text??shape(created.json);continue;}
   const prompted=await api('POST','/api/session/'+sessionID+'/prompt',{id:messageID,text:'Describe the attached image.',files:c.files});
   entry.promptStatus=prompted.status;entry.promptResponse=prompted.text??shape(prompted.json);
   // Grace: do not trust 'inactive' until the provider was reached or 3s passed; overall bound 20s per case.
   const t0=Date.now(),end=t0+20000;for(;;){const a=await api('GET','/api/session/active');const map=a.json?.data??a.json??{};const reached=providerRequests.length>before||Date.now()-t0>3000;if((!Object.hasOwn(map,sessionID)&&reached)||Date.now()>end)break;await pause(150);}
   entry.waitMs=Date.now()-t0;
   const rows=await api('GET','/api/session/'+sessionID+'/message?limit=100&order=asc');entry.messagesStatus=rows.status;entry.rows=shape(rows.json?.data??rows.json);
   entry.providerRequests=providerRequests.slice(before);
  }
 }finally{child.kill('SIGTERM');await new Promise(d=>{if(child.exitCode!==null)return d();child.on('exit',d);setTimeout(()=>{child.kill('SIGKILL');setTimeout(d,1000);},5000);});fs.closeSync(log);
  const text=fs.readFileSync(p('state')+'/native.log','utf8');record.logLines=text.split('\n').filter(l=>/image|media|attach|resize|file|mime|error|warn/i.test(l)).map(l=>l.replace(/[a-f0-9]{64}/g,'[hash]').slice(0,160)).slice(-15);save();}
}
try{
 await phase('default',false,['png_vision','wide_vision']);
 await phase('nores',true,Object.keys(cases));
 result.complete=true;
}catch(error){result.error=String(error?.message??error).slice(0,300);}
finally{result.finished=true;save();provider.close();
 // Stay alive until the host has read the cgroup memory proof (bounded).
 const end=Date.now()+90000;while(!fs.existsSync(root+'/out/release')&&Date.now()<end)await pause(200);process.exit(0);}
