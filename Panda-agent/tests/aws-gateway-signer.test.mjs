import {test} from 'node:test';import assert from 'node:assert/strict';
import {createAwsGatewaySigner} from '../src/server/aws-gateway-signer.ts';
const roleArn='arn:aws:iam::111122223333:role/panda-synthetic';
const request={url:'https://abc123def4.execute-api.ap-south-1.amazonaws.com/synthetic/v1/turns',method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','X-Panda-Service-Token':'a'.repeat(64),'X-Panda-User-Token':'test.token.1234567890'},body:'{}'};
test('official SigV4 signer requires short-lived session credentials and binds headers',async()=>{
 const signer=createAwsGatewaySigner({roleArn,credentials:async()=>({accessKeyId:'AKIDEXAMPLE',secretAccessKey:'fixture-only',sessionToken:'fixture-session',expiration:new Date(Date.now()+60000)})});
 const headers=await signer(request);assert.match(headers.authorization,/^AWS4-HMAC-SHA256 /);assert.match(headers.authorization,/x-panda-service-token/);assert.match(headers.authorization,/x-panda-user-token/);assert.equal(headers['x-amz-security-token'],'fixture-session');
});
test('missing session credentials and foreign target fail closed',async()=>{
 const signer=createAwsGatewaySigner({roleArn,credentials:async()=>({accessKeyId:'fixture',secretAccessKey:'fixture'})});
 await assert.rejects(signer(request));await assert.rejects(signer({...request,url:'https://attacker.example/synthetic/v1/turns'}));
});
test('only fixed agent and legacy synthetic stage paths can be signed',async()=>{const signer=createAwsGatewaySigner({roleArn,credentials:async()=>({accessKeyId:'AKIDEXAMPLE',secretAccessKey:'fixture-only',sessionToken:'fixture-session',expiration:new Date(Date.now()+60000)})});assert.match((await signer({...request,url:'https://abc123def4.execute-api.ap-south-1.amazonaws.com/agent/v1/turns'})).authorization,/^AWS4-HMAC-SHA256 /);await assert.rejects(signer({...request,url:'https://abc123def4.execute-api.ap-south-1.amazonaws.com/other/v1/turns'}));});
test('signs only the fixed authenticated agent status GET with empty body',async()=>{const signer=createAwsGatewaySigner({roleArn,credentials:async()=>({accessKeyId:'AKIDEXAMPLE',secretAccessKey:'fixture-only',sessionToken:'fixture-session',expiration:new Date(Date.now()+60000)})});const status={url:'https://abc123def4.execute-api.ap-south-1.amazonaws.com/agent/v1/status',method:'GET',headers:{Accept:'application/json','X-Panda-Service-Token':'a'.repeat(64),'X-Panda-User-Token':'test.token.1234567890'},body:''};assert.match((await signer(status)).authorization,/^AWS4-HMAC-SHA256 /);await assert.rejects(signer({...status,body:'x'}));await assert.rejects(signer({...status,url:status.url+'?x=1'}));await assert.rejects(signer({...status,url:'https://abc123def4.execute-api.ap-south-1.amazonaws.com/agent/v1/turns'}));});
