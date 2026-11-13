#!/usr/bin/env node
// 自测：覆盖 mint-characters.mjs 里所有确定性逻辑。
// 不调用任何模型，不花额度，跑一次 < 1 秒。
//   node scripts/selftest.mjs

import './contracts-selftest.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHUNK_SIZE,
  MAX_CHUNKS,
  chunkText,
  negativeTerms,
  slug,
  styleBlockOf,
  styleLabelOf,
  validateCast,
  KNOWN_ASPECTS,
  PRODUCTION_DEPTH,
  PRODUCTION_FILE,
  brief,
  findProduction,
  productionProblems,
  STAGE_DIR,
  stageDirNote,
  imageJobsFrom,
  STYLE_REF_LINE,
  AUTOPILOT_NOTE,
  autopilotOf,
} from './mint-characters.mjs';
import './media-plan-selftest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const examples = join(here, '..', 'examples');
// chunkText 内部会把 \r\n 规范成 \n 再切块。这里读进来先规范一次，否则 Windows 上
// （git 默认 core.autocrlf 把 .txt 检出成 CRLF）拿原始文本当比对基准，
// 「块内容来自原文」「覆盖全文」两条会假失败——issue #8。
const SOURCE = readFileSync(join(examples, '渡口.txt'), 'utf8').replace(/\r\n/g, '\n');
// 正式 cast v1 的设计校验只看别名名称；样例《渡口》带完整画像、音色与图片设计。
const CAST = JSON.parse(readFileSync(join(examples, '渡口-cast.json'), 'utf8')).characters
  .map((c) => ({ ...c, aliases: c.aliases.map((a) => a.name) }));

let passed = 0;
function ok(condition, label) {
  assert.ok(condition, label);
  passed += 1;
}
function eq(actual, expected, label) {
  assert.equal(actual, expected, `${label} — 期望 ${expected}，实际 ${actual}`);
  passed += 1;
}
function throws(fn, re, label) {
  assert.throws(fn, re, label);
  passed += 1;
}

/* ---------------- chunkText ---------------- */

eq(chunkText('').length, 0, '空文本不产生块');
eq(chunkText('   \n  ').length, 0, '纯空白不产生块');
eq(chunkText(SOURCE).length, 1, '短故事只有一块');

const long = SOURCE.repeat(150);
const chunks = chunkText(long);
ok(chunks.length > 1, '长文本会切成多块');
ok(chunks.every((c) => c.length <= CHUNK_SIZE), `没有块超过 CHUNK_SIZE(${CHUNK_SIZE})`);
ok(long.includes(chunks[0].slice(0, 200)), '块内容来自原文');
// 相邻块必须重叠，否则卡在切口上的角色会两边都漏
ok(chunks[1].includes(chunks[0].slice(-100).slice(0, 40)), '相邻块有重叠');
// 覆盖率：把所有块拼起来（去重叠后）应该盖住绝大部分原文
const covered = chunks.reduce((sum, c) => sum + c.length, 0);
ok(covered >= long.length, '所有块加起来覆盖全文（含重叠）');

const huge = SOURCE.repeat(1500);
ok(chunkText(huge).length <= MAX_CHUNKS, `超长文本被 MAX_CHUNKS(${MAX_CHUNKS}) 截断而不是无限切`);

/* ---------------- slug ---------------- */

eq(slug('胡二爷'), '胡二爷', '中文名原样保留');
eq(slug('a/b:c*d'), 'a-b-c-d', '路径危险字符被替换');
eq(slug('  x  '), 'x', '两端空白被去掉');
eq(slug(''), 'character', '空名有兜底');

/* ---------------- validateCast ---------------- */

eq(validateCast(CAST, SOURCE).length, 0, '自带样例通过全部校验');
ok(validateCast([], SOURCE).length > 0, '空 cast 报错');

const clone = () => JSON.parse(JSON.stringify(CAST));
const hits = (cast, keyword) => validateCast(cast, SOURCE).filter((p) => p.includes(keyword)).length;

// 这四类是模型真实犯过的错，每一类都必须抓住
let bad = clone();
bad[0].persona.evidence[0] = 'She was nineteen years old.';
ok(hits(bad, '逐字片段') > 0, '抓住意译的引文');

bad = clone();
bad[0].image.prompt = `${bad[0].name}, ${bad[0].image.prompt}`;
ok(hits(bad, '人名') > 0, '抓住出图提示词里的人名');

bad = clone();
bad[0].image.promptLocal = `${bad[0].aliases[0]}的设定图`;
ok(hits(bad, '人名') > 0, '抓住本地语言出图提示词里的别名');

bad = clone();
bad[0].image.sheet = `${bad[0].name}, a model sheet`;
ok(hits(bad, '人名') > 0, '抓住设定图提示词里的人名');

bad = clone();
bad[0].voice.timbre = 'warm husky alto';
ok(hits(bad, '应为中文') > 0, '抓住该中文却写成英文的字段');

bad = clone();
bad[0].image.sheet = '中文设定图描述';
ok(hits(bad, '必须英文') > 0, '抓住该英文却含中文的字段');

bad = clone();
bad[0].importance = 'sidekick';
ok(hits(bad, 'importance') > 0, '抓住 importance 枚举越界');

bad = clone();
delete bad[0].image.sheet;
ok(hits(bad, 'image.sheet') > 0, '抓住缺失的设定图提示词');

bad = clone();
delete bad[0].persona;
eq(hits(bad, 'persona'), 0, '画像按需制作，缺少整个 persona 不算违规');

bad = clone();
bad[0].persona = { gender: '女' };
ok(hits(bad, 'persona.') > 0, '已提供的 persona 必须完整');

// 没有原文时应该跳过逐字校验而不是全判失败
eq(validateCast(CAST, null).length, 0, '不给原文时跳过引文校验');

/* ---------------- 生产参数（production.json） ---------------- */

/*
 * 样例《渡口》是横屏真人实拍，参数照它配才是全绿基线。
 * 画风那一块就是用户在 mint-setup 那一段填的东西——本 skill 没有内置画风，
 * 这一份写在本 skill 自己的夹具里，不 import 任何兄弟 skill 的代码。
 */
const CHARACTER_STYLE = {
  render:
    'Photorealistic portrait of a real human actor, live-action film casting reference, highly distinctive individual facial identity, natural human skin and authentic features, cinematic realism, anatomically grounded',
  surface:
    'Skin with visible pores and uneven tone, faint capillaries at the nostrils and ear rims, subtle subsurface scattering; eyes with a wet specular highlight, moist lower lid, visible iris fibres and a limbal ring; eyelids and eyebrows slightly asymmetric — no two sides identical; individual flyaway hair strands breaking the silhouette. Fabric with a visible weave, wear and shine at elbows, cuffs and knees, cloth falling with real weight and self-shadowing in the folds',
  lighting:
    'LIGHTING IN THE LEFT ZONE ONLY: a soft directional key light from the upper left with gentle falloff, subtle ambient occlusion under the chin, in the eye sockets and where the collar meets the neck, giving the head real volume. LIGHTING IN THE RIGHT ZONES: flat even orthographic lighting with no directional key and no cast shadows, so the figures stay measurable and cleanly cut out',
  negative:
    'plastic or waxy skin, over-smoothed airbrushed complexion, poreless doll face, perfectly symmetrical face, dead flat eyes without specular highlight, helmet-like hair with no loose strands, flat untextured fabric with no weave or wear, stiff mannequin posing, extra fingers, malformed hands, text, watermark, signature, busy or patterned background, harsh cast shadows on the backdrop',
  tags: ['photorealistic', 'live-action', 'character sheet', 'subsurface skin', 'directional key light'],
};
const PRODUCTION = {
  schemaVersion: 3,
  source: '渡口',
  style: {
    label: { zh: '真人实拍', en: 'Photorealistic live-action' },
    phrase: 'cinematic film still',
    character: CHARACTER_STYLE,
  },
  lang: 'zh',
  promptLang: 'en',
  image: {
    model: 'nanobanana2',
    asset: { resolution: '2K', aspectRatio: '16:9' },
  },
  video: { model: 'MiniMax H3', aspectRatio: '16:9', resolution: '768p' },
};

eq(PRODUCTION_FILE, 'production.json', '文件名与 mint-setup 一致');
ok(PRODUCTION_DEPTH >= 3, '向上找的层数够穿过 <工作目录>/<段>/<子目录>');
eq(findProduction(here, 0), null, '本目录没有就找不到（层数 0）');
eq(productionProblems(CAST, PRODUCTION).length, 0, '样例挂上生产参数零违规');
eq(productionProblems(CAST, null).length, 0, '没有生产参数就整体跳过，不是失败');

/* ---------------- 画风：没有内置预设，只有从生产参数里读 ---------------- */

eq(styleBlockOf(null), null, '没有生产参数就没有画风——不退回任何一档内置默认');
eq(styleBlockOf({}), null, '生产参数里没有 style 也是没有画风');
eq(styleBlockOf({ style: { character: { render: '  ' } } }), null, '渲染句只有空白算没填');
eq(styleBlockOf(PRODUCTION), CHARACTER_STYLE, '填了就原样给出来');
eq(styleLabelOf(null), '未填', '没有生产参数就说没填，不编一个名字出来');
eq(styleLabelOf(PRODUCTION), '真人实拍', '中文界面取中文名');
eq(styleLabelOf(PRODUCTION, 'en'), 'Photorealistic live-action', '英文界面取英文名');
eq(styleLabelOf({ style: { label: { zh: '水墨' } } }, 'en'), '水墨', '没写英文名就回落中文名');
eq(negativeTerms('a, extra fingers; text').join('|'), 'extra fingers|text', '反向词按逗号分号拆，太短的丢掉');
ok(/pore|subsurface/i.test(CHARACTER_STYLE.surface), '角色那一块管的是皮肤毛孔——那是 style.scene 没有的东西');

// 画风没填就跳过，不是拦——填不填是 mint-setup 那一段的门
{
  const half = { ...PRODUCTION, style: { label: { zh: '还没定' }, character: {} } };
  ok(productionProblems(CAST, half).length > 0, '提供了 production 却缺画风必须失败，不能跳过');
}

// 画风整块用上：渲染句原样进两条提示词
{
  const cast = JSON.parse(JSON.stringify(CAST));
  cast[0].image.sheet = 'ONE 16:9 landscape canvas, three zones, no text';
  const probs = productionProblems(cast, PRODUCTION);
  eq(probs.length, 1, '设定图提示词缺渲染句必须报出来');
  ok(probs[0].includes('真人实拍'), '点名生产参数定的是哪一档画风');
  ok(probs[0].includes(cast[0].name), '点名是哪个角色');
}
{
  const cast = JSON.parse(JSON.stringify(CAST));
  cast[0].image.prompt = 'A young woman in a dark blue student uniform, 16:9';
  ok(
    productionProblems(cast, PRODUCTION)[0].includes('出图提示词'),
    '单张出图提示词缺渲染句照样报——只查设定图的话，两者会变成两张皮',
  );
}
{
  const cast = JSON.parse(JSON.stringify(CAST));
  cast[0].image.negativePrompt = cast[0].image.negativePrompt.replace(', poreless doll face', '');
  const probs = productionProblems(cast, PRODUCTION);
  eq(probs.length, 1, '反向词少一条必须报出来——换风格是整套换');
  ok(probs[0].includes('poreless doll face'), '点名少了哪一条');
}
{
  const cast = JSON.parse(JSON.stringify(CAST));
  cast[0].image.negativePrompt += ', crossed eyes, lens flare';
  eq(productionProblems(cast, PRODUCTION).length, 0, '角色自己额外加反向词不算漂——查的是有没有带全，不是有没有多写');
}
{
  // 换一档完全不同的画风：整块换掉之后，还写着上一档渲染句的产物必须被拦
  const ink = {
    ...PRODUCTION,
    style: {
      label: { zh: '水墨' },
      phrase: 'ink wash film still',
      character: {
        render: 'Traditional Chinese ink wash portrait, wet brush on xuan paper, minimal decisive strokes',
        surface: 'Flat ink tone with dry-brush edges, no skin texture at all',
        lighting: 'Even flat light across the whole sheet, no cast shadows',
        negative: 'photorealistic, 3d render, visible pores, saturated colour, text, watermark',
        tags: ['ink wash', 'xuan paper', 'character sheet'],
      },
    },
  };
  const probs = productionProblems(CAST, ink);
  ok(probs.length > 0, '产物还是上一档画风，换成水墨后被拦——画风没有内置类型，写什么查什么');
  ok(probs.some((p) => p.includes('水墨')), '点名现在这部剧定的是哪一档画风');
}

// 设定图画幅一致：版面写死在 image.sheet 第一句里
{
  const portrait = { ...PRODUCTION, image: { ...PRODUCTION.image, asset: { resolution: '2K', aspectRatio: '9:16' } } };
  const probs = productionProblems(CAST, portrait);
  eq(probs.length, 2, '竖向资产参数及提示词不一致均报错');
  ok(probs.some(p => p.includes('9:16') && p.includes('16:9')), '两个画幅都点名');
}
{
  const cast = JSON.parse(JSON.stringify(CAST));
  cast[0].image.sheet = cast[0].image.sheet.replaceAll('16:9', ''); // 一条提示词里写了两处
  ok(
    productionProblems(cast, PRODUCTION).some((p) => p.includes('缺画幅')),
    '漏掉画幅与写错画幅分开报',
  );
}
ok(KNOWN_ASPECTS.includes('16:9') && KNOWN_ASPECTS.includes('9:16'), '画幅词表覆盖横竖两种主流');
{
  eq(brief(['a', 'b']), 'a；b', '没超阈值就原样列');
  ok(brief(Array.from({ length: 20 }, (_, i) => `x${i}`)).endsWith('……等 20 处'), '超了只列前几条 + 总数');
}

// 校验的语言规则跟着 lang 走
const enCast = clone();
for (const c of enCast) {
  c.voice.timbre = 'warm husky alto';
  c.voice.pitch = 'low';
  c.voice.pace = 'slow and deliberate';
  c.voice.accent = 'neutral';
  c.voice.emotion = 'weary';
  c.voice.referenceHint = 'like a night-shift radio host';
}
ok(
  validateCast(enCast, SOURCE, 'en').filter((p) => p.includes('应为')).length === 0,
  'lang=en 时英文 voice 字段合法',
);
ok(
  validateCast(enCast, SOURCE, 'zh').filter((p) => p.includes('应为中文')).length > 0,
  'lang=zh 时英文 voice 字段违规',
);
ok(
  validateCast(CAST, SOURCE, 'en').filter((p) => p.includes('应为英文')).length > 0,
  'lang=en 时中文 voice 字段违规',
);
// 机器字段不受 lang 影响，永远必须英文
const cjkMachine = clone();
cjkMachine[0].image.prompt = '中文出图提示词';
for (const l of ['zh', 'en', 'fr']) {
  ok(
    validateCast(cjkMachine, SOURCE, l).filter((p) => p.includes('必须英文')).length > 0,
    `lang=${l} 时 image.prompt 仍必须英文`,
  );
}

/* ---------------- 角色设定图（左半身像 + 右三视图，一张） ---------------- */

ok(CAST.every((c) => c.image.sheet && c.image.sheet.trim()), '样例每个角色都有设定图提示词');
// 左右分栏和比例必须写死在提示词里，否则模型会自由发挥
ok(CAST.every((c) => /LEFT ZONE/.test(c.image.sheet)), '提示词划出左栏');

ok(CAST.every((c) => /about 34% of the canvas width/.test(c.image.sheet)), '左栏比例写死 34%');
// 16:9 和三区版面
ok(CAST.every((c) => /16:9/.test(c.image.sheet)), '画布写死 16:9');
ok(CAST.every((c) => /RIGHT-TOP ZONE/.test(c.image.sheet)), '右上是三视图区');
ok(CAST.every((c) => /RIGHT-BOTTOM ZONE/.test(c.image.sheet)), '右下是细节区');
ok(CAST.every((c) => /thin hairline rules/.test(c.image.sheet)), '三区之间有细线分隔');
// 比例是这个版面最容易崩的地方——为了塞下细节而压扁人物
ok(CAST.every((c) => /PROPORTIONS ARE CRITICAL/.test(c.image.sheet)), '强调比例');
ok(
  CAST.every((c) => /no stretching, squashing or foreshortening/.test(c.image.sheet)),
  '禁止拉伸压扁人物',
);
ok(
  CAST.every((c) => /the detail studies give way, not the figures/.test(c.image.sheet)),
  '空间不够时让细节让位，不动人物',
);
ok(
  CAST.every((c) => /continue them in a narrow vertical column down the right-hand edge/.test(c.image.sheet)),
  '细节放不下可延伸到右侧',
);

/* ---------------- 同剧角色画风必须一致 ---------------- */
/*
 * 这一条与生产参数那一档画风是两件事：那边管的是「整部剧是哪一档画风」，
 * 这边管的是「同一部剧里四个角色的 image.style 那句人读描述有没有各写各的」。
 * 模型曾按各自服装/年龄写出四套，同框时像四个画师画的。
 */
eq(validateCast(CAST, SOURCE, 'zh').length, 0, '样例四个角色画风统一，校验通过');
{
  const split = clone();
  split[1].image.style = '吉卜力动画风，明快平涂';
  ok(
    validateCast(split, SOURCE, 'zh').some((x) => x.includes('画风不一致')),
    '同剧角色 image.style 不一致会报错',
  );
}
{
  const ws = clone();
  ws[0].image.style = '  真人实拍，冷调低饱和民国配色，晨雾柔光  ';
  eq(validateCast(ws, SOURCE, 'zh').length, 0, 'image.style 仅空白差异不算不一致');
}

// 同批角色的提示词不许雷同——模型套同一个模板，两个年龄性别接近的角色会出成同一个人（issue #9）
eq(validateCast(CAST, SOURCE, 'zh').length, 0, '样例四个角色的提示词差异够大，不误拦');
{
  const dup = clone();
  dup[1].image.prompt = dup[0].image.prompt;
  ok(
    validateCast(dup, SOURCE, 'zh').some((x) => x.includes('出图提示词雷同')),
    '两个角色的出图提示词完全相同会报错',
  );
}
{
  // 只改年龄与衣服颜色 —— 这正是实际踩到的形态：个体描述太短，剩下全是样板
  const near = clone();
  near[1].image.prompt = near[0].image.prompt
    .replace(/nineteen-year-old/g, 'twenty-two-year-old')
    .replace(/navy-blue/g, 'dark green');
  ok(
    validateCast(near, SOURCE, 'zh').some((x) => x.includes('出图提示词雷同')),
    '只改几个词的出图提示词照样被拦',
  );
}
{
  const dupVoice = clone();
  dupVoice[1].voice.prompt = dupVoice[0].voice.prompt;
  ok(
    validateCast(dupVoice, SOURCE, 'zh').some((x) => x.includes('音色提示词雷同')),
    '两个角色的音色提示词相同也会报错',
  );
}
{
  // image.sheet 刻意不查：三分区排版规范是大段固定文本，真实角色之间本来就 63% 重合
  const dupSheet = clone();
  dupSheet[1].image.sheet = dupSheet[0].image.sheet;
  ok(
    !validateCast(dupSheet, SOURCE, 'zh').some((x) => x.includes('雷同')),
    'image.sheet 相同不报错——它的固定排版文本占比太高，设门必然误拦',
  );
}
{
  // 极短提示词不参与判定，否则空字段之间会互相假命中
  const tiny = clone();
  tiny[0].image.prompt = 'a man';
  tiny[1].image.prompt = 'a man';
  ok(
    !validateCast(tiny, SOURCE, 'zh').some((x) => x.includes('出图提示词雷同')),
    '词数太少的提示词不参与雷同判定',
  );
}

/* ---------------- 真实感 ---------------- */

// 一边要真实感一边在反向提示词里禁真实感，是自相矛盾的
ok(
  CAST.every((c) => !/photorealistic|3d render/i.test(c.image.negativePrompt)),
  'negativePrompt 不再禁 photorealistic / 3d render',
);
ok(
  CAST.every((c) => /plastic or waxy skin|poreless doll face/i.test(c.image.negativePrompt)),
  'negativePrompt 改禁「假」而不是禁「真」',
);
// 「扁平矢量卡通」跟写实拧巴，会导致同一批角色画风飘
ok(
  CAST.every((c) => !/flat vector cartoon/i.test(c.image.sheet + c.image.prompt)),
  '不再用扁平矢量卡通',
);
ok(
  CAST.every((c) => /Photorealistic portrait of a real human actor/.test(c.image.sheet)),
  '画风统一到真人演员实拍',
);
{
  // sheet 有渲染句、prompt 没有——只查 sheet 的话这种两张皮会整批漏过去
  const noRender = clone();
  noRender[0].image.prompt = '一句不带渲染句的提示词';
  ok(
    validateCast(noRender, SOURCE, 'zh').some((x) => x.includes('image.prompt')),
    'prompt 缺渲染句被拦',
  );
}
// 真实感来自不完美
for (const [k, label] of [
  [/visible pores/i, '可见毛孔'],
  [/wet specular highlight/i, '眼睛湿润高光'],
  [/asymmetric/i, '左右不对称'],
  [/flyaway hair strands/i, '碎发破轮廓'],
  [/visible weave/i, '布料织纹'],
  [/self-shadow/i, '褶皱自阴影'],
]) {
  ok(CAST.every((c) => k.test(c.image.sheet)), `设定图提示词含${label}`);
}
// 分区光照：左栏要体积，右侧要平光——合并成一句全局光照就废了
ok(
  CAST.every((c) => /LIGHTING IN THE LEFT ZONE ONLY/.test(c.image.sheet)),
  '左栏单独打方向光',
);
ok(
  CAST.every((c) => /LIGHTING IN THE RIGHT ZONES: flat even orthographic/.test(c.image.sheet)),
  '右侧保持平光正交',
);
ok(
  CAST.every((c) => /ambient occlusion/i.test(c.image.sheet)),
  '左栏有环境遮蔽',
);
ok(CAST.every((c) => /bust portrait/i.test(c.image.sheet)), '左栏是半身像');
// 模型默认会把肩膀裁掉、底边做成圆角渐隐，必须显式禁掉
ok(
  CAST.every((c) => /BOTH SHOULDERS ARE FULLY VISIBLE/.test(c.image.sheet)),
  '左栏要求肩膀完整',
);
ok(
  CAST.every((c) => /do not fade, vignette or round off the bottom edge/.test(c.image.sheet)),
  '左栏禁止底边圆角渐隐',
);
ok(CAST.every((c) => /three FULL-BODY views/i.test(c.image.sheet)), '右上是三视图');
// 两栏的脸必须画成同一个人，否则一张图里出现两个长相
ok(
  CAST.every((c) => /must match the bust portrait/i.test(c.image.sheet)),
  '三视图的脸要求与半身像一致',
);
// 设定图不要求留空脸——提示词里不该出现这类要求
ok(
  CAST.every((c) => !/left completely blank|NO eyes|NO facial features/i.test(c.image.sheet)),
  '提示词里没有残留的留空脸要求',
);

/* ---------------- 产物落点 ---------------- */

eq(STAGE_DIR, 'characters', '段目录名与端到端工作目录约定一致');
{
  const prod = '/w/production.json';
  eq(stageDirNote('/w/characters/渡口-cast.json', prod), null, '落在自己的段目录里就不吭声');
  ok(stageDirNote('/w/渡口-cast.json', prod)?.includes('/w/characters'), '平铺在工作目录根要提示该去哪');
  ok(stageDirNote('/w/other/渡口-cast.json', prod), '串进别人的段目录也要提示');
  ok(stageDirNote('/w/characters/sub/渡口-cast.json', prod), '段目录下再套一层同样提示——报告按相对路径找图，多一层图就全丢');
  eq(stageDirNote('/w/渡口-cast.json', null), null, '没有 production.json 就无从判断，不猜');
  eq(stageDirNote(null, prod), null, '没有产物路径也不猜');
}

/* ---------------- 出图任务：从文档搬运 ---------------- */

{
  const { model, inputBase, jobs, problems } = imageJobsFrom(CAST, PRODUCTION);
  eq(problems.length, 0, '自带样例能直接排出出图任务');
  eq(model, PRODUCTION.image.model, '显式生产参数提供模型');
  eq(inputBase.aspect_ratio, PRODUCTION.image.asset.aspectRatio, '显式生产参数提供画幅');
  eq(inputBase.resolution, PRODUCTION.image.asset.resolution, '显式生产参数提供档位');
  eq(jobs.length, CAST.length, '每个角色一张，不按 importance 筛');
  eq(jobs[0].prompt, CAST[0].image.sheet, '提示词取 image.sheet，不是 image.prompt');
  eq(jobs[0].negativePrompt, CAST[0].image.negativePrompt, '反向词单独带上');
  eq(jobs[0].file, `images/${slug(CAST[0].name)}-sheet.png`, '产物路径与 render 找图的路径同一个算法');
  eq(jobs.every((j) => !j.refFrom), true, '默认不挂风格参考——只要几张草图的场合不该被绑住');
}

// --images 换目录，产物与 render 两边跟着走
{
  const { jobs } = imageJobsFrom(CAST, null, { imagesDir: 'pics' });
  ok(jobs[0].file.startsWith('pics/'), 'images 目录可换，产物路径跟着换');
}

// 生产参数在就以它为准——三个值原样进 input_data，不折算像素
{
  const prod = { image: { model: 'seedream4', asset: { resolution: '4K', aspectRatio: '4:3' } } };
  const { model, inputBase } = imageJobsFrom(CAST, prod);
  eq(model, 'seedream4', '模型取 production.json 的 image.model');
  eq(inputBase.resolution, '4K', '档位是枚举值，原样带上');
  eq(inputBase.aspect_ratio, '4:3', '画幅是枚举值，原样带上');
}

// 风格参考：基准角色先出，其余挂它并补一句风格匹配
{
  const { jobs } = imageJobsFrom(CAST, null, { styleRef: 'auto' });
  eq(jobs[0].refFrom, null, 'auto 拿第一个角色当基准，它自己不挂参考');
  eq(jobs.slice(1).every((j) => j.refFrom === jobs[0].key), true, '其余角色都挂基准的成图');
  ok(jobs[1].prompt.includes(STYLE_REF_LINE), '挂了参考图就要补一句风格匹配，否则模型不知道拿它做什么');
  ok(!jobs[0].prompt.includes(STYLE_REF_LINE), '基准角色的提示词不动');

  const named = imageJobsFrom(CAST, PRODUCTION, { styleRef: CAST[1].name });
  eq(named.jobs[1].refFrom, null, '指名谁谁就是基准');
  eq(named.jobs[0].refFrom, CAST[1].name, '其余角色挂指名的那个');

  const bad = imageJobsFrom(CAST, null, { styleRef: '不存在的人' });
  ok(bad.problems.some((x) => x.includes('不存在的人')), '--style-ref 指错了提交之前就报');
}

// 提交之前就要拦下的两类问题
{
  const cs = JSON.parse(JSON.stringify(CAST));
  cs[0].image.sheet = '';
  ok(imageJobsFrom(cs).problems.some((x) => x.includes('image.sheet')), '提示词空着不许提交——白花钱');

  const cs2 = JSON.parse(JSON.stringify(CAST));
  cs2[1].name = cs2[0].name;
  const distinct=imageJobsFrom(cs2).jobs;
  ok(distinct[0].file !== distinct[1].file, '同名不同 ID 的图片产物彼此独立');
  cs2[1].id=cs2[0].id;
  ok(imageJobsFrom(cs2).problems.some((x) => x.includes('同一个文件名')), '重复身份仍然阻断覆盖');
}

/* ---------------- 自动驾驶（autopilot） ---------------- */
/*
 * 只读的跑法口径：开着本 skill 就把自己那一段一口气跑完，不停下来问用户。
 * 它不参与任何一条检查——检查管的是「整套白出」，跟问不问用户无关。
 */

ok(autopilotOf({ ...PRODUCTION, autopilot: true }), '开着就是开着');
eq(autopilotOf({ ...PRODUCTION, autopilot: false }), false, '关着就是关着');
eq(autopilotOf(PRODUCTION), false, '生产参数里没有这个字段就按关处理');
eq(autopilotOf(null), false, '没有生产参数就是关——该问还是要问');
eq(autopilotOf({ autopilot: 'false' }), false, '字符串 "false" 不算开——JS 里它是真值，只认布尔真值');
eq(autopilotOf({ autopilot: 'true' }), false, '字符串 "true" 也不算开，写法错了按关处理');
eq(autopilotOf({ autopilot: 1 }), false, '数字不算开');
ok(AUTOPILOT_NOTE.includes('不要停下来问用户'), '开着时打印的那句话说清了约束');
eq(
  productionProblems(CAST, { ...PRODUCTION, autopilot: true }).length,
  0,
  '打开自动驾驶不影响那两条检查——它改的是跑法，不是参数',
);

console.log(`✓ ${passed} 项自测全部通过`);
