import assert from "node:assert/strict";
import test from "node:test";
import { contactProtection, parseProtectedInquiry, validTurnstileResult, verifyTurnstile } from "../lib/contact/turnstile.ts";
const base = {CONTACT_TURNSTILE_MODE:"local-test",CONTACT_SITE_ORIGIN:"http://localhost:3000",NEXT_PUBLIC_TURNSTILE_SITE_KEY:"1x00000000000000000000AA",TURNSTILE_SECRET_KEY:"1x0000000000000000000000000000000AA",CONTACT_SUBMISSION_KEY:"a".repeat(64)};
const local = contactProtection(base);
const live = contactProtection({...base,CONTACT_TURNSTILE_MODE:"live",CONTACT_SITE_ORIGIN:"https://www.pandabyte.in",NEXT_PUBLIC_TURNSTILE_SITE_KEY:"real-site-key",TURNSTILE_SECRET_KEY:"real-secret-key"});
const valid = {name:"Test",email:"test@example.com",subject:"Test",message:"Message",idempotencyKey:"00000000-0000-4000-8000-000000000001",challengeToken:"token"};

test("contact protection fails closed outside explicitly configured local-test or live contexts",()=>{
  assert(local?.testMode);assert(live&&!live.testMode);
  for(const patch of [{VERCEL:"1"},{CONTACT_SITE_ORIGIN:"https://www.pandabyte.in"},{CONTACT_TURNSTILE_MODE:"live"},{CONTACT_SUBMISSION_KEY:""},{TURNSTILE_SECRET_KEY:""},{CONTACT_SITE_ORIGIN:"http://localhost:3000/path"},{CONTACT_SITE_ORIGIN:"http://user:pass@localhost:3000"}])assert.equal(contactProtection({...base,...patch}),null);
  assert.equal(contactProtection({...base,CONTACT_TURNSTILE_MODE:"live",CONTACT_SITE_ORIGIN:"https://www.pandabyte.in"}),null);
  assert.equal(contactProtection({}),null);
});

test("inquiry boundary accepts only a bounded challenge and established contact fields",()=>{
  assert(parseProtectedInquiry(valid));
  for(const patch of [{challengeToken:""},{challengeToken:"x".repeat(2049)},{challengeToken:"bad token"},{challengeToken:null},{submissionKey:"a"},{role:"ADMIN"},{message:""}])assert.equal(parseProtectedInquiry({...valid,...patch}),null);
});

test("live verification binds exact hostname/action and fresh timestamps; test response cannot authorize live",()=>{
  const now=Date.now(), value={success:true,hostname:"www.pandabyte.in",action:"contact",challenge_ts:new Date(now-1000).toISOString()};
  assert(validTurnstileResult(value,live,now));
  assert.equal(validTurnstileResult({...value,metadata:{result_with_testing_key:true}},live,now),false);
  for(const patch of [{success:false},{hostname:"evil.example"},{action:"login"},{challenge_ts:"invalid"},{challenge_ts:new Date(now-300001).toISOString()},{challenge_ts:new Date(now+30001).toISOString()}])assert.equal(validTurnstileResult({...value,...patch},live,now),false);
  assert(validTurnstileResult({success:true,metadata:{result_with_testing_key:true}},local));
  assert.equal(validTurnstileResult({success:true,hostname:"example.com",metadata:{result_with_testing_key:true}},live),false);
  assert.equal(validTurnstileResult({success:true},local),false);
});

test("provider verification never accepts errors, invalid data or oversized/redirected responses",async()=>{
  let calls=0;
  const success=async(url,init)=>{calls++;assert.equal(url,"https://challenges.cloudflare.com/turnstile/v0/siteverify");assert.equal(init.redirect,"error");assert.equal(init.cache,"no-store");const body=JSON.parse(init.body);assert.equal(body.idempotency_key,valid.idempotencyKey);assert.equal("remoteip"in body,false);return Response.json({success:true,metadata:{result_with_testing_key:true}});};
  assert.equal(await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX",valid.idempotencyKey,local,success),"verified");
  assert.equal(await verifyTurnstile("arbitrary",valid.idempotencyKey,local,success),"rejected");assert.equal(calls,1);
  for(const fetcher of [async()=>new Response("no",{status:500}),async()=>new Response("not-json"),async()=>new Response("x".repeat(16385)),async()=>{throw Error("timeout");}])assert.equal(await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX",valid.idempotencyKey,local,fetcher),"unavailable");
  assert.equal(await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX",valid.idempotencyKey,local,async()=>Response.json({success:false,"error-codes":["timeout-or-duplicate"]})),"rejected");
});
