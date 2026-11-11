#!/usr/bin/env node
// 工作单流程回归：init → check → status → apply → export → videos。离线，不调用模型。
import assert from 'node:assert/strict';
import {cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import * as W from './lib/worksheet.mjs';
import {assembleFromWorksheets, listWorksheets, worksheetSyncProblem, seedFromScript, validateCreation} from './novel-creation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'creation-worksheet-'));
let count = 0;
const test = (name, fn) => { try { fn(); count++; console.log(`PASS ${name}`); } catch (e) { e.message = `${name}: ${e.message}`; throw e; } };
try {
  cpSync(join(root, 'examples'), join(temp, 'examples'), {recursive: true});
  const cwd = join(temp, 'examples/creation'), file = '收书人-creation.json';
  const cli = (...args) => spawnSync(process.execPath, [join(root, 'scripts/novel-creation.mjs'), ...args], {cwd, encoding: 'utf8'});
  const original = JSON.parse(readFileSync(join(cwd, file), 'utf8'));
  const sheetPath = id => join(cwd, id, 'prompt.md');
  const rewrite = (id, fn) => writeFileSync(sheetPath(id), fn(readFileSync(sheetPath(id), 'utf8')));
  // 测试替身：审核方 skill 的 verdict 命令做的就是这件事
  const approve = id => { const s = W.parseWorksheet(readFileSync(sheetPath(id), 'utf8'));
    writeFileSync(sheetPath(id), W.serializeWorksheet({...s, meta: {...s.meta, status: 'approved', round: Math.max(1, s.meta.round), bodyHash: W.hashOf(s.structure, s.body)}, review: '结论：通过。'})); };

  test('parse and serialize round trip; body below the last separator only', () => {
    const structure = {id: 'E01-01', sceneIndex: 1, cuts: [], images: []};
    const md = W.serializeWorksheet({meta: {segment: 'E01-01', status: 'draft', round: 0, model: 'MiniMax H3', promptLang: 'en'}, structure, review: '- [必须修改] 镜头 1：示例', body: 'shots:\nbody'});
    const s = W.parseWorksheet(md);
    assert.deepEqual(s.problems, []); assert.equal(s.body, 'shots:\nbody'); assert.ok(!s.body.includes('必须修改'));
    assert.equal(W.reviewItems(s.review).must.length, 1);
    assert.equal(W.hashOf({sceneIndex: 1, id: 'E01-01', images: [], cuts: []}, 'shots:\nbody\n'), W.hashOf(structure, 'shots:\nbody'));
    assert.ok(W.parseWorksheet(md.replace('shots:\nbody', 'shots:\n\n---\n\nbody')).problems.some(p => /只允许一条分隔线/.test(p)));
    assert.ok(W.parseWorksheet('# E01-01\n\n---\nbody').problems.some(p => /状态头/.test(p)));
    assert.ok(W.parseWorksheet(md.replace('"sceneIndex": 1', '"sceneIndex": 1, "prompt": "x"')).problems.some(p => /不保存 prompt/.test(p)));
  });

  test('brief prints dispatch material straight from upstream', () => {
    const r = cli('prompts', 'brief', file, '--ep', '1'); assert.equal(r.status, 0, r.stderr);
    const b = JSON.parse(r.stdout);
    assert.equal(b.source, '收书人'); assert.equal(b.video.model, 'MiniMax H3'); assert.equal(b.promptLang, 'en'); assert.equal(b.maxSegmentSeconds, 15);
    assert.equal(b.seedScenes[0].beats.length, 10); assert.equal(b.seedScenes[0].beats[1].text, '还开着吗？我想卖一本书。');
    assert.deepEqual(b.assets.characters.map(c => c.id), ['C01', 'C02']); assert.ok(b.assets.characters.every(c => c.sheetExists));
    assert.ok(b.assets.scenes.length && b.assets.props.length); assert.equal(b.intent.planSource, 'outline'); assert.deepEqual(b.intent.endBeat, [1, 10]);
    assert.equal(cli('prompts', 'brief', file).status, 1); assert.equal(cli('prompts', 'brief', file, '--ep', '9').status, 1);
  });

  test('init creates draft worksheets and never overwrites', () => {
    const r = cli('prompts', 'init', file); assert.equal(r.status, 0, r.stderr);
    assert.equal(listWorksheets(cwd).length, 4);
    rewrite('E01-01', md => md.replace('round: 0', 'round: 2'));
    assert.equal(cli('prompts', 'init', file).status, 0);
    assert.match(readFileSync(sheetPath('E01-01'), 'utf8'), /round: 2/);
    rewrite('E01-01', md => md.replace('round: 2', 'round: 0'));
  });

  test('check runs structural gates without requiring approval; status and apply and export refuse drafts', () => {
    let r = cli('prompts', 'check', file); assert.equal(r.status, 0, r.stderr + r.stdout);
    r = cli('prompts', 'status', file); assert.equal(r.status, 1); assert.match(r.stdout, /未批准 4/);
    r = cli('prompts', 'apply', file); assert.equal(r.status, 1); assert.match(r.stderr, /尚未批准/);
    r = cli('export', file, '--out', '.'); assert.equal(r.status, 1); assert.match(r.stderr, /尚未批准/);
    assert.ok(!existsSync(join(cwd, 'manifest.json')));
  });

  test('check reports gate failures from worksheet content', () => {
    const before = readFileSync(sheetPath('E01-01'), 'utf8');
    rewrite('E01-01', md => md.replace('还开着吗？我想卖一本书。', '还开着吗？'));
    const r = cli('prompts', 'check', file); assert.equal(r.status, 1); assert.match(r.stderr, /E01-01/);
    writeFileSync(sheetPath('E01-01'), before);
  });

  test('round cap is reported for the dispatcher', () => {
    const before = readFileSync(sheetPath('E01-02'), 'utf8');
    rewrite('E01-02', md => md.replace('status: draft', 'status: changes_requested').replace('round: 0', `round: ${W.MAX_ROUNDS}`));
    assert.match(cli('prompts', 'status', file).stdout, /把分歧交给用户决定/);
    writeFileSync(sheetPath('E01-02'), before);
  });

  test('approved worksheets apply, export keeps worksheets untouched, videos plans', () => {
    for (const w of listWorksheets(cwd)) approve(w.id);
    assert.equal(cli('prompts', 'status', file).status, 0);
    // 审核通过的修改经 apply 进入 creation.json
    rewrite('E01-01', md => md.replace('no music.', 'no music at all.'));
    let r = cli('prompts', 'apply', file); assert.equal(r.status, 1); assert.match(r.stderr, /批准已失效/);
    approve('E01-01');
    r = cli('prompts', 'apply', file); assert.equal(r.status, 0, r.stderr);
    const applied = JSON.parse(readFileSync(join(cwd, file), 'utf8'));
    assert.match(applied.episodes[0].segments[0].prompt, /no music at all\./);
    assert.deepEqual(applied.episodes[0].segments.slice(1), original.episodes[0].segments.slice(1));
    const sheetBefore = readFileSync(sheetPath('E01-01'), 'utf8');
    r = cli('export', file, '--out', '.'); assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(sheetPath('E01-01'), 'utf8'), sheetBefore, '导出不改写工作单');
    r = cli('videos', 'manifest.json', '--dry-run'); assert.equal(r.status, 0, r.stderr);
    const plan = JSON.parse(r.stdout); assert.equal(plan.jobs.length, 4);
    assert.match(plan.jobs[0].prompt, /^Picture 1 is/); assert.ok(!plan.jobs[0].prompt.includes('审核意见'));
  });

  test('edits after approval block export and videos', () => {
    rewrite('E01-03', md => md.replace(/ambience:/, 'ambience: Rain.'));
    assert.equal(cli('export', file, '--out', '.').status, 1);
    const r = cli('videos', 'manifest.json', '--dry-run'); assert.equal(r.status, 1); assert.match(r.stderr, /批准已失效/);
    approve('E01-03');
    const stale = cli('export', file, '--out', '.'); assert.equal(stale.status, 1); assert.match(stale.stderr, /prompts apply/);
  });

  test('seed skeleton plus writer-created worksheets assemble into a valid creation', () => {
    const ex = p => JSON.parse(readFileSync(join(root, 'examples', p), 'utf8'));
    const script = ex('script/收书人-script.json'), outline = ex('outline/收书人-outline.json');
    const seed = seedFromScript(script, null, {outline});
    const sheets = original.episodes[0].segments.map(seg => { const {prompt, ...structure} = seg;
      return {id: seg.id, sheet: W.parseWorksheet(W.serializeWorksheet({meta: {segment: seg.id, status: 'in_review', round: 1, model: 'MiniMax H3', promptLang: 'en'}, structure, body: prompt}))}; });
    const {doc, problems} = assembleFromWorksheets({...seed, promptLang: 'en'}, sheets, {});
    assert.deepEqual(problems, []); assert.ok(!('seedScenes' in doc.episodes[0]));
    assert.deepEqual(validateCreation(doc, {script, outline}), []);
    assert.match(worksheetSyncProblem(doc.episodes[0].segments[0], sheets[0].sheet), /尚未批准/);
    const wrongModel = assembleFromWorksheets({...seed, video: {model: 'seedance2.0'}}, sheets, {});
    assert.ok(wrongModel.problems.some(p => /更换模型/.test(p)));
    assert.ok(assembleFromWorksheets(seed, [], {}).problems.some(p => /没有任何工作单/.test(p)));
  });

  console.log(`✓ ${count} 项工作单流程自测通过；离线`);
} finally { rmSync(temp, {recursive: true, force: true}); }
