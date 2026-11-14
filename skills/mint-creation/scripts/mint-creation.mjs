#!/usr/bin/env node
import {assetDigest, assetSourceRefs, assetsOf, mappedAssetId, mappingErrors, assetContractErrors, requiredMappings} from './lib/asset-mapping.mjs';
// mint-creation — deterministic helpers for the mint-creation skill (参考图直出视频).
// Zero dependencies on purpose: the skill must work in any directory
// without an npm install. Node 18+ (stdlib only).

import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { projectProblems, scriptParams, endPosition, episodeIntent } from './lib/document.mjs';
import { verifySources } from './lib/source.mjs';
import { playbackProblems } from './lib/playback.mjs';
import { parsePrompt, promptProblems, promptTimecode } from './lib/prompt.mjs';
export { TIMECODE_RE } from './lib/prompt.mjs';
import { shapeProblems, scriptProblems, outlineProblems, reconcile, beatSeconds } from './lib/contracts.mjs';
export { beatSeconds } from './lib/contracts.mjs';
export const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const isBlocking = g => g.status === 'fail' && g.level === 'error' && g.category !== 'source';
const gateResult = (id, label, errors = [], extra = {}) => ({
  id, label, category: 'base', level: 'error', status: errors.length ? 'fail' : 'pass',
  messages: errors, detail: errors.join('；'), ...extra,
});
export function checkup(doc, ctx = {}) {
  const gates = gateReport(doc, ctx);
  return { gates, blocking: gates.filter(isBlocking).length,
    warnings: gates.filter(g => g.status === 'fail' && g.level === 'warn').length,
    skipped: gates.filter(g => g.status === 'skipped').length, contentReview: 'not-performed' };
}
import { mediaPlan, checkPlanFlags, printPlan } from './lib/media-plan.mjs';
import { parseStoryboard, storyboardErrors, storyboardSegments, storyboardPathOf } from './lib/storyboard.mjs';
import { parseWorksheet, serializeWorksheet, approvalProblem, inputProblem, submitProblems, submittedText, recordVerdict, stable, MAX_ROUNDS, VERDICTS, reviewItems } from './lib/worksheet.mjs';

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */
/*
 * 两层结构：段（segment）＝ 一次视频生成调用，上限是视频模型单段时长；
 * 分镜（cut）＝ 段内的一次剪切，表达时长由故事与表演需要决定。分镜下面**没有关键帧这一层**：段直接
 * 挂载 mint-characters / mint-art 已经生成落盘的设定图，写一条通用视频提示词，
 * 从 seed 到下单不产生任何新的图像生成调用。
 */

export const DEFAULT_PARAMS = {
  maxSegmentSeconds: 15, // 视频模型单段生成上限（秒）
  maxOnScreen: 3,        // 单个分镜同框人数上限，超了必须带拆解说明
  tolerance: 0.15,       // 每集总时长对剧本目标的容差
};

export function paramsOf(doc) {
  return { ...DEFAULT_PARAMS, ...(doc?.params ?? {}) };
}

/* ------------------------------------------------------------------ */
/* 生产参数（production.json）                                          */
/* ------------------------------------------------------------------ */
/*
 * 这十几行查找逻辑在每个消费生产参数的 skill 里都是**有意重复**的：本 skill
 * 必须能整个拷走单独跑，不 import 任何兄弟 skill 的代码，读的只是工作目录根
 * 那份 JSON。找不到不是错误——照旧用内置默认值，但校验输出里必须明说哪几道门跳过了。
 */

export const PRODUCTION_FILE = 'production.json';
export const PRODUCTION_DEPTH = 5;

export function findProduction(fromDir = '.', depth = PRODUCTION_DEPTH) {
  let dir = resolve(fromDir);
  for (let i = 0; i <= depth; i++) {
    const hit = resolve(dir, PRODUCTION_FILE);
    // lstat detects dangling symlinks; unreadable entries must not become "missing".
    try { lstatSync(hit); return hit; }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    const up = dirname(dir);
    if (up === dir) break; // 到根了
    dir = up;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 自动驾驶                                                            */
/* ------------------------------------------------------------------ */
/*
 * production.json 顶层的 autopilot。为 true 时本 skill 的全部流程一口气跑完：
 * 提示词按 video.model 自己分流、下单前的花费预估照样报出来但不等回应，
 * 做过的决定全部写进最后的汇报。
 *
 * 转移的是**审批权**，不是取消检查点：基础和模型技术检查照样执行、花费照样先算清楚、
 * 同一段连着失败两次照样跳过——**不打断不等于无限重试烧钱**。
 *
 * **只认布尔真值**：JSON 里写成字符串 "false" 在 JS 里是真的，那种写法会让
 * 一整条管线闷头跑完，比没写更坏。mint-setup 的 fields 门查这个类型。
 */

export const autopilotOf = (production) => production?.autopilot === true;

/** 开着才打印——关着就是原来的样子，没有新信息。 */
export const AUTOPILOT_NOTE =
  '自动驾驶：开——本段流程一口气跑完，不要停下来问用户；花费照样报出来不等回应，失败的止损不变';

/** 本 skill 的产物该住的段目录名。 */
export const STAGE_DIR = 'creation';

/** 落点不对就返回一句人读的提示；落点对了、或无从判断，返回 null。 */
export function stageDirNote(docPath, productionPath, stage = STAGE_DIR) {
  if (!docPath || !productionPath) return null;
  const want = resolve(dirname(resolve(productionPath)), stage);
  const got = dirname(resolve(docPath));
  if (got === want) return null;
  return `产物落在 ${got}，按工作目录约定该住在 ${want}——每个 skill 的产物归自己的段目录，放错了合并报告的 --from 自动发现找不到它`;
}

export const SKIP_PROD = `未找到 ${PRODUCTION_FILE}（向上 ${PRODUCTION_DEPTH} 层），本门跳过——跑 /mint-setup 生成一份可以打开它`;

export const brief = (list, n = 6) =>
  list.length <= n ? list.join('；') : `${list.slice(0, n).join('；')}；……等 ${list.length} 处`;

/** 视频模型：creation.json 自己不写就继承生产参数，都没有就按默认模型算。 */
export const DEFAULT_VIDEO_MODEL = 'MiniMax H3';
export const videoModelOf = (doc, production = null) =>
  doc?.video?.model ?? production?.video?.model ?? DEFAULT_VIDEO_MODEL;

/* 模型族只选择技术适配说明与事件时间轴检查；所有模型统一五部分散文。 */
export function promptFamilyOf(model) {
  return /seedance/i.test(String(model ?? '')) ? 'seedance' : 'h3';
}
export const FAMILY_LABEL = { h3: 'MiniMax H3', seedance: 'seedance 系列' };

/*
 * 填法指南按模型动态解出：骨架永远是 creation-prompt.md，这一份只改怎么填。
 * 指南文件在本 skill 与编写方 skill（mint-video-prompt）的 references 各有一份相同副本，
 * 仓库级自测核对一致；这里的文件名映射供调度时告诉编写方该读哪一份。
 * 注意它比 promptFamilyOf 严一档——promptFamilyOf 是「归不进 seedance 的都算
 * h3 族」（默认模型就是 H3），但**一个全新的模型不该被塞去读 MiniMax 的官方
 * 口径**：解不出指南就返回 null，照通用骨架写，别拿另一族的顶上。
 */
export const PROMPT_GUIDES = { h3: 'h3-prompt.md', seedance: 'seedance2-prompt.md' };
export function promptGuideOf(model) {
  const name = String(model ?? '').trim();
  if (promptFamilyOf(name) === 'seedance') return PROMPT_GUIDES.seedance;
  return !name || /minimax|\bh3\b/i.test(name) ? PROMPT_GUIDES.h3 : null;
}

/**
 * 时刻标记：seedance 官方明说「模型对精确时间（如 0–3 秒）的支持不稳定，
 * 强行限制时长可能导致生成结果异常」，所以选了它就一个时刻都不许写。
 * 检查中英数字秒数、区间、相对时刻与冒号时间码；不推断自然语言节奏。
 */


/** 默认中文五部分模板；显式语言设置保持继承，固定字段始终中文。 */
export const promptLangOf = (doc, production = null, family = 'h3') =>
  doc?.promptLang ?? production?.promptLang ?? 'zh';

/** schema v3 保留的内部计划景别枚举，不要求进入散文正文。 */
export const SHOT_SIZES = {
  'extreme-wide': { zh: '大远景', phrase: 'extreme wide shot' },
  wide: { zh: '全景', phrase: 'wide shot' },
  medium: { zh: '中景', phrase: 'medium shot' },
  close: { zh: '特写', phrase: 'close-up' },
  'extreme-close': { zh: '大特写', phrase: 'extreme close-up' },
};

/** 运镜枚举：通用摄影语汇（英文词沿用 H3 官方词表，中文词是 seedance 官方术语的词根），
 *  跨模型通用——不是任何一个模型的私有字段。 */
export const CAMERA_MOVES = {
  'Static Shot': '固定',
  'Push In': '推',
  'Pull Out': '拉',
  'Zoom In': '变焦推',
  'Zoom Out': '变焦拉',
  'Pan Left': '左摇',
  'Pan Right': '右摇',
  'Truck Left': '左移',
  'Truck Right': '右移',
  'Tilt Up': '仰摇',
  'Tilt Down': '俯摇',
  'Pedestal Up': '升',
  'Pedestal Down': '降',
  'Arc Shot': '环绕',
  'Tracking Shot': '跟拍',
  'Shake Slightly': '轻微晃动',
  'Shake Strongly': '强烈晃动',
  'POV': '主观视角',
  'Roll Clockwise': '顺旋',
  'Roll Counterclockwise': '逆旋',
};

const r1 = (n) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------------ */
/* 视频模型时长边界                                                     */
/* ------------------------------------------------------------------ */
/*
 * 只含 5 个视频模型的 duration {min,max}，从
 * skills/mint-setup/scripts/mint-setup.mjs 的 VIDEO_MODELS 手抄——
 * mint-setup 改了这张表，这里要跟着改；不 import，理由见上面的查找逻辑注释：
 * 小段确定性逻辑各 skill 各自拷一份，是本仓库对「自包含」的既有解法。
 */
export const VIDEO_DURATION_BOUNDS = {
  'MiniMax H3': { min: 5, max: 15 },
  'seedance2.5': { min: 4, max: 30 },
  'seedance2.0': { min: 4, max: 15 },
  'seedance2.0 fast': { min: 4, max: 15 },
  'seedance2.0 mini': { min: 4, max: 15 },
};

/** 合法段秒数向上取整；短段补足下限，超上限拒绝，绝不截短故事。 */
export function clampDuration(seconds, model) {
  const bounds = VIDEO_DURATION_BOUNDS[model] ?? null;
  const raw = seconds;
  if (!Number.isFinite(raw) || raw <= 0) return { duration: null, note: '段秒数不是正数，折不出 duration' };
  let value = Math.ceil(raw);
  const notes = [];
  if (value !== raw) notes.push(`${raw} 秒向上取整到 ${value} 秒`);
  if (bounds && value < bounds.min) {
    notes.push(`低于 ${model} 下限 ${bounds.min} 秒，按 ${bounds.min} 秒下单（片尾多出的部分剪辑时裁掉）`);
    value = bounds.min;
  }
  if (bounds && value > bounds.max) {
    return { duration: null, note: `超过 ${model} 上限 ${bounds.max} 秒；请重新拆段、校验并导出，禁止截短下单` };
  }
  return { duration: value, note: notes.join('；') };
}

/* ------------------------------------------------------------------ */
/* 剧本节拍展开                                                          */
/* ------------------------------------------------------------------ */
/*
 * 计秒规则与剧本一致（台词按字数 ÷ 语速、动作按固定秒数，参数从 script.params
 * 继承），这里刻意重新实现而不是跨目录 import——本 skill 必须自包含、可以单独拷走。
 */

export function expandScript(script) {
  const p = scriptParams(script);
  const eps = new Map();
  for (const ep of script?.episodes ?? []) {
    const scenes = (ep?.scenes ?? []).map((sc, i) => ({
      sceneIndex: i + 1,
      sceneId: sc.sceneId,
      lighting: sc.lighting ?? '',
      characters: sc.characters ?? [],
      props: sc.props ?? [],
      ...(sc.sourceRefs ? {sourceRefs: structuredClone(sc.sourceRefs)} : {}),
      ...(sc.notes ? {notes: structuredClone(sc.notes)} : {}),
      beats: (sc.flow ?? []).map((b, j) => {

        const kind = ['action','line','subtitle','sound'].find(k => typeof b?.[k] === 'string');
        return {
          n: j + 1, kind, seconds: beatSeconds(b, p), text: b?.[kind],
          ...(kind === 'line' ? {speaker:b.speaker, ...(b.delivery ? {delivery:b.delivery} : {})} : {}),
          ...Object.fromEntries(['sourceRefs','audio','transformation'].filter(k => b?.[k] !== undefined).map(k => [k,structuredClone(b[k])])),
        };
      }),
    }));
    eps.set(ep.ep, { ep: ep.ep, targetSeconds: ep.targetSeconds, opening: ep.opening, ending: ep.ending, openingBeat: ep.openingBeat, endBeat: endPosition(ep), scenes });
  }
  return eps;
}

export const segSeconds = (segment) => (segment?.cuts ?? []).reduce((n, c) =>
  Number.isFinite(c?.seconds) && c.seconds > 0 ? n + c.seconds : NaN, 0);

/* ------------------------------------------------------------------ */
/* 镜头配方卡库（可选挂载）——只读卡片 frontmatter 的受限字段              */
/* ------------------------------------------------------------------ */

const RECIPE_FIELDS = new Set(['id', 'name', 'name_en', 'cuts', 'must_phrases', 'sizes', 'cameras']);
const unquote = (s) => String(s).replace(/^['"](.*)['"]$/, '$1').trim();

export function parseCardFields(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text ?? ''));
  if (!m) return null;
  const card = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (!kv || !RECIPE_FIELDS.has(kv[1])) continue;
    const v = kv[2].trim();
    if (v.startsWith('[')) {
      const inner = v.replace(/^\[/, '').replace(/\]$/, '').trim();
      card[kv[1]] = inner
        ? inner.split(',').map(unquote).filter((x) => x !== '').map((x) => (/^-?\d+$/.test(x) ? Number(x) : x))
        : [];
    } else {
      card[kv[1]] = unquote(v);
    }
  }
  return card.id ? card : null;
}

export function loadRecipes(dir) {
  const root = resolve(dir);
  const cards = new Map();
  if (!existsSync(root)) return cards;
  for (const f of readdirSync(root).filter((x) => x.endsWith('.md')).sort()) {
    const card = parseCardFields(readFileSync(join(root, f), 'utf8'));
    if (card) cards.set(card.id, card);
  }
  return cards;
}

export function recipeDrift(cut, card) {
  const sizes = Array.isArray(card?.sizes) ? card.sizes : [];
  const cameras = Array.isArray(card?.cameras) ? card.cameras : [];
  return {
    sizes: sizes.length && !sizes.includes(cut?.size) ? sizes : [],
    cameras: cameras.length && !cameras.includes(cut?.camera) ? cameras : [],
  };
}

/* ------------------------------------------------------------------ */
/* id → 名字、名字 → 参考图路径                                          */
/* ------------------------------------------------------------------ */
// script IDs are local. cast/art alone own asset identities.

export function slug(name) {
  const cleaned = String(name)
    .trim()
    .replace(/[\s/\\:*?"<>|·]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'creation';
}

function characterAssets(ctx) { return ctx.cast?.characters ?? []; }
function mappedAsset(ctx,kind,id) {
  if (!ctx.script) return null;
  if (mappingErrors(ctx.script,ctx,[{kind,localId:id}]).length) return null;
  return assetsOf(ctx,kind).find(a=>a.id===mappedAssetId(ctx.script,kind,id)) ?? null;
}
function imageAssetId(ctx,kind,id) { return mappedAssetId(ctx.script,kind,id); }

export function namer(ctx = {}, voLabel = '画外音') {
  const name = (kind,id) => mappedAsset(ctx,kind,id)?.name ?? null;
  return {
    char: id => id === 'VO' ? voLabel : name('character',id) ?? id,
    scene: id => name('scene',id) ?? id,
    prop: id => name('prop',id) ?? id,
    nameOf: name,
  };
}

/** kind 由编号前缀判断：C=角色、S=场景、P=道具。 */
export function kindOfId(id) {
  const c = String(id ?? '').charAt(0);
  return c === 'C' ? 'character' : c === 'P' ? 'prop' : 'scene';
}

/** 名字 → 参考图相对路径（相对 creation/ 目录，与 characters/、art/ 平级）。纯函数，不碰文件系统。 */
export function referenceImagePath(kind, name, id = null, ctx = {}) {
  const assets = kind === 'character'
    ? ctx.cast?.characters ?? []
    : [...(ctx.art?.scenes ?? []), ...(ctx.art?.props ?? [])];
  const asset=assets.find(x=>x.id===id);
  // The owning stage's file contract wins. Formal cast sheets are keyed by
  // stable C ID; art pins imageStem or sheetImage.
  if(kind!=='character' && asset?.sheetImage) {
    if(isAbsolute(asset.sheetImage)) return asset.sheetImage;
    return ctx.artPath ? resolve(dirname(ctx.artPath),asset.sheetImage) : `../art/${asset.sheetImage}`;
  }
  if(kind==='character' && ctx.cast?.kind==='mint-characters' && id) return `../characters/images/${id}-sheet.png`;
  const stem = slug(name);
  const filename = asset?.imageStem ? slug(asset.imageStem) : id && assets.filter(x => slug(x.name) === stem).length > 1 ? `${id}-${stem}` : stem;
  return `../${kind === 'character' ? 'characters' : 'art'}/images/${filename}-sheet.png`;
}

/** 拼路径 + 查文件是否存在，CLI 层直接可用的便捷封装。 */
export function resolveReferenceImage(kind, name, workDir = '.', { existsImpl = existsSync, id = null, ctx = {} } = {}) {
  const path = referenceImagePath(kind, name, id, ctx);
  return { path, exists: existsImpl(resolve(workDir, path)) };
}

/* ------------------------------------------------------------------ */
/* 质量门                                                               */
/* ------------------------------------------------------------------ */
/* 保留上游、来源、身份、节拍覆盖和时长检查。
 * size-phrase/camera-phrase 只查内部枚举；refimage-labeled 查五部分格式和图片引用。
 * 正文因果、人设和实际切镜质量由独立审核与成片验证判断。
 */
export function gateReport(doc, ctx = {}) {
  const errors = shapeProblems(doc);
  errors.push(...projectProblems(doc, ctx));
  if (ctx.production?.video !== undefined && (!ctx.production.video || typeof ctx.production.video !== 'object' || typeof ctx.production.video.model !== 'string' || !ctx.production.video.model.trim())) errors.push('production.video.model 非法');
  const gates = [gateResult('fields', '基础字段与当前有效参数', errors)];
  let upstreamValid = true;
  for (const key of ['cast','art']) {
    const issues = ctx[key] === undefined ? [] : assetContractErrors(ctx[key],key,ctx.script?.source ?? doc?.source);
    upstreamValid &&= !issues.length;
    gates.push(gateResult(key+'-contract',key+' 资产契约',issues,ctx[key]===undefined?{status:'skipped',reason:'missing-upstream'}:{}));
  }
  for (const [key, validate] of [['script', scriptProblems], ['outline', outlineProblems]]) {
    if (ctx[key] === undefined) gates.push(gateResult(key + '-contract', key + (key === 'outline' ? ' v5 契约' : ' v4 契约'), [], {status:'skipped', reason:'missing-upstream'}));
    else {
      let issues;
      try { issues = validate(ctx[key]); } catch (error) { issues = [`${key} 数据结构损坏：${error.message}`]; }
      upstreamValid &&= !issues.length;
      gates.push(gateResult(key + '-contract', key + (key === 'outline' ? ' v5 契约' : ' v4 契约'), issues));
    }
  }
  gates.push(gateResult('project-contract', '项目 v3 契约与唯一创作要求', projectProblems(doc, ctx), ctx.production === undefined ? {status:'skipped',reason:'missing-upstream'} : {}));
  if (!upstreamValid) return gates;
  for (const key of ['script','outline','cast','art']) if (ctx[key]?.provenance) {
    if (!ctx[key + 'Path']) gates.push(gateResult(key + '-source', '来源字节与坐标核验（非语义审核）', [], {status:'skipped',reason:'missing-source-path'}));
    else {
      let issues = [];
      try { verifySources(ctx[key],ctx[key + 'Path']); } catch (e) { issues = [e.message]; }
      gates.push(gateResult(key + '-source', '来源字节与坐标核验（非语义审核）', issues));
    }
  }
  if (!errors.length) {
    const issues = reconcile(doc, ctx.script, ctx.outline);
    gates.push(gateResult('upstream-intent', '开场／集尾／节点与目标时长对账', issues,
      !issues.length && ctx.script === undefined ? {status:'skipped',reason:'missing-upstream',detail:'未提供剧本，只检查了本地连续认领；上游计划与实际结束坐标未核验'} : {}));
  }
  try { gates.push(storyboardGate(doc, ctx)); }
  catch (e) { gates.push(gateResult('storyboard', '按分镜分段', [`分镜无法核对：${e.message}`])); }
  if (!doc || !Array.isArray(doc.episodes) || doc.episodes.some(ep=>!ep || !Array.isArray(ep.segments) || ep.segments.some(seg=>!seg || !Array.isArray(seg.cuts) || !Array.isArray(seg.images)))) return gates;
  let required = [];
  try { required = doc.episodes.flatMap(ep=>{const scenes=ctx.script?.episodes?.find(e=>e.ep===ep.ep)?.scenes??[];return ep.segments.flatMap(seg=>requiredMappings(seg,scenes[seg.sceneIndex-1],scenes));}); }
  catch (e) { gates.push(gateResult('asset-mappings','制作引用形状非法',[e.message])); return gates; }
  gates.push(gateResult('asset-mappings','实际制作引用的显式资产映射',ctx.script ? mappingErrors(ctx.script,ctx,required) : [],ctx.script===undefined?{status:'skipped',reason:'missing-upstream'}:{}));
  try { gates.push(...technicalGates(doc, ctx)); }
  catch (e) { gates.push(gateResult('data-shape', '数据形状无法继续检查', [e.message])); }
  return gates;
}

/**
 * 分镜由 script 阶段产出（剧本 JSON 旁边的 xxx-storyboard.md）。提供时，分镜本身先对照剧本做确定性检查，
 * 再要求每集已有的段与分镜的段号、场次、节拍范围逐段一致；分镜单段上限不能超过制作单段上限。
 * 没有分镜时跳过，不计为通过。
 */
export function storyboardGate(doc, ctx = {}) {
  const label = '按分镜分段（段号、场次与节拍范围对账 script 分镜）';
  if (ctx.storyboard === undefined) return gateResult('storyboard', label, [], {status:'skipped', reason:'missing-upstream', detail:'没有找到剧本旁边的分镜文件，分段未按分镜核对'});
  if (ctx.script === undefined) return gateResult('storyboard', label, [], {status:'skipped', reason:'missing-upstream', detail:'没有剧本，无法核对分镜'});
  const errors = storyboardErrors(ctx.storyboard, ctx.script, scriptParams(ctx.script)).errors.map(e => `分镜：${e}`);
  const limit = ctx.storyboard.header?.limit, max = paramsOf(doc).maxSegmentSeconds;
  if (limit > max) errors.push(`分镜单段上限 ${limit} 秒超过制作单段上限 ${max} 秒——回到 script 阶段按 ${max} 秒重新拆段`);
  const planned = storyboardSegments(ctx.storyboard);
  const fmt = x => `${x.id}（第 ${x.sceneIndex} 场 ${x.beats ? x.beats.join('–') : '无节拍'}）`;
  for (const ep of Array.isArray(doc?.episodes) ? doc.episodes : []) {
    const segments = Array.isArray(ep?.segments) ? ep.segments : [];
    if (!segments.length) continue;
    const want = planned.filter(s => s.ep === ep.ep).map(s => ({ id: s.id, sceneIndex: s.sceneIndex, beats: s.beats }));
    const have = segments.map(seg => {
      const beats = (Array.isArray(seg?.cuts) ? seg.cuts : []).flatMap(c => Array.isArray(c?.beats) ? c.beats : []).filter(Number.isInteger);
      return { id: seg?.id, sceneIndex: seg?.sceneIndex, beats: beats.length ? [Math.min(...beats), Math.max(...beats)] : null };
    });
    if (stable(want) !== stable(have)) errors.push(`第 ${ep.ep} 集的分段应与分镜一致：分镜为 ${want.map(fmt).join('、') || '无'}；实际为 ${have.map(fmt).join('、')}`);
  }
  return gateResult('storyboard', label, errors);
}

/** 输入材料中本集的分镜：编写方据此分段与写正文，审核方据此审核，批准绑定所在段的条目。 */
export function storyboardBrief(storyboard, epNo) {
  return { limit: storyboard.header.limit, pending: storyboard.header.pending,
    segments: storyboard.scenes.filter(s => s.ep === epNo).flatMap(s => s.segments.map(seg => ({
      id: seg.id, sceneIndex: seg.sceneIndex, beats: seg.beats, progress: seg.progress, scenePending: s.pending, script: seg.script, fields: seg.fields }))) };
}

function technicalGates(doc, ctx = {}) {
  const gates = [];
  const add = (id, label, passed, detail = '') => gates.push(gateResult(id, label, passed ? [] : [detail || label], {detail}));

  const params = paramsOf(doc);
  const script = ctx.script ?? null;
  const expanded = script ? expandScript(script) : null;
  const eps = Array.isArray(doc?.episodes) ? doc.episodes : [];
  const bad = {
    coverage: [], segCap: [], segCapModel: [], cutLen: [], fit: [], duration: [], crowd: [],
    id: [], size: [], camera: [], dlgVerbatim: [], lang: [], names: [], refs: [],
    recipe: [], refCoverage: [], refLabeled: [], modelFit: [],
  };
  const recipes = ctx.recipes ?? null;
  let recipeRefs = 0;
  const production = ctx.production ?? null;
  // 骨架是模型无关的，但填法要跟着挂的模型走：默认语言、以及 seedance 的时刻禁令
  const videoModel = videoModelOf(doc, production);
  const family = promptFamilyOf(videoModel);
  const promptLang = promptLangOf(doc, production, family);
  const imageExists = ctx.imageExists ?? (() => false);
  const haveNames = !!(ctx.cast || ctx.art);
  const n = namer(ctx);

  for (const ep of eps) {
    const label = `E${String(ep?.ep).padStart(2, '0')}`;
    const sEp = expanded?.get(ep?.ep);
    if (expanded && !sEp) bad.refs.push(`${label} 在剧本里不存在`);

    (ep?.segments ?? []).forEach((seg, i) => {
      const want = `${label}-${String(i + 1).padStart(2, '0')}`;
      if (seg?.id !== want) bad.id.push(`第 ${i + 1} 段应为 ${want}，实际「${seg?.id}」`);
    });

    let prevSceneIndex = 0;
    for (const seg of ep?.segments ?? []) {
      const sid = seg?.id ?? '?';
      const cuts = seg?.cuts ?? [];
      const total = segSeconds(seg);

      if (!Number.isFinite(total) || !(total > 0) || total > params.maxSegmentSeconds) {
        bad.segCap.push(`${sid} 共 ${total} 秒`);
      }
      {
        const bounds = VIDEO_DURATION_BOUNDS[videoModel];
        if (bounds && (!Number.isFinite(total) || total < bounds.min || total > bounds.max)) {
          bad.segCapModel.push(`${sid} 共 ${total} 秒，超出 ${videoModel} 的时长区间 ${bounds.min}–${bounds.max} 秒`);
        }
      }

      const prompt = String(seg?.prompt ?? '');
      const prose = parsePrompt(prompt).body;
      bad.refLabeled.push(...promptProblems(prompt, seg.images ?? []).map(p => `${sid}：${p}`));
      if (!['en','zh'].includes(promptLang)) bad.lang.push(`${sid} promptLang 必须为 en 或 zh`);

      // seedance 的时刻禁令：骨架本来就不写秒数，但从多图按秒对齐那套提示词里
      // 搬东西、或者手动加「第 3 秒切到……」都会踩上去
      if (family === 'seedance') {
        const stamp = promptTimecode(prompt);
        if (stamp) {
          bad.modelFit.push(`${sid} 出现时刻「${stamp}」——${videoModel} 对精确时间的支持不稳定，秒数只留在 creation.json 里，不进提示词`);
        }
      }

      const images = Array.isArray(seg?.images) ? seg.images : [];
      for (const img of images) {
        const source = assetsOf(ctx,img.kind);
        if (source.length && !mappedAsset(ctx,img.kind,img.ref)) bad.refCoverage.push(`${sid} 挂载未知参考图 ${img.ref}`);
      }

      const scene = sEp ? sEp.scenes[seg?.sceneIndex - 1] : null;
      if (sEp && !scene) bad.refs.push(`${sid} 的 sceneIndex ${seg?.sceneIndex} 在剧本第 ${ep.ep} 集里不存在`);
      if (scene) {
        if (seg.sceneIndex < prevSceneIndex) bad.coverage.push(`${sid} 场次顺序倒退`);
        prevSceneIndex = Math.max(prevSceneIndex, seg.sceneIndex);
      }

      // Identity mappings cover actual cuts; image files are required only for mounted images.
      if (haveNames) {
        const need = new Map(images.map(img=>[img.ref,img.kind]));
        for (const [id, kind] of need) {
          const name = n.nameOf(kind, id);
          if (!name) {
            bad.refCoverage.push(`${sid} 引用的 ${id} 缺少有效 cast/art 映射，无法取得名字，解不出设定图路径`);
            continue;
          }
          const path = referenceImagePath(kind, name, imageAssetId(ctx,kind,id), ctx);
          if (!imageExists(path)) bad.refCoverage.push(`${sid} 的 ${id}（${name}）没有设定图：期望 ${path}`);
        }
      }

      cuts.forEach((cut, ci) => {
        const cid = `${sid}#${ci + 1}`;

        if ((cut?.characters ?? []).length > params.maxOnScreen && !String(cut?.note ?? seg?.note ?? '').trim()) {

          bad.crowd.push(`${cid} 同框 ${cut.characters.length} 人且没有拆解说明`);
        }
        // schema v3 的计划枚举，不要求正文逐镜对应。
        if (!SHOT_SIZES[cut?.size]) bad.size.push(`${cid} 景别「${cut?.size}」不在枚举里`);
        if (!CAMERA_MOVES[cut?.camera]) bad.camera.push(`${cid} 运镜「${cut?.camera}」不在词表里`);

        if (recipes && typeof cut?.recipe === 'string' && cut.recipe) {
          recipeRefs += 1;
          const card = recipes.get(cut.recipe);
          if (!card) {
            bad.recipe.push(`${cid} 引用的配方「${cut.recipe}」不在配方库里`);
          } else {
            const lower = prose.toLowerCase();
            for (const ph of card.must_phrases ?? []) {
              if (!lower.includes(String(ph).toLowerCase())) {
                bad.recipe.push(`${cid} 的正文缺配方「${card.name}」的必备短语「${ph}」`);
              }
            }
          }
        }

        if (scene) {
          const cast = new Set(scene.characters);
          for (const c of cut?.characters ?? []) {
            if (!cast.has(c)) bad.refs.push(`${cid} 的 ${c} 不在剧本该场人物里`);
          }
          const propSet = new Set(scene.props);
          for (const pr of cut?.props ?? []) {
            if (!propSet.has(pr)) bad.refs.push(`${cid} 的 ${pr} 不在剧本该场道具里`);
          }
          const [from, to] = cut?.beats ?? [];
          if (Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to <= scene.beats.length && from <= to) {
            let dlg = 0;
            for (const b of scene.beats.slice(from - 1, to)) {
              if (b.kind !== 'line') continue;
              if (b.seconds === null) bad.fit.push(`${cid} 台词估时无效，不能按零秒计算`);
              else dlg += b.seconds;
              if (!prose.includes(b.text)) bad.dlgVerbatim.push(`${sid} 的 prompt 缺台词「${b.text.slice(0, 12)}…」的原文`);
            }
            // Fit is checked once per episode with shared continuation capacity below.
          }
        }
      });

      // 多格配方靠连续同 id 的分镜表达，不是数组
      if (recipes) {
        for (let i = 0; i < cuts.length; ) {
          const rid = cuts[i]?.recipe;
          if (typeof rid !== 'string' || !rid) {
            i += 1;
            continue;
          }
          let j = i;
          while (j + 1 < cuts.length && cuts[j + 1]?.recipe === rid) j += 1;
          const card = recipes.get(rid);
          const min = Array.isArray(card?.cuts) ? card.cuts[0] : 0;
          const run = j - i + 1;
          if (min >= 2 && run < min) {
            bad.recipe.push(`${sid}#${i + 1} 的配方「${card.name}」要 ${min} 格连排，这里只有 ${run} 格——多格配方靠连续同 recipe 的分镜表达`);
          }
          i = j + 1;
        }
      }
    }

    if (sEp) bad.fit.push(...playbackProblems(ep, script.episodes.find(e => e.ep === ep.ep), b => beatSeconds(b, script.params)));

    // 节拍全覆盖：每场的节拍被恰好一次、按顺序、连续认领（分镜级）
    if (sEp) {
      for (const scene of sEp.scenes) {
        const claims = [];
        for (const seg of ep?.segments ?? []) {
          if (seg?.sceneIndex !== scene.sceneIndex) continue;
          (seg?.cuts ?? []).forEach((cut, ci) => {
            const [from, to] = cut?.beats ?? [];
            if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > scene.beats.length || from > to) {
              bad.coverage.push(`${seg.id}#${ci + 1} 的节拍区间 [${from}, ${to}] 不合法（该场共 ${scene.beats.length} 拍）`);
              return;
            }
            claims.push([from, to, `${seg.id}#${ci + 1}`]);
          });
        }
        let cursor = 1;
        for (const [from, to, id] of claims) {
          if (from !== cursor) {
            bad.coverage.push(`${label} 第 ${scene.sceneIndex} 场第 ${cursor} 拍${from > cursor ? '没人认领' : `被 ${id} 重复认领`}`);
          }
          cursor = Math.max(cursor, to + 1);
        }
        if (claims.length && cursor <= scene.beats.length) {
          bad.coverage.push(`${label} 第 ${scene.sceneIndex} 场第 ${cursor}–${scene.beats.length} 拍没人认领`);
        }
        if (!claims.length && scene.beats.length) {
          bad.coverage.push(`${label} 第 ${scene.sceneIndex} 场整场没有分镜`);
        }
      }

      if (sEp.targetSeconds > 0) {
        const total = (ep?.segments ?? []).reduce((n2, s) => n2 + segSeconds(s), 0);
        const lo = sEp.targetSeconds * (1 - params.tolerance);
        const hi = sEp.targetSeconds * (1 + params.tolerance);
        if (!Number.isFinite(total)) bad.duration.push(`${label} 总秒数无效，不能按零秒计算`);
        const epsilon = Number.EPSILON * Math.max(1, Math.abs(sEp.targetSeconds), Math.abs(total)) * 4;
        if (total < lo - epsilon) bad.duration.push(`${label} 欠 ${r1(lo - total)} 秒（${r1(total)}s / 目标 ${sEp.targetSeconds}s）`);
        if (total > hi + epsilon) bad.duration.push(`${label} 超 ${r1(total - hi)} 秒（${r1(total)}s / 目标 ${sEp.targetSeconds}s）`);
      }
    }
  }

  gates.push(gateResult('model-capability', '有效模型合法时长区间', bad.segCapModel,
    VIDEO_DURATION_BOUNDS[videoModel] ? {detail:bad.segCapModel.length ? bad.segCapModel.join('；') : `${videoModel}: ${VIDEO_DURATION_BOUNDS[videoModel].min}–${VIDEO_DURATION_BOUNDS[videoModel].max}s`} : {status:'skipped',reason:'not-applicable',detail:`未知模型 ${videoModel}：合法时长尚未核实，不能宣称已完成技术验收`}));

  const SKIP_SCRIPT = '未提供 script.json，本项跳过，不计为通过';
  const SKIP_REFS = '未提供 --cast/--art，本项跳过，不计为通过';
  const SKIP_SHOTS = '未挂载配方卡库（--shots <卡片目录>），本项跳过，不计为通过';
  const NO_RECIPE = '本批分镜没有引用配方';

  add('coverage', '剧本节拍被恰好一次、按顺序、连续认领（分镜级）', bad.coverage.length === 0, script ? bad.coverage.join('；') : SKIP_SCRIPT);
  add(
    'segment-cap',
    `每段 0 < 总秒数 ≤ ${params.maxSegmentSeconds}（一次生成的上限，挂了生产参数还要落进对应视频模型的时长区间）`,
    eps.length > 0 && bad.segCap.length === 0 && bad.segCapModel.length === 0,
    [...bad.segCap, ...bad.segCapModel].join('；'),
  );
  add('dialogue-fit', '认领节拍的台词装得进分镜秒数', bad.fit.length === 0, script ? bad.fit.join('；') : SKIP_SCRIPT);
  add('ep-duration', `每集总时长在剧本目标 ±${Math.round(params.tolerance * 100)}% 内`, bad.duration.length === 0, script ? bad.duration.join('；') : SKIP_SCRIPT);
  add('crowd', `单个分镜同框 ≤ ${params.maxOnScreen} 人，超了必须带拆解说明`, bad.crowd.length === 0, bad.crowd.join('；'));
  add('segment-id', '段号 E01-01 格式、按顺序连号', bad.id.length === 0, bad.id.join('；'));
  add('size-phrase', '内部计划景别属于合法枚举（不要求正文逐镜对应）', bad.size.length === 0, bad.size.join('；'));
  add('camera-phrase', '内部计划运镜属于合法枚举（不要求正文逐镜对应）', bad.camera.length === 0, bad.camera.join('；'));
  add('dialogue-verbatim', '认领节拍的台词逐字出现在 prompt 里', bad.dlgVerbatim.length === 0, script ? bad.dlgVerbatim.join('；') : SKIP_SCRIPT);
  add('prompt-lang', `提示词语言与设定一致（promptLang=${promptLang}）`, bad.lang.length === 0, bad.lang.join('；'));
  add('refs', '场次／人物／道具对账剧本', bad.refs.length === 0, script ? bad.refs.join('；') : SKIP_SCRIPT);
  add(
    'shot-recipe',
    '引用的配方存在、必备短语进入散文正文、内部计划连排满足配方',
    bad.recipe.length === 0,
    recipes ? (bad.recipe.length ? bad.recipe.join('；') : recipeRefs ? '' : NO_RECIPE) : SKIP_SHOTS,
  );
  add('refimage-coverage', '实际挂载的参考图通过显式映射解析为存在的文件', bad.refCoverage.length === 0, bad.refCoverage.length ? brief(bad.refCoverage) : haveNames ? '' : SKIP_REFS);
  add('refimage-labeled', '五部分提示词格式、固定文字与有序图片引用', bad.refLabeled.length === 0, bad.refLabeled.join('；'));
  // 骨架跨模型通用，填法按模型动态载入指南；有确定性硬约束的只有 seedance 那一条，
  // 其余模型这道门不假装查了什么，只把该读哪份填法指南报出来
  const guide = promptGuideOf(videoModel);
  add(
    'prompt-model-fit',
    family === 'seedance'
      ? `提示词与挂的视频模型口径相符（${videoModel}：正文不出现精确时刻，完整固定镜头参考首行除外）`
      : `提示词与挂的视频模型口径相符（${videoModel}）`,
    bad.modelFit.length === 0,
    family === 'seedance'
      ? brief(bad.modelFit)
      : guide
        ? `模型是 ${videoModel}，没有确定性硬约束可查——填法见 references/${guide}`
        : `模型是 ${videoModel}，没有这一款的填法指南，照 references/creation-prompt.md 的通用骨架写`,
  );

  const skip = (ids, reason) => ids.forEach(id => {
    const g = gates.find(x => x.id === id);
    if (g) { g.status = 'skipped'; g.reason = reason; g.messages = g.detail ? [g.detail] : []; }
  });
  if (!script) skip(['coverage','dialogue-fit','ep-duration','dialogue-verbatim','refs'], 'missing-upstream');
  if (!haveNames && !bad.refCoverage.length) skip(['refimage-coverage'], 'missing-upstream');
  else if (!eps.some(ep=>(ep.segments??[]).some(seg=>seg.images?.length))) skip(['refimage-coverage'], 'not-applicable');
  if (!recipes) skip(['shot-recipe'], 'missing-upstream');
  else if (!recipeRefs) skip(['shot-recipe'], 'not-applicable');
  if (family !== 'seedance') skip(['prompt-model-fit'], 'not-applicable');
  return gates;
}

/* ------------------------------------------------------------------ */
/* validate                                                            */
/* ------------------------------------------------------------------ */

export function validateCreation(doc, ctx = {}) {
  return gateReport(doc, ctx).filter(isBlocking).flatMap(g => g.messages.length ? g.messages : [g.label]);
}

/* ------------------------------------------------------------------ */
/* seed — 从 script.json 确定性预填                                      */
/* ------------------------------------------------------------------ */

export function seedFromScript(script, epRange = null, ctx = {}) {
  const errors = [...scriptProblems(script), ...projectProblems({}, {...ctx, script})];
  for(const key of ['cast','art'])if(ctx[key]!==undefined) errors.push(...assetContractErrors(ctx[key],key,script?.source));
  if (ctx.outline !== undefined) errors.push(...outlineProblems(ctx.outline));
  if (!errors.length && ctx.outline) errors.push(...reconcile({source:script.source,episodes:[]},script,ctx.outline));
  if (errors.length) throw new Error(errors.join('；'));
  const expanded = expandScript(script);
  const inRange = (n2) => !epRange || (n2 >= epRange[0] && n2 <= epRange[1]);
  const episodes = [];
  for (const [epNo, sEp] of expanded) {
    if (!inRange(epNo)) continue;
    episodes.push({
      ep: epNo,
      ...(sEp.openingBeat ? {openingBeat:[...sEp.openingBeat]} : {}),
      segments: [],
      seedScenes: sEp.scenes.map((sc) => ({
        sceneIndex: sc.sceneIndex,
        sceneId: sc.sceneId,
        lighting: sc.lighting,
        characters: sc.characters,
        props: sc.props,
        ...(sc.sourceRefs ? {sourceRefs:sc.sourceRefs} : {}),
        ...(sc.notes ? {notes:sc.notes} : {}),
        beats: sc.beats.map(b => structuredClone(b)),
      })),
    });
  }
  return { schemaVersion:3, source: script?.source ?? '', params:structuredClone(DEFAULT_PARAMS), episodes };
}

/* ------------------------------------------------------------------ */
/* stats                                                               */
/* ------------------------------------------------------------------ */

/** 报告与质量门共用的确定性统计。没有「生成批次」这个概念——没有出图批次要排产。 */
export function computeStats(doc, script) {
  const params = paramsOf(doc);
  const expanded = expandScript(script);
  const episodes = [];
  const dialogue = []; // 配音对齐单：段 × 分镜 × 说话人 × 台词

  for (const ep of doc?.episodes ?? []) {
    const sEp = expanded.get(ep.ep);
    let total = 0;
    let cutCount = 0;
    let withLines = 0;
    for (const seg of ep?.segments ?? []) {
      const scene = sEp?.scenes?.[seg.sceneIndex - 1];
      const secs = segSeconds(seg);
      total += secs;
      let segHasLine = false;
      (seg?.cuts ?? []).forEach((cut, ci) => {
        cutCount++;
        if (!scene) return;
        const [from, to] = cut.beats ?? [];
        if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > scene.beats.length) return;
        for (const b of scene.beats.slice(from - 1, to)) {
          if (b.kind !== 'line') continue;
          segHasLine = true;
          dialogue.push({ segment: seg.id, cut: ci + 1, ep: ep.ep, speaker: b.speaker, line: b.text, seconds: b.seconds });
        }
      });
      if (segHasLine) withLines++;
    }
    episodes.push({
      ep: ep.ep,
      target: sEp?.targetSeconds ?? 0,
      segments: (ep?.segments ?? []).length,
      cuts: cutCount,
      totalSeconds: total,
      avgCutSeconds: cutCount ? total / cutCount : 0,
      withLines,
    });
  }

  const totals = {
    segments: episodes.reduce((n2, e) => n2 + e.segments, 0),
    cuts: episodes.reduce((n2, e) => n2 + e.cuts, 0),
    seconds: episodes.reduce((n2, e) => n2 + e.totalSeconds, 0),
    targetSeconds: episodes.reduce((n2, e) => n2 + e.target, 0),
    withLines: episodes.reduce((n2, e) => n2 + e.withLines, 0),
    avgCutSeconds: 0,
  };
  totals.avgCutSeconds = totals.cuts ? totals.seconds / totals.cuts : 0;

  return { params, episodes, totals, dialogue };
}

/* ------------------------------------------------------------------ */
/* export — 投产包                                                      */
/* ------------------------------------------------------------------ */
/*
 * 固定投产结构：每段一个文件夹——只有 prompt.md（没有分镜图，视频提示词
 * 原样），根部一份 manifest：按段列出挂载的参考图（相对路径，**不复制文件**——
 * 这些设定图被几十个段共用，复制会在磁盘上重复几十份）。纯函数返回文件
 * 清单，落盘在 CLI 层——可测性。resolveImage 由 CLI 注入（真实文件系统），
 * 测试注入合成实现。
 */
/** 投产包与输入材料共用的视频参数：production 打底，creation 覆盖；两边都没有就是 null。 */
export const packVideoOf = (doc, production = null) => (production?.video || doc?.video ? { ...production?.video, ...doc?.video } : null);

export function exportPack(doc, script, { resolveImage = () => ({ name: '', path: '', exists: false }), dir = '.', production = null, scriptPath } = {}) {
  if (script) {
    const issues = scriptProblems(script);
    if (issues.length) throw new Error(issues.join('；'));
    verifySources(script, scriptPath);
  }
  const prefix = dir === '.' ? '' : `${dir}/`;
  const files = [];

  const manifest = [];
  let missingTotal = 0;
  const video = packVideoOf(doc, production);
  const videoLine = video
    ? `生成参数：${video.model || '（未填模型）'} · aspect_ratio ${video.aspectRatio || '（未填）'} · resolution ${video.resolution || '（未填）'}\n\n`
    : '';
  for (const ep of doc?.episodes ?? []) {
    for (const seg of ep?.segments ?? []) {
      const images = (seg.images ?? []).map((img) => {
        const r = resolveImage(img.kind, img.ref);
        if (!r.exists) missingTotal += 1;
        return { kind: img.kind, ref: img.ref, name: r.name, ...(r.mappedAssetId ? {mappedAssetId:r.mappedAssetId,assetDigest:r.assetDigest} : {}), path: r.path, role: img.role ?? '', exists: r.exists };
      });
      const mapping = images.length
        ? images
            .map((img, i) => `- Picture ${i + 1} = ${img.name || img.ref}${img.role ? `（${img.role}）` : ''} · ${img.path}${img.exists ? '' : '（⚠️ 文件不存在）'}`)
            .join('\n')
        : '（本段没有挂载参考图）';
      const promptMd = `# ${seg.id} · 视频提示词\n\n${videoLine}参考图按 Picture 序号挂载：\n\n${mapping}\n\n---\n\n${seg.prompt ?? ''}\n`;
      files.push({ path: `${prefix}${seg.id}/prompt.md`, content: promptMd });
      const missing = images.filter((i) => !i.exists).map((i) => i.path);
      manifest.push({
        segment: seg.id,
        seconds: segSeconds(seg),
        cuts: (seg.cuts ?? []).length,
        prompt: `${prefix}${seg.id}/prompt.md`,
        images,
        missing,
      });
    }
  }
  // manifest 是对象不是裸数组：顶层要放视频参数，下单脚本读一处就够
  const docOut = { source: doc?.source ?? '', video, segments: manifest };
  files.push({ path: `${prefix}manifest.json`, content: JSON.stringify(docOut, null, 2) + '\n' });
  return { files, manifest, missingTotal };
}

/* ------------------------------------------------------------------ */
/* render — 界面文案                                                    */
/* ------------------------------------------------------------------ */
/*
 * 内置 zh / en 两套，只管报告界面标签——与 promptLang（提示词语言）互相独立。
 * 数据（提示词、画面摘要、台词、质量门 detail）不在此表，原样透传。
 */
const GATE_LABELS_EN = {
  'coverage': 'Every script beat claimed exactly once, in order, contiguous (cut level)',
  'segment-cap': 'Each segment 0 < total ≤ {1}s (the single-generation cap; also within the video model\'s duration range when production parameters are mounted)',
  'fields': 'Base fields and effective parameters',
  'script-contract': 'Script v4 consumer contract',
  'outline-contract': 'Outline v5 story consumer contract',
  'cast-contract': 'Authoritative cast asset consumer contract',
  'art-contract': 'Authoritative art asset consumer contract',
  'asset-mappings': 'Explicit mappings for actual production dependencies',
  'upstream-intent': 'Opening, ending, beat claims and target duration reconciliation',
  'model-capability': 'Effective video model duration capability',
  'project-contract': 'Project v3 contract and unique creative brief',
  'dialogue-fit': 'Dialogue of the claimed beats fits within the cut duration',
  'ep-duration': 'Episode total within ±{0}% of the script\'s target',
  'crowd': 'At most {0} characters on screen per cut; more requires a breakdown note',
  'segment-id': 'Segment IDs in E01-01 format, sequential',
  'size-phrase': 'Valid internal shot-size enum; prose need not map to cuts',
  'camera-phrase': 'Valid internal camera enum; prose need not map to cuts',
  'dialogue-verbatim': 'Claimed dialogue appears verbatim inside prompt',
  'prompt-lang': 'Prompt language matches the promptLang setting',
  'prompt-model-fit': 'Prompt matches what the mounted video model expects',
  'refs': 'Scenes / characters / props audited against the script',
  'shot-recipe': 'Referenced recipes exist, their must-phrases are in the matching [Shot k] line, multi-cut recipes run long enough',
  'refimage-coverage': 'Every character/scene/prop appearing in a segment resolves to an existing reference sheet',
  'refimage-labeled': 'Five-part format, fixed text and ordered image references',
};
const GATE_SKIPS_EN = {
  '未提供 script.json，本项跳过，不计为通过': 'script.json not provided — gate skipped (not counted as passing)',
  '未提供 cast，本项跳过，不计为通过': 'cast not provided — gate skipped (not counted as passing)',
  '未提供 --cast/--art，本项跳过，不计为通过': '--cast/--art not provided — gate skipped (not counted as passing)',
  '未挂载配方卡库（--shots <卡片目录>），本项跳过，不计为通过': 'no recipe card library mounted (--shots <cards dir>) — gate skipped (not counted as passing)',
  '本批分镜没有引用配方': 'no cut in this batch references a recipe',
  [SKIP_PROD]: `no ${PRODUCTION_FILE} found (up to ${PRODUCTION_DEPTH} levels up) — gate skipped; run /mint-setup to open it`,
};
const gateText = (g, lang) => {
  if (lang !== 'en') return { label: g.label, detail: g.detail };
  const en = GATE_LABELS_EN[g.id];
  const nums = String(g.label).match(/\d+(?:\.\d+)?/g) ?? [];
  const label = en ? en.replace(/\{(\d)\}/g, (m, i) => nums[Number(i)] ?? m) : g.label;
  return { label, detail: GATE_SKIPS_EN[g.detail] ?? g.detail };
};

const I18N = {
  zh: {
    langCode: 'zh',
    kicker: '创作',
    docTitle: (s, a, b) => `${s} · 创作${a === b ? `（第 ${a} 集）` : `（第 ${a}–${b} 集）`}`,
    epRange: (a, b) => (a === b ? `第 ${a} 集` : `第 ${a}–${b} 集`),
    exportJson: '导出 JSON',
    gatesPass: '无阻断失败；提醒与跳过另列，内容未评审',
    gatesFail: (n2) => `${n2} 项未过`,
    gatePill: (okN, total) => `质量门 ${okN} / ${total}`,
    kpi: {
      segments: '生成段', segmentsSub: (cap) => `一段一次调用，上限 ${cap} 秒`,
      cuts: '分镜', cutsSub: (avg) => `每个镜头平均 ${avg} 秒`,
      time: '预估总时长', timeSub: (t) => `目标 ${t}`,
      lines: '台词段', linesSub: '其余是纯画面段',
    },
    secRhythm: '分镜节奏带',
    secSegments: '分集分镜表',
    secRefs: '参考图挂载单',
    secDialogue: '配音对齐单',
    secGates: '质量门',
    rhythmNote: '粗分隔 = 生成段边界 · 段宽 = 分镜时长占比 · 颜色越深景别越近',
    segmentsNote: '一段 = 一次生成，直接挂载既有设定图，不产生新的出图调用',
    refsNote: '按段列出挂载的参考图——下单前先看这些文件都在不在',
    dialogueNote: '自动汇总 · TTS 音频对应生成段及镜头序号',
    epHead: (nSeg, nCut, total, target) => `${nSeg} 个生成段 ${nCut} 个镜头 · 共 ${total} 秒 / 目标 ${target} 秒`,
    segHead: (total, n2) => `${total} 秒 · ${n2} 个分镜`,
    secBadge: (secs, n2) => `${secs}s · ${n2} 个镜头`,
    rhythmVal: (nSeg, nCut, secs) => `${nSeg} 个生成段 ${nCut} 个镜头 · ${secs}s`,
    beatsLabel: (s, from, to) => `第 ${s} 场 ${from === to ? `第 ${from} 拍` : `第 ${from}–${to} 拍`}`,
    refMissing: '未找到设定图',
    promptLabel: '视频提示词',
    showSegs: '▾ 展开全部生成段',
    hideSegs: '▴ 收起',
    copy: '复制', copied: '已复制', copyFailed: '复制失败',
    dialogueCols: ['生成段 · 镜头', '说话人', '台词', '台词秒数'],
    cutCols: ['镜头', '时长（秒）', '景别', '运镜', '配方', '画面', '人物'],
    refCols: ['生成段', 'Picture', '身份', '路径'],
    kindLabel: (k) => (k === 'character' ? '角色' : k === 'scene' ? '场景' : '道具'),
    batchLabel: (num) => `批次 ${num}`,
    voiceOver: '画外音',
    listSep: '、',
    sizeName: (size) => SHOT_SIZES[size]?.zh ?? size,
    cameraLabel: (camera) => `${camera}（${({'Push In':'推近','Pull Out':'拉远','Pedestal Up':'上升','Pedestal Down':'下降'})[camera] ?? CAMERA_MOVES[camera] ?? '未知'}）`,
    recipeNone: '—',

    recipeName: (card, id) => card?.name ?? id,
    recipeDrift: (sizes, cameras) =>
      `配方建议${[sizes.length ? `景别 ${sizes.join(' / ')}` : '', cameras.length ? `运镜 ${cameras.join(' / ')}` : ''].filter(Boolean).join(' · ')}——只提示不设门`,
    speakerLine: (name, text) => `${name}：「${text}」`,
    withLighting: (name, lighting) => (lighting ? `${name}（${lighting}）` : name),
    fmtMin: (sec) => `${Math.floor(sec / 60)} 分 ${Math.round(sec % 60)} 秒`,
    unitSeg: '个生成段',
    unitCut: '个镜头',
    colophon: '段直接挂载 mint-characters / mint-art 已经生成的设定图，写一条通用视频提示词——从 seed 到下单不产生任何新的图像生成调用。台词、景别、运镜纪律全部由脚本确定性对账。',
  },
  en: {
    langCode: 'en',
    kicker: 'Creation',
    docTitle: (s, a, b) => `${s} · Creation (${a === b ? `Episode ${a}` : `Episodes ${a}–${b}`})`,
    epRange: (a, b) => (a === b ? `Episode ${a}` : `Episodes ${a}–${b}`),
    exportJson: 'Export JSON',
    gatesPass: 'No blocking failures; warnings and skips listed separately. Content review not performed.',
    gatesFail: (n2) => `${n2} failed`,
    gatePill: (okN, total) => `Quality gates ${okN} / ${total}`,
    kpi: {
      segments: 'Segments', segmentsSub: (cap) => `one generation call each, capped at ${cap}s`,
      cuts: 'Cuts', cutsSub: (avg) => `${avg}s per cut on average`,
      time: 'Estimated total', timeSub: (t) => `target ${t}`,
      lines: 'Dialogue segments', linesSub: 'the rest are picture-only',
    },
    secRhythm: 'Cut rhythm strip',
    secSegments: 'Segment cards',
    secRefs: 'Reference sheet mounts',
    secDialogue: 'Audio alignment',
    secGates: 'Quality gates',
    rhythmNote: 'thick separators = segment boundaries · slice width = cut duration share · darker = closer shot size',
    segmentsNote: 'one segment = one generation, mounting existing reference sheets directly — no new image generation calls',
    refsNote: 'reference sheets mounted per segment — check these files exist before ordering',
    dialogueNote: 'auto-computed · which segment and cut each TTS clip lands on',
    epHead: (nSeg, nCut, total, target) => `${nSeg} segments ${nCut} cuts · ${total}s total / ${target}s target`,
    segHead: (total, n2) => `${total}s · ${n2} cuts`,
    secBadge: (secs, n2) => `${secs}s · ${n2} cuts`,
    rhythmVal: (nSeg, nCut, secs) => `${nSeg} seg ${nCut} cuts · ${secs}s`,
    beatsLabel: (s, from, to) => `Scene ${s} · ${from === to ? `beat ${from}` : `beats ${from}–${to}`}`,
    refMissing: 'sheet not found',
    promptLabel: 'Video prompt',
    showSegs: '▾ Show all segments',
    hideSegs: '▴ Collapse',
    copy: 'Copy', copied: 'Copied', copyFailed: 'Copy failed',
    dialogueCols: ['Segment · cut', 'Speaker', 'Line', 'Seconds'],
    cutCols: ['Cut', 'Sec', 'Size', 'Camera', 'Recipe', 'Picture', 'Characters'],
    refCols: ['Segment', 'Picture', 'Identity', 'Path'],
    kindLabel: (k) => (k === 'character' ? 'character' : k === 'scene' ? 'scene' : 'prop'),
    batchLabel: (num) => `Batch ${num}`,
    voiceOver: 'Voice-over',
    listSep: ', ',
    sizeName: (size) => SHOT_SIZES[size]?.phrase ?? size,
    cameraLabel: (camera) => camera,
    recipeNone: '—',
    recipeName: (card, id) => card?.name_en ?? card?.name ?? id,
    recipeDrift: (sizes, cameras) =>
      `Recipe suggests ${[sizes.length ? `size ${sizes.join(' / ')}` : '', cameras.length ? `camera ${cameras.join(' / ')}` : ''].filter(Boolean).join(' · ')} — advisory, not gated`,
    speakerLine: (name, text) => `${name}: “${text}”`,
    withLighting: (name, lighting) => (lighting ? `${name} (${lighting})` : name),
    fmtMin: (sec) => `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s`,
    unitSeg: 'seg',
    unitCut: 'cuts',
    colophon: 'Segments mount existing mint-characters / mint-art reference sheets directly and carry one general-purpose video prompt — no new image generation calls from seed through ordering. Dialogue, shot-size and camera discipline are all audited deterministically by the script.',
  },
};

const statusLabel = (g, lang) => lang === 'en'
  ? (g.status === 'fail' && g.level === 'warn' ? 'Warning' : g.status)
  : (g.status === 'skipped' ? '跳过' : g.status === 'pass' ? '通过' : g.level === 'warn' ? '提醒' : '失败');
const summaryText = (gates, lang) => {
  const n = {pass:gates.filter(g => g.status === 'pass' && g.category !== 'source').length,
    blocking:gates.filter(isBlocking).length, warnings:gates.filter(g => g.status === 'fail' && g.level === 'warn').length,
    skipped:gates.filter(g => g.status === 'skipped').length};
  return lang === 'en' ? `Structural passes ${n.pass}; blocking ${n.blocking}; warnings ${n.warnings}; skipped ${n.skipped}. Content review not performed. Timings are estimates, not generated results.`
    : `结构通过 ${n.pass}；阻断失败 ${n.blocking}；提醒 ${n.warnings}；跳过 ${n.skipped}。内容未评审。时长为估算，不是生成结果。`;
};
export function reportContext(doc, ctx) {
  const locate = (ep, pos) => ep.segments.flatMap(seg => seg.cuts.flatMap((cut, i) =>
    Array.isArray(pos) && seg.sceneIndex === pos[0] && cut.beats[0] <= pos[1] && cut.beats[1] >= pos[1] ? [`${seg.id}#${i + 1}`] : []));
  return {model:videoModelOf(doc, ctx.production), technicalParams:paramsOf(doc),
    ...(ctx.production?.creativeBrief || doc.creativeBrief ? {creativeBrief:ctx.production?.creativeBrief ?? doc.creativeBrief} : {}),
    episodes:doc.episodes.map(ep => {
      const intent = episodeIntent(ep.ep, ctx);
      const nodes = (ctx.outline?.beats ?? []).filter(b => b.episode === ep.ep).map(b => {
        const claim = ctx.script?.episodes?.find(e => e.ep === ep.ep)?.beatClaims?.find(c => c.beatId === b.id);
        return {id:b.id, setup:b.setup, outcome:b.outcome, ...(claim ? {claim,startCuts:locate(ep,claim.start),endCuts:locate(ep,claim.end)} : {})};
      });
      return {ep:ep.ep, ...intent,
        ...(intent.openingBeat ? {openingCuts:locate(ep,intent.openingBeat)} : {openingMapping:'not-marked'}),
        ...(intent.endBeat ? {endingCuts:locate(ep,intent.endBeat)} : {}),
        ...(nodes.length ? {nodes} : {}),
        execution: (expandScript(ctx.script).get(ep.ep)?.scenes ?? []).map(sc => ({sceneIndex:sc.sceneIndex,sceneId:sc.sceneId,
          ...(sc.notes ? {notes:sc.notes} : {}), ...(sc.sourceRefs ? {sourceRefs:sc.sourceRefs} : {}),
          beats:sc.beats.filter(b => b.sourceRefs || b.audio || b.transformation || ['subtitle','sound'].includes(b.kind))})),
        audioContinuations:ep.segments.flatMap(seg => seg.cuts.flatMap((cut,i) => cut.audioRefs?.length ? [{segment:seg.id,cut:i+1,audioRefs:cut.audioRefs,playback:'continuation-not-replay'}] : []))};
    })};
}
const tOf = (lang) => {
  if (lang && !I18N[lang]) throw new Error('报告界面语言目前内置 zh / en');
  return I18N[lang ?? 'zh'];
};

const langOf = (doc, ctx = {}) => ctx.lang ?? doc?.lang ?? ctx.production?.lang ?? 'zh';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** cut 的「配方」列：卡名 + 偏离建议景别／运镜时的 ≠ 标记。偏离只提示不设门。 */
function cutRecipe(cut, recipes, t) {
  const id = typeof cut?.recipe === 'string' ? cut.recipe : '';
  if (!id) return null;
  const card = recipes?.get(id) ?? null;
  const off = recipeDrift(cut, card);
  return {
    name: t.recipeName(card, id),
    drift: off.sizes.length || off.cameras.length ? t.recipeDrift(off.sizes, off.cameras) : '',
  };
}

/** 分镜认领的节拍 → 画面摘要（动作原文 + 台词行），模型不重写。 */
function cutBeats(cut, scene) {
  if (!scene) return [];
  const [from, to] = cut.beats ?? [];
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > scene.beats.length) return [{kind:'invalid',text:'认领区间无效，不能推导实际正文／估时'}];
  return scene.beats.slice(from - 1, to);
}

/* ------------------------------------------------------------------ */
/* render — markdown                                                   */
/* ------------------------------------------------------------------ */

const mdRow = (cells) => `| ${cells.map((c) => String(c ?? '').replace(/\|/g, '\\|')).join(' | ')} |`;
const mdHead = (cols) => [mdRow(cols), mdRow(cols.map(() => '---'))].join('\n');

function assertReadableVersions(doc, ctx) {
  if (doc?.schemaVersion !== 3) throw new Error('creation.schemaVersion 必须为 3');
  for (const [key, validator] of [['script',scriptProblems],['outline',outlineProblems]]) if (ctx[key] !== undefined) {
    const issues = validator(ctx[key]);
    if (issues.length) throw new Error(issues.join('；'));
  }
  const errors = [...shapeProblems(doc), ...projectProblems(doc, ctx)];
  for(const key of ['cast','art'])if(ctx[key]!==undefined) errors.push(...assetContractErrors(ctx[key],key,ctx.script?.source ?? doc?.source));
  if (errors.length) throw new Error(errors.join('；'));
  const intent = reconcile(doc, ctx.script, ctx.outline);
  if (intent.some(e => e.includes('重复保存'))) throw new Error(intent.join('；'));
}

export function renderMarkdown(doc, ctx = {}) {
  assertReadableVersions(doc, ctx);
  const t = tOf(langOf(doc, ctx));
  const n = namer(ctx, t.voiceOver);
  const expanded = expandScript(ctx.script);
  const stats = computeStats(doc, ctx.script);
  const eps = doc.episodes;
  const showRecipe = eps.some(ep => ep.segments.some(seg => seg.cuts.some(cut => cut.recipe)));
  const out = [`# ${t.docTitle(doc.source, eps[0]?.ep, eps[eps.length - 1]?.ep)}`, ''];

  for (const [i, ep] of eps.entries()) {
    const st = stats.episodes[i];
    const sEp = expanded.get(ep.ep);
    out.push(`## E${String(ep.ep).padStart(2, '0')}`, '', `> ${t.epHead(st.segments, st.cuts, st.totalSeconds, st.target)}`, '');
    for (const seg of ep.segments) {
      const scene = sEp?.scenes?.[seg.sceneIndex - 1];
      out.push(`### ${seg.id} · ${scene ? t.withLighting(n.scene(scene.sceneId), scene.lighting) : '?'} · ${t.segHead(segSeconds(seg), seg.cuts.length)}`, '');
      const images = seg.images ?? [];
      if (images.length) {
        out.push(
          `参考图：${images
            .map((img, idx) => `Picture ${idx + 1} = ${n[img.kind === 'character' ? 'char' : img.kind](img.ref)}${img.role ? `（${img.role}）` : ''}`)
            .join('；')}`,
          '',
        );
      }
      out.push(mdHead(t.cutCols.filter((_,i) => showRecipe || i !== 4)));
      seg.cuts.forEach((cut, ci) => {
        const summary = cutBeats(cut, scene)

          .map((b) => (b.kind === 'line' ? t.speakerLine(n.char(b.speaker), b.text) : b.text))
          .join(' ');
        const rc = cutRecipe(cut, ctx.recipes, t);
        out.push(mdRow([
          `#${ci + 1}`, cut.seconds,
          t.sizeName(cut.size), t.cameraLabel(cut.camera),
          rc ? `${rc.name}${rc.drift ? ` ≠（${rc.drift}）` : ''}` : t.recipeNone,
          summary, (cut.characters ?? []).map(n.char).join(t.listSep),
        ].filter((_,i) => showRecipe || i !== 4)));
      });
      out.push('', `**${t.promptLabel}**`, '', '```text', seg.prompt ?? '', '```', '');
    }
  }

  out.push(`## ${t.langCode === 'en' ? 'Current upstream handoff' : '当前上游交接关系'}`, '', '```json', JSON.stringify(reportContext(doc, ctx), null, 2), '```', '');
  if (stats.dialogue.length) out.push(`## ${t.secDialogue}`, '', mdHead(t.dialogueCols));
  for (const d of stats.dialogue) out.push(mdRow([`${d.segment}#${d.cut}`, n.char(d.speaker), d.line, d.seconds]));
  out.push('', summaryText(gateReport(doc, ctx), t.langCode), '', `## ${t.secGates}`, '');
  for (const g of gateReport(doc, ctx)) out.push(`- ${statusLabel(g, t.langCode)} [${g.category}/${g.level}${g.reason ? '/' + g.reason : ''}] ${gateText(g, t.langCode).label}: ${gateText(g, t.langCode).detail}`);
  return out.join('\n');
}

/* ------------------------------------------------------------------ */
/* render — html                                                       */
/* ------------------------------------------------------------------ */
/*
 * 与仓库其余四份报告同一套视觉语言。设计约定见 references/report-style.md。
 * 参考图从工作目录下 <kind 对应目录>/images/<slug>-sheet.png 找（imageExists
 * 由 CLI 注入），有就内嵌显示 + 点击放大，没有就显示占位——不猜、不骗。
 */

function embedDoc(doc) {
  return JSON.stringify(doc).replace(/</g, '\\u003c');
}

/** 一段挂载的参考图，解析成 {picture, kind, name, role, path, exists} 列表，供段卡与挂载单共用。 */
function segmentImages(seg, ctx, imageExists) {
  const n = namer(ctx);
  return (seg.images ?? []).map((img, i) => {
    const name = n.nameOf(img.kind, img.ref) ?? img.ref;
    const path = referenceImagePath(img.kind, name, imageAssetId(ctx,img.kind,img.ref), ctx);
    return { picture: i + 1, kind: img.kind, ref: img.ref, name, role: img.role ?? '', path, exists: imageExists ? imageExists(path) : false };
  });
}

export function renderHtml(doc, ctx = {}) {
  assertReadableVersions(doc, ctx);
  const lang = langOf(doc, ctx);
  const t = tOf(lang);
  const n = namer(ctx, t.voiceOver);
  const expanded = expandScript(ctx.script);
  const stats = computeStats(doc, ctx.script);
  const gates = gateReport(doc, ctx);
  const failed = gates.filter(isBlocking);
  const eps = doc.episodes;
  const params = stats.params;
  const fmtMin = t.fmtMin;
  const imageExists = ctx.imageExists ?? (() => false);

  const SIZE_ALPHA = { 'extreme-wide': 0.25, wide: 0.4, medium: 0.58, close: 0.78, 'extreme-close': 1 };

  // ---- 01 分镜节奏带 ----
  const rhythmRows = eps
    .map((ep, i) => {
      const st = stats.episodes[i];
      const groups = ep.segments
        .map((seg) => {
          const segs = seg.cuts
            .map((cut, ci) => {
              const w = st.totalSeconds ? (cut.seconds / st.totalSeconds) * 100 : 0;
              const alpha = SIZE_ALPHA[cut.size] ?? 0.5;
              return `<a class="seg" href="#seg-${esc(seg.id)}" style="width:${r1(w)}%;background:rgba(138,51,36,${alpha})" title="${esc(`${seg.id}#${ci + 1} · ${cut.seconds}s · ${t.sizeName(cut.size)} · ${cut.camera}`)}"></a>`;
            })
            .join('');
          const gw = st.totalSeconds ? (segSeconds(seg) / st.totalSeconds) * 100 : 0;
          return `<span class="rseg" style="width:${r1(gw)}%">${segs}</span>`;
        })
        .join('');
      return `<div class="rrow"><span class="rep">E${String(ep.ep).padStart(2, '0')}</span><div class="rtrack">${groups}</div><span class="rval">${esc(t.rhythmVal(st.segments, st.cuts, st.totalSeconds))}</span></div>`;
    })
    .join('\n');
  const rhythmLegend = Object.keys(SHOT_SIZES)
    .map((k) => `<i><span class="sw" style="background:rgba(138,51,36,${SIZE_ALPHA[k]})"></span>${esc(t.sizeName(k))}</i>`)
    .join('');

  // ---- 02 分集分镜表：段卡（参考图条 + 分镜行 + 提示词面板） ----
  const epBlocks = eps
    .map((ep, i) => {
      const st = stats.episodes[i];
      const sEp = expanded.get(ep.ep);
      const cards = ep.segments
        .map((seg) => {
          const scene = sEp?.scenes?.[seg.sceneIndex - 1];
          const imgs = segmentImages(seg, ctx, imageExists);
          const refStrip = imgs.length
            ? `<div class="refstrip">${imgs
                .map(
                  (img) => `<figure class="reftile">
    ${img.exists ? `<img src="${esc(img.path)}" alt="${esc(img.name)}" loading="lazy">` : `<div class="reftile-ph">${esc(t.refMissing)}</div>`}
    <figcaption>P${img.picture} · ${esc(img.name)}${img.role ? `<small>${esc(img.role)}</small>` : ''}</figcaption>
  </figure>`,
                )
                .join('\n')}</div>`
            : `<p class="seg-note">${esc(lang === 'en' ? 'no reference sheets mounted for this segment' : '本段没有挂载参考图')}</p>`;

          const cutRows = seg.cuts
            .map((cut, ci) => {
              const beats = cutBeats(cut, scene);
              const summary = beats
                .map((b) =>
                  b.kind === 'line'
                    ? `<p class="sline"><b>${esc(n.char(b.speaker))}</b>${esc(b.text)}</p>`
                    : `<p class="sact">${esc(b.text)}</p>`,
                )
                .join('');
              const rc = cutRecipe(cut, ctx.recipes, t);
              return `<li class="cut">
  <div class="cut-h">
    <b>#${ci + 1}</b>
    <span class="cut-t">${cut.seconds}s</span>
    <span class="cut-sc">${esc(t.sizeName(cut.size))} · ${esc(cut.camera)}</span>
    ${rc ? `<span class="cut-rc">${esc(rc.name)}${rc.drift ? `<sup title="${esc(rc.drift)}">≠</sup>` : ''}</span>` : ''}
    ${(cut.characters ?? []).map((id) => `<span class="chip">${esc(n.char(id))}</span>`).join('')}
    ${(cut.props ?? []).map((id) => `<span class="chip prop">${esc(n.prop(id))}</span>`).join('')}
  </div>
  ${summary}
</li>`;
            })
            .join('\n');

          return `<article class="segcard" id="seg-${esc(seg.id)}">
  <header class="seg-h">
    <b>${esc(seg.id)}</b>
    <span class="sec-badge">${esc(t.secBadge(segSeconds(seg), seg.cuts.length))}</span>
    <span class="chip">${esc(scene ? `${scene.sceneId} ${n.scene(scene.sceneId)}` : '?')}</span>
    ${scene?.lighting ? `<span class="chip lite">${esc(scene.lighting)}</span>` : ''}
    <span class="beatsref">${esc(t.beatsLabel(seg.sceneIndex, seg.cuts[0]?.beats?.[0], seg.cuts[seg.cuts.length - 1]?.beats?.[1]))}</span>
  </header>
  ${refStrip}
  <div class="duo">
    <ol class="cuts">
${cutRows}
    </ol>
    <div class="ppanel">
      <div class="pp-h">
        <b>${esc(t.promptLabel)}</b>
        <button class="copy" data-copy="${esc(seg.prompt ?? '')}">${esc(t.copy)}</button>
      </div>
      <pre class="pp on">${esc(seg.prompt ?? '')}</pre>
    </div>
  </div>
  ${seg.note ? `<p class="seg-note">${esc(seg.note)}</p>` : ''}
</article>`;
        })
        .join('\n');
      return `<section class="ep" id="ep-${ep.ep}">
  <header class="ep-h">
    <span class="ep-n">E${String(ep.ep).padStart(2, '0')}</span>
    <span class="ep-est">${esc(t.epHead(st.segments, st.cuts, st.totalSeconds, st.target))}</span>
  </header>
  <div class="shots clip">
    <div class="seggrid">
${cards}
    </div>
  </div>
  <button class="shmore">${esc(t.showSegs)}</button>
</section>`;
    })
    .join('\n');

  // ---- 03 参考图挂载单 ----
  const refRows = eps
    .flatMap((ep) => ep.segments.flatMap((seg) => segmentImages(seg, ctx, imageExists).map((img) => ({ seg, img }))))
    .map(
      ({ seg, img }) =>
        `<tr><td><a href="#seg-${esc(seg.id)}">${esc(seg.id)}</a></td><td>P${img.picture}</td><td>${esc(t.kindLabel(img.kind))} · ${esc(img.name)}${img.role ? `<small>${esc(img.role)}</small>` : ''}</td><td class="mono">${img.exists ? esc(img.path) : `<span class="miss">${esc(img.path)} · ${esc(t.refMissing)}</span>`}</td></tr>`,
    )
    .join('\n');

  // ---- 04 配音对齐单 ----
  const dlgRows = stats.dialogue
    .map((d) => `<tr><td><a href="#seg-${esc(d.segment)}">${esc(d.segment)}</a> #${d.cut}</td><td>${esc(n.char(d.speaker))}</td><td class="serif">${esc(d.line)}</td><td>${d.seconds}</td></tr>`)
    .join('\n');

  const gateList = `<ul class="gate">
  ${gates
    .map(
      (g) => `<li class="${g.status === 'pass' ? 'ok' : isBlocking(g) ? 'bad' : 'notice'}"><span class="m">${esc(statusLabel(g, lang))}</span><span>${esc(gateText(g, t.langCode).label)} <small>${esc(`${g.category}/${g.level}${g.reason ? ' · ' + g.reason : ''}`)}</small>${
        g.detail ? `<small>${esc(gateText(g, t.langCode).detail)}</small>` : ''
      }</span></li>`,
    )
    .join('\n  ')}
</ul>`;

  return `<!doctype html>
<html lang="${esc(lang)}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t.docTitle(doc.source, eps[0]?.ep, eps[eps.length - 1]?.ep))}</title>
<style>
:root{
  --paper:#eceded; --panel:#f5f6f5; --side:#e4e6e3; --ink:#191d21; --ink-2:#5b636a; --ink-3:#8c9298;
  --rule:#d2d5d0; --rule-2:#c2c6bf; --seal:#8a3324; --seal-2:#c56a4e; --seal-soft:#8a332412; --ok:#3d6b4f;
  --serif:"Songti SC","STSong","Source Han Serif SC","Noto Serif CJK SC",Georgia,serif;
  --sans:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,-apple-system,sans-serif;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.7 var(--sans);-webkit-font-smoothing:antialiased}
.page{max-width:1600px;margin:0 auto;padding:24px 32px 90px}
h1,h2,h3{margin:0;font-weight:400}

.hd{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;border-bottom:2px solid var(--ink);padding-bottom:12px}
.hd h1{font:400 28px/1.1 var(--serif);letter-spacing:.06em}
.hd .sub{font-size:13px;color:var(--ink-2)}
.hd .right{margin-left:auto;display:flex;align-items:center;gap:10px}
.gatepill{display:inline-flex;align-items:center;gap:6px;font:500 12px/1 var(--sans);border-radius:99px;padding:6px 12px}
.gatepill.pass{color:var(--ok);border:1px solid var(--ok)}
.gatepill.fail{color:var(--seal);border:1px solid var(--seal);background:var(--seal-soft)}
.expo{font:500 11px/1 var(--sans);color:var(--ink-2);background:var(--panel);
  border:1px solid var(--rule-2);border-radius:2px;padding:7px 11px;cursor:pointer;transition:.15s}
.expo:hover{border-color:var(--seal);color:var(--seal)}
.expo:focus-visible{outline:2px solid var(--seal);outline-offset:2px}

.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0 6px}
@media(max-width:980px){.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
.kpi{min-width:0}
.kpi{background:var(--panel);border:1px solid var(--rule);border-radius:2px;padding:11px 14px 9px}
.kpi .l{font:500 10px/1 var(--sans);letter-spacing:.18em;color:var(--ink-3)}
.kpi .v{font:400 28px/1.15 var(--serif);margin-top:5px}
.kpi .v small{font:400 14px var(--serif);color:var(--ink-2)}
.kpi .d{font-size:11px;color:var(--ink-2);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kpi.accent{border-top:2px solid var(--seal)}
.galert{margin:14px 0 0;border:1px solid var(--seal);background:var(--seal-soft);border-radius:2px;
  padding:10px 14px;font-size:13px}
.galert b{color:var(--seal)}
.galert span{display:block;font-size:12px;color:var(--ink-2)}

section.top-sec{margin-top:34px}
.sec-h{display:flex;align-items:baseline;gap:12px;border-bottom:1px solid var(--rule-2);padding-bottom:8px;margin-bottom:16px}
.sec-h .no{font:500 12px/1 var(--mono);color:var(--seal)}
.sec-h h2{font:400 20px/1.2 var(--serif);letter-spacing:.05em}
.sec-h .note{margin-left:auto;font-size:12px;color:var(--ink-3)}

/* 01 cut rhythm strip */
.rhythm{background:var(--panel);border:1px solid var(--rule);border-radius:2px;padding:16px 20px 10px}
.rrow{display:grid;grid-template-columns:44px minmax(0,1fr) 150px;gap:12px;align-items:center;padding:5px 0}
.rep{font:500 12px/1 var(--mono);color:var(--ink-2)}
.rtrack{display:flex;height:22px;border:1px solid var(--rule);border-radius:2px;overflow:hidden;background:var(--paper)}
.rseg{display:flex;border-right:2px solid var(--ink-2)}
.rseg:last-child{border-right:0}
.seg{display:block;border-right:1px solid var(--panel)}
.rseg .seg:last-child{border-right:0}
.seg:hover{outline:2px solid var(--ink);outline-offset:-2px}
.rval{font:500 12px/1.5 var(--sans);color:var(--ink-2)}
.legend{display:flex;gap:16px;font-size:12px;color:var(--ink-2);margin:8px 0 2px;flex-wrap:wrap}
.legend i{font-style:normal;display:inline-flex;align-items:center;gap:6px}
.sw{display:inline-block;width:10px;height:10px;border-radius:2px}

/* 02 segment cards */
.ep{background:var(--panel);border:1px solid var(--rule);border-radius:2px;padding:18px 22px;margin-bottom:16px}
.ep-h{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;border-bottom:1px solid var(--rule-2);padding-bottom:10px;margin-bottom:14px}
.ep-n{font:400 22px/1 var(--serif);letter-spacing:.04em;color:var(--seal)}
.ep-est{font-size:12.5px;color:var(--ink-2)}
.shots{position:relative}
.shots.clip{max-height:760px;overflow:hidden}
.shots.clip::after{content:'';position:absolute;left:0;right:0;bottom:0;height:80px;
  background:linear-gradient(180deg,transparent,var(--panel));pointer-events:none}
.shmore{display:block;width:100%;margin-top:8px;font:500 11.5px/1 var(--sans);letter-spacing:.06em;
  color:var(--ink-2);background:var(--paper);border:1px solid var(--rule-2);border-radius:2px;
  padding:7px 0;cursor:pointer;transition:.15s}
.shmore:hover{border-color:var(--seal);color:var(--seal)}
.shmore:focus-visible{outline:2px solid var(--seal);outline-offset:2px}
.seggrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start}
@media(max-width:1100px){.seggrid{grid-template-columns:minmax(0,1fr)}}
.segcard{background:var(--paper);border:1px solid var(--rule);border-radius:2px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.seg-h{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.seg-h b{font:500 14px/1 var(--mono);color:var(--seal)}
.sec-badge{font:500 11px/1 var(--mono);border:1px solid var(--seal);color:var(--seal);border-radius:99px;padding:2px 8px}
.beatsref{margin-left:auto;font-size:10.5px;color:var(--ink-3)}
.refstrip{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}
.reftile{margin:0;flex:0 0 108px;display:flex;flex-direction:column;gap:3px}
.reftile img{width:108px;height:72px;object-fit:cover;border:1px solid var(--rule-2);border-radius:2px;cursor:zoom-in;background:var(--side)}
.reftile-ph{width:108px;height:72px;display:flex;align-items:center;justify-content:center;border:1px dashed var(--rule-2);
  border-radius:2px;font:500 10px/1.3 var(--sans);color:var(--ink-3);text-align:center;padding:4px}
.reftile figcaption{font:500 10px/1.4 var(--mono);color:var(--ink-2)}
.reftile figcaption small{display:block;font:400 9.5px/1.3 var(--sans);color:var(--ink-3)}
.duo{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start;border-top:1px solid var(--rule);padding-top:4px}
@media(max-width:900px){.duo{grid-template-columns:minmax(0,1fr)}}
.ppanel{border:1px solid var(--rule);border-radius:2px;background:var(--panel);margin-top:7px}
.pp-h{display:flex;align-items:center;gap:6px;padding:7px 10px;border-bottom:1px solid var(--rule)}
.pp-h b{font:500 11px/1 var(--sans);letter-spacing:.08em;color:var(--ink-2);margin-right:auto}
.pp{display:none;margin:0;padding:9px 12px;font:400 12px/1.8 var(--sans);color:var(--ink);
  white-space:pre-wrap;word-break:break-word;max-height:400px;overflow-y:auto;
  scrollbar-width:thin;scrollbar-color:var(--rule-2) transparent}
.pp.on{display:block}
.pp::-webkit-scrollbar{width:6px}
.pp::-webkit-scrollbar-thumb{background:var(--rule-2);border-radius:3px}
.cuts{margin:0;padding:0;list-style:none}
.cut{padding:7px 0;border-bottom:1px solid var(--rule)}
.cut:first-child{padding-top:11px}
.cut:last-child{border-bottom:0}

.cut-h{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.cut-h b{font:500 12px/1 var(--mono);color:var(--seal)}
.cut-t{font:500 10.5px/1.6 var(--mono);color:var(--ink-3)}
.cut-sc{font-size:11.5px;color:var(--ink-2)}
.cut-rc{font:400 10.5px/1.6 var(--mono);border:1px dashed var(--rule-2);border-radius:2px;padding:0 6px;color:var(--ink-2)}
.cut-rc sup{color:var(--seal-2);font-weight:700;cursor:help;margin-left:2px}
.cut p{margin:3px 0 0;font-size:12px;line-height:1.6}
.sact{color:var(--ink-2)}
.sline{font-family:var(--serif)}
.sline b{font-weight:500;margin-right:6px;color:var(--seal)}
.chip{font:400 10.5px/1.6 var(--mono);border:1px solid var(--rule-2);border-radius:2px;
  padding:0 6px;background:var(--panel);color:var(--ink-2);text-decoration:none}
.chip.lite{border-color:var(--seal-2);color:var(--seal-2)}
.chip.prop{border-color:var(--seal);color:var(--seal)}
a.chip:hover{border-color:var(--seal);color:var(--seal)}
.seg-note{margin:0;font-size:11px;color:var(--ink-3)}

/* 03 reference sheet mounts */
table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--rule);font-size:13px}
th,td{padding:8px 12px;border-bottom:1px solid var(--rule);text-align:left;vertical-align:top}
th{font:500 11px/1 var(--sans);letter-spacing:.1em;color:var(--ink-3);background:var(--side)}
tr:last-child td{border-bottom:0}
td:first-child{font-family:var(--mono);font-size:12px;white-space:nowrap}
td a{color:var(--seal);text-decoration:none}
td.serif{font-family:var(--serif)}
td.mono{font-family:var(--mono);font-size:11.5px}
td small{display:block;color:var(--ink-3)}
@media(max-width:600px){
  table{table-layout:fixed;overflow-wrap:anywhere}
  th,td{padding:7px 5px}
  td:first-child{white-space:normal}
  .sec-h{flex-wrap:wrap}
  .sec-h .note{margin-left:0}
  .gate li{overflow-wrap:anywhere}
}
.miss{color:var(--seal)}

.copy{flex:none;font:500 11px/1 var(--sans);color:var(--ink-2);background:var(--panel);
  border:1px solid var(--rule-2);border-radius:2px;padding:5px 10px;cursor:pointer;transition:.15s}
.copy:hover{border-color:var(--seal);color:var(--seal)}
.copy:focus-visible{outline:2px solid var(--seal);outline-offset:2px}
.copy[data-done]{border-color:var(--seal);color:var(--seal)}

.gate{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:2px 28px}
@media(max-width:900px){.gate{grid-template-columns:1fr}}
.gate li{display:flex;gap:8px;padding:5px 0;font-size:12.5px;line-height:1.55}
.gate .m{flex:none;font-weight:700}
.gate li.ok .m{color:var(--ok)}
.gate li.bad .m{color:var(--seal)}
.gate li.bad{background:var(--seal-soft);border-radius:2px;padding-left:6px}
.gate small{display:block;color:var(--ink-3)}
.gsum{margin:10px 0 0;font-size:12px;color:var(--ink-2)}
.gsum b{color:var(--seal)}

.lightbox{position:fixed;inset:0;background:rgba(20,22,24,.88);display:none;align-items:center;
  justify-content:center;z-index:9;cursor:zoom-out;padding:32px}
.lightbox.on{display:flex}
.lightbox img{max-width:96%;max-height:96%;border:1px solid #555;border-radius:2px}

.foot{margin-top:40px;font-size:11px;color:var(--ink-3);border-top:1px solid var(--rule);padding-top:14px}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
@media print{
  .expo,.copy,.shmore{display:none!important}
  .pp{max-height:none;overflow:visible}
  .duo{grid-template-columns:minmax(0,1fr)}
  .shots.clip{max-height:none}
  .shots.clip::after{display:none}
  .seggrid{grid-template-columns:minmax(0,1fr)}
  .page{max-width:none;padding:0}
  section.top-sec,.segcard{page-break-inside:avoid}
  body{background:#fff}
}
</style></head><body>
<div class="page">

<header class="hd">
  <h1>${esc(doc.source)}</h1>

  <span class="sub">${esc(t.kicker)} · ${esc(t.epRange(eps[0]?.ep, eps[eps.length - 1]?.ep))}</span>
  <span class="right">
    <span class="gatepill ${failed.length ? 'fail' : 'pass'}">${failed.length ? '✗' : '✓'} ${esc(t.gatePill(gates.filter(g => g.status === 'pass' && g.category !== 'source').length, gates.filter(g => g.category !== 'source').length))}</span>
    <button class="expo" data-name="${esc(slug(doc.source))}-creation.json">${esc(t.exportJson)}</button>
  </span>
</header>

<section class="top-sec" id="sec-segments">
  <div class="sec-h"><span class="no">01</span><h2>${esc(t.secSegments)}</h2><span class="note">${esc(t.segmentsNote)}</span></div>
${epBlocks}
</section>

${refRows ? `<section class="top-sec" id="sec-refs">
  <div class="sec-h"><span class="no">02</span><h2>${esc(t.secRefs)}</h2><span class="note">${esc(t.refsNote)}</span></div>
  <table><thead><tr>${t.refCols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
  <tbody>
${refRows}
  </tbody></table>
</section>` : ''}

${dlgRows ? `<section class="top-sec" id="sec-dialogue">
  <div class="sec-h"><span class="no">03</span><h2>${esc(t.secDialogue)}</h2><span class="note">${esc(t.dialogueNote)}</span></div>
  <table><thead><tr>${t.dialogueCols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
  <tbody>
${dlgRows}
  </tbody></table>
</section>` : ''}

<section class="top-sec" id="sec-intent"><h2><span class="no">04</span> ${lang === 'en' ? 'Current upstream handoff' : '当前上游交接关系'}</h2>
<p>${esc(summaryText(gates, lang))}</p>
<pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(reportContext(doc, ctx), null, 2))}</pre>
</section>
<div class="kpis">
  <div class="kpi accent"><div class="l">${esc(t.kpi.segments)}</div><div class="v">${stats.totals.segments} <small>${esc(t.unitSeg)}</small></div><div class="d">${esc(t.kpi.segmentsSub(params.maxSegmentSeconds))}</div></div>
  <div class="kpi"><div class="l">${esc(t.kpi.cuts)}</div><div class="v">${stats.totals.cuts} <small>${esc(t.unitCut)}</small></div><div class="d">${esc(t.kpi.cutsSub(r1(stats.totals.avgCutSeconds)))}</div></div>
  <div class="kpi"><div class="l">${esc(t.kpi.time)}</div><div class="v">${esc(fmtMin(stats.totals.seconds))}</div><div class="d">${esc(t.kpi.timeSub(fmtMin(stats.totals.targetSeconds)))}</div></div>
  <div class="kpi"><div class="l">${esc(t.kpi.lines)}</div><div class="v">${stats.totals.withLines} <small>${esc(t.unitSeg)}</small></div><div class="d">${esc(t.kpi.linesSub)}</div></div>
</div>
${failed.length ? `<div class="galert"><b>✗ ${esc(t.gatesFail(failed.length))}</b>${failed.map((g) => `<span>${esc(gateText(g, t.langCode).label)}${g.detail ? ` — ${esc(gateText(g, t.langCode).detail)}` : ''}</span>`).join('')}</div>` : ''}

<section class="top-sec" id="sec-rhythm">
  <div class="sec-h"><span class="no">05</span><h2>${esc(t.secRhythm)}</h2><span class="note">${esc(t.rhythmNote)}</span></div>
  <div class="rhythm">
    <div class="legend">${rhythmLegend}</div>
${rhythmRows}
  </div>
</section>

<section class="top-sec" id="sec-gates">
  <div class="sec-h"><span class="no">06</span><h2>${esc(t.secGates)}</h2></div>
  ${gateList}
  <p class="gsum">${failed.length ? `<b>${esc(t.gatesFail(failed.length))}</b>` : esc(t.gatesPass)}</p>
</section>

<p class="foot">${esc(t.colophon)}</p>
</div>

<div class="lightbox" id="lightbox"><img alt=""></div>

<script type="application/json" id="creation-data">${embedDoc(doc)}</script>
<script>
const L = ${JSON.stringify({ copied: t.copied, failed: t.copyFailed, show: t.showSegs, hide: t.hideSegs })};

document.querySelectorAll('.shmore').forEach((btn) => {
  const zone = btn.previousElementSibling;
  if (zone.scrollHeight > 0 && zone.scrollHeight <= 780) {
    zone.classList.remove('clip');
    btn.remove();
    return;
  }
  btn.addEventListener('click', () => {
    const clipped = zone.classList.toggle('clip');
    btn.textContent = clipped ? L.show : L.hide;
    if (clipped) zone.closest('.ep').scrollIntoView({ block: 'nearest' });
  });
});

const lb = document.getElementById('lightbox');
document.addEventListener('click', (e) => {
  const img = e.target.closest('.reftile img');
  if (img) {
    lb.querySelector('img').src = img.src;
    lb.classList.add('on');
    return;
  }
  if (lb.contains(e.target)) lb.classList.remove('on');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') lb.classList.remove('on');
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.copy');
  if (!btn) return;
  e.preventDefault();
  const label = btn.textContent;
  try {
    await navigator.clipboard.writeText(btn.dataset.copy);
    btn.textContent = L.copied;
    btn.dataset.done = '1';
  } catch {
    btn.textContent = L.failed;
  }
  setTimeout(() => { btn.textContent = label; delete btn.dataset.done; }, 1600);
});

document.querySelector('.expo').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const url = URL.createObjectURL(
    new Blob([document.getElementById('creation-data').textContent], { type: 'application/json' }),
  );
  const a = Object.assign(document.createElement('a'), { href: url, download: btn.dataset.name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});
</script>
</body></html>`;
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

const USAGE = `mint-creation.mjs — mint-creation skill 的确定性工具（参考图直出视频）

  seed <script.json> [--eps 1-3]               从剧本预填节拍工作底稿（打印到 stdout）
  validate <creation.json> --script <script.json>
           [--outline] [--cast] [--art]         校验；有违规逐条打印并 exit 1
           [--shots <卡片目录>]                  cast/art 查参考图与提示词人名；挂载配方卡库开 shot-recipe 门
  checkup <creation.json> --script <script.json>
          [--outline] [--art] [--shots ...]     只打印质量门 ✓/✗，有未过项 exit 1
  render <creation.json> --script <script.json>
         [--html|--md] [--outline] [--art]      渲染报告到 stdout（默认 --md）
         [--lang zh|en]                         报告界面语言（默认 zh；未指定时读取 JSON 顶层 lang 字段）
  （所有命令自动读取剧本旁边的 <剧本名>-storyboard.md 分镜；--storyboard <文件> 显式指定，段号、场次与节拍范围须与分镜一致）
  prompts brief <creation.json> --ep <集号>     打印派发给编写方与审核方的输入材料（节拍底稿、资产表、项目要求、模型）
  prompts init <creation.json> [--dir .]        为已有的段生成工作单 <段号>/prompt.md（status: draft；不覆盖已有工作单）
  prompts check <creation.json> [--dir .]       把工作单拼入内存中的 creation 并执行全部结构检查；不要求已批准
  prompts status <creation.json> [--dir .]      汇总各段审核状态；存在未批准、阻塞或批准失效的段时 exit 1
  prompts apply <creation.json> [--dir .]       全部批准、绑定有效且检查通过后，把分镜与提示词回写 creation.json
  prompts new <creation.json> <段号> [--scene N]            ┐ 编写方与审核方命令的本地等价物：
  prompts submit <creation.json> [段号...]                  │ 没有单独安装 mint-video-prompt 与
  prompts verdict <creation.json> <approved|changes_requested|blocked> <段号>...
                                                            ┘ mint-video-prompt-review 时使用
  export <creation.json> --script <script.json> [--out .] [--dir <工作单目录>]
                                                导出投产包：根部 manifest.json，引用已批准的 <段号>/prompt.md 工作单
  videos <manifest.json>          导出离线交接计划，交给 ly-video 生成
         [--only <ID列表>]                仅选择指定任务（图片自动补齐参考依赖）
         [--dry-run]                      只预览计划；本命令始终不上传、不提交
         [--out <plan.json>]              另存计划（不覆盖已有文件）
  slug <name>                                   剧名转安全文件名

validate/render/export/videos 都按参考图的相对路径（../characters/images、../art/images）解析，
运行前先 cd 进 <工作目录>/creation/（与 characters/、art/ 平级）。本 skill 不落 .gates.jsonl、不加 stats 子命令。`;

function readJson(path) {
  const value = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(readFileSync(resolve(path))));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} 必须为 JSON 对象，不能作为缺少上游跳过`);
  if (value.provenance) verifySources(value, resolve(path));
  return value;
}

function flag(rest, name, fallback = null) {
  const i = rest.indexOf(name);
  if (i < 0) return fallback;
  if (!rest[i + 1] || rest[i + 1].startsWith('-')) throw new Error(`${name} 缺少参数值`);
  if (rest.indexOf(name, i + 1) !== -1) throw new Error(`${name} 重复提供`);
  return rest[i + 1];
}

/*
 * --shots 只接受卡片目录，不接受导出的 shots.json：中间产物必然会漂，
 * 卡片 .md 才是唯一来源。目录里读不到卡片就直接报错——挂了却没生效
 * 比没挂更坏。
 */
function loadShots(dir) {
  if (/\.json$/i.test(dir)) {
    throw new Error('--shots 只接受卡片目录（shot-recipes/references/cards），不接受导出的 shots.json——中间产物必然会漂');
  }
  const cards = loadRecipes(dir);
  if (!cards.size) throw new Error(`--shots ${dir} 里没读到卡片（.md）——请指向 shot-recipes/references/cards`);
  return cards;
}

function loadCtx(rest, fromDir = '.') {
  const get = (name) => {
    const path = flag(rest, name);
    return path ? readJson(path) : undefined;
  };
  const shots = flag(rest, '--shots');

  /*
   * 生产参数不用挂载，自己从产物所在目录向上找——它住在工作目录根。
   * 找到了只影响 segment-cap 门的时长区间比对，没有开关：改了要重下单的
   * 东西不该留后门。--no-production 是给老项目临时绕过用的，用了会明说。
   */
  if (rest.includes('--production') && rest.includes('--no-production')) throw new Error('--production 与 --no-production 互斥');
  let production;
  let productionPath = null;
  if (!rest.includes('--no-production')) {
    productionPath = flag(rest, '--production') ?? findProduction(fromDir);
    if (productionPath) production = readJson(productionPath);
  }

  const ctx = {
    script: get('--script'), outline: get('--outline'), cast: get('--cast'), art: get('--art'),
    recipes: shots ? loadShots(shots) : null, production, productionPath,
    scriptPath: flag(rest, '--script') ? resolve(flag(rest, '--script')) : undefined,
    outlinePath: flag(rest, '--outline') ? resolve(flag(rest, '--outline')) : undefined,
    castPath: flag(rest, '--cast') ? resolve(flag(rest, '--cast')) : undefined,
    artPath: flag(rest, '--art') ? resolve(flag(rest, '--art')) : undefined,
  };
  const root = productionPath ? dirname(resolve(productionPath))
    : ['creation','script','outline','art','characters'].includes(basename(resolve(fromDir))) ? dirname(resolve(fromDir)) : resolve(fromDir);
  for (const [key, directory] of [['script','script'],['outline','outline'],['art','art'],['cast','characters']]) {
    if (ctx[key] !== undefined) continue;
    const dir = join(root, directory);
    try { lstatSync(dir); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const candidates = readdirSync(dir).filter(name => name.endsWith('.json') && !name.startsWith('.') && !/manifest|\.backup|\.bak|\.tmp|\.review/i.test(name)).sort();
    if (candidates.length > 1) throw new Error(`上游 ${key} 不唯一，请显式提供路径：${candidates.join(', ')}`);
    if (candidates.length === 1) {
      ctx[key + 'Path'] = join(dir,candidates[0]);
      ctx[key] = readJson(ctx[key + 'Path']);
    }
  }
  // 分镜与剧本 JSON 同目录：xxx.json → xxx-storyboard.md。显式 --storyboard 必须存在。
  const storyboardFlag = flag(rest, '--storyboard');
  if (storyboardFlag || ctx.scriptPath) {
    ctx.storyboardPath = resolve(storyboardFlag ?? storyboardPathOf(ctx.scriptPath));
    if (storyboardFlag || existsSync(ctx.storyboardPath)) ctx.storyboard = parseStoryboard(readFileSync(ctx.storyboardPath, 'utf8'));
  }
  return ctx;
}

/** 找到就报一声，找不到也报一声——静默是最坏的那种。 */
function announceProduction(ctx, rest, docPath = null, doc = null) {
  const which = '视频时长区间比对与产物落点提示';
  if (rest.includes('--no-production')) {
    console.error(`⚠️ --no-production：生产参数的 ${which}跳过`);
    return;
  }
  if (ctx.productionPath) {
    console.error(`↳ 生产参数：${ctx.productionPath}`);
    // 提示词的填法指南按模型动态载入，所以把「这部剧该读哪份」直接打出来——
    // 骨架永远是 creation-prompt.md，解不出指南的模型就只照骨架写
    const model = videoModelOf(doc, ctx.production);
    const guide = promptGuideOf(model);
    console.error(
      guide
        ? `↳ 视频模型 ${model} → 编写方读取填法指南 references/${guide}（骨架仍是 references/creation-prompt.md）`
        : `↳ 视频模型 ${model} 没有对应的填法指南 → 编写方照 references/creation-prompt.md 的通用骨架写`,
    );
    if (autopilotOf(ctx.production)) console.error(`↳ ${AUTOPILOT_NOTE}`);
    const note = stageDirNote(docPath, ctx.productionPath);
    if (note) console.error(`⚠️ ${note}`);
  } else console.error(`⚠️ 向上 ${PRODUCTION_DEPTH} 层没找到 ${PRODUCTION_FILE}，${which}跳过——跑 /mint-setup 生成一份可以打开它`);
}

/* ------------------------------------------------------------------ */
/* 工作单：<段号>/prompt.md                                             */
/* ------------------------------------------------------------------ */
/*
 * 提示词的编写与审核发生在工作单里（编写方、审核方两个独立 skill 各写各的区域），
 * creation.json 仍是机器侧唯一数据源：全部批准后由 apply 回写。纯函数在前，
 * 文件读写在 CLI 层。
 */
const WORKSHEET_FILE = 'prompt.md';
const SEGMENT_DIR_RE = /^E(\d{2,})-\d{2,}$/;

export function listWorksheets(dir) {
  const root = resolve(dir);
  if (!existsSync(root)) return [];
  return readdirSync(root).filter(name => SEGMENT_DIR_RE.test(name) && existsSync(join(root, name, WORKSHEET_FILE))).sort()
    .map(name => ({ id: name, path: join(root, name, WORKSHEET_FILE), sheet: parseWorksheet(readFileSync(join(root, name, WORKSHEET_FILE), 'utf8')) }));
}

/** 把工作单拼入 creation 的副本：每集的 segments 整体替换，seedScenes 工作底稿移除。 */
export function assembleFromWorksheets(doc, worksheets, ctx = {}) {
  const problems = [];
  const out = structuredClone(doc);
  const model = videoModelOf(doc, ctx.production);
  const byEp = new Map();
  for (const w of worksheets) {
    const tag = `${w.id}/${WORKSHEET_FILE}`;
    if (w.sheet.problems.length) { problems.push(...w.sheet.problems.map(x => `${tag}：${x}`)); continue; }
    if (w.sheet.meta.segment !== w.id) { problems.push(`${tag}：状态头 segment（${w.sheet.meta.segment}）与文件夹名不一致`); continue; }
    if (w.sheet.meta.model && w.sheet.meta.model !== model) problems.push(`${tag}：工作单按 ${w.sheet.meta.model} 编写，当前有效视频模型为 ${model}——更换模型后需要重新编写并审核`);
    if (!w.sheet.body) problems.push(`${tag}：提示词正文为空`);
    const ep = Number(w.id.match(SEGMENT_DIR_RE)[1]);
    if (!byEp.has(ep)) byEp.set(ep, []);
    byEp.get(ep).push({ ...w.sheet.structure, prompt: w.sheet.body });
  }
  const known = new Set((out.episodes ?? []).map(e => e.ep));
  for (const ep of byEp.keys()) if (!known.has(ep)) problems.push(`存在第 ${ep} 集的工作单，但 creation.json 没有这一集——先运行 seed 生成这一集的骨架`);
  for (const ep of out.episodes ?? []) {
    ep.segments = byEp.get(ep.ep) ?? [];
    delete ep.seedScenes;
    if (!ep.segments.length) problems.push(`第 ${ep.ep} 集没有任何工作单`);
  }
  return { doc: out, problems };
}

/** 导出、回写与生成计划共用：工作单必须已批准，批准的两重绑定仍然有效，并且与 creation.json 里的这一段完全一致。 */
export function worksheetSyncProblem(seg, sheet, load = null) {
  const approval = load ? bindingProblem(sheet, load) : approvalProblem(sheet);
  if (approval) return approval;
  const { prompt, ...structure } = seg;
  if (stable(structure) !== stable(sheet.structure) || String(prompt ?? '').trim() !== sheet.body) {
    return '工作单与 creation.json 不一致——先运行 prompts apply 回写';
  }
  return null;
}

/**
 * 派发给编写方与审核方的输入材料：全部来自现有上游，原样摘出，不改写。
 * 从当前剧本重新展开节拍，所以回写之后（seedScenes 已移除）仍然可以再次派发。
 * 资产附设定图的内容摘要 sheetHash：批准绑定它，设定图重新生成后旧批准失效。
 */
export function dispatchBrief(doc, ctx = {}, epNo, { exists = () => false, hashFile = () => null } = {}) {
  if (!ctx.script) throw new Error('生成输入材料需要剧本');
  verifySources(ctx.script, ctx.scriptPath);
  if (ctx.outline) verifySources(ctx.outline, ctx.outlinePath);
  for (const key of ['cast','art']) if (ctx[key] !== undefined) {
    const errors = assetContractErrors(ctx[key],key,ctx.script.source);
    if (errors.length) throw new Error(errors.join('；'));
    verifySources(ctx[key],ctx[key+'Path']);
  }
  const seed = seedFromScript(ctx.script, [epNo, epNo], ctx).episodes[0];
  if (!seed) throw new Error(`剧本没有第 ${epNo} 集`);
  const model = videoModelOf(doc, ctx.production);
  const sourceDocument = (d, artifactPath) => ({...structuredClone(d),path:realpathSync(resolve(dirname(resolve(artifactPath ?? '.')),d.path))});
  const sourceEvidence = (x, upstream, artifactPath) => x?.sourceRefs ? {sourceRefs:structuredClone(x.sourceRefs),
    sourceDocuments:(upstream?.provenance?.documents ?? []).filter(d => assetSourceRefs(x).some(r => r.documentId === d.id)).map(d => sourceDocument(d,artifactPath))} : {};
  const asset = (kind, x) => {
    const r = referenceImagePath(kind, x.name, x.id, ctx), key = kind === 'character' ? 'cast' : 'art';
    return { id:x.id,name:x.name,specification:structuredClone(x),assetDigest:assetDigest(x),sheet:r,sheetExists:exists(r),sheetHash:hashFile(r), ...sourceEvidence(x,ctx[key],ctx[key+'Path']),
      sourceScope:ctx[key]?.provenance?.scope ?? null,sourceCoverage:(ctx[key]?.provenance?.coverage ?? []).filter(c=>assetSourceRefs(x).some(r=>r.documentId===c.documentId && r.startLine<=c.endLine && c.startLine<=r.endLine)) };
  };
  if (ctx.storyboard !== undefined) {
    const board = storyboardErrors(ctx.storyboard, ctx.script, scriptParams(ctx.script)).errors;
    if (board.length) throw new Error(`分镜没有通过检查，先回到 script 阶段修订：${board.join('；')}`);
  }
  const brief = doc?.creativeBrief ?? ctx.production?.creativeBrief;
  const { planSource, endBeat, openingBeat, ...intent } = episodeIntent(epNo, ctx);
  return {
    source: doc?.source ?? ctx.script.source ?? '', ep: epNo,
    targetSeconds: ctx.script.episodes.find(e => e.ep === epNo)?.targetSeconds,
    video: { ...packVideoOf(doc, ctx.production), model }, promptLang: promptLangOf(doc, ctx.production, promptFamilyOf(model)),
    maxSegmentSeconds: paramsOf(doc).maxSegmentSeconds, maxOnScreen: paramsOf(doc).maxOnScreen,
    ...(brief ? { creativeBrief: brief } : {}),
    ...(ctx.production?.style ? {style:{label:ctx.production.style.label,phrase:ctx.production.style.phrase}} : {}),
    intent: { planSource, ...intent, ...(openingBeat ? { openingBeat } : {}), ...(endBeat ? { endBeat } : {}) },
    upstream: Object.fromEntries(['outline','cast','art'].map(key=>[key,{status:ctx[key] === undefined ? 'skipped' : 'provided',...(ctx[key]===undefined?{reason:'missing-upstream'}:{})}])),
    assetMappings: (ctx.script.assetMappings ?? []).map(m=>({...structuredClone(m),mappingErrors:mappingErrors(ctx.script,ctx,[{kind:m.kind,localId:m.localId}])})),
    assets: {
      characters: characterAssets(ctx).filter(c => c?.id && c?.name).map(c => asset('character', c)),
      scenes: (ctx.art?.scenes ?? []).filter(x => x?.id && x?.name).map(x => asset('scene', x)),
      props: (ctx.art?.props ?? []).filter(x => x?.id && x?.name).map(x => asset('prop', x)),
    },
    seedScenes: seed.seedScenes,
    ...(ctx.storyboard !== undefined ? { storyboard: storyboardBrief(ctx.storyboard, epNo) } : {}),
    ...(ctx.script.provenance ? {provenance: {...structuredClone(ctx.script.provenance),documents:ctx.script.provenance.documents.map(d => sourceDocument(d,ctx.scriptPath))}} : {}),
    sourceVerification: ctx.script.provenance ? 'bytes-and-coordinates-only' : 'not-applicable',
    beatClaims: (ctx.script.episodes.find(e => e.ep === epNo)?.beatClaims ?? []).map(claim => {
      const fact=ctx.outline?.beats?.find(b => b.id === claim.beatId);
      return {...structuredClone(claim), ...(fact ? {fact:structuredClone(fact), ...sourceEvidence(fact,ctx.outline,ctx.outlinePath)} : {})};
    }),
  };
}

const fileDigest = path => { try { return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16); } catch { return null; } };
/** 设定图路径相对 creation.json 所在目录。 */
const briefFiles = baseDir => ({ exists: rel => existsSync(resolve(baseDir, rel)), hashFile: rel => fileDigest(resolve(baseDir, rel)) });
const epOf = id => Number(String(id ?? '').match(SEGMENT_DIR_RE)?.[1]);

/** 按集生成当前的输入材料，同一次命令内只生成一次。生成不了时返回原因，由调用方当作批准无法核对。 */
function materialLoader(doc, ctx, baseDir) {
  const cache = new Map();
  return ep => {
    if (!cache.has(ep)) {
      let value;
      if (!ctx.script) value = { problem: '没有剧本，无法核对批准绑定的输入材料' };
      else try { value = { material: dispatchBrief(doc, ctx, ep, briefFiles(baseDir)) }; }
      catch (error) { value = { problem: `无法生成第 ${ep} 集的输入材料：${error.message}` }; }
      cache.set(ep, value);
    }
    return cache.get(ep);
  };
}

/** 批准的两重绑定：内容没有改动，这一段依据的输入材料也还是当前的。 */
function bindingProblem(sheet, load) {
  const approval = approvalProblem(sheet);
  if (approval) return approval;
  const format = promptProblems(sheet.body, sheet.structure?.images ?? []);
  if (format.length) return `工作单不符合当前五部分标准：${format.join('；')}——重新编写并审核`;
  const { material, problem } = load(epOf(sheet.meta.segment));
  return problem ?? inputProblem(sheet, material);
}

function statusRows(worksheets, load) {
  return worksheets.map(w => {
    const invalid = w.sheet.problems.length ? `格式有误：${w.sheet.problems[0]}` : null;
    const stale = !invalid && w.sheet.meta.status === 'approved' ? bindingProblem(w.sheet, load) : null;
    const capped = !invalid && w.sheet.meta.status === 'changes_requested' && w.sheet.meta.round >= MAX_ROUNDS;
    const blocked = !invalid && w.sheet.meta.status === 'blocked';
    const awaiting = !invalid && w.sheet.meta.status === 'changes_requested' && reviewItems(w.sheet.review).block.length > 0;
    return { id: w.id, status: w.sheet.meta.status ?? '?', round: w.sheet.meta.round ?? 0,
      ok: !invalid && !stale && w.sheet.meta.status === 'approved',
      note: invalid ?? stale ?? (awaiting ? '返修同时有待确认事项：先协调缺少的依据，再派发编写；不要重复空转' : blocked ? '审核方登记了阻塞——停止这一段的循环，先协调缺少的材料或交给用户决定' : capped ? `已满 ${MAX_ROUNDS} 轮仍未批准——停止循环，把分歧交给用户决定` : '') };
  });
}

async function main(argv) {
  if (argv.includes('--production') && argv.includes('--no-production')) throw new Error('--production 与 --no-production 互斥');
  for (const name of ['--script','--storyboard','--outline','--cast','--art','--shots','--production','--eps','--lang','--out','--dir','--ep','--scene','--only','--timeout','--concurrency']) {
    if (argv.includes(name)) flag(argv, name);
  }
  const [cmd, ...rest] = argv;

  if (!cmd || cmd === '-h' || cmd === '--help') {
    console.log(USAGE);
    process.exit(cmd ? 0 : 1);
  }

  if (cmd === 'seed') {
    const [path] = rest;
    if (!path) throw new Error('用法：seed <script.json> [--eps 1-3]');
    const range = flag(rest, '--eps');
    let epRange = null;
    if (range) {
      const m = String(range).match(/^(\d+)-(\d+)$/) ?? String(range).match(/^(\d+)$/);
      if (!m) throw new Error('--eps 形如 3 或 1-6');
      epRange = m[2] ? [Number(m[1]), Number(m[2])] : [Number(m[1]), Number(m[1])];
    }
    const script = readJson(path);
    const ctx = loadCtx([...rest, ...(!rest.includes('--script') ? ['--script', path] : [])], dirname(resolve(path)));
    const seed = seedFromScript(script, epRange, ctx);
    console.log(JSON.stringify(seed, null, 2));
    return;
  }

  if (cmd === 'validate' || cmd === 'checkup') {
    const [path] = rest;
    if (!path) throw new Error(`用法：${cmd} <creation.json> --script <script.json> [--outline] [--cast] [--art]`);
    const doc = readJson(path);
    const ctx = loadCtx(rest, resolve(path, '..'));
    if (!ctx.cast || !ctx.art) console.error('⚠️ 没给 --cast / --art，跳过参考图挂载核对（refimage-coverage）与提示词人名检查');
    ctx.imageExists = (rel) => existsSync(resolve(rel));
    announceProduction(ctx, rest, path, doc);

    // 不落 .gates.jsonl、不加 stats 子命令——本 skill 不累积门失败统计，结果只在当次输出里

    if (cmd === 'checkup') {
      const gates = gateReport(doc, ctx);
      for (const g of gates) console.log(`${statusLabel(g, 'zh')} (${g.status}) [${g.category}/${g.level}${g.reason ? '/' + g.reason : ''}] ${g.label}${g.detail ? ` — ${g.detail}` : ''}`);
      const failedN = gates.filter(isBlocking).length;
      console.log(`\n阻断失败 ${failedN}；提醒 ${gates.filter(g => g.status === 'fail' && g.level === 'warn').length}；跳过 ${gates.filter(g => g.status === 'skipped').length}；内容未评审`);
      if (ctx.recipes) {
        const drifted = [];
        for (const ep of doc?.episodes ?? []) {
          for (const seg of ep?.segments ?? []) {
            (seg?.cuts ?? []).forEach((cut, ci) => {
              const card = typeof cut?.recipe === 'string' ? ctx.recipes.get(cut.recipe) : null;
              if (!card) return;
              const d = recipeDrift(cut, card);
              if (d.sizes.length || d.cameras.length) {
                drifted.push(`  ${seg.id}#${ci + 1}「${card.name}」${I18N.zh.recipeDrift(d.sizes, d.cameras)}`);
              }
            });
          }
        }
        if (drifted.length) console.error(`\nℹ️ ${drifted.length} 处分镜的景别／运镜偏离了配方建议——只提示不设门：\n${drifted.join('\n')}`);
      }
      if (failedN) process.exit(1);
      return;
    }

    const problems = validateCreation(doc, ctx);
    if (problems.length) {
      console.error(`✗ ${problems.length} 处违规：\n`);
      for (const x of problems) console.error('  ' + x);
      process.exit(1);
    }
    const st = computeStats(doc, ctx.script);
    console.log(`✓ ${st.episodes.length} 集 / ${st.totals.segments} 段 / ${st.totals.cuts} 个分镜无阻断失败（共 ${st.totals.seconds}s / 目标 ${st.totals.targetSeconds}s）`);
    const gates = gateReport(doc, ctx);
    console.log(summaryText(gates, 'zh'));
    for (const g of gates.filter(g => g.status !== 'pass')) console.log(`${statusLabel(g, 'zh')} [${g.category}/${g.level}${g.reason ? '/' + g.reason : ''}] ${g.label}: ${g.detail}`);
    return;
  }

  if (cmd === 'prompts') {
    const [sub, path] = rest;
    const SUBS = ['brief', 'init', 'new', 'check', 'submit', 'verdict', 'status', 'apply'];
    if (!SUBS.includes(sub) || !path) throw new Error(`用法：prompts ${SUBS.join('|')} <creation.json> [--dir .]`);
    const doc = readJson(path);
    const creationDir = dirname(resolve(path));
    const dir = flag(rest, '--dir', creationDir);
    const args = rest.slice(2);
    const ctx = loadCtx(args, resolve(path, '..'));
    ctx.imageExists = (rel) => existsSync(resolve(creationDir, rel));
    const load = materialLoader(doc, ctx, creationDir);
    const model = videoModelOf(doc, ctx.production);
    const promptLang = promptLangOf(doc, ctx.production, promptFamilyOf(model));
    const ids = args.filter((a, i) => SEGMENT_DIR_RE.test(a) && !String(args[i - 1] ?? '').startsWith('--'));

    if (sub === 'brief') {
      const ep = Number(flag(rest, '--ep'));
      if (!Number.isInteger(ep) || ep < 1) throw new Error('用法：prompts brief <creation.json> --ep <集号>');
      if (!ctx.cast || !ctx.art) console.error('⚠️ 没有 cast / art，资产表不完整——编写方无法挂载缺少的参考图');
      console.log(JSON.stringify(dispatchBrief(doc, ctx, ep, briefFiles(creationDir)), null, 2));
      return;
    }

    if (sub === 'init') {
      let made = 0, kept = 0;
      for (const ep of doc.episodes ?? []) for (const seg of ep.segments ?? []) {
        const target = join(resolve(dir), seg.id, WORKSHEET_FILE);
        if (existsSync(target)) { kept += 1; continue; }
        const { prompt, ...structure } = seg;
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, serializeWorksheet({ meta: { segment: seg.id, status: 'draft', round: 0, model, promptLang }, structure, body: prompt }), 'utf8');
        made += 1;
      }
      console.log(`✓ 新建 ${made} 份工作单，保留已有 ${kept} 份 → ${resolve(dir)}/<段号>/${WORKSHEET_FILE}`);
      if (!made && !kept) console.log('creation.json 还没有段：由编写方按 seedScenes 创建工作单（prompts new，或 mint-video-prompt 的 new）');
      return;
    }

    // new、submit、verdict 是编写方与审核方命令的本地等价物：没有单独安装两个兄弟 skill 时，
    // 由拿着本 skill 指南副本的 subagent（或同一会话）调用。状态规则与兄弟 skill 共用同一份解析库。
    if (sub === 'new') {
      if (ids.length !== 1) throw new Error('用法：prompts new <creation.json> <段号> [--scene N] [--dir .]');
      const sceneIndex = Number(flag(rest, '--scene', '1'));
      if (!Number.isInteger(sceneIndex) || sceneIndex < 1) throw new Error('--scene 必须为从 1 起的整数');
      const target = join(resolve(dir), ids[0], WORKSHEET_FILE);
      if (existsSync(target)) throw new Error(`${target} 已存在，拒绝覆盖——直接修改现有工作单`);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, serializeWorksheet({ meta: { segment: ids[0], status: 'draft', round: 0, model, promptLang }, structure: { id: ids[0], sceneIndex, cuts: [], images: [] }, body: '' }), 'utf8');
      console.log(`✓ 新建工作单 ${target}`);
      return;
    }

    const worksheets = listWorksheets(dir);
    const pick = () => {
      const missing = ids.filter(id => !worksheets.some(w => w.id === id));
      if (missing.length) throw new Error(`没有这些段的工作单：${missing.join('、')}`);
      return worksheets.filter(w => ids.includes(w.id));
    };

    if (sub === 'verdict') {
      const verdict = args.find(a => VERDICTS.includes(a));
      if (!verdict || !ids.length) throw new Error(`用法：prompts verdict <creation.json> <${VERDICTS.join('|')}> <段号>...`);
      const results = pick().map(w => {
        const { material, problem } = verdict === 'approved' ? load(epOf(w.id)) : {};
        return { ...w, ...(problem ? { problems: [problem] } : recordVerdict(w.sheet, verdict, material ?? null)) };
      });
      const failed = results.filter(r => r.problems.length);
      for (const r of failed) console.error(`✗ ${r.id}\n${r.problems.map(x => '  ' + x).join('\n')}`);
      if (failed.length) process.exit(1);
      for (const r of results) { writeFileSync(r.path, r.text, 'utf8'); console.log(`✓ ${r.id} → ${verdict}`); }
      return;
    }

    if (sub === 'status') {
      const rows = statusRows(worksheets, load);
      for (const r of rows) console.log(`${r.ok ? '✓' : '✗'} ${r.id}  ${r.status}  第 ${r.round} 轮${r.note ? `  — ${r.note}` : ''}`);
      const pending = rows.filter(r => !r.ok).length;
      console.log(`\n共 ${rows.length} 段；已批准 ${rows.length - pending}；未批准 ${pending}`);
      if (!rows.length || pending) process.exit(1);
      return;
    }

    announceProduction(ctx, args, path, doc);
    const assembled = assembleFromWorksheets(doc, worksheets, ctx);
    const problems = [...assembled.problems];
    if (!problems.length) problems.push(...validateCreation(assembled.doc, ctx));
    // 没有点名时提交所有需要提交的工作单：草稿、被退回、阻塞，以及批准已失效的
    const targets = sub !== 'submit' ? [] : ids.length ? pick()
      : worksheets.filter(w => ['draft', 'changes_requested', 'blocked'].includes(w.sheet.meta.status) || (w.sheet.meta.status === 'approved' && bindingProblem(w.sheet, load)));
    if (sub === 'submit' && !problems.length) for (const w of targets) problems.push(...submitProblems(w.sheet).map(x => `${w.id}：${x}`));
    if (sub === 'apply' && !problems.length) {
      for (const w of worksheets) { const p = bindingProblem(w.sheet, load); if (p) problems.push(`${w.id}：${p}`); }
    }
    if (problems.length) {
      console.error(`✗ ${problems.length} 处问题：\n`);
      for (const x of problems) console.error('  ' + x);
      process.exit(1);
    }
    if (sub === 'check') {
      console.log(`✓ ${worksheets.length} 份工作单拼入后无阻断失败；审核状态另见 prompts status`);
      return;
    }
    if (sub === 'submit') {
      if (!targets.length) { console.log('没有需要提交的工作单'); return; }
      for (const w of targets) { writeFileSync(w.path, submittedText(w.sheet), 'utf8'); console.log(`✓ ${w.id} 已提交审核（第 ${w.sheet.meta.round + 1} 轮）`); }
      return;
    }
    writeFileSync(resolve(path), JSON.stringify(assembled.doc, null, 2) + '\n', 'utf8');
    console.log(`✓ ${worksheets.length} 段已批准的分镜与提示词回写 → ${resolve(path)}`);
    return;
  }

  if (cmd === 'render') {
    const [path] = rest;
    if (!path) throw new Error('用法：render <creation.json> --script <script.json> [--html|--md] [--lang zh|en] [--outline] [--art]');
    const doc = readJson(path);
    const ctx = loadCtx(rest, resolve(path, '..'));
    const langFlag = flag(rest, '--lang');
    if (langFlag) ctx.lang = langFlag;
    ctx.imageExists = (rel) => existsSync(resolve(rel));
    process.stdout.write((rest.includes('--html') ? renderHtml(doc, ctx) : renderMarkdown(doc, ctx)) + '\n');
    return;
  }

  if (cmd === 'export') {
    const [path] = rest;
    if (!path) throw new Error('用法：export <creation.json> --script <script.json> [--out .] [--dir <工作单目录>]');
    const doc = readJson(path);
    const ctx = loadCtx(rest, resolve(path, '..'));
    if (!ctx.cast || !ctx.art) console.error('⚠️ 没给 --cast / --art，参考图路径解不出来，投产包的 images 会是空的');
    announceProduction(ctx, rest, path, doc);
    if (!ctx.script) throw new Error('导出投产包必须提供 --script；独立校验不等于可投产');
    // 设定图相对 creation.json 所在目录；工作单默认也在那里。manifest 里的路径一律相对 manifest 自己
    const creationDir = dirname(resolve(path));
    const outDir = resolve(flag(rest, '--out', '.'));
    const sheetDir = resolve(flag(rest, '--dir', creationDir));
    // Normalize existing ancestors too: macOS /var and /private/var may denote the same project.
    const physical = p => existsSync(p) ? realpathSync(p) : join(physical(dirname(p)), basename(p));
    const toPack = (target) => relative(physical(outDir), physical(target)).split('\\').join('/');
    ctx.imageExists = rel => existsSync(resolve(creationDir, rel));
    const problems = validateCreation(doc, ctx);
    if (problems.length) throw new Error(`投产前检查失败：${problems.join('；')}`);
    const n = namer(ctx);
    const resolveImage = (kind, ref) => {
      const name = n.nameOf(kind, ref);
      if (!name) return { name: '', path: '', exists: false };
      const r = resolveReferenceImage(kind, name, creationDir, {id:imageAssetId(ctx,kind,ref),ctx});
      return { name, mappedAssetId:imageAssetId(ctx,kind,ref), assetDigest:mappedAsset(ctx,kind,ref) ? assetDigest(mappedAsset(ctx,kind,ref)) : null, path: toPack(resolve(creationDir, r.path)), exists: r.exists };
    };
    const pack = exportPack(doc, ctx.script, { resolveImage, dir: '.', production: ctx.production, scriptPath: ctx.scriptPath });
    // 工作单就是投产包里的 prompt.md：必须已批准、绑定仍然有效并与 creation.json 一致；导出不改写它
    const load = materialLoader(doc, ctx, creationDir);
    const unapproved = [];
    for (const ep of doc.episodes ?? []) for (const seg of ep.segments ?? []) {
      const target = join(sheetDir, seg.id, WORKSHEET_FILE);
      if (!existsSync(target)) { unapproved.push(`${seg.id}：没有工作单——已有的段先运行 prompts init，再走编写与审核`); continue; }
      const p = worksheetSyncProblem(seg, parseWorksheet(readFileSync(target, 'utf8')), load);
      if (p) unapproved.push(`${seg.id}：${p}`);
    }
    if (unapproved.length) throw new Error(`存在未批准的段，不能导出投产包：\n  ${unapproved.join('\n  ')}`);
    const manifest = JSON.parse(pack.files.find(f => f.path === 'manifest.json').content);
    manifest.creation = toPack(resolve(path));
    for (const s of manifest.segments) s.prompt = toPack(join(sheetDir, s.segment, WORKSHEET_FILE));
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    const segN = pack.manifest.length;
    console.log(`✓ ${segN} 段投产包 → ${outDir}/（根部 manifest.json；每段引用已批准的工作单 prompt.md）`);
    if (pack.missingTotal) console.log(`⚠️ 缺 ${pack.missingTotal} 张参考图，已在 manifest 的 missing 里标注——下单前先补齐`);
    return;
  }

  if (cmd === 'videos') {
    checkPlanFlags(rest);
    const [path] = rest;
    if (!path) throw new Error('用法：videos <manifest.json> [--only E01-01,E01-02] [--dry-run] [--out plan.json]');
    const manifest = readJson(path);
    const outDir = resolve(path, '..');
    const video = manifest.video ?? null;
    if (!video?.model) throw new Error('manifest.json 顶层缺 video.model——先跑 export（工作目录要挂 production.json，没有就跑 /mint-setup 生成一份）');

    const only = flag(rest, '--only');
    const segs = only
      ? (() => {
          const want = new Set(only.split(',').map((s) => s.trim()).filter(Boolean));
          const hit = (manifest.segments ?? []).filter((s) => want.has(s.segment));
          const miss = [...want].filter((k) => !(manifest.segments ?? []).some((s) => s.segment === k));
          if (miss.length) throw new Error(`--only 里这些段不在 manifest.json 里：${miss.join('、')}`);
          return hit;
        })()
      : (manifest.segments ?? []);

    // 批准绑定的是内容与输入：这里按当前的 creation.json 与上游重新核对，不信任导出那一刻的结论
    if (!manifest.creation) throw new Error('manifest.json 没有记录 creation.json 的位置，重新运行 export');
    const creationPath = resolve(outDir, manifest.creation);
    const doc = readJson(creationPath);
    const ctx = loadCtx(rest, dirname(creationPath));
    if (stable(video) !== stable(packVideoOf(doc, ctx.production))) throw new Error('manifest.json 的视频参数与当前 creation.json、production.json 不一致——重新运行 export');
    const load = materialLoader(doc, ctx, dirname(creationPath));
    const segById = new Map((doc.episodes ?? []).flatMap(ep => ep.segments ?? []).map(seg => [seg.id, seg]));
    const bound = [];

    const inputBase = {};
    if (video.aspectRatio) inputBase.aspect_ratio = video.aspectRatio;
    if (video.resolution) inputBase.resolution = video.resolution;

    const durationNotes = [];
    const jobs = segs.map((s) => {
      const mdPath = resolve(outDir, s.prompt);
      const md = readFileSync(mdPath, 'utf8');
      const sheet = parseWorksheet(md);
      const seg = segById.get(s.segment);
      const unapproved = seg ? worksheetSyncProblem(seg, sheet, load) : 'creation.json 没有这一段——重新运行 export';
      if (unapproved) throw new Error(`${s.segment}：${unapproved}——只有已批准的工作单可以进入生成计划`);
      if (sheet.meta.model !== video.model) throw new Error(`${s.segment}：工作单按 ${sheet.meta.model} 编写，投产包的视频模型为 ${video.model}——更换模型后需要重新编写并审核`);
      if ((seg.cuts ?? []).length && s.seconds !== segSeconds(seg)) throw new Error(`${s.segment}：manifest 秒数与当前已审核镜头不一致——重新运行 export`);
      if (!Array.isArray(s.images) || s.images.length !== (seg.images ?? []).length) throw new Error(`${s.segment}：manifest 素材与已审核工作单不一致——重新运行 export`);
      for (const [i,img] of (seg.images ?? []).entries()) {
        const actual = s.images[i], asset = mappedAsset(ctx,img.kind,img.ref);
        const expectedPath = asset && referenceImagePath(img.kind,asset.name,asset.id,ctx);
        const samePath = expectedPath && typeof actual?.path === 'string' && realpathSync(resolve(outDir,actual.path)) === realpathSync(resolve(dirname(creationPath),expectedPath));
        if (!asset || actual?.kind !== img.kind || actual?.ref !== img.ref || actual?.mappedAssetId !== asset.id || actual?.assetDigest !== assetDigest(asset) || actual?.name !== asset.name || (actual?.role ?? '') !== (img.role ?? '') || !samePath) throw new Error(`${s.segment}：manifest 素材身份、映射或路径与当前 cast/art 不一致——重新运行 export`);
      }
      bound.push({ segment: s.segment, bodyHash: sheet.meta.bodyHash, inputHash: sheet.meta.inputHash });
      const prompt = sheet.body;
      if (!prompt) throw new Error(`${s.segment} 提示词为空`);
      if (promptFamilyOf(video.model) === 'seedance' && promptTimecode(prompt)) throw new Error(`${s.segment} seedance 提示词禁止精确时刻／秒数区间`);
      const { duration, note } = clampDuration(s.seconds, video.model);
      if (duration === null) throw new Error(`${s.segment}：${note}`);
      if (note) durationNotes.push(`${s.segment}：${note}`);
      return {
        key: s.segment, name: s.segment, file: `${s.segment}/video.mp4`,
        prompt, duration,
        images: s.images ?? [],
      };
    });
    if (durationNotes.length) console.error(`⚠️ duration 折算：\n${durationNotes.map((x) => '  ' + x).join('\n')}`);

    const plan = mediaPlan(jobs, { kind: 'video', model: video.model, inputBase, outDir, only });
    // 外部执行工具提交前重新运行本命令并比对 input：不一致说明计划生成之后内容或输入又变了
    plan.approval = { manifest: resolve(path), input: createHash('sha256').update(stable({ video, bound }), 'utf8').digest('hex').slice(0, 16),
      note: '提交前重新运行 videos 并比对 input；请求的提示词、参考图顺序和参数必须与本计划一致。内容批准不等于付费授权。' };
    printPlan(plan, flag(rest, '--out'));
    console.error('✓ 交接计划已准备；未提交、未生成。请继续使用 ' + plan.skill + '。');
    return;
  }

  if (cmd === 'slug') {
    if (!rest[0]) throw new Error('用法：slug <name>');
    console.log(slug(rest[0]));
    return;
  }

  throw new Error(`未知命令 ${cmd}\n\n${USAGE}`);
}

// 软链安装时 argv[1] 是链接路径，两边都取 realpath 才能比得上
function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  // `render ... | head` 这类管道提前关闭时安静退出，别甩 EPIPE 堆栈
  process.stdout.on('error', (e) => {
    if (e.code === 'EPIPE') process.exit(0);
    throw e;
  });
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
