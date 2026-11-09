import 'server-only';
import { createHash } from 'node:crypto';
import type { ChatActor } from './chat-contracts.ts';
import { createBasicRagStore } from './basic-rag-store.ts';
import { createBasicRagChatService } from './basic-rag-chat-service.ts';
import { basicRagModel, createBasicRagCompletion } from './basic-rag-openrouter.ts';
import { readBasicRagProfile, type BasicRagProfile } from './basic-rag-profile.ts';
import { readLunaTestProfile } from './luna-test-profile.ts';
import { claimLunaTestBudget } from './luna-test-budget.ts';
import { createLunaRagCompletion, lunaRagModel, lunaRagReservationNanoUsd } from './luna-rag-openrouter.ts';
import { strictJson } from '../lightweight/client.ts';
import { createInsforgeAdapters } from '../retrieval/insforge-adapters.ts';
import { prepareProductContextSet } from '../retrieval/product-context-set.ts';
import { currentLightweightSession } from './lightweight-connection';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

// Request-local authority only: there is no cached or environment-only activation.
export function createBasicRagPolicy(options: {
  env: NodeJS.ProcessEnv; subject: string; requestOrigin: string; current(): Promise<boolean>;
  profile?: typeof readBasicRagProfile; fetcher?: typeof fetch;
  model?: string; requireFreeQuota?: boolean;
}) {
  let admitted: BasicRagProfile | null = null, admittedKey = '';
  let verified: { expiresAt: number; key: string | undefined; clerk: string | undefined; freePath: string | undefined; lunaPath: string | undefined; budgetPath: string | undefined; diskCurrent?: () => boolean } | null = null;
  const profile = options.profile ?? readBasicRagProfile, fetcher = options.fetcher ?? fetch;
  async function check(expected?: BasicRagProfile, expectedKey?: string) {
    try {
      const key = options.env.OPENROUTER_API_KEY;
      const clerk = options.env.CLERK_SECRET_KEY, freePath = options.env.PANDA_AGENT_BASIC_RAG_PROFILE_FILE,
        lunaPath = options.env.PANDA_AGENT_LUNA_PROFILE_FILE, budgetPath = options.env.PANDA_AGENT_LUNA_BUDGET_FILE;
      if (!key || (expectedKey !== undefined && key !== expectedKey)) return null;
      const first = await profile({ env: options.env, subject: options.subject, requestOrigin: options.requestOrigin });
      if (!first || (expected && first.binding !== expected.binding)) return null;
      const signal = AbortSignal.timeout(8000);
      const get = async (suffix: string) => {
        const response = await fetcher('https://openrouter.ai/api/v1' + suffix, {
          method: 'GET', headers: { Accept: 'application/json', Authorization: 'Bearer ' + key },
          redirect: 'error', cache: 'no-store', credentials: 'omit', signal,
        });
        if (!response.ok || response.redirected || !response.body || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw Error();
        const reader = response.body.getReader(), parts: Uint8Array[] = []; let size = 0;
        try {
          for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 1_000_000) throw Error(); parts.push(part.value); }
          if (signal.aborted) throw Error();
          return strictJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts)));
        } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
      };
      const [metadata, catalog] = await Promise.all([get('/key'), get('/models/user')]);
      const data = object(metadata) && object(metadata.data) ? metadata.data : null;
      const quota = data && object(data.free_model_daily_requests) ? data.free_model_daily_requests : null;
      if (!data || typeof data.workspace_id !== 'string' || !data.workspace_id || data.workspace_id.length > 512
        || createHash('sha256').update(data.workspace_id).digest('hex') !== first.workspaceSha256
        || (options.requireFreeQuota !== false && (!quota || !Number.isSafeInteger(quota.remaining) || (quota.remaining as number) < 1))
        || !object(catalog) || !Array.isArray(catalog.data) || catalog.data.length > 1000
        || !catalog.data.some(item => object(item) && item.id === (options.model ?? basicRagModel))) return null;
      if (!await options.current() || options.env.OPENROUTER_API_KEY !== key || options.env.CLERK_SECRET_KEY !== clerk
        || options.env.PANDA_AGENT_BASIC_RAG_PROFILE_FILE !== freePath || options.env.PANDA_AGENT_LUNA_PROFILE_FILE !== lunaPath
        || options.env.PANDA_AGENT_LUNA_BUDGET_FILE !== budgetPath || options.env.VERCEL !== undefined || options.env.VERCEL_ENV !== undefined
        || (first.dispatchCurrent && !first.dispatchCurrent())) return null;
      return { profile: first, key };
    } catch { return null; }
  }
  return {
    async enabled() {
      admitted = null; admittedKey = ''; verified = null;
      const result = await check();
      if (!result) return false;
      admitted = result.profile; admittedKey = result.key;
      verified = { expiresAt: Date.parse(result.profile.expiresAt), key: options.env.OPENROUTER_API_KEY, clerk: options.env.CLERK_SECRET_KEY,
        freePath: options.env.PANDA_AGENT_BASIC_RAG_PROFILE_FILE, lunaPath: options.env.PANDA_AGENT_LUNA_PROFILE_FILE, budgetPath: options.env.PANDA_AGENT_LUNA_BUDGET_FILE, diskCurrent: result.profile.dispatchCurrent };
      return true;
    },
    async current() {
      if (!admitted) return false;
      const result = await check(admitted, admittedKey);
      if (!result) { verified = null; return false; }
      verified = { expiresAt: Date.parse(result.profile.expiresAt), key: options.env.OPENROUTER_API_KEY, clerk: options.env.CLERK_SECRET_KEY,
        freePath: options.env.PANDA_AGENT_BASIC_RAG_PROFILE_FILE, lunaPath: options.env.PANDA_AGENT_LUNA_PROFILE_FILE, budgetPath: options.env.PANDA_AGENT_LUNA_BUDGET_FILE, diskCurrent: result.profile.dispatchCurrent };
      return true;
    },
    dispatchCurrent() {
      return !!admitted && !!verified && Number.isFinite(verified.expiresAt) && Date.now() < verified.expiresAt
        && options.env.OPENROUTER_API_KEY === admittedKey && options.env.OPENROUTER_API_KEY === verified.key
        && options.env.CLERK_SECRET_KEY === verified.clerk && options.env.PANDA_AGENT_BASIC_RAG_PROFILE_FILE === verified.freePath
        && options.env.PANDA_AGENT_LUNA_PROFILE_FILE === verified.lunaPath && options.env.PANDA_AGENT_LUNA_BUDGET_FILE === verified.budgetPath
        && options.env.VERCEL === undefined && options.env.VERCEL_ENV === undefined && (!verified.diskCurrent || verified.diskCurrent());
    },
    key() { return admittedKey; },
    binding() { return admitted?.binding ?? ''; },
  };
}

export function createLunaTestPolicy(options: { env: NodeJS.ProcessEnv; subject: string; requestOrigin: string; current(): Promise<boolean> }) {
  let budgetBinding = '';
  const policy = createBasicRagPolicy({ ...options, model: lunaRagModel, requireFreeQuota: false,
    profile: async () => {
      const found = await readLunaTestProfile(options);
      budgetBinding = found?.budgetBinding ?? '';
      return found ? { binding: found.binding, workspaceSha256: found.workspaceSha256, expiresAt: found.expiresAt, dispatchCurrent: found.dispatchCurrent } : null;
    },
  });
  return { ...policy, async claimBudget() {
    if (!budgetBinding || !policy.dispatchCurrent()) return false;
    return claimLunaTestBudget({ ...options, expectedBinding: budgetBinding, reservationNanoUsd: lunaRagReservationNanoUsd });
  } };
}

export function basicRagForActor(actor: ChatActor, request: Request) {
  const current = () => actor.sessionId ? currentLightweightSession(actor.subject, actor.sessionId) : Promise.resolve(false);
  const requestOrigin = new URL(request.url).origin;
  const luna = process.env.PANDA_AGENT_LUNA_PROFILE_FILE !== undefined;
  const lunaInput = { env: process.env, subject: actor.subject, requestOrigin };
  const lunaPolicy = luna ? createLunaTestPolicy({ ...lunaInput, current }) : null;
  const policy = lunaPolicy ?? createBasicRagPolicy({ ...lunaInput, current });
  return createBasicRagChatService({
    store: createBasicRagStore(actor, process.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY ?? ''),
    current,
    enabled: policy.enabled,
    ...(luna ? { usagePolicy: 'bounded_luna_test' as const } : {}),
    prepareContext: (question, signal) => prepareProductContextSet({
      actor: { subject: actor.subject }, question, client: actor.client, signal,
      authorizeCurrent: current,
      createAdapters: () => createInsforgeAdapters(actor.client, async () => { throw Error('Selection unavailable'); }),
    }),
    completion: claim => luna
      ? createLunaRagCompletion({ apiKey: policy.key(), policyCurrent: policy.current, dispatchCurrent: policy.dispatchCurrent, claim: async () => {
        if (!lunaPolicy || !await claim()) return false;
        return lunaPolicy.claimBudget();
      } })
      : createBasicRagCompletion({ apiKey: policy.key(), claim, policyCurrent: policy.current, dispatchCurrent: policy.dispatchCurrent }),
  });
}
