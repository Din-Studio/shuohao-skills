#!/usr/bin/env node
// 自测：覆盖 novel-art.mjs 里所有确定性逻辑（场景 + 道具）。
// 不调用任何模型，不花额度，跑一次 < 1 秒。
//   node scripts/selftest.mjs

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANCHOR_RANGE,
  castNamesOf,
  gateReport,
  negativeTerms,
  renderHtml,
  renderMarkdown,
  seedFromOutline,
  slug,
  PROP_SCALES,
  validateArt,
  KNOWN_ASPECTS,
  PRODUCTION_DEPTH,
  PRODUCTION_FILE,
  brief,
  findProduction,
  langOf,
  SKIP_PROD,
  SKIP_STYLE,
  STAGE_DIR,
  stageDirNote,
  styleBlockOf,
  styleLabelOf,
  imageJobsFrom,
  AUTOPILOT_NOTE,
  autopilotOf,
} from './novel-art.mjs';
import {
  BACKOFF_MS,
  CLI_NAME,
  CUTOUT_MODEL,
  DEFAULT_ASPECT,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_RESOLUTION,
  LEDGER_FILE,
  backoffAt,
  cutout,
  pickData,
  preflight,
  runBatch,
} from './lib/lingying.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(readFileSync(join(here, '..', 'examples', '渡口-art.json'), 'utf8'));
const OUTLINE = JSON.parse(
  readFileSync(join(here, '..', '..', 'novel-outline', 'examples', '渡口-outline.json'), 'utf8'),
);
const CAST = JSON.parse(
  readFileSync(join(here, '..', '..', 'novel-characters', 'examples', '渡口-cast.json'), 'utf8'),
);

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed++;
}
function eq(actual, expected, msg) {
  assert.strictEqual(actual, expected, `${msg} — 期望 ${expected}，实际 ${actual}`);
  passed++;
}
const clone = () => JSON.parse(JSON.stringify(FIXTURE));
const gate = (d, id, names = null) => gateReport(d, names).find((g) => g.id === id);

/* ---------------- 画风：没有内置预设，只有从生产参数里读 ---------------- */
/*
 * 样例《渡口》是真人实拍，下面这一块就是用户在 novel-setup 那一段填的东西。
 * 它写在本 skill 自己的夹具里——本 skill 不 import 任何兄弟 skill 的代码。
 */

const SCENE_STYLE = {
  render:
    'Photorealistic live-action film environment, cinematic production design reference, real location realism with natural light and authentic materials, grounded architectural perspective, cinematic depth',
  surface:
    'Weathered, lived-in materials rendered with photorealistic fidelity: chipped paint, water stains, patina on metal, worn wood grain, dust in corners and light shafts; fabric and paper props show creases and age; nothing looks factory-new. Atmospheric depth with haze or volumetric light where the space allows',
  negative:
    'people, human figures, characters, crowds, silhouettes of people, plastic CG look, oversaturated colours, sterile showroom cleanliness, warped perspective, melted geometry, floating objects, text, watermark, signature',
  tags: ['photorealistic', 'live-action film environment', 'cinematic production design', 'weathered materials', 'cinematic'],
};
const STYLE = { label: { zh: '真人实拍', en: 'Photorealistic live-action' }, phrase: 'cinematic film still', scene: SCENE_STYLE };

eq(styleBlockOf(null), null, '没有生产参数就没有画风——不退回任何一档内置默认');
eq(styleBlockOf({}), null, '生产参数里没有 style 也是没有画风');
eq(styleBlockOf({ style: { scene: { render: '   ' } } }), null, '渲染句只有空白算没填');
eq(styleBlockOf({ style: STYLE }), SCENE_STYLE, '填了就原样给出来');
eq(styleLabelOf(null), '未填', '没有生产参数就说没填，不编一个名字出来');
eq(styleLabelOf({ style: STYLE }), '真人实拍', '中文界面取中文名');
eq(styleLabelOf({ style: STYLE }, 'en'), 'Photorealistic live-action', '英文界面取英文名');
eq(styleLabelOf({ style: { label: { zh: '水墨' } } }, 'en'), '水墨', '没写英文名就回落中文名');
eq(negativeTerms('a, people; 3d render').join('|'), 'people|3d render', '反向词按逗号分号拆，太短的丢掉');
ok(!/pore|subsurface/i.test(SCENE_STYLE.surface), '场景那一块不带皮肤毛孔——那是 style.character 的活');

/* ---------------- slug ---------------- */

eq(slug('渡船船舱'), '渡船船舱', '中文场景名保留');
eq(slug('军区总院·中医独立诊室'), '军区总院-中医独立诊室', '间隔号替换');
eq(slug('a/b:c'), 'a-b-c', '危险字符替换');

/* ---------------- seed ---------------- */

const seeded = seedFromOutline(OUTLINE);
eq(seeded.source, '渡口', 'seed 带书名');
eq(seeded.style, undefined, 'seed 不写画风——画风一处定死在 production.json，art.json 抄一份只会漂');
eq(seeded.scenes.length, 3, 'seed 搬全部场景');
{
  const s01 = seeded.scenes.find((s) => s.id === 'S01');
  eq(s01.usage.episodes.join(','), '1,2,3,4,5,6', 'seed 算出出现集');
  eq(s01.usage.beats.join(','), '悬念钩,身份揭破,反转,收束', 'seed 算出承载爽点');
  eq(s01.summary, '', '设计字段留给模型填');
  const s03 = seeded.scenes.find((s) => s.id === 'S03');
  ok(s03.seedNote?.includes('复用方案'), 'outline 的 reusePlan 变成 seedNote 提示做变体');
  ok(!seeded.scenes.find((s) => s.id === 'S01').seedNote, '没有复用方案的场景不带 seedNote');
}
{
  // 道具：大纲从 1.1.0 起带 props，seed 要吃到
  eq(seeded.props.length, OUTLINE.props.length, 'seed 搬全部道具');
  const p01 = seeded.props.find((pr) => pr.id === 'P01');
  const src = OUTLINE.props.find((pr) => pr.id === 'P01');
  eq(p01.name, src.name, '道具名从大纲搬过来');
  // 两边指的是同一件事：这件物件在戏里干什么，不是材质描述
  eq(p01.summary, src.function, '大纲的 function 落成这里的 summary');
  const epsWithP01 = OUTLINE.episodes.filter((e) => (e.propIds ?? []).includes('P01')).map((e) => e.ep);
  eq(p01.usage.episodes.join(','), epsWithP01.join(','), 'seed 算出道具的出现集');
  // beatIds 是 id，art 这边要的是爽点类型，seed 负责翻译
  eq(p01.usage.beats.join(','), src.beatIds.map((id) => OUTLINE.beats.find((b) => b.id === id).type).join(','),
    'beatIds 翻译成爽点类型');
  // 设计字段留给模型
  eq(p01.scale, '', '尺度留空——那是美术层的活');
  eq(p01.states.length, 0, '状态变体留空');
  eq(p01.image.prompt, '', '出图提示词留空');
  eq(p01.carriedBy.length, 0, '跟谁走留空');
}

// 旧大纲没有 props 字段：返回空数组，模型照 prop-pass.md 从原文提取，跟以前一样
{
  const noProps = JSON.parse(JSON.stringify(OUTLINE));
  delete noProps.props;
  const r = seedFromOutline(noProps);
  eq(r.props.length, 0, '旧大纲 seed 出空道具表，不是 undefined');
  ok(Array.isArray(r.props), '空道具表仍然是数组，调用方不用判空');
}

ok(seedFromOutline({}).scenes.length === 0, '空大纲不炸');
ok(seedFromOutline({}).props.length === 0, '空大纲的道具表也是空数组');

/* ---------------- castNamesOf ---------------- */

const NAMES = castNamesOf(CAST);
ok(NAMES.includes('沈知微') && NAMES.includes('老周'), 'cast 名字提出来了');
ok(NAMES.includes('老伯'), '别名也提出来了');
ok(castNamesOf({ characters: [] }).length === 0, '空 cast 不炸');

/* ---------------- 夹具本身 ---------------- */

eq(validateArt(FIXTURE, NAMES).length, 0, '自带样例通过校验（含角色名检查）');
ok(gateReport(FIXTURE, NAMES).every((g) => g.ok), '样例全部质量门通过');
eq(gateReport(FIXTURE).length, 12, '质量门共 12 道（场景 6 + 道具 4 + 生产参数 2）');

/* ---------------- 生产参数（production.json） ---------------- */

// 样例《渡口》是横屏真人实拍，参数照它配才是全绿基线
const PRODUCTION = {
  source: '渡口',
  style: STYLE,
  lang: 'zh',
  promptLang: 'en',
  image: {
    model: 'nanobanana2',
    asset: { resolution: '2K', aspectRatio: '16:9' },
  },
  video: { model: 'MiniMax H3', aspectRatio: '16:9', resolution: '768p' },
};
const pgate = (d, id, prod = PRODUCTION) => gateReport(d, NAMES, prod).find((g) => g.id === id);

eq(PRODUCTION_FILE, 'production.json', '文件名与 novel-setup 一致');
ok(PRODUCTION_DEPTH >= 3, '向上找的层数够穿过 <工作目录>/<段>/<子目录>');
eq(findProduction(here, 0), null, '本目录没有就找不到（层数 0）');
ok(gateReport(FIXTURE, NAMES, PRODUCTION).every((g) => g.ok), '样例挂上生产参数仍然全绿');

// 没挂载就明说跳过，不静默、不装查过
{
  const gates = gateReport(FIXTURE, NAMES);
  ok(gates.find((g) => g.id === 'style-match').detail.includes('跳过'), '没有生产参数时画风门明说跳过');
  ok(gates.find((g) => g.id === 'style-match').ok, '跳过视为通过——老项目照跑');
  ok(gates.find((g) => g.id === 'sheet-aspect').detail.includes('novel-setup'), '跳过时指路 /novel-setup');
  ok(gates.find((g) => g.id === 'sheet-aspect').ok, '跳过视为通过——老项目照跑');
}

// 挂上了参数但画风那一块没填：还是跳过，但两种跳过的原因不一样，说清楚
{
  const half = { ...PRODUCTION, style: { label: { zh: '还没定' }, phrase: '', scene: {} } };
  const g = pgate(FIXTURE, 'style-match', half);
  ok(g.ok, '画风没填就跳过，不是拦——填不填是 novel-setup 那一段的门');
  eq(g.detail, SKIP_STYLE, '跳过的原因是「没填」不是「没挂载」，两句话不一样');
  ok(g.detail.includes('novel-setup'), '指路回哪一段去填');
}

// sheet-aspect 击穿：资产图版面写死在 image.sheet 第一句里
{
  const portrait = { ...PRODUCTION, image: { ...PRODUCTION.image, asset: { resolution: '2K', aspectRatio: '9:16' } } };
  const g = pgate(FIXTURE, 'sheet-aspect', portrait);
  ok(!g.ok, '生产参数改成竖版资产图，而提示词还写 16:9——必须拦');
  ok(g.detail.includes('9:16') && g.detail.includes('16:9'), '两个画幅都点名');
}
{
  const d = clone();
  d.scenes[0].image.sheet = d.scenes[0].image.sheet.replace('16:9', '');
  ok(!pgate(d, 'sheet-aspect').ok, '设定图提示词漏掉画幅也击穿');
  ok(pgate(d, 'sheet-aspect').detail.includes('缺画幅'), '漏掉与写错分开报');
}
ok(KNOWN_ASPECTS.includes('16:9') && KNOWN_ASPECTS.includes('9:16'), '画幅词表覆盖横竖两种主流');
// 跳过语是英文报告的查表键，写死两处必然会漂——所以它是导出常量，这里盯住
{
  eq(gateReport(FIXTURE, NAMES).find((g) => g.id === 'sheet-aspect').detail, SKIP_PROD, '跳过语用的就是那个导出常量');
  const en = renderHtml(FIXTURE, 'en');
  ok(en.includes('no production.json found'), '英文报告把跳过语也翻译了，没漏成中文');
  ok(en.includes('Sheet layout aspect matches the production parameters'), '英文报告有画幅门的标签');
  ok(en.includes('Art style used as one whole block'), '英文报告有画风门的标签');
  ok(en.includes('Style: (unset)'), '没挂载生产参数时英文报告的画风行说的是「没填」，不编一个默认画风');
}
{
  const en = renderHtml(FIXTURE, 'en', PRODUCTION);
  ok(en.includes('Style: Photorealistic live-action'), '挂上生产参数后英文报告显示用户填的英文画风名');
  ok(renderHtml(FIXTURE, 'zh', PRODUCTION).includes('画风：真人实拍'), '中文报告显示中文画风名');
  ok(renderMarkdown(FIXTURE, 'zh', PRODUCTION).includes('> 画风：真人实拍'), 'Markdown 报告的画风行同样来自生产参数');
  ok(renderMarkdown(FIXTURE, 'zh', null).includes('> 画风：未填'), '没挂载就说没填');
}
{
  eq(brief(['a', 'b']), 'a；b', '没超阈值就原样列');
  ok(brief(Array.from({ length: 20 }, (_, i) => `x${i}`)).endsWith('……等 20 处'), '超了只列前几条 + 总数');
}

// 界面语言走继承不设门——它不产生任何浪费
{
  eq(langOf({}, null, { lang: 'en' }), 'en', '自己没写就跟生产参数');
  eq(langOf({ lang: 'zh' }, null, { lang: 'en' }), 'zh', 'art.json 顶层优先于生产参数');
  eq(langOf({ lang: 'zh' }, 'en', { lang: 'zh' }), 'en', '显式参数优先于一切');
  eq(langOf({}, null, null), 'zh', '都没有就默认中文');
  ok(renderHtml(FIXTURE, null, { lang: 'en' }).includes('lang="en"'), '报告界面跟着生产参数走');
  ok(renderMarkdown(FIXTURE, null, { lang: 'en' }).includes('## Scene list'), 'Markdown 同样继承');
}

/* ---------------- 质量门逐项击穿 ---------------- */
// 每一道门都要证明它真的会拦——不然就是永远为真的假测试

// G1 锚点 3–5
eq(ANCHOR_RANGE.join('-'), '3-5', '锚点范围 3–5');
{
  const d = clone();
  d.scenes[0].anchors = d.scenes[0].anchors.slice(0, 2);
  ok(!gate(d, 'anchors').ok, '锚点只有 2 个被拦');
  ok(gate(d, 'anchors').detail.includes('渡船船舱'), '报错点名场景');
}
{
  const d = clone();
  d.scenes[0].anchors = Array.from({ length: 6 }, (_, i) => ({ name: `锚${i}`, desc: 'x' }));
  ok(!gate(d, 'anchors').ok, '锚点 6 个也被拦——QC 核对不过来');
}

// G3 光照状态
{
  const d = clone();
  d.scenes[2].lighting = [];
  ok(!gate(d, 'lighting').ok, '没有光照状态被拦——换时段是重新生成不是重新打灯');
}

// G4 空景
{
  const d = clone();
  d.scenes[0].image.negativePrompt = 'plastic CG look, text, watermark';
  ok(!gate(d, 'no-people').ok, '反向提示词没禁人被拦——环境参考图必须空景');
}

// G5 提示词英文
{
  const d = clone();
  d.scenes[0].image.prompt = '一条老木船的客舱';
  ok(!gate(d, 'english').ok, '主提示词写中文被拦');
}
{
  const d = clone();
  d.scenes[0].lighting[0].prompt = '浓雾平光';
  ok(!gate(d, 'english').ok, '光照提示词写中文也被拦');
}

// G6 提示词不含角色名
{
  const d = clone();
  d.scenes[0].image.prompt += ' where 老周 stands';
  ok(!gate(d, 'no-names', NAMES).ok, '提示词里出现角色名被拦');
  ok(gate(d, 'no-names', NAMES).detail.includes('老周'), '报错点名是谁');
  ok(gate(d, 'no-names').ok, '没给 cast 时这道门跳过（视为通过）');
  ok(gate(d, 'no-names').detail.includes('跳过'), '跳过时明说，不装作查过');
}
{
  const d = clone();
  d.scenes[1].lighting[0].prompt += ' with 老伯 in frame';
  ok(!gate(d, 'no-names', NAMES).ok, '别名也拦（光照提示词同样查）');
}

// G7 变体引用
{
  const d = clone();
  d.scenes[2].variantOf = 'S99';
  ok(!gate(d, 'variants').ok, '指向不存在的母场景被拦');
}
{
  const d = clone();
  d.scenes[2].variantOf = 'S03';
  ok(!gate(d, 'variants').ok, '自己指自己被拦');
}
{
  const d = clone();
  delete d.scenes[2].changes;
  ok(!gate(d, 'variants').ok, '变体缺 changes 被拦——不说改了什么等于没说');
}

// G8 画风整块用上（要挂载生产参数才查得动——画风正文住在那里）
{
  const d = clone();
  d.scenes[0].image.sheet = 'ONE 16:9 landscape canvas, three zones, no people';
  ok(!pgate(d, 'style-match').ok, 'sheet 缺渲染句被拦——画风会飘');
}
{
  const d = clone();
  d.scenes[0].image.prompt = 'Interior of an old wooden ferry cabin, empty scene with no people';
  ok(!pgate(d, 'style-match').ok, 'prompt 缺渲染句被拦——设定表一个样、单张插画另一个样的两张皮');
}
{
  const d = clone();
  d.scenes[0].image.negativePrompt = d.scenes[0].image.negativePrompt.replace(', sterile showroom cleanliness', '');
  ok(!pgate(d, 'style-match').ok, '反向词少一条被拦——换风格是整套换');
  ok(pgate(d, 'style-match').detail.includes('sterile showroom cleanliness'), '点名少了哪一条');
}
{
  const d = clone();
  d.scenes[0].image.negativePrompt += ', lens flare, chromatic aberration';
  ok(pgate(d, 'style-match').ok, '场景自己额外加反向词不算漂——查的是有没有带全，不是有没有多写');
}
{
  // 道具的反向词不查全：道具参考图是纯白背景，画风里冲着「环境别太干净」去的那几条
  // 正好和白底自相矛盾。样例里的两件道具本来就没带 sterile showroom cleanliness
  const d = clone();
  ok(!/sterile showroom cleanliness/.test(d.props[0].image.negativePrompt), '样例道具确实没带那一条');
  ok(pgate(d, 'style-match').ok, '道具不查反向词是否带全——它另有禁人、禁手、纯白背景三道门');
}
{
  const d = clone();
  d.props[0].image.sheet = 'ONE 16:9 landscape canvas, white background, handheld scale';
  ok(!pgate(d, 'style-match').ok, '道具的渲染句照样要查——画风漂了道具也白出');
}
{
  // 换一档完全不同的画风：整块换掉之后，还写着上一档渲染句的产物必须被拦
  const inkStyle = {
    label: { zh: '水墨' },
    phrase: 'ink wash film still',
    scene: {
      render: 'Traditional Chinese ink wash painting of an environment, wet brush on xuan paper',
      surface: 'Large areas of blank paper, ink tone gradations from bone-dry drag to soaked pooling',
      negative: 'people, human figures, photorealistic, 3d render, saturated colour, text, watermark',
      tags: ['ink wash', 'xuan paper', 'monochrome'],
    },
  };
  const g = pgate(clone(), 'style-match', { ...PRODUCTION, style: inkStyle });
  ok(!g.ok, '产物还是上一档画风，换成水墨后整批被拦——画风没有内置类型，写什么查什么');
  ok(g.label.includes('水墨'), '门的标签点名现在这部剧定的是哪一档画风');
}

/* ---------------- validate 结构检查 ---------------- */

ok(validateArt(null).length === 1, 'null 直接报');
ok(validateArt({}).some((x) => x.includes('source')), '缺书名被拦');
ok(validateArt({ source: 'x', style: 'realistic' }).some((x) => x.includes('style')), '顶层还留着 style 字段被拦——画风一处定死在 production.json，两个来源必漂');
ok(!validateArt({ source: 'x' }).some((x) => x.includes('style')), '不写 style 才是对的');
{
  const d = clone();
  d.scenes[0].id = 'X1';
  ok(validateArt(d).some((x) => x.includes('S01 这种格式')), '场景 id 格式被拦');
}
{
  const d = clone();
  d.scenes[1].id = 'S01';
  ok(validateArt(d).some((x) => x.includes('重复')), '场景 id 重复被拦');
}
{
  const d = clone();
  d.scenes[0].summary = ' ';
  ok(validateArt(d).some((x) => x.includes('summary')), '缺设计意图被拦');
}
{
  const d = clone();
  delete d.scenes[0].primary;
  ok(validateArt(d).some((x) => x.includes('primary')), '缺主场景标记被拦');
}
{
  const d = clone();
  d.scenes[0].anchors[0] = { name: '只有名字' };
  ok(validateArt(d).some((x) => x.includes('锚点缺')), '锚点缺描述被拦');
}
{
  const d = clone();
  d.scenes[0].lighting[0] = { state: '夜戏' };
  ok(validateArt(d).some((x) => x.includes('夜戏')), '光照缺提示词被拦且点名状态');
}
{
  const d = clone();
  delete d.scenes[0].image.sheet;
  ok(validateArt(d).some((x) => x.includes('image.sheet')), '缺设定图提示词被拦');
}
{
  const d = clone();
  d.scenes[0].usage = { episodes: 'not-array', beats: [] };
  ok(validateArt(d).some((x) => x.includes('usage.episodes')), 'usage 结构错被拦');
}

/* ---------------- render markdown ---------------- */

const md = renderMarkdown(FIXTURE);
ok(md.startsWith('# 渡口 · 美术设定集'), 'MD 标题');
ok(md.includes('## 场景清单'), 'MD 有场景清单');
ok(md.includes('变体 ← S02'), 'MD 清单标出变体来源');
ok(md.includes('## S01 渡船船舱'), 'MD 每场景一节');
ok(md.includes('一致性锚点'), 'MD 有锚点');
ok(md.includes('**补丁船篷**'), 'MD 锚点带名字');
ok(!md.includes('定机位'), 'MD 不再有定机位库——AI 生产的空间锚在参考图不在文字');
ok(md.includes('光照与时段'), 'MD 有光照状态');
ok(md.includes('```text'), 'MD 提示词进代码块');

/* ---------------- render html ---------------- */

const html = renderHtml(FIXTURE);
ok(html.startsWith('<!doctype html>'), 'HTML 完整文档');
ok(!/<script\s+src=/.test(html), '不引外部脚本');
ok(!/<link\s/.test(html), '不引外部样式');
ok(!/@import|url\(https?:/.test(html), 'CSS 不拉外部资源');
ok(/<script\s+src=/.test('<script src="x.js">'), '外部脚本检测正则有效');

eq((html.match(/class="kpi[ "]/g) || []).length, 4, 'KPI 带 4 张卡（场景/道具/锚点/光照）');
ok(html.includes('主场景 2 · 变体 1'), 'KPI 场景卡带分类');
ok(html.includes('叙事道具'), 'KPI 有叙事道具卡');
eq((html.match(/class="scene" /g) || []).length, 5, '5 张设定卡（3 场景 + 2 道具）');
ok(html.includes('>场景清单<') && html.includes('>场景设定卡<') && html.includes('>道具清单<') && html.includes('>道具设定卡<') && html.includes('>质量门<'), '五个区块都在');
ok(html.indexOf('>场景设定卡<') < html.indexOf('>道具清单<') && html.indexOf('>道具设定卡<') < html.indexOf('>质量门<'), '道具在场景后、质量门前');
ok(html.indexOf('>场景清单<') < html.indexOf('>场景设定卡<'), '清单在卡片前');
eq((html.match(/class="anchors"/g) || []).length, 5, '每张卡有锚点列表（3 场景 + 2 道具）');
ok(html.includes('变体来源：<b>S02</b>'), '变体卡标母场景');
ok(html.includes('plate-empty'), '没出图时有占位');
ok(html.includes('class="cards"'), '设定卡一排两张的网格');
ok(/\.cards\{[^}]*grid-template-columns:1fr 1fr/.test(html), '两列布局');
// 点图弹层
ok(html.includes('class="lightbox"'), '有图片弹层');
ok(/closeLb\(\)/.test(html), '弹层能关闭');
ok(/e\.key === 'Escape'/.test(html), 'Esc 关闭弹层');
{
  const d = clone();
  d.scenes[0].sheetImage = 'images/x-sheet.png';
  const withImg = renderHtml(d);
  ok(withImg.includes('class="zoom" data-src="images/x-sheet.png"'), '出图后图片可点，弹层拿到地址');
  ok(withImg.includes('cursor:zoom-in'), '鼠标提示可放大');
}
eq((html.match(/<li class="ok">/g) || []).length, 12, '12 道质量门全 ✓');
ok(html.includes('gatepill pass'), '页眉徽章通过态');
ok(html.includes('未提供 cast.json'), '报告如实标注角色名检查被跳过');

// 质量门失败也要渲染
{
  const d = clone();
  d.scenes[0].anchors = [];
  const bad = renderHtml(d);
  ok(bad.includes('gatepill fail'), '失败时页眉徽章变红');
  ok(bad.includes('class="galert"'), '失败时弹病灶横幅');
  ok(bad.includes('<li class="bad">'), '未过的门标 ✗');
}

// 导出：内嵌的就是 art.json 原样
ok(html.includes('<script type="application/json" id="art-data">'), '数据内嵌');
ok(html.includes('data-name="渡口-art.json"'), '下载文件名跟书名（art.json）');
{
  const embedded = html.match(/<script type="application\/json" id="art-data">([\s\S]*?)<\/script>/)[1];
  const round = JSON.parse(embedded.replace(/\\u003c/g, '<'));
  eq(JSON.stringify(round), JSON.stringify(FIXTURE), '导出数据与 art.json 逐字节一致');
  eq(validateArt(round, NAMES).length, 0, '导出数据能直接喂回 validate');
}
ok(html.includes('revokeObjectURL(url), 10000'), 'blob 延后回收——Safari 抢跑会存出空文件');

// XSS：数据是模型生成的，一律转义
{
  const d = clone();
  d.scenes[0].name = '<img src=x onerror=alert(1)>';
  d.scenes[0].anchors[0].desc = '<b>粗体</b>';
  const evil = renderHtml(d);
  ok(!evil.includes('<img src=x'), '场景名里的 HTML 被转义');
  ok(!evil.includes('<b>粗体</b>'), '锚点描述里的 HTML 被转义');
}
// </script 会截断内嵌数据块
{
  const d = clone();
  d.scenes[0].summary = '他说</script><script>alert(1)</script>了吗';
  const x = renderHtml(d).match(/id="art-data">([\s\S]*?)<\/script>/)[1];
  ok(!x.includes('</script'), '数据块里的 </script 被转义');
  eq(JSON.parse(x.replace(/\\u003c/g, '<')).scenes[0].summary, d.scenes[0].summary, '转义了但内容没丢');
}

ok(html.includes('@media print'), '可打印');
ok(html.includes('prefers-reduced-motion'), '尊重减少动效');
ok(/@media print\{[\s\S]*\.pr p\{display:block!important/.test(html), '打印时提示词全展开');
ok(html.includes('参考图一律无人'), '页脚写明无人原则（道具另加无手白底）');

/* ---------------- 道具（叙事道具层）---------------- */

eq(Object.keys(PROP_SCALES).join(','), '手持级,桌面级,家具级', '尺度三档');
eq(FIXTURE.props.length, 2, '样例带两件叙事道具');

// 道具四道门逐项击穿
{
  const d = clone();
  d.props[0].states = [];
  ok(!gate(d, 'prop-states').ok, '道具没有状态被拦——合上和打开是两张参考');
}
{
  const d = clone();
  d.props[0].scale = '巨型';
  ok(!gate(d, 'prop-scale').ok, '未知尺度被拦');
}
{
  const d = clone();
  d.props[0].image.prompt = d.props[0].image.prompt.replace('handheld scale', 'nice size');
  ok(!gate(d, 'prop-scale').ok, '提示词缺尺度短语被拦——AI 会把手持道具画成家具');
  ok(gate(d, 'prop-scale').detail.includes('handheld scale'), '报错点名缺哪个短语');
}
{
  const d = clone();
  d.props[1].image.negativePrompt = 'people, plastic CG look, text';
  ok(!gate(d, 'prop-hands').ok, '反向提示词没禁手被拦——拿着道具的手是最常见污染');
}
{
  const d = clone();
  d.props[0].image.sheet = d.props[0].image.sheet.replace(/pure white background/gi, 'soft grey backdrop');
  ok(!gate(d, 'prop-white').ok, '设定图不是白底被拦——道具图要能抠');
}
// 共用门也覆盖道具
{
  const d = clone();
  d.props[0].anchors = d.props[0].anchors.slice(0, 1);
  ok(!gate(d, 'anchors').ok, '道具锚点不足也被锚点门拦');
}
{
  const d = clone();
  d.props[0].states[0].prompt = '合上的皮箱';
  ok(!gate(d, 'english').ok, '道具状态提示词写中文被英文门拦');
}
{
  const d = clone();
  d.props[0].image.prompt += ' carried by 沈知微';
  ok(!gate(d, 'no-names', NAMES).ok, '道具提示词出现角色名被拦');
}
// 道具没有光照门的义务
{
  const d = clone();
  ok(gate(d, 'lighting').ok, '道具不查光照——那是场景的门');
}
// 结构检查
{
  const d = clone();
  d.props[0].id = 'X1';
  ok(validateArt(d).some((x) => x.includes('P01 这种格式')), '道具 id 格式被拦');
}
{
  const d = clone();
  d.props[1].id = 'P01';
  ok(validateArt(d).some((x) => x.includes('道具 id P01 重复')), '道具 id 重复被拦');
}
{
  const d = clone();
  d.props[0].relatedScenes = ['S99'];
  ok(validateArt(d).some((x) => x.includes('S99 不存在')), '道具关联不存在的场景被拦');
}
{
  const d = clone();
  d.props[0].states[0] = { state: '合上' };
  ok(validateArt(d).some((x) => x.includes('合上')), '状态缺提示词被拦且点名');
}
// 无道具的文档：道具门放行、报告不渲染道具区块
{
  const d = clone();
  delete d.props;
  eq(validateArt(d, NAMES).length, 0, '没有道具块也合法——道具是可选层');
  ok(gateReport(d).filter((g) => g.id.startsWith('prop-')).every((g) => g.ok), '无道具时四道道具门放行');
  ok(!renderHtml(d).includes('>道具清单<'), '无道具时报告不渲染道具区块');
}
// 渲染
{
  ok(md.includes('## 道具清单'), 'MD 有道具清单');
  ok(md.includes('## P01 旧皮箱'), 'MD 每件道具一节');
  ok(md.includes('状态变体'), 'MD 有状态变体');
  ok(html.includes('>P01<') || html.includes('P01'), 'HTML 道具卡有 ID');
  ok(html.includes('手持级'), 'HTML 道具卡带尺度徽章');
  ok(html.includes('关联场景：<b>S01</b>'), 'HTML 道具卡带关联场景');
}

/* ---------------- render 英文界面（--lang en）---------------- */

{
  const en = renderHtml(FIXTURE, 'en');
  ok(en.includes('lang="en"'), '英文报告 <html lang="en">');
  ok(en.includes('Export JSON'), '英文报告有 Export JSON');
  ok(en.includes('>Scene list<'), '英文报告有 Scene list');
  ok(en.includes('>Quality gates<'), '英文报告有 Quality gates 区块');
  ok(en.includes('Consistency anchors'), '英文报告有 Consistency anchors');
  ok(!en.includes('导出 JSON'), '英文报告不含「导出 JSON」');
  ok(!en.includes('场景清单'), '英文报告不含「场景清单」');
  ok(!en.includes('质量门'), '英文报告不含「质量门」（门的中文 label 属于质量门层，不在界面表里）');
  ok(html.includes('lang="zh"'), '默认报告仍是 <html lang="zh">');
  ok(renderMarkdown(FIXTURE, 'en').includes('## Scene list'), 'MD 英文界面有 Scene list');
}
{
  const d = clone();
  d.lang = 'en';
  ok(renderHtml(d).includes('lang="en"'), 'art.json 顶层 lang 字段生效');
  ok(renderHtml(d, 'zh').includes('lang="zh"'), '--lang 优先于 lang 字段');
}
{
  let threw = false;
  try { renderHtml(FIXTURE, 'jp'); } catch { threw = true; }
  ok(threw, '非内置语言直接抛错（目前内置 zh / en）');
}

// 质量门面板是报告的一部分：英文界面下门标签也要翻译（阈值由门自己算，原样保留）
{
  const gateEn = renderHtml(FIXTURE, 'en');
  ok(gateEn.includes('Consistency anchors, 3–5'), 'EN 报告的质量门标签翻译且阈值原样保留');
  ok(!gateEn.includes('一致性锚点 3–5 个'), 'EN 报告不再出现中文门标签');
}
/* ---------------- 产物落点 ---------------- */

eq(STAGE_DIR, 'art', '段目录名与端到端工作目录约定一致');
{
  const prod = '/w/production.json';
  eq(stageDirNote('/w/art/渡口-art.json', prod), null, '落在自己的段目录里就不吭声');
  ok(stageDirNote('/w/渡口-art.json', prod)?.includes('/w/art'), '平铺在工作目录根要提示该去哪');
  ok(stageDirNote('/w/other/渡口-art.json', prod), '串进别人的段目录也要提示');
  ok(stageDirNote('/w/art/sub/渡口-art.json', prod), '段目录下再套一层同样提示——报告按相对路径找图，多一层图就全丢');
  eq(stageDirNote('/w/渡口-art.json', null), null, '没有 production.json 就无从判断，不猜');
  eq(stageDirNote(null, prod), null, '没有产物路径也不猜');
}

/* ---------------- 出图任务：从文档搬运 ---------------- */

{
  const { model, inputBase, jobs, problems } = imageJobsFrom(FIXTURE);
  eq(problems.length, 0, '自带样例能直接排出出图任务');
  eq(model, DEFAULT_IMAGE_MODEL, '没有生产参数就用兜底模型');
  eq(inputBase.aspect_ratio, DEFAULT_ASPECT, '没有生产参数就用兜底画幅');
  eq(inputBase.resolution, DEFAULT_RESOLUTION, '没有生产参数就用兜底档位');
  eq(jobs.length, FIXTURE.scenes.length + FIXTURE.props.length, '场景与道具各一张图');
  eq(jobs[0].prompt, FIXTURE.scenes[0].image.sheet, '提示词取 image.sheet，不是 image.prompt');
  eq(jobs[0].negativePrompt, FIXTURE.scenes[0].image.negativePrompt, '反向词单独带上');
  eq(jobs[0].file, `images/${slug(FIXTURE.scenes[0].name)}-sheet.png`, '产物路径与 render 找图的路径同一个算法');

  const variant = jobs.find((j) => j.key === 'S03');
  eq(variant.refFrom, 'S02', '变体认出母场景——参考图挂谁不该让模型每次重想');
  const prop = jobs.find((j) => j.kind === 'prop');
  ok(prop.cutoutFile.endsWith('-cutout.png'), '道具带抠图产物路径，跟白底图分开存');
}

// 生产参数在就以它为准——三个值原样进 input_data，不折算像素
{
  const prod = { image: { model: 'seedream4', asset: { resolution: '4K', aspectRatio: '4:3' } } };
  const { model, inputBase } = imageJobsFrom(FIXTURE, prod);
  eq(model, 'seedream4', '模型取 production.json 的 image.model');
  eq(inputBase.resolution, '4K', '档位是枚举值，原样带上');
  eq(inputBase.aspect_ratio, '4:3', '画幅是枚举值，原样带上');
}

// 提交之前就要拦下的三类问题
{
  const d = clone();
  d.scenes[0].image.sheet = '';
  ok(imageJobsFrom(d).problems.some((x) => x.includes('image.sheet')), '提示词空着不许提交——白花钱');

  const d2 = clone();
  d2.scenes[0].variantOf = 'S99';
  ok(imageJobsFrom(d2).problems.some((x) => x.includes('S99')), '变体指向不存在的母场景，提交前就报');

  const d3 = clone();
  d3.scenes[1].name = d3.scenes[0].name;
  ok(imageJobsFrom(d3).problems.some((x) => x.includes('同一个文件名')), '两个名字算出同一个文件名，后出的会盖掉先出的');
}

/* ---------------- 出图任务：调用封装 ---------------- */

const TMP = mkdtempSync(join(tmpdir(), 'novel-art-selftest-'));

/** 假 CLI：收 (bin, args) 数组，永远不经过 shell——被测的正是这一点。 */
function fakeCli(script) {
  const calls = [];
  const exec = async (bin, args) => {
    calls.push({ bin, args });
    return script(args, calls);
  };
  return { exec, calls };
}
/** 假时钟：sleep 直接推进，超时用例不用真等 5 分钟。 */
function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}
const fakeFetch = async (url) => ({
  ok: true,
  arrayBuffer: async () => new TextEncoder().encode(`PNG-BYTES:${url}`).buffer,
});
const created = (calls) => calls.filter((c) => c.args[0] === 'image' && c.args[1] === 'create');
const inputOf = (call) => JSON.parse(call.args[call.args.indexOf('--input_data') + 1]);

// 提示词里塞满历来把 bash 拼崩的字符：双引号、单引号、换行、$、反引号、中文
const NASTY = `He said "stop" — don't $PATH \`rm -rf\` 里面还有中文
换行之后继续`;
const jobOf = (over = {}) => ({
  key: 'S01', kind: 'scene', name: '船舱', file: 'images/船舱-sheet.png',
  prompt: NASTY, negativePrompt: 'people, hands', refFrom: null, ...over,
});

// 参数不经过 shell：提示词原样抵达，JSON 能完整 parse 回来
{
  const dir = join(TMP, 'shell');
  const { exec, calls } = fakeCli((args) => {
    if (args[0] === 'image') return JSON.stringify({ message: 'success', data: { task_id: 'T1' } });
    return JSON.stringify({ message: 'success', data: { status: 'success', result: { url: 'https://x/1.png' } } });
  });
  const clock = fakeClock();
  const { summary, results } = await runBatch([jobOf()], {
    bin: '/x/lingying', model: 'nanobanana2', inputBase: { resolution: '2K', aspect_ratio: '16:9' },
    outDir: dir, exec, sleep: clock.sleep, now: clock.now, fetchImpl: fakeFetch,
  });
  eq(summary.ok, 1, '一张图跑通');
  const input = inputOf(created(calls)[0]);
  eq(input.prompt, NASTY, '引号换行美元符反引号中文全部原样抵达——参数不经过 shell');
  eq(input.negative_prompt, 'people, hands', 'negative_prompt 是独立字段，不塞回正向提示词');
  eq(input.resolution, '2K', '档位原样进 input_data');
  ok(existsSync(join(dir, 'images', '船舱-sheet.png')), '图落到 render 找得到的路径');
  ok(!existsSync(join(dir, 'images', '船舱-sheet.png.part')), '.part 中间文件已改名，不会被当成成品');
  eq(results[0].bytes > 0, true, '落盘字节数带进汇报');
}

// 只读 data.status：响应里的 message: success 恒为 success，粗糙匹配会假命中
{
  const dir = join(TMP, 'status');
  let polls = 0;
  const { exec } = fakeCli((args) => {
    if (args[0] === 'image') return JSON.stringify({ message: 'success', data: { task_id: 'T2' } });
    polls += 1;
    // 头两次任务还在跑，但整段 JSON 里就有 "success" 这个词
    return polls < 3
      ? JSON.stringify({ message: 'success', data: { status: 'running' } })
      : JSON.stringify({ message: 'success', data: { status: 'success', result: { url: 'https://x/2.png' } } });
  });
  const clock = fakeClock();
  const { summary } = await runBatch([jobOf()], {
    bin: '/x/lingying', model: 'm', outDir: dir, exec, sleep: clock.sleep, now: clock.now, fetchImpl: fakeFetch,
  });
  eq(polls, 3, '前两次 running 没有被 message: success 骗过去');
  eq(summary.ok, 1, '真的 success 之后才落盘');
}

// data.status 缺失是硬错误，不当成「还没好」一直轮询到超时
{
  let threw = false;
  try { pickData(JSON.stringify({ message: 'success', data: {} }), ['data', 'status'], '轮询'); } catch { threw = true; }
  ok(threw, '响应里没有 data.status 就报错，不猜、不兜底');
}

// 超时有硬上限：到点标记 timeout，任务留在台账里等下次接着轮
{
  const dir = join(TMP, 'timeout');
  const { exec } = fakeCli((args) =>
    args[0] === 'image'
      ? JSON.stringify({ data: { task_id: 'T3' } })
      : JSON.stringify({ data: { status: 'running' } }));
  const clock = fakeClock();
  const { summary, results } = await runBatch([jobOf()], {
    bin: '/x/lingying', model: 'm', outDir: dir, exec, sleep: clock.sleep, now: clock.now,
    fetchImpl: fakeFetch, timeoutMs: 30_000,
  });
  eq(summary.timeout, 1, '到点收工，不是无限 while 循环');
  ok(results[0].detail.includes('重跑'), '超时的说法要指向下一步动作，不是一句失败');
  const ledger = JSON.parse(readFileSync(join(dir, LEDGER_FILE), 'utf8'));
  eq(ledger.S01.taskId, 'T3', '超时的 task_id 留在台账里——任务多半还在网关那边跑');
}

// 断点续传：重跑接着轮询上次的任务，不重复提交也不重复花钱
{
  const dir = join(TMP, 'resume');
  const clock = fakeClock();
  const stall = fakeCli((args) =>
    args[0] === 'image' ? JSON.stringify({ data: { task_id: 'T4' } }) : JSON.stringify({ data: { status: 'running' } }));
  await runBatch([jobOf()], {
    bin: '/x/lingying', model: 'm', outDir: dir, exec: stall.exec, sleep: clock.sleep, now: clock.now,
    fetchImpl: fakeFetch, timeoutMs: 20_000,
  });
  eq(created(stall.calls).length, 1, '第一轮提交了一次');

  const again = fakeCli((args) =>
    args[0] === 'image'
      ? JSON.stringify({ data: { task_id: 'T4-NEW' } })
      : JSON.stringify({ data: { status: 'success', result: { url: 'https://x/4.png' } } }));
  const { summary } = await runBatch([jobOf()], {
    bin: '/x/lingying', model: 'm', outDir: dir, exec: again.exec, sleep: clock.sleep, now: clock.now, fetchImpl: fakeFetch,
  });
  eq(created(again.calls).length, 0, '重跑没有重新提交——接着轮上次那个 task_id');
  eq(again.calls[0].args[2], 'T4', '轮的正是台账里那个任务');
  eq(summary.ok, 1, '这次拿到了图');
  ok(!existsSync(join(dir, LEDGER_FILE)) || !JSON.parse(readFileSync(join(dir, LEDGER_FILE), 'utf8')).S01,
    '图落地后台账里这条就消了——产物本身才是完成的凭据');
}

// 台账跟产物住同一格——段目录根只住交付物
{
  const dir = join(TMP, 'ledger-dir');
  const { exec } = fakeCli((args) =>
    args[0] === 'image' ? JSON.stringify({ data: { task_id: 'TL' } }) : JSON.stringify({ data: { status: 'running' } }));
  const clock = fakeClock();
  await runBatch([jobOf()], {
    bin: '/x/lingying', model: 'm', outDir: dir, ledgerDir: join(dir, 'images'),
    exec, sleep: clock.sleep, now: clock.now, fetchImpl: fakeFetch, timeoutMs: 10_000,
  });
  ok(existsSync(join(dir, 'images', LEDGER_FILE)), '台账落在 images/ 里，跟跑完可删的东西放一起');
  ok(!existsSync(join(dir, LEDGER_FILE)), '段目录根不留点文件——那一格只住三件交付物');
}

// 已有产物就跳过：一次 CLI 调用都不发
{
  const dir = join(TMP, 'skip');
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(dir, 'images', '船舱-sheet.png'), 'EXISTING');
  const { exec, calls } = fakeCli(() => { throw new Error('不该被调用'); });
  const clock = fakeClock();
  const { summary } = await runBatch([jobOf()], {
    bin: '/x/lingying', model: 'm', outDir: dir, exec, sleep: clock.sleep, now: clock.now, fetchImpl: fakeFetch,
  });
  eq(summary.skipped, 1, '已有产物默认跳过');
  eq(calls.length, 0, '跳过就是一次都不提交——重跑不该重复花钱');

  const forced = fakeCli((args) =>
    args[0] === 'image'
      ? JSON.stringify({ data: { task_id: 'T5' } })
      : JSON.stringify({ data: { status: 'success', result: { url: 'https://x/5.png' } } }));
  const r2 = await runBatch([jobOf()], {
    bin: '/x/lingying', model: 'm', outDir: dir, exec: forced.exec, sleep: clock.sleep, now: clock.now,
    fetchImpl: fakeFetch, force: true,
  });
  eq(r2.summary.ok, 1, '--force 才重出');
}

// 变体分波次：母场景先落盘，再 upload 成 URL 挂给变体
{
  const dir = join(TMP, 'variant');
  const { exec, calls } = fakeCli((args) => {
    if (args[0] === 'upload') return 'https://assets/mother.png';
    if (args[0] === 'image') return JSON.stringify({ data: { task_id: `T-${created(calls).length}` } });
    return JSON.stringify({ data: { status: 'success', result: { url: 'https://x/v.png' } } });
  });
  const clock = fakeClock();
  const jobs = [
    jobOf({ key: 'S03', name: '芦苇滩', file: 'images/芦苇滩-sheet.png', refFrom: 'S02' }),
    jobOf({ key: 'S02', name: '栈桥', file: 'images/栈桥-sheet.png' }),
  ];
  const { summary, results } = await runBatch(jobs, {
    bin: '/x/lingying', model: 'm', outDir: dir, exec, sleep: clock.sleep, now: clock.now, fetchImpl: fakeFetch,
  });
  eq(summary.ok, 2, '母场景与变体都出来了');
  const upIdx = calls.findIndex((c) => c.args[0] === 'upload');
  ok(upIdx > 0, '先出母场景再 upload——次序由代码保证，不靠模型记着');
  const variantInput = inputOf(created(calls).find((c) => inputOf(c).images));
  eq(variantInput.images[0], 'https://assets/mother.png', '变体挂上了母场景的成图当参考图');
  eq(results.find((r) => r.key === 'S03').status, 'ok', '变体这张成了');
}

// 母场景没出成，变体就明说挂不上，不是静默出一张不一致的图
{
  const dir = join(TMP, 'variant-orphan');
  const { exec } = fakeCli((args) =>
    args[0] === 'image' ? JSON.stringify({ data: { task_id: 'T9' } }) : JSON.stringify({ data: { status: 'failed' } }));
  const clock = fakeClock();
  const jobs = [
    jobOf({ key: 'S02', name: '栈桥', file: 'images/栈桥-sheet.png' }),
    jobOf({ key: 'S03', name: '芦苇滩', file: 'images/芦苇滩-sheet.png', refFrom: 'S02' }),
  ];
  const { results } = await runBatch(jobs, {
    bin: '/x/lingying', model: 'm', outDir: dir, exec, sleep: clock.sleep, now: clock.now, fetchImpl: fakeFetch,
  });
  const v = results.find((r) => r.key === 'S03');
  eq(v.status, 'failed', '母场景没成图，变体不硬出');
  ok(v.detail.includes('母场景'), '失败原因指向该先做什么');
}

// 一张失败不阻断整批；枚举错的提交失败要指向 caps
{
  const dir = join(TMP, 'partial');
  const { exec } = fakeCli((args, calls) => {
    if (args[0] === 'image') {
      if (created(calls).length === 1) throw new Error('input validation failed: resolution');
      return JSON.stringify({ data: { task_id: 'T7' } });
    }
    return JSON.stringify({ data: { status: 'success', result: { url: 'https://x/7.png' } } });
  });
  const clock = fakeClock();
  const jobs = [jobOf(), jobOf({ key: 'S02', name: '栈桥', file: 'images/栈桥-sheet.png' })];
  const { summary, results } = await runBatch(jobs, {
    bin: '/x/lingying', model: 'nanobanana2', outDir: dir, exec, sleep: clock.sleep, now: clock.now,
    fetchImpl: fakeFetch, concurrency: 1,
  });
  eq(summary.failed, 1, '一张失败');
  eq(summary.ok, 1, '另一张照常出——批次内不阻断');
  ok(results.find((r) => r.status === 'failed').detail.includes('caps'), '枚举错要指向 novel-setup caps，别让人去猜');
}

// 网关抖动容错：task get 偶尔失败不判死，连续失败才算
{
  const dir = join(TMP, 'flaky');
  let polls = 0;
  const { exec } = fakeCli((args) => {
    if (args[0] === 'image') return JSON.stringify({ data: { task_id: 'T8' } });
    polls += 1;
    if (polls === 1) throw new Error('connection reset');
    return JSON.stringify({ data: { status: 'success', result: { url: 'https://x/8.png' } } });
  });
  const clock = fakeClock();
  const { summary } = await runBatch([jobOf()], {
    bin: '/x/lingying', model: 'm', outDir: dir, exec, sleep: clock.sleep, now: clock.now, fetchImpl: fakeFetch,
  });
  eq(summary.ok, 1, '一次抖动不该让整张图判死');
}

// dry-run：不提交，把将要发的参数摆出来
{
  const dir = join(TMP, 'dry');
  const { exec, calls } = fakeCli(() => { throw new Error('不该被调用'); });
  const { summary, results } = await runBatch([jobOf({ refFrom: 'S02' })], {
    bin: '/x/lingying', model: 'm', inputBase: { resolution: '2K' }, outDir: dir, exec, dryRun: true,
  });
  eq(calls.length, 0, 'dry-run 一次都不提交');
  eq(summary.dryRun, 1, 'dry-run 单独计数');
  eq(results[0].inputData.prompt, NASTY, '要发什么参数一眼看得见');
  ok(results[0].detail.includes('S02'), '变体的参考图在 dry-run 阶段标出来');
}

// 退避是拉开的，不是固定 3 秒空转
{
  ok(backoffAt(0) < backoffAt(3), '轮询间隔逐步拉开');
  eq(backoffAt(99), BACKOFF_MS[BACKOFF_MS.length - 1], '封顶，不会越等越久');
}

// 凭证问题在提交之前一次说完
{
  eq(preflight({ bin: null }).ok, false, '没装 CLI 就整步跳过，不假装能出图');
  const home = join(TMP, 'home-empty');
  mkdirSync(join(home, '.config', CLI_NAME), { recursive: true });
  writeFileSync(join(home, '.config', CLI_NAME, 'config.json'), JSON.stringify({}));
  const noKey = preflight({ bin: '/x/lingying', home });
  eq(noKey.ok, false, '没有 api_key 提交必然 401——提交前就说');
  writeFileSync(join(home, '.config', CLI_NAME, 'config.json'), JSON.stringify({ api_key: 'k' }));
  eq(preflight({ bin: '/x/lingying', home }).ok, true, '有 api_key 就能出图');
  eq(preflight({ bin: '/x/lingying', home, needUpload: true }).ok, false, '挂参考图与抠图另要 assethub_admin_token');
}

// 道具抠图：白底图出完再走一次，另存文件名
{
  const dir = join(TMP, 'cutout');
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(dir, 'images', '皮箱-sheet.png'), 'WHITE-BG');
  const { exec, calls } = fakeCli((args) => {
    if (args[0] === 'upload') return 'https://assets/prop.png';
    if (args[0] === 'image') return JSON.stringify({ data: { task_id: 'C1' } });
    return JSON.stringify({ data: { status: 'success', result: { url: 'https://x/cut.png' } } });
  });
  const clock = fakeClock();
  const out = await cutout(
    [{ key: 'P01', name: '皮箱', file: 'images/皮箱-sheet.png', cutoutFile: 'images/皮箱-sheet-cutout.png' }],
    { bin: '/x/lingying', outDir: dir, exec, sleep: clock.sleep, now: clock.now, fetchImpl: fakeFetch },
  );
  eq(out[0].status, 'ok', '抠图跑通');
  eq(created(calls)[0].args[3], CUTOUT_MODEL, '抠图走的是抠图模型，不是生图模型');
  ok(existsSync(join(dir, 'images', '皮箱-sheet-cutout.png')), '抠图另存，render 找的仍然是原来的白底图');
}

rmSync(TMP, { recursive: true, force: true });

/* ---------------- 自动驾驶（autopilot） ---------------- */
/*
 * 只读的跑法口径：开着本 skill 就把自己那一段一口气跑完，不停下来问用户。
 * 它不参与任何一道门——门管的是「白出一整批」，跟问不问用户无关。
 */

ok(autopilotOf({ ...PRODUCTION, autopilot: true }), '开着就是开着');
eq(autopilotOf({ ...PRODUCTION, autopilot: false }), false, '关着就是关着');
eq(autopilotOf(PRODUCTION), false, '老项目的生产参数里没有这个字段，按关处理');
eq(autopilotOf(null), false, '没有生产参数就是关——该问还是要问');
eq(autopilotOf({ autopilot: 'false' }), false, '字符串 "false" 不算开——JS 里它是真值，只认布尔真值');
eq(autopilotOf({ autopilot: 'true' }), false, '字符串 "true" 也不算开，写法错了按关处理');
eq(autopilotOf({ autopilot: 1 }), false, '数字不算开');
ok(AUTOPILOT_NOTE.includes('不要停下来问用户'), '开着时打印的那句话说清了约束');
ok(
  gateReport(FIXTURE, NAMES, { ...PRODUCTION, autopilot: true }).every((g) => g.ok),
  '打开自动驾驶不影响任何一道门——它改的是跑法，不是参数',
);

console.log(`✓ ${passed} 项自测全部通过`);
