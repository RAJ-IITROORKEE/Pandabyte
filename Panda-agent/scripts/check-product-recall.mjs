// Recall check: how much stored listing text per product reaches the model. SELECT-only, via the InsForge CLI entry (no shell).
// Run from the worktree root: node Panda-agent/scripts/check-product-recall.mjs [--json]
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Mirror of prepareQuestionEvidence caps in src/retrieval/answers.ts (it needs adapters/DB, so only the cap logic is copied):
// passage text <= 12000 chars to be eligible, identical bodies deduped, a passage that does not fit the remaining budget is skipped,
// stop at 16 fragments or 20000 chars. Ranking is question-dependent in production; here document order is the best case.
export const LIMITS = { fragments: 16, characters: 20000, chunkMax: 12000 };

export function deliver(texts, limits = LIMITS) {
  let remaining = limits.characters;
  const seen = new Set(), out = [];
  for (const text of texts) {
    if (text.length > limits.chunkMax || seen.has(text)) continue;
    seen.add(text);
    if (text.length <= remaining) {
      out.push(text);
      remaining -= text.length;
      if (out.length === limits.fragments || remaining === 0) break;
    }
  }
  return out;
}

// A fact is one Markdown table row (separator rows excluded), a "Key: value" line, or a bullet line.
export function extractFacts(text) {
  const facts = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^\|?[\s:|-]+\|?$/.test(line) && line.includes('-')) continue;
    if (/^\|.*\|$/.test(line) || /^[-*•+]\s+\S/.test(line) || /^[^\s:|][^:|]{0,80}:\s*\S/.test(line)) facts.push(line);
  }
  return facts;
}

export function checkProduct(texts, limits = LIMITS) {
  const delivered = deliver(texts, limits), context = delivered.join('\n');
  const facts = [...new Set(texts.flatMap(extractFacts))];
  const missed = facts.filter(f => !context.includes(f));
  return {
    passages: texts.length, characters: texts.reduce((n, t) => n + t.length, 0),
    deliveredPassages: delivered.length, deliveredCharacters: context.length - Math.max(0, delivered.length - 1),
    fitsCaps: delivered.length === new Set(texts).size && delivered.length === texts.length,
    facts: facts.length, recalled: facts.length - missed.length, missed,
  };
}

async function main() {
  const cli = 'C:/Users/rajra/AppData/Local/npm-cache/_npx/d7c0f92b98ce1c29/node_modules/@insforge/cli/dist/index.js';
  const rows = q => JSON.parse(execFileSync(process.execPath, [cli, 'db', 'query', q, '--json'], { encoding: 'utf8', shell: false, windowsHide: true, maxBuffer: 1 << 28 }).replace(/^[^{]*/, '')).rows;
  const items = rows(`SELECT public.panda_agent_public_products() AS d`)[0].d.items;
  const results = [];
  for (const { sku, title } of items) {
    if (!/^[A-Za-z0-9_-]+$/.test(sku)) throw new Error('unexpected sku');
    const d = rows(`SELECT public.panda_agent_public_passages('${sku}') AS d`)[0].d;
    results.push({ sku, title, ...checkProduct(d.passages.map(p => p.text)) });
  }
  const total = results.reduce((n, r) => n + r.facts, 0), got = results.reduce((n, r) => n + r.recalled, 0);
  const summary = { products: results.length, fullyDelivered: results.filter(r => r.fitsCaps).length, facts: total, recalled: got, percent: total ? +(100 * got / total).toFixed(2) : 100 };
  if (process.argv.includes('--json')) console.log(JSON.stringify({ summary, results }, null, 2));
  else {
    console.log('sku'.padEnd(22) + 'pass  chars  fits  deliv  delivChars  facts');
    for (const r of results) console.log(r.sku.padEnd(22) + `${r.passages}`.padStart(4) + `${r.characters}`.padStart(7) + (r.fitsCaps ? '   yes' : '    NO') + `${r.deliveredPassages}`.padStart(7) + `${r.deliveredCharacters}`.padStart(12) + `  ${r.recalled}/${r.facts}`);
    console.log(`\nFully delivered: ${summary.fullyDelivered}/${summary.products}; facts recalled ${got}/${total} (${summary.percent}%)`);
    for (const r of results) for (const f of r.missed) console.log(`MISSED [${r.sku}] ${f.slice(0, 160)}`);
  }
  process.exit(got < total ? 1 : 0);
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
