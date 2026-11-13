// 设定图正文解析：从实际发送正文里切出「主体区」。
// 只做确定性的结构切分，不判断主体写得对不对——那是内容复核的事。
// 本文件属于 mint-characters，自包含，不从兄弟 skill 导入。

export const PURITY_PARAGRAPH = "Remove all noise, graininess, film grain and digital noise; shadows and dark areas smooth and clean, color transitions natural, gradients fine and smooth. Surfaces of skin, fabric, wood grain, stone, water and leaves clean and clear, edges crisp but not over-sharpened, with no dirt specks, hazy blur, smearing or artifacts. Keep the original details, do not reduce any characters or scene elements, do not change the characters' faces. High definition, clean low-ISO image quality, commercial-grade finished look.";

/*
 * 风格参考句：`images --style-ref` 运行时才决定挂不挂参考图、谁是基准，作者写 sheet 时
 * 并不知道，所以由出图计划插入。它单独成段放在画风段之前，纯净段仍然收尾；
 * 解析时作为固定框架剥掉，不计入主体区。
 */
export const STYLE_REF_LINE =
  'Match the art style, line weight, shading and colour treatment of the reference image exactly — these characters must belong to the same production.';

/** 版式句的起点：通用写法 `Layout requirements:`；Midjourney 写法 `one <画幅> <横竖> canvas`。 */
const LAYOUT_START = /Layout requirements:|\bone\s+[\d.]+:\d+\s+[a-z-]+\s+canvas/i;
/** 版式句的终点，按优先级：通用写法的结尾句，其次是 Midjourney 群像、人物版式短语的结尾。 */
const LAYOUT_ENDS = ['The image contains no text and no logos.', 'all different heights and builds', 'separated by clear white gaps'];
const FRONTAL_LIGHT = /soft even frontal studio lighting[^.]*\.?/gi;
const STYLE_HEAD = /^Overall style:/;

export const squash = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
export const paragraphsOf = (text) => String(text ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
export const isMidjourney = (production) => /midjourney/i.test(String(production?.image?.model ?? ''));
const blank = (v) => !String(v ?? '').replace(/[\s.,;:!?'"()\-—–]+/g, '');

/** 最后一段在空白规整后必须等于纯净段——不是「包含」。 */
export const endsWithPurity = (text) => {
  const ps = paragraphsOf(text);
  return ps.length > 0 && squash(ps[ps.length - 1]) === PURITY_PARAGRAPH;
};

/** 画风段（`Overall style:`）单独成段，位于纯净段之前；中间只允许风格参考句那一段。 */
export const styleParagraphBeforePurity = (text) => {
  const ps = paragraphsOf(text).slice(0, -1).filter((p) => squash(p) !== STYLE_REF_LINE);
  return ps.length > 0 && STYLE_HEAD.test(ps[ps.length - 1]);
};

/**
 * 切出主体区：去掉纯净段、画风段、风格参考句、版式句、正面光那一句，剩下的就是主体区。
 * 版式句按起止标记识别，不依赖段落位置；找不到终点时取到所在段落末尾。
 */
export function parseSheet(text) {
  let ps = paragraphsOf(text);
  if (ps.length && squash(ps[ps.length - 1]) === PURITY_PARAGRAPH) ps = ps.slice(0, -1);
  ps = ps.filter((p) => !STYLE_HEAD.test(p));
  let body = ps.join('\n\n').split(STYLE_REF_LINE).join(' ');
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

/** 把风格参考句插在画风段之前（没有画风段时插在纯净段之前），保证纯净段仍然收尾。 */
export function withStyleRef(text) {
  const ps = paragraphsOf(text);
  if (ps.some((p) => squash(p) === STYLE_REF_LINE)) return String(text);
  let at = ps.findIndex((p) => STYLE_HEAD.test(p));
  if (at < 0) at = ps.length && squash(ps[ps.length - 1]) === PURITY_PARAGRAPH ? ps.length - 1 : ps.length;
  ps.splice(at, 0, STYLE_REF_LINE);
  return ps.join('\n\n');
}

/** 设定图正文本身的结构问题（与模型无关的部分）；返回空数组表示通过。 */
export function sheetTextProblems(text) {
  const out = [];
  if (!endsWithPurity(text)) out.push('image.sheet 没有以纯净画质段收尾（必须是最后单独一段，原文照用）');
  if (!parseSheet(text).subject) out.push('image.sheet 的主体区为空——版式、正面光、画风和纯净段之外，没有这个角色自己的外貌、体型与服装描述');
  return out;
}

/** 实际发送的设定图正文清单：有 image.sheet 的角色各一条；开启风格参考时已插入风格参考句。 */
export function sheetTargets(characters, { styleRefFor = () => false } = {}) {
  return (Array.isArray(characters) ? characters : [])
    .filter((c) => c && typeof c.image?.sheet === 'string' && c.image.sheet.trim())
    .map((c) => ({
      id: c.id ?? c.name,
      character: c,
      kind: c.entityType === 'group' ? 'group' : c.entityType === 'nonhuman' ? 'creature' : 'person',
      role: 'base',
      text: styleRefFor(c) ? withStyleRef(c.image.sheet) : c.image.sheet,
    }));
}
