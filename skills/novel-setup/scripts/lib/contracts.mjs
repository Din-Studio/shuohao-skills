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
