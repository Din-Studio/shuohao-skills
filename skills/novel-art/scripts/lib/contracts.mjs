// Local data contract; no profile discovery or sibling imports.
export const DIMENSIONS = ['genre', 'narrativeStyle', 'structure', 'pacing'];
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (v, keys) => object(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const text = v => typeof v === 'string' && v.trim().length > 0;
export function creativeProblems(creative) {
  if (creative === undefined) return [];
  const bad = [];
  if (!exact(creative, ['version', 'selection']) || creative.version !== 1)
    return ['creative 必须恰好包含 version: 1 与 selection'];
  if (!exact(creative.selection, DIMENSIONS)) return ['creative.selection 必须恰好包含 genre/narrativeStyle/structure/pacing 四维'];
  for (const dimension of DIMENSIONS) {
    const p = creative.selection[dimension];
    if (!exact(p, ['id', 'version']) || typeof p.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id) ||
        typeof p.version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(p.version))
      bad.push('creative.selection.' + dimension + ' 必须是明确 id 与固定语义版本；不接受 latest、范围、路径或额外字段');
  }
  return bad;
}
export function creativeBackground(production) {
  const bad = creativeProblems(production?.creative);
  if (bad.length) throw new Error(bad.join('；'));
  const s = production?.creative?.selection;
  return s ? { genre: { ...s.genre }, narrativeStyle: { ...s.narrativeStyle } } : null;
}
export function check(id, label, status, detail = '', reason = undefined) {
  return { id, label, status, category: 'base', level: 'error', detail, ...(reason ? { reason } : {}) };
}
export const blocking = g => g.status === 'fail' && g.level === 'error';
export const mark = g => g.status === 'pass' ? '✓' : g.status === 'skipped' ? '—' : g.level === 'warn' ? '提醒' : '✗';

/** Validate the consumed outline v2 projection, not narrative policy or content quality. */
export function assertOutlineV2(doc) {
  const fail = message => { throw new Error('outline v2: ' + message + '；参见 references/migration.md'); };
  if (!object(doc) || doc.schemaVersion !== 2) fail('需要显式 schemaVersion: 2，拒绝旧版或缺版本');
  if (!text(doc.source)) fail('source 必须非空');
  for (const key of ['characters', 'scenes']) if (!Array.isArray(doc[key])) fail(key + ' 必须是数组');
  for (const key of ['props', 'beats', 'episodes']) if (doc[key] !== undefined && !Array.isArray(doc[key])) fail(key + ' 必须是数组');
  const ids = {};
  for (const [key, prefix] of [['characters','C'], ['scenes','S'], ['props','P'], ['beats','B']]) {
    ids[key] = new Set();
    for (const item of doc[key] ?? []) {
      if (!object(item) || typeof item.id !== 'string' || !new RegExp('^' + prefix + '\\d{2,}$').test(item.id) || ids[key].has(item.id)) fail(key + ' ID 非法或重复');
      ids[key].add(item.id);
      if (key !== 'beats' && !text(item.name)) fail(key + ' name 必须非空');
      if (key === 'characters') {
        if (!['lead','support','functional'].includes(item.tier)) fail('角色 tier 非法');
        if (item.from !== undefined && (!Array.isArray(item.from) || item.from.some(v => !text(v)))) fail('characters.from 必须是字符串数组');
        for (const field of ['role','arc']) if (item[field] !== undefined && !text(item[field])) fail('characters.' + field + ' 非法');
      }
      if (key === 'scenes') {
        if (typeof item.primary !== 'boolean') fail('scene.primary 必须是布尔值');
        if (item.reusePlan !== undefined && !text(item.reusePlan)) fail('reusePlan 提供时必须非空');
      }
      if (key === 'props' && !text(item.function)) fail('props.function 必须非空');
      if (key === 'beats') {
        if (!Number.isInteger(item.episode) || item.episode < 1 || !['event','pressure','turn','payoff'].includes(item.kind) ||
            !['opening','early','middle','late','ending'].includes(item.position) || !text(item.type) || !text(item.setup) || !text(item.outcome)) fail('节点字段损坏');
        if (item.kind === 'payoff' ? !['minor','major'].includes(item.weight) : Object.hasOwn(item, 'weight')) fail('节点 weight 与 kind 不一致');
      }
    }
  }
  const refs = (values, known, label) => {
    if (!Array.isArray(values) || new Set(values).size !== values.length || values.some(v => !known.has(v))) fail(label + ' 引用非法或重复');
  };
  const eps = new Set();
  for (const ep of doc.episodes ?? []) {
    if (!object(ep) || !Number.isInteger(ep.ep) || ep.ep < 1 || eps.has(ep.ep)) fail('分集编号非法或重复');
    eps.add(ep.ep);
    for (const [key, table] of [['characterIds','characters'],['sceneIds','scenes'],['propIds','props']])
      if (ep[key] !== undefined) refs(ep[key], ids[table], key);
  }
  for (const pr of doc.props ?? []) refs(pr.beatIds ?? [], ids.beats, 'props.beatIds');
  if (doc.params !== undefined && !object(doc.params)) fail('params 必须是对象');
  const total = doc.params?.episodes;
  if (total !== undefined && (!Number.isInteger(total) || total < 1)) fail('params.episodes 必须是正整数');
  for (const b of doc.beats ?? []) {
    if (Number.isInteger(total) && b.episode > total) fail('节点所属集越界');
    if (eps.size && !eps.has(b.episode)) fail('节点所属集不存在');
  }
  return doc;
}

/** Only stage-owned visual text and image production fields are consumed. */
export function assetProductionProblems(production, blockName) {
  if (production == null) return [];
  if (!object(production)) return ['production 必须是对象'];
  const bad = creativeProblems(production.creative);
  if (production.autopilot !== undefined && typeof production.autopilot !== 'boolean') bad.push('autopilot 必须是布尔值');
  if (!text(production.style?.label?.zh)) bad.push('style.label.zh 必须非空');
  const block = production.style?.[blockName];
  for (const field of ['render','surface','negative', ...(blockName === 'character' ? ['lighting'] : [])])
    if (!text(block?.[field])) bad.push('style.' + blockName + '.' + field + ' 必须是非空正文；回 novel-setup 填写');
  if (!Array.isArray(block?.tags) || !block.tags.length || block.tags.some(v => !text(v))) bad.push('style.' + blockName + '.tags 必须是非空字符串数组');
  if (!text(production.style?.phrase)) bad.push('style.phrase 必须非空');
  const image = production.image;
  if (!text(image?.model)) bad.push('image.model 必须非空');
  if (!text(image?.asset?.resolution)) bad.push('image.asset.resolution 必须非空');
  const match = /^(\d+):(\d+)$/.exec(image?.asset?.aspectRatio ?? '');
  if (!match || +match[2] <= 0 || +match[1] < +match[2]) bad.push('image.asset.aspectRatio 必须为横向或方形 W:H');
  const tiers = ['1K','2K','4K'];
  const resolution = typeof image?.asset?.resolution === 'string' ? image.asset.resolution.toUpperCase() : '';
  if (['nanobanana2','image-2'].includes(image?.model)) {
    if (!tiers.includes(resolution)) bad.push('image.asset.resolution 不被模型接受');
    const ratios = image.model === 'nanobanana2' ? ['1:1','2:3','3:2','9:16','16:9'] : ['1:1','3:2','2:3','4:3','3:4','16:9','9:16'];
    if (!ratios.includes(image.asset?.aspectRatio)) bad.push('image.asset.aspectRatio 不被模型接受');
    if (image.model === 'image-2' && resolution === '4K' && !['16:9','9:16'].includes(image.asset?.aspectRatio)) bad.push('image-2 4K 仅支持 16:9/9:16');
  }
  return bad;
}
