#!/usr/bin/env node
// Local-only profile contract tests. Fixtures never read a sibling skill.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { RULE_KEYS, neutralParams, validateSelection, validateCreative, validateParams, discoverProfiles, resolveProfiles,
  previewApplication, applyToFile, inspectContext, handleCreativeCommand } from './lib/creative.mjs';

const STAGE = 'creation';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), `shuohao-${STAGE}-profiles-`));
let count = 0, failed = 0, fixtureCount = 0;
const copy = value => structuredClone(value);
function test(name, fn) { count++; try { fn(); } catch (e) { failed++; console.error(`FAIL ${name}\n${e.stack}`); } }
const choice = (structure = 'serial-cliff', pacing = 'dense-payoff', genre = 'drama', style = 'intense') => ({
  genre: { id: genre, version: '1.0.0' }, narrativeStyle: { id: style, version: '1.0.0' },
  structure: { id: structure, version: '1.0.0' }, pacing: { id: pacing, version: '1.0.0' },
});
const DENSE = choice(), GRADUAL = choice('serial', 'gradual', 'mystery', 'restrained'), MEASURED = choice('episodic', 'measured', 'life', 'warm');
const valid = {
  payoffCoverage: { level: 'error', minPerEpisode: 1 }, firstMajor: { level: 'error', byEpisode: 3 }, majorGap: { level: 'error', maxGap: 5 },
  endingPayoff: { level: 'error', minWeight: 'major' }, endingModes: { level: 'error', nonFinal: ['suspense', 'closure', 'open'], final: ['closure', 'open'] },
  optionalQuestions: { level: 'error', allow: false }, stateProgress: { level: 'error' }, arcCoverage: { level: 'error' }, arcPayoff: { level: 'error', minWeight: 'minor' },
  openingWindow: { level: 'error', maxBeats: 3 }, lineLength: { level: 'error', maxChars: 30 }, cutDuration: { level: 'error', minSeconds: 2, maxSeconds: 5 },
};
const KEY = RULE_KEYS[STAGE][0], TARGET = `params.rules.${KEY}`;
const fixture = () => {
  const root = path.join(TEMP, `fixture-${++fixtureCount}`);
  fs.mkdirSync(root, { recursive: true });
  fs.cpSync(path.join(ROOT, 'references'), path.join(root, 'references'), { recursive: true });
  return root;
};
const options = (root, selection = DENSE, extra = {}) => ({ skillRoot: root, stage: STAGE, selection, ...extra });
const doc = () => ({ schemaVersion: 2, params: { ...neutralParams(STAGE), episodes: 6, minutesPerEpisode: 2, maxCharacters: 8,
  charsPerSecond: 4.5, actionSeconds: 2.5, tolerance: 0.15, maxSegmentSeconds: 15, maxOnScreen: 3 },
  episodes: [{ ep: 1, targetSeconds: 120, ending: { mode: 'open', event: '完成约定后留在原地。', question: { id: 'Q01', resolution: 'optional', reason: '保留余味' } } }], story: { endingBeatId: 'B01' } });
const writeJSON = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); };
function fileDoc(root, value = doc()) { const file = path.join(root, 'artifact.json'); writeJSON(file, value); return file; }
function located(root, dimension = 'pacing', id = 'dense-payoff', version = '1.0.0') {
  return path.join(root, 'references', 'profiles', dimension === 'narrativeStyle' ? 'narrative-style' : dimension, id, version, 'profile.json');
}
function mutate(file, fn) { const p = JSON.parse(fs.readFileSync(file, 'utf8')); fn(p); writeJSON(file, p); }
function addProfile(root, { dimension = 'pacing', id = 'custom-local', version = '1.0.0', rules = {}, defaults, guide = 'guide.md' } = {}) {
  const file = located(root, dimension, id, version);
  const p = { profileSchemaVersion: 1, dimension, id, version, stage: STAGE, guide, rules, ...(defaults === undefined ? {} : { defaults }) };
  writeJSON(file, p);
  fs.writeFileSync(path.join(path.dirname(file), 'guide.md'), '# 本地测试指南\n\n按已知事件安排表达；不改变基础引用和技术限制。\n');
  return file;
}
function applied(root, selection = DENSE, extra = {}) { return applyToFile(fileDoc(root), options(root, selection, { confirm: true, ...extra })).document; }
const off = () => ({ level: 'off' });
const blocking = checks => checks.filter(c => c.status === 'fail' && c.level === 'error' && c.category !== 'source');
function quiet(fn) { const log = console.log, error = console.error; try { console.log = () => {}; console.error = () => {}; return fn(); } finally { console.log = log; console.error = error; } }
function runCLI(root, args) {
  const moduleURL = pathToFileURL(path.join(ROOT, 'scripts/lib/creative.mjs')).href;
  const code = `import {handleCreativeCommand} from ${JSON.stringify(moduleURL)}; try { handleCreativeCommand(${JSON.stringify(args)}, ${JSON.stringify({ skillRoot: root, stage: STAGE })}); } catch(e) { console.error(e.message); process.exitCode=1; }`;
  return spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
}
// Exercise the real consumer entrypoint with this skill's own scripts and sample.
function consumerFixture() {
  const root = fixture();
  fs.cpSync(path.join(ROOT, 'scripts'), path.join(root, 'scripts'), { recursive: true });
  const sample = { outline: '旧站时刻-outline.json', script: '修伞簿-script.json', creation: 'creation/收书人-creation.json' }[STAGE];
  const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples', sample), 'utf8'));
  return { root, file: fileDoc(root, source), source };
}
function consumerCLI(root, args) {
  return spawnSync(process.execPath, [path.join(root, `scripts/novel-${STAGE}.mjs`), ...args], { cwd: root, encoding: 'utf8' });
}
try {
  test('中性参数完整、独立且不带旧阈值', () => {
    for (const stage of Object.keys(RULE_KEYS)) {
      const a = neutralParams(stage), b = neutralParams(stage);
      assert.deepEqual(validateParams(stage, a), []); assert.deepEqual(Object.keys(a.rules), RULE_KEYS[stage]);
      a.rules[RULE_KEYS[stage][0]].level = 'error'; assert.equal(b.rules[RULE_KEYS[stage][0]].level, 'off');
    }
    assert.throws(() => neutralParams('characters')); assert.throws(() => discoverProfiles(ROOT, 'art'));
  });
  test('完整选择与可选 creative', () => {
    assert.deepEqual(validateSelection(DENSE), []); assert.deepEqual(validateCreative(undefined), []);
    assert.deepEqual(validateCreative({ version: 1, selection: DENSE }), []);
    assert.ok(validateCreative(null).length); assert.ok(validateCreative({ version: 2, selection: DENSE }).length);
    assert.ok(validateCreative({ version: 1, selection: DENSE, rules: {} }).length);
  });
  for (const version of ['latest', '^1.0.0', '1.x', '1', 'v1.0.0', '01.0.0', '1.0.0-01', '', null, 1]) test(`拒绝浮动或错误版本 ${version}`, () => {
    const s = copy(DENSE); s.genre.version = version; assert.ok(validateSelection(s).length);
  });
  test('精确预发布版本合法', () => { const s = copy(DENSE); s.genre.version = '1.2.3-rc.1+local'; assert.deepEqual(validateSelection(s), []); });
  test('选择严格字段与非法身份', () => {
    for (const s of [null, [], {}, { ...DENSE, other: {} }, { ...DENSE, genre: { id: '../escape', version: '1.0.0' } }, { ...DENSE, genre: { ...DENSE.genre, extra: 1 } }]) assert.ok(validateSelection(s).length);
  });
  for (const stage of Object.keys(RULE_KEYS)) for (const key of RULE_KEYS[stage]) {
    for (const level of ['off', 'warn', 'error']) test(`${stage}.${key} 接受 ${level}`, () => {
      const p = neutralParams(stage); p.rules[key] = level === 'off' ? off() : { ...valid[key], level }; assert.deepEqual(validateParams(stage, p), []);
    });
    test(`${stage}.${key} 严格形状`, () => {
      for (const value of [null, [], 'off', { level: 'off', stale: 1 }, { ...valid[key], extra: true }, { ...valid[key], level: 'fatal' }, {}]) {
        const p = neutralParams(stage); p.rules[key] = value; assert.ok(validateParams(stage, p).length, JSON.stringify(value));
      }
      for (const field of Object.keys(valid[key])) {
        const p = neutralParams(stage); p.rules[key] = copy(valid[key]); delete p.rules[key][field]; assert.ok(validateParams(stage, p).length);
      }
      const p = neutralParams(stage); delete p.rules[key]; assert.ok(validateParams(stage, p).length);
    });
    for (const [field, value] of Object.entries(valid[key])) if (typeof value === 'number') test(`${stage}.${key}.${field} 数值边界`, () => {
      for (const bad of [0, -1, '2', null, NaN, Infinity, -Infinity, ...(key === 'cutDuration' ? [] : [1.5])]) {
        const p = neutralParams(stage); p.rules[key] = { ...valid[key], [field]: bad }; assert.ok(validateParams(stage, p).length, String(bad));
      }
    });
  }
  test('模式集合、强度、布尔值与秒数边界', () => {
    for (const bad of [[], ['open', 'open'], ['unknown'], 'open', [1]]) {
      const p = neutralParams('outline'); p.rules.endingModes = { ...valid.endingModes, final: bad }; assert.ok(validateParams('outline', p).length);
    }
    for (const key of ['endingPayoff', 'arcPayoff']) { const p = neutralParams('outline'); p.rules[key] = { level: 'error', minWeight: 'max' }; assert.ok(validateParams('outline', p).length); }
    const p = neutralParams('outline'); p.rules.optionalQuestions = { level: 'error', allow: 'false' }; assert.ok(validateParams('outline', p).length);
    const c = neutralParams('creation'); c.rules.cutDuration = { level: 'warn', minSeconds: 0.25, maxSeconds: 0.25 }; assert.deepEqual(validateParams('creation', c), []);
    c.rules.cutDuration.maxSeconds = 0.1; assert.ok(validateParams('creation', c).length);
  });
  test('生成默认值严格且只属于 outline', () => {
    for (const good of [null, 1, 2]) { const p = neutralParams('outline'); p.defaults.questionResolveWithin = good; assert.deepEqual(validateParams('outline', p), []); }
    for (const bad of [0, -1, 1.5, '2', undefined, NaN, Infinity, { level: 'off' }]) {
      const p = neutralParams('outline'); p.defaults.questionResolveWithin = bad; assert.ok(validateParams('outline', p).length);
    }
    const p = neutralParams('outline'); delete p.defaults.questionResolveWithin; assert.ok(validateParams('outline', p).length);
    for (const s of ['script', 'creation']) assert.ok(validateParams(s, { ...neutralParams(s), defaults: { questionResolveWithin: null } }).length);
  });
  test('未知规则、defaults、旧字段与 params 缺失失败', () => {
    const legacy = { outline: ['maxBeatGap', 'pacing'], script: ['hookWindow', 'maxLineChars'], creation: ['minCutSeconds', 'maxCutSeconds'] };
    for (const s of Object.keys(RULE_KEYS)) {
      for (const k of legacy[s]) assert.ok(validateParams(s, { ...neutralParams(s), [k]: 3 }).length);
      const p = neutralParams(s); p.rules.unknown = off(); assert.ok(validateParams(s, p).length);
      assert.ok(validateParams(s, { ...neutralParams(s), defaults: { unknown: null } }).length);
      for (const bad of [undefined, null, [], {}, { rules: [] }]) assert.ok(validateParams(s, bad).length);
    }
  });
  test('本地首批 profiles 与三种组合真实指南', () => {
    const profiles = discoverProfiles(ROOT, STAGE); assert.equal(profiles.length, STAGE === 'creation' ? 9 : 12);
    for (const p of profiles) for (const section of ['适用目标', '表达方法', '应避免的做法', '正例', '反例', '内容评审问题', '来源说明']) assert.ok(p.guide.includes(`## ${section}`));
    for (const selection of [DENSE, GRADUAL, MEASURED]) {
      const r = resolveProfiles(ROOT, STAGE, selection); assert.equal(r.references.length, STAGE === 'creation' ? 3 : 4);
      assert.equal(r.guides.length, r.references.length); assert.ok(r.guides.every(g => g.text.length > 250));
      assert.deepEqual(validateParams(STAGE, { rules: r.rules, ...(STAGE === 'outline' ? { defaults: r.defaults } : {}) }), []);
    }
    const a = resolveProfiles(ROOT, STAGE, DENSE), b = resolveProfiles(ROOT, STAGE, GRADUAL), c = resolveProfiles(ROOT, STAGE, MEASURED);
    if (STAGE === 'outline') {
      assert.deepEqual(a.rules.payoffCoverage, valid.payoffCoverage); assert.equal(a.defaults.questionResolveWithin, 2);
      assert.equal(b.rules.payoffCoverage.level, 'off'); assert.equal(b.rules.stateProgress.level, 'error');
      assert.equal(c.rules.stateProgress.level, 'off'); assert.ok(c.rules.endingModes.nonFinal.includes('closure')); assert.equal(c.defaults.questionResolveWithin, null);
    } else if (STAGE === 'script') { assert.equal(a.rules.openingWindow.level, 'warn'); assert.equal(b.rules.openingWindow.level, 'off'); assert.equal(c.rules.lineLength.level, 'off'); }
    else { assert.equal(a.rules.cutDuration.maxSeconds, 5); assert.equal(b.rules.cutDuration.maxSeconds, 12); assert.equal(c.rules.cutDuration.maxSeconds, 15); }
  });
  test('新增合法目录自动发现、摘要固定且路径无关', () => {
    const root = fixture(), file = addProfile(root), p = discoverProfiles(root, STAGE).find(p => p.id === 'custom-local');
    assert.ok(p); const raw = fs.readFileSync(file, 'utf8'), guide = fs.readFileSync(p.guidePath, 'utf8');
    assert.equal(p.sha256, crypto.createHash('sha256').update(JSON.stringify(['shuohao-profile-v1', raw, guide])).digest('hex'));
    const moved = `${root}-moved`; fs.cpSync(root, moved, { recursive: true }); assert.equal(discoverProfiles(moved, STAGE).find(p => p.id === 'custom-local').sha256, p.sha256);
    const s = copy(DENSE); s.pacing.id = 'custom-local'; assert.ok(resolveProfiles(root, STAGE, s));
  });
  for (const [name, mutation] of [
    ['未知顶层字段', p => { p.executable = 'run'; }], ['未知规则', p => { p.rules.notSupported = off(); }],
    ['未知级别', p => { p.rules[KEY] = { ...valid[KEY], level: 'fatal' }; }],
    ['错误 schema', p => { p.profileSchemaVersion = 2; }], ['错误阶段', p => { p.stage = 'setup'; }],
    ['错误维度', p => { p.dimension = 'visual'; }], ['非法 ID', p => { p.id = '../escape'; }], ['错误版本', p => { p.version = 'latest'; }],
    ['缺 rules', p => { delete p.rules; }], ['数组 rules', p => { p.rules = []; }], ['未知默认值', p => { p.defaults = { unknown: 1 }; }],
    ['off 残留参数', p => { p.rules[KEY] = { level: 'off', stale: 1 }; }],
  ]) test(`发现拒绝${name}`, () => { const root = fixture(); mutate(located(root), mutation); assert.throws(() => discoverProfiles(root, STAGE)); assert.throws(() => resolveProfiles(root, STAGE, DENSE)); });
  test('损坏 JSON、缺失或空白指南拒绝', () => {
    for (const mode of ['json', 'missing', 'empty']) {
      const root = fixture(), file = located(root), guide = path.join(path.dirname(file), 'guide.md');
      if (mode === 'json') fs.writeFileSync(file, '{broken'); else if (mode === 'missing') fs.unlinkSync(guide); else fs.writeFileSync(guide, ' \n');
      assert.throws(() => discoverProfiles(root, STAGE));
    }
  });
  test('重复身份失败，版本确切匹配', () => {
    const root = fixture(), file = located(root);
    fs.cpSync(path.dirname(file), path.join(root, 'references/profiles/duplicate'), { recursive: true });
    assert.throws(() => discoverProfiles(root, STAGE), /重复/);
    assert.throws(() => resolveProfiles(root, STAGE, GRADUAL), /重复/);
    const s = copy(DENSE); s.pacing.version = '9.0.0'; assert.throws(() => resolveProfiles(ROOT, STAGE, s), /缺少/);
  });
  for (const guide of ['/tmp/guide.md', '../guide.md', 'sub/../../guide.md', 'C:/guide.md', 'sub\\guide.md', './guide.md', 'sub//guide.md', 'guide.txt', '', 'bad\0.md']) test(`拒绝指南路径 ${JSON.stringify(guide)}`, () => {
    const root = fixture(); mutate(located(root), p => { p.guide = guide; }); assert.throws(() => discoverProfiles(root, STAGE));
  });
  test('无效 UTF-8 与悬空根链接不被当作缺失', () => {
    const root = fixture(), guide = path.join(path.dirname(located(root)), 'guide.md');
    fs.writeFileSync(guide, Buffer.from([0xc3, 0x28])); assert.throws(() => discoverProfiles(root, STAGE), /UTF-8/);
    const dangling = fixture(), profiles = path.join(dangling, 'references/profiles');
    fs.rmSync(profiles, { recursive: true }); fs.symlinkSync(path.join(dangling, 'not-installed'), profiles);
    assert.throws(() => discoverProfiles(dangling, STAGE), /符号链接/);
  });
  test('允许正常嵌套指南', () => {
    const root = fixture(), file = located(root), directory = path.dirname(file);
    fs.mkdirSync(path.join(directory, 'notes')); fs.renameSync(path.join(directory, 'guide.md'), path.join(directory, 'notes/details.md'));
    mutate(file, p => { p.guide = 'notes/details.md'; }); assert.ok(discoverProfiles(root, STAGE).find(p => p.id === 'dense-payoff').guide.includes('适用目标'));
  });
  for (const kind of ['guide-external', 'guide-internal', 'directory', 'profile', 'profiles-root', 'references-root']) test(`拒绝符号链接 ${kind}`, () => {
    const root = fixture(), file = located(root), directory = path.dirname(file);
    const outside = path.join(TEMP, `outside-${fixtureCount}.md`); fs.writeFileSync(outside, '# 不应读取\n');
    if (kind.startsWith('guide')) {
      const guide = path.join(directory, 'guide.md'); fs.unlinkSync(guide);
      fs.symlinkSync(kind === 'guide-external' ? outside : path.join(root, 'references/profile-contract.md'), guide);
    } else if (kind === 'directory') fs.symlinkSync(TEMP, path.join(root, 'references/profiles/escape'));
    else if (kind === 'profile') { fs.renameSync(file, `${file}.original`); fs.symlinkSync(`${file}.original`, file); }
    else { const target = path.join(root, kind === 'profiles-root' ? 'references/profiles' : 'references'); fs.renameSync(target, `${target}.original`); fs.symlinkSync(`${target}.original`, target); }
    assert.throws(() => discoverProfiles(root, STAGE), /符号链接|逃逸/);
    assert.throws(() => resolveProfiles(root, STAGE, GRADUAL), /符号链接|逃逸/);
  });
  test('按阶段矩阵加载，缺少必需维度失败', () => {
    const root = fixture(); fs.rmSync(path.join(root, 'references/profiles/structure'), { recursive: true, force: true });
    if (STAGE === 'creation') {
      const result = resolveProfiles(root, STAGE, DENSE); assert.equal(result.references.some(r => r.dimension === 'structure'), false);
      const p = previewApplication(doc(), options(root)); assert.deepEqual(p.document.creativeContext.selection.structure, DENSE.structure);
    } else assert.throws(() => resolveProfiles(root, STAGE, DENSE), /缺少/);
    const root2 = fixture(); fs.rmSync(path.dirname(located(root2)), { recursive: true }); assert.throws(() => resolveProfiles(root2, STAGE, DENSE), /缺少/);
  });
  test('规则内部字段不得跨 profile 拼接', () => {
    const root = fixture(); mutate(located(root), p => { p.rules = { [KEY]: { level: 'warn' } }; });
    mutate(located(root, 'genre', 'drama'), p => { p.rules = { [KEY]: Object.fromEntries(Object.entries(valid[KEY]).filter(([k]) => k !== 'level')) }; });
    assert.throws(() => resolveProfiles(root, STAGE, DENSE));
  });
  test('完整规则冲突可预览，必须完整覆盖', () => {
    const root = fixture(); mutate(located(root, 'genre', 'drama'), p => { p.rules[KEY] = off(); });
    assert.throws(() => resolveProfiles(root, STAGE, DENSE), /冲突/);
    const preview = previewApplication(doc(), options(root)); assert.ok(preview.conflicts.some(c => c.path === TARGET));
    assert.deepEqual(preview.document.params.rules[KEY], off());
    const file = fileDoc(root), original = fs.readFileSync(file);
    assert.throws(() => applyToFile(file, options(root, DENSE, { confirm: true })), /未决/); assert.deepEqual(fs.readFileSync(file), original);
    assert.throws(() => resolveProfiles(root, STAGE, DENSE, { overrides: { [`${TARGET}.level`]: 'off' } }));
    const r = resolveProfiles(root, STAGE, DENSE, { overrides: { [TARGET]: copy(valid[KEY]) } }); assert.deepEqual(r.rules[KEY], valid[KEY]);
    const done = applyToFile(file, options(root, DENSE, { confirm: true, overrides: { [TARGET]: off() } })); assert.equal(done.applied, true); assert.deepEqual(done.document.creativeContext.overridePaths, [TARGET]);
  });
  test('对象键序与模式集合顺序不制造冲突', () => {
    const root = fixture(); const key = STAGE === 'outline' ? 'endingModes' : KEY;
    const rule = STAGE === 'outline' ? { level: 'error', nonFinal: ['suspense', 'open'], final: ['closure', 'open'] } : valid[key];
    const reversed = Object.fromEntries(Object.entries(rule).reverse().map(([k, v]) => [k, Array.isArray(v) ? [...v].reverse() : v]));
    // Remove other declarations of this key to test only the two equal declarations.
    for (const p of discoverProfiles(root, STAGE)) mutate(p.profilePath, x => { delete x.rules[key]; });
    mutate(located(root), p => { p.rules[key] = rule; }); mutate(located(root, 'genre', 'drama'), p => { p.rules[key] = reversed; });
    assert.ok(resolveProfiles(root, STAGE, DENSE));
    if (STAGE === 'outline') { mutate(located(root), p => { p.rules.endingModes.final.push('open'); }); assert.throws(() => resolveProfiles(root, STAGE, DENSE)); }
  });
  if (STAGE === 'outline') test('默认值冲突完整覆盖，默认值不修改既有问题', () => {
    const root = fixture(); mutate(located(root, 'genre', 'drama'), p => { p.defaults = { questionResolveWithin: 5 }; });
    assert.throws(() => resolveProfiles(root, STAGE, DENSE), /冲突/);
    const r = previewApplication(doc(), options(root, DENSE, { overrides: { 'params.defaults.questionResolveWithin': null } }));
    assert.equal(r.conflicts.length, 0); assert.equal(r.document.params.defaults.questionResolveWithin, null); assert.deepEqual(r.document.episodes, doc().episodes);
  });
  test('禁止覆盖基础、技术参数及未注册字段', () => {
    for (const target of ['params.maxSegmentSeconds', 'params.rules.unknown', `${TARGET}.level`, '__proto__', 'params.defaults.unknown', 'episodes', 'params.rules.__proto__']) {
      assert.throws(() => previewApplication(doc(), options(ROOT, DENSE, { overrides: { [target]: off() } })));
    }
    for (const value of [null, [], 'off', { level: 'off', stale: 1 }]) assert.throws(() => previewApplication(doc(), options(ROOT, DENSE, { overrides: { [TARGET]: value } })));
  });
  test('API 不接受字符串确认或 null 覆盖', () => {
    const root = fixture(), file = fileDoc(root), bytes = fs.readFileSync(file);
    assert.throws(() => applyToFile(file, options(root, DENSE, { confirm: 'false' })));
    assert.throws(() => resolveProfiles(root, STAGE, DENSE, { overrides: null }));
    assert.deepEqual(fs.readFileSync(file), bytes);
  });
  test('预览与取消不写入，不修改传入文档', () => {
    const root = fixture(), source = doc(), before = copy(source), file = fileDoc(root, source), bytes = fs.readFileSync(file);
    previewApplication(source, options(root)); assert.deepEqual(source, before);
    const result = applyToFile(file, options(root)); assert.equal(result.applied, false); assert.equal(result.backup, null);
    assert.deepEqual(fs.readFileSync(file), bytes); assert.equal(fs.readdirSync(root).some(n => n.includes('.backup-') || n.includes('.tmp-')), false);
  });
  test('原子应用有逐字节备份，非策略参数与故事保持', () => {
    const root = fixture(), source = doc(), file = fileDoc(root, source), bytes = fs.readFileSync(file);
    const result = applyToFile(file, options(root, DENSE, { confirm: true })); assert.equal(result.applied, true);
    assert.deepEqual(fs.readFileSync(result.backup), bytes); assert.deepEqual(JSON.parse(fs.readFileSync(file)), result.document);
    for (const [k, v] of Object.entries(source.params)) if (!['rules', 'defaults'].includes(k)) assert.deepEqual(result.document.params[k], v);
    assert.deepEqual(result.document.episodes, source.episodes); assert.deepEqual(result.document.story, source.story);
    assert.equal(result.document.creativeContext.references.length, STAGE === 'creation' ? 3 : 4);
  });
  test('同组合重新应用不自动产生手工差异', () => {
    const root = fixture(), a = applied(root); const p = previewApplication(a, options(root));
    assert.deepEqual(p.decisionsRequired, []); assert.ok(p.changes.every(c => !c.changed && !c.manualDifference));
  });
  test('切换到空 rules 恢复中性，不保留旧下限', () => {
    const root = fixture(), a = applied(root); addProfile(root);
    const s = copy(DENSE); s.pacing.id = 'custom-local'; const r = previewApplication(a, options(root, s));
    assert.deepEqual(r.document.params.rules[KEY], off()); assert.equal(r.decisionsRequired.length, 0);
    if (STAGE === 'outline') assert.equal(r.document.params.defaults.questionResolveWithin, null);
    assert.deepEqual(r.document.episodes, a.episodes);
  });
  test('旧覆盖必须逐项保留、放弃或重填，取消不变', () => {
    const root = fixture(), a = applied(root, DENSE, { overrides: { [TARGET]: off() } }), file = fileDoc(root, a), bytes = fs.readFileSync(file);
    const p = applyToFile(file, options(root, GRADUAL)); assert.ok(p.decisionsRequired.includes(TARGET)); assert.deepEqual(fs.readFileSync(file), bytes);
    assert.throws(() => applyToFile(file, options(root, GRADUAL, { confirm: true })), /未决/);
    const keep = previewApplication(a, options(root, GRADUAL, { decisions: { [TARGET]: 'keep' } }));
    assert.deepEqual(keep.document.params.rules[KEY], off()); assert.deepEqual(keep.document.creativeContext.overridePaths, [TARGET]); assert.equal(keep.decisionsRequired.length, 0);
    const drop = previewApplication(a, options(root, GRADUAL, { decisions: { [TARGET]: 'drop' } }));
    assert.deepEqual(drop.document.params.rules, resolveProfiles(root, STAGE, GRADUAL).rules); assert.deepEqual(drop.document.creativeContext.overridePaths, []);
    const replace = previewApplication(a, options(root, GRADUAL, { overrides: { [TARGET]: copy(valid[KEY]) } })); assert.deepEqual(replace.document.params.rules[KEY], valid[KEY]);
    assert.throws(() => previewApplication(a, options(root, GRADUAL, { decisions: { [TARGET]: 'maybe' } })));
    assert.throws(() => previewApplication(a, options(root, GRADUAL, { decisions: { [TARGET]: 'keep' }, overrides: { [TARGET]: off() } })));
  });
  test('已记录且恰好等于模板的覆盖仍需明确决定', () => {
    const root = fixture(), value = resolveProfiles(root, STAGE, DENSE).rules[KEY];
    const a = applied(root, DENSE, { overrides: { [TARGET]: value } });
    const p = previewApplication(a, options(root)); assert.ok(p.decisionsRequired.includes(TARGET));
    assert.equal(p.changes.find(c => c.path === TARGET).previousOverride, true);
    assert.equal(p.changes.find(c => c.path === TARGET).manualDifference, false);
    assert.deepEqual(previewApplication(a, options(root, DENSE, { decisions: { [TARGET]: 'drop' } })).document.creativeContext.overridePaths, []);
  });
  if (STAGE === 'outline') test('默认值覆盖逐项保留或放弃且不回写问题', () => {
    const root = fixture(), target = 'params.defaults.questionResolveWithin';
    const a = applied(root, DENSE, { overrides: { [target]: 4 } });
    assert.ok(previewApplication(a, options(root, GRADUAL)).decisionsRequired.includes(target));
    const keep = previewApplication(a, options(root, GRADUAL, { decisions: { [target]: 'keep' } }));
    assert.equal(keep.document.params.defaults.questionResolveWithin, 4); assert.deepEqual(keep.document.episodes, a.episodes);
    const drop = previewApplication(a, options(root, GRADUAL, { decisions: { [target]: 'drop' } }));
    assert.equal(drop.document.params.defaults.questionResolveWithin, null); assert.deepEqual(drop.document.episodes, a.episodes);
  });
  test('未记录手工差异进入预览，非法当前值不能保留', () => {
    const root = fixture(), a = applied(root); a.params.rules[KEY] = off();
    const p = previewApplication(a, options(root)); assert.ok(p.decisionsRequired.includes(TARGET)); assert.equal(p.changes.find(c => c.path === TARGET).manualDifference, true);
    a.params.rules[KEY] = { level: 'off', stale: 1 };
    assert.throws(() => previewApplication(a, options(root, DENSE, { decisions: { [TARGET]: 'keep' } })));
    assert.equal(previewApplication(a, options(root, DENSE, { decisions: { [TARGET]: 'drop' } })).decisionsRequired.length, 0);
  });
  test('没有来源的非中性参数必须确认，空草稿可应用', () => {
    const a = doc(); a.params.rules[KEY] = copy(valid[KEY]); assert.ok(previewApplication(a, options(ROOT)).decisionsRequired.includes(TARGET));
    assert.deepEqual(previewApplication({}, options(ROOT)).decisionsRequired, []);
  });
  test('同版本指南漂移历史仅提醒且不改参数，继续应用失败', () => {
    const root = fixture(), a = applied(root), before = copy(a), file = fileDoc(root, a), bytes = fs.readFileSync(file);
    fs.appendFileSync(path.join(path.dirname(located(root)), 'guide.md'), '\n额外表达建议。\n');
    const checks = inspectContext(a, { ...options(root), production: { creative: { version: 1, selection: DENSE } } });
    assert.ok(checks.some(c => c.reason === 'source-drift' && c.status === 'fail' && c.level === 'warn')); assert.equal(blocking(checks).length, 0);
    assert.deepEqual(a, before); assert.deepEqual(fs.readFileSync(file), bytes);
    assert.throws(() => applyToFile(file, options(root, DENSE, { confirm: true, overrides: { [TARGET]: off() } })), /来源漂移/);
    assert.deepEqual(fs.readFileSync(file), bytes);
  });
  test('模板阈值改变不改变历史有效参数或记录摘要', () => {
    const root = fixture(), a = applied(root), before = copy(a);
    mutate(located(root), p => { p.rules[KEY] = off(); });
    assert.ok(inspectContext(a, options(root)).some(c => c.reason === 'source-drift'));
    assert.deepEqual(a, before); assert.deepEqual(validateParams(STAGE, a.params), []);
    assert.throws(() => previewApplication(a, options(root, DENSE, { decisions: { [TARGET]: 'drop' } })), /来源漂移/);
  });
  test('同版本 JSON 空白变化也算漂移，恢复原文件可继续', () => {
    const root = fixture(), a = applied(root), file = located(root), original = fs.readFileSync(file);
    fs.appendFileSync(file, '\n'); assert.throws(() => previewApplication(a, options(root)), /来源漂移/);
    fs.writeFileSync(file, original); assert.deepEqual(previewApplication(a, options(root)).decisionsRequired, []);
    assert.ok(inspectContext(a, options(root)).filter(c => c.category === 'source').every(c => c.status === 'pass'));
  });
  test('升级新版本允许绕过漂移旧文件，取消和失败不更新摘要', () => {
    const root = fixture(), a = applied(root), old = located(root), file = fileDoc(root, a), bytes = fs.readFileSync(file);
    fs.appendFileSync(path.join(path.dirname(old), 'guide.md'), '\n旧版本漂移。\n');
    const next = located(root, 'pacing', 'dense-payoff', '1.1.0'); fs.cpSync(path.dirname(old), path.dirname(next), { recursive: true }); mutate(next, p => { p.version = '1.1.0'; });
    const s = copy(DENSE); s.pacing.version = '1.1.0';
    const preview = applyToFile(file, options(root, s)); assert.equal(preview.applied, false); assert.deepEqual(fs.readFileSync(file), bytes);
    const decisions = Object.fromEntries(preview.decisionsRequired.map(p => [p, 'drop']));
    const originalRename = fs.renameSync;
    try { fs.renameSync = () => { throw new Error('injected rename failure'); }; assert.throws(() => applyToFile(file, options(root, s, { decisions, confirm: true })), /injected/); }
    finally { fs.renameSync = originalRename; }
    assert.deepEqual(fs.readFileSync(file), bytes); assert.equal(fs.readdirSync(root).some(n => n.includes('.tmp-')), false);
    const result = applyToFile(file, options(root, s, { decisions, confirm: true })); assert.equal(result.applied, true); assert.equal(result.document.creativeContext.selection.pacing.version, '1.1.0');
    assert.notEqual(result.document.creativeContext.references.find(r => r.dimension === 'pacing').sha256, a.creativeContext.references.find(r => r.dimension === 'pacing').sha256);
  });
  test('缺失原来源历史可读，新应用失败；新版本应用允许', () => {
    const root = fixture(), a = applied(root), old = located(root), next = located(root, 'pacing', 'dense-payoff', '1.1.0');
    fs.cpSync(path.dirname(old), path.dirname(next), { recursive: true }); mutate(next, p => { p.version = '1.1.0'; }); fs.rmSync(path.dirname(old), { recursive: true });
    const before = copy(a), checks = inspectContext(a, options(root)); assert.ok(checks.some(c => c.reason === 'source-unverifiable')); assert.equal(blocking(checks).length, 0); assert.deepEqual(a, before);
    assert.deepEqual(validateParams(STAGE, a.params), []); assert.throws(() => previewApplication(a, options(root)), /缺少/);
    const s = copy(DENSE); s.pacing.version = '1.1.0'; const preview = previewApplication(a, options(root, s));
    assert.equal(preview.decisionsRequired.length, RULE_KEYS[STAGE].length + (STAGE === 'outline' ? 1 : 0));
    const done = previewApplication(a, options(root, s, { decisions: Object.fromEntries(preview.decisionsRequired.map(p => [p, 'drop'])) })); assert.deepEqual(done.decisionsRequired, []);
  });
  for (const damage of ['unknown-rule', 'missing-guide', 'unknown-schema', 'unknown-field']) test(`真实 CLI 升级不消费未选旧版本：${damage}`, () => {
    const { root, file, source } = consumerFixture();
    const selection = copy(source.creativeContext.selection), old = located(root, 'pacing', selection.pacing.id, selection.pacing.version);
    const next = located(root, 'pacing', selection.pacing.id, '1.1.0');
    fs.cpSync(path.dirname(old), path.dirname(next), { recursive: true }); mutate(next, p => { p.version = '1.1.0'; });
    if (damage === 'unknown-rule') mutate(old, p => { p.rules.unregistered = off(); });
    else if (damage === 'missing-guide') fs.unlinkSync(path.join(path.dirname(old), 'guide.md'));
    else if (damage === 'unknown-schema') mutate(old, p => { p.profileSchemaVersion = 999; });
    else mutate(old, p => { p.unknownField = true; });
    const selectedFile = path.join(root, 'selection.json'); writeJSON(selectedFile, selection);
    // Actual consumption of the old identity must still reject its invalid contract.
    const rejected = consumerCLI(root, ['profile', '--selection', selectedFile]); assert.equal(rejected.status, 1, rejected.stderr);
    const historical = consumerCLI(root, ['validate', file]); assert.equal(historical.status, 0, historical.stdout + historical.stderr);
    selection.pacing.version = '1.1.0'; writeJSON(selectedFile, selection);
    const bytes = fs.readFileSync(file), preview = consumerCLI(root, ['apply-profile', file, '--selection', selectedFile]);
    assert.equal(preview.status, 0, preview.stderr); assert.equal(JSON.parse(preview.stdout).applied, false); assert.deepEqual(fs.readFileSync(file), bytes);
    const decisions = path.join(root, 'decisions.json');
    writeJSON(decisions, Object.fromEntries(JSON.parse(preview.stdout).decisionsRequired.map(p => [p, 'drop'])));
    const result = consumerCLI(root, ['apply-profile', file, '--selection', selectedFile, '--decisions', decisions, '--confirm']);
    assert.equal(result.status, 0, result.stdout + result.stderr); assert.equal(JSON.parse(result.stdout).applied, true);
    assert.match(result.stderr, /postApplication|Post-application/); // Consumer checks, not merely handleCreativeCommand.
    const updated = JSON.parse(fs.readFileSync(file)); assert.equal(updated.creativeContext.selection.pacing.version, '1.1.0');
    assert.equal(updated.creativeContext.references.find(r => r.dimension === 'pacing').version, '1.1.0');
    const checks = inspectContext(updated, options(root, selection));
    assert.ok(checks.filter(c => c.category === 'source').every(c => c.status === 'pass'));
    assert.equal(consumerCLI(root, ['validate', file]).status, 0);
    assert.equal(consumerCLI(root, ['render', file, '--html']).status, 0);
  });
  for (const hazard of ['duplicate', 'symlink', 'broken-json']) test(`真实 CLI 未选来源仍执行安全身份检查：${hazard}`, () => {
    const { root, source } = consumerFixture(), selection = source.creativeContext.selection;
    const unused = addProfile(root), directory = path.dirname(unused);
    if (hazard === 'duplicate') fs.cpSync(directory, path.join(root, 'references/profiles/duplicate-unused'), { recursive: true });
    else if (hazard === 'symlink') {
      fs.unlinkSync(path.join(directory, 'guide.md'));
      fs.symlinkSync(path.join(ROOT, 'references/profile-contract.md'), path.join(directory, 'guide.md'));
    } else fs.writeFileSync(unused, '{broken');
    const selectedFile = path.join(root, 'selection.json'); writeJSON(selectedFile, selection);
    const result = consumerCLI(root, ['profile', '--selection', selectedFile]); assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, hazard === 'duplicate' ? /重复/ : hazard === 'symlink' ? /符号链接/ : /JSON/);
  });
  if (STAGE === 'creation') test('真实 CLI 与历史检查不读取仅记录 structure 的指南或规则', () => {
    const { root, file, source } = consumerFixture(), selection = source.creativeContext.selection;
    const unused = addProfile(root, { dimension: 'structure', ...selection.structure });
    fs.unlinkSync(path.join(path.dirname(unused), 'guide.md'));
    mutate(unused, p => { p.profileSchemaVersion = 999; p.unknownField = true; p.rules.unregistered = off(); });
    const selectedFile = path.join(root, 'selection.json'); writeJSON(selectedFile, selection);
    const originalRead = fs.readFileSync, guide = path.join(path.dirname(unused), 'guide.md');
    try {
      fs.readFileSync = function(target, ...args) { assert.notEqual(String(target), guide, 'record-only guide must never be read'); return originalRead.call(this, target, ...args); };
      assert.equal(resolveProfiles(root, STAGE, selection).references.length, 3);
      assert.ok(discoverProfiles(root, STAGE).every(p => p.dimension !== 'structure'));
      assert.ok(inspectContext(source, options(root, selection)).filter(c => c.category === 'source').every(c => c.status === 'pass'));
    } finally { fs.readFileSync = originalRead; }
    for (const args of [['profile', '--selection', selectedFile], ['apply-profile', file, '--selection', selectedFile, '--confirm'], ['validate', file], ['render', file, '--html']]) {
      const result = consumerCLI(root, args); assert.equal(result.status, 0, result.stdout + result.stderr);
    }
    const updated = JSON.parse(fs.readFileSync(file)); assert.deepEqual(updated.creativeContext.selection.structure, selection.structure);
    assert.equal(updated.creativeContext.references.length, 3);
    // Record-only does not exempt global filesystem safety or duplicate identity checks.
    fs.symlinkSync(path.join(root, 'references/profile-contract.md'), guide);
    assert.throws(() => resolveProfiles(root, STAGE, selection), /符号链接/);
    fs.unlinkSync(guide); fs.cpSync(path.dirname(unused), path.join(root, 'references/profiles/duplicate-structure'), { recursive: true });
    assert.throws(() => resolveProfiles(root, STAGE, selection), /重复/);
  });
  for (const wrap of [v => [v], v => [[v]]]) test('真实 CLI 拒绝数组摘要：基础失败而非来源提醒', () => {
    const { root, file, source } = consumerFixture();
    assert.equal(consumerCLI(root, ['validate', file]).status, 0);
    source.creativeContext.references[0].sha256 = wrap(source.creativeContext.references[0].sha256); writeJSON(file, source);
    const checks = inspectContext(source, options(root));
    assert.ok(checks.some(c => c.id === 'creative-context' && c.category === 'base' && c.level === 'error' && c.status === 'fail'));
    assert.equal(checks.some(c => c.reason === 'source-drift'), false);
    const validation = consumerCLI(root, ['validate', file]); assert.equal(validation.status, 1, validation.stdout + validation.stderr);
    assert.match(validation.stdout + validation.stderr, /SHA-256/);
    // Render exit policy belongs to the consumer; the report must expose the base failure.
    const rendering = consumerCLI(root, ['render', file, '--html']); assert.match(rendering.stdout + rendering.stderr, /SHA-256/);
    const selection = path.join(root, 'selection.json'); writeJSON(selection, source.creativeContext.selection);
    const bytes = fs.readFileSync(file), result = consumerCLI(root, ['apply-profile', file, '--selection', selection, '--confirm']);
    assert.equal(result.status, 1, result.stderr); assert.match(result.stderr, /SHA-256/); assert.deepEqual(fs.readFileSync(file), bytes);
  });
  test('project 对账只比较选择，不比较兄弟阶段摘要', () => {
    const root = fixture(), a = applied(root), same = { creative: { version: 1, selection: DENSE }, arbitraryOtherStageHashes: ['different'] };
    assert.equal(inspectContext(a, { ...options(root), production: same }).find(c => c.id === 'creative-project').status, 'pass');
    const next = copy(DENSE); next.pacing.version = '2.0.0';
    assert.equal(inspectContext(a, { ...options(root), production: { creative: { version: 1, selection: next } } }).find(c => c.id === 'creative-project').status, 'fail');
    assert.equal(inspectContext(a, options(root)).find(c => c.id === 'creative-project').reason, 'missing-upstream');
    for (const bad of [null, [], 'broken', { creative: null }, { creative: { version: 9, selection: DENSE } }]) assert.equal(inspectContext(a, { ...options(root), production: bad }).find(c => c.id === 'creative-project').status, 'fail');
    assert.equal(inspectContext(a, { ...options(root), production: {} }).find(c => c.id === 'creative-project').reason, 'stage-incomplete');
  });
  test('creativeContext 严格字段、维度与来源身份', () => {
    const root = fixture(), a = applied(root);
    for (const fn of [
      x => { x.creativeContext.extra = 1; }, x => { x.creativeContext.references.push(copy(x.creativeContext.references[0])); },
      x => { x.creativeContext.references.pop(); }, x => { x.creativeContext.references[0].sha256 = 'bad'; },
      x => { x.creativeContext.references[0].sha256 = [x.creativeContext.references[0].sha256]; },
      x => { x.creativeContext.references[0].sha256 = [[x.creativeContext.references[0].sha256]]; },
      x => { x.creativeContext.references[0].id = 'other'; }, x => { x.creativeContext.references[0].stage = 'setup'; },
      x => { x.creativeContext.references[0].path = 'not-allowed'; }, x => { x.creativeContext.overridePaths = [`${TARGET}.level`]; },
      x => { x.creativeContext.overridePaths = [TARGET, TARGET]; }, x => { x.creativeContext = null; },
    ]) {
      const b = copy(a); fn(b); assert.ok(blocking(inspectContext(b, options(root))).length); assert.throws(() => previewApplication(b, options(root)));
    }
    const result = inspectContext(a, options(root)); assert.ok(result.every(c => !Object.hasOwn(c, 'ok') && ['pass', 'fail', 'skipped'].includes(c.status)));
  });
  test('损坏历史本地来源仅提醒，不把提醒计为通过', () => {
    const root = fixture(), a = applied(root); fs.writeFileSync(located(root), 'broken');
    const checks = inspectContext(a, options(root)); const sources = checks.filter(c => c.category === 'source');
    assert.equal(sources.length, 1); assert.equal(sources[0].status, 'fail'); assert.equal(sources[0].reason, 'source-unverifiable'); assert.equal(blocking(checks).length, 0);
  });
  test('备份、临时写入与 rename 失败均保持原文件', () => {
    for (const step of ['backup', 'write', 'rename']) {
      const root = fixture(), file = fileDoc(root), bytes = fs.readFileSync(file), write = fs.writeFileSync, rename = fs.renameSync;
      try {
        fs.writeFileSync = function(target, ...args) { if (step === 'backup' && String(target).includes('.backup-') || step === 'write' && typeof target === 'number') throw new Error(`injected-${step}`); return write.call(this, target, ...args); };
        fs.renameSync = function(...args) { if (step === 'rename') throw new Error('injected-rename'); return rename.apply(this, args); };
        assert.throws(() => applyToFile(file, options(root, DENSE, { confirm: true })), /injected/);
      } finally { fs.writeFileSync = write; fs.renameSync = rename; }
      assert.deepEqual(fs.readFileSync(file), bytes); assert.equal(fs.readdirSync(root).some(n => n.includes('.tmp-')), false);
    }
  });
  test('写入前发现并发变化时不覆盖新内容', () => {
    const root = fixture(), file = fileDoc(root), write = fs.writeFileSync;
    const newer = JSON.stringify({ external: 'newer edit' });
    try {
      fs.writeFileSync = function(target, ...args) {
        const result = write.call(this, target, ...args);
        if (typeof target === 'number') write.call(this, file, newer);
        return result;
      };
      assert.throws(() => applyToFile(file, options(root, DENSE, { confirm: true })), /已变化/);
    } finally { fs.writeFileSync = write; }
    assert.equal(fs.readFileSync(file, 'utf8'), newer); assert.equal(fs.readdirSync(root).some(n => n.includes('.tmp-')), false);
  });
  test('拒绝符号链接产物及损坏输入', () => {
    const root = fixture(), file = fileDoc(root), link = path.join(root, 'link.json'); fs.symlinkSync(file, link);
    assert.throws(() => applyToFile(link, options(root))); fs.writeFileSync(file, '{bad'); assert.throws(() => applyToFile(file, options(root)));
  });
  test('统一 CLI 支持独立预览、确认与项目输入', () => {
    const root = fixture(), file = fileDoc(root), selection = path.join(root, 'selection.json'), production = path.join(root, 'production.json');
    writeJSON(selection, DENSE); writeJSON(production, { creative: { version: 1, selection: DENSE } });
    assert.equal(handleCreativeCommand(['validate'], options(root)), false);
    assert.equal(quiet(() => handleCreativeCommand(['profiles'], options(root))), true);
    assert.equal(runCLI(root, ['profile', '--selection', selection]).status, 0);
    assert.equal(runCLI(root, ['profile', '--production', production]).status, 0);
    const bytes = fs.readFileSync(file), p = runCLI(root, ['apply-profile', file, '--selection', selection]); assert.equal(p.status, 0, p.stderr); assert.equal(JSON.parse(p.stdout).applied, false); assert.deepEqual(fs.readFileSync(file), bytes);
    const result = runCLI(root, ['apply-profile', file, '--production', production, '--confirm']); assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).applied, true); assert.match(result.stderr, /尚未重新校验/);
  });
  test('CLI 错误退出非零，不把损坏 production 当缺失', () => {
    const root = fixture(), file = fileDoc(root), selection = path.join(root, 'selection.json'), production = path.join(root, 'production.json'); writeJSON(selection, DENSE); fs.writeFileSync(production, '{bad');
    for (const args of [
      ['apply-profile', file, '--production', production, '--confirm'], ['apply-profile', file, '--production', `${production}.missing`],
      ['apply-profile', file], ['apply-profile', file, '--selection', selection, '--production', production],
      ['profile', '--selection', selection, '--unknown'], ['profiles', 'extra'], ['profile', '--selection'],
      ['profile', '--selection', selection, '--selection', selection], ['apply-profile', file, 'extra', '--selection', selection],
      ['profile', '--selection', selection, '--confirm'],
    ]) { const r = runCLI(root, args); assert.notEqual(r.status, 0, args.join(' ')); }
    writeJSON(production, {}); assert.notEqual(runCLI(root, ['apply-profile', file, '--production', production]).status, 0);
    writeJSON(production, null); assert.notEqual(runCLI(root, ['apply-profile', file, '--production', production]).status, 0);
  });
  test('CLI 支持逐项决策与完整覆盖，未决项非零', () => {
    const root = fixture(), a = applied(root, DENSE, { overrides: { [TARGET]: off() } }), file = fileDoc(root, a), selection = path.join(root, 'selection.json'); writeJSON(selection, GRADUAL);
    assert.notEqual(runCLI(root, ['apply-profile', file, '--selection', selection, '--confirm']).status, 0);
    const decisions = path.join(root, 'decisions.json'); writeJSON(decisions, { [TARGET]: 'drop' });
    assert.equal(runCLI(root, ['apply-profile', file, '--selection', selection, '--decisions', decisions, '--confirm']).status, 0);
    const overrides = path.join(root, 'overrides.json'); writeJSON(overrides, { [TARGET]: copy(valid[KEY]) });
    assert.equal(runCLI(root, ['apply-profile', file, '--selection', selection, '--overrides', overrides, '--confirm']).status, 0);
  });
  if (!process.env.PROFILE_SELFTEST_ISOLATED) test('独立拷贝脚本、自有样例与 references 后全套运行', () => {
    const isolated = path.join(TEMP, 'standalone'); fs.mkdirSync(path.join(isolated, 'scripts/lib'), { recursive: true });
    fs.cpSync(path.join(ROOT, 'references'), path.join(isolated, 'references'), { recursive: true });
    fs.cpSync(path.join(ROOT, 'scripts'), path.join(isolated, 'scripts'), { recursive: true });
    fs.cpSync(path.join(ROOT, 'examples'), path.join(isolated, 'examples'), { recursive: true });
    const result = spawnSync(process.execPath, [path.join(isolated, 'scripts/profile-selftest.mjs')], { cwd: isolated, encoding: 'utf8', env: { ...process.env, PROFILE_SELFTEST_ISOLATED: '1' } });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
} finally { fs.rmSync(TEMP, { recursive: true, force: true }); }
console.log(`${STAGE} profile-selftest: ${count - failed}/${count} passed${process.env.PROFILE_SELFTEST_ISOLATED ? ' (isolated)' : ''}`);
if (failed) process.exitCode = 1;
