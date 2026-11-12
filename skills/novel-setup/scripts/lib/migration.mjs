// Explicit legacy production migration. Never used by normal readers.
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0;
const exact = (v, keys) => object(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));

function assertLegacyCreative(value) {
  const dimensions = ['genre', 'narrativeStyle', 'structure', 'pacing'];
  if (!exact(value, ['version', 'selection']) || value.version !== 1 || !exact(value.selection, dimensions))
    throw new Error('旧 creative 结构损坏，不能自动迁移');
  for (const p of Object.values(value.selection)) {
    if (!exact(p, ['id', 'version']) || typeof p.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id) ||
        typeof p.version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(p.version))
      throw new Error('旧 selection 的 id/version 损坏，不能自动迁移');
  }
}

// Preserve text verbatim. Unexpected shapes require manual repair, not coercion.
function preferences(value, path = 'params.preferences') {
  if (text(value)) return [value];
  if (Array.isArray(value)) return value.flatMap((v, i) => preferences(v, `${path}[${i}]`));
  if (object(value)) return Object.entries(value).flatMap(([key, v]) => preferences(v, `${path}.${key}`).map(t => `${key}：${t}`));
  throw new Error(`${path} 不是可合并的非空文本；请人工处理原文件`);
}

export function migrateProduction(input, validate) {
  if (!object(input) || (Object.hasOwn(input, 'schemaVersion') && input.schemaVersion !== 2))
    throw new Error('迁移只接受无版本或 schemaVersion: 2 的旧 production 对象');
  if (input.creativeBrief !== undefined && !text(input.creativeBrief)) throw new Error('旧 creativeBrief 非法');
  if (input.params !== undefined && !object(input.params)) throw new Error('旧 params 必须是对象');
  const candidate = structuredClone(input);
  const pending = [];
  if (Object.hasOwn(input, 'creative')) {
    assertLegacyCreative(input.creative);
    pending.push({ path: 'creative', value: input.creative, action: '核对历史策略约束；名称和版本仅留在原文件，不机械转成创作要求。需要保留的要求请人工补充 creativeBrief。' });
    delete candidate.creative;
  }
  // Production did not own these stage fields; never erase malformed/foreign data.
  for (const key of ['creativeContext', 'selection', 'decisions', 'overrides'])
    if (Object.hasOwn(input, key)) throw new Error(`${key} 不属于旧 production 契约，请人工处理`);
  for (const key of ['rules', 'defaults'])
    if (input.params && Object.hasOwn(input.params, key))
      throw new Error(`params.${key} 属于阶段约束；请逐项人工合并到创作要求或技术结构，不能自动丢弃`);
  if (input.params && Object.hasOwn(input.params, 'preferences')) {
    const notes = preferences(input.params.preferences);
    if (notes.length) {
      candidate.creativeBrief = [candidate.creativeBrief, ...notes].filter(Boolean).join('\n');
      pending.push({ path: 'params.preferences', value: input.params.preferences, action: '原文合并到 creativeBrief；请确认含义与现有要求没有冲突。' });
    }
    delete candidate.params.preferences;
    if (!Object.keys(candidate.params).length) delete candidate.params;
  }
  candidate.schemaVersion = 3;
  const errors = validate(candidate);
  if (errors.length) throw new Error('旧输入技术字段损坏或未完成，不能自动迁移：\n' + errors.join('\n'));
  return { status: pending.length ? 'pending' : 'ready', pending, candidate,
    note: '原文件保持不变，可作为恢复副本。结构检查不代表创作要求已经评审。' };
}
