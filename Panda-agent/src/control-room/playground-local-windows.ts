import 'server-only';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const sid = (value: unknown): value is string => typeof value === 'string' && /^S-1-(?:\d+-){1,14}\d+$/.test(value);
type Rule = { sid: string; type: 'Allow' | 'Deny'; inherited: boolean; rights: number; objectInherit: boolean };
type Acl = { owner: string; protected: boolean; hasDacl: boolean; rules: Rule[] };
type Inspection = { currentSid: string; file: Acl; parent: Acl };

// The parent must stop inheritance from the workspace, and neither ACL may
// contain a principal outside the owner, SYSTEM or built-in Administrators.
export function validLocalWindowsPrivacy(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const report = value as Partial<Inspection>;
  if (!sid(report.currentSid) || !report.file || !report.parent || report.parent.protected !== true) return false;
  const permitted = new Set([report.currentSid, 'S-1-5-18', 'S-1-5-32-544']);
  const valid = [report.file, report.parent].every(acl => !!acl && typeof acl === 'object' && acl.owner === report.currentSid && typeof acl.protected === 'boolean' && acl.hasDacl === true && Array.isArray(acl.rules) && acl.rules.length <= 256 && acl.rules.every(rule => !!rule && typeof rule === 'object' && permitted.has(rule.sid) && ['Allow','Deny'].includes(rule.type) && typeof rule.inherited === 'boolean' && Number.isSafeInteger(rule.rights) && rule.rights >= -2147483648 && rule.rights <= 2147483647 && typeof rule.objectInherit === 'boolean'));
  return valid && report.file.rules.every(rule => !rule.inherited || report.parent!.rules.some(parent => parent.objectInherit && parent.sid === rule.sid && parent.type === rule.type && parent.rights === rule.rights));
}

// Static command: the filename is passed as an environment variable, never as code.
const script = String.raw`
$ErrorActionPreference = 'Stop'
function Read-Privacy([string] $literal) {
  $acl = Get-Acl -LiteralPath $literal
  $raw = [System.Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(), 0)
  $hasDacl = (($raw.ControlFlags -band [System.Security.AccessControl.ControlFlags]::DiscretionaryAclPresent) -ne 0) -and ($null -ne $raw.DiscretionaryAcl)
  $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]) | ForEach-Object {
    [pscustomobject]@{ sid = $_.IdentityReference.Value; type = $_.AccessControlType.ToString(); inherited = [bool]$_.IsInherited; rights = [int64]$_.FileSystemRights; objectInherit = [bool]($_.InheritanceFlags -band [System.Security.AccessControl.InheritanceFlags]::ObjectInherit) }
  })
  return [pscustomobject]@{ owner = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value; protected = [bool]$acl.AreAccessRulesProtected; hasDacl = [bool]$hasDacl; rules = $rules }
}
$filename = $env:PANDA_ACL_PATH
$parent = [System.IO.Path]::GetDirectoryName($filename)
if ([string]::IsNullOrEmpty($filename) -or [string]::IsNullOrEmpty($parent)) { throw 'Invalid path' }
[pscustomobject]@{ currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; file = (Read-Privacy $filename); parent = (Read-Privacy $parent) } | ConvertTo-Json -Depth 6 -Compress
`;

export async function inspectLocalWindowsPrivacy(filename: string): Promise<boolean> {
  if (process.platform !== 'win32' || typeof filename !== 'string' || !path.win32.isAbsolute(filename) || !process.env.SystemRoot || !path.win32.isAbsolute(process.env.SystemRoot)) return false;
  try {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => /^(?:SYSTEMROOT|TEMP|PATH)$/i.test(key) && value !== undefined)) as NodeJS.ProcessEnv;
    env.PANDA_ACL_PATH = filename;
    const executable = path.win32.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const result = await exec(executable, ['-NoProfile','-NonInteractive','-Command',script], { env, windowsHide:true, timeout:5000, maxBuffer:65536, encoding:'utf8' });
    return validLocalWindowsPrivacy(JSON.parse(result.stdout));
  } catch { return false; }
}
