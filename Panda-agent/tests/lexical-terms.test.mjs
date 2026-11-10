import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLexicalTerm, matchesLexicalTerm } from '../src/retrieval/lexical-terms.ts';
test('processor equivalence is symmetric and whole-token bounded', () => {
  for (const query of ['processor','microprocessor']) for (const text of ['processor','microprocessor','(microprocessor),']) assert.equal(matchesLexicalTerm(normalizeLexicalTerm(query),text),true);
  for (const text of ['coprocessor','microprocessors','processor_core','preprocessor']) assert.equal(matchesLexicalTerm(normalizeLexicalTerm('processor'),text),false);
  assert.equal(matchesLexicalTerm(normalizeLexicalTerm('sensor'),'sensor.'),true);
  assert.equal(matchesLexicalTerm(normalizeLexicalTerm('sensor'),'sensors'),false);
});

test('MCU and microcontroller match the same whole-word listing field', () => {
  for (const query of ['mcu', 'microcontroller']) {
    const term = normalizeLexicalTerm(query);
    for (const text of ['mcu.', 'microcontroller: esp8266']) assert.equal(matchesLexicalTerm(term, text), true);
    for (const text of ['nodemcu', 'mcu_core', 'microprocessor', 'microcontrollers']) assert.equal(matchesLexicalTerm(term, text), false);
  }
});
