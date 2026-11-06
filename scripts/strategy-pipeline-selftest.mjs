#!/usr/bin/env node
// 三组合真实 CLI 联合测试。仅 Node 标准库；不调用生成服务，不使用正式样例。
// node scripts/strategy-pipeline-selftest.mjs [--keep /absolute/new-directory]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {stories,style,buildOutline,fillScript,fillCreation} from './fixtures/strategy-pipeline/stories.mjs';
import {fillAssets,sourceText} from './fixtures/strategy-pipeline/assets.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(args.length && (args.length!==2 || args[0]!=='--keep' || !args[1])) throw Error('用法：node scripts/strategy-pipeline-selftest.mjs [--keep <新目录>]');
const keep=args.length?resolve(args[1]):null;
if(keep && existsSync(keep)) throw Error('--keep 目标必须不存在，不覆盖已有项目');
const temp=mkdtempSync(join(tmpdir(),'shuohao-three-combinations-'));
const projects=join(temp,'projects');mkdirSync(projects);
const stages=['outline','script','creation'];
const failures=[];let passed=0,cliCalls=0;
const modules={},profiles={},ready=new Map();
const clone=x=>structuredClone(x);
const json=file=>JSON.parse(readFileSync(file,'utf8'));
const write=(file,value)=>{mkdirSync(dirname(file),{recursive:true});writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');return file;};
const skillRoot=(stage,base=root)=>join(base,'skills',`novel-${stage}`);
const cli=(stage,argv,{cwd=temp,base=root}={})=>{
  cliCalls++;
  const r=spawnSync(process.execPath,[join(skillRoot(stage,base),'scripts',`novel-${stage}.mjs`),...argv],{cwd,encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024,env:{...process.env,NODE_OPTIONS:''}});
  assert.ifError(r.error);assert.equal(r.signal,null,'CLI 不应崩溃或超时');
  return {...r,output:r.stdout+'\n'+r.stderr};
};
const success=(r,label)=>{assert.equal(r.status,0,`${label}\n${r.output.slice(-14000)}`);return r;};
const rejected=(r,pattern,label)=>{assert.notEqual(r.status,0,`${label} 应拒绝，不得只打印提醒\n${r.output}`);if(pattern)assert.match(r.output,pattern,label);return r;};
async function test(name,fn){try{await fn();passed++;console.log(`通过 ${name}`);}catch(e){failures.push({name,message:e.message});console.error(`失败 ${name}\n${e.message}`);}}
const gates=(stage,doc,ctx={})=>{const m=modules[stage];return m.checkup?m.checkup(doc,ctx).gates:m.gateReport(doc,ctx);};
const blocking=gs=>gs.filter(g=>g.status==='fail'&&g.level==='error'&&g.category!=='source');
const clean=(gs,label)=>assert.deepEqual(blocking(gs),[],label);
const gate=(gs,id)=>{const g=gs.find(x=>x.id===id);assert.ok(g,`缺少检查 ${id}`);return g;};
const failed=(gs,id)=>{assert.equal(gate(gs,id).status,'fail',id);assert.ok(blocking(gs).some(g=>g.id===id),`${id} 应阻断`);};
const mutate=(doc,fn)=>{const d=clone(doc);fn(d);return d;};
const imagePaths=p=>new Set([...p.outline.characters.map(c=>`../characters/images/${c.name}-sheet.png`),...p.art.scenes.map(s=>`../art/images/${s.name}-sheet.png`),...p.art.props.map(s=>`../art/images/${s.name}-sheet.png`)]);
const ctxOf=p=>({outline:p.outline,script:p.script,art:p.art,cast:p.cast,production:p.production,imageExists:rel=>imagePaths(p).has(rel)});
const flags=(p,stage)=>['--production',p.files.production,...(stage!=='outline'?['--outline',p.files.outline,'--art',p.files.art]:[]),...(stage==='creation'?['--script',p.files.script,'--cast',p.files.cast]:[])];
function applied(stage,file,production,extra=[],base=root){
  const before=readFileSync(file,'utf8');
  const preview=success(cli(stage,['apply-profile',file,'--production',production,...extra],{base}),'应用预览');
  assert.equal(jsonResult(preview).applied,false);assert.equal(readFileSync(file,'utf8'),before,'预览不能写入');
  const r=cli(stage,['apply-profile',file,'--production',production,...extra,'--confirm'],{base});
  const result=jsonResult(r);assert.equal(result.applied,true,`应用未落盘：${r.output}`);
  assert.equal(readFileSync(result.backup,'utf8'),before,'备份必须为原始字节');
  // 已写入不等于校验通过；调用方另行检查真实完整上下游。
  return {doc:json(file),result,run:r};
}
const jsonResult=r=>{try{return JSON.parse(r.stdout);}catch{throw Error(`CLI 没有返回约定 JSON\n${r.output.slice(-10000)}`);}};
function variant(p,stage,fn,options={}){
  const file=join(p.dir,stage,`.mutation-${stage}.json`);write(file,mutate(p[stage],fn));
  try{return cli(stage,['validate',file,...flags(p,stage),...(options.args??[])],{cwd:join(p.dir,stage)});}
  finally{rmSync(file,{force:true});}
}
function copySkill(stage,label){
  const base=join(temp,'installed',label),dest=skillRoot(stage,base);
  mkdirSync(dest,{recursive:true});
  for(const part of ['scripts','references'])cpSync(join(skillRoot(stage),part),join(dest,part),{recursive:true});
  return {base,dir:dest};
}
function newProfile(dir,stage,{dimension='pacing',id='fixture-observation',version='1.0.0',rules={},defaults}={}){
  const folder=join(dir,'references','profiles',dimension,id,version);
  write(join(folder,'guide.md'),'# 隔离观察策略\n\n目标：保留独立测量的过程。先提出可排除的解释，再观察证据变化。避免把等待当成已经兑现。正例是核对温度计后改变判断；反例是只重复异常画面。评审核对新的信息是否改变调查方向。来源：本测试原创方法，不依赖第三方 skill。\n');
  write(join(folder,'profile.json'),{profileSchemaVersion:1,dimension,id,version,stage,guide:'guide.md',rules,...(defaults?{defaults}:{})});return folder;
}

try{
  await test('加载当期本地接口（缺失即失败，不降级旧契约）',async()=>{
    for(const stage of stages){modules[stage]=await import(pathToFileURL(join(skillRoot(stage),'scripts',`novel-${stage}.mjs`)));profiles[stage]=await import(pathToFileURL(join(skillRoot(stage),'scripts/lib/creative.mjs')));}
  });
  for(const story of stories){
    await test(`${story.title}：真实 init → apply → seed → validate → render`,()=>{
      const dir=join(projects,story.key);mkdirSync(dir,{recursive:true});
      for(const s of ['outline','script','creation','art','characters'])mkdirSync(join(dir,s));
      const files={production:join(dir,'production.json'),outline:join(dir,'outline',`${story.title}-outline.json`),script:join(dir,'script',`${story.title}-script.json`),creation:join(dir,'creation',`${story.title}-creation.json`),art:join(dir,'art',`${story.title}-art.json`),cast:join(dir,'characters',`${story.title}-cast.json`)};
      const selectionFile=write(join(dir,'selection.json'),story.selection),styleFile=write(join(dir,'style-input.json'),style);
      const production=jsonResult(success(cli('setup',['init','--aspect','9:16','--source',story.title,'--video-model','MiniMax H3','--video-resolution','768p','--prompt-lang','zh','--selection',selectionFile,'--style',styleFile]),'setup init'));
      write(files.production,production);success(cli('setup',['validate',files.production]),'setup validate');
      assert.deepEqual(production.creative.selection,story.selection);
      write(join(dir,'production.md'),success(cli('setup',['show',files.production,'--md']),'setup show').stdout);
      write(files.outline,buildOutline(story));
      const {doc:outline}=applied('outline',files.outline,files.production);
      success(cli('outline',['validate',files.outline,...['--production',files.production]]),'outline validate');
      const cast=jsonResult(success(cli('characters',['seed',files.outline]),'characters seed'));
      const art=jsonResult(success(cli('art',['seed',files.outline]),'art seed'));
      assert.deepEqual(cast.characters.map(c=>c.id),outline.characters.map(c=>c.id));
      assert.deepEqual(art.props[0].usage.beatIds,outline.props[0].beatIds,'道具关联包括非 payoff 节点');
      assert.ok(!('creativeContext' in cast)&&!('creativeContext' in art),'不加载策略的阶段不能伪造来源摘要');
      write(join(dir,'cast-seed.json'),cast);write(join(dir,'art-seed.json'),art);
      write(files.cast,cast);write(files.art,art);
      for(const stage of ['characters','art'])rejected(cli(stage,['validate',stage==='characters'?files.cast:files.art],{cwd:join(dir,stage)}),/缺|空|不足|empty|required|违规|问题/i,`${stage} 骨架仍不完整`);
      fillAssets(cast,art,story,style);
      write(files.cast,cast);write(files.art,art);
      const sourceFile=write(join(dir,'原创文本.txt'),sourceText(story));
      success(cli('characters',['validate',files.cast,sourceFile,'--production',files.production],{cwd:join(dir,'characters')}),'characters 完整文本与原创引文校验');
      success(cli('art',['validate',files.art,'--cast',files.cast,'--production',files.production],{cwd:join(dir,'art')}),'art 完整文本校验');
      const seed=jsonResult(success(cli('script',['seed',files.outline,'--eps','1-3']),'script seed'));
      assert.equal(seed.schemaVersion,2);assert.equal(seed.episodes.length,3);
      for(const [i,ep] of seed.episodes.entries()){
        assert.equal(ep.targetSeconds,24);assert.equal(ep.opening,outline.episodes[i].opening);
        assert.deepEqual(ep.ending,{mode:outline.episodes[i].ending.mode,event:outline.episodes[i].ending.event});
        assert.deepEqual(ep.scenes,[]);assert.equal(ep.openingBeat,null);assert.equal(ep.endBeat,null);
        assert.deepEqual(ep.beatClaims,outline.beats.filter(b=>b.episode===ep.ep).map(b=>({beatId:b.id,start:null,end:null})));
      }
      write(join(dir,'script-seed.json'),seed);write(files.script,fillScript(seed,story));
      const {doc:script}=applied('script',files.script,files.production);
      const p={story,dir,files,production,outline,script,cast,art};
      success(cli('script',['validate',files.script,...flags(p,'script')]),'script 联合 validate');
      const cseed=jsonResult(success(cli('creation',['seed',files.script,'--eps','1-3']),'creation seed'));
      for(const [i,ep] of cseed.episodes.entries()){assert.deepEqual(ep.ending,script.episodes[i].ending);assert.equal(ep.opening,script.episodes[i].opening);assert.deepEqual(ep.segments,[]);}
      write(join(dir,'creation-seed.json'),cseed);write(files.creation,fillCreation(cseed,script,story));
      p.creation=applied('creation',files.creation,files.production).doc;
      clean(gates('creation',p.creation,ctxOf(p)),'仅 imageExists 替身时其余契约应全部通过');
      // CLI 不提供图片替身：缺图是确定的未完成项，不能把零退出码冒充联合交付。
      const real=cli('creation',['validate',files.creation,...flags(p,'creation')],{cwd:join(dir,'creation')});
      rejected(real,/设定图|reference|image/i,'真实缺图 CLI');
      const missing=gates('creation',p.creation,{...ctxOf(p),imageExists:()=>false});
      assert.deepEqual(blocking(missing).map(g=>g.id),['refimage-coverage'],'真实项目唯一 creation 阻断应为图片缺失');
      for(const stage of stages){
        assert.deepEqual(p[stage].creativeContext.selection,story.selection);
        assert.equal(p[stage].creativeContext.references.length,stage==='creation'?3:4);
        for(const lang of ['zh','en']){
          const before=readFileSync(files[stage],'utf8');
          const rendered=success(cli(stage,['render',files[stage],'--html','--lang',lang,...flags(p,stage)],{cwd:join(dir,stage)}),`${stage} render ${lang}`);
          assert.match(rendered.stdout,/<html/i);assert.ok(rendered.stdout.includes(story.title));
          const embedded=rendered.stdout.match(new RegExp(`<script[^>]*id="${stage}-data"[^>]*>([\\s\\S]*?)<\\/script>`));
          assert.ok(embedded,`${stage} 报告必须提供原始 JSON 导出`);assert.deepEqual(JSON.parse(embedded[1]),p[stage],'导出必须与输入一致');
          assert.equal(readFileSync(files[stage],'utf8'),before,'render 不改 JSON');
          write(join(dir,stage,`${stage}-report-${lang}.html`),rendered.stdout);
          write(join(dir,stage,`${stage}-${lang}.md`),success(cli(stage,['render',files[stage],'--md','--lang',lang,...flags(p,stage)],{cwd:join(dir,stage)}),'Markdown render').stdout);
        }
      }
      for(const stage of ['characters','art']){
        const file=stage==='characters'?files.cast:files.art;
        write(join(dir,stage,`${stage}-report.html`),success(cli(stage,['render',file,'--html'],{cwd:join(dir,stage)}),`${stage} 完整文本 render`).stdout);
      }
      write(join(dir,'验证边界.md'),`# ${story.title}\n\n三集原创联合测试。outline/script 已执行真实 CLI 联合校验。creation 在 imageExists 函数替身下验证图路径与其他契约；真实 CLI 缺少图片，不能投产。characters/art 从真实 seed 补齐原创设计文本，已通过文本校验；未生成设定图。未调用图片或视频模型。内容评审与浏览器检查未执行。\n`);
      ready.set(story.key,p);
    });
  }

  for(const p of ready.values()){
    await test(`${p.story.title}：五面板合并报告使用同一故事`,()=>{
      const out=join(p.dir,'project-report.html');
      const r=spawnSync(process.execPath,[join(root,'scripts/report.mjs'),'--from',p.dir,'--out',out],{cwd:p.dir,encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024});cliCalls++;
      assert.ifError(r.error);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/5 个面板/);
      const html=readFileSync(out,'utf8');for(const id of ['characters','art','outline','script','creation'])assert.ok(html.includes(`id="pane-${id}"`),id);
      assert.ok(html.includes(p.story.title));
    });
    await test(`${p.story.title}：阶段摘要不同不误判；稳定 ID、时长及 ending 全链一致`,()=>{
      const digests=stages.map(s=>p[s].creativeContext.references.find(r=>r.dimension==='pacing').sha256);
      assert.equal(new Set(digests).size,3,'各阶段本地实现有真实不同摘要');
      for(const s of stages){const gs=gates(s,p[s],ctxOf(p));assert.equal(gate(gs,'creative-project').status,'pass');clean(gs,s);assert.ok(gs.every(g=>!('ok'in g)&&['pass','fail','skipped'].includes(g.status)));}
      for(const ep of p.script.episodes){assert.deepEqual(ep.beatClaims.map(c=>c.beatId),p.outline.beats.filter(b=>b.episode===ep.ep).map(b=>b.id));assert.equal(ep.targetSeconds,p.outline.params.minutesPerEpisode*60);}
      const changed=mutate(p.outline,o=>o.params.minutesPerEpisode=0.5),file=write(join(temp,`${p.story.key}-longer.json`),changed);
      rejected(cli('script',['validate',p.files.script,'--outline',file,'--art',p.files.art,'--production',p.files.production]),/upstream-duration|目标时长|target/i,'时长变化必须失效');
      failed(gates('creation',p.creation,{...ctxOf(p),outline:changed}),'upstream-intent');
      const invalid=mutate(p.creation,c=>c.episodes[0].ending.event+='不应在下游改写');failed(gates('creation',invalid,ctxOf(p)),'upstream-intent');
    });
    for(const [name,fn,pattern] of [
      ['漏领',d=>d.episodes[0].beatClaims.pop(),/beats-claimed|认领/],
      ['多领',d=>d.episodes[0].beatClaims.push({beatId:'B99',start:[1,1],end:[1,1]}),/beat|range|认领/i],
      ['错集',d=>d.episodes[0].beatClaims[0].beatId='B03',/beat|认领/i],
      ['重复',d=>d.episodes[0].beatClaims[1].beatId=d.episodes[0].beatClaims[0].beatId,/duplicate|重复/i],
      ['越界',d=>d.episodes[0].beatClaims[0].end=[99,1],/range|范围/i],
      ['倒序',d=>{d.episodes[0].beatClaims[0].start=[1,2];d.episodes[0].beatClaims[0].end=[1,1];},/range|倒序/i],
      ['重叠',d=>d.episodes[0].beatClaims[1].start=[1,1],/overlap|重叠/i],
      ['endBeat 不是末拍',d=>d.episodes[0].endBeat=[1,1],/endBeat|最后/i],
      ['openingBeat 无效且窗口关闭',d=>{d.params.rules.openingWindow={level:'off'};d.episodes[0].openingBeat=[9,1];},/openingBeat|坐标/i],
      ['剧本 ending 禁止复制 Q',d=>d.episodes[0].ending.question={id:'Q01'},/ending|question|mode\/event/i],
      ['开场投影不可擅改',d=>d.episodes[0].opening+='另外一段意图',/upstream-projection|开场/i],
      ['集尾投影不可擅改',d=>d.episodes[0].ending.event+='另外一段意图',/upstream-projection|集尾/i],
      ['目标时长差异不以容差放宽',d=>d.episodes[0].targetSeconds=25,/upstream-duration|目标/i]
    ])await test(`${p.story.title}：CLI 拒绝${name}`,()=>rejected(variant(p,'script',fn),pattern,name));
  }

  const gradual=ready.get('gradual'),dense=ready.get('dense'),episodic=ready.get('episodic');
  if(dense)await test('分阶段边界与非末集批次不冒充全剧终局',()=>{
    const draft=mutate(dense.outline,d=>{delete d.story.endingBeatId;d.beats=[];d.episodes=[];d.arcs=[];});
    const file=write(join(dense.dir,'outline','.skeleton.json'),draft);
    try{
      success(cli('outline',['validate',file,'--stage','skeleton','--production',dense.files.production]),'骨架校验');
      rejected(cli('outline',['validate',file,'--stage','full','--production',dense.files.production]),/ending-beat|episodes|beats/,'完整阶段不能通过骨架');
      const gs=gates('outline',draft,{...ctxOf(dense),stage:'skeleton'});assert.equal(gate(gs,'beats').reason,'stage-incomplete');
    }finally{rmSync(file,{force:true});}
    const scriptFile=write(join(dense.dir,'script','.batch.json'),mutate(dense.script,d=>d.episodes=d.episodes.slice(0,1)));
    try{
      success(cli('script',['validate',scriptFile,...flags(dense,'script')]),'第一集独立批次仍是普通悬念集');
      const seeded=jsonResult(success(cli('creation',['seed',scriptFile]),'creation 单集批次 seed'));assert.equal(seeded.episodes[0].ending.mode,'suspense');
    }finally{rmSync(scriptFile,{force:true});}
  });
  if(gradual)for(const stage of ['script','creation'])await test(`${stage}：当前参数契约不能通过 off 绕过`,()=>{
    const cases=stage==='script'?[d=>delete d.params.rules.lineLength,d=>d.params.maxLineChars=35,d=>d.params.rules.lineLength={level:'off',maxChars:35},d=>d.params.rules.openingWindow={level:'error',maxBeats:1.5}]:[d=>delete d.params.rules.cutDuration,d=>d.params.maxCutSeconds=5,d=>d.params.rules.cutDuration={level:'off',minSeconds:2},d=>d.episodes[0].segments[0].cuts[0].seconds=0];
    for(const change of cases){const bad=mutate(gradual[stage],change);assert.ok(blocking(gates(stage,bad,ctxOf(gradual))).length);rejected(variant(gradual,stage,change),null,'非法有效参数');}
  });
  if(gradual){
    for(const [total,expected] of [[20.4,0],[27.6,0],[20.3999999,1],[27.6000001,1]]) await test(`时长容差闭区间与真实越界：${total}`,()=>{
      const d=clone(gradual.creation);
      for(const ep of d.episodes)for(const seg of ep.segments)for(const cut of seg.cuts)cut.seconds=total/4;
      const g=gate(gates('creation',d,ctxOf(gradual)),'ep-duration');assert.equal(g.status,expected?'fail':'pass');
      const file=write(join(gradual.dir,'creation','.duration-boundary.json'),d);
      try {
        // 不提供 art：真实 CLI 仅对账现有剧本与大纲，图片检查边界明确跳过。
        const r=cli('creation',['validate',file,'--script',gradual.files.script,'--outline',gradual.files.outline,'--production',gradual.files.production]);
        if(expected)rejected(r,/duration|总秒数|目标/i,'真实越界');else success(r,'合法闭区间端点');
      } finally {rmSync(file,{force:true});}
    });
    await test('渐进：真实无 payoff、最终开放、部分阶段覆盖；不是假关闭',()=>{
      assert.ok(gradual.outline.episodes.some(ep=>!gradual.outline.beats.some(b=>b.episode===ep.ep&&b.kind==='payoff')));
      for(const key of ['payoffCoverage','firstMajor','majorGap','endingPayoff','arcCoverage','arcPayoff'])assert.deepEqual(gradual.outline.params.rules[key],{level:'off'});
      assert.equal(gradual.creation.episodes.at(-1).ending.mode,'open');
      failed(gates('outline',mutate(gradual.outline,d=>d.params.rules.payoffCoverage={level:'error',minPerEpisode:1}),ctxOf(gradual)),'payoffCoverage');
      failed(gates('outline',mutate(gradual.outline,d=>d.params.rules.arcCoverage={level:'error'}),ctxOf(gradual)),'arcCoverage');
      failed(gates('outline',mutate(gradual.outline,d=>d.params.rules.endingPayoff={level:'error',minWeight:'major'}),ctxOf(gradual)),'endingPayoff');
      const off=gate(gates('outline',gradual.outline,ctxOf(gradual)),'payoffCoverage');assert.equal(off.status,'skipped');assert.equal(off.reason,'policy-disabled');
    });
    for(const [name,fn] of [
      ['required 未解决',d=>delete d.beats[4].resolves],['未知问题',d=>d.beats[4].resolves=['Q99']],
      ['重复解决',d=>d.beats[5].resolves=['Q01']],['提前解决',d=>{d.beats[0].resolves=['Q01'];delete d.beats[4].resolves;}],
      ['超过明确期限',d=>d.episodes[0].ending.question.dueByEp=2],['optional 携带期限',d=>d.episodes[2].ending.question.dueByEp=3],
      ['非法节点 ID',d=>d.beats[0].id='bad'],['重复节点 ID',d=>d.beats[1].id='B01'],['节点错误集号',d=>d.beats[0].episode=4],
      ['无效节点位置',d=>d.beats[0].position='unknown'],['未知资产引用',d=>d.episodes[0].characterIds=['C99']],
      ['非 payoff 伪造 weight',d=>d.beats[0].weight='minor'],['缺失注册规则',d=>delete d.params.rules.payoffCoverage],
      ['off 携带阈值',d=>d.params.rules.payoffCoverage={level:'off',minPerEpisode:1}],
      ['字符串阈值',d=>d.params.rules.payoffCoverage={level:'error',minPerEpisode:'1'}],['旧平铺字段',d=>d.params.maxBeatGap=3]
    ])await test(`渐进关闭规则仍拒绝：${name}`,()=>rejected(variant(gradual,'outline',fn),null,name));
    await test('剧本独立 suspense 无 Q 合法；损坏上游与缺上游区分',()=>{
      success(cli('script',['validate',gradual.files.script,'--no-production']),'独立 script');
      const gs=gates('script',gradual.script,{});assert.equal(gate(gs,'upstream-projection').reason,'missing-upstream');
      const broken=write(join(temp,'broken.json'),'{broken');
      rejected(cli('script',['validate',gradual.files.script,'--outline',broken,'--no-production']),/JSON|parse|Unexpected|property/i,'损坏 outline');
      rejected(cli('script',['validate',gradual.files.script,'--production',broken]),/JSON|parse|Unexpected|property/i,'损坏 production');
      rejected(cli('creation',['validate',gradual.files.creation,'--script',broken,'--no-production']),/JSON|parse|Unexpected|property/i,'损坏 script');
    });
    await test('同场多个节点、共享铺垫、跨场核心段与统一估时',()=>{
      const d=clone(gradual.script),e=d.episodes[0];
      // 四拍保持原文字与顺序；第一拍是共享铺垫，B01 在两场之间跨越。
      const scene=e.scenes[0];e.scenes=[{...clone(scene),flow:scene.flow.slice(0,2)},{...clone(scene),flow:scene.flow.slice(2)}];
      e.beatClaims[0].start=[1,2];e.beatClaims[0].end=[2,1];e.beatClaims[1].start=[2,2];e.beatClaims[1].end=[2,2];e.endBeat=[2,2];
      clean(gates('script',d,ctxOf(gradual)),'跨场段合法');
      const m=modules.script,t=m.episodeTimeline(e,d.params),range=m.claimRange(e,e.beatClaims[0],d.params);
      assert.equal(t.at(-1).endSeconds,24);assert.equal(range.startSeconds,6);assert.equal(range.endSeconds,18);
      assert.equal(m.claimRange(e,{start:[99,1],end:[99,2]},d.params),null,'无效范围不是零秒');
      d.params.rules.openingWindow={level:'off'};e.openingBeat=[2,2];clean(gates('script',d,ctxOf(gradual)),'关闭窗口后合法晚开场');
    });
    await test('warn 仍是 fail 提醒；lineLength off/warn 不受旧硬门阻断',()=>{
      const d=clone(gradual.script);d.episodes[0].scenes[0].flow[0]={speaker:'C01',line:'独立温度计也在缓慢上升，先留下原始记录。'};
      // 此句按统一语速约四秒；其余十八秒，仍在原定 24 秒 ±15% 内。
      for(const level of ['off','warn','error']){
        d.params.rules.lineLength=level==='off'?{level}:{level,maxChars:12};
        const gs=gates('script',d,ctxOf(gradual)),g=gate(gs,'lineLength');
        if(level==='off'){assert.equal(g.status,'skipped');assert.equal(g.reason,'policy-disabled');clean(gs,'off');}
        else {assert.equal(g.status,'fail');assert.equal(g.level,level);if(level==='warn')clean(gs,'warn');else assert.ok(blocking(gs).includes(g));}
        const file=write(join(gradual.dir,'script','.line-rule.json'),d),r=cli('script',['validate',file,...flags(gradual,'script')]);
        rmSync(file,{force:true});
        if(level==='error')rejected(r,/lineLength/,'error');else success(r,level);
      }
    });
    await test('问题默认值只在显式新建时消费，历史校验/渲染不回写',()=>{
      const m=modules.outline,p={episodes:3,defaults:{questionResolveWithin:2}},q={id:'Q09',text:'下一班是否会复核？',resolution:'required'};
      assert.equal(m.newQuestion(q,1,p).dueByEp,3);assert.equal(q.dueByEp,undefined);
      assert.equal(m.newQuestion(q,1,{...p,defaults:{questionResolveWithin:null}}).dueByEp,undefined);
      assert.equal(m.newQuestion({...q,dueByEp:2},1,p).dueByEp,2);
      assert.equal(m.newQuestion({...q,resolution:'optional',reason:'只留余味'},1,p).dueByEp,undefined);
      const d=clone(gradual.outline);d.params.defaults.questionResolveWithin=1;
      clean(gates('outline',d,ctxOf(gradual)),'新的默认值不约束已经存在的无期限问题');assert.equal(d.episodes[0].ending.question.dueByEp,undefined);
    });
  }
  if(episodic)await test('参考图挂载：仅认可 fixture 路径；未知挂载 ID 不能被策略关闭',()=>{
    const seen=new Set(),ctx={...ctxOf(episodic),imageExists:rel=>{seen.add(rel);return imagePaths(episodic).has(rel);}};
    clean(gates('creation',episodic.creation,ctx),'已知映射的图片替身');assert.deepEqual(seen,imagePaths(episodic));
    const absent={...ctxOf(episodic),imageExists:rel=>imagePaths(episodic).has(rel)&&!rel.includes(episodic.story.prop)};
    failed(gates('creation',episodic.creation,absent),'refimage-coverage');
    const bad=mutate(episodic.creation,c=>{c.params.rules.cutDuration={level:'off'};c.episodes[0].segments[0].images[0].ref='C99';});
    assert.ok(blocking(gates('creation',bad,ctxOf(episodic))).length,'段级挂载 C99 未知引用必须阻断，不能只校验 cut 人物');
  });
  if(episodic)await test('单元：非末集 closure、八秒观察、模型限制不被策略越权',()=>{
    assert.equal(episodic.outline.episodes[0].ending.mode,'closure');assert.ok(!('question'in episodic.script.episodes[0].ending));
    const gs=gates('creation',episodic.creation,ctxOf(episodic));assert.equal(gate(gs,'cut-length').status,'pass');
    for(const ep of episodic.creation.episodes)for(const seg of ep.segments)for(const cut of seg.cuts)assert.ok(cut.seconds>=6&&cut.seconds<=10);
    for(const level of ['off','warn','error']){
      const d=mutate(episodic.creation,c=>c.params.rules.cutDuration=level==='off'?{level}:{level,minSeconds:2,maxSeconds:5});
      const checks=gates('creation',d,ctxOf(episodic)),g=gate(checks,'cut-length');
      assert.equal(g.status,level==='off'?'skipped':'fail');if(level==='error')failed(checks,'cut-length');else clean(checks,level);
    }
    const illegal=mutate(episodic.creation,c=>{c.params.rules.cutDuration={level:'off'};c.episodes[0].segments[0].cuts[0].seconds=16;});
    failed(gates('creation',illegal,ctxOf(episodic)),'segment-cap');
    // 即使技术配置手工改为 20 秒，模型本身的 15 秒上限仍生效。
    illegal.params.maxSegmentSeconds=20;failed(gates('creation',illegal,ctxOf(episodic)),'segment-cap');
    const file=write(join(temp,'illegal-segment.json'),illegal);rejected(cli('creation',['validate',file,...flags(episodic,'creation')]),/时长区间|15|segment/i,'模型上限');
    const badProduction=write(join(temp,'bad-production.json'),mutate(episodic.production,p=>p.video.resolution='invalid'));
    rejected(cli('setup',['validate',badProduction]),/resolution|分辨率|档位/i,'制作分辨率');
  });

  if(dense && gradual)for(const stage of ['script','creation'])await test(`${stage} 切换：下游已同步但上游选择过期时不能宣称联合通过`,()=>{
    // 保持 ID、正文和时长完全相同，只让上游仍记录旧选择，避免其他错误掩盖身份漏检。
    const stale=mutate(gradual.outline,d=>d.creativeContext=clone(dense.outline.creativeContext));
    const file=write(join(gradual.dir,'outline','.stale-selection.json'),stale);
    try{
      if(stage==='script'){
        const r=cli('script',['validate',gradual.files.script,'--outline',file,'--art',gradual.files.art,'--production',gradual.files.production]);
        rejected(r,/selection|选择|策略|creative/i,'script 联合校验必须发现过期 outline selection');
      }else{
        failed(gates('creation',gradual.creation,{...ctxOf(gradual),outline:stale}),'upstream-selection');
        const r=cli('creation',['checkup',gradual.files.creation,'--script',gradual.files.script,'--outline',file,'--art',gradual.files.art,'--production',gradual.files.production],{cwd:join(gradual.dir,'creation')});
        rejected(r,/选择.*不一致|不一致.*选择/,'creation CLI 必须明确报告上游身份失败，而非只报告缺图');
      }
    }finally{rmSync(file,{force:true});}
  });
  if(dense && gradual)await test('切换：项目先改、下游全部失效；重建清除旧规则且不重编号',()=>{
    const dir=join(temp,'switch');mkdirSync(dir);
    const prod=write(join(dir,'production.json'),mutate(dense.production,p=>p.creative.selection=clone(gradual.story.selection)));
    for(const stage of stages){
      failed(gates(stage,dense[stage],{...ctxOf(dense),production:json(prod)}),'creative-project');
      const file=write(join(dir,`${stage}.json`),dense[stage]),before=clone(dense[stage]);
      const after=applied(stage,file,prod).doc;
      const nonPolicy=d=>Object.fromEntries(Object.entries(d.params).filter(([k])=>!['rules','defaults'].includes(k)));
      assert.deepEqual(nonPolicy(after),nonPolicy(before),'集数/时长/资产预算/估时/技术参数必须保持');
      assert.deepEqual(after.episodes,before.episodes,'切换不得偷偷改写故事正文与引用');
      if(stage==='outline'){assert.deepEqual(after.beats,before.beats);assert.deepEqual(after.params.rules.payoffCoverage,{level:'off'});assert.equal(after.params.defaults.questionResolveWithin,null);}
      assert.deepEqual(after.creativeContext.selection,gradual.story.selection);
    }
    // 真实删节点后旧剧本必须失效，不因为切换策略自动重新编号。
    const shorter=write(join(dir,'deleted-beat.json'),mutate(dense.outline,d=>d.beats.splice(0,1)));
    rejected(cli('script',['validate',dense.files.script,'--outline',shorter,'--production',dense.files.production]),/beats-claimed|beat|节点/i,'删除节点导致认领失效');
  });

  if(episodic)for(const stage of ['characters','art'])await test(`${stage}：独立拷贝且没有创作 profiles 仍消费完整视觉正文`,()=>{
    const installed=copySkill(stage,`asset-${stage}`);rmSync(join(installed.dir,'references/profiles'),{recursive:true,force:true});
    const file=stage==='characters'?episodic.files.cast:episodic.files.art;
    success(cli(stage,['validate',file,'--production',episodic.files.production],{base:installed.base,cwd:join(episodic.dir,stage)}),'资产阶段不依赖策略目录');
    const bad=write(join(temp,`missing-style-${stage}.json`),mutate(episodic.production,d=>delete d.style[stage==='characters'?'character':'scene']));
    rejected(cli(stage,['validate',file,'--production',bad],{base:installed.base}),/style|视觉|画风/,'创作策略不能补造视觉正文');
  });

  // 13.3 解析/来源边界：复制实际实现与 references，只改隔离副本。
  for(const stage of stages)if(profiles[stage]){
    await test(`${stage}：新增 profile 被发现；空 rules 清除旧限制；消费矩阵`,()=>{
      const installed=copySkill(stage,`matrix-${stage}`),api=profiles[stage],p=ready.get('dense');assert.ok(p,'密集基线不可缺失');
      const folder=newProfile(installed.dir,stage),selected=clone(p.story.selection);selected.pacing={id:'fixture-observation',version:'1.0.0'};
      const choices=write(join(temp,`selection-${stage}.json`),selected);
      const discovered=jsonResult(success(cli(stage,['profiles'],{base:installed.base}),'发现新目录'));assert.ok(discovered.some(x=>x.id==='fixture-observation'));
      const file=write(join(temp,`neutral-${stage}.json`),p[stage]);
      const result=cli(stage,['apply-profile',file,'--selection',choices,'--confirm'],{base:installed.base});assert.equal(jsonResult(result).applied,true);
      for(const [key,rule] of Object.entries(json(file).params.rules)){
        // structure 仍可配置自己的规则；只检查旧 pacing 声明的键。
        const prior=api.resolveProfiles(installed.dir,stage,p.story.selection);
        const source=api.discoverProfiles(installed.dir,stage).find(x=>x.dimension==='pacing'&&x.id===p.story.selection.pacing.id);
        if(key in source.rules)assert.deepEqual(rule,{level:'off'},`空 rules 必须移除 ${key}（原值 ${JSON.stringify(prior.rules[key])}）`);
      }
      if(stage==='creation'){
        rmSync(join(installed.dir,'references/profiles/structure'),{recursive:true,force:true});
        assert.equal(api.resolveProfiles(installed.dir,stage,selected).references.length,3);
      }
      rmSync(folder,{recursive:true});assert.throws(()=>api.resolveProfiles(installed.dir,stage,selected),/缺少必需/);
      const before=readFileSync(file,'utf8');rejected(cli(stage,['apply-profile',file,'--selection',choices,'--confirm'],{base:installed.base}),/缺少必需/,'缺 pacing');assert.equal(readFileSync(file,'utf8'),before);
    });
    await test(`${stage}：来源漂移历史可读、同版本拒绝、恢复及升级`,()=>{
      const p=ready.get('gradual');assert.ok(p,'渐进基线不可缺失');const api=profiles[stage],installed=copySkill(stage,`drift-${stage}`);
      const file=write(join(p.dir,stage,`.drift-${stage}.json`),p[stage]),original=readFileSync(file,'utf8');
      const source=api.discoverProfiles(installed.dir,stage).find(x=>x.dimension==='pacing'&&x.id===p.story.selection.pacing.id),guide=readFileSync(source.guidePath,'utf8');
      write(source.guidePath,guide+'\n同版本本地变更：测试必须识别来源漂移。\n');
      const inspected=api.inspectContext(json(file),{skillRoot:installed.dir,stage,production:p.production});
      assert.equal(gate(inspected,'creative-source-pacing').reason,'source-drift');clean(inspected,'漂移只能作为来源提醒');
      const rendered=success(cli(stage,['render',file,'--html',...flags(p,stage)],{base:installed.base,cwd:join(p.dir,stage)}),'漂移历史 render');assert.match(rendered.stdout,/来源漂移|source-drift|Source drift/i);
      // creation 缺图仍失败，但来源漂移自身不能新增基础阻断。
      const validated=cli(stage,['validate',file,...flags(p,stage)],{base:installed.base,cwd:join(p.dir,stage)});
      if(stage==='creation')rejected(validated,/设定图/,'缺图保持失败');else success(validated,'漂移历史 validate');
      assert.equal(readFileSync(file,'utf8'),original);
      rejected(cli(stage,['apply-profile',file,'--production',p.files.production,'--confirm'],{base:installed.base}),/来源漂移/,'同版本不能接受新摘要');assert.equal(readFileSync(file,'utf8'),original);
      write(source.guidePath,guide);assert.equal(gate(api.inspectContext(json(file),{skillRoot:installed.dir,stage,production:p.production}),'creative-source-pacing').status,'pass');
      assert.equal(jsonResult(cli(stage,['apply-profile',file,'--production',p.files.production,'--confirm'],{base:installed.base})).applied,true);
      write(source.guidePath,guide+'\n保持旧版本漂移，不先恢复。\n');
      const folder=dirname(source.profilePath),upgrade=join(dirname(folder),'1.0.1');cpSync(folder,upgrade,{recursive:true});
      write(join(upgrade,'profile.json'),{...json(join(upgrade,'profile.json')),version:'1.0.1'});
      const production=mutate(p.production,d=>d.creative.selection.pacing.version='1.0.1'),prodFile=write(join(temp,`upgrade-production-${stage}.json`),production);
      const preview=jsonResult(success(cli(stage,['apply-profile',file,'--production',prodFile],{base:installed.base}),'升级预览'));
      const decisions=write(join(temp,`upgrade-decisions-${stage}.json`),Object.fromEntries(preview.decisionsRequired.map(path=>[path,'drop'])));
      const result=cli(stage,['apply-profile',file,'--production',prodFile,'--decisions',decisions,'--confirm'],{base:installed.base});assert.equal(jsonResult(result).applied,true);assert.equal(json(file).creativeContext.selection.pacing.version,'1.0.1');
      rmSync(upgrade,{recursive:true});const saved=readFileSync(file,'utf8');
      const gs=api.inspectContext(json(file),{skillRoot:installed.dir,stage,production});assert.equal(gate(gs,'creative-source-pacing').reason,'source-unverifiable');clean(gs,'旧模板未安装时既有参数仍可检查');
      rejected(cli(stage,['apply-profile',file,'--production',prodFile,'--confirm'],{base:installed.base}),/缺少必需/,'未安装新应用失败');assert.equal(readFileSync(file,'utf8'),saved);
      rmSync(file,{force:true});
    });
    await test(`${stage}：手工差异预览、取消、明确保留/放弃、技术覆盖拒绝`,()=>{
      const api=profiles[stage],p=ready.get('gradual');assert.ok(p);
      const key=stage==='outline'?'payoffCoverage':stage==='script'?'lineLength':'cutDuration',path=`params.rules.${key}`;
      const value=stage==='outline'?{level:'warn',minPerEpisode:1}:stage==='script'?{level:'warn',maxChars:40}:{level:'warn',minSeconds:6,maxSeconds:10};
      const file=write(join(temp,`override-${stage}.json`),mutate(p[stage],d=>d.params.rules[key]=value)),before=readFileSync(file,'utf8');
      const preview=jsonResult(success(cli(stage,['apply-profile',file,'--production',p.files.production]),'覆盖预览'));assert.ok(preview.decisionsRequired.includes(path));assert.ok(preview.changes.find(x=>x.path===path).manualDifference);
      assert.equal(readFileSync(file,'utf8'),before,'取消（不 confirm）不写入');rejected(cli(stage,['apply-profile',file,'--production',p.files.production,'--confirm']),/未决项/,'未确认覆盖');assert.equal(readFileSync(file,'utf8'),before);
      for(const decision of ['keep','drop']){
        const decisions=write(join(temp,`decision-${stage}.json`),{[path]:decision});
        const r=cli(stage,['apply-profile',file,'--production',p.files.production,'--decisions',decisions,'--confirm']);assert.equal(jsonResult(r).applied,true);
        assert.deepEqual(json(file).params.rules[key],decision==='keep'?value:api.resolveProfiles(skillRoot(stage),stage,p.story.selection).rules[key]);
        assert.equal(json(file).creativeContext.overridePaths.includes(path),decision==='keep');
      }
      const overrides=write(join(temp,`illegal-override-${stage}.json`),{'params.maxSegmentSeconds':99}),saved=readFileSync(file,'utf8');
      rejected(cli(stage,['apply-profile',file,'--production',p.files.production,'--overrides',overrides,'--confirm']),/非法|不可覆盖/,'技术参数不能由 profile 覆盖');assert.equal(readFileSync(file,'utf8'),saved);
    });
    await test(`${stage}：原子替换失败不更新参数或来源快照`,()=>{
      const api=profiles[stage],p=ready.get('gradual');assert.ok(p);
      const file=write(join(temp,`atomic-${stage}.json`),p[stage]),before=readFileSync(file,'utf8'),rename=fs.renameSync;
      try{
        fs.renameSync=(from,to)=>{if(to===file){const e=new Error('fixture: simulated atomic rename failure');e.code='EACCES';throw e;}return rename(from,to);};
        assert.throws(()=>api.applyToFile(file,{skillRoot:skillRoot(stage),stage,selection:p.story.selection,confirm:true}),/simulated atomic rename failure/);
      }finally{fs.renameSync=rename;}
      assert.equal(readFileSync(file,'utf8'),before,'失败不能留下半新半旧文档');
      assert.ok(!readdirSync(dirname(file)).some(n=>n.startsWith(`atomic-${stage}.json.tmp-`)),'临时写入文件必须清理');
      const alias=join(temp,`atomic-alias-${stage}.json`);symlinkSync(file,alias);
      assert.throws(()=>api.applyToFile(alias,{skillRoot:skillRoot(stage),stage,selection:p.story.selection,confirm:true}),/符号链接/);assert.equal(readFileSync(file,'utf8'),before);
    });
    await test(`${stage}：未知规则/字段、重复身份、版本、指南逃逸与缺失严格拒绝`,()=>{
      const api=profiles[stage],installed=copySkill(stage,`parser-${stage}`),folder=newProfile(installed.dir,stage),file=join(folder,'profile.json'),good=json(file);
      const invalid=[['未知规则',{...good,rules:{unknown:{level:'off'}}}],['未知字段',{...good,unknown:true}],['错误版本',{...good,version:'latest'}],['指南逃逸',{...good,guide:'../../../../outside.md'}],['缺失指南',{...good,guide:'missing.md'}]];
      for(const [label,value] of invalid){write(file,value);assert.throws(()=>api.discoverProfiles(installed.dir,stage),undefined,label);}write(file,good);
      const duplicate=join(installed.dir,'references/profiles/duplicate');cpSync(folder,duplicate,{recursive:true});assert.throws(()=>api.discoverProfiles(installed.dir,stage),/重复/);rmSync(duplicate,{recursive:true});
      const link=join(folder,'linked.md');symlinkSync(join(root,'README.md'),link);write(file,{...good,guide:'linked.md'});assert.throws(()=>api.discoverProfiles(installed.dir,stage),/符号链接/);rmSync(link);write(file,good);
      const malformed=stage==='outline'?{payoffCoverage:{level:'warn',minPerEpisode:0}}:stage==='script'?{lineLength:{level:'unknown',maxChars:20}}:{cutDuration:{level:'off',maxSeconds:10}};
      write(file,{...good,rules:malformed});assert.throws(()=>api.discoverProfiles(installed.dir,stage));
    });
    await test(`${stage}：完整规则冲突不拼接，显式覆盖才可应用`,()=>{
      const api=profiles[stage],installed=copySkill(stage,`conflict-${stage}`),selected=clone(stories[1].selection);
      const key=stage==='outline'?'endingModes':stage==='script'?'lineLength':'cutDuration';
      const a=stage==='outline'?{level:'error',nonFinal:['closure','open'],final:['open','closure']}:stage==='script'?{level:'warn',maxChars:30}:{level:'warn',minSeconds:6,maxSeconds:10};
      const b=stage==='outline'?{final:['closure','open'],nonFinal:['open','closure'],level:'error'}:stage==='script'?{maxChars:30,level:'warn'}:{maxSeconds:10,minSeconds:6,level:'warn'};
      const first=newProfile(installed.dir,stage,{dimension:'genre',id:'fixture-one',rules:{[key]:a}}),second=newProfile(installed.dir,stage,{dimension:'narrativeStyle',id:'fixture-two',rules:{[key]:b}});
      newProfile(installed.dir,stage,{id:'fixture-neutral'});selected.genre.id='fixture-one';selected.narrativeStyle.id='fixture-two';selected.pacing.id='fixture-neutral';
      if(stage!=='creation'){newProfile(installed.dir,stage,{dimension:'structure',id:'fixture-structure'});selected.structure.id='fixture-structure';}
      assert.doesNotThrow(()=>api.resolveProfiles(installed.dir,stage,selected),'键与集合顺序不制造冲突');
      const changed=stage==='outline'?{...b,final:['closure']}:stage==='script'?{...b,maxChars:31}:{...b,maxSeconds:9};
      const file=join(second,'profile.json');write(file,{...json(file),rules:{[key]:changed}});
      assert.throws(()=>api.resolveProfiles(installed.dir,stage,selected),/冲突/);
      const resolved=api.resolveProfiles(installed.dir,stage,selected,{overrides:{[`params.rules.${key}`]:a}});assert.deepEqual(resolved.rules[key],a);
      const incomplete=clone(a);delete incomplete.level;write(join(first,'profile.json'),{...json(join(first,'profile.json')),rules:{[key]:incomplete}});assert.throws(()=>api.resolveProfiles(installed.dir,stage,selected),'不能从另一 profile 拼接缺失 level');
    });
  }
  if(ready.size!==3)failures.push({name:'三组合完整执行',message:`只有 ${ready.size}/3 条基线完成；依赖基线的后续断言未全部执行，不能宣布联合通过。`});
}finally{
  try{if(keep){
    write(join(projects,'index.html'),'<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>三组合隔离联合测试</title><style>body{max-width:800px;margin:auto;padding:24px;font:18px/1.8 system-ui}a{display:block;margin:16px 0}p{overflow-wrap:anywhere}</style><h1>三组合隔离联合测试</h1><p>原创文本与结构测试。没有生成图片或视频。真实 creation 缺图不能投产。内容评审和浏览器检查未执行。失败断言请以本次命令终端结果为准。</p>'+stories.map(s=>`<a href="${s.key}/project-report.html">${s.title}：合并报告</a><a href="${s.key}/script/script-report-zh.html">${s.title}：剧本节点对照</a><a href="${s.key}/creation/creation-report-zh.html">${s.title}：视频创作与缺图状态</a>`).join('')+'</html>');
    mkdirSync(dirname(keep),{recursive:true});cpSync(projects,keep,{recursive:true});console.log(`隔离项目导出：${keep}（没有图片/视频；内容评审及浏览器检查未执行）`);}}
  finally{rmSync(temp,{recursive:true,force:true});}
}
console.log(`\n本次测试：${passed} 组通过，${failures.length} 组失败；执行 ${cliCalls} 次真实 CLI。临时目录已清理。`);
console.log('没有调用付费服务。真实 creation 缺图是预期阻断，不代表完成图片生成或投产。characters/art 已验证 seed 身份传递、完整设计文本与骨架边界，但没有生成图片。');
if(failures.length){console.error('\n待修复项：');for(const f of failures)console.error(`- ${f.name}: ${f.message.slice(0,1800)}`);process.exitCode=1;}
