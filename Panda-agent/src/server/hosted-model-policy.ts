import {fastHostedModel} from '../hosted-model.ts';

export const hostedOutputTokens=700;
const maxOutput=hostedOutputTokens;
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,max:number):v is number=>Number.isSafeInteger(v)&&(v as number)>=0&&(v as number)<=max;

export function approvedHostedEndpoint(catalog:unknown,zdr:unknown,maxInput:number):'max_tokens'|null {
 if(!record(catalog)||!record(catalog.data)||catalog.data.id!==fastHostedModel.id||!record(catalog.data.architecture)||catalog.data.architecture.tokenizer!=='GPT'
  ||!Array.isArray(catalog.data.endpoints)||!record(zdr)||!Array.isArray(zdr.data))return null;
 const variant=(tag:unknown)=>typeof tag==='string'&&(tag.toLowerCase()==='groq'||tag.toLowerCase().startsWith('groq/'));
 const endpoints=catalog.data.endpoints.filter(e=>record(e)&&variant(e.tag));
 const privacy=zdr.data.filter(e=>record(e)&&e.model_id===fastHostedModel.id&&variant(e.tag));
 const e=endpoints[0],p=privacy[0];
 if(endpoints.length!==1||privacy.length!==1||!record(e)||!record(p)||p.tag!=='groq'||p.safety_retention!==false
  ||e.tag!=='groq'||e.model_id!==fastHostedModel.id||e.name!=='Groq | openai/gpt-oss-20b'||e.provider_name!=='Groq'||e.status!==0
  ||e.supports_implicit_caching!==true||!record(e.pricing)||e.pricing.prompt!=='0.000000075'||e.pricing.completion!=='0.0000003'
  ||e.pricing.input_cache_read!=='0.0000000375'||e.pricing.discount!==0
  ||Object.keys(e.pricing).some(k=>!['prompt','completion','input_cache_read','discount'].includes(k))
  ||typeof e.context_length!=='number'||e.context_length<maxInput+maxOutput||typeof e.max_completion_tokens!=='number'||e.max_completion_tokens<maxOutput
  ||(e.max_prompt_tokens!==null&&(typeof e.max_prompt_tokens!=='number'||e.max_prompt_tokens<maxInput))
  ||!record(e.supports_tool_choice)||e.supports_tool_choice.none!==true||!Array.isArray(e.supported_parameters))return null;
 const parameters=e.supported_parameters;
 if(!['response_format','reasoning','include_reasoning','tool_choice'].every(k=>parameters.includes(k)))return null;
 return parameters.includes('max_tokens')?'max_tokens':null;
}

function nanoCost(value:unknown,maximum:number):number|null {
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>maximum/1e9)return null;
 const [decimal,exponent='0']=String(value).toLowerCase().split('e'),[whole,fraction='']=decimal.split('.');
 const digits=BigInt(whole+fraction),power=Number(exponent)-fraction.length+9;
 const result=power>=0?digits*BigInt(10)**BigInt(power):(digits+BigInt(10)**BigInt(-power)-BigInt(1))/BigInt(10)**BigInt(-power);
 return result<=BigInt(maximum)?Number(result):null;
}

function checkedHostedUsage(value:unknown,maxInput:number,reservation:number,bound:(prompt:number,completion:number,cached:number)=>number,options:{imageTokens:boolean}={imageTokens:false}){
 if(!record(value)||!integer(value.prompt_tokens,maxInput)||!integer(value.completion_tokens,maxOutput))throw Error('invalid_hosted_usage');
 let reasoningTokens=0,cachedTokens=0;
 if(value.completion_tokens_details!==undefined){
  if(!record(value.completion_tokens_details))throw Error('invalid_hosted_usage');
  for(const [key,count]of Object.entries(value.completion_tokens_details)){
   if(!integer(count,value.completion_tokens))throw Error('invalid_hosted_usage');
   if(key==='reasoning_tokens')reasoningTokens=count;
   else if(!['image_tokens','audio_tokens','accepted_prediction_tokens','rejected_prediction_tokens'].includes(key)||count!==0)throw Error('invalid_hosted_usage');
  }
 }
 if(value.prompt_tokens_details!==undefined){
  if(!record(value.prompt_tokens_details))throw Error('invalid_hosted_usage');let cacheTotal=0;
  for(const [key,count]of Object.entries(value.prompt_tokens_details)){
   if(!integer(count,value.prompt_tokens))throw Error('invalid_hosted_usage');
   if(key==='cached_tokens'){cachedTokens=count;cacheTotal+=count;}
   else if(key==='cache_write_tokens')cacheTotal+=count;
   else if(key==='image_tokens'&&options.imageTokens){/* C4: informational; already bounded by prompt_tokens above */}
   else if(!['audio_tokens','video_tokens'].includes(key)||count!==0)throw Error('invalid_hosted_usage');
  }
  if(cacheTotal>value.prompt_tokens)throw Error('invalid_hosted_usage');
 }
 if(value.total_tokens!==undefined&&value.total_tokens!==value.prompt_tokens+value.completion_tokens)throw Error('invalid_hosted_usage');
 const maximum=Math.min(reservation,bound(value.prompt_tokens,value.completion_tokens,cachedTokens));
 const cost=nanoCost(value.cost,maximum);if(cost===null)throw Error('invalid_hosted_usage');
 return {usage:{inputTokens:value.prompt_tokens,outputTokens:value.completion_tokens,costNanoUsd:cost},reasoningTokens,cachedTokens};
}

export function validateHostedUsage(value:unknown,maxInput:number,reservation:number){
 return checkedHostedUsage(value,maxInput,reservation,(prompt,completion,cached)=>Math.ceil((prompt*150-cached*75+completion*600)/2)+1);
}

// C3 hosted research allowlist. GPT-OSS is a legacy data entry (old code paths above); the others use exact-tag single-ZDR-endpoint approval.
export const researchMaxInput=16000;
export type HostedResearchModel=Readonly<{
 id:'openai/gpt-oss-20b'|'openai/gpt-6-luna'|'openai/gpt-6.1-terra'|'anthropic/claude-haiku-5.5';
 legacy:boolean;
 vision:boolean; // C4: accepts one host-admitted PNG/JPEG image per single-turn binding
 reportedModels:readonly string[];
 endpointTag:string;providerName:string;endpointName:string;tokenizer:'GPT'|'Claude';
 // 'disabled' sends reasoning:{enabled:false}: Haiku 5.5 on Bedrock otherwise streams a signature-only reasoning_details block (observed 11 Nov 2026).
 outputParam:'max_tokens'|'max_completion_tokens';reasoning:'low'|'disabled';historyIdMax:number|null;historyIdSanitize:boolean; // observed OpenCode 2.2.5: Anthropic tool IDs get [^A-Za-z0-9_-] replaced by '_' (no truncation)
 pricing:Readonly<Record<string,string|number>>;
 pricingKeys:readonly string[];overrideKeys:readonly string[];
 maxPrice:Readonly<{prompt:number;completion:number;request:0;image:0}>;
 rates:Readonly<{prompt:number;completion:number;cacheRead:number;cacheWrite:number;cacheWrite1h:number}>;
 reservationNanoUsd:number;
 // Input-token cap and canonical wire byte cap. Owner decision 11 Nov 2026: follow-up turns with two search results exceeded 14,000 B,
 // so non-legacy models allow 32,000 tokens / 48,000 B; legacy GPT-OSS keeps its reviewed 16,000 / 14,000.
 // shortcut: 48,000 B can in rare dense text (hex, escapes) exceed 32,000 tokens; the provider bills it and usage validation fails closed as unknown. Add a pinned max_prompt_tokens wire field if that is ever observed.
 maxInput:number;wireMax:number;
}>;
type DescriptorInput=Omit<HostedResearchModel,'rates'|'reservationNanoUsd'|'pricingKeys'|'maxPrice'|'maxInput'|'wireMax'>&{maxPrice:{prompt:number;completion:number}};
// Catalog prices are USD-per-token strings; rates are integer tenths of nano-USD per token (USD x 1e10).
const tenths=(price:unknown)=>price===undefined?0:Math.round(Number(price)*1e10);
function deepFreeze<T>(value:T):T {
 if(value&&typeof value==='object'){for(const child of Object.values(value))deepFreeze(child);Object.freeze(value);}
 return value;
}
function descriptor(input:DescriptorInput):HostedResearchModel {
 const p=input.pricing;
 const rates={prompt:tenths(p.prompt),completion:tenths(p.completion),cacheRead:tenths(p.input_cache_read),cacheWrite:tenths(p.input_cache_write),cacheWrite1h:tenths(p.input_cache_write_1h)};
 const maxInput=input.legacy?researchMaxInput:32000,wireMax=input.legacy?14000:48000;
 const reservationNanoUsd=Math.ceil((maxInput*Math.max(rates.prompt,rates.cacheWrite,rates.cacheWrite1h)+maxOutput*rates.completion)/10)+1;
 return deepFreeze({...input,maxInput,wireMax,pricingKeys:input.legacy?Object.keys(input.pricing):[...Object.keys(input.pricing),'overrides'],maxPrice:{...input.maxPrice,request:0 as const,image:0 as const},rates,reservationNanoUsd});
}
const openaiOverrides=['min_prompt_tokens','prompt','completion','input_cache_read','input_cache_write'];
export const hostedResearchModels:Readonly<Record<HostedResearchModel['id'],HostedResearchModel>>=Object.freeze({
 'openai/gpt-oss-20b':descriptor({id:'openai/gpt-oss-20b',legacy:true,vision:false,reportedModels:[fastHostedModel.id],endpointTag:'groq',providerName:'Groq',endpointName:'Groq | openai/gpt-oss-20b',tokenizer:'GPT',
  outputParam:'max_tokens',reasoning:'low',historyIdMax:40,historyIdSanitize:false,pricing:{prompt:'0.000000075',completion:'0.0000003',input_cache_read:'0.0000000375',discount:0},overrideKeys:[],maxPrice:{prompt:0.075,completion:0.3}}),
 'openai/gpt-6-luna':descriptor({id:'openai/gpt-6-luna',legacy:false,vision:true,reportedModels:['openai/gpt-6-luna','openai/gpt-6-luna-20260922'],endpointTag:'azure/us',providerName:'Azure',endpointName:'Azure | openai/gpt-6-luna-20260922',tokenizer:'GPT',
  outputParam:'max_completion_tokens',reasoning:'low',historyIdMax:40,historyIdSanitize:false,pricing:{prompt:'0.00000011',completion:'0.00000055',web_search:'0.01',input_cache_read:'0.000000011',input_cache_write:'0.0000001375',discount:0},overrideKeys:openaiOverrides,maxPrice:{prompt:0.11,completion:0.55}}),
 'openai/gpt-6.1-terra':descriptor({id:'openai/gpt-6.1-terra',legacy:false,vision:true,reportedModels:['openai/gpt-6.1-terra','openai/gpt-6.1-terra-20261026'],endpointTag:'azure/us',providerName:'Azure',endpointName:'Azure | openai/gpt-6.1-terra-20261026',tokenizer:'GPT',
  outputParam:'max_completion_tokens',reasoning:'low',historyIdMax:40,historyIdSanitize:false,pricing:{prompt:'0.0000011',completion:'0.0000055',web_search:'0.01',input_cache_read:'0.000000055',input_cache_write:'0.000001375',discount:0},overrideKeys:openaiOverrides,maxPrice:{prompt:1.1,completion:5.5}}),
 'anthropic/claude-haiku-5.5':descriptor({id:'anthropic/claude-haiku-5.5',legacy:false,vision:true,reportedModels:['anthropic/claude-haiku-5.5','anthropic/claude-haiku-5.5-20261007'],endpointTag:'amazon-bedrock',providerName:'Amazon Bedrock',endpointName:'Amazon Bedrock | anthropic/claude-haiku-5.5-20261007',tokenizer:'Claude',
  outputParam:'max_tokens',reasoning:'disabled',historyIdMax:null,historyIdSanitize:true,pricing:{prompt:'0.0000001',completion:'0.0000005',web_search:'0.01',input_cache_read:'0.00000001',input_cache_write:'0.000000125',input_cache_write_1h:'0.0000002',discount:0},overrideKeys:[...openaiOverrides,'input_cache_write_1h'],maxPrice:{prompt:0.1,completion:0.5}}),
});
export function hostedResearchModel(modelID:unknown):HostedResearchModel|null {
 return typeof modelID==='string'&&Object.hasOwn(hostedResearchModels,modelID)?hostedResearchModels[modelID as HostedResearchModel['id']]:null;
}

const requiredResearchParameters=['response_format','reasoning','include_reasoning','tool_choice','tools'];
export function approvedHostedResearchEndpoint(model:HostedResearchModel,catalog:unknown,zdr:unknown):'max_tokens'|'max_completion_tokens'|null {
 if(model.legacy)return approvedHostedEndpoint(catalog,zdr,researchMaxInput);
 if(!record(catalog)||!record(catalog.data)||catalog.data.id!==model.id||!record(catalog.data.architecture)||catalog.data.architecture.tokenizer!==model.tokenizer
  ||!Array.isArray(catalog.data.endpoints)||!record(zdr)||!Array.isArray(zdr.data))return null;
 const endpoints=catalog.data.endpoints.filter(e=>record(e)&&e.tag===model.endpointTag);
 const privacy=zdr.data.filter(e=>record(e)&&e.model_id===model.id&&e.tag===model.endpointTag);
 const e=endpoints[0],p=privacy[0];
 if(endpoints.length!==1||privacy.length!==1||!record(e)||!record(p)||p.safety_retention!==false
  ||e.model_id!==model.id||e.name!==model.endpointName||e.provider_name!==model.providerName||e.status!==0||e.supports_implicit_caching!==false
  ||!record(e.pricing)||typeof e.context_length!=='number'||e.context_length<model.maxInput+maxOutput||typeof e.max_completion_tokens!=='number'||e.max_completion_tokens<maxOutput
  ||(e.max_prompt_tokens!==null&&(typeof e.max_prompt_tokens!=='number'||e.max_prompt_tokens<model.maxInput))
  ||!record(e.supports_tool_choice)||e.supports_tool_choice.none!==true||e.supports_tool_choice.auto!==true||!Array.isArray(e.supported_parameters))return null;
 const pricing=e.pricing,scalars=model.pricingKeys.filter(k=>k!=='overrides'),keys=Object.keys(pricing).filter(k=>k!=='overrides');
 if(keys.length!==scalars.length||keys.some(k=>!scalars.includes(k)||pricing[k]!==model.pricing[k]))return null;
 const overrides=pricing.overrides;
 if(!Array.isArray(overrides)||!overrides.length||overrides.length>4||overrides.some(o=>!record(o)||typeof o.min_prompt_tokens!=='number'||!(o.min_prompt_tokens>model.maxInput)
  ||Object.keys(o).some(k=>!model.overrideKeys.includes(k))))return null;
 const parameters=e.supported_parameters;
 if(![...requiredResearchParameters,model.outputParam].every(k=>parameters.includes(k)))return null;
 return model.outputParam;
}

export function validateHostedResearchUsage(model:HostedResearchModel,value:unknown){
 if(model.legacy)return validateHostedUsage(value,researchMaxInput,model.reservationNanoUsd);
 const r=model.rates,rate=Math.max(r.prompt,r.cacheWrite,r.cacheWrite1h);
 return checkedHostedUsage(value,model.maxInput,model.reservationNanoUsd,(prompt,completion)=>Math.ceil((prompt*rate+completion*r.completion)/10)+1,{imageTokens:model.vision});
}
