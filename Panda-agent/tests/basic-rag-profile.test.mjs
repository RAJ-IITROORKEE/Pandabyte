import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, chmod, symlink, link, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { readBasicRagProfile } from '../src/server/basic-rag-profile.ts';

const digest = value => createHash('sha256').update(value).digest('hex');
const model = 'xingchen-agi/xing4.0-29b-a4b:free';
const key = 'sk-or-v1-' + 'a'.repeat(64), subject = 'user_synthetic_owner';
const workspace = digest('synthetic workspace');
const time = Date.parse('2026-11-10T00:10:00.000Z');
const profilePath = root => path.join(root, 'private', 'basic-rag-activation', 'profile.json');
const receiptName = 'basic-rag-diagnostic-20261110.json';
const receiptTemplate = () => ({ version: 1, model, provider: 'phala', returnedModel: model, returnedProvider: 'Phala', keySha256: digest(key), workspaceSha256: workspace,
  completedAt: '2026-11-10T00:09:00.000Z', httpStatus: 200, finishReason: 'stop', costUsd: 0, inputTokens: 45, outputTokens: 12,
  validJsonAnswer: true, hasGroundedEvidence: true,
  requestPolicy: { zdr: true, dataCollection: 'deny', allowFallbacks: false, onlyProvider: 'phala', maxPrice: { prompt: 0, completion: 0, request: 0, image: 0 }, tools: false, plugins: false, reasoning: false, cache: false, safetyRetention: false } });
const profileTemplate = receipt => ({ version: 1, model, provider: 'phala', ownerSubjectSha256: digest(subject), keySha256: digest(key), workspaceSha256: workspace,
  privacyVerifiedAt: '2026-11-10T00:08:00.000Z', privacy: { logging: false, traces: false, dataDiscount: false, publicPrompts: false },
  issuedAt: '2026-11-10T00:09:30.000Z', expiresAt: '2026-11-10T00:25:00.000Z', receiptFile: receiptName, receiptSha256: digest(JSON.stringify(receipt)) });

function secureDirectory(directory) {
  if (process.platform !== 'win32') return chmod(directory, 0o700);
  const script = "$ErrorActionPreference='Stop';$p=[Console]::In.ReadToEnd();$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;$a=[System.Security.AccessControl.DirectorySecurity]::new();$a.SetOwner($sid);$a.SetAccessRuleProtection($true,$false);$r=[System.Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$a.AddAccessRule($r);[System.IO.Directory]::SetAccessControl($p,$a)";
  execFileSync(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', script], { input: directory, windowsHide: true, timeout: 5000 });
}
async function withFixture(run) {
  const original = process.cwd();
  await mkdir(path.join(original, 'tmp'), { recursive: true });
  const parent = await realpath(path.join(original, 'tmp'));
  const root = await mkdtemp(path.join(parent, 'basic-rag-profile-test-'));
  const directory = path.dirname(profilePath(root));
  await mkdir(directory, { recursive: true });
  await secureDirectory(directory);
  process.chdir(root);
  const env = { CLERK_SECRET_KEY: 'sk_test_' + 'b'.repeat(40), OPENROUTER_API_KEY: key, PANDA_AGENT_BASIC_RAG_PROFILE_FILE: profilePath(root) };
  const input = { env, subject, requestOrigin: 'http://localhost:3001', now: () => time };
  async function put(profile = profileTemplate(receiptTemplate()), receipt = receiptTemplate()) {
    await writeFile(path.join(directory, receiptName), JSON.stringify(receipt), { mode: 0o600 });
    await writeFile(profilePath(root), JSON.stringify(profile), { mode: 0o600 });
  }
  try { await put(); await run({ root, directory, env, input, put }); }
  finally {
    process.chdir(original);
    const actual = await realpath(root);
    assert.equal(path.dirname(actual).toLowerCase(), parent.toLowerCase());
    assert.match(path.basename(actual), /^basic-rag-profile-test-/);
    await rm(actual, { recursive: true, force: true });
  }
}

test('accepts only a private owner-bound profile and matching successful diagnostic receipt', { timeout: 60000 }, async () => {
  await withFixture(async ({ input, put }) => {
    const result = await readBasicRagProfile(input);
    assert.ok(result && /^[a-f0-9]{64}$/.test(result.binding));
    assert.equal(result.workspaceSha256, workspace);
    assert.equal(result.expiresAt, '2026-11-10T00:25:00.000Z');
    assert.equal(JSON.stringify(result).includes(key), false);
    const receipt = receiptTemplate(); receipt.outputTokens++;
    const next = profileTemplate(receipt); await put(next, receipt);
    const changed = await readBasicRagProfile(input);
    assert.ok(changed); assert.notEqual(changed.binding, result.binding);
  });
});
test('synchronous dispatch check rejects a deleted diagnostic receipt', { timeout: 60000 }, async () => {
  await withFixture(async ({ input, directory }) => {
    const result = await readBasicRagProfile(input); assert.ok(result); assert.equal(result.dispatchCurrent(), true);
    await rm(path.join(directory, receiptName));
    assert.equal(result.dispatchCurrent(), false);
  });
});

test('rejects invalid origin, production environments, wrong keys, owners and paths', { timeout: 60000 }, async () => {
  await withFixture(async ({ root, env, input }) => {
    for (const patch of [
      { subject: 'user_other' }, { requestOrigin: 'http://localhost:3000' }, { requestOrigin: 'https://localhost:3001' },
      { env: { ...env, VERCEL: '1' } }, { env: { ...env, VERCEL_ENV: 'preview' } },
      { env: { ...env, CLERK_SECRET_KEY: 'sk_live_' + 'x'.repeat(40) } },
      { env: { ...env, OPENROUTER_API_KEY: 'sk-or-v1-' + 'c'.repeat(64) } },
      { env: { ...env, PANDA_AGENT_BASIC_RAG_PROFILE_FILE: path.join(root, 'elsewhere.json') } },
      { env: { ...env, PANDA_AGENT_BASIC_RAG_PROFILE_FILE: 'relative.json' } },
    ]) assert.equal(await readBasicRagProfile({ ...input, ...patch }), null);
  });
});

test('rejects expired, excessive or inconsistent proof times and privacy settings', { timeout: 120000 }, async () => {
  await withFixture(async ({ input, put }) => {
    for (const mutate of [
      p => { p.expiresAt = '2026-11-10T00:10:00.000Z'; },
      p => { p.expiresAt = '2026-11-10T00:40:00.000Z'; },
      p => { p.privacyVerifiedAt = '2026-11-09T23:39:59.000Z'; },
      p => { p.privacyVerifiedAt = '2026-11-10T00:09:01.000Z'; },
      p => { p.issuedAt = '2026-11-10T00:10:01.000Z'; },
      p => { p.privacy.logging = true; }, p => { p.privacy.traces = true; },
      p => { p.privacy.dataDiscount = true; }, p => { p.privacy.publicPrompts = true; },
    ]) {
      const receipt = receiptTemplate(), profile = profileTemplate(receipt); mutate(profile); await put(profile, receipt);
      assert.equal(await readBasicRagProfile(input), null);
    }
  });
});

test('a lease expiring while file permissions are checked is never admitted', { timeout: 60000 }, async () => {
  await withFixture(async ({ input }) => {
    let reads = 0;
    assert.equal(await readBasicRagProfile({ ...input, now: () => ++reads === 1 ? time : time + 16 * 60_000 }), null);
    assert.equal(reads, 2);
  });
});

test('rejects forged receipt, nonzero cost, fallback or retention and mismatched identity', { timeout: 120000 }, async () => {
  await withFixture(async ({ input, put, directory }) => {
    for (const mutate of [
      r => { r.costUsd = 0.01; }, r => { r.httpStatus = 429; }, r => { r.validJsonAnswer = false; },
      r => { r.hasGroundedEvidence = false; }, r => { r.returnedModel = 'other:free'; }, r => { r.returnedProvider = 'Other'; },
      r => { r.workspaceSha256 = digest('wrong workspace'); }, r => { r.keySha256 = digest('wrong key'); },
      r => { r.requestPolicy.zdr = false; }, r => { r.requestPolicy.allowFallbacks = true; },
      r => { r.requestPolicy.safetyRetention = true; }, r => { r.requestPolicy.maxPrice.completion = 1; },
      r => { r.requestPolicy.tools = true; }, r => { r.requestPolicy.cache = true; },
    ]) {
      const receipt = receiptTemplate(); mutate(receipt); await put(profileTemplate(receipt), receipt);
      assert.equal(await readBasicRagProfile(input), null);
    }
    await put();
    await writeFile(path.join(directory, receiptName), '{}');
    assert.equal(await readBasicRagProfile(input), null, 'receipt bytes must match profile hash');
    await writeFile(profilePath(process.cwd()), '{"version":1,"version":1}');
    assert.equal(await readBasicRagProfile(input), null, 'duplicate keys must fail');
  });
});

test('rejects links, oversized data and a profile readable by another principal', { timeout: 60000 }, async () => {
  await withFixture(async ({ root, directory, input, put }) => {
    const filename = profilePath(root), other = path.join(directory, 'other.json');
    await writeFile(filename, 'x'.repeat(8193)); assert.equal(await readBasicRagProfile(input), null);
    await put();
    await writeFile(other, '{}', { mode: 0o600 });
    await rm(filename); await link(other, filename); assert.equal(await readBasicRagProfile(input), null, 'hard links are refused');
    await rm(filename);
    try { await symlink(other, filename); assert.equal(await readBasicRagProfile(input), null, 'symlinks are refused'); await rm(filename); }
    catch (error) { if (!['EPERM', 'EACCES'].includes(error.code)) throw error; }
    await put();
    if (process.platform !== 'win32') await chmod(filename, 0o644);
    else {
      const script = "$ErrorActionPreference='Stop';$p=[Console]::In.ReadToEnd();$a=[System.IO.File]::GetAccessControl($p);$a.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new('S-1-1-0'),'Read','Allow'));[System.IO.File]::SetAccessControl($p,$a)";
      execFileSync(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', script], { input: filename, windowsHide: true, timeout: 5000 });
    }
    assert.equal(await readBasicRagProfile(input), null);
  });
});
