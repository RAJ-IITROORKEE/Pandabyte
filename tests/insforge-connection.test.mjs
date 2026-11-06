import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function load(file, dependencies, env = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(source, { exports, process: { env }, require(name) {
    if (name === 'server-only') return {};
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const { insforgeJwtTemplate } = load('../lib/insforge/jwt-template.ts', {});

test('connection template retains the legacy default and accepts the reviewed migrated template', () => {
  assert.equal(insforgeJwtTemplate({}), 'insforge');
  assert.equal(insforgeJwtTemplate({ INSFORGE_CLERK_JWT_TEMPLATE: 'insforge-pandabyte-migration' }), 'insforge-pandabyte-migration');
  assert.equal(insforgeJwtTemplate({ INSFORGE_CLERK_JWT_TEMPLATE: 'A_9-'.repeat(16) }).length, 64);
});

test('invalid configured templates fail closed instead of falling back to another signing context', () => {
  for (const value of ['', ' x', 'x ', 'a.b', 'a\nb', 'a\n', 'x'.repeat(65)]) {
    assert.throws(() => insforgeJwtTemplate({ INSFORGE_CLERK_JWT_TEMPLATE: value }), /Invalid InsForge JWT template/);
  }
});

function connection({ active = true, template = 'insforge-pandabyte-migration', token = 'synthetic-user-token' } = {}) {
  const calls = [];
  const env = { NEXT_PUBLIC_INSFORGE_BASE_URL: 'https://fixture.invalid', INSFORGE_CLERK_JWT_TEMPLATE: template };
  const client = { database: {} };
  const factory = load('../lib/insforge/server.ts', {
    '@clerk/nextjs/server': { auth: async () => ({ isAuthenticated: active, sessionStatus: active ? 'active' : 'pending', getToken: async options => { calls.push({ kind: 'token', ...options }); return token; } }) },
    '@insforge/sdk': { createClient: options => { calls.push({ kind: 'client', ...options }); return client; } },
    './jwt-template': { insforgeJwtTemplate: () => insforgeJwtTemplate(env) },
  }, env);
  return { ...factory, calls, client };
}

test('server client uses configured template and the existing user token on the existing backend', async () => {
  const fixture = connection();
  assert.equal(await fixture.createInsforgeServerClient(), fixture.client);
  assert.equal(JSON.stringify(fixture.calls), JSON.stringify([
    { kind: 'token', template: 'insforge-pandabyte-migration' },
    { kind: 'client', baseUrl: 'https://fixture.invalid', accessToken: 'synthetic-user-token' },
  ]));
});

test('inactive session, invalid template and absent token never create a database client', async () => {
  for (const options of [{ active: false }, { template: '' }, { token: null }]) {
    const fixture = connection(options);
    await assert.rejects(fixture.createInsforgeServerClient());
    assert.equal(fixture.calls.some(call => call.kind === 'client'), false);
    if (options.active === false || options.template === '') assert.equal(fixture.calls.length, 0);
  }
});
