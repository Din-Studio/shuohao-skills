#!/usr/bin/env node
// 工作单流程回归：init → check → status → apply → export → videos。离线，不调用模型。
import assert from 'node:assert/strict';
import {cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import * as W from './lib/worksheet.mjs';
import {assembleFromWorksheets, listWorksheets, worksheetSyncProblem, seedFromScript, validateCreation} from './mint-creation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'creation-worksheet-'));
let count = 0;
const test = (name, fn) => { try { fn(); count++; console.log(`PASS ${name}`); } catch (e) { e.message = `${name}: ${e.message}`; throw e; } };
try {
  cpSync(join(root, 'examples'), join(temp, 'examples'), {recursive: true});
  const cwd = join(temp, 'examples/creation'), file = '收书人-creation.json';
  const cli = (...args) => spawnSync(process.execPath, [join(root, 'scripts/mint-creation.mjs'), ...args], {cwd, encoding: 'utf8'});
  const original = JSON.parse(readFileSync(join(cwd, file), 'utf8'));
  const sheetPath = id => join(cwd, id, 'prompt.md');
  const rewrite = (id, fn) => writeFileSync(sheetPath(id), fn(readFileSync(sheetPath(id), 'utf8')));
  // 审核方的动作：写好意见，再用本 skill 的本地等价命令登记结论（与审核方 skill 的 verdict 共用同一份规则）
  const review = (id, text) => { const s = W.parseWorksheet(readFileSync(sheetPath(id), 'utf8'));
    writeFileSync(sheetPath(id), W.serializeWorksheet({...s, meta: {...s.meta, status: 'in_review', round: Math.max(1, s.meta.round), bodyHash: '', inputHash: ''}, review: text})); };
  const structured = (conclusion, must = '', pending = '') => `# 视频提示词审核\n\n- 审核结论：${conclusion}\n\n## 返修意见\n\n${must}\n\n## 待确认事项\n\n${pending}`;
  const approve = id => { review(id, structured('通过')); const r = cli('prompts', 'verdict', file, 'approved', id); assert.equal(r.status, 0, r.stderr); };
  const staleIds = () => cli('prompts', 'status', file).stdout.split('\n').filter(l => l.startsWith('✗')).map(l => l.split(/\s+/)[1]);

  test('parse and serialize round trip; body below the last separator only', () => {
    const structure = {id: 'E01-01', sceneIndex: 1, cuts: [], images: []};
    const md = W.serializeWorksheet({meta: {segment: 'E01-01', status: 'draft', round: 0, model: 'MiniMax H3', promptLang: 'en'}, structure, review: '# 视频提示词审核\n\n- 审核结论：需返修\n\n## 返修意见\n\n- 质量｜镜头 1｜示例｜示例修订\n\n## 待确认事项', body: 'shots:\nbody'});
    const s = W.parseWorksheet(md);
    assert.deepEqual(s.problems, []); assert.equal(s.body, 'shots:\nbody'); assert.ok(!s.body.includes('返修'));
    assert.equal(W.reviewItems(s.review).must.length, 1);
    assert.equal(W.hashOf({sceneIndex: 1, id: 'E01-01', images: [], cuts: []}, 'shots:\nbody\n'), W.hashOf(structure, 'shots:\nbody'));
    assert.ok(W.parseWorksheet(md.replace('shots:\nbody', 'shots:\n\n---\n\nbody')).problems.some(p => /只允许一条分隔线/.test(p)));
    assert.ok(W.parseWorksheet('# E01-01\n\n---\nbody').problems.some(p => /状态头/.test(p)));
    assert.ok(W.parseWorksheet(md.replace('"sceneIndex": 1', '"sceneIndex": 1, "prompt": "x"')).problems.some(p => /不保存 prompt/.test(p)));
  });

  test('brief prints dispatch material straight from upstream', () => {
    const r = cli('prompts', 'brief', file, '--ep', '1'); assert.equal(r.status, 0, r.stderr);
    const b = JSON.parse(r.stdout);
    assert.equal(b.source, '收书人'); assert.equal(b.video.model, 'MiniMax H3'); assert.equal(b.promptLang, 'zh'); assert.equal(b.maxSegmentSeconds, 15);
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
    rewrite('E01-01', md => md.replace('安静、克制', '安静、克制、留白'));
    let r = cli('prompts', 'apply', file); assert.equal(r.status, 1); assert.match(r.stderr, /批准已失效/);
    approve('E01-01');
    r = cli('prompts', 'apply', file); assert.equal(r.status, 0, r.stderr);
    const applied = JSON.parse(readFileSync(join(cwd, file), 'utf8'));
    assert.match(applied.episodes[0].segments[0].prompt, /安静、克制、留白/);
    assert.deepEqual(applied.episodes[0].segments.slice(1), original.episodes[0].segments.slice(1));
    const sheetBefore = readFileSync(sheetPath('E01-01'), 'utf8');
    r = cli('export', file, '--out', '.'); assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(sheetPath('E01-01'), 'utf8'), sheetBefore, '导出不改写工作单');
    r = cli('videos', 'manifest.json', '--dry-run'); assert.equal(r.status, 0, r.stderr);
    const plan = JSON.parse(r.stdout); assert.equal(plan.jobs.length, 4);
    assert.match(plan.jobs[0].prompt, /^镜头参考：/); assert.ok(!plan.jobs[0].prompt.includes('审核意见'));
  });

  test('edits after approval block export and videos', () => {
    rewrite('E01-03', md => md.replace('氛围：', '氛围：雨夜，'));
    assert.equal(cli('export', file, '--out', '.').status, 1);
    const r = cli('videos', 'manifest.json', '--dry-run'); assert.equal(r.status, 1); assert.match(r.stderr, /批准已失效/);
    approve('E01-03');
    const stale = cli('export', file, '--out', '.'); assert.equal(stale.status, 1); assert.match(stale.stderr, /prompts apply/);
  });

  test('approval is bound to the inputs of its own segment only', () => {
    for (const id of ['E01-03']) approve(id);
    assert.equal(cli('prompts', 'apply', file).status, 0); assert.equal(cli('export', file, '--out', '.').status, 0);
    const manifest = JSON.parse(readFileSync(join(cwd, 'manifest.json'), 'utf8'));
    assert.equal(manifest.creation, file); assert.equal(manifest.segments[0].prompt, 'E01-01/prompt.md');
    // 与任何一段都无关的上游字段不影响批准
    const prodPath = join(temp, 'examples/production.json'), prod = readFileSync(prodPath, 'utf8');
    writeFileSync(prodPath, JSON.stringify({...JSON.parse(prod), note: '无关备注'}));
    assert.deepEqual(staleIds(), []); assert.equal(cli('videos', 'manifest.json', '--dry-run').status, 0);
    writeFileSync(prodPath, prod);
    // 设定图重新生成：只有挂载它的段失效
    const uses = new Map();
    for (const s of manifest.segments) for (const img of s.images) uses.set(img.path, [...(uses.get(img.path) ?? []), s.segment]);
    const [imagePath, users] = [...uses].sort((x, y) => x[1].length - y[1].length)[0];
    assert.ok(users.length < manifest.segments.length, '样例里至少有一张设定图不是每段都挂载');
    const image = join(cwd, imagePath), bytes = readFileSync(image);
    writeFileSync(image, Buffer.concat([bytes, Buffer.from('regenerated')]));
    assert.deepEqual(staleIds(), users);
    let r = cli('videos', 'manifest.json', '--dry-run', '--only', users[0]); assert.equal(r.status, 1); assert.match(r.stderr, /输入发生变化/);
    const untouched = manifest.segments.map(s => s.segment).find(id => !users.includes(id));
    assert.equal(cli('videos', 'manifest.json', '--dry-run', '--only', untouched).status, 0, '没有挂载这张图的段仍然可以进入计划');
    assert.equal(cli('export', file, '--out', '.').status, 1);
    writeFileSync(image, bytes); assert.deepEqual(staleIds(), []);
    // 剧本里一句台词被修改：只有认领这一拍的段失效
    const scriptPath = join(temp, 'examples/script/收书人-script.json'), scriptText = readFileSync(scriptPath, 'utf8');
    writeFileSync(scriptPath, scriptText.replace('还开着吗？我想卖一本书。', '还开着吗？我想买一本书。'));
    // 分镜的本段剧本还是旧台词：分镜没有通过检查，所有段都不能沿用批准
    assert.equal(staleIds().length, 4);
    r = cli('prompts', 'status', file); assert.equal(r.status, 1); assert.match(r.stdout + r.stderr, /分镜没有通过检查/);
    // script 阶段同步更新分镜之后，只有认领这一拍的段失效
    const boardPath = join(temp, 'examples/script/收书人-script-storyboard.md'), boardText = readFileSync(boardPath, 'utf8');
    writeFileSync(boardPath, boardText.replace('还开着吗？我想卖一本书。', '还开着吗？我想买一本书。'));
    assert.deepEqual(staleIds(), ['E01-01']);
    r = cli('videos', 'manifest.json', '--dry-run'); assert.equal(r.status, 1); assert.match(r.stderr, /E01-01.*输入发生变化/);
    writeFileSync(scriptPath, scriptText); writeFileSync(boardPath, boardText);
    // 只改某一段的分镜说明：只有这一段的批准失效
    writeFileSync(boardPath, boardText.replace('- 背景音乐：无', '- 背景音乐：极轻的钢琴单音，从周亦追问时进入，持续到段尾。'));
    assert.deepEqual(staleIds(), ['E01-03']);
    writeFileSync(boardPath, boardText);
    // 视频参数变化：全部失效
    writeFileSync(prodPath, prod.replace('768p', '2K')); assert.equal(staleIds().length, 4); writeFileSync(prodPath, prod);
    assert.deepEqual(staleIds(), []);
  });

  test('export to another directory references worksheets and images relative to the manifest', () => {
    const pack = join(temp, 'pack');
    let r = cli('export', file, '--out', pack); assert.equal(r.status, 0, r.stderr);
    const manifest = JSON.parse(readFileSync(join(pack, 'manifest.json'), 'utf8'));
    assert.equal(manifest.creation, `../examples/creation/${file}`); assert.equal(manifest.segments[0].prompt, '../examples/creation/E01-01/prompt.md');
    for (const s of manifest.segments) for (const img of s.images) assert.ok(existsSync(resolve(pack, img.path)), img.path);
    r = spawnSync(process.execPath, [join(root, 'scripts/mint-creation.mjs'), 'videos', join(pack, 'manifest.json'), '--dry-run'], {cwd: temp, encoding: 'utf8'});
    assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).jobs.length, 4);
  });

  test('verdict cannot be talked around; blocked pauses the loop until the writer responds', () => {
    const before = readFileSync(sheetPath('E01-04'), 'utf8');
    review('E01-04', structured('通过', '- 质量｜镜头 1｜台词被改写｜恢复原文台词'));
    let r = cli('prompts', 'verdict', file, 'approved', 'E01-04'); assert.equal(r.status, 1); assert.match(r.stderr, /不一致/);
    review('E01-04', structured('通过').replace('## 返修意见', '上一轮的问题仍然没有解决。\n\n## 返修意见'));
    r = cli('prompts', 'verdict', file, 'approved', 'E01-04'); assert.equal(r.status, 1); assert.match(r.stderr, /未归类/);
    review('E01-04', structured('通过') + '\n\n## 复审补充\n\n小标题之下的意见。');
    r = cli('prompts', 'verdict', file, 'approved', 'E01-04'); assert.equal(r.status, 1); assert.match(r.stderr, /多余的二级标题/);
    assert.match(readFileSync(sheetPath('E01-04'), 'utf8'), /小标题之下的意见/, '被拒绝的工作单原样保留，不丢内容');
    writeFileSync(sheetPath('E01-04'), before);
    review('E01-04', structured('待确认', '', '- 参考图｜设定图内容与剧本描述不符｜需要美术确认'));
    r = cli('prompts', 'verdict', file, 'changes_requested', 'E01-04'); assert.equal(r.status, 1);
    r = cli('prompts', 'verdict', file, 'blocked', 'E01-04'); assert.equal(r.status, 0, r.stderr);
    r = cli('prompts', 'status', file); assert.equal(r.status, 1); assert.match(r.stdout, /E01-04\s+blocked.*登记了阻塞/);
    assert.equal(cli('prompts', 'apply', file).status, 1); assert.equal(cli('videos', 'manifest.json', '--dry-run').status, 1);
    r = cli('prompts', 'submit', file); assert.equal(r.status, 1); assert.match(r.stderr, /编写回应/);
    rewrite('E01-04', md => md.replace('（无）', '- 参考图：美术确认设定图无误，剧本描述以设定图为准。'));
    r = cli('prompts', 'submit', file); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /E01-04 已提交审核/);
    assert.equal(W.parseWorksheet(readFileSync(sheetPath('E01-04'), 'utf8')).meta.status, 'in_review');
    assert.match(cli('prompts', 'submit', file).stdout, /没有需要提交/);
    approve('E01-04'); assert.equal(cli('prompts', 'status', file).status, 0);
  });

  test('new creates a blank draft with the effective model and refuses to overwrite', () => {
    let r = cli('prompts', 'new', file, 'E01-05', '--scene', '1'); assert.equal(r.status, 0, r.stderr);
    const s = W.parseWorksheet(readFileSync(sheetPath('E01-05'), 'utf8'));
    assert.deepEqual(s.problems, []); assert.equal(s.meta.status, 'draft'); assert.equal(s.meta.model, 'MiniMax H3'); assert.equal(s.meta.promptLang, 'zh');
    assert.equal(cli('prompts', 'new', file, 'E01-05').status, 1);
    assert.equal(cli('prompts', 'submit', file, 'E01-05').status, 1, '空白工作单过不了结构检查，不能提交');
    rmSync(join(cwd, 'E01-05'), {recursive: true});
  });

  test('seed skeleton plus writer-created worksheets assemble into a valid creation', () => {
    const ex = p => JSON.parse(readFileSync(join(root, 'examples', p), 'utf8'));
    const script = ex('script/收书人-script.json'), outline = ex('outline/收书人-outline.json');
    const seed = seedFromScript(script, null, {outline});
    const sheets = original.episodes[0].segments.map(seg => { const {prompt, ...structure} = seg;
      return {id: seg.id, sheet: W.parseWorksheet(W.serializeWorksheet({meta: {segment: seg.id, status: 'in_review', round: 1, model: 'MiniMax H3', promptLang: 'en'}, structure, body: prompt}))}; });
    const {doc, problems} = assembleFromWorksheets({...seed, promptLang: 'en'}, sheets, {});
    assert.deepEqual(problems, []); assert.ok(!('seedScenes' in doc.episodes[0]));
    assert.deepEqual(validateCreation(doc, {script, outline,cast:ex('characters/收书人-cast.json'),art:ex('art/收书人-art.json'),imageExists:()=>true}), []);
    assert.match(worksheetSyncProblem(doc.episodes[0].segments[0], sheets[0].sheet), /尚未批准/);
    const wrongModel = assembleFromWorksheets({...seed, video: {model: 'seedance2.0'}}, sheets, {});
    assert.ok(wrongModel.problems.some(p => /更换模型/.test(p)));
    assert.ok(assembleFromWorksheets(seed, [], {}).problems.some(p => /没有任何工作单/.test(p)));
  });

  console.log(`✓ ${count} 项工作单流程自测通过；离线`);
} finally { rmSync(temp, {recursive: true, force: true}); }
