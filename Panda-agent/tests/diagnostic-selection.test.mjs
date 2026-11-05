import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSelectionGuard, updateMatchingAsset } from '../src/ui/diagnostic-selection.ts';

test('a transfer invalidates pending async selection and only updates its captured asset', async () => {
  const guard = createSelectionGuard();
  const selection = guard.begin();
  let release;
  const pending = new Promise(resolve => { release = resolve; }).then(() => guard.current(selection) ? 'replacement' : 'kept');
  guard.invalidate();
  release();
  assert.equal(await pending, 'kept');
  assert.equal(guard.current(selection), false);
  const a = { assetId: 'a', state: 'local' }, b = { assetId: 'b', state: 'local' };
  assert.deepEqual(updateMatchingAsset(a, 'a', item => ({ ...item, state: 'ready' })), { assetId: 'a', state: 'ready' });
  assert.equal(updateMatchingAsset(b, 'a', item => ({ ...item, state: 'ready' })), b);
  assert.equal(updateMatchingAsset(null, 'a', item => item), null);
});
