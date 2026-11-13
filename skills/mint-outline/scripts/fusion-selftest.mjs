#!/usr/bin/env node
// Source evidence, partial scopes, exact positions and story-only v5 documents.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {provenanceErrors,sourceRefsErrors,sourceDocument,verifySources,sourceLines,unionRanges,coverageOf,chunkScript,sha256} from './lib/source.mjs';
import {checkup,validateOutline} from './lib/outline-core.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),cli=join(root,'scripts/mint-outline.mjs'),sample=join(root,'examples/旧站时刻-outline.json');
const fixture=JSON.parse(fs.readFileSync(sample));
const tmp=fs.mkdtempSync(join(tmpdir(),'outline-fusion-'));let count=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++;},ok=(v,m)=>{assert.ok(v,m);count++;},throws=(f,m)=>{assert.throws(f,m);count++;},clone=x=>structuredClone(x??fixture),json=(p,d)=>fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:20000,maxBuffer:8*1024*1024});
try{
 eq(sourceLines(Buffer.from('一\r\n二\r\n')),['一','二']);eq(sourceLines(Buffer.from('一\r二\n\n')),['一','二','']);eq(sourceLines(Buffer.from('')),[]);throws(()=>sourceLines(Buffer.from([0xff])));
 eq(unionRanges([{startLine:3,endLine:5},{startLine:1,endLine:3},{startLine:5,endLine:7},{startLine:9,endLine:10}]),[[1,7],[9,10]]);
 eq(coverageOf(fixture.provenance)[0].coveredLines,43);eq(verifySources(fixture,{artifactPath:sample}).status,'pass');eq(verifySources(fixture).status,'fail');
 for(const mutate of [d=>delete d.provenance,d=>d.provenance.kind='novel',d=>d.provenance.kind='outline',d=>d.provenance.kind='original',d=>d.provenance.scope='full',d=>d.provenance.documents=[],d=>d.provenance.documents.push(clone(d.provenance.documents[0])),d=>d.provenance.documents[0].sha256='A'.repeat(64),d=>d.provenance.documents[0].sha256='abc',d=>d.provenance.documents[0].lineCount=0,d=>d.provenance.documents[0].lineCount=1.2,d=>d.provenance.documents[0].path='/absolute',d=>d.provenance.coverage=[],d=>d.provenance.coverage[0].startLine=0,d=>d.provenance.coverage[0].endLine=99,d=>d.provenance.coverage[0].documentId='missing',d=>d.provenance.coverage[0].startLine=30,d=>d.provenance.coverage[1].startLine=24,d=>delete d.provenance.totalEpisodes,d=>d.provenance.totalEpisodes=0,d=>d.episodes.pop(),d=>d.provenance.documents[0]=null,d=>d.provenance.coverage[0]=null]){const d=clone();mutate(d);ok(provenanceErrors(d.provenance,{episodes:d.episodes}).length>0);ok(checkup(d).stats.fail>0);}
 for(const refs of [undefined,[],null,[null],[{documentId:'missing',startLine:1,endLine:2}],[{documentId:'D01',startLine:1,endLine:99}],[{documentId:'D01',startLine:2,endLine:1}],[{documentId:'D01',startLine:1,endLine:2,guess:true}]])ok(sourceRefsErrors(refs,fixture.provenance).length>0);
 const gap=clone();gap.provenance.scope='partial';gap.provenance.coverage=[{documentId:'D01',startLine:1,endLine:10},{documentId:'D01',startLine:12,endLine:43}];ok(sourceRefsErrors([{documentId:'D01',startLine:10,endLine:12}],gap.provenance).length>0,'cannot bridge unread gap');
 // Physical positions remain distinct even when utterances are identical.
 const original=fs.readFileSync(join(root,'examples/旧站时刻-script.txt')),lines=sourceLines(original);
 eq(lines[20],lines[38]);
 ok(!fixture.beats.some(b=>b.setup==='回执与电子表时间不同'));
 ok(lines[10].includes('回执留底')&&lines[30].includes('旧回执'));
 const chunks=chunkScript(original,{kind:'script',maxLines:7,contextLines:2});eq(chunks.lineCount,43);eq(chunks.sha256,sha256(original));
 const owned=chunks.chunks.flatMap(c=>Array.from({length:c.owned.endLine-c.owned.startLine+1},(_,i)=>c.owned.startLine+i));eq(owned,Array.from({length:43},(_,i)=>i+1));
 for(const c of chunks.chunks){eq(c.lines,lines.slice(c.context.startLine-1,c.context.endLine));ok(c.context.startLine<=c.owned.startLine&&c.context.endLine>=c.owned.endLine);}
 ok(chunks.chunks.some(c=>c.context.startLine<c.owned.startLine));
 for(const kind of [undefined,'novel','outline','original'])throws(()=>chunkScript(original,{kind}));
 for(const maxLines of [0,-1,1.2,NaN])throws(()=>chunkScript(original,{kind:'script',maxLines}));
 const all=chunkScript(Buffer.from('同句\n同句\n同句\n'),{kind:'script',maxLines:1,contextLines:0});eq(all.chunks.length,3);eq(all.chunks.map(c=>c.owned.startLine),[1,2,3]);
 // Source file changes do not silently update manifests or count as a skipped check.
 const src=join(tmp,'source.txt'),artifact=join(tmp,'outline.json');fs.writeFileSync(src,original);const d=clone();d.provenance.documents=[sourceDocument(src,{artifactPath:artifact})];json(artifact,d);eq(run('verify-sources',artifact).status,0);
 const before=fs.readFileSync(artifact);for(const bytes of [Buffer.from(original.toString().replace('先查车','先查人')),Buffer.from(original.toString().replace(/\n/g,'\r\n')),Buffer.from('一行\n'),Buffer.from([0xff])]){fs.writeFileSync(src,bytes);eq(run('verify-sources',artifact).status,1);eq(checkup(d,{verifySources:true,artifactPath:artifact}).sourceVerification,'fail');eq(fs.readFileSync(artifact),before);}
 fs.rmSync(src);eq(run('verify-sources',artifact).status,1);fs.symlinkSync('missing.txt',src);eq(run('verify-sources',artifact).status,1);fs.rmSync(src);fs.mkdirSync(src);eq(run('verify-sources',artifact).status,1);fs.rmSync(src,{recursive:true});fs.writeFileSync(src,original);
 const alias=join(tmp,'source-alias.txt');fs.symlinkSync(src,alias);const duplicate=clone(d);duplicate.provenance.documents.push({...sourceDocument(alias,{artifactPath:artifact,id:'D02'})});duplicate.provenance.coverage.push({documentId:'D02',startLine:1,endLine:43});ok(verifySources(duplicate,{artifactPath:artifact}).errors.some(e=>e.includes('duplicate resolved')),'symlink aliases cannot count one source twice');
 eq(run('source-document',src,'--artifact',artifact).status,0);eq(JSON.parse(run('source-document',src,'--artifact',artifact).stdout),d.provenance.documents[0]);eq(run('source-document',src).status,1);
 const work=join(tmp,'work');eq(run('chunk',src,work,'--kind','novel').status,1);eq(run('chunk',src,work).status,1);eq(run('chunk',src,work,'--kind','script','--max-lines','7').status,0);eq(run('chunk',src,work,'--kind','script').status,1,'never overwrites prior chunks');
 // Own second story is established before facts: a repaired measuring rule passes between
 // two distinct people with the same name; a flashback must not inherit the repaired state.
 const story='《尺盒》仅提供第四与第六集，总集数未知。\n第四集 修理铺 日\n修理师周宁（旧工牌写“阿宁”）把断尺交给来取件的学生周宁；两人不是同一个人。\n学徒不说话，将空尺盒递给学生。\n修理师周宁：这把尺明天才修好。\n第六集 修理铺 日\n学生周宁带着修好的同一把尺归还；第五集经过未提供。\n闪回第四集：尺仍然断着，持有人为学生，不可套用当前修复状态。\n学生周宁：这把尺明天才修好。\n这是他重复当时的话，不是新损坏；谁实际修好仍未揭晓。\n';
 const path=join(tmp,'尺盒.txt'),file=join(tmp,'尺盒-outline.json');fs.writeFileSync(path,story);const ref=(a,b=a)=>[{documentId:'D01',startLine:a,endLine:b}];
 const partial={schemaVersion:5,source:'尺盒',provenance:{kind:'script',scope:'partial',documents:[sourceDocument(path,{artifactPath:file})],coverage:ref(1,10)},story:{summary:'断尺经两位同名人物交接，后续已修复，但修复者未知。',sourceRefs:ref(1,10)},beats:[{id:'B01',episode:4,setup:'学生来取件',outcome:'修理师交出断尺，学徒递交尺盒',sourceRefs:ref(3,5)},{id:'B02',episode:6,setup:'学生带回尺',outcome:'同一把尺已修复，修复者未揭晓',sourceRefs:ref(7,10)}],episodes:[{ep:4,synopsis:'同名的修理师向学生交出断尺，学徒递交尺盒。',sourceRefs:ref(2,5)},{ep:6,synopsis:'学生归还修好的尺，闪回仍为损坏时。',sourceRefs:ref(6,10),ending:{event:'修复者尚不明',question:{id:'Q01',text:'谁修好了尺？',sourceRefs:ref(10)}},notes:[{kind:'continuity',text:'闪回尺仍损坏，由学生持有；当前同一尺已经修复。',sourceRefs:ref(7,8)},{kind:'restriction',text:'修复者仍未知，不提前补写身份。',epistemic:'uncertain',sourceRefs:ref(10)}]}]};
 partial.episodes[0].notes=[{kind:'background',text:'原文修理师周宁旧工牌写着“阿宁”；来取件的学生也叫周宁，两人分别描述，不在 outline 建立别名或身份表。',sourceRefs:ref(3)}];
 eq(validateOutline(partial),[]);json(file,partial);eq(run('verify-sources',file).status,0);ok(partial.story.summary.includes('两位同名人物'));ok(!('characters' in partial));eq(sourceLines(Buffer.from(story))[4].split('：')[1],sourceLines(Buffer.from(story))[8].split('：')[1]);
 const complete=clone(partial);complete.provenance.scope='complete';complete.provenance.totalEpisodes=6;ok(validateOutline(complete).length);const fakeEnding=clone(partial);fakeEnding.story.endingBeatId='B02';ok(validateOutline(fakeEnding).some(e=>e.includes('ending-beat')));const known=clone(partial);known.provenance.totalEpisodes=8;eq(validateOutline(known),[]);
 const twoDocs=clone(partial);const second=join(tmp,'second.txt');fs.writeFileSync(second,'补充未读资料\n');twoDocs.provenance.documents.push(sourceDocument(second,{artifactPath:file,id:'D02'}));eq(validateOutline(twoDocs),[],'partial may explicitly record unread provided document');twoDocs.provenance.scope='complete';ok(validateOutline(twoDocs).length);
 // Non-human acting subject and a silent crew are source identities, not automatic image orders.
 const patrol='《巡灯》第一集 桥面 夜\n巡检机器人亮起红灯，检修组无声退到护栏后。\n广播员只从扬声器发声：停步。\n背景说明：工程师尚未到场，仅被提及；没有出现，也没有发声。\n门外未辨认的声音：门外还有人，别打开。\n';
 const patrolPath=join(tmp,'巡灯.txt'),patrolFile=join(tmp,'巡灯-outline.json');fs.writeFileSync(patrolPath,patrol);
 const patrolDoc={schemaVersion:5,source:'巡灯',provenance:{kind:'script',scope:'complete',totalEpisodes:1,documents:[sourceDocument(patrolPath,{artifactPath:patrolFile})],coverage:ref(1,5)},story:{summary:'机器人示警，检修组退后；工程师仍未到场，未交代退后的进一步意图。',sourceRefs:ref(1,4)},beats:[{id:'B01',episode:1,setup:'机器人亮起红灯',outcome:'检修组退到护栏后，广播要求停步',sourceRefs:ref(2,4)}],episodes:[{ep:1,synopsis:'示警与退后，工程师仍未到场。',sourceRefs:ref(1,4)}]};
 patrolDoc.episodes[0].sourceRefs=ref(1,5);
 patrolDoc.episodes[0].notes=[{kind:'continuity',text:'门外还有人只是声音的说法，未得到客观确认；说话者未辨认，不能推断为广播员或工程师。',epistemic:'claim',speaker:{status:'unknown',description:'门外未辨认的声音'},sourceRefs:ref(5)}];
 eq(validateOutline(patrolDoc),[]);json(patrolFile,patrolDoc);eq(run('verify-sources',patrolFile).status,0);
 ok(patrolDoc.story.summary.includes('机器人'));ok(!('characters' in patrolDoc),'仅保存剧情，不分配身份或出图');
 console.log(`✓ ${count} assertions passed: real source verification, coverage, partial scopes, notes and exact occurrences.`);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
