#!/usr/bin/env node
// Contracts, reports, CLI, corruption and standalone regression; no network or siblings.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,cpSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {checkup,validateOutline,gateReport,computeAssets,createSkeleton,newQuestion,chunkVolumes,detectChapters,MAX_VOLUMES,FALLBACK_CHUNK,FALLBACK_OVERLAP,slug,primarySceneCap,findProduction,loadProduction,autopilotOf,stageDirNote,renderHtml,renderMarkdown,fmtEps,SKILL_ROOT} from './mint-outline.mjs';
const HERE=dirname(fileURLToPath(import.meta.url)),CLI=join(HERE,'mint-outline.mjs');
const FIXTURE=JSON.parse(readFileSync(join(SKILL_ROOT,'examples/旧站时刻-outline.json'),'utf8'));
let count=0;
const ok=(v,m)=>{assert.ok(v,m);count++;},eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++;},throws=f=>{assert.throws(f);count++;};
const clone=x=>structuredClone(x??FIXTURE);
const gate=(d,id,options)=>checkup(d,options).gates.find(g=>g.id===id);
const bad=(fn,id='fields',stage='full')=>{const d=clone();fn(d);eq(gate(d,id,{stage}).status,'fail',id+' rejects malformed input');};
const good=d=>eq(validateOutline(d),[]);
const tmp=mkdtempSync(join(tmpdir(),'outline-v3-selftest-'));
const json=(p,d)=>writeFileSync(p,JSON.stringify(d,null,2)+'\n');
const run=(...args)=>spawnSync(process.execPath,[CLI,...args],{encoding:'utf8',timeout:20000,maxBuffer:8*1024*1024});
try {
 good(FIXTURE);const before=JSON.stringify(FIXTURE);
 for(const stage of ['skeleton','beats','full'])eq(validateOutline(FIXTURE,stage),[]);
 eq(JSON.stringify(FIXTURE),before);ok(!('ok' in gateReport(FIXTURE)[0]));eq(checkup(FIXTURE).contentReview,'not-performed');
 const skeleton=clone();delete skeleton.beats;delete skeleton.episodes;delete skeleton.story.endingBeatId;
 eq(validateOutline(skeleton,'skeleton'),[]);eq(checkup(skeleton,{stage:'skeleton'}).complete,false);
 eq(gate(skeleton,'beats',{stage:'skeleton'}).reason,'stage-incomplete');ok(validateOutline(skeleton,'beats').length);ok(validateOutline(skeleton).length);
 const beats=clone();delete beats.episodes;eq(validateOutline(beats,'beats'),[]);eq(gate(beats,'questions',{stage:'beats'}).reason,'stage-incomplete');
 const empty=createSkeleton({source:'测试',episodes:3,minutesPerEpisode:2,genre:'生活'});
 eq(createSkeleton({creativeBrief:'明确创作要求',lang:'en'}).creativeBrief,'明确创作要求');eq(createSkeleton({lang:'en'}).lang,'en');
 eq(empty.schemaVersion,3);ok(!('rules' in empty.params));ok(!('adaptation' in empty));ok(validateOutline(empty,'skeleton').length);
 const minimal=clone();delete minimal.adaptation;delete minimal.story.audiencePromise;delete minimal.arcs;delete minimal.props;delete minimal.creativeBrief;delete minimal.params.thresholds;
 for(const c of minimal.characters){delete c.from;delete c.arc;}
 for(const b of minimal.beats){delete b.kind;delete b.position;delete b.weight;delete b.resolves;}
 for(const e of minimal.episodes){delete e.ending.question;delete e.propIds;}
 good(minimal);eq(minimal.episodes[0].ending.mode,'suspense');
 const positioning=clone(minimal);positioning.beats[0].position='ending';positioning.beats[1].position='opening';good(positioning);
 const weightless=clone();delete weightless.beats[5].weight;good(weightless);
 // Corrupted nested values must produce gates/reports, not throw or silently repair.
 for(const field of ['characters','scenes','props','beats','episodes','arcs'])for(const value of [null,1,'damaged',[]]){
  const d=clone();d[field][0]=value;ok(checkup(d).stats.fail>0,field+' corrupted row');renderHtml(d);renderMarkdown(d);
 }
 const combined=clone();combined.beats=[null];combined.arcs=[null];ok(checkup(combined).stats.fail>0);renderHtml(combined);
 for(const stage of ['skeleton','beats']){bad(d=>d.episodes[0].stateChange={},'fields',stage);}
 bad(d=>d.beats[0].type='removed','fields','skeleton');
 const noReason=clone();delete noReason.episodes[5].ending.question.reason;good(noReason);
 const q={id:'Q10',text:'测试',resolution:'required'};eq(newQuestion(q,1,{episodes:6,defaults:{questionResolveWithin:2}}),q);ok(newQuestion(q)!==q);
 for(const v of [undefined,1,2,999,'3',null])bad(d=>d.schemaVersion=v);
 for(const v of [0,-1,1.2,'6',null,Infinity,NaN])bad(d=>d.params.episodes=v);
 for(const v of [0,-1,'3',null,Infinity,NaN])bad(d=>d.params.minutesPerEpisode=v);
 for(const v of [null,[],42])bad(d=>d.params=v);
 bad(d=>d.source='');bad(d=>d.lang='fr');bad(d=>d.params.genre='');bad(d=>d.params.adaptMode='auto');
 for(const k of ['preferences','rules','defaults','pacing','maxBeatGap','hookWindow','maxLineChars','minCutSeconds','maxCutSeconds'])bad(d=>d.params[k]={});
 for(const k of ['creative','creativeContext','selection','decisions','overrides','assets','crowdPlan'])bad(d=>d[k]={});
 for(const v of ['',null,[],1,'   '])bad(d=>d.creativeBrief=v);
 bad(d=>d.params.thresholds.maxBeatGap=99);bad(d=>d.params.thresholds.maxLeads='3');bad(d=>d.params.thresholds.maxProps=0);bad(d=>d.params.thresholds=[]);
 eq(primarySceneCap(6),5);eq(primarySceneCap(60),10);eq(primarySceneCap(300),15);eq(primarySceneCap(),8);
 for(const [key,id] of [['maxLeads','lead-cap'],['maxPrimaryScenes','scene-cap'],['maxProps','prop-cap']])bad(d=>d.params.thresholds[key]=1,id);
 for(const [tier,id] of [['support','support-cap'],['functional','functional-cap']]){
  const d=clone();d.characters.forEach(c=>c.tier=tier);d.params.thresholds[tier==='support'?'maxSupport':'maxFunctional']=1;eq(gate(d,id).status,'fail');
 }
 const budget=clone(minimal);for(let i=5;i<=7;i++){budget.characters.push({id:'C0'+i,name:'工作人员'+i,tier:'lead',role:'轮值'});budget.episodes[0].characterIds.push('C0'+i);}
 good(budget);eq(gate(budget,'lead-cap').level,'warn');eq(checkup(budget).stats.warn,0); // five leads exactly
 budget.characters.push({id:'C08',name:'工作人员8',tier:'lead',role:'轮值'});budget.episodes[0].characterIds.push('C08');good(budget);ok(checkup(budget).stats.warn>0);
 budget.params.thresholds={maxLeads:5};ok(validateOutline(budget).length);delete budget.params.thresholds;
 const noLead=clone();noLead.characters.forEach(c=>c.tier='support');good(noLead);
 for(const k of ['premise','throughline','audiencePromise','ending'])bad(d=>d.story[k]='','story');
 for(const ids of [[],['C99'],['C01','C01'],'C01'])bad(d=>d.story.focusCharacterIds=ids,'story');
 bad(d=>d.story.drive={},'story');bad(d=>d.story.endingBeatId='B01','ending-beat');bad(d=>d.story.endingBeatId='B99','ending-beat');
 bad(d=>d.adaptation=null,'adaptation');bad(d=>d.adaptation.core='legacy','adaptation');bad(d=>d.adaptation.keep=[{what:'x'}],'adaptation');bad(d=>d.adaptation.risks=[{what:'x',plan:''}],'adaptation');bad(d=>d.adaptation.cutNote='','adaptation');bad(d=>d.adaptation.keep[0].evidence='','adaptation');
 const adapted=clone();adapted.params.adaptMode='抽核';adapted.adaptation.keep[0].evidence='原文\n逐字证据';good(adapted);ok(renderMarkdown(adapted).includes('逐字证据'));
 for(const [field,prefix] of [['characters','C'],['scenes','S'],['props','P']]){
  bad(d=>d[field][0].id='X1','assets');bad(d=>d[field][1].id=d[field][0].id,'assets');bad(d=>d[field]=null,'assets');
  const d=clone();d[field][0].id=prefix+'100';ok(!gate(d,'assets').messages.some(m=>m.includes('IDs')));
 }
 bad(d=>d.characters[0].from=[''],'assets');bad(d=>d.characters[0].arc='','assets');bad(d=>d.characters[0].tier='unknown','assets');bad(d=>delete d.scenes[0].primary,'assets');bad(d=>d.scenes[0].reusePlan='','assets');bad(d=>delete d.props[0].function,'assets');bad(d=>d.props[0].beatIds=['B01','B01'],'assets');bad(d=>d.props[0].beatIds=['B99'],'prop-beats');
 const propEvent=clone();propEvent.props[0].beatIds=['B01'];good(propEvent);
 const noProps=clone();delete noProps.props;noProps.episodes.forEach(e=>delete e.propIds);good(noProps);eq(gate(noProps,'prop-cap').reason,'not-applicable');
 for(const fn of [d=>d.beats=[],d=>d.beats[0].id='x',d=>d.beats[1].id='B01',d=>d.beats[0].episode=99,d=>d.beats[0].episode=0,d=>d.beats[0].position='center',d=>d.beats[0].kind='win',d=>d.beats[0].type='old',d=>d.beats[0].outcome='',d=>d.beats[0].setup='',d=>d.beats[0].weight='minor',d=>d.beats[5].weight='super',d=>d.beats[0].payoff='legacy',d=>d.beats.reverse(),d=>d.beats[0].resolves='Q01'])bad(fn,'beats');
 for(const fn of [d=>d.episodes.pop(),d=>d.episodes[0].ep=2,d=>d.episodes[0].opening='',d=>d.episodes[0].synopsis='',d=>d.episodes[0].ending.mode='win',d=>d.episodes[0].ending.event='',d=>d.episodes[0].ending.extra=1,d=>d.episodes[0].stateChange={},d=>d.episodes[0].warnings='rain',d=>d.episodes[0].sceneIds=[],d=>d.episodes[0].characterIds=['C01','C01'],d=>d.episodes[0].propIds='P01'])bad(fn,'episodes');
 for(const k of ['hook','suspense','crowdPlan','beatIds'])bad(d=>d.episodes[0][k]='legacy','episodes');
 for(const [field,id] of [['sceneIds','S99'],['characterIds','C99'],['propIds','P99']])bad(d=>d.episodes[0][field]=[id],'references');
 bad(d=>d.episodes.forEach(e=>e.characterIds=e.characterIds.filter(x=>x!=='C03')),'references');
 for(const fn of [d=>d.episodes[1].ending.question=null,d=>d.episodes[0].ending.question.id='x',d=>d.episodes[2].ending.question.id='Q01',d=>delete d.episodes[0].ending.question.text,d=>d.episodes[0].ending.question.resolution='later',d=>d.episodes[0].ending.question.extra=1,d=>d.episodes[0].ending.question.reason=42,d=>d.episodes[0].ending.question.dueByEp=1,d=>d.episodes[0].ending.question.dueByEp=7,d=>d.episodes[0].ending.question.dueByEp=2.5,d=>d.episodes[5].ending.question.dueByEp=6,d=>d.episodes[5].ending.question.resolution='required',d=>d.beats[2].resolves=[],d=>d.beats[2].resolves=['Q99'],d=>d.beats[3].resolves=['Q01'],d=>{d.beats[0].resolves=['Q01'];d.beats[2].resolves=[];},d=>{d.episodes[0].ending.question.dueByEp=2;d.beats[2].resolves=[];d.beats[3].resolves=['Q01'];}])bad(fn,'questions');
 const optional=clone();optional.episodes[0].ending.question.resolution='optional';delete optional.episodes[0].ending.question.dueByEp;optional.beats[2].resolves=[];good(optional);optional.beats[2].resolves=['Q01'];good(optional);optional.beats[3].resolves=['Q01'];eq(gate(optional,'questions').status,'fail');
 for(const fn of [d=>d.arcs='x',d=>d.arcs[0].id='X01',d=>d.arcs[0].startEp=0,d=>d.arcs[0].endEp=7,d=>d.arcs[0].startEp=5,d=>d.arcs[0].endBeatId='B01',d=>d.arcs[0].goal='',d=>d.arcs.push({...d.arcs[0],id:'A02'})])bad(fn,'arcs');
 const noArcs=clone();delete noArcs.arcs;good(noArcs);noArcs.arcs=[];good(noArcs);
 for(const [description,status] of [['苏雨晴在室内核对记录。','pass'],['雨棚下的桌子已经收好。','pass'],['苏雨晴走进大雨里。','fail']]){
  const d=clone();for(const e of d.episodes){e.synopsis=description;e.opening=description;e.ending.event=description;e.warnings=[];}eq(gate(d,'risk-scan').status,status);
 }
 const assets=computeAssets(FIXTURE);eq(assets.characters[0].episodes,[1,2,3,4,5,6]);eq(assets.scenes[2].uses,1);eq(assets.props[0].beatIds,FIXTURE.props[0].beatIds);eq(assets.castPlan[0].count,2);eq(computeAssets(noProps).props,[]);
 eq(fmtEps([1,2,3]),'1–3');eq(fmtEps([1,6]),'1 · 6');eq(fmtEps([]),'—');
 for(const lang of ['zh','en']){
  const html=renderHtml(FIXTURE,lang),md=renderMarkdown(FIXTURE,lang);ok(html.startsWith('<!doctype html>'));ok(html.includes('<html lang="'+lang+'">'));ok(md.startsWith('# 旧站时刻'));
  for(const id of ['story','beats','arcs','episodes','characters','scenes','props','matrix','plan','adaptation','budget','checks','review'])ok(html.includes('id="sec-'+id+'"'));
  ok(html.indexOf('id="sec-episodes"')<html.indexOf('id="sec-beats"'));ok(html.indexOf('id="sec-budget"')<html.indexOf('id="sec-checks"'));
  ok(!html.includes('id="sec-config"'));eq((html.match(/class="ep"/g)||[]).length,6);ok(html.includes('epswrap clip'));ok(html.includes('p.id===btn.dataset.pane'));ok(html.includes("classList.remove('clip')"));ok(html.includes('@media print'));ok(html.includes('prefers-reduced-motion'));ok(html.includes('minmax(min(100%,360px),1fr)'));ok(!/<script\s+src=|<link\s|@import|url\(https?:/.test(html));
  eq(JSON.parse(html.match(/id="outline-data">([\s\S]*?)<\/script>/)[1]),FIXTURE);ok(html.includes('revokeObjectURL(url),10000'));ok(html.includes(lang==='en'?'Content review not performed':'内容评审未执行'));ok(html.includes(lang==='en'?'Missing upstream':'缺少上游'));
  const small=renderHtml(minimal,lang);for(const id of ['arcs','adaptation','props','keep','cut','merge','risks'])ok(!small.includes('id="sec-'+id+'"'));ok(small.includes(lang==='en'?'Tool reference':'工具参考值'));ok(html.includes(lang==='en'?'User budget':'用户预算'));renderMarkdown(minimal,lang);
 }
 ok(!renderHtml(FIXTURE,'en').includes('导出 JSON'));throws(()=>renderHtml(FIXTURE,'fr'));
 const hostile=clone();hostile.story.premise='</script><img src=x onerror=alert(1)>';hostile.source='<script>alert(1)</script>';
 const html=renderHtml(hostile);ok(!html.includes('<img src=x'));ok(html.includes('&lt;img'));eq(JSON.parse(html.match(/id="outline-data">([\s\S]*?)<\/script>/)[1]),hostile);ok(!renderMarkdown(hostile).includes('<script>'));
 const special=clone();special.episodes[0].warnings=['constructor','__proto__'];eq(computeAssets(special).warnings.constructor,[1]);ok(renderHtml(special).includes('__proto__'));
 const broken=clone();broken.story.endingBeatId='B99';ok(renderHtml(broken).includes('阻断失败'));ok(renderMarkdown(broken).includes('endingBeatId'));ok(renderHtml(skeleton,'zh',{stage:'skeleton'}).includes('阶段尚未完成'));eq(JSON.stringify(FIXTURE),before);
 const book=Array.from({length:30},(_,i)=>`第${i+1}章 标题\n正文${i}`).join('\n');eq(detectChapters(book).length,30);eq(chunkVolumes(book,10).volumes.length,3);eq(chunkVolumes(book,10).truncated,false);eq(chunkVolumes('').volumes,[]);eq(detectChapters('楔子\n文字\nChapter 2 Title\ntext').length,2);
 const size=chunkVolumes('X'.repeat(45000));eq(size.mode,'size');eq(size.volumes.length,3);eq(size.truncated,false);
 const edge=FALLBACK_CHUNK+(MAX_VOLUMES-1)*(FALLBACK_CHUNK-FALLBACK_OVERLAP);eq(chunkVolumes('X'.repeat(edge)).truncated,false);eq(chunkVolumes('X'.repeat(edge+1)).truncated,true);eq(chunkVolumes(Array.from({length:MAX_VOLUMES+1},(_,i)=>`第${i+1}章\n正文`).join('\n'),1).truncated,true);for(const v of [0,-1,1.2,NaN])throws(()=>chunkVolumes(book,v));eq(slug('a/b:c'),'a-b-c');eq(slug('旧站时刻'),'旧站时刻');
 const project=join(tmp,'project'),outlineDir=join(project,'outline');mkdirSync(outlineDir,{recursive:true});const docFile=join(outlineDir,'outline.json'),prodFile=join(project,'production.json');const projectDoc=clone();delete projectDoc.creativeBrief;json(docFile,projectDoc);
 eq(findProduction(outlineDir,0),null);json(prodFile,{schemaVersion:3,creativeBrief:FIXTURE.creativeBrief,lang:'en'});eq(findProduction(outlineDir),prodFile);eq(stageDirNote(docFile,prodFile),null);ok(stageDirNote(join(project,'wrong.json'),prodFile));eq(stageDirNote(docFile,null),null);eq(run('validate',docFile).status,0);eq(run('checkup',docFile,'--json').status,0);
 projectDoc.lang=undefined;json(docFile,projectDoc);ok(run('render',docFile,'--html').stdout.includes('lang="en"'));ok(run('render',docFile,'--html','--lang','zh').stdout.includes('lang="zh"'));
 for(const prod of [{},{schemaVersion:2},{schemaVersion:3,creative:{}},{schemaVersion:3,creativeBrief:''},null]){json(prodFile,prod);eq(run('validate',docFile).status,1);eq(run('render',docFile,'--html').status,1);}
 json(prodFile,{schemaVersion:3,creativeBrief:'项目要求'});json(docFile,FIXTURE);eq(run('validate',docFile).status,1);json(docFile,projectDoc);
 writeFileSync(prodFile,'{broken');ok(loadProduction(docFile).productionError);eq(run('validate',docFile).status,1);eq(run('render',docFile,'--html').status,1);ok(!checkup(projectDoc,{productionError:'broken'}).gates.some(g=>g.reason==='missing-upstream'));
 rmSync(prodFile);eq(run('validate',docFile).status,0);eq(run('validate',docFile,'--production',prodFile).status,1);
 json(docFile,budget);eq(run('validate',docFile).status,0);budget.params.thresholds={maxLeads:5};json(docFile,budget);eq(run('validate',docFile).status,1);eq(run('checkup',docFile).status,1);eq(run('render',docFile,'--html').status,1);eq(run('validate',docFile,'--stage','unknown').status,1);
 for(const v of [false,'true','false',1,null])eq(autopilotOf({autopilot:v}),false);eq(autopilotOf({autopilot:true}),true);
 for(const cmd of ['profiles','profile','apply-profile','migrate'])eq(run(cmd).status,1);
 for(const args of [['validate',docFile,'--unknown'],['checkup',docFile,'extra'],['render',docFile,'--html','--md'],['validate',docFile,'--stage','full','--stage','full']])eq(run(...args).status,1);
 // Guide edits are not data identity changes and never invalidate existing documents.
 const isolated=join(tmp,'isolated');cpSync(SKILL_ROOT,isolated,{recursive:true});writeFileSync(join(isolated,'references/创作指南.md'),'# 独立创作指南\n');
 const standalone=spawnSync(process.execPath,[join(isolated,'scripts/mint-outline.mjs'),'validate',join(isolated,'examples/旧站时刻-outline.json')],{cwd:isolated,encoding:'utf8',timeout:20000});eq(standalone.status,0,standalone.stderr+standalone.stdout);
 for(const entry of ['fixes-selftest.mjs','migration-selftest.mjs']){const r=spawnSync(process.execPath,[join(HERE,entry)],{cwd:SKILL_ROOT,encoding:'utf8',timeout:60000});eq(r.status,0,r.stderr+r.stdout);}
 if(!process.env.OUTLINE_SELFTEST_COPIED){const r=spawnSync(process.execPath,[join(isolated,'scripts/selftest.mjs')],{cwd:isolated,env:{...process.env,OUTLINE_SELFTEST_COPIED:'1'},encoding:'utf8',timeout:120000});eq(r.status,0,r.stderr+r.stdout);}
 for(const name of ['SKILL.md','README.md','README.en.md','references/schema.md','references/创作指南.md','references/migration.md']){const file=join(SKILL_ROOT,name),body=readFileSync(file,'utf8');for(const m of body.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g))if(!/^https?:/.test(m[1]))ok(existsSync(resolve(dirname(file),m[1])),'local link '+name+' -> '+m[1]);}
 console.log(`✓ ${count} assertions passed: outline v3 structure, optional fields, references, budgets, reports, CLI, migration and standalone copy.`);
} finally {rmSync(tmp,{recursive:true,force:true});}
