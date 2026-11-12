#!/usr/bin/env node
// mint-video-prompt 自测：工作单库、本地自查、提交流程与自有样例。离线，不调用模型。
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as W from './lib/worksheet.mjs';
import { lintWorksheet, submitWorksheet, promptGuideOf, defaultLangOf, SHOT_SIZES, CAMERA_MOVES, TIMECODE_RE } from './mint-video-prompt.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'video-prompt-'));
const entry = join(root, 'scripts/mint-video-prompt.mjs');
const cli = (...args) => spawnSync(process.execPath, [entry, ...args], { cwd: temp, encoding: 'utf8' });
let count = 0;
const test = (name, fn) => { try { fn(); count++; console.log(`PASS ${name}`); } catch (e) { e.message = `${name}: ${e.message}`; throw e; } };
const example = id => readFileSync(join(root, 'examples/第七盏灯', id, 'prompt.md'), 'utf8');
const mutate = (md, fn) => { const s = structuredClone(W.parseWorksheet(md)); fn(s); return W.parseWorksheet(W.serializeWorksheet(s)); };

try {
  test('guides resolve by model family and every referenced guide exists', () => {
    assert.equal(promptGuideOf('MiniMax H3'), 'h3-prompt.md'); assert.equal(promptGuideOf(undefined), 'h3-prompt.md');
    assert.equal(promptGuideOf('seedance2.0 fast'), 'seedance2-prompt.md'); assert.equal(promptGuideOf('未知模型'), null);
    assert.equal(defaultLangOf('seedance2.5'), 'zh'); assert.equal(defaultLangOf('MiniMax H3'), 'en');
    for (const f of ['creation-prompt.md', 'h3-prompt.md', 'seedance2-prompt.md', 'worksheet.md', '分镜指南.md']) assert.ok(existsSync(join(root, 'references', f)), f);
    const r = cli('guide', '--model', 'seedance2.0'); assert.equal(r.status, 0); assert.match(r.stdout, /seedance2-prompt\.md/);
    assert.match(cli('guide', '--model', '未知模型').stdout, /能力未核实/);
  });

  test('worksheet reference documents the same enums as the tool', () => {
    const doc = readFileSync(join(root, 'references/worksheet.md'), 'utf8');
    for (const [key, v] of Object.entries(SHOT_SIZES)) assert.ok(doc.includes(`\`${key}\` | ${v.phrase} | ${v.zh}`), key);
    for (const [key, zh] of Object.entries(CAMERA_MOVES)) assert.ok(doc.includes(`\`${key}\` | ${zh}`), key);
  });

  test('own examples are submitted worksheets that pass local lint', () => {
    for (const id of ['E01-01', 'E01-02']) {
      const s = W.parseWorksheet(example(id));
      assert.deepEqual(lintWorksheet(s), []); assert.equal(s.meta.status, 'in_review'); assert.equal(s.meta.round, 1); assert.equal(s.meta.bodyHash, '');
    }
    const input = JSON.parse(readFileSync(join(root, 'examples/第七盏灯/输入材料.json'), 'utf8'));
    const beats = input.seedScenes[0].beats, claimed = ['E01-01', 'E01-02'].flatMap(id => W.parseWorksheet(example(id)).structure.cuts.map(c => c.beats));
    assert.equal(claimed[0][0], 1); assert.equal(claimed.at(-1)[1], beats.length);
    claimed.slice(1).forEach((c, i) => assert.equal(c[0], claimed[i][1] + 1, '全场节拍连续认领'));
    const bodies = ['E01-01', 'E01-02'].map(id => W.parseWorksheet(example(id)).body).join('\n');
    for (const b of beats.filter(b => b.kind === 'line')) assert.ok(bodies.includes(b.text), `台词逐字：${b.text}`);
    for (const c of input.assets.characters) assert.ok(!bodies.replace(/"[^"]*"/g, '').includes(c.name), '英文提示词正文不出现人名');
  });

  test('lint catches structure and skeleton problems', () => {
    const base = example('E01-01');
    const has = (sheet, re) => assert.ok(lintWorksheet(sheet).some(p => re.test(p)), `${re} ← ${lintWorksheet(sheet).join('；')}`);
    has(mutate(base, s => { s.structure.cuts[1].beats = [3, 3]; }), /节拍认领不连续/);
    has(mutate(base, s => { s.structure.cuts[0].size = 'huge'; }), /景别枚举/);
    has(mutate(base, s => { s.structure.cuts[0].camera = 'Dolly'; }), /运镜词表/);
    has(mutate(base, s => { s.structure.cuts[0].seconds = 0; }), /有限正数/);
    has(mutate(base, s => { s.structure.cuts = []; }), /cuts 不能为空/);
    has(mutate(base, s => { s.body = s.body.replace('Wide shot, ', ''); }), /景别短语/);
    has(mutate(base, s => { s.body = s.body.replace('Medium shot, Push In', 'Medium shot'); s.body = s.body.replace('A slow push in', 'Moving closer'); }), /运镜短语/);
    has(mutate(base, s => { s.body = s.body.replace('Picture 4 is', 'The lamp is'); }), /身份说明句/);
    has(mutate(base, s => { s.structure.images.pop(); }), /身份说明句多于/);
    has(mutate(base, s => { s.body = s.body.replace('ambience:', 'sound:'); }), /两个字段/);
    has(mutate(base, s => { s.body = s.body.replace('[Shot 2]', '[Shot 3]'); }), /缺少 \[Shot 2\]/);
    has(mutate(base, s => { s.body = ''; }), /正文为空/);
    has(mutate(base, s => { s.meta.model = 'seedance2.0'; s.body += '\n0–3 秒观察'; }), /seedance/);
    assert.ok(TIMECODE_RE.test('at 3.5 seconds') && !TIMECODE_RE.test('随后缓慢观察'));
    assert.ok(lintWorksheet(W.parseWorksheet('# 旧格式\n\n---\nbody')).some(p => /状态头/.test(p)));
  });

  test('new creates a blank draft and refuses to overwrite', () => {
    let r = cli('new', 'E02-01', '--out', 'sheets', '--model', 'seedance2.0', '--scene', '2'); assert.equal(r.status, 0, r.stderr);
    const s = W.parseWorksheet(readFileSync(join(temp, 'sheets/E02-01/prompt.md'), 'utf8'));
    assert.deepEqual(s.problems, []); assert.equal(s.meta.status, 'draft'); assert.equal(s.meta.promptLang, 'zh'); assert.equal(s.structure.sceneIndex, 2);
    assert.equal(cli('new', 'E02-01', '--out', 'sheets').status, 1);
    assert.equal(cli('new', 'bad', '--out', 'sheets').status, 1);
    assert.equal(cli('submit', 'sheets/E02-01/prompt.md').status, 1, '空白工作单不能提交');
  });

  test('submit is all-or-nothing, bumps the round and clears any earlier approval', () => {
    cpSync(join(root, 'examples/第七盏灯'), join(temp, 'ex'), { recursive: true });
    const a = join(temp, 'ex/E01-01/prompt.md'), b = join(temp, 'ex/E01-02/prompt.md');
    assert.equal(cli('lint', a, b).status, 0);
    let r = cli('submit', a); assert.equal(r.status, 1); assert.match(r.stderr, /不能重复提交/);
    const rewrite = (p, fn) => writeFileSync(p, W.serializeWorksheet(fn(W.parseWorksheet(readFileSync(p, 'utf8')))));
    // 审核方退回之后
    for (const p of [a, b]) rewrite(p, s => ({ ...s, meta: { ...s.meta, status: 'changes_requested' }, review: '结论：退回。\n\n- [必须修改] 镜头 1：示例意见。' }));
    r = cli('submit', a, b); assert.equal(r.status, 1); assert.match(r.stderr, /编写回应/);
    rewrite(a, s => ({ ...s, response: '- 镜头 1：已修改。' }));
    r = cli('submit', a, b); assert.equal(r.status, 1, '有一份不通过就都不提交');
    assert.equal(W.parseWorksheet(readFileSync(a, 'utf8')).meta.status, 'changes_requested');
    rewrite(b, s => ({ ...s, response: '- 镜头 1：已修改。' }));
    r = cli('submit', a, b); assert.equal(r.status, 0, r.stderr);
    const s = W.parseWorksheet(readFileSync(a, 'utf8'));
    assert.equal(s.meta.status, 'in_review'); assert.equal(s.meta.round, 2); assert.match(s.review, /必须修改/, '提交不改动审核意见区');
    // 已批准的工作单被修改后重新提交：旧摘要作废
    const approved = W.parseWorksheet(W.serializeWorksheet({ ...s, meta: { ...s.meta, status: 'approved', bodyHash: W.hashOf(s.structure, s.body) } }));
    assert.equal(W.approvalProblem(approved), null);
    const again = W.parseWorksheet(submitWorksheet({ ...approved, meta: { ...approved.meta, inputHash: 'abc' } }).text);
    assert.equal(again.meta.status, 'in_review'); assert.equal(again.meta.bodyHash, ''); assert.equal(again.meta.inputHash, ''); assert.equal(again.meta.round, 3);
    // 审核方登记阻塞之后：协调完成、写明回应才能再次提交
    const blocked = W.parseWorksheet(W.serializeWorksheet({ ...s, meta: { ...s.meta, status: 'blocked' }, response: '' }));
    assert.ok(submitWorksheet(blocked).problems.some(p => /编写回应/.test(p)));
    assert.equal(W.parseWorksheet(submitWorksheet({ ...blocked, response: '- 参考图：设定图已补齐。' }).text).meta.status, 'in_review');
    // 回应里多出二级标题会让它之下的内容丢失，自查直接拒绝
    assert.ok(lintWorksheet(W.parseWorksheet(readFileSync(a, 'utf8').replace('## 编写回应（仅本轮）', '## 编写回应（仅本轮）\n\n## 补充说明'))).some(p => /多余的二级标题/.test(p)));
  });

  console.log(`✓ ${count} 项自测通过；离线`);
} finally { rmSync(temp, { recursive: true, force: true }); }
