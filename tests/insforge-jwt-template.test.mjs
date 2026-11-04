import assert from 'node:assert/strict';
import test from 'node:test';
import { insforgeJwtTemplate } from '../lib/insforge/jwt-template.ts';

test('uses the current template when no override is configured', () => {
  assert.equal(insforgeJwtTemplate({}), 'insforge');
});

test('accepts a bounded server-side template name', () => {
  assert.equal(insforgeJwtTemplate({ INSFORGE_CLERK_JWT_TEMPLATE: 'insforge-pandabyte-migration' }), 'insforge-pandabyte-migration');
  assert.equal(insforgeJwtTemplate({ INSFORGE_CLERK_JWT_TEMPLATE: 'A_9-'.repeat(16) }).length, 64);
});

test('rejects invalid configured names instead of falling back', () => {
  for (const value of ['', ' x', 'x ', 'a.b', 'a\nb', 'a\n', 'x'.repeat(65)]) {
    assert.throws(() => insforgeJwtTemplate({ INSFORGE_CLERK_JWT_TEMPLATE: value }), /Invalid InsForge JWT template configuration/);
  }
});
