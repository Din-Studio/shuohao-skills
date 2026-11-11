#!/usr/bin/env node
// v3 integration regressions, replacing retired strategy-application assertions.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,cpSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {gateReport,validateCreation,seedFromScript,renderHtml,renderMarkdown,checkup,exportPack,expandScript,reportContext,beatSeconds} from './novel-creation.mjs';
import {scriptProblems,outlineProblems} from './lib/contracts.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),ex=join(root,'examples');
const read=p=>JSON.parse(readFileSync(join(ex,p),'utf8'));
const doc=read('creation/收书人-creation.json'),script=read('script/收书人-script.json'),outline=read('outline/收书人-outline.json'),production=read('production.json');
const ctx={script,outline,production,art:read('art/收书人-art.json'),cast:read('characters/收书人-cast.json'),imageExists:p=>existsSync(resolve(ex,'creation',p))};
const clone=structuredClone, temp=mkdtempSync(join(tmpdir(),'creation-v3-'));
let count=0;
const test=(name,fn)=>{try{fn();count++;}catch(e){e.message=`${name}: ${e.message}`;throw e;}};
const find=(d,id,c=ctx)=>gateReport(d,c).find(g=>g.id===id);
const cli=(args,cwd=temp)=>spawnSync(process.execPath,[join(root,'scripts/novel-creation.mjs'),...args],{cwd,encoding:'utf8',maxBuffer:8*1024*1024});
const file=(name,value)=>{const p=join(temp,name);writeFileSync(p,JSON.stringify(value));return p;};
try {
  test('sample v3 chain and honest content-review status',()=>{
    const r=checkup(doc,ctx);assert.equal(r.blocking,0);assert.equal(r.contentReview,'not-performed');
    assert.ok(r.gates.every(g=>!Object.hasOwn(g,'ok')&&Array.isArray(g.messages)));assert.ok(!r.gates.some(g=>/selection|creative-context|cut-length/.test(g.id)));
  });
  for(const value of [0,-1,NaN,Infinity,'4',null]) test(`finite positive seconds ${value}`,()=>{
    const d=clone(doc);d.episodes[0].segments[0].cuts[0].seconds=value;assert.ok(validateCreation(d,ctx).some(m=>m.includes('seconds')));
  });
  for(const field of ['rules','defaults','preferences','minCutSeconds','maxCutSeconds']) test(`retired params rejected ${field}`,()=>{
    const d=clone(doc);d.params[field]={};assert.ok(validateCreation(d,ctx).some(m=>m.includes(field)));assert.throws(()=>renderHtml(d,ctx));
  });
  for(const field of ['creative','creativeContext','selection','decisions','overrides','seedNote']) test(`retired document field ${field}`,()=>{
    const d=clone(doc);d[field]={};assert.ok(validateCreation(d,ctx).some(m=>m.includes(field)));
  });
  for(const key of ['opening','ending','endBeat']) test(`creation has no persisted upstream projection ${key}`,()=>{
    const d=clone(doc);d.episodes[0][key]='old';assert.equal(find(d,'fields').status,'fail');assert.throws(()=>renderMarkdown(d,ctx));
  });
  test('long observation allowed but model limit remains hard',()=>{
    const d=clone(doc);d.episodes[0].segments[0].cuts[0].seconds=8;d.params.tolerance=.4;assert.deepEqual(validateCreation(d,ctx),[]);
    d.params.maxSegmentSeconds=100;d.episodes[0].segments[0].cuts[0].seconds=20;assert.equal(find(d,'segment-cap').status,'fail');assert.equal(find(d,'segment-cap',{}).status,'fail');
  });
  test('local duplicate IDs and noncontiguous coverage still fail',()=>{
    const d=clone(doc);d.episodes.push(clone(d.episodes[0]));assert.ok(validateCreation(d).length);
    const c=clone(doc);c.episodes[0].segments[1].cuts[0].beats=[1,1];assert.equal(find(c,'upstream-intent',{}).status,'fail');
  });
  test('missing upstream is skipped, not passed',()=>{
    for(const id of ['script-contract','outline-contract','coverage','project-contract']){const g=find(doc,id,{});assert.equal(g.status,'skipped');assert.equal(g.reason,'missing-upstream');}
  });
  for(const key of ['script','outline']) for(const value of [{},[],null,{schemaVersion:2}]) test(`damaged upstream ${key} ${JSON.stringify(value)}`,()=>{
    assert.equal(find(doc,key+'-contract',{...ctx,[key]:value}).status,'fail');assert.throws(()=>renderHtml(doc,{...ctx,[key]:value}));
  });
  test('broken JSON, null JSON and missing file fail CLI',()=>{
    for(const content of ['null','{']){const p=join(temp,'bad.json');writeFileSync(p,content);assert.equal(cli(['validate',file('d.json',doc),'--script',p,'--no-production']).status,1);}
    assert.equal(cli(['validate',file('d.json',doc),'--script',join(temp,'absent.json'),'--no-production']).status,1);
  });
  test('CLI refuses invalid UTF-8 even inside otherwise valid JSON text',()=>{
    const p=join(temp,'bad-utf8.json');writeFileSync(p,Buffer.concat([Buffer.from('{"source":"'),Buffer.from([0xff]),Buffer.from('"}') ]));
    assert.equal(cli(['validate',file('d.json',doc),'--script',p,'--no-production']).status,1);
  });
  test('seed carries neither plans nor persisted end, leaves cuts to author',()=>{
    const d=seedFromScript(script,null,ctx),ep=d.episodes[0];assert.equal(d.schemaVersion,3);
    for(const k of ['opening','ending','endBeat'])assert.ok(!(k in ep));
    assert.deepEqual(ep.openingBeat,script.episodes[0].openingBeat);
    assert.deepEqual(ep.segments,[]);assert.ok(!d.params.rules);assert.throws(()=>seedFromScript({...script,schemaVersion:2}));
  });
  test('current outline plan changes are read at render time, not cached',()=>{
    const o=clone(outline);o.episodes[0].opening='NEW CURRENT OPENING';o.episodes[0].ending.event='NEW CURRENT ENDING';
    const md=renderMarkdown(doc,{...ctx,outline:o});assert.ok(md.includes('NEW CURRENT OPENING')&&md.includes('NEW CURRENT ENDING'));
    assert.deepEqual(validateCreation(doc,{...ctx,outline:o}),[]); // content synchronization still requires review
  });
  for(const k of ['opening','ending']) test(`script duplicate upstream plan rejected ${k}`,()=>{
    const s=clone(script);s.episodes[0][k]=outline.episodes[0][k];assert.equal(find(doc,'upstream-intent',{...ctx,script:s}).status,'fail');
    assert.throws(()=>renderHtml(doc,{...ctx,script:s}));assert.throws(()=>seedFromScript(s,null,ctx));
  });
  test('independent script may omit plans, claims and opening position',()=>{
    const s=clone(script);delete s.episodes[0].beatClaims;delete s.episodes[0].openingBeat;delete s.params;
    const d=clone(doc);delete d.episodes[0].openingBeat;
    assert.deepEqual(scriptProblems(s),[]);assert.deepEqual(validateCreation(d,{script:s}),[]);
    const info=reportContext(d,{script:s}).episodes[0];assert.equal(info.planSource,'missing-upstream');assert.equal(info.openingMapping,'not-marked');assert.ok(!('openingCuts' in info));
    assert.ok(renderMarkdown(d,{script:s}).includes('missing-upstream'));
  });
  test('independent script plans render without inventing questions',()=>{
    const s=clone(script);s.episodes[0].opening='观察空书店';s.episodes[0].ending={mode:'suspense',event:'发现一本书'};
    const md=renderMarkdown(doc,{script:s});assert.ok(md.includes('观察空书店')&&md.includes('发现一本书'));assert.ok(!md.includes('dueByEp'));
    const seeded=seedFromScript(s);assert.ok(!('ending' in seeded.episodes[0]));
  });
  for(const field of ['question','questionId','dueByEp','resolves']) test(`script ending rejects extra Q field ${field}`,()=>{
    const s=clone(script);s.episodes[0].ending={mode:'open',event:'结束',[field]:'invented'};assert.ok(scriptProblems(s).length);
  });
  test('end follows actual last flow, stale shot coverage fails',()=>{
    assert.deepEqual(expandScript(script).get(1).endBeat,[1,10]);
    const s=clone(script);s.episodes[0].scenes[0].flow.push({action:'她关上灯。'});
    assert.deepEqual(expandScript(s).get(1).endBeat,[1,11]);assert.equal(find(doc,'coverage',{...ctx,script:s}).status,'fail');
    assert.deepEqual(reportContext(doc,{...ctx,script:s}).episodes[0].endBeat,[1,11]);
  });
  test('explicit endBeat is rejected in script',()=>{const s=clone(script);s.episodes[0].endBeat=[1,10];assert.ok(scriptProblems(s).length);});
  test('opening omitted never becomes verified first beat',()=>{
    const s=clone(script),d=clone(doc);delete s.episodes[0].openingBeat;delete d.episodes[0].openingBeat;
    assert.deepEqual(validateCreation(d,{...ctx,script:s}),[]);assert.ok(!('openingBeat' in seedFromScript(s).episodes[0]));
    const info=reportContext(doc,{...ctx,script:s}).episodes[0];assert.ok(!('openingBeat' in info)&&!('openingCuts' in info));assert.equal(info.openingMapping,'not-marked');
  });
  test('default timing equals explicit defaults and override used consistently',()=>{
    const s=clone(script);delete s.params;const explicit=clone(s);explicit.params={charsPerSecond:4.5,actionSeconds:2.5,tolerance:.15};
    assert.deepEqual(expandScript(s),expandScript(explicit));
    s.params={charsPerSecond:3,actionSeconds:7};const beats=expandScript(s).get(1).scenes[0].beats;
    assert.equal(beats[0].seconds,7);assert.equal(beats[1].seconds,4);assert.equal(beatSeconds({line:'abc'},s.params),1);
  });
  test('strict outline target despite estimation tolerance',()=>{
    const o=clone(outline);o.params.minutesPerEpisode=.51;assert.equal(find(doc,'upstream-intent',{...ctx,outline:o}).status,'fail');
  });
  for(const [label,mutate] of [
    ['missing',s=>s.episodes[0].beatClaims.pop()],['unknown',s=>s.episodes[0].beatClaims[1].beatId='B99'],
    ['duplicate',s=>s.episodes[0].beatClaims[1].beatId='B01'],['overlap',s=>s.episodes[0].beatClaims[1].start=[1,2]],
    ['reverse',s=>s.episodes[0].beatClaims[1].start=[1,7]],['invalid position',s=>s.episodes[0].beatClaims[1].end=[9,1]],
    ['order',s=>s.episodes[0].beatClaims.reverse()],['wrong episode',s=>s.episodes[0].ep=2],
  ]) test(`claims remain checked ${label}`,()=>{const s=clone(script);mutate(s);assert.ok(validateCreation(doc,{...ctx,script:s}).length);});
  test('deleted outline node invalidates both asset references and claims',()=>{
    const o=clone(outline);o.beats.splice(1,1);assert.equal(find(doc,'outline-contract',{...ctx,outline:o}).status,'fail');
    o.props.forEach(p=>p.beatIds=p.beatIds.filter(id=>id!=='B02'));
    assert.equal(find(doc,'upstream-intent',{...ctx,outline:o}).status,'fail');
  });
  test('unclassified optional fields accepted, explicit invalid fields rejected',()=>{
    const o=clone(outline);for(const b of o.beats){delete b.position;delete b.kind;}delete o.story.audiencePromise;delete o.adaptation;
    for(const c of o.characters){delete c.from;delete c.arc;}assert.deepEqual(outlineProblems(o),[]);assert.deepEqual(validateCreation(doc,{...ctx,outline:o}),[]);
    o.beats[0].weight='major';assert.ok(outlineProblems(o).length);delete o.beats[0].weight;o.beats[0].kind='wrong';assert.ok(outlineProblems(o).length);
  });
  test('brief must be nonempty and project/local conflict never chooses priority',()=>{
    for(const value of ['',null,{},' '])assert.ok(validateCreation({...doc,creativeBrief:value}).length);
    assert.deepEqual(validateCreation({...doc,creativeBrief:'克制'}),[]);
    assert.equal(find({...doc,creativeBrief:'克制'},'project-contract',{...ctx,production:{...production,creativeBrief:'强烈'}}).status,'fail');
  });
  test('production v3 required; creative config is refused',()=>{
    assert.ok(validateCreation(doc,{production:{...production,schemaVersion:2}}).length);
    assert.ok(validateCreation(doc,{production:{...production,creative:{}}}).length);
  });
  test('reports are body-first, current intent, escaped, immutable and bilingual',()=>{
    const d=clone(doc);d.source='</script><img src=x onerror=alert(1)>';
    const before=JSON.stringify(d),html=renderHtml(d,ctx),md=renderMarkdown(d,ctx);
    assert.ok(html.indexOf('id="sec-segments"')<html.indexOf('id="sec-intent"'));assert.ok(md.indexOf('## E01')<md.indexOf('当前上游交接关系'));
    assert.ok(html.includes('&lt;/script&gt;')&&!html.includes('<img src=x onerror'));
    assert.ok(!md.includes('overridePaths')&&!md.includes('selection')&&!md.includes('sha256'));
    assert.equal(JSON.stringify(d),before);
    assert.deepEqual(JSON.parse(html.match(/<script type="application\/json" id="creation-data">([\s\S]*?)<\/script>/)[1]),d);
    assert.ok(renderHtml(d,{...ctx,lang:'en'}).includes('Structural checks do not perform content review'));
  });
  test('partial upstream still catches known invalid reference',()=>{
    const d=clone(doc);d.episodes[0].segments[0].images[1].ref='S99';assert.equal(find(d,'refimage-coverage',{art:ctx.art}).status,'fail');
  });
  test('export effective model, original prompt and reference order retained',()=>{
    const d=clone(doc);d.video={model:'seedance2.0'};const p=exportPack(d,script,{production});
    const manifest=JSON.parse(p.files.find(f=>f.path==='manifest.json').content);assert.equal(manifest.video.model,'seedance2.0');assert.equal(manifest.video.aspectRatio,production.video.aspectRatio);
    assert.deepEqual(manifest.segments[0].images.map(i=>i.ref),doc.episodes[0].segments[0].images.map(i=>i.ref));assert.ok(p.files[0].content.includes(doc.episodes[0].segments[0].prompt));
  });
  test('independent skill copy executes local checks and CLI without siblings',()=>{
    const local=join(temp,'standalone');cpSync(root,local,{recursive:true});
    const r=spawnSync(process.execPath,[join(local,'scripts/selftest.mjs')],{cwd:temp,encoding:'utf8'});assert.equal(r.status,0,r.stderr+r.stdout);
    const cwd=join(local,'examples/creation'),entry=join(local,'scripts/novel-creation.mjs');
    for(const args of [['validate','收书人-creation.json'],['render','收书人-creation.json','--html','--lang','en'],['render','收书人-creation.json','--md'],['export','收书人-creation.json','--out','.']]){
      const result=spawnSync(process.execPath,[entry,...args],{cwd,encoding:'utf8'});assert.equal(result.status,0,result.stderr+result.stdout);
    }
    assert.ok(existsSync(join(cwd,'manifest.json'))&&!existsSync(join(cwd,'E01-01/video.mp4')));
  });
  test('optional tables omitted and special delivery retained in seed',()=>{
    const d=clone(doc);d.episodes[0].segments.forEach(s=>s.images=[]);
    const s=clone(script);s.episodes[0].scenes[0].flow=s.episodes[0].scenes[0].flow.map(b=>({action:b.action??b.line}));
    assert.ok(!renderHtml(d,{script:s}).includes('id="sec-dialogue"'));
    assert.ok(!renderHtml(d,{script:s}).includes('id="sec-refs"'));
    assert.ok(!renderMarkdown(doc,ctx).includes('| 配方 |'));
    assert.equal(seedFromScript(script).episodes[0].seedScenes[0].beats[1].delivery,script.episodes[0].scenes[0].flow[1].delivery);
  });
  test('damaged nested upstream structures return failures without throwing',()=>{
    for(const mutate of [s=>s.episodes[0].scenes[0].flow[0]=null,s=>s.episodes[0].scenes[0].characters=['bad'],s=>s.episodes[0].scenes[0].characters=['C01','C01']]){
      const s=clone(script);mutate(s);assert.equal(find(doc,'script-contract',{...ctx,script:s}).status,'fail');
    }
    for(const mutate of [o=>o.episodes[0]=null,o=>o.characters[0]=null,o=>o.beats[0]=null]){
      const o=clone(outline);mutate(o);assert.equal(find(doc,'outline-contract',{...ctx,outline:o}).status,'fail');
    }
  });
  test('CLI seed/render and invalid numeric boundary',()=>{
    const s=file('script.json',script),p=file('creation.json',doc);assert.equal(cli(['seed',s]).status,0);assert.equal(cli(['render',p,'--script',s,'--no-production','--html']).status,0);
    const d=clone(doc);d.episodes[0].segments[0].cuts[0].seconds='<img onerror=bad>';assert.throws(()=>renderHtml(d,ctx));
  });
  console.log(`✓ ${count} creation v3 integration tests passed; offline only`);
}finally{rmSync(temp,{recursive:true,force:true});}
