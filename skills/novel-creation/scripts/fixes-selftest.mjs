#!/usr/bin/env node
// Creative-contract and offline handoff regressions. No generation.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, chmodSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import * as C from './novel-creation.mjs';
import {scriptProblems} from './lib/contracts.mjs';
import * as W from './lib/worksheet.mjs';
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
  const d=clone(doc);
  d.episodes=d.episodes.slice(0,1);const e=d.episodes[0];e.segments=e.segments.slice(0,1);
  Object.assign(e.segments[0],{images:[],cuts:[{beats:[1,1],seconds:5,size:'wide',camera:'Static Shot',characters:[]}],prompt:'shots:\n[Shot 1] wide shot, Static Shot — observe.\nambience: silence.'});return d;
};

try {
  await test('R1 exact thirds: dialogue fit fails 14/3 > 4.6',()=>{
    const s=clone(script);s.params.charsPerSecond=3;
    s.episodes=[{ep:1,targetSeconds:5,opening:'start',ending:{mode:'open',event:'end'},openingBeat:[1,1],beatClaims:[],scenes:[{sceneId:'S01',characters:['C01'],flow:Array.from({length:15},()=>({speaker:'C01',line:'a'}))}]}];
    assert.deepEqual(scriptProblems(s),[]);
    const beats=C.expandScript(s).get(1).scenes[0].beats;
    assert.equal(beats[0].seconds,1/3);assert.equal(beats.reduce((n,b)=>n+b.seconds,0),Array(15).fill(1/3).reduce((a,b)=>a+b,0));
    const d=short(),e=d.episodes[0];
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
  for(const beat of [{line:'a',action:'b'},{line:''},{action:''},{}]) await test(`R1 invalid timing is null ${JSON.stringify(beat)}`,()=>assert.equal(C.beatSeconds(beat,{}),null));
  await test('R1 fractional segment and episode sums remain unrounded',()=>{
    const d=short();d.episodes[0].segments[0].cuts[0].seconds=5.04;
    d.episodes.push({...clone(d.episodes[0]),ep:2});assert.equal(C.computeStats(d).totals.seconds,10.08);
  });
  // 最小可核对的投产包：manifest 指向的 creation.json、剧本与已批准的工作单都在临时目录里，批准的两重绑定按真实规则计算
  const manifestPath=join(temp,'pack/manifest.json'),sheetPath=join(temp,'pack/E01-01/prompt.md'),BODY='shots:\n[Shot 1] wide shot, Static Shot — observe.\nambience: silence.';
  mkdirSync(join(temp,'pack/E01-01'),{recursive:true});json(join(temp,'pack/script/s.json'),script);
  const publish=(m,body=BODY)=>{
    const structure={id:'E01-01',sceneIndex:1,cuts:[],images:[]};
    const creation={schemaVersion:3,source:script.source,promptLang:'en',video:m.video,episodes:[{ep:1,segments:[{...structure,prompt:body}]}]};
    json(join(temp,'pack/c.json'),creation);
    const material=C.dispatchBrief(creation,{script},1);
    writeFileSync(sheetPath,W.serializeWorksheet({meta:{segment:'E01-01',status:'approved',round:1,model:m.video.model,promptLang:'en',bodyHash:W.hashOf(structure,body),inputHash:W.inputHashOf(structure,material)},structure,review:'结论：通过。',body}));
    return json(manifestPath,{creation:'c.json',...m});
  };
  const manifest=seconds=>({video:{model:'MiniMax H3'},segments:[{segment:'E01-01',seconds,prompt:'E01-01/prompt.md',images:[]}]});
  for(const seconds of [30,15.04,0,-1,null,'5']) await test(`R2 videos rejects ${JSON.stringify(seconds)} before any job`,()=>{
    publish(manifest(seconds));const r=cli('videos',manifestPath,'--dry-run');assert.equal(r.status,1,r.stdout+r.stderr);assert.equal(r.stdout,'');
  });
  for(const seconds of [NaN,Infinity,undefined]) await test(`R2 non-finite duration ${seconds}`,()=>assert.equal(C.clampDuration(seconds,'MiniMax H3').duration,null));
  await test('R2 valid decimal rounds up; short clip pads, never truncates',()=>{
    publish(manifest(12.5));const r=cli('videos',manifestPath,'--dry-run');assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).jobs[0].params.duration,13);assert.equal(C.clampDuration(3,'MiniMax H3').duration,5);
  });
  await test('handoff CLI preserves ordered references, roles, prompt and output from another cwd',()=>{
    const m=manifest(7);m.video.aspectRatio='9:16';m.video.resolution='768p';
    const refs=[{path:'../second.png',kind:'scene',ref:'S01',name:'测试场景',role:'environment reference'},
      {path:'../first.png',kind:'character',ref:'C02',name:'测试角色',role:'identity reference'}];
    m.segments[0].images=refs;
    writeFileSync(join(temp,'first.png'),'fixture one');writeFileSync(join(temp,'second.png'),'fixture two');
    publish(m);
    const out=join(temp,'handoff.json'),r=cli('videos',manifestPath,'--only','E01-01','--out',out);
    assert.equal(r.status,0,r.stderr);const plan=JSON.parse(r.stdout),j=plan.jobs[0];
    assert.equal(plan.status,'planned');assert.equal(plan.skill,'ly-video');assert.equal(plan.model,'MiniMax H3');
    assert.equal(plan.jobs.length,1);assert.equal(j.id,'E01-01');
    assert.equal(j.prompt,'shots:\n[Shot 1] wide shot, Static Shot — observe.\nambience: silence.');
    assert.deepEqual(j.params,{aspect_ratio:'9:16',resolution:'768p',duration:7});
    assert.deepEqual(j.references,refs.map(ref=>({...ref,path:resolve(temp,'pack',ref.path)})));
    assert.equal(j.output,join(temp,'pack/E01-01/video.mp4'));
    assert.deepEqual(JSON.parse(readFileSync(out,'utf8')),plan);
    assert.equal(cli('videos',manifestPath,'--out',out).status,1,'plan output must not be overwritten');
    for(const option of ['--force','--cutout','--timeout','--concurrency'])
      assert.equal(cli('videos',manifestPath,option,'1').status,1);
    rmSync(join(temp,'second.png'));
    assert.equal(cli('videos',manifestPath,'--dry-run').status,1,'missing reference fails even in preview');
  });
  for(const stage of ['script','outline']) await test(`R4 project and ${stage} brief conflict requires manual merge`,()=>{
    const ctx={script:clone(script),outline:clone(outline),production:{...production,creativeBrief:'保持克制'}};
    assert.equal(gate(doc,'project-contract',ctx).status,'pass');
    ctx[stage].creativeBrief='人物表达强烈';
    assert.equal(gate(doc,'project-contract',ctx).status,'fail');
  });
  for(const key of ['charsPerSecond','actionSeconds']) for(const value of [null,0,-1,'4',NaN,Infinity]) await test(`R5 explicit timing ${key}=${value}`,()=>{
    const s=clone(script);s.params[key]=value;assert.ok(scriptProblems(s).some(m=>m.includes(key)));assert.throws(()=>C.seedFromScript(s));
    assert.equal(gate(doc,'script-contract',{script:s}).status,'fail');assert.throws(()=>C.renderMarkdown(doc,{script:s}));
  });
  for(const params of [null,[]]) await test(`R5 invalid params ${JSON.stringify(params)}`,()=>{const s=clone(script);s.params=params;assert.ok(scriptProblems(s).length);assert.equal(gate(doc,'script-contract',{script:s}).status,'fail');});
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
    const m=manifest(5);m.video.model='seedance2.0';publish(m,'0–3 秒观察');const r=cli('videos',manifestPath,'--dry-run');assert.equal(r.status,1);assert.match(r.stderr,/seedance/);
  });
  await test('videos rejects unapproved, stale and legacy prompt files',()=>{
    publish(manifest(5));const good=readFileSync(sheetPath,'utf8');
    const ok=cli('videos',manifestPath,'--dry-run');assert.equal(ok.status,0,ok.stderr);assert.match(JSON.parse(ok.stdout).approval.input,/^[0-9a-f]{16}$/);
    writeFileSync(sheetPath,good.replace('status: approved','status: in_review'));let r=cli('videos',manifestPath,'--dry-run');assert.equal(r.status,1);assert.match(r.stderr,/尚未批准/);
    writeFileSync(sheetPath,good.replace('observe.','observe closely.'));r=cli('videos',manifestPath,'--dry-run');assert.equal(r.status,1);assert.match(r.stderr,/批准已失效/);
    writeFileSync(sheetPath,'# E01-01\n\n---\nshots:\n[Shot 1] wide shot, Static Shot — observe.\nambience: silence.');r=cli('videos',manifestPath,'--dry-run');assert.equal(r.status,1);assert.match(r.stderr,/状态头/);
    // 批准还绑定输入：模型参数、认领节拍的原文发生变化，旧批准失效；旧版本导出的 manifest 需要重新导出
    writeFileSync(sheetPath,good);const m=manifest(5);m.video.resolution='2K';json(manifestPath,{creation:'c.json',...m});
    r=cli('videos',manifestPath,'--dry-run');assert.equal(r.status,1);assert.match(r.stderr,/视频参数.*不一致/);
    const cPath=join(temp,'pack/c.json'),c=JSON.parse(readFileSync(cPath,'utf8'));c.video.resolution='2K';json(cPath,c);
    r=cli('videos',manifestPath,'--dry-run');assert.equal(r.status,1);assert.match(r.stderr,/输入发生变化/);
    publish(manifest(5));json(manifestPath,manifest(5));r=cli('videos',manifestPath,'--dry-run');assert.equal(r.status,1);assert.match(r.stderr,/重新运行 export/);
  });
  console.log(`✓ ${count} creation fixes tests passed; offline only`);
} finally { rmSync(temp,{recursive:true,force:true}); }
