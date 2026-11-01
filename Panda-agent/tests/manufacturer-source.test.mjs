import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findManufacturerSource, fetchManufacturerSource, isPublicIPv4 } from '../src/manufacturer/espressif.ts';
const html = '<html><nav>untrusted navigation</nav><div role="main"><h1>ESP32-C3</h1><script>bad code</script><form>bad form</form><section><h2>Introduction</h2><p>ESP32-C3 supports Wi-Fi and Bluetooth Low Energy.</p><p>Processor has a RISC-V core.</p></section></div><footer>not content</footer></html>';
const descriptor = () => findManufacturerSource('What does Espressif say about ESP32-C3 Wi-Fi?');
const transport = (body = html) => ({ resolve: async () => ['8.8.8.8'], request: async () => ({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: Buffer.from(body) }) });
test('catalog requires explicit manufacturer and exactly one known chip', () => {
  assert.equal(findManufacturerSource('ESP32-C3 Wi-Fi'), null);
  assert.equal(findManufacturerSource('Espressif ESP32 and ESP32-C3'), null);
  assert.equal(findManufacturerSource('Espressif ESP32-C2'), null);
  assert.match(descriptor().sourceUrl, /^https:\/\/docs\.espressif\.com\//);
});
test('only public IPv4 destinations are accepted', () => {
  for (const ip of ['0.1.2.3','10.0.0.1','100.64.1.1','127.0.0.1','169.254.1.1','172.16.0.1','192.168.1.1','192.0.2.1','198.18.0.1','198.51.100.1','203.0.113.1','224.0.0.1','255.255.255.255','::1','1.2.3']) assert.equal(isPublicIPv4(ip), false, ip);
  assert.equal(isPublicIPv4('8.8.8.8'), true);
});
test('extracts bounded main content, binds content hashes and excludes active/navigation HTML', async () => {
  const result = await fetchManufacturerSource(descriptor(), transport(), 'Wi-Fi');
  assert.equal(result.sourceUrl, descriptor().sourceUrl); assert.match(result.contentHash, /^[a-f0-9]{64}$/);
  assert.ok(result.fragments.length > 0 && result.fragments.length <= 8);
  assert.ok(result.fragments.every(f => /^espressif:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/.test(f.handle)));
  const text = result.fragments.map(f => f.text).join(' ');
  assert.match(text, /Wi-Fi/); assert.doesNotMatch(text, /navigation|bad code|bad form|not content/);
});
test('rejects forged descriptor, forbidden redirect, private DNS and non-HTML or oversized response', async () => {
  await assert.rejects(fetchManufacturerSource({ ...descriptor(), sourceUrl: 'https://evil.example/' }, transport()));
  await assert.rejects(fetchManufacturerSource(descriptor(), { ...transport(), resolve: async () => ['8.8.8.8', '127.0.0.1'] }));
  await assert.rejects(fetchManufacturerSource(descriptor(), { ...transport(), request: async () => ({ status: 302, headers: { location: 'https://evil.example/' }, body: Buffer.alloc(0) }) }));
  await assert.rejects(fetchManufacturerSource(descriptor(), { ...transport(), request: async () => ({ status: 200, headers: { 'content-type': 'application/pdf' }, body: Buffer.from('bad') }) }));
  await assert.rejects(fetchManufacturerSource(descriptor(), transport('x'.repeat(1048577))));
});

test('pins the selected resolved address and never sends the question in the URL', async () => {
  const seen = [];
  const t = { resolve: async host => { seen.push(host); return ['8.8.8.8']; }, request: async (url, address) => { seen.push(url, address); return { status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from(html) }; } };
  await fetchManufacturerSource(descriptor(), t, 'private question Wi-Fi');
  assert.deepEqual(seen, ['docs.espressif.com', descriptor().sourceUrl, '8.8.8.8']);
});
test('redirects are revalidated and bounded, and main content is mandatory', async () => {
  let calls = 0;
  const repeat = { ...transport(), request: async () => { calls++; return { status: 302, headers: { location: descriptor().sourceUrl }, body: Buffer.alloc(0) }; } };
  await assert.rejects(fetchManufacturerSource(descriptor(), repeat)); assert.equal(calls, 3);
  await assert.rejects(fetchManufacturerSource(descriptor(), transport('<html><p>no main</p></html>')));
  await assert.rejects(fetchManufacturerSource(descriptor(), { ...transport(), request: async () => ({ status: 200, headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' }, body: Buffer.from(html) }) }));
});

test('question ranking selects the requested Wi-Fi fragment over repeated chip labels', async () => {
  const document = `<div role="main">${Array.from({length: 10}, (_, i) => `<p>ESP32-C3 generic item ${i}</p>`).join('')}<p>Wi-Fi 2.4 GHz band</p></div>`;
  const result = await fetchManufacturerSource(descriptor(), transport(document), 'What does Espressif say about ESP32-C3 Wi-Fi?');
  assert.ok(result.fragments.some(f => f.text.includes('Wi-Fi 2.4 GHz band')));
});
