import test from 'node:test';
import assert from 'node:assert/strict';
import { isPandabyteQuery, selectPandabytePages, pandabytePageText, searchPandabyteSite, resetPandabyteSitemap, stripPrices, createPandabyteCatalog, catalogContent } from '../src/search/pandabyte-site.ts';
import { researchSearchMCP, verifyResearchAnswer } from '../src/server/research-search-broker.ts';
import { hashResearchJSON } from '../src/server/research-runtime-store.ts';

const base = 'https://www.pandabyte.in/product-page/';
const products = ['pandabyte-xs3-esp32-s3-microcontroller-board-arduino-compatible', 'pandabyte-xc3-esp32c3-microcontroller-board-arduino-compatible',
  'pandabyte-xc3m-esp32-c3-microcontroller-board', 'pandabyte-x8266-wifi-development-board', 'maker-uno-simplifying-arduino-for-education',
  'temperature-humidity-dht11-grove-sensor'].map(s => base + s);
const page = (title, body) => `<html><head><title>${title} | PandaByte.in</title><script>var secret="x"</script></head><body><nav>top of page Minimum Order Value About Log In </nav>`
  + `<main>Home All Products ${body}</main><footer> Need Help? Check Out Our Help Center Office Location 39, Abhishek Nagar</footer></body></html>`;

test('PandaByte queries are recognised by the brand or a product code; other queries stay on web search', () => {
  for (const q of ['pandabyte boards', 'PandaByte xS3 specs', 'xs3 psram', 'x8266 pinout', 'xC3m datasheet', 'maker uno guide']) assert.equal(isPandabyteQuery(q), true, q);
  for (const q of ['esp32 s3 datasheet', 'rp2040 pio examples', 'arduino uno pinout']) assert.equal(isPandabyteQuery(q), false, q);
});

test('named products select their own pages; broad queries select the matching category page', () => {
  assert.deepEqual(selectPandabytePages('pandabyte xs3 specs', products), [products[0]]);
  assert.deepEqual(selectPandabytePages('xc3 esp32-c3 board', products), [products[1]], 'xC3 is not xC3m');
  assert.deepEqual(selectPandabytePages('x8266 and xs3 compare', products).sort(), [products[0], products[3]].sort());
  assert.deepEqual(selectPandabytePages('pandabyte boards', products), ['https://www.pandabyte.in/category/microcontroller']);
  assert.deepEqual(selectPandabytePages('pandabyte sensors', products), ['https://www.pandabyte.in/category/sensors']);
  assert.deepEqual(selectPandabytePages('pandabyte products', products), ['https://www.pandabyte.in/category/all-products']);
  assert.deepEqual(selectPandabytePages('pandabyte', products), ['https://www.pandabyte.in/category/all-products']);
});

test('page text keeps the product body only: no scripts, navigation or footer; missing pages are null', () => {
  const p = pandabytePageText(page('PandaByte xS3 ESP32-S3 Development Board', 'Specifications: 16 MB FLASH 8 MB PSRAM &amp; Wi&shy;Fi 802.11 b/g/n SKU: ESPXS3 &#x20B9;1,000.00'));
  assert.equal(p.title, 'PandaByte xS3 ESP32-S3 Development Board');
  assert.match(p.content, /^Specifications: 16 MB FLASH 8 MB PSRAM & Wi Fi 802\.11 b\/g\/n SKU: ESPXS3/);
  assert.doesNotMatch(p.content, /secret|Log In|Need Help|Abhishek|Home All Products/);
  assert.equal(pandabytePageText(page('Product Page', 'This product couldn&#x27;t be found Continue Shopping')), null);
  assert.equal(pandabytePageText('<html><title>x</title>no markers</html>'), null);
  assert.ok(pandabytePageText(page('Big', 'word '.repeat(3000))).content.length <= 6000);
});

test('search: authorised before any fetch, only pandabyte.in, receipt is citable through the existing broker', async () => {
  resetPandabyteSitemap();
  const fetched = [], order = [];
  const xml = `<urlset>${products.map(u => `<url><loc>${u}</loc></url>`).join('')}<url><loc>https://evil.example/product-page/x</loc></url></urlset>`;
  const fetchImpl = async url => { order.push('fetch'); fetched.push(url);
    if (url.endsWith('store-products-sitemap.xml')) return new Response(xml, { headers: { 'content-type': 'application/xml' } });
    return new Response(page('PandaByte xS3 ESP32-S3 Development Board', 'Specifications: 16 MB FLASH 8 MB PSRAM Bluetooth 5 SKU: ESPXS3'), { headers: { 'content-type': 'text/html; charset=utf-8' } }); };
  const receipt = await searchPandabyteSite('pandabyte xs3 specs', { fetchImpl, beforeSend: async () => { order.push('grant'); return true; } });
  assert.deepEqual(order.slice(0, 2), ['grant', 'fetch'], 'the dispatch grant precedes any network');
  assert.ok(fetched.every(u => u.startsWith('https://www.pandabyte.in/')));
  assert.equal(receipt.provider, 'pandabyte_site'); assert.equal(receipt.sources.length, 1); assert.equal(receipt.sources[0].url, products[0]);
  const mcp = researchSearchMCP(receipt); assert.ok(mcp);
  const shown = JSON.parse(mcp.content[0].text); assert.equal(shown.sources[0].passages.length >= 1, true); assert.match(shown.sources[0].passages.map(p => p.text).join(''), /8 MB PSRAM/);

  const before = fetched.length;
  await searchPandabyteSite('pandabyte x8266 pinout', { fetchImpl, beforeSend: async () => true });
  assert.equal(fetched.slice(before).some(u => u.endsWith('sitemap.xml')), false, 'sitemap cached between turns');

  let calls = 0;
  await assert.rejects(searchPandabyteSite('pandabyte xs3', { fetchImpl: async () => { calls++; throw Error('x'); }, beforeSend: async () => false }), e => e.stage === 'not_sent');
  assert.equal(calls, 0, 'a denied grant sends nothing');
  await assert.rejects(searchPandabyteSite('rp2040 pio', { fetchImpl, beforeSend: async () => true }), e => e.stage === 'not_sent', 'not a PandaByte query');
  resetPandabyteSitemap();
  await assert.rejects(searchPandabyteSite('pandabyte xs3', { fetchImpl: async () => new Response('x', { status: 302, headers: { location: 'https://evil.example' } }), beforeSend: async () => true }), e => e.stage === 'unknown');
});

test('category listings become one line per product, with every price removed', () => {
  const p = pandabytePageText(page('Dev Boards', 'Browse by All Products Dev Boards Filter by Price ₹250 ₹3,203 11 products Sort by: Recommended '
    + 'PandaByte NodeMCU x8266 WiFi Development Board Price ₹250.00 PandaByte xC3 ESP32-C3 Development Board Price ₹350.00 '
    + 'PandaByte xLoRa ESP32 LoRaWAN Development Board with Battery and Solar Regular Price ₹3,500.00 Sale Price ₹3,000.00 1'));
  assert.deepEqual(p.content.split('\n'), ['PandaByte NodeMCU x8266 WiFi Development Board.', 'PandaByte xC3 ESP32-C3 Development Board.',
    'PandaByte xLoRa ESP32 LoRaWAN Development Board with Battery and Solar.']);
  assert.doesNotMatch(pandabytePageText(page('PandaByte xS3', 'Specifications: 16 MB FLASH 8 MB PSRAM SKU: ESPXS3 Price ₹1,000.00 Add to Cart')).content, /₹|1,000/);
});

test('prices are stripped in every listed form while part names and units stay', () => {
  for (const s of ['₹1,299.00', '₹ 250/-', 'Rs. 499', 'Price 250', '250 INR', 'MRP 499', 'Sale Price ₹99.00', 'Regular Price ₹3,500.00 Sale Price ₹3,000.00'])
    assert.doesNotMatch(stripPrices('Board ' + s + ' end'), /\d/, s);
  for (const s of ['RS485', 'RS 485 bus', 'MAX485', '3.3 V at 500 mA', '4MB flash', '0.96 inch', '868 MHz', 'GPIO 21 SDA']) assert.equal(stripPrices(s), s);
});

const catalogFetch = (over = {}) => { const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: init.body, auth: init.headers.authorization, redirect: init.redirect });
    const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/panda_agent_public_products')) return over.products ?? json({ items: [{ sku: 'ESPXS3', title: 'PandaByte xS3', sourceUrl: products[0] }, { sku: 'X8266', title: 'PandaByte x8266', sourceUrl: products[3] }] });
    if (url.endsWith('/panda_agent_public_passages')) { const sku = JSON.parse(init.body).p_sku;
      if (sku === 'NOPE') return json({ code: 'P0001', details: 'not_found' }, 400);
      return over.passages ?? json({ sku, title: 'PandaByte xS3 ESP32-S3 Development Board', passages: [{ text: 'Specifications:\nCPU and On' + String.fromCharCode(0xad) + 'Chip Memory\n • 16 MB FLASH\n • 8 MB PSRAM', capturedAt: '2026-10-30T03:09:47.468313+00:00' },
        { text: 'Price ₹1,000.00 Bluetooth 5 LE', capturedAt: '2026-10-31T01:00:00+00:00' }] }); }
    throw Error('unexpected ' + url); };
  return { calls, catalog: createPandabyteCatalog({ baseUrl: 'https://example.insforge.app', anonKey: 'anon-' + 'k'.repeat(40), fetchImpl }) }; };

test('catalog reader: public-key RPCs, cleaned passages, latest capture time, not_found, and fails closed on odd shapes', async () => {
  const { calls, catalog } = catalogFetch(), signal = AbortSignal.timeout(5000);
  assert.deepEqual((await catalog.products(signal)).map(p => p.sku), ['ESPXS3', 'X8266']);
  const p = await catalog.passages('ESPXS3', signal);
  assert.equal(p.text, 'Specifications:\nCPU and OnChip Memory\n• 16 MB FLASH\n• 8 MB PSRAM\nBluetooth 5 LE');
  assert.equal(await catalog.passages('NOPE', signal), null);
  assert.ok(calls.every(c => c.url.startsWith('https://example.insforge.app/api/database/rpc/') && c.auth === 'Bearer anon-' + 'k'.repeat(40) && c.redirect === 'error'));
  const json = v => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } });
  for (const products of [json({ items: [] }), json({ items: [{ sku: 'A', title: 'B', sourceUrl: 'https://evil.example/product-page/a' }] }), new Response('<html>', { headers: { 'content-type': 'text/html' } })])
    await assert.rejects(catalogFetch({ products }).catalog.products(signal));
  const mixed = await catalogFetch({ products: json({ items: [{ sku: 'A', title: 'B', sourceUrl: 'https://evil.example/product-page/a' }, { sku: 'ESPXS3', title: 'xS3', sourceUrl: products[0] }] }) }).catalog.products(signal);
  assert.deepEqual(mixed.map(p => p.sku), ['ESPXS3'], 'a malformed item is skipped, the rest kept');
  await assert.rejects(catalogFetch({ passages: json({ title: 'T', passages: [{ nope: 1 }] }) }).catalog.passages('ESPXS3', signal));
  const big400 = new Response('x'.repeat(10000), { status: 400, headers: { 'content-type': 'application/json' } });
  const fetchBig = async url => url.endsWith('_products') ? json({ items: [] }) : big400;
  await assert.rejects(createPandabyteCatalog({ baseUrl: 'https://example.insforge.app', anonKey: 'k'.repeat(40), fetchImpl: fetchBig }).passages('ESPXS3', signal), 'an oversized error body is refused');
  for (const baseUrl of ['http://example.insforge.app', 'https://example.insforge.app/api', 'https://example.insforge.app/?x=1']) assert.throws(() => createPandabyteCatalog({ baseUrl, anonKey: 'k'.repeat(40) }));
});

test('search: a named product is answered from the catalog after the grant; category queries and catalog failures read the live site', async () => {
  resetPandabyteSitemap();
  const order = [], { calls, catalog } = catalogFetch(), siteFetched = [];
  const siteFetch = async url => { siteFetched.push(url); if (url.endsWith('sitemap.xml')) return new Response(`<urlset>${products.map(u => `<url><loc>${u}</loc></url>`).join('')}</urlset>`, { headers: { 'content-type': 'application/xml' } });
    return new Response(page('Dev Boards', 'Browse by x Sort by: Recommended PandaByte xC3 ESP32-C3 Development Board Price ₹350.00 PandaByte xS3 ESP32-S3 Development Board Price ₹1,000.00 2'), { headers: { 'content-type': 'text/html' } }); };
  const tracked = { products: async s => { order.push('catalog'); return catalog.products(s); }, passages: (sku, s) => catalog.passages(sku, s) };
  const receipt = await searchPandabyteSite('pandabyte xs3 specs', { catalog: tracked, fetchImpl: siteFetch, beforeSend: async () => { order.push('grant'); return true; } });
  assert.deepEqual(order, ['grant', 'catalog']); assert.equal(siteFetched.length, 0, 'catalog answer reads no live page');
  assert.equal(receipt.sources.length, 1); assert.equal(receipt.sources[0].url, products[0]);
  assert.ok(receipt.sources[0].capturedAt >= receipt.startedAt && receipt.sources[0].capturedAt <= receipt.completedAt, 'capture time inside the search window');
  assert.doesNotMatch(receipt.sources[0].content, /₹|1,000/);
  // The receipt passes the same check the host applies before releasing a cited answer.
  const mcp = researchSearchMCP(receipt), handle = JSON.parse(mcp.content[0].text).sources[0].handle;
  const entry = { operationKey: '1'.repeat(64), resultHash: hashResearchJSON({ receipt, mcp }), receipt }, raw = JSON.stringify({ answer: 'It has 16 MB flash [S1].', evidence: [{ handle, passage: 'P1' }] });
  assert.equal(verifyResearchAnswer(raw, [entry], raw).state, 'evidence');
  const category = await searchPandabyteSite('pandabyte boards', { catalog: tracked, fetchImpl: siteFetch, beforeSend: async () => true });
  assert.equal(category.sources[0].url, 'https://www.pandabyte.in/category/microcontroller'); assert.doesNotMatch(category.sources[0].content, /₹/);
  resetPandabyteSitemap(); siteFetched.length = 0;
  const broken = { products: async () => { throw Error('down'); }, passages: async () => null };
  const fallback = await searchPandabyteSite('pandabyte xs3 specs', { catalog: broken, fetchImpl: siteFetch, beforeSend: async () => true });
  assert.ok(siteFetched.length > 0); assert.equal(fallback.sources[0].url, products[0]);
  let catalogCalls = 0;
  await assert.rejects(searchPandabyteSite('pandabyte xs3', { catalog: { products: async () => { catalogCalls++; return []; }, passages: async () => null }, beforeSend: async () => false }), e => e.stage === 'not_sent');
  assert.equal(catalogCalls, 0, 'a denied grant reads nothing');
  assert.ok(calls.length >= 2);
});

test('price stripping stays on one line and needs a digit; catalog text drops control and format characters', () => {
  assert.equal(stripPrices('Price\n3 pins'), 'Price\n3 pins');
  assert.equal(stripPrices('Price , x'), 'Price , x');
  assert.equal(stripPrices('HOURS 12 and LINR 5'), 'HOURS 12 and LINR 5');
  const odd = 'A' + String.fromCharCode(0x0b) + 'B' + String.fromCharCode(0x0c) + 'C' + String.fromCharCode(0x85) + 'D' + String.fromCharCode(0x061c) + 'E' + String.fromCodePoint(0xe0041) + 'F' + String.fromCharCode(0xd800) + 'G\tH';
  const clean = catalogContent([{ text: odd }]);
  assert.equal(clean.isWellFormed(), true);
  assert.equal(clean.replace(/\uFFFD/, ''), 'ABCDEFG H');
});

test('a catalog that hangs gives up after 6 s and the live pages still answer', async () => {
  resetPandabyteSitemap();
  const siteFetch = async url => url.endsWith('sitemap.xml') ? new Response(`<urlset>${products.map(u => `<url><loc>${u}</loc></url>`).join('')}</urlset>`, { headers: { 'content-type': 'application/xml' } })
    : new Response(page('PandaByte xS3', 'Specifications: 16 MB FLASH 8 MB PSRAM Bluetooth 5 LE SKU: ESPXS3'), { headers: { 'content-type': 'text/html' } });
  const hang = { products: s => new Promise((_, reject) => s.addEventListener('abort', () => reject(Error('timeout')))), passages: async () => null };
  const started = Date.now(), r = await searchPandabyteSite('pandabyte xs3 specs', { catalog: hang, fetchImpl: siteFetch, beforeSend: async () => true });
  assert.equal(r.sources[0].url, products[0]); assert.ok(Date.now() - started < 12000);
});
