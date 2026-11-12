import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINEERING_CANDIDATES, ENGINEERING_MANIFEST, PRODUCT_MEMBERSHIP } from '../src/retrieval/engineering-proof.ts';

test('every accepted candidate covers all 42 products and its proofs add up to its member count', () => {
  assert.deepEqual(Object.values(ENGINEERING_CANDIDATES).map(c => c.count), [284, 285, 290]);
  for (const [manifest, { count, proofs }] of Object.entries(ENGINEERING_CANDIDATES)) {
    assert.match(manifest, /^[0-9a-f]{64}$/);
    assert.equal(Object.keys(proofs).length, 42, manifest);
    assert.equal(Object.values(proofs).reduce((n, p) => n + p.count, 0), count, manifest);
    for (const p of Object.values(proofs)) assert.match(p.digest, /^[0-9a-f]{64}$/);
  }
});

test('later candidates only change the products that gained passages', () => {
  const [oldest, mid, newest] = Object.values(ENGINEERING_CANDIDATES);
  const changed = (a, b) => Object.keys(a.proofs).filter(k => a.proofs[k].digest !== b.proofs[k].digest);
  assert.equal(changed(oldest, mid).length, 1);
  assert.equal(changed(mid, newest).length, 5);
  assert.equal(ENGINEERING_CANDIDATES[ENGINEERING_MANIFEST].proofs, PRODUCT_MEMBERSHIP);
});
