import test from 'node:test';
import assert from 'node:assert/strict';
import {messagePayload,messageQuestion,diagnosticDisabled} from '../src/ui/guide-input.ts';
test('diagnostic input sends its exact typed union without question, guide or search',()=>{
 const diagnostic={errorText:'fatal error: driver/gpio.h: No such file',chip:'esp32',framework:'esp-idf',frameworkVersion:'5.5.1'};
 assert.deepEqual(messagePayload('attempt',{diagnostic}),{requestId:'attempt',diagnostic});
 assert.equal(messageQuestion({diagnostic}),'Diagnostic (esp32, esp-idf 5.5.1): fatal error: driver/gpio.h: No such file');
 assert.equal(messageQuestion({question:'Which MCU?',webSearch:false}),'Which MCU?');
 assert.equal(diagnosticDisabled(409,{error:'diagnostic_disabled'}),true);
 assert.equal(diagnosticDisabled(409,{error:'conflict'}),false);
 assert.equal(diagnosticDisabled(503,{error:'diagnostic_disabled'}),false);
});
