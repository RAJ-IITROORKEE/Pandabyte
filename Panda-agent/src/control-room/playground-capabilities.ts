import { approvedPlaygroundQuestions } from './playground-intent.ts';

type Admission = { allowed: true } | { allowed: false; status: 401 | 403 | 503 };
type Flags = NodeJS.ProcessEnv;
export type PlaygroundCapabilities = {
  model: 'openai/gpt-4o-mini' | 'xingchen-agi/xing4.0-29b-a4b:free' | 'openai/gpt-6-luna';
  connection: 'not_configured' | 'configured_unverified';
  transport: 'unconfigured' | 'hosted' | 'local';
  profile: 'mini-two-case-v1' | 'product-playground-v1' | 'basic-rag-v1' | 'luna-rag-test-v1' | null;
  approvedQuestions: string[];
};

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

export function basicRagPlaygroundCapabilities(verified: boolean, mode: 'free' | 'luna' = 'free'): PlaygroundCapabilities {
  return { model: mode === 'luna' ? 'openai/gpt-6-luna' : 'xingchen-agi/xing4.0-29b-a4b:free', connection: verified ? 'configured_unverified' : 'not_configured', transport: verified ? 'local' : 'unconfigured', profile: verified ? mode === 'luna' ? 'luna-rag-test-v1' : 'basic-rag-v1' : null, approvedQuestions: [] };
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
