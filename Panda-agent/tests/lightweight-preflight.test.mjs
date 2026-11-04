import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { inspectDependencies } from '../scripts/lightweight-preflight.mjs';

test('checks referenced RPC definitions in local SQL without accepting comments', t => {
  const root = mkdtempSync(join(tmpdir(), 'panda-preflight-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src/server'), { recursive: true });
  mkdirSync(join(root, 'src/retrieval'), { recursive: true });
  mkdirSync(join(root, 'migrations'));
  writeFileSync(join(root, 'src/server/chat-store.ts'), "rpc('chat_read', {}); rpc('chat_create', {});");
  writeFileSync(join(root, 'src/retrieval/insforge-adapters.ts'), "rpc(client, 'panda_agent_runtime_scope');");
  const sql = join(root, 'migrations/001.sql');
  const definitions = ['chat_read', 'chat_create', 'runtime_scope'].map(name => `CREATE OR REPLACE FUNCTION public.panda_agent_${name}() RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;`).join('\n');
  writeFileSync(sql, definitions);
  assert.deepEqual(inspectDependencies(root), []);
  writeFileSync(sql, definitions.replace(/CREATE OR REPLACE FUNCTION public\.panda_agent_chat_create[^\n]*/, '-- CREATE FUNCTION public.panda_agent_chat_create() RETURNS void;'));
  assert.deepEqual(inspectDependencies(root), ['missing definition: public.panda_agent_chat_create']);
  rmSync(sql);
  assert.ok(inspectDependencies(root).includes('missing SQL migrations: migrations'));
  rmSync(join(root, 'src/server/chat-store.ts'));
  assert.ok(inspectDependencies(root).includes('missing source: src/server/chat-store.ts'));
});
