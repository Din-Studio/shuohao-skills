#!/usr/bin/env node
// Episode-folder registration, per-document chunks, deterministic fragment merge and draft publish.
// Temporary directories only; no model calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {sourceFolder,episodeFromFilename,parseEpisodeNumber,chunkScript} from './lib/source.mjs';
const realpathSync=fs.realpathSync;
import {mergeFragments,publishDraft,readSources} from './lib/merge.mjs';
import {checkup,validateOutline} from './lib/outline-core.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),cli=join(root,'scripts/mint-outline.mjs');
const folder=join(root,'examples/旧站时刻-分集'),fx=join(root,'scripts/fixtures/parallel');
const tmp=fs.mkdtempSync(join(tmpdir(),'outline-parallel-'));let count=0,n=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++;},ok=(v,m)=>{assert.ok(v,m);count++;},throws=(f,re,m)=>{assert.throws(f,re,m);count++;};
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),json=(p,d)=>{fs.mkdirSync(dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');};
const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:20000,maxBuffer:8*1024*1024});
const fresh=()=>{const d=join(tmp,'case'+(++n));fs.mkdirSync(d,{recursive:true});return d;};
const batch1=read(join(fx,'batch-01.json')),batch2=read(join(fx,'batch-02.json')),stitched=read(join(fx,'stitched.json'));
// Write a fragment elsewhere: source paths stay relative to the fragment's own location.
const place=(dir,name,doc)=>{const d=structuredClone(doc);for(const x of d.provenance.documents)x.path=relative(dir,realpathSync(resolve(fx,x.path)));const p=join(dir,name);json(p,d);return p;};
const sources=dir=>{const p=join(dir,'outline/.work/sources.json');json(p,sourceFolder(folder,{out:p}));return p;};
const plan=dir=>({sources:sources(dir),out:join(dir,'outline/.work/draft.json'),publishTo:join(dir,'outline/outline.json'),source:'旧站时刻',scope:'complete',totalEpisodes:6});
const fails=(mutate,re,{fragments,options}={})=>{const dir=fresh(),o=plan(dir),docs=[structuredClone(batch1),structuredClone(batch2)];mutate(docs,o,dir);
 const files=fragments?fragments(dir,docs):docs.map((d,i)=>place(dir,`batch-0${i+1}.json`,d));
 throws(()=>mergeFragments(files,{...o,...options}),re);ok(!fs.existsSync(o.out),'failed merge writes nothing');};
try{
 // ---- source-folder ----
 for(const [t,v] of [['一',1],['十',10],['十二',12],['二十',20],['九十九',99],['一百',100],['一百零五',105],['一百一十',110],['九百九十九',999],['01',1],['百',null],['十百',null],['一一',null],['零',null],['0',null]])eq(parseEpisodeNumber(t),v,t);
 for(const [name,v] of [['第01集.md',1],['第二集.md',2],['第 十二 集 回家.md',12],['EP04.md',4],['ep-5.md',5],['E7 夜班.md',7],['12 结尾.md',12],['scene.md',null],['说明.md',null]])eq(episodeFromFilename(name),v,name);
 const reg=sourceFolder(folder,{out:join(tmp,'sources.json')});
 eq(reg.kind,'script-folder');eq(reg.documents.map(d=>d.id),['D01','D02','D03','D04','D05','D06']);eq(reg.documents.map(d=>d.ep),[1,2,3,4,5,6]);eq(reg.missingEpisodes,[]);
 for(const d of reg.documents){eq(d.lineCount,7);ok(!d.path.startsWith('/'));}
 const regFile=join(tmp,'nested/sources.json');eq(run('source-folder',folder,'--out',regFile).status,0);eq(readSources(regFile).length,6,'paths are relative to sources.json and re-verify');
 eq(run('source-folder',folder,'--out',regFile).status,1,'never overwrites sources.json');
 const mk=(files)=>{const dir=fresh(),src=join(dir,'scripts');fs.mkdirSync(src);for(const [name,body] of Object.entries(files))if(body===null)fs.mkdirSync(join(src,name));else fs.writeFileSync(join(src,name),body);return {dir,src,out:join(dir,'sources.json')};};
 const mixed=mk({'第1集.md':'# 第一集\n甲\n','EP03.md':'# 第三集\n乙\n','第一百一十二集.md':'丙\n','.hidden.md':'丁\n','说明.txt':'戊\n',子目录:null});
 const mixedReg=sourceFolder(mixed.src,{out:mixed.out});eq(mixedReg.documents.map(d=>d.id),['D001','D003','D112']);eq(mixedReg.missingEpisodes.length,109);eq(mixedReg.missingEpisodes.slice(0,2),[2,4]);
 fs.writeFileSync(join(mixed.src,'子目录','第2集.md'),'不递归\n');eq(sourceFolder(mixed.src,{out:mixed.out}).documents.length,3,'subdirectories and hidden files are not registered');
 for(const [files,re] of [
  [{'第1集.md':'甲\n','说明.md':'乙\n'},/episode number not found/],
  [{'第1集.md':'甲\n','01.md':'乙\n'},/duplicates/],
  [{'第1集.md':'甲\n','第2集.md':'## 第三集 夜\n乙\n'},/heading says episode 3/],
  [{'第1集.md':'# 第一集\n乙\n第二集 日\n'},/heading says episode 2/],
  [{'第1集.md':''},/must contain lines/],
 ]){const c=mk(files);throws(()=>sourceFolder(c.src,{out:c.out}),re);eq(run('source-folder',c.src,'--out',c.out).status,1);ok(!fs.existsSync(c.out));}
 const linked=mk({'第1集.md':'甲\n'});fs.symlinkSync(join(linked.src,'第1集.md'),join(linked.src,'第2集.md'));throws(()=>sourceFolder(linked.src,{out:linked.out}),/same file/);eq(run('source-folder',linked.src,'--out',linked.out).status,1);ok(!fs.existsSync(linked.out));
 const gap=mk({'第1集.md':'甲\n','第3集.md':'乙\n'});eq(sourceFolder(gap.src,{out:gap.out}).missingEpisodes,[2]);
 // ---- chunk ----
 const work=join(tmp,'chunks'),ep3=join(folder,'第03集.md'),ep4=join(folder,'第四集.md');
 eq(run('chunk',ep3,work,'--kind','script','--id','D03','--max-lines','3').status,0);const ch=read(join(work,'source-chunks-D03.json'));
 ok(ch.chunks.length>1);ok(ch.chunks.every(c=>c.owned.documentId==='D03'&&c.context.documentId==='D03'));ok(!fs.existsSync(join(work,'source-chunks.json')));
 eq(run('chunk',ep4,work,'--kind','script','--id','D04').status,0);ok(fs.existsSync(join(work,'source-chunks-D04.json')));
 eq(run('chunk',ep3,work,'--kind','script','--id','D03').status,1,'never overwrites a document chunk file');eq(run('chunk',ep3,work,'--kind','script','--id','../x').status,1);
 const scenes=Buffer.from(['## 第1场','甲','乙','## 第3场','丙','丁','戊'].join('\n')+'\n');eq(chunkScript(scenes,{kind:'script',maxLines:5,contextLines:0,documentId:'D02'}).chunks[0].owned,{documentId:'D02',startLine:1,endLine:3},'markdown scene heading is a boundary');
 // ---- merge ----
 const dir=fresh(),o=plan(dir),f1=place(dir,'batch-01.json',batch1),f2=place(dir,'batch-02.json',batch2);
 const {draft,summary}=mergeFragments([f2,f1],o);
 eq(read(o.out),draft);eq(summary.fragments,2);eq(summary.documents,6);eq(summary.beats,8);eq(summary.questions,3);
 eq(draft.beats.map(b=>b.id),['B01','B02','B03','B04','B05','B06','B07','B08']);eq(draft.episodes.map(e=>e.ending?.question?.id).filter(Boolean),['Q01','Q02','Q03']);
 eq(draft.beats[2].resolves,['Q01'],'batch-local resolves rewritten');eq(summary.unresolvedQuestions,['Q02','Q03']);
 eq(summary.idMap['batch-02.json'],{B01:'B05',B02:'B06',B03:'B07',B04:'B08',Q01:'Q03'});
 ok(draft.story.summary.startsWith('第 1–3 集：')&&draft.story.summary.includes('\n\n第 4–6 集：'));
 ok(!('endingBeatId' in draft.story));eq(draft.provenance.totalEpisodes,6);eq(draft.provenance.coverage.length,6);
 eq(run('validate',o.out,'--verify-sources','--source-base',dirname(o.publishTo)).status,0);
 eq(run('validate',o.out,'--verify-sources').status,1,'draft paths are relative to the formal location');
 eq(run('validate',o.out,'--source-base',dirname(o.publishTo)).status,1,'--source-base needs --verify-sources');
 eq(run('checkup',o.out,'--verify-sources','--source-base',dirname(o.publishTo),'--json').status,0);
 const again=fresh(),cliPlan=plan(again);place(again,'b1.json',batch1);place(again,'b2.json',batch2);
 eq(run('merge',join(again,'b1.json'),join(again,'b2.json'),'--sources',cliPlan.sources,'--out',cliPlan.out,'--publish-to',cliPlan.publishTo,'--source','旧站时刻','--scope','partial').status,0);
 eq(read(cliPlan.out).provenance.scope,'partial');ok(!('totalEpisodes' in read(cliPlan.out).provenance));
 // Stitching edits applied to the merge equal the stitched fixture.
 const done=structuredClone(draft);done.beats[5].resolves=['Q02'];done.story.summary=stitched.story.summary;done.story.endingBeatId='B08';
 const strip=d=>{const c=structuredClone(d);for(const x of c.provenance.documents)delete x.path;return c;};
 eq(strip(done),strip(stitched));eq(validateOutline(done),[]);
 eq(done.provenance.documents.map(d=>realpathSync(resolve(dirname(o.publishTo),d.path))),stitched.provenance.documents.map(d=>realpathSync(resolve(fx,d.path))));
 eq(checkup(done,{verifySources:true,baseDir:dirname(o.publishTo)}).stats.fail,0);
 const elsewhere=fresh(),o2={...plan(elsewhere),publishTo:join(elsewhere,'deep/stage/outline.json')};mergeFragments([place(elsewhere,'a.json',batch1),place(elsewhere,'b.json',batch2)],o2);
 eq(run('validate',o2.out,'--verify-sources','--source-base',dirname(o2.publishTo)).status,0,'another formal directory still verifies');
 const r1=d=>d[0],r2=d=>d[1];
 fails(()=>{},/D04.*owned by no fragment/,{fragments:(dir,d)=>[place(dir,'batch-01.json',d[0])]});
 fails(()=>{},/owned by both/,{fragments:(dir,d)=>[place(dir,'batch-01.json',d[0]),place(dir,'again.json',d[0]),place(dir,'batch-02.json',d[1])]});
 fails(d=>{r1(d).provenance.coverage[0].endLine=6;r1(d).story.sourceRefs[0].endLine=6;r1(d).episodes[0].sourceRefs[0].endLine=6;},/D01 coverage must be the whole episode/);
 fails(d=>{const e=r1(d).episodes[2];e.ep=7;for(const b of r1(d).beats)if(b.episode===3)b.episode=7;},/episodes .* must equal/);
 fails(d=>{r1(d).beats[0].sourceRefs=[{documentId:'D02',startLine:1,endLine:1}];},/B01 cites D02 outside episode 1/);
 fails(d=>{r1(d).episodes[1].notes=[{kind:'continuity',text:'跨集引用',sourceRefs:[{documentId:'D01',startLine:2,endLine:2}]}];},/ep2 cites D01/);
 for(const [name,mutate] of [['totalEpisodes',d=>d.provenance.totalEpisodes=6],['endingBeatId',d=>d.story.endingBeatId='B04'],['lang',d=>d.lang='zh'],['params',d=>d.params={genre:'生活'}],['creativeBrief',d=>d.creativeBrief='不补写结尾。']])fails(d=>mutate(r2(d)),new RegExp(name+' belongs to the merged outline'));
 fails(d=>{r1(d).source='别的标题';},/source must be/);
 fails(d=>{r2(d).provenance.documents[0].sha256='0'.repeat(64);},/D04 differs from sources.json/);
 fails(d=>{delete r1(d).episodes[0].synopsis;},/batch-01.json: episodes/);
 fails(d=>{r1(d).schemaVersion=4;},e=>/schemaVersion must be 5/.test(e.message)&&!/迁移|migrat/i.test(e.message));
 fails(d=>{r1(d).beats[0].id='B09';},/local beat IDs/);
 fails(d=>{r2(d).episodes[2].ending.question.id='Q02';},/local question IDs/);
 fails(d=>{r1(d).provenance.scope='complete';r1(d).provenance.totalEpisodes=3;},/scope must be partial|totalEpisodes belongs/);
 fails(()=>{},/complete scope requires totalEpisodes/,{options:{totalEpisodes:undefined}});
 fails((d,o)=>json(o.publishTo,{}),/already exists: parallel merge only creates a new outline/);
 {const dir=fresh(),o=plan(dir);fs.mkdirSync(dirname(o.out),{recursive:true});fs.writeFileSync(o.out,'keep');throws(()=>mergeFragments([place(dir,'1.json',batch1),place(dir,'2.json',batch2)],o),/already exists/);eq(fs.readFileSync(o.out,'utf8'),'keep');}
 // Non-contiguous ownership: one fragment owns episodes 1 and 3, another owns 2.
 const subset=(doc,eps)=>{const d=structuredClone(doc),keep=new Set(eps.map(e=>'D0'+e));d.episodes=d.episodes.filter(e=>eps.includes(e.ep));d.beats=d.beats.filter(b=>eps.includes(b.episode));
  const qs=d.episodes.map(e=>e.ending?.question).filter(Boolean),qmap={};qs.forEach((q,i)=>{qmap[q.id]='Q0'+(i+1);q.id=qmap[q.id];});
  d.beats.forEach((b,i)=>{b.id='B0'+(i+1);if(b.resolves){b.resolves=b.resolves.filter(q=>qmap[q]).map(q=>qmap[q]);if(!b.resolves.length)delete b.resolves;}});
  for(const k of ['documents'])d.provenance[k]=d.provenance[k].filter(x=>keep.has(x.id));d.provenance.coverage=d.provenance.coverage.filter(x=>keep.has(x.documentId));d.story.sourceRefs=d.story.sourceRefs.filter(x=>keep.has(x.documentId));return d;};
 fails(()=>{},/contiguous range/,{fragments:(dir,d)=>[place(dir,'odd.json',subset(d[0],[1,3])),place(dir,'even.json',subset(d[0],[2])),place(dir,'batch-02.json',d[1])]});
 {const dir=fresh(),o=plan(dir);const s=mergeFragments([place(dir,'a.json',subset(batch1,[1])),place(dir,'b.json',subset(batch1,[2,3])),place(dir,'c.json',batch2)],o).summary;eq(s.fragments,3);eq(s.unresolvedQuestions,['Q01','Q02','Q03'],'cross-batch answers stay open until stitching');}
 // A batch resolve that points at a question in another batch is invalid inside the fragment itself.
 fails(d=>{r2(d).beats[1].resolves=['Q02'];},/batch-02.json: questions/);
 // ---- publish ----
 const pubDir=fresh(),po=plan(pubDir);mergeFragments([place(pubDir,'1.json',batch1),place(pubDir,'2.json',batch2)],po);
 const stitchedDraft=read(po.out);stitchedDraft.beats[5].resolves=['Q02'];stitchedDraft.story.summary=stitched.story.summary;stitchedDraft.story.endingBeatId='B08';json(po.out,stitchedDraft);
 eq(run('publish',po.out,'--to',po.publishTo).status,0);eq(fs.readFileSync(po.publishTo),fs.readFileSync(po.out),'published bytes are the draft');
 eq(run('validate',po.publishTo,'--verify-sources').status,0);eq(run('render',po.publishTo,'--md','--verify-sources').status,0);
 const before=fs.readFileSync(po.publishTo);eq(run('publish',po.out,'--to',po.publishTo).status,1);eq(fs.readFileSync(po.publishTo),before,'publish never overwrites');
 const broken=join(pubDir,'outline/.work/broken.json');const b=structuredClone(stitchedDraft);b.story.summary='';json(broken,b);
 const target=join(pubDir,'other/outline.json');throws(()=>publishDraft(broken,{to:target}),/fails checks/);ok(!fs.existsSync(target));
 throws(()=>publishDraft(po.out,{to:join(pubDir,'somewhere/else/deeper/outline.json')}),/source/);ok(!fs.existsSync(join(pubDir,'somewhere')));
 eq(run('publish',po.out).status,1);
 console.log(`✓ ${count} assertions passed: episode folders, per-document chunks, fragment merge and draft publish.`);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
