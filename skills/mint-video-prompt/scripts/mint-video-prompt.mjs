#!/usr/bin/env node
// mint-video-prompt — 视频提示词编写方的确定性工具：创建工作单、本地自查、提交审核。
// 只有 Node 18+ 标准库依赖。不读取任何其他 skill，不调用模型。
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWorksheet, serializeWorksheet, submitProblems, submittedText, RESPONSE_PLACEHOLDER, REVIEW_PLACEHOLDER } from './lib/worksheet.mjs';

export const DEFAULT_VIDEO_MODEL = 'MiniMax H3';
export const promptFamilyOf = model => (/seedance/i.test(String(model ?? '')) ? 'seedance' : 'h3');
/** 一个全新的模型不读取另一族的填法指南：解不出就返回 null，只照通用骨架写。 */
export function promptGuideOf(model) {
  const name = String(model ?? '').trim();
  if (promptFamilyOf(name) === 'seedance') return 'seedance2-prompt.md';
  return !name || /minimax|\bh3\b/i.test(name) ? 'h3-prompt.md' : null;
}
export const defaultLangOf = model => (promptFamilyOf(model) === 'seedance' ? 'zh' : 'en');

export const SHOT_SIZES = {
  'extreme-wide': { zh: '大远景', phrase: 'extreme wide shot' },
  wide: { zh: '全景', phrase: 'wide shot' },
  medium: { zh: '中景', phrase: 'medium shot' },
  close: { zh: '特写', phrase: 'close-up' },
  'extreme-close': { zh: '大特写', phrase: 'extreme close-up' },
};
export const CAMERA_MOVES = {
  'Static Shot': '固定', 'Push In': '推', 'Pull Out': '拉', 'Zoom In': '变焦推', 'Zoom Out': '变焦拉',
  'Pan Left': '左摇', 'Pan Right': '右摇', 'Truck Left': '左移', 'Truck Right': '右移',
  'Tilt Up': '仰摇', 'Tilt Down': '俯摇', 'Pedestal Up': '升', 'Pedestal Down': '降',
  'Arc Shot': '环绕', 'Tracking Shot': '跟拍', 'Shake Slightly': '轻微晃动', 'Shake Strongly': '强烈晃动',
  'POV': '主观视角', 'Roll Clockwise': '顺旋', 'Roll Counterclockwise': '逆旋',
};
const TOKENS = {
  en: { picture: k => `Picture ${k} is`, shot: k => `[Shot ${k}]`, fields: ['shots:', 'ambience:'] },
  zh: { picture: k => `图 ${k} 是`, shot: k => `[镜头 ${k}]`, fields: ['镜头描述：', '环境声与配乐：'] },
};
/** seedance 官方口径：提示词里不出现数字秒数、秒数区间和时间码。 */
export const TIMECODE_RE = /\b(?:at|after|before)\s+(?:the\s+)?(?:second|sec)\s+\d+(?:\.\d+)?|\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?|(?:第\s*)?\d+(?:\.\d+)?\s*(?:[-–—~～至到]\s*\d+(?:\.\d+)?\s*)?(?:秒|[- ]?(?:seconds?|secs?)\b|s\b)/i;
const IMAGE_KINDS = ['character', 'scene', 'prop'];

/**
 * 本地自查：只检查不需要剧本就能确定的事。节拍覆盖、台词逐字、时长与参考图文件
 * 由调度方拿着剧本做完整结构检查——自查通过不等于结构检查通过，更不等于审核通过。
 */
export function lintWorksheet(sheet) {
  const problems = [...sheet.problems];
  if (problems.length) return problems;
  const { structure: seg, body, meta } = sheet;
  const lang = meta.promptLang || defaultLangOf(meta.model);
  if (!TOKENS[lang]) return [`promptLang 必须为 en 或 zh，当前为 ${lang}`];
  const tk = TOKENS[lang];

  if (!Number.isInteger(seg.sceneIndex) || seg.sceneIndex < 1) problems.push('sceneIndex 必须为从 1 起的整数');
  const cuts = Array.isArray(seg.cuts) ? seg.cuts : [];
  const images = Array.isArray(seg.images) ? seg.images : [];
  if (!cuts.length) problems.push('cuts 不能为空：每段至少一个分镜');
  let expected = null;
  cuts.forEach((cut, i) => {
    const tag = `分镜 ${i + 1}`;
    const [a, b] = Array.isArray(cut?.beats) ? cut.beats : [];
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a) problems.push(`${tag}：beats 必须为 [起, 止] 两个整数且起 ≤ 止`);
    else {
      if (expected !== null && a !== expected) problems.push(`${tag}：节拍认领不连续，期望从第 ${expected} 拍开始`);
      expected = b + 1;
    }
    if (cut?.audioRefs !== undefined) {
      const refs = cut.audioRefs;
      if (!Array.isArray(refs) || refs.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(n => Number.isInteger(n) && n > 0)) || new Set(refs.map(p => JSON.stringify(p))).size !== refs.length) problems.push(`${tag}：audioRefs 必须为唯一正整数坐标`);
      else if (refs.some(([scene,beat]) => scene > seg.sceneIndex || (scene === seg.sceneIndex && beat >= a))) problems.push(`${tag}：audioRefs 不能引用当前或更晚镜头的节拍`);
      // Earlier-segment ownership and LINE identity require the dispatcher's full script check.
    }
    if (typeof cut?.seconds !== 'number' || !Number.isFinite(cut.seconds) || cut.seconds <= 0) problems.push(`${tag}：seconds 必须为有限正数`);
    if (!SHOT_SIZES[cut?.size]) problems.push(`${tag}：size 不在景别枚举内`);
    if (!(cut?.camera in CAMERA_MOVES)) problems.push(`${tag}：camera 不在运镜词表内`);
    if (!Array.isArray(cut?.characters)) problems.push(`${tag}：characters 必须为数组，空镜给空数组`);
  });
  images.forEach((img, i) => {
    if (!IMAGE_KINDS.includes(img?.kind) || typeof img?.ref !== 'string' || !img.ref) problems.push(`参考图 ${i + 1}：kind 必须为 ${IMAGE_KINDS.join(' / ')}，ref 为资产编号`);
  });

  if (!body) return [...problems, '提示词正文为空'];
  for (let k = 1; k <= images.length; k++) if (!body.includes(tk.picture(k))) problems.push(`缺少身份说明句「${tk.picture(k)}…」`);
  if (body.includes(tk.picture(images.length + 1))) problems.push(`身份说明句多于参考图数量（${images.length} 张）`);
  const start = body.indexOf(tk.fields[0]), end = body.indexOf(tk.fields[1]);
  if (start < 0 || end < 0 || end < start) problems.push(`正文必须依次包含「${tk.fields[0]}」与「${tk.fields[1]}」两个字段`);
  else {
    const shots = body.slice(start, end);
    cuts.forEach((cut, i) => {
      const a = shots.indexOf(tk.shot(i + 1));
      if (a < 0) { problems.push(`缺少 ${tk.shot(i + 1)} 行`); return; }
      const b = shots.indexOf(tk.shot(i + 2));
      const slice = shots.slice(a, b < 0 ? undefined : b).toLowerCase();
      const size = SHOT_SIZES[cut?.size], camera = cut?.camera in CAMERA_MOVES ? (lang === 'en' ? cut.camera : CAMERA_MOVES[cut.camera]) : null;
      if (size && !slice.includes((lang === 'en' ? size.phrase : size.zh).toLowerCase())) problems.push(`${tk.shot(i + 1)} 行缺少景别短语「${lang === 'en' ? size.phrase : size.zh}」`);
      if (camera && !slice.includes(camera.toLowerCase())) problems.push(`${tk.shot(i + 1)} 行缺少运镜短语「${camera}」`);
    });
    if (shots.includes(tk.shot(cuts.length + 1))) problems.push(`镜头行多于分镜数量（${cuts.length} 个）`);
  }
  if (promptFamilyOf(meta.model) === 'seedance' && TIMECODE_RE.test(body)) problems.push('seedance 系列提示词不能出现数字秒数、秒数区间或时间码');
  return problems;
}

/** 提交审核：自查通过后进入 in_review，轮次加一，旧批准与旧摘要一并作废。 */
export function submitWorksheet(sheet) {
  const problems = [...lintWorksheet(sheet), ...submitProblems(sheet)];
  if (problems.length) return { problems };
  return { problems, text: submittedText(sheet) };
}

const USAGE = `mint-video-prompt.mjs — 视频提示词编写方的确定性工具

  guide [--model <视频模型>]                 打印这个模型应读取的填法指南与默认提示词语言
  new <段号> --out <目录> [--model M] [--lang en|zh] [--scene N]
                                             创建空白工作单 <目录>/<段号>/prompt.md（拒绝覆盖）
  lint <prompt.md>...                        本地自查格式、分镜结构与提示词骨架
  submit <prompt.md>...                      自查通过后提交审核：status → in_review，round 加一

本工具不读取剧本。节拍覆盖、台词逐字、时长与参考图文件由调度方做完整结构检查。`;

function flag(rest, name, fallback = null) {
  const i = rest.indexOf(name);
  if (i < 0) return fallback;
  if (!rest[i + 1] || rest[i + 1].startsWith('--')) throw new Error(`${name} 缺少参数值`);
  return rest[i + 1];
}
const positional = rest => rest.filter((a, i) => !a.startsWith('--') && !(rest[i - 1] ?? '').startsWith('--'));

function main(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === '-h' || cmd === '--help') { console.log(USAGE); process.exit(cmd ? 0 : 1); }

  if (cmd === 'guide') {
    const model = flag(rest, '--model', DEFAULT_VIDEO_MODEL);
    const guide = promptGuideOf(model);
    console.log(`视频模型：${model}`);
    console.log('骨架：references/creation-prompt.md');
    console.log(guide ? `填法指南：references/${guide}` : '填法指南：没有这个模型的填法指南，只照通用骨架写，并在回报中说明能力未核实');
    console.log(`默认提示词语言：${defaultLangOf(model)}`);
    return;
  }

  if (cmd === 'new') {
    const [id] = positional(rest);
    const out = flag(rest, '--out');
    if (!id || !out) throw new Error('用法：new <段号> --out <目录> [--model M] [--lang en|zh] [--scene N]');
    if (!/^E\d{2,}-\d{2,}$/.test(id)) throw new Error('段号必须形如 E01-01');
    const model = flag(rest, '--model', DEFAULT_VIDEO_MODEL);
    const promptLang = flag(rest, '--lang', defaultLangOf(model));
    if (!TOKENS[promptLang]) throw new Error('--lang 必须为 en 或 zh');
    const sceneIndex = Number(flag(rest, '--scene', '1'));
    if (!Number.isInteger(sceneIndex) || sceneIndex < 1) throw new Error('--scene 必须为从 1 起的整数');
    const target = join(resolve(out), id, 'prompt.md');
    if (existsSync(target)) throw new Error(`${target} 已存在，拒绝覆盖——直接修改现有工作单`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, serializeWorksheet({
      meta: { segment: id, status: 'draft', round: 0, model, promptLang },
      structure: { id, sceneIndex, cuts: [], images: [] }, review: REVIEW_PLACEHOLDER, response: RESPONSE_PLACEHOLDER, body: '',
    }), 'utf8');
    console.log(`✓ 新建工作单 ${target}`);
    return;
  }

  if (cmd === 'lint' || cmd === 'submit') {
    const paths = positional(rest);
    if (!paths.length) throw new Error(`用法：${cmd} <prompt.md>...`);
    // 先全部检查，再全部写入：一集的工作单要么一起提交，要么都不提交
    const results = paths.map(path => {
      const sheet = parseWorksheet(readFileSync(resolve(path), 'utf8'));
      return { path, sheet, ...(cmd === 'submit' ? submitWorksheet(sheet) : { problems: lintWorksheet(sheet) }) };
    });
    const failed = results.filter(r => r.problems.length);
    for (const r of failed) console.error(`✗ ${r.path}\n${r.problems.map(x => '  ' + x).join('\n')}`);
    if (failed.length) process.exit(1);
    for (const r of results) {
      if (cmd === 'submit') writeFileSync(resolve(r.path), r.text, 'utf8');
      console.log(cmd === 'submit' ? `✓ ${r.path} 已提交审核（第 ${r.sheet.meta.round + 1} 轮）` : `✓ ${r.path} 本地自查通过（${r.sheet.meta.status}）`);
    }
    return;
  }
  throw new Error(`未知命令 ${cmd}\n\n${USAGE}`);
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}
if (isMainModule()) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error instanceof Error ? error.message : error); process.exit(1); }
}
