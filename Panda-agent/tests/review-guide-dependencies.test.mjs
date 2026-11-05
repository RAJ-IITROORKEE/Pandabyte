import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('wheel review requires opt-in and rejects forged artifact and unapproved host',()=>{
 const noRun=spawnSync('python',['-X','utf8','Panda-agent/scripts/review-guide-dependencies.py'],{encoding:'utf8'});
 assert.notEqual(noRun.status,0);assert.match(noRun.stderr,/explicit --run required/);
 const code=`import importlib.util, tempfile, zipfile, hashlib
from pathlib import Path
s=importlib.util.spec_from_file_location('review','Panda-agent/scripts/review-guide-dependencies.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'pkg.whl'
 with zipfile.ZipFile(p,'w') as z:
  z.writestr('pkg-1.dist-info/METADATA','Name: pkg\\nVersion: 1\\nLicense-Expression: MIT\\n')
  z.writestr('pkg-1.dist-info/licenses/LICENSE','MIT')
 digest=hashlib.sha256(p.read_bytes()).hexdigest()
 assert m.inspect_wheel(p,digest,'pkg','1')['noticeFiles'][0]['hints']==['MIT']
 try: m.inspect_wheel(p,'0'*64,'pkg','1');raise AssertionError('tampered accepted')
 except ValueError: pass
 try: m.check_url('https://evil.example/x.whl',{'files.pythonhosted.org'});raise AssertionError('host accepted')
 except ValueError: pass
`;
 const run=spawnSync('python',['-X','utf8','-c',code],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
});
