#!/usr/bin/env node
// novel-creation 自测：不调模型、不花额度，只验确定性逻辑。
// 原则与仓库其余 skill 一致：每道质量门都要有击穿用例——
// 证明它真的会拦，不是一个永远为真的假测试。

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  promptFamilyOf,
  videoModelOf,
  DEFAULT_VIDEO_MODEL,
  TIMECODE_RE,
  CAMERA_MOVES,
  CREATION_TOKENS,
  DEFAULT_PARAMS,
  SHOT_SIZES,
  VIDEO_DURATION_BOUNDS,
  clampDuration,
  computeStats,
  exportPack,
  expandScript,
  gateReport,
  kindOfId,
  loadRecipes,
  parseCardFields,
  paramsOf,
  promptCutSlices,
  promptRemainder,
  recipeDrift,
  referenceImagePath,
  renderHtml,
  renderMarkdown,
  resolveReferenceImage,
  seedFromScript,
  segSeconds,
  slug,
  validateCreation,
  PRODUCTION_DEPTH,
  PRODUCTION_FILE,
  SKIP_PROD,
  brief,
  findProduction,
  promptLangOf,
  STAGE_DIR,
  stageDirNote,
} from './novel-creation.mjs';
import {
  BACKOFF_MS,
  CLI_NAME,
  DEFAULT_TIMEOUT_MS,
  LEDGER_FILE,
  backoffAt,
  buildInput,
  pickData,
  preflight,
  runBatch,
} from './lib/lingying.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const EX = join(here, '..', 'examples');
const OUTLINE = JSON.parse(readFileSync(join(EX, 'outline', '收书人-outline.json'), 'utf8'));
const CAST = JSON.parse(readFileSync(join(EX, 'characters', '收书人-cast.json'), 'utf8'));
const ART = JSON.parse(readFileSync(join(EX, 'art', '收书人-art.json'), 'utf8'));
const SCRIPT = JSON.parse(readFileSync(join(EX, 'script', '收书人-script.json'), 'utf8'));
const PRODUCTION = JSON.parse(readFileSync(join(EX, 'production.json'), 'utf8'));
const FIXTURE = JSON.parse(readFileSync(join(EX, 'creation', '收书人-creation.json'), 'utf8'));
const CTX = { script: SCRIPT, outline: OUTLINE, cast: CAST, art: ART };
/** 真实文件系统检查——参考图路径相对 examples/creation/ 解析，与真实工作目录约定一致。 */
const realImageExists = (rel) => existsSync(resolve(EX, 'creation', rel));
const CTX_IMG = { ...CTX, imageExists: realImageExists };
const CTX_IMG_P = { ...CTX_IMG, production: PRODUCTION };

let passed = 0;
function ok(cond, label) {
  assert.ok(cond, label);
  passed += 1;
}
function eq(actual, expected, label) {
  assert.equal(actual, expected, `${label} — 期望 ${expected}，实际 ${actual}`);
  passed += 1;
}
const clone = (x) => structuredClone(x);
const gate = (doc, id, ctx = CTX_IMG) => gateReport(doc, ctx).find((g) => g.id === id);

/* ---------------- 生产参数查找与产物落点 ---------------- */

eq(PRODUCTION_FILE, 'production.json', '文件名与仓库其余 skill 一致');
ok(PRODUCTION_DEPTH >= 3, '向上找的层数够穿过 <工作目录>/<段>/<子目录>');
eq(findProduction(here, 0), null, '本目录没有就找不到（层数 0）');
eq(STAGE_DIR, 'creation', '段目录名与工作目录约定一致');
{
  const prod = '/w/production.json';
  eq(stageDirNote('/w/creation/收书人-creation.json', prod), null, '落在自己的段目录里就不吭声');
  ok(stageDirNote('/w/收书人-creation.json', prod)?.includes('/w/creation'), '平铺在工作目录根要提示该去哪');
  ok(stageDirNote('/w/other/收书人-creation.json', prod), '串进别人的段目录也要提示');
  eq(stageDirNote('/w/收书人-creation.json', null), null, '没有 production.json 就无从判断，不猜');
  eq(stageDirNote(null, prod), null, '没有产物路径也不猜');
}
{
  eq(brief(['a', 'b']), 'a；b', '没超阈值就原样列');
  ok(brief(Array.from({ length: 20 }, (_, i) => `x${i}`)).endsWith('……等 20 处'), '超了只列前几条 + 总数');
}
{
  eq(promptLangOf({}), 'en', '默认英文——不是模型要求，是兼容面最广');
  eq(promptLangOf({ promptLang: 'zh' }), 'zh', '自己写了就跟自己的');
  eq(promptLangOf({}, { promptLang: 'zh' }), 'zh', '自己没写就继承生产参数');
  eq(promptLangOf({ promptLang: 'en' }, { promptLang: 'zh' }), 'en', '自己写了优先于生产参数');
}

/* ---------------- slug / paramsOf ---------------- */

eq(slug('陈叙'), '陈叙', '中文名保留');
eq(slug('a/b:c'), 'a-b-c', '危险字符替换');
eq(paramsOf({}).maxSegmentSeconds, DEFAULT_PARAMS.maxSegmentSeconds, '默认段上限 15 秒');
eq(paramsOf({ params: { maxCutSeconds: 4 } }).maxCutSeconds, 4, '分镜上限可调');

/* ---------------- 时长边界与折算 ---------------- */

eq(VIDEO_DURATION_BOUNDS['MiniMax H3'].min, 5, 'H3 下限 5 秒');
eq(VIDEO_DURATION_BOUNDS['MiniMax H3'].max, 15, 'H3 上限 15 秒');
{
  const r = clampDuration(7, 'MiniMax H3');
  eq(r.duration, 7, '区间内的整数秒原样通过');
  eq(r.note, '', '没有折算就没有备注');
}
{
  const r = clampDuration(12.5, 'MiniMax H3');
  eq(r.duration, 13, '非整数向上取整');
  ok(r.note.includes('向上取整'), '备注说明取整过程');
}
{
  const r = clampDuration(3, 'MiniMax H3');
  eq(r.duration, 5, '低于下限按下限下单');
  ok(r.note.includes('下限'), '备注点名下限');
}
{
  const r = clampDuration(20, 'MiniMax H3');
  eq(r.duration, 15, '超过上限按上限下单');
  ok(r.note.includes('本该再拆一次'), '备注提示这段该拆');
}
{
  const r = clampDuration(6.2, '未知模型');
  eq(r.duration, 7, '不在表里的模型只做取整，不夹区间');
  eq(r.note, '6.2 秒向上取整到 7 秒', '取整仍然生效');
}
{
  const r = clampDuration(0, 'MiniMax H3');
  eq(r.duration, null, '非正数折不出 duration');
}
eq(clampDuration(4, 'seedance2.5').duration, 4, 'seedance2.5 下限 4 秒');
eq(clampDuration(31, 'seedance2.5').duration, 30, 'seedance2.5 上限 30 秒');

/* ---------------- 提示词骨架：切片与引号剥离 ---------------- */

{
  const p = 'Picture 1 is X.\n\nshots:\n[Shot 1] aa\n[Shot 2] bb\n\nambience: x';
  const slices = promptCutSlices(p, 2);
  ok(slices[0].includes('aa') && !slices[0].includes('bb'), '[Shot k] 切片互不越界');
  ok(slices[1].includes('bb') && !slices[1].includes('x'), '切片不吃到 ambience 字段');
  eq(promptCutSlices(p, 3)[2], null, '找不到的镜头返回 null，不是报错');
  eq(promptCutSlices('没有 shots 字段', 1).length, 0, '没有骨架就是空数组');
}
{
  const zh = promptCutSlices('图 1 是 X。\n\n镜头描述：\n[镜头 1] aa\n[镜头 2] bb\n\n环境声与配乐：x', 2, 'zh');
  ok(zh[0].includes('aa') && zh[1].includes('bb'), 'zh 模式按 [镜头 k] 切片');
}
eq(promptRemainder('a "台词内容" b'), 'a   b', '引号内的文本被剥掉');
eq(promptRemainder('no quotes here'), 'no quotes here', '没有引号就原样返回');
eq(CREATION_TOKENS.en.pictureToken(2), 'Picture 2 is', '英文身份说明句式');
eq(CREATION_TOKENS.zh.pictureToken(2), '图 2 是', '中文身份说明句式');

/* ---------------- 剧本节拍展开（与 novel-storyboard 同规则） ---------------- */

const expanded = expandScript(SCRIPT);
eq(expanded.size, 1, '样例剧本只有 1 集');
const e1 = expanded.get(1);
eq(e1.scenes.length, 1, '第 1 集只有 1 场');
eq(e1.scenes[0].beats.length, 9, '这场戏共 9 拍');
eq(e1.scenes[0].beats[0].kind, 'action', '第 1 拍是动作');
eq(e1.scenes[0].beats[0].seconds, 2.5, '动作按 2.5 秒计');
eq(e1.scenes[0].beats[1].seconds, 2.7, '台词按字数/语速折算——12 字 / 4.5 字每秒');
eq(e1.scenes[0].beats[4].seconds, 2, '9 字台词折算 2 秒整');
eq(e1.scenes[0].beats[5].seconds, 3.1, '14 字台词折算 3.1 秒');
eq(e1.scenes[0].beats[1].speaker, 'C02', '台词带说话人');
eq(e1.targetSeconds, 30, '目标秒数带出来');
eq(expandScript(null).size, 0, '空剧本不崩');
eq(segSeconds({ cuts: [{ seconds: 3 }, { seconds: 4.5 }] }), 7.5, '段秒数 = 分镜求和');

/* ---------------- id → 名字、名字 → 参考图路径 ---------------- */

eq(kindOfId('C01'), 'character', 'C 开头是角色');
eq(kindOfId('S01'), 'scene', 'S 开头是场景');
eq(kindOfId('P01'), 'prop', 'P 开头是道具');
eq(referenceImagePath('character', '周亦'), '../characters/images/周亦-sheet.png', '角色参考图路径');
eq(referenceImagePath('scene', '深夜书铺'), '../art/images/深夜书铺-sheet.png', '场景参考图路径与道具同一个目录');
eq(referenceImagePath('prop', '旧诗集'), '../art/images/旧诗集-sheet.png', '道具参考图路径');
{
  const r = resolveReferenceImage('character', '周亦', join(EX, 'creation'));
  eq(r.path, '../characters/images/周亦-sheet.png', 'resolveReferenceImage 拼出同一条路径');
  eq(r.exists, true, '样例的真实文件确实存在');
  eq(resolveReferenceImage('character', '不存在的人', join(EX, 'creation')).exists, false, '不存在就是 false，不猜');
}

/* ---------------- 镜头配方卡库（与 novel-storyboard 逐字相同的解析器） ---------------- */

{
  const card = parseCardFields(`---\nid: demo\nname: 示例\ncuts: [2, 3]\nmust_phrases: [a, b]\n---\n正文`);
  eq(card.id, 'demo', '受限解析取到 id');
  eq(card.cuts.join(','), '2,3', '行内数组转数字');
  eq(parseCardFields('没有 frontmatter'), null, '没有 frontmatter 就不是卡片');
}
const CARDS = loadRecipes(join(here, '../references/test-fixtures/shot-recipes'));
eq(CARDS.size, 1, '最小卡片夹具一张');
ok(CARDS.get('insert-beat').must_phrases.includes('close-up'), '真实卡片的必备短语读得出来');
eq(loadRecipes(join(here, '../不存在的目录')).size, 0, '目录不存在不崩');

/* ---------------- 夹具本身：全绿基线 ---------------- */

eq(gateReport(FIXTURE, CTX_IMG_P).length, 17, '十七道门');
ok(gateReport(FIXTURE, CTX_IMG_P).every((g) => g.ok), '样例挂全部上游 + 生产参数全部门通过');
ok(gateReport(FIXTURE, CTX_IMG).every((g) => g.ok), '不挂生产参数（用默认 15 秒上限）同样通过');
eq(validateCreation(FIXTURE, CTX_IMG_P).length, 0, '样例通过结构 + 质量门校验');

/* ---------------- 填法按 production.json 的 video.model 分流 ---------------- */
// 骨架是模型无关的（这是本 skill 与 novel-storyboard 的分工），但两件事跟着模型走：
// 默认语言，以及 seedance 那条官方硬约束——提示词里一个精确时刻都不许有。

eq(promptFamilyOf('MiniMax H3'), 'h3', 'H3 归 h3 族');
eq(promptFamilyOf('seedance2.0 mini'), 'seedance', 'seedance 的档位变体同族');
eq(promptFamilyOf(undefined), 'h3', '没填模型按默认模型算');
eq(videoModelOf({}, null), DEFAULT_VIDEO_MODEL, '两处都没写就用默认模型');
eq(videoModelOf({}, { video: { model: 'seedance2.5' } }), 'seedance2.5', '模型从 production.json 继承');
eq(
  videoModelOf({ video: { model: 'MiniMax H3' } }, { video: { model: 'seedance2.5' } }),
  'MiniMax H3',
  'creation.json 自己写了就覆盖生产参数',
);
eq(promptLangOf({}, null, 'h3'), 'en', '非 seedance 默认英文——兼容面最广');
eq(promptLangOf({}, null, 'seedance'), 'zh', 'seedance 默认中文——官方指南通篇中文术语与中文案例');
eq(promptLangOf({ promptLang: 'en' }, null, 'seedance'), 'en', '自己写了 promptLang 就照写的来');
ok(TIMECODE_RE.test('[Shot 2] At 00:03.000,'), '时刻正则认得 H3 骨架的切点写法');
ok(!TIMECODE_RE.test('[Shot 2] wide shot, static shot — the door swings open'), '正常镜头行不会被误判成时刻');

{
  // 挂 H3：通用骨架没有附加约束，本门明说这一点，不假装查了什么
  const g = gateReport(FIXTURE, CTX_IMG_P).find((x) => x.id === 'prompt-model-fit');
  ok(g.ok, '挂 MiniMax H3 时本门通过');
  ok(g.detail.includes('没有附加约束'), 'H3 下明说通用骨架没有附加约束');
}
{
  // 挂 seedance：夹具本身不含时刻，照样全绿（promptLang 显式保持 en，只测这一道门）
  const doc = clone(FIXTURE);
  doc.video = { model: 'seedance2.0' };
  doc.promptLang = 'en';
  const g = gateReport(doc, CTX_IMG_P).find((x) => x.id === 'prompt-model-fit');
  ok(g.ok, '挂 seedance 时样例提示词本来就没有时刻，照样通过');
  ok(g.label.includes('seedance2.0'), '门 label 带上实际挂的模型名');
}
{
  // 从 novel-storyboard 那边搬提示词最容易带过来的东西就是切点时刻
  const doc = clone(FIXTURE);
  doc.video = { model: 'seedance2.0' };
  doc.promptLang = 'en';
  const seg = doc.episodes[0].segments[0];
  seg.prompt = seg.prompt.replace('[Shot 2]', '[Shot 2] At 00:03.000,');
  const g = gateReport(doc, CTX_IMG_P).find((x) => x.id === 'prompt-model-fit');
  ok(!g.ok, 'seedance 下提示词里写死时刻被拦');
  ok(g.detail.includes('00:03.000'), '点名是哪一处时刻');
  ok(gateReport(doc, CTX_IMG_P).find((x) => x.id === 'prompt-lang').ok, '同一份提示词的其余门不受影响');
}
{
  // 同一处时刻，挂回 H3 就不拦——这道门是真的按模型走的
  const doc = clone(FIXTURE);
  const seg = doc.episodes[0].segments[0];
  seg.prompt = seg.prompt.replace('[Shot 2]', '[Shot 2] At 00:03.000,');
  ok(gateReport(doc, CTX_IMG_P).find((x) => x.id === 'prompt-model-fit').ok, '挂 H3 时同一处时刻不拦');
}

{
  const stats = computeStats(FIXTURE, SCRIPT);
  eq(stats.totals.segments, 4, '样例四段');
  eq(stats.totals.cuts, 9, '样例九个分镜');
  eq(stats.totals.seconds, 30, '总秒数');
  eq(stats.totals.targetSeconds, 30, '目标秒数');
  eq(stats.dialogue.length, 3, '三句台词全部对到段和切');
  eq(stats.totals.withLines, 2, '两段带台词，其余是纯画面段');
  ok(stats.dialogue.every((d) => /^E01-\d{2}$/.test(d.segment) && d.cut >= 1), '对齐单带段号和切序');
}

/* ---------------- 不给上游：明说跳过，不静默 ---------------- */

{
  const gates = gateReport(FIXTURE, {});
  ok(gates.every((g) => g.ok), '不带任何上游也通过（对账门全部跳过视为通过）');
  ok(gates.find((g) => g.id === 'coverage').detail.includes('跳过'), 'script 缺失时 coverage 明说跳过');
  ok(gates.find((g) => g.id === 'dialogue-verbatim').detail.includes('跳过'), 'script 缺失时 dialogue-verbatim 明说跳过');
  ok(gates.find((g) => g.id === 'refimage-coverage').detail.includes('跳过'), '没给 outline/art 时 refimage-coverage 明说跳过');
  ok(gates.find((g) => g.id === 'prompt-no-names').detail.includes('跳过'), '没有 outline/cast 时 prompt-no-names 明说跳过');
}
{
  // 有 script 但没有 imageExists 注入：refimage-coverage 默认全 false，必须点名缺哪张
  const g = gate(FIXTURE, 'refimage-coverage', CTX);
  ok(!g.ok, '不注入 imageExists 时默认查不到文件，门必须失败——不能默认放行');
  ok(g.detail.includes('周亦') && g.detail.includes('期望'), '点名具体缺哪张、期望路径');
}

/* ---------------- 质量门逐项击穿 ---------------- */
// 每一道门都要证明它真的会拦

// coverage
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].cuts[0].beats = [2, 2];
  ok(!gate(d, 'coverage').ok, '第 1 拍没人认领被拦');
  ok(gate(d, 'coverage').detail.includes('没人认领'), '点名到拍');
}
{
  const d = clone(FIXTURE);
  d.episodes[0].segments = d.episodes[0].segments.filter((s) => s.id !== 'E01-02');
  d.episodes[0].segments.forEach((s, i) => { s.id = `E01-0${i + 1}`; });
  ok(!gate(d, 'coverage').ok, '整场缺一段的拍没人认领被拦');
}

// segment-cap（基础上限 + 挂载生产参数后的模型区间）
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].cuts[0].seconds = 15;
  const g = gate(d, 'segment-cap');
  ok(!g.ok, '段超 15 秒被拦');
  ok(g.detail.includes('E01-01'), '点名到段');
}
{
  const d = clone(FIXTURE);
  // E01-02 缩到 3 秒：基础门（≤15）过，但 H3 的时长下限是 5 秒
  d.episodes[0].segments[1].cuts[0].seconds = 1;
  d.episodes[0].segments[1].cuts[1].seconds = 2;
  d.episodes[0].segments[1].prompt = d.episodes[0].segments[1].prompt; // 秒数改动不影响本门文本核对
  const gBase = gate(d, 'segment-cap', CTX_IMG); // 不挂生产参数：3 秒 ≤ 15，过
  ok(gBase.ok, '不挂生产参数时只查上限，3 秒的段不拦');
  const gProd = gate(d, 'segment-cap', CTX_IMG_P); // 挂了生产参数：3 秒 < H3 下限 5 秒
  ok(!gProd.ok, '挂了生产参数后，段秒数低于该视频模型下限也被拦');
  ok(gProd.detail.includes('MiniMax H3') && gProd.detail.includes('时长区间'), '点名模型与区间');
}

// cut-length
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].cuts[0].seconds = 1;
  ok(!gate(d, 'cut-length').ok, '分镜短于 2 秒被拦');
}
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].cuts[0].seconds = 6;
  ok(!gate(d, 'cut-length').ok, '分镜超 5 秒被拦');
}

// dialogue-fit
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].cuts[1].seconds = 2; // 台词 2.7 秒装不进 2 秒的切
  const g = gate(d, 'dialogue-fit');
  ok(!g.ok, '台词装不进分镜秒数被拦');
  ok(g.detail.includes('E01-01#2'), '点名到切');
}

// ep-duration
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].cuts[0].seconds = 4;
  d.episodes[0].segments[0].cuts[1].seconds = 2; // 段从 7 秒缩到 6 秒，全集缩到 29 秒（未超 15%）
  ok(gate(d, 'ep-duration').ok, '小幅偏差在容差内不拦');
}
{
  const d = clone(FIXTURE);
  for (const seg of d.episodes[0].segments) for (const cut of seg.cuts) cut.seconds = 2; // 全部压到最短，总时长跌破 30*0.85=25.5
  const total = d.episodes[0].segments.reduce((n, s) => n + segSeconds(s), 0);
  ok(total < 25.5, '构造用例确实跌破容差下限');
  ok(!gate(d, 'ep-duration').ok, '总时长跌破容差下限被拦');
}

// crowd
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[2].cuts[0].characters = ['C01', 'C02', 'C01', 'C02'];
  ok(!gate(d, 'crowd').ok, '同框超过上限且没有拆解说明被拦');
  d.episodes[0].segments[2].note = '两人叠印，构图刻意压缩';
  ok(gate(d, 'crowd').ok, '带了拆解说明就放行');
}

// segment-id
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].id = 'E1-1';
  ok(!gate(d, 'segment-id').ok, '段号格式不对被拦');
}

// size-phrase / camera-phrase：都是逐切核对这一切自己的 [Shot k] 行
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].prompt = d.episodes[0].segments[0].prompt.replace('Wide shot, Tracking Shot', 'Tracking Shot');
  const g = gate(d, 'size-phrase');
  ok(!g.ok, '景别短语从 [Shot 1] 行里被删掉后拦');
  ok(g.detail.includes('E01-01#1'), '点名到切');
}
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].prompt = d.episodes[0].segments[0].prompt.replace('Wide shot, Tracking Shot', 'Wide shot');
  const g = gate(d, 'camera-phrase');
  ok(!g.ok, '运镜词从 [Shot 1] 行里被删掉后拦');
  ok(g.detail.includes('E01-01#1'), '点名到切');
}
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].cuts[0].camera = 'Not A Real Move';
  ok(!gate(d, 'camera-phrase').ok, '运镜不在词表里被拦');
}
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].cuts[0].size = 'not-a-size';
  ok(!gate(d, 'size-phrase').ok, '景别不在枚举里被拦');
}

// dialogue-verbatim：改一个字必被拦
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].prompt = d.episodes[0].segments[0].prompt.replace('还开着吗？我想卖一本书。', '还开着吗？我想卖一本旧书。');
  const g = gate(d, 'dialogue-verbatim');
  ok(!g.ok, '台词改一个字必被拦');
  ok(g.detail.includes('E01-01'), '点名到段');
}

// prompt-lang：默认英文，正文混入中文（引号外）被拦；promptLang=zh 时正文仍是英文也被拦
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].prompt += ' 这是一句中文';
  ok(!gate(d, 'prompt-lang').ok, '英文提示词正文混入中文被拦');
}
{
  const d = clone(FIXTURE);
  d.promptLang = 'zh';
  ok(!gate(d, 'prompt-lang').ok, '设定中文却仍是英文正文被拦');
}

// prompt-no-names：正文（引号外）不许出现角色名
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].prompt = d.episodes[0].segments[0].prompt.replace('the young man', '周亦');
  const g = gate(d, 'prompt-no-names');
  ok(!g.ok, '提示词正文出现角色名被拦');
  ok(g.detail.includes('周亦'), '点名是谁');
}
{
  // 引号内的台词本身不含人名，但换一句含别名的台词验证「只查引号外」逻辑仍然正确识别引号边界
  const d = clone(FIXTURE);
  ok(gate(d, 'prompt-no-names').ok, '原样样例没有违规');
}

// refs：cut 引用了剧本该场没有的人物
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].cuts[0].characters = ['C99'];
  ok(!gate(d, 'refs').ok, '引用剧本该场没有的人物被拦');
}
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].sceneIndex = 9;
  ok(!gate(d, 'refs').ok, 'sceneIndex 越界被拦');
}

// refimage-coverage：AC3——引用了不存在设定图的分镜必须点名缺哪张
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].cuts[0].characters = ['C02'];
  const fakeCtx = { ...CTX_IMG, imageExists: (rel) => !rel.includes('周亦') };
  const g = gate(d, 'refimage-coverage', fakeCtx);
  ok(!g.ok, '缺文件时门必须失败');
  ok(g.detail.includes('周亦') && g.detail.includes('../characters/images/周亦-sheet.png'), '点名身份 + 期望路径');
}
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].cuts[0].characters = ['C88'];
  d.episodes[0].segments[0].cuts[0].props = [];
  // 剧本该场没有 C88，refs 门会先拦；这里单独看 refimage-coverage 对「找不到名字」的措辞
  const ctxNoRefsCheck = { ...CTX_IMG, script: null }; // 去掉 script 依赖，只看 refimage-coverage 本身
  const g = gate(d, 'refimage-coverage', ctxNoRefsCheck);
  ok(!g.ok, '编号在 outline/art 里找不到名字也要拦');
  ok(g.detail.includes('C88') && g.detail.includes('找不到名字'), '措辞说明解不出路径的原因');
}

// refimage-labeled：images 数组长度与提示词身份说明句数量必须一致
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].images.push({ kind: 'prop', ref: 'P01', role: '多挂一张' });
  const g = gate(d, 'refimage-labeled');
  ok(!g.ok, '多挂一张但提示词没加身份说明句被拦');
  ok(g.detail.includes('缺'), '点名缺哪一句');
}
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].prompt = d.episodes[0].segments[0].prompt.replace('Picture 3 is', 'Picture 3 was');
  const g = gate(d, 'refimage-labeled');
  ok(!g.ok, '身份说明句被改得不再匹配固定句式也被拦');
}

// shot-recipe：可选挂载
{
  const g = gate(FIXTURE, 'shot-recipe');
  ok(g.ok, '没挂卡库本门通过');
  ok(g.detail.includes('跳过'), '跳过要明说，不静默');
}
{
  const shotsCtx = { ...CTX_IMG, recipes: CARDS };
  const g = gate(FIXTURE, 'shot-recipe', shotsCtx);
  ok(g.ok, '挂了卡库但全篇没引用配方也算通过');
  eq(g.detail, '本批分镜没有引用配方', '没引用同样明说，不静默');
}
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[3].cuts[1].recipe = 'insert-beat'; // close / Static Shot，卡片额外要求「insert」这个词
  d.episodes[0].segments[3].prompt = d.episodes[0].segments[3].prompt.replace(
    '[Shot 2] Close-up, Static Shot —',
    '[Shot 2] Close-up, Static Shot — insert,',
  );
  const shotsCtx = { ...CTX_IMG, recipes: CARDS };
  const g = gate(d, 'shot-recipe', shotsCtx);
  ok(g.ok, '合规引用（必备短语都在对应 [Shot k] 行里）通过');
}
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[3].cuts[1].recipe = 'no-such-card';
  const g = gate(d, 'shot-recipe', { ...CTX_IMG, recipes: CARDS });
  ok(!g.ok, '引用不存在的配方被拦');
  ok(g.detail.includes('E01-04#2'), '点名到段号#切序');
}
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[3].cuts[1].recipe = 'insert-beat';
  const g = gate(d, 'shot-recipe', { ...CTX_IMG, recipes: CARDS });
  ok(!g.ok, '必备短语没进对应 [Shot k] 行被拦');
  ok(g.detail.includes('插入特写'), '配方名带出来');
}

/* ---------------- validate 结构检查 ---------------- */

ok(validateCreation(null).length === 1, 'null 直接报');
ok(validateCreation({}).some((x) => x.includes('source')), '缺书名被拦');
ok(validateCreation({ source: 'x', episodes: [] }).some((x) => x.includes('episodes')), '空 episodes 被拦');
{
  const d = clone(FIXTURE);
  d.episodes[0].ep = 0;
  ok(validateCreation(d).some((x) => x.includes('正整数')), 'ep 不是正整数被拦');
}
{
  const d = clone(FIXTURE);
  d.episodes.push(clone(d.episodes[0]));
  ok(validateCreation(d).some((x) => x.includes('重复')), '集号重复被拦');
}
{
  const d = clone(FIXTURE);
  delete d.episodes[0].segments[0].id;
  ok(validateCreation(d).some((x) => x.includes('缺 id')), '段缺 id 被拦');
}
{
  const d = clone(FIXTURE);
  delete d.episodes[0].segments[0].sceneIndex;
  ok(validateCreation(d).some((x) => x.includes('sceneIndex')), '段缺 sceneIndex 被拦');
}
{
  const d = clone(FIXTURE);
  delete d.episodes[0].segments[0].prompt;
  ok(validateCreation(d).some((x) => x.includes('prompt')), '段缺 prompt 被拦');
}
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].images[0].kind = 'nope';
  ok(validateCreation(d).some((x) => x.includes('kind')), '参考图 kind 非法被拦');
}
{
  const d = clone(FIXTURE);
  delete d.episodes[0].segments[0].images[0].ref;
  ok(validateCreation(d).some((x) => x.includes('ref')), '参考图缺 ref 被拦');
}
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].cuts = [];
  ok(validateCreation(d).some((x) => x.includes('没有分镜')), '段没有分镜被拦');
}
{
  const d = clone(FIXTURE);
  delete d.episodes[0].segments[0].cuts[0].beats;
  ok(validateCreation(d).some((x) => x.includes('beats')), '分镜缺 beats 被拦');
}
{
  const d = clone(FIXTURE);
  delete d.episodes[0].segments[0].cuts[0].characters;
  ok(validateCreation(d).some((x) => x.includes('characters')), '分镜缺 characters 被拦');
}
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].cuts[0].seconds = 99; // 触发质量门
  ok(validateCreation(d, CTX_IMG_P).some((x) => x.includes('质量门未过')), '质量门未过也算进 validate 的违规清单');
}

/* ---------------- seedFromScript ---------------- */

{
  const seeded = seedFromScript(SCRIPT);
  eq(seeded.source, '收书人', 'seed 带书名');
  eq(seeded.episodes.length, 1, 'seed 输出全部集');
  eq(seeded.episodes[0].seedScenes.length, 1, 'seed 展开场次');
  eq(seeded.episodes[0].seedScenes[0].beats.length, 9, 'seed 展开节拍');
  eq(seeded.episodes[0].segments.length, 0, 'segments 留空——切镜是模型的活');
  eq(seedFromScript(SCRIPT, [2, 3]).episodes.length, 0, '--eps 范围过滤生效');
}

/* ---------------- exportPack ---------------- */

{
  const pack = exportPack(FIXTURE, SCRIPT, { resolveImage: () => ({ name: '', path: '', exists: false }) });
  eq(pack.manifest.length, 4, '四段投产包');
  ok(pack.missingTotal > 0, '不注入真实解析时全部标记缺失');
  eq(pack.files.find((f) => f.path === 'manifest.json').content.includes('"video": null'), true, '没有生产参数时 video 字段是 null');
}
{
  const n = { char: (id) => (id === 'C01' ? '陈叙' : '周亦'), scene: () => '深夜书铺', prop: () => '旧诗集' };
  const resolveImage = (kind, ref) => {
    const name = kind === 'character' ? n.char(ref) : kind === 'scene' ? n.scene(ref) : n.prop(ref);
    return { name, path: referenceImagePath(kind, name), exists: true };
  };
  const pack = exportPack(FIXTURE, SCRIPT, { resolveImage, dir: 'out', production: PRODUCTION });
  eq(pack.missingTotal, 0, '全部解析成功时缺失数为 0');
  eq(pack.files[0].path, 'out/E01-01/prompt.md', '带 --out 前缀落盘路径');
  ok(pack.files[0].content.includes('Picture 1 = 周亦'), 'prompt.md 头部列出参考图身份 + 相对路径');
  ok(pack.files[0].content.includes('---\n\nPicture 1 is'), 'prompt.md 分隔线以下是 prompt 原文，一个字不改');
  const manifestContent = JSON.parse(pack.files.find((f) => f.path === 'out/manifest.json').content);
  eq(manifestContent.video.model, 'MiniMax H3', 'manifest 顶层带生产参数的视频字段');
  eq(manifestContent.segments[0].images[0].path, '../characters/images/周亦-sheet.png', 'manifest 每段记参考图相对路径');
}
{
  const resolveImage = (kind, ref) => ({ name: ref, path: `x/${ref}.png`, exists: false });
  const pack = exportPack(FIXTURE, SCRIPT, { resolveImage });
  const seg1 = pack.manifest.find((s) => s.segment === 'E01-01');
  eq(seg1.missing.length, 3, '缺失的参考图路径逐条列在 missing 里');
}

/* ---------------- render markdown ---------------- */

{
  const md = renderMarkdown(FIXTURE, CTX_IMG);
  ok(md.startsWith('# 收书人 · 创作（第 1 集）'), 'MD 标题');
  ok(md.includes('## E01'), 'MD 有集标题');
  ok(md.includes('### E01-01'), 'MD 每段一节');
  ok(md.includes('参考图：Picture 1 = 周亦'), 'MD 段头列出参考图挂载');
  ok(md.includes('周亦：「还开着吗？我想卖一本书。」'), 'MD 分镜行带出台词摘要');
  ok(md.includes('```text'), 'MD 提示词进代码块');
  ok(md.includes('## 配音对齐单'), 'MD 有配音对齐单');
  ok(renderMarkdown(FIXTURE, { ...CTX_IMG, lang: 'en' }).includes('## Audio alignment'), '英文界面同样有对齐单，标题翻译');
}

/* ---------------- render html ---------------- */

{
  const html = renderHtml(FIXTURE, CTX_IMG);
  ok(html.startsWith('<!doctype html>'), 'HTML 完整文档');
  ok(!/<script\s+src=/.test(html), '不引外部脚本');
  ok(!/<link\s/.test(html), '不引外部样式');
  ok(!/@import|url\(https?:/.test(html), 'CSS 不拉外部资源');
  ok(html.includes('>创作<') || html.includes('创作 ·'), '中文界面显示「创作」');
  eq((html.match(/class="segcard"/g) || []).length, 4, '四张段卡');
  eq((html.match(/class="reftile"/g) || []).length, 10, '参考图条总数 = 每段 images 长度求和（3+2+2+3）');
  ok(html.includes('class="lightbox"'), '有图片弹层');
  ok(html.includes('>参考图挂载单<'), '有参考图挂载单区块');
  ok(html.includes('>配音对齐单<'), '有配音对齐单区块');
  ok(html.includes('>质量门<'), '有质量门区块');
  eq((html.match(/<li class="ok">/g) || []).length, 17, '十七道质量门全 ✓');
  ok(html.includes('gatepill pass'), '页眉徽章通过态');
  ok(!html.includes('class="reftile-ph"'), '真实文件都存在时不出现缺图占位');
}
{
  const html = renderHtml(FIXTURE, CTX); // 不注入 imageExists：真实文件系统检查全部返回 false
  ok(html.includes('class="reftile-ph"'), '没有真实文件系统检查时参考图显示占位，不猜、不骗');
  ok(html.includes('gatepill fail'), 'refimage-coverage 门失败时徽章变红');
}
{
  const html = renderHtml(FIXTURE, { ...CTX_IMG, lang: 'en' });
  ok(html.includes('lang="en"'), '英文报告 <html lang="en">');
  ok(html.includes('Export JSON'), '英文报告有 Export JSON');
  ok(html.includes('>Reference sheet mounts<'), '英文报告有参考图挂载单标题');
  ok(html.includes('>Quality gates<'), '英文报告有质量门标题');
  ok(!html.includes('参考图挂载单'), '英文报告不含中文标题');
}
{
  let threw = false;
  try { renderHtml(FIXTURE, { ...CTX_IMG, lang: 'jp' }); } catch { threw = true; }
  ok(threw, '非内置语言直接抛错（目前内置 zh / en）');
}
{
  // 导出：内嵌的就是 creation.json 原样
  const html = renderHtml(FIXTURE, CTX_IMG);
  ok(html.includes('<script type="application/json" id="creation-data">'), '数据内嵌');
  const embedded = html.match(/<script type="application\/json" id="creation-data">([\s\S]*?)<\/script>/)[1];
  const round = JSON.parse(embedded.replace(/\\u003c/g, '<'));
  eq(JSON.stringify(round), JSON.stringify(FIXTURE), '导出数据与 creation.json 逐字节一致');
}
{
  // XSS：数据是模型生成的，一律转义
  const d = clone(FIXTURE);
  d.source = '<img src=x onerror=alert(1)>';
  const evil = renderHtml(d, CTX_IMG);
  ok(!evil.includes('<img src=x onerror'), '剧名里的 HTML 被转义');
}
{
  const d = clone(FIXTURE);
  d.episodes[0].segments[0].note = '他说</script><script>alert(1)</script>了吗';
  const x = renderHtml(d, CTX_IMG).match(/id="creation-data">([\s\S]*?)<\/script>/)[1];
  ok(!x.includes('</script'), '数据块里的 </script 被转义');
}
ok(renderHtml(FIXTURE, CTX_IMG).includes('@media print'), '可打印');
ok(renderHtml(FIXTURE, CTX_IMG).includes('prefers-reduced-motion'), '尊重减少动效');

/* ---------------- lib/lingying.mjs：视频下单编排 ---------------- */

const TMP = mkdtempSync(join(tmpdir(), 'novel-creation-selftest-'));

function fakeCli(script) {
  const calls = [];
  const exec = async (bin, args) => {
    calls.push({ bin, args });
    return script(args, calls);
  };
  return { exec, calls };
}
function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}
const fakeFetch = async (url) => ({
  ok: true,
  arrayBuffer: async () => new TextEncoder().encode(`MP4-BYTES:${url}`).buffer,
});
const created = (calls) => calls.filter((c) => c.args[0] === 'video' && c.args[1] === 'create');
const inputOf = (call) => JSON.parse(call.args[call.args.indexOf('--input_data') + 1]);

eq(CLI_NAME, 'lingying', 'CLI 名字不变');
ok(backoffAt(0) < backoffAt(3), '轮询间隔逐步拉开');
eq(backoffAt(99), BACKOFF_MS[BACKOFF_MS.length - 1], '封顶，不会越等越久');
ok(BACKOFF_MS[0] >= 10_000, '起步至少 10 秒——视频比出图慢一个量级，不该用出图的 3 秒节奏敲网关');
ok(DEFAULT_TIMEOUT_MS >= 900_000, '默认超时至少 15 分钟，相对实测 196 秒留足余量');

const jobOf = (over = {}) => ({
  key: 'E01-01', name: 'E01-01', file: 'E01-01/video.mp4',
  prompt: 'He said "stop" — don\'t $PATH `rm -rf` 里面还有中文\n换行之后继续',
  duration: 7,
  images: [{ path: 'images/a.png' }, { path: 'images/b.png' }],
  ...over,
});

// 参数不经过 shell + duration/images 正确塞进 input_data
{
  const dir = join(TMP, 'shell');
  const { exec, calls } = fakeCli((args) => {
    if (args[0] === 'upload') return `https://assets/${args[1].split('/').pop()}`;
    if (args[0] === 'video') return JSON.stringify({ data: { task_id: 'T1' } });
    return JSON.stringify({ data: { status: 'success', result: { url: 'https://x/1.mp4' } } });
  });
  const clock = fakeClock();
  const { summary, results } = await runBatch([jobOf()], {
    bin: '/x/lingying', model: 'MiniMax H3', inputBase: { aspect_ratio: '9:16', resolution: '768p' },
    outDir: dir, exec, sleep: clock.sleep, now: clock.now, fetchImpl: fakeFetch,
  });
  eq(summary.ok, 1, '一段视频跑通');
  const input = inputOf(created(calls)[0]);
  eq(input.duration, 7, 'duration 原样进 input_data');
  eq(input.images.length, 2, '两张参考图都进了 images 数组');
  ok(input.images.every((u) => u.startsWith('https://assets/')), '本地路径都换成了 URL');
  ok(input.prompt.includes('$PATH'), '提示词里的美元符/反引号/中文全部原样抵达——参数不经过 shell');
  ok(existsSync(join(dir, 'E01-01', 'video.mp4')), '视频落到 render 找得到的路径');
  eq(results[0].bytes > 0, true, '落盘字节数带进汇报');
}

// 只读 data.status
{
  const dir = join(TMP, 'status');
  let polls = 0;
  const { exec } = fakeCli((args) => {
    if (args[0] === 'upload') return 'https://assets/a.png';
    if (args[0] === 'video') return JSON.stringify({ message: 'success', data: { task_id: 'T2' } });
    polls += 1;
    return polls < 3
      ? JSON.stringify({ message: 'success', data: { status: 'running' } })
      : JSON.stringify({ message: 'success', data: { status: 'success', result: { url: 'https://x/2.mp4' } } });
  });
  const clock = fakeClock();
  const { summary } = await runBatch([jobOf({ images: [{ path: 'images/a.png' }] })], {
    bin: '/x/lingying', model: 'm', outDir: dir, exec, sleep: clock.sleep, now: clock.now, fetchImpl: fakeFetch,
  });
  eq(polls, 3, '前两次 running 没有被 message: success 骗过去');
  eq(summary.ok, 1, '真的 success 之后才落盘');
}

// data.status 缺失是硬错误
{
  let threw = false;
  try { pickData(JSON.stringify({ message: 'success', data: {} }), ['data', 'status'], '轮询'); } catch { threw = true; }
  ok(threw, '响应里没有 data.status 就报错，不猜、不兜底');
}

// 超时：task_id 留在台账里，不阻断
{
  const dir = join(TMP, 'timeout');
  const { exec } = fakeCli((args) =>
    args[0] === 'upload' ? 'https://assets/a.png' :
    args[0] === 'video' ? JSON.stringify({ data: { task_id: 'T3' } }) : JSON.stringify({ data: { status: 'running' } }));
  const clock = fakeClock();
  const { summary, results } = await runBatch([jobOf({ images: [{ path: 'images/a.png' }] })], {
    bin: '/x/lingying', model: 'm', outDir: dir, exec, sleep: clock.sleep, now: clock.now,
    fetchImpl: fakeFetch, timeoutMs: 30_000,
  });
  eq(summary.timeout, 1, '到点收工，不是无限循环');
  ok(results[0].detail.includes('重跑'), '超时说法指向下一步动作');
  const ledger = JSON.parse(readFileSync(join(dir, LEDGER_FILE), 'utf8'));
  eq(ledger['E01-01'].taskId, 'T3', '超时的 task_id 留在台账里');
}

// 断点续传
{
  const dir = join(TMP, 'resume');
  const clock = fakeClock();
  const stall = fakeCli((args) =>
    args[0] === 'upload' ? 'https://assets/a.png' :
    args[0] === 'video' ? JSON.stringify({ data: { task_id: 'T4' } }) : JSON.stringify({ data: { status: 'running' } }));
  await runBatch([jobOf({ images: [{ path: 'images/a.png' }] })], {
    bin: '/x/lingying', model: 'm', outDir: dir, exec: stall.exec, sleep: clock.sleep, now: clock.now,
    fetchImpl: fakeFetch, timeoutMs: 20_000,
  });
  eq(created(stall.calls).length, 1, '第一轮提交了一次');

  const again = fakeCli((args) =>
    args[0] === 'upload' ? 'https://assets/a.png' :
    args[0] === 'video' ? JSON.stringify({ data: { task_id: 'T4-NEW' } }) : JSON.stringify({ data: { status: 'success', result: { url: 'https://x/4.mp4' } } }));
  const { summary } = await runBatch([jobOf({ images: [{ path: 'images/a.png' }] })], {
    bin: '/x/lingying', model: 'm', outDir: dir, exec: again.exec, sleep: clock.sleep, now: clock.now, fetchImpl: fakeFetch,
  });
  eq(created(again.calls).length, 0, '重跑没有重新提交——接着轮上次那个 task_id');
  eq(summary.ok, 1, '这次拿到了视频');
}

// 参考图整批去重上传：跨段共用的图只传一次
{
  const dir = join(TMP, 'dedup');
  const { exec, calls } = fakeCli((args) => {
    if (args[0] === 'upload') return `https://assets/${args[1].split('/').pop()}`;
    if (args[0] === 'video') return JSON.stringify({ data: { task_id: `T-${created(calls).length}` } });
    return JSON.stringify({ data: { status: 'success', result: { url: 'https://x/d.mp4' } } });
  });
  const clock = fakeClock();
  const jobs = [
    jobOf({ key: 'E01-01', name: 'E01-01', file: 'E01-01/video.mp4', images: [{ path: 'images/shared.png' }] }),
    jobOf({ key: 'E01-02', name: 'E01-02', file: 'E01-02/video.mp4', images: [{ path: 'images/shared.png' }] }),
  ];
  const { summary } = await runBatch(jobs, {
    bin: '/x/lingying', model: 'm', outDir: dir, exec, sleep: clock.sleep, now: clock.now, fetchImpl: fakeFetch, concurrency: 2,
  });
  eq(summary.ok, 2, '两段都出成');
  const uploads = calls.filter((c) => c.args[0] === 'upload');
  eq(uploads.length, 1, '同一张参考图被两段共用，只上传一次');
}

// 单段失败不阻断整批
{
  const dir = join(TMP, 'partial');
  const { exec } = fakeCli((args, calls) => {
    if (args[0] === 'upload') return 'https://assets/a.png';
    if (args[0] === 'video') {
      if (created(calls).length === 1) throw new Error('input validation failed: duration');
      return JSON.stringify({ data: { task_id: 'T7' } });
    }
    return JSON.stringify({ data: { status: 'success', result: { url: 'https://x/7.mp4' } } });
  });
  const clock = fakeClock();
  const jobs = [
    jobOf({ key: 'E01-01', name: 'E01-01', file: 'E01-01/video.mp4', images: [{ path: 'images/a.png' }] }),
    jobOf({ key: 'E01-02', name: 'E01-02', file: 'E01-02/video.mp4', images: [{ path: 'images/a.png' }] }),
  ];
  const { summary, results } = await runBatch(jobs, {
    bin: '/x/lingying', model: 'MiniMax H3', outDir: dir, exec, sleep: clock.sleep, now: clock.now,
    fetchImpl: fakeFetch, concurrency: 1,
  });
  eq(summary.failed, 1, '一段失败');
  eq(summary.ok, 1, '另一段照常出——批次内不阻断');
  ok(results.find((r) => r.status === 'failed').detail.includes('caps'), '枚举错要指向 novel-setup caps');
}

// 参考图上传失败：该段标记失败，不硬提交
{
  const dir = join(TMP, 'upload-fail');
  const { exec } = fakeCli((args) => {
    if (args[0] === 'upload') throw new Error('assethub 500');
    return JSON.stringify({ data: { task_id: 'never' } });
  });
  const clock = fakeClock();
  const { summary, results } = await runBatch([jobOf({ images: [{ path: 'images/bad.png' }] })], {
    bin: '/x/lingying', model: 'm', outDir: dir, exec, sleep: clock.sleep, now: clock.now, fetchImpl: fakeFetch,
  });
  eq(summary.failed, 1, '参考图传不上去，这段标记失败');
  ok(results[0].detail.includes('images/bad.png'), '点名是哪张参考图传不上去');
}

// 已有产物就跳过
{
  const dir = join(TMP, 'skip');
  const { exec, calls } = fakeCli(() => { throw new Error('不该被调用'); });
  const clock = fakeClock();
  const seg = 'E01-01';
  const dest = join(dir, seg, 'video.mp4');
  mkdirSync(join(dir, seg), { recursive: true });
  writeFileSync(dest, 'EXISTING');
  const { summary } = await runBatch([jobOf()], {
    bin: '/x/lingying', model: 'm', outDir: dir, exec, sleep: clock.sleep, now: clock.now, fetchImpl: fakeFetch,
  });
  eq(summary.skipped, 1, '已有产物默认跳过');
  eq(calls.length, 0, '跳过就是一次调用都不发——重跑不该重复花钱');
}

// dry-run：不提交，把将要发的参数摆出来（本地路径占位，不是真 URL）
{
  const dir = join(TMP, 'dry');
  const { exec, calls } = fakeCli(() => { throw new Error('不该被调用'); });
  const { summary, results } = await runBatch([jobOf()], {
    bin: '/x/lingying', model: 'm', inputBase: { resolution: '768p' }, outDir: dir, exec, dryRun: true,
  });
  eq(calls.length, 0, 'dry-run 一次都不提交');
  eq(summary.dryRun, 1, 'dry-run 单独计数');
  eq(results[0].inputData.images.length, 2, '要挂的参考图数量看得见');
  ok(results[0].detail.includes('2 张'), '标出会先 upload 换 URL');
}

// 凭证问题在提交之前一次说完（视频下单一定要 assethub token，不是可选）
{
  eq(preflight({ bin: null }).ok, false, '没装 CLI 就整步跳过');
  const home = join(TMP, 'home-empty');
  mkdirSync(join(home, '.config', CLI_NAME), { recursive: true });
  writeFileSync(join(home, '.config', CLI_NAME, 'config.json'), JSON.stringify({ api_key: 'k' }));
  const noToken = preflight({ bin: '/x/lingying', home });
  eq(noToken.ok, false, '视频下单一定要 assethub_admin_token，没有就不许提交');
  writeFileSync(join(home, '.config', CLI_NAME, 'config.json'), JSON.stringify({ api_key: 'k', assethub_admin_token: 't' }));
  eq(preflight({ bin: '/x/lingying', home }).ok, true, '两样都有才放行');
}

// buildInput：没有参考图时不塞 images 字段
{
  eq(buildInput({ prompt: 'p', duration: 5 }, {}, []).images, undefined, '空数组不塞 images 字段');
  eq(buildInput({ prompt: 'p', duration: 5 }, {}, ['u1', 'u2']).images.length, 2, '有 URL 就塞进 images');
}

rmSync(TMP, { recursive: true, force: true });

console.log(`✓ ${passed} 项自测全部通过`);
