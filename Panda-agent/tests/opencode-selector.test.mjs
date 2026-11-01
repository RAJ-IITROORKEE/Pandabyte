import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpenCodeSelector, createOpenCodeEvidenceSelector, createOpenCodeConversation, createOpenCodeManufacturerSelector, createOpenCodeWebSelector, NativeNotAdmittedError, NativeCompletedFailureError } from '../src/server/opencode-selector.ts';

const handle = `panda:00000000-0000-0000-0000-000000000001:${'a'.repeat(64)}:${'b'.repeat(64)}`;
const fragments = [{ handle, text: 'The captured listing names ESP8266 and WiFi.' }];
const answer = { selections: [{ handle, quote: 'ESP8266 and WiFi' }] };
const sessionId = `ses_${'f'.repeat(12)}${'A'.repeat(14)}`;
const messageId = letter => `msg_${'a'.repeat(12)}${letter.repeat(14)}`;
const bookmark = (id, direction = 'next') => Buffer.from(JSON.stringify({ id, order: 'asc', direction })).toString('base64url');
let nextPort = 20000;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

function fixture(options = {}) {
    const calls = [];
    let session, submitted = false, deleted = false, polls = 0;
    let resume;
    const blocked = new Promise(resolve => { resume = resolve; });
    const baseUrl = `http://127.0.0.1:${nextPort++}`;
    const fetcher = async (url, init) => {
        const path = new URL(url).pathname;
        calls.push({ path, search: new URL(url).search, method: init.method, body: init.body && JSON.parse(init.body), authorization: init.headers.Authorization });
        assert.equal(init.redirect, 'error');
        assert.equal(init.cache, 'no-store');
        assert.ok(init.signal);
        if (path === '/api/info') {
            if (options.block) await blocked;
            return json({ version: options.version ?? '2.2.2' });
        }
        if (path === '/api/session' && init.method === 'GET') {
            assert.deepEqual(Object.fromEntries(new URL(url).searchParams), { search: 'panda-local-rag-', limit: '1', order: 'desc' });
            if (options.listingFailure) throw Error('private-listing-transport');
            return json(options.listBody ?? { data: [], cursor: { previous: null, next: null } });
        }
        if (path === '/api/session' && init.method === 'POST') {
            session = { id: options.sessionId ?? sessionId, ...JSON.parse(init.body) };
            if (options.createUnknown) throw Error('sensitive-create-transport');
            return json({ data: options.createMismatch ? { ...session, title: 'another-session' } : session });
        }
        if (path === '/api/session/active') return json({ data: options.pendingOnce && submitted && polls === 1 ? { [sessionId]: { type: 'running' } } : {} });
        if (path === `/api/session/${sessionId}/prompt`) {
            submitted = true;
            if (options.promptUnknown) throw Error('sensitive-paid-transport');
            return json({ data: { type: 'user', sessionID: sessionId } });
        }
        if (path === `/api/session/${sessionId}/message`) {
            const params = new URL(url).searchParams;
            assert.equal(params.get('limit'), '100');
            assert.equal(params.has('order'), !params.has('cursor'));
            const messages = [{ id: messageId('U'), type: 'user', text: 'private-prompt' }, {
                id: messageId('A'), type: 'assistant', model: { providerID: options.provider ?? 'panda-guard', id: options.model ?? 'openai/gpt-6-luna' },
                content: options.content ?? [{ type: 'text', text: options.output ?? JSON.stringify(answer) }],
                finish: 'stop', time: { created: 1, completed: 2 }, ...(options.assistantError ? { error: { message: 'provider-secret' } } : {}),
            }, { id: messageId('I'), type: 'idle', time: { created: 3 }, outcome: 'succeeded' }];
            if (!submitted) return json({ data: [], cursor: { previous: null, next: null } });
            if (options.historyPages) return json(options.historyPages(params.get('cursor'), messages));
            if (params.has('cursor')) return json({ data: [], cursor: { previous: null, next: null } });
            const data = options.history ? options.history(messages) : messages;
            return json({ data, cursor: options.cursor ?? { previous: bookmark(data[0].id, 'previous'), next: bookmark(data.at(-1).id) } });
        }
        if (path === `/api/session/${sessionId}`) {
            if (init.method === 'DELETE') {
                if (options.deleteFailure) return json({ private: 'diagnostic' }, 500);
                deleted = true;
                return new Response(null, { status: 204 });
            }
            if (deleted) return new Response(null, { status: options.notDeleted ? 200 : 404 });
            if (submitted) polls++;
            return json({ data: { ...session, ...(submitted && !(options.pendingOnce && polls === 1) ? { outcome: options.outcome ?? 'succeeded' } : {}), ...(submitted && options.cleanupMismatch ? { title: 'foreign-session' } : {}) } });
        }
        throw Error(`Unexpected test route ${path}`);
    };
    const select = createOpenCodeSelector({ baseUrl, password: 'fixture-private-password', fetcher, onActivity: options.onActivity });
    return { select, calls, baseUrl, fetcher, resume, get deleted() { return deleted; } };
}

test('one native prompt returns exact selections and removes only its nonce-owned session', async () => {
    const f = fixture();
    assert.deepEqual(await f.select('Which chip and connectivity?', fragments), answer);
    assert.equal(f.deleted, true);
    assert.equal(f.calls.filter(c => c.path.endsWith('/prompt')).length, 1);
    const create = f.calls.find(c => c.path === '/api/session' && c.method === 'POST');
    assert.match(create.body.title, /^panda-local-rag-[a-f0-9]{32}$/);
    assert.equal(create.body.metadata.pandaLocalRag, create.body.title.slice('panda-local-rag-'.length));
    assert.deepEqual(create.body.location, { directory: '/workspace' });
    const prompt = f.calls.find(c => c.path.endsWith('/prompt')).body;
    assert.deepEqual(Object.keys(prompt), ['text']);
    assert.match(prompt.text, /untrusted data/i);
    assert.ok(prompt.text.includes(JSON.stringify({ question: 'Which chip and connectivity?', fragments })));
    assert.ok(f.calls.every(c => c.authorization === `Basic ${Buffer.from('opencode:fixture-private-password').toString('base64')}`));
    assert.equal(f.calls.at(-1).method, 'GET');
});

test('application evidence selector can abstain without forcing an unrelated quotation', async () => {
    const f = fixture({ output: '{"selections":[]}' });
    const select = createOpenCodeEvidenceSelector({ baseUrl: f.baseUrl, password: 'fixture-private-password', fetcher: f.fetcher });
    assert.deepEqual(await select('What is the unpublished calibration interval?', fragments), { selections: [] });
    assert.equal(f.deleted, true);
    assert.equal(f.calls.filter(c => c.path.endsWith('/prompt')).length, 1);
    const prompt = f.calls.find(c => c.path.endsWith('/prompt')).body.text;
    assert.match(prompt, /all requested facts/i);
    assert.match(prompt, /not sufficient/i);
    assert.match(prompt, /\{"selections":\[\]\}/);
    assert.match(prompt, /same product.*not enough/i);
});

test('application evidence selector preserves literal binding and rejects malformed abstention', async () => {
    for (const output of [JSON.stringify(answer), '{"selections":[]}']) {
        const f = fixture({ output });
        const select = createOpenCodeEvidenceSelector({ baseUrl: f.baseUrl, password: 'fixture-private-password', fetcher: f.fetcher });
        assert.deepEqual(await select('Which chip?', fragments), JSON.parse(output));
        assert.equal(f.deleted, true);
    }
    for (const output of ['{"selections":[],"reason":"private"}', '{"selections":null}', '{"selections":[{"handle":"foreign","quote":"ESP8266"}]}']) {
        const f = fixture({ output });
        const select = createOpenCodeEvidenceSelector({ baseUrl: f.baseUrl, password: 'fixture-private-password', fetcher: f.fetcher });
        await assert.rejects(select('Which chip?', fragments), NativeCompletedFailureError);
        assert.equal(f.deleted, true);
    }
});

test('inbox acknowledgement and running state are reconciled before reading the completed assistant', async () => {
    const f = fixture({ pendingOnce: true });
    assert.deepEqual(await f.select('Which chip?', fragments), answer);
    assert.equal(f.calls.filter(c => c.path.endsWith('/prompt')).length, 1);
    assert.ok(f.calls.filter(c => c.path === `/api/session/${sessionId}` && c.method === 'GET').length >= 5);
    assert.equal(f.deleted, true);
});

test('terminal history can omit idle, but a present idle must be an exact successful native tail record', async () => {
    const withoutIdle = fixture({ history: messages => messages.slice(0, 2) });
    assert.deepEqual(await withoutIdle.select('Which chip?', fragments), answer);
    assert.equal(withoutIdle.deleted, true);
    const changeTail = patch => messages => [...messages.slice(0, 2), { ...messages[2], ...patch }];
    const histories = [
        changeTail({ outcome: 'failed' }), changeTail({ outcome: 'interrupted' }), changeTail({ outcome: null }),
        changeTail({ id: 'foreign-message' }), changeTail({ time: { created: '3' } }), changeTail({ time: {} }),
        changeTail({ time: { created: 3, unexpected: true } }), changeTail({ content: [{ type: 'text', text: 'foreign content' }] }),
        changeTail({ metadata: {} }), changeTail({ unknown: true }), changeTail({ error: null }), changeTail({ type: 'system' }),
        messages => [messages[2], messages[0], messages[1]], messages => [messages[0], messages[2], messages[1]],
        messages => [...messages, messages[2]],
    ];
    for (const history of histories) {
        const f = fixture({ history });
        await assert.rejects(f.select('Which chip?', fragments), /Documentation selection unavailable/);
        assert.equal(f.deleted, true);
        assert.equal(f.calls.filter(c => c.path.endsWith('/prompt')).length, 1);
    }
});

test('rejects nonliteral, extra, duplicate, fenced and malformed model output after safe cleanup', async () => {
    const outputs = [
        'not json', `\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``,
        JSON.stringify({ selections: [{ handle: 'unknown', quote: 'ESP8266' }] }),
        JSON.stringify({ selections: [{ handle, quote: 'ESP32' }] }),
        JSON.stringify({ selections: [answer.selections[0], answer.selections[0]] }),
        JSON.stringify({ ...answer, text: 'an extra model claim' }), JSON.stringify({ selections: [] }),
        JSON.stringify({ selections: [{ ...answer.selections[0], sourceUrl: 'https://foreign.test' }] }),
    ];
    for (const output of outputs) {
        const f = fixture({ output });
        await assert.rejects(f.select('Which chip?', fragments), error => error instanceof NativeCompletedFailureError && error.message === 'Documentation selection unavailable.');
        assert.equal(f.deleted, true);
        assert.equal(f.calls.filter(c => c.path.endsWith('/prompt')).length, 1);
    }
});
test('only verified terminal cleanup classifies a failed answer as completed',async()=>{
    for (const option of [{output:'not json'},{outcome:'failed'},{outcome:'interrupted'}]) {
        const f=fixture(option);
        await assert.rejects(f.select('Which chip?',fragments), error=>error instanceof NativeCompletedFailureError);
        assert.equal(f.deleted,true);
    }
    for (const option of [{createUnknown:true},{promptUnknown:true},{output:'not json',deleteFailure:true},{output:'not json',notDeleted:true}]) {
        const f=fixture(option);
        await assert.rejects(f.select('Which chip?',fragments), error=>!(error instanceof NativeCompletedFailureError)&&!(error instanceof NativeNotAdmittedError));
    }
});

test('wrong native model/provider, provider errors, tools, failed execution and unknown history cursor keys fail closed', async () => {
    for (const option of [{ model: 'other-model' }, { provider: 'other-provider' }, { assistantError: true },
        { content: [{ type: 'tool', text: JSON.stringify(answer) }] }, { outcome: 'failed' }, { cursor: { unexpected: null } }]) {
        const f = fixture(option);
        await assert.rejects(f.select('Which chip?', fragments), /Documentation selection unavailable/);
        assert.equal(f.deleted, true);
    }
});

test('native history bookmarks are followed without order until an empty EOF page', async () => {
    const f = fixture();
    assert.deepEqual(await f.select('Which chip?', fragments), answer);
    const reads = f.calls.filter(c => c.path.endsWith('/message'));
    assert.equal(reads.length, 3);
    assert.equal(reads.at(-1).search, `?limit=100&cursor=${bookmark(messageId('I'))}`);
    const split = fixture({ historyPages: (cursor, messages) => cursor === null
        ? { data: messages.slice(0, 1), cursor: { previous: bookmark(messageId('U'), 'previous'), next: bookmark(messageId('U')) } }
        : cursor === bookmark(messageId('U'))
            ? { data: messages.slice(1), cursor: { previous: bookmark(messageId('A'), 'previous'), next: bookmark(messageId('I')) } }
            : { data: [], cursor: { previous: null, next: null } } });
    assert.deepEqual(await split.select('Which chip?', fragments), answer);
    assert.equal(split.deleted, true);
});

test('history cycles, unread pages, record overflow, malformed cursors and uncertain EOF fail closed', async () => {
    const first = bookmark(messageId('U'));
    let calls = 0;
    for (const historyPages of [
        (_cursor, messages) => ({ data: [messages[0]], cursor: { previous: null, next: first } }),
        (_cursor, messages) => ({ data: Array(101).fill(messages[0]), cursor: { previous: null, next: null } }),
        (_cursor, messages) => ({ data: [messages[0]], cursor: { previous: null, next: Buffer.from(String(++calls)).toString('base64url') } }),
        (_cursor, messages) => ({ data: messages, cursor: { next: 'bad%cursor' } }),
        (_cursor, messages) => ({ data: messages, cursor: { next: 'a'.repeat(513) } }),
        (cursor, messages) => cursor === null ? { data: messages, cursor: { next: first } } : { data: [], cursor: { next: first } },
        (cursor, messages) => cursor === null ? { data: messages.slice(0, 2), cursor: { next: first } } : { data: [{ type: 'shell' }], cursor: { next: null } },
        (cursor, messages) => { if (cursor !== null) throw Error('private-page-transport'); return { data: messages, cursor: { next: first } }; },
    ]) {
        const f = fixture({ historyPages });
        await assert.rejects(f.select('Which chip?', fragments), /Documentation selection unavailable/);
        assert.equal(f.deleted, true);
        assert.equal(f.calls.filter(c => c.path.endsWith('/prompt')).length, 1);
        assert.ok(f.calls.filter(c => c.path.endsWith('/message')).length <= 5);
    }
});

test('unknown create and nonce mismatch never authorize deletion or automatic retry', async () => {
    for (const option of [{ createUnknown: true }, { createMismatch: true }, { sessionId: '../../foreign' }]) {
        const f = fixture(option);
        await assert.rejects(f.select('Which chip?', fragments), /Documentation selection unavailable/);
        const before = f.calls.length;
        await assert.rejects(f.select('Which chip?', fragments), /Documentation selection unavailable/);
        assert.equal(f.calls.length, before);
        assert.equal(f.calls.filter(c => c.method === 'DELETE').length, 0);
        assert.equal(f.calls.filter(c => c.path.endsWith('/prompt')).length, 0);
    }
});

test('existing owned-prefix session and unknown listing state block creation even for a fresh selector', async () => {
    for (const option of [
        { listBody: { data: [{ id: sessionId, title: 'panda-local-rag-prior-unknown-run' }], cursor: {} } },
        { listBody: { data: [], cursor: { next: 'unread-page' } } },
        { listBody: { data: [], cursor: { previous: 'unread-page' } } },
        { listBody: { data: [], cursor: { next: false } } },
        { listBody: { data: [], cursor: { next: '' } } },
        { listBody: { data: [], cursor: { unknown: null } } },
        { listBody: { data: [], cursor: null } },
        { listBody: { data: [{ id: sessionId }], cursor: {} } },
        { listBody: { data: [{ id: 'unknown-native-id', title: 'other-title' }], cursor: {} } },
        { listBody: {} }, { listingFailure: true },
    ]) {
        const f = fixture(option);
        await assert.rejects(f.select('Which chip?', fragments), /Documentation selection unavailable/);
        const fresh = createOpenCodeSelector({ baseUrl: f.baseUrl, password: 'fixture-private-password', fetcher: f.fetcher });
        await assert.rejects(fresh('Which chip?', fragments), /Documentation selection unavailable/);
        assert.equal(f.calls.filter(c => c.path === '/api/session' && c.method === 'GET').length, 2);
        assert.equal(f.calls.filter(c => c.method === 'POST' || c.method === 'DELETE').length, 0);
    }
});

test('ambiguous prompt is never retried, interrupted or deleted; endpoint remains stopped', async () => {
    const f = fixture({ promptUnknown: true });
    await assert.rejects(f.select('Which chip?', fragments), /Documentation selection unavailable/);
    const before = f.calls.length;
    await assert.rejects(f.select('Which chip?', fragments), /Documentation selection unavailable/);
    assert.equal(f.calls.length, before);
    assert.equal(f.calls.filter(c => c.path.endsWith('/prompt')).length, 1);
    assert.equal(f.calls.filter(c => c.method === 'DELETE' || c.path.endsWith('/interrupt')).length, 0);
});

test('foreign ownership at cleanup, failed deletion and failed 404 readback withhold the answer and stop endpoint', async () => {
    for (const option of [{ cleanupMismatch: true }, { deleteFailure: true }, { notDeleted: true }]) {
        const f = fixture(option);
        await assert.rejects(f.select('Which chip?', fragments), /Documentation selection unavailable/);
        const before = f.calls.length;
        await assert.rejects(f.select('Which chip?', fragments), /Documentation selection unavailable/);
        assert.equal(f.calls.length, before);
        if (option.cleanupMismatch) assert.equal(f.calls.filter(c => c.method === 'DELETE').length, 0);
    }
});

test('only exact numeric loopback URL, explicit port and private password are accepted', () => {
    for (const baseUrl of ['https://127.0.0.1:4597', 'http://localhost:4597', 'http://127.1:4597', 'http://127.0.0.1',
        'http://127.0.0.1:4597/path', 'http://127.0.0.1:4597?x', 'http://127.0.0.1:4597#x',
        'http://user@127.0.0.1:4597', 'http://127.0.0.1:0', 'http://example.test:4597']) {
        assert.throws(() => createOpenCodeSelector({ baseUrl, password: 'fixture-private-password' }), /Documentation selection unavailable/);
    }
    assert.throws(() => createOpenCodeSelector({ baseUrl: 'http://127.0.0.1:4597', password: '' }), /Documentation selection unavailable/);
});

test('invalid context never creates a session and concurrent selections are rejected before I/O', async () => {
    const f = fixture({ block: true });
    for (const input of [[], [{ handle: 'forged', text: 'ESP8266' }], [{ handle, text: 'x'.repeat(12001) }], [fragments[0], fragments[0]]]) {
        await assert.rejects(f.select('Which chip?', input), /Documentation selection unavailable/);
    }
    assert.equal(f.calls.length, 0);
    const pending = f.select('Which chip?', fragments);
    await assert.rejects(f.select('Which chip?', fragments), /Documentation selection unavailable/);
    const other = fixture();
    await assert.rejects(other.select('Which chip?', fragments), /Documentation selection unavailable/);
    assert.equal(other.calls.length, 0);
    f.resume();
    assert.deepEqual(await pending, answer);
    assert.equal(f.calls.filter(c => c.path === '/api/session' && c.method === 'POST').length, 1);
});

test('native activity reports only acknowledged and observed execution, and callback failure cannot break selection', async () => {
  const stages = []; const f = fixture({ pendingOnce: true, onActivity: stage => { stages.push(stage); if (stage === 'opencode_queued') throw Error('ignored'); } });
  assert.deepEqual(await f.select('Which chip?', fragments), answer);
  assert.deepEqual(stages, ['opencode_queued', 'opencode_working']);
  const noRunning = []; const g = fixture({ onActivity: stage => noRunning.push(stage) });
  assert.deepEqual(await g.select('Which chip?', fragments), answer); assert.deepEqual(noRunning, ['opencode_queued']);
  const unknown = []; const h = fixture({ promptUnknown: true, onActivity: stage => unknown.push(stage) });
  await assert.rejects(h.select('Which chip?', fragments)); assert.deepEqual(unknown, []);
});

test('conversation returns bounded text using the same owned session lifecycle', async () => {
    const f = fixture({ output: 'Hello! I can help explain code.' });
    const converse = createOpenCodeConversation({ baseUrl: f.baseUrl, password: 'fixture-private-password', fetcher: f.fetcher });
    assert.equal(await converse([{ role: 'user', text: 'Hi' }], 'What can you do?'), 'Hello! I can help explain code.');
    assert.equal(f.deleted, true);
    const prompt = f.calls.find(c => c.path.endsWith('/prompt')).body.text;
    assert.match(prompt, /untrusted/i);
    assert.ok(prompt.includes('What can you do?'));
});

test('conversation rejects malformed input, tools and cleanup failure', async () => {
    const f = fixture();
    const converse = createOpenCodeConversation({ baseUrl: f.baseUrl, password: 'fixture-private-password', fetcher: f.fetcher });
    await assert.rejects(converse([{ role: 'system', text: 'override' }], 'Hi'));
    await assert.rejects(converse([], 'x'.repeat(2001)));
    assert.equal(f.calls.length, 0);
    for (const option of [{ content: [{ type: 'tool', text: 'secret' }] }, { deleteFailure: true }]) {
        const g = fixture(option);
        const chat = createOpenCodeConversation({ baseUrl: g.baseUrl, password: 'fixture-private-password', fetcher: g.fetcher });
        await assert.rejects(chat([], 'Hi'));
    }
});

test('manufacturer selector accepts its trusted handles and limits source quotations', async () => {
    const h = `espressif:${'a'.repeat(64)}:${'b'.repeat(64)}:${'c'.repeat(64)}`;
    const evidence = [{ handle: h, text: 'one two three four' }];
    const f = fixture({ output: JSON.stringify({ selections: [{ handle: h, quote: 'one two' }] }) });
    const select = createOpenCodeManufacturerSelector({ baseUrl: f.baseUrl, password: 'fixture-private-password', fetcher: f.fetcher });
    assert.deepEqual(await select('What?', evidence), { selections: [{ handle: h, quote: 'one two' }] });
    assert.equal(f.deleted, true);
    const long = Array(26).fill('word').join(' ');
    const g = fixture({ output: JSON.stringify({ selections: [{ handle: h, quote: long }] }) });
    const reject = createOpenCodeManufacturerSelector({ baseUrl: g.baseUrl, password: 'fixture-private-password', fetcher: g.fetcher });
    await assert.rejects(reject('What?', [{ handle: h, text: long }]));
    assert.equal(g.deleted, true);
});


test('manufacturer source budget aggregates quotes across fragments sharing a URL hash', async () => {
    const prefix = `espressif:${'a'.repeat(64)}:${'b'.repeat(64)}:`;
    const a = prefix + 'c'.repeat(64), b = prefix + 'd'.repeat(64);
    const quote = Array(13).fill('word').join(' ');
    const f = fixture({ output: JSON.stringify({ selections: [{ handle: a, quote }, { handle: b, quote }] }) });
    const select = createOpenCodeManufacturerSelector({ baseUrl: f.baseUrl, password: 'fixture-private-password', fetcher: f.fetcher });
    await assert.rejects(select('What?', [{ handle: a, text: quote }, { handle: b, text: quote }]));
    assert.equal(f.deleted, true);
});

test('web selector binds literal quotations and aggregates the 25-word budget by URL hash', async () => {
    const a = `web:${'a'.repeat(64)}:${'b'.repeat(64)}:${'c'.repeat(64)}`;
    const b = `web:${'a'.repeat(64)}:${'e'.repeat(64)}:${'d'.repeat(64)}`;
    const quote = Array(13).fill('word').join(' ');
    const f = fixture({ output: JSON.stringify({ selections: [{ handle: a, quote: 'word word' }] }) });
    const select = createOpenCodeWebSelector({ baseUrl: f.baseUrl, password: 'fixture-private-password', fetcher: f.fetcher });
    assert.deepEqual(await select('What?', [{ handle: a, text: quote }]), { selections: [{ handle: a, quote: 'word word' }] });
    assert.equal(f.deleted, true);
    assert.match(f.calls.find(c => c.path.endsWith('/prompt')).body.text, /Use no tools/);
    for (const output of [
        { selections: [{ handle: a, quote }, { handle: b, quote }] },
        { selections: [{ handle: a, quote: 'not literal' }] },
        { selections: Array(5).fill({ handle: a, quote: 'word' }) },
    ]) {
        const g = fixture({ output: JSON.stringify(output) });
        const reject = createOpenCodeWebSelector({ baseUrl: g.baseUrl, password: 'fixture-private-password', fetcher: g.fetcher });
        await assert.rejects(reject('What?', [{ handle: a, text: quote }, { handle: b, text: quote }]));
        assert.equal(g.deleted, true);
    }
    const h = fixture();
    const reject = createOpenCodeWebSelector({ baseUrl: h.baseUrl, password: 'fixture-private-password', fetcher: h.fetcher });
    await assert.rejects(reject('What?', [{ handle: a.replace(/^web:/, 'espressif:'), text: quote }]));
    assert.equal(h.calls.length, 0);
});

test('conversation truncates a long terminal response to the storage limit with a notice', async () => {
    const f = fixture({ output: 'x'.repeat(12000) });
    const converse = createOpenCodeConversation({ baseUrl: f.baseUrl, password: 'fixture-private-password', fetcher: f.fetcher });
    const answer = await converse([], 'Explain this');
    assert.ok(answer.length <= 8000);
    assert.match(answer, /response shortened/i);
    assert.equal(f.deleted, true);
});

test('conversation stays within JSON byte and character limits for Unicode and escaped controls', async () => {
    for (const output of ['😀'.repeat(5000), '\u0001'.repeat(10000)]) {
        const f = fixture({ output });
        const chat = createOpenCodeConversation({ baseUrl: f.baseUrl, password: 'fixture-private-password', fetcher: f.fetcher });
        const text = await chat([], 'Explain');
        assert.ok(text.length <= 6000);
        assert.ok(Buffer.byteLength(JSON.stringify({ outcome: 'conversation', text, citations: [] }), 'utf8') <= 23000);
        assert.match(text, /response shortened/i);
        assert.equal(f.deleted, true);
    }
});

test('busy admission is typed and makes no request', async () => {
    const f = fixture({ block: true });
    const pending = f.select('Which chip?', fragments);
    const g = fixture();
    const chat = createOpenCodeConversation({ baseUrl: g.baseUrl, password: 'fixture-private-password', fetcher: g.fetcher });
    await assert.rejects(chat([], 'Hi'), NativeNotAdmittedError);
    assert.equal(g.calls.length, 0);
    f.resume();
    await pending;
});


test('pre-create transport failure is not admitted and a fresh call can proceed', async () => {
    let offline = true;
    const f = fixture();
    const fetcher = async (url, init) => {
        if (offline && new URL(url).pathname === '/api/info') throw Error('offline');
        return f.fetcher(url, init);
    };
    const chat = createOpenCodeConversation({ baseUrl: f.baseUrl, password: 'fixture-private-password', fetcher });
    await assert.rejects(chat([], 'Hi'), NativeNotAdmittedError);
    assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
    offline = false;
    const select = createOpenCodeSelector({ baseUrl: f.baseUrl, password: 'fixture-private-password', fetcher });
    assert.deepEqual(await select('Which chip?', fragments), answer);
});
