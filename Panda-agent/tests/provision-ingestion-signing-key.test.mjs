import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import path from 'node:path';
import { provision, pinnedCli } from '../scripts/provision-ingestion-signing-key.mjs';
const artifacts=path.resolve('Panda-agent/artifacts');
const target={authenticated:true,project:{project_id:'9f27721e-78d0-4259-8878-eeb94c7103e2',org_id:'09dad465-be7d-4245-9d2f-70c9c9f5a032',oss_host:'https://feh4966v.us-east.insforge.app'}};
async function fixture(fn){const dir=await mkdtemp(path.join(artifacts,'ingestion-key-test-'));try{await chmod(dir,0o700);const cwd=path.join(dir,'target');await mkdir(path.join(cwd,'.insforge'),{recursive:true});await writeFile(path.join(cwd,'.insforge','project.json'),'{}');await fn({dir,cwd,filename:path.join(dir,'key'),cliEntry:path.join(dir,'cli.mjs')});}finally{await rm(dir,{recursive:true,force:true});}}
const base=values=>({...values,verifyCli:async()=>values.cliEntry,inspect:async()=>true});
const makeRunner=(key,events,mode)=>async(_exe,args)=>{events.push(args);if(args.includes('--version'))return {stdout:'0.2.8'};if(args.includes('current'))return {stdout:JSON.stringify(target)};if(args.includes('query')){if(mode==='fail')throw Error('private diagnostics');return {stdout:JSON.stringify({rows:[{key}]})};}throw Error('unexpected');};
test('writes a generated key exclusively while keeping it out of command arguments and result',async()=>fixture(async values=>{
 const key='a'.repeat(64),events=[];const result=await provision({...base(values),runner:makeRunner(key,events)});
 assert.deepEqual(result,{status:'provisioned',keyBytes:32});assert.equal(await readFile(values.filename,'utf8'),key+'\n');assert.ok(events.every(args=>!args.some(arg=>arg.includes(key))));assert.equal(events.filter(args=>args.includes('query')).length,1);
 await assert.rejects(provision({...base(values),runner:makeRunner(key,[])}));
}));
test('wrong target and unknown output never repeat the insert or reveal diagnostics',async()=>fixture(async values=>{
 const events=[];const runner=async(e,args,o)=>args.includes('current')?{stdout:JSON.stringify({...target,authenticated:false})}:makeRunner('a'.repeat(64),events)(e,args,o);
 await assert.rejects(provision({...base(values),runner}));assert.equal(events.some(a=>a.includes('query')),false);
 const attempted=[];await assert.rejects(provision({...base(values),runner:makeRunner('a'.repeat(64),attempted,'fail')}));assert.equal(attempted.filter(a=>a.includes('query')).length,1);assert.equal(await readFile(values.filename,'utf8'),'');
 await assert.rejects(provision({...base(values),runner:makeRunner('a'.repeat(64),[])}));
}));

test('installed official CLI entry passes pinned identity and digest', {skip:!process.env.INSFORGE_CLI_TEST_ENTRY}, async()=>{ assert.equal(await pinnedCli(process.env.INSFORGE_CLI_TEST_ENTRY),await (await import('node:fs/promises')).realpath(process.env.INSFORGE_CLI_TEST_ENTRY)); });

test('normalizes native or forward slash output paths before exclusive creation',async()=>fixture(async values=>{
 const filename=values.filename.replaceAll('\\','/'),events=[];
 assert.deepEqual(await provision({...base(values),filename,runner:makeRunner('b'.repeat(64),events)}),{status:'provisioned',keyBytes:32});
 assert.equal(await readFile(values.filename,'utf8'),'b'.repeat(64)+'\n');
}));
