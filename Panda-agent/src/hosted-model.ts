/** Public hosted selection metadata; native execution profiles are independent. */
export const fastHostedModel = Object.freeze({ id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', provider: 'groq' } as const);
/** Selectable beside the fast model on the hosted chat; pinned to a zero-retention endpoint with strict JSON support. */
export const haikuHostedModel = Object.freeze({ id: 'anthropic/claude-haiku-5.5', label: 'Claude Haiku 5.5', provider: 'google-vertex/global' } as const);
export const lunaHostedModel = Object.freeze({ id: 'openai/gpt-6-luna', label: 'GPT-6 Luna', provider: 'azure/us' } as const);
export const flashHostedModel = Object.freeze({ id: 'google/gemini-3.5-flash', label: 'Gemini 3.5 Flash', provider: 'google-vertex/global' } as const);
export const qwenHostedModel = Object.freeze({ id: 'qwen/qwen3.8-27b', label: 'Qwen 3.8 27B', provider: 'deepinfra/bf16' } as const);
/** Every model the hosted chat may run, each pinned to a reviewed zero-retention endpoint. */
export const hostedDirectModels = Object.freeze([haikuHostedModel, lunaHostedModel, flashHostedModel, qwenHostedModel, fastHostedModel]);
export const hostedDirectModelIds: readonly string[] = Object.freeze(hostedDirectModels.map(model => model.id));
export type HostedModelId = typeof fastHostedModel.id;
export type HostedDirectModelId = typeof hostedDirectModels[number]['id'];
/** The hosted model the request header asks for, defaulting to the fast model. */
export const requestedHostedModel = (header: string | null): HostedDirectModelId => hostedDirectModels.find(model => model.id === header)?.id ?? fastHostedModel.id;
export function hostedModelSelection(env: Readonly<Record<string, string | undefined>>) {
  if (env.PANDA_AGENT_HOSTED_MODEL === fastHostedModel.id) return fastHostedModel;
  if (env.PANDA_AGENT_HOSTED_MODEL === undefined || env.PANDA_AGENT_HOSTED_MODEL === 'openai/gpt-6-luna') {
    return { id: 'openai/gpt-6-luna', label: 'GPT-6 Luna', provider: 'azure/us' } as const;
  }
  return null;
}
