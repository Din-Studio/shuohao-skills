#!/usr/bin/env node
// 三组合真实 CLI 联合测试。仅 Node 标准库；不调用生成服务，不使用正式样例。
// node scripts/v3-pipeline-selftest.mjs [--keep /absolute/new-directory]
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {stories,style,buildOutline,fillScript,fillCreation} from './fixtures/strategy-pipeline/stories.mjs';
import {fillAssets,sourceText} from './fixtures/strategy-pipeline/assets.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(args.length && (args.length!==2 || args[0]!=='--keep' || !args[1])) throw Error('用法：node scripts/v3-pipeline-selftest.mjs [--keep <新目录>]');
const keep=args.length?resolve(args[1]):null;
if(keep && existsSync(keep)) throw Error('--keep 目标必须不存在，不覆盖已有项目');
const temp=mkdtempSync(join(tmpdir(),'shuohao-three-combinations-'));
const projects=join(temp,'projects');mkdirSync(projects);
const stages=['outline','script','creation'];
const failures=[];let passed=0,cliCalls=0;
const modules={},ready=new Map();
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
const blocking=gs=>gs.filter(g=>g.status==='fail'&&g.level==='error');
const clean=(gs,label)=>assert.deepEqual(blocking(gs),[],label);
const gate=(gs,id)=>{const g=gs.find(x=>x.id===id);assert.ok(g,`缺少检查 ${id}`);return g;};
const failed=(gs,id)=>{assert.equal(gate(gs,id).status,'fail',id);assert.ok(blocking(gs).some(g=>g.id===id),`${id} 应阻断`);};
const mutate=(doc,fn)=>{const d=clone(doc);fn(d);return d;};
const imagePaths=p=>new Set([...p.outline.characters.map(c=>`../characters/images/${c.name}-sheet.png`),...p.art.scenes.map(s=>`../art/images/${s.name}-sheet.png`),...p.art.props.map(s=>`../art/images/${s.name}-sheet.png`)]);
const ctxOf=p=>({outline:p.outline,script:p.script,art:p.art,cast:p.cast,production:p.production,imageExists:rel=>imagePaths(p).has(rel)});
const flags=(p,stage)=>['--production',p.files.production,...(stage!=='outline'?['--outline',p.files.outline,'--art',p.files.art]:[]),...(stage==='creation'?['--script',p.files.script,'--cast',p.files.cast]:[])];
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
// Preserve the original stories and v2 builders as explicit migration inputs.
// Adapt fixture data to v3 without importing another skill's examples or migration helpers.
function outlineV3(story) {
  const d=buildOutline(story);d.schemaVersion=3;
  delete d.adaptation; // Original-only placeholder; no source evidence or adaptation decisions.
  for(const c of d.characters)delete c.from;
  for(const b of d.beats){b.setup=b.type+'：'+b.setup;delete b.type;}
  for(const e of d.episodes){e.synopsis+='；'+e.stateChange.before+' → '+e.stateChange.after;delete e.stateChange;}
  return d;
}
function projectBody(d) {
  for(const ep of d.episodes)for(const key of ['opening','ending','endBeat'])delete ep[key];
  return d;
}
function assertV3(d,stage) {
  assert.equal(d.schemaVersion,3);
  for(const key of ['creative','creativeContext'])assert.ok(!(key in d),key);
  for(const key of ['rules','defaults','preferences'])assert.ok(!(key in (d.params??{})),key);
  if(stage==='script'||stage==='creation')for(const ep of d.episodes)
    for(const key of ['opening','ending','endBeat','seedNote'])assert.ok(!(key in ep),stage+' duplicates '+key);
}

try{
  await test('三份原有故事彼此独立，故事正文先于镜头生成',()=>{
    assert.deepEqual(stories.map(s=>s.title),['失物登记','夜班温度','楼下早餐']);
    for(const key of ['title','premise','throughline','scene','prop'])assert.equal(new Set(stories.map(s=>s[key])).size,3,key);
    for(const story of stories){assert.equal(story.episodes.length,3);assert.ok(story.episodes.every(e=>e.actions.length&&e.nodes.length));}
  });
  await test('加载当期本地接口（缺失即失败，不降级旧契约）',async()=>{
    for(const stage of stages){modules[stage]=await import(pathToFileURL(join(skillRoot(stage),'scripts',`novel-${stage}.mjs`)));}
  });
  for(const story of stories){
    await test(`${story.title}：真实 v3 init → seed → validate → render`,()=>{
      const dir=join(projects,story.key);mkdirSync(dir,{recursive:true});
      for(const s of ['outline','script','creation','art','characters'])mkdirSync(join(dir,s));
      const files={production:join(dir,'production.json'),outline:join(dir,'outline',`${story.title}-outline.json`),script:join(dir,'script',`${story.title}-script.json`),creation:join(dir,'creation',`${story.title}-creation.json`),art:join(dir,'art',`${story.title}-art.json`),cast:join(dir,'characters',`${story.title}-cast.json`)};
      const styleFile=write(join(dir,'style-input.json'),style);
      const production=jsonResult(success(cli('setup',['init','--aspect','9:16','--source',story.title,'--video-model','MiniMax H3','--video-resolution','768p','--prompt-lang','zh','--creative-brief',story.promise,'--style',styleFile]),'setup init'));
      write(files.production,production);success(cli('setup',['validate',files.production]),'setup validate');
      assertV3(production,'production');assert.equal(production.creativeBrief,story.promise);
      write(join(dir,'production.md'),success(cli('setup',['show',files.production,'--md']),'setup show').stdout);
      const outline=outlineV3(story);write(files.outline,outline);
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
      assertV3(seed,'script');assert.equal(seed.episodes.length,3);
      for(const [i,ep] of seed.episodes.entries()){
        assert.equal(ep.targetSeconds,24);
        assert.deepEqual(ep.scenes,[]);
        assert.deepEqual(ep.beatClaims,outline.beats.filter(b=>b.episode===ep.ep).map(b=>({beatId:b.id,start:null,end:null})));
      }
      write(join(dir,'script-seed.json'),seed);
      const script=projectBody(fillScript(seed,story));write(files.script,script);
      const p={story,dir,files,production,outline,script,cast,art};
      success(cli('script',['validate',files.script,...flags(p,'script')]),'script 联合 validate');
      const cseed=jsonResult(success(cli('creation',['seed',files.script,'--eps','1-3','--outline',files.outline]),'creation seed'));
      assertV3(cseed,'creation');for(const ep of cseed.episodes)assert.deepEqual(ep.segments,[]);
      write(join(dir,'creation-seed.json'),cseed);
      p.creation=fillCreation(cseed,script,story);write(files.creation,p.creation);
      ready.set(story.key,p); // Keep downstream cases runnable even when a renderer has a transient failure.
      clean(gates('creation',p.creation,ctxOf(p)),'仅 imageExists 替身时其余契约应全部通过');
      // CLI 不提供图片替身：缺图是确定的未完成项，不能把零退出码冒充联合交付。
      const real=cli('creation',['validate',files.creation,...flags(p,'creation')],{cwd:join(dir,'creation')});
      rejected(real,/设定图|reference|image/i,'真实缺图 CLI');
      const missing=gates('creation',p.creation,{...ctxOf(p),imageExists:()=>false});
      assert.deepEqual(blocking(missing).map(g=>g.id),['refimage-coverage'],'真实项目唯一 creation 阻断应为图片缺失');
      for(const stage of stages){
        assertV3(p[stage],stage);assert.ok(!('creativeBrief' in p[stage]),'项目要求只有 production 一个真源');
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
    await test(`${p.story.title}：稳定 ID、时长与无重复计划的全链契约`,()=>{
      for(const stage of stages){
        assertV3(p[stage],stage);const gs=gates(stage,p[stage],ctxOf(p));clean(gs,stage);
        assert.ok(gs.every(g=>!('ok' in g)&&['pass','fail','skipped'].includes(g.status)),'结构状态不冒充内容通过');
      }
      assert.deepEqual(p.script.episodes.map(e=>e.scenes[0].flow.map(b=>b.action)),p.story.episodes.map(e=>e.actions),'原有正文逐字保持');
      for(const ep of p.script.episodes){assert.deepEqual(ep.beatClaims.map(c=>c.beatId),p.outline.beats.filter(b=>b.episode===ep.ep).map(b=>b.id));assert.equal(ep.targetSeconds,p.outline.params.minutesPerEpisode*60);}
      const changed=mutate(p.outline,o=>o.params.minutesPerEpisode=0.5),file=write(join(temp,`${p.story.key}-longer.json`),changed);
      rejected(cli('script',['validate',p.files.script,'--outline',file,'--art',p.files.art,'--production',p.files.production]),/upstream-duration|目标时长|target/i,'时长变化必须失效');
      failed(gates('creation',p.creation,{...ctxOf(p),outline:changed}),'upstream-intent');
      const invalid=mutate(p.creation,c=>c.episodes[0].ending=clone(p.outline.episodes[0].ending));assert.ok(blocking(gates('creation',invalid,ctxOf(p))).length,'重复计划必须要求迁移');
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
      ['openingBeat 无效',d=>{d.episodes[0].openingBeat=[9,1];},/openingBeat|坐标/i],
      ['剧本 ending 禁止复制 Q',d=>d.episodes[0].ending={mode:'suspense',event:'重复计划',question:{id:'Q01'}},/ending|question|mode\/event/i],
      ['开场投影不可擅改',d=>d.episodes[0].opening='重复开场',/upstream-projection|开场/i],
      ['集尾投影不可擅改',d=>d.episodes[0].ending={mode:'open',event:'重复集尾'},/upstream-projection|集尾/i],
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
    const scriptFile=write(join(temp,'standalone-batch','batch-script.json'),mutate(dense.script,d=>d.episodes=d.episodes.slice(0,1)));
    try{
      success(cli('script',['validate',scriptFile,'--outline',dense.files.outline,'--art',dense.files.art,'--no-production']),'第一集独立批次仍是普通悬念集');
      const seeded=jsonResult(success(cli('creation',['seed',scriptFile,'--outline',dense.files.outline]),'creation 单集批次 seed'));assertV3(seeded,'creation');assert.equal(seeded.episodes.length,1);
    }finally{rmSync(scriptFile,{force:true});}
  });
  if(gradual){
    for(const [total,invalid] of [[20.4,false],[27.6,false],[20.3999999,true],[27.6000001,true]])await test(`制作目标时长容差闭区间：${total}`,()=>{
      const d=clone(gradual.creation);
      for(const ep of d.episodes)for(const seg of ep.segments)for(const cut of seg.cuts)cut.seconds=total/4;
      assert.equal(gate(gates('creation',d,ctxOf(gradual)),'ep-duration').status,invalid?'fail':'pass');
      // 真正缺少 art 的独立项目：图片检查明确跳过，不让缺图遮住时长边界。
      const dir=join(temp,`duration-${total}`);
      const production=write(join(dir,'production.json'),gradual.production);
      const outline=write(join(dir,'outline','plan-outline.json'),gradual.outline);
      const script=write(join(dir,'script','text-script.json'),gradual.script);
      const creation=write(join(dir,'creation','plan-creation.json'),d);
      const r=cli('creation',['validate',creation,'--script',script,'--outline',outline,'--production',production],{cwd:dirname(creation)});
      if(invalid)rejected(r,/duration|总秒数|目标/i,'实际镜头总长越界');else success(r,'合法闭区间端点');
    });
    await test('渐进故事无需兑现分类或关闭规则，最终开放仍成立',()=>{
      const d=mutate(gradual.outline,o=>{
        for(const b of o.beats){delete b.kind;delete b.weight;delete b.position;}
        delete o.arcs;delete o.story.audiencePromise;for(const c of o.characters)delete c.arc;
      });
      clean(gates('outline',d,ctxOf(gradual)),'最小原创');
      assert.equal(d.episodes.at(-1).ending.mode,'open');
      assert.ok(!('rules' in d.params));
      success(variant(gradual,'outline',o=>Object.assign(o,d)),'无分类原创 CLI');
    });
    for(const [name,fn] of [
      ['required 未解决',d=>delete d.beats[4].resolves],['未知问题',d=>d.beats[4].resolves=['Q99']],
      ['重复解决',d=>d.beats[5].resolves=['Q01']],['提前解决',d=>{d.beats[0].resolves=['Q01'];delete d.beats[4].resolves;}],
      ['超过明确期限',d=>d.episodes[0].ending.question.dueByEp=2],['optional 携带期限',d=>d.episodes[2].ending.question.dueByEp=3],
      ['非法节点 ID',d=>d.beats[0].id='bad'],['重复节点 ID',d=>d.beats[1].id='B01'],['节点错误集号',d=>d.beats[0].episode=4],
      ['无效节点位置',d=>d.beats[0].position='unknown'],['未知资产引用',d=>d.episodes[0].characterIds=['C99']],
      ['非 payoff 伪造 weight',d=>d.beats[0].weight='minor'],['旧规则字段',d=>d.params.rules={payoffCoverage:{level:'off'}}]
    ])await test(`渐进简化契约仍拒绝：${name}`,()=>rejected(variant(gradual,'outline',fn),null,name));
    await test('剧本独立 suspense 无 Q 合法；损坏上游与缺上游区分',()=>{
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
      e.beatClaims[0].start=[1,2];e.beatClaims[0].end=[2,1];e.beatClaims[1].start=[2,2];e.beatClaims[1].end=[2,2];
      clean(gates('script',d,ctxOf(gradual)),'跨场段合法');
      const m=modules.script,t=m.episodeTimeline(e,d.params),range=m.claimRange(e,e.beatClaims[0],d.params);
      assert.equal(t.at(-1).endSeconds,24);assert.equal(range.startSeconds,6);assert.equal(range.endSeconds,18);
      assert.equal(m.claimRange(e,{start:[99,1],end:[99,2]},d.params),null,'无效范围不是零秒');
      e.openingBeat=[2,2];clean(gates('script',d,ctxOf(gradual)),'合法晚开场不受创作规则硬门限制');
    });
  }
  if(episodic)await test('参考图挂载：仅认可 fixture 路径；未知挂载 ID 不能被策略关闭',()=>{
    const seen=new Set(),ctx={...ctxOf(episodic),imageExists:rel=>{seen.add(rel);return imagePaths(episodic).has(rel);}};
    clean(gates('creation',episodic.creation,ctx),'已知映射的图片替身');assert.deepEqual(seen,imagePaths(episodic));
    const absent={...ctxOf(episodic),imageExists:rel=>imagePaths(episodic).has(rel)&&!rel.includes(episodic.story.prop)};
    failed(gates('creation',episodic.creation,absent),'refimage-coverage');
    const bad=mutate(episodic.creation,c=>{c.episodes[0].segments[0].images[0].ref='C99';});
    assert.ok(blocking(gates('creation',bad,ctxOf(episodic))).length,'段级挂载 C99 未知引用必须阻断，不能只校验 cut 人物');
  });
  if(episodic)await test('单元：非末集 closure、八秒观察、模型限制不被策略越权',()=>{
    assert.equal(episodic.outline.episodes[0].ending.mode,'closure');assert.ok(!('ending'in episodic.script.episodes[0]));
    clean(gates('creation',episodic.creation,ctxOf(episodic)),'八秒观察镜头合法');
    for(const ep of episodic.creation.episodes)for(const seg of ep.segments)for(const cut of seg.cuts)assert.ok(cut.seconds>=6&&cut.seconds<=10);
    const illegal=mutate(episodic.creation,c=>{c.episodes[0].segments[0].cuts[0].seconds=16;});
    failed(gates('creation',illegal,ctxOf(episodic)),'segment-cap');
    // 即使技术配置手工改为 20 秒，模型本身的 15 秒上限仍生效。
    illegal.params.maxSegmentSeconds=20;failed(gates('creation',illegal,ctxOf(episodic)),'segment-cap');
    const file=write(join(temp,'illegal-segment.json'),illegal);rejected(cli('creation',['validate',file,...flags(episodic,'creation')]),/时长区间|15|segment/i,'模型上限');
    const badProduction=write(join(temp,'bad-production.json'),mutate(episodic.production,p=>p.video.resolution='invalid'));
    rejected(cli('setup',['validate',badProduction]),/resolution|分辨率|档位/i,'制作分辨率');
  });

  if(dense)await test('真实删除上游节点不能自动修补或重编号认领',()=>{
    const shorter=write(join(temp,'deleted-beat.json'),mutate(dense.outline,d=>d.beats.splice(0,1)));
    rejected(cli('script',['validate',dense.files.script,'--outline',shorter,'--production',dense.files.production]),/beats-claimed|beat|节点/i,'删除节点导致认领失效');
  });

  if(episodic)for(const stage of ['characters','art'])await test(`${stage}：独立拷贝且没有创作 profiles 仍消费完整视觉正文`,()=>{
    const installed=copySkill(stage,`asset-${stage}`);rmSync(join(installed.dir,'references/profiles'),{recursive:true,force:true});
    const file=stage==='characters'?episodic.files.cast:episodic.files.art;
    success(cli(stage,['validate',file,'--production',episodic.files.production],{base:installed.base,cwd:join(episodic.dir,stage)}),'资产阶段不依赖策略目录');
    const bad=write(join(temp,`missing-style-${stage}.json`),mutate(episodic.production,d=>delete d.style[stage==='characters'?'character':'scene']));
    rejected(cli(stage,['validate',file,'--production',bad],{base:installed.base}),/style|视觉|画风/,'创作策略不能补造视觉正文');
  });

  for(const p of ready.values())for(const stage of stages){
    await test(`${p.story.title}/${stage}：旧字段与双重创作要求明确拒绝`,()=>{
      for(const change of [d=>d.schemaVersion=2,d=>d.creativeContext={},d=>d.params.rules={},d=>d.params.defaults={},d=>d.creativeBrief='本地要求需要人工合并'])
        rejected(variant(p,stage,change),/迁移|v3|schema|creative|rules|defaults|合并|brief/i,'拒绝旧契约或要求冲突');
    });
    await test(`${p.story.title}/${stage}：指南文字变更不使故事失效`,()=>{
      const installed=copySkill(stage,`guide-${p.story.key}-${stage}`);
      assert.ok(!existsSync(join(installed.dir,'scripts/lib/creative.mjs')),'旧框架已删除');
      assert.ok(!existsSync(join(installed.dir,'references/profiles')),'旧配置目录已删除');
      const guide=join(installed.dir,'references/创作指南.md');
      write(guide,readFileSync(guide,'utf8')+'\n本地评审补充：核对可观察证据，不改写既有正文。\n');
      const before=readFileSync(p.files[stage],'utf8');
      const r=cli(stage,['validate',p.files[stage],...flags(p,stage)],{base:installed.base});
      if(stage==='creation')rejected(r,/设定图|image|reference/i,'缺图仍阻断');else success(r,'指南不参与身份校验');
      assert.equal(readFileSync(p.files[stage],'utf8'),before);
      for(const command of ['profiles','profile','apply-profile'])rejected(cli(stage,[command,p.files[stage]],{base:installed.base}),null,'退役命令不静默执行');
    });
  }
  if(gradual){
    await test('工具参考预算只提醒；显式制作预算仍阻断',()=>{
      const d=clone(gradual.outline);delete d.params.thresholds;
      for(let i=2;i<=10;i++){
        const id=`P${String(i).padStart(2,'0')}`;
        d.props.push({id,name:`额外记录夹${i}`,function:'隔离预算边界测试'});
        d.episodes[0].propIds.push(id);
      }
      const gs=gates('outline',d,ctxOf(gradual));clean(gs,'参考预算不阻断');
      const reference=gate(gs,'prop-cap');assert.equal(reference.status,'fail');assert.equal(reference.level,'warn');assert.equal(reference.budgetSource,'reference');
      d.params.thresholds={maxProps:8};const explicit=gate(gates('outline',d,ctxOf(gradual)),'prop-cap');
      assert.equal(explicit.status,'fail');assert.equal(explicit.level,'error');assert.equal(explicit.budgetSource,'user');
      rejected(variant(gradual,'outline',o=>Object.assign(o,d)),/prop-cap|道具|预算|10 > 8/i,'显式预算 CLI');
    });
    await test('未分类节点仍完整认领，suspense 可以不登记问题',()=>{
      const d=clone(gradual.outline);
      for(const e of d.episodes)delete e.ending.question;
      for(const b of d.beats){delete b.resolves;delete b.kind;delete b.weight;}
      clean(gates('outline',d,ctxOf(gradual)),'无问题登记');
      clean(gates('script',gradual.script,{...ctxOf(gradual),outline:d}),'未分类节点认领');
      const file=write(join(temp,'unclassified-outline.json'),d);
      success(cli('script',['validate',gradual.files.script,'--outline',file,'--production',gradual.files.production]),'未分类真实 CLI');
    });
    await test('估时默认值一致、覆盖参数统一、超时只提醒，非法数值仍阻断',()=>{
      const m=modules.script,ep=gradual.script.episodes[0];
      assert.deepEqual(m.episodeTimeline(ep,{}),m.episodeTimeline(ep,{charsPerSecond:4.5,actionSeconds:2.5,tolerance:0.15}));
      const d=mutate(gradual.script,s=>s.params.actionSeconds=10);
      assert.equal(m.episodeTimeline(d.episodes[0],d.params).at(-1).endSeconds,40);
      assert.equal(m.claimRange(d.episodes[0],d.episodes[0].beatClaims[0],d.params).endSeconds,20);
      const gs=gates('script',d,ctxOf(gradual));clean(gs,'粗略估时不能阻断');
      assert.ok(gs.some(g=>g.level==='warn'&&g.status==='fail'),'超时需明确提醒');
      success(variant(gradual,'script',s=>s.params.actionSeconds=10),'超时 CLI 仍可结构通过');
      for(const change of [s=>s.params.actionSeconds=0,s=>s.params.charsPerSecond=-1,s=>s.params.tolerance='0.15'])
        rejected(variant(gradual,'script',change),null,'非法估时参数');
    });
    await test('末拍从正文推导；追加动作使旧镜头覆盖失效',()=>{
      const script=clone(gradual.script),ep=script.episodes[0];
      delete ep.openingBeat;
      clean(gates('script',script,ctxOf(gradual)),'省略开场落点');
      assert.deepEqual(modules.script.episodeTimeline(ep,script.params).at(-1).coord,[1,4]);
      ep.scenes[0].flow.push({action:'许苒把笔放回记录夹旁。'});
      assert.deepEqual(modules.script.episodeTimeline(ep,script.params).at(-1).coord,[1,5]);
      assert.ok(!('endBeat' in ep));
      assert.ok(blocking(gates('creation',gradual.creation,{...ctxOf(gradual),script})).length,'旧镜头没有覆盖新增末拍');
      const file=write(join(temp,'appended-script.json'),script);
      const seed=jsonResult(success(cli('creation',['seed',file,'--outline',gradual.files.outline,'--production',gradual.files.production]),'追加末拍后的真实 seed'));
      assertV3(seed,'creation');assert.ok(!seed.episodes[0].openingBeat,'不伪造开场映射');
    });
    await test('独立剧本无上游可渲染，缺失、损坏和多候选不能混淆',()=>{
      const dir=join(temp,'standalone-project'),file=join(dir,'script','standalone-script.json');
      const d=clone(gradual.script);
      for(const [i,e] of d.episodes.entries()){
        delete e.beatClaims;delete e.openingBeat;
        e.opening=gradual.outline.episodes[i].opening;
        e.ending={mode:gradual.outline.episodes[i].ending.mode,event:gradual.outline.episodes[i].ending.event};
      }
      write(file,d);
      success(cli('script',['validate',file,'--no-production'],{cwd:dir}),'独立剧本');
      const rendered=success(cli('script',['render',file,'--html','--no-production'],{cwd:dir}),'独立渲染');
      assert.match(rendered.stdout,/未检查|未提供|缺少|未对账|missing|skipped|not checked/i);
      rejected(cli('script',['validate',file,'--outline',join(dir,'missing.json'),'--no-production']),/不存在|ENOENT|missing|找不到/i,'显式缺失不是未提供');
      write(join(dir,'outline','one-outline.json'),gradual.outline);
      write(join(dir,'outline','two-outline.json'),gradual.outline);
      rejected(cli('script',['validate',file,'--no-production'],{cwd:dir}),/多|唯一|显式|ambig|multiple/i,'多候选不静默任选');
    });
    await test('项目要求变化不制造身份失效；报告不宣称内容已评审',()=>{
      const production=mutate(gradual.production,p=>p.creativeBrief='保持证据顺序，允许长时间观察。');
      for(const stage of stages)clean(gates(stage,gradual[stage],{...ctxOf(gradual),production}),'自然语言要求不触发配置身份门');
      const file=write(join(gradual.dir,'.changed-production.json'),production);
      const r=success(cli('script',['render',gradual.files.script,'--html','--outline',gradual.files.outline,'--production',file]),'新要求报告');
      assert.match(r.stdout,/内容.{0,20}(未|尚未)|not.{0,20}review|review.{0,20}not/i);
    });
    await test('媒体导出保持参考图身份、顺序和提示词原文，真实 CLI 缺图不能投产',()=>{
      const p=gradual,segments=p.creation.episodes.flatMap(e=>e.segments);
      const names=new Map([...p.outline.characters,...p.outline.scenes,...p.outline.props].map(x=>[x.id,x.name]));
      const resolveImage=(kind,ref)=>({name:names.get(ref),path:`${kind}/${ref}.png`,exists:true});
      const pack=modules.creation.exportPack(p.creation,p.script,{resolveImage,production:p.production});
      assert.equal(pack.missingTotal,0);
      for(const [i,segment] of segments.entries()){
        assert.deepEqual(pack.manifest[i].images.map(x=>[x.kind,x.ref,x.path]),segment.images.map(x=>[x.kind,x.ref,`${x.kind}/${x.ref}.png`]));
        const prompt=pack.files.find(f=>f.path===pack.manifest[i].prompt).content;
        const body=prompt.split('<!-- prompt:start -->\n')[1]?.split('\n<!-- prompt:end -->')[0];
        assert.equal(body,segment.prompt,'不改写已创作的视频提示词');
        assert.ok(prompt.includes('## 当前审核\n'),'审核区域与正文共存');
        assert.ok(!body.includes('尚未审核。'),'审核意见不进入正文');
        segment.images.forEach((x,k)=>assert.ok(prompt.includes(`Picture ${k+1} = ${names.get(x.ref)}`)));
      }
      const target=join(temp,'must-not-export');
      rejected(cli('creation',['export',p.files.creation,...flags(p,'creation'),'--out',target],{cwd:join(p.dir,'creation')}),/设定图|reference|image|投产/i,'缺图 export 阻断');
      assert.ok(!existsSync(target),'失败不能留下投产包');
    });
    for(const [name,change] of [
      ['镜头漏拍',d=>d.episodes[0].segments.pop()],
      ['镜头顺序倒置',d=>d.episodes[0].segments.reverse()],
      ['镜头重复覆盖',d=>d.episodes[0].segments[1].cuts[0].beats=[1,1]],
      ['参考图数量与提示词不一致',d=>d.episodes[0].segments[0].images.pop()],
      ['镜头引用未知人物',d=>d.episodes[0].segments[0].cuts[0].characters=['C99']],
      ['非法模型时长',d=>d.episodes[0].segments[0].cuts[0].seconds=0]
    ])await test(`制作交接拒绝${name}`,()=>{
      assert.ok(blocking(gates('creation',mutate(gradual.creation,change),ctxOf(gradual))).length,name);
      rejected(variant(gradual,'creation',change),null,name);
    });
  }
  // Explicit migration: originals are the recovery copy; no in-place mutation or paid calls.
  for(const stage of ['setup',...stages])await test(`${stage}：显式迁移预览、语义待确认、原件恢复与损坏输入`,()=>{
    const p=gradual;assert.ok(p,'迁移依赖完整原创基线');
    let old;
    if(stage==='setup'){
      old=clone(p.production);delete old.schemaVersion;old.creative={version:1,selection:clone(p.story.selection)};
    }else if(stage==='outline'){
      old=buildOutline(p.story);old.params.preferences=['保留独立测量，不提前指认责任人。'];
      old.params.rules=Object.fromEntries(['payoffCoverage','firstMajor','majorGap','endingPayoff','endingModes','optionalQuestions','stateProgress','arcCoverage','arcPayoff'].map(key=>[key,{level:'off'}]));
      old.params.defaults={questionResolveWithin:null};
      old.adaptation.evidence='原文证据：“记录没有被丢弃。”';
    }else{
      old=clone(p[stage]);old.schemaVersion=2;
      old.params.rules=stage==='script'?{openingWindow:{level:'off'},lineLength:{level:'off'}}:{cutDuration:{level:'off'}};
      for(const [i,ep] of old.episodes.entries()){
        ep.opening=p.outline.episodes[i].opening;
        ep.ending={mode:p.outline.episodes[i].ending.mode,event:p.outline.episodes[i].ending.event};
        ep.openingBeat=clone(p.script.episodes[i].openingBeat);
        ep.endBeat=[1,p.script.episodes[i].scenes[0].flow.length];
      }
      if(stage==='script')old.episodes[0].seedNote='保留观察等待，不把记录动作改成指认。';
    }
    const dir=join(temp,'migration',`case-${stage}`),input=write(join(dir,'input.json'),old),out=join(dir,'output.json');
    const before=readFileSync(input,'utf8');
    const migrationFlags=stage==='script'?['--outline',p.files.outline,'--no-production']
      :stage==='creation'?['--script',p.files.script,'--outline',p.files.outline]:[];
    const migrate=(...args)=>cli(stage,['migrate-v3',...args,...migrationFlags]);
    const preview=migrate(input);
    assert.equal(readFileSync(input,'utf8'),before,'预览不改原件');assert.ok(!existsSync(out));
    assert.match(preview.output,/pending|待确认|待人工|preview|预览/i,`必须真实提供迁移预览而不是未知命令：${preview.output}`);
    assert.doesNotThrow(()=>JSON.parse(preview.stdout),'迁移预览是可读 JSON');
    migrate(input,'--out',out);
    assert.ok(!existsSync(out),'语义待确认时不能写入正式产物');assert.equal(readFileSync(input,'utf8'),before);
    const migrated=migrate(input,'--out',out,'--confirm');
    success(migrated,'明确确认后写新文件');assert.equal(readFileSync(input,'utf8'),before,'原件可恢复');
    const next=json(out);assert.equal(next.schemaVersion,3);assert.equal(next.source,old.source);
    assert.ok(!('creativeContext' in next)&&!('creative' in next));
    for(const key of ['rules','defaults','preferences'])assert.ok(!(key in (next.params??{})));
    if(stage!=='setup')assert.deepEqual(next.episodes.map(e=>e.ep),old.episodes.map(e=>e.ep));
    if(stage==='outline'){
      assert.deepEqual(next.beats.map(b=>b.id),old.beats.map(b=>b.id));
      assert.deepEqual(next.characters.map(c=>c.id),old.characters.map(c=>c.id));
      assert.deepEqual(next.scenes.map(c=>c.id),old.scenes.map(c=>c.id));
      assert.deepEqual(next.props.map(c=>c.id),old.props.map(c=>c.id));
      assert.deepEqual(next.adaptation.evidence,old.adaptation.evidence,'原文证据逐字保持');
      for(const preference of old.params.preferences)assert.ok(JSON.stringify(next).includes(preference),'真实偏好不能静默丢弃');
    }
    if(stage==='script')assert.deepEqual(next.episodes.map(e=>e.scenes),old.episodes.map(e=>e.scenes),'正文与资产不变');
    if(stage==='creation')assert.deepEqual(next.episodes.map(e=>e.segments),old.episodes.map(e=>e.segments),'镜头与媒体协议不变');
    if(stage==='script'||stage==='creation'){
      assertV3(next,stage);
      // Real migration outputs must remain discoverable without treating review/backup sidecars as documents.
      const project=join(dir,'discovery-project');cpSync(p.dir,project,{recursive:true});
      const migratedFile=join(project,stage,`${p.story.title}-${stage}.json`);rmSync(migratedFile);
      success(migrate(input,'--out',migratedFile,'--confirm'),'迁移到真实阶段目录');
      const combined=spawnSync(process.execPath,[join(root,'scripts/report.mjs'),'--from',project,'--out',join(project,'migrated-report.html')],{cwd:project,encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024});cliCalls++;
      assert.ifError(combined.error);assert.equal(combined.status,0,combined.stderr);assert.match(combined.stdout,/5 个面板/,'迁移副产物不能造成多个上游候选');
    }
    const saved=readFileSync(out,'utf8');
    rejected(migrate(input,'--out',out,'--confirm'),/存在|exist|覆盖/i,'拒绝覆盖已有目标');
    assert.equal(readFileSync(out,'utf8'),saved);
    rejected(migrate(input,'--out',input,'--confirm'),null,'禁止输入输出相同');
    assert.equal(readFileSync(input,'utf8'),before);
    const alias=join(dir,'alias.json');symlinkSync(input,alias);
    rejected(migrate(alias,'--out',join(dir,'alias-out.json'),'--confirm'),/符号链接|symlink/i,'不通过符号链接迁移');
    assert.equal(readFileSync(input,'utf8'),before);
    const malformed=clone(old);
    if(stage==='setup')malformed.video.resolution='invalid';
    else if(stage==='outline')delete malformed.beats[4].resolves;
    else malformed.episodes[0].endBeat=[99,99];
    for(const bad of ['{broken',JSON.stringify({...old,schemaVersion:999}),JSON.stringify(malformed)]){
      const broken=write(join(dir,'broken.json'),bad),target=join(dir,'invalid-output.json');
      rejected(migrate(broken,'--out',target,'--confirm'),null,'非法输入不能修饰成 v3');
      assert.equal(readFileSync(broken,'utf8'),bad);assert.ok(!existsSync(target));
    }
    const invalidUtf8=join(dir,'invalid-utf8.json'),invalidOut=join(dir,'invalid-utf8-out.json');
    const encodingDoc=clone(old);
    if(stage==='script')encodingDoc.episodes[0].scenes[0].flow[0].action+='__invalid_utf8__';
    else if(stage==='creation')encodingDoc.episodes[0].segments[0].prompt+='__invalid_utf8__';
    else encodingDoc.source='__invalid_utf8__';
    const encodingParts=JSON.stringify(encodingDoc).split('__invalid_utf8__');
    writeFileSync(invalidUtf8,Buffer.concat([Buffer.from(encodingParts[0]),Buffer.from([0xff]),Buffer.from(encodingParts[1])]));
    const invalidBytes=readFileSync(invalidUtf8);
    rejected(migrate(invalidUtf8,'--out',invalidOut,'--confirm'),null,'损坏编码不能修饰成新文件');
    assert.ok(!existsSync(invalidOut));assert.deepEqual(readFileSync(invalidUtf8),invalidBytes);
    const restored=write(join(dir,'restored.json'),before);assert.deepEqual(json(restored),old);
  });
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
