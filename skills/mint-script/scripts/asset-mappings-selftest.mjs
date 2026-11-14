#!/usr/bin/env node
// Own fixtures only. Script-local identities, scoped evidence and authority changes.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mappingErrors, mappedAssetId, assetDigest, localReferences } from './lib/asset-mappings.mjs';
import { checkup, validateScript, renderHtml, renderMarkdown, outlineInputErrors } from './mint-script.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read = name => JSON.parse(readFileSync(join(root,'examples',name),'utf8'));
const DOC = read('修伞簿-mapped-script.json');
const ctx = {cast:read('修伞簿-cast.fixture.json'), art:read('修伞簿-art.fixture.json'), outline:read('修伞簿-outline.fixture.json')};
let count = 0;
const test = (name,fn) => { try {fn();count++;} catch(e) {throw new Error(name,{cause:e});} };
const clone = structuredClone;
const gate = (d,c,id) => checkup(d,c).gates.find(g=>g.id===id);
const target = (c,m) => (m.kind==='character'?c.cast.characters:m.kind==='scene'?c.art.scenes:c.art.props).find(a=>a.id===m.assetId);
const bad = (name,edit,options={}) => test(name,()=>{const d=clone(DOC),c=clone(ctx);edit(d,c);assert(mappingErrors(d,c,options).length);});
test('all explicit different-ID mappings reconcile with v5 story and v1 assets',()=>{
  assert.deepEqual(mappingErrors(DOC,ctx,{required:true}),[]);
  assert.deepEqual(validateScript(DOC,{...ctx,requiredMappings:true}),[]);
  assert.equal(mappedAssetId(DOC,'character','C01'),'C11');
  assert.equal(mappedAssetId(DOC,'scene','S01'),'S11');
  assert.equal(gate(DOC,ctx,'joint-reconciliation').status,'pass');
});
test('canonical JSON recursively sorts keys, keeps array order, includes every asset field',()=>{
  const a={z:[{z:1,a:2},3],a:{b:2,a:1}};
  assert.equal(assetDigest(a),assetDigest({a:{a:1,b:2},z:[{a:2,z:1},3]}));
  assert.equal(assetDigest(a),createHash('sha256').update('{"a":{"a":1,"b":2},"z":[{"a":2,"z":1},3]}').digest('hex'));
  assert.notEqual(assetDigest(a),assetDigest({...a,z:[3,{a:2,z:1}]}));
  assert.notEqual(assetDigest(a),assetDigest({...a,extra:'fact'}));
});
for(const version of [1]) test(`explicit asset v${version} compatibility`,()=>{
  const c=clone(ctx);c.cast.schemaVersion=version;c.art.schemaVersion=version;
  assert.deepEqual(validateScript(DOC,{...c,requiredMappings:true}),[]);
});
for (const stage of ['cast','art']) for(const value of [undefined,0,2,3,5,999,'2']) test(`supplied ${stage} version ${value} is fail not missing`,()=>{
  const c=clone(ctx);c[stage].schemaVersion=value;
  assert.equal(gate(DOC,c,`${stage}-input`).status,'fail');
});
test('standalone original and partial source extraction run; joint reconciliation skipped',()=>{
  for(const d of [read('修伞簿-script.json'),read('夜班水尺-script.json'),DOC]) {
    assert.deepEqual(validateScript(d),[]);
    assert.equal(gate(d,{},'joint-reconciliation').status,'skipped');
  }
});
test('missing maps never pass a production dependency even with identical IDs or names',()=>{
  const d=clone(DOC),c=clone(ctx);delete d.assetMappings;
  c.cast.characters[0].id='C01';c.art.scenes[0].id='S01';
  assert.equal(mappedAssetId(d,'character','C01'),null);
  assert(mappingErrors(d,c,{required:[{kind:'character',localId:'C01'}]}).length);
  assert.deepEqual(mappingErrors(d,c),[]);
  assert.equal(gate(d,c,'joint-reconciliation').status,'skipped');
});
test('only actually requested dependencies need confirmed maps',()=>{
  const d=clone(DOC);d.assetMappings.find(m=>m.kind==='prop').status='pending';
  assert.deepEqual(mappingErrors(d,ctx,{required:[{kind:'character',localId:'C01'}]}),[]);
  assert(mappingErrors(d,ctx,{required:true}).length);
  assert.equal(mappedAssetId(d,'prop','P01'),null);
});
for (const status of ['pending','conflict']) test(`${status} retained without becoming confirmed`,()=>{
  const d=clone(DOC);d.assetMappings[0].status=status;
  assert.deepEqual(validateScript(d,ctx),[]);
  assert(mappingErrors(d,ctx,{required:[{kind:d.assetMappings[0].kind,localId:d.assetMappings[0].localId}]}).length);
});
for(const [name,edit] of [
  ['not array',d=>d.assetMappings={}],['null row',d=>d.assetMappings[0]=null],
  ['duplicate local',d=>d.assetMappings.push(clone(d.assetMappings[0]))],
  ['wrong kind',d=>d.assetMappings[0].kind='voice'],['bad local',d=>d.assetMappings[0].localId='C1'],
  ['unknown local',d=>d.assetMappings[0].localId='C99'],['no target',d=>delete d.assetMappings[0].assetId],
  ['empty basis',d=>d.assetMappings[0].basis=' '],['bad digest',d=>d.assetMappings[0].assetDigest='a'],
  ['no source evidence',d=>d.assetMappings[0].sourceRefs=[]],['no snapshots',d=>d.assetMappings[0].documentVersions=[]],
  ['bad source version',d=>d.assetMappings[0].documentVersions[0].sha256='0'.repeat(64)],
  ['bad line count',d=>d.assetMappings[0].documentVersions[0].lineCount++],
  ['extra snapshot',d=>d.assetMappings[0].documentVersions.push({...d.assetMappings[0].documentVersions[0],id:'other'})],
  ['extra field',d=>d.assetMappings[0].guess=true],['bad status',d=>d.assetMappings[0].status='assumed'],
  ['zero range',d=>d.assetMappings[0].sourceRefs[0].startLine=0],
  ['outside script coverage',d=>d.provenance.coverage=[{documentId:'umbrella',startLine:4,endLine:66}]],
  ['outside asset coverage',(d,c)=>{const m=d.assetMappings[0];m.sourceRefs=[{documentId:'umbrella',startLine:66,endLine:66}];}],
  ['outside stage coverage',(d,c)=>c.art.provenance.coverage=[{documentId:'umbrella',startLine:4,endLine:66}]],
  ['authority source changed',(d,c)=>c.art.provenance.documents[0].sha256='0'.repeat(64)],
  ['authority work differs',(d,c)=>c.art.source='别的故事'],
  ['target deleted',(d,c)=>c.art.scenes=[]],
  ['target split ambiguous',(d,c)=>c.art.scenes.push(clone(c.art.scenes[0]))],
  ['missing authoritative provenance',(d,c)=>delete c.art.provenance],
  ['missing target evidence',(d,c)=>{const m=d.assetMappings[0],a=target(c,m);delete a.sourceRefs;m.assetDigest=assetDigest(a);}],
]) bad(name,edit);
test('target source evidence unions adjacent ranges but never fills a gap',()=>{
  const d=clone(DOC),c=clone(ctx),m=d.assetMappings.find(m=>m.kind==='scene'),a=target(c,m);
  m.sourceRefs=[{documentId:'umbrella',startLine:2,endLine:3}];
  a.sourceRefs=[{documentId:'umbrella',startLine:2,endLine:2},{documentId:'umbrella',startLine:3,endLine:3}];
  m.assetDigest=assetDigest(a);assert.deepEqual(mappingErrors(d,c),[]);
  a.sourceRefs[1].startLine=4;a.sourceRefs[1].endLine=4;m.assetDigest=assetDigest(a);
  assert(mappingErrors(d,c).some(e=>e.includes('outside target asset')));
});
test('independent expression keeps nonhuman speech, anonymous voice and silent cast distinct',()=>{
  const d={schemaVersion:4,source:'门铃的两次提醒',episodes:[{ep:1,scenes:[
    {sceneId:'S01',characters:['C01','C03'],flow:[{speaker:'C01',line:'请稍候。',audio:{mode:'offscreen',audibleTo:['C03']}}],notes:[{kind:'background',text:'C01是门禁播报设备。C03没有台词。'}]},
    {sceneId:'S01',characters:['C03'],flow:[{speaker:'VO',line:'请稍候。',audio:{mode:'offscreen',audibleTo:['C03']}}],notes:[{kind:'restriction',text:'第二次来自未知声音，不断言它也是门禁设备。'}]}
  ]}]};
  assert.deepEqual(validateScript(d),[]);assert.equal(gate(d,{},'joint-reconciliation').status,'skipped');
  assert.equal(d.episodes[0].scenes.length,2);assert.equal(mappedAssetId(d,'character','C01'),null);
  assert(localReferences(d).some(r=>r.kind==='character'&&r.localId==='C03'));
});
test('target-wide document snapshots do not falsely expand script owned coverage',()=>{
  const d=clone(DOC),c=clone(ctx),m=d.assetMappings[0],asset=target(c,m);
  const doc={id:'background',path:'background.txt',sha256:'a'.repeat(64),lineCount:10};
  d.provenance.documents.push(clone(doc));
  const authority=m.kind==='character'?c.cast:c.art;
  authority.provenance.documents.push(clone(doc));
  authority.provenance.coverage.push({documentId:doc.id,startLine:1,endLine:10});
  asset.sourceRefs.push({documentId:doc.id,startLine:5,endLine:6});m.assetDigest=assetDigest(asset);
  assert(mappingErrors(d,c).some(e=>e.includes('target asset source documents')));
  m.documentVersions.push({id:doc.id,sha256:doc.sha256,lineCount:doc.lineCount});
  assert.deepEqual(mappingErrors(d,c),[]);
  authority.provenance.documents.find(v=>v.id===doc.id).sha256='b'.repeat(64);
  assert(mappingErrors(d,c).some(e=>e.includes('source version differs')));
});
test('asset digest changes identify only mappings of that target, not unrelated assets',()=>{
  const c=clone(ctx);c.cast.characters.find(a=>a.id==='C12').name='另一个身份';
  const errors=mappingErrors(DOC,c,{required:true});
  const index=DOC.assetMappings.findIndex(m=>m.kind==='character'&&m.assetId==='C12');
  assert(errors.length);assert(errors.every(e=>e.startsWith(`script.assetMappings[${index}]`)));
  const c2=clone(ctx);c2.cast.characters.reverse();c2.art.props.push({id:'P99',name:'未使用资产'});
  assert.deepEqual(mappingErrors(DOC,c2,{required:true}),[]);
});
test('merges require explicit authority correction; no silent name fallback',()=>{
  const c=clone(ctx);c.cast.characters=c.cast.characters.filter(a=>a.id!=='C12');
  c.cast.characters[0].name='林禾／陈岚';
  assert(mappingErrors(DOC,c,{required:true}).some(e=>e.includes('target C12')));
});
test('repeated source lines, scenes, audio, claims and notes are untouched by mapping',()=>{
  const d=read('夜班水尺-script.json'),before=clone(d.episodes);
  assert.deepEqual(mappingErrors(d,{}),[]);assert.deepEqual(d.episodes,before);
  assert(localReferences(d).some(r=>r.kind==='character'&&r.localId==='C02'));
  assert.equal(d.episodes[0].scenes[0].flow[0].line,d.episodes[1].scenes[0].flow[1].line);
});
test('same-name assets retain explicit identity and unmapped names/voices never leak',()=>{
  const c=clone(ctx);c.cast.characters[1].name=c.cast.characters[0].name;
  const d=clone(DOC),m=d.assetMappings.find(m=>m.assetId==='C12');m.assetDigest=assetDigest(target(c,m));
  assert.deepEqual(mappingErrors(d,c,{required:true}),[]);
  assert.equal(mappedAssetId(d,'character','C02'),'C12');
  for(const render of [renderHtml,renderMarkdown]) {
    assert(render(d,c).includes('C02 → C12'));
    const independent=read('修伞簿-script.json');assert(!render(independent,c).includes(c.cast.characters[0].voice.prompt));
    assert(render(d,c).includes('assetMappings'));
  }
});
test('outline only v5; assets are rejected instead of dual-read',()=>{
  assert.deepEqual(outlineInputErrors(ctx.outline),[]);
  for(const mutate of [o=>o.schemaVersion=4,o=>o.characters=[],o=>o.scenes=[],o=>o.props=[],o=>o.story.focusCharacterIds=[],o=>o.params.thresholds={},o=>o.episodes[0].characterIds=[],o=>o.notes=[{speakerId:'C01'}],o=>o.notes=[{propIds:['P01']}]]) {
    const o=clone(ctx.outline);mutate(o);assert(outlineInputErrors(o).length);
  }
});
test('valid character quote evidence is accepted without changing producer data',()=>{
  const d=clone(DOC),c=clone(ctx),m=d.assetMappings.find(m=>m.kind==='character'),a=target(c,m);
  const quote=readFileSync(join(root,'examples/修伞簿-source.txt'),'utf8').split(/\r\n|\n|\r/)[a.sourceRefs[0].startLine-1];
  a.sourceRefs[0].quote=quote;m.assetDigest=assetDigest(a);
  assert.deepEqual(mappingErrors(d,c,{required:true}),[]);
  assert.deepEqual(validateScript(d,{...c,requiredMappings:true}),[]);
  assert.equal(a.sourceRefs[0].quote,quote);
});
test('full workflow flag cannot turn unperformed mapping reconciliation into pass',()=>{
  const d=clone(DOC);delete d.assetMappings;
  assert.equal(gate(d,{...ctx,fullWorkflow:true},'joint-reconciliation').status,'skipped');
  assert.equal(gate(d,{...ctx,fullWorkflow:true},'joint-reconciliation').reason,'no-production-dependencies');
});
test('unresolved candidate records cannot upgrade skipped to joint pass',()=>{
  for(const status of ['pending','conflict']) {
    const d=clone(DOC);d.assetMappings.forEach(m=>m.status=status);
    assert.equal(gate(d,{...ctx,fullWorkflow:true},'joint-reconciliation').status,'skipped');
    assert.equal(gate(d,{...ctx,fullWorkflow:true},'joint-reconciliation').reason,'no-production-dependencies');
    assert.equal(gate(d,{...ctx,fullWorkflow:true,requiredMappings:true},'joint-reconciliation').status,'fail');
  }
});
test('full workflow flag cannot silently skip absent prior inputs',()=>assert(validateScript(DOC,{fullWorkflow:true}).length));
const dir=mkdtempSync(join(tmpdir(),'script-asset-mappings-'));
try {
  const file=join(dir,'script.json');writeFileSync(file,JSON.stringify(DOC));
  cpSync(join(root,'examples/修伞簿-source.txt'),join(dir,'修伞簿-source.txt'));
  cpSync(join(root,'examples/修伞簿-mapped-script-storyboard.md'),join(dir,'script-storyboard.md'));
  const flags=[];
  for(const key of ['outline','cast','art']) {const path=join(dir,`${key}.json`);writeFileSync(path,JSON.stringify(ctx[key]));flags.push(`--${key}`,path);}
  const cli=(...args)=>spawnSync(process.execPath,[join(root,'scripts/mint-script.mjs'),...args],{encoding:'utf8'});
  test('CLI production-ready verifies explicit mappings and original bytes',()=>{
    const r=cli('validate',file,'--no-production','--production-ready',...flags);assert.equal(r.status,0,r.stderr+r.stdout);
    assert.equal(cli('validate',file,'--no-production','--production-ready').status,1);
  });
  test('formal delivery requires the storyboard as the fourth file',()=>{
    rmSync(join(dir,'script-storyboard.md'));
    const r=cli('validate',file,'--no-production','--production-ready',...flags);
    assert.equal(r.status,1);assert.match(r.stdout,/fail\/base\/error storyboard: missing storyboard/);
    assert.equal(cli('validate',file,'--no-production',...flags).status,0,'ordinary validation reports the storyboard as not provided');
    cpSync(join(root,'examples/修伞簿-mapped-script-storyboard.md'),join(dir,'script-storyboard.md'));
  });
  test('supplied asset source files are read relative to their own artifact',()=>{
    const c=clone(ctx.art);c.provenance.documents[0].path='missing-original.txt';
    writeFileSync(join(dir,'art.json'),JSON.stringify(c));
    assert.equal(cli('validate',file,'--no-production','--production-ready',...flags).status,1);
    writeFileSync(join(dir,'art.json'),JSON.stringify(ctx.art));
  });
  test('isolated copied mapped script verifies all local assets and original source files',()=>{
    const isolated=join(dir,'isolated');cpSync(root,isolated,{recursive:true});
    const ex=join(isolated,'examples');
    const r=spawnSync(process.execPath,[join(isolated,'scripts/mint-script.mjs'),'validate',join(ex,'修伞簿-mapped-script.json'),'--no-production','--production-ready','--outline',join(ex,'修伞簿-outline.fixture.json'),'--cast',join(ex,'修伞簿-cast.fixture.json'),'--art',join(ex,'修伞簿-art.fixture.json')],{cwd:isolated,encoding:'utf8'});
    assert.equal(r.status,0,r.stderr+r.stdout);
  });
  test('CLI production selection leaves unused pending assets unresolved',()=>{
    const d=clone(DOC);d.assetMappings.find(m=>m.kind==='prop').status='pending';writeFileSync(file,JSON.stringify(d));
    const selected=join(dir,'selected.json');writeFileSync(selected,JSON.stringify([{kind:'scene',localId:'S01'}]));
    assert.equal(cli('validate',file,'--no-production','--production-ready',...flags).status,1);
    const r=cli('validate',file,'--no-production','--production-ready','--required-mappings',selected,...flags);assert.equal(r.status,0,r.stderr+r.stdout);
    writeFileSync(selected,'null');assert.equal(cli('validate',file,'--no-production','--required-mappings',selected,...flags).status,1);
  });
} finally {rmSync(dir,{recursive:true,force:true});}
console.log(`✓ ${count} script asset-mapping/outline-v5/standalone tests passed`);
