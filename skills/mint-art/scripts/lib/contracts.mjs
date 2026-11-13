// Local production v3 and outline v3/v4 projection; no sibling imports.
import { sourceProjectionErrors } from './source-facts.mjs';
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0;
export function documentProblems(doc) {
  if (!object(doc)) return ['production 必须是对象'];
  const bad = [];
  if (doc.params !== undefined && !object(doc.params)) bad.push('params 必须是对象');
  if (doc.source !== undefined && typeof doc.source !== 'string') bad.push('source 必须是字符串');
  if (doc.schemaVersion !== 3) bad.push('production 需要 schemaVersion: 3；请执行 migrate-v3');
  if (doc.creativeBrief !== undefined && !text(doc.creativeBrief)) bad.push('creativeBrief 提供时必须是非空字符串');
  for (const field of ['creative', 'creativeContext', 'selection', 'decisions', 'overrides'])
    if (Object.hasOwn(doc, field)) bad.push(field + ' 已废弃；请执行 migrate-v3');
  for (const field of ['rules', 'defaults', 'preferences'])
    if (object(doc.params) && Object.hasOwn(doc.params, field)) bad.push('params.' + field + ' 已废弃；请执行 migrate-v3');
  return bad;
}
export function creativeBackground(production) {
  if (production == null) return null;
  const bad = documentProblems(production);
  if (bad.length) throw new Error(bad.join('；'));
  return production.creativeBrief ?? null;
}
export function check(id, label, status, detail = '', reason = undefined) {
  return { id, label, status, category: 'base', level: 'error', detail, ...(reason ? { reason } : {}) };
}
export const blocking = g => g.status === 'fail' && g.level === 'error';
export const mark = g => g.status === 'pass' ? '✓' : g.status === 'skipped' ? '—' : g.level === 'warn' ? '提醒' : '✗';

/** Validate consumed facts, not narrative policy or semantic fidelity. v3 remains an explicit legacy projection. */
export function assertOutline(doc) {
  const fail = message => { throw new Error('outline v3/v4: ' + message + '；参见 references/migration.md'); };
  if (!object(doc) || ![3,4].includes(doc.schemaVersion)) fail('需要显式 schemaVersion: 3 或 4，拒绝旧版或缺版本');
  const v4 = doc.schemaVersion === 4;
  const documentBad = documentProblems({...doc, schemaVersion:3});
  if (v4) {
    documentBad.push(...sourceProjectionErrors(doc));
    for (const k of ['adaptation','arcs']) if (Object.hasOwn(doc,k)) documentBad.push(k + ' 已移出解析契约');
    for (const k of ['adaptMode','minutesPerEpisode','episodes']) if (Object.hasOwn(doc.params ?? {},k)) documentBad.push('params.' + k + ' 已移出解析契约');
  }
  if (documentBad.length) fail(documentBad.join('；'));
  if (doc.story && Object.hasOwn(doc.story, 'drive')) fail('story.drive 已废弃，请迁移');
  if (doc.adaptation && Object.hasOwn(doc.adaptation, 'core')) fail('adaptation.core 已废弃，请迁移');
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
        if (v4 && Object.hasOwn(item,'reusePlan')) fail('reusePlan 属于美术制作决定，不属于来源事实');
        if (item.reusePlan !== undefined && !text(item.reusePlan)) fail('reusePlan 提供时必须非空');
      }
      if (key === 'props' && !text(item.function)) fail('props.function 必须非空');
      if (key === 'beats') {
        if (Object.hasOwn(item, 'type')) fail('beats.type 已废弃，请合并到 setup/outcome 后迁移');
        if (v4 && ['position','kind','weight'].some(k => Object.hasOwn(item,k))) fail('beats 创作规划字段已移除');
        if (!Number.isInteger(item.episode) || item.episode < 1 ||
            (item.kind !== undefined && !['event','pressure','turn','payoff'].includes(item.kind)) ||
            (item.position !== undefined && !['opening','early','middle','late','ending'].includes(item.position)) ||
            !text(item.setup) || !text(item.outcome)) fail('节点字段损坏');
        if (Object.hasOwn(item, 'weight') && (item.kind !== 'payoff' || !['minor','major'].includes(item.weight))) fail('节点 weight 与 kind 不一致');
      }
    }
  }
  const refs = (values, known, label) => {
    if (!Array.isArray(values) || new Set(values).size !== values.length || values.some(v => !known.has(v))) fail(label + ' 引用非法或重复');
  };
  const eps = new Set();
  for (const ep of doc.episodes ?? []) {
    if (!object(ep) || !Number.isInteger(ep.ep) || ep.ep < 1 || eps.has(ep.ep)) fail('分集编号非法或重复');
    if (Object.hasOwn(ep, 'stateChange')) fail('episodes.stateChange 已废弃，请迁移');
    eps.add(ep.ep);
    for (const [key, table] of [['characterIds','characters'],['sceneIds','scenes'],['propIds','props']])
      if (ep[key] !== undefined) refs(ep[key], ids[table], key);
  }
  for (const pr of doc.props ?? []) refs(pr.beatIds === undefined ? [] : pr.beatIds, ids.beats, 'props.beatIds');
  if (doc.params !== undefined && !object(doc.params)) fail('params 必须是对象');
  const total = doc.params?.episodes;
  if (total !== undefined && (!Number.isInteger(total) || total < 1)) fail('params.episodes 必须是正整数');
  let previousEpisode = 0;
  for (const b of doc.beats ?? []) {
    if (b.episode < previousEpisode) fail('节点集号不能递减');
    previousEpisode = b.episode;
    if (Number.isInteger(total) && b.episode > total) fail('节点所属集越界');
    if (eps.size && !eps.has(b.episode)) fail('节点所属集不存在');
  }
  return doc;
}

// Compatibility export for existing callers; new callers use assertOutline.
export const assertOutlineV3 = assertOutline;

/** Only stage-owned visual text and image production fields are consumed. */
export function assetProductionProblems(production, blockName) {
  if (production == null) return [];
  if (!object(production)) return ['production 必须是对象'];
  const bad = documentProblems(production);
  if (production.autopilot !== undefined && typeof production.autopilot !== 'boolean') bad.push('autopilot 必须是布尔值');
  if (!text(production.style?.label?.zh)) bad.push('style.label.zh 必须非空');
  const block = production.style?.[blockName];
  for (const field of ['render','surface','negative', ...(blockName === 'character' ? ['lighting'] : [])])
    if (!text(block?.[field])) bad.push('style.' + blockName + '.' + field + ' 必须是非空正文；回 mint-setup 填写');
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
