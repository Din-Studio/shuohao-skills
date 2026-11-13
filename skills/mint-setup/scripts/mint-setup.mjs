#!/usr/bin/env node
// mint-setup — deterministic helpers for the mint-setup skill (生产参数).
// Zero dependencies on purpose: 和其余 skill 一样，任何目录里 node 直接跑。
// Node 18+ (stdlib only).

import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { documentProblems, check, blocking, mark } from './lib/contracts.mjs';
export { documentProblems } from './lib/contracts.mjs';

/* ------------------------------------------------------------------ */
/* 文件名与查找                                                         */
/* ------------------------------------------------------------------ */
/*
 * production.json 住在**工作目录根**，五个 skill 各自的子目录都在它下面。
 * 所以下游是从自己的输出目录**向上**找它，不是平级找。
 *
 * 向上找几层：五个 skill 的输出目录是 <work>/art/ 这样的一层，
 * 但用户常常再往下套一层（<work>/creation/E01-01/ 里跑 export），
 * 所以给到 5 层，够用又不至于爬到用户主目录。
 */

export const PRODUCTION_FILE = 'production.json';
export const LOOKUP_DEPTH = 5;

export function findProduction(fromDir = '.', depth = LOOKUP_DEPTH) {
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
/* 生图模型能力表                                                       */
/* ------------------------------------------------------------------ */
/*
 * 能力表来自历史采集。外部 ly-image / ly-video 的 models --model 提供当前
 * input_schema 原样打出来，所以这两张表**有本机可查的确凿依据**，
 * 不是凭记忆编的——每条都注明了取数命令，过期了重新跑一次就能对账。
 *
 * 关键差别（区别于按像素下单）：网关 的 resolution 就是**档位本身**
 * （1K / 2K / 4K），aspect_ratio 是**枚举**，两者都是结构化字段。
 * 所以本 skill 不再需要把档位折算成像素，也不再往提示词里写 `Render at …`。
 *
 * 表里没有的模型**不是错误**：枚举门明说跳过，其余门照常。
 */

export const IMAGE_MODELS = {
  nanobanana2: {
    label: 'nanobanana2 · 灵影网关',
    source: '历史 CLI 采集，模型 UUID： f0621c54-167a-4319-a067-30c36eff2c3d',
    modelId: 'f0621c54-167a-4319-a067-30c36eff2c3d',
    resolutions: ['1K', '2K', '4K'],
    aspectRatios: ['1:1', '2:3', '3:2', '9:16', '16:9'],
    refImages: true,
    negativePrompt: true,
    price: '0.23 / 0.3 / 0.4 元每张（1K / 2K / 4K）',
  },
  'image-2': {
    label: 'image-2 · 灵影网关',
    source: '历史 CLI 采集，模型 UUID： fac7474d-8dd2-4830-b792-02715820cfd6',
    modelId: 'fac7474d-8dd2-4830-b792-02715820cfd6',
    resolutions: ['1K', '2K', '4K'],
    aspectRatios: ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'],
    // 8.29MP 像素上限的后果：4K 只剩下两个比例可选
    restrict: { '4K': ['16:9', '9:16'] },
    refImages: true,
    negativePrompt: true,
    price: '0.17~3.5 元每张（quality 档 × 分辨率档）',
  },
};

/* ------------------------------------------------------------------ */
/* 生视频模型能力表                                                     */
/* ------------------------------------------------------------------ */
/*
 * 这张表以前是**有意留空**的——各家 resolution 口径不同、版本之间还会变，
 * 没有本机文档可依据时凭记忆编一张比不查更坏。改走 网关 之后依据有了：
 * 历史模型发现与详情采集，逐条记录；实际调用前必须重新查询。
 *
 * 各家的 resolution 口径不一样（`768p` / `2K` 与 `480p` / `720p` / `1080p` 并存），
 * 所以这张表逐个模型抄枚举，不做任何归一。
 *
 * 有的模型还收自己特有的配置参数，且它会反过来决定 resolution 与 aspect_ratio 的枚举。
 * 那类参数**不属于跨 skill 的生产参数**，不进 production.json——这张表按
 * `input_schema` 里那个参数的 **default 值**抄，也就是不传它时真正生效的那套枚举。
 */

export const VIDEO_MODELS = {
  'MiniMax H3': {
    label: 'MiniMax H3 · 灵影网关',
    source: '历史 CLI 采集，模型 UUID： 7809cb1a-4f09-40de-a9e9-dd3841016138',
    modelId: '7809cb1a-4f09-40de-a9e9-dd3841016138',
    resolutions: ['768p', '2K'],
    aspectRatios: ['16:9', '21:9', '4:3', '1:1', '3:4', '9:16', 'adaptive'],
    duration: { min: 5, max: 15, integer: true },
    price: '0.1 元每秒',
  },
  'seedance2.5': {
    label: 'seedance2.5 · 灵影网关',
    source: '历史 CLI 采集，模型 UUID： 927e312f-795c-4558-9696-3226e51ecc08',
    modelId: '927e312f-795c-4558-9696-3226e51ecc08',
    resolutions: ['480p', '720p'],
    aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
    // input_schema 只写了「必填整数」没给范围；4~30 由仓库作者确认后补录
    duration: { min: 4, max: 30, integer: true },
    price: '0.75~2.04 元每秒',
  },
  'seedance2.0': {
    label: 'seedance2.0 · 灵影网关',
    source: '历史 CLI 采集，模型 UUID： 67a84596-7d39-499e-8118-bd47075f753a',
    modelId: '67a84596-7d39-499e-8118-bd47075f753a',
    resolutions: ['480p', '720p', '1080p'],
    aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
    duration: { min: 4, max: 15, integer: true },
    price: '0.5~3.13 元每秒',
  },
  'seedance2.0 fast': {
    label: 'seedance2.0 fast · 灵影网关',
    source: '历史 CLI 采集，模型 UUID： 19dd94a3-a727-4753-8cc1-e67be689cb4f',
    modelId: '19dd94a3-a727-4753-8cc1-e67be689cb4f',
    resolutions: ['480p', '720p'],
    aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
    duration: { min: 4, max: 15, integer: true },
    price: '0.4~1.05 元每秒',
  },
  'seedance2.0 mini': {
    label: 'seedance2.0 mini · 灵影网关',
    source: '历史 CLI 采集，模型 UUID： 3d04b2de-9329-4bfa-aa99-c2d978bc8746',
    modelId: '3d04b2de-9329-4bfa-aa99-c2d978bc8746',
    resolutions: ['480p', '720p'],
    aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
    duration: { min: 4, max: 15, integer: true },
    price: '0.25~0.68 元每秒',
  },
};

export const SUPPORTED_LANGS = ['zh', 'en'];

/* ------------------------------------------------------------------ */
/* 画风                                                                 */
/* ------------------------------------------------------------------ */
/*
 * 画风**没有内置类型**。以前这里是一个两档枚举（realistic / ghibli），
 * 正文曾写死在下游的代码里，换风格就得修改代码。所以整档交给用户：production.json 顶层的
 * `style` 就是画风本身，正文在本段填，下游读它。
 *
 * 一部剧一套，两块正文加一条风格概括：
 *
 *   phrase     英文画风短语，视频提示词按模型指南使用
 *   character  角色设定图那套：render / surface / lighting / negative / tags
 *   scene      场景与道具设定图那套：render / surface / negative / tags
 *
 * character 与 scene 分开，是因为同一个画风落到人身上和落到环境上不是一句话：
 * 写实的人要毛孔、皮下散射、根根分明的碎发；写实的环境要斑驳、水渍、包浆。
 * 把人那套带进环境，出来就是四不像。
 *
 * 换风格是**整套换**，不是只换一句：render / surface / lighting / negative /
 * tags 是一整块，混搭必然自相矛盾。style-coherent 门专查这一条。
 */

/** 画风各块的必填字段。`tags` 是数组，其余是字符串。 */
export const STYLE_BLOCKS = {
  character: ['render', 'surface', 'lighting', 'negative', 'tags'],
  scene: ['render', 'surface', 'negative', 'tags'],
};

/** 空骨架：init 生成的就是这个，用户逐块填满。 */
export const emptyStyle = () => ({
  label: { zh: '', en: '' },
  phrase: '',
  character: { render: '', surface: '', lighting: '', negative: '', tags: [] },
  scene: { render: '', surface: '', negative: '', tags: [] },
});

/** 人读的画风名；没填就回落到另一种语言，再回落到「未填」。 */
export const styleLabelOf = (style, lang = 'zh') => {
  const label = style?.label ?? {};
  const pick = String(label[lang] ?? '').trim() || String(label.zh ?? '').trim() || String(label.en ?? '').trim();
  return pick || (lang === 'en' ? '(unset)' : '未填');
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 反向提示词按逗号/分号拆成词条。
 * 拆完才查得动「同一个短语既要又不要」——整段比对只会永远为真。
 */
export const negativeTerms = (text) =>
  String(text ?? '')
    .split(/[,;，；]/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 3);

/**
 * 某个词条是否作为**完整短语**出现在文本里。
 * 带词边界：negative 里的 `text` 不该被 `texture` 命中——那种误报比没有门更烦人。
 */
export const mentionsTerm = (haystack, term) =>
  new RegExp(`(^|[^a-z0-9])${escapeRe(term)}([^a-z0-9]|$)`, 'i').test(String(haystack ?? ''));

/* ------------------------------------------------------------------ */
/* 自动驾驶                                                            */
/* ------------------------------------------------------------------ */
/*
 * autopilot 为 true 时，下游五个 skill 各自把自己那一段**一口气跑完**：
 * 不再停下来提问、不等用户拍板、不把选择题抛回去，该做的决定自己做，
 * 做过的决定全部写进最后的汇报。
 *
 * 转移的是**审批权**，不是取消检查点：质量门照样是门，花钱前照样先算账，
 * 失败的止损照样止损——只是不再等人点头。
 *
 * **只认布尔真值**。JSON 里写成字符串 "false"，在 JS 里是真值，
 * 那种写法比没写更坏；所以这里严格比，缺字段、写错类型都算「关」。
 * 写错了也不会静默：fields 门查类型。
 */

export const autopilotOf = (doc) => doc?.autopilot === true;

/** 出图与生视频统一走这个 CLI；skill 只认名字，装在哪由使用方决定。 */
export const GENERATION_SKILLS = { image: 'ly-image', video: 'ly-video' };

/* ------------------------------------------------------------------ */
/* 比例与档位                                                           */
/* ------------------------------------------------------------------ */

/** "16:9" → { w: 16, h: 9, ratio: 1.777… }；不合法（含 adaptive）返回 null。 */
export function parseAspect(text) {
  const m = /^(\d+):(\d+)$/.exec(String(text ?? '').trim());
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h) return null;
  return { w, h, ratio: w / h };
}

/** 两个比例是否算同一个（0.5% 容差，够宽松也不至于把 4:3 当 16:9）。 */
export const sameRatio = (a, b) => Math.abs(a - b) / b <= 0.005;

/**
 * 大小写无关地把用户写的档位对到模型枚举里的那一个：
 * '720P' → '720p'，'2k' → '2K'。对不上返回 null。
 */
export function matchTier(text, list = []) {
  const want = String(text ?? '').trim().toLowerCase();
  if (!want) return null;
  return list.find((k) => k.toLowerCase() === want) ?? null;
}

/**
 * 取某个生视频模型的枚举。
 * 模型不在表里返回 null——调用方据此说明「跳过检查」，不要装作查过。
 */
export function videoCaps(model) {
  const m = VIDEO_MODELS[model];
  if (!m) return null;
  return { resolutions: m.resolutions, aspectRatios: m.aspectRatios, duration: m.duration ?? null };
}

/** 生图模型在这个档位下允许的比例；模型不在表里返回 null。 */
export function imageCaps(model, resolution = '') {
  const m = IMAGE_MODELS[model];
  if (!m) return null;
  const tier = matchTier(resolution, m.resolutions);
  const only = tier && m.restrict?.[tier];
  return {
    resolutions: m.resolutions,
    aspectRatios: only ?? m.aspectRatios,
    restricted: !!only,
    tier,
  };
}

/**
 * 把段秒数折成 网关 能接受的 duration。
 *
 * H3 只收 5~15 的**整数秒**，而分镜的段秒数是按节拍算出来的，可能是 3 秒、
 * 也可能是 12.5 秒。折算规则写死在这里，免得每个下单脚本各折各的：
 * 向上取整到整数秒，再夹进模型的区间。夹动过就在 note 里说清楚。
 */
export function clampDuration(seconds, model) {
  const caps = VIDEO_MODELS[model];
  const d = caps?.duration ?? null;
  const raw = Number(seconds);
  if (!Number.isFinite(raw) || raw <= 0) return { duration: null, note: '段秒数不是正数，折不出 duration' };
  let value = d?.integer === false ? raw : Math.ceil(raw);
  const notes = [];
  if (value !== raw) notes.push(`${raw} 秒向上取整到 ${value} 秒`);
  if (d && value < d.min) {
    notes.push(`低于模型下限 ${d.min} 秒，按 ${d.min} 秒下单（片尾多出的部分剪辑时裁掉）`);
    value = d.min;
  }
  if (d && value > d.max) {
    notes.push(`超过模型上限 ${d.max} 秒，按 ${d.max} 秒下单（这一段本该再拆一次）`);
    value = d.max;
  }
  return { duration: value, note: notes.join('；') };
}

/* ------------------------------------------------------------------ */
/* init — 生成骨架                                                     */
/* ------------------------------------------------------------------ */
/*
 * 成片画幅**没有默认值**，必须显式传 --aspect。
 * 理由：竖屏和横屏是两条不同的片子，猜错了后果是整批视频重出。
 * 这是唯一一个宁可让用户多打一个参数也不能默认的参数。
 */

export function initProduction({
  aspect,
  source = '',
  autopilot = false,
  assetResolution = '2K',
  assetAspect = '16:9',
  imageModel = 'nanobanana2',
  videoModel = '',
  videoResolution = '',
  style = null,
  creativeBrief = undefined,
  selection = undefined,
  lang = 'zh',
  promptLang = 'en',
} = {}) {
  const a = parseAspect(aspect);
  if (!a) {
    throw new Error(
      `--aspect 必须显式给出且形如 9:16 或 16:9（成片画幅没有默认值——猜错了整批视频重出）`,
    );
  }

  if (selection !== undefined) throw new Error('selection 不属于 production 契约；使用 creativeBrief');
  const problems = documentProblems({ schemaVersion: 3, ...(creativeBrief === undefined ? {} : { creativeBrief }) });
  if (problems.length) throw new Error(problems.join('；'));
  return {
    source,
    schemaVersion: 3,
    ...(creativeBrief === undefined ? {} : { creativeBrief }),
    autopilot: autopilot === true,
    // 画风没有内置类型也没有默认值：给一份空骨架，用户填。
    // 没填 style-blocks 门会拦，不会静默用回某一档写死的画风。
    style: style ?? emptyStyle(),
    lang,
    promptLang,
    image: {
      model: imageModel,
      asset: { resolution: assetResolution, aspectRatio: assetAspect },
    },
    video: {
      model: videoModel,
      aspectRatio: aspect,
      resolution: videoResolution,
    },
  };
}

/* ------------------------------------------------------------------ */
/* 质量门                                                              */
/* ------------------------------------------------------------------ */
/*
 * 八道门，全是代码。分两类：
 *   会导致重出图的（比例对不上、档位模型不收、画风缺块或自相矛盾）——拦；
 *   只影响阅读的（报告界面语言）——不设门，下游继承就好。
 *
 * 改走 网关 之后多出来的那道是 model-caps：档位与比例都是模型的**枚举值**，
 * 能在这里查死。以前档位要折成像素、折算规则在使用方的 CLI 里，
 * 所以只能查非空；现在枚举就在 input_schema 里，查得起。
 *
 * 画风改成用户填之后多出来的是 style-blocks 与 style-coherent：以前画风是
 * 两档写死的预设，正文由代码保证；现在正文是用户写的，缺块与自相矛盾都得查。
 */

export function gateReport(doc) {
  const gates = [];
  const add = (id, label, passed, detail = '') => gates.push(check(id, label, passed ? 'pass' : 'fail', detail));
  const documentBad = documentProblems(doc);
  add('document-contract', 'v3 数据契约与创作要求', !documentBad.length, documentBad.join('；'));

  const img = doc?.image ?? {};
  const asset = img.asset ?? {};
  const video = doc?.video ?? {};

  /* 1 — 字段齐全且枚举合法 */
  {
    const bad = [];
    if (typeof img.model !== 'string' || !img.model.trim()) bad.push('image.model 为空');
    if (typeof asset.resolution !== 'string' || !asset.resolution.trim()) bad.push('image.asset.resolution 为空');
    if (typeof asset.aspectRatio !== 'string' || !asset.aspectRatio.trim()) bad.push('image.asset.aspectRatio 为空');
    // style 的内容归下面两道门查，这里只确认它是个对象——画风已经不是枚举了
    if (!doc?.style || typeof doc.style !== 'object' || Array.isArray(doc.style)) {
      bad.push('style 要是一个对象（画风没有内置类型，正文在这一段填；跑 style-template 拿骨架）');
    }
    if (!SUPPORTED_LANGS.includes(doc?.lang)) bad.push(`lang 要是 ${SUPPORTED_LANGS.join(' / ')}`);
    if (!SUPPORTED_LANGS.includes(doc?.promptLang)) bad.push(`promptLang 要是 ${SUPPORTED_LANGS.join(' / ')}`);
    // autopilot 可以整个不写（老项目就没有），写了就必须是 JSON 布尔值：
    // 字符串 "false" 在 JS 里是真值，那种写法会让下游闷头跑完，比没写更坏
    if (doc?.autopilot !== undefined && typeof doc.autopilot !== 'boolean') {
      bad.push('autopilot 要是 true / false（JSON 布尔值；写成字符串 "false" 会被当成开着）');
    }
    add('fields', '字段齐全、枚举合法', bad.length === 0, bad.join('；'));
  }

  /* 2 — 资产图与视频比例的写法 */
  {
    const bad = [];
    for (const [label, v] of [
      ['image.asset.aspectRatio', asset.aspectRatio],
      ['video.aspectRatio', video.aspectRatio],
    ]) {
      if (!parseAspect(v)) bad.push(`${label}=${v ?? '(空)'} 不是 W:H 写法`);
    }
    add(
      'aspect-format',
      '比例都是 W:H 写法',
      bad.length === 0,
      bad.length ? `${bad.join('；')}——网关 的 adaptive 在本管线里不能用：成片需要固定画幅，不能让模型逐段选择` : '',
    );
  }

  /* 3 — 资产图不能是竖构图 */
  {
    const a = parseAspect(asset.aspectRatio);
    const ok = !a || a.ratio >= 1;
    add(
      'asset-landscape',
      '资产图是横构图或方形',
      ok,
      ok ? '' : `资产图 ${asset.aspectRatio} 是竖构图——角色设定图的「左脸右身」版面、场景设定图的四宫格加平面图、道具设定图的三格版面都靠横向铺开，竖过来会被压扁。成片竖屏不影响设定图横构图，这两件事不是一回事`,
    );
  }

  /* 4 — 视频 resolution 已填（资产图非空归 fields，枚举归模型门） */
  {
    const bad = [];
    if (typeof video.resolution !== 'string' || !video.resolution.trim()) bad.push('video.resolution 为空');
    add(
      'resolution-filled',
      '资产图与视频分辨率档位都已填',
      bad.length === 0,
      bad.length
        ? bad.join('；')
        : `资产图 ${asset.resolution ?? '(空)'} · 视频 ${video.resolution}`,
    );
  }

  /* 5 — 视频模型与参数合法 */
  {
    const bad = [];
    const model = String(video.model ?? '').trim();
    if (typeof video.model !== 'string' || !model) bad.push('video.model 必须是非空字符串');
    const entry = Object.hasOwn(VIDEO_MODELS, model) ? VIDEO_MODELS[model] : null;
    let note = '';
    if (model && !entry) {
      note = `${model} 不在能力表里，只查了非空（能力表来自 历史模型采集，加一条就自动开始查）`;
    } else if (entry) {
      const caps = videoCaps(model);
      if (caps && !matchTier(video.resolution, caps.resolutions)) {
        bad.push(`${model} 的 resolution 要是 ${caps.resolutions.join(' / ')}（现在是 ${video.resolution || '(空)'}）`);
      }
      if (caps && !caps.aspectRatios.includes(String(video.aspectRatio ?? '').trim())) {
        bad.push(`${model} 的 aspect_ratio 要是 ${caps.aspectRatios.join(' / ')}（现在是 ${video.aspectRatio || '(空)'}）`);
      }
      if (caps?.duration) {
        note = `段时长下单时要折成 ${caps.duration.min}~${caps.duration.max} 的整数秒`;
      }
    }
    add('video-model', '视频模型与参数合法', bad.length === 0, bad.length ? bad.join('；') : note);
  }

  /* 6 — 档位与比例被生图模型收（网关 的 input_schema 是枚举，查得死） */
  {
    const model = String(img.model ?? '').trim();
    const entry = Object.hasOwn(IMAGE_MODELS, model) ? IMAGE_MODELS[model] : null;
    const bad = [];
    let note = '';
    if (model && !entry) {
      note = `${model} 不在能力表里，档位与比例都跳过检查（能力表来自 历史模型采集，加一条就自动开始查）`;
    } else if (entry) {
      for (const [label, slot] of [['资产图', asset]]) {
        const res = String(slot?.resolution ?? '').trim();
        const asp = String(slot?.aspectRatio ?? '').trim();
        if (!res || !asp) continue; // 空的归第 1 道门
        const tier = matchTier(res, entry.resolutions);
        if (!tier) {
          bad.push(`${label}档位 ${res} 不是 ${model} 的档位（${entry.resolutions.join(' / ')}）`);
          continue;
        }
        const caps = imageCaps(model, tier);
        if (!caps.aspectRatios.includes(asp)) {
          bad.push(
            caps.restricted
              ? `${label} ${tier} 下 ${model} 只收 ${caps.aspectRatios.join(' / ')}（现在是 ${asp}）`
              : `${label}比例 ${asp} 不是 ${model} 的比例（${caps.aspectRatios.join(' / ')}）`,
          );
        }
      }
      if (!bad.length && !note) {
        const hit = [asset]
          .map((slot) => matchTier(slot?.resolution, entry.resolutions))
          .filter((t) => t && entry.restrict?.[t])
          .map((t) => `${t} 下只收 ${entry.restrict[t].join(' / ')}`);
        note = `${model}：档位 ${entry.resolutions.join(' / ')} · 比例 ${entry.aspectRatios.join(' / ')}`;
        if (hit.length) note += `（${[...new Set(hit)].join('；')}）`;
      }
    }
    add('model-caps', '档位与比例都被生图模型收', bad.length === 0, bad.length ? bad.join('；') : note);
  }

  /* 7 — 画风各块填全（画风已经不是枚举，正文是用户写的，缺块要在这里拦） */
  {
    const style = doc?.style;
    const bad = [];
    if (!style || typeof style !== 'object' || Array.isArray(style)) {
      bad.push('style 不是对象');
    } else {
      if (typeof style.label?.zh !== 'string' || !style.label.zh.trim()) bad.push('style.label.zh 为空（画风的中文名，报告里显示它）');
      const phrase = String(style.phrase ?? '').trim();
      if (typeof style.phrase !== 'string' || !phrase) {
        bad.push('style.phrase 为空（视频提示词指南使用的英文画风短语）');
      } else if (/[^\x20-\x7e]/.test(phrase)) {
        bad.push(`style.phrase「${phrase}」含非 ASCII 字符——请填写英文画风短语`);
      }
      for (const [block, fields] of Object.entries(STYLE_BLOCKS)) {
        const b = style[block];
        if (!b || typeof b !== 'object' || Array.isArray(b)) {
          bad.push(`style.${block} 不是对象`);
          continue;
        }
        for (const f of fields) {
          if (f === 'tags') {
            if (!Array.isArray(b.tags) || b.tags.length === 0 || b.tags.some(t => typeof t !== 'string' || !t.trim())) {
              bad.push(`style.${block}.tags 要是非空数组`);
            }
          } else if (typeof b[f] !== 'string' || !b[f].trim()) {
            bad.push(`style.${block}.${f} 为空`);
          }
        }
      }
    }
    add(
      'style-blocks',
      `画风各块填全（${styleLabelOf(doc?.style)}）`,
      bad.length === 0,
      bad.length ? `${bad.join('；')}——跑 \`style-template\` 拿骨架，换风格是整套换` : '',
    );
  }

  /* 8 — 画风不自相矛盾（正向要的词不许同时出现在反向提示词里） */
  {
    /*
     * 以前这条是写死的知识：「realistic 绝不能禁 photorealistic，ghibli 必须禁」。
     * 画风交给用户之后那句话没法再写死了，但它背后的规则可以——
     * **同一个短语既写进 render/surface/tags 又写进 negative，就是自相矛盾**。
     * 这条不认识任何一档具体画风，却正好复现了原来那两条。
     */
    const style = doc?.style;
    const bad = [];
    for (const [block] of Object.entries(STYLE_BLOCKS)) {
      const b = style?.[block];
      if (!b || typeof b !== 'object') continue;
      const wanted = [b.render, b.surface, b.lighting, ...(Array.isArray(b.tags) ? b.tags : [])]
        .filter((v) => typeof v === 'string')
        .join(' ; ');
      for (const term of negativeTerms(b.negative)) {
        if (mentionsTerm(wanted, term)) bad.push(`style.${block} 一边要「${term}」一边把它禁掉了`);
      }
    }
    add(
      'style-coherent',
      '画风不自相矛盾（反向词没出现在正向那几块里）',
      bad.length === 0,
      bad.length ? `${[...new Set(bad)].join('；')}——换风格是整套换，不是把上一档的 negative 留着` : '',
    );
  }

  for (const [id, model, table] of [['model-caps', img.model, IMAGE_MODELS], ['video-model', video.model, VIDEO_MODELS]]) {
    if (typeof model === 'string' && model.trim() && !Object.hasOwn(table, model.trim())) {
      const g = gates.find(g => g.id === id);
      if (g.status === 'pass') { g.status = 'skipped'; g.reason = 'not-applicable'; }
    }
  }
  return gates;
}

export function validateProduction(doc) {
  return gateReport(doc)
    .filter(blocking)
    .map((g) => `[${g.id}] ${g.label}${g.detail ? ` — ${g.detail}` : ''}`);
}

/* ------------------------------------------------------------------ */
/* resolve — 下游要什么就给什么                                         */
/* ------------------------------------------------------------------ */
/*
 * 下游 skill 不 import 这个脚本（每个 skill 必须能单独拷走），
 * 它们直接读 production.json。resolve 是给「想一行拿到参数」的场合用的：
 * 出图前 shell 一句就知道这次该用哪个模型、哪个档位、哪个比例。
 *
 * inputData 保留制作参数接口；执行方将其作为 params 候选，按实时 schema 核对。
 * 提示词与素材交接给 ly-image / ly-video，不在本仓库提交。
 * 省得各拼各的——拼法一漂就又是一处不一致。
 */

/*
 * `styleBlock` 是这一段要抄的那一块画风。**只给要的那一块**：整个 style 对象
 * 摊开有六七十行，而 resolve 的用途是「一行拿到这一段要的参数」，
 * 把另一块也倒出来只会把有用的那几行埋掉——而且容易让人抄错块。
 */
export const STAGES = {
  characters: { kind: 'asset', what: '角色设定图', styleBlock: 'character' },
  art: { kind: 'asset', what: '场景与道具设定图', styleBlock: 'scene' },
  // 视频靠参考图继承画风；模型指南需要时再以短语补充风格约束
  video: { kind: 'video', what: '视频生成', styleBlock: null },
};

export function resolveStage(doc, stage) {
  const meta = STAGES[stage];
  if (!meta) throw new Error(`未知阶段 ${stage}（可用：${Object.keys(STAGES).join(' / ')}）`);

  const problems = documentProblems(doc);
  if (problems.length) throw new Error(problems.join('；'));
  const style = doc?.style ?? {};
  const common = {
    stage,
    what: meta.what,
    ...(doc?.creativeBrief ? { creativeBrief: doc.creativeBrief } : {}),
    style: {
      label: style.label ?? {},
      phrase: style.phrase ?? '',
      ...(meta.styleBlock ? { [meta.styleBlock]: style[meta.styleBlock] ?? {} } : {}),
    },
    lang: doc?.lang,
    autopilot: autopilotOf(doc),
    skill: meta.kind === 'video' ? GENERATION_SKILLS.video : GENERATION_SKILLS.image,
  };

  if (meta.kind === 'video') {
    const model = doc?.video?.model ?? '';
    const aspectRatio = doc?.video?.aspectRatio ?? '';
    const resolution = doc?.video?.resolution ?? '';
    const caps = videoCaps(model);
    // inputData 里的档位回填成枚举里的写法：用户写了 768P，网关只认 768p
    const inputData = { aspect_ratio: aspectRatio, resolution: matchTier(resolution, caps?.resolutions ?? []) ?? resolution };
    return {
      ...common,
      promptLang: doc?.promptLang,
      model,
      aspectRatio,
      resolution,
      // duration 逐段不同，下单时用 clampDuration 折算后补进去
      inputData,
      durationRange: caps?.duration ?? null,
      command: 'node <ly-video-dir>/scripts/video.mjs models --model ' + JSON.stringify(model),
    };
  }

  const slot = doc?.image?.asset;
  const model = doc?.image?.model ?? '';
  const resolution = slot?.resolution ?? '';
  const aspectRatio = slot?.aspectRatio ?? '';
  return {
    ...common,
    model,
    resolution,
    aspectRatio,
    // 这里只提供候选参数；素材字段必须由执行方按实时 schema 绑定。
    // 档位回填成枚举里的写法：用户写了 2k，网关只认 2K
    inputData: {
      aspect_ratio: aspectRatio,
      resolution: matchTier(resolution, IMAGE_MODELS[model]?.resolutions ?? []) ?? resolution,
    },
    command: 'node <ly-image-dir>/scripts/image.mjs models --model ' + JSON.stringify(model),
  };
}

/* ------------------------------------------------------------------ */
/* 渲染                                                                */
/* ------------------------------------------------------------------ */

const dash = (v) => (String(v ?? '').trim() ? String(v) : '—');

export function renderMarkdown(doc) {
  const problems = documentProblems(doc);
  if (problems.length) throw new Error(problems.join('；'));
  const img = doc?.image ?? {};
  const gates = gateReport(doc);
  const failed = gates.filter(blocking);

  const out = [];
  out.push(`# 生产参数${doc?.source ? ` · ${doc.source}` : ''}`, '');
  if (doc?.creativeBrief) out.push(`创作要求：${doc.creativeBrief}`);
  out.push('');
  out.push('| 参数 | 值 |', '| --- | --- |');
  out.push(`| 生图模型 | ${dash(img.model)} |`);
  out.push(`| 资产图分辨率 | ${dash(img.asset?.resolution)} |`);
  out.push(`| 资产图比例 | ${dash(img.asset?.aspectRatio)} |`);
  out.push(`| 生视频模型 | ${dash(doc?.video?.model)} |`);
  out.push(`| 视频 aspect_ratio | ${dash(doc?.video?.aspectRatio)} |`);
  out.push(`| 视频 resolution | ${dash(doc?.video?.resolution)} |`);
  out.push(`| 画风 | ${styleLabelOf(doc?.style)} |`);
  out.push(`| 画风短语 | ${dash(doc?.style?.phrase)} |`);
  out.push(`| 报告界面语言 | ${dash(doc?.lang)} |`);
  out.push(`| 提示词语言 | ${dash(doc?.promptLang)} |`);
  out.push(`| 自动驾驶 | ${autopilotOf(doc) ? '开启（下游跑完整段不打断）' : '关闭（该问就问）'} |`);
  out.push('');
  out.push('> 实际生图使用 ly-image，生视频使用 ly-video。此处只提供制作参数；档位与比例需按实时 schema 核对，不折算像素。', '');
  out.push('## 质量门', '');
  for (const g of gates) {
    out.push(`- ${mark(g)} ${g.label}${g.detail ? ` — ${g.detail}` : ''}`);
  }
  out.push('', '结构检查不代表创作要求已重新评审。内容评审：未执行。');
  if (failed.length) out.push('', `**${failed.length} 道门没过，先修再往下跑。**`);
  return out.join('\n');
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

const USAGE = `mint-setup.mjs — mint-setup skill 的确定性工具（生产参数）

  init --aspect <W:H>                    生成 production.json 骨架（打印到 stdout）
       [--source <剧名>]                  成片画幅**没有默认值**，必须显式指定
       [--autopilot]                     自动驾驶：下游五个 skill 各自把自己那一段
                                         一口气跑完，不提问、不等拍板（默认关）
       [--asset-resolution <档位>]        资产图分辨率档位，默认 2K
       [--asset-aspect <W:H>]            资产图比例（默认 16:9——设定图版面要横构图）
       [--image-model <名>]              默认 nanobanana2
       [--video-model <名>]              视频模型，取 ly-video 实时 models 返回的 id
       [--video-resolution <档位>]        视频分辨率档位（如 768p）
       [--creative-brief <正文>]          可选自然语言创作要求，不推导规则
       [--style <style.json>]            画风正文；不给就留一份空骨架待填
       [--lang zh|en]                    报告界面语言，默认 zh
       [--prompt-lang zh|en]             H3 提示词语言，默认 en
  style-template                         打印画风骨架与逐字段说明（填好放进顶层 style）
  style <production.json>                打印这部剧的画风
        [--for character|scene]          只打印某一块（下游 skill 抄的就是它）
  validate <production.json>             校验；有违规逐条打印并 exit 1
  checkup <production.json>              只打印质量门 ✓/✗，有未过项 exit 1
  show <production.json> [--md]          人读的参数表
  caps [--model <名>]                    打印某个模型收的档位与比例；不给模型就列全表
  duration <秒> --model <名>              把段秒数折成该模型能收的 duration
  resolve [--from <目录>] --for <阶段>    向上找 production.json，输出该阶段要用的参数
                                         阶段：characters / art / video
  find [--from <目录>]                    只打印找到的 production.json 路径
  models                                 打印内置的生图与生视频模型能力表

实际生成使用 ly-image / ly-video，本命令只管理制作参数。
能力表是历史快照；提交前通过外部 skill 的 models --model 查询实时 schema，
每条都注明取数命令；表里没有的模型不是错误，相关的门明说跳过。

production.json 住在**工作目录根**，下游从自己的输出目录向上找（最多 ${LOOKUP_DEPTH} 层）。`;

function readJson(path) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(resolve(path))));
}

function flag(rest, name, fallback) {
  const i = rest.indexOf(name);
  return i >= 0 && rest[i + 1] ? rest[i + 1] : fallback;
}

function loadFound(rest) {
  const from = flag(rest, '--from', '.');
  const hit = findProduction(from);
  if (!hit) {
    throw new Error(
      `从 ${resolve(from)} 向上 ${LOOKUP_DEPTH} 层没找到 ${PRODUCTION_FILE}——先跑 init 生成一份放到工作目录根`,
    );
  }
  return { path: hit, doc: readJson(hit) };
}

function main(argv) {
  const [cmd, ...rest] = argv;

  if (!cmd || cmd === '-h' || cmd === '--help') {
    console.log(USAGE);
    process.exit(cmd ? 0 : 1);
  }

  if (cmd === 'init') {
    const allowed = new Set(['--aspect', '--source', '--autopilot', '--asset-resolution', '--asset-aspect', '--image-model', '--video-model', '--video-resolution', '--style', '--creative-brief', '--lang', '--prompt-lang']);
    for (const arg of rest) {
      if (arg.startsWith('--') && !allowed.has(arg)) throw new Error(`未知选项 ${arg}`);
    }
    if (rest.includes('--creative-brief') && (!flag(rest, '--creative-brief') || flag(rest, '--creative-brief').startsWith('--'))) throw new Error('--creative-brief 需要非空正文');
    const doc = initProduction({
      aspect: flag(rest, '--aspect'),
      source: flag(rest, '--source', ''),
      autopilot: rest.includes('--autopilot'),
      assetResolution: flag(rest, '--asset-resolution', '2K'),
      assetAspect: flag(rest, '--asset-aspect', '16:9'),
      imageModel: flag(rest, '--image-model', 'nanobanana2'),
      videoModel: flag(rest, '--video-model', ''),
      videoResolution: flag(rest, '--video-resolution', ''),
      creativeBrief: flag(rest, '--creative-brief', undefined),
      style: flag(rest, '--style') ? readJson(flag(rest, '--style')) : null,
      lang: flag(rest, '--lang', 'zh'),
      promptLang: flag(rest, '--prompt-lang', 'en'),
    });
    console.log(JSON.stringify(doc, null, 2));
    // Omitted creativeBrief is valid; do not invent creative requirements.
    if (!flag(rest, '--style')) {
      console.error('⚠️ 画风留了空骨架——填满顶层 style 再跑 validate（style-template 有逐字段说明）');
    }
    return;
  }

  if (cmd === 'style-template') {
    console.log(
      JSON.stringify(
        {
          note: '把下面这块填满，整块放进 production.json 的顶层 "style"。画风没有内置类型——写实、吉卜力、水墨、黏土定格都行，但换风格是整套换：render / surface / lighting / negative / tags 一起换，别把上一档的 negative 留着',
          fields: {
            'label.zh': '画风的中文名，报告界面显示它（如「真人实拍」）',
            'label.en': '英文名，出英文报告时显示（可留空，回落到中文）',
            phrase: '英文画风短语，如 cinematic film still；视频提示词按模型指南使用，Seedance 收尾段据此描述风格',
            'character.render': '角色设定图的渲染方式那句，英文',
            'character.surface': '皮肤、眼睛、头发、布料怎么处理，英文',
            'character.lighting': '单张角色插画（cast 的 image.prompt）的光照，英文。角色设定图（image.sheet）的光由版式固定为柔和均匀的正面光，不写在这里',
            'character.negative': '角色设定图的反向提示词，英文逗号分隔',
            'character.tags': '风格标签数组，英文',
            'scene.render': '场景与道具设定图的渲染方式那句，英文',
            'scene.surface': '环境材质怎么处理，英文。**不要把角色那套皮肤毛孔带进来**',
            'scene.negative': '场景与道具的反向提示词，英文逗号分隔。参考图必须空景，这里要把人禁掉',
            'scene.tags': '风格标签数组，英文',
          },
          style: emptyStyle(),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (cmd === 'style') {
    const [path] = rest;
    if (!path) throw new Error('用法：style <production.json> [--for character|scene]');
    const doc = readJson(path);
    const problems = documentProblems(doc);
    if (problems.length) throw new Error(problems.join('；'));
    const only = flag(rest, '--for');
    if (only && !Object.keys(STYLE_BLOCKS).includes(only)) {
      throw new Error(`--for 要是 ${Object.keys(STYLE_BLOCKS).join(' / ')}`);
    }
    const style = doc?.style ?? {};
    console.log(
      JSON.stringify(
        only
          ? { label: style.label ?? {}, block: only, ...(style[only] ?? {}) }
          : style,
        null,
        2,
      ),
    );
    return;
  }

  if (cmd === 'validate' || cmd === 'checkup') {
    const [path] = rest;
    if (!path) throw new Error(`用法：${cmd} <production.json>`);
    const doc = readJson(path);

    if (cmd === 'checkup') {
      const gates = gateReport(doc);
      for (const g of gates) {
        console.log(`${mark(g)} ${g.label}${g.detail ? ` — ${g.detail}` : ''}`);
      }
      const failedN = gates.filter(blocking).length;
      console.log(`\n阻断失败 ${failedN}；通过 ${gates.filter(g => g.status === 'pass').length}；跳过 ${gates.filter(g => g.status === 'skipped').length}；内容未评审`);
      if (failedN) process.exit(1);
      return;
    }

    const problems = validateProduction(doc);
    if (problems.length) {
      console.error(`✗ ${problems.length} 处违规：\n`);
      for (const x of problems) console.error('  ' + x);
      process.exit(1);
    }
    console.log(
      `✓ 生产参数无阻断失败（跳过 ${gateReport(doc).filter(g => g.status === 'skipped').length} 项，内容未评审）（成片 ${doc.video?.aspectRatio} · 资产图 ${doc.image?.asset?.resolution} ${doc.image?.asset?.aspectRatio} · 画风 ${styleLabelOf(doc?.style)} · 自动驾驶 ${autopilotOf(doc) ? '开启' : '关闭'}）`,
    );
    return;
  }

  if (cmd === 'show') {
    const [path] = rest;
    if (!path) throw new Error('用法：show <production.json> [--md]');
    console.log(renderMarkdown(readJson(path)));
    return;
  }

  if (cmd === 'caps') {
    const model = flag(rest, '--model');
    if (!model) {
      console.log('历史能力快照（每条保留来源；实时约束请通过 ly-image / ly-video 查询）\n');
      console.log('生图：');
      for (const [name, m] of Object.entries(IMAGE_MODELS)) {
        console.log(`  ${name.padEnd(14)} 档位 ${m.resolutions.join(' / ')}　比例 ${m.aspectRatios.join(' / ')}`);
        if (m.restrict) {
          for (const [tier, list] of Object.entries(m.restrict)) {
            console.log(`  ${''.padEnd(14)} ↳ ${tier} 下只收 ${list.join(' / ')}`);
          }
        }
      }
      console.log('\n生视频：');
      for (const [name, m] of Object.entries(VIDEO_MODELS)) {
        console.log(`  ${name.padEnd(28)} 档位 ${m.resolutions.join(' / ')}　比例 ${m.aspectRatios.join(' / ')}`);
        if (m.duration) console.log(`  ${''.padEnd(28)} ↳ duration ${m.duration.min}~${m.duration.max} 秒整数`);
      }
      return;
    }
    const entry = IMAGE_MODELS[model] ?? VIDEO_MODELS[model];
    if (!entry) {
      throw new Error(
        `能力表里没有 ${model}（生图：${Object.keys(IMAGE_MODELS).join(' / ')}；生视频：${Object.keys(VIDEO_MODELS).join(' / ')}）\n` +
          '请使用 ly-image / ly-video 的 models 发现当前模型，再读取 models --model 的实时 schema。',
      );
    }
    console.log(JSON.stringify({ model, ...entry }, null, 2));
    return;
  }

  if (cmd === 'duration') {
    const [seconds] = rest;
    const model = flag(rest, '--model');
    if (!seconds || !model) throw new Error('用法：duration <秒> --model <名>');
    const r = clampDuration(Number(seconds), model);
    console.log(JSON.stringify({ model, seconds: Number(seconds), ...r }, null, 2));
    return;
  }

  if (cmd === 'resolve') {
    const stage = flag(rest, '--for');
    if (!stage) throw new Error(`用法：resolve [--from <目录>] --for <${Object.keys(STAGES).join('|')}>`);
    const { path, doc } = loadFound(rest);
    console.error(`↳ 生产参数：${path}`);
    console.log(JSON.stringify(resolveStage(doc, stage), null, 2));
    return;
  }

  if (cmd === 'find') {
    const { path } = loadFound(rest);
    console.log(path);
    return;
  }

  if (cmd === 'models') {
    console.log(
      JSON.stringify(
        {
          skills: GENERATION_SKILLS,
          note: '历史能力快照，非实时发现；实际生成前使用 ly-image / ly-video 核对 schema。表外模型的能力检查明确跳过。',
          image: IMAGE_MODELS,
          video: VIDEO_MODELS,
        },
        null,
        2,
      ),
    );
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
  // `show ... | head` 这类管道提前关闭时安静退出，别甩 EPIPE 堆栈
  process.stdout.on('error', (e) => {
    if (e.code === 'EPIPE') process.exit(0);
    throw e;
  });
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
