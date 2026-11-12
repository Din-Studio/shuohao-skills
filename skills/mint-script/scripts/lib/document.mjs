// Local v3 document boundary. No creative-policy registry or sibling imports.
export const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export const own = (x, key) => object(x) && Object.hasOwn(x, key);
export const nonempty = x => typeof x === 'string' && x.trim().length > 0;
export const DEFAULT_PARAMS = Object.freeze({ charsPerSecond: 4.5, actionSeconds: 2.5, tolerance: 0.15 });
export const effectiveParams = params => ({ ...DEFAULT_PARAMS, ...(object(params) ? params : {}) });
export function documentErrors(doc, label = 'document') {
  if (!object(doc)) return [`${label}: expected object`];
  const errors = [];
  for (const key of ['creative', 'creativeContext', 'selection', 'decisions', 'overrides', 'seedNote']) if (own(doc, key)) errors.push(`${label}.${key}: retired field; run migrate-v3`);
  for (const key of ['rules', 'defaults', 'preferences', 'hookWindow', 'maxLineChars']) if (own(doc.params, key)) errors.push(`${label}.params.${key}: retired field; run migrate-v3`);
  if (own(doc, 'creativeBrief') && !nonempty(doc.creativeBrief)) errors.push(`${label}.creativeBrief: expected nonempty text`);
  return errors;
}
export function productionErrors(production, documents = []) {
  const errors = documentErrors(production, 'production');
  if (production?.schemaVersion !== 3) errors.push('production.schemaVersion must be 3; migrate production first');
  if (own(production, 'lang') && !['zh', 'en'].includes(production.lang)) errors.push('production.lang: expected zh/en');
  if (own(production, 'autopilot') && typeof production.autopilot !== 'boolean') errors.push('production.autopilot: expected boolean');
  if (nonempty(production?.creativeBrief)) for (const [label, doc] of documents) if (nonempty(doc?.creativeBrief)) errors.push(`${label}.creativeBrief and production.creativeBrief coexist; merge manually into production and remove the local copy`);
  return errors;
}
export function parameterErrors(doc) {
  const errors = [];
  if (own(doc, 'params') && !object(doc.params)) return ['params: expected object when supplied'];
  for (const key of Object.keys(doc?.params ?? {})) if (!own(DEFAULT_PARAMS, key)) errors.push(`params.${key}: unknown/retired parameter; see migration.md`);
  const p = effectiveParams(doc?.params);
  for (const key of ['charsPerSecond', 'actionSeconds']) if (typeof p[key] !== 'number' || !Number.isFinite(p[key]) || p[key] <= 0) errors.push(`params.${key}: expected finite positive number`);
  if (typeof p.tolerance !== 'number' || !Number.isFinite(p.tolerance) || p.tolerance < 0 || p.tolerance >= 1) errors.push('params.tolerance: expected number in [0,1)');
  return errors;
}
