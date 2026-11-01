import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isContextSummary} from '../src/retrieval/context-summary.ts';
test('context summary requires only valid bounded aggregate integer counts', () => {
 const valid = {fragments: 1, characters: 1, duplicatesRemoved: 0, limitCharacters: 20000};
 assert.equal(isContextSummary(valid), true);
 assert.equal(isContextSummary({...valid, fragments: 4, characters: 40, duplicatesRemoved: 4}), true);
 assert.equal(isContextSummary({...valid, fragments: 8, characters: 40, duplicatesRemoved: 1}), false);
 for (const value of [null, [], {...valid, extra: 1}, {...valid, fragments: 0}, {...valid, fragments: 9}, {...valid, characters: 0}, {...valid, characters: 20001}, {...valid, fragments: 2}, {...valid, duplicatesRemoved: -1}, {...valid, duplicatesRemoved: 8}, {...valid, duplicatesRemoved: 0.5}, {...valid, limitCharacters: 19999}]) assert.equal(isContextSummary(value), false);
});
