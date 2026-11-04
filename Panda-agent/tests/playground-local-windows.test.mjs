import test from 'node:test';
import assert from 'node:assert/strict';
import { validLocalWindowsPrivacy, inspectLocalWindowsPrivacy } from '../src/control-room/playground-local-windows.ts';
import { readLocalPlaygroundConfig, readPrivateLocalLeaseConfig } from '../src/control-room/playground-local-config.ts';
import { mkdir, mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
await mkdir(path.resolve('Panda-agent/artifacts'), { recursive: true });
const owner='S-1-5-21-111-222-333-1001',system='S-1-5-18',admins='S-1-5-32-544';
const allow=(sid,inherited=false)=>({sid,type:'Allow',inherited,rights:1179817,objectInherit:!inherited});
const acl=(rules,protectedValue)=>({owner,protected:protectedValue,hasDacl:true,rules});
const good=()=>({currentSid:owner,parent:acl([allow(owner),allow(system),allow(admins)],true),file:acl([allow(owner),allow(system,true),allow(admins,true)],false)});
async function removeFixture(directory){const root=await realpath(path.resolve('Panda-agent/artifacts')),target=await realpath(directory),rel=path.relative(root,target);assert.ok(rel && rel!=='..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel));await rm(target,{recursive:true,force:true});}
test('accepts only owned files and protected parents with safe inherited principals',()=>{
 assert.equal(validLocalWindowsPrivacy(good()),true);
 const noInheritance=good();noInheritance.file.protected=true;noInheritance.file.rules=[allow(owner)];assert.equal(validLocalWindowsPrivacy(noInheritance),true);
});
test('Windows loader checks ACL both before and after reading an isolated fixture', {skip:process.platform!=='win32'}, async()=>{
 const directory=await mkdtemp(path.resolve('Panda-agent/artifacts/windows-acl-fixture-')), file=path.join(directory,'fixture.json');
 const now=Date.parse('2026-11-04T10:00:00Z'), config={version:1,expiresAt:'2026-11-04T11:00:00Z',ownerSubjectSha256:'a'.repeat(64),serviceToken:'b'.repeat(64),caCertificate:'-----BEGIN CERTIFICATE-----\nQUJDRA==\n-----END CERTIFICATE-----\n'};
 const env={NODE_ENV:'development',PANDA_AGENT_PLAYGROUND_GATEWAY_ENABLED:'true',PANDA_AGENT_PLAYGROUND_GATEWAY_PROTOCOL:'v3-context-digest',PANDA_AGENT_PLAYGROUND_PROFILE:'mini-two-case-v1',PANDA_AGENT_PLAYGROUND_TRANSPORT:'local-ssm-v3',PANDA_AGENT_PLAYGROUND_LOCAL_CONFIG:file};
 try { await writeFile(file,JSON.stringify(config));let checks=0;assert.deepEqual(await readLocalPlaygroundConfig(env,()=>now,async target=>{assert.equal(target,file);checks++;return true;}),config);assert.equal(checks,2);
  checks=0;assert.equal(await readLocalPlaygroundConfig(env,()=>now,async()=>++checks<2),null);assert.equal(checks,2);
  checks=0;assert.equal(await readLocalPlaygroundConfig(env,()=>now,async()=>{checks++;return false;}),null);assert.equal(checks,1);
 } finally {await removeFixture(directory);}
});
test('shared lease reader retains local, expiry and two-ACL-check guards without playground flags', {skip:process.platform!=='win32'}, async()=>{
 const directory=await mkdtemp(path.resolve('Panda-agent/artifacts/windows-shared-fixture-')), file=path.join(directory,'fixture.json');
 const now=Date.parse('2026-11-04T10:00:00Z'), config={version:1,expiresAt:'2026-11-04T11:00:00Z',ownerSubjectSha256:'a'.repeat(64),serviceToken:'b'.repeat(64),caCertificate:'-----BEGIN CERTIFICATE-----\nQUJDRA==\n-----END CERTIFICATE-----\n'};
 try { await writeFile(file,JSON.stringify(config));let checks=0;const inspect=async()=>{checks++;return true;};
  assert.deepEqual(await readPrivateLocalLeaseConfig({NODE_ENV:'development'},file,()=>now,inspect),config);assert.equal(checks,2);
  for(const env of [{NODE_ENV:'production'},{NODE_ENV:'development',VERCEL:'1'},{NODE_ENV:'development',VERCEL_ENV:'preview'}]) assert.equal(await readPrivateLocalLeaseConfig(env,file,()=>now,inspect),null);
  assert.equal(await readPrivateLocalLeaseConfig({NODE_ENV:'development'},file,()=>Date.parse(config.expiresAt),inspect),null);
  checks=0;assert.equal(await readPrivateLocalLeaseConfig({NODE_ENV:'development'},file,()=>now,async()=>++checks<2),null);assert.equal(checks,2);
 } finally {await removeFixture(directory);}
});
test('rejects unexpected principals, owner drift, unprotected parent and invalid ACLs',()=>{
 const values=[];
 for(const where of ['file','parent']) {const v=good();v[where].rules.push(allow('S-1-1-0'));values.push(v);const d=good();d[where].rules.push({sid:'S-1-5-11',type:'Deny',inherited:true});values.push(d);const o=good();o[where].owner='S-1-5-21-111-222-333-1002';values.push(o);const n=good();n[where].hasDacl=false;values.push(n);}
 const inheritedParent=good();inheritedParent.parent.protected=false;values.push(inheritedParent);
 const wrongInherited=good();wrongInherited.file.rules[1].rights++;values.push(wrongInherited);
 const notInheritable=good();notInheritable.parent.rules[1].objectInherit=false;values.push(notInheritable);
 const malformed=good();malformed.file.rules=[{sid:owner,type:'Invalid',inherited:false}];values.push(malformed);
 const missing=good();missing.currentSid='invalid';values.push(missing);
 for(const value of values)assert.equal(validLocalWindowsPrivacy(value),false);
 for(const value of [null,{},[],{...good(),file:null},{...good(),parent:{...good().parent,rules:null}}])assert.equal(validLocalWindowsPrivacy(value),false);
});
test('actual Windows metadata inspection accepts a protected disposable ACL', {skip:process.platform!=='win32'}, async()=>{
 const root=path.resolve('Panda-agent/artifacts');const directory=await mkdtemp(path.join(root,'windows-acl-os-fixture-'));const file=path.join(directory,'fixture.json');
 try {
  await writeFile(file,'{}');
  const script=String.raw`$ErrorActionPreference='Stop'; $dir=$env:PANDA_FIXTURE_DIR; $owner=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $acl=Get-Acl -LiteralPath $dir; $acl.SetAccessRuleProtection($true,$false); $acl.SetOwner($owner); foreach($s in @($owner.Value,'S-1-5-18','S-1-5-32-544')) { $sid=[System.Security.Principal.SecurityIdentifier]::new($s); $rule=[System.Security.AccessControl.FileSystemAccessRule]::new($sid,[System.Security.AccessControl.FileSystemRights]::FullControl,([System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit),[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow); [void]$acl.AddAccessRule($rule) }; Set-Acl -LiteralPath $dir -AclObject $acl`;
  const exe=path.win32.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  execFileSync(exe,['-NoProfile','-NonInteractive','-Command',script],{env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,TEMP:process.env.TEMP,PANDA_FIXTURE_DIR:directory},windowsHide:true,timeout:5000,stdio:'pipe'});
  assert.equal(await inspectLocalWindowsPrivacy(file),true);
  const icacls=path.win32.join(process.env.SystemRoot,'System32','icacls.exe');
  execFileSync(icacls,[directory,'/grant','*S-1-1-0:(OI)(CI)(RX)'],{env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,TEMP:process.env.TEMP},windowsHide:true,timeout:5000,stdio:'pipe'});
  assert.equal(await inspectLocalWindowsPrivacy(file),false);
 } finally { await removeFixture(directory); }
});
