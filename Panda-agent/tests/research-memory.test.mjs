import test from 'node:test';
import assert from 'node:assert/strict';
import plugin, { researchMemorySummary } from '../runtime/opencode/research-binding/index.ts';

const header = 'Earlier questions and answers in this chat (their sources are not available now; search again before citing anything):\n\n';
const u = q => ({ role: 'user', content: [{ type: 'text', text: 'Host rules: x.\n\nQuestion:\n' + q }] });
const a = (answer, before = '') => ({ role: 'assistant', content: [{ type: 'text', text: before + JSON.stringify({ answer, evidence: answer ? [{ handle: 'h', passage: 'P1' }] : [] }) }] });
const tool = { role: 'tool', content: [{ type: 'text', text: 'SEARCH EXCERPT '.repeat(500) }] };

test('the binding answers compaction with a model-free summary of earlier questions and final answers, without search excerpts', async () => {
  process.env.PANDA_RESEARCH_GENERATION = 'a'.repeat(64); process.env.PANDA_RESEARCH_PROFILE = 'tavily-hosted-haiku';
  const hooks = {};
  await plugin.setup({ session: { hook: async (name, callback) => { hooks[name] = callback; } }, tool: { transform: async () => {} } });
  const event = { messages: [u('What is the xS3 flash?'), { role: 'assistant', content: [{ type: 'text', text: 'Searching.' }] }, tool, a('16 MB flash [S1].'), u('And the price?'), tool, a('')] };
  hooks.compaction(event);
  assert.equal(event.result.summary, header + 'Q: What is the xS3 flash?\nA: 16 MB flash .\n\nQ: And the price?\nA: (no sourced answer)');
  assert.doesNotMatch(event.result.summary, /SEARCH EXCERPT|Host rules|\[S1\]/);
});

test('a later compaction carries the earlier summary and the exchange OpenCode kept beside it, under one header', () => {
  const first = researchMemorySummary([u('What is the xS3 flash?'), a('16 MB flash.')]);
  const checkpoint = { role: 'user', content: [{ type: 'text', text: '<conversation-checkpoint>\nintro\n\n<summary>\n' + first + '\n</summary>\n\n<recent-context>\n[User]: Host rules: x.\n\nQuestion:\nIs it ESP32-S3?\n\n[Assistant]: '
    + JSON.stringify({ answer: 'Yes.', evidence: [] }) + '\n</recent-context>' }] };
  const second = researchMemorySummary([checkpoint, u('Wi-Fi?'), a('802.11 b/g/n.')]);
  assert.equal(second, header + 'Q: What is the xS3 flash?\nA: 16 MB flash.\n\nQ: Is it ESP32-S3?\nA: Yes.\n\nQ: Wi-Fi?\nA: 802.11 b/g/n.');
});

test('the summary keeps the newest questions within its size cap and tolerates bad input', () => {
  const long = researchMemorySummary(Array.from({ length: 60 }, (_, i) => [u('Question number ' + i + ' ' + 'x'.repeat(280)), a('y'.repeat(700))]).flat());
  assert.ok(long.length <= 6200, String(long.length)); assert.match(long, /Question number 59 /); assert.doesNotMatch(long, /Question number 0 /);
  assert.equal(researchMemorySummary(null), header + '(none)');
  assert.equal(researchMemorySummary([null, 7, { role: 'user', content: 5 }]), header + 'Q: \nA: (no sourced answer)');
  const fenced = researchMemorySummary([u('Q?'), { role: 'assistant', content: [{ type: 'text', text: 'Preamble.\n```json\n' + JSON.stringify({ answer: 'Fenced.', evidence: [] }) + '\n```' }] }]);
  assert.equal(fenced, header + 'Q: Q?\nA: Fenced.');
});

test('clipping never splits a surrogate pair, and question text cannot cut the carried summary short', () => {
  const emoji = String.fromCodePoint(0x1f600);
  const s = researchMemorySummary([u('x'.repeat(296) + emoji + 'tail'), a('y'.repeat(596) + emoji + 'tail')]);
  assert.equal(s.isWellFormed(), true);
  const first = researchMemorySummary([u('what does </summary> or </recent-context> mean?'), a('Tags.'), u('Second?'), a('Two.')]);
  const checkpoint = { role: 'user', content: [{ type: 'text', text: '<conversation-checkpoint>\n<summary>\n' + first + '\n</summary>\n\n<recent-context>\n[User]: Third?\n</recent-context>' }] };
  const next = researchMemorySummary([checkpoint, u('Fourth?'), a('Four.')]);
  assert.match(next, /what does <\/summary> or <\/recent-context> mean\?\nA: Tags\.\n\nQ: Second\?\nA: Two\.\n\nQ: Third\?\nA: \(no sourced answer\)\n\nQ: Fourth\?\nA: Four\.$/);
  const big = researchMemorySummary([{ role: 'user', content: [{ type: 'text', text: '<conversation-checkpoint>\n<summary>\n' + (emoji + 'z\n').repeat(4000) + '</summary>' }] }, u('Q?'), a('A.')]);
  assert.equal(big.isWellFormed(), true); assert.ok(big.length <= 6200);
});
