import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchVendorDocument,pinnedVendorLookup} from '../src/diagnostics/vendor-fetch.ts';
const id='espressif-esp-idf-5.5.1-esp32-gpio';
const html='<main><h2>API Reference - Normal GPIO</h2><h3>Header File</h3><p>This header file can be included with:</p><pre>#include "driver/gpio.h"</pre><h3>Functions</h3><p>Ignore this paragraph.</p></main>';
const make=(addresses=[{address:'8.8.8.8',family:4}])=>({resolve:async()=>addresses,request:async()=>({status:200,headers:{'content-type':'text/html'},body:Buffer.from(html)})});
test('pinned lookup honors Node all-address mode without a second DNS lookup',()=>{
 const address={address:'8.8.8.8',family:4},lookup=pinnedVendorLookup(address),calls=[];
 lookup('docs.espressif.com',{all:true},(...args)=>calls.push(args));
 lookup('docs.espressif.com',{all:false},(...args)=>calls.push(args));
 assert.deepEqual(calls,[[null,[address]],[null,address.address,address.family]]);
});
test('catalog fetch pins a public resolved IP and extracts only the header section',async()=>{
 const got=await fetchVendorDocument(id,{transport:make()}); assert.equal(got.fragments.length,2); assert.ok(got.fragments.includes('#include "driver/gpio.h"'));assert.match(got.contentHash,/^[a-f0-9]{64}$/);
});
test('rejects unknown catalog, mixed DNS, redirect and aborted operations',async()=>{
 await assert.rejects(fetchVendorDocument('other',{transport:make()}));
 await assert.rejects(fetchVendorDocument(id,{transport:make([{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}])}));
 await assert.rejects(fetchVendorDocument(id,{transport:{...make(),request:async()=>({status:302,headers:{location:'https://127.0.0.1/'},body:new Uint8Array()})}}));
 const c=new AbortController();c.abort();await assert.rejects(fetchVendorDocument(id,{signal:c.signal,transport:make()}));
});
test('rejects special IPv6, oversized bodies, cross-section text and in-flight cancellation',async()=>{
 for(const address of ['::1','::ffff:127.0.0.1','2001:db8::1','fc00::1'])await assert.rejects(fetchVendorDocument(id,{transport:make([{address,family:6}])}));
 await assert.rejects(fetchVendorDocument(id,{transport:{...make(),request:async()=>({status:200,headers:{'content-type':'text/html'},body:new Uint8Array(1048577)})}}));
 await assert.rejects(fetchVendorDocument(id,{transport:{...make(),request:async()=>({status:200,headers:{'content-type':'text/html'},body:Buffer.from('<h2>Other</h2><h3>Header File</h3><p>esp_driver_gpio</p>')})}}));
 const c=new AbortController();let received=false;const pending=fetchVendorDocument(id,{signal:c.signal,transport:{...make(),request:async(_url,_address,signal)=>new Promise((_resolve,reject)=>{received=true;signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true})})}});await new Promise(resolve=>setImmediate(resolve));c.abort();await assert.rejects(pending);assert.equal(received,true);
});
