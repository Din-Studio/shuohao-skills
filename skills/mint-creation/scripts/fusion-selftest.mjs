#!/usr/bin/env node
// Own story, own fixtures, real CLI roundtrip. No sibling imports, models, or paid calls.
import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dispatchBrief,seedFromScript,expandScript,computeStats,validateCreation,exportPack,renderMarkdown,renderHtml,gateReport,namer,referenceImagePath} from './mint-creation.mjs';
import {scriptProblems,outlineProblems,reconcile,beatSeconds} from './lib/contracts.mjs';
import {sourceProblems,verifySources,lineCountOf} from './lib/source.mjs';
import {playbackProblems} from './lib/playback.mjs';
import * as W from './lib/worksheet.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const temp=mkdtempSync(join(tmpdir(),'creation-fusion-'));
const fixture=join(root,'references/test-fixtures/fusion');
const json=p=>JSON.parse(readFileSync(p,'utf8')),clone=structuredClone;
const script=json(join(fixture,'script.json')),doc=json(join(fixture,'creation.json'));
const outline=json(join(fixture,'outline.json')),art=json(join(fixture,'art.fixture.json')),cast=json(join(fixture,'cast.fixture.json'));
const ctx={script,scriptPath:join(fixture,'script.json'),outline,outlinePath:join(fixture,'outline.json'),art,cast,imageExists:()=>true};
// Only a technical file fixture. Not a generated image, visual reference or fidelity claim.
const standIn=(id)=>Buffer.from('TEST-ONLY NON-EMPTY ASSET STAND-IN: '+id);
function assetProject(project) {
  const sd=join(project,'script'),cd=join(project,'creation');
  cpSync(fixture,sd,{recursive:true});mkdirSync(cd,{recursive:true});
  for(const stage of ['outline','art','characters'])mkdirSync(join(project,stage),{recursive:true});
  const o=clone(outline);for(const d of o.provenance.documents)d.path='../script/'+d.path;
  writeFileSync(join(project,'outline/outline.json'),JSON.stringify(o));
  writeFileSync(join(project,'art/art.json'),JSON.stringify(art));
  writeFileSync(join(project,'characters/cast.json'),JSON.stringify(cast));
  for(const [kind,items] of [['character',cast.characters],['scene',art.scenes],['prop',art.props]])
    for(const item of items){const p=resolve(cd,referenceImagePath(kind,item.name,item.id,ctx));mkdirSync(dirname(p),{recursive:true});writeFileSync(p,standIn(item.id));}
  return {sd,cd,sp:join(sd,'script.json'),cp:join(cd,'creation.json'),op:join(project,'outline/outline.json')};
}
let count=0;
const test=(label,fn)=>{try{fn();count++;console.log(`PASS ${label}`);}catch(e){e.message=`${label}: ${e.message}`;throw e;}};
try {
  test('v4 source reads are explicit, non-semantic and immutable',()=>{
    const before=JSON.stringify(script);assert.deepEqual(scriptProblems(script),[]);
    assert.equal(verifySources(script,ctx.scriptPath).scope,'bytes-and-coordinates-only');
    assert.deepEqual(validateCreation(doc,ctx),[]);assert.equal(JSON.stringify(script),before);
    assert.equal(gateReport(doc,{script}).find(g=>g.id==='script-source').status,'skipped');
    assert.throws(()=>dispatchBrief(doc,{script},1),/JSON 路径/);
  });
  test('four flow kinds, positive times, notes never estimated',()=>{
    const seed=seedFromScript(script),sc=seed.episodes[0].seedScenes;
    assert.deepEqual(sc[1].beats.map(b=>b.kind),['action','sound','subtitle']);
    assert.deepEqual(sc[1].beats.map(b=>b.seconds),[2.5,1,2]);
    assert.deepEqual(sc[0].notes,script.episodes[0].scenes[0].notes);
    assert.equal(beatSeconds({subtitle:'甲'}),2.5);assert.equal(beatSeconds({sound:'鸣响'}),2.5);
    for(const b of [{action:'x',line:'y'},{subtitle:''},{sound:'x',seconds:0},{line:'x',seconds:2}])assert.equal(beatSeconds(b),null);
    const s=clone(script);s.episodes[0].scenes[0].notes[0].text+='背景'.repeat(1000);
    assert.equal(expandScript(s).get(1).scenes[0].beats.length,2);
    assert.deepEqual(computeStats(doc,s).dialogue,computeStats(doc,script).dialogue);
  });
  test('no invented target at production boundary or legacy acceptance',()=>{
    const s=clone(script);delete s.episodes[0].targetSeconds;
    assert.throws(()=>seedFromScript(s),/targetSeconds/);assert.throws(()=>exportPack(doc,s),/targetSeconds/);
    assert.ok(validateCreation(doc,{script:s}).length);
    for(const schemaVersion of [2,3])assert.throws(()=>seedFromScript({...script,schemaVersion}));
  });
  test('full notes, sourceRefs, audio and cross-scene lines reach brief and reports',()=>{
    const m=dispatchBrief(doc,ctx,1);
    assert.deepEqual(m.seedScenes[0].notes,script.episodes[0].scenes[0].notes);
    assert.deepEqual(m.seedScenes[0].beats[0].audio,{mode:'voiceover',subjective:false});
    assert.deepEqual(m.seedScenes[0].beats[0].sourceRefs,script.episodes[0].scenes[0].flow[0].sourceRefs);
    assert.equal(m.provenance.documents.length,4);assert.equal(m.sourceVerification,'bytes-and-coordinates-only');
    for(const report of [renderMarkdown(doc,ctx),renderHtml(doc,ctx)]) {
      assert.ok(report.includes('背景不得发声'));assert.ok(report.includes('audioContinuations'));assert.ok(report.includes('subtitle'));assert.ok(report.includes('voiceover'));
    }
  });
  for(const [label,mutate] of [
    ['missing flow refs',s=>delete s.episodes[0].scenes[0].flow[0].sourceRefs],
    ['missing note refs',s=>delete s.episodes[0].scenes[0].notes[0].sourceRefs],
    ['audio action',s=>s.episodes[0].scenes[0].flow[1].audio={mode:'inner'}],
    ['bad audio mode',s=>s.episodes[0].scenes[0].flow[0].audio.mode='silent'],
    ['bad audible audience',s=>s.episodes[0].scenes[0].flow[0].audio.audibleTo=['P01']],
    ['bad note kind',s=>s.episodes[0].scenes[0].notes[0].kind='dialogue'],
    ['unauthorized transformation',s=>s.episodes[0].scenes[0].flow[0].transformation={reason:'重述'}],
    ['unknown source',s=>s.episodes[0].scenes[0].flow[0].sourceRefs[0].documentId='D99'],
    ['out of bounds',s=>s.episodes[0].scenes[0].flow[0].sourceRefs[0].endLine=99],
    ['dangling refs',s=>delete s.provenance],
    ['candidate in official scene',s=>s.episodes[0].scenes[0].candidates=[]],
  ]) test(label,()=>{const s=clone(script);mutate(s);assert.ok(scriptProblems(s).length);assert.throws(()=>seedFromScript(s));});
  test('complete scope unions overlapping coverage and requires 1..N',()=>{
    const s=clone(script);s.provenance.scope='complete';s.provenance.totalEpisodes=1;
    s.provenance.coverage.unshift({documentId:'D01',startLine:2,endLine:3});assert.deepEqual(sourceProblems(s),[]);
    s.provenance.coverage=s.provenance.coverage.filter(r=>r.documentId!=='D01');s.provenance.coverage.push({documentId:'D01',startLine:1,endLine:3});assert.ok(sourceProblems(s).length);
    s.provenance=clone(script.provenance);s.episodes[0].ep=3;assert.deepEqual(sourceProblems(s),[]);
    s.provenance.scope='complete';s.provenance.totalEpisodes=3;assert.ok(sourceProblems(s).length);
  });
  test('missing, changed, unreadable sources fail rather than skip; raw bytes hash',()=>{
    const local=join(temp,'source');cpSync(fixture,local,{recursive:true});const path=join(local,'script.json'),source=join(local,'D01.txt'),bytes=readFileSync(source);
    writeFileSync(source,Buffer.from(bytes.toString().replaceAll('\n','\r\n')));
    assert.equal(lineCountOf(readFileSync(source)),4);assert.throws(()=>verifySources(script,path),/SHA256/);
    writeFileSync(source,bytes);const wrong=clone(script);wrong.provenance.documents[0].lineCount=5;assert.throws(()=>verifySources(wrong,path),/行数/);
    if(process.getuid?.()!==0){chmodSync(source,0);try{assert.throws(()=>verifySources(script,path),/无法读取/);}finally{chmodSync(source,0o600);}}
    rmSync(source);assert.throws(()=>verifySources(script,path),/无法读取/);
  });
  test('one playback crosses cuts and scenes; equal words at another source position play twice',()=>{
    const lines=computeStats(doc,script).dialogue;assert.equal(lines.length,2);assert.equal(lines[0].line,lines[1].line);
    assert.equal(lines[0].seconds,lines[1].seconds);assert.deepEqual(validateCreation(doc,ctx),[]);
    const d=clone(doc);delete d.episodes[0].segments[0].cuts[1].audioRefs;delete d.episodes[0].segments[1].cuts[0].audioRefs;delete d.episodes[0].segments[1].cuts[1].audioRefs;
    assert.ok(validateCreation(d,ctx).some(p=>p.includes('装不进')));
    const missing=clone(doc);missing.episodes[0].segments[2].prompt=missing.episodes[0].segments[2].prompt.replace(lines[0].line,'');
    assert.ok(validateCreation(missing,ctx).some(p=>p.includes('缺台词')));
  });
  for(const [label,mutate] of [
    ['duplicate continuation',d=>d.episodes[0].segments[1].cuts[0].audioRefs.push([1,1])],
    ['forward continuation',d=>d.episodes[0].segments[0].cuts[0].audioRefs=[[3,1]]],
    ['same-owner continuation',d=>d.episodes[0].segments[0].cuts[0].audioRefs=[[1,1]]],
    ['action continuation',d=>d.episodes[0].segments[1].cuts[0].audioRefs=[[1,2]]],
    ['malformed continuation',d=>d.episodes[0].segments[1].cuts[0].audioRefs=[[1,0]]],
    ['null continuation',d=>d.episodes[0].segments[1].cuts[0].audioRefs=null],
    ['duplicate ownership',d=>d.episodes[0].segments[0].cuts[1].beats=[1,2]],
    ['missing ownership',d=>d.episodes[0].segments[1].cuts.pop()],
  ]) test(label,()=>{const d=clone(doc);mutate(d);assert.ok(validateCreation(d,ctx).length);});
  test('continuations share capacity rather than double-booking seconds',()=>{
    const s={scenes:[{flow:[{line:'aaaaaa'},{line:'bbbbbb'},{action:'观察'}]}]};
    const ep={ep:1,segments:[{id:'E01-01',sceneIndex:1,cuts:[{beats:[1,1],seconds:1},{beats:[2,2],seconds:1,audioRefs:[[1,1]]},{beats:[3,3],seconds:8,audioRefs:[[1,1],[1,2]]}]}]};
    assert.ok(playbackProblems(ep,s,()=>6).length);
    ep.segments[0].cuts[2].seconds=10;assert.deepEqual(playbackProblems(ep,s,()=>6),[]);
  });
  test('source-only outline arrays and functional tier match upstream; invalid IDs still fail',()=>{
    assert.deepEqual(outlineProblems(outline),[]);
    const o=clone(outline);o.characters=[];o.scenes=[];o.props=[];
    o.episodes[0].characterIds=[];o.episodes[0].sceneIds=[];o.episodes[0].propIds=[];
    assert.deepEqual(outlineProblems(o),[]);
    o.episodes[0].characterIds=['C99'];assert.ok(outlineProblems(o).some(p=>p.includes('characterIds')));
    o.episodes[0].characterIds=[];o.episodes[0].sceneIds=['S99'];assert.ok(outlineProblems(o).some(p=>p.includes('sceneIds')));
    const old=clone(outline);old.characters[0].tier='minor';assert.ok(outlineProblems(old).some(p=>p.includes('tier')));
  });
  test('parsed script document IDs require upstream version match, not matching paths',()=>{
    const o=clone(outline);o.provenance.documents[0].path='../other-stage/D01.txt';
    assert.deepEqual(reconcile(doc,script,o),[]);
    for(const field of ['sha256','lineCount','id']) {
      const s=clone(script);s.provenance.documents[0][field]=field==='sha256'?'a'.repeat(64):field==='id'?'D99':99;
      assert.ok(reconcile(doc,s,outline).some(p=>p.includes('来源')));
    }
    const independent=clone(script);delete independent.provenance;
    assert.deepEqual(reconcile(doc,independent,outline),[]);
    assert.throws(()=>seedFromScript(script,null,{outline:{...outline,provenance:{...outline.provenance,documents:[]}}}));
  });
  test('enough total speech capacity cannot reverse dialogue order; continuation cannot skip cuts',()=>{
    const s={scenes:[{flow:[{line:'aaaaaa'},{line:'b'},{action:'观察'}]}]};
    const ep={ep:1,segments:[{id:'E01-01',sceneIndex:1,cuts:[{beats:[1,1],seconds:1},{beats:[2,2],seconds:1,audioRefs:[[1,1]]},{beats:[3,3],seconds:5,audioRefs:[[1,1]]}]}]};
    assert.ok(playbackProblems(ep,s,b=>b.line.length).some(p=>p.includes('装不进')));
    ep.segments[0].cuts[2].audioRefs.push([1,2]);assert.deepEqual(playbackProblems(ep,s,b=>b.line.length),[]);
    delete ep.segments[0].cuts[1].audioRefs;assert.ok(playbackProblems(ep,s,b=>b.line.length).some(p=>p.includes('不连续')));
    const d=clone(doc);delete d.episodes[0].segments[0].cuts[1].audioRefs;
    assert.ok(validateCreation(d,ctx).some(p=>p.includes('不连续')));
  });
  test('selective hashes follow notes, audio, sourceRefs and cross-segment dependencies',()=>{
    const m=dispatchBrief(doc,ctx,1),segments=doc.episodes[0].segments;
    const hashes=x=>segments.map(s=>W.inputHashOf(s,x)),baseline=hashes(m);
    const changed=(fn,indices)=>{const x=clone(m);fn(x);assert.deepEqual(hashes(x).map((h,i)=>h!==baseline[i]?i:-1).filter(i=>i>=0),indices);};
    changed(x=>x.seedScenes[0].notes[0].text+='限制',[0,1]);
    changed(x=>x.seedScenes[0].characters.push('C02'),[0,1]);
    changed(x=>x.seedScenes[0].props.push('P04'),[0,1]);
    changed(x=>x.seedScenes[1].characters.push('C02'),[1]);
    changed(x=>x.seedScenes[1].props.push('P04'),[1]);
    changed(x=>x.intent.opening+='开场限制',[0]);
    changed(x=>x.intent.ending.event+='集尾限制',[3]);
    const positioned=clone(m);positioned.intent.openingBeat=[2,2];
    const positionedHashes=hashes(positioned);positioned.intent.opening+='坐标限定的开场';
    assert.deepEqual(hashes(positioned).map((h,i)=>h!==positionedHashes[i]?i:-1).filter(i=>i>=0),[1]);
    const unmarked=clone(m);delete unmarked.intent.endBeat;
    const unmarkedHashes=hashes(unmarked);unmarked.intent.ending.event+='实际末拍';
    assert.deepEqual(hashes(unmarked).map((h,i)=>h!==unmarkedHashes[i]?i:-1).filter(i=>i>=0),[3]);
    changed(x=>x.seedScenes[0].beats[0].audio.mode='inner',[0,1]);
    changed(x=>x.seedScenes[0].beats[0].sourceRefs[0].startLine=1,[0,1]);
    changed(x=>x.seedScenes[1].notes[0].text+='限制',[1]);
    changed(x=>x.seedScenes[3].beats[0].text+='风声',[3]);
    changed(x=>x.provenance.documents[0].sha256='a'.repeat(64),[0,1]);
    changed(x=>x.provenance.documents[3].sha256='a'.repeat(64),[3]);
    changed(x=>x.seedScenes.push({sceneIndex:9,sceneId:'S09',notes:[{text:'无关'}],beats:[]}),[]);
    const events=clone(m);events.beatClaims=[{beatId:'B01',start:[1,1],end:[1,2],sourceRefs:[{documentId:'D01',startLine:2,endLine:3}]}];
    const eventHashes=hashes(events);events.beatClaims[0].sourceRefs[0].startLine=1;
    assert.deepEqual(hashes(events).map((h,i)=>h!==eventHashes[i]?i:-1).filter(i=>i>=0),[0,1]);
    const images=clone(m),structure=clone(segments[0]);structure.images=[{kind:'character',ref:'C01'}];images.assets.characters=[{id:'C01',name:'值班员',sheetHash:'x',sourceRefs:[{documentId:'D01',startLine:1,endLine:1}],sourceDocuments:[clone(m.provenance.documents[0])]}];
    const imageHash=W.inputHashOf(structure,images);images.assets.characters[0].sourceRefs[0].endLine=2;assert.notEqual(W.inputHashOf(structure,images),imageHash);
  });
  test('real seed → brief → worksheets → submit → check → approve → apply → export → stale refusal',()=>{
    const project=join(temp,'project'),{sd,cd,sp,cp,op}=assetProject(project);
    const cli=(...args)=>spawnSync(process.execPath,[join(root,'scripts/mint-creation.mjs'),...args,'--script',sp],{cwd:cd,encoding:'utf8'});
    const run=(...args)=>{const r=cli(...args);assert.equal(r.status,0,r.stderr+r.stdout);return r;};
    const seed=JSON.parse(run('seed',sp).stdout);seed.promptLang='zh';seed.video=doc.video;writeFileSync(cp,JSON.stringify(seed));
    const brief=JSON.parse(run('prompts','brief',cp,'--ep','1').stdout);assert.equal(brief.seedScenes[0].notes[0].kind,'restriction');
    for(const seg of doc.episodes[0].segments){const {prompt,...structure}=seg;mkdirSync(join(cd,seg.id));writeFileSync(join(cd,seg.id,'prompt.md'),W.serializeWorksheet({meta:{segment:seg.id,status:'draft',round:0,model:'MiniMax H3',promptLang:'zh'},structure,body:prompt,review:W.REVIEW_PLACEHOLDER,response:W.RESPONSE_PLACEHOLDER}));}
    run('prompts','check',cp);run('prompts','submit',cp);
    for(const seg of doc.episodes[0].segments){const p=join(cd,seg.id,'prompt.md'),sheet=W.parseWorksheet(readFileSync(p,'utf8'));sheet.review='结论：通过。离线夹具登记，不代表真人语义审核或成片通过。';writeFileSync(p,W.serializeWorksheet(sheet));run('prompts','verdict',cp,'approved',seg.id);}
    run('prompts','status',cp);run('prompts','apply',cp);run('export',cp,'--out',cd);
    const applied=json(cp);assert.deepEqual(applied.episodes[0].segments[1].cuts[0].audioRefs,[[1,1]]);assert.equal(json(join(cd,'manifest.json')).segments.length,4);
    const manifest=json(join(cd,'manifest.json'));
    assert.deepEqual(applied.episodes[0].segments[0].cuts[1].characters,['C01']);
    assert.deepEqual(manifest.segments[0].images.map(x=>x.ref),['C01','S01','P01']);
    assert.ok(brief.assets.characters[0].sheetExists);assert.ok(brief.assets.characters[0].sheetHash);
    const originalOutline=readFileSync(op,'utf8');
    for(const [field,expected] of [['opening','E01-01'],['ending','E01-04']]) {
      const changed=json(op);if(field==='opening')changed.episodes[0].opening+='保持克制';else changed.episodes[0].ending.event+='不宣布救援结果';
      writeFileSync(op,JSON.stringify(changed));
      const status=cli('prompts','status',cp);assert.equal(status.status,1);
      assert.deepEqual(status.stdout.split('\n').filter(l=>l.startsWith('✗')).map(l=>l.split(/\s+/)[1]),[expected]);
      assert.equal(cli('export',cp,'--out',cd).status,1);
      writeFileSync(op,originalOutline);run('prompts','status',cp);
    }
    const current=json(sp);current.episodes[0].scenes[0].notes[0].text+='禁止团聚';writeFileSync(sp,JSON.stringify(current));
    let r=cli('prompts','status',cp);assert.equal(r.status,1);const stale=r.stdout.split('\n').filter(l=>l.startsWith('✗'));assert.equal(stale.length,2);assert.ok(stale.some(l=>l.includes('E01-02')));assert.equal(cli('export',cp,'--out',cd).status,1);
    writeFileSync(sp,JSON.stringify(script));writeFileSync(join(sd,'D01.txt'),readFileSync(join(sd,'D01.txt'),'utf8')+'改版\n');
    for(const args of [['prompts','brief',cp,'--ep','1'],['prompts','status',cp],['export',cp,'--out',cd]]){r=cli(...args);assert.equal(r.status,1);assert.match(r.stderr,/SHA256/);}
  });
  test('same-name stable IDs bridge distinct reference files, hashes, gates and CLI export',()=>{
    // Story first: two different people named 阿宁 hand over a model named 候车亭.
    // The model moves from the north 候车亭 to a different south 候车亭.
    const project=join(temp,'identity'),sd=join(project,'script'),cd=join(project,'creation'),od=join(project,'outline');
    for(const dir of [sd,cd,od,join(project,'characters/images'),join(project,'art/images')])mkdirSync(dir,{recursive:true});
    const source='北站候车亭：两位同名阿宁交接名为候车亭的模型。\n第二位阿宁携带模型到达南站同名候车亭。\n';
    writeFileSync(join(sd,'source.txt'),source);
    const ref=n=>[{documentId:'D01',startLine:n,endLine:n}];
    const provenance={kind:'script',scope:'complete',totalEpisodes:1,documents:[{id:'D01',path:'source.txt',sha256:createHash('sha256').update(source).digest('hex'),lineCount:2}],coverage:[{documentId:'D01',startLine:1,endLine:2}]};
    const o={schemaVersion:4,source:'双站交接',provenance:clone(provenance),story:{summary:'同名人物交接模型，再前往同名异地。'},
      characters:['C01','C02'].map(id=>({id,name:'阿宁',tier:'functional',sourceRefs:ref(1)})),
      scenes:['S01','S02'].map((id,i)=>({id,name:'候车亭',primary:i===0,sourceRefs:ref(i+1)})),
      props:[{id:'P01',name:'候车亭',sourceRefs:ref(1)}],
      beats:[{id:'B01',episode:1,setup:'模型尚未交接。',outcome:'第二位阿宁接过模型。',sourceRefs:ref(1)},{id:'B02',episode:1,setup:'第二位阿宁携带模型。',outcome:'抵达南站。',sourceRefs:ref(2)}],
      episodes:[{ep:1,synopsis:'交接模型后前往另一座候车亭。',characterIds:['C01','C02'],sceneIds:['S01','S02'],propIds:['P01'],sourceRefs:provenance.coverage}]};
    o.provenance.documents[0].path='../script/source.txt';
    const s={schemaVersion:4,source:o.source,provenance,episodes:[{ep:1,targetSeconds:10,
      beatClaims:[{beatId:'B01',start:[1,1],end:[1,1]},{beatId:'B02',start:[2,1],end:[2,1]}],
      scenes:[{sceneId:'S01',characters:['C01','C02'],props:['P01'],flow:[{action:'两位同名阿宁交接候车亭模型。',sourceRefs:ref(1)}]},
      {sceneId:'S02',characters:['C02'],props:['P01'],flow:[{action:'第二位阿宁携带模型到达南站候车亭。',sourceRefs:ref(2)}]}]}]};
    const a={source:o.source,scenes:o.scenes,props:o.props},c={source:o.source,characters:o.characters};
    const context={outline:o,art:a,cast:c},sp=join(sd,'script.json'),cp=join(cd,'creation.json');
    writeFileSync(sp,JSON.stringify(s));writeFileSync(join(od,'outline.json'),JSON.stringify(o));
    writeFileSync(join(project,'characters/cast.json'),JSON.stringify(c));writeFileSync(join(project,'art/art.json'),JSON.stringify(a));
    const paths=new Map();
    for(const [kind,items] of [['character',c.characters],['scene',a.scenes],['prop',a.props]])for(const x of items){
      const path=referenceImagePath(kind,x.name,x.id,context);
      assert.match(path,new RegExp(x.id+'-'+x.name+'-sheet.png$'));paths.set(x.id,path);writeFileSync(resolve(cd,path),standIn(x.id));
    }
    assert.equal(new Set(paths.values()).size,5);
    assert.equal(referenceImagePath('character','独名','C09',context),'../characters/images/独名-sheet.png');
    const collision={art:{scenes:[{id:'S01',name:'北 站'}],props:[{id:'P01',name:'北-站'}]}};
    assert.equal(referenceImagePath('prop','北-站','P01',collision),'../art/images/P01-北-站-sheet.png');
    const renamed=clone(context);renamed.cast.characters[1].name='制作称呼';
    assert.equal(namer(renamed).nameOf('character','C02'),'制作称呼','ID takes priority over names');
    const wrongId=clone(context);wrongId.cast.characters=[{id:'C99',name:'阿宁'}];
    assert.equal(namer(wrongId).nameOf('character','C01'),null,'a different stable ID cannot match by name');
    const legacy=clone(context);legacy.cast.characters=[{name:'阿宁'}];
    assert.equal(namer(legacy).nameOf('character','C01'),null,'ambiguous legacy name cannot merge identities');
    legacy.outline.characters=[legacy.outline.characters[0]];
    assert.equal(namer(legacy).nameOf('character','C01'),'阿宁');
    const segments=[{id:'E01-01',sceneIndex:1,images:[{kind:'character',ref:'C01'},{kind:'character',ref:'C02'},{kind:'scene',ref:'S01'},{kind:'prop',ref:'P01'}],
      cuts:[{beats:[1,1],seconds:5,size:'wide',camera:'Static Shot',characters:['C01','C02'],props:['P01']}],
      prompt:'图 1 是交出者。图 2 是接收者。图 3 是北站空间。图 4 是模型。\n镜头描述：\n[镜头 1] 全景，固定，图1中的人物把图4中的模型交给图2中的人物。\n环境声与配乐：风声，无配乐。'},
      {id:'E01-02',sceneIndex:2,images:[{kind:'character',ref:'C02'},{kind:'scene',ref:'S02'},{kind:'prop',ref:'P01'}],
      cuts:[{beats:[1,1],seconds:5,size:'wide',camera:'Static Shot',characters:['C02'],props:['P01']}],
      prompt:'图 1 是携带者。图 2 是南站空间。图 3 是模型。\n镜头描述：\n[镜头 1] 全景，固定，图1中的人物携带图3中的模型到达图2中的空间。\n环境声与配乐：风声，无配乐。'}];
    const cli=(...args)=>spawnSync(process.execPath,[join(root,'scripts/mint-creation.mjs'),...args,'--script',sp],{cwd:cd,encoding:'utf8'});
    const run=(...args)=>{const r=cli(...args);assert.equal(r.status,0,r.stderr+r.stdout);return r;};
    const seed=JSON.parse(run('seed',sp).stdout);seed.promptLang='zh';seed.video=doc.video;writeFileSync(cp,JSON.stringify(seed));
    const brief=JSON.parse(run('prompts','brief',cp,'--ep','1').stdout);
    const assets=Object.values(brief.assets).flat();assert.equal(new Set(assets.map(x=>x.sheetHash)).size,5);assert.ok(assets.every(x=>x.sheetExists));
    assert.deepEqual(brief.assets.characters.map(x=>x.name),['阿宁','阿宁']);
    assert.deepEqual([...brief.assets.scenes,...brief.assets.props].map(x=>x.name),['候车亭','候车亭','候车亭']);
    for(const {prompt,...structure} of segments){mkdirSync(join(cd,structure.id));writeFileSync(join(cd,structure.id,'prompt.md'),W.serializeWorksheet({meta:{segment:structure.id,status:'draft',round:0,model:'MiniMax H3',promptLang:'zh'},structure,body:prompt}));}
    run('prompts','check',cp);run('prompts','submit',cp);
    for(const seg of segments){const path=join(cd,seg.id,'prompt.md'),sheet=W.parseWorksheet(readFileSync(path,'utf8'));sheet.review='结论：通过。仅登记技术夹具，不代表内容或视觉审核。';writeFileSync(path,W.serializeWorksheet(sheet));run('prompts','verdict',cp,'approved',seg.id);}
    run('prompts','apply',cp);run('export',cp,'--out',cd);
    const manifest=json(join(cd,'manifest.json'));
    for(const seg of manifest.segments)for(const img of seg.images)assert.equal(img.path,paths.get(img.ref));
    const missing=resolve(cd,paths.get('C02'));rmSync(missing);
    const failure=cli('prompts','check',cp);assert.equal(failure.status,1);assert.match(failure.stderr,/C02/);
    writeFileSync(missing,standIn('C02'));
    const originalHash=W.inputHashOf(segments[0],brief);
    const changed=clone(brief);changed.assets.characters[1].sheetHash='changed';
    assert.notEqual(W.inputHashOf(segments[0],changed),originalHash);
    const first=resolve(cd,paths.get('C01'));writeFileSync(first,standIn('C01 changed'));
    const status=cli('prompts','status',cp);assert.equal(status.status,1);
    assert.deepEqual(status.stdout.split('\n').filter(l=>l.startsWith('✗')).map(l=>l.split(/\s+/)[1]),['E01-01']);
    assert.equal(cli('export',cp,'--out',cd).status,1);
  });
  test('standalone copied skill retains fusion roundtrip without siblings',()=>{
    if(process.env.MINT_FUSION_STANDALONE==='1')return;
    const local=join(temp,'standalone');cpSync(root,local,{recursive:true});const r=spawnSync(process.execPath,[join(local,'scripts/fusion-selftest.mjs')],{cwd:temp,encoding:'utf8',env:{...process.env,MINT_FUSION_STANDALONE:'1'}});assert.equal(r.status,0,r.stderr+r.stdout);
  });
  console.log(`✓ ${count} fusion tests passed; structural/source-coordinate verification only, no semantic or generated-video approval`);
} finally {rmSync(temp,{recursive:true,force:true});}
