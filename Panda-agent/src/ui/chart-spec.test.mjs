import assert from 'node:assert/strict';
import test from 'node:test';
import { parseChartSpec } from './chart-spec.ts';

const ok = { type: 'bar', title: 'T', x: ['a', 'b'], series: [{ name: 's', values: [1, 2] }] };
const parse = value => parseChartSpec(typeof value === 'string' ? value : JSON.stringify(value));

test('accepts a valid spec', () => assert.deepEqual(parse(ok), ok));
test('rejects invalid JSON, extra keys and bad type', () => {
  assert.equal(parse('{nope'), null);
  assert.equal(parse({ ...ok, extra: 1 }), null);
  assert.equal(parse({ ...ok, series: [{ name: 's', values: [1, 2], color: 'red' }] }), null);
  assert.equal(parse({ ...ok, type: 'pie' }), null);
});
test('rejects too many points, series and long labels', () => {
  const x = Array.from({ length: 51 }, (_, i) => String(i));
  assert.equal(parse({ ...ok, x, series: [{ name: 's', values: x.map(() => 1) }] }), null);
  assert.equal(parse({ ...ok, series: Array.from({ length: 5 }, () => ({ name: 's', values: [1, 2] })) }), null);
  assert.equal(parse({ ...ok, x: ['a'.repeat(41), 'b'] }), null);
});
test('rejects mismatched lengths and non-finite numbers', () => {
  assert.equal(parse({ ...ok, series: [{ name: 's', values: [1] }] }), null);
  assert.equal(parse('{"type":"bar","x":["a"],"series":[{"name":"s","values":[NaN]}]}'), null);
  assert.equal(parse({ ...ok, series: [{ name: 's', values: [1, null] }] }), null);
  assert.equal(parse({ ...ok, series: [{ name: 's', values: [1, '2'] }] }), null);
});
