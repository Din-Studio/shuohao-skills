#!/usr/bin/env node
// 分镜文件（第四个正式产物）的确定性检查。只使用本 skill 自有样例。
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { parseStoryboard, storyboardErrors, seedStoryboard, storyboardPathOf, sceneText, STORYBOARD_FIELDS } from './lib/storyboard.mjs';
import { checkup } from './mint-script.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ex = name => join(root, 'examples', name);
const json = name => JSON.parse(readFileSync(ex(name), 'utf8'));
const NIGHT = json('夜班水尺-script.json'), NIGHT_SB = readFileSync(ex('夜班水尺-script-storyboard.md'), 'utf8');
const UMBRELLA = json('修伞簿-mapped-script.json'), UMBRELLA_SB = readFileSync(ex('修伞簿-mapped-script-storyboard.md'), 'utf8');
let count = 0;
const test = (name, fn) => { try { fn(); count++; } catch (e) { throw new Error(name, { cause: e }); } };
const errorsOf = (md, script = NIGHT, params) => storyboardErrors(parseStoryboard(md), script, params).errors;
const expectError = (md, re, script = NIGHT) => { const errors = errorsOf(md, script); assert.ok(errors.some(e => re.test(e)), `expected ${re} in:\n${errors.join('\n')}`); };

test('two own examples pass every deterministic check', () => {
  assert.deepEqual(storyboardErrors(parseStoryboard(NIGHT_SB), NIGHT), { errors: [], warnings: [] });
  assert.deepEqual(storyboardErrors(parseStoryboard(UMBRELLA_SB), UMBRELLA), { errors: [], warnings: [] });
});
test('storyboard sits beside the script JSON', () => {
  assert.equal(storyboardPathOf('/p/script/作品-script.json'), '/p/script/作品-script-storyboard.md');
});
test('parse exposes ordered segments, beat ranges and all twelve fields', () => {
  const sb = parseStoryboard(UMBRELLA_SB);
  assert.equal(sb.header.limit, 15);
  const segs = sb.scenes.flatMap(s => s.segments);
  assert.equal(segs.length, 18);
  assert.deepEqual(segs.slice(0, 3).map(s => [s.id, s.sceneIndex, s.beats]), [['E01-01', 1, [1, 3]], ['E01-02', 1, [4, 7]], ['E01-03', 1, [8, 10]]]);
  assert.deepEqual(Object.keys(segs[0].fields), STORYBOARD_FIELDS);
  assert.equal(segs.find(s => s.id === 'E02-02').fields['段首复写'], segs.find(s => s.id === 'E02-01').fields['供下一段复写的内容']);
});
test('script text block is generated from flow and keeps audio mode, delivery, subtitle and sound', () => {
  const scene = NIGHT.episodes[0].scenes[0];
  assert.match(sceneText(scene, 1, 4), /^\[1\] C02（画外）：等灯灭了再开门。\n\[2\] △ C01的手停在开关前。\n\[3\] C01（内心）：/);
  assert.equal(sceneText(NIGHT.episodes[0].scenes[1], 2, 3), '[2] 声音（画外）：远处报警器短鸣。\n[3] 字幕：复核中。');
});
test('skeleton covers every scene but cannot pass until the author fills it', () => {
  const md = seedStoryboard(NIGHT, { scriptName: '夜班水尺-script.json' });
  const sb = parseStoryboard(md);
  assert.deepEqual(sb.problems, []);
  assert.equal(sb.scenes.length, 3);
  const errors = storyboardErrors(sb, NIGHT).errors;
  assert.ok(errors.some(e => /本段推进/.test(e)) && errors.some(e => /「段首状态」不能留空/.test(e)) && errors.some(e => /「背景音乐」不能留空，没有合适内容时写「无」/.test(e)));
});
test('edited script text no longer matches the flow', () => expectError(NIGHT_SB.replace('[2] △ C01的手停在开关前。', '[2] △ C01的手按下开关。'), /本段剧本与剧本 JSON 第 1–4 拍不一致/));
test('changing the script invalidates the storyboard block', () => {
  const changed = structuredClone(NIGHT); changed.episodes[0].scenes[0].flow[1].action = 'C01的手按下开关。';
  expectError(NIGHT_SB, /本段剧本与剧本 JSON/, changed);
});
test('every beat belongs to exactly one segment in order', () => {
  expectError(NIGHT_SB.replace('| E07-01 | 1–4 |', '| E07-01 | 1–3 |'), /第 4–4 拍没有归属任何段/);
  const split = UMBRELLA_SB.replace('| E01-02 | 4–7 |', '| E01-02 | 5–7 |');
  expectError(split, /应从第 4 拍开始/, UMBRELLA);
});
test('segment IDs are consecutive within the episode across scenes', () => {
  expectError(UMBRELLA_SB.replaceAll('E01-04', 'E01-09'), /段号应为 E01-04/, UMBRELLA);
});
test('scene list must match the script', () => {
  const cut = NIGHT_SB.slice(0, NIGHT_SB.indexOf('## 第 9 集 第 1 场'));
  expectError(cut, /覆盖剧本的全部场次 7\/1、7\/2、9\/1/);
});
test('segment count, table and blocks must agree', () => {
  expectError(NIGHT_SB.replace('- 总段数：1', '- 总段数：2'), /总段数（2）与段落数量（1）不一致/);
  expectError(NIGHT_SB.replace('| E07-01 | 1–4 |', '| E07-09 | 1–4 |'), /分段表段号与逐段区块不一致/);
});
test('field names and order are fixed', () => {
  expectError(NIGHT_SB.replace('- 音效：沈汀', '- 声效：沈汀'), /字段应依次为/);
  const swapped = NIGHT_SB.replace(/- 环境音：(.*)\n- 音效：(.*)\n/, '- 音效：$2\n- 环境音：$1\n');
  expectError(swapped, /字段应依次为/);
});
test('required fields and sound placeholders', () => {
  expectError(NIGHT_SB.replace('- 背景音乐：无', '- 背景音乐：'), /「背景音乐」不能留空/);
  expectError(NIGHT_SB.replace(/- 段尾状态：记录纸.*\n/, '- 段尾状态：[本段段尾状态]\n'), /残留占位符/);
});
test('handover rewrite is paired word for word inside a scene', () => {
  expectError(UMBRELLA_SB.replace('- 段首复写：陈岚把伞套放到桌角后松开手，视线落到摊开的线图上停住。', '- 段首复写：陈岚松开伞套。'), /E02-02：「段首复写」应与 E02-01 的「供下一段复写的内容」逐字相同/, UMBRELLA);
  expectError(NIGHT_SB.replace('- 段首复写：\n', '- 段首复写：沈汀抬手。\n'), /场内第一段没有可复写的上一段/);
  expectError(NIGHT_SB.replace('- 供下一段复写的内容：\n', '- 供下一段复写的内容：沈汀抬手。\n'), /场内最后一段不跨场复写/);
});
test('rewrites never replay dialogue', () => {
  const md = UMBRELLA_SB.replaceAll('陈岚把伞套放到桌角后松开手，视线落到摊开的线图上停住。', '陈岚说：我昨晚找到了旧簿，这个结不只一个人会打。');
  expectError(md, /不能包含台词「我昨晚找到了旧簿，这个结不只一个人会打。」/, UMBRELLA);
});
test('dialogue beyond the single-segment limit blocks; whole estimate over the limit only warns', () => {
  expectError(NIGHT_SB.replace('- 单段上限：15 秒', '- 单段上限：8 秒'), /台词估时 9\.1 秒已超过单段上限 8 秒/);
  const r = storyboardErrors(parseStoryboard(NIGHT_SB.replace('- 单段上限：15 秒', '- 单段上限：12 秒')), NIGHT);
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings[0], /E07-01：整段粗估 14\.1 秒超过单段上限 12 秒/);
});
test('limit must be positive seconds', () => expectError(NIGHT_SB.replace('- 单段上限：15 秒', '- 单段上限：很长'), /单段上限应写成/));
test('checkup reports the storyboard gate: pass, not provided, skeleton, production-ready', () => {
  const gate = (ctx, id = 'storyboard') => checkup(NIGHT, ctx).gates.find(g => g.id === id);
  assert.equal(gate({ storyboard: NIGHT_SB }).status, 'pass');
  assert.equal(gate({}).status, 'skipped'); assert.equal(gate({}).reason, 'not-provided');
  assert.equal(gate({ stage: 'skeleton' }).reason, 'stage-incomplete');
  assert.equal(gate({ requireTarget: true }).status, 'fail');
  assert.equal(gate({ storyboard: NIGHT_SB.replace('- 单段上限：15 秒', '- 单段上限：12 秒') }, 'storyboard-duration').level, 'warn');
});
const dir = mkdtempSync(join(tmpdir(), 'script-storyboard-'));
try {
  const cli = (...args) => spawnSync(process.execPath, [join(root, 'scripts/mint-script.mjs'), ...args], { encoding: 'utf8' });
  cpSync(ex('夜班水尺-script.json'), join(dir, 'night.json'));
  cpSync(ex('夜班水尺-source.txt'), join(dir, '夜班水尺-source.txt'));
  test('CLI storyboard prints a parseable skeleton; validate finds the sibling file', () => {
    const seeded = cli('storyboard', join(dir, 'night.json'), '--limit', '12');
    assert.equal(seeded.status, 0, seeded.stderr);
    assert.match(seeded.stdout, /- 剧本：night\.json\n- 单段上限：12 秒/);
    assert.match(cli('validate', join(dir, 'night.json'), '--no-production').stdout, /skipped\/base\/error storyboard \(not-provided\)/);
    writeFileSync(join(dir, 'night-storyboard.md'), seeded.stdout);
    const r = cli('validate', join(dir, 'night.json'), '--no-production');
    assert.equal(r.status, 1); assert.match(r.stdout, /fail\/base\/error storyboard: .*段首状态/);
    writeFileSync(join(dir, 'night-storyboard.md'), NIGHT_SB);
    assert.equal(cli('validate', join(dir, 'night.json'), '--no-production').status, 0);
  });
  test('explicit --storyboard must exist', () => {
    const r = cli('validate', join(dir, 'night.json'), '--no-production', '--storyboard', join(dir, 'missing.md'));
    assert.equal(r.status, 1); assert.match(r.stderr, /ENOENT/);
  });
  rmSync(join(dir, 'night-storyboard.md'));
} finally { rmSync(dir, { recursive: true, force: true }); }
console.log(`✓ ${count} storyboard tests passed (local fixtures; no paid calls).`);
