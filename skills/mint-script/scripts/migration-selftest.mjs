#!/usr/bin/env node
// Migration replaces retired profile tests while preserving applicable safe-I/O guarantees.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { migrateV3, migrateFile } from './lib/migration.mjs';
import { validateScript } from './mint-script.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const old=JSON.parse(readFileSync(join(here,'fixtures/legacy-script-v2.json'),'utf8'));
const outline=JSON.parse(readFileSync(join(here,'../examples/修伞簿-outline.fixture.json'),'utf8'));
const sample=JSON.parse(readFileSync(join(here,'../examples/修伞簿-script.json'),'utf8'));
const clone=structuredClone, options={ctx:{outline},validate:validateScript};
let count=0;
const test=(name,fn)=>{try{fn();count++;}catch(error){throw new Error(name,{cause:error});}};
const normalized=d=>({source:d.source,episodes:d.episodes.map(e=>({ep:e.ep,targetSeconds:e.targetSeconds,beatClaims:e.beatClaims,scenes:e.scenes.map(s=>({...s,flow:s.flow.map(b=>{const copy={...b};if(copy.delivery==='平实，留出回答的余地')delete copy.delivery;return copy;})}))}))});
test('real own-story migration preserves all story, asset IDs and claims',()=>{
  const before=JSON.stringify(old),r=migrateV3(old,options);
  assert.deepEqual(r.errors,[]);assert.deepEqual(normalized(r.document),normalized(sample));
  assert.deepEqual(r.document.episodes.map(e=>e.scenes),old.episodes.map(e=>e.scenes));
  assert.equal(JSON.stringify(old),before);assert.equal(r.document.schemaVersion,3);
  assert(r.pending.some(p=>p.path==='params.rules'));assert(r.pending.some(p=>p.path==='creativeContext'));
  assert(!Object.hasOwn(r.document,'creativeContext'));
  for(const e of r.document.episodes)for(const key of ['opening','ending','endBeat','seedNote'])assert(!Object.hasOwn(e,key));
});
test('standalone preserves plans and special delivery verbatim',()=>{
  const d=clone(old);d.episodes[0].scenes[0].flow[1].delivery='笑着说，掩饰惊讶';
  const r=migrateV3(d,{validate:validateScript});assert.deepEqual(r.errors,[]);
  assert.deepEqual(r.document.episodes[0].ending,d.episodes[0].ending);
  assert.equal(r.document.episodes[0].scenes[0].flow[1].delivery,d.episodes[0].scenes[0].flow[1].delivery);
});
test('preferences and seed notes have explicit retained destinations',()=>{
  const d=clone(old);d.params.preferences=['保留观察过程',{tone:'不强行和解'}];d.episodes[0].seedNote={synopsis:'先修伞，再询问'};
  const r=migrateV3(d,options);assert.deepEqual(r.errors,[]);
  assert.equal(r.document.creativeBrief,'保留观察过程\n不强行和解');
  assert.deepEqual(r.retired['episodes.1.seedNote'],d.episodes[0].seedNote);
  assert(r.pending.some(p=>p.path==='params.preferences'));
});
test('conflicting project brief cannot be waved through by confirm',()=>{
  const d=clone(old);d.params.preferences='不强行和解';
  assert(migrateV3(d,{...options,ctx:{outline,production:{schemaVersion:3,creativeBrief:'表达克制'}}}).errors.length);
});
test('stale duplicated plan remains in pending record',()=>{
  const d=clone(old);d.episodes[0].opening='独有的旧计划';const r=migrateV3(d,options);
  assert.deepEqual(r.errors,[]);assert.equal(r.retired['episodes.1.plans'].opening,'独有的旧计划');
});
for(const mutation of [
  d=>d.schemaVersion=1,d=>delete d.schemaVersion,d=>d.creativeContext=[],d=>d.creativeContext.references[0].sha256=[],d=>d.episodes[0]=null,d=>d.params=null,d=>delete d.params.charsPerSecond,
  d=>d.params.actionSeconds=-1,d=>d.params.tolerance=1,d=>d.params.rules.openingWindow={level:'off',maxBeats:5},
  d=>d.params.rules.lineLength={level:'error',maxChars:0},d=>delete d.params.rules.lineLength,
  d=>d.episodes[0].endBeat=[1,1],d=>delete d.episodes[0].endBeat,d=>d.episodes[0].openingBeat=[99,1],
  d=>d.episodes[0].opening='',d=>d.episodes[0].ending={mode:'invalid',event:'结束'},
  d=>delete d.episodes[0].beatClaims,d=>d.episodes[0].beatClaims[0].end=[1,1],
  d=>d.episodes[0].scenes[0].flow[0]={},d=>d.episodes[0].scenes[0].characters=['broken'],
  d=>d.episodes[0].targetSeconds=61,d=>d.source='其他故事'
])test('invalid v2 is not repaired into passing v3',()=>{const d=clone(old);mutation(d);assert(migrateV3(d,options).errors.length);});
const dir=mkdtempSync(join(tmpdir(),'script-migration-'));
try{
  const input=join(dir,'old.json'),out=join(dir,'new.json'),of=join(dir,'outline.json');
  const bytes=JSON.stringify(old,null,4)+'\n';writeFileSync(input,bytes);writeFileSync(of,JSON.stringify(outline));
  const cli=(...args)=>spawnSync(process.execPath,[join(here,'mint-script.mjs'),...args],{encoding:'utf8'});
  test('default CLI preview reports pending without writing',()=>{
    const r=cli('migrate-v3',input,'--outline',of,'--no-production');assert.equal(r.status,1,r.stderr);
    assert.equal(JSON.parse(r.stdout).written,false);assert.equal(readFileSync(input,'utf8'),bytes);assert(!existsSync(out));
  });
  test('confirm without out remains a preview',()=>{
    const r=cli('migrate-v3',input,'--confirm','--outline',of,'--no-production');assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).written,false);assert(!existsSync(out));assert.equal(readFileSync(input,'utf8'),bytes);
  });
  test('source concurrent edit is not overwritten',()=>{
    const raced=join(dir,'concurrent.json'),target=join(dir,'concurrent-v3.json');writeFileSync(raced,bytes);
    assert.throws(()=>migrateFile(raced,{out:target,confirm:true,ctx:{outline},validate:(doc,ctx)=>{writeFileSync(raced,'concurrent writer');return validateScript(doc,ctx);}}),/Input changed/);
    assert.equal(readFileSync(raced,'utf8'),'concurrent writer');assert(!existsSync(target));assert(!existsSync(target+'.v2-backup'));
  });
  test('out alone cannot discard semantic pending items',()=>{
    const r=cli('migrate-v3',input,'--out',out,'--outline',of,'--no-production');assert.equal(r.status,1);assert(!existsSync(out));
  });
  test('confirmed writes new file, byte-exact backup and work record',()=>{
    const r=cli('migrate-v3',input,'--out',out,'--confirm','--outline',of,'--no-production');assert.equal(r.status,0,r.stderr);
    const result=JSON.parse(r.stdout);assert(result.written);assert.equal(readFileSync(result.backup,'utf8'),bytes);
    assert(!result.backup.endsWith('.json')&&!result.record.endsWith('.json'),'migration sidecars must not become upstream JSON candidates');
    assert.equal(readFileSync(input,'utf8'),bytes);assert.deepEqual(validateScript(JSON.parse(readFileSync(out,'utf8')),{outline}),[]);
    const record=JSON.parse(readFileSync(result.record,'utf8'));assert(record.accepted);assert(record.pending.length);assert.deepEqual(record.retired.creativeContext,old.creativeContext);
    const restored=join(dir,'restored.json');writeFileSync(restored,readFileSync(result.backup));assert.equal(readFileSync(restored,'utf8'),bytes);
  });
  test('existing output is never overwritten',()=>{
    const before=readFileSync(out,'utf8'),r=cli('migrate-v3',input,'--out',out,'--confirm','--outline',of,'--no-production');
    assert.equal(r.status,1);assert.match(r.stderr,/existing output/);assert.equal(readFileSync(out,'utf8'),before);
  });
  test('same path output cannot replace input',()=>{
    assert.throws(()=>migrateFile(input,{...options,out:input,confirm:true}),/existing output/);assert.equal(readFileSync(input,'utf8'),bytes);
  });
  test('input symbolic link rejected',()=>{const link=join(dir,'link.json');symlinkSync(input,link);assert.throws(()=>migrateFile(link,{...options,out:join(dir,'linked.json'),confirm:true}),/non-symlink/);});
  test('dangling output symbolic link rejected',()=>{const link=join(dir,'dangling.json');symlinkSync(join(dir,'absent'),link);assert.throws(()=>migrateFile(input,{...options,out:link,confirm:true}),/existing output/);});
  test('existing backup and record block writes without changing input',()=>{
    for(const suffix of ['.v2-backup','.review']){const target=join(dir,'blocked'+suffix+'.json');writeFileSync(target+suffix,'existing');assert.throws(()=>migrateFile(input,{...options,out:target,confirm:true}),/existing output/);assert(!existsSync(target));}
    assert.equal(readFileSync(input,'utf8'),bytes);
  });
  test('unwritable output path leaves source intact',()=>{
    const target=join(dir,'not-created','new.json');assert.throws(()=>migrateFile(input,{...options,out:target,confirm:true}));assert.equal(readFileSync(input,'utf8'),bytes);
  });
  test('bad UTF-8 is not silently replaced in authored text',()=>{
    const file=join(dir,'utf8.json');writeFileSync(file,Buffer.concat([Buffer.from('{"source":"'),Buffer.from([0xff]),Buffer.from('"}') ]));
    for(const command of ['validate','migrate-v3']){const r=cli(command,file,'--no-production');assert.equal(r.status,1);assert.match(r.stderr,/encoded data|encoding/);}
  });
  test('broken JSON and damaged production are not missing inputs',()=>{
    const file=join(dir,'broken.json');writeFileSync(file,'{');assert.equal(cli('migrate-v3',file,'--no-production').status,1);
    writeFileSync(join(dir,'production.json'),'{');assert.equal(cli('migrate-v3',input).status,1);rmSync(join(dir,'production.json'));
  });
  test('retired profile CLI is unavailable',()=>{for(const command of ['profiles','profile','apply-profile'])assert.notEqual(cli(command,input,'--no-production').status,0);});
}finally{rmSync(dir,{recursive:true,force:true});}
console.log(`✓ ${count} script migration/safe-I/O tests passed`);
