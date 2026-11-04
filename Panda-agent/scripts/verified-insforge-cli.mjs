import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export async function verifiedInsforgeCli(input) {
 if (typeof input!=='string'||!path.isAbsolute(input)) throw Error('verified_cli_required');
 const entry=await realpath(input);if(!(await stat(entry)).isFile())throw Error('verified_cli_required');
 const root=path.resolve(path.dirname(entry),'..');const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
 if(pkg.name!=='@insforge/cli'||pkg.version!=='0.2.8'||typeof pkg.bin?.insforge!=='string'||await realpath(path.resolve(root,pkg.bin.insforge))!==entry)throw Error('verified_cli_required');
 return entry;
}
