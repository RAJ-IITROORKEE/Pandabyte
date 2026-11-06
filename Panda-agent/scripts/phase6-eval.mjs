// Post-implementation independent evaluation only. --run requires Root's explicit clearance.
// Gold labels never enter a request, selector, corpus, provider, or logged response body.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createClerkClient} from '@clerk/backend';
import {createClient} from '@insforge/sdk';

const fixture='Panda-agent/tests/fixtures/phase6-eval-independent-v1.json';
const freezePath='Panda-agent/tests/fixtures/phase6-eval-independent-v1.freeze.json';
const amendmentPath='Panda-agent/tests/fixtures/phase6-eval-independent-v1.amendment.json';
const recoveryPath='Panda-agent/tests/fixtures/phase6-eval-independent-v1.recovery-amendment.json';
const dir='Panda-agent/infra/lightweight/artifacts',statePath=dir+'/phase6-auth-state.json';
const hash=x=>createHash('sha256').update(x).digest('hex');
const baselineLabel='accepted_Phase2_BFF_KPC7SFoEOTmBR4tkZIb9C_current_DB_and_Phase6_private_worker';
const baselineBase='http://localhost:3000',candidateBase='http://localhost:3001';
const expectedBaselineBuild='KPC7SFoEOTmBR4tkZIb9C',expectedCandidateBuild='e9bFRTEQf1PgtAkJZIxfe';
const sourcePaths=[
 'Panda-agent/src/agentic/contracts.ts','Panda-agent/src/agentic/plan.ts','Panda-agent/src/agentic/controller.ts',
 'Panda-agent/src/agentic/helpers.ts','Panda-agent/src/agentic/skills.ts','Panda-agent/src/agentic/manifests.ts',
 'Panda-agent/src/agentic/mcp-client.ts','Panda-agent/src/agentic/budget.ts','Panda-agent/src/server/agentic-answer.ts',
 'Panda-agent/src/server/agentic-store.ts','Panda-agent/src/server/lightweight-handler.ts',
 'Panda-agent/src/lightweight/evidence.ts','Panda-agent/src/lightweight/client.ts','Panda-agent/src/retrieval/answers.ts',
 'Panda-agent/services/lightweight/lightweight/mcp_fetch.py','Panda-agent/services/lightweight/lightweight/mcp_fetch_server.py',
 'Panda-agent/services/lightweight/lightweight/app.py'
];
const sourceHashes=async()=>Object.fromEntries(await Promise.all(sourcePaths.map(async p=>[p,hash(await readFile(p))])));
export function verifyRecoverySources(current,frozen,recovery){
 const changed=['Panda-agent/services/lightweight/lightweight/app.py','Panda-agent/services/lightweight/lightweight/mcp_fetch.py'];
 assert.deepEqual(Object.keys(recovery.sourceChanges).sort(),changed.slice().sort(),'unexpected_recovery_source_change');
 assert.deepEqual(Object.keys(current).sort(),Object.keys(frozen.sourceHashes).sort(),'recovery_source_set_changed');
 for(const [path,original] of Object.entries(frozen.sourceHashes)){
  const change=recovery.sourceChanges[path];
  if(change){assert(change.originalSha256===original&&change.recoverySha256!==original,'invalid_recovery_source_binding');assert.equal(current[path],change.recoverySha256,'recovery_source_hash_mismatch');}
  else assert.equal(current[path],original,'unapproved_source_change_after_freeze');
 }
}
export const percentile=(values,p)=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];};
const url='https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-reference/peripherals/gpio.html';
const canonicalUrl=/^https:\/\/(?:www\.)?pandabyte\.in\/product-page\/pandabyte-x8266-wifi-development-board\/?$/;
export function scoreCase(c,answer){
 const citations=answer?.citations??[],text=answer?.text??'';
 const allowed=citations.every(x=>x.quote==='Microcontroller: ESP8266'&&canonicalUrl.test(x.sourceUrl)||x.kind==='vendor'&&x.quote==='#include "driver/gpio.h"'&&x.sourceUrl===url&&x.chip==='esp32'&&x.frameworkVersion==='5.5.1');
 const canonical=citations.filter(x=>!('kind' in x));
 const wrongProductOrCitationLeakage=!allowed||canonical.length>1||canonical.some(x=>x.quote!=='Microcontroller: ESP8266');
 const abstention=!!answer&&citations.length===0&&!['unavailable','budget_exhausted','cancelled'].includes(answer.terminalReason)&&!text.startsWith('The evidence service could not provide a validated answer.')&&/please clarify|which exact board model and revision|the product identities conflict|the available approved listing does not establish this|evidence is unavailable|evidence is insufficient|cannot|could not|not enough|insufficient|unavailable|no eligible|not supported/i.test(text);
 let success=false;
 if(c.expect==='abstention')success=abstention&&!wrongProductOrCitationLeakage;
 if(c.expect==='conversion')success=!!answer&&text===c.exactText&&citations.length===0;
 if(c.expect==='listing-and-reference')success=!!answer&&canonical.length===1&&canonical[0].quote==='Microcontroller: ESP8266'&&(text.includes(url)||citations.some(x=>x.sourceUrl===url))&&/ESP32 and ESP-IDF 5\.5\.1 only|For ESP32 and ESP-IDF 5\.5\.1/.test(text)&&/does not establish board applicability or header wiring/.test(text)&&!wrongProductOrCitationLeakage;
 return {success,correctAbstention:c.expect==='abstention'?success:null,answerable:c.expect!=='abstention',wrongProductOrCitationLeakage,supportCheck:'literal_gold_and_fixed_reference_checks_only_requires_manual_full_claim_review',manualFullClaimSupport:null};
}
export function summarize(rows){
 const byPath={};for(const path of ['baseline','candidate']){
  const selected=rows.filter(r=>r.path===path),answerable=selected.filter(r=>r.score.answerable),negative=selected.filter(r=>!r.score.answerable);
  const completed=selected.filter(r=>r.complete);
  byPath[path]={label:path==='baseline'?baselineLabel:'current_typed_agentic_path',samples:selected.length,automaticCaseSuccess:selected.filter(r=>r.score.success).length,answerableAutomaticSuccess:{numerator:answerable.filter(r=>r.score.success).length,denominator:answerable.length},correctAbstention:{numerator:negative.filter(r=>r.score.correctAbstention).length,denominator:negative.length},typedRequestRejectionsWithoutSavedAnswer:selected.filter(r=>r.rejected).length,wrongProductOrCitationLeakage:selected.filter(r=>r.score.wrongProductOrCitationLeakage).length,persistedExactPairs:selected.filter(r=>r.persistedExactPair).length,requestToValidatedSavedAnswerMs:{n:completed.length,p50:percentile(completed.map(r=>r.latencyMs),.5),p95:percentile(completed.map(r=>r.latencyMs),.95),method:'empirical nearest-rank, sequential single samples, includes authenticated POST and owned GET; rejected requests excluded'},observedPublicCompletedToolCards:selected.reduce((n,r)=>n+r.completedToolCards,0),actualToolExecutions:null,statusReads:null,cacheReads:null,modelCalls:null,paidCalls:null,providerCost:null,privateCountersRequired:true,manualFullClaimSupport:null};
 }return byPath;
}
export function typedRejection(c,path,first,read){return c.expect==='abstention'&&path==='candidate'&&first.status===400&&first.data?.error==='invalid'&&!first.data.messages&&read.status===200&&read.data?.attemptStatus==='absent'&&Array.isArray(read.data.messages)&&read.data.messages.length===0;}
export function savedComplete(path,first,read,thread,question){
 const messages=first.data?.messages;
 return first.status===200&&read.status===200&&first.data?.thread?.id===thread&&read.data?.thread?.id===thread&&Array.isArray(messages)&&messages.length===2&&messages[0].role==='user'&&messages[0].text===question&&messages[1].role==='assistant'&&JSON.stringify(messages)===JSON.stringify(read.data.messages)&&(path==='baseline'||read.data.attemptStatus==='complete');
}
async function loadCases(){const bytes=await readFile(fixture);const data=JSON.parse(bytes);assert(data.cases.length===10&&new Set(data.cases.map(c=>c.id)).size===10,'case_partition_invalid');return {bytes,data};}
async function main(){
 const mode=process.argv[2];assert(process.argv.length===3&&['--freeze','--verify-freeze','--self-test','--run'].includes(mode),'explicit_mode_required');
 const {bytes,data}=await loadCases();
 if(mode==='--self-test'){
  assert.equal(percentile([4,1,3,2],.5),2);assert.equal(percentile([4,1,3,2],.95),4);assert.equal(percentile([],.5),null);
  assert(scoreCase({expect:'abstention'},{text:'Please clarify the exact products and requested evidence.',citations:[]}).success);
  assert(!scoreCase({expect:'abstention'},{text:'ESP32 is compatible.',citations:[]}).success);
  assert(scoreCase({expect:'conversion',exactText:'2750 ms = 2.75 s.'},{text:'2750 ms = 2.75 s.',citations:[]}).success);
  assert(scoreCase({expect:'abstention'},{text:'Please clarify.',citations:[{quote:'Microcontroller: ESP32',sourceUrl:'https://pandabyte.in/product-page/other'}]}).wrongProductOrCitationLeakage);
  assert(scoreCase({expect:'abstention'},{text:'Please clarify.',citations:[{quote:'Microcontroller: ESP8266',sourceUrl:'https://pandabyte.in/product-page/other'}]}).wrongProductOrCitationLeakage);
  assert.equal(summarize([]).candidate.modelCalls,null);
  assert(typedRejection({expect:'abstention'},'candidate',{status:400,data:{error:'invalid'}},{status:200,data:{attemptStatus:'absent',messages:[]}}));
  assert(!typedRejection({expect:'abstention'},'candidate',{status:503,data:{error:'unavailable'}},{status:200,data:{attemptStatus:'absent',messages:[]}}));
  assert(scoreCase({expect:'abstention'},{text:'The available approved listing does not establish this. Share the board revision or schematic for wiring questions.',citations:[]}).success);
  assert(scoreCase({expect:'abstention'},{text:'Which exact board model and revision do you mean?',citations:[]}).success);
  assert(!scoreCase({expect:'abstention'},{text:'The evidence service could not provide a validated answer. No automatic retry was made. You can try a new question later.',citations:[]}).success);
  const observed={status:200,data:{thread:{id:'owned'},messages:[{role:'user',text:'Question'},{role:'assistant',text:'Saved'}]}};
  assert(savedComplete('baseline',observed,observed,'owned','Question'));
  assert(!savedComplete('candidate',observed,observed,'owned','Question'));
  const recovery=JSON.parse(await readFile(recoveryPath,'utf8')),frozen=JSON.parse(await readFile(freezePath,'utf8')),current=await sourceHashes();
  verifyRecoverySources(current,frozen,recovery);
  assert.throws(()=>verifyRecoverySources({...current,[sourcePaths[0]]:'0'.repeat(64)},frozen,recovery));
  assert.throws(()=>verifyRecoverySources({...current,[Object.keys(recovery.sourceChanges)[0]]:'0'.repeat(64)},frozen,recovery));
  assert.throws(()=>verifyRecoverySources(current,frozen,{...recovery,sourceChanges:{...recovery.sourceChanges,unexpected:{}}}));
  console.log(JSON.stringify({selfChecks:20,networkCalls:0,recoverySourceGuards:true}));return;
 }
 if(mode==='--freeze'){
  const frozen={classification:data.classification,preImplementationHeldOut:false,createdAt:new Date().toISOString(),datasetSha256:hash(bytes),gitHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceHashes:await sourceHashes(),baselineLabel,candidateWorkerImage:'fe8f22081ae852ba67e52edaf0f4dfb1fe3d75c0b524f52cbe6d34bc9947d95a',candidateWorkerPackage:'c2c4ca93cda04b99902a9eb33ff11ad3d53c1769d4614583ea1098675b744134',noCandidateTuningAfterFreeze:true};
  await writeFile(freezePath,JSON.stringify(frozen,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({frozen:true,datasetSha256:frozen.datasetSha256,cases:data.cases.length}));return;
 }
 const frozen=JSON.parse(await readFile(freezePath,'utf8'));assert(frozen.datasetSha256===hash(bytes),'dataset_changed_after_freeze');
 const amendment=JSON.parse(await readFile(amendmentPath,'utf8'));
 assert(amendment.originalFreezeSha256===hash(await readFile(freezePath))&&amendment.datasetUnchanged===true&&amendment.candidateChangedAfterOriginalFreeze===true&&amendment.migrationSha256===hash(await readFile(amendment.migration)),'invalid_freeze_amendment');
 const recovery=JSON.parse(await readFile(recoveryPath,'utf8'));
 assert(recovery.classification==='recovery_rerun_after_disclosed_runtime_fix'&&recovery.originalFreezeSha256===hash(await readFile(freezePath))&&recovery.originalAmendmentSha256===hash(await readFile(amendmentPath))&&recovery.datasetSha256===hash(bytes)&&recovery.datasetAndGoldUnchanged===true&&recovery.originalEvaluationAlreadyObserved===true&&recovery.preImplementationHeldOut===false&&recovery.newIndependentHeldOutEvaluation===false,'invalid_recovery_amendment');
 assert(/^[a-f0-9]{64}$/.test(recovery.candidateWorkerImage)&&/^[a-f0-9]{64}$/.test(recovery.candidateWorkerPackage),'invalid_recovery_worker_identity');
 verifyRecoverySources(await sourceHashes(),frozen,recovery);
 const runner=await readFile('Panda-agent/scripts/phase6-eval.mjs','utf8');
 assert.equal(hash(runner.slice(runner.indexOf('export const percentile='),runner.indexOf('async function loadCases()'))),recovery.unchangedScoringSha256,'evaluation_scoring_changed');
 assert.equal(hash(await readFile(recovery.originalReport.path)),recovery.originalReport.sha256,'original_evaluation_report_changed');
 const baselineBuild=(await readFile('.next-lightweight-phase2-acceptance/BUILD_ID','utf8')).trim(),candidateBuild=(await readFile('.next-lightweight-phase6-browser/BUILD_ID','utf8')).trim();
 assert(baselineBuild===expectedBaselineBuild&&candidateBuild===expectedCandidateBuild&&amendment.baselineSelection?.acceptedBuildId===baselineBuild&&amendment.baselineSelection?.candidateBuildId===candidateBuild,'evaluation_build_identity_mismatch');
 if(mode==='--verify-freeze'){console.log(JSON.stringify({datasetAndGoldUnchanged:true,originalFreezeAndAmendmentPreserved:true,disclosedSqlGuardCorrection:true,recoverySourceHashesMatch:true,otherFrozenSourcesUnchanged:true,originalReportPreserved:true,classification:recovery.classification,candidateWorkerImage:recovery.candidateWorkerImage,baselineBuild,candidateBuild,cases:data.cases.length,preImplementationHeldOut:false}));return;}
 assert(process.env.PANDA_AGENT_PHASE6_EVAL_CLEARED==='true','root_clearance_required');
 if(process.env.PANDA_AGENT_DEV_ENV_FILE)process.loadEnvFile(process.env.PANDA_AGENT_DEV_ENV_FILE);process.loadEnvFile('.env.local');
 assert(process.env.CLERK_SECRET_KEY?.startsWith('sk_test_'),'development_key_required');assert(process.env.PANDA_AGENT_INSFORGE_BASE_URL==='https://feh4966v.us-east.insforge.app','verified_target_required');assert(process.env.PANDA_AGENT_CLERK_JWT_TEMPLATE==='insforge-pandabyte-migration','verified_template_required');
 const state=JSON.parse(await readFile(statePath,'utf8'));assert(state.purpose==='panda-lightweight-phase6'&&state.actors.length===2,'marked_state_required');
 const actor=state.actors.find(x=>x.label==='a'&&!x.cleaned);assert(actor?.sessionId,'live_marked_actor_required');const clerk=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY});
 assert((await clerk.instance.get()).id==='ins_3L6TKBiLRXyJbJGRnpa9t3gvFAI','verified_instance_required');
 const user=await clerk.users.getUser(actor.userId);assert(user.privateMetadata?.purpose===state.purpose&&user.privateMetadata?.runId===state.runId&&user.emailAddresses.some(e=>e.emailAddress===actor.email),'fixture_identity_mismatch');
 const jwt=(await clerk.sessions.getToken(actor.sessionId,process.env.PANDA_AGENT_CLERK_JWT_TEMPLATE)).jwt;
 const client=createClient({baseUrl:process.env.PANDA_AGENT_INSFORGE_BASE_URL,accessToken:jwt,timeout:8000,retryCount:0,debug:false});const identity=await client.database.rpc('requesting_user_id');assert(!identity.error&&identity.data===actor.userId,'scope_mismatch');
 const catalog=await client.database.rpc('panda_agent_runtime_products');assert(!catalog.error&&Array.isArray(catalog.data?.items),'catalog_unavailable');const matches=catalog.data.items.filter(p=>/\bx8266\b/i.test(p.title));assert(matches.length===1&&/^[A-Za-z0-9_-]{1,128}$/.test(matches[0].sku),'unique_product_required');const sku=matches[0].sku;
 for(const [base,build] of [[baselineBase,baselineBuild],[candidateBase,candidateBuild]]){
  const response=await fetch(`${base}/_next/static/${build}/_buildManifest.js`,{redirect:'manual',signal:AbortSignal.timeout(8000)});
  assert(response.status===200&&/javascript/.test(response.headers.get('content-type')??''),'serving_build_identity_unconfirmed');
  await response.body?.cancel();
 }
 async function request(base,route,method='GET',value){const token=(await clerk.sessions.getToken(actor.sessionId)).jwt;const response=await fetch(base+route,{method,headers:{authorization:`Bearer ${token}`,origin:base,...(value===undefined?{}:{'content-type':'application/json'})},...(value===undefined?{}:{body:JSON.stringify(value)}),redirect:'manual',signal:AbortSignal.timeout(45000)});const raw=await response.text();assert(Buffer.byteLength(raw)<=1024*1024,'response_limit');return {status:response.status,data:JSON.parse(raw)};}
 const runId=randomUUID(),rows=[];const output=dir+'/phase6-eval-recovery-'+runId+'.json';
 const persist=async()=>writeFile(output,JSON.stringify({classification:recovery.classification,originalDatasetClassification:data.classification,preImplementationHeldOut:false,newIndependentHeldOutEvaluation:false,datasetSha256:frozen.datasetSha256,freezeAmendment:amendment,recoveryAmendment:recovery,candidateWorkerImage:recovery.candidateWorkerImage,candidateWorkerPackage:recovery.candidateWorkerPackage,runId,baselineLabel,baselineBuildId:baselineBuild,candidateBuildId:candidateBuild,baselineBase,candidateBase,corpus:'same current approved catalog/actor/target and recovery Phase6 backward-compatible private worker; accepted historical Phase2 BFF binary only, not entire historical stack',measurement:'sequential production BFFs at localhost3000/3001; no load/capacity claim',rows,metrics:summarize(rows),manualSupportReviewPending:true,privateUsageReconciliationPending:true},null,2),{mode:0o600});
 await persist();
 for(const [i,c] of data.cases.entries()){
  const input=JSON.parse(JSON.stringify(c.input).replaceAll('{{sku}}',sku));
  // Alternate order by case to reduce a systematic warm-cache advantage; no work retries.
  for(const path of i%2?['candidate','baseline']:['baseline','candidate']){
   const base=path==='baseline'?baselineBase:candidateBase;
   const title=`Disposable Phase6 ${state.runId} eval ${runId.slice(0,8)} ${c.id} ${path}`;assert(title.length<=100,'title_bound');
   const created=await request(base,'/api/panda-agent/chats','POST',{title});assert(created.status===201&&created.data?.thread?.id,'chat_create_failed');const thread=created.data.thread.id;actor.threads.push({id:thread,title});await writeFile(statePath,JSON.stringify(state,null,2),{mode:0o600});
   const requestId=randomUUID(),start=performance.now();const first=await request(base,`/api/panda-agent/chats/${thread}/messages`,'POST',{requestId,...(path==='baseline'?{question:input.question}:{agentic:input})});
   // Accepted Phase2 forbids requestId queries; fresh-chat equality proves its saved pair.
   const read=await request(base,`/api/panda-agent/chats/${thread}${path==='candidate'?`?requestId=${requestId}`:''}`);const latencyMs=Math.round((performance.now()-start)*100)/100;
   const answer=first.data?.messages?.at(-1),saved=read.data?.messages?.at(-1);const complete=savedComplete(path,first,read,thread,input.question);
   const rejected=typedRejection(c,path,first,read),score=scoreCase(c,complete?answer:null);
   if(rejected)Object.assign(score,{success:true,correctAbstention:true,refusalKind:'typed_request_rejection_no_saved_answer'});
   const row={caseId:c.id,path,category:c.category,httpStatus:first.status,readStatus:read.status,complete,rejected,latencyMs,thread,requestId,persistedExactPair:complete&&read.data.messages.length===2&&JSON.stringify(answer)===JSON.stringify(saved),completedToolCards:answer?.toolCards?.filter(t=>t.state==='complete').length??0,score,answerHash:complete?hash(JSON.stringify(answer)):null};rows.push(row);await persist();
   // Exact answer stays in owner-scoped durable records for review, never in stdout/report.
   console.log(JSON.stringify({caseId:c.id,path,complete,automaticSuccess:row.score.success,latencyMs}));
   assert(first.status!==401&&first.status!==403,'authorization_or_grant_unavailable');
   assert(complete||rejected,'incomplete_stop_no_retry_use_status_only');
  }
 }
 console.log(JSON.stringify({result:'collected_manual_support_and_private_usage_review_pending',report:output,metrics:summarize(rows)}));
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/phase6-eval.mjs'))main().catch(e=>{const label=e?.code==='ERR_ASSERTION'&&/^[a-z0-9_]+$/.test(e.message)?e.message:'evaluation_stopped';console.error(JSON.stringify({result:'stopped',label,noAutomaticRetry:true}));process.exitCode=1;});
