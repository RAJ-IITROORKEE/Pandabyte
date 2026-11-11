/** Public hosted selection metadata; native execution profiles are independent. */
export const fastHostedModel = Object.freeze({ id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', provider: 'groq' } as const);
/** Selectable beside the fast model on the hosted chat; pinned to a zero-retention endpoint with strict JSON support. */
export const haikuHostedModel = Object.freeze({ id: 'anthropic/claude-haiku-5.5', label: 'Claude Haiku 5.5', provider: 'google-vertex/global' } as const);
export const hostedDirectModelIds: readonly string[] = Object.freeze([fastHostedModel.id, haikuHostedModel.id]);
export type HostedModelId = typeof fastHostedModel.id;
export type HostedDirectModelId = typeof fastHostedModel.id | typeof haikuHostedModel.id;
/** The hosted model the request header asks for, defaulting to the fast model. */
export const requestedHostedModel = (header: string | null): HostedDirectModelId => header === haikuHostedModel.id ? haikuHostedModel.id : fastHostedModel.id;
export function hostedModelSelection(env: Readonly<Record<string, string | undefined>>) {
  if (env.PANDA_AGENT_HOSTED_MODEL === fastHostedModel.id) return fastHostedModel;
  if (env.PANDA_AGENT_HOSTED_MODEL === undefined || env.PANDA_AGENT_HOSTED_MODEL === 'openai/gpt-6-luna') {
    return { id: 'openai/gpt-6-luna', label: 'GPT-6 Luna', provider: 'azure/us' } as const;
  }
  return null;
}
