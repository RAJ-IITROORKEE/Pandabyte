import { approvedPlaygroundQuestions } from './playground-intent.ts';
import { fastHostedModel, hostedModelSelection, type HostedModelId } from '../hosted-model.ts';

type Admission = { allowed: true } | { allowed: false; status: 401 | 403 | 503 };
type Flags = NodeJS.ProcessEnv;
export type PlaygroundCapabilities = {
  model: 'openai/gpt-4o-mini' | 'xingchen-agi/xing4.0-29b-a4b:free' | 'openai/gpt-6-luna' | HostedModelId;
  connection: 'not_configured' | 'configured_unverified';
  transport: 'unconfigured' | 'hosted' | 'local';
  profile: 'mini-two-case-v1' | 'product-playground-v1' | 'basic-rag-v1' | 'luna-rag-test-v1' | 'luna-rag-prototype-v1' | 'hosted-rag-v1' | null;
  approvedQuestions: string[];
  remainingNanoUsd?: number;
  expiresAt?: string;
};

export function hostedRagPlaygroundCapabilities(flags: Flags, verified: boolean): PlaygroundCapabilities {
  const selected = flags.VERCEL === '1' ? hostedModelSelection({ PANDA_AGENT_HOSTED_MODEL: flags.PANDA_AGENT_HOSTED_MODEL }) : null;
  const ready = verified && selected !== null;
  return { model: selected?.id ?? 'openai/gpt-6-luna', connection: ready ? 'configured_unverified' : 'not_configured', transport: ready ? 'hosted' : 'unconfigured', profile: ready ? 'hosted-rag-v1' : null, approvedQuestions: [] };
}

export function parsePlaygroundCapabilities(value: unknown): PlaygroundCapabilities | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const c = value as Record<string, unknown>;
  if (!['openai/gpt-4o-mini', 'xingchen-agi/xing4.0-29b-a4b:free', 'openai/gpt-6-luna', fastHostedModel.id].includes(String(c.model)) || !['not_configured', 'configured_unverified'].includes(String(c.connection)) || !['unconfigured', 'hosted', 'local'].includes(String(c.transport)) || ![null, 'mini-two-case-v1', 'product-playground-v1', 'basic-rag-v1', 'luna-rag-test-v1', 'luna-rag-prototype-v1', 'hosted-rag-v1'].includes(c.profile as string | null) || !Array.isArray(c.approvedQuestions) || c.approvedQuestions.length > 2 || c.approvedQuestions.some(question => typeof question !== 'string' || question.length > 2000)) return null;
  if (c.remainingNanoUsd !== undefined && (!Number.isSafeInteger(c.remainingNanoUsd) || (c.remainingNanoUsd as number) < 0 || (c.remainingNanoUsd as number) > 1000000000)) return null;
  if (c.expiresAt !== undefined && (typeof c.expiresAt !== 'string' || !Number.isFinite(Date.parse(c.expiresAt)))) return null;
  if (c.profile === 'luna-rag-prototype-v1' && (c.remainingNanoUsd === undefined || c.expiresAt === undefined)) return null;
  if (c.model === fastHostedModel.id && (c.remainingNanoUsd !== undefined || c.expiresAt !== undefined || c.approvedQuestions.length !== 0 || !(c.profile === 'hosted-rag-v1' && c.transport === 'hosted' && c.connection === 'configured_unverified' || c.profile === null && c.transport === 'unconfigured' && c.connection === 'not_configured'))) return null;
  return c as PlaygroundCapabilities;
}

export function hostedPlaygroundEnabled(flags: Flags): boolean {
  return flags.VERCEL === '1' && (flags.PANDA_AGENT_PLAYGROUND_TRANSPORT === undefined || flags.PANDA_AGENT_PLAYGROUND_TRANSPORT === 'hosted') && playgroundFlagsEnabled(flags);
}

export function playgroundFlagsEnabled(flags: Flags): boolean {
  return flags.PANDA_AGENT_PLAYGROUND_GATEWAY_ENABLED === 'true' && flags.PANDA_AGENT_PLAYGROUND_GATEWAY_PROTOCOL === 'v3-context-digest' && (flags.PANDA_AGENT_PLAYGROUND_PROFILE === 'mini-two-case-v1' || flags.PANDA_AGENT_PLAYGROUND_PROFILE === 'product-playground-v1');
}

export function localPlaygroundEnabled(flags: Flags): boolean {
  // The product-only receiver does not admit the local acceptance marker.
  return flags.NODE_ENV === 'development' && !flags.VERCEL && flags.PANDA_AGENT_PLAYGROUND_TRANSPORT === 'local-ssm-v3' && flags.PANDA_AGENT_PLAYGROUND_PROFILE === 'mini-two-case-v1' && playgroundFlagsEnabled(flags);
}

export function playgroundCapabilities(flags: Flags, hostedConfigValid: boolean, localConfigValid = false): PlaygroundCapabilities {
  const transport = hostedPlaygroundEnabled(flags) && hostedConfigValid === true ? 'hosted' : localPlaygroundEnabled(flags) && localConfigValid === true ? 'local' : 'unconfigured';
  const configured = transport !== 'unconfigured';
  return { model:'openai/gpt-4o-mini', connection:configured ? 'configured_unverified' : 'not_configured', transport, profile:configured ? flags.PANDA_AGENT_PLAYGROUND_PROFILE as 'mini-two-case-v1' | 'product-playground-v1' : null, approvedQuestions:flags.PANDA_AGENT_PLAYGROUND_PROFILE === 'product-playground-v1' ? [] : approvedPlaygroundQuestions() };
}

export function basicRagPlaygroundCapabilities(verified: boolean, mode: 'free' | 'luna' | 'prototype' = 'free', allowance?: {remainingNanoUsd:number;expiresAt:string}): PlaygroundCapabilities {
  return { model: mode === 'free' ? 'xingchen-agi/xing4.0-29b-a4b:free' : 'openai/gpt-6-luna', connection: verified ? 'configured_unverified' : 'not_configured', transport: verified ? 'local' : 'unconfigured', profile: verified ? mode === 'prototype' ? 'luna-rag-prototype-v1' : mode === 'luna' ? 'luna-rag-test-v1' : 'basic-rag-v1' : null, approvedQuestions: [], ...(mode === 'prototype' && allowance ? allowance : {}) };
}

export function createPlaygroundCapabilitiesHandler(authorize: () => Promise<Admission>, getCapabilities: (request?: Request) => PlaygroundCapabilities | Promise<PlaygroundCapabilities>) {
  const headers = { 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff' };
  return async (request?: Request): Promise<Response> => {
    try {
      const access = await authorize();
      if (!access.allowed) return Response.json({ error:{ code:'access_unavailable' } }, { status:access.status, headers });
      return Response.json(await getCapabilities(request), { headers });
    } catch { return Response.json({ error:{ code:'unavailable' } }, { status:503, headers }); }
  };
}
