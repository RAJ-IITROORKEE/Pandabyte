import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectIdeasIntent, projectClarificationText, parseClarificationOptions } from '../src/retrieval/catalog-listing.ts';
import { resolveMultiProductIdentity } from '../src/retrieval/multi-product-identity.ts';
import { catalogListingAnswer } from '../src/server/main-rag-chat.ts';

const rows = JSON.parse(readFileSync(new URL('./fixtures/catalog-42.json', import.meta.url), 'utf8'));

test('project-idea questions about PandaByte devices ask which board', () => {
  for (const q of ['suggest me some projects to build i can using the pandabyte devices>?', 'What projects can I build with PandaByte boards?', 'Give me some project ideas using your boards'])
    assert.equal(projectIdeasIntent(q, false), true, q);
  for (const q of ['Suggest projects for the PandaByte xC3 board', 'Explain I2C', 'Suggest 3 beginner IoT projects for a student'])
    assert.equal(projectIdeasIntent(q, /xC3/.test(q)), false, q);
});

test('the clarification parses and every option names exactly one catalog product', () => {
  const answer = catalogListingAnswer('suggest me some projects to build i can using the pandabyte devices>?', rows);
  assert.equal(answer.outcome, 'clarification');
  const parsed = parseClarificationOptions(answer.text);
  assert.ok(parsed && parsed.options.length >= 2, answer.text);
  assert.equal(parsed.question, 'Which PandaByte board should the project use?');
  assert.equal(parsed.options.filter(o => o.recommended).length, 1);
  for (const option of parsed.options.filter(o => o.question.startsWith('Suggest projects'))) {
    const identity = resolveMultiProductIdentity(rows, option.question);
    assert.equal(identity.kind, 'planned', option.question);
    assert.equal(identity.products.length, 1, option.question);
  }
  assert.equal(projectClarificationText(rows), answer.text);
});

test('a named product is not a project-ideas clarification', () => {
  assert.equal(catalogListingAnswer('Suggest projects I can build with the PandaByte xC3 ESP32-C3 Development Board', rows), null);
});
