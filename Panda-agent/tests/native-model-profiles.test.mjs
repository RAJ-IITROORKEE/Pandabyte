import test from 'node:test';import assert from 'node:assert/strict';
import {nativeModelProfiles,nativeModelProfile,profileForNativeModelId,isNativeModelId,maximumTokenCostNanoUsd,reservationQuantumNanoUsd,disabledNvidiaFree} from '../src/opencode/native-model-profiles.ts';
test('exact static profiles reserve shared ledger quanta and fail closed on unknown selection',()=>{
 const luna=nativeModelProfile('luna'),deep=nativeModelProfile('deepseek-v3-2-exp');
 assert.equal(maximumTokenCostNanoUsd(luna),1906312);assert.equal(maximumTokenCostNanoUsd(deep),44523800);assert.equal(deep.reservationQuanta*reservationQuantumNanoUsd,44733920);
 assert.equal(deep.framingBoundProven,false);assert.equal(deep.dispatchEnabled,false);assert.equal(luna.dispatchEnabled,true);
 assert.ok(Object.isFrozen(nativeModelProfiles)&&Object.isFrozen(deep)&&Object.isFrozen(deep.reportedModels));assert.throws(()=>nativeModelProfile('nvidia/nemotron-3.5-lightning:free'));assert.equal(disabledNvidiaFree.reason,'exact_zdr_endpoint_unverified');
});
test('display-only candidates cannot enter native execution without verified profiles',()=>{
 for (const id of ['nvidia/nemotron-3-ultra-550b-a55b:free']) {
  assert.equal(isNativeModelId(id),false);
  assert.throws(()=>profileForNativeModelId(id),/invalid_profile/);
 }
});

test('new profiles reserve their conservative maximum',()=>{
 for(const [id,cost,quanta] of [['deepseek-chat-v3-0324',41660000,27],['terra',19008000,12],['haiku',689925000,432]]){const p=nativeModelProfile(id);assert.equal(maximumTokenCostNanoUsd(p),cost);assert.equal(p.reservationQuanta,quanta);assert.ok(cost<=quanta*reservationQuantumNanoUsd&&quanta*reservationQuantumNanoUsd<=1000000000);assert.equal(profileForNativeModelId(p.model),p);}
});
