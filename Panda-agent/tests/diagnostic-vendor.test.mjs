import test from 'node:test';
import assert from 'node:assert/strict';
import {answerVendorDiagnostic} from '../src/diagnostics/vendor-answer.ts';
const input={errorText:'gpio driver error',chip:'esp32',framework:'esp-idf',frameworkVersion:'5.5.1'};
const quote='#include "driver/gpio.h"';
const scope={sourceId:'espressif-esp-idf-5.5.1-esp32-gpio',versionId:'11111111-1111-4111-8111-111111111111',contentHash:'a'.repeat(64),scopeHash:'b'.repeat(64),approved:true,rights:'permitted',current:true,chip:'esp32',framework:'esp-idf',frameworkVersion:'5.5.1',fragments:[quote],sourceUrl:'https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-reference/peripherals/gpio.html',title:'GPIO & RTC GPIO',capturedAt:'2026-11-05T14:08:19.972Z'};
test('only current reviewed exact-target GPIO evidence yields an attributed literal citation',()=>{
 const got=answerVendorDiagnostic(input,scope); assert.equal(got.answer.citations[0].quote,quote); assert.equal(got.bindings.length,1);
 for(const s of [{...scope,current:false},{...scope,rights:'denied'},{...scope,chip:'esp32c3'},{...scope,fragments:['irrelevant']},{...scope,fragments:[quote,'unreviewed prose']},{...scope,fragments:['extra '+quote]}]) assert.equal(answerVendorDiagnostic(input,s).answer.citations.length,0);
 assert.equal(answerVendorDiagnostic({...input,errorText:'How do I wire GPIO?'},scope).answer.citations.length,0);
 for(const errorText of ['ESP32-C3 GPIO error','ESP-IDF v5.4.3 GPIO error','Arduino GPIO error'])assert.equal(answerVendorDiagnostic({...input,errorText},scope).answer.citations.length,0);
});
