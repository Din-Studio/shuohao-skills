#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,existsSync,symlinkSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {migrateV3,migrateFile} from './lib/migration.mjs';
import {validateCreation} from './mint-creation.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
const old=read('references/test-fixtures/migration-v2.json'),script=read('examples/script/收书人-script.json'),outline=read('examples/outline/收书人-outline.json');
const ctx={script,outline},clone=structuredClone,temp=mkdtempSync(join(tmpdir(),'creation-migration-'));
const input=join(temp,'old.json'),out=join(temp,'new.json');
writeFileSync(input,JSON.stringify(old,null,2)+'\n');const original=readFileSync(input);
let count=0;
const test=(name,fn)=>{try{fn();count++;}catch(e){e.message=`${name}: ${e.message}`;throw e;}};
const cli=(...args)=>spawnSync(process.execPath,[join(root,'scripts/mint-creation.mjs'),'migrate-v3',...args],{encoding:'utf8'});
try {
  test('preview preserves exact input and does not create output',()=>{
    const before=JSON.stringify(old),r=migrateFile(input,{out,...ctx});assert.equal(r.written,false);assert.equal(r.status,'pending');assert.ok(r.pending.some(x=>x.path.includes('cutDuration')));
    assert.equal(JSON.stringify(old),before);assert.ok(!existsSync(out));assert.ok(readFileSync(input).equals(original));
  });
  test('confirmed migration preserves segments, assets, timings and source',()=>{
    const r=migrateFile(input,{out,...ctx,confirm:true});assert.equal(r.written,true);assert.equal(r.document.schemaVersion,3);
    assert.equal(r.document.source,old.source);assert.equal(r.document.episodes.length,old.episodes.length);
    assert.deepEqual(r.document.episodes.map(e=>e.segments),old.episodes.map(e=>e.segments));
    assert.ok(readFileSync(input).equals(original));assert.ok(existsSync(out+'.review'));
    const record=JSON.parse(readFileSync(out+'.review'));assert.deepEqual(record.archived.creativeContext,old.creativeContext);
    assert.deepEqual(record.archived['episodes.1.plan'].ending,old.episodes[0].ending);
    assert.deepEqual(validateCreation(r.document,{script,outline,art:read('examples/art/收书人-art.json'),imageExists:()=>true}),[]);
  });
  test('existing output and record never overwritten',()=>{
    const before=readFileSync(out);assert.throws(()=>migrateFile(input,{out,...ctx,confirm:true}));assert.ok(readFileSync(out).equals(before));
    const target=join(temp,'existing.json');writeFileSync(target,'keep');assert.throws(()=>migrateFile(input,{out:target,...ctx,confirm:true}));assert.equal(readFileSync(target,'utf8'),'keep');assert.ok(!existsSync(target+'.review'));
  });
  test('same-file target rejected, original remains recoverable',()=>{assert.throws(()=>migrateFile(input,{out:input,...ctx,confirm:true}));assert.ok(readFileSync(input).equals(original));});
  test('missing upstream is pending and old plans retained in record',()=>{
    const r=migrateV3(old);assert.ok(r.pending.some(x=>x.path==='episodes.1.plan'));assert.ok(r.archived['episodes.1.plan'].opening);
  });
  test('mismatched upstream plan cannot be confirmed away',()=>{const o=clone(outline);o.episodes[0].ending.event='different';assert.throws(()=>migrateV3(old,{script,outline:o,confirm:true}));});
  test('mismatched actual ending coordinate fails migration',()=>{const s=clone(script);s.episodes[0].scenes[0].flow.push({action:'新动作'});assert.throws(()=>migrateV3(old,{...ctx,script:s,confirm:true}));});
  for(const mutate of [d=>d.schemaVersion=1,d=>d.params.tolerance=-1,d=>d.params.rules.cutDuration={level:'error',minSeconds:10,maxSeconds:1},d=>d.episodes[0].endBeat=[1,8],d=>d.episodes[0].openingBeat=[0,0],d=>d.episodes[0].segments[0].cuts[0].seconds=0,d=>d.episodes[0].segments[0].cuts[0].beats=[2,1],d=>d.creativeContext=[],d=>d.episodes[0].ending={mode:'wrong',event:'x'}]) test('damaged v2 is not repaired into v3',()=>{const d=clone(old);mutate(d);assert.throws(()=>migrateV3(d,{...ctx,confirm:true}));});
  for(const mutate of [d=>delete d.params.rules,d=>d.creativeContext.references[0].sha256=['bad'],d=>d.creativeContext.references[0].dimension='structure',d=>d.creativeContext.selection.genre=[],d=>d.creativeContext.overridePaths=['params.maxSegmentSeconds']]) test('damaged legacy configuration cannot be erased into success',()=>{const d=clone(old);mutate(d);assert.throws(()=>migrateV3(d,{...ctx,confirm:true}));});
  test('preferences become brief only after confirmation',()=>{
    const d=clone(old);d.params.preferences=['保持停顿','不强行和解'];const r=migrateV3(d,{...ctx,confirm:true});assert.equal(r.document.creativeBrief,'保持停顿\n不强行和解');
    d.params.preferences={x:'cannot choose'};assert.throws(()=>migrateV3(d,{...ctx,confirm:true}));
  });
  test('seedNote semantic content retained in work record',()=>{
    const d=clone(old);d.seedNote='不要增加寻人成功的结果';const r=migrateV3(d,{...ctx,confirm:true});assert.equal(r.archived.seedNote,d.seedNote);assert.ok(!('seedNote' in r.document));
  });
  test('nonboolean confirmation refused',()=>assert.throws(()=>migrateV3(old,{...ctx,confirm:'true'})));
  test('symlink inputs and dangling output links refused',()=>{
    const link=join(temp,'link.json');symlinkSync(input,link);assert.throws(()=>migrateFile(link,{...ctx,confirm:true}));
    const target=join(temp,'dangling.json');symlinkSync(join(temp,'absent'),target);assert.throws(()=>migrateFile(input,{out:target,...ctx,confirm:true}));assert.ok(!existsSync(join(temp,'absent')));
  });
  test('invalid JSON, UTF-8 and directory input refused',()=>{
    const bad=join(temp,'bad.json');writeFileSync(bad,'{');assert.throws(()=>migrateFile(bad));writeFileSync(bad,Buffer.from([0xff]));assert.throws(()=>migrateFile(bad));
    const dir=join(temp,'dir');mkdirSync(dir);assert.throws(()=>migrateFile(dir));
  });
  test('CLI preview and confirm are explicit, no automatic project writes',()=>{
    const r=cli(input);assert.equal(r.status,1,r.stderr);assert.equal(JSON.parse(r.stdout).written,false);
    const target=join(temp,'cli.json');const run=cli(input,'--out',target,'--confirm');assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).written,true);
    assert.ok(readFileSync(input).equals(original));assert.equal(cli(input,'--out').status,1);assert.equal(cli(input,'--out',target,'--confirm').status,1);
  });
  console.log(`✓ ${count} creation v3 migration tests passed; no paid calls`);
}finally{rmSync(temp,{recursive:true,force:true});}
