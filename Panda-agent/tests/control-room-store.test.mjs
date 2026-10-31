import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createControlRoomStore } from '../src/control-room/insforge-store.ts';
const reference = '123e4567-e89b-42d3-a456-426614174000', key = '123e4567-e89b-42d3-a456-426614174001';
const sha = b => createHash('sha256').update(b).digest('hex');
const raw = { reference, title: 'Source', kind: 'link', status: 'pending_review', rightsStatus: 'unknown', createdAt: '2026-10-31T00:00:00Z', updatedAt: '2026-10-31T00:00:00Z', version: 1, publisher: 'Publisher', sourceSummary: { url: 'https://example.com/doc', fetched: false }, private_bucket: 'secret', actor: 'secret-actor' };
const uploadRaw = { ...raw, kind: 'upload', status: 'upload_pending', sourceSummary: null, uploadSummary: { filename: 'file.txt', mediaType: 'text/plain', expectedSize: 3, expectedSha256: sha('abc') }, object_key: 'private-key' };
const input = { title: 'Source', filename: 'file.txt', mediaType: 'text/plain', bytes: new TextEncoder().encode('abc'), fileHash: sha('abc') };
function fixture(options = {}) {
    const calls = [], writes = [], downloads = [];
    let upload = async (path) => ({ data: { key: path }, error: null }), download = async () => ({ data: new Blob(['abc']), error: null });
    const reply = options.reply ?? ((name) => name.endsWith('reserve_upload') ? { intake: uploadRaw, created: true } : name.endsWith('record_upload_outcome') ? { ...uploadRaw, status: 'pending_review', version: 2 } : raw);
    const client = { database: { schema: s => { assert.equal(s, 'public'); return { rpc: async (name, args) => { calls.push([name, args]); return reply(name, args); } }; } }, storage: { from: bucket => { assert.equal(bucket, 'panda-agent-intake-private'); return { upload: async (path, blob) => { writes.push([path, blob]); return upload(path, blob); }, download: async (path) => { downloads.push(path); return download(path); } }; } } };
    return { calls, writes, downloads, client, setUpload: v => upload = v, setDownload: v => download = v, store: createControlRoomStore(client, options.enabled ? { privateUploadEnabled: true } : {}) };
}
const ok = data => ({ data, error: null });
test('safe mapped link and fixed case set contain no hidden fields', async () => { const x = fixture({ reply: () => ok(raw) }); const result = await x.store.registerLink({ kind: 'link', title: 'Source', sourceUrl: 'https://example.com/doc' }, key, 'x'); assert.equal(result.ok, true); assert.deepEqual(result.value.sourceSummary, { sourceUrl: 'https://example.com/doc', publisher: 'Publisher', fetched: false }); assert.ok(!JSON.stringify(result).includes('secret')); assert.equal(x.calls[0][1].p_publisher, ''); const cases = await x.store.caseSets(); assert.equal(cases.value[0].count, 20); assert.equal(cases.value[0].heldOut, false); });
test('exact P0001 details map conflict and not found; role or unknown fail closed', async () => { for (const [err, expected] of [[{ code: 'P0001', details: 'not_found' }, 'not_found'], [{ code: 'P0001', details: 'version_conflict' }, 'conflict'], [{ code: 'P0001', details: 'request_conflict' }, 'conflict'], [{ code: 'P0001', details: 'forbidden' }, 'forbidden'], [{ code: 'XX001', details: 'not_found' }, 'unavailable']]) {
    const x = fixture({ reply: () => ({ data: null, error: err }) });
    assert.deepEqual(await x.store.getIntake(reference), { ok: false, code: expected });
} });
test('cursor roundtrip applies exact seek and rejects malformed data', async () => { let n = 0; const x = fixture({ reply: (_name, args) => { n++; if (n === 2) {
        assert.equal(args.p_before, '2026-10-31T00:00:00Z');
        assert.equal(args.p_before_id, reference);
    } return ok({ items: [raw], nextCursor: n === 1 ? { before: '2026-10-31T00:00:00Z', beforeId: reference } : null }); } }); const first = await x.store.listIntakes({ limit: 20 }); assert.equal(first.ok, true); const second = await x.store.listIntakes({ limit: 20, cursor: first.value.nextCursor }); assert.equal(second.ok, true); assert.equal(second.value.nextCursor, null); assert.equal((await x.store.listIntakes({ limit: 20, cursor: 'bad' })).ok, false); assert.equal(n, 2); });
test('upload disabled default avoids reservation and reports unavailable', async () => { const x = fixture(); assert.equal((await x.store.upload(input, key, 'x')).code, 'unavailable'); assert.equal(x.calls.length, 0); assert.equal(x.writes.length, 0); });
test('replayed pending and unknown reservations never write again', async () => { for (const status of ['upload_pending', 'upload_outcome_unknown']) {
    const x = fixture({ enabled: true, reply: () => ok({ intake: { ...uploadRaw, status }, created: false }) });
    const r = await x.store.upload(input, key, 'x');
    assert.equal(r.ok, true);
    assert.equal(r.value.status, status);
    assert.equal(x.calls.length, 1);
    assert.equal(x.writes.length, 0);
    assert.equal(x.downloads.length, 0);
} });
test('created upload checks readback then reports pending review with unverified integrity', async () => { const x = fixture({ enabled: true, reply: (name, args) => ok(name.endsWith('reserve_upload') ? { intake: uploadRaw, created: true } : { ...uploadRaw, status: args.p_outcome, version: 2 }) }); const r = await x.store.upload(input, key, 'x'); assert.equal(r.ok, true); assert.equal(r.value.status, 'pending_review'); assert.equal(r.value.uploadSummary.integrityStatus, 'integrity_pending'); assert.equal(x.writes.length, 1); assert.equal(x.downloads.length, 1); assert.equal(x.writes[0][0], `intakes/${reference}/source.txt`); assert.equal(x.calls[1][1].p_outcome, 'pending_review'); assert.ok(!JSON.stringify(r).includes('private-key')); });
test('ambiguous upload and mismatched readback record unknown without retries', async () => { for (const failure of ['throw', 'error', 'badread']) {
    const x = fixture({ enabled: true, reply: (name, args) => ok(name.endsWith('reserve_upload') ? { intake: uploadRaw, created: true } : { ...uploadRaw, status: args.p_outcome, version: 2 }) });
    if (failure === 'throw')
        x.setUpload(async () => { throw Error('secret'); });
    if (failure === 'error')
        x.setUpload(async () => ({ data: null, error: { message: 'secret' } }));
    if (failure === 'badread')
        x.setDownload(async () => ({ data: new Blob(['xyz']), error: null }));
    const r = await x.store.upload(input, key, 'x');
    assert.equal(r.ok, true);
    assert.equal(r.value.status, 'upload_outcome_unknown');
    assert.equal(x.calls[1][1].p_outcome, 'upload_outcome_unknown');
    assert.equal(x.writes.length, 1);
    assert.ok(!JSON.stringify(r).includes('secret'));
} });
test('overview uses queried counts and disabled availability; no fake runtime', async () => { const x = fixture({ reply: () => ok({ counts: { sources: 44, versions: 44, chunks: 292 }, candidateSummary: { sealedInactive: 1 }, intakeSummary: { pending_review: 2, upload_pending: 1 } }) }); const r = await x.store.overview(); assert.equal(r.value.intakeSummary.total, 3); assert.deepEqual(r.value.availability, { metadata: true, privateUpload: false, retrieval: false, evaluation: false }); });
