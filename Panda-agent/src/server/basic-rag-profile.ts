import 'server-only';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { constants, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { validLocalWindowsPrivacy } from '../control-room/playground-local-windows.ts';
import { strictJson } from '../lightweight/client.ts';
import { basicRagModel } from './basic-rag-openrouter.ts';

type RecordValue = Record<string, unknown>;
export type BasicRagProfile = Readonly<{ binding: string; expiresAt: string; workspaceSha256: string; dispatchCurrent(): boolean }>;
const record = (v: unknown): v is RecordValue => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: RecordValue, expected: string) => Object.keys(v).sort().join(',') === expected;
const hex = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const date = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)) return false;
  const time = Date.parse(v);
  return Number.isFinite(time) && new Date(time).toISOString() === v;
};
const hash = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
const samePath = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const privateMode = (stat: { uid: number; mode: number }) => process.platform === 'win32'
  || ((stat.mode & 0o077) === 0 && (typeof process.getuid !== 'function' || stat.uid === process.getuid()));
const sameFile = (a: { dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number; nlink: number }, b: typeof a) =>
  a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && a.nlink === 1 && b.nlink === 1;
const exec = promisify(execFile);
// Both files share a parent. Paths are environment data, never PowerShell code.
const aclScript = String.raw`
$ErrorActionPreference = 'Stop'
function Read-Privacy([string] $literal) {
  $acl = Get-Acl -LiteralPath $literal
  $raw = [System.Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(), 0)
  $hasDacl = (($raw.ControlFlags -band [System.Security.AccessControl.ControlFlags]::DiscretionaryAclPresent) -ne 0) -and ($null -ne $raw.DiscretionaryAcl)
  $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]) | ForEach-Object {
    [pscustomobject]@{ sid = $_.IdentityReference.Value; type = $_.AccessControlType.ToString(); inherited = [bool]$_.IsInherited; rights = [int64]$_.FileSystemRights; objectInherit = [bool]($_.InheritanceFlags -band [System.Security.AccessControl.InheritanceFlags]::ObjectInherit) }
  })
  return [pscustomobject]@{ owner = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value; protected = [bool]$acl.AreAccessRulesProtected; hasDacl = [bool]$hasDacl; rules = $rules }
}
$profile = $env:PANDA_BASIC_PROFILE_ACL_PATH
$receipt = $env:PANDA_BASIC_RECEIPT_ACL_PATH
$parent = [System.IO.Path]::GetDirectoryName($profile)
if ([string]::IsNullOrEmpty($profile) -or [string]::IsNullOrEmpty($receipt) -or [string]::IsNullOrEmpty($parent) -or [System.IO.Path]::GetDirectoryName($receipt) -ne $parent) { throw 'Invalid path' }
[pscustomobject]@{ currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; profile = (Read-Privacy $profile); receipt = (Read-Privacy $receipt); parent = (Read-Privacy $parent) } | ConvertTo-Json -Depth 6 -Compress
`;
export async function privateWindowsPair(profile: string, receipt: string): Promise<boolean> {
  if (process.platform !== 'win32' || !process.env.SystemRoot || !path.win32.isAbsolute(process.env.SystemRoot)) return false;
  try {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => /^(?:SYSTEMROOT|TEMP|PATH)$/i.test(key) && value !== undefined)) as NodeJS.ProcessEnv;
    env.PANDA_BASIC_PROFILE_ACL_PATH = profile;
    env.PANDA_BASIC_RECEIPT_ACL_PATH = receipt;
    const executable = path.win32.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const result = await exec(executable, ['-NoProfile', '-NonInteractive', '-Command', aclScript], { env, windowsHide: true, timeout: 5000, maxBuffer: 65536, encoding: 'utf8' });
    const report: unknown = JSON.parse(result.stdout);
    return record(report) && validLocalWindowsPrivacy({ currentSid: report.currentSid, file: report.profile, parent: report.parent })
      && validLocalWindowsPrivacy({ currentSid: report.currentSid, file: report.receipt, parent: report.parent });
  } catch { return false; }
}

/** Opens a private local file without accepting links, replacement, broad access or unbounded content. */
export async function privateFile(filename: string, root: string) {
  const normalized = path.resolve(filename);
  const relative = path.relative(root, normalized);
  if (!relative || !samePath(path.dirname(normalized), root) || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)
    || /[\u0000-\u001f\u007f]/.test(filename) || !samePath(await realpath(normalized), normalized)) return null;
  const parent = await lstat(path.dirname(normalized)), before = await lstat(normalized);
  if (!parent.isDirectory() || parent.isSymbolicLink() || !privateMode(parent) || !before.isFile() || before.isSymbolicLink()
    || !privateMode(before) || before.nlink !== 1 || before.size < 2 || before.size > 8192) return null;
  const file = await open(normalized, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let retained = false;
  try {
    const opened = await file.stat();
    if (!opened.isFile() || !privateMode(opened) || !sameFile(before, opened)) return null;
    const bytes = await file.readFile();
    if (bytes.length !== opened.size || bytes.length > 8192) return null;
    const current = async () => {
      const [handle, entry, directory, resolved] = await Promise.all([file.stat(), lstat(normalized), lstat(path.dirname(normalized)), realpath(normalized)]);
      if (!handle.isFile() || !entry.isFile() || entry.isSymbolicLink() || !directory.isDirectory() || directory.isSymbolicLink()
        || !privateMode(handle) || !privateMode(entry) || !privateMode(directory) || !sameFile(opened, handle) || !sameFile(opened, entry)
        || parent.dev !== directory.dev || parent.ino !== directory.ino || parent.mtimeMs !== directory.mtimeMs || parent.ctimeMs !== directory.ctimeMs
        || !samePath(resolved, normalized)) return false;
      return true;
    };
    const dispatchCurrent = () => {
      try {
        const before = lstatSync(normalized), directory = lstatSync(path.dirname(normalized));
        if (!before.isFile() || before.isSymbolicLink() || !privateMode(before) || !sameFile(opened, before)
          || !directory.isDirectory() || directory.isSymbolicLink() || !privateMode(directory)
          || parent.dev !== directory.dev || parent.ino !== directory.ino || !samePath(realpathSync(normalized), normalized)) return false;
        const reread = readFileSync(normalized), after = lstatSync(normalized);
        return reread.length === opened.size && reread.length <= 8192 && hash(reread) === hash(bytes)
          && after.isFile() && !after.isSymbolicLink() && privateMode(after) && sameFile(opened, after);
      } catch { return false; }
    };
    if (!await current()) return null;
    retained = true;
    return { bytes, current, dispatchCurrent, close: () => file.close() };
  } finally {
    if (!retained) await file.close().catch(() => {});
  }
}

/** Server-only, owner-bound local lease. A file is evidence only when every guard passes. */
export async function readBasicRagProfile(input: {
  env: NodeJS.ProcessEnv; subject: string; requestOrigin: string; now?: () => number;
}): Promise<BasicRagProfile | null> {
  const { env, subject, requestOrigin } = input;
  if (!env || env.VERCEL !== undefined || env.VERCEL_ENV !== undefined || requestOrigin !== 'http://localhost:3001'
    || typeof env.CLERK_SECRET_KEY !== 'string' || !/^sk_test_[\x21-\x7e]{16,4096}$/.test(env.CLERK_SECRET_KEY)
    || typeof env.OPENROUTER_API_KEY !== 'string' || !/^sk-or-v1-[a-f0-9]{64}$/i.test(env.OPENROUTER_API_KEY)
    || typeof subject !== 'string' || !subject.trim() || subject.length > 512 || !subject.isWellFormed()
    || typeof env.PANDA_AGENT_BASIC_RAG_PROFILE_FILE !== 'string' || !path.isAbsolute(env.PANDA_AGENT_BASIC_RAG_PROFILE_FILE)) return null;
  const apiKey = env.OPENROUTER_API_KEY, clerkKey = env.CLERK_SECRET_KEY, suppliedPath = env.PANDA_AGENT_BASIC_RAG_PROFILE_FILE;
  let profileFile: Awaited<ReturnType<typeof privateFile>> = null, receiptFile: Awaited<ReturnType<typeof privateFile>> = null;
  try {
    const root = path.resolve(process.cwd(), 'private', 'basic-rag-activation');
    if (!samePath(await realpath(root), root)) return null;
    const profilePath = path.resolve(env.PANDA_AGENT_BASIC_RAG_PROFILE_FILE);
    if (!samePath(profilePath, path.join(root, 'profile.json'))) return null;
    profileFile = await privateFile(profilePath, root);
    if (!profileFile) return null;
    const profile: unknown = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(profileFile.bytes));
    if (!record(profile) || !keys(profile, 'expiresAt,issuedAt,keySha256,model,ownerSubjectSha256,privacy,privacyVerifiedAt,provider,receiptFile,receiptSha256,version,workspaceSha256')
      || profile.version !== 1 || profile.model !== basicRagModel || profile.provider !== 'phala' || !hex(profile.ownerSubjectSha256)
      || !hex(profile.keySha256) || !hex(profile.workspaceSha256) || !hex(profile.receiptSha256) || !date(profile.privacyVerifiedAt) || !date(profile.issuedAt) || !date(profile.expiresAt)
      || profile.ownerSubjectSha256 !== hash(subject) || profile.keySha256 !== hash(apiKey)
      || typeof profile.receiptFile !== 'string' || !/^basic-rag-diagnostic-[a-z0-9-]{1,80}\.json$/.test(profile.receiptFile)
      || !record(profile.privacy) || !keys(profile.privacy, 'dataDiscount,logging,publicPrompts,traces')
      || profile.privacy.logging !== false || profile.privacy.traces !== false || profile.privacy.dataDiscount !== false || profile.privacy.publicPrompts !== false) return null;
    const receiptPath = path.join(path.dirname(profilePath), profile.receiptFile);
    if (samePath(receiptPath, profilePath)) return null;
    receiptFile = await privateFile(receiptPath, root);
    if (!receiptFile || hash(receiptFile.bytes) !== profile.receiptSha256) return null;
    const receipt: unknown = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(receiptFile.bytes));
    if (!record(receipt) || !keys(receipt, 'completedAt,costUsd,finishReason,hasGroundedEvidence,httpStatus,inputTokens,keySha256,model,outputTokens,provider,requestPolicy,returnedModel,returnedProvider,validJsonAnswer,version,workspaceSha256')
      || receipt.version !== 1 || receipt.model !== basicRagModel || receipt.provider !== 'phala' || receipt.returnedModel !== basicRagModel
      || receipt.returnedProvider !== 'Phala' || receipt.keySha256 !== profile.keySha256 || receipt.workspaceSha256 !== profile.workspaceSha256
      || receipt.httpStatus !== 200 || receipt.finishReason !== 'stop' || receipt.costUsd !== 0
      || !Number.isSafeInteger(receipt.inputTokens) || (receipt.inputTokens as number) < 1 || (receipt.inputTokens as number) > 128000
      || !Number.isSafeInteger(receipt.outputTokens) || (receipt.outputTokens as number) < 1 || (receipt.outputTokens as number) > 1000
      || receipt.validJsonAnswer !== true || receipt.hasGroundedEvidence !== true || !date(receipt.completedAt)
      || !record(receipt.requestPolicy) || !keys(receipt.requestPolicy, 'allowFallbacks,cache,dataCollection,maxPrice,onlyProvider,plugins,reasoning,safetyRetention,tools,zdr')) return null;
    const policy = receipt.requestPolicy;
    if (policy.zdr !== true || policy.dataCollection !== 'deny' || policy.allowFallbacks !== false || policy.onlyProvider !== 'phala'
      || policy.tools !== false || policy.plugins !== false || policy.reasoning !== false || policy.cache !== false || policy.safetyRetention !== false
      || !record(policy.maxPrice) || !keys(policy.maxPrice, 'completion,image,prompt,request')
      || Object.values(policy.maxPrice).some(value => value !== 0)) return null;
    const privacy = Date.parse(profile.privacyVerifiedAt), completed = Date.parse(receipt.completedAt), issued = Date.parse(profile.issuedAt), expires = Date.parse(profile.expiresAt);
    const validTime = (now: number) => Number.isSafeInteger(now) && now >= 0 && privacy <= completed && completed <= issued && issued <= now
      && expires > now && expires - issued <= 30 * 60_000 && now - privacy <= 30 * 60_000 && now - completed <= 30 * 60_000;
    if (!validTime((input.now ?? Date.now)())) return null;
    if (process.platform === 'win32' && !await privateWindowsPair(profilePath, receiptPath)) return null;
    const [profileCurrent, receiptCurrent] = await Promise.all([profileFile.current(), receiptFile.current()]);
    if (!profileCurrent || !receiptCurrent || !validTime((input.now ?? Date.now)())
      || env.OPENROUTER_API_KEY !== apiKey || env.CLERK_SECRET_KEY !== clerkKey || env.PANDA_AGENT_BASIC_RAG_PROFILE_FILE !== suppliedPath
      || env.VERCEL !== undefined || env.VERCEL_ENV !== undefined) return null;
    const binding = hash(JSON.stringify(['basic-rag-profile-v1', hash(profileFile.bytes), profile.receiptSha256, hash(subject), hash(apiKey), requestOrigin]));
    const checkedProfile = profileFile, checkedReceipt = receiptFile;
    return Object.freeze({ binding, expiresAt: new Date(Math.min(expires, privacy + 30 * 60_000, completed + 30 * 60_000)).toISOString(), workspaceSha256: receipt.workspaceSha256,
      dispatchCurrent: () => checkedProfile.dispatchCurrent() && checkedReceipt.dispatchCurrent() });
  } catch { return null; }
  finally { await receiptFile?.close().catch(() => {}); await profileFile?.close().catch(() => {}); }
}
