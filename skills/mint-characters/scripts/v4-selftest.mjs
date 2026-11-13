#!/usr/bin/env node
// Own source-backed fixture; no sibling code or fixtures.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,copyFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {seedFromOutline,renderMarkdown,renderHtml,imageJobsFrom,buildGraph,assembleCast} from './mint-characters.mjs';
import {assertOutline} from './lib/contracts.mjs';
import {sourceProjectionErrors,verifyOutlineSources,sourceLineCount} from './lib/source-facts.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=join(root,'examples/值班牌-outline-v4.json');
const doc=JSON.parse(readFileSync(file,'utf8'));
assert.deepEqual(sourceProjectionErrors(doc),[]);
assert.equal(sourceLineCount(Buffer.from('one\r\ntwo\r\n')),2);
assert.equal(sourceLineCount(Buffer.from('one\ntwo')),2);
verifyOutlineSources(doc,file);
const seed=seedFromOutline(doc,{outlinePath:file});
assert.deepEqual(seed.characters.map(c=>c.importance),['supporting','minor']);
assert.equal(seed.characters.length,2);
const withAlias=structuredClone(doc);
withAlias.characters[0].aliases=[{name:'夜班林安',sourceRefs:structuredClone(doc.characters[0].sourceRefs)}];
withAlias.characters[0].presence='voice-only';
const aliased=seedFromOutline(withAlias);
assert.deepEqual(aliased.characters[0].aliases,['夜班林安']);
assert.equal(aliased.characters[0].sourceFacts.presence,'voice-only');
assert.equal(aliased.characters[0].sourceFacts.aliases[0].sourceRefs[0].documentId,'D01');
assert.equal(seed.characters[0].name,seed.characters[1].name);
assert.notEqual(seed.characters[0].id,seed.characters[1].id);
const facts=seed.characters[0].sourceFacts;
assert.deepEqual(facts.sourceRefs,doc.characters[0].sourceRefs);
assert.equal(facts.documents[0].sha256,doc.provenance.documents[0].sha256);
assert.ok(facts.documents[0].path.startsWith('/'));
for(const mutate of [
 d=>d.provenance.kind='novel', d=>d.provenance.scope='complete',
 d=>d.provenance.coverage=[{documentId:'D01',startLine:1,endLine:2}],
 d=>d.characters[0].sourceRefs[0].endLine=99,
 d=>delete d.characters[0].tier, d=>delete d.scenes[0].primary,
 d=>d.scenes[0].reusePlan='invented', d=>d.params={minutesPerEpisode:2},
 d=>d.beats[0].position='early', d=>d.characters[1].id='C01',
 d=>d.characters[0].notes={text:'malformed',sourceRefs:[{documentId:'MISSING',startLine:999,endLine:999}]},
 d=>d.characters[0].aliases={name:'malformed'},
 d=>d.props[0].notes=[{text:'missing kind',sourceRefs:d.props[0].sourceRefs}]
]) {const bad=structuredClone(doc);mutate(bad);assert.throws(()=>assertOutline(bad));}
const md=renderMarkdown(seed.characters,seed.source), html=renderHtml(seed.characters,seed.source);
for(const display of [md,html]) {
 assert.ok(display.includes('今晚不算和解；接班人没有说话。'));
 assert.ok(display.includes(doc.provenance.documents[0].sha256));
 assert.ok(display.includes('sourceRefs') && display.includes('startLine') && display.includes('D01'));
}
const dangerous=structuredClone(seed);
dangerous.characters[0].sourceFacts.notes[0].text='<script>source-only & restriction</script>';
const safe=renderHtml(dangerous.characters,dangerous.source);
assert.ok(safe.includes('&lt;script&gt;source-only &amp; restriction&lt;/script&gt;'));
assert.ok(!safe.includes('<script>source-only'));
const assembledCards=assembleCast(seed.characters,{source:seed.source});
for(const lang of ['zh','en']) {
 const rendered=renderMarkdown(assembledCards.characters,assembledCards.source,'',lang);
 assert.ok(rendered.includes('## [C01] 林安') && rendered.includes('## [C02] 林安'));
}
assert.equal((html.match(/id="p-C01"/g) ?? []).length,1);
assert.equal((html.match(/id="p-C02"/g) ?? []).length,1);
const jobsCast=structuredClone(seed.characters);
for(const c of jobsCast)c.image.sheet='Reference portrait, no text.';
const imageJobs=imageJobsFrom(jobsCast).jobs;
assert.deepEqual(imageJobs.map(j=>j.key),['C01','C02']);
assert.deepEqual(imageJobs.map(j=>j.file),['images/C01-林安-sheet.png','images/C02-林安-sheet.png']);
jobsCast[0].persona.relationships=[{name:'林安',relation:'含糊身份'}];
assert.equal(buildGraph(jobsCast).edges.length,0,'同名关系不猜测');
jobsCast[0].persona.relationships=[{id:'C02',name:'林安',relation:'接班人'}];
assert.deepEqual(buildGraph(jobsCast).edges.map(e=>[e.a,e.b]),[['C01','C02']]);
const temp=realpathSync(mkdtempSync(join(tmpdir(),'mint-characters-v4-')));
try {
 const path=join(temp,'outline.json'), raw=join(temp,'值班牌-来源.txt');
 writeFileSync(path,JSON.stringify(doc));copyFileSync(join(root,'examples/值班牌-来源.txt'),raw);
 const run=()=>spawnSync(process.execPath,[join(root,'scripts/mint-characters.mjs'),'seed',path],{cwd:temp,encoding:'utf8'});
 assert.equal(run().status,0);
 for(const c of seed.characters)writeFileSync(join(temp,`card-${c.id}.json`),JSON.stringify(c));
 writeFileSync(join(temp,'summary.txt'),'同名的值班人交接，但没有和解。');
 const assembled=spawnSync(process.execPath,[join(root,'scripts/mint-characters.mjs'),'assemble',temp,'--source',seed.source],{encoding:'utf8'});
 assert.equal(assembled.status,0,assembled.stderr);
 assert.deepEqual(JSON.parse(assembled.stdout).characters.map(c=>c.id),['C01','C02']);
 writeFileSync(join(temp,'card-copy.json'),JSON.stringify(seed.characters[0]));
 const duplicate=spawnSync(process.execPath,[join(root,'scripts/mint-characters.mjs'),'assemble',temp,'--source',seed.source],{encoding:'utf8'});
 assert.notEqual(duplicate.status,0,'同一 ID 的重复卡片仍拒绝');
 writeFileSync(raw,readFileSync(raw,'utf8').replace('第','另'));
 assert.notEqual(run().status,0);
 assert.match(run().stderr,/版本已变化/);
 rmSync(raw);assert.notEqual(run().status,0);
} finally {rmSync(temp,{recursive:true,force:true});}
console.log('mint-characters v4 source projection: passed');
