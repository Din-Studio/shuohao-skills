#!/usr/bin/env node
// Consumer integration tests. Only local files and fake inputs; never call generation.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {gateReport, validateCreation, seedFromScript, renderHtml, renderMarkdown, checkup, isBlocking, exportPack} from './novel-creation.mjs';
import {neutralParams, previewApplication, applyToFile, resolveProfiles, inspectContext} from './lib/creative.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ex=join(root,'examples');
const read=p=>JSON.parse(readFileSync(join(ex,p),'utf8'));
const doc=read('creation/收书人-creation.json'), script=read('script/收书人-script.json'), outline=read('outline/收书人-outline.json'), production=read('production.json');
const ctx={script,outline,production,art:read('art/收书人-art.json'),cast:read('characters/收书人-cast.json'),imageExists:p=>existsSync(resolve(ex,'creation',p))};
const clone=structuredClone;
let count=0;
const test=(name,fn)=>{try{fn();count++;}catch(e){e.message=`${name}: ${e.message}`;throw e;}};
const cut=(d,level='off')=>{d.params.rules.cutDuration=level==='off'?{level}:{level,minSeconds:4,maxSeconds:12};return d;};
const find=(d,id,c=ctx)=>gateReport(d,c).find(g=>g.id===id);
const selection=(genre,narrativeStyle,structure,pacing)=>Object.fromEntries(Object.entries({genre,narrativeStyle,structure,pacing}).map(([k,id])=>[k,{id,version:'1.0.0'}]));
const temp=mkdtempSync(join(tmpdir(),'creation-v2-'));
const cli=(args,cwd=temp)=>spawnSync(process.execPath,[join(root,'scripts/novel-creation.mjs'),...args],{cwd,encoding:'utf8'});
const file=(name,value)=>{const p=join(temp,name);writeFileSync(p,JSON.stringify(value,null,2));return p;};
try {
  test('formal sample has warnings, not failures or fake passes',()=>{
    const r=checkup(doc,ctx);assert.equal(r.blocking,0);assert.ok(r.warnings>0);assert.equal(r.contentReview,'not-performed');
    assert.equal(find(doc,'cut-length').status,'fail');assert.equal(find(doc,'cut-length').level,'warn');
    assert.ok(r.gates.every(g=>!Object.hasOwn(g,'ok') && Array.isArray(g.messages)));
  });
  for(const level of ['off','warn','error']) test(`cutDuration ${level} and CLI exits`,()=>{
    const d=cut(clone(doc),level), g=find(d,'cut-length');
    assert.equal(g.status,level==='off'?'skipped':'fail');
    assert.equal(validateCreation(d,ctx).length>0,level==='error');
    if(level==='off')assert.equal(g.reason,'policy-disabled');
    const p=file(`level-${level}.json`,d), result=cli(['validate',p,'--no-production']);
    assert.equal(result.status,level==='error'?1:0,result.stderr+result.stdout);
    assert.equal(cli(['checkup',p,'--no-production']).status,level==='error'?1:0);
  });
  test('closed interval',()=>{
    const d=clone(doc);d.params.rules.cutDuration={level:'error',minSeconds:2,maxSeconds:6};
    assert.equal(find(d,'cut-length').status,'pass');
  });
  for(const value of [0,-1,NaN,Infinity,'4',null]) test(`real seconds always positive finite: ${value}`,()=>{
    const d=cut(clone(doc));d.episodes[0].segments[0].cuts[0].seconds=value;
    assert.ok(validateCreation(d,ctx).some(m=>m.includes('seconds')));
  });
  for(const value of [undefined,{level:'off',minSeconds:1},{level:'warn',minSeconds:1},{level:'error',minSeconds:5,maxSeconds:2},{level:'warn',minSeconds:1,maxSeconds:5,x:1}]) test(`invalid rule ${JSON.stringify(value)}`,()=>{
    const d=clone(doc);d.params.rules.cutDuration=value;assert.ok(validateCreation(d,ctx).length);
  });
  for(const field of ['minCutSeconds','maxCutSeconds']) test(`old field rejected: ${field}`,()=>{
    const d=cut(clone(doc));d.params[field]=2;assert.ok(validateCreation(d,ctx).some(m=>m.includes(field)));
  });
  test('long observation is allowed; model cap cannot be overridden',()=>{
    const d=cut(clone(doc));d.episodes[0].segments[0].cuts[0].seconds=8;
    d.params.tolerance=0.4;assert.deepEqual(validateCreation(d,ctx),[]);
    d.params.maxSegmentSeconds=100;d.episodes[0].segments[0].cuts[0].seconds=20;
    assert.equal(find(d,'segment-cap').status,'fail');
    assert.equal(find(d,'segment-cap',{}).status,'fail');
  });
  test('local ids and final position remain enforced without upstream',()=>{
    const d=cut(clone(doc));d.episodes[0].endBeat=[1,8];assert.ok(validateCreation(d).length);
    d.episodes[0].endBeat=[1,10];d.episodes.push(clone(d.episodes[0]));assert.ok(validateCreation(d).length);
  });
  test('missing upstream is skipped, not passed',()=>{
    const g=gateReport(doc,{});for(const id of ['script-contract','outline-contract','coverage','creative-project']) {
      const x=g.find(x=>x.id===id);assert.equal(x.status,'skipped');assert.equal(x.reason,'missing-upstream');
    }
  });
  for(const key of ['script','outline']) for(const value of [{},[],{schemaVersion:1}]) test(`damaged ${key} does not become missing`,()=>{
    const g=gateReport(doc,{...ctx,[key]:value}).find(g=>g.id===key+'-contract');assert.equal(g.status,'fail');
  });
  test('supplied JSON null, broken JSON, missing file fail CLI',()=>{
    for(const content of ['null','{']){const p=join(temp,'bad.json');writeFileSync(p,content);assert.equal(cli(['validate',file('d.json',doc),'--script',p,'--no-production']).status,1);}
    assert.equal(cli(['validate',file('d.json',doc),'--script',join(temp,'absent.json'),'--no-production']).status,1);
  });
  test('seed preserves intent, no fabricated questions or scenes',()=>{
    const d=seedFromScript(script), e=d.episodes[0], s=script.episodes[0];
    for(const k of ['opening','ending','openingBeat','endBeat'])assert.deepEqual(e[k],s[k]);
    assert.equal(e.ending.mode,'open');assert.deepEqual(e.segments,[]);assert.deepEqual(d.params.rules,neutralParams('creation').rules);
    assert.ok(!d.creativeContext);assert.throws(()=>seedFromScript({...script,schemaVersion:1}));
  });
  for(const field of ['question','questionId','dueByEp','resolves']) test(`script ending rejects ${field}`,()=>{
    const s=clone(script);s.episodes[0].ending[field]='invented';assert.equal(find(doc,'script-contract',{...ctx,script:s}).status,'fail');
  });
  test('suspense projection requires no local Q',()=>{
    const d=clone(doc), s=clone(script);d.episodes[0].ending.mode=s.episodes[0].ending.mode='suspense';
    assert.deepEqual(validateCreation(d,{...ctx,script:s,outline:undefined}),[]);
  });
  for(const key of ['opening','ending','openingBeat','endBeat']) test(`upstream projection mismatch ${key}`,()=>{
    const d=clone(doc);
    if(key==='opening')d.episodes[0][key]+='changed';else if(key==='ending')d.episodes[0].ending.event+='changed';else d.episodes[0][key]=[1,2];
    assert.equal(find(d,'upstream-intent').status,'fail');
  });
  test('ending key order is irrelevant',()=>{
    const d=clone(doc);d.episodes[0].ending={event:d.episodes[0].ending.event,mode:d.episodes[0].ending.mode};assert.deepEqual(validateCreation(d,ctx),[]);
  });
  test('outline target is strict and not tolerance based',()=>{
    const o=clone(outline);o.params.minutesPerEpisode=0.51;
    assert.equal(find(doc,'upstream-intent',{...ctx,outline:o}).status,'fail');
  });
  for(const mutation of [s=>s.episodes[0].beatClaims.pop(),s=>s.episodes[0].beatClaims[1].beatId='B99',s=>s.episodes[0].beatClaims[1].start=[1,2],s=>s.episodes[0].endBeat=[1,8]]) test('node identity/range/end checks',()=>{
    const s=clone(script);mutation(s);assert.ok(validateCreation(doc,{...ctx,script:s}).length);
  });
  test('project mismatch blocks, missing context is not silently applied',()=>{
    const p=clone(production);p.creative.selection.pacing.id='measured';assert.equal(find(doc,'creative-project',{...ctx,production:p}).status,'fail');
    const d=clone(doc);delete d.creativeContext;assert.equal(find(d,'creative-project').status,'fail');
  });
  test('three combinations use the same engine and preserve non-policy parameters',()=>{
    for(const choice of [selection('drama','intense','serial-cliff','dense-payoff'),selection('mystery','restrained','serial','gradual'),selection('life','warm','episodic','measured')]) {
      const r=previewApplication(doc,{skillRoot:root,stage:'creation',selection:choice});
      assert.deepEqual(r.document.episodes,doc.episodes);assert.equal(r.document.params.maxSegmentSeconds,15);assert.equal(r.document.params.tolerance,0.15);
      assert.equal(r.document.creativeContext.references.length,3);assert.ok(r.document.creativeContext.references.every(r=>r.dimension!=='structure'));
      assert.equal(r.document.creativeContext.selection.structure.id,choice.structure.id);
      const g=gateReport(r.document,{...ctx,production:{...production,creative:{version:1,selection:choice}}});assert.ok(!g.some(isBlocking));
    }
  });
  test('closure nonfinal and open final pass through seed without cliff invention',()=>{
    const s=clone(script);const first=clone(s.episodes[0]);first.ending={mode:'closure',event:'本次收书交易结束。'};
    const second={...clone(s.episodes[0]),ep:2};second.beatClaims.forEach((c,i)=>{c.beatId=`B${11+i}`;});
    s.episodes=[first,second];
    const result=seedFromScript(s);assert.equal(result.episodes[0].ending.mode,'closure');assert.equal(result.episodes[1].ending.mode,'open');
  });
  test('explicit application, backup and preview cancellation',()=>{
    const p=file('apply.json',doc), original=readFileSync(p,'utf8');
    const options={skillRoot:root,stage:'creation',selection:production.creative.selection,overrides:{'params.rules.cutDuration':{level:'off'}}};
    assert.equal(applyToFile(p,options).applied,false);assert.equal(readFileSync(p,'utf8'),original);
    const r=applyToFile(p,{...options,confirm:true});assert.equal(r.applied,true);assert.equal(readFileSync(r.backup,'utf8'),original);
    assert.deepEqual(r.document.params.rules.cutDuration,{level:'off'});assert.equal(r.document.params.maxSegmentSeconds,doc.params.maxSegmentSeconds);
  });
  test('source drift and missing source do not mutate or block history; same-version apply rejected',()=>{
    const local=join(temp,'local');cpSync(root,local,{recursive:true});
    resolveProfiles(local,'creation',production.creative.selection);
    // Resolve actual file via discovery rather than assuming a returned guide shape.
    const {genre}=production.creative.selection;
    const path=join(local,'references/profiles/genre',genre.id,genre.version,'guide.md');
    writeFileSync(path,readFileSync(path,'utf8')+'\nDrift test.\n');
    const before=JSON.stringify(doc), checks=inspectContext(doc,{skillRoot:local,stage:'creation',production});
    assert.ok(checks.some(g=>g.reason==='source-drift'));assert.ok(!checks.some(isBlocking));assert.equal(JSON.stringify(doc),before);
    assert.throws(()=>previewApplication(doc,{skillRoot:local,stage:'creation',selection:production.creative.selection}));
    rmSync(join(local,'references/profiles/genre',genre.id),{recursive:true});
    assert.ok(inspectContext(doc,{skillRoot:local,stage:'creation',production}).some(g=>g.reason==='source-unverifiable'));
  });
  test('reports show current values, reasons, source and exact original export',()=>{
    const d=clone(doc);d.source='</script><img src=x onerror=alert(1)>';
    const before=JSON.stringify(d), html=renderHtml(d,ctx), md=renderMarkdown(d,ctx);
    assert.ok(html.includes('policy') && html.includes('missing-upstream') && html.includes('当前有效配置') && html.includes('内容未评审'));
    assert.ok(html.includes('&lt;/script&gt;'));assert.ok(!html.includes('<img src=x onerror'));
    assert.ok(md.includes('overridePaths') && md.includes('提醒'));
    assert.equal(JSON.stringify(d),before);
    const embedded=html.match(/<script type="application\/json" id="creation-data">([\s\S]*?)<\/script>/)[1];
    assert.deepEqual(JSON.parse(embedded),d);
    const en=renderHtml(d,{...ctx,lang:'en'});assert.ok(en.includes('Content review not performed') && en.includes('Warning'));
  });
  test('independent skill copy runs without siblings',()=>{
    const local=join(temp,'standalone');cpSync(root,local,{recursive:true});
    const r=spawnSync(process.execPath,[join(local,'scripts/selftest.mjs')],{cwd:temp,encoding:'utf8'});
    assert.equal(r.status,0,r.stderr+r.stdout);
    const cwd=join(local,'examples/creation'), entry=join(local,'scripts/novel-creation.mjs');
    const args=['收书人-creation.json','--script','../script/收书人-script.json','--outline','../outline/收书人-outline.json','--art','../art/收书人-art.json'];
    for(const command of [['validate',...args],['render',...args,'--html','--lang','en'],['render',...args,'--md'],['export',...args,'--out','.']]) {
      const result=spawnSync(process.execPath,[entry,...command],{cwd,encoding:'utf8'});assert.equal(result.status,0,result.stderr+result.stdout);
    }
    assert.ok(existsSync(join(cwd,'manifest.json')));assert.ok(existsSync(join(cwd,'E01-01/prompt.md')));
    assert.ok(!existsSync(join(cwd,'E01-01/video.mp4')));
  });
  test('partial upstream cannot hide a known invalid mounted reference',()=>{
    const d=clone(doc);d.episodes[0].segments[0].images[1].ref='S99';
    assert.equal(find(d,'refimage-coverage',{art:ctx.art}).status,'fail');
  });
  test('export uses the same effective model as technical checks',()=>{
    const d=clone(doc);d.video={model:'seedance2.0'};
    const p=exportPack(d,script,{production});
    const manifest=JSON.parse(p.files.find(f=>f.path==='manifest.json').content);
    assert.equal(manifest.video.model,'seedance2.0');assert.equal(manifest.video.aspectRatio,production.video.aspectRatio);
  });
  test('upstream snapshots reconcile without comparing sibling digests',()=>{
    const s=clone(script);s.creativeContext={selection:clone(production.creative.selection)};
    assert.equal(find(doc,'script-selection',{...ctx,script:s}).status,'pass');
    assert.equal(find(doc,'outline-selection',{...ctx,script:s}).reason,'stage-incomplete');
    assert.equal(find(doc,'upstream-selection',{...ctx,script:s}).status,'skipped');
    s.creativeContext.selection.genre.id='life';assert.equal(find(doc,'upstream-selection',{...ctx,script:s}).status,'fail');
  });
  test('creation selection can record an uninstalled structure',()=>{
    const choice=clone(production.creative.selection);choice.structure.id='uninstalled-structure';
    const r=resolveProfiles(root,'creation',choice);assert.equal(r.references.length,3);
    choice.pacing.id='uninstalled-pacing';assert.throws(()=>resolveProfiles(root,'creation',choice));
  });
  test('render rejects old versions and malformed numeric fields instead of injecting markup',()=>{
    assert.throws(()=>renderHtml({...doc,schemaVersion:1},ctx));
    assert.throws(()=>renderMarkdown(doc,{...ctx,script:{...script,schemaVersion:1}}));
    const d=clone(doc);d.episodes[0].segments[0].cuts[0].seconds='<img onerror=bad>';assert.throws(()=>renderHtml(d,ctx));
  });
  test('CLI seed/render and invalid old version boundary',()=>{
    const s=file('script.json',script), p=file('creation.json',doc);
    assert.equal(cli(['seed',s]).status,0);
    assert.equal(cli(['render',p,'--script',s,'--no-production','--html']).status,0);
    const d=clone(doc);delete d.schemaVersion;assert.equal(cli(['validate',file('old.json',d),'--no-production']).status,1);
  });
  console.log(`✓ ${count} 项 creation 策略/上游/报告/独立性集成测试通过；未调用生成`);
} finally { rmSync(temp,{recursive:true,force:true}); }
