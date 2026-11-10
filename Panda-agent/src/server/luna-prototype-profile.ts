import 'server-only';
import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { uuid } from './chat-contracts.ts';
import { strictJson } from '../lightweight/client.ts';
import { privateFile, privateWindowsPair } from './basic-rag-profile.ts';

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string) => Object.keys(value).sort().join(',') === expected;
const hex = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const iso = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const samePath = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

/** A fresh private privacy lease and prior bound success are both required. */
export async function readLunaPrototypeProfile(input: { env: NodeJS.ProcessEnv; subject: string; requestOrigin: string; now?: () => number; nativePreview?: boolean }): Promise<Readonly<{
  binding: string; budgetId: string; workspaceSha256: string; expiresAt: string; dispatchCurrent(): boolean;
}> | null> {
  const { env, subject, requestOrigin } = input;
  const originAllowed = requestOrigin === 'http://localhost:3001' || input.nativePreview === true && requestOrigin === 'http://localhost:3000';
  if (!env || env.VERCEL !== undefined || env.VERCEL_ENV !== undefined || !originAllowed
    || typeof env.CLERK_SECRET_KEY !== 'string' || !/^sk_test_[\x21-\x7e]{16,4096}$/.test(env.CLERK_SECRET_KEY)
    || typeof env.OPENROUTER_API_KEY !== 'string' || !/^sk-or-v1-[a-f0-9]{64}$/i.test(env.OPENROUTER_API_KEY)
    || typeof subject !== 'string' || !subject.trim() || subject.length > 512 || !subject.isWellFormed()
    || typeof env.PANDA_AGENT_LUNA_PROTOTYPE_PROFILE_FILE !== 'string' || !path.isAbsolute(env.PANDA_AGENT_LUNA_PROTOTYPE_PROFILE_FILE)) return null;
  const key = env.OPENROUTER_API_KEY, clerk = env.CLERK_SECRET_KEY, supplied = env.PANDA_AGENT_LUNA_PROTOTYPE_PROFILE_FILE;
  const observability = env.PANDA_AGENT_OPENROUTER_OBSERVABILITY;
  const nativeObservability = env.PANDA_AGENT_NATIVE_OBSERVABILITY;
  // Native metadata tracing requires its own explicit authorization, separate from RAG evaluation.
  if (input.nativePreview === true && observability !== undefined
    && !(observability === 'langsmith_metadata_only' && nativeObservability === observability)) return null;
  const metadataTraces = observability === 'langsmith_metadata_only';
  let profileFile: Awaited<ReturnType<typeof privateFile>> = null, receiptFile: Awaited<ReturnType<typeof privateFile>> = null;
  try {
    const root = path.resolve(process.cwd(), 'private', 'basic-rag-activation');
    // The native preview owns a separate lease so renewal cannot invalidate RAG work.
    const nativeFile = input.nativePreview === true && path.basename(supplied) === 'luna-native-prototype-profile.json';
    const profilePath = path.join(root, nativeFile ? 'luna-native-prototype-profile.json' : 'luna-prototype-profile.json');
    if (!samePath(await realpath(root), root) || !samePath(path.resolve(supplied), profilePath)) return null;
    profileFile = await privateFile(profilePath, root);
    if (!profileFile) return null;
    const p: unknown = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(profileFile.bytes));
    if (!object(p) || !keys(p, 'budgetId,expiresAt,issuedAt,keySha256,model,ownerSubjectSha256,privacy,privacyVerifiedAt,provider,receiptFile,receiptSha256,version,workspaceSha256')
      || p.version !== 1 || p.model !== 'openai/gpt-6-luna' || p.provider !== 'azure/us'
      || p.ownerSubjectSha256 !== hash(subject) || p.keySha256 !== hash(key) || !hex(p.workspaceSha256)
      || !uuid(p.budgetId) || p.budgetId !== p.budgetId.toLowerCase() || !iso(p.privacyVerifiedAt) || !iso(p.issuedAt) || !iso(p.expiresAt)
      || !object(p.privacy) || !keys(p.privacy, 'dataDiscount,logging,publicPrompts,traces') || p.privacy.logging !== false || p.privacy.dataDiscount !== false || p.privacy.publicPrompts !== false
      || p.privacy.traces !== metadataTraces
      || typeof p.receiptFile !== 'string' || !/^luna-diagnostic-[a-z0-9-]{1,80}\.json$/.test(p.receiptFile) || !hex(p.receiptSha256)) return null;
    const receiptPath = path.join(root, p.receiptFile);
    receiptFile = await privateFile(receiptPath, root);
    if (!receiptFile || hash(receiptFile.bytes) !== p.receiptSha256) return null;
    const receipt: unknown = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(receiptFile.bytes));
    if (!object(receipt) || !keys(receipt, 'budgetBinding,completedAt,costNanoUsd,finishReason,hasGroundedEvidence,httpStatus,inputTokens,keySha256,model,outputTokens,provider,requestPolicy,returnedModel,returnedProvider,validJsonAnswer,version,workspaceSha256')
      || receipt.version !== 1 || receipt.model !== p.model || receipt.provider !== p.provider
      || typeof receipt.returnedModel !== 'string' || !['openai/gpt-6-luna', 'openai/gpt-6-luna-20260922'].includes(receipt.returnedModel)
      || receipt.returnedProvider !== 'Azure' || receipt.keySha256 !== p.keySha256 || receipt.workspaceSha256 !== p.workspaceSha256 || !hex(receipt.budgetBinding)
      || receipt.httpStatus !== 200 || receipt.finishReason !== 'stop' || !Number.isSafeInteger(receipt.costNanoUsd)
      || (receipt.costNanoUsd as number) < 0 || (receipt.costNanoUsd as number) > 2697640
      || !Number.isSafeInteger(receipt.inputTokens) || (receipt.inputTokens as number) < 1 || (receipt.inputTokens as number) > 21024
      || !Number.isSafeInteger(receipt.outputTokens) || (receipt.outputTokens as number) < 1 || (receipt.outputTokens as number) > 700
      || receipt.validJsonAnswer !== true || receipt.hasGroundedEvidence !== true || !iso(receipt.completedAt) || !object(receipt.requestPolicy)
      || !keys(receipt.requestPolicy, 'allowFallbacks,cache,dataCollection,maxPrice,onlyProvider,plugins,reasoning,safetyRetention,tools,zdr')) return null;
    const q = receipt.requestPolicy;
    if (q.zdr !== true || q.dataCollection !== 'deny' || q.allowFallbacks !== false || q.onlyProvider !== 'azure/us'
      || q.tools !== false || q.plugins !== false || q.reasoning !== false || q.cache !== false || q.safetyRetention !== false
      || !object(q.maxPrice) || !keys(q.maxPrice, 'completion,image,prompt,request')
      || q.maxPrice.prompt !== 0.11 || q.maxPrice.completion !== 0.55 || q.maxPrice.request !== 0 || q.maxPrice.image !== 0) return null;
    const privacy = Date.parse(p.privacyVerifiedAt), issued = Date.parse(p.issuedAt), expires = Date.parse(p.expiresAt), completed = Date.parse(receipt.completedAt);
    const validTime = () => {
      const now = (input.now ?? Date.now)();
      return Number.isSafeInteger(now) && now >= 0 && completed <= issued && privacy <= issued && issued <= now && now < expires
        && expires - issued <= 30 * 60_000 && now - privacy <= 30 * 60_000;
    };
    const unchanged = () => env.OPENROUTER_API_KEY === key && env.CLERK_SECRET_KEY === clerk
      && env.PANDA_AGENT_OPENROUTER_OBSERVABILITY === observability
      && env.PANDA_AGENT_NATIVE_OBSERVABILITY === nativeObservability
      && env.PANDA_AGENT_LUNA_PROTOTYPE_PROFILE_FILE === supplied && env.VERCEL === undefined && env.VERCEL_ENV === undefined;
    if (!validTime() || (process.platform === 'win32' && !await privateWindowsPair(profilePath, receiptPath))) return null;
    const [profileCurrent, receiptCurrent] = await Promise.all([profileFile.current(), receiptFile.current()]);
    if (!profileCurrent || !receiptCurrent || !validTime() || !unchanged()) return null;
    const checkedProfile = profileFile, checkedReceipt = receiptFile;
    return Object.freeze({ binding: hash(JSON.stringify(['luna-prototype-profile-v1', hash(profileFile.bytes), p.receiptSha256, hash(subject), hash(key), requestOrigin, p.budgetId])),
      budgetId: p.budgetId, workspaceSha256: p.workspaceSha256, expiresAt: new Date(Math.min(expires, privacy + 30 * 60_000)).toISOString(),
      dispatchCurrent: () => validTime() && unchanged() && checkedProfile.dispatchCurrent() && checkedReceipt.dispatchCurrent() });
  } catch { return null; }
  finally { await receiptFile?.close().catch(() => {}); await profileFile?.close().catch(() => {}); }
}
