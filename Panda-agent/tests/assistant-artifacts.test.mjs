import test from 'node:test';import assert from 'node:assert/strict';
import {parseAssistantArtifact,assistantSystemPrompt} from '../src/opencode/assistant-artifacts.ts';
test('bounded answers, clarifications, plans and BOMs retain explicit unknown facts',()=>{
 const answer={version:1,type:'answer',answer:'A microcontroller runs a program and controls peripherals.'};assert.deepEqual(parseAssistantArtifact(answer),answer);
 const bom={version:1,type:'bom',title:'Draft controller',items:[{component:'Microcontroller module',quantity:1,description:'Exact module remains to be selected',pricePaise:null,stock:null,compatibility:'unverified'}],assumptions:['Input voltage and interfaces need confirmation.']};assert.deepEqual(parseAssistantArtifact(bom),bom);
 assert.ok(parseAssistantArtifact({version:1,type:'project_plan',title:'Sensor prototype',requirements:['Read one sensor'],steps:[{title:'Confirm interfaces',detail:'Identify the sensor bus and supply.'}],assumptions:[]}));
 assert.ok(parseAssistantArtifact({version:1,type:'clarification',question:'Which sensor and power supply will you use?'}));
 assert.match(assistantSystemPrompt,/no RAG/i);assert.match(assistantSystemPrompt,/unverified/);
});
test('extra fields, invented operational facts and malformed or oversized structures fail closed',()=>{
 const item={component:'Module',quantity:1,description:'Select exact part',pricePaise:null,stock:null,compatibility:'unverified'};
 const bom=()=>({version:1,type:'bom',title:'Draft',items:[{...item}],assumptions:[]});
 for(const patch of [{quantity:0},{quantity:1.5},{quantity:10001},{pricePaise:100},{stock:5},{compatibility:'verified'},{sourceUrl:'http://localhost/private'},{component:'\ud800'}]){const v=bom();Object.assign(v.items[0],patch);assert.equal(parseAssistantArtifact(v),null);}
 for(const v of [{version:1,type:'answer',answer:'x',extra:true},{version:1,type:'answer',answer:''},{version:1,type:'answer',answer:'fake [S1]'},{version:1,type:'answer',answer:'x'.repeat(8001)},{...bom(),items:Array.from({length:21},()=>item)},{version:2,type:'answer',answer:'x'},null])assert.equal(parseAssistantArtifact(v),null);
});
