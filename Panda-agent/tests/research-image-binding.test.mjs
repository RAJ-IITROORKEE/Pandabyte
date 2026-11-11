import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { nativeUserImageMatches, parseResearchUserContent, buildResearchPromptBody, researchImageMaxBase64 } from '../src/opencode/research-image-binding.ts';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('synthetic png body')]);
const jpg = Buffer.concat([Buffer.from('ffd8ff', 'hex'), Buffer.from('synthetic jpeg body')]);
const admitted = (bytes, mediaType, name) => ({ bytes, mediaType, sha256: sha(bytes), dataUri: 'data:' + mediaType + ';base64,' + bytes.toString('base64'), name });
const pngImage = admitted(png, 'image/png', 'image.png'), jpgImage = admitted(jpg, 'image/jpeg', 'image.jpg');
const row = (image, over = {}) => ({ id: 'msg_x', type: 'user', text: 't', files: [{ data: image.bytes.toString('base64'), mime: image.mediaType, source: { type: 'inline' }, name: image.name, ...over }] });

test('nativeUserImageMatches: text-only rows need files absent or empty', () => {
  assert.equal(nativeUserImageMatches({ type: 'user', text: 't' }), true);
  assert.equal(nativeUserImageMatches({ type: 'user', text: 't', files: [] }), true);
  assert.equal(nativeUserImageMatches(row(pngImage)), false, 'image on a text receipt');
  assert.equal(nativeUserImageMatches({ files: null }), false);
  assert.equal(nativeUserImageMatches(null), false);
  assert.equal(nativeUserImageMatches('x'), false);
});
test('nativeUserImageMatches: image rows bind hash, mime, name, source and shape', () => {
  assert.equal(nativeUserImageMatches(row(pngImage), pngImage.sha256), true);
  assert.equal(nativeUserImageMatches(row(jpgImage), jpgImage.sha256), true);
  assert.equal(nativeUserImageMatches({ type: 'user', text: 't' }, pngImage.sha256), false, 'missing image on an image receipt');
  assert.equal(nativeUserImageMatches({ files: [] }, pngImage.sha256), false);
  assert.equal(nativeUserImageMatches(row(pngImage), sha('other')), false, 'wrong hash');
  assert.equal(nativeUserImageMatches(row(pngImage), 'ABC'), false, 'non-hex hash');
  assert.equal(nativeUserImageMatches({ files: [row(pngImage).files[0], row(pngImage).files[0]] }, pngImage.sha256), false, 'extra file');
  assert.equal(nativeUserImageMatches(row(pngImage, { mime: 'image/jpeg' }), pngImage.sha256), false, 'wrong mime');
  assert.equal(nativeUserImageMatches(row(pngImage, { mime: 'image/gif' }), pngImage.sha256), false);
  assert.equal(nativeUserImageMatches(row(pngImage, { name: 'image.jpg' }), pngImage.sha256), false, 'name must match type');
  assert.equal(nativeUserImageMatches(row(pngImage, { name: 'photo.png' }), pngImage.sha256), false);
  assert.equal(nativeUserImageMatches(row(pngImage, { source: { type: 'file' } }), pngImage.sha256), false);
  assert.equal(nativeUserImageMatches(row(pngImage, { source: { type: 'inline', extra: 1 } }), pngImage.sha256), false);
  assert.equal(nativeUserImageMatches(row(pngImage, { extra: 1 }), pngImage.sha256), false, 'extra file key');
  const padded = Buffer.concat([png, Buffer.from('zz')]);
  assert.notEqual(padded.length % 3, 0);
  const unpadded = row(admitted(padded, 'image/png', 'image.png')); unpadded.files[0].data = unpadded.files[0].data.replace(/=+$/, '');
  assert.equal(nativeUserImageMatches(unpadded, sha(padded)), false, 'stripped padding is non-canonical');
  assert.equal(nativeUserImageMatches(row(pngImage, { data: 'AAAA' }), pngImage.sha256), false, 'magic mismatch');
  assert.equal(nativeUserImageMatches({ files: { 0: row(pngImage).files[0] } }, pngImage.sha256), false, 'files must be an array');
});
test('nativeUserImageMatches: png bytes declared jpeg are rejected', () => {
  assert.equal(nativeUserImageMatches(row({ ...pngImage, mediaType: 'image/jpeg', name: 'image.jpg' }), pngImage.sha256), false);
});

const part = image => ({ type: 'image_url', image_url: { url: image.dataUri } });
test('parseResearchUserContent: strings and text parts', () => {
  assert.deepEqual(parseResearchUserContent('hello', false), { texts: ['hello'], image: null });
  assert.deepEqual(parseResearchUserContent('hello', true), { texts: ['hello'], image: null });
  assert.deepEqual(parseResearchUserContent([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }], false), { texts: ['a', 'b'], image: null });
  assert.equal(parseResearchUserContent([], true), null);
  assert.equal(parseResearchUserContent(null, true), null);
  assert.equal(parseResearchUserContent('\ud800', true), null);
  assert.equal(parseResearchUserContent([{ type: 'text', text: 'x'.repeat(24001) }], true), null);
  assert.equal(parseResearchUserContent([{ type: 'text', text: 'a', extra: 1 }], true), null);
});
test('parseResearchUserContent: one trailing image for vision only', () => {
  const parsed = parseResearchUserContent([{ type: 'text', text: 'q' }, part(pngImage)], true);
  assert.deepEqual(parsed, { texts: ['q'], image: { sha256: pngImage.sha256, mediaType: 'image/png', urlLength: pngImage.dataUri.length } });
  assert.equal(parseResearchUserContent([{ type: 'text', text: 'q' }, part(jpgImage)], true).image.mediaType, 'image/jpeg');
  assert.equal(parseResearchUserContent([{ type: 'text', text: 'q' }, part(pngImage)], false), null, 'vision:false with an image');
  assert.equal(parseResearchUserContent([{ type: 'text', text: 'q' }, part(pngImage), part(pngImage)], true), null, 'two images');
  assert.equal(parseResearchUserContent([part(pngImage), { type: 'text', text: 'q' }], true), null, 'image must be last');
  assert.equal(parseResearchUserContent([part(pngImage)], true), null, 'needs a text part');
  assert.equal(parseResearchUserContent([{ type: 'text', text: 'q' }, { type: 'image_url', image_url: { url: pngImage.dataUri, detail: 'high' } }], true), null);
  assert.equal(parseResearchUserContent([{ type: 'text', text: 'q' }, { type: 'image_url', image_url: { url: 'https://example.test/a.png' } }], true), null);
  assert.equal(parseResearchUserContent([{ type: 'text', text: 'q' }, { type: 'image_url', image_url: { url: pngImage.dataUri.replace('image/png', 'image/jpeg') } }], true), null, 'declared type must match magic');
  const padded = admitted(Buffer.concat([png, Buffer.from('zz')]), 'image/png', 'image.png');
  assert.notEqual(parseResearchUserContent([{ type: 'text', text: 'q' }, part(padded)], true), null);
  assert.equal(parseResearchUserContent([{ type: 'text', text: 'q' }, { type: 'image_url', image_url: { url: padded.dataUri.replace(/=+$/, '') } }], true), null, 'non-canonical base64');
  assert.equal(parseResearchUserContent([{ type: 'text', text: 'q' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,' + 'A'.repeat(researchImageMaxBase64 + 4) } }], true), null, 'over bound');
  assert.equal(parseResearchUserContent([{ type: 'text', text: 'q' }, { type: 'image_url', url: pngImage.dataUri }], true), null);
});

const id = 'msg_abcdef123456ABCDEFGHIJKLMN';
test('buildResearchPromptBody: text-only body stays {id,text}', () => {
  const built = buildResearchPromptBody({ messageID: id, text: 'hello', image: null, vision: false });
  assert.deepEqual(built, { body: { id, text: 'hello' } });
  assert.equal('imageSha256' in built, false);
  assert.deepEqual(buildResearchPromptBody({ messageID: id, text: 'hello', image: null, vision: true }), { body: { id, text: 'hello' } });
  assert.equal(buildResearchPromptBody({ messageID: id, text: 'x'.repeat(96000), image: null, vision: false }).body.text.length, 96000);
  assert.deepEqual(buildResearchPromptBody({ messageID: id, text: 'x'.repeat(96001), image: null, vision: false }), { error: 'prompt_too_large' });
  assert.deepEqual(buildResearchPromptBody({ messageID: id, text: ' ', image: null, vision: false }), { error: 'prompt_too_large' });
});
test('buildResearchPromptBody: image body for vision, bounded text and JSON', () => {
  const built = buildResearchPromptBody({ messageID: id, text: 'describe', image: pngImage, vision: true });
  assert.deepEqual(built, { body: { id, text: 'describe', files: [{ uri: pngImage.dataUri, name: 'image.png' }] }, imageSha256: pngImage.sha256 });
  assert.equal(buildResearchPromptBody({ messageID: id, text: 'q', image: jpgImage, vision: true }).body.files[0].name, 'image.jpg');
  assert.ok('body' in buildResearchPromptBody({ messageID: id, text: 'x'.repeat(4000), image: pngImage, vision: true }), '4,000 B text');
  assert.deepEqual(buildResearchPromptBody({ messageID: id, text: 'x'.repeat(4001), image: pngImage, vision: true }), { error: 'prompt_too_large' });
  assert.equal(buildResearchPromptBody({ messageID: id, text: 'é'.repeat(2000), image: pngImage, vision: true }).body.text.length, 2000);
  assert.deepEqual(buildResearchPromptBody({ messageID: id, text: 'é'.repeat(2001), image: pngImage, vision: true }), { error: 'prompt_too_large' });
});
test('buildResearchPromptBody: non-vision and inconsistent images are refused before admission', () => {
  assert.deepEqual(buildResearchPromptBody({ messageID: id, text: 'q', image: pngImage, vision: false }), { error: 'image_not_allowed' });
  assert.deepEqual(buildResearchPromptBody({ messageID: id, text: 'q', image: { ...pngImage, name: 'image.jpg' }, vision: true }), { error: 'image_not_allowed' });
  assert.deepEqual(buildResearchPromptBody({ messageID: id, text: 'q', image: { ...pngImage, sha256: sha('x') }, vision: true }), { error: 'image_not_allowed' });
  assert.deepEqual(buildResearchPromptBody({ messageID: id, text: 'q', image: { ...pngImage, mediaType: 'image/jpeg' }, vision: true }), { error: 'image_not_allowed' });
  assert.deepEqual(buildResearchPromptBody({ messageID: id, text: 'q', image: { ...pngImage, dataUri: 'https://x/y.png' }, vision: true }), { error: 'image_not_allowed' });
});
test('OpenCode text-only model note changes the user text (promptHash frontier fails closed elsewhere)', () => {
  const text = 'describe this', note = text + 'ERROR: Cannot read "image.png" (this model does not support image input). Inform the user.';
  assert.notEqual(sha(note), sha(text));
  assert.deepEqual(parseResearchUserContent(note, false), { texts: [note], image: null });
});
