#!/usr/bin/env node
// Formal art v1 acceptance tests, entirely local and self-contained.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync,copyFileSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {seedFromSource,registerAsset,identityDigest,identityCoreDigest,stageErrors,lifecycleErrors,budgetChecks,verifySources,digest,sourceIdentity,assertStoryOutline,assertCharacters,upstreamErrors,characterIdentityDigest} from './lib/stage.mjs';
import {seedFromOutline,validateArt,gateReport,renderHtml,renderMarkdown,imageJobsFrom,assetImageStem} from './mint-art.mjs';
import {confirm,makeCast,originalPath,storyDoc} from './test-fixtures.mjs';
const here=dirname(fileURLToPath(import.meta.url)), root=resolve(here,'..');
const temp=mkdtempSync(join(tmpdir(),'mint-art-stage-'));
let count=0;
const test=(name,fn)=>{try{fn();count++;}catch(e){e.message=name+': '+e.message;throw e;}};
const clone=structuredClone;
const cli=(...args)=>spawnSync(process.execPath,[join(here,'mint-art.mjs'),...args],{cwd:temp,encoding:'utf8'});
const source=join(temp,'原件.txt'),file=join(temp,'art.json'),previousFile=join(temp,'previous.json');
copyFileSync(originalPath,source);
const ref={documentId:'D01',startLine:1,endLine:4};
function fixture() {
  const d=seedFromSource(source,'桥下旗');d.provenance.coverage=[ref];
  const s=registerAsset(d,'scene','bridge-under','桥下');s.sourceRefs=[ref];s.decision='场次重复出现于同一桥墩空间，需要保持美术一致性';s.primary=true;s.facts={text:'已有裂纹的蓝旗靠在桥墩边',sourceRefs:[ref]};
  const p=registerAsset(d,'prop','blue-flag','蓝旗');p.sourceRefs=[ref];p.decision='交接和状态变化需要独立视觉连续性';p.relatedScenes=[s.id];p.facts={text:'同一蓝旗转交后裂纹仍在，不新建实物身份',sourceRefs:[ref]};
  return confirm(d);
}
const good=fixture();
const story=clone(storyDoc);story.provenance.documents[0].path='原件.txt';
const olderStory={...clone(story),schemaVersion:4};
const chars=makeCast(['巡检员','修桥员'],'桥下旗');chars.provenance.documents[0].path=source;
const save=(d=good)=>writeFileSync(file,JSON.stringify(d));
try {
  test('seed is only a skeleton',()=>{const d=seedFromSource(source,'桥下旗');assert.equal(d.schemaVersion,1);assert.equal(d.kind,'mint-art');assert.deepEqual(d.scenes,[]);assert.deepEqual(d.props,[]);assert.deepEqual(d.provenance.coverage,[]);assert.ok(stageErrors(d).length);assert.equal(d.status,'draft');});
  test('independent source CLI',()=>{const r=cli('seed','--source',source,'--title','桥下旗');assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout).scenes,[]);assert.match(r.stderr,/skipped/);assert.equal(cli('seed',file).status,1);assert.equal(cli('seed','--source').status,1);assert.equal(cli('seed','--source',source,'--title','桥下旗','--out',source).status,1);});
  test('independent design entry',()=>{const r=cli('seed','--design','--title','原创空间');assert.equal(r.status,0,r.stderr);const d=JSON.parse(r.stdout);assert.equal(d.mode,'design');assert.equal(d.provenance,undefined);assert.equal(cli('seed','--design','--source',source,'--title','冲突').status,1);});
  test('formal outline only background',()=>{assert.equal(assertStoryOutline(story),story);assert.throws(()=>seedFromOutline(story),/仅为故事背景/);assert.throws(()=>assertStoryOutline(olderStory),/仅支持 v5/);const d=clone(story);d.scenes=[];assert.throws(()=>assertStoryOutline(d),/不得具有资产表/);});
  test('optional supplied upstream cannot be hidden',()=>{const outlineFile=join(temp,'outline.json');writeFileSync(outlineFile,JSON.stringify(story));let r=cli('seed','--source',source,'--title','桥下旗','--outline',outlineFile);assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout).props,[]);for(const v of [olderStory,{},null,{...story,source:'别的剧本'}]){writeFileSync(outlineFile,JSON.stringify(v));assert.equal(cli('seed','--source',source,'--title','桥下旗','--outline',outlineFile).status,1);}assert.equal(cli('seed','--source',source,'--title','桥下旗','--outline',join(temp,'absent')).status,1);});
  test('identity-only records do not force design or images',()=>{assert.deepEqual(validateArt(good),[]);assert.ok(gateReport(good).find(g=>g.id==='anchors').status==='skipped');assert.deepEqual(imageJobsFrom(good,JSON.parse(readFileSync(join(root,'examples/雨棚留言-production.json')))).jobs,[]);for(const html of [renderHtml(good),renderMarkdown(good)]){assert.ok(html.includes('bridge-under'));assert.ok(html.includes('not-performed'));assert.ok(html.includes('sourceIdentity'));}assert.match(renderHtml(good),/仅登记身份，不要求出图/);});
  test('scene identity and prop decision explicit',()=>{const d=clone(good);d.scenes[0].decision='';assert.ok(validateArt(d).some(x=>x.includes('decision')));d.scenes[0].primary=undefined;assert.ok(validateArt(d).some(x=>x.includes('primary')));});
  test('confirmed characters authority requires no design',()=>{assert.equal(assertCharacters(chars),chars);assert.deepEqual(upstreamErrors(good,chars,'characters'),[]);const d=clone(good);d.props[0].carrierRefs=[{characterId:'C02',basis:'接收者为 characters 明确登记的修桥员，不按名称合并',sourceRefs:[ref]}];confirm(d);save(d);const castFile=join(temp,'cast.json');writeFileSync(castFile,JSON.stringify(chars));assert.equal(cli('validate',file,'--no-production','--cast',castFile).status,0);assert.equal(cli('validate',file,'--no-production').status,1);const bad=clone(chars);bad.review.status='pending';assert.throws(()=>assertCharacters(bad));d.props[0].carrierRefs[0].characterId='C99';assert.ok(upstreamErrors(d,chars,'characters').some(x=>x.includes('未知人物')));});
  test('character name equality is not authority',()=>{const d=clone(good);d.props[0].carriedBy=['修桥员'];assert.ok(stageErrors(d).some(x=>x.includes('自由名称')));const f=clone(good);f.props[0].sourceFacts={sourceRefs:[ref]};assert.ok(stageErrors(f).some(x=>x.includes('sourceFacts')));const c=clone(chars);c.characters[1].name=c.characters[0].name;assert.throws(()=>assertCharacters(c),/摘要/);});
  test('reordering and added episodes do not change S/P allocation',()=>{const d=clone(good);d.scenes.reverse();d.props.reverse();d.provenance.totalEpisodes=8;d.props[0].usage={episodes:[4,8],beats:[]};assert.deepEqual(lifecycleErrors(d,good),[]);assert.equal(d.scenes[0].id,'S01');assert.equal(d.props[0].id,'P01');});
  test('incremental seed carries designs, media, IDs and budgets',()=>{const d=clone(good);d.props[0].designStatus='ready';d.props[0].image={sheet:'historical prompt'};d.props[0].sheetImage='images/old.png';d.budgets={props:{kind:'explicit',max:2}};const updated=seedFromSource(source,'桥下旗',{existing:d});assert.deepEqual(updated.props,d.props);assert.deepEqual(updated.registry,d.registry);assert.deepEqual(updated.budgets,d.budgets);assert.equal(updated.incremental.previousDigest,digest(d));});
  test('register refuses key reuse and allocates high-water IDs',()=>{const d=clone(good);assert.throws(()=>registerAsset(d,'prop','blue-flag','另一物件'),/不得复用/);const a=registerAsset(d,'prop','seal','封条');assert.equal(a.id,'P02');assert.equal(assetImageStem(a,d),'P02');a.name='封桥封条';assert.equal(assetImageStem(a,d),'P02');});
  test('silent deletion and ID reuse blocked',()=>{const d=clone(good);d.props=[];assert.ok(lifecycleErrors(d,good).length);d.registry.entries=d.registry.entries.filter(e=>e.id!=='P01');assert.ok(lifecycleErrors(d,good).some(x=>x.includes('不得删除')));const bad=clone(good);bad.props[0].identityKey='another';bad.registry.entries.find(e=>e.id==='P01').key='another';assert.ok(lifecycleErrors(bad,good).some(x=>x.includes('复用')));});
  const change=(type,from,to)=>({id:'change-1',type,from,to,basis:'原件复读后人工明确身份变更；不是按名字推断',sourceRefs:[ref]});
  test('explicit delete retires and never reuses ID',()=>{const d=clone(good);d.props=[];d.registry.entries.find(e=>e.id==='P01').status='retired';d.registry.changes=[change('delete',['P01'],[])];assert.deepEqual(lifecycleErrors(d,good),[]);const a=registerAsset(d,'prop','new-flag','备用旗');assert.equal(a.id,'P02');d.registry.entries.find(e=>e.id==='P01').status='active';assert.ok(lifecycleErrors(d).length);});
  test('explicit merge mapping and basis',()=>{const old=clone(good);const second=registerAsset(old,'prop','mistaken-copy','另一叫法');second.sourceRefs=[ref];second.decision='此前误分';confirm(old);const d=clone(old);d.props=d.props.filter(a=>a.id!=='P02');d.registry.entries.find(e=>e.id==='P02').status='retired';d.registry.changes=[change('merge',['P01','P02'],['P01'])];assert.deepEqual(lifecycleErrors(d,old),[]);d.registry.changes[0].basis='';assert.ok(lifecycleErrors(d,old).length);});
  test('explicit split maps old to new identities',()=>{const d=clone(good);d.props=[];d.registry.entries.find(e=>e.id==='P01').status='retired';registerAsset(d,'prop','first-flag','第一面旗');registerAsset(d,'prop','second-flag','第二面旗');d.registry.changes=[change('split',['P01'],['P02','P03'])];assert.deepEqual(lifecycleErrors(d,good),[]);const bad=clone(d);bad.registry.changes[0].to=['P02'];assert.ok(lifecycleErrors(bad,good).length);});
  test('identity correction requires explicit evidence',()=>{const d=clone(good);d.props[0].name='封桥蓝旗';confirm(d);assert.ok(lifecycleErrors(d,good).some(x=>x.includes('纠正')));d.registry.changes=[change('correct',['P01'],['P01'])];assert.deepEqual(lifecycleErrors(d,good),[]);});
  test('explicit art budgets block excess; references only warn',()=>{const d=clone(good);d.budgets={props:{kind:'explicit',max:0},primaryScenes:{kind:'explicit',max:0}};assert.equal(budgetChecks(d).filter(g=>g.status==='fail'&&g.level==='error').length,2);assert.ok(validateArt(d).some(x=>x.includes('美术预算')));d.budgets.props.kind='reference';d.budgets.primaryScenes.kind='reference';assert.deepEqual(validateArt(d),[]);});
  test('explicit budgets cannot silently disappear incrementally',()=>{const old=clone(good);old.budgets={props:{kind:'explicit',max:2}};const d=clone(old);d.budgets={};assert.ok(lifecycleErrors(d,old).some(x=>x.includes('预算变更')));d.budgetChanges=[{key:'props',from:old.budgets.props,to:null,basis:'用户明确取消此预算'}];assert.deepEqual(lifecycleErrors(d,old),[]);});
  for(const [name,mutate]of [
    ['out of bounds',d=>d.props[0].sourceRefs[0].endLine=99],
    ['coverage hole',d=>d.provenance.coverage=[{...ref,endLine:2},{...ref,startLine:4}]],
    ['nested note range',d=>d.props[0].facts.notes=[{text:'restriction',sourceRefs:[{...ref,endLine:99}]}]],
    ['alias refs changed',d=>d.props[0].aliases=[{name:'旗杆',sourceRefs:[{...ref,startLine:2}]}]],
    ['empty refs',d=>d.props[0].sourceRefs=[]],
    ['false complete',d=>d.provenance.scope='complete'],
    ['document identity',d=>d.provenance.documents[0].id='OTHER'],
    ['digest changed',d=>d.provenance.documents[0].sha256='0'.repeat(64)]
  ])test(name+' invalidates evidence or identity review',()=>{const d=clone(good);mutate(d);assert.ok(stageErrors(d).length);});
  test('identity digest covers nested references, not unrelated coverage',()=>{const d=clone(good),old=identityDigest(d,d.props[0]);d.props[0].facts.extra={sourceRefs:[{...ref,startLine:2}]};assert.notEqual(identityDigest(d,d.props[0]),old);assert.notEqual(sourceIdentity(d),sourceIdentity(good));});
  test('actual source checks across validate/checkup/render/images',()=>{save();assert.equal(verifySources(good,file).status,'pass');writeFileSync(source,readFileSync(source,'utf8').replace('巡检员','另一个人'));for(const cmd of ['validate','checkup','render','images']){const r=cli(cmd,file,'--no-production');assert.equal(r.status,1,r.stdout);assert.match(r.stderr,/版本已变化|行数/);}assert.equal(verifySources(good,file).status,'fail');copyFileSync(originalPath,source);});
  test('source revision preserves IDs and invalidates only evidence it affects',()=>{const old=clone(good);writeFileSync(source,readFileSync(source,'utf8')+'仅被提及的备用旗，不建立资产。\n');const d=seedFromSource(source,'桥下旗',{existing:old});assert.equal(d.scenes[0].id,old.scenes[0].id);assert.equal(d.props[0].identityReview.status,'pending');assert.deepEqual(d.provenance.coverage,[]);assert.equal(d.status,'draft');copyFileSync(originalPath,source);});
  test('source paths resolved against artifact, not cwd',()=>{const d=clone(good);d.provenance.documents[0].path='原件.txt';save(d);assert.equal(cli('verify-sources',file).status,0);d.props[0].facts.quote={sourceRefs:[{...ref,quote:'不存在的原文引句'}]};save(d);assert.equal(cli('verify-sources',file).status,1);});
  test('missing originals and invalid UTF-8 fail',()=>{save();rmSync(source);assert.equal(cli('validate',file,'--no-production').status,1);writeFileSync(source,Buffer.from([255]));assert.equal(cli('seed','--source',source,'--title','桥下旗').status,1);copyFileSync(originalPath,source);});
  test('provided background versions and coverage must agree',()=>{assert.deepEqual(upstreamErrors(good,story,'outline'),[]);const d=clone(story);d.provenance.documents[0].sha256='0'.repeat(64);assert.ok(upstreamErrors(good,d,'outline').length);const p=clone(story);p.provenance.coverage=[{...ref,endLine:2}];assert.ok(upstreamErrors(good,p,'outline').length);});
  test('other versions never seed or validate',()=>{assert.throws(()=>seedFromOutline(olderStory));save({...good,schemaVersion:2});assert.equal(cli('validate',file,'--no-production').status,1);});
  test('reconcile checks baseline, returns pending and does not overwrite',()=>{save();writeFileSync(previousFile,JSON.stringify(good));const out=join(temp,'incremental.json');assert.equal(cli('reconcile',file).status,1);const r=cli('reconcile',file,'--previous',previousFile,'--out',out);assert.equal(r.status,0,r.stderr);const d=JSON.parse(readFileSync(out));assert.equal(d.props[0].id,'P01');assert.equal(d.status,'draft');assert.equal(d.props[0].identityReview.status,'confirmed');assert.deepEqual(d.registry,good.registry);assert.equal(cli('reconcile',file,'--previous',previousFile,'--out',out).status,1);});
  test('reports escape evidence and export unmodified JSON',()=>{const d=clone(good);d.props[0].facts.text='<script>alert("source")</script>';const before=JSON.stringify(d),html=renderHtml(d);assert.ok(html.includes('&lt;script&gt;'));assert.equal(JSON.stringify(d),before);const raw=html.match(/<script type="application\/json" id="art-data">([\s\S]*?)<\/script>/)[1];assert.deepEqual(JSON.parse(raw),d);});
  test('merge invalidates surviving target mappings, not unrelated identities',()=>{
    const old=clone(good),other=registerAsset(old,'prop','duplicate-key','此前误分的另一叫法');other.sourceRefs=[ref];other.decision='等待此次合并纠正的既有身份';confirm(old);
    const candidate=clone(old);candidate.props=candidate.props.filter(a=>a.id!=='P02');candidate.registry.entries.find(e=>e.id==='P02').status='retired';candidate.registry.changes=[change('merge',['P01','P02'],['P01'])];
    assert.ok(stageErrors(candidate).some(e=>e.includes('变更戳')));
    save(candidate);writeFileSync(previousFile,JSON.stringify(old));const out=join(temp,'merged.json');const r=cli('reconcile',file,'--previous',previousFile,'--out',out);assert.equal(r.status,0,r.stderr);
    const merged=JSON.parse(readFileSync(out));assert.equal(merged.props[0].identityReview.status,'pending');assert.equal(merged.scenes[0].identityReview.status,'confirmed');assert.notEqual(digest(merged.props[0]),digest(old.props[0]));assert.deepEqual(merged.incremental.recheckIds,['P01','P02']);
    confirm(merged);assert.deepEqual(stageErrors(merged),[]);
    // A second reconciliation must use this latest artifact, not its older baseline.
    writeFileSync(previousFile,JSON.stringify(merged));save(merged);const again=cli('reconcile',file,'--previous',previousFile);assert.equal(again.status,0,again.stderr);assert.equal(JSON.parse(again.stdout).props[0].id,'P01');
  });
  test('only source-dependent identities lose confirmation on revision',()=>{
    const old=clone(good),second=join(temp,'第二原件.txt');copyFileSync(originalPath,second);
    old.provenance.documents.push({...old.provenance.documents[0],id:'D02',path:second});old.provenance.coverage.push({...ref,documentId:'D02'});
    const a=registerAsset(old,'prop','separate-doc-flag','另一原件的旗');a.sourceRefs=[{...ref,documentId:'D02'}];a.decision='独立原件独立身份';confirm(old);
    writeFileSync(source,readFileSync(source,'utf8')+'补充来源。\n');const updated=seedFromSource(source,'桥下旗',{existing:old});assert.equal(updated.props.find(a=>a.id==='P01').identityReview.status,'pending');assert.equal(updated.props.find(a=>a.id==='P02').identityReview.status,'confirmed');assert.equal(identityDigest(updated,updated.props[1]),identityDigest(old,old.props[1]));copyFileSync(originalPath,source);
  });
  test('same-named characters remain distinct explicit authorities',()=>{
    const c=clone(chars);c.characters[1].name=c.characters[0].name;c.lifecycle.registry[1].fingerprint=characterIdentityDigest(c.characters[1],c.provenance);assert.equal(assertCharacters(c),c);const d=clone(good);d.props[0].carrierRefs=[{characterId:'C02',basis:'依据第二位人物的原件身份而非名字',sourceRefs:[ref]}];confirm(d);assert.deepEqual(upstreamErrors(d,c,'characters'),[]);
  });
  test('beat references are checked only against supplied story authority',()=>{
    const d=clone(good);d.props[0].usage={episodes:[4],beats:[],beatIds:['B99']};assert.ok(upstreamErrors(d,story,'outline').some(e=>e.includes('不存在')));d.props[0].usage.beatIds=['B01'];d.props[0].usage.episodes=[2];assert.ok(upstreamErrors(d,story,'outline').some(e=>e.includes('与关联集不符')));
  });
  test('CLI reports actual source verification and rejects duplicate upstream flags',()=>{
    save();const rendered=cli('render',file,'--md','--no-production');assert.equal(rendered.status,0,rendered.stderr);assert.match(rendered.stdout,/"originals": \{\s*"status": "pass"/);assert.equal(cli('validate',file,'--outline','missing.json','--outline','other.json','--no-production').status,1);
  });
  test('standalone copied skill runs without sibling files',()=>{const copy=join(temp,'standalone');cpSync(root,copy,{recursive:true});const run=(...args)=>spawnSync(process.execPath,[join(copy,'scripts/mint-art.mjs'),...args],{cwd:temp,encoding:'utf8'});assert.equal(run('seed','--source',join(copy,'examples/雨棚留言-原剧本.txt'),'--title','雨棚留言').status,0);const r=run('validate',join(copy,'examples/雨棚留言-art.json'),'--no-production');assert.equal(r.status,0,r.stderr);});
  console.log(`✓ art v1：${count} 项契约测试通过（原件、预算、身份生命周期与独立设计）`);
} finally {rmSync(temp,{recursive:true,force:true});}
