// Creation-owned v3 consumer contracts. No imports from other skills.
import { documentProblems, scriptParams, endPosition } from './document.mjs';
const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && !!x.trim();
const positive = x => Number.isFinite(x) && x > 0;
const lineChars = line => String(line ?? '').replace(/\s+/g, '').length;
// One unrounded estimator for defaults and explicit overrides.
export function beatSeconds(beat, params = {}) {
  params = scriptParams({params});
  if (!object(beat) || Object.hasOwn(beat, 'action') === Object.hasOwn(beat, 'line')) return null;
  if (Object.hasOwn(beat, 'action')) return text(beat.action) && positive(params?.actionSeconds) ? params.actionSeconds : null;
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
        if (!Array.isArray(cut.beats) || cut.beats.length !== 2 || !cut.beats.every(n => Number.isInteger(n) && n > 0) || cut.beats[0] > cut.beats[1]) errors.push(`${seg.id} beats 必须为正整数顺序区间`);
        if (!Array.isArray(cut.characters) || cut.characters.some(id => !/^C\d{2,}$/.test(id)) || new Set(cut.characters).size !== cut.characters.length) errors.push(`${seg.id} characters 非法`);
        if (cut.props !== undefined && (!Array.isArray(cut.props) || cut.props.some(id => !/^P\d{2,}$/.test(id)) || new Set(cut.props).size !== cut.props.length)) errors.push(`${seg.id} props 非法`);
      }
    }
  }
  return errors;
}
export function scriptProblems(script) {
  if (!object(script) || script.schemaVersion !== 3) return ['script.schemaVersion 必须为 3；旧字段不能静默读取'];
  const errors = documentProblems(script, 'script');
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
      for (const b of sc.flow) {
        if (beatSeconds(b, script.params) === null || (text(b.line) && ![...sc.characters, 'VO'].includes(b.speaker))) errors.push(`E${ep.ep} flow 必须为动作或合法人物台词`);
        if (object(b) && b.delivery !== undefined && (!text(b.line) || !text(b.delivery))) errors.push(`E${ep.ep} delivery 只允许台词的非空表演说明`);
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
  if (!object(outline) || outline.schemaVersion !== 3) return ['outline.schemaVersion 必须为 3'];
  const errors = documentProblems(outline, 'outline');
  if (!text(outline.source)) errors.push('outline.source 不能为空');
  if (!text(outline.params?.genre) || !['忠实','抽核','借壳','原创'].includes(outline.params?.adaptMode)) errors.push('outline genre/adaptMode 非法');
  if (!object(outline.story) || ['premise','throughline','ending'].some(k => !text(outline.story[k])) || !Array.isArray(outline.story.focusCharacterIds) || !outline.story.focusCharacterIds.length) errors.push('outline story 核心内容缺失');
  for (const [value, key] of [[outline.story, 'drive'], [outline.adaptation, 'core']]) if (object(value) && Object.hasOwn(value, key)) errors.push(`outline ${key} 已停用，请迁移`);
  if (!positive(outline.params?.minutesPerEpisode) || !Number.isInteger(outline.params?.episodes) || outline.params.episodes < 1) errors.push('outline 集数/目标时长非法');
  for (const k of ['characters','scenes','props','beats','episodes']) if (!(k === 'props' && outline[k] === undefined) && !Array.isArray(outline[k])) errors.push(`outline.${k} 必须为数组`);
  if (errors.length) return errors;
  for (const k of ['characters','scenes','props','beats']) {
    const prefix = {characters:'C',scenes:'S',props:'P',beats:'B'}[k]; const seen = new Set();
    for (const item of outline[k] ?? []) {
      if (!object(item) || !new RegExp(`^${prefix}\\d{2,}$`).test(item.id) || seen.has(item.id)) errors.push(`outline.${k} ID 非法或重复`);
      if (k !== 'beats' && !text(item?.name)) errors.push(`outline.${k} 名称不能为空`);
      seen.add(item?.id);
    }
  }
  if (errors.length) return errors;
  if (new Set(outline.story.focusCharacterIds).size !== outline.story.focusCharacterIds.length || outline.story.focusCharacterIds.some(id => !outline.characters.some(c => c.id === id))) errors.push('outline focusCharacterIds 无效或重复');
  const eps = new Set();
  for (const ep of outline.episodes) {
    if (!object(ep) || !Number.isInteger(ep.ep) || ep.ep < 1 || ep.ep > outline.params.episodes || eps.has(ep.ep) || !text(ep.opening) || !MODES.includes(ep.ending?.mode) || !text(ep.ending?.event)) errors.push('outline 分集开场/集尾/集号非法');
    if (object(ep) && Object.hasOwn(ep, 'stateChange')) errors.push('outline stateChange 已停用，请迁移');
    eps.add(ep?.ep);
  }
  if (eps.size !== outline.params.episodes) errors.push('outline 分集数量与总集数不一致');
  let previousEpisode = 0;
  for (const beat of outline.beats) {
    if (beat?.episode < previousEpisode) errors.push('outline 节点所属集倒序');
    previousEpisode = beat?.episode;
    if (!object(beat) || !eps.has(beat.episode) || (beat.position !== undefined && !['opening','early','middle','late','ending'].includes(beat.position)) || (beat.kind !== undefined && !['event','pressure','turn','payoff'].includes(beat.kind)) || !text(beat.setup) || !text(beat.outcome)) errors.push('outline 节点所属集或内容非法');
    else if (beat.weight !== undefined && (beat.kind !== 'payoff' || !['minor','major'].includes(beat.weight))) errors.push('outline 节点 weight 与 kind 不一致');
    if (object(beat) && Object.hasOwn(beat, 'type')) errors.push('outline beats.type 已停用，请迁移');
  }
  for (const prop of outline.props ?? []) if (prop?.beatIds !== undefined && (!Array.isArray(prop.beatIds) || prop.beatIds.some(id => !outline.beats.some(b => b?.id === id)))) errors.push('outline 道具 beatIds 引用无效');
  for (const ep of outline.episodes) for (const [key, assets] of [['characterIds','characters'],['sceneIds','scenes'],['propIds','props']]) {
    const ids = ep?.[key];
    if (key === 'propIds' && ids === undefined) continue;
    if (!Array.isArray(ids) || (key !== 'propIds' && !ids.length) || new Set(ids).size !== ids.length || ids.some(id => !(outline[assets] ?? []).some(a => a?.id === id))) errors.push(`outline E${ep?.ep} ${key} 引用无效`);
  }
  if (!outline.beats.some(b => b?.id === outline.story?.endingBeatId && b?.episode === outline.params.episodes)) errors.push('outline 终局节点必须属于最终集');
  return errors;
}
export function reconcile(doc, script, outline) {
  const errors = [];
  for (const [label, upstream] of [['script', script], ['outline', outline]])
    if (upstream && upstream.source !== doc.source) errors.push(`${label}.source 与 creation 不一致`);
  if (script && outline && script.source !== outline.source) errors.push('script/outline source 不一致');
  if (script && outline) for (const ep of script.episodes) {
    if (Object.hasOwn(ep, 'opening') || Object.hasOwn(ep, 'ending')) errors.push(`script E${ep.ep} 重复保存上游计划，请显式迁移`);
    if (!outline.episodes.some(o => o.ep === ep.ep)) errors.push(`script E${ep.ep} 在大纲里不存在`);
    if (Math.abs(ep.targetSeconds - outline.params.minutesPerEpisode * 60) > 1e-9) errors.push(`E${ep.ep} 剧本目标时长与大纲不一致`);
    const ids = outline.beats.filter(b => b.episode === ep.ep).map(b => b.id);
    if (JSON.stringify(ids) !== JSON.stringify(ep.beatClaims?.map(c => c.beatId))) errors.push(`E${ep.ep} 节点认领与大纲顺序/身份不一致`);
    for (const sc of ep.scenes) {
      if (!outline.scenes.some(x => x.id === sc.sceneId)) errors.push(`未知场景 ${sc.sceneId}`);
      for (const id of sc.characters) if (!outline.characters.some(x => x.id === id)) errors.push(`未知人物 ${id}`);
      for (const id of sc.props ?? []) if (!(outline.props ?? []).some(x => x.id === id)) errors.push(`未知道具 ${id}`);
    }
  }
  for (const ep of doc.episodes) {
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
