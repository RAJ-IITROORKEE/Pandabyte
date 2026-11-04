import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';
import { createBaselineProxy } from '../scripts/browser-baseline-proxy.mjs';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const request = (port, path, options = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path, ...options }, res => {
    const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
  }); req.on('error', reject); req.end();
});

test('local proxy instruments HTML, preserves compressed assets, and reports sanitized evidence', async t => {
  const root = mkdtempSync(join(tmpdir(), 'panda-proxy-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const js = Buffer.from('console.log("fixture");'), compressed = gzipSync(js);
  mkdirSync(join(root, 'static/chunks'), { recursive: true }); writeFileSync(join(root, 'static/chunks/a.js'), js);
  const upstream = http.createServer((req, res) => {
    if (req.url === '/' && req.headers.rsc) { res.setHeader('Content-Type', 'text/x-component'); res.end('fixture'); }
    else if (req.url === '/') { assert.equal(req.headers.cookie, 'private-cookie=secret'); assert.equal(req.headers.host, 'localhost:3001'); res.setHeader('Content-Type', 'text/html'); res.setHeader('Content-Security-Policy', "script-src 'self' 'nonce-YWJjMTIz' 'strict-dynamic'"); res.end('<html><head><script src="/_next/static/chunks/a.js"></script></head></html>'); }
    else if (req.url === '/panda-agent') { res.setHeader('Content-Type', 'text/html'); res.setHeader('Content-Security-Policy', "script-src 'self'"); res.end('<html><head></head></html>'); }
    else { res.setHeader('Content-Encoding', 'gzip'); res.setHeader('ETag', 'secret-tag'); res.end(compressed); }
  });
  const upstreamPort = await listen(upstream); t.after(() => upstream.close());
  const proxy = createBaselineProxy({ upstreamHost: '127.0.0.1', upstreamPort, buildDir: root }); const port = await listen(proxy); t.after(() => proxy.close());
  const html = await request(port, '/', { headers: { cookie: 'private-cookie=secret', host: 'localhost:3001', accept: 'text/html' } });
  assert.equal(html.status, 200); assert.equal(html.headers['content-security-policy'], "script-src 'self' 'nonce-YWJjMTIz' 'strict-dynamic'");
  assert.ok(html.body.indexOf('LOCAL MEASUREMENT') < html.body.indexOf('/_next/static/chunks/a.js'));
  assert.equal(html.headers['cache-control'], 'no-store');
  const inline = /<script nonce="YWJjMTIz">([\s\S]*?)<\/script>/.exec(html.body.toString());
  assert.doesNotThrow(() => new Function(inline[1]));
  const runSensor = available => {
    let tick, now = 10, state;
    const nodes = [];
    const root = { setAttribute: (_name, value) => { state = value; }, append: node => nodes.push(node) };
    const document = { readyState: 'complete', documentElement: root, body: root, createElement: () => ({ append(...children) { this.children = children; } }) };
    const performance = { now: () => now, setResourceTimingBufferSize() {}, addEventListener() {}, getEntriesByType: type => type === 'resource' ? [{ name: 'http://localhost:3001/_next/static/chunks/a.js', transferSize: 100, encodedBodySize: 70, decodedBodySize: 80, startTime: 1, responseEnd: 2, workerStart: 0 }] : [{ startTime: 0, loadEventEnd: 5 }] };
    const context = { document, performance, location: { origin: 'http://localhost:3001', pathname: '/' }, navigator: { userAgent: 'fixture' }, innerWidth: 800, innerHeight: 600, URL, setInterval: fn => { tick = fn; return 1; }, clearInterval() {}, addEventListener() { throw new Error('complete page should not wait for load'); } };
    if (available) context.PerformanceObserver = class { observe() {} disconnect() {} };
    runInNewContext(inline[1], context);
    if (available) { assert.equal(state, 'running'); now = 3011; tick(); }
    return { state, panel: nodes[0] };
  };
  const measured = runSensor(true);
  assert.equal(measured.state, 'complete');
  const browserReport = JSON.parse(measured.panel.children[1].textContent);
  assert.equal(browserReport.capture.initialReadyState, 'complete');
  assert.equal(browserReport.firstParty.cacheMissEvidence, true);
  const unavailable = runSensor(false);
  assert.equal(unavailable.state, 'error');
  assert.equal(unavailable.panel.children[0].textContent, 'LOCAL MEASUREMENT ERROR');
  const asset = await request(port, '/_next/static/chunks/a.js');
  assert.deepEqual(asset.body, compressed); assert.equal(asset.headers['content-encoding'], 'gzip');
  assert.equal(asset.headers['cache-control'], 'no-store'); assert.equal(asset.headers.etag, undefined);
  assert.equal((await request(port, '/', { headers: { rsc: '1', accept: 'text/html' } })).body.toString(), 'fixture');
  const report = await request(port, '/__panda-baseline/report'); const text = report.body.toString(); const data = JSON.parse(text);
  assert.equal(data.assets[0].decodedSha256, createHash('sha256').update(js).digest('hex'));
  assert.equal(data.assets[0].localSha256, data.assets[0].decodedSha256); assert.equal(data.assets[0].rawBytes, compressed.length);
  assert.deepEqual([data.started, data.completed, data.inFlight, data.failed, data.assetOverflow, data.counterOverflow], [1, 1, 0, 0, false, false]);
  assert.equal(data.probeBytes, Buffer.byteLength(inline[0])); assert.ok(!text.includes('private-cookie')); assert.ok(!text.includes('secret-tag')); assert.ok(!text.includes('YWJjMTIz'));
  assert.equal((await request(port, '/', { method: 'POST' })).status, 405);
  assert.equal((await request(port, '/' + 'a'.repeat(4096))).status, 414);
  assert.equal((await request(port, '/__panda-baseline/report', { method: 'HEAD' })).body.length, 0);
  const blocked = await request(port, '/panda-agent', { headers: { accept: 'text/html' } });
  assert.equal(blocked.status, 502); assert.equal(blocked.headers['content-security-policy'], "script-src 'self'");
  const blockedReport = JSON.parse((await request(port, '/__panda-baseline/report')).body.toString());
  assert.equal(blockedReport.measurementError, 'Inline measurement blocked by Content Security Policy');
});

test('tracks an actual in-flight asset until its response completes', async t => {
  let release, markReceived;
  const received = new Promise(resolve => { markReceived = resolve; });
  const upstream = http.createServer((req, res) => {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<html><head></head><body></body></html>'); }
    else { release = () => res.end('fixture'); markReceived(); }
  });
  const upstreamPort = await listen(upstream); t.after(() => upstream.close());
  const proxy = createBaselineProxy({ upstreamHost: '127.0.0.1', upstreamPort }); const port = await listen(proxy); t.after(() => proxy.close());
  await request(port, '/', { headers: { accept: 'text/html', cookie: 'private=not-in-report' } });
  const asset = request(port, '/_next/static/chunks/held.js');
  await received;
  const pendingText = (await request(port, '/__panda-baseline/report')).body.toString();
  const pending = JSON.parse(pendingText);
  assert.deepEqual([pending.started, pending.completed, pending.inFlight, pending.failed], [1, 0, 1, 0]);
  assert.ok(!pendingText.includes('not-in-report'));
  release(); await asset;
  const done = JSON.parse((await request(port, '/__panda-baseline/report')).body.toString());
  assert.deepEqual([done.started, done.completed, done.inFlight, done.failed, done.assetOverflow, done.counterOverflow], [1, 1, 0, 0, false, false]);
});

test('rejects non-loopback and invalid upstream ports', () => {
  assert.throws(() => createBaselineProxy({ upstreamHost: 'example.com' }), TypeError);
  for (const upstreamPort of [0, -1, 65536, 1.5, '3012']) assert.throws(() => createBaselineProxy({ upstreamPort }), TypeError);
});
