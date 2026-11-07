import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readSkillHistory, skillPolicy, skillTransport, syntheticSkill } from '../scripts/opencode-skill-contract-probe.mjs';

const skillID='fixture-'+'a'.repeat(32),baseUrl='http://127.0.0.1:43210',directory=resolve('tmp/skill-fixture');
const receipt={sessionID:'ses_123456789abcABCDEFGHIJKLMN',nonce:'b'.repeat(32),binding:'c'.repeat(64),scope:'playground',title:'panda-agent-playground-'+'b'.repeat(32)};
const create=()=>({id:receipt.sessionID,title:receipt.title,location:{directory},metadata:{pandaAgent:{nonce:receipt.nonce,binding:receipt.binding,scope:receipt.scope}},permissions:[{action:'*',resource:'*',effect:'deny'}]});
const setup=transport=>{const mutations={create:0,activate:0,remove:0};return{mutations,transport:skillTransport({baseUrl,directory,receipt,skillID,mutations,signal:new AbortController().signal,fetch:transport})};};

test('synthetic skill is inert local Markdown with automatic model invocation disabled',()=>{
  const markdown=syntheticSkill(skillID);assert.ok(markdown.includes('disable-model-invocation: true'));
  assert.ok(markdown.includes('name: '+skillID));assert.ok(markdown.endsWith('This document is an inert fixture for local capability inspection.\n'));
  assert.equal(/https?:|```/.test(markdown),false);
  for(const value of ['*','external','fixture-*','fixture-'+ 'a'.repeat(33)])assert.throws(()=>syntheticSkill(value));
});

test('skill policy grants one exact local skill integration while retaining provider/tool/all other denies',()=>{
  const config=skillPolicy(skillID,directory);assert.deepEqual(config.skills,[directory]);
  assert.deepEqual(config.permissions,[{action:'*',resource:'*',effect:'deny'}]);
  assert.deepEqual(config.policies,[...['tool.use','provider.use','integration.use'].map(action=>({action,resource:'*',effect:'deny'})),{action:'integration.use',resource:'skill:'+skillID,effect:'allow'}]);
  assert.throws(()=>skillPolicy(skillID,'relative'));assert.deepEqual(config.mcp,{servers:{}});assert.deepEqual(config.plugins,[]);
});

test('only an exact owned activation with explicit boolean resume:false can reach native transport',async()=>{
  let calls=0;const f=setup(async()=>{calls++;return new Response(null,{status:204});});
  const path=baseUrl+'/api/experimental/session/'+receipt.sessionID+'/skill';
  for(const body of [{id:skillID},{id:skillID,resume:true},{id:skillID,resume:'false'},{id:skillID,resume:null},{id:'other',resume:false},{id:skillID,resume:false,prompt:'unsafe'}])await assert.rejects(f.transport(path,{method:'POST',body:JSON.stringify(body)}));
  assert.equal(calls,0);
  await f.transport(path,{method:'POST',body:JSON.stringify({id:skillID,resume:false})});
  await assert.rejects(f.transport(path,{method:'POST',body:JSON.stringify({id:skillID,resume:false})}));
  assert.equal(calls,1);assert.equal(f.mutations.activate,1);
});

test('session creation must keep exact owner receipt, local directory and deny-all permissions',async()=>{
  let calls=0;const f=setup(async()=>{calls++;throw Error('lost acknowledgement');});
  for(const patch of [{permissions:[]},{permissions:[{action:'*',resource:'*',effect:'allow'}]},{location:{directory:resolve('tmp/other')}},{id:'unowned'}, {resume:true}])await assert.rejects(f.transport(baseUrl+'/api/session',{method:'POST',body:JSON.stringify({...create(),...patch})}));
  assert.equal(calls,0);
  await assert.rejects(f.transport(baseUrl+'/api/session',{method:'POST',body:JSON.stringify(create())}));
  await assert.rejects(f.transport(baseUrl+'/api/session',{method:'POST',body:JSON.stringify(create())}));
  assert.equal(calls,1);assert.equal(f.mutations.create,1);
});

test('all prompt/model/tool/shell paths and another owned-session namespace are blocked before network',async()=>{
  let calls=0;const f=setup(async()=>{calls++;return Response.json({});});
  for(const path of ['/api/session/'+receipt.sessionID+'/prompt','/api/session/'+receipt.sessionID+'/shell','/api/session/'+receipt.sessionID+'/command','/api/experimental/generate/text','/api/experimental/session/unowned/skill'])await assert.rejects(f.transport(baseUrl+path,{method:'POST',body:'{}'}));
  await assert.rejects(f.transport('https://outside.invalid/api/info'));assert.equal(calls,0);
});

test('durable event log is bounded and non-following, while deletion is claimed only once',async()=>{
  const f=setup(async(url)=>url.pathname.endsWith('/log')?new Response('data: {"type":"fixture"}\n\n',{headers:{'content-type':'text/event-stream'}}):new Response(null,{status:204}));
  const log=baseUrl+'/api/experimental/session/'+receipt.sessionID+'/log';
  await assert.rejects(f.transport(log));await assert.rejects(f.transport(log+'?follow=true'));
  assert.equal(await(await f.transport(log+'?follow=false')).text(),'data: {"type":"fixture"}\n\n');
  const owned=baseUrl+'/api/session/'+receipt.sessionID;await f.transport(owned,{method:'DELETE'});await assert.rejects(f.transport(owned,{method:'DELETE'}));assert.equal(f.mutations.remove,1);
});

test('native anchor cursors on nonempty pages require one final empty history page',async()=>{
  const calls=[],message={type:'skill',skill:skillID};
  const messages=await readSkillHistory(async cursor=>{calls.push(cursor);return cursor?{data:[],cursor:{}}:{data:[message],cursor:{next:'native_anchor'}};});
  assert.deepEqual(messages,[message]);assert.deepEqual(calls,[undefined,'native_anchor']);
  await assert.rejects(readSkillHistory(async()=>({data:[],cursor:{next:'unexpected'}})));
  await assert.rejects(readSkillHistory(async()=>({data:[message],cursor:{next:'repeated'}})));
});
