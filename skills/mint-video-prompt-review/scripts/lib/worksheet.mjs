// 视频提示词工作单：<段号>/prompt.md 的解析、序列化与摘要。
// 三个 skill（mint-creation、mint-video-prompt、mint-video-prompt-review）各持一份相同副本——
// 小段确定性逻辑各自拷贝，是本仓库对「自包含」的既有解法。修改时三份一起改。
import { createHash } from 'node:crypto';

export const STATUSES = ['draft', 'in_review', 'changes_requested', 'blocked', 'approved'];
export const VERDICTS = ['approved', 'changes_requested', 'blocked'];
export const MAX_ROUNDS = 3;
export const REVIEW_HEADING = '## 审核意见（仅本轮）';
export const RESPONSE_HEADING = '## 编写回应（仅本轮）';
export const STRUCTURE_HEADING = '## 分镜结构';
export const REVIEW_PLACEHOLDER = '（尚未审核）';
export const RESPONSE_PLACEHOLDER = '（无）';
export const MUST_FIX = '[必须修改]';
export const SUGGEST = '[建议]';
export const BLOCKER = '[阻塞]';
const SEPARATOR = '\n---\n';
const META_KEYS = ['segment', 'status', 'round', 'model', 'promptLang', 'bodyHash', 'inputHash'];
const HEADINGS = [STRUCTURE_HEADING, REVIEW_HEADING, RESPONSE_HEADING];
const ASSET_LISTS = { character: 'characters', scene: 'scenes', prop: 'props' };

/** 键序无关的稳定序列化：摘要与结构比对共用。 */
export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const digest = text => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);

/** 批准绑定的内容：分镜结构 + 提示词正文。任一改动都让批准失效。 */
export function hashOf(structure, body) {
  return digest(`${stable(structure)}\n${String(body ?? '').trim()}`);
}

/**
 * 批准绑定的输入：只取这一段实际依据的材料——认领节拍的原文、挂载参考图的内容摘要、
 * 视频模型与参数、提示词语言、单段上限和项目要求。别的段、别的集、上游文件里无关的字段
 * 发生变化，不影响这一段的批准。material 是调度方派发的输入材料（格式见各 skill 的样例）。
 */
export function inputHashOf(structure, material) {
  const scene = (material?.seedScenes ?? []).find(s => s?.sceneIndex === structure?.sceneIndex);
  const claimed = new Set();
  for (const cut of structure?.cuts ?? []) {
    const [a, b] = Array.isArray(cut?.beats) ? cut.beats : [];
    if (Number.isInteger(a) && Number.isInteger(b)) for (let n = a; n <= b && n - a < 1000; n++) claimed.add(n);
  }
  const images = (structure?.images ?? []).map(img => {
    const asset = (material?.assets?.[ASSET_LISTS[img?.kind]] ?? []).find(x => x?.id === img?.ref);
    return { kind: img?.kind ?? null, ref: img?.ref ?? null, name: asset?.name ?? null, sheetHash: asset?.sheetHash ?? null };
  });
  return digest(stable({
    video: material?.video ?? null, promptLang: material?.promptLang ?? null,
    maxSegmentSeconds: material?.maxSegmentSeconds ?? null, creativeBrief: material?.creativeBrief ?? null,
    sceneId: scene?.sceneId ?? null, beats: (scene?.beats ?? []).filter(b => claimed.has(b?.n)), images,
  }));
}

function section(head, heading) {
  const start = head.indexOf(`\n${heading}\n`);
  if (start < 0) return null;
  const from = start + heading.length + 2;
  const next = head.indexOf('\n## ', from);
  return head.slice(from, next < 0 ? undefined : next).trim();
}

/**
 * 解析工作单。永不抛错：格式问题收进 problems，调用方决定是否阻断。
 * 正文取最后一条分隔线之下；状态头与审核区不会进入下单的提示词。
 */
export function parseWorksheet(text) {
  const md = String(text ?? '').replace(/\r\n/g, '\n');
  const problems = [];
  const sheet = { meta: {}, structure: null, review: '', response: '', body: '', problems };
  if (!md.startsWith('---\n')) {
    problems.push('缺少状态头：文件必须以 --- 开始的状态头开头');
    return sheet;
  }
  const metaEnd = md.indexOf(SEPARATOR, 3);
  if (metaEnd < 0) {
    problems.push('状态头没有结束分隔线');
    return sheet;
  }
  for (const line of md.slice(4, metaEnd).split('\n')) {
    if (!line.trim()) continue;
    const m = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (!m || !META_KEYS.includes(m[1])) { problems.push(`状态头出现无法识别的行：${line}`); continue; }
    if (m[1] in sheet.meta) problems.push(`状态头字段重复：${m[1]}`);
    sheet.meta[m[1]] = m[2].trim();
  }
  const round = Number(sheet.meta.round);
  if (!Number.isInteger(round) || round < 0) problems.push('round 必须为非负整数');
  sheet.meta.round = Number.isInteger(round) && round >= 0 ? round : 0;
  if (!/^E\d{2,}-\d{2,}$/.test(sheet.meta.segment ?? '')) problems.push('segment 必须形如 E01-01');
  if (!STATUSES.includes(sheet.meta.status)) problems.push(`status 必须为 ${STATUSES.join(' / ')}`);

  const rest = md.slice(metaEnd + SEPARATOR.length - 1);
  const split = rest.lastIndexOf(SEPARATOR);
  if (split < 0) {
    problems.push('缺少正文分隔线：提示词正文写在最后一条单独成行的 --- 之下');
    return sheet;
  }
  const head = rest.slice(0, split + 1);
  sheet.body = rest.slice(split + SEPARATOR.length).trim();
  if (head.includes(SEPARATOR)) problems.push('状态头之后只允许一条分隔线：审核区与提示词正文里都不能出现单独成行的 ---');
  // 区域按二级标题切分：意见或回应里多出一个二级标题，它之下的内容会在下一次改写时丢失
  const headings = head.split('\n').filter(line => line.startsWith('## ')).map(line => line.trim());
  for (const h of HEADINGS) if (headings.filter(x => x === h).length > 1) problems.push(`「${h}」只能出现一次`);
  for (const h of headings) if (!HEADINGS.includes(h)) problems.push(`多余的二级标题「${h}」：审核意见与编写回应里需要小标题时使用三级标题或加粗`);

  const structureText = section(head, STRUCTURE_HEADING);
  const fence = structureText?.match(/```json\n([\s\S]*?)\n```/);
  if (!fence) problems.push(`缺少「${STRUCTURE_HEADING}」下的 json 代码块`);
  else {
    try {
      const value = JSON.parse(fence[1]);
      if (!value || typeof value !== 'object' || Array.isArray(value)) problems.push('分镜结构必须为 JSON 对象');
      else if ('prompt' in value) problems.push('分镜结构不保存 prompt：提示词只写在分隔线之下');
      else sheet.structure = value;
    } catch (error) {
      problems.push(`分镜结构不是合法 JSON：${error.message}`);
    }
  }
  if (sheet.structure && sheet.structure.id !== sheet.meta.segment) problems.push(`分镜结构 id（${sheet.structure.id}）与状态头 segment（${sheet.meta.segment}）不一致`);

  const review = section(head, REVIEW_HEADING);
  const response = section(head, RESPONSE_HEADING);
  if (review === null) problems.push(`缺少「${REVIEW_HEADING}」`);
  if (response === null) problems.push(`缺少「${RESPONSE_HEADING}」`);
  sheet.review = review ?? '';
  sheet.response = response ?? '';
  return sheet;
}

export function serializeWorksheet({ meta, structure, review, response, body }) {
  const lines = [
    '---',
    `segment: ${meta.segment}`,
    `status: ${meta.status}`,
    `round: ${meta.round ?? 0}`,
    `model: ${meta.model ?? ''}`,
    `promptLang: ${meta.promptLang ?? ''}`,
    `bodyHash: ${meta.bodyHash ?? ''}`,
    `inputHash: ${meta.inputHash ?? ''}`,
    '---',
    '',
    `# ${meta.segment} · 视频提示词工作单`,
    '',
    STRUCTURE_HEADING,
    '',
    '```json',
    JSON.stringify(structure ?? { id: meta.segment, sceneIndex: 1, cuts: [], images: [] }, null, 2),
    '```',
    '',
    REVIEW_HEADING,
    '',
    (review ?? '').trim() || REVIEW_PLACEHOLDER,
    '',
    RESPONSE_HEADING,
    '',
    (response ?? '').trim() || RESPONSE_PLACEHOLDER,
    '',
    '---',
    '',
    String(body ?? '').trim(),
    '',
  ];
  return lines.join('\n').replace(/[ \t]+\n/g, '\n');
}

const ITEM_PREFIX = String.raw`^(?:[-*+•]|\d+[.)、．])?\s*(?:\*\*|__)?\s*`;
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const itemRe = tag => new RegExp(ITEM_PREFIX + escapeRe(tag));

/**
 * 审核意见里的条目：以列表符号（- * + 或数字编号）加标签开头的行。
 * loose 收集提到了「必须修改」或「阻塞」标签却不是条目的行——批准时一并拒绝，不让换一种写法绕过。
 */
export function reviewItems(review) {
  const lines = String(review ?? '').split('\n').map(l => l.trim()).filter(Boolean);
  const pick = tag => lines.filter(l => itemRe(tag).test(l));
  const must = pick(MUST_FIX), block = pick(BLOCKER), suggest = pick(SUGGEST);
  const loose = lines.filter(l => (l.includes(MUST_FIX) || l.includes(BLOCKER)) && !must.includes(l) && !block.includes(l));
  return { must, suggest, block, loose };
}

/** 批准是否仍然有效：状态为 approved 且摘要与当前内容一致。 */
export function approvalProblem(sheet) {
  if (sheet.problems.length) return `工作单格式有误：${sheet.problems.join('；')}`;
  if (sheet.meta.status !== 'approved') return `审核状态为 ${sheet.meta.status}，尚未批准`;
  if (sheet.meta.bodyHash !== hashOf(sheet.structure, sheet.body)) return '批准之后分镜结构或提示词正文被修改，批准已失效，需要重新提交审核';
  return null;
}

/** 批准绑定的输入是否仍然是当前的输入材料。只对已批准且内容未改动的工作单有意义。 */
export function inputProblem(sheet, material) {
  if (!sheet.meta.inputHash) return '批准没有绑定输入材料，需要重新提交，并由审核方带着输入材料登记结论';
  if (sheet.meta.inputHash !== inputHashOf(sheet.structure, material)) return '批准之后这一段依据的输入发生变化（认领节拍的原文、参考图内容、视频模型与参数、提示词语言、单段上限或项目要求），批准已失效，需要重新提交审核';
  return null;
}

/** 提交审核的前置条件：不重复提交；被退回或阻塞之后先写回应。 */
export function submitProblems(sheet) {
  const problems = [];
  if (sheet.meta.status === 'in_review') problems.push('工作单已经处于 in_review，等待审核结论，不能重复提交');
  if (['changes_requested', 'blocked'].includes(sheet.meta.status) && (!sheet.response || sheet.response === RESPONSE_PLACEHOLDER)) {
    problems.push('上一轮审核要求修改或登记了阻塞：先在「编写回应（仅本轮）」逐条写明如何处理，再提交');
  }
  return problems;
}

/** 提交审核：进入 in_review，轮次加一，旧批准与旧摘要一并作废。 */
export function submittedText(sheet) {
  return serializeWorksheet({ ...sheet, meta: { ...sheet.meta, status: 'in_review', round: sheet.meta.round + 1, bodyHash: '', inputHash: '' } });
}

const CONCLUSION_RE = /^结论[：:]\s*\S/m;
const EVIDENCE_RE = /镜头\s*\d+|Shot\s*\d+|整段|参考图|声景|图\s*\d+|Picture\s*\d+/i;

/**
 * 登记结论。审核方只写审核区与状态：分镜结构与提示词正文原样保留。
 * approved 绑定当前内容与输入材料的摘要，此后任一变化都让批准失效。
 */
export function recordVerdict(sheet, verdict, material = null) {
  const problems = [...sheet.problems];
  if (!VERDICTS.includes(verdict)) problems.push(`结论必须为 ${VERDICTS.join('、')} 之一`);
  if (problems.length) return { problems };
  if (sheet.meta.status !== 'in_review') problems.push(`只能审核 in_review 的工作单，当前为 ${sheet.meta.status}——由编写方提交后再审核`);
  if (!sheet.review || sheet.review === REVIEW_PLACEHOLDER) problems.push('「审核意见（仅本轮）」还没有填写');
  else {
    if (!CONCLUSION_RE.test(sheet.review)) problems.push('审核意见需要一行「结论：……」，概括本轮判断与依据');
    const { must, suggest, block, loose } = reviewItems(sheet.review);
    if (verdict === 'approved') {
      if (must.length) problems.push(`仍有 ${must.length} 条 ${MUST_FIX}，不能批准`);
      if (block.length) problems.push(`仍有 ${block.length} 条 ${BLOCKER}，不能批准`);
      for (const line of loose) problems.push(`意见提到了 ${MUST_FIX} 或 ${BLOCKER}，但不是清单条目，不能批准；改写成「- ${MUST_FIX} 位置：……」或删去标签：${line}`);
    }
    if (verdict === 'changes_requested') {
      if (!must.length) problems.push(`要求修改时至少写一条「- ${MUST_FIX} ……」；只有「- ${SUGGEST}」不构成退回理由`);
      if (block.length) problems.push(`存在 ${BLOCKER} 时登记 blocked：编写方无法单独解决，需要调度方先协调`);
    }
    if (verdict === 'blocked' && !block.length) problems.push(`登记阻塞时至少写一条「- ${BLOCKER} ……」，说明缺少什么材料或需要谁决定`);
    for (const line of [...must, ...suggest, ...block]) if (!EVIDENCE_RE.test(line)) problems.push(`意见需要指明镜号或位置（镜头 k／整段／参考图／声景）：${line}`);
  }
  if (!sheet.body) problems.push('提示词正文为空，无法审核');
  if (verdict === 'approved' && !material) problems.push('批准需要输入材料：批准绑定这一段依据的节拍原文、参考图与模型参数');
  if (problems.length) return { problems };
  const approved = verdict === 'approved';
  const meta = { ...sheet.meta, status: verdict, bodyHash: approved ? hashOf(sheet.structure, sheet.body) : '', inputHash: approved ? inputHashOf(sheet.structure, material) : '' };
  // 新一轮意见写出后，上一轮的编写回应已经完成使命
  return { problems, text: serializeWorksheet({ ...sheet, meta, response: approved ? sheet.response : RESPONSE_PLACEHOLDER }) };
}
