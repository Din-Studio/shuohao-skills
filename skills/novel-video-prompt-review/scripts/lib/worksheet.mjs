// 视频提示词工作单：<段号>/prompt.md 的解析、序列化与摘要。
// 三个 skill（novel-creation、novel-video-prompt、novel-video-prompt-review）各持一份相同副本——
// 小段确定性逻辑各自拷贝，是本仓库对「自包含」的既有解法。修改时三份一起改。
import { createHash } from 'node:crypto';

export const STATUSES = ['draft', 'in_review', 'changes_requested', 'approved'];
export const MAX_ROUNDS = 3;
export const REVIEW_HEADING = '## 审核意见（仅本轮）';
export const RESPONSE_HEADING = '## 编写回应（仅本轮）';
export const STRUCTURE_HEADING = '## 分镜结构';
export const REVIEW_PLACEHOLDER = '（尚未审核）';
export const RESPONSE_PLACEHOLDER = '（无）';
export const MUST_FIX = '[必须修改]';
export const SUGGEST = '[建议]';
const SEPARATOR = '\n---\n';
const META_KEYS = ['segment', 'status', 'round', 'model', 'promptLang', 'bodyHash'];

/** 键序无关的稳定序列化：摘要与结构比对共用。 */
export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** 批准绑定的内容：分镜结构 + 提示词正文。任一改动都让批准失效。 */
export function hashOf(structure, body) {
  return createHash('sha256').update(`${stable(structure)}\n${String(body ?? '').trim()}`, 'utf8').digest('hex').slice(0, 16);
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

/** 审核意见里的条目：以「- [必须修改]」或「- [建议]」开头的行。 */
export function reviewItems(review) {
  const lines = String(review ?? '').split('\n').map(l => l.trim());
  return {
    must: lines.filter(l => l.startsWith(`- ${MUST_FIX}`)),
    suggest: lines.filter(l => l.startsWith(`- ${SUGGEST}`)),
  };
}

/** 批准是否仍然有效：状态为 approved 且摘要与当前内容一致。 */
export function approvalProblem(sheet) {
  if (sheet.problems.length) return `工作单格式有误：${sheet.problems.join('；')}`;
  if (sheet.meta.status !== 'approved') return `审核状态为 ${sheet.meta.status}，尚未批准`;
  if (sheet.meta.bodyHash !== hashOf(sheet.structure, sheet.body)) return '批准之后分镜结构或提示词正文被修改，批准已失效，需要重新提交审核';
  return null;
}
