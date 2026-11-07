import 'server-only';
import { createHash } from 'node:crypto';
import { readPrivateLocalLeaseConfig, localPlaygroundConfigCurrent, type LocalPlaygroundConfig } from '../control-room/playground-local-config.ts';

export function hostedLocalSelected(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === 'development' && env.VERCEL === undefined && env.VERCEL_ENV === undefined && env.PANDA_AGENT_HOSTED_TRANSPORT === 'local-ssm-v1';
}
export function hostedLocalRequested(env: NodeJS.ProcessEnv = process.env) {
  return hostedLocalSelected(env) && env.PANDA_AGENT_HOSTED_GATEWAY_ENABLED === 'true';
}
export async function hostedLocalConfig(env: NodeJS.ProcessEnv = process.env): Promise<LocalPlaygroundConfig | null> {
  if (!hostedLocalSelected(env)) return null;
  const value=await readPrivateLocalLeaseConfig(env,env.PANDA_AGENT_HOSTED_LOCAL_CONFIG);
  return value && env.PANDA_AGENT_ACCEPTANCE_ORIGIN==='http://localhost:3000' && env.PANDA_AGENT_ACCEPTANCE_EXPIRES_AT===value.expiresAt && env.PANDA_AGENT_PILOT_OWNER_SHA256===value.ownerSubjectSha256 ? value : null;
}
export function hostedLocalOwner(config: LocalPlaygroundConfig, subject: string): boolean {
  return localPlaygroundConfigCurrent(config) && typeof subject === 'string' && createHash('sha256').update(subject).digest('hex') === config.ownerSubjectSha256;
}

export function hostedStatusConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.PANDA_AGENT_HOSTED_TRANSPORT !== undefined && env.PANDA_AGENT_HOSTED_TRANSPORT !== 'aws') return null;
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

export const hostedExecutionConfigured = () => hostedBffConfig() !== null || hostedLocalRequested();
export async function hostedReadinessConfiguration(subject:string, env:NodeJS.ProcessEnv=process.env, load=hostedLocalConfig) {
  const config=hostedBffConfig(env);
  if(!hostedLocalSelected(env))return {enabled:!!config,rag:config?.rag===true,observable:!!hostedStatusConfig(env)};
  const local=await load(env),valid=!!local&&hostedLocalOwner(local,subject);
  const enabled=valid&&hostedLocalRequested(env);
  return {enabled,rag:enabled&&env.PANDA_AGENT_HOSTED_RAG_ENABLED==='true',observable:valid};
}
