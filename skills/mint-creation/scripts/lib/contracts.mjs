// Creation-owned v4 upstream consumer contracts; creation stays v3. No sibling imports.
import {sourceProblems, transformationProblems, audioProblems, continuationProblems} from './source.mjs';
import { documentProblems, scriptParams, endPosition } from './document.mjs';
const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && !!x.trim();
const positive = x => Number.isFinite(x) && x > 0;
const lineChars = line => String(line ?? '').replace(/\s+/g, '').length;
// One unrounded estimator for defaults and explicit overrides.
export function beatSeconds(beat, params = {}) {
  params = scriptParams({params});
  if (!object(beat)) return null;
  const kinds = ['action','line','subtitle','sound'].filter(k => Object.hasOwn(beat,k));
  if (kinds.length !== 1 || !text(beat[kinds[0]])) return null;
  if (beat.seconds !== undefined && (!['subtitle','sound'].includes(kinds[0]) || !positive(beat.seconds))) return null;
  if (kinds[0] !== 'line') return beat.seconds ?? params.actionSeconds;
  if (!text(beat.line) || !positive(params?.charsPerSecond)) return null;
  const seconds = lineChars(beat.line) / params.charsPerSecond;
  return positive(seconds) ? seconds : null;
}

export const MODES = ['suspense', 'closure', 'open'];
export function positionIndex(ep, pos) {
  if (!Array.isArray(pos) || pos.length !== 2 || !pos.every(Number.isInteger)) return null;
  const [s, b] = pos;
  if (s < 1 || b < 1 || !ep.scenes?.[s - 1]?.flow?.[b - 1]) return null;
  return ep.scenes.slice(0, s - 1).reduce((n, sc) => n + sc.flow.length, 0) + b;
}
export function endingProblems(ending, label) {
  const errors = [];
  if (!object(ending) || !MODES.includes(ending.mode) || !text(ending.event)) errors.push(`${label} ending 必须包含合法 mode 与非空 event`);
  if (object(ending) && Object.keys(ending).some(k => !['mode', 'event'].includes(k))) errors.push(`${label} ending 只允许 mode/event，不复制问题计划`);
  return errors;
}
export function shapeProblems(doc) {
  const errors = [];
  if (!object(doc)) return ['creation.json 必须是对象'];
  if (doc.schemaVersion !== 3) errors.push('creation.schemaVersion 必须为 3；迁移见 references/migration.md');
  errors.push(...documentProblems(doc));
  if (!text(doc.source)) errors.push('缺少 source');
  if (doc.video !== undefined && (!object(doc.video) || !text(doc.video.model))) errors.push('video.model 必须为非空字符串');
  if (doc.promptLang !== undefined && !['en','zh'].includes(doc.promptLang)) errors.push('promptLang 必须为 en/zh');
  if (!object(doc.params)) errors.push('params 必须显式保存');
  for (const key of ['maxSegmentSeconds', 'maxOnScreen']) if (!positive(doc.params?.[key])) errors.push(`params.${key} 必须为有限正数`);
  if (!Number.isInteger(doc.params?.maxOnScreen)) errors.push('maxOnScreen 必须为整数');
  if (!Number.isFinite(doc.params?.tolerance) || doc.params.tolerance < 0 || doc.params.tolerance >= 1) errors.push('tolerance 必须为 [0,1) 数值');
  if (!Array.isArray(doc.episodes) || !doc.episodes.length) return [...errors, 'episodes 必须为非空数组'];
  const seen = new Set();
  for (const ep of doc.episodes) {
    if (!object(ep)) { errors.push('episode 必须为对象'); continue; }
    if (!Number.isInteger(ep.ep) || ep.ep < 1 || seen.has(ep.ep)) errors.push('集号必须为唯一正整数');
    seen.add(ep.ep);
    for (const key of ['opening', 'ending', 'endBeat']) if (Object.hasOwn(ep, key)) errors.push(`E${ep.ep} ${key} 不再持久化，请迁移并读取当前上游`);
    if (ep.openingBeat !== undefined && (!Array.isArray(ep.openingBeat) || ep.openingBeat.length !== 2 || !ep.openingBeat.every(n => Number.isInteger(n) && n > 0))) errors.push(`E${ep.ep} openingBeat 必须为有效可选坐标`);
    if (['hook', 'cliff', 'closure', 'hookBeat'].some(k => k in ep)) errors.push('拒绝旧开场/集尾字段');
    if (!Array.isArray(ep.segments) || !ep.segments.length) { errors.push(`E${ep.ep} segments 必须为非空数组`); continue; }
    for (const seg of ep.segments) {
      if (!object(seg)) { errors.push('segment 必须为对象'); continue; }
      if (!text(seg.id) || !Number.isInteger(seg.sceneIndex) || seg.sceneIndex < 1 || !text(seg.prompt)) errors.push('segment 缺少合法 id/sceneIndex/prompt');
      if (!Array.isArray(seg.images) || seg.images.some(img => !object(img) || !['character', 'scene', 'prop'].includes(img.kind) || !/^[CSP]\d{2,}$/.test(img.ref) || img.ref[0] !== ({character:'C',scene:'S',prop:'P'})[img.kind])) errors.push(`${seg.id} images 非法`);
      if (!Array.isArray(seg.cuts) || !seg.cuts.length) { errors.push(`${seg.id} cuts 必须为非空数组`); continue; }
      for (const cut of seg.cuts) {
        if (!object(cut)) { errors.push('cut 必须为对象'); continue; }
        if (!positive(cut.seconds)) errors.push(`${seg.id} seconds 必须为有限正数`);
        if (cut.audioRefs !== undefined && (!Array.isArray(cut.audioRefs) || cut.audioRefs.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(n => Number.isInteger(n) && n > 0)) || new Set(cut.audioRefs.map(p => JSON.stringify(p))).size !== cut.audioRefs.length)) errors.push(`${seg.id} audioRefs 必须为唯一正整数坐标数组`);
        if (!Array.isArray(cut.beats) || cut.beats.length !== 2 || !cut.beats.every(n => Number.isInteger(n) && n > 0) || cut.beats[0] > cut.beats[1]) errors.push(`${seg.id} beats 必须为正整数顺序区间`);
        if (!Array.isArray(cut.characters) || cut.characters.some(id => !/^C\d{2,}$/.test(id)) || new Set(cut.characters).size !== cut.characters.length) errors.push(`${seg.id} characters 非法`);
        if (cut.props !== undefined && (!Array.isArray(cut.props) || cut.props.some(id => !/^P\d{2,}$/.test(id)) || new Set(cut.props).size !== cut.props.length)) errors.push(`${seg.id} props 非法`);
      }
    }
  }
  return errors;
}
export function scriptProblems(script) {
  if (!object(script) || script.schemaVersion !== 4) return ['script.schemaVersion 必须为 4；旧字段不能静默读取'];
  const errors = [...documentProblems(script, 'script'), ...sourceProblems(script)];
  for (const k of ['candidates','context']) if (Object.hasOwn(script,k)) errors.push(`${k} 不得进入正式正文；使用 notes 或 .work`);
  if (!text(script.source)) errors.push('script.source 不能为空');
  const params = scriptParams(script);
  for (const k of ['charsPerSecond', 'actionSeconds']) if (!positive(params[k])) errors.push(`script.params.${k} 非法`);
  if (!Number.isFinite(params.tolerance) || params.tolerance < 0 || params.tolerance >= 1) errors.push('script.params.tolerance 非法');
  if (!Array.isArray(script.episodes) || !script.episodes.length) return [...errors, 'script.episodes 必须为非空数组'];
  const seen = new Set(), claimedGlobally = new Set();
  for (const ep of script.episodes) {
    if (!object(ep)) { errors.push('script episode 非法'); continue; }
    if (!Number.isInteger(ep.ep) || ep.ep < 1 || seen.has(ep.ep)) errors.push('script 集号非法或重复');
    seen.add(ep.ep);
    if (!positive(ep.targetSeconds)) errors.push(`E${ep.ep} targetSeconds 必须为有限正数`);
    if (ep.opening !== undefined && !text(ep.opening)) errors.push(`E${ep.ep} opening 不能为空`);
    if (ep.ending !== undefined) errors.push(...endingProblems(ep.ending, `script E${ep.ep}`));
    for (const key of ['endBeat','seedNote']) if (Object.hasOwn(ep,key)) errors.push(`E${ep.ep} ${key} 已停用，请显式迁移`);
    if (['hook','cliff','closure','hookBeat'].some(k => k in ep)) errors.push('script 拒绝旧开场/集尾字段');
    if (!Array.isArray(ep.scenes) || !ep.scenes.length) { errors.push(`E${ep.ep} scenes 不能为空`); continue; }
    let validShape = true;
    for (const sc of ep.scenes) {
      if (!object(sc) || !/^S\d{2,}$/.test(sc.sceneId) || !Array.isArray(sc.characters) || (sc.props !== undefined && (!Array.isArray(sc.props) || sc.props.some(id => typeof id !== 'string' || !/^P\d{2,}$/.test(id)) || new Set(sc.props).size !== sc.props.length)) || !Array.isArray(sc.flow) || !sc.flow.length) { errors.push(`E${ep.ep} scene 非法`); validShape = false; continue; }
      if (sc.characters.some(id => !/^C\d{2,}$/.test(id)) || new Set(sc.characters).size !== sc.characters.length) errors.push(`E${ep.ep} 场次人物 ID 非法或重复`);
      if (sc.lighting !== undefined && !text(sc.lighting)) errors.push(`E${ep.ep} lighting 必须为非空字符串`);
      for (const k of ['candidates','context']) if (Object.hasOwn(sc,k)) errors.push(`${k} 不得进入正式场次；使用 notes 或 .work`);
      if (sc.notes !== undefined && (!Array.isArray(sc.notes) || sc.notes.some(n => !object(n) || !text(n.text) || !['performance','background','continuity','restriction'].includes(n.kind)))) errors.push(`E${ep.ep} notes 非法`);
      for (const note of Array.isArray(sc.notes) ? sc.notes : []) {
        errors.push(...transformationProblems(note?.transformation, 'note'));
        for (const k of ['candidate','candidates']) if (Object.hasOwn(note ?? {},k)) errors.push('转译候选必须留在 .work');
        if (script.provenance && (!Array.isArray(note?.sourceRefs) || !note.sourceRefs.length)) errors.push('解析 notes 缺少 sourceRefs');
      }
      for (const b of sc.flow) {
        if (beatSeconds(b, script.params) === null || (text(b?.line) && ![...sc.characters, 'VO'].includes(b.speaker))) errors.push(`E${ep.ep} flow 必须为 action/line/subtitle/sound 之一及合法发声者`);
        if (!object(b)) continue;
        for (const k of ['candidate','candidates']) if (Object.hasOwn(b,k)) errors.push('转译候选必须留在 .work');
        if (b.speaker !== undefined && !text(b.line)) errors.push('非台词正文不能带 speaker');
        if (b.delivery !== undefined && (!text(b.line) || !text(b.delivery))) errors.push(`E${ep.ep} delivery 只允许台词的非空表演说明`);
        errors.push(...audioProblems(b, 'flow'), ...transformationProblems(b.transformation, 'flow'));
        if (script.provenance && (!Array.isArray(b.sourceRefs) || !b.sourceRefs.length)) errors.push('解析 flow 缺少 sourceRefs');
      }
    }
    if (!validShape) continue;
    if (ep.openingBeat !== undefined && positionIndex(ep, ep.openingBeat) === null) errors.push(`E${ep.ep} openingBeat 无效`);
    if (ep.beatClaims === undefined) continue;
    if (!Array.isArray(ep.beatClaims)) { errors.push(`E${ep.ep} beatClaims 必须为数组`); continue; }
    let prev = 0; const ids = new Set();
    for (const c of ep.beatClaims) {
      const start = positionIndex(ep, c?.start), end = positionIndex(ep, c?.end);
      if (!/^B\d{2,}$/.test(c?.beatId) || ids.has(c?.beatId) || claimedGlobally.has(c?.beatId) || start === null || end === null || start > end || start <= prev) errors.push(`E${ep.ep} 节点认领无效/重复/倒序/重叠`);
      ids.add(c?.beatId); claimedGlobally.add(c?.beatId); prev = end ?? prev;
    }
  }
  return errors;
}
export function outlineProblems(outline) {
  if (!object(outline) || outline.schemaVersion !== 4) return ['outline.schemaVersion 必须为 4'];
  const errors = [...documentProblems(outline, 'outline'), ...sourceProblems(outline, {required:true})];
  if (!text(outline.source)) errors.push('outline.source 不能为空');
  for (const key of ['adaptation','arcs']) if (Object.hasOwn(outline,key)) errors.push(`outline.${key} 已移除`);
  for (const key of ['adaptMode','minutesPerEpisode','episodes']) if (Object.hasOwn(outline.params ?? {},key)) errors.push(`outline.params.${key} 已移除`);
  if (!object(outline.story) || !text(outline.story.summary)) errors.push('outline.story.summary 不能为空');
  for (const k of ['characters','scenes','props','beats','episodes']) if (!(k === 'props' && outline[k] === undefined) && !Array.isArray(outline[k])) errors.push(`outline.${k} 必须为数组`);
  if (errors.length) return errors;
  for (const k of ['characters','scenes','props','beats']) {
    const prefix = {characters:'C',scenes:'S',props:'P',beats:'B'}[k], seen = new Set();
    for (const item of outline[k] ?? []) {
      if (!object(item) || !new RegExp(`^${prefix}\\d{2,}$`).test(item.id) || seen.has(item.id)) errors.push(`outline.${k} ID 非法或重复`);
      if (k !== 'beats' && !text(item?.name)) errors.push(`outline.${k} 名称不能为空`);
      if (!Array.isArray(item?.sourceRefs) || !item.sourceRefs.length) errors.push(`outline.${k} 缺少 sourceRefs`);
      if (k === 'characters' && !['lead','support','functional'].includes(item?.tier)) errors.push('outline tier 非法');
      if (k === 'scenes' && typeof item?.primary !== 'boolean') errors.push('outline primary 非法');
      if (k === 'scenes' && Object.hasOwn(item ?? {},'reusePlan')) errors.push('outline reusePlan 已移交美术');
      seen.add(item?.id);
    }
  }
  const focus = outline.story?.focusCharacterIds;
  if (focus !== undefined && (!Array.isArray(focus) || new Set(focus).size !== focus.length || focus.some(id => !outline.characters.some(c => c?.id === id)))) errors.push('outline focusCharacterIds 无效或重复');
  const eps = new Set();
  for (const ep of outline.episodes) {
    if (!object(ep) || !Number.isInteger(ep.ep) || ep.ep < 1 || eps.has(ep.ep) || !text(ep.synopsis)) errors.push('outline 集号或 synopsis 非法');
    if (ep?.opening !== undefined && !text(ep.opening)) errors.push('outline opening 非法');
    if (ep?.ending !== undefined && (!object(ep.ending) || !text(ep.ending.event) || (ep.ending.mode !== undefined && !MODES.includes(ep.ending.mode)))) errors.push('outline ending 非法');
    if (!Array.isArray(ep?.sourceRefs) || !ep.sourceRefs.length) errors.push('outline episode 缺少 sourceRefs');
    eps.add(ep?.ep);
  }
  let previousEpisode = 0;
  for (const beat of outline.beats) {
    if (beat?.episode < previousEpisode) errors.push('outline 节点所属集倒序');
    previousEpisode = beat?.episode;
    if (!object(beat) || !eps.has(beat.episode) || !text(beat.setup) || !text(beat.outcome)) errors.push('outline 节点所属集或内容非法');
    for (const k of ['position','kind','weight','type']) if (Object.hasOwn(beat ?? {},k)) errors.push(`outline beats.${k} 已移除`);
  }
  for (const prop of outline.props ?? []) if (prop?.beatIds !== undefined && (!Array.isArray(prop.beatIds) || prop.beatIds.some(id => !outline.beats.some(b => b?.id === id)))) errors.push('outline 道具 beatIds 引用无效');
  for (const ep of outline.episodes) for (const [key, assets] of [['characterIds','characters'],['sceneIds','scenes'],['propIds','props']]) {
    const ids = ep?.[key];
    if (key === 'propIds' && ids === undefined) continue;
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some(id => !(outline[assets] ?? []).some(a => a?.id === id))) errors.push(`outline E${ep?.ep} ${key} 引用无效`);
  }
  if (outline.story.endingBeatId !== undefined && !outline.beats.some(b => b?.id === outline.story.endingBeatId && b?.episode === outline.provenance.totalEpisodes)) errors.push('outline 终局节点需要已知最终集');
  return errors;
}
export function reconcile(doc, script, outline) {
  const errors = [];
  for (const [label, upstream] of [['script', script], ['outline', outline]])
    if (upstream && upstream.source !== doc.source) errors.push(`${label}.source 与 creation 不一致`);
  if (script && outline && script.source !== outline.source) errors.push('script/outline source 不一致');
  if (script?.provenance && outline) for (const document of script.provenance.documents ?? []) {
    const upstream = outline.provenance?.documents?.find(d => d.id === document.id);
    if (!upstream) errors.push(`script 来源 ${document.id} 不在 outline.provenance 中`);
    else if (document.sha256 !== upstream.sha256 || document.lineCount !== upstream.lineCount)
      errors.push(`script 来源 ${document.id} 与 outline 版本不一致（sha256/lineCount）`);
    // Paths are relative to each stage's artifact, not coordination identities.
  }
  if (script && outline) for (const ep of script.episodes) {
    if (Object.hasOwn(ep, 'opening') || Object.hasOwn(ep, 'ending')) errors.push(`script E${ep.ep} 重复保存上游计划，请显式迁移`);
    if (!outline.episodes.some(o => o.ep === ep.ep)) errors.push(`script E${ep.ep} 在大纲里不存在`);
    const ids = outline.beats.filter(b => b.episode === ep.ep).map(b => b.id);
    if (JSON.stringify(ids) !== JSON.stringify(ep.beatClaims?.map(c => c.beatId))) errors.push(`E${ep.ep} 节点认领与大纲顺序/身份不一致`);
    for (const sc of ep.scenes) {
      if (!outline.scenes.some(x => x.id === sc.sceneId)) errors.push(`未知场景 ${sc.sceneId}`);
      for (const id of sc.characters) if (!outline.characters.some(x => x.id === id)) errors.push(`未知人物 ${id}`);
      for (const id of sc.props ?? []) if (!(outline.props ?? []).some(x => x.id === id)) errors.push(`未知道具 ${id}`);
    }
  }
  for (const ep of doc.episodes) {
    errors.push(...continuationProblems(ep, script?.episodes.find(s => s.ep === ep.ep)));
    const coordinates = ep.segments.flatMap(seg => seg.cuts.map(cut => ({scene:seg.sceneIndex, from:cut.beats[0], to:cut.beats[1]})));
    let previous = null;
    for (const c of coordinates) {
      if ((!previous && (c.scene !== 1 || c.from !== 1)) || (previous && c.scene !== previous.scene && (c.scene !== previous.scene + 1 || c.from !== 1))) errors.push(`E${ep.ep} 本地场次／节拍认领起点不连续`);
      if (previous && (c.scene < previous.scene || (c.scene === previous.scene && c.from !== previous.to + 1))) errors.push(`E${ep.ep} 本地节拍认领倒序/重叠/不连续`);
      previous = c;
    }
    if (ep.openingBeat && !coordinates.some(c => c.scene === ep.openingBeat[0] && c.from <= ep.openingBeat[1] && c.to >= ep.openingBeat[1])) errors.push(`E${ep.ep} openingBeat 未落在实际镜头`);
    const s = script?.episodes.find(x => x.ep === ep.ep);
    if (script && !s) errors.push(`E${ep.ep} 在剧本里不存在`);
    if (outline && !outline.episodes.some(x => x.ep === ep.ep)) errors.push(`E${ep.ep} 在大纲里不存在`);
    if (s) {
      if (JSON.stringify(ep.openingBeat) !== JSON.stringify(s.openingBeat)) errors.push(`E${ep.ep} openingBeat 与当前剧本显式标注不一致`);
      if (s.openingBeat && !coordinates.some(c => c.scene === s.openingBeat[0] && c.from <= s.openingBeat[1] && c.to >= s.openingBeat[1])) errors.push(`E${ep.ep} openingBeat 未落在实际镜头`);
      const end = endPosition(s), last = coordinates.at(-1);
      if (!last || end?.[0] !== last.scene || end?.[1] !== last.to) errors.push(`E${ep.ep} 最后镜头未覆盖实际正文结束坐标`);
    }
  }
  return errors;
}
