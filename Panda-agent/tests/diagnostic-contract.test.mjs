import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDiagnosticInput,diagnosticQuestion,parseVendorCitation} from '../src/diagnostics/contracts.ts';
const valid={errorText:' gpio error ',chip:'esp32',framework:'esp-idf',frameworkVersion:'5.5.1'};
test('diagnostic inputs are strict, bounded and normalized',()=>{
 assert.equal(parseDiagnosticInput(valid).errorText,'gpio error');
 assert.match(diagnosticQuestion(parseDiagnosticInput(valid)),/esp32.*esp-idf.*5\.5\.1.*gpio error/i);
 for(const bad of [{...valid,url:'https://example.com'},{...valid,errorText:'x'.repeat(1501)},{...valid,errorText:'\ud800'},{...valid,frameworkVersion:'latest'},{...valid,screenshotId:'bad'}]) assert.equal(parseDiagnosticInput(bad),null);
});
test('vendor citation has fixed provenance and no internal metadata',()=>{
 const c={kind:'vendor',vendor:'espressif',chip:'esp32',framework:'esp-idf',frameworkVersion:'5.5.1',id:'S1',title:'GPIO & RTC GPIO',sourceUrl:'https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-reference/peripherals/gpio.html',capturedAt:'2026-11-05T14:08:19.972Z',quote:'example',sectionPath:['API Reference - Normal GPIO','Header File']};
 assert.deepEqual(parseVendorCitation(c),c);for(const v of [{...c,sourceId:'private'}, {...c,chip:'esp32c3'}, {...c,sourceUrl:'https://example.org/'}, {...c,quote:''}])assert.equal(parseVendorCitation(v),null);
});
