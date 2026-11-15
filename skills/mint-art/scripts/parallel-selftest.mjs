#!/usr/bin/env node
// Static workflow-contract checks only. Does not claim real dispatch or semantic review.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const dispatch=read('references/dispatch.md'),skill=read('SKILL.md');
let groups=0;
const test=(name,f)=>{try{f();groups++;}catch(e){e.message=name+': '+e.message;throw e;}};
test('independent extraction, one assembler and parallel batch review',()=>{
  for(const token of ['提取者 × N','整理者 × 1','核验者 × N','按批并行','独立 subagent'])assert.ok(dispatch.includes(token),token);
  assert.match(dispatch,/提取者只写自己的一份 extract 文件/);
  assert.match(dispatch,/核验期间草稿冻结/);
  assert.match(dispatch,/正式文件只有主会话发布/);
});
test('four-episode cumulative limit includes all rereads',()=>{
  assert.match(dispatch,/一次调用累计最多接触 4 个不同集号的原文/);
  assert.match(dispatch,/前情、检索命中和定向回读全部计入/);
  assert.match(dispatch,/同一调用不能接着处理下一批/);
  assert.match(dispatch,/主会话不读取原文正文/);
  assert.match(skill,/每次调用累计最多接触 4 集原文/);
});
test('small inputs and single files cannot bypass independent parallel work',()=>{
  assert.match(dispatch,/2 集及以上至少分为 2 批并发/);
  assert.match(dispatch,/单集也独立并行派发/);
  assert.match(dispatch,/单文件多集明确派发集号、绝对路径和行范围/);
  assert.match(dispatch,/只有一批时，也按上述关注点并发核验/);
  assert.doesNotMatch(dispatch+skill,/超过约 3 万字|少于这个数量时在当前会话完成|一次只派一个，在已有/);
});
test('assembler can reread limited evidence; review is exhaustive and independent',()=>{
  assert.match(dispatch,/必要时按需求读取特定集数的剧本/);
  assert.match(dispatch,/超出上限另派证据任务/);
  assert.match(dispatch,/按批完整覆盖/);
  assert.match(dispatch,/不抽查代替漏登记检查/);
  assert.match(dispatch,/不让提取者自证/);
  assert.match(dispatch,/全部相关批次复核/);
});
test('no shared-context fallback or implicit semantic approval',()=>{
  assert.match(dispatch,/两者都不可用时停止/);
  assert.match(dispatch,/不回退到主会话/);
  assert.match(dispatch,/不审计工具历史/);
  assert.match(dispatch,/未执行明确“未验证”/);
  assert.match(dispatch,/不新增 agent 定义文件/);
});
test('design handoff requires the ID read by apply-designs',()=>{
  assert.match(dispatch,/必需 id（与文件名及负责资产一致）、designStatus/);
});
test('all current entry documents describe the same workflow',()=>{
  for(const file of ['SKILL.md','README.md','README.en.md']){
    const body=read(file);
    assert.match(body,/dispatch\.md/);
    assert.doesNotMatch(body,/分批串行接力|one relay subagent|one batch at a time/);
  }
  assert.match(skill,/version: 4\.2\.0/);
  const schema=read('references/schema.md');
  assert.match(schema,/\.work/);
  assert.match(schema,/不设 schemaVersion/);
});
console.log(`✓ stage parallel workflow contract passed (${groups} groups; static only)`);
