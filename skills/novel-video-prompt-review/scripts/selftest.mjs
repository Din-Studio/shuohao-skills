#!/usr/bin/env node
// novel-video-prompt-review 自测：工作单库、结论登记规则与自有样例。离线，不调用模型。
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as W from './lib/worksheet.mjs';
import { recordVerdict } from './novel-video-prompt-review.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'video-prompt-review-'));
const entry = join(root, 'scripts/novel-video-prompt-review.mjs');
const cli = (...args) => spawnSync(process.execPath, [entry, ...args], { cwd: temp, encoding: 'utf8' });
let count = 0;
const test = (name, fn) => { try { fn(); count++; console.log(`PASS ${name}`); } catch (e) { e.message = `${name}: ${e.message}`; throw e; } };
const example = round => readFileSync(join(root, 'examples/回执', round, 'E01-01/prompt.md'), 'utf8');
const sheet = (round, patch = {}) => { const s = W.parseWorksheet(example(round)); return W.parseWorksheet(W.serializeWorksheet({ ...s, ...patch, meta: { ...s.meta, ...patch.meta } })); };
const inReview = (review, round = '第二轮') => sheet(round, { meta: { status: 'in_review', bodyHash: '' }, review });
const has = (result, re) => assert.ok(result.problems.some(p => re.test(p)), `${re} ← ${result.problems.join('；')}`);

try {
  test('references exist', () => {
    for (const f of ['审核清单.md', 'worksheet.md']) assert.ok(existsSync(join(root, 'references', f)), f);
  });

  test('own example: round one is rejected with evidence, round two is approved and still valid', () => {
    const r1 = W.parseWorksheet(example('第一轮')), r2 = W.parseWorksheet(example('第二轮'));
    assert.deepEqual(r1.problems, []); assert.deepEqual(r2.problems, []);
    assert.equal(r1.meta.status, 'changes_requested'); assert.equal(r1.meta.round, 1); assert.equal(r1.meta.bodyHash, '');
    assert.equal(W.reviewItems(r1.review).must.length, 2); assert.equal(W.reviewItems(r1.review).suggest.length, 1);
    assert.equal(r2.meta.status, 'approved'); assert.equal(r2.meta.round, 2); assert.equal(W.approvalProblem(r2), null);
    assert.equal(W.reviewItems(r2.review).must.length, 0);
    assert.notEqual(r2.response, W.RESPONSE_PLACEHOLDER, '第二轮保留编写方的逐条回应');
    assert.ok(r1.body.includes('原谅了母亲') && !r2.body.includes('原谅'), '第二轮删去了剧本没有的结论');
    assert.equal(r1.structure.cuts.length, 3); assert.equal(r2.structure.cuts.length, 4);
    const input = JSON.parse(readFileSync(join(root, 'examples/回执/输入材料.json'), 'utf8'));
    for (const b of input.seedScenes[0].beats.filter(b => b.kind === 'line')) for (const s of [r1, r2]) assert.ok(s.body.includes(b.text));
    assert.ok(r2.structure.cuts.reduce((n, c) => n + c.seconds, 0) <= input.maxSegmentSeconds);
  });

  test('verdict rules', () => {
    const ok = '结论：通过。证据有可读停留。\n\n- [建议] 声景：可以补上纸张声。';
    const reject = '结论：退回修改。\n\n- [必须修改] 镜头 2：证据没有可读的停留。';
    assert.deepEqual(recordVerdict(inReview(ok), 'approved').problems, []);
    assert.deepEqual(recordVerdict(inReview(reject), 'changes_requested').problems, []);
    has(recordVerdict(inReview(reject), 'approved'), /不能批准/);
    has(recordVerdict(inReview(ok), 'changes_requested'), /至少写一条/);
    has(recordVerdict(inReview(W.REVIEW_PLACEHOLDER), 'approved'), /还没有填写/);
    has(recordVerdict(inReview('- [建议] 声景：没有结论行。'), 'approved'), /结论/);
    has(recordVerdict(inReview('结论：退回。\n\n- [必须修改] 感觉不够好。'), 'changes_requested'), /指明镜号或位置/);
    has(recordVerdict(inReview(ok), 'rejected'), /结论必须为/);
    for (const status of ['draft', 'changes_requested', 'approved']) has(recordVerdict(sheet('第二轮', { meta: { status }, review: ok }), 'approved'), /只能审核 in_review/);
    has(recordVerdict(W.parseWorksheet('# 旧格式\n\n---\nbody'), 'approved'), /状态头/);
  });

  test('verdict writes only the status header and review area', () => {
    const before = inReview('结论：通过。\n\n- [建议] 参考图：姓名能否辨认需要实际视频验证。');
    const approved = W.parseWorksheet(recordVerdict(before, 'approved').text);
    assert.equal(approved.meta.status, 'approved'); assert.equal(approved.meta.bodyHash, W.hashOf(before.structure, before.body));
    assert.equal(approved.body, before.body); assert.deepEqual(approved.structure, before.structure);
    assert.equal(approved.meta.round, before.meta.round); assert.equal(approved.response, before.response);
    const rejected = W.parseWorksheet(recordVerdict(inReview('结论：退回。\n\n- [必须修改] 整段：示例。'), 'changes_requested').text);
    assert.equal(rejected.meta.bodyHash, ''); assert.equal(rejected.response, W.RESPONSE_PLACEHOLDER, '新一轮意见写出后清空上一轮回应');
    assert.equal(rejected.body, before.body);
  });

  test('command line: verdict, show, and approval invalidated by later edits', () => {
    cpSync(join(root, 'examples/回执'), join(temp, 'ex'), { recursive: true });
    const p = join(temp, 'ex/第二轮/E01-01/prompt.md');
    assert.match(cli('show', p).stdout, /approved，第 2 轮；批准有效/);
    assert.equal(cli('verdict', 'approved', p).status, 1, '已批准的工作单不能再次登记');
    writeFileSync(p, readFileSync(p, 'utf8').replace('无配乐。', '无配乐，无人声。'));
    assert.match(cli('show', p).stdout, /批准已失效/);
    assert.ok(W.approvalProblem(W.parseWorksheet(readFileSync(p, 'utf8'))));
    const q = join(temp, 'ex/第一轮/E01-01/prompt.md');
    writeFileSync(q, W.serializeWorksheet({ ...W.parseWorksheet(readFileSync(q, 'utf8')), meta: { ...W.parseWorksheet(readFileSync(q, 'utf8')).meta, status: 'in_review' } }));
    let r = cli('verdict', 'approved', q); assert.equal(r.status, 1); assert.match(r.stderr, /不能批准/);
    r = cli('verdict', 'changes_requested', q); assert.equal(r.status, 0, r.stderr);
    assert.equal(cli('verdict').status, 1);
  });

  console.log(`✓ ${count} 项自测通过；离线`);
} finally { rmSync(temp, { recursive: true, force: true }); }
