#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkKnownCreation, loadKnownUpstreams } from './lib/downstream.mjs';
import { beatSeconds } from './novel-script.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const read=name=>JSON.parse(readFileSync(join(here,'../examples',name),'utf8'));
const script=read('修伞簿-script.json'),outline=read('修伞簿-outline.fixture.json'),production=read('修伞簿-production.fixture.json');
const dir=mkdtempSync(join(tmpdir(),'script-downstream-'));
const write=(file,doc)=>writeFileSync(file,typeof doc==='string'?doc:JSON.stringify(doc));
const cli=(...args)=>spawnSync(process.execPath,[join(here,'novel-script.mjs'),...args],{encoding:'utf8'});
let passed=0;
try {
  for(const stage of ['script','outline','creation'])mkdirSync(join(dir,stage));
  const sf=join(dir,'script/example-script.json'),of=join(dir,'outline/example-outline.json'),pf=join(dir,'production.json'),cf=join(dir,'creation/example-creation.json');
  write(sf,script);write(of,outline);write(pf,production);
  const creation = {
    schemaVersion: 2, source: script.source, params: {tolerance:0.15},
    creativeContext: {selection: production.creative.selection},
    episodes: script.episodes.map(ep => ({
      ep: ep.ep, opening: ep.opening, ending: ep.ending,
      openingBeat: ep.openingBeat, endBeat: ep.endBeat,
      segments: ep.scenes.map((sc,i) => ({
        id: `E${ep.ep}-${i+1}`, sceneIndex: i+1,
        cuts: sc.flow.map((b,j) => ({beats:[j+1,j+1],seconds:beatSeconds(b,script.params)}))
      }))
    }))
  };
  write(cf,creation);
  assert.equal(checkKnownCreation(script,{root:dir,production})[0].status,'pass');passed++;
  for(const mutate of [
    c=>c.schemaVersion=999,c=>c.source='另一部故事',c=>c.episodes[0].ep=999,
    c=>c.creativeContext.selection.pacing.id='gradual',c=>delete c.creativeContext,
    c=>c.episodes[0].ending.event='不同集尾',c=>c.episodes[0].endBeat=[1,1],
    c=>c.episodes[0].segments[0].cuts[0].beats=[0,1],
    c=>c.episodes[0].segments[0].cuts.shift(),c=>c.episodes[0].segments[0].sceneIndex=999,
    c=>c.episodes=[],c=>c.episodes[0].segments=[],c=>c.episodes[0].segments[0].cuts[0].seconds='3',
    c=>c.episodes[0].segments[0].cuts[0].seconds=1000
  ]) {
    const bad=structuredClone(creation);mutate(bad);write(cf,bad);
    assert.equal(checkKnownCreation(script,{root:dir,production})[0].status,'fail');passed++;
  }
  write(cf,'{');assert.equal(checkKnownCreation(script,{root:dir,production})[0].status,'fail');passed++;
  write(cf,creation);write(join(dir,'creation/manifest.json'),'{');
  assert.equal(checkKnownCreation(script,{root:dir,production}).length,1);passed++;
  let result=cli('apply-profile',sf,'--production',pf,'--confirm');
  assert.equal(result.status,0,result.stderr);assert.match(result.stderr,/downstream-creation/);passed++;
  const bad=structuredClone(creation);bad.schemaVersion=999;write(cf,bad);
  result=cli('apply-profile',sf,'--production',pf,'--confirm');
  assert.equal(result.status,1);assert.equal(JSON.parse(result.stdout).applied,true);assert.match(result.stderr,/schemaVersion must be 2/);passed++;
  write(of,'{');result=cli('apply-profile',sf,'--production',pf,'--confirm');
  assert.equal(result.status,1);assert.match(result.stderr,/upstreamError/);passed++;
  write(of,outline);write(join(dir,'outline/second-outline.json'),outline);
  assert.throws(()=>loadKnownUpstreams(dir),/multiple known/);passed++;
  for (const name of ['outline','creation']) {
    const project=join(dir,`directory-${name}`);mkdirSync(project);mkdirSync(join(project,'script'));
    const input=join(project,'script/input.json'),prod=join(project,'production.json');write(input,script);write(prod,production);
    const stage=join(project,name),target=join(project,'actual-stage');symlinkSync(target,stage);
    let r=cli('apply-profile',input,'--production',prod,'--confirm');
    assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).applied,true);assert.match(r.stderr,/ENOENT/);passed++;
    mkdirSync(target);write(join(target,'batch.json'),name==='outline'?outline:creation);
    r=cli('apply-profile',input,'--production',prod,'--confirm');assert.equal(r.status,0,r.stderr);passed++;
    rmSync(stage);r=cli('apply-profile',input,'--production',prod,'--confirm');assert.equal(r.status,0,r.stderr);passed++;
  }
  const isolated=join(dir,'dangling');mkdirSync(isolated);mkdirSync(join(isolated,'script'));
  const d=join(isolated,'script/demo-script.json');write(d,script);
  symlinkSync(join(isolated,'not-present.json'),join(isolated,'production.json'));
  result=cli('validate',d);assert.equal(result.status,1);assert.match(result.stderr,/ENOENT/);passed++;
  result=cli('checkup',d,'--no-production','--json');assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).gates.find(g=>g.id==='creative-project').reason,'missing-upstream');passed++;
  result=cli('validate',d,'--production',pf,'--no-production');assert.equal(result.status,1);assert.match(result.stderr,/mutually exclusive/);passed++;
} finally {rmSync(dir,{recursive:true,force:true});}
console.log(`✓ ${passed} script application/downstream/production-boundary tests passed`);
