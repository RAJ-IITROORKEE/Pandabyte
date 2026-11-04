import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlaygroundModelRequest, createPlaygroundModelEvaluator } from '../src/control-room/playground-model.ts';
const passages=[{rank:1,text:'The listing names an ESP8266 processor.'}];

test('cancellation reaches the guarded callback and prevents output release', async()=>{
 const controller=new AbortController(); let calls=0;
 const evaluator=createPlaygroundModelEvaluator(async(_request,signal)=>{
  calls++; assert.equal(signal,controller.signal); controller.abort(); return '{"answer":"","evidence":[]}';
 });
 await assert.rejects(evaluator('question',passages,controller.signal));
 await assert.rejects(evaluator('question',passages,controller.signal));
 assert.equal(calls,1);
});
test('builds fixed bounded request and treats retrieved content as data',async()=>{
 let captured; const evalModel=createPlaygroundModelEvaluator(async request=>{captured=request;return JSON.stringify({answer:'The listing names ESP8266.',evidence:[{rank:1,quote:'ESP8266 processor',reason:'It names the processor.'}]});});
 const result=await evalModel('Which processor?',passages); assert.equal(result.evidence[0].rank,1); assert.equal(captured.model,'openai/gpt-4o-mini'); assert.equal(captured.max_tokens,1000); assert.equal(captured.response_format.json_schema.strict,true); assert.equal('tools' in captured,false); assert.match(captured.messages[0].content,/untrusted data/); assert.deepEqual(JSON.parse(captured.messages[1].content).passages,passages);
});
test('rejects fabricated or malformed evidence, extra fields and fenced JSON',async()=>{
 for(const output of [JSON.stringify({answer:'x',evidence:[{rank:1,quote:'invented',reason:'x'}]}),JSON.stringify({answer:'x',evidence:[],extra:1}),JSON.stringify({answer:'x',evidence:[]}), '```json\n{}\n```']) await assert.rejects(createPlaygroundModelEvaluator(async()=>output)('question',passages));
});
test('accepts abstention and prevents empty or oversized inputs before admission',async()=>{
 let calls=0; const evaluator=createPlaygroundModelEvaluator(async()=>{calls++;return '{"answer":"","evidence":[]}';});
 assert.deepEqual(await evaluator('question',passages),{answer:'',evidence:[]});
 for (const [q,p] of [['',passages],['question',[]],['question',[{rank:1,text:'x'.repeat(12001)}]],['question',[{rank:1,text:'x'.repeat(11000)},{rank:2,text:'y'.repeat(10000)}]]]) await assert.rejects(evaluator(q,p));
 assert.equal(calls,1); assert.throws(()=>buildPlaygroundModelRequest('question',[{rank:2,text:'data'}]));
 assert.throws(()=>buildPlaygroundModelRequest('\ud800',passages));
 assert.throws(()=>buildPlaygroundModelRequest('question',[{rank:1,text:'\ud800'}]));
});
