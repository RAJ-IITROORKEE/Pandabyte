import test from 'node:test';
import assert from 'node:assert/strict';
import {isPlaygroundUsage} from '../src/control-room/playground-usage.ts';
test('only bounded integer guard-accounted usage is accepted',()=>{
 for(const v of [{inputTokens:0,outputTokens:0,costNanoUsd:0},{inputTokens:128000,outputTokens:1000,costNanoUsd:19800000},{inputTokens:100,outputTokens:10,costNanoUsd:21001}])assert.equal(isPlaygroundUsage(v),true);
 for(const v of [null,{}, {inputTokens:1,outputTokens:1,costNanoUsd:749},{inputTokens:128001,outputTokens:0,costNanoUsd:19800000},{inputTokens:0,outputTokens:1001,costNanoUsd:600600},{inputTokens:0,outputTokens:0,costNanoUsd:19800001},{inputTokens:0.5,outputTokens:0,costNanoUsd:150},{inputTokens:0,outputTokens:0,costNanoUsd:0,extra:1}])assert.equal(isPlaygroundUsage(v),false);
});
