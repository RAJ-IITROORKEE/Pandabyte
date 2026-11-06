import test from 'node:test';
import assert from 'node:assert/strict';
import {parseToolActivity} from '../src/agentic/tool-activity.ts';
import {parseVendorCitation,parseCompositeVendorCitation} from '../src/diagnostics/contracts.ts';
test('tool activity is a finite public projection with no private metadata',()=>{
 assert.deepEqual(parseToolActivity({toolId:'fetch_public_docs_mcp',state:'running',origin:'execution'}),{toolId:'fetch_public_docs_mcp',state:'running',origin:'execution'});
 for(const card of [{toolId:'shell',state:'running',origin:'execution'},{toolId:'convert_units',state:'running',origin:'recorded'},{toolId:'convert_units',state:'complete',origin:'execution',callId:'private'},{toolId:'convert_units',state:'unknown',origin:'recorded'}])assert.equal(parseToolActivity(card),null);
});
test('composite vendor display IDs do not widen diagnostic or target validation',()=>{
 const c={kind:'vendor',vendor:'espressif',chip:'esp32',framework:'esp-idf',frameworkVersion:'5.5.1',id:'S2',title:'GPIO & RTC GPIO',sourceUrl:'https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-reference/peripherals/gpio.html',capturedAt:'2026-11-06T00:00:00Z',quote:'#include "driver/gpio.h"',sectionPath:['API Reference - Normal GPIO','Header File']};
 assert.equal(parseVendorCitation(c),null);assert.equal(parseCompositeVendorCitation(c)?.id,'S2');
 for(const change of [{chip:'esp32c3'},{frameworkVersion:'latest'},{id:'S5'},{sourceUrl:'https://evil.example'}])assert.equal(parseCompositeVendorCitation({...c,...change}),null);
});
