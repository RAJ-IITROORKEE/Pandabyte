/** Public hosted selection metadata; native execution profiles are independent. */
export const fastHostedModel = Object.freeze({ id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', provider: 'groq' } as const);
/** GPT-OSS 20B could not drive the agent-loop tools live (13 Nov 2026: step limit on a simple question); its turns keep the older Admin-only path. */
export const loopModelAllowed = (model: string) => model !== fastHostedModel.id;
/** Selectable beside the fast model on the hosted chat; pinned to a zero-retention endpoint with strict JSON support. */
export const haikuHostedModel = Object.freeze({ id: 'anthropic/claude-haiku-5.5', label: 'Claude Haiku 5.5', provider: 'google-vertex/global' } as const);
export const lunaHostedModel = Object.freeze({ id: 'openai/gpt-6-luna', label: 'GPT-6 Luna', provider: 'azure/us' } as const);
// Gemini Flash is not offered: every Gemini endpoint on OpenRouter keeps prompts for safety review, which the zero-retention rule refuses.
export const flashHostedModel = Object.freeze({ id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash', provider: 'wafer/mxfp4' } as const);
export const qwenHostedModel = Object.freeze({ id: 'qwen/qwen3.8-27b', label: 'Qwen 3.8 27B', provider: 'deepinfra/bf16' } as const);
/** Every model the hosted chat may run, each pinned to a reviewed zero-retention endpoint. */
export const hostedDirectModels = Object.freeze([haikuHostedModel, lunaHostedModel, flashHostedModel, qwenHostedModel, fastHostedModel]);
export const hostedDirectModelIds: readonly string[] = Object.freeze(hostedDirectModels.map(model => model.id));
/** OpenRouter catalog context_length per model id (read 2026-11-13 from openrouter.ai/api/v1/models); display only, never a limit. */
export const hostedContextWindows: Readonly<Record<string, number>> = Object.freeze({
  'openai/gpt-oss-20b': 131072, 'anthropic/claude-haiku-5.5': 1000000, 'openai/gpt-6-luna': 1050000,
  'deepseek/deepseek-v4-flash': 1048576, 'qwen/qwen3.8-27b': 1048575,
});
/** One finished turn's token use for the composer meter; lives in the response only, never stored. */
/** inputTokens/outputTokens are billed totals over every agent step; contextTokens (agent loop) is the largest single step
 *  (prompt + reply), i.e. how full the context window got, which the meter shows. */
export type TurnUsage = { inputTokens: number; outputTokens: number; contextWindow: number | null; model: string; contextTokens?: number; steps?: number; costNanoUsd?: number };
export const turnUsageFor = (model: string, usage: { inputTokens: number; outputTokens: number; contextTokens?: number; steps?: number; costNanoUsd?: number }): TurnUsage =>
  ({ inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, contextWindow: hostedContextWindows[model] ?? null, model,
    ...(usage.contextTokens ? { contextTokens: usage.contextTokens } : {}), ...(usage.steps ? { steps: usage.steps } : {}), ...(usage.costNanoUsd ? { costNanoUsd: usage.costNanoUsd } : {}) });
/** 950 -> "950", 5200 -> "5.2k", 131072 -> "131k", 1050000 -> "1.05M". */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n < 1000) return String(Math.round(n));
  if (n < 1e6) { const k = n / 1000; return (k < 10 ? k.toFixed(1).replace(/\.0$/, '') : String(Math.round(k))) + 'k'; }
  return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
}
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
