import { lstat, open } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { execFile } from 'node:child_process';
import { strictJson } from '../lightweight/client.ts';

const aclScript = `$ErrorActionPreference='Stop';try {
 [Console]::InputEncoding=[System.Text.UTF8Encoding]::new($false);
 $acl=[System.IO.File]::GetAccessControl([Console]::In.ReadToEnd());
 $raw=[System.Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(),0);
 if($null -eq $raw.DiscretionaryAcl -or $raw.DiscretionaryAcl.Count -eq 0){exit 1};
 $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value;
 if($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid){exit 1};
 $allowed=@($sid,'S-1-5-18','S-1-5-32-544');
 foreach($rule in $acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])) {
  if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin $allowed){exit 1}
 };[Console]::Out.Write('private')
}catch{exit 1}`;
async function windowsPrivate(path: string): Promise<boolean> {
    return new Promise(resolve => {
        const child = execFile(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
            ['-NoProfile', '-NonInteractive', '-Command', aclScript], { windowsHide: true, timeout: 5000, maxBuffer: 64 },
            (error, stdout) => resolve(!error && stdout === 'private'));
        // Path travels as stdin data, never interpolated PowerShell code or a credential argument.
        child.stdin?.end(path);
        child.stdin?.on('error', () => {});
    });
}

// Only an owner-private supervisor descriptor is accepted; this never starts or resumes a process.
export async function readNativeRuntimeFile(path: string | undefined): Promise<unknown | null> {
    if (!path) return null;
    if (!isAbsolute(path) || /[\u0000-\u001f\u007f]/.test(path)) return null;
    let file;
    try {
        const before = await lstat(path);
        if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size < 2 || before.size > 16384
            || (process.platform !== 'win32' && ((before.mode & 0o077) !== 0 || before.uid !== process.getuid?.()))) return null;
        file = await open(path, 'r');
        const opened = await file.stat();
        if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size
            || (process.platform !== 'win32' && ((opened.mode & 0o077) !== 0 || opened.uid !== process.getuid?.()))) return null;
        const bytes = Buffer.alloc(16385);
        const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
        if (bytesRead !== before.size || bytesRead > 16384) return null;
        if (process.platform === 'win32' && !await windowsPrivate(path)) return null;
        const after = await lstat(path);
        if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.isSymbolicLink()) return null;
        return strictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytesRead)));
    } catch { return null; }
    finally { await file?.close().catch(() => {}); }
}
