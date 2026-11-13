// Local production v3 contract; no sibling imports.
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0;
export function documentProblems(doc) {
  if (!object(doc)) return ['production 必须是对象'];
  const bad = [];
  if (doc.params !== undefined && !object(doc.params)) bad.push('params 必须是对象');
  if (doc.source !== undefined && typeof doc.source !== 'string') bad.push('source 必须是字符串');
  if (doc.schemaVersion !== 3) bad.push('production 需要 schemaVersion: 3');
  if (doc.creativeBrief !== undefined && !text(doc.creativeBrief)) bad.push('creativeBrief 提供时必须是非空字符串');
  return bad;
}
export function creativeBackground(production) {
  if (production == null) return null;
  const bad = documentProblems(production);
  if (bad.length) throw new Error(bad.join('；'));
  return production.creativeBrief ?? null;
}

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
