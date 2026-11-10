import 'server-only';
import { createHash, createHmac } from 'node:crypto';
import { strictJson } from '../lightweight/client.ts';
import { BasicRagProviderError } from './basic-rag-openrouter.ts';
import { uuid, type ChatActor } from './chat-contracts.ts';
import { lunaRagModel, lunaRagProvider } from './luna-rag-openrouter.ts';

const stableOrigin = 'https://pandabyte-iot.vercel.app';
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const hex = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const fields = (value: unknown, keys: string[]): value is Record<string, unknown> =>
  object(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
type Context = { env: NodeJS.ProcessEnv; subject: string; requestOrigin: string };
type Claim = { request: string; surface: 'playground' | 'chat'; fingerprint: string };

/** Production profile attests to the owner's provider privacy settings. Provider routing is pinned by the transport. */
export function readHostedRagProfile({ env, subject, requestOrigin }: Context) {
  const configKeys = ['VERCEL', 'VERCEL_ENV', 'NODE_ENV', 'VERCEL_URL', 'PANDA_AGENT_HOSTED_GROUNDED_ENABLED',
    'PANDA_AGENT_HOSTED_GROUNDED_PROFILE', 'PANDA_AGENT_OPENROUTER_OBSERVABILITY', 'OPENROUTER_API_KEY',
    'PANDA_AGENT_LIGHTWEIGHT_DB_KEY', 'CLERK_SECRET_KEY', 'PANDA_AGENT_INSFORGE_BASE_URL', 'PANDA_AGENT_CLERK_JWT_TEMPLATE'];
  const snapshot = configKeys.map(key => env[key]);
  const key = env.OPENROUTER_API_KEY, raw = env.PANDA_AGENT_HOSTED_GROUNDED_PROFILE;
  const deployment = env.VERCEL_URL;
  const deploymentOrigin = deployment && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/.test(deployment)
    ? 'https://' + deployment : null;
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'production' || env.NODE_ENV !== 'production'
    || env.PANDA_AGENT_HOSTED_GROUNDED_ENABLED !== 'true' || env.PANDA_AGENT_OPENROUTER_OBSERVABILITY !== 'langsmith_metadata_only'
    || typeof requestOrigin !== 'string' || (requestOrigin !== stableOrigin && requestOrigin !== deploymentOrigin) || !raw || Buffer.byteLength(raw) > 4096
    || typeof subject !== 'string' || !subject.trim() || subject.length > 512 || !subject.isWellFormed()
    || !key || !/^sk-or-v1-[a-f0-9]{64}$/i.test(key) || !hex(env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY)) return null;
  try {
    const profile = strictJson(raw);
    if (!fields(profile, ['version', 'origin', 'ownerSubjectSha256', 'keySha256', 'workspaceSha256', 'privacy'])
      || profile.version !== 1 || profile.origin !== stableOrigin || profile.ownerSubjectSha256 !== hash(subject)
      || profile.keySha256 !== hash(key) || !hex(profile.workspaceSha256)
      || !fields(profile.privacy, ['logging', 'traces', 'dataDiscount', 'publicPrompts'])
      || profile.privacy.logging !== false || profile.privacy.traces !== true
      || profile.privacy.dataDiscount !== false || profile.privacy.publicPrompts !== false) return null;
    return Object.freeze({
      binding: hash(JSON.stringify(['hosted-grounded-v1', hash(raw), requestOrigin, lunaRagModel, lunaRagProvider])),
      workspaceSha256: profile.workspaceSha256,
      dispatchCurrent: () => configKeys.every((name, index) => env[name] === snapshot[index]),
    });
  } catch { return null; }
}

async function keyWorkspaceMatches(key: string, workspace: string, fetcher: typeof fetch): Promise<boolean> {
  const signal = AbortSignal.timeout(8000);
  const response = await fetcher('https://openrouter.ai/api/v1/key', { method: 'GET', redirect: 'error', credentials: 'omit',
    cache: 'no-store', signal, headers: { Accept: 'application/json', Authorization: 'Bearer ' + key } });
  if (!response.body) return false;
  const reader = response.body.getReader();
  try {
    if (!response.ok || response.redirected || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) return false;
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const {done, value} = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65536) return false;
      chunks.push(value);
    }
    const result = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    return object(result) && object(result.data) && typeof result.data.workspace_id === 'string'
      && result.data.workspace_id.length > 0 && result.data.workspace_id.length <= 512 && hash(result.data.workspace_id) === workspace;
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function createHostedRagPolicy(options: Context & { actor: ChatActor; current(): Promise<boolean>; fetcher?: typeof fetch }) {
  let admitted: ReturnType<typeof readHostedRagProfile> = null;
  let used = false;
  const dispatchCurrent = () => options.actor.subject === options.subject && admitted?.dispatchCurrent() === true;
  async function current() {
    try {
      if (dispatchCurrent() && await options.current() && dispatchCurrent()) return true;
    } catch { /* An unavailable session cannot authorize a send. */ }
    admitted = null;
    return false;
  }
  return {
    async enabled() {
      admitted = null;
      const profile = readHostedRagProfile(options);
      if (!profile || options.actor.subject !== options.subject) return false;
      try {
        if (!await options.current() || !profile.dispatchCurrent()) return false;
        if (!await keyWorkspaceMatches(options.env.OPENROUTER_API_KEY!, profile.workspaceSha256, options.fetcher ?? fetch)
          || !profile.dispatchCurrent() || !await options.current() || !profile.dispatchCurrent()) return false;
        admitted = profile;
        return true;
      } catch { return false; }
    },
    current, dispatchCurrent,
    key: () => dispatchCurrent() ? options.env.OPENROUTER_API_KEY! : '',
    binding: () => dispatchCurrent() ? admitted!.binding : '',
    async claimRequest(input: Claim): Promise<boolean> {
      if (!fields(input, ['request', 'surface', 'fingerprint']) || !uuid(input.request) || input.request !== input.request.toLowerCase()
        || !['chat', 'playground'].includes(input.surface) || !hex(input.fingerprint)) throw new BasicRagProviderError('not_admitted');
      if (!await current()) throw new BasicRagProviderError('not_admitted');
      if (used) throw new BasicRagProviderError('outcome_unknown');
      used = true;
      const p_payload = JSON.stringify({ v: 1, subject: options.subject, exp: Math.floor(Date.now() / 1000) + 60,
        request: input.request, surface: input.surface, fingerprint: input.fingerprint });
      const p_mac = createHmac('sha256', Buffer.from(options.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY!, 'hex'))
        .update('panda-grounded-request-db-v1\n' + p_payload).digest('hex');
      try {
        const result = await options.actor.client.database.rpc('panda_agent_grounded_request_claim', { p_payload, p_mac });
        if (!result.error && fields(result.data, ['execute']) && result.data.execute === true && dispatchCurrent()) return true;
      } catch { /* A lost claim reply cannot authorize a second attempt. */ }
      throw new BasicRagProviderError('outcome_unknown');
    },
  };
}
