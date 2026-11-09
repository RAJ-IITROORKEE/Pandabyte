import 'server-only';
import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { strictJson } from '../lightweight/client.ts';
import { privateFile, privateWindowsPair } from './basic-rag-profile.ts';
import { readLunaTestBudget } from './luna-test-budget.ts';

const hash = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, names: string) => Object.keys(v).sort().join(',') === names;
const iso = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(Date.parse(v)).toISOString() === v;
const same = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
type Input = { env: NodeJS.ProcessEnv; subject: string; requestOrigin: string; now?: () => number };

/** A diagnostic budget is not a success lease. Both independently bound private records are required. */
export async function readLunaTestProfile(input: Input): Promise<Readonly<{binding:string;workspaceSha256:string;budgetBinding:string;expiresAt:string;dispatchCurrent():boolean}> | null> {
 const {env,subject,requestOrigin}=input;
 const key=env.OPENROUTER_API_KEY,clerk=env.CLERK_SECRET_KEY,supplied=env.PANDA_AGENT_LUNA_PROFILE_FILE,budgetPath=env.PANDA_AGENT_LUNA_BUDGET_FILE;
 const budget=await readLunaTestBudget(input);
 if (!budget || typeof env.PANDA_AGENT_LUNA_PROFILE_FILE !== 'string' || !path.isAbsolute(env.PANDA_AGENT_LUNA_PROFILE_FILE)) return null;
 if(typeof supplied!=='string'||env.OPENROUTER_API_KEY!==key||env.CLERK_SECRET_KEY!==clerk||env.PANDA_AGENT_LUNA_PROFILE_FILE!==supplied||env.PANDA_AGENT_LUNA_BUDGET_FILE!==budgetPath)return null;
 let profileFile:Awaited<ReturnType<typeof privateFile>>=null,receiptFile:Awaited<ReturnType<typeof privateFile>>=null;
 try {
  const root=path.resolve(process.cwd(),'private','basic-rag-activation'),name=path.join(root,'luna-profile.json');
  if(!same(await realpath(root),root)||!same(path.resolve(supplied),name))return null;
  profileFile=await privateFile(name,root);if(!profileFile)return null;
  const p:unknown=strictJson(new TextDecoder('utf-8',{fatal:true}).decode(profileFile.bytes));
  if(!object(p)||!keys(p,'budgetBinding,expiresAt,issuedAt,keySha256,model,ownerSubjectSha256,provider,receiptFile,receiptSha256,version,workspaceSha256')
   ||p.version!==1||p.model!=='openai/gpt-6-luna'||p.provider!=='azure/us'||p.ownerSubjectSha256!==hash(subject)||p.keySha256!==hash(key!)
   ||p.workspaceSha256!==budget.workspaceSha256||p.budgetBinding!==budget.binding||!iso(p.issuedAt)||!iso(p.expiresAt)
   ||typeof p.receiptFile!=='string'||!/^luna-diagnostic-[a-z0-9-]{1,80}\.json$/.test(p.receiptFile)||typeof p.receiptSha256!=='string'||!/^[a-f0-9]{64}$/.test(p.receiptSha256))return null;
  const receiptPath=path.join(root,p.receiptFile);receiptFile=await privateFile(receiptPath,root);
  if(!receiptFile||hash(receiptFile.bytes)!==p.receiptSha256)return null;
  const r:unknown=strictJson(new TextDecoder('utf-8',{fatal:true}).decode(receiptFile.bytes));
  if(!object(r)||!keys(r,'budgetBinding,completedAt,costNanoUsd,finishReason,hasGroundedEvidence,httpStatus,inputTokens,keySha256,model,outputTokens,provider,requestPolicy,returnedModel,returnedProvider,validJsonAnswer,version,workspaceSha256')
   ||r.version!==1||r.model!==p.model||r.provider!==p.provider||!['openai/gpt-6-luna','openai/gpt-6-luna-20260922'].includes(String(r.returnedModel))||r.returnedProvider!=='Azure'
   ||r.keySha256!==p.keySha256||r.workspaceSha256!==p.workspaceSha256||r.budgetBinding!==budget.binding||r.httpStatus!==200||r.finishReason!=='stop'
   ||!Number.isSafeInteger(r.costNanoUsd)||(r.costNanoUsd as number)<0||(r.costNanoUsd as number)>2697640
   ||!Number.isSafeInteger(r.inputTokens)||(r.inputTokens as number)<1||(r.inputTokens as number)>21024
   ||!Number.isSafeInteger(r.outputTokens)||(r.outputTokens as number)<1||(r.outputTokens as number)>700
   ||r.validJsonAnswer!==true||r.hasGroundedEvidence!==true||!iso(r.completedAt)||!object(r.requestPolicy)
   ||!keys(r.requestPolicy,'allowFallbacks,cache,dataCollection,maxPrice,onlyProvider,plugins,reasoning,safetyRetention,tools,zdr'))return null;
  const q=r.requestPolicy;
  if(q.zdr!==true||q.dataCollection!=='deny'||q.allowFallbacks!==false||q.onlyProvider!=='azure/us'||q.tools!==false||q.plugins!==false||q.reasoning!==false||q.cache!==false||q.safetyRetention!==false||!object(q.maxPrice)||!keys(q.maxPrice,'completion,image,prompt,request')||q.maxPrice.prompt!==0.11||q.maxPrice.completion!==0.55||q.maxPrice.request!==0||q.maxPrice.image!==0)return null;
  const issued=Date.parse(p.issuedAt),expires=Date.parse(p.expiresAt),completed=Date.parse(r.completedAt);
  const validTime=()=>{const now=(input.now??Date.now)();return Number.isSafeInteger(now)&&completed<=issued&&issued<=now&&now<expires&&expires-issued<=30*60_000&&now-completed<=30*60_000;};
  if(!validTime()||(process.platform==='win32'&&!await privateWindowsPair(name,receiptPath)))return null;
  const [pc,rc]=await Promise.all([profileFile.current(),receiptFile.current()]);
  if(!pc||!rc||!validTime()||!budget.dispatchCurrent()||(input.now??Date.now)()>=Date.parse(budget.expiresAt)||env.OPENROUTER_API_KEY!==key||env.CLERK_SECRET_KEY!==clerk||env.PANDA_AGENT_LUNA_PROFILE_FILE!==supplied||env.PANDA_AGENT_LUNA_BUDGET_FILE!==budgetPath||env.VERCEL!==undefined||env.VERCEL_ENV!==undefined)return null;
  const checkedProfile=profileFile,checkedReceipt=receiptFile;
  return Object.freeze({binding:hash(JSON.stringify(['luna-profile-v1',hash(profileFile.bytes),p.receiptSha256,hash(subject),hash(key!),requestOrigin,budget.binding])),workspaceSha256:budget.workspaceSha256,budgetBinding:budget.binding,expiresAt:new Date(Math.min(expires,completed+30*60_000,Date.parse(budget.expiresAt))).toISOString(),dispatchCurrent:()=>budget.dispatchCurrent()&&checkedProfile.dispatchCurrent()&&checkedReceipt.dispatchCurrent()});
 }catch{return null;}finally{await receiptFile?.close().catch(()=>{});await profileFile?.close().catch(()=>{});}
}
