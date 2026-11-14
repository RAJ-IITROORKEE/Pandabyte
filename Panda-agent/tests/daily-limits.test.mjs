// Daily limits: PATCH body, admin rows, usage result and the limit-reached message.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLimitPatch, parseLimitRows, parseDailyUsage, limitReachedText, LIMIT_NAMES } from '../src/agent-loop/daily-limits.ts';

test('parseLimitPatch accepts exactly {name, perDay, expectedVersion} with perDay 0..10000', () => {
  assert.deepEqual(parseLimitPatch({ name: 'compiles', perDay: 0, expectedVersion: 1 }), { name: 'compiles', perDay: 0, expectedVersion: 1 });
  assert.equal(parseLimitPatch({ name: 'web_searches', perDay: 10000, expectedVersion: 3 })?.perDay, 10000);
  for (const bad of [null, [], 'x', {}, { name: 'compiles', perDay: 5 },
    { name: 'compiles', perDay: 5, expectedVersion: 1, extra: 1 },
    { name: 'plan', perDay: 5, expectedVersion: 1 },
    { name: 'compiles', perDay: -1, expectedVersion: 1 }, { name: 'compiles', perDay: 10001, expectedVersion: 1 },
    { name: 'compiles', perDay: 1.5, expectedVersion: 1 }, { name: 'compiles', perDay: '5', expectedVersion: 1 },
    { name: 'compiles', perDay: 5, expectedVersion: 0 }, { name: 'compiles', perDay: 5, expectedVersion: '1' }]) assert.equal(parseLimitPatch(bad), null);
});

test('parseLimitRows needs one valid row per name and returns them in fixed order', () => {
  const rows = [...LIMIT_NAMES].reverse().map((name, i) => ({ name, perDay: i, version: 1, updatedAt: '2026-11-14T00:00:00Z' }));
  assert.deepEqual(parseLimitRows(rows).map(r => r.name), [...LIMIT_NAMES]);
  assert.equal(parseLimitRows(rows.slice(1)), null);
  assert.equal(parseLimitRows([...rows.slice(1), { name: 'compiles', perDay: 99999, version: 1 }]), null);
  assert.equal(parseLimitRows({}), null);
  assert.equal(parseLimitRows(null), null);
});

test('parseDailyUsage validates the exact RPC shape', () => {
  const ok = { unlimited: false, limits: { paid_messages: 20, free_messages: 60, web_searches: 20, compiles: 10 }, used: { paid_messages: 3, free_messages: 0, web_searches: 1, compiles: 0 } };
  assert.deepEqual(parseDailyUsage(ok), ok);
  assert.equal(parseDailyUsage({ ...ok, unlimited: 'no' }), null);
  assert.equal(parseDailyUsage({ ...ok, used: { ...ok.used, compiles: -1 } }), null);
  assert.equal(parseDailyUsage({ ...ok, limits: { ...ok.limits, compiles: 1.5 } }), null);
  assert.equal(parseDailyUsage({ ...ok, limits: { paid_messages: 1 } }), null);
  assert.equal(parseDailyUsage(null), null);
});

test('limit-reached text names the tier, the number when known, and links contact', () => {
  const url = 'https://x.test/contact';
  assert.match(limitReachedText('paid', 20, url), /limit of 20 messages on paid models.*\*\*Free models\*\*.*\[contact us\]\(https:\/\/x\.test\/contact\)/);
  assert.doesNotMatch(limitReachedText('free', 60, url), /switch to/);
  assert.match(limitReachedText('free', 60, url), /limit of 60 messages on Free models/);
  assert.match(limitReachedText('paid', null, url), /today's message limit on paid models/);
});
