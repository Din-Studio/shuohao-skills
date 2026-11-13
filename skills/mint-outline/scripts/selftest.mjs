#!/usr/bin/env node
// v4 contracts, reports, actual CLI, corruption and isolated-copy regression.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,cpSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {checkup,validateOutline,gateReport,computeAssets,createSkeleton,newQuestion,slug,primarySceneCap,findProduction,loadProduction,autopilotOf,stageDirNote,renderHtml,renderMarkdown,fmtEps,SKILL_ROOT} from './mint-outline.mjs';
const HERE=dirname(fileURLToPath(import.meta.url)),CLI=join(HERE,'mint-outline.mjs'),sample=join(SKILL_ROOT,'examples/旧站时刻-outline.json');
const FIXTURE=JSON.parse(readFileSync(sample,'utf8'));
let count=0;
const ok=(v,m)=>{assert.ok(v,m);count++;},eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++;},throws=f=>{assert.throws(f);count++;};
const clone=x=>structuredClone(x??FIXTURE),gate=(d,id,options)=>checkup(d,options).gates.find(g=>g.id===id);
const bad=(fn,id='fields',stage='full')=>{const d=clone();fn(d);eq(gate(d,id,{stage}).status,'fail',id+' rejects malformed input');};
const good=d=>eq(validateOutline(d),[]);
const tmp=mkdtempSync(join(tmpdir(),'outline-v4-selftest-')),json=(p,d)=>writeFileSync(p,JSON.stringify(d,null,2)+'\n');
const run=(...args)=>spawnSync(process.execPath,[CLI,...args],{encoding:'utf8',timeout:20000,maxBuffer:8*1024*1024});
try{
 good(FIXTURE);const before=JSON.stringify(FIXTURE);
 for(const stage of ['skeleton','beats','full'])eq(validateOutline(FIXTURE,stage),[]);
 eq(checkup(FIXTURE).contentReview,'not-performed');eq(checkup(FIXTURE).sourceVerification,'skipped');
 eq(checkup(FIXTURE,{verifySources:true,artifactPath:sample}).sourceVerification,'pass');
 ok(!('ok' in gateReport(FIXTURE)[0]));eq(JSON.stringify(FIXTURE),before);
 const skeleton=clone();delete skeleton.beats;delete skeleton.episodes;delete skeleton.story.endingBeatId;
 eq(validateOutline(skeleton,'skeleton'),[]);eq(checkup(skeleton,{stage:'skeleton'}).complete,false);eq(gate(skeleton,'beats',{stage:'skeleton'}).reason,'stage-incomplete');ok(validateOutline(skeleton).length);
 const beats=clone();delete beats.episodes;eq(validateOutline(beats,'beats'),[]);eq(gate(beats,'questions',{stage:'beats'}).reason,'stage-incomplete');
 const empty=createSkeleton({source:'测试',genre:'生活',creativeBrief:'明确要求',lang:'en'});eq(empty.schemaVersion,4);ok(!('provenance' in empty));ok(!('minutesPerEpisode' in empty.params));eq(empty.lang,'en');ok(validateOutline(empty,'skeleton').length);
 const minimal=clone();delete minimal.params;delete minimal.props;delete minimal.creativeBrief;delete minimal.story.focusCharacterIds;delete minimal.story.endingBeatId;
 for(const c of minimal.characters){delete c.arc;delete c.from;delete c.presence;}
 for(const b of minimal.beats)delete b.resolves;
 for(const e of minimal.episodes){delete e.ending;delete e.opening;delete e.propIds;delete e.notes;}
 good(minimal);eq(computeAssets(minimal).props,[]);
 const q={id:'Q10',text:'未知',sourceRefs:clone(FIXTURE.episodes[0].sourceRefs)};eq(newQuestion(q),q);ok(newQuestion(q)!==q);
 for(const v of [undefined,1,2,3,999,'4',null])bad(d=>d.schemaVersion=v);
 for(const v of [null,[],42])bad(d=>d.params=v);
 bad(d=>d.source='');bad(d=>d.lang='fr');bad(d=>d.params.genre='');
 for(const k of ['episodes','minutesPerEpisode','adaptMode','preferences','rules','defaults','pacing','maxBeatGap','hookWindow','maxLineChars','minCutSeconds','maxCutSeconds'])bad(d=>d.params[k]={});
 for(const k of ['creative','creativeContext','selection','decisions','overrides','assets','crowdPlan','adaptation','arcs'])bad(d=>d[k]={});
 for(const v of ['',null,[],1,'   '])bad(d=>d.creativeBrief=v);
 bad(d=>d.params.thresholds.maxBeatGap=99);bad(d=>d.params.thresholds.maxLeads='3');bad(d=>d.params.thresholds.maxProps=0);bad(d=>d.params.thresholds=[]);
 for(const stage of ['skeleton','beats','full']){
  for(const k of ['stateChange','hook','suspense','crowdPlan','beatIds'])bad(d=>d.episodes[0][k]={},'fields',stage);
  for(const k of ['position','kind','weight','type','payoff'])bad(d=>d.beats[0][k]='old','fields',stage);
  for(const k of ['resolution','dueByEp'])bad(d=>d.episodes[0].ending.question[k]='old','fields',stage);
  bad(d=>d.scenes[0].reusePlan='old','fields',stage);
 }
 eq(primarySceneCap(6),5);eq(primarySceneCap(60),10);eq(primarySceneCap(300),15);eq(primarySceneCap(),8);
 for(const [key,id] of [['maxLeads','lead-cap'],['maxPrimaryScenes','scene-cap'],['maxProps','prop-cap']])bad(d=>d.params.thresholds[key]=1,id);
 for(const [tier,id]of [['support','support-cap'],['functional','functional-cap']]){const d=clone();d.characters.forEach(c=>c.tier=tier);d.params.thresholds[tier==='support'?'maxSupport':'maxFunctional']=1;eq(gate(d,id).status,'fail');}
 const budget=clone(minimal);for(let i=5;i<=8;i++){budget.characters.push({id:'C0'+i,name:'工作人员'+i,tier:'lead',role:'轮值',sourceRefs:clone(FIXTURE.characters[0].sourceRefs)});budget.episodes[0].characterIds.push('C0'+i);}
 good(budget);ok(checkup(budget).stats.warn>0);eq(gate(budget,'lead-cap').level,'warn');budget.params={thresholds:{maxLeads:5}};ok(validateOutline(budget).length);delete budget.params;
 const noLead=clone();noLead.characters.forEach(c=>c.tier='support');good(noLead);
 bad(d=>d.story.summary='','story');bad(d=>delete d.story.sourceRefs,'story');
 for(const k of ['premise','throughline','ending','audiencePromise','drive'])bad(d=>d.story[k]='legacy','story');
 for(const ids of [['C99'],['C01','C01'],'C01'])bad(d=>d.story.focusCharacterIds=ids,'story');
 bad(d=>d.story.endingBeatId='B01','ending-beat');bad(d=>d.story.endingBeatId='B99','ending-beat');
 for(const [field,prefix]of [['characters','C'],['scenes','S'],['props','P']]){
  bad(d=>d[field][0].id='X1','assets');bad(d=>d[field][1].id=d[field][0].id,'assets');bad(d=>d[field]=null,'assets');bad(d=>delete d[field][0].sourceRefs,'assets');
  const d=clone();d[field][0].id=prefix+'100';ok(!gate(d,'assets').messages.some(m=>m.includes('IDs')));
 }
 for(const fn of [d=>d.characters[0].tier='x',d=>d.characters[0].from=[''],d=>d.characters[0].arc='',d=>d.characters[0].presence='silent',d=>delete d.scenes[0].primary,d=>delete d.props[0].function,d=>d.props[0].beatIds=['B01','B01'],d=>d.characters[0].aliases=[{name:'别名'}]])bad(fn,'assets');
 bad(d=>d.props[0].beatIds=['B99'],'prop-beats');
 for(const fn of [d=>d.beats=null,d=>d.beats[0].id='x',d=>d.beats[1].id='B01',d=>d.beats[0].episode=99,d=>d.beats[0].episode=0,d=>d.beats[0].outcome='',d=>d.beats[0].setup='',d=>d.beats.reverse(),d=>d.beats[0].resolves='Q01',d=>delete d.beats[0].sourceRefs])bad(fn,'beats');
 for(const fn of [d=>d.episodes=[],d=>d.episodes[0].ep=2,d=>d.episodes[0].opening='',d=>d.episodes[0].synopsis='',d=>d.episodes[0].ending.mode='win',d=>d.episodes[0].ending.event='',d=>d.episodes[0].ending.extra=1,d=>d.episodes[0].warnings='rain',d=>d.episodes[0].characterIds=['C01','C01'],d=>d.episodes[0].propIds='P01',d=>delete d.episodes[0].sourceRefs,d=>d.episodes[3].notes[0].kind='dialogue',d=>d.episodes[3].notes[0].characterIds=['C99'],d=>d.episodes[3].notes[0].epistemic='belief',d=>d.episodes[3].notes[0].candidate='pending',d=>delete d.episodes[3].notes[0].sourceRefs])bad(fn,'episodes');
 for(const [key,id]of [['sceneIds','S99'],['characterIds','C99'],['propIds','P99']])bad(d=>d.episodes[0][key]=[id],'references');
 bad(d=>d.episodes.forEach(e=>e.characterIds=e.characterIds.filter(x=>x!=='C03')),'references');
 for(const fn of [d=>d.episodes[0].ending.question=null,d=>d.episodes[0].ending.question.id='x',d=>d.episodes[2].ending.question.id='Q01',d=>delete d.episodes[0].ending.question.text,d=>d.episodes[0].ending.question.extra=1,d=>d.episodes[0].ending.question.reason=42,d=>delete d.episodes[0].ending.question.sourceRefs,d=>d.beats[2].resolves=['Q99'],d=>d.beats[3].resolves=['Q01'],d=>{d.beats[0].resolves=['Q01'];delete d.beats[2].resolves;}])bad(fn,'questions');
 const unanswered=clone();unanswered.beats.forEach(b=>delete b.resolves);good(unanswered);eq(unanswered.episodes[0].ending.question.id,'Q01');
 for(const field of ['characters','scenes','props','beats','episodes'])for(const value of [null,1,'damaged',[]]){const d=clone();d[field][0]=value;ok(checkup(d).stats.fail>0);renderHtml(d);renderMarkdown(d);}
 for(const value of [null,[],42]){ok(checkup(value).stats.fail>0);renderHtml(value);}
 for(const [description,status]of [['苏雨晴在室内核对记录。','pass'],['雨棚下的桌子已经收好。','pass'],['苏雨晴走进大雨里。','fail']]){const d=clone();for(const e of d.episodes){e.synopsis=description;e.opening=description;e.ending.event=description;e.warnings=[];}eq(gate(d,'risk-scan').status,status);}
 const assets=computeAssets(FIXTURE);eq(assets.characters[0].episodes,[1,2,3,4,5,6]);eq(assets.scenes[2].uses,1);eq(assets.props[0].beatIds,FIXTURE.props[0].beatIds);eq(assets.castPlan[0].count,2);
 eq(fmtEps([1,2,3]),'1–3');eq(fmtEps([1,6]),'1 · 6');eq(fmtEps([]),'—');
 for(const lang of ['zh','en']){
  const html=renderHtml(FIXTURE,lang),md=renderMarkdown(FIXTURE,lang);ok(html.startsWith('<!doctype html>'));ok(html.includes('<html lang="'+lang+'">'));ok(md.startsWith('# 旧站时刻'));
  for(const id of ['story','episodes','beats','provenance','notes','characters','scenes','props','matrix','plan','budget','checks','review'])ok(html.includes('id="sec-'+id+'"'));
  for(const id of ['arcs','adaptation','config'])ok(!html.includes('id="sec-'+id+'"'));
  ok(html.indexOf('id="sec-episodes"')<html.indexOf('id="sec-beats"'));eq((html.match(/class="ep"/g)||[]).length,6);ok(html.includes('epswrap clip'));ok(html.includes('@media print'));ok(html.includes('prefers-reduced-motion'));ok(!/<script\s+src=|<link\s|@import|url\(https?:/.test(html));
  eq(JSON.parse(html.match(/id="outline-data">([\s\S]*?)<\/script>/)[1]),FIXTURE);ok(html.includes(lang==='en'?'Content review not performed':'内容评审未执行'));ok(html.includes(lang==='en'?'Missing upstream':'缺少上游'));ok(html.includes('不增加内心独白'));
  const small=renderHtml(minimal,lang);ok(!small.includes('id="sec-notes"'));ok(small.includes(lang==='en'?'Tool reference':'工具参考值'));ok(html.includes(lang==='en'?'User budget':'用户预算'));renderMarkdown(minimal,lang);
 }
 throws(()=>renderHtml(FIXTURE,'fr'));const hostile=clone();hostile.story.summary='</script><img src=x onerror=alert(1)>';hostile.source='<script>alert(1)</script>';
 const html=renderHtml(hostile);ok(!html.includes('<img src=x'));ok(html.includes('&lt;img'));eq(JSON.parse(html.match(/id="outline-data">([\s\S]*?)<\/script>/)[1]),hostile);ok(!renderMarkdown(hostile).includes('<script>'));
 const special=clone();special.episodes[0].warnings=['constructor','__proto__'];eq(computeAssets(special).warnings.constructor,[1]);ok(renderHtml(special).includes('__proto__'));eq(JSON.stringify(FIXTURE),before);
 eq(slug('a/b:c'),'a-b-c');eq(slug('旧站时刻'),'旧站时刻');
 const project=join(tmp,'project'),outlineDir=join(project,'outline');mkdirSync(outlineDir,{recursive:true});const docFile=join(outlineDir,'outline.json'),prodFile=join(project,'production.json'),projectDoc=clone();delete projectDoc.creativeBrief;json(docFile,projectDoc);
 eq(findProduction(outlineDir,0),null);json(prodFile,{schemaVersion:3,creativeBrief:FIXTURE.creativeBrief,lang:'en'});eq(findProduction(outlineDir),prodFile);eq(stageDirNote(docFile,prodFile),null);ok(stageDirNote(join(project,'wrong.json'),prodFile));eq(stageDirNote(docFile,null),null);eq(run('validate',docFile).status,0);eq(run('checkup',docFile,'--json').status,0);
 delete projectDoc.lang;json(docFile,projectDoc);ok(run('render',docFile,'--html').stdout.includes('lang="en"'));ok(run('render',docFile,'--html','--lang','zh').stdout.includes('lang="zh"'));
 for(const prod of [{},{schemaVersion:2},{schemaVersion:3,creative:{}},{schemaVersion:3,creativeBrief:''},null]){json(prodFile,prod);eq(run('validate',docFile).status,1);eq(run('render',docFile,'--html').status,1);}
 json(prodFile,{schemaVersion:3,creativeBrief:'项目要求'});json(docFile,FIXTURE);eq(run('validate',docFile).status,1);json(docFile,projectDoc);
 writeFileSync(prodFile,'{broken');ok(loadProduction(docFile).productionError);eq(run('validate',docFile).status,1);eq(run('render',docFile,'--html').status,1);ok(!checkup(projectDoc,{productionError:'broken'}).gates.some(g=>g.reason==='missing-upstream'));
 rmSync(prodFile);eq(run('validate',docFile).status,0);eq(run('validate',docFile,'--production',prodFile).status,1);eq(run('validate',docFile,'--verify-sources').status,1,'relative source missing, never skipped');
 json(docFile,budget);eq(run('validate',docFile).status,0);budget.params={thresholds:{maxLeads:5}};json(docFile,budget);for(const cmd of ['validate','checkup','render'])eq(run(cmd,docFile).status,1);
 for(const v of [false,'true','false',1,null])eq(autopilotOf({autopilot:v}),false);eq(autopilotOf({autopilot:true}),true);
 for(const cmd of ['profiles','profile','apply-profile','migrate'])eq(run(cmd).status,1);
 for(const args of [['validate',docFile,'--unknown'],['checkup',docFile,'extra'],['render',docFile,'--html','--md'],['validate',docFile,'--stage','full','--stage','full'],['validate',docFile,'--stage','unknown']])eq(run(...args).status,1);
 eq(run('verify-sources',sample).status,0);eq(run('checkup',sample,'--json','--verify-sources').status,0);
 // Copy only this skill: no sibling runtime, fixture, source or guide dependencies.
 const isolated=join(tmp,'isolated');cpSync(SKILL_ROOT,isolated,{recursive:true});writeFileSync(join(isolated,'references/创作指南.md'),'# 独立解析指南\n');
 let result=spawnSync(process.execPath,[join(isolated,'scripts/mint-outline.mjs'),'validate',join(isolated,'examples/旧站时刻-outline.json'),'--verify-sources'],{cwd:isolated,encoding:'utf8',timeout:20000});eq(result.status,0,result.stderr+result.stdout);
 for(const entry of ['fixes-selftest.mjs','migration-selftest.mjs','fusion-selftest.mjs']){result=spawnSync(process.execPath,[join(HERE,entry)],{cwd:SKILL_ROOT,encoding:'utf8',timeout:60000});eq(result.status,0,result.stderr+result.stdout);console.log(result.stdout.trim());}
 if(!process.env.OUTLINE_SELFTEST_COPIED){result=spawnSync(process.execPath,[join(isolated,'scripts/selftest.mjs')],{cwd:isolated,env:{...process.env,OUTLINE_SELFTEST_COPIED:'1'},encoding:'utf8',timeout:120000});eq(result.status,0,result.stderr+result.stdout);}
 for(const name of ['SKILL.md','README.md','README.en.md','references/schema.md','references/创作指南.md','references/migration.md']){const file=join(SKILL_ROOT,name),body=readFileSync(file,'utf8');for(const m of body.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g))if(!/^https?:/.test(m[1]))ok(existsSync(resolve(dirname(file),m[1])),'local link '+name+' -> '+m[1]);}
 console.log(`✓ ${count} assertions passed: outline v4 contracts, references, budgets, reports, CLI and standalone copy.`);
}finally{rmSync(tmp,{recursive:true,force:true});}
