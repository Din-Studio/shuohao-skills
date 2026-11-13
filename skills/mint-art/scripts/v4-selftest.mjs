#!/usr/bin/env node
// Own source-backed fixture; no sibling code or fixtures.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,copyFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {seedFromOutline,renderMarkdown,renderHtml,imageJobsFrom} from './mint-art.mjs';
import {assertOutline} from './lib/contracts.mjs';
import {sourceProjectionErrors,verifyOutlineSources,sourceLineCount} from './lib/source-facts.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=join(root,'examples/桥下旗-outline-v4.json');
const doc=JSON.parse(readFileSync(file,'utf8'));
assert.deepEqual(sourceProjectionErrors(doc),[]);
assert.equal(sourceLineCount(Buffer.from('one\r\ntwo\r\n')),2);
assert.equal(sourceLineCount(Buffer.from('one\ntwo')),2);
verifyOutlineSources(doc,file);
const seed=seedFromOutline(doc,{outlinePath:file});
assert.equal(seed.scenes[0].primary,true);
assert.equal(seed.scenes[0].seedNote,undefined);
assert.deepEqual(seed.props[0].usage.beatIds,['B01']);
assert.equal(seed.props[0].sourceFacts.notes[0].kind,'continuity');
const facts=seed.props[0].sourceFacts;
assert.deepEqual(facts.sourceRefs,doc.props[0].sourceRefs);
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
const md=renderMarkdown(seed), html=renderHtml(seed);
for(const display of [md,html]) {
 assert.ok(display.includes('裂纹仍存在；不能在设计中提前修复。'));
 assert.ok(display.includes(doc.provenance.documents[0].sha256));
 assert.ok(display.includes('sourceRefs') && display.includes('startLine') && display.includes('D01'));
}
const dangerous=structuredClone(seed);
dangerous.props[0].sourceFacts.notes[0].text='<script>source-only & restriction</script>';
const safe=renderHtml(dangerous);
assert.ok(safe.includes('&lt;script&gt;source-only &amp; restriction&lt;/script&gt;'));
assert.ok(!safe.includes('<script>source-only'));
const collision=structuredClone(seed);
collision.props[0].name=collision.scenes[0].name;
for(const a of [...collision.scenes,...collision.props])a.image.sheet='Asset reference, no text.';
const jobs=imageJobsFrom(collision).jobs;
assert.notEqual(jobs[0].file,jobs[1].file);
assert.ok(jobs[0].file.includes('S01-') && jobs[1].file.includes('P01-'));
const temp=realpathSync(mkdtempSync(join(tmpdir(),'mint-art-v4-')));
try {
 const path=join(temp,'outline.json'), raw=join(temp,'桥下旗-来源.txt');
 writeFileSync(path,JSON.stringify(doc));copyFileSync(join(root,'examples/桥下旗-来源.txt'),raw);
 const run=()=>spawnSync(process.execPath,[join(root,'scripts/mint-art.mjs'),'seed',path],{cwd:temp,encoding:'utf8'});
 assert.equal(run().status,0);
 writeFileSync(raw,readFileSync(raw,'utf8').replace('第','另'));
 assert.notEqual(run().status,0);
 assert.match(run().stderr,/版本已变化/);
 rmSync(raw);assert.notEqual(run().status,0);
} finally {rmSync(temp,{recursive:true,force:true});}
console.log('mint-art v4 source projection: passed');
