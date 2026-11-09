import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, chmod, rm, realpath, readdir } from 'node:fs/promises';
import path from 'node:path';
import { readLunaTestBudget, claimLunaTestBudget } from '../src/server/luna-test-budget.ts';

const hash = v => createHash('sha256').update(v).digest('hex');
const key = 'sk-or-v1-' + 'a'.repeat(64), subject = 'fixture-owner', now = Date.parse('2026-11-10T00:10:00.000Z');
const descriptor = () => ({ version: 1, model: 'openai/gpt-6-luna', provider: 'azure/us', ownerSubjectSha256: hash(subject), keySha256: hash(key), workspaceSha256: hash('fixture workspace'), privacyVerifiedAt: '2026-11-10T00:08:00.000Z', privacy: { logging: false, traces: false, dataDiscount: false, publicPrompts: false }, issuedAt: '2026-11-10T00:09:00.000Z', expiresAt: '2026-11-10T00:20:00.000Z' });
async function fixture(run) {
  const cwd = process.cwd(); await mkdir(path.join(cwd, 'tmp'), { recursive: true }); const parent = await realpath(path.join(cwd, 'tmp'));
  const root = await mkdtemp(path.join(parent, 'luna-budget-test-')), directory = path.join(root, 'private', 'basic-rag-activation');
  await mkdir(directory, { recursive: true });
  if (process.platform === 'win32') {
    const script = "$ErrorActionPreference='Stop';$p=[Console]::In.ReadToEnd();$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;$a=[System.Security.AccessControl.DirectorySecurity]::new();$a.SetOwner($sid);$a.SetAccessRuleProtection($true,$false);$r=[System.Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$a.AddAccessRule($r);[System.IO.Directory]::SetAccessControl($p,$a)";
    execFileSync(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', script], { input: directory, windowsHide: true, timeout: 5000 });
  } else await chmod(directory, 0o700);
  process.chdir(root);
  const filename = path.join(directory, 'luna-budget.json'), put = value => writeFile(filename, JSON.stringify(value), { mode: 0o600 });
  const input = { env: { CLERK_SECRET_KEY: 'sk_test_' + 'b'.repeat(40), OPENROUTER_API_KEY: key, PANDA_AGENT_LUNA_BUDGET_FILE: filename }, subject, requestOrigin: 'http://localhost:3001', now: () => now };
  try { await put(descriptor()); await run({ input, put, directory }); }
  finally { process.chdir(cwd); const actual = await realpath(root); assert.equal(path.dirname(actual).toLowerCase(), parent.toLowerCase()); assert.match(path.basename(actual), /^luna-budget-test-/); await rm(actual, { recursive: true, force: true }); }
}
test('three sequential reservations persist and cannot be refunded', { timeout: 60000 }, async () => fixture(async ({ input, directory }) => {
  const budget = await readLunaTestBudget(input); assert.ok(budget);
  for (let i = 0; i < 3; i++) assert.equal(await claimLunaTestBudget({ ...input, expectedBinding: budget.binding }), true);
  assert.equal(await claimLunaTestBudget({ ...input, expectedBinding: budget.binding }), false);
  assert.equal((await readdir(directory)).filter(n => n.startsWith('luna-budget-slot-')).length, 3);
}));
test('concurrent reservations never admit more than three', { timeout: 60000 }, async () => fixture(async ({ input, directory }) => {
  const budget = await readLunaTestBudget(input); assert.ok(budget);
  const claims = await Promise.all(Array.from({ length: 6 }, () => claimLunaTestBudget({ ...input, expectedBinding: budget.binding })));
  assert.ok(claims.filter(Boolean).length <= 3);
  assert.ok((await readdir(directory)).filter(n => n.startsWith('luna-budget-slot-')).length <= 3);
}));

test('a fourth permanent reservation requires a narrowed call and remains below the approved cent', { timeout: 60000 }, async () => fixture(async ({ input }) => {
  const budget=await readLunaTestBudget(input);assert.ok(budget);
  for(let i=0;i<3;i++)assert.equal(await claimLunaTestBudget({...input,expectedBinding:budget.binding}),true);
  assert.equal(await claimLunaTestBudget({...input,expectedBinding:budget.binding}),false);
  assert.equal(await claimLunaTestBudget({...input,expectedBinding:budget.binding,reservationNanoUsd:1597641}),false);
  assert.equal(await claimLunaTestBudget({...input,expectedBinding:budget.binding,reservationNanoUsd:1597640}),true);
  assert.equal(await claimLunaTestBudget({...input,expectedBinding:budget.binding,reservationNanoUsd:1597640}),false);
  assert.ok(3*2697640+1597640<10000000);
}));
test('rejects invalid owner, origin, lease, privacy, key and changed descriptor binding', { timeout: 60000 }, async () => fixture(async ({ input, put }) => {
  const budget = await readLunaTestBudget(input); assert.ok(budget);
  assert.equal(await readLunaTestBudget({ ...input, subject: 'other' }), null);
  assert.equal(await readLunaTestBudget({ ...input, requestOrigin: 'http://localhost:3000' }), null);
  assert.equal(await readLunaTestBudget({ ...input, now: () => now + 30 * 60_000 }), null);
  assert.equal(await readLunaTestBudget({ ...input, env: { ...input.env, OPENROUTER_API_KEY: 'sk-or-v1-' + 'c'.repeat(64) } }), null);
  const changed = descriptor(); changed.privacy.logging = true; await put(changed);
  assert.equal(await claimLunaTestBudget({ ...input, expectedBinding: budget.binding }), false);
}));
