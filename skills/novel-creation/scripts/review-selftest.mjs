import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parsePrompt} from './lib/prompt-review.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const temp=mkdtempSync(resolve(tmpdir(),'prompt-review-'));
const cli=resolve(root,'scripts/novel-creation.mjs');
function run(args,ok=true){const r=spawnSync(process.execPath,[cli,...args],{cwd:resolve(temp,'creation'),encoding:'utf8'});assert.equal(r.status===0,ok,r.stdout+r.stderr);return r;}
try {
 cpSync(resolve(root,'examples'),temp,{recursive:true});
 const doc='收书人-creation.json';
 run(['export',doc,'--out','.']);
 const manifest=JSON.parse(readFileSync(resolve(temp,'creation/manifest.json')));
 const ids=manifest.segments.map(s=>s.segment);
 const md=resolve(temp,'creation',ids[0],'prompt.md');
 const original=readFileSync(md,'utf8');
 assert.equal(parsePrompt(original).meta.status,'draft');
 assert.throws(()=>parsePrompt(original+'<!-- prompt:start -->'));
 run(['videos','manifest.json','--dry-run'],false);
 writeFileSync(resolve(temp,'creation/opinion.txt'),'镜头与剧本逐项核对；本次批准。');
 const review=(id,status,ok=true)=>run(['review','manifest.json','--segment',id,'--status',status,...(status==='pending_review'?[]:['--reviewer','independent-reviewer','--opinion','opinion.txt'])],ok);
 review(ids[0],'approved',false);
 review(ids[0],'pending_review'); review(ids[0],'changes_requested');
 assert.match(readFileSync(md,'utf8'),/changes_requested/);
 // Revision and review opinion survive re-export.
 const rejected=readFileSync(md,'utf8'); run(['export',doc]); assert.equal(readFileSync(md,'utf8'),rejected);
 for(const id of ids){review(id,'pending_review');review(id,'approved');}
 const output=JSON.parse(run(['videos','manifest.json','--dry-run']).stdout);
 assert.ok(output.approval.input);
 assert.ok(!output.jobs[0].prompt.includes('本次批准'));
 const approved=readFileSync(md,'utf8');
 writeFileSync(md,approved.replace('<!-- prompt:end -->','新增动作\n<!-- prompt:end -->'));
 run(['videos','manifest.json'],false);
 writeFileSync(md,approved);
 const image=resolve(temp,'creation',manifest.segments[0].images[0].path);
 const bytes=readFileSync(image);writeFileSync(image,Buffer.concat([bytes,Buffer.from('changed')]));
 run(['videos','manifest.json'],false);writeFileSync(image,bytes);
 const source=resolve(temp,'creation',doc); const sourceText=readFileSync(source,'utf8');
 const changed=JSON.parse(sourceText); changed.episodes[0].segments[0].cuts[0].seconds+=0.1;
 writeFileSync(source,JSON.stringify(changed));run(['videos','manifest.json'],false);writeFileSync(source,sourceText);
 const mf=resolve(temp,'creation/manifest.json'), mt=readFileSync(mf,'utf8');
 manifest.video.resolution='changed';writeFileSync(mf,JSON.stringify(manifest));run(['videos','manifest.json'],false);writeFileSync(mf,mt);
 review(ids[0],'pending_review');writeFileSync(md,readFileSync(md,'utf8').replace('<!-- prompt:end -->','变更\n<!-- prompt:end -->'));review(ids[0],'approved',false);
 // Missing assets must remain reportable, without permitting generation.
 writeFileSync(md,approved);rmSync(image);
 review(ids[0],'blocked');assert.equal(parsePrompt(readFileSync(md,'utf8')).meta.status,'blocked');
 run(['videos','manifest.json'],false);writeFileSync(image,bytes);
 // Invalid upstream must not prevent the reviewer from recording a blocker.
 const scriptPath=resolve(temp,'script/收书人-script.json'), scriptText=readFileSync(scriptPath,'utf8');
 writeFileSync(scriptPath,'{broken');review(ids[0],'blocked');writeFileSync(scriptPath,scriptText);
 // Export refreshes machine header while preserving authored body and review.
 const resolutionDoc=JSON.parse(sourceText);resolutionDoc.video={...manifest.video,resolution:'720p'};
 writeFileSync(source,JSON.stringify(resolutionDoc));
 const beforeRefresh=parsePrompt(readFileSync(md,'utf8'));
 run(['export',doc]);
 const refreshed=parsePrompt(readFileSync(md,'utf8'));
 assert.match(refreshed.text,/resolution 720p/);assert.equal(refreshed.prompt,beforeRefresh.prompt);assert.deepEqual(refreshed.meta,beforeRefresh.meta);
 assert.equal(refreshed.text.split('## 当前审核\n')[1],beforeRefresh.text.split('## 当前审核\n')[1]);
 writeFileSync(source,sourceText);run(['export',doc]);
 // Markdown, not the stale JSON mirror, is validated and rendered.
 const baseline=readFileSync(md,'utf8');
 writeFileSync(md,baseline.replace('[Shot 1]','[Shot 99]'));run(['validate',doc],false);
 writeFileSync(md,baseline);
 assert.match(run(['render',doc,'--md']).stdout,/blocked/);
 assert.match(run(['render',doc,'--html']).stdout,/Prompt 审核/);
 // Separate output directory remains portable within the same project.
 const pack=resolve(temp,'separate-pack');run(['export',doc,'--out',pack]);
 run(['validate',doc,'--pack',pack]);
 const separate=JSON.parse(readFileSync(resolve(pack,'manifest.json'),'utf8'));
 assert.equal(separate.segments[0].prompt,ids[0]+'/prompt.md');
 for (const id of ids) {
   run(['review',resolve(pack,'manifest.json'),'--segment',id,'--status','pending_review']);
   run(['review',resolve(pack,'manifest.json'),'--segment',id,'--status','approved','--reviewer','independent-reviewer','--opinion','opinion.txt']);
 }
 run(['videos',resolve(pack,'manifest.json'),'--dry-run']);
 // Machine header edits cannot mislead an approval review.
 const separateMd=resolve(pack,ids[0],'prompt.md'), separateText=readFileSync(separateMd,'utf8');
 writeFileSync(separateMd,separateText.replace('768p','wrong'));
 run(['videos',resolve(pack,'manifest.json')],false);
 writeFileSync(md,'# legacy\n\n---\nold prompt');run(['export',doc],false);
 console.log('PASS review workflow: reject/revise/approve/plan; overwrite protection; body isolation; stale source/image/params; malformed/legacy rejection');
} finally {rmSync(temp,{recursive:true,force:true});}
