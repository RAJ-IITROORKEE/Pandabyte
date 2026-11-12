import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePlaygroundEvaluation} from '../src/control-room/playground-evaluation.ts';

const fragments=[{handle:'private-source-handle',text:'The source names TEST MCU.'}];
const valid=()=>({answer:'The source names TEST MCU.',evidence:[{rank:1,quote:'TEST MCU',reason:'Names the MCU.'}]});

test('valid evaluation and empty evidence keep their exact return shapes without a diagnostic',()=>{
 const reasons=[],value=valid();
 assert.deepEqual(validatePlaygroundEvaluation(value,fragments,reason=>reasons.push(reason)),{
  ...value,selections:[{handle:fragments[0].handle,quote:'TEST MCU'}],
 });
 assert.deepEqual(validatePlaygroundEvaluation({answer:'',evidence:[]},fragments,reason=>reasons.push(reason)),
  {answer:'',evidence:[],selections:[]});
 assert.deepEqual(reasons,[]);
});

test('each strict rejection reports only its fixed branch reason and still returns null',()=>{
 const cases=[
  [null,'exact-keys'],[[],'exact-keys'],[{...valid(),extra:'PRIVATE_PAYLOAD'},'exact-keys'],
  [{answer:'a',evidence:{}},'evidence-bounds'],[{...valid(),evidence:Array(5).fill(valid().evidence[0])},'evidence-bounds'],
  [{answer:'not empty',evidence:[]},'answer-bounds'],[{...valid(),answer:'a'.repeat(6001)},'answer-bounds'],
  [{...valid(),answer:'file://PRIVATE_PATH'},'answer-bounds'],
  [{...valid(),evidence:[null]},'evidence-entry'],[{...valid(),evidence:[{...valid().evidence[0],extra:1}]},'evidence-entry'],
  ...[0,2,1.5,'1'].map(rank=>[{...valid(),evidence:[{...valid().evidence[0],rank}]},'rank-bounds']),
  [{...valid(),evidence:[valid().evidence[0],valid().evidence[0]]},'evidence-duplicate'],
  ...['',null,'q'.repeat(601),'s3://PRIVATE_BUCKET'].map(quote=>[{...valid(),evidence:[{...valid().evidence[0],quote}]},'quote-bounds']),
  ...['',null,'r'.repeat(501),'object_key: PRIVATE_KEY'].map(reason=>[{...valid(),evidence:[{...valid().evidence[0],reason}]},'reason-bounds']),
  ...['test MCU','PRIVATE_INVENTED_QUOTE'].map(quote=>[{...valid(),evidence:[{...valid().evidence[0],quote}]},'quote-not-literal']),
  [{...valid(),evidence:[{...valid().evidence[0],quote:'TEST  MCU'}]},'quote-whitespace-mismatch'],
 ];
 for(const [value,reason] of cases){
  const reasons=[];
  assert.equal(validatePlaygroundEvaluation(value,fragments),null,reason);
  assert.equal(validatePlaygroundEvaluation(value,fragments,(...args)=>reasons.push(args)),null,reason);
  assert.deepEqual(reasons,[[reason]],reason);
 }
});

test('up to four distinct exact quotes may cite the same passage while identical rank/quote pairs stay rejected',()=>{
 const quoteTexts=['TEST MCU','The source','source names','names TEST'];
 const value={answer:'The source names TEST MCU.',evidence:quoteTexts.map(quote=>({rank:1,quote,reason:'Literal source fact.'}))};
 const checked=validatePlaygroundEvaluation(value,fragments);assert.ok(checked);
 assert.deepEqual(checked.evidence,value.evidence);assert.deepEqual(checked.selections,quoteTexts.map(quote=>({handle:fragments[0].handle,quote})));
 const duplicate={...value,evidence:[value.evidence[0],{...value.evidence[0],reason:'A different explanation does not make a distinct quote.'}]};
 const reasons=[];assert.equal(validatePlaygroundEvaluation(duplicate,fragments,r=>reasons.push(r)),null);assert.deepEqual(reasons,['evidence-duplicate']);
 assert.equal(validatePlaygroundEvaluation({...value,evidence:[...value.evidence,{rank:1,quote:'MCU',reason:'Fifth quote'}]},fragments),null);
 assert.equal(validatePlaygroundEvaluation({...value,evidence:[value.evidence[0],{rank:1,quote:'absent',reason:'Fabricated'}]},fragments),null);
 const sameQuoteAcrossRanks={...value,evidence:[value.evidence[0],{...value.evidence[0],rank:2}]};
 assert.ok(validatePlaygroundEvaluation(sameQuoteAcrossRanks,[...fragments,{handle:'other-source',text:fragments[0].text}]));
});

test('mismatch diagnostics distinguish whitespace only without accepting or normalizing punctuation, words or soft hyphens',()=>{
 for(const [source,quote,reason] of [
  ['TEST\u00a0MCU','TEST MCU','quote-whitespace-mismatch'],
  ['TEST\n\tMCU','TEST MCU','quote-whitespace-mismatch'],
  ['TEST MCU',' TEST MCU ','quote-whitespace-mismatch'],
  ['TEST\u00adMCU','TESTMCU','quote-not-literal'],
  ['TEST\u00adMCU','TEST-MCU','quote-not-literal'],
  ['TEST–MCU','TEST-MCU','quote-not-literal'],
  ['TESTMCU','TEST MCU','quote-not-literal'],
  ['TEST MCU','TEST CPU','quote-not-literal'],
 ]){
  const reasons=[],value=valid();value.evidence[0].quote=quote;
  assert.equal(validatePlaygroundEvaluation(value,[{handle:'source',text:source}],r=>reasons.push(r)),null);
  assert.deepEqual(reasons,[reason]);
 }
});

test('diagnostics cannot alter validation or relax the original string bounds',()=>{
 const value={answer:'a'.repeat(6000),evidence:[{rank:1,quote:'q'.repeat(600),reason:'r'.repeat(500)}]};
 assert.ok(validatePlaygroundEvaluation(value,[{handle:'source',text:'q'.repeat(600)}],()=>assert.fail('accepted input reported a rejection')));
 assert.equal(validatePlaygroundEvaluation(null,fragments,()=>{throw Error('diagnostic unavailable');}),null);
});
