import 'server-only';
import { createHash } from 'node:crypto';
import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { strictJson } from '../lightweight/client.ts';
import { privateFile, privateWindowsPair } from './basic-rag-profile.ts';

type Input = { env: NodeJS.ProcessEnv; subject: string; requestOrigin: string; now?: () => number };
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, names: string) => Object.keys(v).sort().join(',') === names;
const iso = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(Date.parse(v)).toISOString() === v;
const samePath = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

/** Owner-attested diagnostic budget. This alone never grants inference authorization. */
export async function readLunaTestBudget(input: Input): Promise<Readonly<{ binding: string; workspaceSha256: string; expiresAt: string; dispatchCurrent(): boolean }> | null> {
  const { env, subject, requestOrigin } = input;
  if (!env || env.VERCEL !== undefined || env.VERCEL_ENV !== undefined || requestOrigin !== 'http://localhost:3001'
    || typeof env.CLERK_SECRET_KEY !== 'string' || !/^sk_test_[\x21-\x7e]{16,4096}$/.test(env.CLERK_SECRET_KEY)
    || typeof env.OPENROUTER_API_KEY !== 'string' || !/^sk-or-v1-[a-f0-9]{64}$/i.test(env.OPENROUTER_API_KEY)
    || typeof subject !== 'string' || !subject.trim() || subject.length > 512 || !subject.isWellFormed()
    || typeof env.PANDA_AGENT_LUNA_BUDGET_FILE !== 'string' || !path.isAbsolute(env.PANDA_AGENT_LUNA_BUDGET_FILE)) return null;
  const key = env.OPENROUTER_API_KEY, clerk = env.CLERK_SECRET_KEY, supplied = env.PANDA_AGENT_LUNA_BUDGET_FILE;
  let file: Awaited<ReturnType<typeof privateFile>> = null;
  try {
    const root = path.resolve(process.cwd(), 'private', 'basic-rag-activation');
    const name = path.join(root, 'luna-budget.json');
    if (!samePath(await realpath(root), root) || !samePath(path.resolve(supplied), name)) return null;
    file = await privateFile(name, root); if (!file) return null;
    const value: unknown = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes));
    if (!object(value) || !keys(value, 'expiresAt,issuedAt,keySha256,model,ownerSubjectSha256,privacy,privacyVerifiedAt,provider,version,workspaceSha256')
      || value.version !== 1 || value.model !== 'openai/gpt-6-luna' || value.provider !== 'azure/us'
      || value.keySha256 !== hash(key) || value.ownerSubjectSha256 !== hash(subject)
      || typeof value.workspaceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.workspaceSha256)
      || !iso(value.privacyVerifiedAt) || !iso(value.issuedAt) || !iso(value.expiresAt)
      || !object(value.privacy) || !keys(value.privacy, 'dataDiscount,logging,publicPrompts,traces')
      || Object.values(value.privacy).some(v => v !== false)) return null;
    const verified = Date.parse(value.privacyVerifiedAt), issued = Date.parse(value.issuedAt), expires = Date.parse(value.expiresAt);
    const validTime = () => { const now = (input.now ?? Date.now)(); return Number.isSafeInteger(now) && verified <= issued && issued <= now && now < expires
      && expires - issued <= 30 * 60_000 && now - verified <= 30 * 60_000; };
    if (!validTime() || (process.platform === 'win32' && !await privateWindowsPair(name, name)) || !await file.current()
      || !validTime() || env.OPENROUTER_API_KEY !== key || env.CLERK_SECRET_KEY !== clerk || env.PANDA_AGENT_LUNA_BUDGET_FILE !== supplied
      || env.VERCEL !== undefined || env.VERCEL_ENV !== undefined) return null;
    const checkedFile = file;
    return Object.freeze({ binding: hash(JSON.stringify(['luna-budget-v1', hash(file.bytes), hash(subject), hash(key), requestOrigin])), workspaceSha256: value.workspaceSha256, expiresAt: new Date(Math.min(expires, verified + 30 * 60_000)).toISOString(), dispatchCurrent: () => checkedFile.dispatchCurrent() });
  } catch { return null; } finally { await file?.close().catch(() => {}); }
}

/** Permanent reservations; no automatic cleanup or refund, including on unknown results. */
export async function claimLunaTestBudget(input: Input & { expectedBinding: string; reservationNanoUsd?: number }): Promise<boolean> {
  const reservation = input.reservationNanoUsd ?? 2697640;
  if (!Number.isSafeInteger(reservation) || reservation <= 0 || reservation > 2697640) return false;
  const initial = await readLunaTestBudget(input);
  if (!initial || initial.binding !== input.expectedBinding) return false;
  const root = path.resolve(process.cwd(), 'private', 'basic-rag-activation');
  // Three original reservations plus one narrowed call total at most USD0.00969056.
  const slots = reservation <= 1597640 ? 4 : 3;
  for (let slot = 1; slot <= slots; slot++) {
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      file = await open(path.join(root, `luna-budget-slot-${slot}`), 'wx', 0o600);
      await file.writeFile(initial.binding + '\n');
      await file.sync();
      await file.close(); file = undefined;
      const after = await readLunaTestBudget(input);
      return !!after && after.binding === initial.binding;
    } catch (error) {
      await file?.close().catch(() => {});
      if (object(error) && error.code === 'EEXIST') continue;
      return false;
    }
  }
  return false;
}
