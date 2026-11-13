#!/usr/bin/env node
// Creation-owned stories/fixtures only. No sibling imports, models or paid calls.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,cpSync,mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {assetDigest,mappingErrors,mappingShapeErrors,materialMappingErrors,requiredMappings} from './lib/asset-mapping.mjs';
import {dispatchBrief,gateReport,validateCreation,namer,referenceImagePath} from './mint-creation.mjs';
import * as W from './lib/worksheet.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),base=join(root,'references/test-fixtures/fusion');
const read=name=>JSON.parse(readFileSync(join(base,name),'utf8')),clone=structuredClone;
const script=read('script.json'),outline=read('outline.json'),cast=read('cast.fixture.json'),art=read('art.fixture.json'),creation=read('creation.json');
const ctx={script,outline,cast,art,scriptPath:join(base,'script.json'),outlinePath:join(base,'outline.json'),castPath:join(base,'cast.fixture.json'),artPath:join(base,'art.fixture.json'),imageExists:()=>true};
const brief=()=>dispatchBrief(creation,ctx,1),segments=creation.episodes[0].segments;
let count=0;
function test(label,fn){try{fn();count++;console.log(`PASS ${label}`);}catch(e){e.message=`${label}: ${e.message}`;throw e;}}
const dep=[{kind:'character',localId:'C01'}];
const temp=mkdtempSync(join(tmpdir(),'creation-mapping-'));
try {
 test('full target JSON SHA256 recursively sorts keys, keeps array order',()=>{
  assert.equal(assetDigest({z:{b:2,a:1},a:[{d:4,c:3}]}),assetDigest({a:[{c:3,d:4}],z:{a:1,b:2}}));
  assert.notEqual(assetDigest({a:[1,2]}),assetDigest({a:[2,1]}));
  assert.equal(assetDigest(cast.characters[0]),script.assetMappings.find(m=>m.kind==='character').assetDigest);
 });
 test('equal ID/name never establishes mapping; pending/conflict cannot pass',()=>{
  for(const status of [null,'pending','conflict']){
   const s=clone(script);if(status===null)s.assetMappings=[];else s.assetMappings.find(m=>m.kind==='character').status=status;
   assert.ok(mappingErrors(s,ctx,dep).length);assert.equal(namer({...ctx,script:s}).nameOf('character','C01'),null);
   assert.ok(validateCreation(creation,{...ctx,script:s}).some(e=>e.includes('confirmed')));
  }
 });
 test('mapping basis, SHA256, versions and duplicates are mandatory structure',()=>{
  for(const change of [m=>m.basis='',m=>m.assetDigest='abc',m=>m.documentVersions=[],m=>m.sourceRefs=[]]){
   const s=clone(script);change(s.assetMappings[0]);assert.ok(mappingShapeErrors(s).length);
  }
  const s=clone(script);s.assetMappings.push(clone(s.assetMappings[0]));assert.ok(mappingShapeErrors(s).length);
 });
 test('offscreen speech and cross-scene continuations require identity, not images',()=>{
  const s=clone(script),d=clone(creation);
  s.assetMappings.filter(m=>m.kind==='character').forEach(m=>m.status='pending');
  for(const seg of d.episodes[0].segments) {seg.images=seg.images.filter(i=>i.kind!=='character');seg.cuts.forEach(c=>c.characters=[]);}
  // Fixture-author mutation for a structural regression; not a claim that the
  // original anonymous announcement has been semantically identified.
  for(const scene of s.episodes[0].scenes)for(const b of scene.flow)if(b.line){b.speaker='C01';b.audio={mode:'offscreen'};if(!scene.characters.includes('C01'))scene.characters.push('C01');}
  const g=gateReport(d,{...ctx,script:s}).find(g=>g.id==='asset-mappings');assert.equal(g.status,'fail');assert.ok(g.messages.some(e=>e.includes('confirmed')));
  const voiceScene=s.episodes[0].scenes.findIndex(sc=>sc.flow.some(b=>b.speaker==='C01'))+1;
  const voiceBeat=s.episodes[0].scenes[voiceScene-1].flow.findIndex(b=>b.speaker==='C01')+1;
  const continuation={sceneIndex:2,cuts:[{beats:[1,1],characters:[],audioRefs:[[voiceScene,voiceBeat]]}],images:[]};
  assert.ok(requiredMappings(continuation,s.episodes[0].scenes[1],s.episodes[0].scenes).some(r=>r.kind==='character'&&r.localId==='C01'));
  const material=dispatchBrief(d,{...ctx,script:s},1);
  const sourceSeg=d.episodes[0].segments.find(seg=>requiredMappings(seg,s.episodes[0].scenes[seg.sceneIndex-1],s.episodes[0].scenes).some(r=>r.kind==='character'));
  const {prompt,...structure}=sourceSeg;
  const sheet=W.parseWorksheet(W.serializeWorksheet({meta:{segment:structure.id,status:'in_review',round:1},structure,body:prompt,review:'# 视频提示词审核\n\n- 审核结论：通过\n\n## 返修意见\n\n## 待确认事项'}));
  assert.ok(W.recordVerdict(sheet,'approved',material).problems.some(e=>/映射|确认/.test(e)));
  assert.ok(materialMappingErrors(continuation,material).some(e=>/映射|确认/.test(e)));
  s.assetMappings.filter(m=>m.kind==='character').forEach(m=>m.status='confirmed');
  assert.equal(gateReport(d,{...ctx,script:s}).find(g=>g.id==='asset-mappings').status,'pass','known voices need no character sheet');
 });
 test('target mutations, versions and partial source gaps require reconfirmation',()=>{
  const c=clone(cast);c.characters[0].notes=[{text:'new identity information'}];assert.ok(mappingErrors(script,{...ctx,cast:c},dep).some(e=>e.includes('assetDigest')));
  const s=clone(script);s.assetMappings.find(m=>m.kind==='character').documentVersions[0].sha256='f'.repeat(64);assert.ok(mappingErrors(s,ctx,dep).some(e=>e.includes('来源')));
  const a=clone(cast);a.provenance.scope='partial';a.provenance.coverage=[];assert.ok(mappingErrors(script,{...ctx,cast:a},dep).some(e=>e.includes('覆盖')));
 });
 test('stable producer image contracts do not guess names or lose pinned paths',()=>{
  const c={schemaVersion:1,kind:'mint-characters',characters:[{id:'C01',name:'同名'},{id:'C02',name:'同名'}]};
  const a={scenes:[{id:'S01',name:'更名后空间',imageStem:'S01'},{id:'S02',name:'旧空间',sheetImage:'images/固定设定.png'}],props:[{id:'P01',name:'更名后道具',imageStem:'P01'}]};
  assert.equal(referenceImagePath('character','同名','C02',{cast:c}),'../characters/images/C02-sheet.png');
  assert.equal(referenceImagePath('scene','更名后空间','S01',{art:a}),'../art/images/S01-sheet.png');
  assert.equal(referenceImagePath('prop','更名后道具','P01',{art:a}),'../art/images/P01-sheet.png');
  assert.equal(referenceImagePath('scene','旧空间','S02',{art:a}),'../art/images/固定设定.png');
  assert.equal(referenceImagePath('scene','旧空间','S02',{art:a,artPath:'/project/art/art.json'}),'/project/art/images/固定设定.png');
 });
 test('nested target source snapshots do not expand script owned scope',()=>{
  const s=clone(script),c=clone(cast),m=s.assetMappings.find(m=>m.kind==='character'),a=c.characters.find(a=>a.id===m.assetId);
  const extra={id:'extra-background',path:'background.txt',sha256:'c'.repeat(64),lineCount:5};
  s.provenance.scope='partial';s.provenance.documents.push(extra);
  c.provenance.documents.push(extra);c.provenance.coverage.push({documentId:extra.id,startLine:1,endLine:5});
  a.notes=[{text:'身份背景',sourceRefs:[{documentId:extra.id,startLine:3,endLine:3}]}];m.assetDigest=assetDigest(a);
  assert.ok(mappingErrors(s,{...ctx,cast:c},dep).length,'target document must be frozen, not read from current script as fallback');
  m.documentVersions.push({id:extra.id,sha256:extra.sha256,lineCount:extra.lineCount});
  assert.deepEqual(mappingShapeErrors(s),[]);assert.deepEqual(mappingErrors(s,{...ctx,cast:c},dep),[]);
  const material={provenance:s.provenance,assetMappings:[m],assets:{characters:[{id:a.id,specification:a,assetDigest:m.assetDigest,sourceCoverage:c.provenance.coverage,sourceDocuments:c.provenance.documents}]}};
  assert.deepEqual(materialMappingErrors({images:[{kind:'character',ref:m.localId}],cuts:[]},material),[]);
  material.assets.characters[0].sourceDocuments.find(d=>d.id===extra.id).sha256='d'.repeat(64);
  assert.ok(materialMappingErrors({images:[{kind:'character',ref:m.localId}],cuts:[]},material).length);
 });
 test('dispatch identity and evidence come from cast/art without outline',()=>{
  const m=dispatchBrief(creation,{...ctx,outline:undefined},1);
  assert.equal(m.upstream.outline.status,'skipped');assert.equal(m.upstream.cast.status,'provided');
  assert.deepEqual(m.assets.characters[0].specification,cast.characters[0]);assert.deepEqual(m.assets.characters[0].sourceRefs,cast.characters[0].sourceRefs);
  assert.equal(m.assets.characters[0].assetDigest,assetDigest(cast.characters[0]));
  assert.ok(m.assets.characters[0].sourceDocuments.every(d=>d.path.startsWith('/')));
  assert.deepEqual(validateCreation(creation,{...ctx,outline:undefined}),[]);
 });
 test('unused identities need neither mapping nor images; supplied bad authorities fail',()=>{
  const s=clone(script);const unused=s.assetMappings.find(m=>m.localId==='P03');unused.status='pending';
  const d=clone(creation);d.episodes[0].segments[3].cuts.forEach(c=>c.props=[]);d.episodes[0].segments[3].images=d.episodes[0].segments[3].images.filter(i=>i.ref!=='P03');
  // Only inspect identity gate: removing an image also requires a writer to update its label.
  assert.equal(gateReport(d,{...ctx,script:s}).find(g=>g.id==='asset-mappings').status,'pass');
  const noImages=clone(creation);noImages.episodes[0].segments.forEach(seg=>seg.images=[]);
  const gates=gateReport(noImages,{...ctx,imageExists:()=>false});assert.equal(gates.find(g=>g.id==='asset-mappings').status,'pass');assert.equal(gates.find(g=>g.id==='refimage-coverage').status,'skipped');
  for(const bad of [null,{...cast,schemaVersion:2},{...cast,schemaVersion:99},{...cast,source:'different story'},{...cast,characters:[null]}])assert.ok(validateCreation(creation,{...ctx,cast:bad}).length);
  assert.equal(gateReport(creation,{}).find(g=>g.id==='cast-contract').status,'skipped');
  assert.throws(()=>dispatchBrief(creation,{...ctx,cast:{...cast,source:'different story'}},1));
 });
 test('selective hashes cover cut identities without mounted images, not unused assets',()=>{
  const m=brief(),structure=clone(segments[0]);structure.images=[];
  const initial=W.inputHashOf(structure,m);
  const unrelated=clone(m);unrelated.assets.props.find(a=>a.id==='P03').specification.name='unrelated';assert.equal(W.inputHashOf(structure,unrelated),initial);
  const changed=clone(m);changed.assetMappings.find(m=>m.kind==='character').basis+=' new decision';assert.notEqual(W.inputHashOf(structure,changed),initial);
  const changedSpec=clone(m);changedSpec.assets.characters[0].specification.notes=['new identity'];assert.notEqual(W.inputHashOf(structure,changedSpec),initial);
  const source=clone(m);source.assets.characters[0].sourceCoverage=[];assert.notEqual(W.inputHashOf(structure,source),initial);
  const scriptCoverage=clone(m);scriptCoverage.provenance.coverage.find(r=>r.documentId==='D01').startLine=2;assert.notEqual(W.inputHashOf(structure,scriptCoverage),initial);
  const unrelatedRange=clone(m);unrelatedRange.provenance.coverage.find(r=>r.documentId==='D04').endLine=1;assert.equal(W.inputHashOf(structure,unrelatedRange),initial);
  const image=clone(m);image.assets.characters[0].sheetHash='new bytes';assert.equal(W.inputHashOf(structure,image),initial,'unmounted bytes are not an identity dependency');
 });
 test('review refuses required missing, ambiguous or stale material mapping',()=>{
  const m=brief(),{prompt,...structure}=segments[0];
  const sheet=W.parseWorksheet(W.serializeWorksheet({meta:{segment:structure.id,status:'in_review',round:1},structure,body:prompt,review:'# 视频提示词审核\n\n- 审核结论：通过\n\n## 返修意见\n\n## 待确认事项'}));
  assert.deepEqual(W.recordVerdict(sheet,'approved',m).problems,[]);
  for(const mutate of [x=>delete x.assetMappings,x=>x.assetMappings[0].status='conflict',x=>x.assetMappings.push(clone(x.assetMappings[0])),x=>x.assets.characters[0].specification.name='tampered']){
   const x=clone(m);mutate(x);assert.ok(W.recordVerdict(sheet,'approved',x).problems.length);
  }
 });
 test('different local/asset IDs resolve stable collision paths and manifest target IDs',()=>{
  const project=join(temp,'project');cpSync(join(root,'examples'),project,{recursive:true});
  const cd=join(project,'creation'),sp=join(project,'script/收书人-script.json'),cpath=join(project,'characters/收书人-cast.json');
  const s=JSON.parse(readFileSync(sp)),c=JSON.parse(readFileSync(cpath));
  // Explicit fixture-author decision: local C01 points to C17, not a same-name guess.
  c.characters[0].id='C17';c.characters[1].name=c.characters[0].name;
  for(const asset of c.characters){const m=s.assetMappings.find(m=>m.kind==='character'&&m.localId===(asset.id==='C17'?'C01':'C02'));m.assetId=asset.id;m.assetDigest=assetDigest(asset);}
  writeFileSync(sp,JSON.stringify(s));writeFileSync(cpath,JSON.stringify(c));
  const context={script:s,cast:c};
  for(const asset of c.characters){const path=resolve(cd,referenceImagePath('character',asset.name,asset.id,context));mkdirSync(dirname(path),{recursive:true});writeFileSync(path,'TEST ONLY identity image bytes '+asset.id);}
  const file='收书人-creation.json',run=(...args)=>{const r=spawnSync(process.execPath,[join(root,'scripts/mint-creation.mjs'),...args],{cwd:cd,encoding:'utf8'});assert.equal(r.status,0,r.stderr+r.stdout);return r;};
  run('prompts','init',file);run('prompts','submit',file);
  const doc=JSON.parse(readFileSync(join(cd,file)));
  for(const seg of doc.episodes[0].segments){const p=join(cd,seg.id,'prompt.md'),w=W.parseWorksheet(readFileSync(p,'utf8'));w.review='# 视频提示词审核\n\n- 审核结论：通过\n\n## 返修意见\n\n## 待确认事项';writeFileSync(p,W.serializeWorksheet(w));run('prompts','verdict',file,'approved',seg.id);}
  run('prompts','apply',file);run('export',file,'--out','.');
  const manifest=JSON.parse(readFileSync(join(cd,'manifest.json'))),images=manifest.segments.flatMap(s=>s.images).filter(i=>i.ref==='C01');
  assert.ok(images.length);for(const i of images){assert.equal(i.mappedAssetId,'C17');assert.match(i.path,/C17-.*sheet.png$/);assert.equal(i.assetDigest,assetDigest(c.characters[0]));}
  run('videos','manifest.json','--dry-run');
  const mp=join(cd,'manifest.json'),original=readFileSync(mp,'utf8');
  for(const change of [m=>m.segments[0].images[0].mappedAssetId='C99',m=>m.segments[0].images[0].assetDigest='f'.repeat(64),m=>m.segments[0].images[0].path=m.segments[0].images[1].path,m=>m.segments[0].seconds+=1]) {
    const m=JSON.parse(original);change(m);writeFileSync(mp,JSON.stringify(m));
    const failed=spawnSync(process.execPath,[join(root,'scripts/mint-creation.mjs'),'videos','manifest.json','--dry-run'],{cwd:cd,encoding:'utf8'});assert.equal(failed.status,1);assert.match(failed.stderr,/重新运行 export/);
  }
  writeFileSync(mp,original);
  // Reapproval after identity change must not silently reuse the old manifest.
  c.characters[0].oneLiner+=' 已由样例作者重新核对身份规范。';
  s.assetMappings.find(m=>m.localId==='C01').assetDigest=assetDigest(c.characters[0]);
  writeFileSync(sp,JSON.stringify(s));writeFileSync(cpath,JSON.stringify(c));
  for(const seg of doc.episodes[0].segments){const p=join(cd,seg.id,'prompt.md'),w=W.parseWorksheet(readFileSync(p,'utf8'));w.meta={...w.meta,status:'in_review',round:w.meta.round+1,bodyHash:'',inputHash:''};writeFileSync(p,W.serializeWorksheet(w));run('prompts','verdict',file,'approved',seg.id);}
  run('prompts','apply',file);
  const stale=spawnSync(process.execPath,[join(root,'scripts/mint-creation.mjs'),'videos','manifest.json','--dry-run'],{cwd:cd,encoding:'utf8'});assert.equal(stale.status,1);assert.match(stale.stderr,/manifest 素材身份/);
  run('export',file,'--out','.');run('videos','manifest.json','--dry-run');
 });
 console.log(`✓ ${count} explicit asset mapping regressions passed; no semantic review or generation`);
} finally {rmSync(temp,{recursive:true,force:true});}
