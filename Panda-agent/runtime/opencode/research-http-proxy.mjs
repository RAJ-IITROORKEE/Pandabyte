// Fixed private Docker-exec API; native credentials never leave the container.
import {timingSafeEqual} from 'node:crypto';
import {researchProfileSelection,isVisionResearchProfile} from './research-profile.mjs';
const fail=()=>{throw Error('research_proxy_unavailable');};
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const nativeID=(v,p)=>typeof v==='string'&&new RegExp('^'+p+'[a-f0-9]{12}[A-Za-z0-9]{14}$').test(v);
const password=process.env.PANDA_NATIVE_PASSWORD,generation=process.env.PANDA_RESEARCH_GENERATION,profile=process.env.PANDA_RESEARCH_PROFILE,selected=researchProfileSelection(profile),vision=isVisionResearchProfile(profile);
// Mirrors decodeResearchImageDataUri (src/opencode/research-image-binding.ts): canonical base64, <=65536 chars, magic matches the declared type, name matches.
const imageFile=f=>{if(!f||typeof f!=='object'||Array.isArray(f)||Object.keys(f).sort().join(',')!=='name,uri'||typeof f.uri!=='string'||f.uri.length>65559)return false;const m=/^data:image\/(png|jpeg);base64,/.exec(f.uri);if(!m)return false;const d=f.uri.slice(m[0].length);if(!d.length||d.length>65536||d.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(d))return false;const b=Buffer.from(d,'base64'),png=m[1]==='png';return b.toString('base64')===d&&b.subarray(0,png?8:3).toString('hex')===(png?'89504e470d0a1a0a':'ffd8ff')&&f.name===(png?'image.png':'image.jpg');};
if(!hex(password)||!hex(generation))fail();
let size=0;const chunks=[];for await(const part of process.stdin){size+=part.length;if(size>200704)fail();chunks.push(part);}
const q=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
if(!q||Object.keys(q).some(k=>!['sessionID','generation','profile','directory','ownership','method','path','body'].includes(k))||q.profile!==profile||!nativeID(q.sessionID,'ses_')||!hex(q.generation)||!timingSafeEqual(Buffer.from(generation),Buffer.from(q.generation))||q.directory!=='/runtime/workspace'
 ||!q.ownership||Object.keys(q.ownership).sort().join(',')!=='binding,owner,profileHash'||!Object.values(q.ownership).every(hex)||!['GET','POST'].includes(q.method)||typeof q.path!=='string')fail();
const base='/api/session/'+q.sessionID;
if(q.method==='GET'){
 if(q.body!==undefined||!(['/api/info','/api/config','/api/model','/api/session/active',base,base+'/message?limit=100&order=asc'].includes(q.path)||new RegExp('^'+base+'/message\\?limit=100&cursor=[A-Za-z0-9_-]{1,2048}(?:%3D){0,2}$').test(q.path)))fail();
}else{
 if(typeof q.body!=='string'||Buffer.byteLength(q.body)>98304)fail();const body=JSON.parse(q.body);
 if(q.path==='/api/session'){
  const expected={id:q.sessionID,title:'panda-research-'+q.ownership.binding,agent:'panda-research',model:{providerID:selected.providerID,id:selected.modelID},location:{directory:q.directory},metadata:{pandaResearch:q.ownership},permissions:[{action:'*',resource:'*',effect:'deny'},{action:selected.toolName,resource:'*',effect:'allow'}]};
  if(JSON.stringify(body)!==JSON.stringify(expected))fail();
 }else if(q.path===base+'/prompt'){
  const keys=body&&typeof body==='object'&&!Array.isArray(body)?Object.keys(body).sort().join(','):'';
  if(!(keys==='id,text'||vision&&keys==='files,id,text')||!nativeID(body.id,'msg_')||typeof body.text!=='string'||!body.text.trim()||!body.text.isWellFormed())fail();
  if(keys==='id,text'?Buffer.byteLength(body.text)>96000:Buffer.byteLength(body.text)>4000||!Array.isArray(body.files)||body.files.length!==1||!imageFile(body.files[0]))fail();
 }else if(q.path!==base+'/interrupt?resume=false'||!body||Object.keys(body).length)fail();
}
const response=await fetch('http://127.0.0.1:4172'+q.path,{method:q.method,headers:{authorization:'Basic '+Buffer.from('opencode:'+password).toString('base64'),'content-type':'application/json','x-opencode-directory':encodeURIComponent(q.directory)},...(q.body===undefined?{}:{body:q.body}),redirect:'error',signal:AbortSignal.timeout(9000)});
const contentType=(response.headers.get('content-type')??'').split(';')[0].trim();if(contentType!=='application/json'&&response.status!==204)fail();
const result=[];size=0;for await(const part of response.body??[]){size+=part.length;if(size>1048576)fail();result.push(part);}
const bytes=Buffer.concat(result);new TextDecoder('utf-8',{fatal:true}).decode(bytes);
process.stdout.write(JSON.stringify({status:response.status,contentType:contentType||'application/json',body:bytes.toString('base64')}));
