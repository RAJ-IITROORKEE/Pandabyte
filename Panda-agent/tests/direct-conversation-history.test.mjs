import test from 'node:test';
import assert from 'node:assert/strict';
import { directHistory } from '../src/server/direct-conversation-history.ts';
const answer=text=>({outcome:'conversation',text,citations:[]});
const t=(requestId,question,response=answer('answer'))=>({requestId,question,status:response?'complete':'pending',response,createdAt:'2026-01-01T00:00:00Z'});
test('only journal-selected preceding turns survive masked read and preserve corrections',()=>{
 const turns=[t('a','My board is C3',answer('C3')),t('b','Correction: C6',answer('C6')),t('c','What board?',null)];
 assert.deepEqual(directHistory(turns,'c',['a','b']),[{question:'My board is C3',answer:'C3'},{question:'Correction: C6',answer:'C6'}]);
 assert.deepEqual(directHistory(turns,'c',[]),[]);
 for(const ids of [['b','a'],['c'],['other'],['a','a']])assert.throws(()=>directHistory(turns,'c',ids));
 for(const response of [{outcome:'insufficient',text:'withdrawn',citations:[]},{outcome:'conversation',text:'cited',citations:[{}]},null])assert.throws(()=>directHistory([t('a','question',response),turns[2]],'c',['a']));
});
