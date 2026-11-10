import 'server-only';
import { createHash } from 'node:crypto';
import { strictJson } from '../lightweight/client.ts';
import { uuid, type ChatActor } from './chat-contracts.ts';
import { createPrototypeRagBudget, type PrototypeRagBudgetStatus } from './prototype-rag-budget.ts';
import { createHostedRagPolicy } from './hosted-rag-policy.ts';

const origin = 'https://pandabyte-iot.vercel.app';
const hash = (value:string) => createHash('sha256').update(value).digest('hex');
const object = (v:unknown):v is Record<string,unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const hex = (v:unknown):v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const keys = (v:Record<string,unknown>, fields:string) => Object.keys(v).sort().join(',') === fields;
const iso = (v:unknown):v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;

type Refs = { budgetId:string; keySha256:string; workspaceSha256:string };
/** The operator profile records an explicit review; it is not a live privacy-settings probe. */
export function createHostedDirectPolicy(input:{ env:NodeJS.ProcessEnv; actor:ChatActor; requestOrigin:string; current():Promise<boolean>; fetcher?:typeof fetch; budget?:typeof createPrototypeRagBudget }) {
  const {env,actor} = input;
  if(env.PANDA_AGENT_MAIN_CHAT_UNCAPPED==='true'){
    let admitted=false;
    const active=()=>env.PANDA_AGENT_MAIN_CHAT_UNCAPPED==='true'&&env.PANDA_AGENT_DIRECT_ASSISTANT_ENABLED==='true';
    const adminCurrent=async()=>{
      if(!active()||!await input.current())return false;
      const {data,error}=await actor.client.database.rpc('panda_agent_control_room_admission');
      return !error&&object(data)&&data.subject===actor.subject&&data.admin===true&&active()&&await input.current();
    };
    const hosted=createHostedRagPolicy({env,actor,subject:actor.subject,requestOrigin:input.requestOrigin,current:adminCurrent,fetcher:input.fetcher});
    const current=()=>admitted&&active()&&hosted.dispatchCurrent();
    return {
      async enabled(){admitted=false;admitted=active()&&await hosted.enabled();return current();},
      async current(){if(!current()||!await hosted.current()){admitted=false;return false;}return current();},
      dispatchCurrent:current,key:()=>current()?hosted.key():'',binding:()=>current()?hosted.binding():'',
      isUnmetered:current,budgetRefs:():Refs|null=>null,allowance:():PrototypeRagBudgetStatus|null=>null,
    };
  }
  let snapshot:string|null=null, admittedKey='', refs:Refs|null=null, allowance:PrototypeRagBudgetStatus|null=null;
  const config = () => {
    const key=env.OPENROUTER_API_KEY, raw=env.PANDA_AGENT_HOSTED_DIRECT_PROFILE;
    if (env.PANDA_AGENT_MAIN_CHAT_UNCAPPED==='true' || env.VERCEL !== '1' || env.VERCEL_ENV !== 'production' || env.PANDA_AGENT_DIRECT_ASSISTANT_ENABLED !== 'true' || input.requestOrigin !== origin
      || typeof key !== 'string' || !/^sk-or-v1-[a-f0-9]{64}$/i.test(key) || typeof raw !== 'string' || raw.length>8192
      || typeof actor.subject !== 'string' || !actor.subject.trim() || actor.subject.length>512 || !actor.subject.isWellFormed()) return null;
    let p:unknown; try { p=strictJson(raw); } catch { return null; }
    if (!object(p) || !keys(p,'budgetId,keySha256,origin,ownerSubjectSha256,privacy,reviewedAt,version,workspaceSha256') || p.version!==1 || p.origin!==origin
      || p.ownerSubjectSha256!==hash(actor.subject) || p.keySha256!==hash(key) || !hex(p.workspaceSha256)
      || !uuid(p.budgetId) || p.budgetId!==p.budgetId.toLowerCase() || !iso(p.reviewedAt) || Date.parse(p.reviewedAt)>Date.now()
      || !object(p.privacy) || !keys(p.privacy,'dataDiscount,logging,publicPrompts,traces') || p.privacy.logging!==false || p.privacy.traces!=='langsmith_metadata_only'
      || p.privacy.dataDiscount!==false || p.privacy.publicPrompts!==false) return null;
    const binding=hash(JSON.stringify([raw,key,env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY,env.CLERK_SECRET_KEY,env.VERCEL,env.VERCEL_ENV,env.PANDA_AGENT_DIRECT_ASSISTANT_ENABLED]));
    return {binding,key,refs:{budgetId:p.budgetId,keySha256:p.keySha256,workspaceSha256:p.workspaceSha256}};
  };
  const unchanged = () => { const c=config(); return !!c && c.binding===snapshot && c.key===admittedKey; };
  async function get(path:string,key:string,signal:AbortSignal):Promise<unknown> {
    const r=await (input.fetcher??fetch)('https://openrouter.ai/api/v1'+path,{method:'GET',headers:{Accept:'application/json',Authorization:'Bearer '+key},redirect:'error',cache:'no-store',credentials:'omit',signal});
    if(!r.ok||r.redirected||!r.body||!/^application\/json(?:\s*;|$)/i.test(r.headers.get('content-type')??''))throw Error('unavailable');
    const reader=r.body.getReader(),parts:Uint8Array[]=[];let size=0;
    try { for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1000000)throw Error('unavailable');parts.push(part.value);} return strictJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts))); }
    finally {void reader.cancel().catch(()=>{});reader.releaseLock();}
  }
  async function check(first:boolean) {
    try {
      const c=config(); if(!c || (!first && (!unchanged() || c.binding!==snapshot)))return false;
      const signal=AbortSignal.timeout(8000);
      const budget=(input.budget??createPrototypeRagBudget)({actor,key:env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY??'',...c.refs});
      const [metadata,catalog,session,state]=await Promise.all([get('/key',c.key,signal),get('/models/user',c.key,signal),input.current(),budget.status()]);
      const data=object(metadata)&&object(metadata.data)?metadata.data:null;
      if(!data || typeof data.workspace_id!=='string' || !data.workspace_id || data.workspace_id.length>512 || hash(data.workspace_id)!==c.refs.workspaceSha256
        || !object(catalog) || !Array.isArray(catalog.data) || catalog.data.length>1000 || !catalog.data.some(item=>object(item)&&item.id==='openai/gpt-6-luna')
        || !session || !state.enabled || (first && state.remainingNanoUsd<state.reservationNanoUsd) || config()?.binding!==c.binding || signal.aborted) return false;
      snapshot=c.binding;admittedKey=c.key;refs=c.refs;allowance=state;return true;
    } catch {return false;}
  }
  return {
    async enabled(){snapshot=null;admittedKey='';refs=null;allowance=null;return check(true);},
    async current(){if(!snapshot)return false;const ok=await check(false);if(!ok){snapshot=null;admittedKey='';refs=null;allowance=null;}return ok;},
    dispatchCurrent:unchanged,
    key:()=>unchanged()?admittedKey:'',
    binding:()=>unchanged()?snapshot??'':'',
    budgetRefs:()=>unchanged()?refs:null,
    allowance:()=>unchanged()?allowance:null,
    isUnmetered:()=>false,
  };
}
