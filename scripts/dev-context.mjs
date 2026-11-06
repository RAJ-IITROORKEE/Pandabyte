import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Only reviewed development documents are eligible; never follow symlinks.
const roots = ['README.md', 'CLAUDE.md', 'design.md', 'plan.md'];
const directories = ['docs/agent-experience-upgrade', 'docs/archive', 'Panda-agent/docs'];
const allowed = (path) => /^(?:docs\/agent-experience-upgrade\/[^/]+\.(?:md|json)|docs\/archive\/[^/]+\.md|Panda-agent\/docs\/lightweight-[^/]+\.md)$/.test(path);
const excluded = /(?:^|[\/._-])(?:secret|credential|customer|private|env|log|build|node_modules)(?:[\/._-]|$)/i;

async function files(root) {
  const found = [];
  for (const path of roots) {
    try {
      const entry = (await readdir(root, { withFileTypes: true })).find((item) => item.name === path);
      if (entry?.isFile()) found.push(path);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const dir of directories) {
    try {
      if (!(await lstat(join(root, dir))).isDirectory()) continue;
      for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isFile() && allowed(path) && !excluded.test(path)) found.push(path);
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return found;
}

export async function search(root, query) {
  const words = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [])].slice(0, 8);
  if (!words.length) throw new Error('Provide at least one search word.');
  const matches = [];
  for (const path of await files(root)) {
    const content = await readFile(join(root, path), 'utf8');
    for (const [index, line] of content.split(/\r?\n/).entries()) {
      const lower = line.toLowerCase();
      const score = words.filter((word) => lower.includes(word)).length;
      if (score) matches.push({ path, line: index + 1, excerpt: line.trim().slice(0, 300), score, archived: path.startsWith('docs/archive/') });
    }
  }
  const priority = (path) => path.startsWith('docs/agent-experience-upgrade/') ? 0 : path === 'README.md' ? 1 : 2;
  matches.sort((a, b) => Number(a.archived) - Number(b.archived) || b.score - a.score || priority(a.path) - priority(b.path) || a.path.localeCompare(b.path) || a.line - b.line);
  const counts = new Map();
  return matches.filter(({ path }) => {
    const count = counts.get(path) ?? 0;
    counts.set(path, count + 1);
    return count < 2;
  }).slice(0, 12);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const results = await search(process.cwd(), process.argv.slice(2).join(' '));
    for (const result of results) console.log(`${result.path}:${result.line}: ${result.excerpt}`);
    if (!results.length) console.log('No matches in the development document allowlist.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
