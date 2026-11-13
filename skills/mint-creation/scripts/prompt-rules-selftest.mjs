#!/usr/bin/env node
// 新写法与审核格式：离线反例，不能替代语义审核或生成验证。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CAMERA_REFERENCE,FIXED_ENDING,parsePrompt,promptProblems,promptTimecode} from './lib/prompt.mjs';
import {promptFixture} from './test-prompt.mjs';
import * as W from './lib/worksheet.mjs';
import {dispatchBrief,gateReport,worksheetSyncProblem} from './mint-creation.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const json=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
const doc=json('examples/creation/收书人-creation.json'),script=json('examples/script/收书人-script.json');
const sample=doc.episodes[0].segments[0],production=json('examples/production.json');
const material=dispatchBrief(doc,{script,production,scriptPath:join(root,'examples/script/收书人-script.json'),
  cast:json('examples/characters/收书人-cast.json'),castPath:join(root,'examples/characters/收书人-cast.json'),
  art:json('examples/art/收书人-art.json'),artPath:join(root,'examples/art/收书人-art.json')},1);
let count=0;const test=(name,fn)=>{fn();count++;console.log(`PASS ${name}`);};
const base=promptFixture('测试人物把物件放到桌面。');
test('five parts, ordinary prose, no synthetic cuts',()=>{
  assert.deepEqual(promptProblems(base),[]);assert.equal(parsePrompt(base).body,'测试人物把物件放到桌面。');
  assert.equal(promptTimecode(base),null);assert.ok(base.startsWith(CAMERA_REFERENCE));assert.ok(base.includes(FIXED_ENDING));
});
for(const [name,mutate,expected] of [
  ['camera policy',p=>p.replace('禁止镜头固定','允许镜头固定'),/逐字/],
  ['global order',p=>p.replace('色调：','颜色：'),/七栏/],
  ['empty global',p=>p.replace(/氛围：[^\n]+/,'氛围：'),/七栏/],
  ['temperature',p=>p.replace('4000 K','暖光'),/色温/],
  ['references',p=>p.replace('参考素材：无','素材：无'),/参考素材/],
  ['ending',p=>p.replace('无配乐、无背景音乐','可以播放音乐'),/固定/],
  ['style sentence',p=>p.replace('写实画风，整体材质自然。',''),/画风/],
  ['negative',p=>p.replace('负面提示词：','排除：'),/负面/],
  ['old shots',p=>p.replace('测试人物把物件','[Shot 1] 测试人物把物件'),/旧逐镜/],
  ['placeholder',p=>p.replace('测试人物把物件','[散文式正文]测试人物把物件'),/占位符/],
])test(`format rejects ${name}`,()=>assert.ok(promptProblems(mutate(base)).some(p=>expected.test(p))));
for(const stamp of ['0–3秒','第3秒','at 3.5 seconds','00:03','after second 3'])test(`only fixed policy exempt: ${stamp}`,()=>{
  assert.ok(promptTimecode(base.replace('测试人物',stamp+'测试人物')));assert.ok(promptTimecode(base+'\n'+CAMERA_REFERENCE));
});
test('image list and prose both reference the same uploaded index',()=>{
  const p=promptFixture('拿起物件。',['测试人物','测试物件']);
  assert.deepEqual(promptProblems(p,[{},{}]),[]);
  assert.ok(promptProblems(p,[{}]).some(x=>x.includes('@图片2')));
  const bodyOnly=p.replace('测试人物@图片1：仅供文件与顺序检查。','测试人物：外观参考。');
  assert.ok(promptProblems(bodyOnly,[{},{}]).some(x=>x.includes('参考素材缺少 @图片1')));
  const listOnly=p.replace('测试人物@图片1在场。','测试人物在场。');
  assert.ok(promptProblems(listOnly,[{},{}]).some(x=>x.includes('正文缺少 @图片1')));
  assert.ok(promptProblems(p.replaceAll('@图片1','@音频1'),[{},{}]).some(x=>x.includes('未提供')));
  assert.ok(promptProblems(p.replaceAll('@图片1','@图片10'),[{},{}]).some(x=>x.includes('@图片10')));
});
test('reference block uses single newlines; blank line is the documented prose boundary',()=>{
  const p=promptFixture('拿起物件。',['人物甲','人物乙']);
  assert.deepEqual(promptProblems(p,[{},{}]),[]);
  const gap=p.replace('人物乙@图片2：','\n人物乙@图片2：');
  assert.ok(promptProblems(gap,[{},{}]).some(x=>x.includes('清单内使用单换行')));
  const guide=readFileSync(join(root,'references/creation-prompt.md'),'utf8');
  assert.ok(guide.includes('角色与素材条目之间不插入空行'));
});
test('body never falls back to material text as dialogue evidence',()=>{
  const d=structuredClone(doc),seg=d.episodes[0].segments[0];
  seg.prompt=seg.prompt.replace('还开着吗？我想卖一本书。','还开着吗？').replace('参考素材：','参考素材：原文台词还开着吗？我想卖一本书。');
  assert.equal(gateReport(d,{script}).find(g=>g.id==='dialogue-verbatim').status,'fail');
});
const review=(conclusion,must='',pending='')=>`# 视频提示词审核\n\n- 审核结论：${conclusion}\n\n## 返修意见\n\n${must}\n\n## 待确认事项\n\n${pending}`;
const make=review=>W.parseWorksheet(W.serializeWorksheet({meta:{segment:sample.id,status:'in_review',round:1,model:'MiniMax H3',promptLang:'zh'},structure:(({prompt,...s})=>s)(sample),body:sample.prompt,review}));
const revision='- 质量｜正文·放下物件｜没有交代接触结果｜补足松手前的支撑';
const pending='- 参考素材·角色年龄｜未提供且影响身份判断｜请上游确认年龄';
for(const [label,verdict,must,block] of [['通过','approved','',''],['需返修','changes_requested',revision,''],['待确认','blocked','',pending],['需返修','changes_requested',revision,pending]])test(`structured verdict ${label} ${Boolean(block)}`,()=>{
  const before=make(review(label,must,block));assert.deepEqual(before.problems,[]);
  const result=W.recordVerdict(before,verdict,material);assert.deepEqual(result.problems,[]);
  const after=W.parseWorksheet(result.text);assert.equal(after.review,before.review);assert.equal(after.body,before.body);assert.deepEqual(after.structure,before.structure);
  if(verdict==='approved'){assert.equal(W.approvalProblem(after),null);assert.equal(W.inputProblem(after,material),null);}
});
for(const [label,must,block,verdict] of [['通过',revision,'','approved'],['通过','',pending,'approved'],['待确认',revision,pending,'blocked'],['需返修','','','changes_requested'],['通过','','','blocked']])test(`contradictory conclusion blocked ${label}/${verdict}`,()=>assert.ok(W.recordVerdict(make(review(label,must,block)),verdict,material).problems.length));
test('review sections survive serialization; invalid nested regions cannot hide issues',()=>{
  const s=make(review('需返修',revision,pending));assert.equal(W.reviewItems(s.review).must.length,1);assert.equal(W.reviewItems(s.review).block.length,1);
  assert.ok(W.recordVerdict(s,'approved',material).problems.length);
  const md=W.serializeWorksheet(s).replace('## 编写回应（仅本轮）','## 编写回应（仅本轮）\n\n## 待确认事项\n\n隐藏问题');
  assert.ok(W.parseWorksheet(md).problems.length);
  const malformed=make(review('需返修','- 感觉不够好'));assert.ok(W.recordVerdict(malformed,'changes_requested').problems.length);
  const hidden=make(review('通过').replace('## 返修意见','未归类的错误还未处理\n\n## 返修意见'));
  assert.ok(W.recordVerdict(hidden,'approved',material).problems.length);
  assert.ok(W.recordVerdict(make(review('需返修',revision.replace('质量｜','口味｜'))),'changes_requested').problems.length);
});
test('style used in prompt is dispatched and approval-bound',()=>{
  assert.deepEqual(material.style,{label:production.style.label,phrase:production.style.phrase});
  const approved=W.parseWorksheet(W.recordVerdict(make(review('通过')),'approved',material).text);
  const changed=structuredClone(material);changed.style.phrase+=' new';assert.match(W.inputProblem(approved,changed),/输入发生变化/);
  const unrelated=structuredClone(material);unrelated.unrelated='note';assert.equal(W.inputProblem(approved,unrelated),null);
});
test('old approved body cannot bypass current format during production handoff',()=>{
  const s=make(review('通过'));s.body='shots:\n[Shot 1] observe\nambience: silence';s.meta.status='approved';s.meta.bodyHash=W.hashOf(s.structure,s.body);s.meta.inputHash=W.inputHashOf(s.structure,material);
  assert.match(worksheetSyncProblem({...s.structure,prompt:s.body},s,()=>({material})),/五部分标准/);
});
console.log(`✓ ${count} prompt format and review regressions; offline only`);
