import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityDays, monthCounts, relativeTime, sessionSources } from '../src/ui/agent/overview-data.ts';

const now = new Date(2026, 10, 12, 15).getTime();
const at = (daysAgo, hour = 10) => new Date(2026, 10, 12 - daysAgo, hour).toISOString();

test('activity days cover the window, count by local day and skip old or bad dates', () => {
  const days = activityDays([at(0), at(0, 2), at(3), at(200), 'bad'], now, 2);
  assert.equal(days.length, 14);
  assert.equal(days.at(-1).count, 2);
  assert.equal(days.at(-4).count, 1);
  assert.equal(days.reduce((n, d) => n + d.count, 0), 3);
});

test('month counts split this and last month', () => {
  assert.deepEqual(monthCounts([at(0), at(11), at(12), at(40), at(80)], now), { thisMonth: 2, lastMonth: 2 });
});

test('relative time reads naturally', () => {
  assert.equal(relativeTime(new Date(now - 30_000).toISOString(), now), 'Just now');
  assert.equal(relativeTime(new Date(now - 5 * 60_000).toISOString(), now), '5 min ago');
  assert.equal(relativeTime(new Date(now - 3 * 3_600_000).toISOString(), now), '3 h ago');
  assert.equal(relativeTime(new Date(now - 26 * 3_600_000).toISOString(), now), 'Yesterday');
  assert.equal(relativeTime('nope', now), '');
});

test('session sources merge repeats and sort by use', () => {
  const s = sessionSources([{ title: 'A', domain: 'a.com', href: 'https://a.com', web: true }, { title: 'B', domain: 'pandabyte.in', web: false }, { title: 'A', domain: 'a.com', href: 'https://a.com', web: true }]);
  assert.deepEqual(s.map(x => [x.title, x.uses]), [['A', 2], ['B', 1]]);
});
