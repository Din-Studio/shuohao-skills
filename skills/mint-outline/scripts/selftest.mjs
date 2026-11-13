#!/usr/bin/env node
// Formal v5 only; closed story contract, CLI/reports and isolated-copy regression.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,cpSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import * as api from './mint-outline.mjs';
const {checkup,validateOutline,createSkeleton,newQuestion,renderHtml,renderMarkdown,SKILL_ROOT,findProduction,loadProduction,stageDirNote,autopilotOf,slug,fmtEps}=api;
const HERE=dirname(fileURLToPath(import.meta.url)),CLI=join(HERE,'mint-outline.mjs'),sample=join(SKILL_ROOT,'examples/旧站时刻-outline.json');
const fixture=JSON.parse(readFileSync(sample,'utf8')),clone=x=>structuredClone(x??fixture);
let count=0;
const ok=(v,m)=>{assert.ok(v,m);count++;},eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++;};
const bad=(mutate,stage='full')=>{const d=clone();mutate(d);ok(validateOutline(d,stage).length,'invalid input must block');};
const tmp=mkdtempSync(join(tmpdir(),'outline-v5-')),json=(p,d)=>writeFileSync(p,JSON.stringify(d,null,2)+'\n');
const run=(...args)=>spawnSync(process.execPath,[CLI,...args],{encoding:'utf8',timeout:20000,maxBuffer:12*1024*1024});
try {
 const before=JSON.stringify(fixture);
 for(const stage of ['skeleton','beats','full'])eq(validateOutline(fixture,stage),[]);
 eq(checkup(fixture).complete,true);eq(checkup(fixture).contentReview,'not-performed');eq(checkup(fixture).sourceVerification,'skipped');
 eq(checkup(fixture,{verifySources:true,artifactPath:sample}).sourceVerification,'pass');
 ok(!('thresholds' in checkup(fixture)));
 for(const name of ['computeAssets','thresholdsOf','DEFAULT_THRESHOLDS','primarySceneCap','CHARACTER_TIERS','TIER_ASSET_SPEC'])ok(!(name in api),'removed asset API '+name);
 const skeleton=clone();delete skeleton.beats;delete skeleton.episodes;delete skeleton.story.endingBeatId;
 eq(validateOutline(skeleton,'skeleton'),[]);eq(checkup(skeleton,{stage:'skeleton'}).complete,false);ok(validateOutline(skeleton).length);
 const beats=clone();delete beats.episodes;eq(validateOutline(beats,'beats'),[]);
 const fresh=createSkeleton({source:'新标题',genre:'生活',lang:'en'});eq(fresh.schemaVersion,5);ok(!('characters' in fresh));ok(!('provenance' in fresh));ok(validateOutline(fresh,'skeleton').length);
 const q=fixture.episodes[0].ending.question;eq(newQuestion(q),q);ok(newQuestion(q)!==q);
 for(const v of [undefined,1,2,3,4,999,'5',null])bad(d=>d.schemaVersion=v);
 for(const v of [null,[],42])bad(d=>d.params=v);
 for(const stage of ['skeleton','beats','full']) {
  for(const k of ['characters','scenes','props','assets','assetMappings','arcs','adaptation','creative','creativeContext','selection','decisions','overrides'])bad(d=>d[k]=[],stage);
  for(const k of ['thresholds','episodes','minutesPerEpisode','adaptMode','rules','defaults','preferences','targetSeconds','pacing'])bad(d=>d.params[k]={},stage);
  for(const k of ['focusCharacterIds','premise','throughline','ending','drive','audiencePromise'])bad(d=>d.story[k]=[],stage);
  for(const k of ['characterIds','sceneIds','propIds','stateChange','hook','suspense','beatIds'])bad(d=>d.episodes[0][k]=[],stage);
  for(const k of ['kind','position','weight','payoff','type','characters'])bad(d=>d.beats[0][k]='old',stage);
  for(const k of ['characterIds','sceneIds','propIds','speakerId','characterId','sceneId','propId','candidate','transformation'])for(const attach of [d=>d,d=>d.story,d=>d.beats[0],d=>d.episodes[0]])bad(d=>attach(d).notes=[{kind:'continuity',text:'来源说明',sourceRefs:clone(q.sourceRefs),[k]:[]}],stage);
 }
 for(const mutate of [d=>d.source='',d=>d.lang='fr',d=>d.params.genre='',d=>d.story.summary='',d=>delete d.story.sourceRefs,d=>d.creativeBrief=' ',d=>d.extra='unknown',d=>d.story.summary={text:'bad'},d=>d.story.endingBeatId='B01',d=>d.story.endingBeatId='B99'])bad(mutate);
 for(const mutate of [d=>d.beats=null,d=>d.beats[0].id='x',d=>d.beats[1].id='B01',d=>d.beats[0].episode=99,d=>d.beats[0].episode=0,d=>d.beats[0].episode='1',d=>d.beats[0].outcome='',d=>d.beats[0].setup='',d=>d.beats.reverse(),d=>d.beats[0].resolves='Q01',d=>delete d.beats[0].sourceRefs])bad(mutate);
 for(const mutate of [d=>d.episodes=[],d=>d.episodes[0].ep=2,d=>d.episodes[0].opening='',d=>d.episodes[0].synopsis='',d=>d.episodes[0].ending.mode='win',d=>d.episodes[0].ending.event='',d=>d.episodes[0].ending.extra=1,d=>d.episodes[0].warnings='rain',d=>delete d.episodes[0].sourceRefs,d=>d.episodes[3].notes[0].kind='dialogue',d=>d.episodes[3].notes[0].epistemic='belief',d=>delete d.episodes[3].notes[0].sourceRefs])bad(mutate);
 for(const mutate of [d=>d.episodes[0].ending.question=null,d=>d.episodes[0].ending.question.id='x',d=>d.episodes[2].ending.question.id='Q01',d=>delete d.episodes[0].ending.question.text,d=>d.episodes[0].ending.question.extra=1,d=>d.episodes[0].ending.question.reason=42,d=>delete d.episodes[0].ending.question.sourceRefs,d=>d.beats[2].resolves=['Q99'],d=>d.beats[3].resolves=['Q01'],d=>d.beats[2].resolves=['Q01','Q01'],d=>{d.beats[0].resolves=['Q01'];delete d.beats[2].resolves;}])bad(mutate);
 const unanswered=clone();unanswered.beats.forEach(b=>delete b.resolves);eq(validateOutline(unanswered),[]);eq(unanswered.episodes[0].ending.question.id,'Q01');
 for(const status of ['described','unknown']){const d=clone();d.notes=[{kind:'continuity',text:'这是原文中的说法，不冒称客观事实。',epistemic:'claim',speaker:{status,description:status==='unknown'?'走廊里未辨认的声音':'原文称作师傅的人'},sourceRefs:clone(q.sourceRefs)}];eq(validateOutline(d),[]);}
 for(const speaker of [null,'C01',{}, {status:'guessed',description:'某人'},{status:'unknown',description:''},{status:'described',description:'某人',id:'C01'}])bad(d=>d.notes=[{kind:'continuity',text:'说法',speaker,sourceRefs:clone(q.sourceRefs)}]);
 const minimal=clone();delete minimal.params;delete minimal.creativeBrief;delete minimal.story.endingBeatId;for(const e of minimal.episodes){delete e.ending;delete e.opening;delete e.notes;delete e.warnings;}for(const b of minimal.beats)delete b.resolves;eq(validateOutline(minimal),[]);
 const noEvents=clone(minimal);noEvents.beats=[];eq(validateOutline(noEvents),[]);
 for(const field of ['beats','episodes'])for(const value of [null,1,'damaged',[]]){const d=clone();d[field][0]=value;ok(checkup(d).stats.fail>0);renderHtml(d);renderMarkdown(d);}
 for(const value of [null,[],42]){ok(checkup(value).stats.fail>0);assert.throws(()=>renderHtml(value));count++;}
 for(const lang of ['zh','en']) {
  const html=renderHtml(fixture,lang),md=renderMarkdown(fixture,lang);ok(html.startsWith('<!doctype html>'));ok(html.includes('<html lang="'+lang+'">'));ok(md.startsWith('# 旧站时刻'));
  for(const id of ['story','episodes','beats','provenance','notes','checks','review'])ok(html.includes('id="sec-'+id+'"'));
  for(const id of ['characters','scenes','props','matrix','plan','budget','arcs','adaptation'])ok(!html.includes('id="sec-'+id+'"'));
  ok(!/Asset workload|Optional production budgets|人物表|资产预算|资产量折算|调度矩阵/.test(html+md));
  ok(!/<script\s+src=|<link\s|@import|url\(https?:/.test(html));ok(html.includes('@media print'));ok(html.includes('epswrap clip'));
  eq(JSON.parse(html.match(/id="outline-data">([\s\S]*?)<\/script>/)[1]),fixture);ok(html.includes(lang==='en'?'Content review not performed':'内容评审未执行'));
  ok(html.includes('不增加内心独白'));ok(!renderHtml(minimal,lang).includes('id="sec-notes"'));
 }
 assert.throws(()=>renderHtml(fixture,'fr'));count++;
 const hostile=clone();hostile.story.summary='</script><img src=x onerror=alert(1)>';hostile.source='<script>alert(1)</script>';
 const html=renderHtml(hostile);ok(!html.includes('<img src=x'));ok(html.includes('&lt;img'));eq(JSON.parse(html.match(/id="outline-data">([\s\S]*?)<\/script>/)[1]),hostile);ok(!renderMarkdown(hostile).includes('<script>'));
 eq(JSON.stringify(fixture),before);eq(slug('a/b:c'),'a-b-c');eq(fmtEps([1,2,3]),'1–3');eq(fmtEps([]),'—');
 const project=join(tmp,'project'),outlineDir=join(project,'outline');mkdirSync(outlineDir,{recursive:true});const docFile=join(outlineDir,'outline.json'),prodFile=join(project,'production.json'),d=clone();delete d.creativeBrief;json(docFile,d);
 eq(findProduction(outlineDir,0),null);json(prodFile,{schemaVersion:3,creativeBrief:fixture.creativeBrief,lang:'en'});eq(findProduction(outlineDir),prodFile);eq(stageDirNote(docFile,prodFile),null);ok(stageDirNote(join(project,'wrong.json'),prodFile));eq(run('validate',docFile).status,0);
 delete d.lang;json(docFile,d);ok(run('render',docFile,'--html').stdout.includes('lang="en"'));
 for(const prod of [{},{schemaVersion:2},{schemaVersion:3,creativeBrief:''},null]){json(prodFile,prod);eq(run('validate',docFile).status,1);eq(run('render',docFile,'--html').status,1);}
 writeFileSync(prodFile,'{broken');ok(loadProduction(docFile).productionError);eq(run('validate',docFile).status,1);rmSync(prodFile);eq(run('validate',docFile).status,0);eq(run('validate',docFile,'--production',prodFile).status,1);
 for(const v of [false,'true','false',1,null])eq(autopilotOf({autopilot:v}),false);eq(autopilotOf({autopilot:true}),true);
 for(const cmd of ['assets','profiles','profile','apply-profile','migrate','migrate-v3','migrate-v4','migrate-v5'])eq(run(cmd,docFile).status,1);
 for(const args of [['validate',docFile,'--unknown'],['checkup',docFile,'extra'],['render',docFile,'--html','--md'],['validate',docFile,'--stage','full','--stage','full'],['validate',docFile,'--stage','unknown']])eq(run(...args).status,1);
 eq(run('verify-sources',sample).status,0);eq(run('checkup',sample,'--json','--verify-sources').status,0);
 assert.throws(()=>renderHtml({...fixture,schemaVersion:4}));count++;
 const other=join(tmp,'other-version.json');json(other,{...fixture,schemaVersion:4});for(const cmd of ['validate','checkup','render','verify-sources'])eq(run(cmd,other).status,1,'only v5 in formal entry '+cmd);
 // This skill must run without siblings, their samples or project scripts.
 const isolated=join(tmp,'isolated');cpSync(SKILL_ROOT,isolated,{recursive:true});
 let result=spawnSync(process.execPath,[join(isolated,'scripts/mint-outline.mjs'),'validate',join(isolated,'examples/旧站时刻-outline.json'),'--verify-sources'],{cwd:isolated,encoding:'utf8',timeout:20000});eq(result.status,0,result.stderr+result.stdout);
 for(const entry of ['fixes-selftest.mjs','fusion-selftest.mjs']){result=spawnSync(process.execPath,[join(HERE,entry)],{cwd:SKILL_ROOT,encoding:'utf8',timeout:60000,maxBuffer:12*1024*1024});eq(result.status,0,result.stderr+result.stdout);console.log(result.stdout.trim());}
 if(!process.env.OUTLINE_SELFTEST_COPIED){result=spawnSync(process.execPath,[join(isolated,'scripts/selftest.mjs')],{cwd:isolated,env:{...process.env,OUTLINE_SELFTEST_COPIED:'1'},encoding:'utf8',timeout:120000,maxBuffer:12*1024*1024});eq(result.status,0,result.stderr+result.stdout);}
 for(const name of ['SKILL.md','README.md','README.en.md','references/schema.md','references/创作指南.md','references/handoff.md']){const file=join(SKILL_ROOT,name),body=readFileSync(file,'utf8');for(const m of body.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g))if(!/^https?:/.test(m[1]))ok(existsSync(resolve(dirname(file),m[1])),'local link '+name+' -> '+m[1]);}
 console.log(`✓ ${count} assertions passed: formal v5 story-only contracts, CLI, reports, documentation and standalone copy.`);
}finally{rmSync(tmp,{recursive:true,force:true});}
