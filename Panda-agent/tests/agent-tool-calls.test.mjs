import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolGroupSummary } from '../src/ui/agent/tool-summary.ts';

const call = (id, state, durationMs) => ({ id, name: `tool_${id}`, label: 'label', state, ...(durationMs === undefined ? {} : { durationMs }) });

test('empty list has no summary', () => {
  assert.equal(toolGroupSummary([], true), '');
  assert.equal(toolGroupSummary([], false), '');
});

test('live with a running call shows the summed known durations', () => {
  const calls = [call('a', 'complete', 500), call('b', 'running'), call('c', 'complete', 700)];
  assert.equal(toolGroupSummary(calls, true), 'Using tools · 1.2s');
});

test('live with a running call and no known durations omits the time part', () => {
  assert.equal(toolGroupSummary([call('a', 'running')], true), 'Using tools');
});

test('finished group uses singular and plural tool counts with a duration', () => {
  assert.equal(toolGroupSummary([call('a', 'complete', 1200)], false), 'Used 1 tool · 1.2s');
  const calls = [call('a', 'complete', 1000), call('b', 'failed', 1400), call('c', 'unknown')];
  assert.equal(toolGroupSummary(calls, false), 'Used 3 tools · 2.4s');
});

test('running group that is no longer live reads as finished', () => {
  assert.equal(toolGroupSummary([call('a', 'running')], false), 'Used 1 tool');
});

test('no known durations omits the duration part', () => {
  assert.equal(toolGroupSummary([call('a', 'complete'), call('b', 'failed')], false), 'Used 2 tools');
});
