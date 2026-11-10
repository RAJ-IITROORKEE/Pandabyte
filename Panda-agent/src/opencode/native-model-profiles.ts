/** Versioned server-owned provider profiles; selection never authorizes dispatch by itself. */
export type NativeModelProfile = Readonly<{
  id: 'luna'|'deepseek-v3-2-exp'|'deepseek-chat-v3-0324'|'terra'|'haiku'; model: string; providerTag: string; providerName: string; endpointName: string;
  reportedModels: readonly string[]; tokenizer: string; maxInputTokens: number; maxOutputTokens: 700;
  maxWireBytes: 10000; contextLength: number; promptNanoUsdPerToken: number; completionNanoUsdPerToken: number;
  reservationQuanta: number; inputCostNanoUsdPerToken: number; reasoningParameters: boolean; maxTokensParameter: 'max_completion_tokens'|'max_tokens';
  framingBoundProven: boolean; dispatchEnabled: boolean;
}>;
const profiles = {
  luna: { id:'luna',model:'openai/gpt-6-luna',providerTag:'azure/us',providerName:'Azure',endpointName:'Azure | openai/gpt-6-luna-20260922',reportedModels:['openai/gpt-6-luna','openai/gpt-6-luna-20260922'],tokenizer:'GPT',maxInputTokens:11024,maxOutputTokens:700,maxWireBytes:10000,contextLength:11724,promptNanoUsdPerToken:110,completionNanoUsdPerToken:550,reservationQuanta:2,inputCostNanoUsdPerToken:138,reasoningParameters:true,maxTokensParameter:'max_completion_tokens',framingBoundProven:true,dispatchEnabled:true },
  'deepseek-v3-2-exp': { id:'deepseek-v3-2-exp',model:'deepseek/deepseek-v3.2-exp',providerTag:'siliconflow/fp8',providerName:'SiliconFlow',endpointName:'SiliconFlow | deepseek/deepseek-v3.2-exp',reportedModels:['deepseek/deepseek-v3.2-exp'],tokenizer:'DeepSeek',maxInputTokens:163840,maxOutputTokens:700,maxWireBytes:10000,contextLength:163840,promptNanoUsdPerToken:270,completionNanoUsdPerToken:410,reservationQuanta:28,inputCostNanoUsdPerToken:270,reasoningParameters:true,maxTokensParameter:'max_tokens',framingBoundProven:false,dispatchEnabled:false },
  'deepseek-chat-v3-0324': { id:'deepseek-chat-v3-0324',model:'deepseek/deepseek-chat-v3-0324',providerTag:'siliconflow/fp8',providerName:'SiliconFlow',endpointName:'SiliconFlow | deepseek/deepseek-chat-v3-0324',reportedModels:['deepseek/deepseek-chat-v3-0324'],tokenizer:'DeepSeek',maxInputTokens:163840,maxOutputTokens:700,maxWireBytes:10000,contextLength:163840,promptNanoUsdPerToken:250,completionNanoUsdPerToken:1000,inputCostNanoUsdPerToken:250,reservationQuanta:27,reasoningParameters:false,maxTokensParameter:'max_tokens',framingBoundProven:false,dispatchEnabled:true },
  terra: { id:'terra',model:'openai/gpt-6.1-terra',providerTag:'azure/us',providerName:'Azure',endpointName:'Azure | openai/gpt-6.1-terra-20261026',reportedModels:['openai/gpt-6.1-terra','openai/gpt-6.1-terra-20261026'],tokenizer:'GPT',maxInputTokens:11024,maxOutputTokens:700,maxWireBytes:10000,contextLength:1050000,promptNanoUsdPerToken:1100,completionNanoUsdPerToken:5500,inputCostNanoUsdPerToken:1375,reservationQuanta:12,reasoningParameters:true,maxTokensParameter:'max_completion_tokens',framingBoundProven:true,dispatchEnabled:true },
  haiku: { id:'haiku',model:'anthropic/claude-haiku-5.5',providerTag:'amazon-bedrock/us-east-1',providerName:'Amazon Bedrock',endpointName:'Amazon Bedrock | anthropic/claude-haiku-5.5-20261007',reportedModels:['anthropic/claude-haiku-5.5','anthropic/claude-haiku-5.5-20261007'],tokenizer:'Claude',maxInputTokens:1000000,maxOutputTokens:700,maxWireBytes:10000,contextLength:1000000,promptNanoUsdPerToken:550,completionNanoUsdPerToken:2750,inputCostNanoUsdPerToken:688,reservationQuanta:432,reasoningParameters:true,maxTokensParameter:'max_tokens',framingBoundProven:false,dispatchEnabled:true },
} as const satisfies Record<string,NativeModelProfile>;
for (const p of Object.values(profiles)) { Object.freeze(p.reportedModels);Object.freeze(p); }
export const nativeModelProfiles = Object.freeze(profiles);
export type NativeModelProfileId = keyof typeof profiles;
export type NativeModelId = typeof profiles[NativeModelProfileId]['model'];
export const isNativeModelId = (value:unknown): value is NativeModelId => Object.values(profiles).some(p=>p.model===value);
export function profileForNativeModelId(value:unknown):NativeModelProfile {
  const profile=Object.values(profiles).find(p=>p.model===value);
  if(!profile)throw Error('invalid_profile');
  return profile;
}
export const disabledNvidiaFree = Object.freeze({ reason:'exact_zdr_endpoint_unverified',models:Object.freeze(['nvidia/nemotron-3.5-super-vl:free','nvidia/nemotron-3.5-lightning:free','nvidia/nemotron-3-ultra-550b-a55b:free','nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free']) });
export const reservationQuantumNanoUsd=1597640;
export function maximumTokenCostNanoUsd(profile:NativeModelProfile): number {
  const value=profile.maxInputTokens*profile.inputCostNanoUsdPerToken+profile.maxOutputTokens*profile.completionNanoUsdPerToken;
  if(!Number.isSafeInteger(value)||value<0||value>profile.reservationQuanta*reservationQuantumNanoUsd)throw Error('invalid_profile');
  return value;
}
export function nativeModelProfile(id:unknown):NativeModelProfile {
  if(typeof id!=='string'||!Object.hasOwn(nativeModelProfiles,id))throw Error('invalid_profile');
  const p=nativeModelProfiles[id as NativeModelProfileId];maximumTokenCostNanoUsd(p);return p;
}
