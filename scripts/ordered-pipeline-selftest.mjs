#!/usr/bin/env node
// 真正五阶段顺序端到端：所有推进均经 pipeline CLI，使用实际阶段 validator。
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync,renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {title,scope,screenplay,ref,outline,people,scenes,props,targets,fillScript,fillCreation} from './fixtures/ordered-flow/story.mjs';
import {identifyCast,identifyArt,mapAssets,assetDigest} from './fixtures/stage-identities.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const temp=mkdtempSync(join(tmpdir(),'mint-ordered-real-')),state=join(temp,'pipeline.json'),source=join(temp,'source','井口双签.txt');
const order=['outline','characters','art','script','creation'];
const files=Object.fromEntries(order.map(k=>[k,join(temp,k,`${title}-${k==='characters'?'cast':k}.json`)]));
const handoffs=Object.fromEntries(order.map(k=>[k,join(temp,k,'handoff.json')]));
const write=(p,d)=>{mkdirSync(dirname(p),{recursive:true});writeFileSync(p,typeof d==='string'?d:JSON.stringify(d,null,2)+'\n');return p;};
const json=p=>JSON.parse(readFileSync(p,'utf8'));
let assertions=0,calls=0;
const equal=(a,b,msg)=>{assert.deepEqual(a,b,msg);assertions++;};
const run=(entry,args)=>{
  calls++;const r=spawnSync(process.execPath,[join(root,entry),...args],{cwd:temp,encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024,env:{...process.env,NODE_OPTIONS:''}});
  assert.ifError(r.error);assert.equal(r.signal,null);return {...r,output:r.stdout+'\n'+r.stderr};
};
const flow=(cmd,...args)=>run('scripts/pipeline.mjs',[cmd,state,...args]);
const cli=(stage,...args)=>run(`skills/mint-${stage}/scripts/mint-${stage}.mjs`,args);
const success=(r,label)=>{assert.equal(r.status,0,`${label}\n${r.output}`);assertions++;return r;};
const rejected=(r,pattern,label)=>{assert.notEqual(r.status,0,`${label}\n${r.output}`);if(pattern)assert.match(r.output,pattern,label);assertions++;return r;};
const complete=stage=>flow('complete',stage,'--artifact',files[stage],'--handoff',handoffs[stage]);
const productionScript=()=>flow('run','script','--','validate',files.script,'--outline',files.outline,'--cast',files.characters,'--art',files.art,'--production-ready','--full-workflow');
const unchangedFailure=(stage,fn,pattern,label)=>{
  const before=readFileSync(state);rejected(fn(),pattern,label);equal(readFileSync(state),before,'失败不推进，也不累积失败记录');equal(json(state).stages[stage].status,'active');
};
const mutation=(path,change,fn)=>{const bytes=readFileSync(path);try{const d=json(path);change(d);write(path,d);return fn();}finally{writeFileSync(path,bytes);}};
try {
  write(source,screenplay);
  success(flow('init','--title',title,'--scope',scope,'--source',source),'初始化真实原剧本');
  equal(Object.values(json(state).stages).map(s=>s.status),order.map(()=>'pending'));
  for(const stage of order.slice(1))rejected(flow('begin',stage),/前序/,'缺少前序不可开始 '+stage);
  rejected(complete('outline'),/begin/,'必须开始后才能交接');
  let cast,art,script;
  for(const [index,stage] of order.entries()) {
    // Every later stage remains blocked until the current handoff succeeds.
    success(flow('begin',stage),'依次开始 '+stage);
    rejected(flow('begin',stage),/进行|active|重复/,'同阶段不可并行');
    if(index<order.length-1)rejected(flow('begin',order[index+1]),/前序/,'当前未完成不可越过');
    write(handoffs[stage],{confirmed:true,scope,unresolved:[]});
    if(stage==='outline') {
      const bytes=readFileSync(source),provenance={kind:'script',scope:'complete',totalEpisodes:1,documents:[{id:'D01',path:relative(dirname(files.outline),source),sha256:createHash('sha256').update(bytes).digest('hex'),lineCount:6}],coverage:ref(1,6)};
      write(files.outline,outline(provenance));
      mutation(files.outline,d=>d.schemaVersion=4,()=>unchangedFailure(stage,()=>complete(stage),/schemaVersion|5|migrate/,'真实 validator 拒绝旧正式版本'));
      mutation(files.outline,d=>d.provenance.documents[0].sha256='a'.repeat(64),()=>unchangedFailure(stage,()=>complete(stage),/来源|版本/,'来源摘要不属于流程版本'));
    } else if(stage==='characters') {
      const seed=JSON.parse(success(cli(stage,'seed','--source',source,'--title',title,'--outline',files.outline),'人物独立原文 seed').stdout);
      equal(seed.characters,[],'seed 不复制大纲身份');
      write(files[stage],seed);
      unchangedFailure(stage,()=>complete(stage),/coverage|生命周期|失败|草稿|范围/,'未阅读 seed 不能冒充完成');
      seed.provenance=structuredClone(json(files.outline).provenance);seed.provenance.documents[0].path=source;
      cast=await identifyCast(root,seed,people);write(files[stage],cast);
      equal(cast.characters.map(c=>c.name),['林宁','林宁'],'同名不同人保持两个身份');
      mutation(files[stage],d=>d.characters[0].identityKey='borrowed-other-person',()=>unchangedFailure(stage,()=>complete(stage),/身份|摘要|失败/,'身份事实改变需重新登记'));
    } else if(stage==='art') {
      const seed=JSON.parse(success(cli(stage,'seed','--source',source,'--title',title,'--outline',files.outline,'--cast',files.characters),'美术独立原文 seed').stdout);
      equal(seed.scenes,[]);equal(seed.props,[]);
      seed.provenance=structuredClone(json(files.outline).provenance);seed.provenance.documents[0].path=source;
      art=await identifyArt(root,seed,scenes,props);write(files[stage],art);
      mutation(files[stage],d=>d.scenes[0].name='另一处值班亭',()=>unchangedFailure(stage,()=>complete(stage),/身份|摘要|失败|违规/,'美术身份变更阻断'));
    } else if(stage==='script') {
      const seed=JSON.parse(success(cli(stage,'seed',files.outline,'--output-path',files.script),'正文 seed 仅认领故事节点').stdout);
      equal(seed.episodes[0].scenes,[],'故事节点不生成资产');
      script=mapAssets(fillScript(seed),cast,art,targets);write(files.script,script);
      equal(script.assetMappings.map(m=>[m.localId,m.assetId]),[['S91','S01'],['C01','C11'],['C02','C12'],['P91','P01']],'局部与阶段身份不靠字符相等映射');
      mutation(files.script,d=>d.assetMappings=[],()=>unchangedFailure(stage,productionScript,/mapping|映射|confirmed/i,'缺少唯一映射不可交接'));
      mutation(files.script,d=>d.assetMappings[1].assetId='C12',()=>unchangedFailure(stage,()=>complete(stage),/assetDigest|mapping|映射/i,'同名目标错配不可按名称补救'));
      mutation(files.script,d=>d.assetMappings[1].status='pending',()=>unchangedFailure(stage,productionScript,/mapping|映射|confirmed/i,'未确认映射阻断'));
      mutation(files.script,d=>d.assetMappings[0].documentVersions[0].sha256='b'.repeat(64),()=>unchangedFailure(stage,()=>complete(stage),/version|版本|映射|mapping/i,'映射冻结来源版本错配'));
      mutation(files.script,d=>d.assetMappings[0].sourceRefs=ref(5),()=>unchangedFailure(stage,()=>complete(stage),/coverage|范围|mapping|映射/i,'来源依据不在目标负责范围'));
      mutation(files.script,d=>d.assetMappings.push(structuredClone(d.assetMappings[0])),()=>unchangedFailure(stage,()=>complete(stage),/duplicate|重复|mapping|映射/i,'重复唯一映射阻断'));
      // Digest is recursive-key canonical, not insertion order or shallow sorting.
      const a=cast.characters[0],reverse=v=>Array.isArray(v)?v.map(reverse):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reverse(x)])):v;
      equal(assetDigest(a),assetDigest(reverse(a)),'嵌套 key 重排不改变目标资产摘要');
      mutation(files.characters,d=>d.characters[0].name='修改后的林宁',()=>unchangedFailure(stage,()=>complete(stage),/已改变/,'完成的身份资产被修改，流程先阻断'));
      // Delete a completed predecessor: missing is not optional input.
      renameSync(files.art,files.art+'.held');
      try{unchangedFailure(stage,()=>complete(stage),/ENOENT|读取|前序/,'缺少前序文件不能伪装 skipped');}finally{renameSync(files.art+'.held',files.art);}
    } else {
      const seed=JSON.parse(success(cli(stage,'seed',files.script,'--outline',files.outline,'--cast',files.characters,'--art',files.art),'制作 seed').stdout);
      write(files.creation,fillCreation(seed));
      // Real consumer CLI: an offscreen known speaker is a production dependency
      // even with no visible cast or character images. These test candidates do
      // not replace the already frozen pipeline script.
      const voiceScript=structuredClone(script),voiceCreation=structuredClone(json(files.creation));
      voiceScript.assetMappings.filter(m=>m.kind==='character').forEach(m=>m.status='pending');
      for(const sc of voiceScript.episodes[0].scenes)for(const b of sc.flow)if(b.line)b.audio={mode:'offscreen'};
      voiceCreation.episodes[0].segments.forEach(seg=>{seg.images=[];seg.cuts.forEach(c=>c.characters=[]);});
      const vs=write(join(temp,'script','.voice-script.json'),voiceScript),vc=write(join(temp,'creation','.voice-creation.json'),voiceCreation);
      rejected(cli('creation','validate',vc,'--script',vs,'--outline',files.outline,'--cast',files.characters,'--art',files.art,'--no-production'),/confirmed/,'画外已知发声者缺少确认映射不可进入制作');
      mutation(files.creation,d=>d.episodes[0].segments[0].cuts[0].characters=['C99'],()=>unchangedFailure(stage,()=>complete(stage),/映射|unknown|C99|资产/i,'制作实际依赖未知局部身份阻断'));
    }
    mutation(handoffs[stage],h=>h.scope='其他范围',()=>unchangedFailure(stage,()=>complete(stage),/scope|范围/,'交接范围不匹配'));
    mutation(handoffs[stage],h=>h.unresolved=[{text:'当前范围身份冲突',blocking:true}],()=>unchangedFailure(stage,()=>complete(stage),/阻断/,'未解决问题不可交接'));
    success(flow('run',stage,'--','validate',files[stage],...(stage==='script'?['--outline',files.outline,'--cast',files.characters,'--art',files.art]:stage==='creation'?['--script',files.script,'--outline',files.outline,'--cast',files.characters,'--art',files.art]:[])),'run 调用本阶段真实 validator '+stage);
    success(complete(stage),'完成 '+stage+' 的真实校验与交接');
    equal(order.map(k=>json(state).stages[k].status),order.map((_,i)=>i<=index?'complete':'pending'));
    if(index<order.length-1)mutation(files[stage],d=>d.testOnlyChanged=true,()=>rejected(flow('begin',order[index+1]),/已改变/,'前序产物改变阻断下一阶段'));
  }
  const done=JSON.parse(success(flow('check'),'完整五阶段交接').stdout);
  equal(done.workflow,'complete');equal(done.contentReview,'not-performed');equal(done.mediaValidation,'not-performed');
  for(const stage of ['characters','art']) {
    const doc=json(files[stage]);equal(stage==='characters'?doc.characters.every(c=>!c.persona&&!c.image&&!c.voice):[...doc.scenes,...doc.props].every(a=>a.designStatus==='none'&&!a.image),true,'身份骨架无需画像、音色或出图');
  }
  const original=readFileSync(source);
  try{write(source,screenplay.replace('第一集','第壹集'));rejected(flow('check'),/改版/,'原件改版不能沿用完整记录');}finally{writeFileSync(source,original);}
  mutation(handoffs.art,h=>h.unresolved=[{text:'补充事项',blocking:false}],()=>rejected(flow('check'),/已改变/,'已冻结交接改变也要重新核验'));
  success(flow('reopen','characters'),'显式重新核验人物及后续');
  equal(order.map(k=>json(state).stages[k].status),['complete','pending','pending','pending','pending']);
  rejected(flow('begin','creation'),/前序/,'撤回后不得跳到制作');
  equal(existsSync(state+'.lock'),false);equal(existsSync(state+'.tmp'),false);
  equal(/failureHistory|failureCount/.test(readFileSync(state,'utf8')),false,'不新增失败日志或统计');
  console.log(`✓ ${assertions} 项真实五阶段顺序断言通过；${calls} 次 CLI；无 validator mock、网络或媒体生成。`);
} finally {rmSync(temp,{recursive:true,force:true});}
