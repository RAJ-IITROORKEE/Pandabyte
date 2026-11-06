import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTools } from './tools-dto.ts';
import { agenticManifests } from '../../../Panda-agent/src/agentic/manifests.ts';

const valid = () => ({ tools: agenticManifests.map(({ id, manifest, hash }) => ({ id, manifest, hash, enabled: false, version: 0, health: 'not_checked', history: [] })) });
test('accepts the four fixed manifest records', () => assert.equal(parseTools(valid())?.length, 4));
test('rejects malformed records before allowing a refresh or confirming a save', () => {
  for (const mutate of [
    x => { x.tools[1].manifest = null; },
    x => { x.tools[0].history = [{ enabled: true, reason: 'x' }]; },
    x => { x.tools[0].version = -1; },
    x => { x.tools[0].id = x.tools[1].id; },
    x => { x.tools[0].health = 'healthy'; },
    x => { x.tools[1].manifest = { ...x.tools[1].manifest, allowedHosts: null }; },
  ]) {
    const input = valid(); mutate(input); assert.equal(parseTools(input), null);
  }
});
