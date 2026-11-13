// 视频提示词工作单：<段号>/prompt.md 的解析、序列化与摘要。
// 三个 skill（mint-creation、mint-video-prompt、mint-video-prompt-review）各持一份相同副本——
// 小段确定性逻辑各自拷贝，是本仓库对「自包含」的既有解法。修改时三份一起改。
import { createHash } from 'node:crypto';
import {requiredMappings, materialMappingErrors, assetLists} from './asset-mapping.mjs';

export const STATUSES = ['draft', 'in_review', 'changes_requested', 'blocked', 'approved'];
export const VERDICTS = ['approved', 'changes_requested', 'blocked'];
export const MAX_ROUNDS = 3;
export const REVIEW_HEADING = '## 审核意见（仅本轮）';
export const RESPONSE_HEADING = '## 编写回应（仅本轮）';
export const STRUCTURE_HEADING = '## 分镜结构';
export const REVIEW_PLACEHOLDER = '（尚未审核）';
export const RESPONSE_PLACEHOLDER = '（无）';
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
  const scenes = material?.seedScenes ?? [];
  const scene = scenes.find(s => s?.sceneIndex === structure?.sceneIndex);
  const claimed = new Set(), continuation = new Map();
  for (const cut of structure?.cuts ?? []) {
    const [a,b] = Array.isArray(cut?.beats) ? cut.beats : [];
    if (Number.isInteger(a) && Number.isInteger(b)) for (let n=a;n<=b && n-a<100000;n++) claimed.add(n);
    for (const pos of Array.isArray(cut?.audioRefs) ? cut.audioRefs : []) {
      if (!Array.isArray(pos) || pos.length !== 2) continue;
      const sc = scenes.find(s => s?.sceneIndex === pos[0]);
      continuation.set(stable(pos), {position:pos, sceneId:sc?.sceneId ?? null,
        sourceRefs:sc?.sourceRefs ?? null, notes:sc?.notes ?? null,
        characters:sc?.characters ?? [], props:sc?.props ?? [],
        beat:sc?.beats?.find(b => b?.n === pos[1]) ?? null});
    }
  }
  const beats = (scene?.beats ?? []).filter(b => claimed.has(b?.n));
  const dependencies = {sceneId:scene?.sceneId ?? null, lighting:scene?.lighting ?? null,
    sourceRefs:scene?.sourceRefs ?? null, notes:scene?.notes ?? null, beats,
    characters:scene?.characters ?? [], props:scene?.props ?? [],
    continuation:[...continuation.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([,v]) => v)};
  const ids = new Set(), sourceRanges = [];
  function refs(x) {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x.sourceRefs)) for (const r of x.sourceRefs) { ids.add(r.documentId); sourceRanges.push(r); }
    for (const v of Object.values(x)) if (Array.isArray(v)) v.forEach(refs); else if (v && typeof v === 'object') refs(v);
  }
  refs(dependencies);
  const sourceCoverage = (material?.provenance?.coverage ?? []).filter(c=>sourceRanges.some(r=>r.documentId===c.documentId && r.startLine<=c.endLine && c.startLine<=r.endLine));
  const documents = [...ids].sort().map(id => {
    const d = material?.provenance?.documents?.find(d => d?.id === id);
    return d ? {id:d.id,path:d.path,sha256:d.sha256,lineCount:d.lineCount} : {id,missing:true};
  });
  const selected = requiredMappings(structure,scene,scenes);
  // A continued voice carries the source scene's mapped identity evidence too.
  for (const b of [...beats,...[...continuation.values()].map(v=>v.beat)]) {
    if (/^C\d{2,}$/.test(b?.speaker)) selected.push({kind:'character',localId:b.speaker});
  }
  const mappings = material?.assetMappings === undefined ? null : [...new Map(selected.map(r=>[`${r.kind}:${r.localId}`,r])).values()].map(({kind,localId})=>{
    const rows=(material.assetMappings??[]).filter(m=>m.kind===kind && m.localId===localId);
    return {kind,localId,records:rows,assets:rows.map(m=>{const a=(material.assets?.[assetLists[kind]]??[]).find(a=>a.id===m.assetId); if(!a)return null; const {sheet,sheetHash,sheetExists,...identity}=a; return identity;})};
  });
  const images = (structure?.images ?? []).map(img => {
    const mapping = (material?.assetMappings ?? []).find(m=>m.kind===img?.kind&&m.localId===img?.ref);
    const asset = (material?.assets?.[ASSET_LISTS[img?.kind]] ?? []).find(x => x?.id === (mapping?.assetId ?? img?.ref));
    return {kind:img?.kind ?? null,ref:img?.ref ?? null,name:asset?.name ?? null,sheet:asset?.sheet ?? null,sheetHash:asset?.sheetHash ?? null,
      assetDigest:asset?.assetDigest ?? null,sourceRefs:asset?.sourceRefs ?? null,sourceDocuments:asset?.sourceDocuments ?? null,sourceCoverage:asset?.sourceCoverage??null};
  });
  const positions = [...claimed].map(n => [structure?.sceneIndex,n]).concat([...continuation.values()].map(v => v.position));
  const compare = (a,b) => a[0]-b[0] || a[1]-b[1];
  const beatClaims = (material?.beatClaims ?? []).filter(c => Array.isArray(c?.start) && Array.isArray(c?.end) && positions.some(p => compare(c.start,p)<=0 && compare(p,c.end)<=0));
  // The full episode is dispatched, but local intent belongs only to its owning segment.
  const owned = [...claimed].map(n => [structure?.sceneIndex,n]);
  const allPositions = scenes.flatMap(s => (s.beats ?? []).map(b => [s.sceneIndex,b.n])).sort(compare);
  const opening = material?.intent?.openingBeat ?? allPositions[0];
  const ending = material?.intent?.endBeat ?? allPositions.at(-1);
  const owns = pos => Array.isArray(pos) && owned.some(p => compare(p,pos) === 0);
  const intent = {
    ...(owns(opening) ? {opening:material?.intent?.opening ?? null,openingBeat:opening} : {}),
    ...(owns(ending) ? {ending:material?.intent?.ending ?? null,endBeat:ending} : {}),
  };
  return digest(stable({
    intent,
    video:material?.video ?? null,promptLang:material?.promptLang ?? null,
    maxSegmentSeconds:material?.maxSegmentSeconds ?? null,maxOnScreen:material?.maxOnScreen ?? null,
    targetSeconds:material?.targetSeconds ?? null,creativeBrief:material?.creativeBrief ?? null,
    ...(material?.style ? {style:material.style} : {}),
    ...dependencies,documents,sourceCoverage,sourceScope:material?.provenance?.scope??null,images,beatClaims,mappings,
  }));
}

function section(head, heading) {
  const start = head.indexOf(`\n${heading}\n`);
  if (start < 0) return null;
  const from = start + heading.length + 2;
  const next = HEADINGS.map(h => head.indexOf(`\n${h}\n`, from)).filter(n => n >= 0);
  return head.slice(from, next.length ? Math.min(...next) : undefined).trim();
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
  for (const h of headings) if (!HEADINGS.includes(h) && !['## 返修意见','## 待确认事项'].includes(h)) problems.push(`多余的二级标题「${h}」：只允许固定工作单标题和审核区的返修意见、待确认事项`);
  const reviewStart = head.indexOf(REVIEW_HEADING), responseStart = head.indexOf(RESPONSE_HEADING);
  for (const h of ['## 返修意见','## 待确认事项']) {
    const positions = [...head.matchAll(new RegExp(`^${h}$`, 'gm'))].map(m => m.index);
    if (positions.length > 1 || positions.some(p => p < reviewStart || p > responseStart)) problems.push(`「${h}」只允许在审核意见区域出现一次`);
  }

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

/**
 * 审核意见：固定标题、唯一审核结论，再依次是「返修意见」「待确认事项」两个条目区。
 * 返修条目为「质量或格式｜字段或事件｜问题｜修订要求」，待确认条目为「位置｜缺少的依据｜影响的判断」。
 */
export function structuredReview(review) {
  const text = String(review ?? '').trim(), problems = [];
  const conclusions = [...text.matchAll(/^- 审核结论：[ \t]*(.*)$/gm)];
  const conclusion = conclusions[0]?.[1].trim();
  if (!text.startsWith('# 视频提示词审核\n') || conclusions.length !== 1 || !['通过','需返修','待确认'].includes(conclusion)) problems.push('审核需要固定标题和唯一的审核结论：通过／需返修／待确认');
  const a = text.indexOf('\n## 返修意见\n'), b = text.indexOf('\n## 待确认事项');
  if (a < 0 || b < a || !/^\n## 待确认事项(?:\n|$)/.test(text.slice(b))) problems.push('审核必须依次包含返修意见与待确认事项');
  if (a >= 0 && text.slice(0,a).trim() !== `# 视频提示词审核\n\n- 审核结论：${conclusion}`) problems.push('审核标题与结论之后只能进入返修意见，不夹带未归类意见');
  const entries = value => value.split('\n').map(l => l.trim()).filter(Boolean);
  const must = a < 0 || b < a ? [] : entries(text.slice(a + '\n## 返修意见\n'.length,b));
  const block = b < 0 ? [] : entries(text.slice(b + '\n## 待确认事项'.length));
  for (const line of must) {
    const fields=line.replace(/^[-*+]\s*/, '').split('｜').map(x=>x.trim());
    if (fields.length !== 4 || !fields.every(Boolean) || !['质量','格式'].includes(fields[0])) problems.push(`返修意见需填写质量或格式｜字段或事件｜问题｜修订要求：${line}`);
  }
  for (const line of block) if (line.replace(/^[-*+]\s*/, '').split('｜').filter(x=>x.trim()).length !== 3) problems.push(`待确认事项需填写位置｜缺少的依据｜影响的判断：${line}`);
  return {conclusion,must,block,problems};
}

export const reviewItems = structuredReview;

/** 批准是否仍然有效：状态为 approved 且摘要与当前内容一致。 */
export function approvalProblem(sheet) {
  if (sheet.problems.length) return `工作单格式有误：${sheet.problems.join('；')}`;
  if (sheet.meta.status !== 'approved') return `审核状态为 ${sheet.meta.status}，尚未批准`;
  if (sheet.meta.bodyHash !== hashOf(sheet.structure, sheet.body)) return '批准之后分镜结构或提示词正文被修改，批准已失效，需要重新提交审核';
  return null;
}

/** 批准绑定的输入是否仍然是当前的输入材料。只对已批准且内容未改动的工作单有意义。 */
export function inputProblem(sheet, material) {
  const mappingProblems = materialMappingErrors(sheet.structure,material);
  if (mappingProblems.length) return mappingProblems.join('；');
  if (!sheet.meta.inputHash) return '批准没有绑定输入材料，需要重新提交，并由审核方带着输入材料登记结论';
  if (sheet.meta.inputHash !== inputHashOf(sheet.structure, material)) return '批准之后这一段依据的输入发生变化（认领与声音延续正文、来源、场次说明、参考图、模型参数或项目要求），批准已失效，需要重新提交审核';
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
    const r = structuredReview(sheet.review);
    problems.push(...r.problems);
    const expected = r.must.length ? 'changes_requested' : r.block.length ? 'blocked' : 'approved';
    if (r.conclusion !== ({approved:'通过',changes_requested:'需返修',blocked:'待确认'})[expected]) problems.push('审核结论与返修意见、待确认事项不一致');
    if (verdict !== expected) problems.push(`本轮审核应登记 ${expected}，不能登记 ${verdict}`);
  }
  if (!sheet.body) problems.push('提示词正文为空，无法审核');
  if (verdict === 'approved' && material) problems.push(...materialMappingErrors(sheet.structure,material));
  if (verdict === 'approved' && !material) problems.push('批准需要输入材料：批准绑定这一段依据的节拍原文、参考图与模型参数');
  if (problems.length) return { problems };
  const approved = verdict === 'approved';
  const meta = { ...sheet.meta, status: verdict, bodyHash: approved ? hashOf(sheet.structure, sheet.body) : '', inputHash: approved ? inputHashOf(sheet.structure, material) : '' };
  // 新一轮意见写出后，上一轮的编写回应已经完成使命
  return { problems, text: serializeWorksheet({ ...sheet, meta, response: approved ? sheet.response : RESPONSE_PLACEHOLDER }) };
}
