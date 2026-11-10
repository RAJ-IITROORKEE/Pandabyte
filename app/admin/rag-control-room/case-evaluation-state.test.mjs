import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseRun} from './case-evaluation-state.ts';
const row={caseIndex:0,caseId:'P01',caseQuestion:'Which MCU?',status:'passed',modelAnswer:'ESP8266',modelEvidence:[{rank:1,quote:'ESP8266',reason:'Listing'}],retrievalMs:1000,elapsedMs:3000,modelStatus:'evaluated'};
const run={requestId:'fixture',mode:'model',corpusFingerprint:'a'.repeat(64),results:[row],claimedIndex:null};
test('prior saved runs without question text remain readable',()=>{const older={...row};delete older.caseQuestion;assert.equal(parseRun({...run,results:[older]}).results[0].caseQuestion,'Question unavailable for this older run.');});
test('malformed stored model evidence and metric objects cannot reach React rendering',()=>{for(const patch of [{modelEvidence:null},{modelEvidence:[{rank:1,quote:{},reason:'x'}]},{elapsedMs:{bad:'data'}},{modelStatus:{}},{caseQuestion:{}}])assert.equal(parseRun({...run,results:[{...row,...patch}]}),null);});
test('pending claim remains visible and must match the next sequential case',()=>{assert.equal(parseRun({...run,claimedIndex:1}).claimedIndex,1);assert.equal(parseRun({...run,claimedIndex:0}),null);});
test('valid saved outputs remain literal strings and positional results stay ordered',()=>{assert.equal(parseRun(run).results[0].modelAnswer,'ESP8266');assert.equal(parseRun({...run,results:[{...row,caseIndex:4}]}),null);});
