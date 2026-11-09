import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { parseMemoryChange, parseMemoryState } from '../src/guide/project-memory.ts';

const require = createRequire(import.meta.url);
const id = '22222222-2222-4222-8222-222222222222';
const initial = { version: 1, guideTurns: 8, compactions: 1, intent: { goal: 'Fixture goal', board: 'Fixture board', components: [] }, questions: [], recentGoals: [] };
const { outputText } = ts.transpileModule(readFileSync(new URL('../src/ui/project-memory-panel.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
});
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function fixture(memory = null) {
  const slots = [], effects = [], requests = [], storage = new Map(), updates = [], exports = {};
  let cursor = 0, cleanup, rendered = [], focused = null;
  runInNewContext(outputText, {
    exports, AbortController, AbortSignal, queueMicrotask, requestAnimationFrame: callback => queueMicrotask(callback),
    crypto: { randomUUID: () => id },
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })),
    require(name) {
      if (name === 'react') return {
        useState(initial) { const slot = slots[cursor++] ??= { value: initial }; return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }]; },
        useRef(current) { return slots[cursor++] ??= { current }; },
        useEffect(effect) { const slot = slots[cursor++] ??= {}; if (!slot.mounted) { slot.mounted = true; effects.push(effect); } },
      };
      if (name === '../guide/project-memory') return { parseMemoryChange, parseMemoryState };
      return name.endsWith('.module.css') ? { default: {} } : require(name);
    },
  });
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes)
    : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
  const render = () => {
    for (const node of rendered) if (node.props?.ref) node.props.ref.current = null;
    cursor = 0;
    const tree = exports.ProjectMemoryPanel({
      thread: '11111111-1111-4111-8111-111111111111', owner: 'fixture-owner', memory, disabled: false,
      onMemory(value) { updates.push(value); memory = value; },
    });
    rendered = nodes(tree);
    for (const node of rendered) if (node.props?.ref) {
      node.props.ref.current = { focus() { if (rendered.includes(node)) focused = node.props.children; } };
    }
    for (const effect of effects.splice(0)) cleanup = effect();
    return rendered;
  };
  const button = name => render().find(node => node.type === 'button' && node.props.children === name);
  const startEdit = async () => {
    render(); await flush();
    button(memory?.intent ? 'Edit project context' : 'Add project context').props.onClick({ currentTarget: { focus() {} } });
    let fields = render().filter(node => node.type === 'textarea' || node.type === 'input');
    fields[0].props.onChange({ target: { value: 'Fixture goal' } });
    fields[1].props.onChange({ target: { value: 'Fixture board' } });
  };
  const submit = () => render().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  return { render, requests, storage, updates, button, startEdit, submit, unmount: () => cleanup(), focused: () => focused };
}

test('an uncertain save remains fenced across status-only reads and cannot be submitted twice', async () => {
  const f = fixture();
  await f.startEdit();
  const first = f.submit();
  assert.equal(f.requests.length, 1);
  assert.equal(f.storage.size, 1);
  f.requests[0].resolve({ ok: false, status: 503 });
  await first;
  assert.equal(f.button('Save project context').props.disabled, true);
  await f.submit();
  assert.equal(f.requests.length, 1);
  f.button('Check context status').props.onClick();
  f.requests[1].resolve({ ok: true, json: async () => ({ memory: null, lastRequestId: null }) });
  await flush(); await flush();
  assert.equal(f.storage.size, 1);
  assert.equal(f.button('Save project context').props.disabled, true);
  f.button('Check context status').props.onClick();
  f.requests[2].resolve({ ok: true, json: async () => ({ memory: initial, lastRequestId: id }) });
  await flush(); await flush();
  assert.equal(f.storage.size, 0);
  assert.equal(f.button('Save project context').props.disabled, false);
  assert.equal(f.requests.filter(r => r.options.method === 'PATCH').length, 1);
});

test('a late response after changing chat cannot update another chat or erase its recovery receipt', async () => {
  const f = fixture();
  await f.startEdit();
  const pending = f.submit();
  let finishBody;
  f.requests[0].resolve({ ok: true, json: () => new Promise(resolve => { finishBody = resolve; }) });
  await flush();
  f.unmount();
  finishBody({ memory: initial, lastRequestId: id });
  await pending;
  assert.equal(f.updates.length, 0);
  assert.equal(f.storage.size, 1);
});

test('clearing requires exact typed confirmation and saves an empty intent with an advanced version', async () => {
  const f = fixture(initial);
  f.render(); await flush();
  f.button('Clear project context').props.onClick({ currentTarget: { focus() {} } });
  const field = f.render().find(node => node.type === 'input');
  field.props.onChange({ target: { value: 'clear' } });
  assert.equal(f.button('Confirm clear').props.disabled, true);
  field.props.onChange({ target: { value: 'CLEAR' } });
  assert.equal(f.button('Confirm clear').props.disabled, false);
  const pending = f.submit();
  const body = JSON.parse(f.requests[0].options.body);
  assert.equal(body.intent, null);
  assert.equal(body.expectedVersion, 1);
  f.requests[0].resolve({ ok: true, json: async () => ({ memory: { ...initial, version: 2, intent: null }, lastRequestId: id }) });
  await pending;
  assert.equal(f.updates[0].intent, null);
  assert.equal(f.updates[0].version, 2);
  assert.ok(f.button('Add project context'));
});

test('cancel focuses the newly mounted action after the editing form has been removed', async () => {
  const f = fixture(initial);
  f.render(); await flush();
  for (const name of ['Edit project context', 'Clear project context']) {
    f.button(name).props.onClick();
    f.render();
    f.button('Cancel').props.onClick();
    f.render();
    await flush();
    assert.equal(f.focused(), name);
  }
});
