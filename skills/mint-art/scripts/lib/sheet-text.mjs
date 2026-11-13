// 设定图正文解析：从实际发送正文里切出「主体区」。
// 只做确定性的结构切分，不判断主体写得对不对——那是内容复核的事。
// 本文件属于 mint-art，自包含，不从兄弟 skill 导入。

export const PURITY_PARAGRAPH = "Remove all noise, graininess, film grain and digital noise; shadows and dark areas smooth and clean, color transitions natural, gradients fine and smooth. Surfaces of skin, fabric, wood grain, stone, water and leaves clean and clear, edges crisp but not over-sharpened, with no dirt specks, hazy blur, smearing or artifacts. Keep the original details, do not reduce any characters or scene elements, do not change the characters' faces. High definition, clean low-ISO image quality, commercial-grade finished look.";

/** 版式句的起点：`One <画幅> <横竖> canvas`。 */
const LAYOUT_START = /\bOne\s+[\d.]+:\d+\s+[a-z-]+\s+canvas/i;
/** 版式句的终点：版式固定句以 `anywhere in the image.` 收尾（带字物品替换的是前半句，结尾不变）。 */
const LAYOUT_ENDS = ['anywhere in the image.'];
/** 道具的正面光那一句（Midjourney 写法里是同段的短语）。 */
const FRONTAL_LIGHT = /soft even frontal studio lighting[^.]*\.?/gi;
const STYLE_HEAD = /^Overall style:/;
const VARIANT_HEAD = /^Based on the reference image\b/;
const CHANGE_ONLY = 'Change only the following:';
const MJ_REFERENCE = 'as in the reference image';

export const squash = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
export const paragraphsOf = (text) => String(text ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
export const isMidjourney = (production) => /midjourney/i.test(String(production?.image?.model ?? ''));
const blank = (v) => !String(v ?? '').replace(/[\s.,;:!?'"()\-—–]+/g, '');

/** 最后一段在空白规整后必须等于纯净段——不是「包含」。 */
export const endsWithPurity = (text) => {
  const ps = paragraphsOf(text);
  return ps.length > 0 && squash(ps[ps.length - 1]) === PURITY_PARAGRAPH;
};

/** 纯净段之前那一段是否以 `Overall style:` 开头（通用写法要求，Midjourney 同样保留画风段）。 */
export const styleParagraphBeforePurity = (text) => {
  const ps = paragraphsOf(text);
  return ps.length >= 2 && STYLE_HEAD.test(ps[ps.length - 2]);
};

/**
 * 切出主体区：去掉纯净段、画风段、版式句、正面光那一句，剩下的就是主体区。
 * 版式句按起止标记识别，不依赖段落位置；找不到终点时取到所在段落末尾。
 */
export function parseSheet(text) {
  let ps = paragraphsOf(text);
  if (ps.length && squash(ps[ps.length - 1]) === PURITY_PARAGRAPH) ps = ps.slice(0, -1);
  ps = ps.filter((p) => !STYLE_HEAD.test(p));
  let body = ps.join('\n\n');
  let layoutFound = false;
  const start = body.search(LAYOUT_START);
  if (start >= 0) {
    layoutFound = true;
    let end = -1;
    for (const marker of LAYOUT_ENDS) {
      const at = body.indexOf(marker, start);
      if (at >= 0) { end = at + marker.length; break; }
    }
    if (end < 0) {
      const para = body.indexOf('\n\n', start);
      end = para >= 0 ? para : body.length;
    }
    body = body.slice(0, start) + body.slice(end);
  }
  body = body.replace(FRONTAL_LIGHT, ' ');
  const subject = squash(body);
  return { layoutFound, subject: blank(subject) ? '' : subject };
}

/** 变体主体区的结构问题；返回空数组表示通过。 */
export function variantProblems(subject, midjourney = false) {
  if (midjourney) return subject.includes(MJ_REFERENCE) ? [] : [`主体锚点句缺「${MJ_REFERENCE}」`];
  const out = [];
  if (!VARIANT_HEAD.test(subject)) out.push('主体区不以「Based on the reference image」开头');
  const at = subject.indexOf(CHANGE_ONLY);
  if (at < 0) out.push(`缺「${CHANGE_ONLY}」`);
  else if (blank(subject.slice(at + CHANGE_ONLY.length))) out.push(`「${CHANGE_ONLY}」后面没有变化项`);
  return out;
}

/**
 * 实际发送的设定图正文清单。validate 与出图计划都从这里取正文，保证查的就是发的。
 * 基准：场景、道具的 image.sheet；变体：带 variantOf 的场景、道具 states[1…]。
 */
export function sheetTargets(doc, { readyOnly = false } = {}) {
  const pick = (list) => (Array.isArray(list) ? list : []).filter((a) => a && (!readyOnly || a.designStatus === 'ready'));
  const out = [];
  for (const s of pick(doc?.scenes)) {
    const variant = typeof s.variantOf === 'string' && s.variantOf.trim() !== '';
    out.push({ id: s.id, asset: s, kind: variant ? 'scene-variant' : 'scene', role: variant ? 'variant' : 'base', text: s.image?.sheet });
  }
  for (const p of pick(doc?.props)) {
    out.push({ id: p.id, asset: p, kind: 'prop', role: 'base', text: p.image?.sheet });
    (Array.isArray(p.states) ? p.states : []).slice(1).forEach((st, i) => {
      out.push({ id: `${p.id}.s${i + 2}`, asset: p, state: st, kind: 'prop-state', role: 'variant', text: st?.prompt });
    });
  }
  return out;
}
