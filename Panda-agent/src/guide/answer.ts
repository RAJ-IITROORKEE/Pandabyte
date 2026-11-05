import {answerQuestion} from '../retrieval/answers.ts';
import {createInsforgeAdapters} from '../retrieval/insforge-adapters.ts';
import type {Adapters,Citation} from '../retrieval/contracts.ts';
import type {ContextSummary} from '../retrieval/context-summary.ts';
import {parseGuideInput,type GuideInput,type GuideSkill} from './contracts.ts';
import {prepareGuide,type GuideWire,type createGuideClient} from './client.ts';
import {resolveGuideProduct} from './catalog.ts';

type RagClient=Parameters<typeof createInsforgeAdapters>[0];
type Client=Pick<ReturnType<typeof createGuideClient>,'run'>;
type Input={subject:string;sessionId:string;threadId:string;turnId:string;productSku:string;productId:string;scopeHash:string|null;skill:GuideSkill;input:GuideInput;ragClient:RagClient;client:Client;current:()=>Promise<boolean>;beforeDispatch:(v:{requestBodySha256:string;productSku:string;productId:string;scopeHash:string|null})=>Promise<void>;signal?:AbortSignal;activity?:(stage:'resolving_product'|'reading_sources'|'searching_sources'|'checking_citations'|'selecting_evidence',context?:ContextSummary)=>void};
const escape=(s:string)=>s.replace(/[\\`*_{}\[\]()<>#+.!|~-]/g,'\\$&').replace(/[\r\n]+/g,' ');
function render(input:GuideInput,wire:Extract<GuideWire,{state:'complete'}>,citations:Citation[],skill:GuideSkill){
 const components=input.components.length?input.components.map(escape).join(', '):'Not supplied';
 const parking=wire.guide.template==='parking-monitor';
 const architecture=parking?'Conceptual flow: sensor measurement → validity filter → occupied/free/unknown state → display or report. Calibrate the threshold for the actual installation and debounce transitions using a measured stability period.':'Conceptual flow: identify the input, process it according to the project goal, then present the output. Confirm each component and interface before choosing an implementation.';
 const firmware=parking?'Illustrative pseudocode only; uncompiled and untested:\n\n```text\nrepeat:\n  sample = read_sensor()\n  if sample is missing, invalid, or outside the confirmed sensor range:\n    state = unknown\n  else:\n    filtered = validity_filter(sample)\n    candidate = compare_with_calibrated_threshold(filtered)\n    state = debounce_transition(candidate, occupied/free/unknown)\n  display_or_report(state)\n```':'Illustrative pseudocode only; uncompiled and untested:\n\n```text\nrepeat:\n  input = read_confirmed_input()\n  result = process(input)\n  present(result)\n```';
 const verification=parking?'Review the applicable schematic and ratings before power. Test an empty space, an occupied space, noisy transitions and invalid or missing measurements; record the observed state and calibrate without assuming a threshold.':'Review the applicable schematic and ratings before power. Test the confirmed input, processing and output separately; record observations.';
 return `## Objective\n${escape(input.goal)}\n\n## Confirmed evidence\n${citations.length?citations.map(c=>`The listing states: “${escape(c.quote)}” [${c.id}]`).join('\n'):'No board facts were confirmed.'}\n\n## Bill of materials\nUser supplied board: ${escape(input.board)}. Revision: ${input.revision?escape(input.revision):'not supplied'}. Components: ${components}. These details are unverified.\n\n## Architecture\n${architecture}\n\n## Supported interfaces\nNo wiring is verified. If the chosen sensor uses TRIG and ECHO, leave both as placeholders until its specifications and the board revision schematic are confirmed. Power, voltage tolerance and library versions remain unknown.\n\n## Firmware outline\n${firmware}\n\n## Verification steps\n${verification}${skill.version===2?' Write an observation checklist before applying power.':''}\n\n## Open questions\nWhich physical board revision, sensor, wiring, framework and component specifications apply?`;
}
type GuideAnswer={kind:'complete';text:string;citations:Citation[];wire:GuideWire}|{kind:'clarification'|'conflict'|'unavailable';wire:GuideWire|'unknown'|null};
export async function answerGuide(args:Input):Promise<GuideAnswer>{
 return createGuideAnswer()(args);
}
export function createGuideAnswer(deps:{createAdapters?:(client:RagClient,select:Adapters['select'])=>Adapters}={}) {
 return async(args:Input):Promise<GuideAnswer>=>{try{return await checkedAnswer(args,deps.createAdapters??createInsforgeAdapters);}catch{return {kind:'unavailable',wire:null};}};
}
async function checkedAnswer(args:Input,createAdapters:(client:RagClient,select:Adapters['select'])=>Adapters):Promise<GuideAnswer>{
 const input=parseGuideInput(args.input);if(!input || !args.ragClient || (args.scopeHash!==null && !/^[0-9a-f]{64}$/.test(args.scopeHash)) || !await args.current() || args.signal?.aborted)return {kind:'unavailable',wire:null};
 const adapters=createAdapters(args.ragClient,async()=>{throw Error('Not admitted');});
 adapters.activity=args.activity;
 const identity=args.scopeHash===null?await resolveGuideProduct(args.ragClient,input.board):await adapters.resolveIdentity({subject:args.subject},{question:input.board});
 if(identity.kind!=='resolved')return {kind:identity.kind,wire:null};
 if(identity.product.id!==args.productId || identity.product.sku!==args.productSku)return {kind:'conflict',wire:null};
 let wire:GuideWire|'unknown'|null=null,called=false;
 const invoke=async(fragments:Array<{handle:string;text:string}>,revalidate?:()=>Promise<boolean>)=>{
  if(called || args.signal?.aborted || !await args.current())throw Error('Unavailable');called=true;
  const intent={goal:input.goal,board:input.board,...(input.revision===undefined?{}:{revision:input.revision}),components:input.components};
  const prepared=prepareGuide({threadId:args.threadId,turnId:args.turnId,productSku:args.productSku,skill:args.skill,intent,fragments});
  await args.beforeDispatch({requestBodySha256:prepared.requestBodySha256,productSku:args.productSku,productId:args.productId,scopeHash:args.scopeHash});
  if(args.signal?.aborted || !await args.current() || (revalidate && !await revalidate()))throw Error('Unavailable');
  try{args.activity?.('selecting_evidence');}catch{/* Presentation cannot affect authorization. */}
  try{wire=await args.client.run({subject:args.subject,sessionId:args.sessionId,prepared,signal:args.signal});}catch{wire='unknown';throw Error('Unavailable');}
  if(wire.state!=='complete')throw Error('Unavailable');
  return wire;
 };
 try{
  let citations:Citation[]=[];
  if(args.scopeHash===null){await invoke([]);}
  else {
   adapters.lexical=async(_q,handles)=>handles.length<=8?handles:[];
   adapters.select=async(_q,fragments,context)=>{if(!context?.completeEligibleScope || !await context.revalidate())throw Error('Unavailable');const selected=await invoke(fragments,context.revalidate);if(!await context.revalidate())throw Error('Unavailable');return {selections:selected.selections};};
   const outcome=await answerQuestion({subject:args.subject},{question:`Which MCU does ${args.productSku} use?`,productSku:args.productSku},adapters);
   if(outcome.kind==='evidence')citations=outcome.citations;
   else if(outcome.kind!=='insufficient')return {kind:'unavailable',wire};
   if(!called)await invoke([]);
  }
  if(!wire || wire==='unknown' || (wire as GuideWire).state!=='complete' || !await args.current() || args.signal?.aborted)return {kind:'unavailable',wire};
  const finalWire=wire as Extract<GuideWire,{state:'complete'}>,text=render(input,finalWire,citations,args.skill);
  if(text.length>8000)return {kind:'unavailable',wire};
  return {kind:'complete',text,citations,wire:finalWire};
 }catch{return {kind:'unavailable',wire};}
}
