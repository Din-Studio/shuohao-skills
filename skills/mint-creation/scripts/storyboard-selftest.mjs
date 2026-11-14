#!/usr/bin/env node
// 按 script 分镜分段：分段对账、单段上限、输入材料与批准绑定。离线，只使用本 skill 自有《收书人》样例。
import assert from 'node:assert/strict';
import {cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parseStoryboard} from './lib/storyboard.mjs';
import {inputHashOf} from './lib/worksheet.mjs';
import {storyboardGate, storyboardBrief} from './mint-creation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ex = p => join(root, 'examples', p);
const json = p => JSON.parse(readFileSync(ex(p), 'utf8'));
const DOC = json('creation/收书人-creation.json'), SCRIPT = json('script/收书人-script.json');
const BOARD_TEXT = readFileSync(ex('script/收书人-script-storyboard.md'), 'utf8'), BOARD = parseStoryboard(BOARD_TEXT);
let count = 0;
const test = (name, fn) => { try { fn(); count++; console.log(`PASS ${name}`); } catch (e) { e.message = `${name}: ${e.message}`; throw e; } };
const gate = (doc = DOC, ctx = {}) => storyboardGate(doc, {script: SCRIPT, storyboard: BOARD, ...ctx});

test('own example segments follow the script storyboard', () => assert.equal(gate().status, 'pass'));
test('no storyboard or no script: skipped, never counted as passing', () => {
  assert.equal(gate(DOC, {storyboard: undefined}).status, 'skipped');
  assert.equal(gate(DOC, {script: undefined}).reason, 'missing-upstream');
});
test('moving a segment boundary away from the storyboard fails', () => {
  const doc = structuredClone(DOC), [a, b] = doc.episodes[0].segments;
  b.cuts.unshift(a.cuts.pop());
  const g = gate(doc);
  assert.equal(g.status, 'fail'); assert.match(g.detail, /第 1 集的分段应与分镜一致：分镜为 E01-01（第 1 场 1–2）.*实际为 E01-01（第 1 场 1–1）/);
});
test('merging two storyboard segments in creation fails', () => {
  const doc = structuredClone(DOC), segs = doc.episodes[0].segments;
  segs[0].cuts.push(...segs[1].cuts); segs.splice(1, 1); segs.forEach((s, i) => { s.id = `E01-0${i + 1}`; });
  assert.equal(gate(doc).status, 'fail');
});
test('storyboard limit above the production limit sends the work back to script', () => {
  const doc = structuredClone(DOC); doc.params = {...doc.params, maxSegmentSeconds: 10};
  assert.match(gate(doc).detail, /分镜单段上限 15 秒超过制作单段上限 10 秒——回到 script 阶段按 10 秒重新拆段/);
});
test('a storyboard that no longer matches the script fails before any segment comparison', () => {
  const script = structuredClone(SCRIPT); script.episodes[0].scenes[0].flow[0].action = '周亦站在门口。';
  assert.match(gate(DOC, {script}).detail, /分镜：.*E01-01：本段剧本与剧本 JSON 第 1–2 拍不一致/);
});
test('episodes without segments yet (seed stage) are not compared', () => {
  const doc = structuredClone(DOC); doc.episodes[0].segments = [];
  assert.equal(gate(doc).status, 'pass');
});
test('brief carries every segment of the episode with fields and script text', () => {
  const brief = storyboardBrief(BOARD, 1);
  assert.equal(brief.limit, 15);
  assert.deepEqual(brief.segments.map(s => [s.id, s.sceneIndex, s.beats]), [['E01-01', 1, [1, 2]], ['E01-02', 1, [3, 4]], ['E01-03', 1, [5, 6]], ['E01-04', 1, [7, 10]]]);
  assert.match(brief.segments[3].fields['必须呈现的信息'], /「致晚晚」三个字必须让观众读清/);
  assert.match(brief.segments[0].script, /^\[1\] △ 深夜/);
});
test('approval binds only the own storyboard entry', () => {
  const structure = DOC.episodes[0].segments[0], other = DOC.episodes[0].segments[2];
  const material = {storyboard: storyboardBrief(BOARD, 1)};
  const changed = structuredClone(material); changed.storyboard.segments[2].fields['背景音乐'] = '钢琴单音';
  assert.equal(inputHashOf(structure, changed), inputHashOf(structure, material));
  assert.notEqual(inputHashOf(other, changed), inputHashOf(other, material));
  const limit = structuredClone(material); limit.storyboard.limit = 12;
  assert.notEqual(inputHashOf(structure, limit), inputHashOf(structure, material));
  assert.notEqual(inputHashOf(structure, {}), inputHashOf(structure, material), 'adding a storyboard changes the bound input');
});

const temp = mkdtempSync(join(tmpdir(), 'creation-storyboard-'));
try {
  cpSync(join(root, 'examples'), join(temp, 'examples'), {recursive: true});
  const cwd = join(temp, 'examples/creation'), file = '收书人-creation.json';
  const cli = (...args) => spawnSync(process.execPath, [join(root, 'scripts/mint-creation.mjs'), ...args], {cwd, encoding: 'utf8'});
  const boardPath = join(temp, 'examples/script/收书人-script-storyboard.md');
  test('CLI discovers the storyboard beside the script and puts it into the brief', () => {
    const r = cli('prompts', 'brief', file, '--ep', '1'); assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).storyboard.segments.length, 4);
    assert.match(cli('checkup', file).stdout, /通过 \(pass\) \[base\/error\] 按分镜分段/);
  });
  test('broken storyboard blocks validation and the brief', () => {
    writeFileSync(boardPath, BOARD_TEXT.replace(/- 段首状态：周亦站在柜台前方.*\n/, '- 段首状态：\n'));
    let r = cli('validate', file); assert.equal(r.status, 1); assert.match(r.stdout + r.stderr, /「段首状态」不能留空/);
    r = cli('prompts', 'brief', file, '--ep', '1'); assert.equal(r.status, 1); assert.match(r.stderr, /分镜没有通过检查，先回到 script 阶段修订/);
    writeFileSync(boardPath, BOARD_TEXT);
  });
  test('missing sibling storyboard is reported as skipped; explicit --storyboard must exist', () => {
    rmSync(boardPath);
    const r = cli('checkup', file); assert.match(r.stdout, /跳过 \(skipped\) \[base\/error\/missing-upstream\] 按分镜分段/);
    assert.equal(JSON.parse(cli('prompts', 'brief', file, '--ep', '1').stdout).storyboard, undefined);
    const explicit = cli('validate', file, '--storyboard', join(temp, 'missing.md')); assert.equal(explicit.status, 1); assert.match(explicit.stderr, /ENOENT/);
    writeFileSync(join(temp, 'elsewhere.md'), BOARD_TEXT);
    assert.equal(cli('validate', file, '--storyboard', join(temp, 'elsewhere.md')).status, 0);
    writeFileSync(boardPath, BOARD_TEXT);
  });
} finally { rmSync(temp, {recursive: true, force: true}); }
console.log(`✓ ${count} storyboard segmentation tests passed; offline only`);
