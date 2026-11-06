// Creation-owned consumer contracts. No imports from other skills.
const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && !!x.trim();
const positive = x => Number.isFinite(x) && x > 0;
const lineChars = line => String(line ?? '').replace(/\s+/g, '').length;
// Same unrounded estimator and invalid-value semantics as the v2 script contract.
export function beatSeconds(beat, params = {}) {
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
  if (doc.schemaVersion !== 2) errors.push('creation.schemaVersion 必须为 2；迁移见 references/migration.md');
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
    if (!text(ep.opening)) errors.push(`E${ep.ep} opening 不能为空`);
    errors.push(...endingProblems(ep.ending, `E${ep.ep}`));
    for (const key of ['openingBeat', 'endBeat']) if (!Array.isArray(ep[key]) || ep[key].length !== 2 || !ep[key].every(n => Number.isInteger(n) && n > 0)) errors.push(`E${ep.ep} ${key} 必须为有效坐标`);
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
        if (cut.props !== undefined && (!Array.isArray(cut.props) || cut.props.some(id => !/^P\d{2,}$/.test(id)))) errors.push(`${seg.id} props 非法`);
      }
    }
  }
  return errors;
}
export function scriptProblems(script) {
  if (!object(script) || script.schemaVersion !== 2) return ['script.schemaVersion 必须为 2；旧字段不能静默读取'];
  const errors = [];
  for (const k of ['charsPerSecond', 'actionSeconds']) if (!positive(script.params?.[k])) errors.push(`script.params.${k} 非法`);
  if (!Array.isArray(script.episodes) || !script.episodes.length) return [...errors, 'script.episodes 必须为非空数组'];
  const seen = new Set(), claimedGlobally = new Set();
  for (const ep of script.episodes) {
    if (!object(ep)) { errors.push('script episode 非法'); continue; }
    if (!Number.isInteger(ep.ep) || ep.ep < 1 || seen.has(ep.ep)) errors.push('script 集号非法或重复');
    seen.add(ep.ep);
    if (!positive(ep.targetSeconds)) errors.push(`E${ep.ep} targetSeconds 必须为有限正数`);
    if (!text(ep.opening)) errors.push(`E${ep.ep} opening 不能为空`);
    errors.push(...endingProblems(ep.ending, `script E${ep.ep}`));
    if (['hook','cliff','closure','hookBeat'].some(k => k in ep)) errors.push('script 拒绝旧开场/集尾字段');
    if (!Array.isArray(ep.scenes) || !ep.scenes.length) { errors.push(`E${ep.ep} scenes 不能为空`); continue; }
    let validShape = true;
    for (const sc of ep.scenes) {
      if (!object(sc) || !/^S\d{2,}$/.test(sc.sceneId) || !Array.isArray(sc.characters) || (sc.props !== undefined && (!Array.isArray(sc.props) || sc.props.some(id => typeof id !== 'string' || !/^P\d{2,}$/.test(id)) || new Set(sc.props).size !== sc.props.length)) || !Array.isArray(sc.flow) || !sc.flow.length) { errors.push(`E${ep.ep} scene 非法`); validShape = false; continue; }
      for (const b of sc.flow) if (beatSeconds(b, script.params) === null || (text(b.line) && ![...sc.characters, 'VO'].includes(b.speaker))) errors.push(`E${ep.ep} flow 必须为动作或合法人物台词`);
    }
    if (!validShape) continue;
    if (positionIndex(ep, ep.openingBeat) === null) errors.push(`E${ep.ep} openingBeat 无效`);
    const count = ep.scenes.reduce((n, s) => n + s.flow.length, 0);
    if (positionIndex(ep, ep.endBeat) !== count) errors.push(`E${ep.ep} endBeat 必须指向最后一拍`);
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
  if (!object(outline) || outline.schemaVersion !== 2) return ['outline.schemaVersion 必须为 2'];
  const errors = [];
  if (!positive(outline.params?.minutesPerEpisode) || !Number.isInteger(outline.params?.episodes) || outline.params.episodes < 1) errors.push('outline 集数/目标时长非法');
  for (const k of ['characters','scenes','props','beats','episodes']) if (!Array.isArray(outline[k])) errors.push(`outline.${k} 必须为数组`);
  if (errors.length) return errors;
  for (const k of ['characters','scenes','props','beats']) {
    const prefix = {characters:'C',scenes:'S',props:'P',beats:'B'}[k]; const seen = new Set();
    for (const item of outline[k]) {
      if (!object(item) || !new RegExp(`^${prefix}\\d{2,}$`).test(item.id) || seen.has(item.id)) errors.push(`outline.${k} ID 非法或重复`);
      seen.add(item?.id);
    }
  }
  const eps = new Set();
  for (const ep of outline.episodes) {
    if (!object(ep) || !Number.isInteger(ep.ep) || ep.ep < 1 || ep.ep > outline.params.episodes || eps.has(ep.ep) || !text(ep.opening) || !MODES.includes(ep.ending?.mode) || !text(ep.ending?.event)) errors.push('outline 分集开场/集尾/集号非法');
    eps.add(ep?.ep);
  }
  if (eps.size !== outline.params.episodes) errors.push('outline 分集数量与总集数不一致');
  for (const beat of outline.beats) {
    if (!object(beat) || !eps.has(beat.episode) || !['opening','early','middle','late','ending'].includes(beat.position) || !['event','pressure','turn','payoff'].includes(beat.kind) || !text(beat.setup) || !text(beat.outcome)) errors.push('outline 节点所属集或内容非法');
    else if (beat.kind === 'payoff' ? !['minor','major'].includes(beat.weight) : Object.hasOwn(beat,'weight')) errors.push('outline 节点 weight 与 kind 不一致');
  }
  if (!outline.beats.some(b => b?.id === outline.story?.endingBeatId && b?.episode === outline.params.episodes)) errors.push('outline 终局节点必须属于最终集');
  return errors;
}
export function reconcile(doc, script, outline) {
  const errors = [];
  for (const ep of doc.episodes) {
    const coordinates = ep.segments.flatMap(seg => seg.cuts.map(cut => ({scene:seg.sceneIndex, from:cut.beats[0], to:cut.beats[1]})));
    const contains = pos => coordinates.some(c => c.scene === pos[0] && c.from <= pos[1] && c.to >= pos[1]);
    if (!contains(ep.openingBeat)) errors.push(`E${ep.ep} openingBeat 未落在实际镜头`);
    const last = coordinates.at(-1);
    if (!last || ep.endBeat[0] !== last.scene || ep.endBeat[1] !== last.to) errors.push(`E${ep.ep} endBeat 必须落在最后镜头的最后一拍`);
    let previous = null;
    for (const c of coordinates) {
      if ((!previous && (c.scene !== 1 || c.from !== 1)) || (previous && c.scene !== previous.scene && (c.scene !== previous.scene + 1 || c.from !== 1))) errors.push(`E${ep.ep} 本地场次／节拍认领起点不连续`);
      if (previous && (c.scene < previous.scene || (c.scene === previous.scene && c.from !== previous.to + 1))) errors.push(`E${ep.ep} 本地节拍认领倒序/重叠/不连续`);
      previous = c;
    }
    const s = script?.episodes.find(x => x.ep === ep.ep);
    const o = outline?.episodes.find(x => x.ep === ep.ep);
    if (script && !s) errors.push(`E${ep.ep} 在剧本里不存在`);
    if (outline && !o) errors.push(`E${ep.ep} 在大纲里不存在`);
    if (s) {
      for (const k of ['opening','openingBeat','endBeat']) if (JSON.stringify(ep[k]) !== JSON.stringify(s[k])) errors.push(`E${ep.ep} ${k} 与剧本不一致，先同步上游计划`);
      if (ep.ending.mode !== s.ending.mode || ep.ending.event !== s.ending.event) errors.push(`E${ep.ep} ending 与剧本不一致，先同步上游计划`);
    }
    if (o) {
      if (ep.opening !== o.opening || ep.ending.mode !== o.ending.mode || ep.ending.event !== o.ending.event) errors.push(`E${ep.ep} 开场/集尾与大纲不一致`);
      if (s && Math.abs(s.targetSeconds - outline.params.minutesPerEpisode * 60) > 1e-9) errors.push(`E${ep.ep} 剧本目标时长与大纲不一致（不能使用估时容差放宽）`);
      if (s) {
        const ids = outline.beats.filter(b => b.episode === ep.ep).map(b => b.id);
        if (JSON.stringify(ids) !== JSON.stringify(s.beatClaims.map(c => c.beatId))) errors.push(`E${ep.ep} 节点认领与大纲顺序/身份不一致`);
      }
    }
  }
  return errors;
}
