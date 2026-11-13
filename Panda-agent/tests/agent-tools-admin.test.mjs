// Admin tool controls: settings parsing, PATCH body validation, Tavily usage parsing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_SETTING_NAMES, DEFAULT_TOOL_SETTINGS, TOOL_CATALOG, parseToolSettings, parseToolPatch } from '../src/agent-loop/tool-catalog.ts';
import { fetchTavilyUsage } from '../src/search/tavily-usage.ts';

test('parseToolSettings falls back to defaults for non-arrays, unknown names and malformed rows', () => {
  for (const raw of [null, undefined, {}, 'x', 7]) {
    const s = parseToolSettings(raw);
    for (const n of TOOL_SETTING_NAMES) assert.deepEqual(s[n], { enabled: DEFAULT_TOOL_SETTINGS[n], version: null });
  }
  assert.equal(DEFAULT_TOOL_SETTINGS.web_helper, false);
  const s = parseToolSettings([
    { name: 'web_search', enabled: false, version: 3, updatedAt: 'x' },
    { name: 'web_helper', enabled: true, version: 2 },
    { name: 'bogus', enabled: false, version: 1 },
    { name: 'plan', enabled: 'no', version: 1 },
    { name: 'load_skill', enabled: false, version: 0 },
    null, 'row',
  ]);
  assert.deepEqual(s.web_search, { enabled: false, version: 3 });
  assert.deepEqual(s.web_helper, { enabled: true, version: 2 });
  assert.deepEqual(s.plan, { enabled: true, version: null });
  assert.deepEqual(s.load_skill, { enabled: true, version: null });
  assert.equal('bogus' in s, false);
});

test('every optional catalog entry maps to a setting name and required ones do not', () => {
  for (const t of TOOL_CATALOG) assert.equal(t.required, t.setting === null);
  assert.deepEqual(TOOL_CATALOG.filter(t => t.setting).map(t => t.setting).sort(), [...TOOL_SETTING_NAMES].sort());
});

test('parseToolPatch accepts exactly {name, enabled, expectedVersion}', () => {
  assert.deepEqual(parseToolPatch({ name: 'plan', enabled: false, expectedVersion: 2 }), { name: 'plan', enabled: false, expectedVersion: 2 });
  for (const bad of [null, [], 'x', {}, { name: 'plan', enabled: true },
    { name: 'plan', enabled: true, expectedVersion: 1, extra: 1 },
    { name: 'search_catalog', enabled: false, expectedVersion: 1 },
    { name: 'plan', enabled: 'true', expectedVersion: 1 },
    { name: 'plan', enabled: true, expectedVersion: 0 },
    { name: 'plan', enabled: true, expectedVersion: 1.5 },
    { name: 'plan', enabled: true, expectedVersion: '1' }]) assert.equal(parseToolPatch(bad), null);
});

const reply = (status, body) => async (url, init) => { reply.last = { url, init }; return new Response(JSON.stringify(body), { status }); };

test('Tavily usage parses the full response and sends the bearer key without following redirects', async () => {
  const f = reply(200, { key: { usage: 150, limit: 1000, search_usage: 120 }, account: { current_plan: 'Researcher', plan_usage: 150, plan_limit: 1000 } });
  const u = await fetchTavilyUsage('tvly-secret', { fetcher: f });
  assert.deepEqual(u, { keyUsage: 150, keyLimit: 1000, searchUsage: 120, plan: 'Researcher', planUsage: 150, planLimit: 1000 });
  assert.equal(reply.last.url, 'https://api.tavily.com/usage');
  assert.equal(reply.last.init.headers.authorization, 'Bearer tvly-secret');
  assert.equal(reply.last.init.redirect, 'error');
});

test('Tavily usage tolerates partial bodies and rejects non-200 without leaking the key', async () => {
  assert.deepEqual(await fetchTavilyUsage('k', { fetcher: reply(200, { account: { plan_usage: 'x', plan_limit: null } }) }),
    { keyUsage: null, keyLimit: null, searchUsage: null, plan: null, planUsage: null, planLimit: null });
  await assert.rejects(fetchTavilyUsage('tvly-secret', { fetcher: reply(401, {}) }), e => /401/.test(e.message) && !e.message.includes('tvly-secret'));
});
