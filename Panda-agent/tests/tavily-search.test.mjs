import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { searchPublicWeb } from '../src/search/tavily.ts';

const response = (results) => new Response(JSON.stringify({ results }), { status: 200, headers: { 'content-type': 'application/json' } });
const item = { url: 'https://docs.public-site.org/guide', title: 'Guide', content: 'Exact snippet' };
const publicDns = async () => [{ address: '8.8.8.8', family: 4 }];
async function fixture(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tavily-test-'));
  try { await fn({ apiKey: 'test-key', enabled: true, freeOnly: true, ledgerDir: dir, lookupImpl: publicDns }); } finally { await rm(dir, { recursive: true, force: true }); }
}

test('sends bounded basic request and preserves exact snippet', async () => fixture(async (options) => {
  let request;
  const sources = await searchPublicWeb('public documentation', { ...options, now: () => new Date('2026-01-01T00:00:00Z'), fetchImpl: async (url, init) => { request = { url, init }; return response([item]); } });
  assert.equal(request.url, 'https://api.tavily.com/search');
  assert.equal(request.init.redirect, 'error');
  assert.deepEqual(JSON.parse(request.init.body), { query: 'public documentation', search_depth: 'basic', max_results: 3, include_answer: false, include_raw_content: false, include_images: false, auto_parameters: false });
  assert.equal(sources[0].content, item.content);
  assert.match(sources[0].handle, /^web:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/);
  assert.equal(sources[0].capturedAt, '2026-01-01T00:00:00.000Z');
}));

test('rejects private queries before reservation', async () => fixture(async (options) => {
  for (const query of ['email me at person@example.com', 'https://private.example/a', 'tvly-1234567890', 'x'.repeat(401)]) await assert.rejects(searchPublicWeb(query, options), /Invalid/);
  await assert.rejects(readFile(path.join(options.ledgerDir, 'quota.json')), { code: 'ENOENT' });
}));

test('only returns safe public HTTPS domains with all-public DNS', async () => fixture(async (options) => {
  const mixed = async (host) => host === 'bad.public-site.org' ? [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }] : publicDns();
  for (const url of ['http://docs.public-site.org/', 'https://127.0.0.1/', 'https://docs.public-site.org/?token=secret', 'https://bad.public-site.org/', 'https://docs.public-site.org/#secret']) {
    assert.deepEqual(await searchPublicWeb('public guide', { ...options, lookupImpl: mixed, fetchImpl: async () => response([{ ...item, url }]) }), []);
  }
}));

test('failure consumes quota and the cap persists', async () => fixture(async (options) => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('provider detail'); };
  for (let i = 0; i < 10; i++) await assert.rejects(searchPublicWeb('public guide', { ...options, fetchImpl }), /Web search failed/);
  await assert.rejects(searchPublicWeb('public guide', { ...options, fetchImpl }), /quota exhausted/);
  assert.equal(calls, 10);
}));

test('fails closed on corrupt ledger and invalid or oversized response', async () => fixture(async (options) => {
  await writeFile(path.join(options.ledgerDir, 'quota.json'), '{');
  await assert.rejects(searchPublicWeb('public guide', options), /ledger unavailable/);
  await rm(path.join(options.ledgerDir, 'quota.json'));
  await assert.rejects(searchPublicWeb('public guide', { ...options, fetchImpl: async () => response([{ ...item, content: 'a'.repeat(6001) }]) }), /Web search failed/);
  await assert.rejects(searchPublicWeb('public guide', { ...options, fetchImpl: async () => new Response('x'.repeat(1024 * 1024 + 1), { headers: { 'content-type': 'application/json' } }) }), /Web search failed/);
}));

test('rejects invalid content type and cancels error body', async () => fixture(async (options) => {
  await assert.rejects(searchPublicWeb('public guide', { ...options, fetchImpl: async () => new Response('{}') }), /Web search failed/);
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  await assert.rejects(searchPublicWeb('public guide', { ...options, fetchImpl: async () => new Response(body, { status: 500 }) }), /Web search failed/);
  assert.equal(cancelled, true);
}));

test('deduplicates URLs and excludes overlong URLs', async () => fixture(async (options) => {
  const sources = await searchPublicWeb('public guide', { ...options, fetchImpl: async () => response([item, { ...item, content: 'Different snippet' }, { ...item, url: `https://docs.public-site.org/${'a'.repeat(500)}` }]) });
  assert.equal(sources.length, 1);
  assert.equal(sources[0].content, item.content);
}));

test('stalled DNS resolution is bounded', async () => fixture(async (options) => {
  const start = Date.now();
  const sources = await searchPublicWeb('public guide', { ...options, lookupImpl: () => new Promise(() => {}), fetchImpl: async () => response([item]) });
  assert.deepEqual(sources, []);
  assert.ok(Date.now() - start < 5000);
}));
