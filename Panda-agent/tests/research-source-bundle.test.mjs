import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

// This is the exact C2 fixture allowlist, never a recursive project/private/dependency upload.
const files=[
 'Panda-agent/scripts/test-native-research.mjs','Panda-agent/scripts/test-native-search.mjs','Panda-agent/scripts/test-native-model.mjs',
 'Panda-agent/src/server/research-search-broker.ts','Panda-agent/src/search/tavily.ts','Panda-agent/src/search/citation-url.ts',
 'Panda-agent/src/opencode/research-runtime.ts','Panda-agent/src/opencode/research-transcript.ts','Panda-agent/src/opencode/research-values.ts',
 'Panda-agent/src/opencode/research-provider-gateway.ts','Panda-agent/src/opencode/session-contracts.ts','Panda-agent/src/server/research-runtime-store.ts',
 'Panda-agent/src/server/research-docker-transport.ts','Panda-agent/src/server/native-docker-host-quota.ts','Panda-agent/src/lightweight/client.ts',
 'Panda-agent/runtime/opencode/research-binding/index.ts','Panda-agent/runtime/opencode/research-controller.mjs','Panda-agent/runtime/opencode/research-http-proxy.mjs',
 'Panda-agent/runtime/opencode/research-mcp-shim.mjs','Panda-agent/runtime/opencode/research-profile.mjs','Panda-agent/runtime/opencode/research-provider-channel.mjs',
 'Panda-agent/src/server/research-openrouter.ts','Panda-agent/src/server/hosted-model-policy.ts','Panda-agent/src/hosted-model.ts',
 'Panda-agent/src/opencode/research-image-binding.ts',
];
function assertBundleImports(file,raw,allowed){
 const imports=[],ast=ts.createSourceFile(file,raw,ts.ScriptTarget.Latest,true,file.endsWith('.ts')?ts.ScriptKind.TS:ts.ScriptKind.JS);
 const add=value=>{assert.ok(value&&ts.isStringLiteral(value),'Nonliteral module import in '+file);imports.push(value.text);};
 const visit=node=>{
  if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)){if(node.moduleSpecifier)add(node.moduleSpecifier);}
  else if(ts.isImportEqualsDeclaration(node)&&ts.isExternalModuleReference(node.moduleReference))add(node.moduleReference.expression);
  else if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require')){assert.equal(node.arguments.length,1);add(node.arguments[0]);}
  ts.forEachChild(node,visit);
 };visit(ast);
 for(const specifier of imports){if(specifier.startsWith('node:'))continue;assert.ok(specifier.startsWith('.'),'Unexpected package import in '+file);const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier));assert.ok(allowed.has(target),'Import outside reviewed source bundle: '+target);}
}
test('bundle boundaries cover indented imports, re-exports, require and dynamic imports',()=>{
 const file='Panda-agent/example.ts',allowed=new Set(['Panda-agent/approved.ts']);
 assert.doesNotThrow(()=>assertBundleImports(file,"  import x from './approved.ts'; export {x} from './approved.ts'; import('node:crypto');",allowed));
 for(const raw of ["  import x from 'outside-package';","export {x} from 'outside-package';","export * from './outside.ts';","import('outside-package');","const x=require('outside-package');","import(variable)"])assert.throws(()=>assertBundleImports(file,raw,allowed));
});
test('the exact25-file research fixture imports its provider with bare Node and no dependencies',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'panda-research-bundle-')),allowed=new Set(files);
 try{
  assert.equal(allowed.size,25);
  for(const file of files){
   const raw=await readFile(file,'utf8');
   assertBundleImports(file,raw,allowed);
   const destination=path.join(root,file);await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,raw);
  }
  const target=pathToFileURL(path.join(root,'Panda-agent/src/server/research-openrouter.ts')).href;
  const program=`const m=await import(${JSON.stringify(target)});if(typeof m.createResearchOpenRouter!=='function')throw Error('missing transport');process.stdout.write('bundle_import_ok');`;
  const result=await promisify(execFile)(process.execPath,['--input-type=module','-e',program],{cwd:root,windowsHide:true,timeout:10000,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot??'',TEMP:os.tmpdir()}});
  assert.equal(result.stdout,'bundle_import_ok');
 }finally{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('panda-research-bundle-'));await rm(root,{recursive:true,force:true});}
});
