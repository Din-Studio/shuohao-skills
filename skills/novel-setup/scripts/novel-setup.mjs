#!/usr/bin/env node
// novel-setup — deterministic helpers for the novel-setup skill (生产参数).
// Zero dependencies on purpose: 和其余 skill 一样，任何目录里 node 直接跑。
// Node 18+ (stdlib only).

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ */
/* 文件名与查找                                                         */
/* ------------------------------------------------------------------ */
/*
 * production.json 住在**工作目录根**，五个 skill 各自的子目录都在它下面。
 * 所以下游是从自己的输出目录**向上**找它，不是平级找。
 *
 * 向上找几层：五个 skill 的输出目录是 <work>/art/ 这样的一层，
 * 但用户常常再往下套一层（<work>/storyboard/E01-01/ 里跑 export），
 * 所以给到 5 层，够用又不至于爬到用户主目录。
 */

export const PRODUCTION_FILE = 'production.json';
export const LOOKUP_DEPTH = 5;

export function findProduction(fromDir = '.', depth = LOOKUP_DEPTH) {
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

/* ------------------------------------------------------------------ */
/* 生图模型能力表                                                       */
/* ------------------------------------------------------------------ */
/*
 * 出图与生视频都走 lingying（灵影网关）CLI。它的 `model get` 会把每个模型的
 * input_schema 原样打出来，所以这两张表**有本机可查的确凿依据**，
 * 不是凭记忆编的——每条都注明了取数命令，过期了重新跑一次就能对账。
 *
 * 关键差别（相对旧的按像素下单）：lingying 的 resolution 就是**档位本身**
 * （1K / 2K / 4K），aspect_ratio 是**枚举**，两者都是结构化字段。
 * 所以本 skill 不再需要把档位折算成像素，也不再往提示词里写 `Render at …`。
 *
 * 表里没有的模型**不是错误**：枚举门明说跳过，其余门照常。
 */

export const IMAGE_MODELS = {
  nanobanana2: {
    label: 'nanobanana2 · 灵影网关',
    source: 'lingying model get f0621c54-167a-4319-a067-30c36eff2c3d',
    modelId: 'f0621c54-167a-4319-a067-30c36eff2c3d',
    resolutions: ['1K', '2K', '4K'],
    aspectRatios: ['1:1', '2:3', '3:2', '9:16', '16:9'],
    refImages: true,
    negativePrompt: true,
    price: '0.23 / 0.3 / 0.4 元每张（1K / 2K / 4K）',
  },
  'image-2': {
    label: 'image-2 · 灵影网关',
    source: 'lingying model get fac7474d-8dd2-4830-b792-02715820cfd6',
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
 * 没有本机文档可依据时凭记忆编一张比不查更坏。改走 lingying 之后依据有了：
 * `lingying model list --model_type video` 加 `model get`，逐条抄下来。
 *
 * MiniMax H3 的 resolution 与 aspect_ratio 是**条件枚举**——由
 * metadata.h3_variant 决定，所以 production.json 多一个 video.variant 字段。
 * 不填 variant 的模型（seedance 全系）把 variant 留空即可。
 */

export const VIDEO_MODELS = {
  'MiniMax H3': {
    label: 'MiniMax H3 · 灵影网关',
    source: 'lingying model get 7809cb1a-4f09-40de-a9e9-dd3841016138',
    modelId: '7809cb1a-4f09-40de-a9e9-dd3841016138',
    variantField: 'metadata.h3_variant',
    defaultVariant: 'managed',
    variants: {
      managed: {
        resolutions: ['768p', '2K'],
        aspectRatios: ['16:9', '21:9', '4:3', '1:1', '3:4', '9:16', 'adaptive'],
      },
      open_source: {
        resolutions: ['480p', '720p'],
        aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9'],
      },
      bf16: {
        resolutions: ['480p', '720p'],
        aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9'],
      },
      int8: {
        resolutions: ['480p', '720p'],
        aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9'],
      },
    },
    duration: { min: 5, max: 15, integer: true },
    price: '0.1 元每秒',
  },
  'seedance2.5': {
    label: 'seedance2.5 · 灵影网关',
    source: 'lingying model get 927e312f-795c-4558-9696-3226e51ecc08',
    modelId: '927e312f-795c-4558-9696-3226e51ecc08',
    resolutions: ['480p', '720p'],
    aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
    // input_schema 只写了「必填整数」没给范围；4~30 由仓库作者确认后补录
    duration: { min: 4, max: 30, integer: true },
    price: '0.75~2.04 元每秒',
  },
  'seedance2.0': {
    label: 'seedance2.0 · 灵影网关',
    source: 'lingying model get 67a84596-7d39-499e-8118-bd47075f753a',
    modelId: '67a84596-7d39-499e-8118-bd47075f753a',
    resolutions: ['480p', '720p', '1080p'],
    aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
    duration: { min: 4, max: 15, integer: true },
    price: '0.5~3.13 元每秒',
  },
  'seedance2.0 fast': {
    label: 'seedance2.0 fast · 灵影网关',
    source: 'lingying model get 19dd94a3-a727-4753-8cc1-e67be689cb4f',
    modelId: '19dd94a3-a727-4753-8cc1-e67be689cb4f',
    resolutions: ['480p', '720p'],
    aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
    duration: { min: 4, max: 15, integer: true },
    price: '0.4~1.05 元每秒',
  },
  'seedance2.0 mini': {
    label: 'seedance2.0 mini · 灵影网关',
    source: 'lingying model get 3d04b2de-9329-4bfa-aa99-c2d978bc8746',
    modelId: '3d04b2de-9329-4bfa-aa99-c2d978bc8746',
    resolutions: ['480p', '720p'],
    aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
    duration: { min: 4, max: 15, integer: true },
    price: '0.25~0.68 元每秒',
  },
};

export const SUPPORTED_STYLES = ['realistic', 'ghibli'];
export const SUPPORTED_LANGS = ['zh', 'en'];

/** 出图与生视频统一走这个 CLI；skill 只认名字，装在哪由使用方决定。 */
export const GENERATION_CLI = 'lingying';

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
 * 取某个模型在某个变体下的枚举。
 * 模型不在表里返回 null——调用方据此说明「跳过检查」，不要装作查过。
 */
export function videoCaps(model, variant = '') {
  const m = VIDEO_MODELS[model];
  if (!m) return null;
  if (!m.variants) {
    return { resolutions: m.resolutions, aspectRatios: m.aspectRatios, duration: m.duration ?? null };
  }
  const key = String(variant ?? '').trim() || m.defaultVariant;
  const v = m.variants[key];
  if (!v) return null;
  return { resolutions: v.resolutions, aspectRatios: v.aspectRatios, duration: m.duration ?? null, variant: key };
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
 * 把段秒数折成 lingying 能接受的 duration。
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
 * 理由：竖屏和横屏是两条不同的片子，猜错了后果是整批分镜图和视频白出。
 * 这是唯一一个宁可让用户多打一个参数也不能默认的参数。
 */

export function initProduction({
  aspect,
  source = '',
  assetResolution = '2K',
  assetAspect = '16:9',
  frameResolution = '2K',
  imageModel = 'nanobanana2',
  videoModel = '',
  videoResolution = '',
  videoVariant = '',
  style = 'realistic',
  lang = 'zh',
  promptLang = 'en',
} = {}) {
  const a = parseAspect(aspect);
  if (!a) {
    throw new Error(
      `--aspect 必须显式给出且形如 9:16 或 16:9（成片画幅没有默认值——猜错了整批分镜图和视频白出）`,
    );
  }

  // 模型自带变体（H3 的 managed / open_source / …）而用户没指定，就填默认那个：
  // 留空会让下单少一个必填字段，报错要到提交那一刻才看得见
  const variant = videoVariant || (VIDEO_MODELS[videoModel]?.defaultVariant ?? '');

  return {
    source,
    style,
    lang,
    promptLang,
    image: {
      model: imageModel,
      asset: { resolution: assetResolution, aspectRatio: assetAspect },
      frame: { resolution: frameResolution, aspectRatio: aspect },
    },
    video: {
      model: videoModel,
      aspectRatio: aspect,
      resolution: videoResolution,
      variant,
    },
  };
}

/* ------------------------------------------------------------------ */
/* 质量门                                                              */
/* ------------------------------------------------------------------ */
/*
 * 七道门，全是代码。分两类：
 *   会导致重出图的（比例对不上、档位模型不收、画风漂）——拦；
 *   只影响阅读的（报告界面语言）——不设门，下游继承就好。
 *
 * 改走 lingying 之后多出来的那道是 model-caps：档位与比例都是模型的**枚举值**，
 * 能在这里查死。以前档位要折成像素、折算规则在使用方的 CLI 里，
 * 所以只能查非空；现在枚举就在 input_schema 里，查得起。
 */

export function gateReport(doc) {
  const gates = [];
  const add = (id, label, ok, detail = '') => gates.push({ id, label, ok, detail });

  const img = doc?.image ?? {};
  const asset = img.asset ?? {};
  const frame = img.frame ?? {};
  const video = doc?.video ?? {};

  /* 1 — 字段齐全且枚举合法 */
  {
    const bad = [];
    if (!String(img.model ?? '').trim()) bad.push('image.model 为空');
    if (!String(asset.resolution ?? '').trim()) bad.push('image.asset.resolution 为空');
    if (!String(asset.aspectRatio ?? '').trim()) bad.push('image.asset.aspectRatio 为空');
    if (!String(frame.resolution ?? '').trim()) bad.push('image.frame.resolution 为空');
    if (!String(frame.aspectRatio ?? '').trim()) bad.push('image.frame.aspectRatio 为空');
    if (!SUPPORTED_STYLES.includes(doc?.style)) bad.push(`style 要是 ${SUPPORTED_STYLES.join(' / ')}`);
    if (!SUPPORTED_LANGS.includes(doc?.lang)) bad.push(`lang 要是 ${SUPPORTED_LANGS.join(' / ')}`);
    if (!SUPPORTED_LANGS.includes(doc?.promptLang)) bad.push(`promptLang 要是 ${SUPPORTED_LANGS.join(' / ')}`);
    add('fields', '字段齐全、枚举合法', bad.length === 0, bad.join('；'));
  }

  /* 2 — 三个比例的写法 */
  {
    const bad = [];
    for (const [label, v] of [
      ['image.asset.aspectRatio', asset.aspectRatio],
      ['image.frame.aspectRatio', frame.aspectRatio],
      ['video.aspectRatio', video.aspectRatio],
    ]) {
      if (!parseAspect(v)) bad.push(`${label}=${v ?? '(空)'} 不是 W:H 写法`);
    }
    add(
      'aspect-format',
      '比例都是 W:H 写法',
      bad.length === 0,
      bad.length ? `${bad.join('；')}——lingying 的 adaptive 在本管线里不能用：分镜图要按同一个比例批量出，比例交给模型自己挑就对不上了` : '',
    );
  }

  /* 3 — 分镜图比例必须等于视频比例（核心门） */
  {
    const f = parseAspect(frame.aspectRatio);
    const v = parseAspect(video.aspectRatio);
    const ok = !!f && !!v && sameRatio(f.ratio, v.ratio);
    add(
      'frame-matches-video',
      '分镜图比例 = 视频比例',
      ok,
      ok ? '' : `分镜图 ${frame.aspectRatio ?? '(空)'} vs 视频 ${video.aspectRatio ?? '(空)'} —— 分镜图是喂给视频模型的参考图，比例不一致会被裁切或拉伸，整批白出`,
    );
  }

  /* 4 — 资产图不能是竖构图 */
  {
    const a = parseAspect(asset.aspectRatio);
    const ok = !a || a.ratio >= 1;
    add(
      'asset-landscape',
      '资产图是横构图或方形',
      ok,
      ok ? '' : `资产图 ${asset.aspectRatio} 是竖构图——角色设定图的三区版面、场景与道具设定图的 L 形版面都靠横向铺开，竖过来三视图会被压扁。成片竖屏不影响设定图横构图，这两件事不是一回事`,
    );
  }

  /* 5 — 三个 resolution 都填了（档位合不合法归第 6、7 道门） */
  {
    const bad = [];
    if (!String(video.resolution ?? '').trim()) bad.push('video.resolution 为空');
    add(
      'resolution-filled',
      '三处分辨率档位都已填',
      bad.length === 0,
      bad.length
        ? bad.join('；')
        : `资产图 ${asset.resolution ?? '(空)'} · 分镜图 ${frame.resolution ?? '(空)'} · 视频 ${video.resolution}`,
    );
  }

  /* 6 — 视频模型与参数合法 */
  {
    const bad = [];
    const model = String(video.model ?? '').trim();
    if (!model) bad.push('video.model 为空');
    const entry = VIDEO_MODELS[model];
    let note = '';
    if (model && !entry) {
      note = `${model} 不在能力表里，只查了非空（能力表来自 lingying model get，加一条就自动开始查）`;
    } else if (entry) {
      const variant = String(video.variant ?? '').trim();
      if (entry.variants && !variant) {
        bad.push(`${model} 要填 video.variant（${Object.keys(entry.variants).join(' / ')}），它决定 resolution 与 aspect_ratio 的枚举`);
      } else if (entry.variants && !entry.variants[variant]) {
        bad.push(`video.variant=${variant} 不是 ${model} 的变体（${Object.keys(entry.variants).join(' / ')}）`);
      } else {
        const caps = videoCaps(model, variant);
        if (caps && !matchTier(video.resolution, caps.resolutions)) {
          bad.push(`${model}${caps.variant ? ` · ${caps.variant}` : ''} 的 resolution 要是 ${caps.resolutions.join(' / ')}（现在是 ${video.resolution || '(空)'}）`);
        }
        if (caps && !caps.aspectRatios.includes(String(video.aspectRatio ?? '').trim())) {
          bad.push(`${model}${caps.variant ? ` · ${caps.variant}` : ''} 的 aspect_ratio 要是 ${caps.aspectRatios.join(' / ')}（现在是 ${video.aspectRatio || '(空)'}）`);
        }
        if (caps?.duration) {
          note = `段时长下单时要折成 ${caps.duration.min}~${caps.duration.max} 的整数秒`;
        }
      }
    }
    add('video-model', '视频模型与参数合法', bad.length === 0, bad.length ? bad.join('；') : note);
  }

  /* 7 — 档位与比例被生图模型收（lingying 的 input_schema 是枚举，查得死） */
  {
    const model = String(img.model ?? '').trim();
    const entry = IMAGE_MODELS[model];
    const bad = [];
    let note = '';
    if (model && !entry) {
      note = `${model} 不在能力表里，档位与比例都跳过检查（能力表来自 lingying model get，加一条就自动开始查）`;
    } else if (entry) {
      for (const [label, slot] of [['资产图', asset], ['分镜图', frame]]) {
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
        const hit = [asset, frame]
          .map((slot) => matchTier(slot?.resolution, entry.resolutions))
          .filter((t) => t && entry.restrict?.[t])
          .map((t) => `${t} 下只收 ${entry.restrict[t].join(' / ')}`);
        note = `${model}：档位 ${entry.resolutions.join(' / ')} · 比例 ${entry.aspectRatios.join(' / ')}`;
        if (hit.length) note += `（${[...new Set(hit)].join('；')}）`;
      }
    }
    add('model-caps', '档位与比例都被生图模型收', bad.length === 0, bad.length ? bad.join('；') : note);
  }

  return gates;
}

export function validateProduction(doc) {
  return gateReport(doc)
    .filter((g) => !g.ok)
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
 * 最值钱的一个字段是 inputData：**直接展开进 lingying 的 --input_data**，
 * 每个 skill 只要补一个 prompt（和参考图 URL）就能提交，
 * 省得各拼各的——拼法一漂就又是一处不一致。
 */

export const STAGES = {
  characters: { kind: 'asset', what: '角色设定图' },
  art: { kind: 'asset', what: '场景与道具设定图' },
  storyboard: { kind: 'frame', what: '分镜图' },
  video: { kind: 'video', what: '视频生成' },
};

export function resolveStage(doc, stage) {
  const meta = STAGES[stage];
  if (!meta) throw new Error(`未知阶段 ${stage}（可用：${Object.keys(STAGES).join(' / ')}）`);

  const common = { stage, what: meta.what, style: doc?.style, lang: doc?.lang, cli: GENERATION_CLI };

  if (meta.kind === 'video') {
    const model = doc?.video?.model ?? '';
    const variant = doc?.video?.variant ?? '';
    const aspectRatio = doc?.video?.aspectRatio ?? '';
    const resolution = doc?.video?.resolution ?? '';
    const entry = VIDEO_MODELS[model];
    const caps = videoCaps(model, variant);
    // inputData 里的档位回填成枚举里的写法：用户写了 768P，网关只认 768p
    const inputData = { aspect_ratio: aspectRatio, resolution: matchTier(resolution, caps?.resolutions ?? []) ?? resolution };
    if (entry?.variants) inputData.metadata = { h3_variant: variant || entry.defaultVariant };
    return {
      ...common,
      promptLang: doc?.promptLang,
      model,
      variant,
      aspectRatio,
      resolution,
      // duration 逐段不同，下单时用 clampDuration 折算后补进去
      inputData,
      durationRange: caps?.duration ?? null,
      command: `${GENERATION_CLI} video create --model ${JSON.stringify(model)} --input_data '<JSON>' --json`,
    };
  }

  const slot = meta.kind === 'frame' ? doc?.image?.frame : doc?.image?.asset;
  const model = doc?.image?.model ?? '';
  const resolution = slot?.resolution ?? '';
  const aspectRatio = slot?.aspectRatio ?? '';
  return {
    ...common,
    model,
    resolution,
    aspectRatio,
    // 补一个 prompt（要参考图再补 images）就能提交，不用自己拼。
    // 档位回填成枚举里的写法：用户写了 2k，网关只认 2K
    inputData: {
      aspect_ratio: aspectRatio,
      resolution: matchTier(resolution, IMAGE_MODELS[model]?.resolutions ?? []) ?? resolution,
    },
    command: `${GENERATION_CLI} image create --model ${JSON.stringify(model)} --input_data '<JSON>' --json`,
  };
}

/* ------------------------------------------------------------------ */
/* 渲染                                                                */
/* ------------------------------------------------------------------ */

const dash = (v) => (String(v ?? '').trim() ? String(v) : '—');

export function renderMarkdown(doc) {
  const img = doc?.image ?? {};
  const gates = gateReport(doc);
  const failed = gates.filter((g) => !g.ok);

  const out = [];
  out.push(`# 生产参数${doc?.source ? ` · ${doc.source}` : ''}`, '');
  out.push('| 参数 | 值 |', '| --- | --- |');
  out.push(`| 生图模型 | ${dash(img.model)} |`);
  out.push(`| 资产图分辨率 | ${dash(img.asset?.resolution)} |`);
  out.push(`| 资产图比例 | ${dash(img.asset?.aspectRatio)} |`);
  out.push(`| 分镜图分辨率 | ${dash(img.frame?.resolution)} |`);
  out.push(`| 分镜图比例 | ${dash(img.frame?.aspectRatio)} |`);
  out.push(`| 生视频模型 | ${dash(doc?.video?.model)} |`);
  out.push(`| 视频变体 | ${dash(doc?.video?.variant)} |`);
  out.push(`| 视频 aspect_ratio | ${dash(doc?.video?.aspectRatio)} |`);
  out.push(`| 视频 resolution | ${dash(doc?.video?.resolution)} |`);
  out.push(`| 画风 | ${dash(doc?.style)} |`);
  out.push(`| 报告界面语言 | ${dash(doc?.lang)} |`);
  out.push(`| 提示词语言 | ${dash(doc?.promptLang)} |`);
  out.push('');
  out.push(`> 出图与生视频都走 \`${GENERATION_CLI}\`：分辨率与比例是它的**枚举值**，原样填进 \`--input_data\`，提示词里不写像素。`, '');
  out.push('## 质量门', '');
  for (const g of gates) {
    out.push(`- ${g.ok ? '✅' : '❌'} ${g.label}${g.detail ? ` — ${g.detail}` : ''}`);
  }
  if (failed.length) out.push('', `**${failed.length} 道门没过，先修再往下跑。**`);
  return out.join('\n');
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

const USAGE = `novel-setup.mjs — novel-setup skill 的确定性工具（生产参数）

  init --aspect <W:H>                    生成 production.json 骨架（打印到 stdout）
       [--source <剧名>]                  成片画幅**没有默认值**，必须显式指定
       [--asset-resolution <档位>]        资产图分辨率档位，默认 2K
       [--asset-aspect <W:H>]            资产图比例（默认 16:9——设定图版面要横构图）
       [--frame-resolution <档位>]        分镜图分辨率档位，默认 2K
       [--image-model <名>]              默认 nanobanana2
       [--video-model <名>]              视频模型，取 lingying model list 的 ID 列
       [--video-resolution <档位>]        视频分辨率档位（如 768p）
       [--video-variant <名>]            视频模型的变体（MiniMax H3：managed 等），不给取默认
       [--style realistic|ghibli]        默认 realistic
       [--lang zh|en]                    报告界面语言，默认 zh
       [--prompt-lang zh|en]             H3 提示词语言，默认 en
  validate <production.json>             校验；有违规逐条打印并 exit 1
  checkup <production.json>              只打印质量门 ✓/✗，有未过项 exit 1
  show <production.json> [--md]          人读的参数表
  caps [--model <名>]                    打印某个模型收的档位与比例；不给模型就列全表
  duration <秒> --model <名>              把段秒数折成该模型能收的 duration
  resolve [--from <目录>] --for <阶段>    向上找 production.json，输出该阶段要用的参数
                                         阶段：characters / art / storyboard / video
  find [--from <目录>]                    只打印找到的 production.json 路径
  models                                 打印内置的生图与生视频模型能力表

出图与生视频都走 ${GENERATION_CLI} CLI。分辨率与比例是它的**枚举值**（1K/2K/4K、16:9…），
原样填进 --input_data，不折算像素、提示词里也不写像素。能力表抄自 \`${GENERATION_CLI} model get\`，
每条都注明取数命令；表里没有的模型不是错误，相关的门明说跳过。

production.json 住在**工作目录根**，下游从自己的输出目录向上找（最多 ${LOOKUP_DEPTH} 层）。`;

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function flag(rest, name, fallback = null) {
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
    const doc = initProduction({
      aspect: flag(rest, '--aspect'),
      source: flag(rest, '--source', ''),
      assetResolution: flag(rest, '--asset-resolution', '2K'),
      assetAspect: flag(rest, '--asset-aspect', '16:9'),
      frameResolution: flag(rest, '--frame-resolution', '2K'),
      imageModel: flag(rest, '--image-model', 'nanobanana2'),
      videoModel: flag(rest, '--video-model', ''),
      videoResolution: flag(rest, '--video-resolution', ''),
      videoVariant: flag(rest, '--video-variant', ''),
      style: flag(rest, '--style', 'realistic'),
      lang: flag(rest, '--lang', 'zh'),
      promptLang: flag(rest, '--prompt-lang', 'en'),
    });
    console.log(JSON.stringify(doc, null, 2));
    return;
  }

  if (cmd === 'validate' || cmd === 'checkup') {
    const [path] = rest;
    if (!path) throw new Error(`用法：${cmd} <production.json>`);
    const doc = readJson(path);

    if (cmd === 'checkup') {
      const gates = gateReport(doc);
      for (const g of gates) {
        console.log(`${g.ok ? '✓' : '✗'} ${g.label}${g.detail ? ` — ${g.detail}` : ''}`);
      }
      const failedN = gates.filter((g) => !g.ok).length;
      console.log(failedN ? `\n✗ ${failedN} 项未过` : '\n✓ 全部通过');
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
      `✓ 生产参数全部通过校验（成片 ${doc.video?.aspectRatio} · 分镜图 ${doc.image?.frame?.resolution} · 资产图 ${doc.image?.asset?.resolution} ${doc.image?.asset?.aspectRatio} · 画风 ${doc.style}）`,
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
      console.log(`${GENERATION_CLI} 能力表（抄自 ${GENERATION_CLI} model get，每条都注明取数命令）\n`);
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
        if (m.variants) {
          for (const [v, caps] of Object.entries(m.variants)) {
            console.log(`  ${`${name} · ${v}`.padEnd(28)} 档位 ${caps.resolutions.join(' / ')}　比例 ${caps.aspectRatios.join(' / ')}`);
          }
        } else {
          console.log(`  ${name.padEnd(28)} 档位 ${m.resolutions.join(' / ')}　比例 ${m.aspectRatios.join(' / ')}`);
        }
        if (m.duration) console.log(`  ${''.padEnd(28)} ↳ duration ${m.duration.min}~${m.duration.max} 秒整数`);
      }
      return;
    }
    const entry = IMAGE_MODELS[model] ?? VIDEO_MODELS[model];
    if (!entry) {
      throw new Error(
        `能力表里没有 ${model}（生图：${Object.keys(IMAGE_MODELS).join(' / ')}；生视频：${Object.keys(VIDEO_MODELS).join(' / ')}）\n` +
          `跑 \`${GENERATION_CLI} model list\` 看网关上现在有什么，确认口径后往表里加一条就自动开始查。`,
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
          cli: GENERATION_CLI,
          note: `能力表抄自 \`${GENERATION_CLI} model get\`，每条都带取数命令；表里没有的模型不是错误，相关的门明说跳过`,
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
