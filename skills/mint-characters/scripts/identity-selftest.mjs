#!/usr/bin/env node
// Source story first; fixtures owned entirely by this skill. Offline only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {seedSource,reconcile,identityErrors,identityHash,hash,reviewHash,renderIdentity,budgetChecks} from './lib/identity.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),cliPath=join(root,'scripts/mint-characters.mjs');
const temp=mkdtempSync(join(tmpdir(),'characters-identity-')),source=join(temp,'source.txt'),file=join(temp,'cast.json');
copyFileSync(join(root,'examples/回声台.txt'),source);
const clone=structuredClone, write=(p,x)=>writeFileSync(p,JSON.stringify(x,null,2));
const cli=(...args)=>spawnSync(process.execPath,[cliPath,...args],{encoding:'utf8',cwd:temp});
let tests=0;
const test=(name,f)=>{try{f();tests++;}catch(e){e.message=`${name}: ${e.message}`;throw e;}};
const ref=(startLine,endLine=startLine)=>[{documentId:'D01',startLine,endLine}];
const character=(key,name,line,extra={})=>({identityKey:key,name,aliases:[],entityType:'human',presence:['visible'],speech:'silent',unknowns:[],sourceRefs:ref(line),...extra});
let draft=seedSource(source,'回声台');draft.provenance.scope='complete';draft.provenance.coverage=ref(1,10);draft.budgets.characters=8;
draft.characters=[
 character('night','许禾',1,{speech:'speaking',aliases:[{name:'小禾',sourceRefs:ref(2)}]}),
 character('morning','许禾',1),character('girl','陌生女孩',3,{unknowns:['姓名未知']}),
 character('neighbor','隔壁喊话者',4,{presence:['voice-only'],speech:'speaking',unknowns:['姓名未知']}),
 character('dog','灰点',5,{entityType:'nonhuman'}),character('mentor','梁师傅',6,{presence:['mentioned'],speech:'unknown'}),
 character('speaker','扬声器声音',7,{entityType:'unknown',presence:['voice-only'],speech:'speaking',unknowns:['发声主体与录音状态未知']}),
 character('outside','窗外喊话者',9,{presence:['voice-only'],speech:'speaking',unknowns:['不能确认与隔壁声音是否同一身份']})];
let cast=reconcile(draft);
try {
 test('seed only skeleton',()=>{const s=seedSource(source,'回声台');assert.equal(s.characters.length,0);assert.deepEqual(s.provenance.coverage,[]);assert.ok(identityErrors(s,file).length);});
 test('semantic edge identities no forced design',()=>{assert.deepEqual(identityErrors(cast,file),[]);assert.equal(new Set(cast.characters.map(c=>c.id)).size,8);assert.equal(cast.characters.filter(c=>c.name==='许禾').length,2);});
 test('CLI independent seed',()=>{const r=cli('seed','--source',source,'--title','回声台','--budget','8');assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).schemaVersion,1);});
 test('seed invalid flags',()=>{for(const args of [['--source'],['--source',source],['--source',source,'--title','回声台','--budget','-1']])assert.notEqual(cli('seed',...args).status,0);});
 test('formal validate/source path relative to cast',()=>{const d=clone(cast);d.provenance.documents[0].path='source.txt';write(file,d);assert.equal(cli('validate',file,'--no-production').status,0);});
 test('optional missing outline skipped',()=>{const r=JSON.parse(cli('validate',file,'--no-production').stdout);assert.equal(r.checks.find(g=>g.id==='outline-background').status,'skipped');assert.equal(r.checks.find(g=>g.id==='semantic-review').status,'skipped');});
 test('budget excess blocks',()=>{const d=clone(cast);d.budgets.characters=7;assert.match(identityErrors(d,file).join(),/超额/);write(file,d);assert.notEqual(cli('validate',file).status,0);write(file,cast);});
 for(const [name,mutate] of [
  ['same id',d=>d.characters[1].id=d.characters[0].id],['same identity key',d=>d.characters[1].identityKey=d.characters[0].identityKey],
  ['bad alias refs',d=>d.characters[0].aliases[0].sourceRefs=ref(99)],['uncovered',d=>d.provenance.coverage=ref(1,4)],
  ['complete gap',d=>d.provenance.coverage=[...ref(1,4),...ref(6,10)]],['bad doc',d=>d.provenance.documents[0].id='other'],
  ['bad speech',d=>d.characters[0].speech='mute'],['bad presence',d=>d.characters[2].presence=['anonymous']],
  ['invention quote',d=>d.characters[0].sourceRefs[0].quote='从未说过的话'],['name-only relationship',d=>d.characters[0].persona={relationships:[{name:'许禾'}]}],
  ['unknown kind',d=>d.kind='other'],['source version',d=>d.provenance.documents[0].sha256='0'.repeat(64)],
  ['false review',d=>{d.status='identified';d.review={status:'confirmed',by:'test',note:'reviewed'};}]
 ])test(name,()=>{const d=clone(cast);mutate(d);assert.ok(identityErrors(d,file).length);});
 test('partial scope supported',()=>{const d=clone(cast);d.provenance.scope='partial';d.provenance.coverage=ref(1,9);assert.deepEqual(identityErrors(d,file),[]);});
 test('reordering stable IDs/hash',()=>{const d=clone(cast);d.characters.reverse();const r=reconcile(d,cast);assert.deepEqual(r.characters.map(c=>c.id),cast.characters.map(c=>c.id).reverse());assert.deepEqual(r.lifecycle.recheckIds,[]);});
 test('cannot reset lifecycle',()=>assert.throws(()=>reconcile(cast),/previous/));
 test('cannot reassign ID',()=>{const d=clone(cast);d.characters[0].id='C99';assert.throws(()=>reconcile(d,cast));});
 test('cannot silently delete',()=>{const d=clone(cast);d.characters.pop();assert.throws(()=>reconcile(d,cast),/映射/);});
 const previousPath=join(temp,'previous.json');write(previousPath,cast);
 const decision=(type,from,to)=>({type,from,to,basis:'user',reason:'用户确认身份关系',decision:'本次明确决定；不是原文事实'});
 let merged;
 test('merge retains mapping, retires ID',()=>{const d=clone(cast);d.characters=d.characters.filter(c=>c.id!=='C08');merged=reconcile(d,cast,[decision('merge',['C04','C08'],['C04'])]);assert.equal(merged.lifecycle.registry.find(r=>r.id==='C08').state,'retired');assert.deepEqual(merged.lifecycle.recheckIds,['C04','C08']);assert.deepEqual(identityErrors(merged,file),[]);});
 test('surviving merge target invalidates only its actual asset mapping',()=>{
  const before=cast.characters.find(c=>c.id==='C04'),after=merged.characters.find(c=>c.id==='C04');
  assert.notEqual(before.lifecycleStamp,after.lifecycleStamp);assert.notEqual(hash(before),hash(after));
  assert.equal(hash(cast.characters[0]),hash(merged.characters[0]));
  const d=clone(merged);d.characters.find(c=>c.id==='C04').lifecycleStamp=before.lifecycleStamp;assert.match(identityErrors(d,file).join(),/摘要未更新|身份或来源/);
 });
 test('incremental CLI replays baseline',()=>{write(file,merged);assert.equal(cli('validate',file,'--previous',previousPath).status,0);assert.notEqual(cli('validate',file).status,0);const d=clone(merged);d.lifecycle.previousHash='0'.repeat(64);write(file,d);assert.notEqual(cli('validate',file,'--previous',previousPath).status,0);});
 test('retired IDs/keys never reused',()=>{for(const field of ['id','identityKey']) {const d=clone(merged);d.characters.push(character(field==='identityKey'?'outside':'new-key','新身份',9,{...(field==='id'?{id:'C08'}:{})}));assert.throws(()=>reconcile(d,merged));}});
 test('new IDs above historical max',()=>{const d=clone(merged);d.characters.push(character('new-key','新身份',9));d.budgets.characters=9;d.budgetChanges=[{key:'characters',from:8,to:9,basis:'样例作者明确增加一个身份的预算'}];const r=reconcile(d,merged);assert.equal(r.characters.at(-1).id,'C09');});
 test('split uses fresh IDs and keeps evidence',()=>{const d=clone(cast);d.characters=d.characters.filter(c=>c.id!=='C07');d.characters.push(character('new-a','声音甲',7),character('new-b','声音乙',7));d.budgets.characters=9;d.budgetChanges=[{key:'characters',from:8,to:9,basis:'样例作者确认拆分需要增加一个身份预算'}];const r=reconcile(d,cast,[decision('split',['C07'],['C09','C10'])]);assert.equal(r.lifecycle.registry.find(x=>x.id==='C07').state,'retired');assert.deepEqual(identityErrors(r,file),[]);});
 test('delete explicit mapping',()=>{const d=clone(cast);d.characters.pop();const r=reconcile(d,cast,[decision('delete',['C08'],[])]);assert.equal(r.lifecycle.changes.at(-1).type,'delete');});
 test('correction needs grounds and invalidates affected only',()=>{const d=clone(cast);d.characters[0].name='夜班许禾';assert.throws(()=>reconcile(d,cast),/correct/);const r=reconcile(d,cast,[decision('correct',['C01'],['C01'])]);assert.deepEqual(r.lifecycle.recheckIds,['C01']);assert.equal(r.characters[1].id,'C02');});
 test('bad change shape/reference/reason',()=>{for(const c of [{type:'split',from:['C01'],to:['C02']},{type:'delete',from:['C99'],to:[]},{type:'merge',from:['C01','C02'],to:['C01'],reason:''}])assert.throws(()=>reconcile(cast,cast,[{...decision('delete',['C08'],[]),...c}]));});
 test('source version invalidates relevant identities not ID',()=>{const d=clone(cast);d.provenance.documents[0].sha256='1'.repeat(64);const r=reconcile(d,cast);assert.deepEqual(r.characters.map(c=>c.id),cast.characters.map(c=>c.id));assert.equal(r.lifecycle.recheckIds.length,8);assert.equal(r.review.status,'pending');});
 test('source version unrelated document does not invalidate identities',()=>{const d=clone(cast);d.provenance.documents.push({id:'D02',path:source,sha256:hash(readFileSync(source)),lineCount:10});d.provenance.coverage.push({documentId:'D02',startLine:1,endLine:10});const r=reconcile(d,cast);assert.deepEqual(r.lifecycle.recheckIds,[]);});
 test('confirmation bound to evidence hash',()=>{const d=clone(cast);d.review={status:'confirmed',by:'人工测试',note:'逐行复核',inputHash:reviewHash(d)};d.status='identified';assert.deepEqual(identityErrors(d,file),[]);d.provenance.scope='partial';assert.match(identityErrors(d,file).join(),/摘要已失效/);});
 test('report optional designs and escaping',()=>{const d=clone(cast);d.characters[0].name='<script>danger</script>';const html=renderIdentity(d,true);assert.ok(!html.includes('<script>danger'));assert.ok(html.includes('C01'));assert.ok(html.includes('skipped'));});
 test('render formal CLI',()=>{write(file,cast);assert.equal(cli('render',file,'--html').status,0);assert.notEqual(cli('images',file).status,0);});
 const outline={schemaVersion:5,source:'回声台',provenance:{...clone(cast.provenance),totalEpisodes:1},story:{summary:'停电中的交接。',sourceRefs:ref(1,10)},beats:[],episodes:[{ep:1,synopsis:'核对并交接。',sourceRefs:ref(1,10)}]};
 outline.provenance.documents[0].path='source.txt';
 const outlinePath=join(temp,'outline.json');
 test('optional v5 story-only accepted',()=>{write(outlinePath,outline);const r=cli('seed','--source',source,'--title','回声台','--outline',outlinePath);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).characters.length,0);write(file,cast);assert.equal(cli('validate',file,'--outline',outlinePath).status,0);});
 test('outline cannot borrow cast full coverage to hide its own gaps',()=>{
  write(file,cast);const d=clone(outline);d.provenance.scope='partial';d.provenance.coverage=ref(1,3);write(outlinePath,d);
  const r=cli('validate',file,'--outline',outlinePath);assert.notEqual(r.status,0);assert.match(r.stdout+r.stderr,/超出已读范围/);
  d.story.sourceRefs=ref(1,3);d.episodes[0].sourceRefs=ref(1,3);d.episodes[0].ending={event:'未回答的问题',question:{id:'Q01',text:'谁在窗外？',sourceRefs:ref(9)}};write(outlinePath,d);
  assert.notEqual(cli('validate',file,'--outline',outlinePath).status,0);
 });
 test('outline complete and required story fields cannot be falsified',()=>{
  write(file,cast);
  for(const change of [d=>d.provenance.totalEpisodes=999,d=>delete d.episodes[0].synopsis,d=>delete d.story.sourceRefs,d=>d.notes=[{text:'缺少来源与性质'}]]) {
    const d=clone(outline);change(d);write(outlinePath,d);assert.notEqual(cli('validate',file,'--outline',outlinePath).status,0);
  }
 });
 test('provided broken/wrong/mismatched outline fails',()=>{for(const mutate of [d=>d.schemaVersion=4,d=>d.source='另一部',d=>d.characters=[],d=>d.provenance.documents[0].sha256='2'.repeat(64),d=>delete d.story]){const d=clone(outline);mutate(d);write(outlinePath,d);assert.notEqual(cli('validate',file,'--outline',outlinePath).status,0);}writeFileSync(outlinePath,'{');assert.notEqual(cli('validate',file,'--outline',outlinePath).status,0);assert.notEqual(cli('validate',file,'--outline',join(temp,'absent')).status,0);});
 test('only cast v1 and current commands are accepted',()=>{
  for(const args of [['seed',file],['merge',temp]])assert.notEqual(cli(...args).status,0,args[0]);
  const designed=JSON.parse(readFileSync(join(root,'examples/渡口-cast.json'),'utf8'));
  for(const value of [{source:'回声台',lang:'zh',summary:'',characters:[]},[],{...clone(cast),schemaVersion:2}]) {
    write(file,value);for(const cmd of ['validate','render','images'])assert.notEqual(cli(cmd,file,'--no-production').status,0,cmd);
  }
  assert.equal(designed.schemaVersion,1);
 });
 test('optional voice does not force profile/image',()=>{
  const d=clone(cast),designed=JSON.parse(readFileSync(join(root,'examples/渡口-cast.json'),'utf8'));
  d.characters[0].voice=designed.characters[0].voice;write(file,d);
  assert.equal(cli('validate',file,'--no-production').status,0);
  d.characters[0].voice.prompt='中文声音';write(file,d);assert.notEqual(cli('validate',file).status,0);
 });
 test('optional profile does not force voice/image',()=>{
  const d=clone(cast),designed=JSON.parse(readFileSync(join(root,'examples/渡口-cast.json'),'utf8'));
  d.characters[0].persona={...designed.characters[0].persona,evidence:[],relationships:[]};write(file,d);
  assert.equal(cli('validate',file,'--no-production').status,0);
 });
 test('formal image plan pins ID/path/facts/design and skips undesigned',()=>{
  const d=clone(cast),designed=JSON.parse(readFileSync(join(root,'examples/渡口-cast.json'),'utf8'));
  d.characters[0].image=designed.characters[0].image;write(file,d);
  const production={schemaVersion:3,source:d.source,style:{label:{zh:'真人实拍'},phrase:'live action',character:{render:'Photorealistic portrait of a real human actor',surface:'authentic materials',lighting:'soft directional light',negative:'watermark',tags:['photorealistic']}},image:{model:'nanobanana2',asset:{resolution:'2K',aspectRatio:'16:9'}}};
  const pp=join(temp,'params.json');write(pp,production);
  const r=cli('images',file,'--production',pp);assert.equal(r.status,0,r.stderr);
  const plan=JSON.parse(r.stdout);assert.equal(plan.jobs.length,1);assert.equal(plan.jobs[0].id,'C01');assert.ok(plan.jobs[0].output.endsWith('/images/C01-sheet.png'));assert.ok(plan.jobs[0].identityFingerprint);assert.ok(plan.jobs[0].designFingerprint);
 });
 test('reordering preserves only an already valid bound review',()=>{
  const d=clone(cast);d.review={status:'confirmed',by:'test',note:'source reviewed',inputHash:reviewHash(d)};d.status='identified';
  const c=clone(d);c.characters.reverse();const r=reconcile(c,d);assert.equal(r.review.status,'confirmed');assert.deepEqual(identityErrors(r,file),[]);
 });
 test('per-tier budgets retain exact meaning and block excess',()=>{
  const d=clone(cast);d.characters.forEach((c,i)=>c.tier=i===0?'lead':i===1?'support':'functional');
  d.budgets={characters:8,maxLeads:1,maxSupport:1,maxFunctional:6};assert.deepEqual(identityErrors(d,file),[]);
  d.budgets.maxFunctional=5;assert.match(identityErrors(d,file).join(),/超额/);
  d.budgets.maxFunctional=6;delete d.characters[0].tier;assert.match(identityErrors(d,file).join(),/tier/);
 });
 test('incremental budget cannot disappear or become a reference without user grounds',()=>{
  const d=clone(cast);d.budgets={reference:{characters:8}};assert.throws(()=>reconcile(d,cast),/budgetChanges/);
  d.budgetChanges=[{key:'characters',from:8,to:null,basis:'样例作者明确取消原总数预算，仅作参考'}];
  const r=reconcile(d,cast);assert.deepEqual(identityErrors(r,file),[]);assert.equal(r.lifecycle.previousBudgets.characters,8);
  delete r.budgetChanges;assert.match(identityErrors(r,file).join(),/budgetChanges/);
 });
 test('reference budgets warn without downgrading explicit budgets',()=>{
  const d=clone(cast);d.budgets={reference:{characters:1}};assert.deepEqual(identityErrors(d,file),[]);
  assert.ok(budgetChecks(d).some(g=>g.status==='fail'&&g.level==='warn'));
  write(file,d);assert.equal(cli('validate',file,'--no-production').status,0);
  d.budgets.characters=1;assert.match(identityErrors(d,file).join(),/超额/);
 });
 test('unrecognized explicit budgets cannot be ignored',()=>{const d=clone(cast);d.budgets.cast=1;assert.match(identityErrors(d,file).join(),/预算/);});
 test('explicit null baseline is not missing',()=>{
  const p=join(temp,'null.json');write(p,null);const d=clone(draft);write(file,d);assert.notEqual(cli('reconcile',file,'--previous',p).status,0);
 });
 test('unrelated existing source revision does not affect identities',()=>{
  const d=clone(cast);d.provenance.documents.push({id:'D02',path:source,sha256:hash(readFileSync(source)),lineCount:10});d.provenance.coverage.push({documentId:'D02',startLine:1,endLine:10});const previous=reconcile(d,cast);const c=clone(previous);c.provenance.documents[1].sha256='f'.repeat(64);const r=reconcile(c,previous);assert.deepEqual(r.lifecycle.recheckIds,[]);
 });
 test('committed formal sample is independently valid',()=>{
  const p=join(root,'examples/回声台-cast.json'),d=JSON.parse(readFileSync(p,'utf8'));assert.deepEqual(identityErrors(d,p),[]);assert.equal(d.review.status,'pending');
 });
 test('recorded mapping keeps original source version across revisions',()=>{
  const d=clone(cast);d.characters[0].name='夜班许禾';const changes=[{type:'correct',from:['C01'],to:['C01'],basis:'source',reason:'原文限定夜班',sourceRefs:[{documentId:'D01',startLine:2,endLine:2,quote:'大家叫我小禾'}]}];
  const r=reconcile(d,cast,changes);assert.deepEqual(identityErrors(r,file),[]);assert.equal(r.lifecycle.changes[0].sourceDocuments[0].sha256,cast.provenance.documents[0].sha256);
  const original=readFileSync(source);
  try {
    writeFileSync(source,original.toString().replace('大家叫我小禾','同事叫我小禾'));
    const c=clone(r);c.provenance.documents[0].sha256=hash(readFileSync(source));const next=reconcile(c,r);
    assert.deepEqual(identityErrors(next,file),[]);assert.notEqual(next.lifecycle.changes[0].sourceDocuments[0].sha256,next.provenance.documents[0].sha256);
  } finally {writeFileSync(source,original);}
 });
 test('formal report JSON export roundtrip preserves artifact',()=>{
  const d=clone(cast);d.summary='</script><b>not markup</b>';const html=renderIdentity(d,true);
  const embedded=html.match(/<script type="application\/json" id="cast-data">([\s\S]*?)<\/script>/)[1];assert.deepEqual(JSON.parse(embedded),d);assert.ok(!html.includes('</script><b>not markup'));
 });
 test('standalone CLI cannot claim full workflow completion',()=>{write(file,cast);assert.notEqual(cli('validate',file,'--full-workflow').status,0);});
 test('source missing/changed blocked',()=>{write(file,cast);writeFileSync(source,'changed');assert.notEqual(cli('validate',file).status,0);rmSync(source);assert.notEqual(cli('validate',file).status,0);});
 console.log(`mint-characters identity v1: ${tests} tests passed`);
} finally {rmSync(temp,{recursive:true,force:true});}
