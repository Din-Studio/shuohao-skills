#!/usr/bin/env node
// Source evidence, partial identities, exact positions and safe v4 draft migration.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {provenanceErrors,sourceRefsErrors,sourceDocument,verifySources,sourceLines,unionRanges,coverageOf,chunkScript,sha256} from './lib/source.mjs';
import {checkup,validateOutline} from './lib/outline-core.mjs';
import {migrationDraftV4,migrateFileV4} from './lib/migration-v4.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),cli=join(root,'scripts/mint-outline.mjs'),sample=join(root,'examples/旧站时刻-outline.json');
const fixture=JSON.parse(fs.readFileSync(sample)),legacy=JSON.parse(fs.readFileSync(join(root,'scripts/fixtures/outline-v3.json')));
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
 ok(!fixture.characters.some(c=>/受处分|从相信系统表格/.test(c.role+' '+c.arc)),'不把旧创作设定冒称来源事实');
 ok(!fixture.beats.some(b=>b.setup==='回执与电子表时间不同'));
 const currentReceipt=fixture.props.find(p=>p.id==='P02'),oldReceipt=fixture.props.find(p=>p.id==='P04');
 eq(currentReceipt.beatIds,['B03','B04']);eq(oldReceipt.beatIds,['B06']);
 ok(lines[10].includes('回执留底')&&lines[30].includes('旧回执'));
 eq(oldReceipt.sourceRefs,[{documentId:'D01',startLine:31,endLine:32}]);
 ok(fixture.episodes[4].propIds.includes('P04')&&!fixture.episodes[4].propIds.includes('P02'),'历史回执不误并为当次回执');
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
 const partial={schemaVersion:4,source:'尺盒',provenance:{kind:'script',scope:'partial',documents:[sourceDocument(path,{artifactPath:file})],coverage:ref(1,10)},story:{summary:'断尺经两位同名人物交接，后续已修复，但修复者未知。',sourceRefs:ref(1,10)},characters:[{id:'C01',name:'周宁',role:'修理师',tier:'lead',aliases:[{name:'阿宁',sourceRefs:ref(3)}],sourceRefs:ref(3)},{id:'C02',name:'周宁',role:'学生',tier:'lead',sourceRefs:ref(3)},{id:'C03',name:'学徒',role:'无台词递交尺盒',tier:'functional',presence:'visible',sourceRefs:ref(4)}],scenes:[{id:'S01',name:'修理铺',primary:true,sourceRefs:[...ref(2),...ref(6)]}],props:[{id:'P01',name:'尺',function:'交接与状态变化',sourceRefs:[...ref(3),...ref(7,10)]},{id:'P02',name:'尺盒',function:'交付容器',sourceRefs:ref(4)}],beats:[{id:'B01',episode:4,setup:'学生来取件',outcome:'修理师交出断尺，学徒递交尺盒',sourceRefs:ref(3,5)},{id:'B02',episode:6,setup:'学生带回尺',outcome:'同一把尺已修复，修复者未揭晓',sourceRefs:ref(7,10)}],episodes:[{ep:4,synopsis:'同名的修理师向学生交出断尺，学徒递交尺盒。',characterIds:['C01','C02','C03'],sceneIds:['S01'],propIds:['P01','P02'],sourceRefs:ref(2,5)},{ep:6,synopsis:'学生归还修好的尺，闪回仍为损坏时。',characterIds:['C02'],sceneIds:['S01'],propIds:['P01'],sourceRefs:ref(6,10),ending:{event:'修复者尚不明',question:{id:'Q01',text:'谁修好了尺？',sourceRefs:ref(10)}},notes:[{kind:'continuity',text:'闪回尺仍损坏，由学生持有；当前同一尺已经修复。',propIds:['P01'],characterIds:['C02'],sourceRefs:ref(7,8)},{kind:'restriction',text:'修复者仍未知，不提前补写身份。',epistemic:'uncertain',sourceRefs:ref(10)}]}]};
 eq(validateOutline(partial),[]);json(file,partial);eq(run('verify-sources',file).status,0);eq(partial.characters.filter(c=>c.name==='周宁').length,2);eq(partial.props.filter(p=>p.id==='P01').length,1);eq(sourceLines(Buffer.from(story))[4].split('：')[1],sourceLines(Buffer.from(story))[8].split('：')[1]);
 const complete=clone(partial);complete.provenance.scope='complete';complete.provenance.totalEpisodes=6;ok(validateOutline(complete).length);const fakeEnding=clone(partial);fakeEnding.story.endingBeatId='B02';ok(validateOutline(fakeEnding).some(e=>e.includes('ending-beat')));const known=clone(partial);known.provenance.totalEpisodes=8;eq(validateOutline(known),[]);
 const twoDocs=clone(partial);const second=join(tmp,'second.txt');fs.writeFileSync(second,'补充未读资料\n');twoDocs.provenance.documents.push(sourceDocument(second,{artifactPath:file,id:'D02'}));eq(validateOutline(twoDocs),[],'partial may explicitly record unread provided document');twoDocs.provenance.scope='complete';ok(validateOutline(twoDocs).length);
 // Non-human acting subject and a silent crew are source identities, not automatic image orders.
 const patrol='《巡灯》第一集 桥面 夜\n巡检机器人亮起红灯，检修组无声退到护栏后。\n广播员只从扬声器发声：停步。\n背景说明：工程师尚未到场，仅被提及；没有出现，也没有发声。\n';
 const patrolPath=join(tmp,'巡灯.txt'),patrolFile=join(tmp,'巡灯-outline.json');fs.writeFileSync(patrolPath,patrol);
 const patrolDoc={schemaVersion:4,source:'巡灯',provenance:{kind:'script',scope:'complete',totalEpisodes:1,documents:[sourceDocument(patrolPath,{artifactPath:patrolFile})],coverage:ref(1,4)},story:{summary:'机器人示警，检修组退后；工程师仍未到场，未交代退后的进一步意图。',sourceRefs:ref(1,4)},characters:[{id:'C01',name:'巡检机器人',role:'非人行动主体，不误归为静态道具',tier:'functional',presence:'visible',sourceRefs:ref(2)},{id:'C02',name:'检修组',role:'无台词群体，按需要设计群体参考',tier:'functional',presence:'visible',sourceRefs:ref(2)},{id:'C03',name:'广播员',role:'只有声音，未出现可见形象',tier:'functional',presence:'voice-only',sourceRefs:ref(3)},{id:'C04',name:'工程师',role:'仅被提及，当前不安排出图',tier:'functional',presence:'mentioned',sourceRefs:ref(4)}],scenes:[{id:'S01',name:'桥面',primary:true,sourceRefs:ref(1)}],props:[],beats:[{id:'B01',episode:1,setup:'机器人亮起红灯',outcome:'检修组退到护栏后，广播要求停步',sourceRefs:ref(2,4)}],episodes:[{ep:1,synopsis:'示警与退后，工程师仍未到场。',characterIds:['C01','C02','C03','C04'],sceneIds:['S01'],sourceRefs:ref(1,4)}]};
 eq(validateOutline(patrolDoc),[]);json(patrolFile,patrolDoc);eq(run('verify-sources',patrolFile).status,0);
 eq(patrolDoc.characters.map(c=>c.presence),['visible','visible','voice-only','mentioned']);
 ok(!patrolDoc.characters.some(c=>'image' in c),'出现身份不等于自动安排出图');
 // Historical evidence and decisions are preserved exactly, not manufactured as sourceRefs.
 const enriched=clone(legacy);enriched.adaptation.evidence='原文Ａ\n保留标点“……”';enriched.adaptation.keep[0].evidence='不可抹去的证据';enriched.scenes[0].reusePlan='历史复用决定';
 const old=JSON.stringify(enriched),preview=migrationDraftV4(enriched);eq(JSON.stringify(enriched),old);eq(preview.status,'pending-evidence');eq(preview.review.original,enriched);eq(preview.review.original.adaptation.evidence,enriched.adaptation.evidence);ok(preview.preserved.some(p=>p.path==='outline.adaptation'));ok(preview.preserved.some(p=>p.path==='scenes.S01.reusePlan'));ok(preview.pending.some(p=>p.includes('provenance')));ok(preview.pending.some(p=>p.includes('sourceRefs')));
 eq(preview.document.schemaVersion,4);ok(!preview.document.provenance);ok(!preview.document.story.endingBeatId);ok(!preview.document.params.minutesPerEpisode);eq(preview.document.characters.map(c=>c.id),enriched.characters.map(c=>c.id));eq(preview.document.beats.map(b=>[b.id,b.episode,b.setup,b.outcome,b.resolves]),enriched.beats.map(b=>[b.id,b.episode,b.setup,b.outcome,b.resolves]));eq(preview.document.episodes[0].ending.question.text,enriched.episodes[0].ending.question.text);ok(!('resolution' in preview.document.episodes[0].ending.question));ok(validateOutline(preview.document).length);
 const v2=JSON.parse(fs.readFileSync(join(root,'scripts/fixtures/outline-v2.json')));eq(migrationDraftV4(v2).review.original,v2);
 for(const v of [null,[],{},fixture,{...legacy,schemaVersion:999}])throws(()=>migrationDraftV4(v));const invalid=clone(legacy);invalid.characters[0].id='X';throws(()=>migrationDraftV4(invalid));
 const input=join(tmp,'old.json'),output=join(tmp,'draft.json');json(input,enriched);const bytes=fs.readFileSync(input);
 eq(run('migrate-v4',input).status,0);eq(run('migrate-v4',input,'--out',output).status,1);ok(!fs.existsSync(output));let result=run('migrate-v4',input,'--out',output,'--confirm');eq(result.status,0,result.stderr);const report=JSON.parse(result.stdout);eq(report.status,'pending-evidence');eq(fs.readFileSync(input),bytes);eq(fs.readFileSync(report.backup),bytes);eq(JSON.parse(fs.readFileSync(report.reviewFile)).original,enriched);eq(run('validate',output).status,1);eq(run('migrate-v4',input,'--out',output,'--confirm').status,1);eq(run('migrate-v4',input,'--out',input,'--confirm').status,1);
 for(const args of [['--out'],['--unknown'],['extra'],['--out',join(tmp,'new.json'),'--out',join(tmp,'other.json')]])eq(run('migrate-v4',input,...args).status,1);
 const link=join(tmp,'link.json');fs.symlinkSync(input,link);throws(()=>migrateFileV4(link,join(tmp,'link-out'),{confirm:true}));
 const collision=join(tmp,'collision');fs.symlinkSync('missing',collision);throws(()=>migrateFileV4(input,collision,{confirm:true}));
 const invalidUtf8=join(tmp,'invalid-utf8');fs.writeFileSync(invalidUtf8,Buffer.from([0xff]));eq(run('migrate-v4',invalidUtf8).status,1);
 // Safe rollback, source races and concurrent destination authors retain all evidence.
 const write=fs.writeFileSync,copy=fs.copyFileSync,failed=join(tmp,'failed');
 try{fs.writeFileSync=function(p,...args){if(p===failed)throw Error('injected failure');return write.call(this,p,...args);};syncBuiltinESMExports();throws(()=>migrateFileV4(input,failed,{confirm:true}));}finally{fs.writeFileSync=write;syncBuiltinESMExports();}
 for(const p of [failed,failed+'.legacy-backup',failed+'.review'])ok(!fs.existsSync(p));eq(fs.readFileSync(input),bytes);
 const raced=join(tmp,'raced');try{fs.writeFileSync=function(p,...args){if(p===raced)write.call(this,p,'concurrent author');return write.call(this,p,...args);};syncBuiltinESMExports();throws(()=>migrateFileV4(input,raced,{confirm:true}));}finally{fs.writeFileSync=write;syncBuiltinESMExports();}
 eq(fs.readFileSync(raced,'utf8'),'concurrent author');ok(!fs.existsSync(raced+'.legacy-backup'));ok(!fs.existsSync(raced+'.review'));
 const changed=join(tmp,'changed');try{fs.copyFileSync=function(from,to,...args){if(to===changed+'.legacy-backup')fs.writeFileSync(from,'concurrent source');return copy.call(this,from,to,...args);};syncBuiltinESMExports();throws(()=>migrateFileV4(input,changed,{confirm:true}));}finally{fs.copyFileSync=copy;syncBuiltinESMExports();}
 eq(fs.readFileSync(input,'utf8'),'concurrent source');for(const p of [changed,changed+'.legacy-backup',changed+'.review'])ok(!fs.existsSync(p));
 console.log(`✓ ${count} assertions passed: real source verification, coverage, partial identities, notes, exact occurrences and evidence-preserving v4 migration.`);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
