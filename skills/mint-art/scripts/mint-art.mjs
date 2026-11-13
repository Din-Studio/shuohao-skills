#!/usr/bin/env node
// mint-art — deterministic helpers for the mint-art skill (场景 + 道具).
// Zero dependencies on purpose: the skill must work in any directory
// without an npm install. Node 18+ (stdlib only).

import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetProductionProblems, creativeBackground, check, blocking, mark } from './lib/contracts.mjs';
export { creativeBackground } from './lib/contracts.mjs';
import { ART_VERSION, assetsOf, digest, sourceIdentity, identityDigest, identityCoreDigest, syncLifecycleStamps, seedFromSource, registerAsset, stageErrors, lifecycleErrors, budgetChecks, verifySources, assertStoryOutline, assertCharacters, upstreamCheck } from './lib/stage.mjs';
export { seedFromSource, registerAsset, identityDigest } from './lib/stage.mjs';
import { mediaPlan, checkPlanFlags, printPlan } from './lib/media-plan.mjs';

/* ------------------------------------------------------------------ */
/* 画风                                                                 */
/* ------------------------------------------------------------------ */
/*
 * **本 skill 不内置任何画风。**以前这里写死两档预设（realistic / ghibli），
 * 想拍水墨、拍黏土定格、拍胶片颗粒的年代戏就只能改代码，而且同一档画风的正文
 * 在三个出图 skill 里各存一份，改一处漏两处。
 *
 * 现在画风住在工作目录根的 production.json 顶层，由用户在 mint-setup 那一段填。
 * 本 skill 要的是其中的 `style.scene` 那一块：render / surface / negative / tags。
 *
 * 它与 `style.character` 是**同一个画风的两种落地**，不是同一段文字：
 * 写实的人要毛孔、皮下散射、根根分明的碎发；写实的环境要斑驳、水渍、包浆。
 * 把角色那套带进环境，出来就是四不像。
 *
 * **换风格是整套换**：四块一起换，不混搭。矛盾本身由 mint-setup 的
 * style-coherent 门查，本 skill 查的是**设定卡有没有把那一块整块用上**。
 */

/** 从生产参数里取场景那一块画风；没有生产参数、或那块没填就返回 null。 */
export function styleBlockOf(production) {
  const b = production?.style?.scene;
  if (!b || typeof b !== 'object') return null;
  return String(b.render ?? '').trim() ? b : null;
}

/** 人读的画风名，报告与 CLI 输出里用。 */
export const styleLabelOf = (production, lang = 'zh') => {
  const label = production?.style?.label ?? {};
  const zh = String(label.zh ?? '').trim();
  const en = String(label.en ?? '').trim();
  const pick = String(label[lang] ?? '').trim() || zh || en;
  return pick || (lang === 'en' ? '(unset)' : '未填');
};

/**
 * 反向提示词按逗号/分号拆成词条——画风那块的每一条都必须出现在设定卡里，
 * 场景自己额外加的不受影响。整段比对会把「加了一条自己的」误判成漂了。
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
 * 找不到不是错误——仍然使用内置默认值，但校验输出里必须明说哪几道门跳过了。
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
 * 不问画风、不问输入用哪一份、道具收哪几件自己定，做过的决定全部写进最后的汇报。
 *
 * 转移的是**审批权**，不是取消检查点：12 道门照样要过、拿到图照样要核对锚点、
 * 出图前照样打印要出多少张——只是不再等人点头。
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
export const STAGE_DIR = 'art';

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

export const SKIP_PROD = `未找到 ${PRODUCTION_FILE}（向上 ${PRODUCTION_DEPTH} 层），本门跳过——跑 /mint-setup 生成一份可以打开它`;
/** 找到了参数文件但画风那一块没填——同样是跳过，但原因不一样，说清楚。 */
export const SKIP_STYLE = `${PRODUCTION_FILE} 里的 style.scene 没填，本门跳过——回 /mint-setup 填满它`;

/** 整批错的门逐条列会刷成一堵墙：前几条够定位，后面只报个数。 */
export const brief = (list, n = 6) =>
  list.length <= n ? list.join('；') : `${list.slice(0, n).join('；')}；……等 ${list.length} 处`;

/** 界面语言走继承不设门：显式参数 > art.json 顶层 lang > 生产参数 > zh。 */
export const langOf = (doc, lang = null, production = null) =>
  lang ?? doc?.lang ?? production?.lang ?? 'zh';

/* ------------------------------------------------------------------ */
/* slug                                                                */
/* ------------------------------------------------------------------ */

export function slug(name) {
  const cleaned = String(name)
    .trim()
    .replace(/[\s/\\:*?"<>|·]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'scene';
}

/* ------------------------------------------------------------------ */
/* 质量门                                                               */
/* ------------------------------------------------------------------ */
/*
 * 与另外两个 skill 同一主张：checklist 是代码，不是给模型读的文字。
 * AI 短剧环境资产的硬规则都在这——空景、锚点、光照状态、
 * 提示词语言、风格与反向词匹配、变体引用完整。
 */

const thText = (s) => typeof s === 'string' && s.trim();
/** 中日韩表意文字与假名、谚文——出图提示词里出现就说明串语言了。 */
const CJK = /[㐀-鿿぀-ヿ가-힯]/;
/** 环境参考图必须空景：反向提示词里必须把「人」禁掉。 */
const PEOPLE_BAN = /people|human|figure|character|crowd/i;

export const ANCHOR_RANGE = [3, 5];

/*
 * 道具尺度参照：AI 经常把手持道具画成家具尺寸——实拍不存在的坑。
 * 设定图右格按长边分三档画一只匿名的手或一个匿名的人作尺寸参照；
 * scale 是中文枚举，image.sheet 里必须出现对应那一档英文句的关键片段，validate 会对着查。
 *   手持级：长边 30 厘米以内；桌面级：30–60 厘米；家具级：60 厘米以上。
 */
export const PROP_SCALES = {
  手持级: 'a generic adult hand holding it',
  桌面级: 'holding it with both hands, framed from the chest down',
  家具级: 'standing next to it or using it',
};
/** 右格的手或人只作尺寸参照、不是剧中角色——这句不写，视频模型会把它当成这一段里的人物。 */
export const SIZE_REF_PHRASE = 'anonymous generic bystander used only as a size reference';
export const ACTUAL_SIZE_PHRASE = 'actual size about';
/** 道具反向词禁手禁人会和右格的尺寸参照自相矛盾。 */
const PROP_NEG_CONFLICT = /\b(hands?|fingers?|people|persons?|humans?)\b/i;

/*
 * 纯净画质段（固定句）：每一条设定图提示词都在最后原文带上。
 * 设定图是后面所有画面的参考，噪点、颗粒会一路带下去。比较时规整空白。
 */
export const PURITY_PARAGRAPH = "Remove all noise, graininess, film grain and digital noise; shadows and dark areas smooth and clean, color transitions natural, gradients fine and smooth. Surfaces of skin, fabric, wood grain, stone, water and leaves clean and clear, edges crisp but not over-sharpened, with no dirt specks, hazy blur, smearing or artifacts. Keep the original details, do not reduce any characters or scene elements, do not change the characters' faces. High definition, clean low-ISO image quality, commercial-grade finished look.";
const squash = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const hasPurity = (v) => squash(v).includes(PURITY_PARAGRAPH);
/** 场景设定图版式：左侧四方向宫格 + 右侧正交平面图。 */
export const SCENE_LAYOUT_PHRASES = ['two-by-two grid', 'orthographic'];
/** 光影锁要写色温数值，不只写冷暖。 */
const KELVIN = /\d{3,5}\s?K\b/;

function visualGateReport(doc, castNames = null, production = null) {
  const structural = validateVisualArt(doc, castNames, production, false);
  const gates = [check('asset-contract', '资产字段、ID 与引用', structural.length ? 'fail' : 'pass', structural.join('；'))];
  const add = (id, label, passed, detail = '') => gates.push(check(id, label, passed ? 'pass' : 'fail', detail));
  const scenes = Array.isArray(doc?.scenes) ? doc.scenes : [];
  const props = Array.isArray(doc?.props) ? doc.props : [];
  if ([...scenes, ...props].some(item => !item || ['lighting','states'].some(k => item[k] !== undefined && !Array.isArray(item[k])) || (item.image?.tags !== undefined && !Array.isArray(item.image.tags)))) return gates;
  const bad = {
    anchors: [], lighting: [], people: [], english: [], names: [], variant: [], style: [],
    states: [], scale: [], sizeref: [], whitebg: [], aspect: [], layout: [], purity: [], kelvin: [],
  };
  const ids = new Set(scenes.map((s) => s?.id));
  // 画风正文住在生产参数里，没挂载就查不了——那道门会明说跳过，不装查过
  const preset = styleBlockOf(production);
  const styleNeg = preset ? negativeTerms(preset.negative) : [];

  // 设定图的版面比例写死在 image.sheet 的第一句里，改了参数不改提示词等于没改
  const assetAspect = production?.image?.asset?.aspectRatio ?? null;

  // 场景与道具共用的门：锚点 / 空景 / 英文 / 角色名 / 风格匹配
  for (const s of [...scenes, ...props]) {
    const label = s?.name ?? s?.id ?? '(无名)';

    // 锚点 3–5：少了认不出场景，多了 QC 核对不过来
    const anchorN = Array.isArray(s?.anchors) ? s.anchors.length : 0;
    if (anchorN < ANCHOR_RANGE[0] || anchorN > ANCHOR_RANGE[1]) bad.anchors.push(`${label}（${anchorN} 个）`);

    const isScene = scenes.includes(s);
    // 光照状态 ≥1（仅场景）：AI 换时段是重新生成，不是重新打灯
    if (isScene && (!Array.isArray(s?.lighting) || s.lighting.length === 0)) bad.lighting.push(label);
    // 光影锁写色温数值（仅场景）
    if (isScene) {
      const noK = (s?.lighting ?? []).filter((l) => thText(l?.prompt) && !KELVIN.test(l.prompt)).map((l) => l?.state ?? '?');
      if (noK.length) bad.kelvin.push(`${label}（${noK.join('、')}）`);
    }

    // 空景（仅场景）：反向提示词必须禁人。道具右格要画匿名的手或人作尺寸参照，不在此列
    const neg = s?.image?.negativePrompt ?? '';
    if (isScene && !PEOPLE_BAN.test(neg)) bad.people.push(label);

    // 场景版式：四方向宫格 + 正交平面图
    if (isScene) {
      const lost = SCENE_LAYOUT_PHRASES.filter((t) => !String(s?.image?.sheet ?? '').includes(t));
      if (lost.length) bad.layout.push(`${label} 缺「${lost.join('、')}」`);
    }

    // 纯净画质段：场景、道具的 sheet，以及道具的每条状态变体提示词
    if (!hasPurity(s?.image?.sheet)) bad.purity.push(`${label} 的 sheet`);
    if (!isScene) {
      (s?.states ?? []).slice(1).forEach((st, i) => {
        if (!hasPurity(st?.prompt)) bad.purity.push(`${label} 的状态「${st?.state ?? i + 2}」`);
      });
    }

    // 设定图版面的画幅：一条只报一次，整批错的时候不刷屏
    if (assetAspect) {
      const sheet = String(s?.image?.sheet ?? '');
      const strays = KNOWN_ASPECTS.filter((a) => a !== assetAspect && sheet.includes(a));
      if (!sheet.includes(assetAspect)) {
        bad.aspect.push(
          strays.length
            ? `${label} 写着「${strays.join('、')}」，生产参数是 ${assetAspect}`
            : `${label} 缺画幅「${assetAspect}」`,
        );
      } else if (strays.length) {
        bad.aspect.push(`${label} 同时写着「${strays.join('、')}」和 ${assetAspect}`);
      }
    }

    // 机器字段永远英文（场景的光照 + 道具的状态一起扫）
    const machine = [
      s?.image?.prompt, s?.image?.negativePrompt, s?.image?.sheet,
      ...(s?.lighting ?? []).map((l) => l?.prompt),
      ...(s?.states ?? []).map((st) => st?.prompt),
      ...(s?.image?.tags ?? []),
    ];
    if (machine.some((v) => typeof v === 'string' && CJK.test(v))) bad.english.push(label);

    // 提示词不许出现角色名（给了 cast 才查）
    if (castNames?.length) {
      const texts = [
        s?.image?.prompt, s?.image?.sheet,
        ...(s?.lighting ?? []).map((l) => l?.prompt),
        ...(s?.states ?? []).map((st) => st?.prompt),
      ];
      for (const n of castNames) {
        if (texts.some((v) => typeof v === 'string' && v.includes(n))) {
          bad.names.push(`${label} 出现「${n}」`);
          break;
        }
      }
    }

    // 变体引用完整
    if (s?.variantOf !== undefined) {
      if (!ids.has(s.variantOf) || s.variantOf === s.id) bad.variant.push(`${label} → ${s.variantOf}`);
      else if (!thText(s?.changes)) bad.variant.push(`${label} 缺 changes`);
    }

    // 画风整块用上了没有：渲染句原样进两条提示词，反向词一条不落
    // sheet 与 prompt 分开查——只查 sheet 的话，prompt 里留着上一档画风也照样全绿，
    // 出来就是设定表一个样、单张插画另一个样的两张皮
    if (preset) {
      if (thText(s?.image?.sheet) && !s.image.sheet.includes(preset.render)) bad.style.push(`${label} 的 sheet 缺渲染句`);
      if (thText(s?.image?.prompt) && !s.image.prompt.includes(preset.render)) bad.style.push(`${label} 的 prompt 缺渲染句`);
      /*
       * 反向词只对场景查全，道具不查。
       * 道具参考图是纯白背景的抠图素材，画风里那些冲着「环境别太干净」去的反向词
       * （sterile showroom cleanliness 这类）正好和白底自相矛盾——逐条要求道具也带上，
       * 拦的是对的做法。道具那边另有门管着：纯白背景、尺寸参照（反向词不得禁掉右格要画的手和人）。
       */
      if (scenes.includes(s)) {
        const lost = styleNeg.filter((t) => !String(neg).toLowerCase().includes(t));
        if (lost.length) bad.style.push(`${label} 的反向词少了「${brief(lost, 3)}」`);
      }
    }
  }

  // 道具专属的门
  for (const pr of props) {
    const label = pr?.name ?? pr?.id ?? '(无名)';

    // 状态 ≥1：states[0] 是基准状态，之后每个状态是一张依赖基准图的变体
    if (!Array.isArray(pr?.states) || pr.states.length === 0) bad.states.push(label);

    // 尺度参照：scale 枚举 + 设定图右格那一档的英文句
    const scaleEn = PROP_SCALES[pr?.scale];
    if (!scaleEn) {
      bad.scale.push(`${label}（scale 必须是 ${Object.keys(PROP_SCALES).join('/')}）`);
    } else if (!String(pr?.image?.sheet ?? '').includes(scaleEn)) {
      bad.scale.push(`${label}（设定图缺「${scaleEn}」）`);
    }

    // 尺寸参照：匿名路人句 + 实际尺寸；反向词不能禁掉右格要画的手和人
    const sheet = String(pr?.image?.sheet ?? '');
    const lostRef = [SIZE_REF_PHRASE, ACTUAL_SIZE_PHRASE].filter((t) => !sheet.includes(t));
    if (lostRef.length) bad.sizeref.push(`${label} 的设定图缺「${lostRef.join('、')}」`);
    const conflict = String(pr?.image?.negativePrompt ?? '').match(PROP_NEG_CONFLICT);
    if (conflict) bad.sizeref.push(`${label} 的反向词禁了「${conflict[0]}」，和右格的尺寸参照自相矛盾`);

    // 白底：道具参考图要被贴进各种镜头，必须纯白背景可抠
    if (!/white background/i.test(pr?.image?.sheet ?? '')) bad.whitebg.push(label);
  }

  add('anchors', `一致性锚点 ${ANCHOR_RANGE[0]}–${ANCHOR_RANGE[1]} 个`, scenes.length + props.length > 0 && bad.anchors.length === 0, bad.anchors.join('；'));
  add('lighting', '光照状态至少 1 个且落成提示词', scenes.length > 0 && bad.lighting.length === 0, bad.lighting.join('；'));
  add('no-people', '场景参考图无人：反向提示词禁人', scenes.length > 0 && bad.people.length === 0, bad.people.join('；'));
  add('scene-layout', '场景设定图为四方向宫格加正交平面图', scenes.length > 0 && bad.layout.length === 0, bad.layout.join('；'));
  add('lighting-kelvin', '光影锁写出色温数值', scenes.length > 0 && bad.kelvin.length === 0, bad.kelvin.join('；'));
  add('sheet-purity', '设定图提示词以纯净画质段收尾', scenes.length + props.length > 0 && bad.purity.length === 0, brief(bad.purity));
  add('english', '出图提示词全部英文', scenes.length + props.length > 0 && bad.english.length === 0, bad.english.join('；'));
  add(
    'no-names',
    '提示词不含角色名',
    bad.names.length === 0,
    castNames !== null ? bad.names.join('；') : '未提供 cast.json，本门跳过',
  );
  add('variants', '变体引用完整（variantOf 存在且带 changes）', bad.variant.length === 0, bad.variant.join('；'));
  add(
    'style-match',
    `画风整块用上（${production ? styleLabelOf(production) : '未挂载'}）`,
    bad.style.length === 0,
    preset ? brief(bad.style) : (production ? SKIP_STYLE : SKIP_PROD),
  );
  add('prop-states', '道具状态至少 1 个且落成提示词', props.length === 0 || bad.states.length === 0, bad.states.join('；'));
  add('prop-scale', '道具尺度那一档的尺寸参照写进设定图', props.length === 0 || bad.scale.length === 0, bad.scale.join('；'));
  add('prop-size-ref', '道具设定图右格是匿名尺寸参照并写明实际尺寸', props.length === 0 || bad.sizeref.length === 0, bad.sizeref.join('；'));
  add('prop-white', '道具设定图纯白背景可抠', props.length === 0 || bad.whitebg.length === 0, bad.whitebg.join('；'));
  // 生产参数的两道门（style-match 与 sheet-aspect）：找得到 production.json 就
  // 自动开，没有开关——画风与画幅改了都要整套重出图，这正是这份参数存在的理由
  add(
    'sheet-aspect',
    `设定图版面的画幅与生产参数一致（${assetAspect ?? '未挂载'}）`,
    bad.aspect.length === 0,
    assetAspect ? brief(bad.aspect) : SKIP_PROD,
  );

  const upstreamBad = assetProductionProblems(production, 'scene');
  if (production !== null) {
    gates.push(check('production-contract', '视觉正文与制作参数完整', upstreamBad.length ? 'fail' : 'pass', upstreamBad.join('；')));
  }
  for (const g of gates) {
    if (g.id === 'no-names' && !castNames) { g.status = 'skipped'; g.reason = 'missing-upstream'; }
    if (['style-match','sheet-aspect'].includes(g.id) && production === null) { g.status = 'skipped'; g.reason = 'missing-upstream'; }
    if (g.id === 'style-match' && production !== null && !preset) { g.status = 'fail'; g.detail = '提供的 production 缺少 style.scene 正文，回 mint-setup 填写'; }
    if (['lighting','no-people','scene-layout','lighting-kelvin'].includes(g.id) && !scenes.length) { g.status = 'skipped'; g.reason = 'not-applicable'; g.detail = '没有场景设计，不适用'; }
    if (['anchors','english','sheet-purity'].includes(g.id) && !scenes.length && !props.length) { g.status = 'skipped'; g.reason = 'not-applicable'; g.detail = '仅登记身份，不要求设计或出图'; }
    if (g.id.startsWith('prop-') && !props.length) { g.status = 'skipped'; g.reason = 'not-applicable'; g.detail = '没有道具，不适用'; }
  }
  return gates;
}

/* ------------------------------------------------------------------ */
/* validate                                                            */
/* ------------------------------------------------------------------ */

function validateVisualArt(doc, castNames = null, production = null, includeGates = true) {
  const problems = [];
  const p = (msg) => problems.push(msg);
  if (!doc || typeof doc !== 'object') return ['art.json 不是对象'];

  if (!thText(doc.source)) p('缺少 source（剧名/书名）');
  // 顶层没有 style 字段：画风一处定死在 production.json，art.json 抄一份只会漂。
  // 老产物里留着的那一份点名删掉，别让两个来源并存。
  if (doc.style !== undefined) {
    p('顶层不该有 style 字段——画风住在工作目录根的 production.json，这里留一份只会漂，删掉它');
  }

  const scenes = doc.scenes;
  if (!Array.isArray(scenes)) {
    p('scenes 必须是数组');
    return problems;
  }

  if (doc.props !== undefined && !Array.isArray(doc.props)) return [...problems, 'props 必须是数组'];
  for (const item of [...scenes, ...(doc.props ?? [])]) {
    if (!item || typeof item !== 'object') return [...problems, '资产必须是对象'];
    for (const key of ['anchors','lighting','states','relatedScenes']) {
      if (item[key] !== undefined && !Array.isArray(item[key])) return [...problems, `${item.id}.${key} 必须是数组`];
    }
    if (item.image?.tags !== undefined && !Array.isArray(item.image.tags)) return [...problems, `${item.id}.image.tags 必须是数组`];
    if (item.usage?.beatIds !== undefined && (!Array.isArray(item.usage.beatIds) || item.usage.beatIds.some(id => typeof id !== 'string' || !/^B\d{2,}$/.test(id)) || new Set(item.usage.beatIds).size !== item.usage.beatIds.length)) p(`${item.id}.usage.beatIds 必须是无重复节点 ID 数组`);
  }
  // 道具（可选块）：给了就逐件查结构
  for (const pr of doc.props ?? []) {
    const label = pr?.name ?? pr?.id ?? '(无名)';
    if (typeof pr?.id !== 'string' || !/^P\d{2,}$/.test(pr.id)) p(`[${label}] 道具 id 必须是 P01 这种格式`);
    if (!thText(pr?.name)) p(`[${pr?.id}] 道具缺 name`);
    if (!thText(pr?.summary)) p(`[${label}] 缺 summary（戏剧功能：这件道具承载什么剧情）`);
    for (const a of pr?.anchors ?? []) {
      if (!thText(a?.name) || !thText(a?.desc)) p(`[${label}] 锚点缺 name 或 desc`);
    }
    for (const st of pr?.states ?? []) {
      if (!thText(st?.state)) p(`[${label}] 状态缺 state（合上/打开……）`);
      if (!thText(st?.prompt)) p(`[${label}] 状态「${st?.state ?? '?'}」缺 prompt（英文）`);
    }
    const img = pr?.image;
    if (!img || typeof img !== 'object') {
      p(`[${label}] 缺 image`);
    } else {
      for (const f of ['prompt', 'negativePrompt', 'sheet']) {
        if (!thText(img[f])) p(`[${label}] image.${f} 缺失或为空`);
      }
      if (!Array.isArray(img.tags)) p(`[${label}] image.tags 必须是数组`);
    }
    for (const sid of pr?.relatedScenes ?? []) {
      if (!scenes.some((sc) => sc?.id === sid)) p(`[${label}] relatedScenes 里的 ${sid} 不存在`);
    }
    if (pr?.usage !== undefined) {
      if (!Array.isArray(pr.usage?.episodes)) p(`[${label}] usage.episodes 必须是数组`);
      if (!Array.isArray(pr.usage?.beats)) p(`[${label}] usage.beats 必须是数组`);
    }
  }
  {
    const seenP = new Set();
    for (const pr of doc.props ?? []) {
      if (seenP.has(pr?.id)) p(`道具 id ${pr.id} 重复`);
      seenP.add(pr?.id);
    }
  }

  const seen = new Set();
  for (const s of scenes) {
    const label = s?.name ?? s?.id ?? '(无名)';
    if (typeof s?.id !== 'string' || !/^S\d{2,}$/.test(s.id)) p(`[${label}] 场景 id 必须是 S01 这种格式`);
    if (seen.has(s?.id)) p(`场景 id ${s.id} 重复`);
    seen.add(s?.id);
    if (!thText(s?.name)) p(`[${s?.id}] 缺 name`);
    if (typeof s?.primary !== 'boolean') p(`[${label}] 缺 primary（是不是主场景）`);
    if (!thText(s?.summary)) p(`[${label}] 缺 summary（设计意图：这个空间讲什么故事）`);

    for (const a of s?.anchors ?? []) {
      if (!thText(a?.name) || !thText(a?.desc)) p(`[${label}] 锚点缺 name 或 desc`);
    }
    for (const l of s?.lighting ?? []) {
      if (!thText(l?.state)) p(`[${label}] 光照状态缺 state（晨雾/夜戏/黄昏……）`);
      if (!thText(l?.prompt)) p(`[${label}] 光照「${l?.state ?? '?'}」缺 prompt（英文）`);
    }

    const img = s?.image;
    if (!img || typeof img !== 'object') {
      p(`[${label}] 缺 image`);
    } else {
      for (const f of ['prompt', 'negativePrompt', 'sheet']) {
        if (!thText(img[f])) p(`[${label}] image.${f} 缺失或为空`);
      }
      if (!Array.isArray(img.tags)) p(`[${label}] image.tags 必须是数组`);
    }

    if (s?.usage !== undefined) {
      if (!Array.isArray(s.usage?.episodes)) p(`[${label}] usage.episodes 必须是数组`);
      if (!Array.isArray(s.usage?.beats)) p(`[${label}] usage.beats 必须是数组`);
    }
  }

  // 质量门失败并入违规列表
  for (const g of includeGates ? visualGateReport(doc, castNames, production) : []) {
    if (g.id !== 'asset-contract' && blocking(g)) p(`质量门未过：${g.label}${g.detail ? `（${g.detail}）` : ''}`);
  }

  return problems;
}

// Formal stage contract wraps the existing independent visual design checks.
function designDocument(doc) {
  return {...doc,scenes:(Array.isArray(doc?.scenes)?doc.scenes:[]).filter(a=>a?.designStatus!=='none'),props:(Array.isArray(doc?.props)?doc.props:[]).filter(a=>a?.designStatus!=='none')};
}
export function seedFromOutline(outline) {
  assertStoryOutline(outline);
  throw Error('outline v5 仅为故事背景；请使用 seed --source path --title title [--outline outline.json]');
}
export function gateReport(doc, castNames=null, production=null) {
  if (!doc || typeof doc !== 'object') return [check('asset-contract','资产字段、ID 与引用','fail','art.json 不是对象')];
  const structural=[...stageErrors(doc),...validateVisualArt(designDocument(doc),castNames,production,false)];
  // Cross-design references may legitimately point at an identity-only asset.
  const cross=structural.filter(e=>!e.includes('relatedScenes 里的'));
  for(const a of assetsOf(doc))for(const id of Array.isArray(a?.relatedScenes)?a.relatedScenes:[])if(!doc.scenes?.some(s=>s?.id===id))cross.push(`${a.id} relatedScenes 里的 ${id} 不存在`);
  const visual=visualGateReport(designDocument(doc),castNames,production).filter(g=>g.id!=='asset-contract');
  for(const g of visual)if(g.id==='variants'){const bad=stageErrors(doc).filter(e=>e.includes('变体'));g.status=bad.length?'fail':'pass';g.detail=bad.join('；');}
  return [check('asset-contract','资产字段、ID 与引用',cross.length?'fail':'pass',cross.join('；')),...visual,...budgetChecks(doc)];
}
export function validateArt(doc, castNames=null, production=null, includeGates=true) {
  if(!doc||typeof doc!=='object')return ['art.json 不是对象'];
  if(includeGates)return gateReport(doc,castNames,production).filter(blocking).map(g=>`${g.label}：${g.detail}`);
  return [...stageErrors(doc),...validateVisualArt(designDocument(doc),castNames,production,false)];
}
// Rendering tolerates identity-only records; defaults are display-only and never exported.
function displayDocument(doc) {
  const copy=structuredClone(doc);
  for(const a of assetsOf(copy)) {a.anchors??=[];a.lighting??=[];a.states??=[];a.image??={prompt:'',negativePrompt:'',sheet:'',tags:[]};a.image.tags??=[];}
  return copy;
}
const boundaryContexts = new WeakMap();
function stageSummary(doc) {
  return {schemaVersion:doc.schemaVersion,kind:doc.kind,mode:doc.mode,status:doc.status,
    jointReconciliation:'skipped',contentReview:'not-performed',interfaceChecks:boundaryContexts.get(doc)??{outline:{status:'skipped'},characters:{status:'skipped'},originals:{status:'skipped',detail:'内存渲染未读取实际原件'}},provenance:doc.provenance,
    sourceIdentity:sourceIdentity(doc),budgets:doc.budgets,registry:doc.registry,incremental:doc.incremental,
    identities:assetsOf(doc).map(a=>({id:a.id,identityKey:a.identityKey,decision:a.decision,sourceRefs:a.sourceRefs,facts:a.facts,identityReview:a.identityReview,designStatus:a.designStatus,carrierRefs:a.carrierRefs}))};
}

/** 从 cast.json 提取名字 + 别名，给「提示词不含角色名」那道门用。 */
export function castNamesOf(cast) {
  const chars = Array.isArray(cast) ? cast : (cast?.characters ?? []);
  const names = [];
  for (const c of chars) {
    if (thText(c?.name)) names.push(c.name.trim());
    for (const a of c?.aliases ?? []) if (thText(a)) names.push(a.trim()); else if (thText(a?.name)) names.push(a.name.trim());
  }
  return [...new Set(names)];
}

/* ------------------------------------------------------------------ */
/* render — 界面文案                                                    */
/* ------------------------------------------------------------------ */
/*
 * 内置 zh / en 两套，全部收在这张表里；zh 是基准，en 术语与 README.en.md 对齐。
 * 只有报告界面走这张表——质量门文案、CLI 输出、art.json 里的数据都不在此列。
 */

/* 门标签与「跳过」提示的英文映射：质量门面板是报告的一部分，出英文报告时
 * 这里做展示层翻译——gateReport 的逻辑与中文诊断文案一行不动（CLI 仍是中文）。
 * 动态阈值由门自己算，映射里只写固定语义；未命中的 id 回落到原标签。 */
const GATE_LABELS_EN = {
  'asset-contract': 'Asset fields, IDs and references',
  'production-contract': 'Complete visual text and image production parameters',
  'anchors': 'Consistency anchors, {0}–{1} per asset',
  'lighting': 'At least one lighting state, written out as a prompt',
  'no-people': 'No people in scene plates: negatives ban people',
  'scene-layout': 'Scene sheets are a four-direction grid plus an orthographic plan',
  'lighting-kelvin': 'Lighting locks state a colour temperature in kelvin',
  'sheet-purity': 'Sheet prompts end with the clean-image-quality paragraph',
  'english': 'All image prompts in English',
  'no-names': 'Prompts carry no character names',
  'variants': 'Variant references complete (variantOf exists and carries changes)',
  'style-match': 'Art style used as one whole block (render sentence and negatives)',
  'prop-states': 'At least one prop state, written out as a prompt',
  'prop-scale': 'Size-reference tier for the prop scale written into the sheet',
  'prop-size-ref': 'Prop sheet right panel is an anonymous size reference with actual size',
  'prop-white': 'Prop sheets on pure white background, cut-out ready',
  'sheet-aspect': 'Sheet layout aspect matches the production parameters',
};
const GATE_SKIPS_EN = {
    '没有道具，不适用': 'No props — not applicable',
    '没有场景设计，不适用': 'No scene designs — not applicable',
    '未提供 outline.json，本门跳过': 'outline.json not provided — gate skipped',
    '未提供 art.json，本门跳过': 'art.json not provided — gate skipped',
    '未提供 script.json，本门跳过': 'script.json not provided — gate skipped',
    '未提供 outline/cast，本门跳过': 'outline/cast not provided — gate skipped',
    '未提供 cast.json，本门跳过': 'cast.json not provided — gate skipped',
    [SKIP_PROD]: `no ${PRODUCTION_FILE} found (up to ${PRODUCTION_DEPTH} levels up) — gate skipped; run /mint-setup to open it`,
    [SKIP_STYLE]: `style.scene is empty in ${PRODUCTION_FILE} — invalid upstream; fill it in before continuing`,
};
/** 报告里的门文案：英文界面取映射，未命中或中文界面回落原文。 */
const gateText = (g, lang) => {
  if (lang !== 'en') return { label: g.label, detail: g.detail };
  const en = GATE_LABELS_EN[g.id];
  // 阈值仍由门自己算：把中文标签里出现的数字按序填进 {0} {1}
  const nums = String(g.label).match(/\d+(?:\.\d+)?/g) ?? [];
  const label = en ? en.replace(/\{(\d)\}/g, (m, i) => nums[Number(i)] ?? m) : g.label;
  return { label, detail: GATE_SKIPS_EN[g.detail] ?? g.detail };
};

const I18N = {
  zh: {
    langCode: 'zh',
    kicker: '美术设定集',
    docTitle: (s) => `${s} · 美术设定集`,
    styleLine: (production) => `画风：${styleLabelOf(production, 'zh')}`,
    exportJson: '导出 JSON',
    gates: '质量门',
    gatesPass: '全部通过',
    gatesFail: (n) => `${n} 项未过`,
    gatePill: (okN, total) => `质量门 ${okN} / ${total}`,
    kpi: {
      scenes: '场景', scenesSub: (p2, v) => `主场景 ${p2}${v ? ` · 变体 ${v}` : ''}`,
      propsK: '叙事道具', propsSub: (st) => `${st} 个状态变体`,
      anchors: '一致性锚点', anchorsSub: '生成镜头的核对表（场景 + 道具）',
      lighting: '光照状态', lightingSub: '换时段 = 重新生成',
    },
    secList: '场景清单',
    secCards: '场景设定卡',
    secPropList: '道具清单',
    secPropCards: '道具设定卡',
    secGates: '质量门',
    propListCols: ['ID', '道具', '尺度', '状态', '关联场景', '出现集', '锚点'],
    statesTitle: '状态变体',
    scaleLabel: '尺度',
    relatedScenesLabel: '关联场景',
    propSheetCaption: '正面＋最易认错的一面＋尺寸参照 · 纯白背景',
    listCols: ['ID', '场景', '类型', '出现集', '锚点', '光照', '变体'],
    primaryScene: '主场景', onceScene: '一次性', variantScene: '变体',
    anchorsTitle: '一致性锚点',
    anchorsHint: '每次生成都必须出现的特征——认场景靠它，QC 也靠它',
    lightingTitle: '光照与时段',
    usageTitle: '出现集',
    beatsTitle: '关联关键事件',
    sceneBeatsTitle: '出现集中的关键事件（非场景落点认领）',
    variantTitle: '变体来源',
    variantChanges: '改动',
    promptsTitle: '出图提示词包',
    promptMaster: '单张展示 EN',
    promptNegative: '反向提示词',
    promptSheet: '设定图 EN',
    copy: '复制', copied: '已复制', copyFailed: '复制失败', copyJson: '复制整个场景 JSON',
    noImage: '尚未出图',
    noImageHint: '使用下方提示词生成',
    zoomImage: '放大查看',
    closeImage: '关闭',
    sheetCaption: '前后左右四宫格＋正交平面图',
    none: '—',
    listSep: '、',
    pairSep: '　',
    colon: '：',
    colophon: '设定与提示词由模型依据大纲/原文生成，质量门由脚本确定性检查。场景参考图一律无人——人是另一层资产；道具参考图纯白背景，右格的手或人只是匿名尺寸参照。',
  },
  en: {
    langCode: 'en',
    kicker: 'Art Bible',
    docTitle: (s) => `${s} · Art Bible`,
    styleLine: (production) => `Style: ${styleLabelOf(production, 'en')}`,
    exportJson: 'Export JSON',
    gates: 'Quality gates',
    gatesPass: 'All passed',
    gatesFail: (n) => `${n} gate${n === 1 ? '' : 's'} failed`,
    gatePill: (okN, total) => `Quality gates ${okN} / ${total}`,
    kpi: {
      scenes: 'Scenes', scenesSub: (p2, v) => `${p2} primary${v ? ` · ${v} variant${v === 1 ? '' : 's'}` : ''}`,
      propsK: 'Narrative props', propsSub: (st) => `${st} state variant${st === 1 ? '' : 's'}`,
      anchors: 'Consistency anchors', anchorsSub: 'The checklist for generated shots (scenes + props)',
      lighting: 'Lighting states', lightingSub: 'A time-of-day change is a regeneration',
    },
    secList: 'Scene list',
    secCards: 'Scene sheets',
    secPropList: 'Prop list',
    secPropCards: 'Prop sheets',
    secGates: 'Quality gates',
    propListCols: ['ID', 'Prop', 'Scale', 'States', 'Related scenes', 'Episodes', 'Anchors'],
    statesTitle: 'Prop states',
    scaleLabel: 'Scale',
    relatedScenesLabel: 'Related scenes',
    propSheetCaption: 'Front + most-misread view + size reference · pure white background',
    listCols: ['ID', 'Scene', 'Type', 'Episodes', 'Anchors', 'Lighting', 'Variant'],
    primaryScene: 'Primary', onceScene: 'One-off', variantScene: 'Variant',
    anchorsTitle: 'Consistency anchors',
    anchorsHint: 'Features that must appear in every generation — viewers recognize the place by them, and QC checks against them',
    lightingTitle: 'Lighting states',
    usageTitle: 'Episodes',
    beatsTitle: 'Linked key events',
    sceneBeatsTitle: 'Key events in used episodes (not scene placement claims)',
    variantTitle: 'Variant of',
    variantChanges: 'Changes',
    promptsTitle: 'Prompt pack',
    promptMaster: 'Single view (EN)',
    promptNegative: 'Negative prompt',
    promptSheet: 'Sheet (EN)',
    copy: 'Copy', copied: 'Copied', copyFailed: 'Copy failed', copyJson: 'Copy full JSON',
    noImage: 'no image yet',
    noImageHint: 'generate with the prompts below',
    zoomImage: 'Click to zoom',
    closeImage: 'Close',
    sheetCaption: 'Four-direction grid + orthographic plan',
    none: '—',
    listSep: ', ',
    pairSep: ' · ',
    colon: ': ',
    colophon: 'Designs and prompts are model-generated from the outline/source text; quality gates are checked deterministically by the script. Scene plates never contain people — characters are a separate asset layer; prop plates sit on a pure white background, and the hand or person in the right panel is only an anonymous size reference.',
  },
};

const tOf = (lang) => {
  if (lang && !I18N[lang]) throw new Error('报告界面语言目前内置 zh / en');
  return I18N[lang ?? 'zh'];
};

/* ------------------------------------------------------------------ */
/* render — markdown                                                   */
/* ------------------------------------------------------------------ */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const mdRow = (cells) => `| ${cells.map((c) => String(c ?? '').replace(/\|/g, '\\|')).join(' | ')} |`;
const mdHead = (cols) => [mdRow(cols), mdRow(cols.map(() => '---'))].join('\n');

export function renderMarkdown(doc, lang = null, production = null, castNames = null) {
  const original = doc;
  doc = displayDocument(doc);
  const t = tOf(langOf(doc, lang, production));
  const props = doc.props ?? [];
  const out = [`# ${t.docTitle(doc.source)}`, '', `> ${t.styleLine(production)}`, ''];
  const background = creativeBackground(production);
  if (background) out.push(`> ${t.langCode === 'en' ? 'Creative brief' : '创作要求'}: ${JSON.stringify(background)}`, '');

  out.push('## Stage / 阶段身份与来源', '', '```json', JSON.stringify(stageSummary(original),null,2), '```', '');
  out.push(`## ${t.secList}`, '', mdHead(t.listCols));
  for (const s of doc.scenes) {
    const type = s.variantOf ? `${t.variantScene} ← ${s.variantOf}` : s.primary ? t.primaryScene : t.onceScene;
    out.push(mdRow([
      s.id, s.name, type, s.usage?.episodes?.join(t.listSep) ?? t.none,
      s.anchors.length, s.lighting.map((l) => l.state).join(t.listSep),
      s.changes ?? t.none,
    ]));
  }
  out.push('');

  for (const s of doc.scenes) {
    out.push('---', '', `## ${s.id} ${s.name}`, '', s.summary, '');
    if (s.sheetImage) out.push(`![${s.name} ${t.sheetCaption}](${s.sheetImage})`, '');
    out.push(`### ${t.anchorsTitle}`, '');
    s.anchors.forEach((a, i) => out.push(`${i + 1}. **${a.name}** — ${a.desc}`));
    out.push('', `### ${t.lightingTitle}`, '');
    for (const l of s.lighting) out.push(`- **${l.state}**${t.colon}\`${l.prompt}\``);
    out.push('');
    if (s.variantOf) out.push(`> ${t.variantTitle}${t.colon}${s.variantOf}${t.pairSep}${t.variantChanges}${t.colon}${s.changes}`, '');
    out.push(`### ${t.promptsTitle}`, '');
    out.push(`**${t.promptMaster}**`, '', '```text', s.image.prompt, '```', '');
    out.push(`**${t.promptNegative}**`, '', '```text', s.image.negativePrompt, '```', '');
    out.push(`**${t.promptSheet}**`, '', '```text', s.image.sheet, '```', '');
    if (s.image.tags.length) out.push(`\`${s.image.tags.join('`, `')}\``, '');
  }

  if (props.length) {
    out.push('---', '', `## ${t.secPropList}`, '', mdHead(t.propListCols));
    for (const pr of props) {
      out.push(mdRow([
        pr.id, pr.name, pr.scale, pr.states.map((st) => st.state).join(t.listSep),
        (pr.relatedScenes ?? []).join(t.listSep) || t.none,
        pr.usage?.episodes?.join(t.listSep) ?? t.none, pr.anchors.length,
      ]));
    }
    out.push('');
    for (const pr of props) {
      out.push('---', '', `## ${pr.id} ${pr.name}`, '', pr.summary, '');
      if (pr.usage?.beatIds?.length) out.push(`${t.beatsTitle}: ${pr.usage.beatIds.join(' · ')}`, '');
      if (pr.sheetImage) out.push(`![${pr.name} ${t.propSheetCaption}](${pr.sheetImage})`, '');
      out.push(`### ${t.anchorsTitle}`, '');
      pr.anchors.forEach((a, i) => out.push(`${i + 1}. **${a.name}** — ${a.desc}`));
      out.push('', `### ${t.statesTitle}`, '');
      for (const st of pr.states) {
        out.push(`- **${st.state}**${t.colon}\`${st.prompt}\``);
        if (st.sheetImage) out.push('', `  ![${pr.name} ${st.state}](${st.sheetImage})`, '');
      }
      out.push('');
      out.push(`### ${t.promptsTitle}`, '');
      out.push(`**${t.promptMaster}**`, '', '```text', pr.image.prompt, '```', '');
      out.push(`**${t.promptNegative}**`, '', '```text', pr.image.negativePrompt, '```', '');
      out.push(`**${t.promptSheet}**`, '', '```text', pr.image.sheet, '```', '');
    }
  }

  out.push('', `## ${t.secGates}`, '');
  for (const g of gateReport(original, castNames, production)) {
    const shown = gateText(g, t.langCode);
    out.push(`- ${mark(g)} ${shown.label} [${g.status}; ${g.category}; ${g.level}]${g.reason ? ` (${g.reason})` : ''}${shown.detail ? ` — ${shown.detail}` : ''}`);
  }
  out.push('', t.langCode === 'en' ? 'Content review: not performed.' : '内容评审：未执行。');
  return out.join('\n');
}

/* ------------------------------------------------------------------ */
/* render — html                                                       */
/* ------------------------------------------------------------------ */
/*
 * 与另外两份报告同一套视觉语言：冷灰印张 + 铁锈红印记，1600 宽，
 * 全部平铺可 Cmd+F，零外部依赖。设计约定见 references/report-style.md。
 */

function embedDoc(doc) {
  return JSON.stringify(doc).replace(/</g, '\\u003c');
}

export function renderHtml(doc, lang = null, production = null, castNames = null, originalInput = doc) {
  const reportInput = doc;
  doc = displayDocument(doc);
  const code = langOf(doc, lang, production);
  const t = tOf(code);
  const background = creativeBackground(production);
  const gates = gateReport(reportInput, castNames, production);
  const failed = gates.filter(blocking);
  const scenes = doc.scenes;
  const props = doc.props ?? [];
  const primaryN = scenes.filter((s) => s.primary).length;
  const variantN = scenes.filter((s) => s.variantOf).length;
  const anchorN = [...scenes, ...props].reduce((n, s) => n + s.anchors.length, 0);
  const lightN = scenes.reduce((n, s) => n + s.lighting.length, 0);
  const stateN = props.reduce((n, pr) => n + pr.states.length, 0);

  const table = (cols, rows) =>
    `<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n')}</tbody></table>`;

  const promptRow = (label, value) =>
    !value
      ? ''
      : `<details class="pr">
  <summary><span>${esc(label)}</span><button class="copy" data-copy="${esc(value)}">${esc(t.copy)}</button></summary>
  <p>${esc(value)}</p>
</details>`;

  const listRows = scenes.map((s) => [
    esc(s.id), esc(s.name),
    esc(s.variantOf ? `${t.variantScene} ← ${s.variantOf}` : s.primary ? t.primaryScene : t.onceScene),
    esc(s.usage?.episodes?.join(t.listSep) ?? t.none),
    String(s.anchors.length),
    esc(s.lighting.map((l) => l.state).join(t.listSep)),
    esc(s.changes ?? t.none),
  ]);

  const propListRows = props.map((pr) => [
    esc(pr.id), esc(pr.name), esc(pr.scale), esc(pr.states.map((st) => st.state).join(t.listSep)),
    esc((pr.relatedScenes ?? []).join(t.listSep) || t.none),
    esc(pr.usage?.episodes?.join(t.listSep) ?? t.none), String(pr.anchors.length),
  ]);

  const propCards = props
    .map((pr) => {
      const plate = pr.sheetImage
        ? `<figure class="plate">
  <button class="zoom" data-src="${esc(pr.sheetImage)}" aria-label="${esc(t.zoomImage)}">
    <img src="${esc(pr.sheetImage)}" alt="${esc(pr.name)} ${esc(t.propSheetCaption)}" loading="lazy">
  </button>
  <figcaption>${esc(t.propSheetCaption)}</figcaption>
</figure>`
        : `<div class="plate plate-empty"><span>${esc(pr.name)} · ${esc(t.noImage)}<br><em>${esc(pr.designStatus==='none'?(code==='en'?'Identity only; no image required':'仅登记身份，不要求出图'):t.noImageHint)}</em></span></div>`;
      return `<article class="scene" id="pr-${slug(pr.id)}">
  <header class="sc-h">
    <span class="sc-id">${esc(pr.id)}</span>
    <h3>${esc(pr.name)}</h3>
    <span class="badge">${esc(pr.scale)}</span>
     ${pr.usage?.episodes?.length ? `<span class="sc-use">${esc(t.usageTitle)} ${esc(pr.usage.episodes.join(t.listSep))}${pr.usage.beats?.length ? `${esc(t.pairSep)}${esc(t.beatsTitle)} ${esc(pr.usage.beats.join(' · '))}${pr.usage.beatIds?.length ? ` (${esc(pr.usage.beatIds.join(' · '))})` : ''}` : ''}</span>` : ''}
  </header>
  <p class="sc-sum">${esc(pr.summary)}</p>
  ${plate}
  ${(pr.relatedScenes ?? []).length ? `<p class="variant">${esc(t.relatedScenesLabel)}${esc(t.colon)}<b>${esc(pr.relatedScenes.join(t.listSep))}</b></p>` : ''}
  <section class="blk">
    <h4>${esc(t.anchorsTitle)}<small>${esc(t.anchorsHint)}</small></h4>
    <ol class="anchors">${pr.anchors.map((a) => `<li><b>${esc(a.name)}</b><span>${esc(a.desc)}</span></li>`).join('')}</ol>
  </section>
  <section class="blk">
    <h4>${esc(t.statesTitle)}</h4>
    <div class="lights">${pr.states.map((st) => `<div class="light"><i>${esc(st.state)}</i><span class="mono">${esc(st.prompt)}</span><button class="copy mini" data-copy="${esc(st.prompt)}">${esc(t.copy)}</button></div>${st.sheetImage ? `<figure class="plate"><button class="zoom" data-src="${esc(st.sheetImage)}" aria-label="${esc(t.zoomImage)}"><img src="${esc(st.sheetImage)}" alt="${esc(pr.name)} ${esc(st.state)}" loading="lazy"></button><figcaption>${esc(st.state)}</figcaption></figure>` : ''}`).join('')}</div>
  </section>
  <div class="pgroup">
    ${promptRow(t.promptMaster, pr.image.prompt)}
    ${promptRow(t.promptSheet, pr.image.sheet)}
    ${promptRow(t.promptNegative, pr.image.negativePrompt)}
    <div class="pgroup-f"><button class="copy wide" data-copy="${esc(JSON.stringify(pr, null, 2))}">${esc(t.copyJson)}</button></div>
  </div>
</article>`;
    })
    .join('\n');

  const cards = scenes
    .map((s) => {
      const plate = s.sheetImage
        ? `<figure class="plate">
  <button class="zoom" data-src="${esc(s.sheetImage)}" aria-label="${esc(t.zoomImage)}">
    <img src="${esc(s.sheetImage)}" alt="${esc(s.name)} ${esc(t.sheetCaption)}" loading="lazy">
  </button>
  <figcaption>${esc(t.sheetCaption)}</figcaption>
</figure>`
        : `<div class="plate plate-empty"><span>${esc(s.name)} · ${esc(t.noImage)}<br><em>${esc(s.designStatus==='none'?(code==='en'?'Identity only; no image required':'仅登记身份，不要求出图'):t.noImageHint)}</em></span></div>`;
      return `<article class="scene" id="sc-${slug(s.id)}">
  <header class="sc-h">
    <span class="sc-id">${esc(s.id)}</span>
    <h3>${esc(s.name)}</h3>
    <span class="badge${s.primary ? '' : ' once'}">${esc(s.variantOf ? t.variantScene : s.primary ? t.primaryScene : t.onceScene)}</span>
     ${s.usage?.episodes?.length ? `<span class="sc-use">${esc(t.usageTitle)} ${esc(s.usage.episodes.join(t.listSep))}${s.usage.beats?.length ? `${esc(t.pairSep)}${esc(t.sceneBeatsTitle)} ${esc(s.usage.beats.join(' · '))}` : ''}</span>` : ''}
  </header>
  <p class="sc-sum">${esc(s.summary)}</p>
  ${plate}
  ${s.variantOf ? `<p class="variant">${esc(t.variantTitle)}${esc(t.colon)}<b>${esc(s.variantOf)}</b>${esc(t.pairSep)}${esc(t.variantChanges)}${esc(t.colon)}${esc(s.changes)}</p>` : ''}
  <section class="blk">
    <h4>${esc(t.anchorsTitle)}<small>${esc(t.anchorsHint)}</small></h4>
    <ol class="anchors">${s.anchors.map((a) => `<li><b>${esc(a.name)}</b><span>${esc(a.desc)}</span></li>`).join('')}</ol>
  </section>
  <section class="blk">
    <h4>${esc(t.lightingTitle)}</h4>
    <div class="lights">${s.lighting.map((l) => `<div class="light"><i>${esc(l.state)}</i><span class="mono">${esc(l.prompt)}</span><button class="copy mini" data-copy="${esc(l.prompt)}">${esc(t.copy)}</button></div>`).join('')}</div>
  </section>
  <div class="pgroup">
    ${promptRow(t.promptMaster, s.image.prompt)}
    ${promptRow(t.promptSheet, s.image.sheet)}
    ${promptRow(t.promptNegative, s.image.negativePrompt)}
    <div class="pgroup-f"><button class="copy wide" data-copy="${esc(JSON.stringify(s, null, 2))}">${esc(t.copyJson)}</button></div>
  </div>
</article>`;
    })
    .join('\n');

  const gateList = `<details open><summary>Stage / 阶段身份与来源（身份登记不要求出图）</summary><pre>${esc(JSON.stringify(stageSummary(reportInput), null, 2))}</pre></details><ul class="gate">
  ${gates
    .map(
      (g) => `<li class="${g.status}"><span class="m">${mark(g)}</span><span>${esc(gateText(g, t.langCode).label)}${
        // 失败详情要显示；跳过语也要显示——「跳过」不写出来就成了静默通过
        g.detail && (g.status !== 'pass' || g.id === 'no-names' || g.detail === SKIP_PROD)
          ? `<small>${esc(gateText(g, t.langCode).detail)}</small>`
          : ''
      }</span></li>`,
    )
    .join('\n  ')}
</ul>`;

  return `<!doctype html>
<html lang="${code}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t.docTitle(doc.source))}</title>
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
h1,h2,h3,h4{margin:0;font-weight:400}

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
@media(max-width:900px){.kpis{grid-template-columns:repeat(2,1fr)}}
.kpi{background:var(--panel);border:1px solid var(--rule);border-radius:2px;padding:11px 14px 9px}
.kpi .l{font:500 10px/1 var(--sans);letter-spacing:.18em;color:var(--ink-3)}
.kpi .v{font:400 28px/1.15 var(--serif);margin-top:5px}
.kpi .d{font-size:11px;color:var(--ink-2);margin-top:1px}
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

table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--rule);font-size:13px}
th,td{padding:8px 12px;border-bottom:1px solid var(--rule);text-align:left;vertical-align:top}
th{font:500 11px/1 var(--sans);letter-spacing:.1em;color:var(--ink-3);background:var(--side)}
tr:last-child td{border-bottom:0}
td:first-child{font-family:var(--mono);font-size:12px;color:var(--ink-2);white-space:nowrap}
.mono{font:400 11.5px/1.7 var(--mono);color:var(--ink-2);word-break:break-word}

/* 场景设定卡：一排两张（方便截图宣传），卡内纵排、设定图占满卡宽 */
.cards{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}
@media(max-width:1100px){.cards{grid-template-columns:1fr}}
.scene{background:var(--panel);border:1px solid var(--rule);border-radius:2px;padding:18px 20px}
.sc-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--rule-2);padding-bottom:10px}
.sc-id{font:500 12px/1 var(--mono);color:var(--seal)}
.sc-h h3{font:400 20px/1.2 var(--serif);letter-spacing:.04em}
.badge{font:500 10.5px/1 var(--sans);padding:2px 8px;border-radius:99px;border:1px solid var(--seal);color:var(--seal)}
.badge.once{border-color:var(--seal-2);color:var(--seal-2)}
.sc-use{margin-left:auto;font-size:12px;color:var(--ink-2)}
.sc-sum{margin:10px 0 12px;font:400 14.5px/1.9 var(--serif)}
.scene .blk{margin-top:16px}
.scene .pgroup{margin-top:16px}

.plate{margin:0;background:#fff;border:1px solid var(--rule-2);border-radius:2px;overflow:hidden}
.plate .zoom{display:block;width:100%;padding:0;border:0;background:none;cursor:zoom-in}
.plate .zoom:focus-visible{outline:2px solid var(--seal);outline-offset:-2px}
.plate img{display:block;width:100%;height:auto}
/* 图片弹层 */
.lightbox{position:fixed;inset:0;z-index:50;display:none;place-items:center;
  background:#191d21e6;padding:32px;cursor:zoom-out}
.lightbox.on{display:grid}
.lightbox img{max-width:100%;max-height:100%;background:#fff;border-radius:2px;
  box-shadow:0 8px 40px #0006}
.lightbox-x{position:absolute;top:18px;right:22px;font:500 13px/1 var(--sans);color:#fff;
  background:none;border:1px solid #fff6;border-radius:3px;padding:8px 12px;cursor:pointer}
.lightbox-x:hover{border-color:#fff}
.plate figcaption{font-size:11px;letter-spacing:.08em;color:var(--ink-3);padding:6px 10px;border-top:1px solid var(--rule)}
.plate-empty{display:grid;place-items:center;min-height:180px;text-align:center;
  border:1px dashed var(--rule-2);background:var(--paper);color:var(--ink-3);font-size:13px}
.plate-empty em{font-style:normal;font-size:12px;opacity:.8}
.variant{margin:10px 0 0;font-size:12.5px;color:var(--seal);background:var(--seal-soft);padding:7px 10px;border-radius:2px}
.variant b{font-family:var(--mono);font-weight:500}

.blk{margin-bottom:16px}
.blk h4{font:500 11px/1.6 var(--sans);letter-spacing:.18em;color:var(--seal);margin-bottom:8px}
.blk h4 small{display:block;letter-spacing:0;font-weight:400;color:var(--ink-3);font-size:11px}
.anchors{margin:0;padding:0 0 0 2px;list-style:none;counter-reset:an}
/* ::before 序号也是网格项，desc 必须显式钉在第二列，否则会掉进 22px 窄列一字一行 */
.anchors li{counter-increment:an;display:grid;grid-template-columns:22px minmax(0,1fr);column-gap:8px;
  padding:6px 0;border-top:1px solid var(--rule);font-size:13px}
.anchors li:first-child{border-top:0}
.anchors li::before{content:counter(an,decimal-leading-zero);grid-column:1;grid-row:1;
  font:500 11px/1.9 var(--mono);color:var(--seal)}
.anchors b{grid-column:2;font-weight:500}
.anchors span{grid-column:2;display:block;font-size:12px;color:var(--ink-2)}
.lights{display:flex;flex-direction:column;gap:6px}
.light{display:flex;align-items:baseline;gap:10px;background:var(--paper);border:1px solid var(--rule);
  border-radius:2px;padding:7px 10px}
.light i{flex:none;font-style:normal;font:500 12px/1.6 var(--sans);color:var(--ink)}
.light .mono{flex:1;min-width:0}

.pgroup{border:1px solid var(--rule);border-radius:2px;background:var(--paper);padding:4px 12px 8px;margin-top:12px}
.pr{border-bottom:1px solid var(--rule)}
.pgroup .pr:last-of-type{border-bottom:0}
.pr summary{display:flex;align-items:center;gap:10px;padding:10px 0;cursor:pointer;list-style:none;
  font:500 12px/1 var(--sans);letter-spacing:.04em}
.pr summary::-webkit-details-marker{display:none}
.pr summary::before{content:"▸";color:var(--seal);font-size:11px;transition:transform .15s}
.pr[open] summary::before{transform:rotate(90deg)}
.pr summary span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pr p{margin:0 0 10px;padding:10px 12px;background:var(--panel);border:1px solid var(--rule);
  border-radius:2px;font:400 12px/1.75 var(--mono);white-space:pre-wrap;word-break:break-word}
.pgroup-f{padding:10px 0 4px}
.copy{flex:none;font:500 11px/1 var(--sans);color:var(--ink-2);background:var(--panel);
  border:1px solid var(--rule-2);border-radius:2px;padding:4px 10px;cursor:pointer;transition:.15s}
.copy:hover{border-color:var(--seal);color:var(--seal)}
.copy:focus-visible{outline:2px solid var(--seal);outline-offset:2px}
.copy[data-done]{border-color:var(--seal);color:var(--seal)}
.copy.wide{width:100%;padding:9px}
.copy.mini{padding:2px 7px;font-size:10.5px}

.gate{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:2px 28px}
@media(max-width:900px){.gate{grid-template-columns:1fr}}
.gate li{display:flex;gap:8px;padding:5px 0;font-size:12.5px;line-height:1.55}
.gate .m{flex:none;font-weight:700}
.gate li.pass .m{color:var(--ok)}
.gate li.fail .m{color:var(--seal)}
.gate li.fail{background:var(--seal-soft);border-radius:2px;padding-left:6px}
.gate small{display:block;color:var(--ink-3)}
.gsum{margin:10px 0 0;font-size:12px;color:var(--ink-2)}
.gsum b{color:var(--seal)}

.foot{margin-top:40px;font-size:11px;color:var(--ink-3);border-top:1px solid var(--rule);padding-top:14px}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
@media print{
  .expo,.copy{display:none!important}
  .pr p{display:block!important}
  .pr summary::before{content:""}
  .page{max-width:none;padding:0}
  section.top-sec,.scene{page-break-inside:avoid}
  body{background:#fff}
}
</style></head><body>
<div class="page">

<header class="hd">
  <h1>${esc(doc.source)}</h1>
  <span class="sub">${background ? esc(JSON.stringify(background)) + " · " : ""}${esc(t.kicker)} · ${esc(t.styleLine(production))}</span>
  <span class="right">
    <span class="gatepill ${failed.length ? 'fail' : 'pass'}">${failed.length ? '✗' : '✓'} ${esc(t.gatePill(gates.filter(g => g.status === 'pass').length, gates.length))}</span>
    <button class="expo" data-name="${esc(slug(doc.source))}-art.json">${esc(t.exportJson)}</button>
  </span>
</header>

<div class="kpis">
  <div class="kpi accent"><div class="l">${esc(t.kpi.scenes)}</div><div class="v">${scenes.length}</div><div class="d">${esc(t.kpi.scenesSub(primaryN, variantN))}</div></div>
  <div class="kpi"><div class="l">${esc(t.kpi.propsK)}</div><div class="v">${props.length}</div><div class="d">${esc(t.kpi.propsSub(stateN))}</div></div>
  <div class="kpi"><div class="l">${esc(t.kpi.anchors)}</div><div class="v">${anchorN}</div><div class="d">${esc(t.kpi.anchorsSub)}</div></div>
  <div class="kpi"><div class="l">${esc(t.kpi.lighting)}</div><div class="v">${lightN}</div><div class="d">${esc(t.kpi.lightingSub)}</div></div>
</div>
${failed.length ? `<div class="galert"><b>✗ ${esc(t.gatesFail(failed.length))}</b>${failed.map((g) => `<span>${esc(gateText(g, t.langCode).label)}${g.detail ? ` — ${esc(gateText(g, t.langCode).detail)}` : ''}</span>`).join('')}</div>` : ''}

<section class="top-sec" id="sec-list">
  <div class="sec-h"><span class="no">01</span><h2>${esc(t.secList)}</h2></div>
  ${table(t.listCols, listRows)}
</section>

<section class="top-sec" id="sec-cards">
  <div class="sec-h"><span class="no">02</span><h2>${esc(t.secCards)}</h2></div>
  <div class="cards">
${cards}
  </div>
</section>

${props.length ? `<section class="top-sec" id="sec-prop-list">
  <div class="sec-h"><span class="no">03</span><h2>${esc(t.secPropList)}</h2></div>
  ${table(t.propListCols, propListRows)}
</section>

<section class="top-sec" id="sec-prop-cards">
  <div class="sec-h"><span class="no">04</span><h2>${esc(t.secPropCards)}</h2></div>
  <div class="cards">
${propCards}
  </div>
</section>` : ''}

<section class="top-sec" id="sec-gates">
  <div class="sec-h"><span class="no">${props.length ? '05' : '03'}</span><h2>${esc(t.secGates)}</h2></div>
  ${gateList}
  <p class="gsum">${failed.length ? `<b>${esc(t.gatesFail(failed.length))}</b>` : esc(code === 'en' ? 'No blocking failures.' : '无阻断失败。')} ${esc(code === 'en' ? `Skipped: ${gates.filter(g => g.status === 'skipped').length}. Content review: not performed.` : `跳过 ${gates.filter(g => g.status === 'skipped').length} 项；内容评审未执行。`)}</p>
</section>

<p class="foot">${esc(t.colophon)}</p>
</div>

<div class="lightbox" role="dialog" aria-modal="true">
  <button class="lightbox-x" aria-label="${esc(t.closeImage)}">${esc(t.closeImage)}</button>
  <img alt="">
</div>

<script type="application/json" id="art-data">${embedDoc(originalInput)}</script>
<script>
const L = ${JSON.stringify({ copied: t.copied, failed: t.copyFailed })};

// 图片弹层：点图放大，点背景或 Esc 关闭
const lb = document.querySelector('.lightbox');
const lbImg = lb.querySelector('img');
function closeLb() { lb.classList.remove('on'); lbImg.removeAttribute('src'); }
document.addEventListener('click', (e) => {
  const z = e.target.closest('.zoom');
  if (z) { lbImg.src = z.dataset.src; lb.classList.add('on'); return; }
  if (e.target.closest('.lightbox')) closeLb();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLb(); });

// 复制按钮
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

// 导出：报告自己带着完整的 art.json，下载的是它原样
document.querySelector('.expo').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const url = URL.createObjectURL(
    new Blob([document.getElementById('art-data').textContent], { type: 'application/json' }),
  );
  const a = Object.assign(document.createElement('a'), { href: url, download: btn.dataset.name });
  a.click();
  // 别立刻回收——Safari 会抢在下载读完之前撤掉 blob
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});
</script>
</body></html>`;
}

/* ------------------------------------------------------------------ */
/* 出图任务                                                            */
/* ------------------------------------------------------------------ */
/*
 * 出图要的东西全在 art.json 里：image.sheet 是设定图提示词、image.negativePrompt
 * 是反向词。这一层只做确定性搬运——拼出每张图该落到哪个文件、认出哪些场景是
 * 变体（要拿母场景成图当参考图）、把生产参数原样带上。
 *
 * model / resolution / aspect_ratio 三个值原样进 --input_data，不折算像素、
 * 提示词里也不写像素。它们在 production.json 里已经被 mint-setup 的能力表
 * 校验过一遍，**这里不再维护第二份枚举表**——同一张表存两份必漂。
 */

/** 产物路径与 render 找图的路径必须是同一个函数算出来的，不许两边各写一遍。 */
export const sheetFile = (name) => `images/${slug(name)}-sheet.png`;
export const cutoutFile = (name) => `images/${slug(name)}-sheet-cutout.png`;
/** 道具状态变体：states[n]（n ≥ 1）落到序号 n+1，任务 ID 为 `<道具 ID>.s<序号>`。 */
export const stateSheetFile = (stem, n) => `images/${stem}-state${n}-sheet.png`;
export const stateJobKey = (id, n) => `${id}.s${n}`;
export function assetImageStem(item, doc) {
  if (item.imageStem) return item.imageStem;
  const stem=slug(item.name), items=[...(doc.scenes ?? []),...(doc.props ?? [])];
  return items.filter(x=>slug(x.name)===stem).length>1 ? `${item.id}-${stem}` : stem;
}

export function imageJobsFrom(doc, production = null) {
  const model = production?.image?.model ?? null;
  const inputBase = {
    aspect_ratio: production?.image?.asset?.aspectRatio ?? null,
    resolution: production?.image?.asset?.resolution ?? null,
  };
  const problems = production == null ? ['出图需要显式 production 视觉正文与制作参数，不使用隐式默认值'] : validateArt(doc, null, production);
  const jobs = [];
  const scenes = Array.isArray(doc?.scenes) ? doc.scenes : [];
  const props = Array.isArray(doc?.props) ? doc.props : [];
  const sceneIds = new Set(scenes.map((s) => s?.id));

  const take = (item, kind) => {
    const prompt = item?.image?.sheet;
    if (!thText(prompt)) {
      problems.push(`${item?.id ?? '?'}「${item?.name ?? ''}」的 image.sheet 是空的——提示词是模型的活，先填上再出图`);
      return null;
    }
    return {
      key: item.id,
      kind,
      name: item.name,
      file: item.sheetImage ?? sheetFile(assetImageStem(item,doc)),
      inputDigest: digest({asset:item,identityInputDigest:identityDigest(doc,item),referenceAsset:item.variantOf?doc.scenes.find(s=>s.id===item.variantOf):undefined}),
      prompt: String(prompt),
      negativePrompt: String(item?.image?.negativePrompt ?? ''),
      refFrom: null,
    };
  };

  for (const s of scenes.filter(s=>s?.designStatus==='ready')) {
    const job = take(s, 'scene');
    if (!job) continue;
    // 变体拿母场景的成图当参考图；交接计划按依赖排序，执行方先完成母场景。
    if (thText(s?.variantOf)) {
      if (sceneIds.has(s.variantOf) && scenes.some(p=>p.id===s.variantOf && p.designStatus==='ready')) job.refFrom = s.variantOf;
      else problems.push(`场景 ${s.id} 的 variantOf 指向不存在的 ${s.variantOf}`);
    }
    jobs.push(job);
  }
  for (const pr of props.filter(p=>p?.designStatus==='ready')) {
    const job = take(pr, 'prop');
    if (!job) continue;
    jobs.push({ ...job, cutoutFile: cutoutFile(assetImageStem(pr,doc)) });
    // states[0] 是基准设定图画的状态；之后每个状态是一张以基准图为参考的变体
    (Array.isArray(pr.states) ? pr.states : []).slice(1).forEach((st, i) => {
      const n = i + 2;
      if (!thText(st?.prompt)) {
        problems.push(`${pr.id}「${pr.name ?? ''}」的状态「${st?.state ?? n}」prompt 是空的——变体提示词是模型的活，先填上再出图`);
        return;
      }
      jobs.push({
        key: stateJobKey(pr.id, n),
        kind: 'prop-state',
        name: `${pr.name} · ${st.state}`,
        file: stateSheetFile(assetImageStem(pr, doc), n),
        inputDigest: digest({asset:pr,state:n,identityInputDigest:identityDigest(doc,pr)}),
        prompt: String(st.prompt),
        negativePrompt: String(pr?.image?.negativePrompt ?? ''),
        refFrom: pr.id,
      });
    });
  }

  // 重名会让两张图抢同一个文件名，后出的把先出的盖掉，而且 render 只看得见一张
  const seen = new Map();
  for (const j of jobs) {
    if (seen.has(j.file)) problems.push(`${seen.get(j.file)} 与 ${j.key} 的名字算出同一个文件名 ${j.file}——改掉其中一个的 name`);
    else seen.set(j.file, j.key);
  }

  return { model, inputBase, jobs, problems };
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

const USAGE = `mint-art.mjs — mint-art skill 的确定性工具（场景 + 道具）

  seed --design --title title           独立设计空骨架（不伪造原件来源）
  seed --source path --title title [--existing art.json] [--outline outline.json] [--cast cast.json]
                                         只建 art v1 骨架，不识别地点或道具、不声明已读
  register <art.json> --kind scene|prop --key key --name name [--out new.json]
  identity-inputs <art.json>             打印身份复核摘要，不自动确认
  verify-sources <art.json>              回查实际原件、摘要、引用和范围
  reconcile <art.json> --previous old.json [--out new.json] 核验既有 ID 增量变更
  validate <art.json> [--cast c.json]    校验；有违规逐条打印并 exit 1
                                         给了 cast.json 才查「提示词不含角色名」
  checkup <art.json> [--cast c.json]     只打印质量门 ✓/✗，有未过项 exit 1
  images <art.json>          导出离线交接计划，交给 ly-image 生成
         [--only <ID列表>]                仅选择指定任务（图片自动补齐参考依赖）
         [--dry-run]                      只预览计划；本命令始终不上传、不提交
         [--out <plan.json>]              另存计划（不覆盖已有文件）
  render <art.json> [--html|--md] [--lang zh|en] [--cast cast.json]
                                         渲染报告到 stdout（默认 --md）
                                         界面语言优先级：--lang > art.json 顶层 lang 字段 > 中文
  style [--from <目录>]                   打印这部剧的画风（场景那一块）——写设定卡前先跑它
                                         画风没有内置预设，正文来自工作目录根的 production.json
  slug <name>                            场景名转安全文件名

render 按显式 sheetImage 或固定 imageStem 查找主图。
images 只导出计划，不执行生成。使用 ly-image 完成并核验图片后，放到计划 output 路径再 render。`;

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function flag(rest, name, fallback = null) {
  const i = rest.indexOf(name);
  if(i < 0) return fallback;
  if(rest.indexOf(name,i+1)>=0)throw Error(name+' 只能提供一次');
  if(!rest[i+1] || rest[i+1].startsWith('--')) throw Error(name+' 必须提供参数');
  return rest[i+1];
}

/*
 * 生产参数不用挂载，自己从产物所在目录向上找——它住在工作目录根。
 * 找得到那两道门就自动开，没有开关：画风和画幅改了都要整套重出图。
 * --no-production 是给老项目临时绕过用的，用了会明说。
 */
function loadProduction(rest, fromDir) {
  if (rest.includes('--no-production') && rest.includes('--production')) throw new Error('--production 与 --no-production 不能同时提供');
  if (rest.includes('--no-production')) return { doc: null, path: null, off: true };
  const path = flag(rest, '--production') ?? findProduction(fromDir);
  const doc = path ? readJson(path) : null;
  if (path) {
    if (doc === null) throw new Error('production 不能是 null');
    const bad = assetProductionProblems(doc, 'scene');
    if (bad.length) throw new Error(bad.join('；'));
  }
  return { doc, path, off: false };
}

/** 找到就报一声，找不到也报一声——静默是最坏的那种。 */
function announceProduction(p, docPath = null) {
  const which = '2 道门（画风、设定图画幅）与产物落点提示';
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

// validate/checkup/render share the same supplied-upstream boundary.
function loadCastNames(rest) {
  const castPath = flag(rest, '--cast');
  if (!castPath) {
    if (rest.includes('--cast')) throw new Error('--cast 必须提供文件路径');
    console.error('⚠️ 没给 --cast，跳过「提示词不含角色名」检查');
    return null;
  }
  const cast = readJson(castPath);
  assertCharacters(cast);
  return castNamesOf(cast);
}

function rebaseAllSources(doc,path) {
  for(const d of doc.provenance?.documents??[])d.path=resolve(dirname(resolve(path)),d.path);
}
function outputNew(doc,rest) {
  const out=flag(rest,'--out');const bytes=JSON.stringify(doc,null,2)+'\n';
  if(out)writeFileSync(resolve(out),bytes,{flag:'wx'});else process.stdout.write(bytes);
}
function validateUpstreams(doc,rest) {
  const checks={};
  for(const [kind,flagName] of [['outline','--outline'],['characters','--cast']]) {
    const path=flag(rest,flagName);
    if(!path){checks[kind]={status:'skipped',detail:'未提供可选上游'};console.error(`— ${kind} 对账 skipped；独立运行，不声明完整流程`);continue;}
    const upstream=readJson(path),result=upstreamCheck(doc,upstream,kind),errors=result.errors;
    errors.push(...verifySources(upstream,path).errors);
    if(errors.length)throw Error(errors.join('；'));
    checks[kind]=result;
    if(result.status==='skipped')console.error(`— ${kind} 对账 skipped；${result.detail}`);
    else console.error(`✓ ${kind} 来源与消费接口核验；语义内容未评审，未执行 script/creation 联合映射`);
  }
  return checks;
}
function verifyArtBoundary(doc,path,rest) {
  if(doc?.schemaVersion!==ART_VERSION||doc?.kind!=='mint-art')throw Error('正式 art 需要 schemaVersion:1, kind:mint-art');
  const result=verifySources(doc,path);if(result.errors.length)throw Error(result.errors.join('；'));
  boundaryContexts.set(doc,{...validateUpstreams(doc,rest),originals:result});
  if(assetsOf(doc).some(a=>a.carrierRefs?.length)&&!flag(rest,'--cast'))throw Error('实际人物关联需要 --cast 身份权威；不得按名称猜测');
  const prev=flag(rest,'--previous');if(prev){const errors=lifecycleErrors(doc,readJson(prev));if(errors.length)throw Error(errors.join('；'));}
}

async function main(argv) {
  const [cmd, ...rest] = argv;

  if (!cmd || cmd === '-h' || cmd === '--help') {
    console.log(USAGE);
    process.exit(cmd ? 0 : 1);
  }

  if (cmd === 'seed') {
    const path=flag(rest,'--source'),title=flag(rest,'--title');
    if(rest.includes('--design')) {
      if(path||!title||flag(rest,'--existing'))throw Error('seed --design 只接受 --title');
      const doc={schemaVersion:1,kind:'mint-art',mode:'design',source:title,status:'draft',scenes:[],props:[],registry:{entries:[],changes:[]},budgets:{},upstreams:{}};
      validateUpstreams(doc,rest);outputNew(doc,rest);return;
    }
    if(!path||!title)throw Error('seed 需要 --source path --title title；outline 不是资产权威');
    const existingPath=flag(rest,'--existing');let existing=existingPath?readJson(existingPath):null;const existingDigest=existing?digest(existing):null;
    if(existing) {rebaseAllSources(existing,existingPath);const bad=stageErrors(existing);if(bad.length)throw Error('既有产物必须先核验：'+bad.join('；'));/* Updated originals are re-registered below; stale review is explicitly invalidated. */}
    const doc=seedFromSource(path,title,{existing});
    if(existingDigest)doc.incremental.previousDigest=existingDigest;
    validateUpstreams(doc,rest);
    outputNew(doc,rest);return;
  }
  if(['register','identity-inputs','verify-sources','reconcile'].includes(cmd)) {
    const path=rest[0];if(!path||path.startsWith('--'))throw Error(cmd+' 需要 art.json');
    const doc=readJson(path);if(doc.schemaVersion!==ART_VERSION||doc.kind!=='mint-art')throw Error('art 需要 schemaVersion:1, kind:mint-art 才能登记和核验');
    if(cmd==='identity-inputs') {console.log(JSON.stringify(assetsOf(doc).map(a=>({id:a.id,inputDigest:identityDigest(doc,a)})),null,2));return;}
    if(cmd==='verify-sources') {const result=verifySources(doc,path);console.log(JSON.stringify(result,null,2));if(result.errors.length)process.exitCode=1;return;}
    if(cmd==='register')registerAsset(doc,flag(rest,'--kind'),flag(rest,'--key'),flag(rest,'--name'));
    if(cmd==='reconcile') {
      const prevPath=flag(rest,'--previous');if(!prevPath)throw Error('reconcile 必须提供 --previous 既有产物，不能重置生命周期');
      const previous=readJson(prevPath);
      const priorBad=stageErrors(previous);if(priorBad.length)throw Error('既有基线尚未核验：'+priorBad.join('；'));
      doc.incremental={previousDigest:digest(previous),previousRegistry:structuredClone(previous.registry),previousIdentities:assetsOf(previous).map(a=>({id:a.id,coreDigest:identityCoreDigest(a)})),previousBudgets:structuredClone(previous.budgets)};
      syncLifecycleStamps(doc);
      const bad=[...lifecycleErrors(doc,previous),...verifySources(doc,path).errors];
      if(bad.length)throw Error(bad.join('；'));
      const affected=new Set(doc.registry.changes.filter(c=>!previous.registry.changes.some(p=>p.id===c.id)).flatMap(c=>[...c.from,...c.to]));
      for(const a of assetsOf(doc)) {const old=assetsOf(previous).find(p=>p.id===a.id);if(!old||identityDigest(doc,a)!==identityDigest(previous,old)){a.identityReview={status:'pending'};affected.add(a.id);}}
      doc.incremental.recheckIds=[...affected].sort();
      doc.status='draft';
    }
    rebaseAllSources(doc,path);outputNew(doc,rest);return;
  }

  if (cmd === 'validate' || cmd === 'checkup') {
    const [path] = rest;
    if (!path) throw new Error(`用法：${cmd} <art.json> [--cast cast.json]`);
    const doc = readJson(path);
    verifyArtBoundary(doc,path,rest);
    const names = loadCastNames(rest);
    const prod = loadProduction(rest, resolve(path, '..'));
    announceProduction(prod, path);

    if (cmd === 'checkup') {
      const gates = gateReport(doc, names, prod.doc);
      for (const g of gates) console.log(`${mark(g)} ${g.label}${g.detail ? ` — ${g.detail}` : ''}`);
      const failedN = gates.filter(blocking).length;
      console.log(`\n阻断失败 ${failedN}；通过 ${gates.filter(g => g.status === 'pass').length}；跳过 ${gates.filter(g => g.status === 'skipped').length}；内容未评审`);
      if (failedN) process.exit(1);
      return;
    }

    const problems = validateArt(doc, names, prod.doc);
    if (problems.length) {
      console.error(`✗ ${problems.length} 处违规：\n`);
      for (const x of problems) console.error('  ' + x);
      process.exit(1);
    }
    console.log(`✓ ${doc.scenes.length} 个场景${(doc.props ?? []).length ? ` + ${doc.props.length} 件道具` : ''}无阻断失败（跳过 ${gateReport(doc, names, prod.doc).filter(g => g.status === 'skipped').length} 项，内容未评审；画风 ${prod.doc ? styleLabelOf(prod.doc) : '未挂载'}）`);
    return;
  }

  if (cmd === 'images') {
    checkPlanFlags(rest);
    const [path] = rest;
    if (!path) throw new Error('用法：images <art.json> [--only ids] [--dry-run] [--out plan.json]');
    const doc = readJson(path);
    verifyArtBoundary(doc,path,rest);
    const outDir = resolve(path, '..');
    const prod = loadProduction(rest, outDir);
    announceProduction(prod, path);

    const { model, inputBase, jobs, problems } = imageJobsFrom(doc, prod.doc);
    // **提交之前失败**：提示词缺了、变体指错了、两个名字撞成同一个文件名——
    // 这些在网关那边发现要么白花钱，要么出完才发现少一张
    if (problems.length) {
      console.error(`✗ ${problems.length} 处挡住了出图：\n`);
      for (const x of problems) console.error('  ' + x);
      process.exit(1);
    }
    if (!prod.doc) console.error(`⚠️ 没有生产参数，按 ${model} + ${inputBase.resolution} + ${inputBase.aspect_ratio} 出——汇报里要说清`);

    const only = flag(rest, '--only');

    const plan = mediaPlan(jobs, { kind: 'image', model: model, inputBase, outDir, only });
    printPlan(plan, flag(rest, '--out'));
    console.error('✓ 交接计划已准备；未提交、未生成。请继续使用 ' + plan.skill + '。');
    return;
  }

  if (cmd === 'render') {
    const [path] = rest;
    if (!path) throw new Error('用法：render <art.json> [--html|--md] [--lang zh|en] [--cast cast.json]');
    const doc = readJson(path);
    verifyArtBoundary(doc,path,rest);
    const originalInput = structuredClone(doc);
    const names = loadCastNames(rest);
    const lang = flag(rest, '--lang');
    const prod = loadProduction(rest, resolve(path, '..'));
    // 图存在才挂上去；没有就渲染成占位，不影响其余内容
    const outDir = resolve(path, '..');
    for (const item of [...doc.scenes, ...(doc.props ?? [])]) {
      const rel = item.sheetImage ?? sheetFile(assetImageStem(item,doc));
      if (existsSync(resolve(outDir, rel))) item.sheetImage = rel;
    }
    // 道具状态变体与出图计划同一个算法找图；只挂在展示副本上，导出 JSON 仍是原输入
    for (const pr of doc.props ?? []) {
      (Array.isArray(pr?.states) ? pr.states : []).forEach((st, i) => {
        if (i === 0 || !st || typeof st !== 'object') return;
        const rel = stateSheetFile(assetImageStem(pr, doc), i + 1);
        if (existsSync(resolve(outDir, rel))) st.sheetImage = rel;
      });
    }
    process.stdout.write((rest.includes('--html') ? renderHtml(doc, lang, prod.doc, names, originalInput) : renderMarkdown(doc, lang, prod.doc, names)) + '\n');
    return;
  }

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
      throw new Error(`${path} 里的 style.scene 没填——回 /mint-setup 跑 style-template 拿骨架填满`);
    }
    console.log(JSON.stringify({
      label: styleLabelOf(doc),
      note: '整块取用不混搭：render / surface 原样进 image.sheet 与 image.prompt，negative 一条不落地进 image.negativePrompt（场景自己额外加的不受影响）。这一块是环境的表面处理，与 style.character 的皮肤毛孔那套是同一个画风的两种落地，别互相搬',
      scene: block,
    }, null, 2));
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
