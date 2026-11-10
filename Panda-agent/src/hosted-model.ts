/** Public hosted selection metadata; native execution profiles are independent. */
export const fastHostedModel = Object.freeze({ id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', provider: 'groq' } as const);
export type HostedModelId = typeof fastHostedModel.id;
export function hostedModelSelection(env: Readonly<Record<string, string | undefined>>) {
  if (env.PANDA_AGENT_HOSTED_MODEL === fastHostedModel.id) return fastHostedModel;
  if (env.PANDA_AGENT_HOSTED_MODEL === undefined || env.PANDA_AGENT_HOSTED_MODEL === 'openai/gpt-6-luna') {
    return { id: 'openai/gpt-6-luna', label: 'GPT-6 Luna', provider: 'azure/us' } as const;
  }
  return null;
}
