import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {readNativeRuntimeFile} from '../src/server/native-runtime-file.ts';
test('private descriptor reader is optional and rejects relative, missing and control-bearing paths',async()=>{
 for(const path of [undefined,'','relative.json',join(tmpdir(),'missing-native-fixture.json'),join(tmpdir(),'invalid\u0000.json')])assert.equal(await readNativeRuntimeFile(path),null);
});
test('reader accepts only bounded well-formed strict JSON and cleans its temporary files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pandabyte-runtime-file-'));const path=join(root,'runtime.json');
 try{
  const value={version:1,generation:'fixture-data-only'};await writeFile(path,JSON.stringify(value),{mode:0o600});
  if(process.platform==='win32')execFileSync(join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command',
   "$ErrorActionPreference='Stop';$p=[Console]::In.ReadToEnd();$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;$a=[System.Security.AccessControl.FileSecurity]::new();$a.SetOwner($sid);$a.SetAccessRuleProtection($true,$false);$a.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','Allow'));[System.IO.File]::SetAccessControl($p,$a)"],{input:path,windowsHide:true,timeout:5000});
  assert.deepEqual(await readNativeRuntimeFile(path),value);
  for(const body of ['{"a":1,"a":2}', 'x'.repeat(16385), '{', Buffer.from([0xff,0xfe])]){await writeFile(path,body);assert.equal(await readNativeRuntimeFile(path),null);}
  await writeFile(path,JSON.stringify(value));
  if(process.platform==='win32'){
   execFileSync(join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command',
    "$ErrorActionPreference='Stop';$p=[Console]::In.ReadToEnd();$a=[System.IO.File]::GetAccessControl($p);$a.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new('S-1-1-0'),'Read','Allow'));[System.IO.File]::SetAccessControl($p,$a)"],{input:path,windowsHide:true,timeout:5000});
   assert.equal(await readNativeRuntimeFile(path),null);
   execFileSync(join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command',
    "$ErrorActionPreference='Stop';$p=[Console]::In.ReadToEnd();$a=[System.IO.File]::GetAccessControl($p);$a.SetSecurityDescriptorSddlForm('D:NO_ACCESS_CONTROL',[System.Security.AccessControl.AccessControlSections]::Access);[System.IO.File]::SetAccessControl($p,$a);$raw=[System.Security.AccessControl.RawSecurityDescriptor]::new([System.IO.File]::GetAccessControl($p).GetSecurityDescriptorBinaryForm(),0);if($null -ne $raw.DiscretionaryAcl){throw 'null_dacl_fixture_not_created'}"],{input:path,windowsHide:true,timeout:5000});
   assert.equal(await readNativeRuntimeFile(path),null);
  }
  if(process.platform!=='win32'){await writeFile(path,'{}');await chmod(path,0o644);assert.equal(await readNativeRuntimeFile(path),null);}
 }finally{await rm(root,{recursive:true,force:true});}
});
