import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionSources } from '../src/ui/agent/overview-data.ts';

test('session sources merge repeats and sort by use', () => {
  const s = sessionSources([{ title: 'A', domain: 'a.com', href: 'https://a.com', web: true }, { title: 'B', domain: 'pandabyte.in', web: false }, { title: 'A', domain: 'a.com', href: 'https://a.com', web: true }]);
  assert.deepEqual(s.map(x => [x.title, x.uses]), [['A', 2], ['B', 1]]);
});
