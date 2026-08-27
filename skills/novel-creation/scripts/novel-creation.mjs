#!/usr/bin/env node
// novel-creation — deterministic helpers for the novel-creation skill (参考图直出视频).
// Zero dependencies on purpose: the skill must work in any directory
// without an npm install. Node 18+ (stdlib only).

import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLI_NAME, DEFAULT_CONCURRENCY, DEFAULT_TIMEOUT_MS,
  findLingying, preflight, runBatch,
} from './lib/lingying.mjs';

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */
/*
 * 与 novel-storyboard 同一个前提：段（segment）＝ 一次视频生成调用，上限是
 * 视频模型单段时长；分镜（cut）＝ 段内的一次剪切，2–5 秒。**少一层**：没有
 * 分镜图，段直接挂载 novel-characters / novel-art 已经生成落盘的设定图，
 * 写一条通用视频提示词，从 seed 到下单不产生任何新的图像生成调用。
 */

export const DEFAULT_PARAMS = {
  maxSegmentSeconds: 15, // 视频模型单段生成上限（秒）
  minCutSeconds: 2,      // 单个分镜下限
  maxCutSeconds: 5,      // 单个分镜上限——3 秒左右是短剧的呼吸
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
 * 这十几行查找逻辑与 novel-storyboard 那边是**有意重复**的：本 skill 必须能
 * 整个拷走单独跑，不 import 任何兄弟 skill 的代码。两边读的是同一份 JSON。
 * 找不到不是错误——照旧用内置默认值，但校验输出里必须明说哪几道门跳过了。
 */

export const PRODUCTION_FILE = 'production.json';
export const PRODUCTION_DEPTH = 5;

export function findProduction(fromDir = '.', depth = PRODUCTION_DEPTH) {
  let dir = resolve(fromDir);
  for (let i = 0; i <= depth; i++) {
    const hit = resolve(dir, PRODUCTION_FILE);
    if (existsSync(hit)) return hit;
    const up = dirname(dir);
    if (up === dir) break; // 到根了
    dir = up;
  }
  return null;
}

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

export const SKIP_PROD = `未找到 ${PRODUCTION_FILE}（向上 ${PRODUCTION_DEPTH} 层），本门跳过——跑 /novel-setup 生成一份可以打开它`;

export const brief = (list, n = 6) =>
  list.length <= n ? list.join('；') : `${list.slice(0, n).join('；')}；……等 ${list.length} 处`;

/** 视频模型：creation.json 自己不写就继承生产参数，都没有就按默认模型算。 */
export const DEFAULT_VIDEO_MODEL = 'MiniMax H3';
export const videoModelOf = (doc, production = null) =>
  doc?.video?.model ?? production?.video?.model ?? DEFAULT_VIDEO_MODEL;

/*
 * 模型族：本 skill 的提示词骨架是模型无关的（身份说明 + [Shot k] 分行），
 * 两族共用**同一套骨架**——与 novel-storyboard 不同，那边 H3 与 seedance 的
 * 骨架互不相容。这里模型族只影响两件事：默认语言，以及 seedance 那一条
 * 官方硬约束（提示词里不许出现精确时刻）。
 */
export function promptFamilyOf(model) {
  return /seedance/i.test(String(model ?? '')) ? 'seedance' : 'h3';
}
export const FAMILY_LABEL = { h3: 'MiniMax H3', seedance: 'seedance 系列' };

/**
 * 时刻标记：seedance 官方明说「模型对精确时间（如 0–3 秒）的支持不稳定，
 * 强行限制时长可能导致生成结果异常」，所以选了它就一个时刻都不许写。
 * 拦 `00:03.000`、`3.00-second`、`3.00 秒处` 三种写法。
 */
export const TIMECODE_RE = /\d{1,2}:\d{2}\.\d{3}|\d+\.\d{2}\s*(?:-second|秒处)/;

/**
 * 提示词语言：没写就继承生产参数，都没写就跟着模型的官方口径走——
 * seedance 的官方指南通篇中文术语与中文案例，其余情况用英文（兼容面最广）。
 */
export const promptLangOf = (doc, production = null, family = 'h3') =>
  doc?.promptLang ?? production?.promptLang ?? (family === 'seedance' ? 'zh' : 'en');

/** 景别枚举：短语必须出现在这一切自己的 [Shot k] 行里。与 novel-storyboard 同一张表。 */
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

const CJK = /[㐀-鿿぀-ヿ가-힯]/;
const r1 = (n) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------------ */
/* 视频模型时长边界                                                     */
/* ------------------------------------------------------------------ */
/*
 * 只含 5 个视频模型的 duration {min,max}，从
 * skills/novel-setup/scripts/novel-setup.mjs 的 VIDEO_MODELS 手抄——
 * novel-setup 改了这张表，这里要跟着改；不 import，理由见上面的查找逻辑注释：
 * 小段确定性逻辑各 skill 各自拷一份，是本仓库对「自包含」的既有解法。
 */
export const VIDEO_DURATION_BOUNDS = {
  'MiniMax H3': { min: 5, max: 15 },
  'seedance2.5': { min: 4, max: 30 },
  'seedance2.0': { min: 4, max: 15 },
  'seedance2.0 fast': { min: 4, max: 15 },
  'seedance2.0 mini': { min: 4, max: 15 },
};

/** 把段秒数折成 lingying 能接受的 duration：向上取整、夹进模型的区间。 */
export function clampDuration(seconds, model) {
  const bounds = VIDEO_DURATION_BOUNDS[model] ?? null;
  const raw = Number(seconds);
  if (!Number.isFinite(raw) || raw <= 0) return { duration: null, note: '段秒数不是正数，折不出 duration' };
  let value = Math.ceil(raw);
  const notes = [];
  if (value !== raw) notes.push(`${raw} 秒向上取整到 ${value} 秒`);
  if (bounds && value < bounds.min) {
    notes.push(`低于 ${model} 下限 ${bounds.min} 秒，按 ${bounds.min} 秒下单（片尾多出的部分剪辑时裁掉）`);
    value = bounds.min;
  }
  if (bounds && value > bounds.max) {
    notes.push(`超过 ${model} 上限 ${bounds.max} 秒，按 ${bounds.max} 秒下单（这一段本该再拆一次）`);
    value = bounds.max;
  }
  return { duration: value, note: notes.join('；') };
}

/* ------------------------------------------------------------------ */
/* 提示词骨架：段级参考图身份说明 + [Shot k] 切片                          */
/* ------------------------------------------------------------------ */
/*
 * 不是 H3 I2VA 的内化版——没有关键帧图可对齐，没有对齐指令、没有切点时刻、
 * 没有 <d> 标签。结构只做两件事：逐张交代参考图身份、按 [Shot k] 分行。
 * 写法规范见 references/creation-prompt.md。
 */

export const CREATION_TOKENS = {
  en: {
    pictureToken: (k) => `Picture ${k} is`,
    shot: (k) => `[Shot ${k}]`,
    fields: ['shots:', 'ambience:'],
  },
  zh: {
    pictureToken: (k) => `图 ${k} 是`,
    shot: (k) => `[镜头 ${k}]`,
    fields: ['镜头描述：', '环境声与配乐：'],
  },
};

/** 把 prompt 的 [Shot k] 正文按镜头切成每个分镜自己的段落——与 novel-storyboard 的
 *  h3CutSlices 同一个机制，字段名换成本 skill 自己的（shots:/ambience:）。 */
export function promptCutSlices(prompt, cutCount, lang = 'en') {
  const tk = CREATION_TOKENS[lang] ?? CREATION_TOKENS.en;
  const p = String(prompt ?? '');
  const bodyStart = p.indexOf(tk.fields[0]);
  const bodyEnd = p.indexOf(tk.fields[1]);
  if (bodyStart < 0) return [];
  const body = p.slice(bodyStart, bodyEnd < 0 ? undefined : bodyEnd);
  const slices = [];
  for (let k = 1; k <= cutCount; k++) {
    const a = body.indexOf(tk.shot(k));
    if (a < 0) {
      slices.push(null);
      continue;
    }
    const b = body.indexOf(tk.shot(k + 1));
    slices.push(body.slice(a, b < 0 ? undefined : b));
  }
  return slices;
}

/** 台词引号之外的部分——语言与人名检查看这个。没有 <d> 标签，只需要剥掉引号台词。 */
export function promptRemainder(prompt) {
  return String(prompt ?? '').replace(/"[^"\n]*"/g, ' ');
}

/* ------------------------------------------------------------------ */
/* 剧本节拍展开                                                          */
/* ------------------------------------------------------------------ */
/*
 * 与 novel-script / novel-storyboard 相同的计秒规则，这里刻意重新实现而不是
 * 跨目录 import——每个 skill 必须自包含、可以单独拷走。
 */

const SCRIPT_DEFAULTS = { charsPerSecond: 4.5, actionSeconds: 2.5 };
const lineChars = (line) => String(line ?? '').replace(/\s+/g, '').length;

export function expandScript(script) {
  const p = { ...SCRIPT_DEFAULTS, ...(script?.params ?? {}) };
  const eps = new Map();
  for (const ep of script?.episodes ?? []) {
    const scenes = (ep?.scenes ?? []).map((sc, i) => ({
      sceneIndex: i + 1,
      sceneId: sc.sceneId,
      lighting: sc.lighting ?? '',
      characters: sc.characters ?? [],
      props: sc.props ?? [],
      beats: (sc.flow ?? []).map((b, j) => {
        const isLine = typeof b?.line === 'string';
        return {
          n: j + 1,
          kind: isLine ? 'line' : 'action',
          seconds: r1(isLine ? lineChars(b.line) / p.charsPerSecond : p.actionSeconds),
          speaker: isLine ? b.speaker : undefined,
          delivery: isLine ? (b.delivery ?? '') : undefined,
          text: isLine ? b.line : b.action,
        };
      }),
    }));
    eps.set(ep.ep, { ep: ep.ep, targetSeconds: ep.targetSeconds, scenes });
  }
  return eps;
}

export const segSeconds = (segment) => r1((segment?.cuts ?? []).reduce((n, c) => n + (c?.seconds ?? 0), 0));

/* ------------------------------------------------------------------ */
/* 镜头配方卡库（可选挂载）——与 novel-storyboard 逐字相同                  */
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
/*
 * 编号与名字分离是现状：cast.json 的角色对象只有 name（无顶层 id），
 * id→name 的映射来自 outline.json 的 characters；场景/道具在 art.json 里
 * 自带 id+name。落盘文件名按名字 slug，不按编号（与 novel-art /
 * novel-characters 的 sheetFile 约定一致）。
 */

export function slug(name) {
  const cleaned = String(name)
    .trim()
    .replace(/[\s/\\:*?"<>|·]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'creation';
}

export function namer(ctx = {}, voLabel = '画外音') {
  const charName = new Map((ctx.outline?.characters ?? []).map((c) => [c.id, c.name]));
  const sceneName = new Map((ctx.art?.scenes ?? []).map((s) => [s.id, s.name]));
  const propName = new Map((ctx.art?.props ?? []).map((p) => [p.id, p.name]));
  return {
    char: (id) => (id === 'VO' ? voLabel : charName.get(id) ?? id),
    scene: (id) => sceneName.get(id) ?? id,
    prop: (id) => propName.get(id) ?? id,
    nameOf: (kind, id) =>
      (kind === 'character' ? charName.get(id) : kind === 'scene' ? sceneName.get(id) : propName.get(id)) ?? null,
  };
}

/** kind 由编号前缀判断：C=角色、S=场景、P=道具。 */
export function kindOfId(id) {
  const c = String(id ?? '').charAt(0);
  return c === 'C' ? 'character' : c === 'P' ? 'prop' : 'scene';
}

/** 名字 → 参考图相对路径（相对 creation/ 目录，与 characters/、art/ 平级）。纯函数，不碰文件系统。 */
export function referenceImagePath(kind, name) {
  return kind === 'character' ? `../characters/images/${slug(name)}-sheet.png` : `../art/images/${slug(name)}-sheet.png`;
}

/** 拼路径 + 查文件是否存在，CLI 层直接可用的便捷封装。 */
export function resolveReferenceImage(kind, name, workDir = '.', { existsImpl = existsSync } = {}) {
  const path = referenceImagePath(kind, name);
  return { path, exists: existsImpl(resolve(workDir, path)) };
}

/* ------------------------------------------------------------------ */
/* 质量门                                                               */
/* ------------------------------------------------------------------ */
/*
 * 17 道门，比 novel-storyboard 少 2 道（19 - 5 + 3）：
 *   去掉 h3-structure / style-phrase / prompt-english / production-style /
 *   frame-aspect——没有关键帧图可对齐，没有分镜图这个产物，画风一致性完全
 *   交给参考图本身，不需要在提示词里重复交代
 *   h3-dialogue → dialogue-verbatim（纯文本子串匹配，不要求 <d> 标签）
 *   h3-lang → prompt-lang（逻辑不变，检查对象从 h3Prompt 换成 prompt）
 *   新增 refimage-coverage（AC3：缺参考图文件时点名缺哪张）、
 *   refimage-labeled（提示词的身份说明句数量与 images 数组长度一致）、
 *   prompt-model-fit（提示词与生产参数挂的视频模型口径相符）
 */

export function gateReport(doc, ctx = {}) {
  const gates = [];
  const add = (id, label, ok, detail = '') => gates.push({ id, label, ok, detail });
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
  const haveNames = !!(ctx.outline && ctx.art);
  const n = namer(ctx);

  const banned = [];
  for (const c of ctx.outline?.characters ?? []) if (c?.name) banned.push(c.name);
  for (const c of ctx.cast?.characters ?? []) {
    if (c?.name) banned.push(c.name);
    for (const a of c?.aliases ?? []) banned.push(a);
  }

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

      if (!(total > 0) || total > params.maxSegmentSeconds) {
        bad.segCap.push(`${sid} 共 ${total} 秒`);
      }
      if (production?.video?.model) {
        const bounds = VIDEO_DURATION_BOUNDS[production.video.model];
        if (bounds && (total < bounds.min || total > bounds.max)) {
          bad.segCapModel.push(`${sid} 共 ${total} 秒，超出 ${production.video.model} 的时长区间 ${bounds.min}–${bounds.max} 秒`);
        }
      }

      const prompt = String(seg?.prompt ?? '');
      const slices = promptCutSlices(prompt, cuts.length, promptLang);
      const tk = CREATION_TOKENS[promptLang] ?? CREATION_TOKENS.en;

      // seedance 的时刻禁令：骨架本来就不写秒数，但从 novel-storyboard 那边
      // 搬提示词、或者手动加「第 3 秒切到……」都会踩上去
      if (family === 'seedance') {
        const stamp = prompt.match(TIMECODE_RE);
        if (stamp) {
          bad.modelFit.push(`${sid} 出现时刻「${stamp[0]}」——${videoModel} 对精确时间的支持不稳定，秒数只留在 creation.json 里，不进提示词`);
        }
      }

      const rest = promptRemainder(prompt);
      if (promptLang === 'en') {
        if (CJK.test(rest)) bad.lang.push(`${sid} 设定英文（promptLang=en）却在台词引号之外混入了中文`);
        for (const name of banned) {
          if (rest.includes(name)) bad.names.push(`${sid} 的 prompt 在台词之外出现角色名「${name}」`);
        }
      } else if (!CJK.test(rest)) {
        bad.lang.push(`${sid} 设定中文提示词（promptLang=${promptLang}），正文却写成了英文`);
      }

      // refimage-labeled：images 数组长度必须与提示词开头的身份说明句数量一致
      const images = Array.isArray(seg?.images) ? seg.images : [];
      const missingLabel = [];
      for (let k = 1; k <= images.length; k++) {
        if (!prompt.includes(tk.pictureToken(k))) missingLabel.push(tk.pictureToken(k));
      }
      const hasExtra = images.length >= 0 && prompt.includes(tk.pictureToken(images.length + 1));
      if (missingLabel.length || hasExtra) {
        bad.refLabeled.push(
          `${sid} 挂了 ${images.length} 张参考图，但提示词的身份说明句` +
          `${missingLabel.length ? `缺「${missingLabel.join('、')}」` : ''}${missingLabel.length && hasExtra ? '，且' : ''}` +
          `${hasExtra ? `多出「${tk.pictureToken(images.length + 1)}」` : ''}`,
        );
      }

      const scene = sEp ? sEp.scenes[seg?.sceneIndex - 1] : null;
      if (sEp && !scene) bad.refs.push(`${sid} 的 sceneIndex ${seg?.sceneIndex} 在剧本第 ${ep.ep} 集里不存在`);
      if (scene) {
        if (seg.sceneIndex < prevSceneIndex) bad.coverage.push(`${sid} 场次顺序倒退`);
        prevSceneIndex = Math.max(prevSceneIndex, seg.sceneIndex);
      }

      // refimage-coverage：段内出现的每个人物/场景/道具都要能解出一张存在的设定图
      if (haveNames) {
        const need = new Map(); // id -> kind
        if (scene) need.set(scene.sceneId, 'scene');
        for (const cut of cuts) {
          for (const c of cut?.characters ?? []) need.set(c, 'character');
          for (const pr of cut?.props ?? []) need.set(pr, 'prop');
        }
        for (const [id, kind] of need) {
          const name = n.nameOf(kind, id);
          if (!name) {
            bad.refCoverage.push(`${sid} 引用的 ${id} 在 outline/art 里找不到名字，解不出设定图路径`);
            continue;
          }
          const path = referenceImagePath(kind, name);
          if (!imageExists(path)) bad.refCoverage.push(`${sid} 的 ${id}（${name}）没有设定图：期望 ${path}`);
        }
      }

      cuts.forEach((cut, ci) => {
        const cid = `${sid}#${ci + 1}`;
        const slice = slices[ci];

        if (!(cut?.seconds >= params.minCutSeconds) || cut.seconds > params.maxCutSeconds) {
          bad.cutLen.push(`${cid} ${cut?.seconds ?? '?'} 秒`);
        }
        if ((cut?.characters ?? []).length > params.maxOnScreen && !String(cut?.note ?? seg?.note ?? '').trim()) {
          bad.crowd.push(`${cid} 同框 ${cut.characters.length} 人且没有拆解说明`);
        }
        if (!SHOT_SIZES[cut?.size]) {
          bad.size.push(`${cid} 景别「${cut?.size}」不在枚举里`);
        } else {
          const sizeTerm = promptLang === 'en' ? SHOT_SIZES[cut.size].phrase : SHOT_SIZES[cut.size].zh;
          if (slice == null) {
            bad.size.push(`${cid} 在 prompt 里找不到对应的 ${tk.shot(ci + 1)} 行`);
          } else if (!(promptLang === 'en' ? slice.toLowerCase() : slice).includes(promptLang === 'en' ? sizeTerm.toLowerCase() : sizeTerm)) {
            bad.size.push(`${cid} 的 ${tk.shot(ci + 1)} 行缺景别短语「${sizeTerm}」`);
          }
        }
        if (!CAMERA_MOVES[cut?.camera]) {
          bad.camera.push(`${cid} 运镜「${cut?.camera}」不在词表里`);
        } else {
          const term = promptLang === 'en' ? String(cut.camera).toLowerCase() : CAMERA_MOVES[cut.camera];
          if (slice == null) {
            bad.camera.push(`${cid} 在 prompt 里找不到对应的 ${tk.shot(ci + 1)} 行`);
          } else if (!(promptLang === 'en' ? slice.toLowerCase() : slice).includes(term)) {
            bad.camera.push(`${cid} 的 ${tk.shot(ci + 1)} 行缺运镜词「${term}」`);
          }
        }

        if (recipes && typeof cut?.recipe === 'string' && cut.recipe) {
          recipeRefs += 1;
          const card = recipes.get(cut.recipe);
          if (!card) {
            bad.recipe.push(`${cid} 引用的配方「${cut.recipe}」不在配方库里`);
          } else {
            const lower = (slice ?? '').toLowerCase();
            for (const ph of card.must_phrases ?? []) {
              if (!lower.includes(String(ph).toLowerCase())) {
                bad.recipe.push(`${cid} 的 ${tk.shot(ci + 1)} 行缺配方「${card.name}」的必备短语「${ph}」`);
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
              dlg += b.seconds;
              if (!prompt.includes(b.text)) bad.dlgVerbatim.push(`${sid} 的 prompt 缺台词「${b.text.slice(0, 12)}…」的原文`);
            }
            if (dlg > cut.seconds) bad.fit.push(`${cid} 台词 ${r1(dlg)} 秒装不进 ${cut.seconds} 秒`);
          }
        }
      });

      // 多格配方靠连续同 id 的分镜表达——与 novel-storyboard 一致
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
        if (total < lo) bad.duration.push(`${label} 欠 ${r1(lo - total)} 秒（${r1(total)}s / 目标 ${sEp.targetSeconds}s）`);
        if (total > hi) bad.duration.push(`${label} 超 ${r1(total - hi)} 秒（${r1(total)}s / 目标 ${sEp.targetSeconds}s）`);
      }
    }
  }

  const SKIP_SCRIPT = '未提供 script.json，本门跳过（视为通过）';
  const SKIP_NAMES = '未提供 outline/cast，本门跳过（视为通过）';
  const SKIP_REFS = '未提供 --outline/--art，本门跳过（视为通过）';
  const SKIP_SHOTS = '未挂载配方卡库（--shots <卡片目录>），本门跳过（视为通过）';
  const NO_RECIPE = '本批分镜没有引用配方';

  add('coverage', '剧本节拍被恰好一次、按顺序、连续认领（分镜级）', bad.coverage.length === 0, script ? bad.coverage.join('；') : SKIP_SCRIPT);
  add(
    'segment-cap',
    `每段 0 < 总秒数 ≤ ${params.maxSegmentSeconds}（一次生成的上限，挂了生产参数还要落进对应视频模型的时长区间）`,
    eps.length > 0 && bad.segCap.length === 0 && bad.segCapModel.length === 0,
    [...bad.segCap, ...bad.segCapModel].join('；'),
  );
  add('cut-length', `每个分镜 ${params.minCutSeconds}–${params.maxCutSeconds} 秒——短剧的注意力节奏`, eps.length > 0 && bad.cutLen.length === 0, bad.cutLen.join('；'));
  add('dialogue-fit', '认领节拍的台词装得进分镜秒数', bad.fit.length === 0, script ? bad.fit.join('；') : SKIP_SCRIPT);
  add('ep-duration', `每集总时长在剧本目标 ±${Math.round(params.tolerance * 100)}% 内`, bad.duration.length === 0, script ? bad.duration.join('；') : SKIP_SCRIPT);
  add('crowd', `单个分镜同框 ≤ ${params.maxOnScreen} 人，超了必须带拆解说明`, bad.crowd.length === 0, bad.crowd.join('；'));
  add('segment-id', '段号 E01-01 格式、按顺序连号', bad.id.length === 0, bad.id.join('；'));
  add('size-phrase', '景别短语写进这一切自己的 [Shot k] 行', bad.size.length === 0, bad.size.join('；'));
  add('camera-phrase', '运镜用通用词表，且出现在自己的 [Shot k] 行里', bad.camera.length === 0, bad.camera.join('；'));
  add('dialogue-verbatim', '认领节拍的台词逐字出现在 prompt 里', bad.dlgVerbatim.length === 0, script ? bad.dlgVerbatim.join('；') : SKIP_SCRIPT);
  add('prompt-lang', `提示词语言与设定一致（promptLang=${promptLang}）`, bad.lang.length === 0, bad.lang.join('；'));
  add('prompt-no-names', '提示词正文不含角色名（台词引号内放行）', bad.names.length === 0, banned.length ? bad.names.join('；') : SKIP_NAMES);
  add('refs', '场次／人物／道具对账剧本', bad.refs.length === 0, script ? bad.refs.join('；') : SKIP_SCRIPT);
  add(
    'shot-recipe',
    '引用的配方存在、必备短语进了对应 [Shot k] 行、多格配方连排够格数',
    bad.recipe.length === 0,
    recipes ? (bad.recipe.length ? bad.recipe.join('；') : recipeRefs ? '' : NO_RECIPE) : SKIP_SHOTS,
  );
  add('refimage-coverage', '段内出现的每个人物/场景/道具都能解出一张存在的设定图文件', bad.refCoverage.length === 0, haveNames ? brief(bad.refCoverage) : SKIP_REFS);
  add('refimage-labeled', '提示词开头的参考图身份说明句数量与 images 数组长度一致', bad.refLabeled.length === 0, bad.refLabeled.join('；'));
  // 骨架跨模型通用，但填法有一条按模型分流的硬约束——写法见两份规范
  add(
    'prompt-model-fit',
    family === 'seedance'
      ? `提示词与挂的视频模型口径相符（${videoModel}：全程不出现精确时刻）`
      : `提示词与挂的视频模型口径相符（${videoModel}）`,
    bad.modelFit.length === 0,
    family === 'seedance' ? brief(bad.modelFit) : `模型是 ${videoModel}，通用骨架没有附加约束`,
  );

  return gates;
}

/* ------------------------------------------------------------------ */
/* validate                                                            */
/* ------------------------------------------------------------------ */

export function validateCreation(doc, ctx = {}) {
  const problems = [];
  const p = (msg) => problems.push(msg);
  if (!doc || typeof doc !== 'object') return ['creation.json 不是对象'];

  if (!String(doc.source ?? '').trim()) p('缺少 source（剧名）');
  const eps = doc.episodes;
  if (!Array.isArray(eps) || eps.length === 0) {
    p('episodes 为空');
    return problems;
  }
  const seen = new Set();
  for (const ep of eps) {
    const label = `第 ${ep?.ep ?? '?'} 集`;
    if (!Number.isInteger(ep?.ep) || ep.ep < 1) p(`${label}的 ep 必须是正整数`);
    if (seen.has(ep?.ep)) p(`集号 ${ep.ep} 重复`);
    seen.add(ep?.ep);
    if (!Array.isArray(ep?.segments) || ep.segments.length === 0) {
      p(`${label}没有段`);
      continue;
    }
    for (const seg of ep.segments) {
      const sid = seg?.id ?? '?';
      if (typeof seg?.id !== 'string') p(`${label}有段缺 id`);
      if (!Number.isInteger(seg?.sceneIndex) || seg.sceneIndex < 1) p(`${sid} 缺 sceneIndex（剧本里第几场）`);
      if (typeof seg?.prompt !== 'string') p(`${sid} 缺 prompt（视频提示词，写法见 references/creation-prompt.md）`);
      if (!Array.isArray(seg?.images)) {
        p(`${sid} 缺 images（参考图挂载清单，没有就给空数组）`);
      } else {
        seg.images.forEach((img, i) => {
          if (!['character', 'scene', 'prop'].includes(img?.kind)) p(`${sid} 的第 ${i + 1} 张参考图 kind 必须是 character/scene/prop`);
          if (typeof img?.ref !== 'string' || !img.ref) p(`${sid} 的第 ${i + 1} 张参考图缺 ref（资产编号）`);
        });
      }
      if (!Array.isArray(seg?.cuts) || seg.cuts.length === 0) {
        p(`${sid} 没有分镜`);
        continue;
      }
      seg.cuts.forEach((cut, ci) => {
        const cid = `${sid}#${ci + 1}`;
        if (!Array.isArray(cut?.beats) || cut.beats.length !== 2) p(`${cid} 的 beats 必须是 [起, 止] 两个数`);
        if (typeof cut?.seconds !== 'number') p(`${cid} 缺 seconds`);
        if (!Array.isArray(cut?.characters)) p(`${cid} 缺 characters（空镜给空数组）`);
      });
    }
  }

  for (const g of gateReport(doc, ctx)) {
    if (!g.ok) p(`质量门未过：${g.label}${g.detail ? `（${g.detail}）` : ''}`);
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* seed — 从 script.json 确定性预填                                      */
/* ------------------------------------------------------------------ */

export function seedFromScript(script, epRange = null) {
  const expanded = expandScript(script);
  const inRange = (n2) => !epRange || (n2 >= epRange[0] && n2 <= epRange[1]);
  const episodes = [];
  for (const [epNo, sEp] of expanded) {
    if (!inRange(epNo)) continue;
    episodes.push({
      ep: epNo,
      segments: [],
      seedScenes: sEp.scenes.map((sc) => ({
        sceneIndex: sc.sceneIndex,
        sceneId: sc.sceneId,
        lighting: sc.lighting,
        characters: sc.characters,
        props: sc.props,
        beats: sc.beats.map((b) => ({
          n: b.n,
          kind: b.kind,
          seconds: b.seconds,
          ...(b.speaker ? { speaker: b.speaker } : {}),
          text: b.text,
        })),
      })),
    });
  }
  return { source: script?.source ?? '', episodes };
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
        for (const b of scene.beats.slice((from ?? 1) - 1, to ?? 0)) {
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
      totalSeconds: r1(total),
      avgCutSeconds: cutCount ? r1(total / cutCount) : 0,
      withLines,
    });
  }

  const totals = {
    segments: episodes.reduce((n2, e) => n2 + e.segments, 0),
    cuts: episodes.reduce((n2, e) => n2 + e.cuts, 0),
    seconds: r1(episodes.reduce((n2, e) => n2 + e.totalSeconds, 0)),
    targetSeconds: episodes.reduce((n2, e) => n2 + e.target, 0),
    withLines: episodes.reduce((n2, e) => n2 + e.withLines, 0),
    avgCutSeconds: 0,
  };
  totals.avgCutSeconds = totals.cuts ? r1(totals.seconds / totals.cuts) : 0;

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
export function exportPack(doc, script, { resolveImage = () => ({ name: '', path: '', exists: false }), dir = '.', production = null } = {}) {
  const prefix = dir === '.' ? '' : `${dir}/`;
  const files = [];
  const manifest = [];
  let missingTotal = 0;
  const video = production?.video ?? null;
  const videoLine = video
    ? `生成参数：${video.model || '（未填模型）'} · aspect_ratio ${video.aspectRatio || '（未填）'} · resolution ${video.resolution || '（未填）'}\n\n`
    : '';
  for (const ep of doc?.episodes ?? []) {
    for (const seg of ep?.segments ?? []) {
      const images = (seg.images ?? []).map((img) => {
        const r = resolveImage(img.kind, img.ref);
        if (!r.exists) missingTotal += 1;
        return { kind: img.kind, ref: img.ref, name: r.name, path: r.path, role: img.role ?? '', exists: r.exists };
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
  'cut-length': 'Every cut {0}–{1}s — the short-drama attention rhythm',
  'dialogue-fit': 'Dialogue of the claimed beats fits within the cut duration',
  'ep-duration': 'Episode total within ±{0}% of the script\'s target',
  'crowd': 'At most {0} characters on screen per cut; more requires a breakdown note',
  'segment-id': 'Segment IDs in E01-01 format, sequential',
  'size-phrase': 'Shot-size phrase present in this cut\'s own [Shot k] line',
  'camera-phrase': 'Camera move from the shared vocabulary, inside its own [Shot k] line',
  'dialogue-verbatim': 'Claimed dialogue appears verbatim inside prompt',
  'prompt-lang': 'Prompt language matches the promptLang setting',
  'prompt-model-fit': 'Prompt matches what the mounted video model expects',
  'prompt-no-names': 'Prompt body carries no character names (quoted dialogue is exempt)',
  'refs': 'Scenes / characters / props audited against the script',
  'shot-recipe': 'Referenced recipes exist, their must-phrases are in the matching [Shot k] line, multi-cut recipes run long enough',
  'refimage-coverage': 'Every character/scene/prop appearing in a segment resolves to an existing reference sheet',
  'refimage-labeled': 'The identity lines in the prompt match the length of the images array',
};
const GATE_SKIPS_EN = {
  '未提供 script.json，本门跳过（视为通过）': 'script.json not provided — gate skipped (treated as passing)',
  '未提供 outline/cast，本门跳过（视为通过）': 'outline/cast not provided — gate skipped (treated as passing)',
  '未提供 --outline/--art，本门跳过（视为通过）': '--outline/--art not provided — gate skipped (treated as passing)',
  '未挂载配方卡库（--shots <卡片目录>），本门跳过（视为通过）': 'no recipe card library mounted (--shots <cards dir>) — gate skipped (treated as passing)',
  '本批分镜没有引用配方': 'no cut in this batch references a recipe',
  [SKIP_PROD]: `no ${PRODUCTION_FILE} found (up to ${PRODUCTION_DEPTH} levels up) — gate skipped; run /novel-setup to open it`,
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
    gatesPass: '全部通过',
    gatesFail: (n2) => `${n2} 项未过`,
    gatePill: (okN, total) => `质量门 ${okN} / ${total}`,
    kpi: {
      segments: '生成段', segmentsSub: (cap) => `一段一次调用，上限 ${cap} 秒`,
      cuts: '分镜', cutsSub: (avg) => `平均 ${avg} 秒一切`,
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
    dialogueNote: '自动汇总 · TTS 音频对到哪一段的第几切',
    epHead: (nSeg, nCut, total, target) => `${nSeg} 段 ${nCut} 切 · 共 ${total} 秒 / 目标 ${target} 秒`,
    segHead: (total, n2) => `${total} 秒 · ${n2} 个分镜`,
    secBadge: (secs, n2) => `${secs}s · ${n2} 切`,
    rhythmVal: (nSeg, nCut, secs) => `${nSeg} 段 ${nCut} 切 · ${secs}s`,
    beatsLabel: (s, from, to) => `第 ${s} 场 ${from === to ? `第 ${from} 拍` : `第 ${from}–${to} 拍`}`,
    refMissing: '未找到设定图',
    promptLabel: '视频提示词',
    showSegs: '▾ 展开全部段',
    hideSegs: '▴ 收起',
    copy: '复制', copied: '已复制', copyFailed: '复制失败',
    dialogueCols: ['段 · 切', '说话人', '台词', '台词秒数'],
    cutCols: ['切', '秒', '景别', '运镜', '配方', '画面', '人物'],
    refCols: ['段', 'Picture', '身份', '路径'],
    kindLabel: (k) => (k === 'character' ? '角色' : k === 'scene' ? '场景' : '道具'),
    batchLabel: (num) => `批次 ${num}`,
    voiceOver: '画外音',
    listSep: '、',
    sizeName: (size) => SHOT_SIZES[size]?.zh ?? size,
    cameraLabel: (camera) => `${camera}（${CAMERA_MOVES[camera] ?? '?'}）`,
    recipeNone: '—',
    recipeName: (card, id) => card?.name ?? id,
    recipeDrift: (sizes, cameras) =>
      `配方建议${[sizes.length ? `景别 ${sizes.join(' / ')}` : '', cameras.length ? `运镜 ${cameras.join(' / ')}` : ''].filter(Boolean).join(' · ')}——只提示不设门`,
    speakerLine: (name, text) => `${name}：「${text}」`,
    withLighting: (name, lighting) => (lighting ? `${name}（${lighting}）` : name),
    fmtMin: (sec) => `${Math.floor(sec / 60)} 分 ${Math.round(sec % 60)} 秒`,
    unitSeg: '段',
    unitCut: '切',
    colophon: '段直接挂载 novel-characters / novel-art 已经生成的设定图，写一条通用视频提示词——从 seed 到下单不产生任何新的图像生成调用。台词、景别、运镜纪律全部由脚本确定性对账。',
  },
  en: {
    langCode: 'en',
    kicker: 'Creation',
    docTitle: (s, a, b) => `${s} · Creation (${a === b ? `Episode ${a}` : `Episodes ${a}–${b}`})`,
    epRange: (a, b) => (a === b ? `Episode ${a}` : `Episodes ${a}–${b}`),
    exportJson: 'Export JSON',
    gatesPass: 'All passed',
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
    colophon: 'Segments mount existing novel-characters / novel-art reference sheets directly and carry one general-purpose video prompt — no new image generation calls from seed through ordering. Dialogue, shot-size and camera discipline are all audited deterministically by the script.',
  },
};

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
  return scene.beats.slice((from ?? 1) - 1, to ?? 0);
}

/* ------------------------------------------------------------------ */
/* render — markdown                                                   */
/* ------------------------------------------------------------------ */

const mdRow = (cells) => `| ${cells.map((c) => String(c ?? '').replace(/\|/g, '\\|')).join(' | ')} |`;
const mdHead = (cols) => [mdRow(cols), mdRow(cols.map(() => '---'))].join('\n');

export function renderMarkdown(doc, ctx = {}) {
  const t = tOf(langOf(doc, ctx));
  const n = namer(ctx, t.voiceOver);
  const expanded = expandScript(ctx.script);
  const stats = computeStats(doc, ctx.script);
  const eps = doc.episodes;
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
      out.push(mdHead(t.cutCols));
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
        ]));
      });
      out.push('', `**${t.promptLabel}**`, '', '```text', seg.prompt ?? '', '```', '');
    }
  }

  out.push(`## ${t.secDialogue}`, '', mdHead(t.dialogueCols));
  for (const d of stats.dialogue) out.push(mdRow([`${d.segment}#${d.cut}`, n.char(d.speaker), d.line, d.seconds]));
  out.push('');
  return out.join('\n');
}

/* ------------------------------------------------------------------ */
/* render — html                                                       */
/* ------------------------------------------------------------------ */
/*
 * 与仓库其余五份报告同一套视觉语言。设计约定见 references/report-style.md。
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
    const path = referenceImagePath(img.kind, name);
    return { picture: i + 1, kind: img.kind, ref: img.ref, name, role: img.role ?? '', path, exists: imageExists ? imageExists(path) : false };
  });
}

export function renderHtml(doc, ctx = {}) {
  const lang = langOf(doc, ctx);
  const t = tOf(lang);
  const n = namer(ctx, t.voiceOver);
  const expanded = expandScript(ctx.script);
  const stats = computeStats(doc, ctx.script);
  const gates = gateReport(doc, ctx);
  const failed = gates.filter((g) => !g.ok);
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
      (g) => `<li class="${g.ok ? 'ok' : 'bad'}"><span class="m">${g.ok ? '✓' : '✗'}</span><span>${esc(gateText(g, t.langCode).label)}${
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
@media(max-width:980px){.kpis{grid-template-columns:repeat(2,1fr)}}
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
    <span class="gatepill ${failed.length ? 'fail' : 'pass'}">${failed.length ? '✗' : '✓'} ${esc(t.gatePill(gates.length - failed.length, gates.length))}</span>
    <button class="expo" data-name="${esc(slug(doc.source))}-creation.json">${esc(t.exportJson)}</button>
  </span>
</header>

<div class="kpis">
  <div class="kpi accent"><div class="l">${esc(t.kpi.segments)}</div><div class="v">${stats.totals.segments} <small>${esc(t.unitSeg)}</small></div><div class="d">${esc(t.kpi.segmentsSub(params.maxSegmentSeconds))}</div></div>
  <div class="kpi"><div class="l">${esc(t.kpi.cuts)}</div><div class="v">${stats.totals.cuts} <small>${esc(t.unitCut)}</small></div><div class="d">${esc(t.kpi.cutsSub(stats.totals.avgCutSeconds))}</div></div>
  <div class="kpi"><div class="l">${esc(t.kpi.time)}</div><div class="v">${esc(fmtMin(stats.totals.seconds))}</div><div class="d">${esc(t.kpi.timeSub(fmtMin(stats.totals.targetSeconds)))}</div></div>
  <div class="kpi"><div class="l">${esc(t.kpi.lines)}</div><div class="v">${stats.totals.withLines} <small>${esc(t.unitSeg)}</small></div><div class="d">${esc(t.kpi.linesSub)}</div></div>
</div>
${failed.length ? `<div class="galert"><b>✗ ${esc(t.gatesFail(failed.length))}</b>${failed.map((g) => `<span>${esc(gateText(g, t.langCode).label)}${g.detail ? ` — ${esc(gateText(g, t.langCode).detail)}` : ''}</span>`).join('')}</div>` : ''}

<section class="top-sec" id="sec-rhythm">
  <div class="sec-h"><span class="no">01</span><h2>${esc(t.secRhythm)}</h2><span class="note">${esc(t.rhythmNote)}</span></div>
  <div class="rhythm">
    <div class="legend">${rhythmLegend}</div>
${rhythmRows}
  </div>
</section>

<section class="top-sec" id="sec-segments">
  <div class="sec-h"><span class="no">02</span><h2>${esc(t.secSegments)}</h2><span class="note">${esc(t.segmentsNote)}</span></div>
${epBlocks}
</section>

<section class="top-sec" id="sec-refs">
  <div class="sec-h"><span class="no">03</span><h2>${esc(t.secRefs)}</h2><span class="note">${esc(t.refsNote)}</span></div>
  <table><thead><tr>${t.refCols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
  <tbody>
${refRows}
  </tbody></table>
</section>

<section class="top-sec" id="sec-dialogue">
  <div class="sec-h"><span class="no">04</span><h2>${esc(t.secDialogue)}</h2><span class="note">${esc(t.dialogueNote)}</span></div>
  <table><thead><tr>${t.dialogueCols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
  <tbody>
${dlgRows}
  </tbody></table>
</section>

<section class="top-sec" id="sec-gates">
  <div class="sec-h"><span class="no">05</span><h2>${esc(t.secGates)}</h2></div>
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
  if (zone.scrollHeight <= 780) {
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
  if (e.target.closest('#lightbox')) lb.classList.remove('on');
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

const USAGE = `novel-creation.mjs — novel-creation skill 的确定性工具（参考图直出视频）

  seed <script.json> [--eps 1-3]               从剧本预填节拍工作底稿（打印到 stdout）
  validate <creation.json> --script <script.json>
           [--outline] [--cast] [--art]         校验；有违规逐条打印并 exit 1
           [--shots <卡片目录>]                  outline/art 查参考图与提示词人名；挂载配方卡库开 shot-recipe 门
  checkup <creation.json> --script <script.json>
          [--outline] [--art] [--shots ...]     只打印质量门 ✓/✗，有未过项 exit 1
  render <creation.json> --script <script.json>
         [--html|--md] [--outline] [--art]      渲染报告到 stdout（默认 --md）
         [--lang zh|en]                         报告界面语言（默认 zh；未指定时读取 JSON 顶层 lang 字段）
  export <creation.json> --script <script.json> [--out .]
                                                导出投产包：每段一个文件夹 <段号>/prompt.md，根部 manifest.json
  videos <manifest.json> [--only E01-01,E01-02] 下单生视频：提交/轮询/落盘/续传全在代码里
         [--dry-run] [--force]
         [--timeout <秒>] [--concurrency <n>]
  slug <name>                                   剧名转安全文件名

validate/render/export/videos 都按参考图的相对路径（../characters/images、../art/images）解析，
运行前先 cd 进 <工作目录>/creation/（与 characters/、art/ 平级）。本 skill 不落 .gates.jsonl、不加 stats 子命令。`;

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function flag(rest, name, fallback = null) {
  const i = rest.indexOf(name);
  return i >= 0 && rest[i + 1] ? rest[i + 1] : fallback;
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
    return path ? readJson(path) : null;
  };
  const shots = flag(rest, '--shots');

  /*
   * 生产参数不用挂载，自己从产物所在目录向上找——它住在工作目录根。
   * 找到了只影响 segment-cap 门的时长区间比对，没有开关：改了要重下单的
   * 东西不该留后门。--no-production 是给老项目临时绕过用的，用了会明说。
   */
  let production = null;
  let productionPath = null;
  if (!rest.includes('--no-production')) {
    productionPath = flag(rest, '--production') ?? findProduction(fromDir);
    if (productionPath) production = readJson(productionPath);
  }

  return {
    script: get('--script'), outline: get('--outline'), cast: get('--cast'), art: get('--art'),
    recipes: shots ? loadShots(shots) : null,
    production, productionPath,
  };
}

/** 找到就报一声，找不到也报一声——静默是最坏的那种。 */
function announceProduction(ctx, rest, docPath = null) {
  const which = '视频时长区间比对与产物落点提示';
  if (rest.includes('--no-production')) {
    console.error(`⚠️ --no-production：生产参数的 ${which}跳过`);
    return;
  }
  if (ctx.productionPath) {
    console.error(`↳ 生产参数：${ctx.productionPath}`);
    const note = stageDirNote(docPath, ctx.productionPath);
    if (note) console.error(`⚠️ ${note}`);
  } else console.error(`⚠️ 向上 ${PRODUCTION_DEPTH} 层没找到 ${PRODUCTION_FILE}，${which}跳过——跑 /novel-setup 生成一份可以打开它`);
}

/** manifest.json 里的 prompt 字段只是一个路径，真正的提示词取 prompt.md 分隔线以下的原文。 */
function promptBodyOf(md) {
  const idx = String(md ?? '').indexOf('\n---\n');
  return (idx < 0 ? String(md ?? '') : String(md).slice(idx + 5)).trim();
}

async function main(argv) {
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
    console.log(JSON.stringify(seedFromScript(readJson(path), epRange), null, 2));
    return;
  }

  if (cmd === 'validate' || cmd === 'checkup') {
    const [path] = rest;
    if (!path) throw new Error(`用法：${cmd} <creation.json> --script <script.json> [--outline] [--cast] [--art]`);
    const doc = readJson(path);
    const ctx = loadCtx(rest, resolve(path, '..'));
    if (!ctx.script) throw new Error('段离开剧本没有意义——必须给 --script <script.json>');
    if (!ctx.outline || !ctx.art) console.error('⚠️ 没给 --outline / --art，跳过参考图挂载核对（refimage-coverage）与提示词人名检查');
    ctx.imageExists = (rel) => existsSync(resolve(rel));
    announceProduction(ctx, rest, path);

    // 不落 .gates.jsonl、不加 stats 子命令——门失败累积目前只在 novel-storyboard 上试验（CLAUDE.md）

    if (cmd === 'checkup') {
      const gates = gateReport(doc, ctx);
      for (const g of gates) console.log(`${g.ok ? '✓' : '✗'} ${g.label}${g.detail ? ` — ${g.detail}` : ''}`);
      const failedN = gates.filter((g) => !g.ok).length;
      console.log(failedN ? `\n✗ ${failedN} 项未过` : '\n✓ 全部通过');
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
    console.log(`✓ ${st.episodes.length} 集 / ${st.totals.segments} 段 / ${st.totals.cuts} 个分镜全部通过校验（共 ${st.totals.seconds}s / 目标 ${st.totals.targetSeconds}s）`);
    return;
  }

  if (cmd === 'render') {
    const [path] = rest;
    if (!path) throw new Error('用法：render <creation.json> --script <script.json> [--html|--md] [--lang zh|en] [--outline] [--art]');
    const doc = readJson(path);
    const ctx = loadCtx(rest, resolve(path, '..'));
    if (!ctx.script) throw new Error('段离开剧本没有意义——必须给 --script <script.json>');
    const langFlag = flag(rest, '--lang');
    if (langFlag) ctx.lang = langFlag;
    ctx.imageExists = (rel) => existsSync(resolve(rel));
    process.stdout.write((rest.includes('--html') ? renderHtml(doc, ctx) : renderMarkdown(doc, ctx)) + '\n');
    return;
  }

  if (cmd === 'export') {
    const [path] = rest;
    if (!path) throw new Error('用法：export <creation.json> --script <script.json> [--out .]');
    const doc = readJson(path);
    const ctx = loadCtx(rest, resolve(path, '..'));
    if (!ctx.script) throw new Error('段离开剧本没有意义——必须给 --script <script.json>');
    if (!ctx.outline || !ctx.art) console.error('⚠️ 没给 --outline / --art，参考图路径解不出来，投产包的 images 会是空的');
    announceProduction(ctx, rest, path);
    const n = namer(ctx);
    const resolveImage = (kind, ref) => {
      const name = n.nameOf(kind, ref);
      if (!name) return { name: '', path: '', exists: false };
      return { name, ...resolveReferenceImage(kind, name, '.') };
    };
    const dir = flag(rest, '--out', '.');
    const pack = exportPack(doc, ctx.script, { resolveImage, dir, production: ctx.production });
    for (const f of pack.files) {
      mkdirSync(resolve(f.path, '..'), { recursive: true });
      writeFileSync(resolve(f.path), f.content, 'utf8');
    }
    const segN = pack.manifest.length;
    console.log(`✓ ${segN} 段投产包 → ${resolve(dir)}/（每段一个文件夹：prompt.md；根部 manifest.json）`);
    if (pack.missingTotal) console.log(`⚠️ 缺 ${pack.missingTotal} 张参考图，已在 manifest 的 missing 里标注——下单前先补齐`);
    return;
  }

  if (cmd === 'videos') {
    const [path] = rest;
    if (!path) throw new Error('用法：videos <manifest.json> [--only E01-01,E01-02] [--dry-run] [--force] [--timeout 秒] [--concurrency n]');
    const manifest = readJson(path);
    const outDir = resolve(path, '..');
    const video = manifest.video ?? null;
    if (!video?.model) throw new Error('manifest.json 顶层缺 video.model——先跑 export（工作目录要挂 production.json，没有就跑 /novel-setup 生成一份）');

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

    const inputBase = {};
    if (video.aspectRatio) inputBase.aspect_ratio = video.aspectRatio;
    if (video.resolution) inputBase.resolution = video.resolution;

    const durationNotes = [];
    const jobs = segs.map((s) => {
      const mdPath = resolve(outDir, s.prompt);
      const md = existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : '';
      const { duration, note } = clampDuration(s.seconds, video.model);
      if (note) durationNotes.push(`${s.segment}：${note}`);
      return {
        key: s.segment, name: s.segment, file: `${s.segment}/video.mp4`,
        prompt: promptBodyOf(md), duration,
        images: (s.images ?? []).map((i) => ({ path: i.path })),
      };
    });
    if (durationNotes.length) console.error(`⚠️ duration 折算：\n${durationNotes.map((x) => '  ' + x).join('\n')}`);

    const dryRun = rest.includes('--dry-run');
    const timeoutMs = Number(flag(rest, '--timeout', DEFAULT_TIMEOUT_MS / 1000)) * 1000;
    const concurrency = Number(flag(rest, '--concurrency', DEFAULT_CONCURRENCY));

    let bin = null;
    if (!dryRun) {
      bin = findLingying();
      const pre = preflight({ bin });
      if (!pre.ok) {
        // 没装 CLI 是「整步跳过」不是失败——投产包照常交付，其余产出不受影响
        console.error(`⚠️ 下单跳过：\n${pre.problems.map((x) => '  ' + x).join('\n')}`);
        console.log(JSON.stringify({ skipped: true, reason: pre.problems }, null, 2));
        return;
      }
      console.error(`↳ ${CLI_NAME}：${bin}`);
    }

    const { results, summary } = await runBatch(jobs, {
      bin, model: video.model, inputBase, outDir, ledgerDir: outDir,
      timeoutMs, concurrency,
      force: rest.includes('--force'),
      dryRun,
      log: (m) => console.error(m),
    });

    for (const r of results) {
      if (r.status === 'ok' || r.status === 'skipped' || r.status === 'dry-run') continue;
      console.error(`✗ ${r.name} ${r.status} — ${r.detail ?? ''}`);
    }
    // stdout 只有这一行 JSON：agent 直接拿去汇报，不用自己数
    console.log(JSON.stringify({ model: video.model, inputBase, summary, results }, null, 2));

    const bad = summary.failed + summary.timeout;
    if (bad) {
      console.error(`\n✗ ${bad} 段没出成（成功 ${summary.ok}，跳过 ${summary.skipped}）——重跑本命令会跳过已有产物、接着轮询超时的任务`);
      process.exit(1);
    }
    if (!dryRun) console.error(`\n✓ 下单完成：新出 ${summary.ok} 段，跳过 ${summary.skipped} 段`);
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
