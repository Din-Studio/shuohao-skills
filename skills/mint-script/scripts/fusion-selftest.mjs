#!/usr/bin/env node
// Own story, source bytes, production interface and migration regression tests.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, cpSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateScript, checkup, computeStats, beatSeconds, renderHtml, renderMarkdown, seedFromOutline, outlineInputErrors } from './mint-script.mjs';
import { verifySources, evidenceErrors, provenanceErrors, sourceLineCount, unionRanges, rebaseProvenance } from './lib/source.mjs';
import { checkKnownCreation } from './lib/downstream.mjs';
import { migrateV4, migrateV4File } from './lib/migration.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = join(root,'examples/夜班水尺-script.json');
const DOC = JSON.parse(readFileSync(fixture,'utf8'));
const OUTLINE = JSON.parse(readFileSync(join(root,'examples/修伞簿-outline.fixture.json'),'utf8'));
const OLD = JSON.parse(readFileSync(join(root,'scripts/fixtures/legacy-script-v3.json'),'utf8'));
const clone = structuredClone;
let count = 0;
const test = (name,fn) => {try {fn();count++;} catch(e) {throw new Error(name,{cause:e});}};
const bad = (name,mutate) => test(name,()=>{const d=clone(DOC);mutate(d);assert(validateScript(d).length);});
const first = d => d.episodes[0].scenes[0];
test('partial supplied episodes preserve gaps and missing production target',()=>{
  assert.deepEqual(validateScript(DOC),[]); assert.deepEqual(DOC.episodes.map(e=>e.ep),[7,9]);
  assert(validateScript(DOC,{requireTarget:true}).some(e=>e.includes('targetSeconds')));
  assert.equal(checkup(DOC).sourceVerification,'not-performed');
  assert.equal(checkup(DOC).contentReview,'not-performed');
  assert.equal(verifySources(DOC,fixture).status,'pass');
});
test('damaged values produce diagnostics, not uncaught type errors',()=>{
  for(const value of [null,[],{},'broken',3]) {
    assert(validateScript(value,{outline:OUTLINE}).length);
    assert(outlineInputErrors(value).length);
  }
  const o=clone(OUTLINE);o.episodes=[null];o.beats=[null];assert(outlineInputErrors(o).length);
});
test('real outline source verification and no invented seed duration',()=>{
  assert.equal(verifySources(OUTLINE,join(root,'examples/修伞簿-outline.fixture.json'),{outline:true}).status,'pass');
  const d=seedFromOutline(OUTLINE,[2,2]);assert.equal(d.provenance.scope,'partial');
  assert(!('targetSeconds' in d.episodes[0]));assert(!('opening' in d.episodes[0]));
  assert.deepEqual(validateScript(d,{stage:'skeleton',outline:OUTLINE}),[]);
});
test('shared outline/script source identity cannot silently drift',()=>{
  const d=seedFromOutline(OUTLINE);d.provenance.documents[0].sha256='0'.repeat(64);
  assert(validateScript(d,{stage:'skeleton',outline:OUTLINE}).some(e=>e.includes('source versions differ')));
});
test('unmatched outline/script source identities fail reconciliation',()=>{
  const d=seedFromOutline(OUTLINE);d.provenance.documents[0].id='different';
  d.provenance.coverage.forEach(r=>r.documentId='different');
  assert(validateScript(d,{stage:'skeleton',outline:OUTLINE}).some(e=>e.includes('no matching outline source identity')));
});
test('migration preserves project validation boundaries',()=>{
  const invalid={schemaVersion:2};
  assert(migrateV4(OLD,{independent:true,ctx:{production:invalid},validate:validateScript}).errors.length);
  const doc=clone(OLD);doc.creativeBrief='local brief';
  assert(migrateV4(doc,{independent:true,ctx:{production:{schemaVersion:3,creativeBrief:'project brief'}},validate:validateScript}).errors.length);
});
test('union coverage never double-counts repeated reads',()=>{
  assert.deepEqual(unionRanges(DOC.provenance.coverage),[[1,19]]);
  assert.deepEqual(unionRanges([{startLine:1,endLine:3},{startLine:2,endLine:5},{startLine:8,endLine:9}]),[[1,5],[8,9]]);
});
test('raw text line count handles CRLF, empty source, trailing newline',()=>{
  assert.equal(sourceLineCount('a\rb\n'),2);assert.equal(sourceLineCount('a\r\nb\r\n'),2);assert.equal(sourceLineCount('a\nb'),2);assert.equal(sourceLineCount(''),0);assert.equal(sourceLineCount('\n'),1);
});
for(const [name,edit] of [
  ['novel provenance',d=>d.provenance.kind='novel'],['outline provenance',d=>d.provenance.kind='outline'],
  ['missing documents',d=>d.provenance.documents=[]],['duplicate document ID',d=>d.provenance.documents.push(clone(d.provenance.documents[0]))],
  ['non-hash',d=>d.provenance.documents[0].sha256='a'],['uppercase hash',d=>d.provenance.documents[0].sha256='A'.repeat(64)],
  ['absolute source path',d=>d.provenance.documents[0].path='/tmp/source'],['unknown scope',d=>d.provenance.scope='all'],
  ['false whole-series claim',d=>d.provenance.scope='complete'],['bad total',d=>d.provenance.totalEpisodes=0],
  ['episode exceeds total',d=>d.provenance.totalEpisodes=8],['unknown provenance field',d=>d.provenance.read=true],
  ['duplicate normalized document path',d=>d.provenance.documents.push({...d.provenance.documents[0],id:'duplicate',path:'./夜班水尺-source.txt'})],
  ['non-string digest',d=>d.provenance.documents[0].sha256=[d.provenance.documents[0].sha256]],
  ['missing owned coverage',d=>d.provenance.coverage=[]],['coverage outside bytes',d=>d.provenance.coverage[0].endLine=20],
  ['zero-based source',d=>first(d).flow[0].sourceRefs[0].startLine=0],['reverse source',d=>first(d).flow[0].sourceRefs[0].endLine=2],
  ['unknown source doc',d=>first(d).flow[0].sourceRefs[0].documentId='unknown'],['fractional source line',d=>first(d).flow[0].sourceRefs[0].startLine=1.1],
  ['missing flow evidence',d=>delete first(d).flow[0].sourceRefs],['missing note evidence',d=>delete first(d).notes[0].sourceRefs],
  ['unowned source',d=>d.provenance.coverage=[{documentId:'night',startLine:1,endLine:5}]],
  ['orphan sourceRefs',d=>delete d.provenance],['empty note',d=>first(d).notes[0].text=' '],['speaking note',d=>first(d).notes[0].line='台词'],
  ['note invalid kind',d=>first(d).notes[0].kind='dialogue'],['note estimates time',d=>first(d).notes[0].seconds=1],
  ['parallel context',d=>first(d).context='secret'],['candidate formal flow',d=>first(d).flow[0].candidate=true],
  ['flow kind conflict',d=>first(d).flow[0].subtitle='字幕'],['audio on action',d=>first(d).flow[1].audio={mode:'inner'}],
  ['audio on subtitle',d=>d.episodes[0].scenes[1].flow[2].audio={mode:'offscreen'}],
  ['invalid mode',d=>first(d).flow[0].audio.mode='silent'],['subjective not boolean',d=>first(d).flow[0].audio.subjective='false'],
  ['unknown listener',d=>first(d).flow[0].audio.audibleTo=['C99']],['duplicate listener',d=>first(d).flow[0].audio.audibleTo=['C01','C01']],
  ['sound speaker',d=>d.episodes[0].scenes[1].flow[1].speaker='VO'],['invalid sound seconds',d=>d.episodes[0].scenes[1].flow[1].seconds=0],
  ['subtitle bad seconds',d=>d.episodes[0].scenes[1].flow[2].seconds='2'],['line custom seconds',d=>first(d).flow[0].seconds=1],
  ['no implicit authorization',d=>first(d).flow[0].transformation={reason:'改为声音'}],
  ['empty authorization',d=>first(d).notes[0].transformation={reason:'归并',authorization:' '}]
]) bad(name,edit);
test('complete scope requires union coverage and actual 1..N',()=>{
  const d=clone(DOC);d.episodes[0].ep=1;d.episodes[1].ep=2;d.provenance.scope='complete';d.provenance.totalEpisodes=2;
  assert.deepEqual(provenanceErrors(d.provenance,d.episodes),[]);
  d.provenance.coverage=[{documentId:'night',startLine:1,endLine:18}];assert(provenanceErrors(d.provenance,d.episodes).length);
});
test('source notes optional scene refs and multiple exact source ranges',()=>{
  const d=clone(DOC);delete first(d).sourceRefs;
  first(d).notes[0].sourceRefs.push({documentId:'night',startLine:19,endLine:19});
  first(d).notes[0].transformation={reason:'合并两处限制，不改变意义',authorization:'样例任务允许归并非发声说明'};
  assert.deepEqual(validateScript(d),[]);
});
test('notes never estimate time, speak or claim, repeated actual lines retained',()=>{
  const d=clone(DOC), before=computeStats(d);first(d).notes[1].text+='很长的背景说明。'.repeat(200);
  assert.deepEqual(computeStats(d),before);
  assert.equal(before.totals.lines,3);assert.equal(before.castLines.find(c=>c.id==='C02').count,2);
  assert.notDeepEqual(first(d).flow[0].sourceRefs,d.episodes[1].scenes[0].flow[1].sourceRefs);
  assert.equal(beatSeconds({sound:'铃声',seconds:1}),1);assert.equal(beatSeconds({subtitle:'复核中。'}),2.5);
  assert.equal(beatSeconds({subtitle:'复核中。',seconds:2}),2);assert.equal(beatSeconds({sound:'铃声',seconds:-1}),null);
});
test('HTML/Markdown deliver notes, audio, sound, subtitle and exact source relations',()=>{
  for(const render of [renderHtml,renderMarkdown]) for(const lang of ['zh','en']) {
    const output=render(DOC,{lang});
    for(const required of ['复核中。','远处报警器短鸣。','audibleTo','subjective','sourceRefs','暂不公开','钥匙仍由C01保管','闸室门外']) assert(output.includes(required));
  }
});
for(const mutate of [o=>delete o.provenance,o=>o.schemaVersion=3,o=>o.params.minutesPerEpisode=1,o=>o.adaptation={},o=>o.arcs=[],o=>o.beats[0].kind='event',o=>o.scenes[0].reusePlan='重复使用',o=>delete o.beats[0].sourceRefs,o=>o.episodes[2].ending.question.resolution='required',o=>o.episodes[2].ending.question.dueByEp=3]) test('retired/damaged outline contract cannot be dual-read',()=>{const o=clone(OUTLINE);mutate(o);assert(outlineInputErrors(o).length);});
const dir=mkdtempSync(join(tmpdir(),'script-fusion-'));
const write=(file,doc)=>writeFileSync(file,JSON.stringify(doc,null,2)+'\n');
const cli=(...args)=>spawnSync(process.execPath,[join(root,'scripts/mint-script.mjs'),...args],{encoding:'utf8'});
try {
  const file=join(dir,'input.json'), source=join(dir,'夜班水尺-source.txt');write(file,DOC);cpSync(join(root,'examples/夜班水尺-source.txt'),source);
  test('explicit verification CLI and production-target boundary',()=>{
    assert.equal(cli('verify-sources',file,'--no-production').status,0);
    assert.equal(cli('validate',file,'--production-ready','--no-production').status,1);
    assert.equal(JSON.parse(cli('checkup',file,'--json','--no-production').stdout).sourceVerification,'not-performed');
  });
  test('changed bytes, changed line count and missing source all fail rather than skip',()=>{
    const bytes=readFileSync(source);writeFileSync(source,Buffer.concat([bytes,Buffer.from('变更\n')]));
    assert.equal(verifySources(DOC,file).status,'fail');assert.equal(cli('verify-sources',file,'--no-production').status,1);
    writeFileSync(source,Buffer.from(bytes.toString().replace('沈汀','沈河')));assert.equal(verifySources(DOC,file).status,'fail');
    rmSync(source);assert.equal(verifySources(DOC,file).status,'fail');
    symlinkSync(join(dir,'missing'),source);assert.equal(verifySources(DOC,file).status,'fail');rmSync(source);
    writeFileSync(source,Buffer.from([0xff]));assert.equal(verifySources(DOC,file).status,'fail');writeFileSync(source,bytes);
    assert.equal(verifySources(DOC).status,'fail');
  });
  test('source provenance rebase is explicit, never relative to process CWD',()=>{
    const p=rebaseProvenance(DOC.provenance,file,join(dir,'script/out.json'));assert.equal(p.documents[0].path,'../夜班水尺-source.txt');
    assert.equal(DOC.provenance.documents[0].path,'夜班水尺-source.txt');
  });
  mkdirSync(join(dir,'creation'));
  const produced=clone(DOC);for(const [i,e] of produced.episodes.entries())e.targetSeconds=computeStats(produced).episodes[i].est;
  const creation={schemaVersion:3,source:produced.source,episodes:produced.episodes.map(ep=>({ep:ep.ep,segments:ep.scenes.map((scene,i)=>({id:`E${ep.ep}-${i+1}`,sceneIndex:i+1,cuts:scene.flow.map((b,j)=>({seconds:beatSeconds(b),beats:[j+1,j+1]}))}))}))};
  // One line owner; a later cut, later segment and another scene continue that occurrence.
  creation.episodes[0].segments[0].cuts[3].audioRefs=[[1,3]];
  creation.episodes[0].segments[1].cuts[0].audioRefs=[[1,3]];
  const firstSegment=creation.episodes[0].segments[0];
  creation.episodes[0].segments.splice(1,0,{id:'E7-continuation',sceneIndex:1,cuts:firstSegment.cuts.splice(3)});
  const creationFile=join(dir,'creation/plan.json');write(creationFile,creation);
  const check=c=>{write(creationFile,c);return checkKnownCreation(produced,{root:dir})[0];};
  test('audio continuation across cuts, segments and scenes preserves exact ownership/time',()=>{
    assert.equal(check(creation).status,'pass');assert.equal(computeStats(produced).totals.lines,3);
    const noTarget=clone(produced);delete noTarget.episodes[0].targetSeconds;assert.equal(checkKnownCreation(noTarget,{root:dir})[0].status,'fail');
  });
  for(const mutate of [
    c=>c.episodes[0].segments[0].cuts[0].audioRefs=[[1,3]],
    c=>c.episodes[0].segments[0].cuts[2].audioRefs=[[1,3]],
    c=>c.episodes[0].segments[1].cuts[0].audioRefs=[[1,2]],
    c=>c.episodes[0].segments[1].cuts[0].audioRefs=[[1,3],[1,3]],
    c=>c.episodes[0].segments[1].cuts[0].audioRefs=[[99,1]],
    c=>c.episodes[0].segments[1].cuts[0].audioRefs=[[1,3,4]],
    c=>c.episodes[0].segments[1].cuts[0].audioRefs='1,3',
    c=>c.episodes[1].segments[0].cuts[0].audioRefs=[[1,3]],
    c=>c.episodes[0].segments[1].cuts[0].beats=[3,4],
    c=>c.episodes[0].segments[2].cuts.shift(),
    c=>delete c.episodes[0].segments[1].cuts[0].audioRefs
  ]) test('bad continuation never cancels ownership/order guarantees',()=>{const c=clone(creation);mutate(c);assert.equal(check(c).status,'fail');});
  test('v4 migration keeps complete old document and never fabricates provenance',()=>{
    const r=migrateV4(OLD,{validate:validateScript});assert.deepEqual(r.errors,[]);assert.deepEqual(r.original,OLD);
    assert.equal(r.document.schemaVersion,4);assert.equal(r.document.provenance,null);assert(validateScript(r.document).length);
    assert.deepEqual(r.document.episodes,OLD.episodes);assert(r.pending.some(p=>p.path==='provenance'));
    assert.equal(migrateV4({...OLD,schemaVersion:2}).document,null);
    assert.deepEqual(validateScript(migrateV4(OLD,{independent:true,validate:validateScript}).document),[]);
  });
  const old=join(dir,'old.json'), out=join(dir,'new.draft');write(old,OLD);
  test('v4 migration preview, byte backup, exclusive output and review record',()=>{
    const bytes=readFileSync(old);assert.equal(migrateV4File(old,{out,validate:validateScript}).written,false);assert(!existsSync(out));
    const r=migrateV4File(old,{out,confirm:true,validate:validateScript});assert(r.written);assert(readFileSync(old).equals(bytes));assert(readFileSync(r.backup).equals(bytes));
    assert.deepEqual(JSON.parse(readFileSync(r.record,'utf8')).original,OLD);
    assert.throws(()=>migrateV4File(old,{out,confirm:true,validate:validateScript}),/existing output/);
    assert.throws(()=>migrateV4File(old,{out:old,confirm:true,validate:validateScript}),/existing output/);
    const link=join(dir,'link.json');symlinkSync(old,link);assert.throws(()=>migrateV4File(link),/non-symlink/);
    const result=cli('migrate-v4',old,'--no-production');assert.equal(result.status,1);assert.equal(JSON.parse(result.stdout).written,false);
    const d=JSON.parse(cli('migrate-v4',old,'--independent','--confirm','--no-production').stdout);assert.equal(d.document.schemaVersion,4);assert(!('provenance' in d.document));
  });
  test('v4 migration rejects structurally corrupted input, never repairs it silently',()=>{
    const d=clone(OLD);d.episodes[0].scenes[0].flow[0]={};assert(migrateV4(d,{validate:validateScript}).errors.length);
  });
  test('source verification survives standalone skill copy',()=>{
    const isolated=join(dir,'isolated');cpSync(root,isolated,{recursive:true});
    const r=spawnSync(process.execPath,[join(isolated,'scripts/mint-script.mjs'),'verify-sources',join(isolated,'examples/夜班水尺-script.json'),'--no-production'],{cwd:dir,encoding:'utf8'});
    assert.equal(r.status,0,r.stderr+r.stdout);
  });
} finally {rmSync(dir,{recursive:true,force:true});}
console.log(`✓ ${count} script fusion/source/audio/migration tests passed`);
