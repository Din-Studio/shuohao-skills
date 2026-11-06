#!/usr/bin/env node
// Review R1–R8 regression: local fixtures + injected exec/fetch only. No generation.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, chmodSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import * as C from './novel-creation.mjs';
import {scriptProblems} from './lib/contracts.mjs';
import {runBatch, inputIdentity} from './lib/lingying.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(readFileSync(join(root,'examples',p),'utf8'));
const doc=read('creation/收书人-creation.json'), script=read('script/收书人-script.json');
const outline=read('outline/收书人-outline.json'), production=read('production.json');
const temp=mkdtempSync(join(tmpdir(),'creation-fixes-'));
const clone=structuredClone;
let count=0;
async function test(name, fn) { try { await fn(); count++; console.log(`PASS ${name}`); } catch(e) { e.message=`${name}: ${e.message}`; throw e; } }
const json=(path,value)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(value));return path;};
const cli=(...args)=>spawnSync(process.execPath,[join(root,'scripts/novel-creation.mjs'),...args],{cwd:temp,encoding:'utf8'});
const gate=(d,id,ctx={})=>C.gateReport(d,ctx).find(g=>g.id===id);
const short=()=>{
  const d=clone(doc);d.params.rules.cutDuration={level:'off'};
  d.episodes=d.episodes.slice(0,1);const e=d.episodes[0];e.segments=e.segments.slice(0,1);e.openingBeat=[1,1];e.endBeat=[1,1];
  Object.assign(e.segments[0],{images:[],cuts:[{beats:[1,1],seconds:5,size:'wide',camera:'Static Shot',characters:[]}],prompt:'shots:\n[Shot 1] wide shot, Static Shot — observe.\nambience: silence.'});return d;
};
const fakeFetch=async()=>({ok:true,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer});
const job=()=>({key:'E01-01',name:'E01-01',file:'E01-01/video.mp4',prompt:'observe',duration:5,images:[]});
function runner(outDir, extra={}) {
  const calls=[];
  return {calls, options:{outDir,bin:'FAKE-NOT-A-REAL-EXECUTABLE',model:'MiniMax H3',fetchImpl:fakeFetch,sleep:async()=>{},
    exec:async(_bin,args)=>{calls.push(args);if(args[0]==='upload')return 'https://fake.invalid/ref';if(args[0]==='video')return JSON.stringify({data:{task_id:'new-task'}});return JSON.stringify({data:{status:'success',result:{url:'https://fake.invalid/video'}}});},...extra}};
}
try {
  await test('R1 exact thirds: dialogue fit fails 14/3 > 4.6',()=>{
    const s=clone(script);s.params.charsPerSecond=3;
    s.episodes=[{ep:1,targetSeconds:5,opening:'start',ending:{mode:'open',event:'end'},openingBeat:[1,1],endBeat:[1,15],beatClaims:[],scenes:[{sceneId:'S01',characters:['C01'],flow:Array.from({length:15},()=>({speaker:'C01',line:'a'}))}]}];
    assert.deepEqual(scriptProblems(s),[]);
    const beats=C.expandScript(s).get(1).scenes[0].beats;
    assert.equal(beats[0].seconds,1/3);assert.equal(beats.reduce((n,b)=>n+b.seconds,0),Array(15).fill(1/3).reduce((a,b)=>a+b,0));
    const d=short(),e=d.episodes[0];Object.assign(e,{opening:'start',ending:s.episodes[0].ending,endBeat:[1,15]});
    e.segments[0].cuts=[{...e.segments[0].cuts[0],beats:[1,14],seconds:4.6},{...e.segments[0].cuts[0],beats:[15,15],seconds:0.4}];
    e.segments[0].prompt='shots:\n[Shot 1] wide shot, Static Shot — says "a".\n[Shot 2] wide shot, Static Shot — says "a".\nambience: silence.';
    assert.equal(gate(d,'dialogue-fit',{script:s}).status,'fail');
  });
  for(const seconds of [15.04,15.0000001]) await test(`R1 raw model boundary ${seconds}`,()=>{
    const d=short();d.episodes[0].segments[0].cuts[0].seconds=seconds;
    assert.equal(C.segSeconds(d.episodes[0].segments[0]),seconds);
    assert.equal(gate(d,'segment-cap').status,'fail');assert.equal(gate(d,'model-capability').status,'fail');
    assert.equal(C.computeStats(d).totals.seconds,seconds);
    const manifest=JSON.parse(C.exportPack(d).files.find(f=>f.path==='manifest.json').content);
    assert.equal(manifest.segments[0].seconds,seconds);
  });
  await test('R1 valid upper bound stays accepted',()=>{const d=short();d.episodes[0].segments[0].cuts[0].seconds=15;assert.deepEqual(C.validateCreation(d),[]);});
  for(const beat of [{line:'a',action:'b'},{line:''},{action:''},{line:'a'}]) await test(`R1 invalid timing is null ${JSON.stringify(beat)}`,()=>assert.equal(C.beatSeconds(beat,{}),null));
  await test('R1 fractional segment and episode sums remain unrounded',()=>{
    const d=short();d.episodes[0].segments[0].cuts[0].seconds=5.04;
    d.episodes.push({...clone(d.episodes[0]),ep:2});assert.equal(C.computeStats(d).totals.seconds,10.08);
  });
  const manifestPath=join(temp,'pack/manifest.json');mkdirSync(join(temp,'pack/E01-01'),{recursive:true});
  writeFileSync(join(temp,'pack/E01-01/prompt.md'),'# E01-01\n\n---\nshots:\n[Shot 1] wide shot, Static Shot — observe.\nambience: silence.');
  const manifest=seconds=>({video:{model:'MiniMax H3'},segments:[{segment:'E01-01',seconds,prompt:'E01-01/prompt.md',images:[]}]});
  for(const seconds of [30,15.04,0,-1,null,'5']) await test(`R2 videos rejects ${JSON.stringify(seconds)} before any job`,()=>{
    json(manifestPath,manifest(seconds));const r=cli('videos',manifestPath,'--dry-run');assert.equal(r.status,1,r.stdout+r.stderr);assert.equal(r.stdout,'');
  });
  for(const seconds of [NaN,Infinity,undefined]) await test(`R2 non-finite duration ${seconds}`,()=>assert.equal(C.clampDuration(seconds,'MiniMax H3').duration,null));
  await test('R2 valid decimal rounds up; short clip pads, never truncates',()=>{
    json(manifestPath,manifest(12.5));const r=cli('videos',manifestPath,'--dry-run');assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).results[0].inputData.duration,13);assert.equal(C.clampDuration(3,'MiniMax H3').duration,5);
  });
  await test('R3 force never polls old taskId, even same inputs',async()=>{
    for(const changed of [false,true]) {
      const dir=join(temp,`force-${changed}`),j=job();json(join(dir,'.tasks.json'),{[j.key]:{taskId:'old-task',model:'MiniMax H3',inputIdentity:inputIdentity(j,{outDir:dir,model:'MiniMax H3'})}});
      if(changed){j.prompt='new prompt';j.duration=30;}
      const r=runner(dir,{force:true,model:changed?'seedance2.5':'MiniMax H3'});const result=await runBatch([j],r.options);
      assert.equal(result.summary.ok,1);assert.equal(r.calls.filter(a=>a[0]==='video').length,1);assert.ok(!r.calls.some(a=>a.includes('old-task')));
    }
  });
  await test('R3 timeout resumes matching task without upload or submit',async()=>{
    const dir=join(temp,'resume'),j=job();j.images=[{path:'ref.bin'}];mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'ref.bin'),'fixture bytes');
    const first=runner(dir,{timeoutMs:0,exec:async(_b,a)=>a[0]==='upload'?'https://fake.invalid/ref':JSON.stringify({data:a[0]==='video'?{task_id:'pending-task'}:{status:'running'}})});
    assert.equal((await runBatch([j],first.options)).summary.timeout,1);
    const next=runner(dir);assert.equal((await runBatch([j],next.options)).summary.ok,1);
    assert.deepEqual(next.calls,[['task','get','pending-task','--json']]);
    const done=runner(dir);assert.equal((await runBatch([j],done.options)).summary.skipped,1);assert.deepEqual(done.calls,[]);
  });
  for(const change of ['model','prompt','duration','inputBase','reference-content','reference-order','file','legacy']) await test(`R3 changed ${change} requires force; no exec`,async()=>{
    const dir=join(temp,`identity-${change}`),j=job();mkdirSync(dir,{recursive:true});
    for(const name of ['a.bin','b.bin'])writeFileSync(join(dir,name),name);
    j.images=[{path:'a.bin'},{path:'b.bin'}];
    const old={taskId:'old-task',model:'MiniMax H3',inputIdentity:inputIdentity(j,{model:'MiniMax H3',outDir:dir})};
    if(change==='legacy')delete old.inputIdentity;
    json(join(dir,'.tasks.json'),{[j.key]:old});const r=runner(dir);
    if(change==='model')r.options.model='seedance2.5';
    if(change==='prompt')j.prompt='changed';
    if(change==='duration')j.duration=10;
    if(change==='file')j.file='new/video.mp4';
    if(change==='inputBase')r.options.inputBase={resolution:'1080p'};
    if(change==='reference-content')writeFileSync(join(dir,'a.bin'),'changed bytes');
    if(change==='reference-order')j.images.reverse();
    const result=await runBatch([j],r.options);assert.equal(result.summary.failed,1);assert.match(result.results[0].detail,/--force/);assert.deepEqual(r.calls,[]);
  });
  await test('R3 completed output identity also detects changed prompt',async()=>{
    const dir=join(temp,'completed'),j=job(),r=runner(dir);assert.equal((await runBatch([j],r.options)).summary.ok,1);
    j.prompt='changed';const next=runner(dir);assert.equal((await runBatch([j],next.options)).summary.failed,1);assert.deepEqual(next.calls,[]);
  });
  await test('R3 failed force does not resurrect old task or old output',async()=>{
    const dir=join(temp,'force-failed'),j=job();json(join(dir,'.tasks.json'),{[j.key]:{taskId:'old-task'}});
    mkdirSync(join(dir,'E01-01'),{recursive:true});writeFileSync(join(dir,j.file),'old bytes');
    const first=runner(dir,{force:true,exec:async()=>{throw new Error('fake submit failure');}});assert.equal((await runBatch([j],first.options)).summary.failed,1);
    const next=runner(dir);assert.equal((await runBatch([j],next.options)).summary.ok,1);assert.ok(next.calls.some(a=>a[0]==='video'));assert.ok(!next.calls.some(a=>a.includes('old-task')));
  });
  await test('R3 corrupt ledger never becomes a new submission',async()=>{
    const dir=join(temp,'bad-ledger');mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'.tasks.json'),'{');const r=runner(dir);await assert.rejects(()=>runBatch([job()],r.options),/台账不可读/);assert.deepEqual(r.calls,[]);
  });
  for(const missing of ['script','outline']) await test(`R4 independent selection checks: missing ${missing}`,()=>{
    const ctx={script:clone(script),outline:clone(outline),production};
    for(const key of ['script','outline'])ctx[key].creativeContext={selection:clone(production.creative.selection)};
    assert.equal(gate(doc,'upstream-selection',ctx).status,'pass');delete ctx[missing].creativeContext;
    assert.equal(gate(doc,`${missing}-selection`,ctx).reason,'stage-incomplete');assert.equal(gate(doc,'upstream-selection',ctx).status,'skipped');
    const other=missing==='script'?'outline':'script';assert.equal(gate(doc,`${other}-selection`,ctx).status,'pass');
    ctx[other].creativeContext.selection.pacing.id='wrong';assert.equal(gate(doc,'upstream-selection',ctx).status,'fail');
  });
  for(const key of ['charsPerSecond','actionSeconds']) for(const value of [undefined,null,0,-1,'4',NaN,Infinity]) await test(`R5 explicit timing ${key}=${value}`,()=>{
    const s=clone(script);s.params[key]=value;assert.ok(scriptProblems(s).some(m=>m.includes(key)));assert.throws(()=>C.seedFromScript(s));
    assert.equal(gate(doc,'script-contract',{script:s}).status,'fail');assert.throws(()=>C.renderMarkdown(doc,{script:s}));
  });
  for(const params of [undefined,null,[]]) await test(`R5 invalid params ${JSON.stringify(params)}`,()=>{const s=clone(script);s.params=params;assert.ok(scriptProblems(s).length);assert.equal(gate(doc,'script-contract',{script:s}).status,'fail');});
  await test('R5 overflowing dialogue estimate is invalid, not zero',()=>{const s=clone(script);s.params.charsPerSecond=Number.MIN_VALUE;assert.ok(scriptProblems(s).length);assert.equal(C.expandScript(s).get(1).scenes[0].beats[1].seconds,null);assert.equal(gate(doc,'script-contract',{script:s}).status,'fail');});
  await test('R6 props omitted remains valid and seeds empty props',()=>{
    const s=clone(script);s.episodes.forEach(e=>e.scenes.forEach(sc=>delete sc.props));assert.deepEqual(scriptProblems(s),[]);assert.deepEqual(C.seedFromScript(s).episodes[0].seedScenes[0].props,[]);
  });
  for(const value of [null,'P01',['C01'],['P01','P01'],[1]]) await test(`R6 supplied props validated ${JSON.stringify(value)}`,()=>{const s=clone(script);s.episodes[0].scenes[0].props=value;assert.ok(scriptProblems(s).length);});
  for(const key of ['script','outline','production','art','cast']) await test(`R7 explicit null ${key} is not missing`,()=>{
    assert.ok(C.validateCreation(doc,{[key]:null}).length);assert.ok(!C.validateCreation(doc,{[key]:undefined}).length);
  });
  const docPath=json(join(temp,'standalone.json'),doc);
  for(const flag of ['--script','--outline','--production','--art','--cast','--shots','--lang','--out','--only','--timeout','--concurrency','--eps']) for(const following of [[],['--no-production']]) await test(`R7 missing CLI value ${flag} ${following}`,()=>assert.equal(cli('validate',docPath,flag,...following).status,1));
  await test('R7 production flags mutually exclusive',()=>assert.equal(cli('validate',docPath,'--production',join(root,'examples/production.json'),'--no-production').status,1));
  for(const kind of ['dangling','directory','corrupt']) await test(`R7 discovered ${kind} production is not missing`,()=>{
    const dir=join(temp,kind),p=json(join(dir,'creation/doc.json'),doc);
    if(kind==='dangling')symlinkSync(join(dir,'absent.json'),join(dir,'production.json'));
    if(kind==='directory')mkdirSync(join(dir,'production.json'));
    if(kind==='corrupt')writeFileSync(join(dir,'production.json'),'{');
    assert.equal(C.findProduction(dirname(p)),join(dir,'production.json'));assert.equal(cli('validate',p).status,1);
    assert.equal(cli('validate',p,'--no-production').status,0);
  });
  if(process.getuid?.() !== 0) await test('R7 discovered permission-denied production fails',()=>{const dir=join(temp,'unreadable'),p=json(join(dir,'creation/doc.json'),doc),config=json(join(dir,'production.json'),production);chmodSync(config,0);try{assert.equal(cli('validate',p).status,1);}finally{chmodSync(config,0o600);}});
  for(const stamp of ['0–3 秒观察，3–5 秒停留','0-3秒','0.5～3.25 秒','第 3 秒','3 秒后','00:03','00:00:03.000','3.00-second','3 seconds later','at 3.5 seconds','at second 3','0–3s']) await test(`R8 seedance rejects ${stamp}`,()=>{
    const d=short();d.video={model:'seedance2.0'};d.promptLang='zh';d.episodes[0].segments[0].prompt=`镜头描述：\n[镜头 1] 全景，固定 — ${stamp}。\n环境声与配乐：无配乐。`;
    assert.equal(gate(d,'prompt-model-fit').status,'fail');
  });
  await test('R8 seedance accepts slow observation without timestamp',()=>{
    const d=short();d.video={model:'seedance2.0'};d.promptLang='zh';d.episodes[0].segments[0].prompt='镜头描述：\n[镜头 1] 全景，固定 — 缓慢观察。\n环境声与配乐：无配乐。';assert.deepEqual(C.validateCreation(d),[]);
  });
  await test('R8 videos validates seedance prompt again after export',()=>{
    const m=manifest(5);m.video.model='seedance2.0';json(manifestPath,m);writeFileSync(join(temp,'pack/E01-01/prompt.md'),'0–3 秒观察');assert.equal(cli('videos',manifestPath,'--dry-run').status,1);
  });
  console.log(`✓ ${count} creation fixes tests passed; fake exec/fetch only`);
} finally { rmSync(temp,{recursive:true,force:true}); }
