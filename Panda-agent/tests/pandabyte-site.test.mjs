import test from 'node:test';
import assert from 'node:assert/strict';
import { isPandabyteQuery, selectPandabytePages, pandabytePageText, searchPandabyteSite, resetPandabyteSitemap } from '../src/search/pandabyte-site.ts';
import { researchSearchMCP } from '../src/server/research-search-broker.ts';

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

test('category listings become one "Name: price." line per product so names and prices cannot drift apart', () => {
  const p = pandabytePageText(page('Dev Boards', 'Browse by All Products Dev Boards Filter by Price ₹250 ₹3,203 11 products Sort by: Recommended '
    + 'PandaByte NodeMCU x8266 WiFi Development Board Price ₹250.00 PandaByte xC3 ESP32-C3 Development Board Price ₹350.00 '
    + 'PandaByte xLoRa ESP32 LoRaWAN Development Board with Battery and Solar Regular Price ₹3,500.00 Sale Price ₹3,000.00 1'));
  assert.deepEqual(p.content.split('\n'), ['PandaByte NodeMCU x8266 WiFi Development Board: ₹250.00.', 'PandaByte xC3 ESP32-C3 Development Board: ₹350.00.',
    'PandaByte xLoRa ESP32 LoRaWAN Development Board with Battery and Solar: regular ₹3,500.00, sale ₹3,000.00.']);
});
