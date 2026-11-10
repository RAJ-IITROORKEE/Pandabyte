import 'server-only';
import { createHash } from 'node:crypto';
import type { ChatActor } from './chat-contracts.ts';
import { createBasicRagStore } from './basic-rag-store.ts';
import { createBasicRagChatService } from './basic-rag-chat-service.ts';
import { BasicRagProviderError, basicRagModel, createBasicRagCompletion } from './basic-rag-openrouter.ts';
import { readBasicRagProfile, type BasicRagProfile } from './basic-rag-profile.ts';
import { readLunaTestProfile } from './luna-test-profile.ts';
import { readLunaPrototypeProfile } from './luna-prototype-profile.ts';
import { createPrototypeRagBudget, type PrototypeRagBudgetStatus } from './prototype-rag-budget.ts';
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
  model?: string; requireFreeQuota?: boolean; localAdmissionOnly?: boolean;
}) {
  let admitted: BasicRagProfile | null = null, admittedKey = '';
  let verified: { expiresAt: number; key: string | undefined; clerk: string | undefined; freePath: string | undefined; lunaPath: string | undefined; budgetPath: string | undefined; prototypePath: string | undefined; diskCurrent?: () => boolean } | null = null;
  const profile = options.profile ?? readBasicRagProfile, fetcher = options.fetcher ?? fetch;
  async function check(expected?: BasicRagProfile, expectedKey?: string) {
    try {
      const key = options.env.OPENROUTER_API_KEY;
      const clerk = options.env.CLERK_SECRET_KEY, freePath = options.env.PANDA_AGENT_BASIC_RAG_PROFILE_FILE,
        lunaPath = options.env.PANDA_AGENT_LUNA_PROFILE_FILE, budgetPath = options.env.PANDA_AGENT_LUNA_BUDGET_FILE,
        prototypePath = options.env.PANDA_AGENT_LUNA_PROTOTYPE_PROFILE_FILE;
      if (!key || (expectedKey !== undefined && key !== expectedKey)) return null;
      const first = await profile({ env: options.env, subject: options.subject, requestOrigin: options.requestOrigin });
      if (!first || (expected && first.binding !== expected.binding)) return null;
      const unchanged = () => options.env.OPENROUTER_API_KEY === key && options.env.CLERK_SECRET_KEY === clerk
        && options.env.PANDA_AGENT_BASIC_RAG_PROFILE_FILE === freePath && options.env.PANDA_AGENT_LUNA_PROFILE_FILE === lunaPath
        && options.env.PANDA_AGENT_LUNA_BUDGET_FILE === budgetPath && options.env.PANDA_AGENT_LUNA_PROTOTYPE_PROFILE_FILE === prototypePath
        && options.env.VERCEL === undefined && options.env.VERCEL_ENV === undefined && (!first.dispatchCurrent || first.dispatchCurrent());
      if (options.localAdmissionOnly && !expected) return await options.current() && unchanged() ? { profile: first, key } : null;
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
      const [metadata, catalog, actorCurrent] = await Promise.all([get('/key'), get('/models/user'), options.current()]);
      const data = object(metadata) && object(metadata.data) ? metadata.data : null;
      const quota = data && object(data.free_model_daily_requests) ? data.free_model_daily_requests : null;
      if (!data || typeof data.workspace_id !== 'string' || !data.workspace_id || data.workspace_id.length > 512
        || createHash('sha256').update(data.workspace_id).digest('hex') !== first.workspaceSha256
        || (options.requireFreeQuota !== false && (!quota || !Number.isSafeInteger(quota.remaining) || (quota.remaining as number) < 1))
        || !object(catalog) || !Array.isArray(catalog.data) || catalog.data.length > 1000
        || !catalog.data.some(item => object(item) && item.id === (options.model ?? basicRagModel))) return null;
      if (!actorCurrent || !unchanged()) return null;
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
        freePath: options.env.PANDA_AGENT_BASIC_RAG_PROFILE_FILE, lunaPath: options.env.PANDA_AGENT_LUNA_PROFILE_FILE, budgetPath: options.env.PANDA_AGENT_LUNA_BUDGET_FILE, prototypePath: options.env.PANDA_AGENT_LUNA_PROTOTYPE_PROFILE_FILE, diskCurrent: result.profile.dispatchCurrent };
      return true;
    },
    async current() {
      if (!admitted) return false;
      const result = await check(admitted, admittedKey);
      if (!result) { verified = null; return false; }
      verified = { expiresAt: Date.parse(result.profile.expiresAt), key: options.env.OPENROUTER_API_KEY, clerk: options.env.CLERK_SECRET_KEY,
        freePath: options.env.PANDA_AGENT_BASIC_RAG_PROFILE_FILE, lunaPath: options.env.PANDA_AGENT_LUNA_PROFILE_FILE, budgetPath: options.env.PANDA_AGENT_LUNA_BUDGET_FILE, prototypePath: options.env.PANDA_AGENT_LUNA_PROTOTYPE_PROFILE_FILE, diskCurrent: result.profile.dispatchCurrent };
      return true;
    },
    dispatchCurrent() {
      return !!admitted && !!verified && Number.isFinite(verified.expiresAt) && Date.now() < verified.expiresAt
        && options.env.OPENROUTER_API_KEY === admittedKey && options.env.OPENROUTER_API_KEY === verified.key
        && options.env.CLERK_SECRET_KEY === verified.clerk && options.env.PANDA_AGENT_BASIC_RAG_PROFILE_FILE === verified.freePath
        && options.env.PANDA_AGENT_LUNA_PROFILE_FILE === verified.lunaPath && options.env.PANDA_AGENT_LUNA_BUDGET_FILE === verified.budgetPath
        && options.env.PANDA_AGENT_LUNA_PROTOTYPE_PROFILE_FILE === verified.prototypePath
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

export type PrototypeRagReservation = { request: string; surface: 'chat' | 'playground' | 'diagnostic'; fingerprint: string };
export function createLunaPrototypePolicy(options: {
  env: NodeJS.ProcessEnv; subject: string; requestOrigin: string; actor: ChatActor; current(): Promise<boolean>;
  profile?: typeof readLunaPrototypeProfile; budget?: typeof createPrototypeRagBudget; fetcher?: typeof fetch;
}) {
  let budget: ReturnType<typeof createPrototypeRagBudget> | null = null;
  let allowance: PrototypeRagBudgetStatus | null = null, expiresAt: string | null = null;
  let admitted = false, claimUsed = false;
  const policy = createBasicRagPolicy({ ...options, model: lunaRagModel, requireFreeQuota: false, localAdmissionOnly: true,
    profile: async () => {
      if (options.actor.subject !== options.subject) return null;
      const found = await (options.profile ?? readLunaPrototypeProfile)(options);
      if (!found) { budget = null; allowance = null; expiresAt = null; return null; }
      const key = options.env.OPENROUTER_API_KEY ?? '';
      const store = (options.budget ?? createPrototypeRagBudget)({ actor: options.actor,
        key: options.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY ?? '', budgetId: found.budgetId,
        keySha256: createHash('sha256').update(key).digest('hex'), workspaceSha256: found.workspaceSha256 });
      const state = await store.status();
      allowance = state; expiresAt = found.expiresAt;
      if (!state.enabled || (!admitted && state.remainingNanoUsd < lunaRagReservationNanoUsd)) { budget = null; return null; }
      budget = store;
      return found;
    },
  });
  return { ...policy,
    async enabled() { admitted = false; admitted = await policy.enabled(); return admitted; },
    allowance: () => allowance,
    expiresAt: () => expiresAt,
    async claimBudget(input: PrototypeRagReservation) {
      if (!admitted || !budget || !policy.dispatchCurrent()) return false;
      if (claimUsed) throw new BasicRagProviderError('outcome_unknown');
      claimUsed = true;
      // A lost reply or replay cannot authorize another POST, even if its earlier outcome is unknown.
      if (!await budget.reserve(input)) throw new BasicRagProviderError('outcome_unknown');
      return true;
    },
  };
}

export function basicRagForActor(actor: ChatActor, request: Request) {
  const current = () => actor.sessionId ? currentLightweightSession(actor.subject, actor.sessionId) : Promise.resolve(false);
  const requestOrigin = new URL(request.url).origin;
  const prototype = process.env.PANDA_AGENT_LUNA_PROTOTYPE_PROFILE_FILE !== undefined;
  const luna = prototype || process.env.PANDA_AGENT_LUNA_PROFILE_FILE !== undefined;
  const lunaInput = { env: process.env, subject: actor.subject, requestOrigin };
  const prototypePolicy = prototype ? createLunaPrototypePolicy({ ...lunaInput, actor, current }) : null;
  const lunaPolicy = !prototype && luna ? createLunaTestPolicy({ ...lunaInput, current }) : null;
  const policy = prototypePolicy ?? lunaPolicy ?? createBasicRagPolicy({ ...lunaInput, current });
  return createBasicRagChatService({
    store: createBasicRagStore(actor, process.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY ?? ''),
    current,
    enabled: policy.enabled,
    ...(luna ? { usagePolicy: 'bounded_luna_test' as const } : {}),
    prepareContext: (question, signal, authorizeCurrent) => prepareProductContextSet({
      actor: { subject: actor.subject }, question, client: actor.client, signal,
      authorizeCurrent,
      createAdapters: () => createInsforgeAdapters(actor.client, async () => { throw Error('Selection unavailable'); }),
    }),
    completion: (claim, requestId) => luna
      ? async (input, beforeSend, signal) => createLunaRagCompletion({ apiKey: policy.key(), policyCurrent: policy.current, dispatchCurrent: policy.dispatchCurrent,
        ...(prototypePolicy ? { preClaimCurrent: policy.dispatchCurrent } : {}), claim: async () => {
        if (!await claim()) return false;
        if (prototypePolicy) return prototypePolicy.claimBudget({ request: requestId, surface: 'chat', fingerprint: createHash('sha256').update(JSON.stringify(input)).digest('hex') });
        return !!lunaPolicy && await lunaPolicy.claimBudget();
      } })(input, beforeSend, signal)
      : createBasicRagCompletion({ apiKey: policy.key(), claim, policyCurrent: policy.current, dispatchCurrent: policy.dispatchCurrent }),
  });
}
