import 'server-only';

export function hostedStatusConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.PANDA_AGENT_HOSTED_TIMEOUT_PROFILE !== 'agent-150') return null;
  try {
    const endpoint = new URL(env.PANDA_AGENT_HOSTED_GATEWAY_URL ?? '');
    const roleArn = env.PANDA_AGENT_HOSTED_GATEWAY_ROLE_ARN ?? '';
    const serviceToken = env.PANDA_AGENT_HOSTED_GATEWAY_TOKEN ?? '';
    if (endpoint.protocol !== 'https:' || !/^[a-z0-9]{10}\.execute-api\.ap-south-1\.amazonaws\.com$/.test(endpoint.hostname) || endpoint.pathname !== '/agent/v1/turns' || endpoint.port || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !/^arn:aws:iam::\d{12}:role\/[A-Za-z0-9+=,.@_/-]{1,512}$/.test(roleArn) || !/^[a-f0-9]{64}$/.test(serviceToken)) return null;
    return Object.freeze({ endpoint: endpoint.href, roleArn, serviceToken,
      streaming: env.PANDA_AGENT_HOSTED_STREAMING_ENABLED === 'true',
      rag: env.PANDA_AGENT_HOSTED_RAG_ENABLED === 'true' });
  } catch { return null; }
}

export function hostedBffConfig(env: NodeJS.ProcessEnv = process.env) {
  return env.PANDA_AGENT_HOSTED_GATEWAY_ENABLED === 'true' ? hostedStatusConfig(env) : null;
}

export const hostedExecutionConfigured = () => hostedBffConfig() !== null;
