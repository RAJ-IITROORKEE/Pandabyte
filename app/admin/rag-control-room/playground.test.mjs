import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { outputText } = ts.transpileModule(readFileSync(new URL('./playground.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
});
const unconfigured = { model: 'openai/gpt-4o-mini', connection: 'not_configured', transport: 'unconfigured', profile: null, approvedQuestions: [] };
const configured = { ...unconfigured, connection: 'configured_unverified', transport: 'local', profile: 'product-playground-v1' };

function fixture({ pendingOutcome = false } = {}) {
  const slots = [], effects = [], requests = [], exports = {};
  let cursor = 0;
  const hooks = {
    useState(initial) {
      const slot = slots[cursor++] ??= { value: initial };
      return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }];
    },
    useRef(current) { return slots[cursor++] ??= { current }; },
    useEffect(effect, dependencies) {
      const slot = slots[cursor++] ??= {};
      if (slot.dependencies?.length === dependencies.length && dependencies.every((value, i) => Object.is(value, slot.dependencies[i]))) return;
      slot.dependencies = dependencies;
      effects.push(() => { slot.cleanup?.(); slot.cleanup = effect(); });
    },
  };
  runInNewContext(outputText, {
    exports, AbortController, queueMicrotask,
    sessionStorage: { getItem: () => pendingOutcome ? '1' : null },
    fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })),
    require(name) {
      if (name === 'react') return hooks;
      if (name === './playground-tool-fixture') return { PlaygroundToolFixture: () => null };
      return name.endsWith('.module.css') ? { default: {} } : require(name);
    },
  });
  function nodes(tree) {
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    return tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
  }
  function render() {
    cursor = 0;
    const tree = exports.Playground({});
    effects.splice(0).forEach(effect => effect());
    return nodes(tree);
  }
  return { requests, render };
}

const query = 'Which MCU does the x8266 use?';
const node = (tree, type, props = {}) => tree.find(item => item.type === type && Object.entries(props).every(([key, value]) => item.props[key] === value)).props;
const settled = () => new Promise(resolve => setImmediate(resolve));

test('retrieval can be submitted while evaluation availability is loading, missing or unavailable', async () => {
  for (const capability of [undefined, unconfigured, null]) {
    const h = fixture();
    node(h.render(), 'textarea').onChange({ target: { value: query } });
    if (capability !== undefined) {
      h.requests[0].resolve({ ok: !!capability, json: async () => capability });
      await settled();
    }
    const tree = h.render();
    const toggle = node(tree, 'input', { name: 'evaluate' });
    const submit = node(tree, 'button', { type: 'submit' });
    assert.equal(toggle.checked, false);
    assert.equal(toggle.disabled, true);
    assert.equal(submit.disabled, false);
    assert.equal(submit.children, 'Inspect retrieval');
    const completion = node(tree, 'form').onSubmit({ preventDefault() {} });
    assert.deepEqual(JSON.parse(h.requests[1].options.body), { question: query });
    h.requests[1].resolve({ ok: true, json: async () => ({ outcome: 'retrieved', relevance: 'unverified', passages: [], model: { status: 'not_requested' } }) });
    await completion;
    assert.ok(h.render().some(item => item.type === 'p' && item.props.children === 'No model answer yet. This was a retrieval-only request.'));
  }
});

test('an unknown evaluation outcome does not block retrieval or unlock evaluation', async () => {
  const h = fixture({ pendingOutcome: true });
  node(h.render(), 'textarea').onChange({ target: { value: query } });
  h.requests[0].resolve({ ok: true, json: async () => configured });
  await settled();
  const tree = h.render();
  assert.equal(node(tree, 'input', { name: 'evaluate' }).disabled, true);
  assert.equal(node(tree, 'button', { type: 'submit' }).disabled, false);
  assert.match(node(tree, 'p', { id: 'evaluation-help' }).children, /unknown outcome/);
});

test('a configured evaluator requires opt-in and refreshing clears that opt-in', async () => {
  const h = fixture();
  node(h.render(), 'textarea').onChange({ target: { value: query } });
  h.requests[0].resolve({ ok: true, json: async () => configured });
  await settled();
  const toggle = node(h.render(), 'input', { name: 'evaluate' });
  assert.equal(toggle.disabled, false);
  assert.equal(toggle.checked, false);
  toggle.onChange({ target: { checked: true } });
  assert.equal(node(h.render(), 'button', { type: 'submit' }).children, 'Inspect and evaluate');
  node(h.render(), 'button', { children: 'Refresh connection' }).onClick();
  const refreshed = h.render();
  assert.equal(node(refreshed, 'input', { name: 'evaluate' }).disabled, true);
  assert.equal(node(refreshed, 'button', { type: 'submit' }).children, 'Inspect retrieval');
  assert.ok(h.requests.every(item => item.options.method === undefined));
});
