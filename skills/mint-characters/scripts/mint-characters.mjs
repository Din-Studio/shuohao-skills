#!/usr/bin/env node
// mint-characters — deterministic helpers for the mint-characters skill.
// Zero dependencies on purpose: the skill must work in any directory
// without an npm install. Node 18+ (stdlib only).

import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetProductionProblems, creativeBackground } from './lib/contracts.mjs';
export { creativeBackground } from './lib/contracts.mjs';
import { mediaPlan, checkPlanFlags, printPlan } from './lib/media-plan.mjs';
import { identityCommand } from './lib/identity-cli.mjs';
import { hash } from './lib/identity.mjs';
export { seedSource, reconcile, identityErrors, identityHash } from './lib/identity.mjs';

/* ------------------------------------------------------------------ */
/* chunk                                                               */
/* ------------------------------------------------------------------ */

// 块大小的权衡：块越大，单块阅读越重；块越小，块数越多，跨块归并
// （全管线语义最难的一步）的接缝就越多。现在的模型读 4 万字符毫无压力，
// 所以往大取——接缝少三倍，漏归并的机会也少三倍。
// 上限 24 块，扣掉 23 段重叠净覆盖约 93 万字符。
export const CHUNK_SIZE = 40_000;
export const CHUNK_OVERLAP = 1_200;
export const MAX_CHUNKS = 24;

/**
 * Split source text on paragraph boundaries into overlapping chunks.
 * Overlap keeps a character introduced at a chunk seam visible to both sides.
 */
export function chunkText(text) {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_SIZE) return [clean];

  const chunks = [];
  let cursor = 0;

  while (cursor < clean.length && chunks.length < MAX_CHUNKS) {
    let end = Math.min(cursor + CHUNK_SIZE, clean.length);

    if (end < clean.length) {
      // Prefer a paragraph break, then a sentence end, inside the last 20%.
      const windowStart = cursor + Math.floor(CHUNK_SIZE * 0.8);
      const window = clean.slice(windowStart, end);
      const para = window.lastIndexOf('\n\n');
      const sentence = Math.max(
        window.lastIndexOf('。'),
        window.lastIndexOf('！'),
        window.lastIndexOf('？'),
        window.lastIndexOf('. '),
      );
      const offset = para >= 0 ? para : sentence;
      if (offset >= 0) end = windowStart + offset + 1;
    }

    chunks.push(clean.slice(cursor, end).trim());
    if (end >= clean.length) break;
    cursor = Math.max(end - CHUNK_OVERLAP, cursor + 1);
  }

  return chunks;
}

/* ------------------------------------------------------------------ */
/* slug                                                                */
/* ------------------------------------------------------------------ */

export const characterKey = c => c?.id ?? c?.name;
/** Keep existing unique-name files; disambiguate same-name identities with stable IDs. */
export function characterImageStem(c, characters) {
  const stem=slug(c.name);
  const collision=characters.filter(x=>slug(x.name)===stem).length>1;
  return collision && /^C\d{2,}$/.test(c.id ?? '') ? `${c.id}-${stem}` : stem;
}

/** Filesystem-safe stem for a character name, CJK preserved. */
export function slug(name) {
  const cleaned = String(name)
    .trim()
    .replace(/[\s/\\:*?"<>|]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'character';
}

/* ------------------------------------------------------------------ */
/* i18n                                                                */
/* ------------------------------------------------------------------ */
/*
 * 内容语言。默认 zh；人类可读的设计字段跟随 cast.lang，机器提示词始终英文。
 */

export const DEFAULT_LANG = 'zh';

/* ------------------------------------------------------------------ */
/* 画风                                                                 */
/* ------------------------------------------------------------------ */
/*
 * **本 skill 不内置任何画风。**以前这里写死两档预设（realistic / ghibli），
 * 想拍水墨、拍黏土定格、拍胶片颗粒的年代戏就只能改代码，而且同一档画风的正文
 * 在三个出图 skill 里各存一份，改一处漏两处。
 *
 * 现在画风住在工作目录根的 production.json 顶层，由用户在 mint-setup 那一段填。
 * 本 skill 要的是其中的 `style.character` 那一块：
 *
 *   render    渲染方式那句
 *   surface   皮肤、眼睛、头发、布料怎么处理
 *   lighting  光照
 *   negative  反向提示词
 *   tags      风格标签
 *
 * **换风格是整套换**：五块一起换，不混搭。混搭必然自相矛盾——写实那套刚把
 * photorealistic 从反向词里留出来，动画那套恰恰要禁它；毛孔、皮下散射在写实里
 * 是加分项，在平涂动画里是反效果。矛盾本身由 mint-setup 的 style-coherent 门查，
 * 本 skill 查的是**角色卡有没有把那一块整块用上**。
 */

/** 从生产参数里取角色那一块画风；没有生产参数、或那块没填就返回 null。 */
export function styleBlockOf(production) {
  const b = production?.style?.character;
  if (!b || typeof b !== 'object') return null;
  return String(b.render ?? '').trim() ? b : null;
}

/** 人读的画风名，报告与 CLI 输出里用。 */
export const styleLabelOf = (production, lang = 'zh') => {
  const label = production?.style?.label ?? {};
  return String(label[lang] ?? '').trim() || String(label.zh ?? '').trim() || String(label.en ?? '').trim() || '未填';
};

/**
 * 反向提示词按逗号/分号拆成词条——画风那块的每一条都必须出现在角色卡里，
 * 角色自己额外加的不受影响。整段比对会把「加了一条自己的」误判成漂了。
 */
export const negativeTerms = (text) =>
  String(text ?? '')
    .split(/[,;，；]/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 3);

/* ------------------------------------------------------------------ */
/* 生产参数（production.json）                                          */
/* ------------------------------------------------------------------ */
/*
 * mint-setup 产出的一份 JSON，住在**工作目录根**，锁死整部剧的技术参数。
 * 这里只关心三样：画风（漂了合成没法看）、资产图比例（写死在 image.sheet
 * 的版面指令里）、报告界面语言。
 *
 * 这十几行查找逻辑与 mint-setup 那边是**有意重复**的：本 skill 必须能整个
 * 拷走单独跑，不 import 任何兄弟 skill 的代码。两边读的是同一份 JSON。
 *
 * 找不到时仅跳过上游对账；生成任务必须提供明确的视觉正文与制作参数。
 * 装作查过比没查更坏。
 */

export const PRODUCTION_FILE = 'production.json';
export const PRODUCTION_DEPTH = 5;

export function findProduction(fromDir = '.', depth = PRODUCTION_DEPTH) {
  let dir = resolve(fromDir);
  for (let i = 0; i <= depth; i++) {
    const hit = resolve(dir, PRODUCTION_FILE);
    try { lstatSync(hit); return hit; } catch (error) { if (error.code !== 'ENOENT') throw error; }
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
 * 不问画风、不问选角人数、归并候选自己复核，做过的决定全部写进最后的汇报。
 *
 * 转移的是**审批权**，不是取消检查点：校验照样要过、出图前照样打印要出多少张、
 * 失败照样按失败处理——只是不再等人点头。
 *
 * **只认布尔真值**：JSON 里写成字符串 "false" 在 JS 里是真的，那种写法会让
 * 一整条管线闷头跑完，比没写更坏。mint-setup 的 fields 门查这个类型。
 */

export const autopilotOf = (production) => production?.autopilot === true;

/** 开着才打印——关着就是原来的样子，没有新信息。 */
export const AUTOPILOT_NOTE =
  '自动驾驶：开启——本段流程一口气跑完，不要停下来问用户；替用户做的决定全部写进最后的汇报';

/* ------------------------------------------------------------------ */
/* 产物落点                                                            */
/* ------------------------------------------------------------------ */
/*
 * 工作目录约定：每个 skill 的产物归自己的段目录（outline / characters /
 * art / script / creation），工作目录根只住 production.json。
 *
 * 落点写错了不用重出图，所以这里是提示不是门——但必须说出来：合并报告的
 * `--from` 自动发现是按段目录名找 JSON 的，产物平铺在根目录它就找不到。
 *
 * 只有找得到 production.json 才判断得了——那份文件定义了工作目录根在哪。
 * 单独跑某一段、没跑过 mint-setup 的场合无从判断，那就不提示。
 */

/** 本 skill 的产物该住的段目录名。 */
export const STAGE_DIR = 'characters';

/** 落点不对就返回一句人读的提示；落点对了、或无从判断，返回 null。 */
export function stageDirNote(docPath, productionPath, stage = STAGE_DIR) {
  if (!docPath || !productionPath) return null;
  const want = resolve(dirname(resolve(productionPath)), stage);
  const got = dirname(resolve(docPath));
  if (got === want) return null;
  return `产物落在 ${got}，按工作目录约定该住在 ${want}——每个 skill 的产物归自己的段目录，放错了合并报告的 --from 自动发现找不到它`;
}

/** 设定图提示词里会出现的画幅写法——只认这几种，免得误伤别的数字。 */
export const KNOWN_ASPECTS = ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9', '2.39:1'];

/** 整批错的检查逐条列会刷成一堵墙：前几条够定位，后面只报个数。 */
export const brief = (list, n = 6) =>
  list.length <= n ? list.join('；') : `${list.slice(0, n).join('；')}；……等 ${list.length} 处`;

/**
 * 生产参数带来的两条确定性检查——画风整块用上 + 设定图版面画幅一致。
 * 两条都是「不一致就要整批重出图」那一类，所以是硬违规不是提示。
 *
 * 画风那条以前查的是 cast.json 顶层的 style 字段与生产参数同名，那只是核对了
 * 一个标签。现在画风正文本身就在生产参数里，查得起真东西：**渲染句原样进了
 * 提示词没有、反向词一条不落地带上了没有**。标签对上而正文没跟着换，出来还是
 * 上一档画风——那才是画风漂的真实样子。
 */
export function productionProblems(characters, production) {
  if (production == null) return [];
  const problems = assetProductionProblems(production, 'character');

  const block = styleBlockOf(production);
  if (block) {
    const render = String(block.render).trim();
    const terms = negativeTerms(block.negative);
    const missRender = [];
    const missNeg = [];
    for (const c of characters ?? []) {
      const name = c?.name ?? '(无名)';
      const image = c?.image;
      if (!image || typeof image !== 'object') continue;
      // sheet 与 prompt 分开查：只查 sheet 的话，prompt 里留着上一档画风也照样全绿，
      // 出来就是设定表一个样、单张人像插画另一个样的两张皮
      for (const [field, label] of [['sheet', '设定图提示词'], ['prompt', '出图提示词']]) {
        const v = image[field];
        if (typeof v === 'string' && v.trim() && !v.includes(render)) missRender.push(`${name} 的${label}`);
      }
      const neg = String(image.negativePrompt ?? '').toLowerCase();
      const lost = terms.filter((t) => !neg.includes(t));
      if (lost.length) missNeg.push(`${name} 少了「${brief(lost, 3)}」`);
    }
    if (missRender.length) {
      problems.push(`画风的渲染句没进提示词（生产参数定的是「${styleLabelOf(production)}」）：${brief(missRender)}`);
    }
    if (missNeg.length) {
      problems.push(`画风的反向词没带全（换风格是整套换，角色自己额外加的不受影响）：${brief(missNeg)}`);
    }
  }

  const aspect = production?.image?.asset?.aspectRatio ?? null;
  if (aspect) {
    const bad = [];
    for (const c of characters ?? []) {
      const name = c?.name ?? '(无名)';
      const sheet = String(c?.image?.sheet ?? '');
      const strays = KNOWN_ASPECTS.filter((a) => a !== aspect && sheet.includes(a));
      if (!sheet.includes(aspect)) {
        bad.push(strays.length ? `${name} 写着「${strays.join('、')}」` : `${name} 缺画幅「${aspect}」`);
      } else if (strays.length) {
        bad.push(`${name} 同时写着「${strays.join('、')}」和 ${aspect}`);
      }
    }
    if (bad.length) problems.push(`设定图版面的画幅与生产参数（${aspect}）不一致：${brief(bad)}`);
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* validate                                                            */
/* ------------------------------------------------------------------ */

const IMPORTANCE = ['protagonist', 'major', 'supporting', 'minor'];
/** 中日韩表意文字与假名、谚文——图像/TTS 提示词里出现就说明串语言了。 */
const CJK = /[㐀-鿿぀-ヿ가-힯]/;
/** 假名单独一条：用来把日文和中文区分开。 */
const KANA = /[぀-ヿ]/;

const PERSONA_STRINGS = ['gender', 'ageRange', 'identity', 'appearance', 'temperament', 'motivation', 'arc'];
/** 机器输入，永远英文——图像和 TTS 引擎都吃英文最稳，跟报告语言无关。 */
const MACHINE_FIELDS = { image: ['prompt', 'negativePrompt', 'sheet'], voice: ['prompt'] };
/** 给人读的，跟随输入产物的内容语言，不随界面语言切换。 */
const HUMAN_VOICE_FIELDS = ['timbre', 'pitch', 'pace', 'accent', 'emotion', 'referenceHint'];

const normalise = (s) => String(s).replace(/\s+/g, '');

/*
 * 设定图版式的固定短语（references/sheet.md、sheet-prompt.md）。
 * 人物、生物和未知主体用「左边正面脸部特写 + 右边三格脖子以下」版式，
 * 群演用群像图版式，每张都带「高矮胖瘦各不相同」的英文固定句。
 * 每张设定图最后都带纯净画质段——设定图是后面所有画面的参考，噪点会一路带下去。
 */
export const FACE_CLOSEUP_PHRASE = 'strictly frontal close-up of the face';
export const NECK_DOWN_PHRASE = 'from the neck down';
export const CROWD_FIXED_PHRASE = 'all different heights and builds';
export const PURITY_PARAGRAPH = "Remove all noise, graininess, film grain and digital noise; shadows and dark areas smooth and clean, color transitions natural, gradients fine and smooth. Surfaces of skin, fabric, wood grain, stone, water and leaves clean and clear, edges crisp but not over-sharpened, with no dirt specks, hazy blur, smearing or artifacts. Keep the original details, do not reduce any characters or scene elements, do not change the characters' faces. High definition, clean low-ISO image quality, commercial-grade finished look.";
const squash = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase();

/** 按 entityType 检查 image.sheet 的版式固定短语与纯净画质段，返回缺失说明。 */
export function sheetLayoutProblems(character) {
  const sheet = character?.image?.sheet;
  if (typeof sheet !== 'string' || !sheet.trim()) return [];
  const text = squash(sheet);
  const need = character?.entityType === 'group'
    ? [[CROWD_FIXED_PHRASE, '群像图固定句']]
    : [[FACE_CLOSEUP_PHRASE, '左边严格正面的脸部特写'], [NECK_DOWN_PHRASE, '右边三格脖子以下的正面、侧面、背面']];
  const problems = need.filter(([phrase]) => !text.includes(phrase)).map(([phrase, label]) => `image.sheet 缺版式短语「${phrase}」（${label}）`);
  if (!text.includes(squash(PURITY_PARAGRAPH))) problems.push('image.sheet 缺纯净画质段（固定句，原文照用）');
  return problems;
}

/**
 * @param characters 角色卡数组
 * @param sourceText 原文；null 则跳过逐字引文校验
 * @param lang       内容语言，决定人类可读字段该是什么语言
 */
export function validateCast(characters, sourceText, lang = DEFAULT_LANG) {
  const problems = [];
  const flatSource = sourceText === null ? null : normalise(sourceText);
  const at = (name, msg) => problems.push(`[${name}] ${msg}`);

  if (!Array.isArray(characters) || characters.length === 0) {
    return ['cast 为空或不是数组'];
  }

  // 已填写的 ID 必须合法且全表唯一。
  const ids = new Set();
  for (const c of characters) {
    if (!c || !Object.hasOwn(c, 'id')) continue;
    if (typeof c.id !== 'string' || !/^C\d{2,}$/.test(c.id)) {
      at(c.name ?? '(无名)', 'id 必须是 C 加至少两位数字');
    } else if (ids.has(c.id)) {
      at(c.name ?? '(无名)', `id 重复：${c.id}`);
    } else ids.add(c.id);
  }

  // --- 同剧角色画风必须一致 ---
  // 这是整批图"像不像同一部片"的底线。每个角色的 image.style 给人读的画风
  // 一句话，模型在第二趟出卡时可能按各自服装/年龄自由发挥（藏青/冷灰/大地色
  // 各写一套），导致同框时像四个画师画的。预设只约束大类别（realistic/ghibli），
  // 管不到剧内统一，所以用确定性检查兜底：归一化后多于一种值就报错，并点名
  // 哪些角色用了不同画风。单角色（或未写 image.style 的角色）不触发。
  const styleByChar = [];
  for (const c of characters) {
    const name = c?.name ?? '(无名)';
    const style = c?.image?.style;
    if (typeof style === 'string' && style.trim()) styleByChar.push([name, normalise(style)]);
  }
  if (styleByChar.length > 1) {
    const seen = new Map();
    for (const [name, norm] of styleByChar) {
      if (!seen.has(norm)) seen.set(norm, []);
      seen.get(norm).push(name);
    }
    if (seen.size > 1) {
      const groups = [...seen.values()].map((names) => names.join('、')).join('  vs  ');
      problems.push(`同剧角色画风不一致（image.style 必须统一）：${groups}`);
    }
  }

  // --- 同批角色的提示词不许雷同 ---
  /*
   * profile-pass.md 早就写着「同一批角色之间要能区分开，别把长相和声线做成一个样」，
   * 但没有门。模型第二趟出卡时容易套同一个模板：个体描述写得短，剩下全是真实感样板
   * 与固定的构图光照尾巴——两个年龄性别接近的角色出来就是同一个人（issue #9）。
   *
   * 判定：按词集合算 Jaccard 相似度，超阈值就点名那一对。
   * 阈值取 0.75，是量出来的不是拍的——自带样例四个角色两两最高 39%，
   * 而「只改年龄与衣服颜色」的雷同用例是 98%，中间余量极大。
   *
   * image.sheet 刻意不查：版式要求与纯净画质段是大段固定文本，真实角色之间本来就
   * 高度重合，设门必然误拦——误拦的门比没有门更糟。
   */
  const promptSim = (a, b) => {
    const words = (s) => new Set(String(s ?? '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2));
    const A = words(a); const B = words(b);
    if (A.size < 8 || B.size < 8) return 0;
    const inter = [...A].filter((w) => B.has(w)).length;
    return inter / new Set([...A, ...B]).size;
  };
  const SIM_MAX = 0.75;
  for (const [field, label] of [['prompt', '出图提示词'], ['voice', '音色提示词']]) {
    const get = (c) => (field === 'prompt' ? c?.image?.prompt : c?.voice?.prompt);
    for (let i = 0; i < characters.length; i += 1) {
      for (let j = i + 1; j < characters.length; j += 1) {
        const sim = promptSim(get(characters[i]), get(characters[j]));
        if (sim >= SIM_MAX) {
          const pct = Math.round(sim * 100);
          problems.push(
            `${characters[i]?.name ?? '(无名)'} 与 ${characters[j]?.name ?? '(无名)'} 的${label}雷同 ${pct}%`
            + `（上限 ${Math.round(SIM_MAX * 100)}%）——同一批角色要能区分开，别套同一个模板`,
          );
        }
      }
    }
  }

  for (const c of characters) {
    const name = c?.name ?? '(无名)';

    // --- 结构 ---
    if (typeof c?.name !== 'string' || !c.name.trim()) at(name, '缺少 name');
    if (!Array.isArray(c?.aliases)) at(name, 'aliases 必须是数组');
    if (c?.importance !== undefined && !IMPORTANCE.includes(c?.importance)) {
      at(name, `importance 必须是 ${IMPORTANCE.join('/')}，实际是 ${JSON.stringify(c?.importance)}`);
    }
    if (c?.oneLiner !== undefined && (typeof c?.oneLiner !== 'string' || !c.oneLiner.trim())) at(name, '缺少 oneLiner');

    const persona = c?.persona;
    if (!persona || typeof persona !== 'object') {
      if (persona !== undefined) at(name, '缺少 persona');
    } else {
      for (const f of PERSONA_STRINGS) {
        if (typeof persona[f] !== 'string' || !persona[f].trim()) at(name, `persona.${f} 缺失或为空`);
      }
      if (!Array.isArray(persona.personality)) at(name, 'persona.personality 必须是数组');
      if (!Array.isArray(persona.relationships)) at(name, 'persona.relationships 必须是数组');
      if (!Array.isArray(persona.evidence)) at(name, 'persona.evidence 必须是数组');
    }

    const image = c?.image;
    if (!image || typeof image !== 'object') {
      if (image !== undefined) at(name, '缺少 image');
    } else {
      for (const f of ['style', 'prompt', 'negativePrompt']) {
        if (typeof image[f] !== 'string' || !image[f].trim()) at(name, `image.${f} 缺失或为空`);
      }
      if (typeof image.sheet !== 'string' || !image.sheet.trim()) {
        at(name, 'image.sheet 缺失或为空（角色设定图提示词）');
      }
      for (const msg of sheetLayoutProblems(c)) at(name, msg);
      if (!Array.isArray(image.tags)) at(name, 'image.tags 必须是数组');
    }

    const voice = c?.voice;
    if (!voice || typeof voice !== 'object') {
      if (voice !== undefined) at(name, '缺少 voice');
    } else {
      for (const f of [...HUMAN_VOICE_FIELDS, 'prompt']) {
        if (typeof voice[f] !== 'string' || !voice[f].trim()) at(name, `voice.${f} 缺失或为空`);
      }
      /*
       * 音色提示词里不许出现引号包起来的台词。
       * profile-pass.md 第 7 条写着「描述乐器本身，不是某一句台词的演绎」，
       * 但模型会写出「杀意藏在『规矩就是规矩』这类客套话里」这种句子——
       * 台词一进去，有些 TTS 引擎会把它当成要朗读的内容（生产里踩过）。
       * 只查成对的引号，判定干净：正常的音色描述不需要引任何一句话。
       */
      /*
       * 音色提示词要紧凑，不要散文。
       * voice design 引擎（Qwen3-TTS Voice Design / ElevenLabs / MiniMax）吃的是
       * 参数密度：年龄性别、音色、音区、共鸣、动态、音量、语速、语调、口音、默认情绪。
       * 写成流畅的英文散文会把这些参数稀释掉——生产里实测对比过，紧凑版明显更好。
       *
       * 上限 400 字符是量出来的：自带样例四个角色 218–245，而被实测判为过冗余的
       * 散文版是 490–514，中间余量很大。它拦的是「写成小作文」，不是「写得细」。
       */
      if (typeof voice.prompt === 'string' && voice.prompt.length > 400) {
        at(name, `voice.prompt ${voice.prompt.length} 字符，超过 400——音色提示词要紧凑的参数串，不是散文；参数写全但别铺陈`);
      }
      if (typeof voice.prompt === 'string') {
        const quoted = voice.prompt.match(/[「『"“][^」』"”]{2,}[」』"”]/);
        if (quoted) {
          at(name, `voice.prompt 里出现了引号台词「${quoted[0].slice(0, 24)}」——音色提示词描述的是嗓子本身，不是某一句台词的演绎`);
        }
      }
    }

    // --- 引文必须逐字 ---
    if (flatSource && Array.isArray(persona?.evidence)) {
      for (const quote of persona.evidence) {
        if (typeof quote !== 'string') {
          at(name, 'persona.evidence 里有非字符串');
        } else if (!flatSource.includes(normalise(quote))) {
          at(name, `引文不是原文逐字片段：${quote}`);
        }
      }
    }

    // --- 出图提示词不许出现人名 ---
    if (image) {
      const names = [c?.name, ...(Array.isArray(c?.aliases) ? c.aliases : [])].filter(
        (n) => typeof n === 'string' && n.trim(),
      );
      for (const field of ['prompt', 'promptLocal', 'sheet']) {
        const value = image[field];
        if (typeof value !== 'string') continue;
        for (const n of names) {
          if (value.includes(n)) at(name, `image.${field} 里出现了人名「${n}」`);
        }
      }
    }

    // --- 语言分工 ---
    // 机器字段永远英文；人类字段跟随输入产物的内容语言。
    // 只有 zh / en 能可靠自动判别，其他语言不猜、跳过。
    for (const [group, fields] of Object.entries(MACHINE_FIELDS)) {
      const obj = c?.[group];
      if (!obj) continue;
      for (const f of fields) {
        if (typeof obj[f] === 'string' && CJK.test(obj[f])) {
          at(name, `${group}.${f} 是喂给模型的，必须英文，但含中日韩字符`);
        }
      }
    }
    if (Array.isArray(image?.tags)) {
      for (const t of image.tags) {
        if (typeof t === 'string' && CJK.test(t)) at(name, `image.tags 必须英文，但「${t}」含中日韩字符`);
      }
    }
    // 画风与提示词是否对得上归 productionProblems——画风正文住在 production.json，
    // 这里没有它就查不了。找不到生产参数时那两条明说跳过，不装查过。

    // 只有这三种能可靠自动判别，其他语言不猜、跳过——误报比漏报更烦人。
    if (voice) {
      for (const f of HUMAN_VOICE_FIELDS) {
        const v = voice[f];
        if (typeof v !== 'string' || !v.trim()) continue;
        if (lang === 'en' && CJK.test(v)) at(name, `voice.${f} 应为英文，但含中日韩字符`);
        if (lang === 'zh' && !CJK.test(v)) at(name, `voice.${f} 应为中文，实际是「${v}」`);
        if (lang === 'zh' && KANA.test(v)) at(name, `voice.${f} 应为中文，但含日文假名`);
        if (lang === 'ja' && !KANA.test(v) && !CJK.test(v)) {
          at(name, `voice.${f} 应为日文，实际是「${v}」`);
        }
      }
    }
  }

  return problems;
}

/* ------------------------------------------------------------------ */
/*
 * 出图要的东西全在 cast.json 里：`image.sheet` 是设定图提示词、
 * `image.negativePrompt` 是反向词。这一层只做确定性搬运——拼出每张图该落到哪个
 * 文件、把生产参数原样带上、按需要挂上风格参考。
 *
 * model / resolution / aspect_ratio 三个值原样进 --input_data，不折算像素、提示词里
 * 也不写像素。它们在 production.json 里已经被 mint-setup 的能力表校验过一遍，
 * **这里不再维护第二份枚举表**——同一张表存两份必漂。
 */

/*
 * 画风一致性是这个 skill 的已知短板：同一批角色各自独立出图，风格会漂。
 * 压住的办法是拿第一个角色的成图当风格参考喂给后面几个，代价是第一张定全片
 * 基调。默认不开——只要几张草图的场合不该被这条绑住；`--style-ref` 才开。
 */
export const STYLE_REF_LINE =
  'Match the art style, line weight, shading and colour treatment of the reference image exactly — these characters must belong to the same production.';

/** 产物路径与 render 找图的路径必须是同一个算法，不许两边各写一遍。 */
export const sheetFile = (name, dir = 'images') => `${dir}/${slug(name)}-sheet.png`;
export const cutoutFile = (name, dir = 'images') => `${dir}/${slug(name)}-sheet-cutout.png`;

export function imageJobsFrom(characters, production = null, { imagesDir = 'images', styleRef = null } = {}) {
  const model = production?.image?.model ?? null;
  const inputBase = {
    aspect_ratio: production?.image?.asset?.aspectRatio ?? null,
    resolution: production?.image?.asset?.resolution ?? null,
  };
  const problems = production == null ? ['出图需要显式 production 视觉正文与制作参数，不使用隐式默认值'] : productionProblems(characters, production);
  const jobs = [];
  const list = Array.isArray(characters) ? characters : [];

  for (const c of list) {
    const prompt = c?.image?.sheet;
    if (typeof prompt !== 'string' || !prompt.trim()) {
      problems.push(`「${c?.name ?? '?'}」的 image.sheet 是空的——提示词是模型的活，先填上再出图`);
      continue;
    }
    jobs.push({
      key: list.filter(x=>x.name===c.name).length>1 ? characterKey(c) : c.name,
      kind: 'character',
      name: c.name,
      file: sheetFile(characterImageStem(c,list), imagesDir),
      cutoutFile: cutoutFile(characterImageStem(c,list), imagesDir),
      prompt: String(prompt),
      negativePrompt: String(c?.image?.negativePrompt ?? ''),
      refFrom: null,
    });
  }

  // 风格参考：基准角色先出，其余等它落盘后挂上去当参考图
  if (styleRef && styleRef !== 'off' && jobs.length > 1) {
    const anchor = styleRef === 'auto' ? jobs[0] : jobs.find((j) => j.key === styleRef);
    if (!anchor) problems.push(`--style-ref 指名的「${styleRef}」不在 cast.json 里`);
    else {
      for (const j of jobs) {
        if (j === anchor) continue;
        j.refFrom = anchor.key;
        j.prompt = `${j.prompt} ${STYLE_REF_LINE}`;
      }
    }
  }

  // 重名会让两张图抢同一个文件名，后出的把先出的盖掉，而且 render 只看得见一张
  const seen = new Map();
  for (const j of jobs) {
    if (seen.has(j.file)) problems.push(`「${seen.get(j.file)}」与「${j.key}」算出同一个文件名 ${j.file}——改掉其中一个的名字`);
    else seen.set(j.file, j.key);
  }

  return { model, inputBase, jobs, problems };
}

const USAGE = `mint-characters.mjs — mint-characters skill 的确定性工具

  seed --source path --title title [--budget N] [--outline v5.json] [--out draft.json]
                                   建立 cast v1 来源骨架（不做语义识别）
  reconcile candidate.json [--previous cast.json] [--changes changes.json] [--out cast.json]
  chunk <book.txt> <workdir>       段落感知重叠切块，写 chunk-NN.txt，打印块数（阅读辅助）
  checkup|validate <cast.json> [--previous cast.json] [--outline v5.json]
                                   输出 pass/fail/skipped 检查；阻断失败时 exit 1
  images <cast.json>               导出离线交接计划，交给 ly-image 生成
         [--only <ID列表>]                仅选择指定任务（图片自动补齐参考依赖）
         [--dry-run]                      只预览计划；本命令始终不上传、不提交
         [--out <plan.json>]              另存计划（不覆盖已有文件）
         [--style-ref auto|<角色名>]      基准角色先生成，其余角色引用其成图
         [--images <dir>]                 图片目录名，默认 images
  render <cast.json> [--html|--md] [--lang code]  渲染报告到 stdout（默认 Markdown）
  slug <name>                      角色名转安全文件名
  style [--from <目录>]             打印这部剧的画风（角色那一块）——出卡前先跑它
                                   画风没有内置预设，正文来自工作目录根的 production.json

只接受 cast v1（schemaVersion: 1, kind: mint-characters）、outline v5 与 production v3。
生产参数：--production path，或从 cast 所在目录向上 ${PRODUCTION_DEPTH} 层查找；--no-production 明确跳过。
images 只导出计划，不执行生成。使用 ly-image 完成并核验图片后，放到计划 output 路径再 render。`;

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

/** 取 --flag 的值，没有就返回 fallback。 */
function flag(rest, name, fallback = null) {
  const i = rest.indexOf(name);
  return i >= 0 && rest[i + 1] ? rest[i + 1] : fallback;
}

/*
 * 生产参数不用挂载，自己从产物所在目录向上找——它住在工作目录根。
 * 找得到那两条检查就自动开，没有开关：画风和画幅改了都要整套重出图。
 * --no-production 明确跳过配置对账，用了会明说。
 */
function loadProduction(rest, fromDir) {
  if (rest.includes('--no-production') && rest.includes('--production')) throw new Error('--production 与 --no-production 不能同时提供');
  if (rest.includes('--no-production')) return { doc: null, path: null, off: true };
  const path = flag(rest, '--production') ?? findProduction(fromDir);
  const doc = path ? readJson(path) : null;
  if (path) {
    if (doc === null) throw new Error('production 不能是 null');
    const bad = assetProductionProblems(doc, 'character');
    if (bad.length) throw new Error(bad.join('；'));
  }
  return { doc, path, off: false };
}

/** 找到就报一声，找不到也报一声——静默是最坏的那种。 */
function announceProduction(p, docPath = null) {
  const which = '2 条检查（画风、设定图画幅）与产物落点提示';
  if (p.off) console.error(`⚠️ --no-production：生产参数的 ${which}跳过`);
  else if (p.path) {
    console.error(`↳ 生产参数：${p.path}`);
    const background = creativeBackground(p.doc);
    if (background) console.error(`↳ 创作要求：${JSON.stringify(background)}；内容评审未执行`);
    if (autopilotOf(p.doc)) console.error(`↳ ${AUTOPILOT_NOTE}`);
    const note = stageDirNote(docPath, p.path);
    if (note) console.error(`⚠️ ${note}`);
  } else console.error(`⚠️ 向上 ${PRODUCTION_DEPTH} 层没找到 ${PRODUCTION_FILE}，${which}跳过——跑 /mint-setup 生成一份可以打开它`);
}

/** 正式 cast 的设计块按需存在；别名在设计校验里只取名称。 */
const designCards = (doc) => doc.characters.map(c => ({ ...c, aliases: c.aliases.map(a => a.name) }));

async function main(argv) {
  const [cmd, ...rest] = argv;
  if(rest.includes('--full-workflow')) throw Error('本 CLI 只核验 characters 独立阶段；完整流程必须由项目级状态按五阶段顺序交接，不能冒充全流程通过');

  if (!cmd || cmd === '-h' || cmd === '--help') {
    console.log(USAGE);
    process.exit(cmd ? 0 : 1);
  }

  if (await identityCommand(cmd, rest, {
    designProblems(doc, file, args) {
      const source = doc.provenance.documents.map(d => readFileSync(resolve(dirname(resolve(file)), d.path), 'utf8')).join('\n');
      const cards = designCards(doc);
      const bad = cards.length ? validateCast(cards, source, doc.lang) : [];
      const prod = loadProduction(args, dirname(resolve(file)));
      if (cards.some(c=>c.image)) bad.push(...productionProblems(cards.filter(c=>c.image), prod.doc));
      return bad;
    },
    async images(doc, file, args) {
      checkPlanFlags(args);
      const cards=designCards(doc).filter(c=>c.image);
      if(!cards.length) throw Error('没有选择图片设计的角色；身份登记不要求图片');
      const prod=loadProduction(args,dirname(resolve(file)));
      announceProduction(prod,file);
      const result=imageJobsFrom(cards,prod.doc,{imagesDir:flag(args,'--images','images'),styleRef:flag(args,'--style-ref')});
      if(result.problems.length)throw Error(result.problems.join('；'));
      // Formal plans use stable IDs and paths, not mutable display names.
      for (const job of result.jobs) {
        const c=cards.find(c=>c.id===job.key||c.name===job.key);
        const anchor=cards.find(c=>c.id===job.refFrom||c.name===job.refFrom);
        job.key=c.id;job.file=`${flag(args,'--images','images')}/${c.id}-sheet.png`;job.cutoutFile=null;
        if(anchor)job.refFrom=anchor.id;
      }
      const plan=mediaPlan(result.jobs,{kind:'image',model:result.model,inputBase:result.inputBase,outDir:dirname(resolve(file)),only:flag(args,'--only')});
      for(const job of plan.jobs) {
        job.identityFingerprint=doc.lifecycle.registry.find(r=>r.id===job.id).fingerprint;
        job.designFingerprint=hash(doc.characters.find(c=>c.id===job.id).image);
      }
      plan.note+=' 身份、来源或设计变化后必须重新核验参考图、工作单与内容审核；ID 相同不代表审核有效。';
      printPlan(plan,flag(args,'--out'));
    }
  })) return;

  if (cmd === 'seed') throw new Error('用法：seed --source <原剧本.txt> --title <标题> [--budget N] [--outline outline.json] [--out draft.json]');

  if (cmd === 'chunk') {
    const [book, workdir] = rest;
    if (!book || !workdir) throw new Error('用法：chunk <book.txt> <workdir>');
    const text = readFileSync(resolve(book), 'utf8');
    const chunks = chunkText(text);
    mkdirSync(resolve(workdir), { recursive: true });
    chunks.forEach((c, i) => {
      writeFileSync(join(resolve(workdir), `chunk-${String(i).padStart(2, '0')}.txt`), c, 'utf8');
    });
    const truncated = chunks.length >= MAX_CHUNKS && text.length > CHUNK_SIZE * MAX_CHUNKS;
    console.log(
      JSON.stringify(
        { chunks: chunks.length, chars: text.length, workdir: resolve(workdir), truncated },
        null,
        2,
      ),
    );
    if (truncated) console.error(`⚠️ 文本超过 ${MAX_CHUNKS} 块上限，尾部未扫描`);
    return;
  }

  if (['validate', 'checkup', 'render', 'images'].includes(cmd)) throw new Error(`用法：${cmd} <cast.json>`);

  if (cmd === 'style') {
    const from = flag(rest, '--from', '.');
    const path = flag(rest, '--production') ?? findProduction(from);
    if (!path) {
      throw new Error(
        `从 ${resolve(from)} 向上 ${PRODUCTION_DEPTH} 层没找到 ${PRODUCTION_FILE}——画风住在那里，先跑 /mint-setup 定下来`,
      );
    }
    console.error(`↳ 生产参数：${path}`);
    const doc = readJson(path);
    const block = styleBlockOf(doc);
    if (!block) {
      throw new Error(`${path} 里的 style.character 没填——回 /mint-setup 跑 style-template 拿骨架填满`);
    }
    console.log(
      JSON.stringify(
        {
          label: styleLabelOf(doc),
          note: '整块取用，不要混搭：render、surface 原样进 image.sheet 与 image.prompt；lighting 只进 image.prompt，设定图的光由版式固定句定；negative 一条不落地进 image.negativePrompt（角色自己额外加的不受影响）',
          character: block,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (cmd === 'slug') {
    if (!rest[0]) throw new Error('用法：slug <name>');
    console.log(slug(rest[0]));
    return;
  }

  throw new Error(`未知命令 ${cmd}\n\n${USAGE}`);
}

// 只有直接运行才跑 CLI —— selftest.mjs 需要 import 这些函数。
// 两边都取 realpath：软链安装时 argv[1] 是链接路径，而 import.meta.url
// 已被 Node 解析成真实路径，不归一化就永远不相等。
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
