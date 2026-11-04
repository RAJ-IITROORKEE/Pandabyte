import 'server-only';
import { hostedStatusConfig } from '../server/hosted-bff-config.ts';
import { hostedPlaygroundEnabled, localPlaygroundEnabled } from './playground-capabilities.ts';
import { readLocalPlaygroundConfig, localPlaygroundConfigCurrent, type LocalPlaygroundConfig } from './playground-local-config.ts';
import { createHash } from 'node:crypto';

export type PlaygroundConfiguration = { transport:'hosted'; profile:'mini-two-case-v1' | 'product-playground-v1'; config:NonNullable<ReturnType<typeof hostedStatusConfig>> } | { transport:'local'; profile:'mini-two-case-v1' | 'product-playground-v1'; config:LocalPlaygroundConfig };

export async function resolvePlaygroundConfiguration(env:NodeJS.ProcessEnv = process.env, readLocal = readLocalPlaygroundConfig):Promise<PlaygroundConfiguration | null> {
  if (hostedPlaygroundEnabled(env)) {
    const config = hostedStatusConfig(env);
    return config ? { transport:'hosted', profile:env.PANDA_AGENT_PLAYGROUND_PROFILE as 'mini-two-case-v1' | 'product-playground-v1', config } : null;
  }
  if (!localPlaygroundEnabled(env)) return null;
  const config = await readLocal(env);
  return config && localPlaygroundConfigCurrent(config) ? { transport:'local', profile:env.PANDA_AGENT_PLAYGROUND_PROFILE as 'mini-two-case-v1' | 'product-playground-v1', config } : null;
}

export function localPlaygroundOwner(config:LocalPlaygroundConfig, subject:string):boolean {
  return localPlaygroundConfigCurrent(config) && typeof subject === 'string' && createHash('sha256').update(subject).digest('hex') === config.ownerSubjectSha256;
}

export function sameLocalPlaygroundConfiguration(a:LocalPlaygroundConfig, b:LocalPlaygroundConfig):boolean {
  return localPlaygroundConfigCurrent(a) && localPlaygroundConfigCurrent(b) && a.expiresAt === b.expiresAt && a.ownerSubjectSha256 === b.ownerSubjectSha256 && a.serviceToken === b.serviceToken && a.caCertificate === b.caCertificate;
}
