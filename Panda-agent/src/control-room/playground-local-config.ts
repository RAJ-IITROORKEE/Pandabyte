import 'server-only';
import { open, realpath, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { inspectLocalWindowsPrivacy } from './playground-local-windows.ts';

export type LocalPlaygroundConfig = Readonly<{ version:1; expiresAt:string; ownerSubjectSha256:string; serviceToken:string; caCertificate:string }>;
const hex = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const canonical = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value.replace('Z','.000Z');
const certificate = (value: unknown): value is string => typeof value === 'string' && value.length <= 16000 && /^-----BEGIN CERTIFICATE-----\r?\n(?:[A-Za-z0-9+/=]+\r?\n)+-----END CERTIFICATE-----\r?\n?$/.test(value);
export function localPlaygroundConfigCurrent(config: LocalPlaygroundConfig, now = Date.now()): boolean {
  if (!config || !canonical(config.expiresAt) || !Number.isSafeInteger(now)) return false;
  const remaining = Date.parse(config.expiresAt) - now;
  return remaining > 0 && remaining <= 7200000;
}
export async function readLocalPlaygroundConfig(env: NodeJS.ProcessEnv = process.env, now = Date.now, inspectWindowsPrivacy = inspectLocalWindowsPrivacy): Promise<LocalPlaygroundConfig | null> {
  if (env.NODE_ENV !== 'development' || env.VERCEL !== undefined || env.VERCEL_ENV !== undefined || env.PANDA_AGENT_PLAYGROUND_GATEWAY_ENABLED !== 'true' || env.PANDA_AGENT_PLAYGROUND_GATEWAY_PROTOCOL !== 'v3-context-digest' || env.PANDA_AGENT_PLAYGROUND_PROFILE !== 'mini-two-case-v1' || env.PANDA_AGENT_PLAYGROUND_TRANSPORT !== 'local-ssm-v3') return null;
  return readPrivateLocalLeaseConfig(env, env.PANDA_AGENT_PLAYGROUND_LOCAL_CONFIG, now, inspectWindowsPrivacy);
}

/** Shared private lease reader. Each caller must independently enforce its feature/protocol opt-in. */
export async function readPrivateLocalLeaseConfig(env: NodeJS.ProcessEnv, filename: string | undefined, now = Date.now, inspectWindowsPrivacy = inspectLocalWindowsPrivacy): Promise<LocalPlaygroundConfig | null> {
  if (env.NODE_ENV !== 'development' || env.VERCEL !== undefined || env.VERCEL_ENV !== undefined) return null;
  if (!filename || !path.isAbsolute(filename)) return null;
  try {
    const root = await realpath(path.resolve(process.cwd(), 'Panda-agent/artifacts'));
    const normalized = path.resolve(filename), resolved = await realpath(normalized);
    const comparable = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
    const relative = path.relative(root, resolved);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || comparable(normalized) !== comparable(resolved)) return null;
    const before = await lstat(normalized);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > 32768 || (process.platform !== 'win32' && ((before.mode & 0o077) !== 0 || (typeof process.getuid === 'function' && before.uid !== process.getuid())))) return null;
    if (process.platform === 'win32' && !await inspectWindowsPrivacy(normalized)) return null;
    const file = await open(normalized, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino || stat.nlink !== 1 || stat.size > 32768 || (process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || stat.uid !== before.uid))) return null;
      const bytes = await file.readFile(); if (bytes.length > 32768) return null;
      const after = await file.stat(), current = await lstat(normalized);
      if (!current.isFile() || current.isSymbolicLink() || current.dev !== stat.dev || current.ino !== stat.ino || current.nlink !== 1 || after.dev !== stat.dev || after.ino !== stat.ino || after.nlink !== 1 || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || (process.platform !== 'win32' && ((current.mode & 0o077) !== 0 || current.uid !== stat.uid || after.uid !== stat.uid))) return null;
      if (process.platform === 'win32' && !await inspectWindowsPrivacy(normalized)) return null;
      const finalPath = await lstat(normalized), finalHandle = await file.stat();
      if (!finalPath.isFile() || finalPath.isSymbolicLink() || finalPath.dev !== stat.dev || finalPath.ino !== stat.ino || finalPath.nlink !== 1 || finalHandle.dev !== stat.dev || finalHandle.ino !== stat.ino || finalHandle.nlink !== 1 || finalHandle.size !== stat.size || finalHandle.mtimeMs !== stat.mtimeMs || finalHandle.ctimeMs !== stat.ctimeMs) return null;
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal:true }).decode(bytes));
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'caCertificate,expiresAt,ownerSubjectSha256,serviceToken,version') return null;
      const v = value as Record<string, unknown>;
      if (v.version !== 1 || !canonical(v.expiresAt) || !hex(v.ownerSubjectSha256) || !hex(v.serviceToken) || !certificate(v.caCertificate)) return null;
      const config: LocalPlaygroundConfig = Object.freeze({version:1,expiresAt:v.expiresAt,ownerSubjectSha256:v.ownerSubjectSha256,serviceToken:v.serviceToken,caCertificate:v.caCertificate});
      return localPlaygroundConfigCurrent(config,now()) ? config : null;
    } finally { await file.close(); }
  } catch { return null; }
}

