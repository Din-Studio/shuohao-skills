// Local v3 document rules. No strategy registry or sibling imports.
export const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
export const nonempty = x => typeof x === 'string' && !!x.trim();
export function documentProblems(doc, label = 'creation') {
  if (!object(doc)) return [`${label} 必须为对象`];
  const errors = [];
  for (const key of ['creative', 'creativeContext', 'selection', 'decisions', 'overrides', 'seedNote'])
    if (Object.hasOwn(doc, key)) errors.push(`${label}.${key} 已停用，请显式 migrate-v3 迁移`);
  if (Object.hasOwn(doc, 'creativeBrief') && !nonempty(doc.creativeBrief)) errors.push(`${label}.creativeBrief 必须为非空字符串`);
  if (doc.params !== undefined && !object(doc.params)) errors.push(`${label}.params 必须为对象`);
  for (const key of ['rules', 'defaults', 'preferences', 'minCutSeconds', 'maxCutSeconds'])
    if (object(doc.params) && Object.hasOwn(doc.params, key)) errors.push(`${label}.params.${key} 已停用，请显式迁移`);
  return errors;
}
export function projectProblems(doc, ctx = {}) {
  const errors = [];
  if (ctx.production !== undefined) {
    errors.push(...documentProblems(ctx.production, 'production'));
    if (ctx.production?.schemaVersion !== 3) errors.push('production.schemaVersion 必须为 3，请先迁移项目');
    if (ctx.production?.creativeBrief) for (const [label, local] of [['creation', doc], ['script', ctx.script], ['outline', ctx.outline]])
      if (local?.creativeBrief) errors.push(`production 与 ${label} 同时存在 creativeBrief，请人工合并到 production 并删除阶段副本`);
  }
  return errors;
}
export const SCRIPT_DEFAULTS = Object.freeze({ charsPerSecond: 4.5, actionSeconds: 2.5, tolerance: 0.15 });
export const scriptParams = script => ({ ...SCRIPT_DEFAULTS, ...(script?.params ?? {}) });
export function endPosition(ep) {
  for (let i = (ep?.scenes?.length ?? 0) - 1; i >= 0; i--) {
    const length = ep.scenes[i]?.flow?.length;
    if (length) return [i + 1, length];
  }
  return null;
}
export function episodeIntent(epNo, ctx = {}) {
  const script = ctx.script?.episodes?.find(e => e.ep === epNo);
  const outline = ctx.outline?.episodes?.find(e => e.ep === epNo);
  const plan = outline ?? script;
  return { ...(plan?.opening ? {opening: plan.opening} : {}),
    ...(plan?.ending ? {ending: {mode: plan.ending.mode, event: plan.ending.event}} : {}),
    ...(script?.openingBeat ? {openingBeat: script.openingBeat} : {}),
    ...(script ? {endBeat: endPosition(script)} : {}),
    planSource: outline ? 'outline' : script && (script.opening || script.ending) ? 'script' : 'missing-upstream' };
}
