#!/usr/bin/env node
// Real CLI regressions plus one-at-a-time ablations of the four guards.
// All stories, originals and fixture builders belong to this skill.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,copyFileSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {seedFromSource,registerAsset,migrateArt,fileDigest,digest} from './lib/stage.mjs';
import {sourceLineCount} from './lib/source-facts.mjs';
import {confirm,originalDoc,originalPath,makeCast} from './test-fixtures.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'..');
const temp=mkdtempSync(join(tmpdir(),'mint-art-fixes-'));
const executable=process.env.MINT_ART_FIX_CLI??join(here,'mint-art.mjs');
const selected=process.env.MINT_ART_FIX_CASE;
const clone=structuredClone;
const source=join(temp,'原件A.txt'),other=join(temp,'原件B.txt');
copyFileSync(originalPath,source);
// Both originals are legal, readable UTF-8 with the same number of lines.
writeFileSync(other,readFileSync(source,'utf8').replaceAll('蓝旗','白旗'));
const ref={documentId:'D01',startLine:1,endLine:4};
const cli=(...args)=>spawnSync(process.execPath,[executable,...args],{cwd:temp,encoding:'utf8',maxBuffer:8*1024*1024});
const save=(name,doc)=>{const path=join(temp,name+'.json');writeFileSync(path,JSON.stringify(doc));return path;};
const success=(r,label)=>assert.equal(r.status,0,`${label}\n${r.stderr}\n${r.stdout}`);
const failure=(r,label,pattern)=>{assert.equal(r.status,1,`${label}\n${r.stderr}\n${r.stdout}`);if(pattern)assert.match(r.stderr+r.stdout,pattern,label);};
function art() {
  const d=seedFromSource(source,'桥下旗');d.provenance.coverage=[clone(ref)];
  const a=registerAsset(d,'prop','blue-flag','蓝旗');a.sourceRefs=[clone(ref)];a.decision='交接实物需独立保持视觉连续性';
  return confirm(d);
}
function story() {
  const d=clone(originalDoc);d.schemaVersion=5;
  for(const k of ['characters','scenes','props'])delete d[k];
  for(const e of d.episodes)for(const k of ['characterIds','sceneIds','propIds'])delete e[k];
  d.provenance.documents[0].path='原件A.txt';return d;
}
function reviewed(d) {
  d.migration.status='reviewed';d.migration.unresolved=[];
  for(const f of d.migration.fields)Object.assign(f,{status:'retained',basis:'人工逐字段核对并保留原路径和原值'});
  for(const a of [...d.scenes,...d.props]){
    if(d.mode==='script'&&!a.sourceRefs)a.sourceRefs=clone(a.sourceFacts?.sourceRefs??[ref]);
    delete a.carriedBy; // Historical value remains in the reviewed migration snapshot.
  }
  return confirm(d);
}
let cases=0;
function test(name,fn){if(selected&&selected!==name)return;try{fn();cases++;console.log(`✓ ${name} CLI 回归`);}catch(e){console.error(`[${name} regression]`);throw e;}}
try {
  test('budget',()=>{
    const old=clone(originalDoc);old.params={thresholds:{maxProps:1,maxScenes:2,maxPrimaryScenes:1,maxLeads:3}};old.provenance.documents[0].path=source;
    const input=save('旧outline',old),out=join(temp,'迁移.json');
    success(cli('migrate-outline',input,'--out',out),'真实迁移入口');
    const d=reviewed(JSON.parse(readFileSync(out)));
    // The migration original is untouched; fields are fully reviewed.
    assert.deepEqual(d.budgets.props,{kind:'explicit',max:1});
    success(cli('validate',save('迁移基线',d),'--no-production'),'原预算下单道具通过');
    const second=registerAsset(d,'prop','spare-flag','备用旗');second.sourceRefs=[clone(ref)];second.decision='第二件实物';confirm(d);
    failure(cli('validate',save('预算超额',d),'--no-production'),'明确预算超额阻断',/美术预算/);
    for(const [label,budgets] of [
      ['删除迁移预算',{}],
      ['改值迁移预算',{props:{kind:'explicit',max:2}}],
      ['降级迁移预算',{props:{kind:'reference',max:1}}]
    ]) {
      const changed=clone(d);changed.budgets={...d.budgets,...budgets};if(label==='删除迁移预算')changed.budgets={};
      for(const cmd of ['validate','checkup','images']){
        const flags=cmd==='images'?['--production',join(root,'examples/雨棚留言-production.json')]:['--no-production'];
        failure(cli(cmd,save(label,changed),...flags),label+' '+cmd,/预算变更/);
      }
      changed.budgetChanges=Object.entries(d.budgets).filter(([key,b])=>digest(b)!==digest(changed.budgets[key])).map(([key,from])=>({key,from,to:changed.budgets[key]??null,basis:'用户明确批准本次取消、调整或降级预算'}));
      success(cli('validate',save(label+'已批准',changed),'--no-production'),'明确变更依据允许实际新预算');
      changed.budgetChanges[0].from={kind:'explicit',max:999};
      failure(cli('validate',save(label+'伪原值',changed),'--no-production'),'错误原值不能冒充批准',/预算变更/);
    }
    // A new art baseline must not mask the original migration budget.
    const hidden=clone(d);hidden.budgets={};hidden.incremental={previousBudgets:{}};
    failure(cli('validate',save('空增量掩盖迁移',hidden),'--no-production'),'增量空预算不覆盖迁移基线',/预算变更/);
    // Legacy art also has an immutable-from-snapshot budget baseline.
    const legacy={source:'桥下旗',scenes:[],props:[],budgets:{props:{kind:'explicit',max:1}}};
    const migrated=reviewed(migrateArt(legacy,save('旧美术',legacy)));migrated.budgets={};
    failure(cli('validate',save('旧美术预算删除',migrated),'--no-production'),'art 迁移预算不能消失',/预算变更/);
    // Every recognized outline budget key is independently protected.
    for(const key of ['props','scenes','primaryScenes']){
      const changed=reviewed(JSON.parse(readFileSync(out)));delete changed.budgets[key];
      failure(cli('validate',save('删除'+key,changed),'--no-production'),key+' 迁移预算',/预算变更/);
    }
  });
  test('evidence',()=>{
    const d=art(),a=d.props[0];
    const b={id:'D01',path:other,sha256:fileDigest(readFileSync(other)),lineCount:sourceLineCount(readFileSync(other))};
    assert.notEqual(b.sha256,d.provenance.documents[0].sha256);
    // Matching active copies with distinct paths remain valid.
    const same=join(temp,'相同原件副本.txt');copyFileSync(source,same);
    a.sourceFacts={documents:[{...d.provenance.documents[0],path:same}],sourceRefs:[clone(ref)]};confirm(d);
    success(cli('verify-sources',save('一致活动证据',d)),'相同 ID/版本的路径副本');
    success(cli('validate',save('一致活动证据',d),'--no-production'),'一致活动证据可以交付');
    a.sourceFacts.documents=[b];confirm(d);
    for(const cmd of ['verify-sources','validate','checkup','render','images'])failure(cli(cmd,save('冲突活动证据',d),'--no-production'),'同 D01 两份合法原件不能双通过 '+cmd,/活动证据版本冲突/);
    // A line-count-only identity conflict is detectable without trusting either file.
    a.sourceFacts.documents=[{...d.provenance.documents[0],lineCount:5}];confirm(d);
    failure(cli('verify-sources',save('冲突活动行数',d)),'同 ID 行数也必须一致',/活动证据版本冲突/);
    // Asset/asset collisions are checked, not just top-level vs first asset.
    const second=registerAsset(d,'prop','second','第二件');second.sourceRefs=[clone(ref)];second.decision='另一件物品';second.sourceFacts={documents:[b],sourceRefs:[clone(ref)]};
    a.sourceFacts.documents=clone(d.provenance.documents);confirm(d);
    failure(cli('validate',save('跨资产证据冲突',d),'--no-production'),'所有活动证据统一校验',/活动证据版本冲突/);
    // History remains verbatim in migration.original; it is not current evidence.
    const legacy={source:'桥下旗',scenes:[],props:[{id:'P01',name:'历史旗',sourceFacts:{documents:[b],sourceRefs:[clone(ref)]}}]};
    const history=reviewed(migrateArt(legacy,save('历史迁移输入',legacy)));
    Object.assign(history,{mode:'script',provenance:clone(d.provenance)});
    delete history.props[0].sourceFacts;history.props[0].sourceRefs=[clone(ref)];confirm(history);
    assert.deepEqual(history.migration.original.props[0].sourceFacts.documents,[b]);
    success(cli('verify-sources',save('历史不作当前依据',history)),'历史版本单独保存，不冒充当前依据');
    success(cli('validate',save('历史不作当前依据',history),'--no-production'),'历史材料完整保留仍可交付');
  });
  test('outline',()=>{
    const d=art(),base=story();
    const artPath=save('当前美术',d);
    success(cli('validate',artPath,'--outline',save('合法partial',base),'--no-production'),'合法 E4 partial');
    const full=clone(base);full.episodes[0].ep=1;full.beats[0].episode=1;Object.assign(full.provenance,{scope:'complete',totalEpisodes:1});
    success(cli('validate',artPath,'--outline',save('合法complete',full),'--no-production'),'完整全集声明');
    const mutations=[
      ['complete 伪全集',x=>Object.assign(x.provenance,{scope:'complete',totalEpisodes:999}),/complete/],
      ['缺少 synopsis',x=>delete x.episodes[0].synopsis,/synopsis/],
      ['原始组合漏洞',x=>{Object.assign(x.provenance,{scope:'complete',totalEpisodes:999});delete x.episodes[0].synopsis;},/complete|synopsis/],
      ['空分集',x=>{x.beats=[];x.episodes=[];},/episodes/],
      ['分集超总数',x=>x.provenance.totalEpisodes=3,/总集数|所属集/],
      ['分集出处缺失',x=>delete x.episodes[0].sourceRefs,/sourceRefs/],
      ['摘要出处缺失',x=>delete x.story.sourceRefs,/故事投影|sourceRefs/],
      ['来源负责范围缺口',x=>x.provenance.coverage=[{...ref,endLine:2}],/负责范围/],
      ['节点结果缺失',x=>delete x.beats[0].outcome,/outcome/],
      ['非法来源文档',x=>x.provenance.documents[0].sha256='bad',/SHA256/],
      ['顶层未知字段',x=>x.assetInventory=[],/不属于/],
      ['说明无来源',x=>x.notes=[{kind:'continuity',text:'旧限制'}],/sourceRefs/],
      ['未知说话者对象',x=>x.notes=[{kind:'continuity',text:'旧限制',sourceRefs:[clone(ref)],speaker:{status:'guessed',description:'某人'}}],/speaker/],
      ['无出处问题',x=>x.episodes[0].ending={event:'交接完成',question:{id:'Q01',text:'谁来接手'}},/sourceRefs/],
      ['回答不存在问题',x=>x.beats[0].resolves=['Q99'],/resolves/],
      ['结尾节点不是终局',x=>x.story.endingBeatId='B01',/endingBeatId/],
      ['非法集尾',x=>x.episodes[0].ending={mode:'closure'},/event/],
      ['非法开场',x=>x.episodes[0].opening='',/opening/],
      ['来源未知字段',x=>x.provenance.extra=true,/不属于/],
      ['引用未知字段',x=>x.beats[0].sourceRefs[0].guessed=true,/不属于/],
      ['重复来源路径',x=>x.provenance.documents.push({...x.provenance.documents[0],id:'D02'}),/路径/]
    ];
    for(const [label,mutate,pattern] of mutations){
      const invalid=clone(base);mutate(invalid);const path=save(label,invalid);
      for(const cmd of ['seed','validate','checkup','render','images']){
        const args=cmd==='seed'?['seed','--source',source,'--title','桥下旗']: [cmd,artPath,'--no-production'];
        failure(cli(...args,'--outline',path),label+' '+cmd,pattern);
      }
    }
    const e2=clone(full.episodes[0]);e2.ep=2;full.episodes.push(e2);full.provenance.totalEpisodes=2;
    full.episodes[0].ending={event:'提出交接问题',question:{id:'Q01',text:'是否接手',sourceRefs:[clone(ref)]}};
    full.beats.push({...clone(full.beats[0]),id:'B02',episode:2,resolves:['Q01']});
    success(cli('validate',artPath,'--outline',save('合法问题回答',full),'--no-production'),'合法后续集回答');
    full.beats[0].resolves=['Q01'];
    failure(cli('validate',artPath,'--outline',save('同集回答不成立',full),'--no-production'),'同集提前回答不能通过',/resolves/);
  });
  test('design',()=>{
    const outline=story(),outlinePath=save('设计对账outline',outline);
    const d=art();d.mode='design';
    // Mismatch is real: both the art and outline originals verify in isolation.
    d.provenance.documents[0]={id:'D01',path:other,sha256:fileDigest(readFileSync(other)),lineCount:4};confirm(d);
    success(cli('verify-sources',save('独立设计B',d)),'设计证据自身合法');
    for(const mode of ['script','design']){
      d.mode=mode;confirm(d);const path=save('改模式'+mode,d);
      for(const cmd of ['validate','checkup','render','images'])failure(cli(cmd,path,'--outline',outlinePath,'--no-production'),'改为 '+mode+' 并重新确认不能绕过原件冲突 '+cmd,/版本不匹配/);
      failure(cli('seed','--source',other,'--title','桥下旗','--outline',outlinePath),'seed 也核对原件版本',/版本不匹配/);
    }
    // The mode-independent check applies to characters too.
    const cast=makeCast(['巡检员'],'桥下旗');cast.provenance.documents[0].path=source;
    failure(cli('validate',save('设计与人物冲突',d),'--cast',save('人物权威',cast),'--no-production'),'design 与 cast 也对账',/版本不匹配/);
    d.provenance=clone(art().provenance);d.mode='design';confirm(d);
    success(cli('validate',save('设计一致证据',d),'--outline',outlinePath,'--no-production'),'design 一致证据通过');
    d.provenance.coverage=[{...ref,endLine:2}];d.props[0].sourceRefs=[{...ref,endLine:2}];confirm(d);
    const partial=clone(outline);partial.provenance.coverage=[{...ref,startLine:3}];partial.story.sourceRefs=[{...ref,startLine:3}];partial.beats[0].sourceRefs=[{...ref,startLine:3}];partial.episodes[0].sourceRefs=[{...ref,startLine:3}];
    failure(cli('validate',save('设计范围',d),'--outline',save('不同负责范围',partial),'--no-production'),'design 仍核对负责范围',/未覆盖/);
    // No common original means skipped, never passed source reconciliation.
    const independent={schemaVersion:1,kind:'mint-art',source:'桥下旗',mode:'design',status:'ready',scenes:[],props:[],registry:{entries:[],changes:[]},budgets:{}};
    let r=cli('render',save('无原件独立设计',independent),'--md','--outline',outlinePath,'--no-production');success(r,'独立设计允许读取故事背景');
    assert.match(r.stderr,/outline 对账 skipped/,'无共同原件必须明确 skipped');
    assert.match(r.stdout,/"outline": \{\s*"status": "skipped"/,'报告不能把独立设计标成 pass');
    const disjoint=clone(d);disjoint.provenance.documents[0].id='D02';disjoint.provenance.coverage=[{...ref,documentId:'D02'}];disjoint.props[0].sourceRefs=[{...ref,documentId:'D02'}];confirm(disjoint);
    r=cli('render',save('不同原件身份设计',disjoint),'--md','--outline',outlinePath,'--no-production');success(r,'无共同文档身份不猜测同源');assert.match(r.stderr,/outline 对账 skipped/);
  });
  if(!selected){
    const ablations=[
      ['budget',"...migrationBudgetBaselines(doc.migration)","...[]"],
      ['evidence',"const errors = activeEvidenceErrors(doc), p = doc?.provenance;","const errors = [], p = doc?.provenance;"],
      ['outline',"...outlineInputErrors(doc)","...[]"],
      ['design',"if(doc.mode==='script'||shared) {","if(doc.mode==='script') {"]
    ];
    for(const [name,from,to] of ablations){
      const isolated=join(temp,'ablation-'+name);cpSync(root,isolated,{recursive:true});
      const path=join(isolated,'scripts/lib/stage.mjs'),code=readFileSync(path,'utf8');
      assert.equal(code.split(from).length,2,'消融锚点必须唯一：'+name);writeFileSync(path,code.replace(from,to));
      const r=spawnSync(process.execPath,[fileURLToPath(import.meta.url)],{cwd:temp,encoding:'utf8',maxBuffer:8*1024*1024,env:{...process.env,MINT_ART_FIX_CASE:name,MINT_ART_FIX_CLI:join(isolated,'scripts/mint-art.mjs')}});
      assert.equal(r.status,1,`${name} 消融必须被真实 CLI 回归检出\n${r.stdout}\n${r.stderr}`);
      assert.match(r.stderr,new RegExp(`\\[${name} regression\\]`),'消融必须因对应回归失败，不能因启动错误失败');
      assert.doesNotMatch(r.stderr,/SyntaxError|ERR_MODULE_NOT_FOUND/,'启动错误不算敏感性通过');
      console.log(`✓ ${name} 消融被对应 CLI 断言检出`);
    }
  }
  console.log(`✓ ${cases} 组缺陷回归${selected?'':'；4 项单独消融敏感性通过'}（离线，无语义审核）`);
} finally {rmSync(temp,{recursive:true,force:true});}
