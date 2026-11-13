import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHostedSourceQuotes, resolveHostedSourceEvaluation } from '../src/control-room/hosted-source-quotes.ts';
import { validatePlaygroundEvaluation } from '../src/control-room/playground-evaluation.ts';

test('quotes preserve every original source character, rank and order with request-local IDs', () => {
  const passages = [{ rank: 1, text: ('Processor: ESP32-C3.\r\nWiFi: 2.4 GHz.\nBluetooth: LE.\nWarning: disconnect power.\n\n').repeat(14) }, { rank: 2, text: '  Original\u00a0spacing and\tfinal newline.\n' }];
  const first = buildHostedSourceQuotes(passages, 'case'), second = buildHostedSourceQuotes(passages, 'case');
  assert.deepEqual(first, second);
  assert.deepEqual(first.quotes.map(q => q.id), first.quotes.map((_, i) => `case:q${i + 1}`));
  for (const passage of passages) {
    const quotes = first.quotes.filter(q => q.rank === passage.rank);
    assert.equal(quotes.map(q => q.text).join(''), passage.text);
    assert.ok(quotes.every(q => q.text.length <= 600 && passage.text.includes(q.text)));
  }
  assert.ok(first.quotes[0].text.length >= 300 && first.quotes[0].text.length <= 450);
  assert.ok(new TextEncoder().encode(JSON.stringify(first)).length <= 10000);
});

test('boundaries preserve paragraphs and group adjacent short lines', () => {
  const paragraph = ('A complete source sentence. ').repeat(11) + '\n\n';
  const text = paragraph.repeat(4);
  const { quotes } = buildHostedSourceQuotes([{ rank: 1, text }]);
  assert.equal(quotes.map(q => q.text).join(''), text);
  assert.ok(quotes.length <= 4);
  assert.ok(quotes.every(q => /\s$/.test(q.text)));
  assert.ok(quotes.some(q => q.text.includes('\n\n')));
});

test('astral characters and complete whitespace runs retain exact UTF-16 boundaries', () => {
  for (const text of ['x'.repeat(449) + '\u{1f43c}' + 'y'.repeat(200), ('pin\u00a0\u00a0\tvalue \u{1f680}\n').repeat(80)]) {
    const { quotes } = buildHostedSourceQuotes([{ rank: 1, text }]);
    assert.equal(quotes.map(q => q.text).join(''), text);
    assert.ok(quotes.every(q => q.text.length <= 600 && q.text.isWellFormed()));
    for (let i = 1; i < quotes.length; i++) assert.equal(/\s$/.test(quotes[i - 1].text) && /^\s/.test(quotes[i].text), false);
  }
});

test('source count and length fail closed; byte overflow leaves out whole passages', () => {
  assert.throws(() => buildHostedSourceQuotes(Array.from({ length: 25 }, (_, i) => ({ rank: i + 1, text: "x" }))));
  assert.throws(() => buildHostedSourceQuotes([{ rank: 1, text: 'x'.repeat(12001) }]));
  assert.deepEqual(buildHostedSourceQuotes([{ rank: 1, text: '\u{1f43c}'.repeat(5000) }]), { quotes: [] });
  assert.deepEqual([...new Set(buildHostedSourceQuotes([{ rank: 1, text: 'x'.repeat(9800) }, { rank: 2, text: 'y'.repeat(9800) }]).quotes.map(q => q.rank))], [1]);
  assert.deepEqual(buildHostedSourceQuotes([]), { quotes: [] });
});

test('four different source choices from the same passage resolve to distinct exact literals', () => {
  const text = ['Processor: ESP32-C3.', 'WiFi: 2.4 GHz.', 'Bluetooth: LE.', 'Warning: disconnect power.'].map(fact => fact + ' detail'.repeat(50) + '\n').join('');
  const { quotes } = buildHostedSourceQuotes([{ rank: 1, text }]);
  assert.equal(quotes.length, 4);
  const raw = { answer: 'The documented facts.', evidence: quotes.map(q => ({ id: q.id, reason: 'Source support.' })) };
  const resolved = resolveHostedSourceEvaluation(raw, quotes);
  assert.deepEqual(resolved.evidence.map(e => e.quote), quotes.map(q => q.text));
  assert.ok(resolved.evidence.every(e => e.rank === 1));
  assert.ok(validatePlaygroundEvaluation(resolved, [{ handle: '1', text }]));
});

test('unknown IDs, extra keys and malformed structures reject before normalization', () => {
  const { quotes } = buildHostedSourceQuotes([{ rank: 1, text: 'Source text.' }], 'test');
  const good = { answer: 'Answer.', evidence: [{ id: 'test:q1', reason: 'Support.' }] };
  for (const raw of [null, [], {}, { ...good, extra: true }, { ...good, answer: 5 }, { ...good, evidence: null }, { ...good, evidence: [{ id: 'unknown', reason: 'x' }] }, { ...good, evidence: [...good.evidence, { ...good.evidence[0], reason: '' }] }, { ...good, evidence: [{ ...good.evidence[0], rank: 1 }] }, { ...good, evidence: [{ id: 'test:q1', reason: null }] }, { ...good, evidence: Array(5).fill(good.evidence[0]) }]) {
    assert.equal(resolveHostedSourceEvaluation(raw, quotes), null);
  }
  assert.deepEqual(resolveHostedSourceEvaluation({ answer: '', evidence: [] }, quotes), { answer: '', evidence: [] });
});

test('resolver preserves answer and reason without normalizing or mutating frozen inputs', () => {
  const passages = Object.freeze([Object.freeze({ rank: 1, text: 'Exact\u00a0source\n' })]);
  const built = buildHostedSourceQuotes(passages, 'test');
  const quotes = Object.freeze(built.quotes.map(Object.freeze));
  const raw = Object.freeze({ answer: '  exact answer  ', evidence: Object.freeze([Object.freeze({ id: 'test:q1', reason: '  exact reason\n' })]) });
  assert.deepEqual(resolveHostedSourceEvaluation(raw, quotes), { answer: raw.answer, evidence: [{ rank: 1, quote: passages[0].text, reason: raw.evidence[0].reason }] });
  assert.equal(raw.evidence[0].id, 'test:q1');
  assert.deepEqual(passages, [{ rank: 1, text: 'Exact\u00a0source\n' }]);
});

test('quote IDs are bound to one request and caller tags are bounded', () => {
  const passages = [{ rank: 1, text: 'Exact source.' }];
  const first = buildHostedSourceQuotes(passages), second = buildHostedSourceQuotes(passages);
  assert.notEqual(first.quotes[0].id, second.quotes[0].id);
  const raw = { answer: 'Answer.', evidence: [{ id: first.quotes[0].id, reason: 'Source.' }] };
  assert.ok(resolveHostedSourceEvaluation(raw, first.quotes));
  assert.equal(resolveHostedSourceEvaluation(raw, second.quotes), null);
  for (const tag of ['', 'a'.repeat(65), '../request', 123]) assert.throws(() => buildHostedSourceQuotes(passages, tag));
  assert.throws(() => buildHostedSourceQuotes([{ rank: 1, text: '\ud800' }]));
});

test('different IDs for an identical rank/quote pair still fail downstream strict validation', () => {
  const quotes = [{ id: 'request:q1', rank: 1, text: 'same source' }, { id: 'request:q2', rank: 1, text: 'same source' }];
  const resolved = resolveHostedSourceEvaluation({ answer: 'Answer.', evidence: quotes.map(q => ({ id: q.id, reason: 'Source.' })) }, quotes);
  assert.ok(resolved);
  assert.equal(validatePlaygroundEvaluation(resolved, [{ handle: '1', text: 'same source' }]), null);
});


test('hosted selections deduplicate only fully validated IDs and withhold unsupported empty-selection text', () => {
 const {quotes}=buildHostedSourceQuotes([{rank:1,text:'MCU ESP8266 and USB Type-C.'}],'normalization');
 const first={id:quotes[0].id,reason:'First source support.'};
 const raw={answer:'ESP8266 and USB Type-C.',evidence:[first,{...first,reason:'Second source support.'}]};
 assert.deepEqual(resolveHostedSourceEvaluation(raw,quotes),{answer:raw.answer,evidence:[{rank:1,quote:quotes[0].text,reason:first.reason}]});
 assert.deepEqual(resolveHostedSourceEvaluation({answer:'Unsupported fabricated answer is withheld.',evidence:[]},quotes),{answer:'',evidence:[]});
 for(const reason of ['', 'x'.repeat(501), 'private_key=secret', '\ud800'])assert.equal(resolveHostedSourceEvaluation({...raw,evidence:[first,{...first,reason}]},quotes),null);
 assert.equal(resolveHostedSourceEvaluation({...raw,evidence:[first,{id:'foreign:q1',reason:'Unsupported.'}]},quotes),null);
 assert.equal(resolveHostedSourceEvaluation({answer:'x'.repeat(6001),evidence:[]},quotes),null);
});

test('excerpt ids copied into the answer are removed, other brackets are kept', async () => {
  const { resolveHostedSourceEvaluation } = await import('../src/control-room/hosted-source-quotes.ts');
  const quotes = [{ id: 'req:q1', rank: 1, text: 'The board has 4 MB flash.' }];
  const out = resolveHostedSourceEvaluation({ answer: 'Flash: 4 MB [req:q1][req:q1]. Pins [0:3] and [other:q9] stay.', evidence: [{ id: 'req:q1', reason: 'flash size' }] }, quotes);
  assert.equal(out.answer, 'Flash: 4 MB. Pins [0:3] and [other:q9] stay.');
  const two = [...quotes, { id: 'req:q2', rank: 1, text: 'It has Wi-Fi.' }];
  assert.equal(resolveHostedSourceEvaluation({ answer: 'LEDs [req:q2, req:q1] and [req:q1, other:q9].', evidence: [{ id: 'req:q1', reason: 'flash size' }] }, two).answer, 'LEDs and [req:q1, other:q9].');
});

test('sources over the byte budget keep whole top-ranked passages instead of failing', () => {
  const table = rank => ({ rank, text: (`| Pin | Function ${rank} |\n|---|---|\n` + '| IO35 | SPIIO6, GPIO35, FSPID, SUBSPID |\n'.repeat(70)) });
  const passages = [1, 2, 3, 4, 5, 6, 7, 8].map(table), small = { rank: 9, text: 'Flash: 16 MB.' };
  const { quotes } = buildHostedSourceQuotes([...passages, small], 'cap');
  assert.ok(new TextEncoder().encode(JSON.stringify({ quotes })).length <= 12000);
  const ranks = [...new Set(quotes.map(q => q.rank))];
  assert.equal(ranks[0], 1);
  assert.ok(ranks.length >= 2 && ranks.length < 9);
  assert.ok(ranks.includes(9), 'a small later passage that still fits is kept');
  for (const rank of ranks) assert.equal(quotes.filter(q => q.rank === rank).map(q => q.text).join(''), [...passages, small].find(p => p.rank === rank).text);
  assert.deepEqual(quotes.map(q => q.id), quotes.map((_, i) => `cap:q${i + 1}`));
});

test('invented [S1]-style source markers are removed, code indexing is kept', () => {
  const quotes = [{ id: 'req:q1', rank: 1, text: 'Flash: 16 MB.' }];
  const ev = [{ id: 'req:q1', reason: 'flash size' }];
  assert.equal(resolveHostedSourceEvaluation({ answer: '16 MB\n\n[S1]', evidence: ev }, quotes).answer, '16 MB');
  assert.equal(resolveHostedSourceEvaluation({ answer: 'It has 16 MB [S1, S2].', evidence: ev }, quotes).answer, 'It has 16 MB.');
  assert.equal(resolveHostedSourceEvaluation({ answer: 'Use pins[S1] and x [1].', evidence: ev }, quotes).answer, 'Use pins[S1] and x [1].');
});
