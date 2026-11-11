import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWiringSpec, parseStepsSpec, parseCalloutSpec, parseFlowSpec, flowLayers, mermaidSourceAllowed } from '../src/ui/blocks/block-specs.ts';

const wiring = (over = {}) => JSON.stringify({
  parts: [{ id: 'esp', label: 'ESP32', pins: ['3V3', 'GND', 'GPIO4'] }, { id: 'dht', label: 'DHT22', pins: ['VCC', 'DATA', 'GND'] }],
  wires: [{ from: 'esp.3V3', to: 'dht.VCC', color: 'red' }, { from: 'esp.GPIO4', to: 'dht.DATA', label: 'signal' }],
  ...over,
});

test('wiring: valid spec', () => assert.equal(parseWiringSpec(wiring())?.wires.length, 2));
test('wiring: unknown pin rejected', () => assert.equal(parseWiringSpec(wiring({ wires: [{ from: 'esp.GPIO9', to: 'dht.VCC' }] })), null));
test('wiring: extra key rejected', () => assert.equal(parseWiringSpec(wiring({ onclick: 'x' })), null));
test('wiring: too many parts rejected', () => {
  const parts = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, label: 'P', pins: ['a'] }));
  assert.equal(parseWiringSpec(wiring({ parts, wires: [{ from: 'p0.a', to: 'p1.a' }] })), null);
});
test('wiring: bad colour and bad JSON rejected', () => {
  assert.equal(parseWiringSpec(wiring({ wires: [{ from: 'esp.3V3', to: 'dht.VCC', color: 'pink' }] })), null);
  assert.equal(parseWiringSpec('{nope'), null);
});

test('steps: valid', () => assert.equal(parseStepsSpec('{"steps":[{"title":"Flash","code":"esptool.py"}]}')?.steps.length, 1));
test('steps: empty rejected', () => assert.equal(parseStepsSpec('{"steps":[]}'), null));
test('steps: too many rejected', () => assert.equal(parseStepsSpec(JSON.stringify({ steps: Array.from({ length: 13 }, () => ({ title: 't' })) })), null));
test('steps: long title rejected', () => assert.equal(parseStepsSpec(JSON.stringify({ steps: [{ title: 'x'.repeat(81) }] })), null));

test('callout: valid and bad tone', () => {
  assert.equal(parseCalloutSpec('{"tone":"warning","text":"Max 3.3V"}')?.tone, 'warning');
  assert.equal(parseCalloutSpec('{"tone":"danger","text":"x"}'), null);
});

test('mermaid guard', () => {
  assert.equal(mermaidSourceAllowed('flowchart LR\n A-->B'), true);
  for (const bad of ['click A href "x"', 'A-->B\nclick A call f()', '%%{init: {}}%%\nflowchart LR', '<script>x</script>', '@import "x"', 'x'.repeat(4001), '  '])
    assert.equal(mermaidSourceAllowed(bad), false, bad.slice(0, 20));
});

const flow = (over = {}) => JSON.stringify({
  nodes: [{ id: 'usb', label: 'USB', kind: 'power' }, { id: 'esp', label: 'ESP32', kind: 'mcu', detail: 'Brain' }, { id: 'led', label: 'LED', kind: 'actuator' }],
  edges: [{ from: 'usb', to: 'esp', label: '5V', type: 'power' }, { from: 'esp', to: 'led' }],
  ...over,
});
test('flow: valid', () => assert.equal(parseFlowSpec(flow())?.nodes.length, 3));
test('flow: unknown kind rejected', () => assert.equal(parseFlowSpec(flow({ nodes: [{ id: 'a', label: 'A', kind: 'robot' }, { id: 'b', label: 'B', kind: 'mcu' }] })), null));
test('flow: missing node ref rejected', () => assert.equal(parseFlowSpec(flow({ edges: [{ from: 'usb', to: 'nope' }] })), null));
test('flow: self-loop rejected', () => assert.equal(parseFlowSpec(flow({ edges: [{ from: 'usb', to: 'usb' }] })), null));
test('flow: too many nodes rejected', () => assert.equal(parseFlowSpec(flow({ nodes: Array.from({ length: 13 }, (_, i) => ({ id: `n${i}`, label: 'N', kind: 'mcu' })), edges: [{ from: 'n0', to: 'n1' }] })), null));
test('flow: extra key rejected', () => assert.equal(parseFlowSpec(flow({ onclick: 'x' })), null));
test('flow: edge type validated', () => {
  assert.equal(parseFlowSpec(flow({ edges: [{ from: 'usb', to: 'esp', type: 'data' }] }))?.edges[0].type, 'data');
  assert.equal(parseFlowSpec(flow({ edges: [{ from: 'usb', to: 'esp', type: 'magic' }] })), null);
});
test('flow: layers by longest path, cycle ignored', () => {
  const spec = parseFlowSpec(flow({ edges: [{ from: 'usb', to: 'esp' }, { from: 'usb', to: 'led' }, { from: 'esp', to: 'led' }, { from: 'led', to: 'usb' }] }));
  assert.deepEqual(flowLayers(spec), [['usb'], ['esp'], ['led']]);
});
