import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGuideInput,guideQuestion,parseProjectMemory} from '../src/guide/contracts.ts';
test('guide input is bounded, normalized and rejects extras or invalid Unicode',()=>{
 assert.deepEqual(parseGuideInput({goal:'  Build  ',board:' Board ',components:[' sensor '],expectedVersion:0}),{goal:'Build',board:'Board',components:['sensor'],expectedVersion:0});
 for(const input of [{goal:'x',board:'x',components:[],expectedVersion:-1},{goal:'😀'.repeat(301),board:'x',components:[],expectedVersion:0},{goal:'x',board:'x',components:['\ud800'],expectedVersion:0},{goal:'x',board:'x',components:[],expectedVersion:0,extra:true}])assert.equal(parseGuideInput(input),null);
 assert.equal(guideQuestion({goal:'Build',board:'Board',components:[],expectedVersion:0}),'Project guide: Build');
});
test('project memory accepts only bounded canonical goal state',()=>{
 const memory={version:0,guideTurns:0,compactions:0,intent:null,questions:[],recentGoals:[]};
 assert.deepEqual(parseProjectMemory(memory),memory);
 assert.ok(parseProjectMemory({...memory,intent:{goal:'Build',board:'Board',components:[]},questions:['revision'],recentGoals:['Build']}));
 for(const patch of [{version:1000000001},{guideTurns:101},{compactions:13},{questions:['revision','revision']},{recentGoals:Array(8).fill('x')},{intent:{goal:' x ',board:'Board',components:[]}},{questions:['source-grant']},{extra:true}])assert.equal(parseProjectMemory({...memory,...patch}),null);
});
