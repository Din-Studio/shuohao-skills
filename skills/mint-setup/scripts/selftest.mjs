#!/usr/bin/env node
// 自测：覆盖 mint-setup.mjs 里所有确定性逻辑（生产参数）。
// 不调用任何模型、不碰网络、不花额度，跑一次 < 1 秒。
//   node scripts/selftest.mjs

import './contracts-selftest.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GENERATION_SKILLS,
  IMAGE_MODELS,
  LOOKUP_DEPTH,
  PRODUCTION_FILE,
  STAGES,
  STYLE_BLOCKS,
  SUPPORTED_LANGS,
  VIDEO_MODELS,
  autopilotOf,
  clampDuration,
  emptyStyle,
  findProduction,
  gateReport,
  imageCaps,
  initProduction,
  matchTier,
  mentionsTerm,
  negativeTerms,
  parseAspect,
  renderMarkdown,
  resolveStage,
  sameRatio,
  styleLabelOf,
  validateProduction,
  videoCaps,
} from './mint-setup.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PORTRAIT = JSON.parse(readFileSync(join(here, '..', 'examples', '回南天-production.json'), 'utf8'));
const LANDSCAPE = JSON.parse(readFileSync(join(here, '..', 'examples', '雪线-production.json'), 'utf8'));

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed++;
}
function eq(actual, expected, msg) {
  assert.strictEqual(actual, expected, `${msg} — 期望 ${expected}，实际 ${actual}`);
  passed++;
}
const clone = (d = PORTRAIT) => JSON.parse(JSON.stringify(d));
const gate = (d, id) => gateReport(d).find((g) => g.id === id);
const fails = (d, id) => (gate(d, id).status !== 'fail') === false;

/* ---------------- 比例的解析 ---------------- */

eq(parseAspect('16:9').ratio.toFixed(4), '1.7778', '16:9 解析');
eq(parseAspect('9:16').ratio.toFixed(4), '0.5625', '9:16 解析');
eq(parseAspect('21:9').ratio.toFixed(4), '2.3333', '21:9 解析——H3 managed 收这个比例');
eq(parseAspect('16x9'), null, '比例只认冒号写法');
eq(parseAspect('16:0'), null, '比例的分母不能是 0');
eq(parseAspect(''), null, '空串不是比例');
eq(parseAspect('adaptive'), null, 'adaptive 不是比例——本管线不能用，视频需要固定画幅');
ok(sameRatio(2048 / 1152, 16 / 9), '2048x1152 就是 16:9');
ok(!sameRatio(4 / 3, 16 / 9), '4:3 不是 16:9');

/* ---------------- 档位对枚举 ---------------- */
/*
 * lingying 的 resolution 就是档位本身，是 input_schema 里的枚举值。
 * 所以这里做的是**对枚举**，不是折算像素——折算那一层整个没有了。
 */

eq(matchTier('2K', ['1K', '2K', '4K']), '2K', '档位原样能对上');
eq(matchTier('2k', ['1K', '2K', '4K']), '2K', '大小写不敏感，回填枚举里的写法');
eq(matchTier(' 720P ', ['480p', '720p']), '720p', '两头空白与大小写都不影响');
eq(matchTier('8K', ['1K', '2K', '4K']), null, '不在枚举里就对不上');
eq(matchTier('', ['1K']), null, '空档位对不上');
eq(matchTier('2K', []), null, '空枚举对不上任何东西');

/* ---------------- 生图模型能力 ---------------- */

{
  const caps = imageCaps('nanobanana2', '2K');
  ok(caps.aspectRatios.includes('9:16'), 'nanobanana2 收竖屏');
  ok(caps.aspectRatios.includes('16:9'), 'nanobanana2 收横屏');
  ok(!caps.aspectRatios.includes('4:3'), 'nanobanana2 不收 4:3——资产图不能选择 4:3');
  ok(!caps.restricted, '2K 下没有额外限制');
}
{
  const caps = imageCaps('image-2', '4K');
  eq(caps.aspectRatios.join(','), '16:9,9:16', 'image-2 的 4K 只剩两个比例——8.29MP 像素上限');
  ok(caps.restricted, '4K 下的限制被标出来了');
}
{
  const caps = imageCaps('image-2', '2K');
  ok(caps.aspectRatios.includes('4:3'), 'image-2 在 2K 下收 4:3');
  ok(!caps.restricted, '2K 下没有限制');
}
eq(imageCaps('不存在的模型', '2K'), null, '未知生图模型给不出能力——由门去说明「跳过」');
eq(imageCaps('nanobanana2', '8K').tier, null, '未知档位对不上枚举');

/* ---------------- 生视频模型能力 ---------------- */

{
  const caps = videoCaps('MiniMax H3');
  eq(caps.resolutions.join(','), '768p,2K', 'H3 的档位是 768p / 2K，不是随手会写的 720p / 1080p');
  ok(caps.aspectRatios.includes('21:9'), 'H3 收 21:9');
  eq(caps.duration.min, 5, 'H3 的单段下限 5 秒');
  eq(caps.duration.max, 15, 'H3 的单段上限 15 秒——分镜的段上限就是按它定的');
}
{
  const caps = videoCaps('seedance2.0');
  ok(caps.resolutions.includes('1080p'), 'seedance2.0 收 1080p');
  eq(caps.duration.min, 4, 'seedance 的单段下限 4 秒');
}
{
  const caps = videoCaps('seedance2.5');
  eq(caps.duration.min, 4, 'seedance2.5 的单段下限 4 秒');
  eq(caps.duration.max, 30, 'seedance2.5 能到 30 秒——是几个视频模型里最长的一个');
}
eq(videoCaps('不存在的模型'), null, '未知视频模型给不出能力');

/* ---------------- 段秒数折成 duration ---------------- */
/*
 * 分镜的段秒数是按节拍算出来的，模型收的是整数秒且有区间。
 * 折算规则写死在这里，免得每个下单脚本各折各的。
 */

eq(clampDuration(12, 'MiniMax H3').duration, 12, '整数秒且在区间内，原样下单');
eq(clampDuration(12, 'MiniMax H3').note, '', '没动过就不啰嗦');
eq(clampDuration(12.5, 'MiniMax H3').duration, 13, '非整数向上取整——宁可多出半秒，剪辑时裁掉');
ok(/向上取整/.test(clampDuration(12.5, 'MiniMax H3').note), '取整了要说一声');
eq(clampDuration(3, 'MiniMax H3').duration, 5, '短于下限按下限下单');
ok(/下限/.test(clampDuration(3, 'MiniMax H3').note), '夹到下限要说清楚');
eq(clampDuration(3, 'seedance2.0').duration, 4, '换个模型下限就变成 4');
eq(clampDuration(20, 'MiniMax H3').duration, 15, '超过上限按上限下单');
ok(/再拆一次/.test(clampDuration(20, 'MiniMax H3').note), '超上限点明这一段本该再拆');
eq(clampDuration(12.5, '不存在的模型').duration, 13, '未知模型只取整不夹区间');
eq(clampDuration(0, 'MiniMax H3').duration, null, '零秒折不出 duration');
eq(clampDuration('大概十秒', 'MiniMax H3').duration, null, '不是数字也折不出来');

/* ---------------- init ---------------- */

{
  const d = initProduction({ aspect: '9:16' });
  eq(d.image.frame, undefined, 'init 不再生成关键帧配置');
  eq(d.video.aspectRatio, '9:16', 'init 把成片画幅落到视频');
  eq(d.image.asset.aspectRatio, '16:9', '资产图默认横构图——设定图版面与成片画幅是两件事');
  eq(d.style.phrase, '', '画风短语仍供视频提示词指南使用，初始为空');
  eq(d.image.asset.resolution, '2K', '资产图档位默认 2K');
  eq(d.image.model, 'nanobanana2', '生图模型默认 nanobanana2');
  eq(d.style.label.zh, '', '画风没有默认值，正文由用户填');
  eq(typeof d.style.character, 'object', '骨架里角色那一块已经占好位');
  eq(typeof d.style.scene, 'object', '骨架里场景那一块也占好位');
  eq(d.lang, 'zh', '报告界面语言默认中文');
  eq(d.promptLang, 'en', '提示词语言默认英文——H3 官方口径');
  eq(d.autopilot, false, '自动驾驶默认关——不打断是用户要主动开的口径');
  eq(Object.keys(d.image.asset).join(','), 'resolution,aspectRatio', '资产图只有档位与比例两个字段，没有像素');
  eq(Object.keys(d.video).join(','), 'model,aspectRatio,resolution', '视频三个字段——模型自己特有的配置参数不进这里');
  eq(validateProduction(d).length, 3, 'init 出来的骨架差视频模型、视频分辨率与画风正文');
  ok(validateProduction(d).some((x) => x.includes('video-model')), '差的一条是视频模型');
  ok(validateProduction(d).some((x) => x.includes('resolution-filled')), '另一条是视频分辨率');
  ok(validateProduction(d).some((x) => x.includes('style-blocks')), '第三条是画风——空骨架不会静默通过');
}
{
  const d = initProduction({ aspect: '9:16', videoModel: 'MiniMax H3', videoResolution: '768p', style: clone().style });
  eq(validateProduction(d).length, 0, '把视频模型、档位与画风都补齐就全过');
}
{
  const d = initProduction({ aspect: '16:9', videoModel: 'seedance2.0', videoResolution: '720p', style: clone().style });
  eq(validateProduction(d).length, 0, '换个视频模型也全过');
}
{
  const d = initProduction({ aspect: '16:9', videoModel: 'seedance2.5', videoResolution: '1080p', style: clone().style });
  ok(validateProduction(d).some((x) => x.includes('1080p')), 'seedance2.5 不收 1080p——档位逐个模型不同');
}
{
  let threw = false;
  try { initProduction({}); } catch { threw = true; }
  ok(threw, '不给 --aspect 直接抛错——成片画幅没有默认值');
}
{
  let threw = false;
  try { initProduction({ aspect: '竖屏' }); } catch { threw = true; }
  ok(threw, '画幅写法不对也抛错');
}
{
  const d = initProduction({ aspect: '16:9', imageModel: '未知模型', assetResolution: '8K' });
  eq(d.image.asset.resolution, '8K', '未知模型与未知档位都原样落盘——表里没有的不是错误');
  eq(gate(d, 'model-caps').status, 'skipped', '未知模型的档位比例都跳过检查');
  ok(/不在能力表里/.test(gate(d, 'model-caps').detail), '跳过了要明说，不装查过');
}

/* ---------------- 自动驾驶 ---------------- */
/*
 * 下游五个 skill 读到它为 true 就把自己那一段一口气跑完（不提问、不等拍板）。
 * 只认布尔真值：字符串 "false" 在 JS 里是真的，那种写法比没写更坏。
 */

{
  const d = initProduction({ aspect: '9:16', autopilot: true });
  eq(d.autopilot, true, '显式打开就落成 true');
  ok(autopilotOf(d), '打开了 autopilotOf 说开');
  eq(d.schemaVersion, 3, 'production 显式采用 v3');
}
eq(autopilotOf(initProduction({ aspect: '9:16' })), false, '默认关');
eq(autopilotOf(null), false, '没有生产参数就是关，照常逐步询问');
eq(autopilotOf({}), false, '字段缺失是关，不是错');
eq(autopilotOf({ autopilot: 'false' }), false, '字符串 "false" 不算开——只认布尔真值');
eq(autopilotOf({ autopilot: 'true' }), false, '字符串 "true" 也不算开，写法错了就按关处理');
eq(autopilotOf({ autopilot: 1 }), false, '数字不算开');
{
  const d = clone(); d.autopilot = 'true';
  ok(fails(d, 'fields'), 'autopilot 写成字符串击穿 fields——不能静默按关处理，那是写的人以为开着');
  ok(/布尔值/.test(gate(d, 'fields').detail), '点名要写 JSON 布尔值');
}
{
  const d = clone(); delete d.autopilot;
  ok((gate(d, 'fields').status !== 'fail'), '整个不写 autopilot 不算违规——老项目的 production.json 里没有这个字段');
}
{
  const d = clone(); d.autopilot = true;
  eq(validateProduction(d).length, 0, '打开自动驾驶不影响任何一道门——它不改出图参数');
  ok(resolveStage(d, 'characters').autopilot, 'resolve 把自动驾驶一起给下游');
  ok(resolveStage(d, 'video').autopilot, '下单阶段也拿得到');
}
eq(resolveStage(PORTRAIT, 'characters').autopilot, false, '竖屏样例是关着的');
eq(resolveStage(LANDSCAPE, 'characters').autopilot, true, '横屏样例演示了开着的样子');

/* ---------------- 样例本身 ---------------- */

eq(validateProduction(PORTRAIT).length, 0, '竖屏样例全部通过');
eq(validateProduction(LANDSCAPE).length, 0, '横屏样例全部通过');
eq(PORTRAIT.video.aspectRatio, '9:16', '竖屏样例的视频是竖的');
eq(LANDSCAPE.video.aspectRatio, '16:9', '横屏样例的视频是横的');
eq(PORTRAIT.image.asset.aspectRatio, LANDSCAPE.image.asset.aspectRatio, '两份样例的资产图都是横构图');
ok(PORTRAIT.style.character.render !== LANDSCAPE.style.character.render, '两份样例演示了两种画风——不是从枚举里挑的，是各写各的');
eq(styleLabelOf(PORTRAIT.style), '真人实拍', '竖屏样例的画风名');
eq(styleLabelOf(LANDSCAPE.style, 'en'), 'Ghibli-like animation', '横屏样例带了英文画风名');
eq(LANDSCAPE.promptLang, 'zh', '横屏样例演示了中文提示词');
ok(PORTRAIT.image.asset.resolution !== LANDSCAPE.image.asset.resolution, '两份样例演示了不同档位');
ok(PORTRAIT.image.model !== LANDSCAPE.image.model, '两份样例演示了两个生图模型');
ok(PORTRAIT.video.model !== LANDSCAPE.video.model, '两份样例演示了两个视频模型');
ok(PORTRAIT.video.resolution !== LANDSCAPE.video.resolution, '两份样例演示了两个视频档位');
ok(PORTRAIT.source !== LANDSCAPE.source, '两份样例是两部不同的剧');
ok(PORTRAIT.autopilot !== LANDSCAPE.autopilot, '两份样例把自动驾驶的两档各演示一次');
eq(gateReport(PORTRAIT).length, 9, '一共八道门');

/* ---------------- 八道门，每道都有击穿用例 ---------------- */

// 1 fields
{
  const d = clone(); delete d.image.model;
  ok(fails(d, 'fields'), '缺生图模型击穿 fields');
}
{
  const d = clone(); d.style = 'anime';
  ok(fails(d, 'fields'), '画风写成一个字符串击穿 fields——画风已经不是枚举，它是一整块正文');
  ok(/对象/.test(gate(d, 'fields').detail), '点名 style 该是对象');
}
{
  const d = clone(); d.lang = 'jp';
  ok(fails(d, 'fields'), '界面语言不在枚举里击穿 fields');
}
{
  const d = clone(); d.promptLang = 'fr';
  ok(fails(d, 'fields'), '提示词语言不在枚举里击穿 fields');
}
{
  const d = clone(); d.image.asset.resolution = '';
  ok(fails(d, 'fields'), '资产图档位为空击穿 fields');
}
{
  const d = clone(); d.image.asset.aspectRatio = '   ';
  ok(fails(d, 'fields'), '资产图比例只有空白击穿 fields');
}

// 2 aspect-format
{
  const d = clone(); d.image.asset.aspectRatio = '9-16';
  ok(fails(d, 'aspect-format'), '比例写法不对击穿 aspect-format');
}
{
  const d = clone(); delete d.video.aspectRatio;
  ok(fails(d, 'aspect-format'), '视频比例缺失击穿 aspect-format');
}
{
  const d = clone(); d.video.aspectRatio = 'adaptive';
  ok(fails(d, 'aspect-format'), 'adaptive 击穿 aspect-format——模型收它，本管线不能用');
  ok(/adaptive/.test(gate(d, 'aspect-format').detail), '这道门点名说清 adaptive 为什么不行');
}

// 视频画幅不受资产图模型限制。
{
  const d = clone();
  d.video.aspectRatio = '4:3';
  eq(validateProduction(d).length, 0, '视频 4:3 不要求 nanobanana2 资产图也支持 4:3');
  ok(!gateReport(d).some((g) => g.id === 'frame-matches-video'), '不再有关键帧比例门');
}
assert.throws(() => resolveStage(PORTRAIT, 'storyboard'), /未知阶段/);
passed++;

// init 不得静默接受已删除的选项。
{
  const r = spawnSync(process.execPath, [join(here, 'mint-setup.mjs'), 'init', '--aspect', '9:16', '--frame-resolution', '2K'], { encoding: 'utf8' });
  eq(r.status, 1, '未知选项返回失败');
  ok(r.stderr.includes('未知选项'), '明确报告未知选项');
}

// 3 asset-landscape
{
  const d = clone(); d.image.asset.aspectRatio = '9:16';
  ok(fails(d, 'asset-landscape'), '资产图竖构图击穿 asset-landscape');
  ok(/横向铺开/.test(gate(d, 'asset-landscape').detail), '这道门解释了为什么设定图要横构图');
}
{
  const d = clone(); d.image.asset.aspectRatio = '1:1';
  ok((gate(d, 'asset-landscape').status !== 'fail'), '方形资产图放行');
}

// 4 resolution-filled
{
  const d = clone(); d.video.resolution = '   ';
  ok(fails(d, 'resolution-filled'), '视频分辨率只有空白击穿 resolution-filled');
}
{
  const g = gate(PORTRAIT, 'resolution-filled');
  ok((g.status !== 'fail'), '档位填齐了就过');
  ok(g.detail.includes('768p'), '详情把两处档位摆出来');
}

// 5 video-model
{
  const d = clone(); d.video.model = '';
  ok(fails(d, 'video-model'), '视频模型为空击穿 video-model');
}
{
  const d = clone(); d.video.resolution = '720p';
  ok(fails(d, 'video-model'), 'H3 配 720p 击穿 video-model——720p 是别的模型的档位');
  ok(/768p \/ 2K/.test(gate(d, 'video-model').detail), '点名该用哪两个档位');
}
{
  const d = clone(); d.video.aspectRatio = '21:9';
  ok((gate(d, 'video-model').status !== 'fail'), 'H3 收 21:9');
}
{
  const d = clone(); d.video.model = 'seedance2.0'; d.video.resolution = '720p';
  ok((gate(d, 'video-model').status !== 'fail'), '换个模型换个档位照样过');
}
{
  const d = clone(); d.video.model = '某个新模型';
  const g = gate(d, 'video-model');
  ok((g.status !== 'fail'), '表里没有的视频模型只查非空');
  ok(/不在能力表里/.test(g.detail), '跳过了要明说');
}
ok(gate(PORTRAIT, 'video-model').detail.includes('5~15'), '过了的时候顺手提醒段时长要折成整数秒');

// 6 model-caps
{
  const d = clone(); d.image.asset.resolution = '8K';
  ok(fails(d, 'model-caps'), '档位不在生图模型枚举里击穿 model-caps');
}
{
  const d = clone(); d.image.asset.aspectRatio = '4:3';
  ok(fails(d, 'model-caps'), 'nanobanana2 不收 4:3，资产图写 4:3 击穿 model-caps');
}
{
  const d = clone(LANDSCAPE); d.image.asset.aspectRatio = '4:3'; d.video.aspectRatio = '4:3';
  ok(fails(d, 'model-caps'), 'image-2 的 4K 只收 16:9 / 9:16，4:3 击穿 model-caps');
  ok(/只收 16:9 \/ 9:16/.test(gate(d, 'model-caps').detail), '点名 4K 下的限制');
}
{
  const d = clone(LANDSCAPE); d.image.asset.resolution = '2K';
  d.image.asset.aspectRatio = '4:3'; d.video.aspectRatio = '4:3';
  ok((gate(d, 'model-caps').status !== 'fail'), '同样是 4:3，降到 2K 就合法——限制只在 4K 上');
}
ok(gate(LANDSCAPE, 'model-caps').detail.includes('4K 下只收'), '过了的时候也把 4K 的限制摆出来');

// 7 style-blocks —— 画风是用户填的，缺块要拦
{
  const d = clone(); d.style = emptyStyle();
  ok(fails(d, 'style-blocks'), '空骨架击穿 style-blocks——没填就是没定，不静默用回某一档写死的画风');
  ok(/style-template/.test(gate(d, 'style-blocks').detail), '拦下来的时候指路去哪拿骨架');
}
{
  const d = clone(); d.style.label.zh = '';
  ok(fails(d, 'style-blocks'), '画风没有中文名击穿 style-blocks——报告界面要显示它');
}
{
  const d = clone(); d.style.character.lighting = '   ';
  ok(fails(d, 'style-blocks'), '角色那块缺光照击穿 style-blocks');
}
{
  const d = clone(); d.style.scene.tags = [];
  ok(fails(d, 'style-blocks'), '场景那块标签为空数组击穿 style-blocks');
}
{
  const d = clone(); delete d.style.scene;
  ok(fails(d, 'style-blocks'), '整块缺失击穿 style-blocks');
}
{
  const d = clone(); d.style.character.surface = '毛孔、碎发、布料织纹';
  ok((gate(d, 'style-blocks').status !== 'fail'), '正文写成中文不拦——画风正文的语言由下游出图 skill 的英文门去查，这里只查填没填');
}
eq(Object.keys(STYLE_BLOCKS).join(','), 'character,scene', '画风分两块：人一套、环境一套');
ok(STYLE_BLOCKS.character.includes('lighting'), '角色那块多一个光照——给单张角色插画使用');
ok(!STYLE_BLOCKS.scene.includes('lighting'), '场景那块没有光照——光照状态是 mint-art 逐个场景自己定的');

{
  const d = clone(); d.style.phrase = '';
  ok(fails(d, 'style-blocks'), '缺画风短语仍然拦截——Seedance 指南需要它');
  d.style.phrase = '电影感';
  ok(fails(d, 'style-blocks'), '画风短语仍要求英文');
  eq(resolveStage(PORTRAIT, 'video').style.phrase, PORTRAIT.style.phrase, '视频阶段取得原始画风短语');
  ok(renderMarkdown(PORTRAIT).includes('| 画风短语 | cinematic film still |'), '参数表保留画风短语');
}

// 8 style-coherent —— 正向要的词不许同时出现在反向词里
{
  const d = clone(); d.style.character.negative += ', photorealistic';
  ok(fails(d, 'style-coherent'), '写实画风把 photorealistic 禁掉击穿 style-coherent——一边要真实感一边禁真实感');
  ok(/photorealistic/.test(gate(d, 'style-coherent').detail), '点名是哪个词自相矛盾');
  ok(/character/.test(gate(d, 'style-coherent').detail), '点名是哪一块');
}
{
  const d = clone(LANDSCAPE); d.style.scene.negative += ', watercolour';
  ok(fails(d, 'style-coherent'), '吉卜力把自己的 watercolour 禁掉同样击穿——这道门不认识任何一档具体画风');
}
{
  const d = clone(); d.style.scene.tags.push('warped perspective');
  ok(fails(d, 'style-coherent'), '把反向词加进 tags 也算矛盾——tags 也是正向的');
}
{
  const d = clone();
  ok(/text/.test(d.style.character.negative), '写实画风的反向词里确实有 text');
  ok((gate(d, 'style-coherent').status !== 'fail'), 'negative 里的 text 不该被 surface 里的 micro-texture 命中——误报的门比没有门更坏');
}
eq(negativeTerms('a, photorealistic; 3d render').join('|'), 'photorealistic|3d render', '反向词按逗号分号拆，太短的丢掉');
eq(negativeTerms('').length, 0, '空反向词拆不出东西');
ok(mentionsTerm('Photorealistic portrait of an actor', 'photorealistic'), '整词命中，大小写不敏感');
ok(!mentionsTerm('no micro-texture anywhere', 'text'), 'texture 不算 text');
ok(mentionsTerm('no visible text, no watermark', 'text'), '真的 text 还是命中');
ok(!mentionsTerm('grounded architectural perspective', 'warped perspective'), '短语要整条对上，不是沾一个词就算');

/* ---------------- resolve ---------------- */

{
  const r = resolveStage(PORTRAIT, 'characters');
  eq(r.resolution, '2K', '角色阶段拿的是 asset 档位');
  eq(r.aspectRatio, '16:9', '角色阶段拿的是 asset 比例');
  eq(r.inputData.aspect_ratio, '16:9', 'inputData 使用 lingying 的字段名');
  eq(r.inputData.resolution, '2K', '档位原样进 inputData，不折算像素');
  eq(Object.keys(r.inputData).join(','), 'aspect_ratio,resolution', 'inputData 只有这两个键，prompt 由调用方补');
  eq(r.skill, GENERATION_SKILLS.image, 'resolve 说明外部生图 skill');
  ok(r.command.includes('image.mjs models --model'), '出图阶段先发现实时模型，不直接生成');
}
{
  const d = clone(); d.image.asset.resolution = '2k';
  const r = resolveStage(d, 'characters');
  eq(r.resolution, '2k', '顶层 resolution 是真源，原样给出');
  eq(r.inputData.resolution, '2K', 'inputData 回填成枚举里的写法——网关只认 2K');
}
{
  const d = clone(); d.video.resolution = '768P';
  eq(resolveStage(d, 'video').inputData.resolution, '768p', '视频档位同样回填');
}
{
  const d = clone(); d.image.asset.resolution = '8K';
  eq(resolveStage(d, 'characters').inputData.resolution, '8K', '对不上枚举就原样带过去，由网关去拒');
}
{
  const r = resolveStage(PORTRAIT, 'characters');
  eq(r.resolution, '2K', '角色阶段拿的是 asset 档位');
  eq(r.aspectRatio, '16:9', '角色阶段拿的是 asset 比例');
  eq(r.what, '角色设定图', '角色阶段说清了要出什么');
}

// 画风只给这一段要的那一块：整个对象摊开有六七十行，全倒出来会把有用的几行埋掉
{
  const r = resolveStage(PORTRAIT, 'characters');
  eq(Object.keys(r.style).join(','), 'label,phrase,character', '角色阶段只拿角色那一块');
  eq(r.style.character.lighting, PORTRAIT.style.character.lighting, '拿到的是原文，不是摘要');
  eq(r.style.scene, undefined, '角色阶段不给场景那一块——给了容易抄错块');
}
{
  const r = resolveStage(PORTRAIT, 'art');
  eq(Object.keys(r.style).join(','), 'label,phrase,scene', '场景阶段只拿场景那一块');
  eq(r.style.character, undefined, '场景阶段不给角色那一块');
}
{
  const r = resolveStage(PORTRAIT, 'video');
  eq(Object.keys(r.style).join(','), 'label,phrase', '视频阶段保留画风名称与短语供模型指南使用');
}
{
  const r = resolveStage({ schemaVersion: 3 }, 'characters');
  eq(Object.keys(r.style).join(','), 'label,phrase,character', '没填画风也给得出形状，值是空的');
  eq(Object.keys(r.style.label).length, 0, '没填画风名则返回空对象');
}
eq(resolveStage(PORTRAIT, 'art').aspectRatio, '16:9', '场景阶段与角色阶段同用资产图参数');
{
  const r = resolveStage(PORTRAIT, 'video');
  eq(r.resolution, '768p', '视频阶段带上 resolution');
  eq(r.aspectRatio, '9:16', '视频阶段带上 aspect_ratio');
  eq(r.promptLang, 'en', '视频阶段带上提示词语言');
  eq(r.durationRange.max, 15, '视频阶段带上单段时长上限');
  eq(r.inputData.duration, undefined, 'duration 逐段不同，不在这里定');
  eq(r.skill, GENERATION_SKILLS.video, '视频阶段使用 ly-video');
  ok(r.command.includes('video.mjs models --model'), '视频阶段先发现实时模型');
}
{
  const r = resolveStage(LANDSCAPE, 'video');
  eq(Object.keys(r.inputData).join(','), 'aspect_ratio,resolution', 'inputData 只有两个通用字段——模型特有的参数由下单方按 input_schema 补');
  eq(r.durationRange.min, 4, 'seedance 的下限跟着模型走');
}
{
  let threw = false;
  try { resolveStage(PORTRAIT, 'script'); } catch { threw = true; }
  ok(threw, '不出图的阶段没有出图参数，直接抛错');
}
eq(Object.keys(STAGES).join(','), 'characters,art,video', '三个消费端');

/* ---------------- 向上查找 ---------------- */

{
  const root = mkdtempSync(join(tmpdir(), 'mint-setup-'));
  const deep = join(root, 'work', 'creation', 'E01-01');
  mkdirSync(deep, { recursive: true });
  writeFileSync(join(root, 'work', PRODUCTION_FILE), JSON.stringify(PORTRAIT));

  eq(findProduction(deep), join(root, 'work', PRODUCTION_FILE), '从投产包目录向上找得到工作目录根的参数');
  eq(findProduction(join(root, 'work')), join(root, 'work', PRODUCTION_FILE), '就在当前目录也找得到');
  eq(findProduction(root), null, '工作目录之上找不到——不越界往用户主目录爬');
  eq(findProduction(deep, 1), null, '限制层数就找不到了');
  ok(LOOKUP_DEPTH >= 3, '默认层数够穿过 <工作目录>/<段>/<投产包>');
  rmSync(root, { recursive: true, force: true });
}

/* ---------------- 渲染 ---------------- */

{
  const md = renderMarkdown(PORTRAIT);
  ok(md.includes('# 生产参数 · 回南天'), '参数表带剧名');
  ok(!md.includes('分镜图'), '参数表不再列出分镜图参数');
  ok(md.includes('| 资产图分辨率 | 2K |'), '档位原样显示，没有像素');
  ok(!/参考像素/.test(md), '参数表里不再有参考像素——档位就是下给模型的值');
  ok(md.includes('| 视频 aspect_ratio | 9:16 |'), '参数表用视频模型的字段名');
  ok(md.includes('| 视频 resolution | 768p |'), '视频分辨率原样显示');
  ok(Object.values(GENERATION_SKILLS).every(s => md.includes(s)), '说明两个外部生成 skill');
  ok(md.includes('| 自动驾驶 | 关闭（该问就问） |'), '参数表把自动驾驶摆出来——它决定这一趟会不会停下来问');
  ok(md.includes('## 质量门'), '参数表带质量门');
  ok(md.includes('| 画风 | 真人实拍 |'), '参数表显示画风名称');
  ok(md.split('\n').filter((l) => l.startsWith('- ✓')).length === 9, '八道门全绿');
}
{
  const d = clone(); d.video.model = '';
  const md = renderMarkdown(d);
  ok(md.includes('- ✗'), '有门没过就标红');
  ok(md.includes('1 道门没过'), '结尾点清没过几道');
  ok(md.includes('| 生视频模型 | — |'), '空值渲染成破折号不是空白');
}
{
  const md = renderMarkdown(LANDSCAPE);
  ok(md.includes('| 视频 resolution | 1080p |'), '横屏样例的视频档位也原样显示');
  ok(md.includes('| 自动驾驶 | 开启（下游跑完整段不打断） |'), '开着的时候参数表说清后果');
}

/* ---------------- 能力表的自律 ---------------- */
/*
 * 每条都必须注明取数命令——这张表以前视频侧是空的，理由是「凭记忆编一张
 * 比不查更坏」。改走 lingying 之后依据有了（model get 本机可查），
 * 所以表可以填，但**出处不许省**：过期了重新跑一次就能对账。
 */

for (const [name, m] of Object.entries({ ...IMAGE_MODELS, ...VIDEO_MODELS })) {
  ok(m.source.includes('历史 CLI 采集'), `${name} 明确历史快照来源`);
  ok(m.modelId.length === 36, `${name} 保留采集模型 UUID`);
  ok(m.resolutions.length > 0 && m.aspectRatios.length > 0, `${name} 枚举非空`);
}
ok(Object.keys(IMAGE_MODELS).includes('nanobanana2'), '生图能力表收了 nanobanana2');
ok(Object.keys(VIDEO_MODELS).includes('MiniMax H3'), '生视频能力表收了 MiniMax H3——分镜的 H3 提示词就是给它的');
eq(Object.values(GENERATION_SKILLS).join(','), 'ly-image,ly-video', '按类型交给外部 skill');
eq(SUPPORTED_LANGS.join(','), 'zh,en', '语言枚举与五个 skill 的报告语言对齐');
eq(styleLabelOf(null), '未填', '没有画风就说没填，不编一个名字出来');
eq(styleLabelOf({ label: { zh: '水墨' } }, 'en'), '水墨', '没写英文名就回落中文名');
eq(styleLabelOf(emptyStyle(), 'en'), '(unset)', '空骨架在英文界面也说得清');

console.log(`✓ ${passed} 项自测全部通过`);
