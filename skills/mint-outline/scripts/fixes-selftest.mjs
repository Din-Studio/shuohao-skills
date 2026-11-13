#!/usr/bin/env node
// Consumer CLI and generated report DOM regressions. No browser, network or sibling installation.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {renderHtml} from './lib/outline-report.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),cli=join(root,'scripts/mint-outline.mjs');
const fixture=JSON.parse(readFileSync(join(root,'examples/旧站时刻-outline.json'),'utf8'));
delete fixture.creativeBrief;
const tmp=mkdtempSync(join(tmpdir(),'outline-fixes-'));
let count=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++;};
const ok=(v,m)=>{assert.ok(v,m);count++;};
const clone=x=>structuredClone(x??fixture);
const json=(p,d)=>writeFileSync(p,JSON.stringify(d));
const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:20000,maxBuffer:4*1024*1024});
try {
 const file=join(tmp,'outline.json');
 for(const id of [['Q01'],[['Q01']],null,1,{},['Q99']]) {
  const d=clone();d.episodes[5].ending.question.id=id;json(file,d);
  const r=run('checkup',file,'--json');eq(r.status,1,'illegal Q type must block');
  eq(JSON.parse(r.stdout).gates.find(g=>g.id==='questions').status,'fail');
 }
 for(const label of ['constructor','__proto__','toString','hasOwnProperty']) {
  const d=clone();d.beats[0].setup=label;d.episodes[0].warnings=[label];json(file,d);
  eq(run('validate',file).status,0,'free labels remain valid');
  const r=run('assets',file);eq(r.status,0);const assets=JSON.parse(r.stdout);
  eq(assets.warnings[label],[1]);
  for(const format of ['--html','--md'])eq(run('render',file,format).status,0,'real render accepts dictionary keys');
 }
 const hostile=clone();hostile.source='<img src=x onerror="alert(1)">\r\n# injected [link](javascript:evil)\u2028next';json(file,hostile);
 const md=run('render',file,'--md');eq(md.status,0);ok(!md.stdout.includes('<img'));ok(!md.stdout.includes('\n# injected'));ok(md.stdout.split('\n')[0].includes('\\[link\\]\\(javascript:evil\\)'));

 const project=join(tmp,'project'),outlineDir=join(project,'outline'),scriptDir=join(project,'script'),creationDir=join(project,'creation');
 for(const p of [outlineDir,scriptDir,creationDir])mkdirSync(p,{recursive:true});
 const docFile=join(outlineDir,'doc.json'),prodFile=join(project,'production.json'),scriptFile=join(scriptDir,'batch.json'),creationFile=join(creationDir,'batch.json');
 json(docFile,fixture);symlinkSync('missing-target.json',prodFile);
 for(const args of [['validate'],['checkup','--json'],['render','--html'],['render','--md']]) {
  const r=run(args[0],docFile,...args.slice(1));eq(r.status,1,'auto-discovered dangling production blocks');
  if(args[0]==='checkup'){const gates=JSON.parse(r.stdout).gates;eq(gates.find(g=>g.id==='production-readable').status,'fail');ok(!gates.some(g=>g.id==='creative-project'&&g.reason==='missing-upstream'));}
 }
 rmSync(prodFile);const actual=join(project,'actual-production.json');json(actual,{schemaVersion:3});symlinkSync('actual-production.json',prodFile);
 eq(run('validate',docFile).status,0,'readable production symlink remains valid');
 // This fixture belongs to outline and projects only its own story; no sibling samples.
 const script={schemaVersion:4,source:fixture.source,provenance:clone(fixture.provenance),episodes:fixture.episodes.map(ep=>{
  const beats=fixture.beats.filter(b=>b.episode===ep.ep);
  return {ep:ep.ep,targetSeconds:24,openingBeat:[1,1],scenes:[{flow:beats.map(b=>({action:b.outcome,sourceRefs:clone(b.sourceRefs)}))}],beatClaims:beats.map((b,i)=>({beatId:b.id,start:[1,i+1],end:[1,i+1]}))};
 })};
 const creation={schemaVersion:3,source:fixture.source,params:{tolerance:0.15},episodes:script.episodes.map(ep=>({ep:ep.ep,openingBeat:clone(ep.openingBeat),segments:[{sceneIndex:1,cuts:ep.scenes[0].flow.map((_,i)=>({beats:[i+1,i+1],seconds:ep.targetSeconds/ep.scenes[0].flow.length}))}]}))};
 const reset=()=>{json(docFile,fixture);json(scriptFile,script);json(creationFile,creation);};
 const apply=()=>{
  const r=run('checkup',docFile,'--production',prodFile,'--downstream','--json');
  const report=JSON.parse(r.stdout);ok(report.downstream,'real consumer reports actual downstream checks');
  return {...r,report};
 };
 reset();let r=apply();eq(r.status,0,r.stderr);eq(r.report.downstream.stats.fail,0);eq(r.report.downstream.files.length,2);
 eq(r.report.downstream.fullDownstreamValidation,'not-performed');eq(r.report.downstream.applicationWorkflow,'incomplete');eq(r.report.contentReview,'not-performed');
 // Closed duration endpoints must match creation's consumer, without rounding model limits.
 for (const [total, status] of [[20.4,0],[27.6,0],[20.3999999,1],[27.6000001,1]]) {
  reset();
  const s=clone(script);s.episodes.forEach(ep=>ep.targetSeconds=24);json(scriptFile,s);
  const c=clone(creation);c.episodes=c.episodes.slice(0,1);
  const cuts=c.episodes[0].segments[0].cuts;cuts.forEach(cut=>cut.seconds=total/cuts.length);json(creationFile,c);
  r=apply();eq(r.status,status,`closed duration endpoint ${total}: ${r.stderr}`);
  eq(r.report.downstream.gates.find(g=>g.stage==='creation'&&g.id==='target-duration').status,status?'fail':'pass');
 }
 // Missing script cannot disable local scene continuity.
 for (const [nextScene,status] of [[2,0],[3,1]]) {
  reset();rmSync(scriptFile);const c=clone(creation),ep=c.episodes[0];
  const cuts=ep.segments[0].cuts;eq(cuts.length,2,'local story supplies two core beats');
  ep.segments=[{sceneIndex:1,cuts:[cuts[0]]},{sceneIndex:nextScene,cuts:[{...cuts[1],beats:[1,1]}]}];json(creationFile,c);
  r=apply();eq(r.status,status,`scene continuity without script ${nextScene}: ${r.stderr}`);
 }
 reset();rmSync(scriptFile);const startAtTwo=clone(creation);
 for(const ep of startAtTwo.episodes){ep.segments.forEach(seg=>seg.sceneIndex=2);ep.openingBeat[0]=2;}
 json(creationFile,startAtTwo);r=apply();eq(r.status,1,'initial scene must be one without upstream');
 ok(r.report.downstream.gates.some(g=>g.stage==='creation'&&g.id==='node-claims'&&g.status==='fail'));
 // Version, selection, episode identity, targets, node identity and real locations all block.
 for(const [stage,mutate,id] of [
  ['script',d=>d.schemaVersion=999,'version'],
  ['creation',d=>delete d.schemaVersion,'version'],
  ['creation',d=>d.schemaVersion=999,'version'],
  ['script',d=>d.creativeContext={},'document'],
  ['creation',d=>d.params.rules={},'document'],
  ['script',d=>d.source='stale','source'],
  ['creation',d=>d.source='stale','source'],
  ['script',d=>d.episodes[0].endBeat=[1,2],'projection'],
  ['creation',d=>d.episodes[0].endBeat=[1,2],'projection'],
  ['script',d=>d.episodes[0].ep=999,'episodes'],
  ['creation',d=>d.episodes[0].ep=999,'episodes'],
  ['script',d=>d.episodes[0].targetSeconds=0,'target-duration'],
  ['creation',d=>d.episodes[0].segments[0].cuts[0].seconds=999,'target-duration'],
  ['script',d=>d.episodes[0].beatClaims[0].beatId='B99','node-claims'],
  ['script',d=>d.episodes[0].beatClaims.pop(),'node-claims'],
  ['script',d=>d.episodes[0].beatClaims[0].start=[9,9],'node-claims'],
  ['script',d=>d.episodes[0].beatClaims.reverse(),'node-claims'],
  ['script',d=>d.episodes[0].beatClaims[0].start=[1,2],'node-claims'],
  ['script',d=>d.episodes[0].beatClaims[1].start=[1,1],'node-claims'],
  ['script',d=>d.episodes[0].beatClaims[0].beatId='B08','node-claims'],
  ['script',d=>d.episodes[0].openingBeat=[1,999],'node-claims'],
  ['script',d=>d.creativeBrief='local copy','document'],
  ['creation',d=>d.episodes[0].openingBeat=[1,2],'projection'],
  ['creation',d=>d.episodes[0].segments[0].cuts[0].seconds=-1,'target-duration'],
  ['script',d=>d.episodes[0].beatClaims.push(clone(d.episodes[0].beatClaims[0])),'node-claims'],
  ['creation',d=>d.episodes[0].segments[0].cuts[0].beats=[1,999],'node-claims'],
  ['creation',d=>d.episodes[0].segments[0].cuts.push(clone(d.episodes[0].segments[0].cuts[0])),'node-claims'],
  ['script',d=>d.episodes[0].ending={mode:'open',event:'stale'},'projection'],
  ['creation',d=>d.episodes[0].opening='stale','projection']
 ]) {
  reset();const d=clone(stage==='script'?script:creation);mutate(d);json(stage==='script'?scriptFile:creationFile,d);
  r=apply();eq(r.status,1,`${stage}/${id}: ${r.stderr}`);ok(r.report.downstream.gates.some(g=>g.stage===stage&&g.id===id&&g.status==='fail'));
  eq(JSON.parse(readFileSync(docFile,'utf8')),fixture,'checkup never writes the outline');
 }
 for(const target of [scriptFile,creationFile])for(const broken of ['{broken','null']) {
  reset();writeFileSync(target,broken);r=apply();eq(r.status,1);ok(r.report.downstream.gates.some(g=>g.file===target&&g.id==='readable'&&g.status==='fail'));
 }
 reset();rmSync(scriptFile);symlinkSync('missing-script.json',scriptFile);r=apply();eq(r.status,1);ok(r.report.downstream.gates.some(g=>g.file===scriptFile&&g.id==='readable'&&g.status==='fail'));ok(!r.report.downstream.gates.some(g=>g.id==='script-coverage'&&g.reason==='missing-upstream'),'damaged known script is not missing');rmSync(scriptFile);
 reset();rmSync(scriptFile);r=apply();eq(r.status,0);ok(r.report.downstream.gates.some(g=>g.id==='script-coverage'&&g.reason==='missing-upstream'));
 reset();const batch=clone(script);batch.episodes=batch.episodes.slice(3);batch.provenance.scope='partial';json(scriptFile,batch);const creationBatch=clone(creation);creationBatch.episodes=creationBatch.episodes.slice(3);json(creationFile,creationBatch);r=apply();eq(r.status,0,'valid later batch is not mistaken for a complete series');
 reset();const stale=clone(script);stale.episodes[0].targetSeconds=100;json(scriptFile,stale);r=apply();eq(r.status,1,'changed script target invalidates existing creation');ok(r.report.downstream.gates.some(g=>g.stage==='creation'&&g.id==='target-duration'&&g.status==='fail'));
 // Missing opening markers must not be invented; current script text defines the end.
 reset();const noOpening=clone(script);noOpening.episodes.forEach(ep=>delete ep.openingBeat);const noMappedOpening=clone(creation);noMappedOpening.episodes.forEach(ep=>delete ep.openingBeat);json(scriptFile,noOpening);json(creationFile,noMappedOpening);r=apply();eq(r.status,0);
 noOpening.episodes[0].scenes[0].flow.push({action:'林蔚重新核对封存清单。',sourceRefs:clone(fixture.beats[0].sourceRefs)});json(scriptFile,noOpening);r=apply();eq(r.status,1,'appending current flow invalidates stale shot coverage');
 const appended=noMappedOpening.episodes[0].segments[0].cuts;appended.at(-1).beats[1]++;json(creationFile,noMappedOpening);r=apply();eq(r.status,0,'coverage follows calculated end, not stored endBeat');
 reset();const unclassified=clone(fixture);unclassified.beats.forEach(b=>{delete b.kind;delete b.weight;delete b.position;});json(docFile,unclassified);r=apply();eq(r.status,0,'unclassified B IDs are fully claimable');
 reset();json(join(scriptDir,'duplicate.json'),script);r=apply();eq(r.status,1,'ambiguous upstream is not arbitrarily selected');rmSync(join(scriptDir,'duplicate.json'));
 reset();const deleted=clone(fixture);deleted.beats.shift();json(docFile,deleted);r=apply();eq(r.status,1,'deleted outline node invalidates downstream claims');
 reset();const defaultTiming=clone(creation);delete defaultTiming.params.tolerance;json(creationFile,defaultTiming);r=apply();eq(r.status,0,'default tolerance is resolved without mutating JSON');
 for(const value of [null,'0.15',-1,1]){reset();const c=clone(creation);c.params.tolerance=value;json(creationFile,c);r=apply();eq(r.status,1,'invalid tolerance must not be defaulted');}

 // Explicit downstream verification actually opens each artifact-relative source.
 reset();const originalSource=readFileSync(join(root,'examples/旧站时刻-script.txt'));
 for(const dir of [outlineDir,scriptDir])writeFileSync(join(dir,fixture.provenance.documents[0].path),originalSource);
 let verified=run('checkup',docFile,'--downstream','--json','--verify-sources');eq(verified.status,0,verified.stderr);
 writeFileSync(join(scriptDir,fixture.provenance.documents[0].path),'changed downstream original');verified=run('checkup',docFile,'--downstream','--json','--verify-sources');eq(verified.status,1);ok(JSON.parse(verified.stdout).downstream.gates.some(g=>g.id==='source-evidence'&&g.status==='fail'));writeFileSync(join(scriptDir,fixture.provenance.documents[0].path),originalSource);
 // Parsing can omit targets; production cannot. Source changes invalidate downstream identity.
 reset();const untimed=clone(script);delete untimed.episodes[0].targetSeconds;json(scriptFile,untimed);r=apply();eq(r.status,1);ok(r.report.downstream.gates.some(g=>g.stage==='creation'&&g.id==='target-duration'&&g.status==='fail'));
 rmSync(creationFile);r=apply();eq(r.status,0,'parsing without target is valid');
 reset();const changed=clone(fixture);changed.provenance.documents[0].sha256='a'.repeat(64);json(docFile,changed);r=apply();eq(r.status,1);ok(r.report.downstream.gates.some(g=>g.id==='source-evidence'&&g.status==='fail'));
 // One actual line may continue through later cuts, across segments/scenes, not replay.
 reset();const audio=clone(script),ae=audio.episodes[0],refs=clone(fixture.beats[0].sourceRefs);
 ae.scenes=[{flow:[{line:'先查车，别追签名。',speaker:'C01',audio:{mode:'offscreen'},sourceRefs:refs},{action:'林蔚保留原页。',sourceRefs:refs}]},{flow:[{sound:'脚步声',audio:{mode:'offscreen'},seconds:1,sourceRefs:refs},{subtitle:'核查中',seconds:1,sourceRefs:refs}]}];
 ae.beatClaims[0].start=[1,1];ae.beatClaims[0].end=[1,1];ae.beatClaims[1].start=[1,2];ae.beatClaims[1].end=[1,2];
 const ac=clone(creation);ac.episodes[0].segments=[{sceneIndex:1,cuts:[{beats:[1,1],seconds:6}]},{sceneIndex:1,cuts:[{beats:[2,2],seconds:6,audioRefs:[[1,1]]}]},{sceneIndex:2,cuts:[{beats:[1,2],seconds:12,audioRefs:[[1,1]]}]}];
 json(scriptFile,audio);json(creationFile,ac);r=apply();eq(r.status,0,'cross-segment and cross-scene audio continuation: '+JSON.stringify(r.report.downstream.gates.filter(g=>g.status==='fail')));
 for(const mutate of [d=>d.episodes[0].segments[0].cuts[0].audioRefs=[[1,1]],d=>d.episodes[0].segments[0].cuts[0].audioRefs=[[1,2]],d=>d.episodes[0].segments[1].cuts[0].audioRefs=[[1,1],[1,1]],d=>d.episodes[0].segments[2].cuts[0].audioRefs=[[1,2]],d=>d.episodes[0].segments[2].cuts[0].audioRefs=[[99,1]],d=>d.episodes[0].segments[2].cuts[0].audioRefs='bad']){const c=clone(ac);mutate(c);json(creationFile,c);r=apply();eq(r.status,1);ok(r.report.downstream.gates.some(g=>g.id==='node-claims'&&g.status==='fail'));}
 json(creationFile,ac);for(const mutate of [d=>delete d.episodes[0].scenes[0].flow[0].sourceRefs,d=>d.episodes[0].scenes[0].flow[0].action='also action',d=>d.episodes[0].scenes[0].flow[0].speaker='',d=>d.episodes[0].scenes[0].flow[0].speaker='C99',d=>d.episodes[0].scenes[0].flow[0].transformation={reason:'x'},d=>d.episodes[0].scenes[0].flow[0].candidate='pending',d=>d.episodes[0].scenes[0].flow[1].audio={mode:'inner'},d=>d.episodes[0].scenes[1].flow[0].seconds=0,d=>d.episodes[0].scenes[0].notes=[{kind:'background',text:'秘密'}]]){const s=clone(audio);mutate(s);json(scriptFile,s);r=apply();eq(r.status,1);ok(r.report.downstream.gates.some(g=>g.id==='source-evidence'&&g.status==='fail'));}

 // Execute the actual generated inline script against a small DOM adapter, not copied event logic.
 const html=renderHtml(fixture),js=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 function dom(initialHash='') {
  const callbacks={},links=[],events={},scrolls=[];
  let clipped=true,button=true;
  const wrap={classList:{remove:k=>{eq(k,'clip');clipped=false;}}};
  const more={addEventListener:(k,fn)=>callbacks.more=fn,remove:()=>button=false};
  const cards=Object.fromEntries([...html.matchAll(/<article class="ep" id="(ep-\d+)"/g)].map(m=>[m[1],{scrollIntoView:opts=>{ok(!clipped,'target must be visible before scrolling');eq(opts.block,'start');scrolls.push(m[1]);}}]));
  for(const match of html.matchAll(/<a class="beat [^"]*" href="([^"]+)"/g)) {
   const link={href:match[1],getAttribute:k=>{eq(k,'href');return link.href;},addEventListener:(k,fn)=>link[k]=fn};links.push(link);
  }
  const document={querySelectorAll:s=>s==='.beat'?links:[],querySelector:s=>s==='.epswrap'?wrap:s==='.epsmore'?(button?more:null):{addEventListener:()=>{}},getElementById:id=>cards[id]??null};
  const window={location:{hash:initialHash},addEventListener:(k,fn)=>events[k]=fn};
  runInNewContext(js,{document,window});
  return {links,events,window,scrolls,clipped:()=>clipped,button:()=>button};
 }
 for(const ep of [4,6]) {
  let d=dom();ok(d.clipped());const link=d.links.find(l=>l.href===`#ep-${ep}`);ok(link,'real timeline link exists');link.click();ok(!d.clipped());ok(!d.button());eq(d.scrolls.at(-1),`ep-${ep}`);
  link.click();eq(d.scrolls.length,2,'same hash click still locates');
  d=dom(`#ep-${ep}`);ok(!d.clipped());eq(d.scrolls.at(-1),`ep-${ep}`,'initial URL hash locates folded episode');
  d=dom();d.window.location.hash=`#ep-${ep}`;d.events.hashchange();ok(!d.clipped());eq(d.scrolls.at(-1),`ep-${ep}`,'history/hashchange locates');
 }
 for(const hash of ['#ep-999','#sec-story','#ep-6\"']){const d=dom(hash);ok(d.clipped());eq(d.scrolls,[]);}
 console.log(`✓ ${count} assertions passed: v4 actual CLI, downstream invalidation and generated report DOM.`);
} finally {rmSync(tmp,{recursive:true,force:true});}
