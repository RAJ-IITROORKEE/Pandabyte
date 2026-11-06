import { open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const allowed = ['not_started', 'in_progress', 'partial', 'verified', 'blocked', 'unknown'];
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const ownerPattern = /^[A-Za-z0-9][A-Za-z0-9 ._/@+-]{0,79}$/;
function validate(data) {
  if (!data || data.schemaVersion !== '1.0' || !Array.isArray(data.requirements)) throw Error('Invalid task store');
  const tasks = new Map();
  for (const task of data.requirements) {
    if (!task || !idPattern.test(task.id) || tasks.has(task.id) || !allowed.includes(task.status) || typeof task.owner !== 'string' || !task.owner.trim() || task.owner.length > 160) throw Error('Invalid task ID, owner, or status');
    if (task.claim != null && (typeof task.claim !== 'string' || !ownerPattern.test(task.claim))) throw Error('Invalid claim owner');
    if (task.dependsOn !== undefined && (!Array.isArray(task.dependsOn) || task.dependsOn.some(id => typeof id !== 'string' || !idPattern.test(id)) || new Set(task.dependsOn).size !== task.dependsOn.length)) throw Error('Invalid dependencies');
    tasks.set(task.id, task);
  }
  const visited = new Set(), visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) throw Error('Dependency cycle');
    if (visited.has(id)) return;
    const task = tasks.get(id); if (!task) throw Error(`Missing dependency: ${id}`);
    visiting.add(id); for (const dep of task.dependsOn ?? []) visit(dep); visiting.delete(id); visited.add(id);
  }
  for (const id of tasks.keys()) visit(id);
  return tasks;
}
function ready(task, tasks) {
  if (!Array.isArray(task.dependsOn)) throw Error('Structured dependsOn is required before starting work');
  const unmet = task.dependsOn.filter(id => tasks.get(id).status !== 'verified');
  if (unmet.length) throw Error(`Unmet dependencies: ${unmet.join(', ')}`);
}
async function main(args) {
  let file = resolve('docs/agent-experience-upgrade/requirements.json');
  if (args[0] === '--file') { if (!args[1]) throw Error('Missing file'); file = resolve(args[1]); args = args.slice(2); }
  const [command, ...params] = args;
  const count = {validate: 0, list: 0, show: 1, claim: 2, release: 2, status: 3};
  if (!(command in count) || params.length !== count[command]) throw Error('Usage: [--file path] validate | list | show ID | claim ID OWNER | release ID OWNER | status ID OWNER STATUS');
  const mutation = ['claim', 'release', 'status'].includes(command);
  let lock, temp;
  try {
    if (mutation) lock = await open(`${file}.lock`, 'wx');
    const data = JSON.parse(await readFile(file, 'utf8'));
    const tasks = validate(data);
    if (command === 'validate') return console.log(`Valid: ${tasks.size} tasks`);
    if (command === 'list') return console.log(JSON.stringify([...tasks.values()].map(({id, status, claim, dependsOn}) => ({id, status, claim: claim ?? null, dependsOn: dependsOn ?? null})), null, 2));
    const [id, owner, next] = params;
    const task = tasks.get(id); if (!task) throw Error('Unknown task');
    if (command === 'show') return console.log(JSON.stringify(task, null, 2));
    if (!ownerPattern.test(owner)) throw Error('Invalid claim owner');
    if (command === 'claim') {
      if (task.claim) throw Error('Task already claimed');
      if (task.status === 'verified') throw Error('Task already verified');
      ready(task, tasks); task.claim = owner; task.status = 'in_progress';
    } else {
      if (task.claim !== owner) throw Error('Claim owner does not match');
      if (command === 'release') { task.claim = null; if (task.status === 'in_progress') task.status = 'partial'; }
      else { if (!allowed.includes(next)) throw Error('Invalid status'); if (next === 'in_progress' || next === 'verified') ready(task, tasks); task.status = next; }
    }
    validate(data);
    temp = join(dirname(file), `.${randomUUID()}.tmp`);
    await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, {flag: 'wx'});
    await rename(temp, file); temp = undefined;
    console.log(JSON.stringify({id: task.id, status: task.status, claim: task.claim ?? null}));
  } finally {
    if (temp) await unlink(temp).catch(() => {});
    if (lock) { await lock.close(); await unlink(`${file}.lock`); }
  }
}
main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
