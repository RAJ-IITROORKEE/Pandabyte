import { approvedPlaygroundQuestions } from './playground-intent.ts';

type Admission = { allowed: true } | { allowed: false; status: 401 | 403 | 503 };
type Flags = NodeJS.ProcessEnv;
export type PlaygroundCapabilities = {
  model: 'openai/gpt-4o-mini';
  connection: 'not_configured' | 'configured_unverified';
  transport: 'unconfigured' | 'hosted' | 'local';
  profile: 'mini-two-case-v1' | null;
  approvedQuestions: string[];
};

export function hostedPlaygroundEnabled(flags: Flags): boolean {
  return flags.VERCEL === '1' && (flags.PANDA_AGENT_PLAYGROUND_TRANSPORT === undefined || flags.PANDA_AGENT_PLAYGROUND_TRANSPORT === 'hosted') && playgroundFlagsEnabled(flags);
}

export function playgroundFlagsEnabled(flags: Flags): boolean {
  return flags.PANDA_AGENT_PLAYGROUND_GATEWAY_ENABLED === 'true' && flags.PANDA_AGENT_PLAYGROUND_GATEWAY_PROTOCOL === 'v3-context-digest' && flags.PANDA_AGENT_PLAYGROUND_PROFILE === 'mini-two-case-v1';
}

export function localPlaygroundEnabled(flags: Flags): boolean {
  return flags.NODE_ENV === 'development' && !flags.VERCEL && flags.PANDA_AGENT_PLAYGROUND_TRANSPORT === 'local-ssm-v3' && playgroundFlagsEnabled(flags);
}

export function playgroundCapabilities(flags: Flags, hostedConfigValid: boolean, localConfigValid = false): PlaygroundCapabilities {
  const transport = hostedPlaygroundEnabled(flags) && hostedConfigValid === true ? 'hosted' : localPlaygroundEnabled(flags) && localConfigValid === true ? 'local' : 'unconfigured';
  const configured = transport !== 'unconfigured';
  return { model:'openai/gpt-4o-mini', connection:configured ? 'configured_unverified' : 'not_configured', transport, profile:configured ? 'mini-two-case-v1' : null, approvedQuestions:approvedPlaygroundQuestions() };
}

export function createPlaygroundCapabilitiesHandler(authorize: () => Promise<Admission>, getCapabilities: () => PlaygroundCapabilities | Promise<PlaygroundCapabilities>) {
  const headers = { 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff' };
  return async (): Promise<Response> => {
    try {
      const access = await authorize();
      if (!access.allowed) return Response.json({ error:{ code:'access_unavailable' } }, { status:access.status, headers });
      return Response.json(await getCapabilities(), { headers });
    } catch { return Response.json({ error:{ code:'unavailable' } }, { status:503, headers }); }
  };
}
