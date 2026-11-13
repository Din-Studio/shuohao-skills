// Local production document contract; no strategy registry or sibling imports.
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0;
export function documentProblems(doc) {
  if (!object(doc)) return ['production 必须是对象'];
  const bad = [];
  if (doc.params !== undefined && !object(doc.params)) bad.push('params 必须是对象');
  if (doc.source !== undefined && typeof doc.source !== 'string') bad.push('source 必须是字符串');
  if (doc.schemaVersion !== 3) bad.push('production 需要 schemaVersion: 3');
  if (doc.creativeBrief !== undefined && !text(doc.creativeBrief)) bad.push('creativeBrief 提供时必须是非空字符串');
  for (const field of ['creative', 'creativeContext', 'selection', 'decisions', 'overrides'])
    if (Object.hasOwn(doc, field)) bad.push(field + ' 不属于 production 契约');
  for (const field of ['rules', 'defaults', 'preferences'])
    if (object(doc.params) && Object.hasOwn(doc.params, field)) bad.push('params.' + field + ' 不属于 production 契约');
  return bad;
}
export function check(id, label, status, detail = '', reason = undefined) {
  return { id, label, status, category: 'base', level: 'error', detail, ...(reason ? { reason } : {}) };
}
export const blocking = g => g.status === 'fail' && g.level === 'error';
export const mark = g => g.status === 'pass' ? '✓' : g.status === 'skipped' ? '—' : g.level === 'warn' ? '提醒' : '✗';
