// 分镜文件 <剧本名>-storyboard.md 的生成、解析与确定性检查。
// mint-script 产出分镜，mint-creation 按分镜分段并绑定批准；两份副本必须逐字一致，
// 由仓库级自测核对。只依赖语言内建能力，不读取兄弟 skill。

export const STORYBOARD_SUFFIX = '-storyboard.md';
export const STORYBOARD_FIELDS = [
  '段首状态', '段首复写', '必须呈现的信息', '段尾状态', '供下一段复写的内容',
  '人物说明', '场景说明', '故事理解', '环境音', '音效', '背景音乐', '台词对照',
];
/** 每段必须有内容的字段。声音三项没有合适内容时写「无」。 */
export const REQUIRED_FIELDS = ['段首状态', '必须呈现的信息', '段尾状态', '环境音', '音效', '背景音乐'];
const SCENE_KEYS = ['集号', '场号', '总段数', '待确认事项'];
const HEADER_KEYS = ['剧本', '单段上限', '待确认事项'];
const AUDIO_LABEL = { offscreen: '画外', voiceover: '旁白', inner: '内心' };
const DEFAULTS = { charsPerSecond: 4.5, actionSeconds: 2.5 };

const arr = x => Array.isArray(x) ? x : [];
const own = (x, k) => x !== null && typeof x === 'object' && Object.hasOwn(x, k);
const clean = x => String(x ?? '').replace(/\s+/g, ' ').trim();
const empty = x => !clean(x) || clean(x) === '无';
export const segmentId = (ep, n) => `E${String(ep).padStart(2, '0')}-${String(n).padStart(2, '0')}`;

/** 分镜文件与剧本 JSON 放在同一目录：xxx.json → xxx-storyboard.md。 */
export function storyboardPathOf(scriptPath) {
  return String(scriptPath).replace(/\.json$/i, '') + STORYBOARD_SUFFIX;
}

/** 「本段剧本」的唯一写法：一拍一行，行首是场内拍号。由剧本 JSON 确定性生成，逐字核对。 */
export function beatLine(beat, n) {
  let body;
  if (own(beat, 'action')) body = `△ ${clean(beat.action)}`;
  else if (own(beat, 'subtitle')) body = `字幕：${clean(beat.subtitle)}`;
  else if (own(beat, 'sound')) body = `声音${AUDIO_LABEL[beat?.audio?.mode] ? `（${AUDIO_LABEL[beat.audio.mode]}）` : ''}：${clean(beat.sound)}`;
  else {
    const tags = [AUDIO_LABEL[beat?.audio?.mode], clean(beat?.delivery)].filter(Boolean);
    body = `${clean(beat?.speaker)}${tags.length ? `（${tags.join('；')}）` : ''}：${clean(beat?.line)}`;
  }
  return `[${n}] ${body}`;
}
export function sceneText(scene, from, to) {
  return arr(scene?.flow).slice(from - 1, to).map((b, i) => beatLine(b, from + i)).join('\n');
}

/** 与剧本估时同一口径：台词按字符语速，动作、字幕、声音按动作秒数或显式秒数。 */
export function beatEstimate(beat, params = {}) {
  const p = { ...DEFAULTS, ...params };
  if (own(beat, 'line')) return String(beat.line ?? '').replace(/\s+/g, '').length / p.charsPerSecond;
  if (own(beat, 'action')) return p.actionSeconds;
  return typeof beat?.seconds === 'number' && beat.seconds > 0 ? beat.seconds : p.actionSeconds;
}

/** 骨架：每场一段，覆盖整场。字段留空，检查不会通过，由作者拆段并填写。 */
export function seedStoryboard(script, { scriptName = '', limit = 15 } = {}) {
  const out = [`# 分镜 · ${clean(script?.source)}`, '', `- 剧本：${scriptName}`, `- 单段上限：${limit} 秒`, '- 待确认事项：'];
  for (const ep of arr(script?.episodes)) {
    arr(ep?.scenes).forEach((scene, si) => {
      const count = arr(scene?.flow).length, id = segmentId(ep.ep, si + 1);
      out.push('', `## 第 ${ep.ep} 集 第 ${si + 1} 场`, '', `- 集号：${ep.ep}`, `- 场号：${si + 1}`, '- 总段数：1', '- 待确认事项：',
        '', '| 段号 | 节拍 | 本段推进 |', '| --- | --- | --- |', `| ${id} | 1–${count} |  |`,
        '', `### ${id}`, '', '#### 本段剧本', '', '```text', sceneText(scene, 1, count), '```', '', '#### 分镜说明', '',
        ...STORYBOARD_FIELDS.map(f => `- ${f}：`));
    });
  }
  return out.join('\n') + '\n';
}

// 「- 名称：值」后可跟以两个空格缩进的续行，续行逐行并入该字段。
function fieldList(lines, keys, where, problems) {
  const values = {}, order = [];
  let current = null;
  for (const line of lines) {
    if (!line.trim()) { current = null; continue; }
    const m = line.match(/^- ([^：]+)：(.*)$/);
    if (m) { current = m[1].trim(); order.push(current); values[current] = m[2].trim(); continue; }
    if (current && /^ {2,}\S/.test(line)) { values[current] = [values[current], line.trim()].filter(Boolean).join('\n'); continue; }
    problems.push(`${where}：无法识别的行「${line.trim()}」`);
  }
  if (order.join('|') !== keys.join('|')) problems.push(`${where}：字段应依次为 ${keys.join('、')}，实际为 ${order.join('、') || '无'}`);
  return values;
}

/** 解析分镜文件。永不抛错：格式问题收进 problems。 */
export function parseStoryboard(text) {
  const problems = [];
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const sceneStarts = lines.map((l, i) => /^## /.test(l) ? i : -1).filter(i => i >= 0);
  const title = lines.findIndex(l => /^# /.test(l));
  if (title < 0 || !/^# 分镜 · \S/.test(lines[title])) problems.push('第一行标题应为「# 分镜 · 作品名」');
  const header = fieldList(lines.slice(title + 1, sceneStarts[0] ?? lines.length), HEADER_KEYS, '文件头', problems);
  const limitMatch = String(header['单段上限'] ?? '').match(/^(\d+(?:\.\d+)?) ?秒$/);
  const limit = limitMatch ? Number(limitMatch[1]) : null;
  if (!(limit > 0)) problems.push('文件头：单段上限应写成「15 秒」这样的正数秒');
  const scenes = sceneStarts.map((start, k) => {
    const block = lines.slice(start, sceneStarts[k + 1] ?? lines.length);
    const hm = block[0].match(/^## 第 (\d+) 集 第 (\d+) 场$/);
    const where = hm ? `第 ${hm[1]} 集第 ${hm[2]} 场` : `「${block[0]}」`;
    if (!hm) problems.push(`${where}：场标题应为「## 第 N 集 第 M 场」`);
    const ep = hm ? Number(hm[1]) : null, sceneIndex = hm ? Number(hm[2]) : null;
    const segStarts = block.map((l, i) => /^### /.test(l) ? i : -1).filter(i => i >= 0);
    const intro = block.slice(1, segStarts[0] ?? block.length);
    const tableAt = intro.findIndex(l => /^\| 段号 \| 节拍 \| 本段推进 \|$/.test(l.trim()));
    const meta = fieldList(intro.slice(0, tableAt < 0 ? intro.length : tableAt), SCENE_KEYS, where, problems);
    if (meta['集号'] !== String(ep) || meta['场号'] !== String(sceneIndex)) problems.push(`${where}：集号、场号应与场标题一致`);
    const table = [];
    if (tableAt < 0) problems.push(`${where}：缺少分段表「| 段号 | 节拍 | 本段推进 |」`);
    else {
      if (!/^\|\s*-+\s*\|\s*-+\s*\|\s*-+\s*\|$/.test(intro[tableAt + 1]?.trim() ?? '')) problems.push(`${where}：分段表缺少分隔行`);
      for (const row of intro.slice(tableAt + 2)) {
        if (!row.trim()) continue;
        const cells = row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const range = cells[1]?.match(/^(\d+)[–-](\d+)$|^(\d+)$/);
        if (cells.length !== 3 || !range) { problems.push(`${where}：分段表行「${row.trim()}」应为「| 段号 | 起–止 | 本段推进 |」`); continue; }
        table.push({ id: cells[0], beats: range[3] ? [Number(range[3]), Number(range[3])] : [Number(range[1]), Number(range[2])], progress: cells[2] });
      }
    }
    const segments = segStarts.map((s, j) => {
      const seg = block.slice(s, segStarts[j + 1] ?? block.length), id = seg[0].replace(/^### /, '').trim();
      const sw = `${where} ${id}`;
      const scriptAt = seg.indexOf('#### 本段剧本'), notesAt = seg.indexOf('#### 分镜说明');
      if (scriptAt < 0 || notesAt < 0 || notesAt < scriptAt) { problems.push(`${sw}：依次需要「#### 本段剧本」「#### 分镜说明」两个小节`); return { id, script: '', fields: {} }; }
      const fence = seg.slice(scriptAt + 1, notesAt).join('\n').trim().match(/^```text\n([\s\S]*?)\n?```$/);
      if (!fence) problems.push(`${sw}：本段剧本应放在一个 \`\`\`text 代码块里`);
      const fields = fieldList(seg.slice(notesAt + 1), STORYBOARD_FIELDS, `${sw} 分镜说明`, problems);
      return { id, script: fence ? fence[1].trim() : '', fields };
    });
    if (String(segments.length) !== meta['总段数']) problems.push(`${where}：总段数（${meta['总段数'] ?? '无'}）与段落数量（${segments.length}）不一致`);
    if (table.map(r => r.id).join('|') !== segments.map(s => s.id).join('|')) problems.push(`${where}：分段表段号与逐段区块不一致`);
    return { ep, sceneIndex, pending: meta['待确认事项'] ?? '', segments: segments.map((s, j) => ({ ...s, ep, sceneIndex, beats: table.find(r => r.id === s.id)?.beats ?? table[j]?.beats ?? null, progress: table.find(r => r.id === s.id)?.progress ?? '' })) };
  });
  return { header: { script: header['剧本'] ?? '', limit, pending: header['待确认事项'] ?? '' }, scenes, problems };
}

/** 全部段，按集、场、段顺序。 */
export const storyboardSegments = sb => arr(sb?.scenes).flatMap(s => s.segments);

/**
 * 对照剧本 JSON 检查分镜。errors 阻断；warnings 只提醒（整段粗估超过上限，但台词本身装得下）。
 * 内容是否写得好由独立上下文的分镜审核判断，这里只查工具能确定的事。
 */
export function storyboardErrors(sb, script, params = {}) {
  const errors = [...arr(sb?.problems)], warnings = [];
  const limit = sb?.header?.limit;
  const want = arr(script?.episodes).flatMap(ep => arr(ep?.scenes).map((_, i) => `${ep.ep}/${i + 1}`));
  const have = arr(sb?.scenes).map(s => `${s.ep}/${s.sceneIndex}`);
  if (want.join('|') !== have.join('|')) errors.push(`分镜应按顺序覆盖剧本的全部场次 ${want.join('、') || '无'}，实际为 ${have.join('、') || '无'}`);
  const counter = new Map();
  for (const sc of arr(sb?.scenes)) {
    const scene = arr(script?.episodes).find(e => e?.ep === sc.ep)?.scenes?.[sc.sceneIndex - 1];
    if (!scene) continue;
    const where = `第 ${sc.ep} 集第 ${sc.sceneIndex} 场`, flow = arr(scene.flow), lines = flow.filter(b => own(b, 'line')).map(b => clean(b.line)).filter(Boolean);
    let cursor = 1;
    sc.segments.forEach((seg, j) => {
      const n = (counter.get(sc.ep) ?? 0) + 1; counter.set(sc.ep, n);
      const sw = `${where} ${seg.id}`;
      if (seg.id !== segmentId(sc.ep, n)) errors.push(`${sw}：段号应为 ${segmentId(sc.ep, n)}（集内按顺序连号）`);
      const [a, b] = seg.beats ?? [];
      if (!(a >= 1 && b >= a && b <= flow.length)) { errors.push(`${sw}：节拍范围无效（本场共 ${flow.length} 拍）`); return; }
      if (a !== cursor) errors.push(`${sw}：应从第 ${cursor} 拍开始，实际从第 ${a} 拍开始（每拍恰好归属一段、顺序不倒退）`);
      cursor = b + 1;
      if (seg.script !== sceneText(scene, a, b)) errors.push(`${sw}：本段剧本与剧本 JSON 第 ${a}–${b} 拍不一致，用 storyboard 命令重新生成这一块`);
      if (!clean(seg.progress)) errors.push(`${sw}：分段表缺少本段推进`);
      for (const f of REQUIRED_FIELDS) if (!clean(seg.fields[f])) errors.push(`${sw}：「${f}」不能留空${['环境音', '音效', '背景音乐'].includes(f) ? '，没有合适内容时写「无」' : ''}`);
      for (const [f, v] of Object.entries(seg.fields)) if (/\[[^\]\n]*\]|（待填）|TODO/.test(v)) errors.push(`${sw}：「${f}」残留占位符`);
      const prev = sc.segments[j - 1];
      if (!prev && !empty(seg.fields['段首复写'])) errors.push(`${sw}：场内第一段没有可复写的上一段，「段首复写」应留空`);
      if (prev && clean(prev.fields['供下一段复写的内容']) !== clean(seg.fields['段首复写']) && !(empty(prev.fields['供下一段复写的内容']) && empty(seg.fields['段首复写']))) errors.push(`${sw}：「段首复写」应与 ${prev.id} 的「供下一段复写的内容」逐字相同`);
      if (!sc.segments[j + 1] && !empty(seg.fields['供下一段复写的内容'])) errors.push(`${sw}：场内最后一段不跨场复写，「供下一段复写的内容」应留空`);
      for (const f of ['段首复写', '供下一段复写的内容']) {
        const hit = lines.find(l => clean(seg.fields[f]).includes(l));
        if (hit) errors.push(`${sw}：「${f}」不能包含台词「${hit}」——跨段延续台词使用制作阶段的 audioRefs，不重播`);
      }
      if (limit > 0) {
        const beats = flow.slice(a - 1, b), speech = beats.filter(x => own(x, 'line')).reduce((s, x) => s + beatEstimate(x, params), 0);
        const total = beats.reduce((s, x) => s + beatEstimate(x, params), 0);
        if (speech > limit) errors.push(`${sw}：台词估时 ${Math.round(speech * 10) / 10} 秒已超过单段上限 ${limit} 秒，在语意完整的停顿处拆段`);
        else if (total > limit) warnings.push(`${sw}：整段粗估 ${Math.round(total * 10) / 10} 秒超过单段上限 ${limit} 秒；同时发生的动作与台词只计一次后仍超出时拆段`);
      }
    });
    if (cursor !== flow.length + 1) errors.push(`${where}：第 ${cursor}–${flow.length} 拍没有归属任何段`);
  }
  return { errors: [...new Set(errors)], warnings };
}
