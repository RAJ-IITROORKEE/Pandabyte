import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, chmod, rm, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { readLunaPrototypeProfile } from '../src/server/luna-prototype-profile.ts';

const hash = value => createHash('sha256').update(value).digest('hex');
const key = 'sk-or-v1-' + 'a'.repeat(64), subject = 'fixture-owner', now = Date.parse('2026-11-10T00:10:00.000Z');
const budgetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', workspace = hash('fixture workspace');
const receipt = () => ({ version: 1, model: 'openai/gpt-6-luna', provider: 'azure/us', returnedModel: 'openai/gpt-6-luna',
  returnedProvider: 'Azure', keySha256: hash(key), workspaceSha256: workspace, budgetBinding: 'b'.repeat(64),
  completedAt: '2026-11-01T00:09:15.000Z', httpStatus: 200, finishReason: 'stop', costNanoUsd: 43010, inputTokens: 156, outputTokens: 47,
  validJsonAnswer: true, hasGroundedEvidence: true, requestPolicy: { zdr: true, dataCollection: 'deny', allowFallbacks: false,
    onlyProvider: 'azure/us', tools: false, plugins: false, reasoning: false, cache: false, safetyRetention: false,
    maxPrice: { prompt: 0.11, completion: 0.55, request: 0, image: 0 } } });

async function withFixture(run) {
  const original = process.cwd(); await mkdir(path.join(original, 'tmp'), { recursive: true });
  const parent = await realpath(path.join(original, 'tmp')), root = await mkdtemp(path.join(parent, 'luna-prototype-profile-test-'));
  const dir = path.join(root, 'private', 'basic-rag-activation');
  try {
    await mkdir(dir, { recursive: true });
    if (process.platform === 'win32') {
      const script = "$ErrorActionPreference='Stop';$p=[Console]::In.ReadToEnd();$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;$a=[System.Security.AccessControl.DirectorySecurity]::new();$a.SetOwner($sid);$a.SetAccessRuleProtection($true,$false);$r=[System.Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$a.AddAccessRule($r);[System.IO.Directory]::SetAccessControl($p,$a)";
      execFileSync(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', script], { input:dir, windowsHide:true, timeout:10000 });
    } else await chmod(dir, 0o700);
    process.chdir(root);
    const env = { CLERK_SECRET_KEY: 'sk_test_' + 'b'.repeat(40), OPENROUTER_API_KEY: key, PANDA_AGENT_LUNA_PROTOTYPE_PROFILE_FILE: path.join(dir, 'luna-prototype-profile.json') };
    const input = { env, subject, requestOrigin: 'http://localhost:3001', now: () => now };
    const put = async (r = receipt(), changes = {}) => {
      const text = JSON.stringify(r), p = { version:1, model:'openai/gpt-6-luna', provider:'azure/us', ownerSubjectSha256:hash(subject),
        keySha256:hash(key), workspaceSha256:workspace, budgetId, privacyVerifiedAt:'2026-11-10T00:08:00.000Z',
        privacy:{ logging:false, traces:false, dataDiscount:false, publicPrompts:false }, issuedAt:'2026-11-10T00:09:30.000Z',
        expiresAt:'2026-11-10T00:20:00.000Z', receiptFile:'luna-diagnostic-fixture.json', receiptSha256:hash(text), ...changes };
      await writeFile(path.join(dir, 'luna-diagnostic-fixture.json'), text, {mode:0o600});
      await writeFile(env.PANDA_AGENT_LUNA_PROTOTYPE_PROFILE_FILE, JSON.stringify(p), {mode:0o600});
    };
    await put(); await run({ input, env, dir, put });
  } finally {
    process.chdir(original); const actual = await realpath(root);
    assert.equal(path.dirname(actual).toLowerCase(), parent.toLowerCase()); assert.match(path.basename(actual), /^luna-prototype-profile-test-/);
    await rm(actual, { recursive:true, force:true });
  }
}

test('fresh owner-bound profile accepts an older verified receipt without depending on old budget files', { timeout:90000 }, async () => withFixture(async ({ input }) => {
  const profile = await readLunaPrototypeProfile(input);
  assert.ok(profile); assert.equal(profile.budgetId, budgetId); assert.equal(profile.workspaceSha256, workspace);
  assert.equal(profile.expiresAt, '2026-11-10T00:20:00.000Z'); assert.equal(profile.dispatchCurrent(), true);
  assert.equal(await readLunaPrototypeProfile({ ...input, subject:'other' }), null);
  assert.equal(await readLunaPrototypeProfile({ ...input, requestOrigin:'http://localhost:3000' }), null);
  assert.ok(await readLunaPrototypeProfile({ ...input, requestOrigin:'http://localhost:3000', nativePreview:true }));
  assert.equal(await readLunaPrototypeProfile({ ...input, requestOrigin:'http://127.0.0.1:3000', nativePreview:true }), null);
  assert.equal(await readLunaPrototypeProfile({ ...input, requestOrigin:'https://localhost:3000', nativePreview:true }), null);
  assert.equal(await readLunaPrototypeProfile({ ...input, now:() => now + 30 * 60_000 }), null);
}));

test('profile, policy and receipt mismatches deny admission and file removal revokes dispatch', { timeout:90000 }, async () => withFixture(async ({ input, env, dir, put }) => {
  for (const [r, patch] of [[receipt(), {budgetId:'not-a-uuid'}], [receipt(), {privacy:{ logging:true, traces:false, dataDiscount:false, publicPrompts:false }}],
    [{...receipt(), returnedModel:'openai/gpt-6-luna-unverified'}, {}], [{...receipt(), returnedModel:['openai/gpt-6-luna']}, {}],
    [{...receipt(), returnedProvider:'other'}, {}], [{...receipt(), validJsonAnswer:false}, {}],
    [{...receipt(), completedAt:'2026-11-11T00:00:00.000Z'}, {}],
    [{...receipt(), requestPolicy:{...receipt().requestPolicy,zdr:false}}, {}]]) {
    await put(r, patch); assert.equal(await readLunaPrototypeProfile(input), null);
  }
  await put(); const profile = await readLunaPrototypeProfile(input); assert.ok(profile); assert.equal(profile.dispatchCurrent(), true);
  env.OPENROUTER_API_KEY = 'sk-or-v1-' + 'c'.repeat(64); assert.equal(profile.dispatchCurrent(), false); env.OPENROUTER_API_KEY = key;
  await unlink(path.join(dir, 'luna-diagnostic-fixture.json')); assert.equal(profile.dispatchCurrent(), false);
}));

test('native preview lease stays isolated from the RAG lease and cannot activate the RAG reader', {timeout:90000}, async()=>withFixture(async({input,env,dir})=>{
 const fs=await import('node:fs/promises');
 const nativePath=path.join(dir,'luna-native-prototype-profile.json');
 await fs.copyFile(env.PANDA_AGENT_LUNA_PROTOTYPE_PROFILE_FILE,nativePath);
 const nativeInput={...input,env:{...env,PANDA_AGENT_LUNA_PROTOTYPE_PROFILE_FILE:nativePath},requestOrigin:'http://localhost:3000',nativePreview:true};
 assert.ok(await readLunaPrototypeProfile(nativeInput));
 assert.equal(await readLunaPrototypeProfile({...nativeInput,nativePreview:false,requestOrigin:'http://localhost:3001'}),null);
 await fs.unlink(env.PANDA_AGENT_LUNA_PROTOTYPE_PROFILE_FILE);
 assert.ok(await readLunaPrototypeProfile(nativeInput));
}));
test('metadata-only OpenRouter LangSmith tracing requires an explicit matching lease and revokes when mode changes', {timeout:90000}, async()=>withFixture(async({input,env,put})=>{
 await put(receipt(),{privacy:{logging:false,traces:true,dataDiscount:false,publicPrompts:false}});
 assert.equal(await readLunaPrototypeProfile(input),null);
 env.PANDA_AGENT_OPENROUTER_OBSERVABILITY='langsmith_metadata_only';
 assert.equal(await readLunaPrototypeProfile({...input,nativePreview:true,requestOrigin:'http://localhost:3000'}),null);
 env.PANDA_AGENT_NATIVE_OBSERVABILITY='langsmith_metadata_only';
 const native=await readLunaPrototypeProfile({...input,nativePreview:true,requestOrigin:'http://localhost:3000'});assert.ok(native);
 env.PANDA_AGENT_NATIVE_OBSERVABILITY=undefined;assert.equal(native.dispatchCurrent(),false);
 const profile=await readLunaPrototypeProfile(input);assert.ok(profile);assert.equal(profile.dispatchCurrent(),true);
 env.PANDA_AGENT_OPENROUTER_OBSERVABILITY='other';assert.equal(profile.dispatchCurrent(),false);
 assert.equal(await readLunaPrototypeProfile(input),null);
}));
