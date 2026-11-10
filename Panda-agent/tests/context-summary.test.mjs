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

test('retrieval timing accepts bounded compatible metadata and rejects inconsistent clocks',()=>{
 const base={fragments:3,characters:2432,duplicatesRemoved:0,limitCharacters:20000};
 assert.equal(isContextSummary({...base,retrievalMs:120,requestElapsedMs:490}),true);
 assert.equal(isContextSummary({...base,retrievalMs:0}),true);
 for(const fields of [{retrievalMs:-1},{retrievalMs:NaN},{retrievalMs:0.1},{retrievalMs:120001},{requestElapsedMs:10},{retrievalMs:20,requestElapsedMs:19},{retrievalMs:20,requestElapsedMs:null}])assert.equal(isContextSummary({...base,...fields}),false);
});
