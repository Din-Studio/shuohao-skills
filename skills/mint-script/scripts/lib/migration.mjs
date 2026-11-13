// Explicit v2 -> v3 only. Preview never writes; original bytes are never replaced.
import { lstatSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_PARAMS, object, own, nonempty, documentErrors, parameterErrors } from './document.mjs';
import { sceneSemanticsErrors } from './semantics.mjs';
export function readJsonStrict(file) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file)));
}
export function migrateV3(input, { ctx = {}, validate = () => [] } = {}) {
  const errors = [], pending = [], retired = {};
  if (!object(input) || input.schemaVersion !== 2) return { document: null, errors: ['Input must be a script v2 object'], pending, retired };
  const doc = structuredClone(input);
  const preserve = (path, value, reason) => { retired[path] = structuredClone(value); pending.push({ path, value: structuredClone(value), reason }); };
  if (own(input, 'creativeContext')) {
    const c = input.creativeContext, dimensions = ['genre', 'narrativeStyle', 'structure', 'pacing'];
    const selection = c?.selection;
    const identity = x => object(x) && typeof x.id === 'string' && /^[a-z][a-z0-9-]*$/.test(x.id) && typeof x.version === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(x.version);
    if (!object(c) || Object.keys(c).some(k => !['selection', 'references', 'overridePaths'].includes(k)) || !object(selection) || Object.keys(selection).length !== 4 || dimensions.some(k => !identity(selection[k]) || Object.keys(selection[k]).some(p => !['id', 'version'].includes(p)))) errors.push('v2 creativeContext.selection: malformed history');
    if (!Array.isArray(c?.references) || c.references.length !== 4 || dimensions.some(k => c.references.filter(r => r?.dimension === k).length !== 1) || c.references.some(r => !identity(r) || r.stage !== 'script' || typeof r.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(r.sha256) || r.id !== selection?.[r.dimension]?.id || r.version !== selection?.[r.dimension]?.version)) errors.push('v2 creativeContext.references: malformed history');
    if (!Array.isArray(c?.overridePaths) || c.overridePaths.some(p => !['params.rules.openingWindow', 'params.rules.lineLength'].includes(p)) || new Set(c.overridePaths).size !== c.overridePaths.length) errors.push('v2 creativeContext.overridePaths: malformed history');
  }
  if (!object(input.params)) errors.push('v2 params must be an object');
  for (const key of Object.keys(DEFAULT_PARAMS)) if (!own(input.params, key)) errors.push(`v2 params.${key} is missing`);
  if (!object(input.params?.rules)) errors.push('v2 params.rules must be an object');
  else {
    for (const [key, rule] of Object.entries(input.params.rules)) {
      const field = { openingWindow: 'maxBeats', lineLength: 'maxChars' }[key];
      if (!field || !object(rule) || !['off', 'warn', 'error'].includes(rule.level) || Object.keys(rule).some(k => !['level', ...(rule.level === 'off' ? [] : [field])].includes(k)) || (rule.level !== 'off' && (!Number.isSafeInteger(rule[field]) || rule[field] <= 0))) errors.push(`v2 params.rules.${key}: malformed rule`);
    }
    for (const key of ['openingWindow', 'lineLength']) if (!own(input.params.rules, key)) errors.push(`v2 params.rules.${key}: missing rule`);
  }
  const coord = (ep, c) => Array.isArray(c) && c.length === 2 && c.every(n => Number.isSafeInteger(n) && n > 0) && Array.isArray(ep.scenes?.[c[0]-1]?.flow) && c[1] <= ep.scenes[c[0]-1].flow.length;
  for (const ep of Array.isArray(doc.episodes) ? doc.episodes : []) {
    if (!object(ep)) { errors.push('v2 episode must be an object'); continue; }
    if (!nonempty(ep?.opening)) errors.push(`E${ep?.ep}: v2 opening required`);
    if (!object(ep?.ending) || !['suspense', 'closure', 'open'].includes(ep.ending.mode) || !nonempty(ep.ending.event) || Object.keys(ep.ending).some(k => !['mode', 'event'].includes(k))) errors.push(`E${ep?.ep}: malformed v2 ending`);
    if (!coord(ep, ep?.openingBeat)) errors.push(`E${ep?.ep}: invalid v2 openingBeat`);
    if (!coord(ep, ep?.endBeat) || ep.endBeat?.[0] !== ep.scenes?.length || ep.endBeat?.[1] !== ep.scenes?.at(-1)?.flow?.length) errors.push(`E${ep?.ep}: invalid v2 endBeat; repair the source before migration`);
    if (!Array.isArray(ep?.beatClaims)) errors.push(`E${ep?.ep}: v2 beatClaims required`);
    delete ep.endBeat;
    if (own(ep, 'seedNote')) { preserve(`episodes.${ep.ep}.seedNote`, ep.seedNote, 'Keep creative information in this migration work record; review before continuing'); delete ep.seedNote; }
    if (own(ctx, 'outline')) {
      const plan = ctx.outline?.episodes?.find(e => e?.ep === ep.ep);
      if (plan && (ep.opening !== plan.opening || ep.ending?.mode !== plan.ending?.mode || ep.ending?.event !== plan.ending?.event)) preserve(`episodes.${ep.ep}.plans`, { opening: ep.opening, ending: ep.ending }, 'Old script and current outline differ; review and keep the outline as the sole plan source');
      delete ep.opening; delete ep.ending;
    }
  }
  for (const key of ['creativeContext', 'seedNote']) if (own(doc, key)) { preserve(key, doc[key], key === 'creativeContext' ? 'Historical selection and explicit override paths are recorded, not converted into creative requirements' : 'Move creative notes into this work record'); delete doc[key]; }
  if (object(doc.params)) {
    for (const key of ['rules', 'defaults', 'preferences']) if (own(doc.params, key)) {
      preserve(`params.${key}`, doc.params[key], key === 'preferences' ? 'Merge actual textual constraints into creativeBrief; confirm their meaning' : 'Review every former default and manual override; retain desired constraints as natural-language requirements');
      if (key === 'preferences') {
        const strings = value => typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(strings) : object(value) ? Object.values(value).flatMap(strings) : [];
        const parts = strings(doc.params[key]).filter(nonempty);
        if (parts.length) doc.creativeBrief = [doc.creativeBrief, ...parts].filter(nonempty).join('\n');
      }
      delete doc.params[key];
    }
    // Existing numeric values could be intentional overrides: preserve them even when equal to defaults.
  }
  doc.schemaVersion = 3;
  errors.push(...validate(doc, { ...ctx, docPath: undefined, productionPath: undefined, root: undefined }));
  return { document: doc, pending, retired, errors, contentReview: 'not-performed' };
}
export function migrateFile(input, { out, confirm = false, ctx = {}, validate } = {}) {
  if (typeof confirm !== 'boolean') throw new Error('confirm must be boolean');
  input = resolve(input);
  if (!lstatSync(input).isFile() || lstatSync(input).isSymbolicLink()) throw new Error('Migration input must be a regular non-symlink file');
  const original = readFileSync(input), result = migrateV3(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(original)), { ctx, validate });
  const summary = { ...result, written: false, input };
  if (!out || result.errors.length || (result.pending.length && !confirm)) return summary;
  out = resolve(out);
  const backup = `${out}.v2-backup`, record = `${out}.review`;
  for (const file of [out, backup, record]) {
    try { lstatSync(file); throw new Error(`Refusing existing output: ${file}`); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  if (!readFileSync(input).equals(original)) throw new Error('Input changed during preview; retry');
  const created = [];
  try {
    for (const [file, value] of [[backup, original], [record, JSON.stringify({ input, pending: result.pending, retired: result.retired, accepted: confirm, contentReview: 'not-performed' }, null, 2)+'\n'], [out, JSON.stringify(result.document, null, 2)+'\n']]) {
      writeFileSync(file, value, { flag: 'wx' }); created.push(file);
    }
  } catch (error) { for (const file of created.reverse()) unlinkSync(file); throw error; }
  return { ...summary, written: true, out, backup, record };
}

// Historical operation only: new production never accepts schemaVersion 3.
export function validateHistoricalV3(doc, ctx = {}, validateV4 = () => []) {
  if (doc?.schemaVersion !== 3) return ['Historical validator expects script v3'];
  const projected = structuredClone(doc); projected.schemaVersion = 4;
  const errors = validateV4(projected, { ...ctx, root:undefined, verifySources:false });
  for (const ep of doc.episodes ?? []) {
    if (typeof ep?.targetSeconds !== 'number' || !Number.isFinite(ep.targetSeconds) || ep.targetSeconds <= 0) errors.push('v3 targetSeconds required');
    for (const sc of ep?.scenes ?? []) for (const b of sc?.flow ?? []) if (!own(b,'action') && !own(b,'line')) errors.push('v3 only accepts action/line');
  }
  return errors;
}

export function migrateV4(input, { ctx = {}, independent = false, validate = () => [] } = {}) {
  const errors = [], pending = [], retired = {};
  if (!object(input) || input.schemaVersion !== 3) return { document:null, errors:['migrate-v4 expects script v3; migrate v2 to v3 explicitly first'], pending, retired };
  const document = structuredClone(input);
  document.schemaVersion = 4;
  errors.push(...documentErrors(document,'script'), ...parameterErrors(document));
  let previousEp = 0;
  const ids = new Set();
  for (const ep of Array.isArray(document.episodes) ? document.episodes : []) {
    if (!Number.isSafeInteger(ep?.ep) || ep.ep <= previousEp) errors.push('v3 episodes must be ordered positive integers');
    previousEp = ep?.ep;
    if (own(ep,'targetSeconds') && (typeof ep.targetSeconds !== 'number' || !Number.isFinite(ep.targetSeconds) || ep.targetSeconds <= 0)) errors.push('v3 targetSeconds must be positive when supplied');
    const index = c => Array.isArray(c) && c.length === 2 && c.every(n=>Number.isSafeInteger(n)&&n>0) && Array.isArray(ep?.scenes?.[c[0]-1]?.flow) && c[1] <= ep.scenes[c[0]-1].flow.length ? ep.scenes.slice(0,c[0]-1).reduce((n,s)=>n+(s?.flow?.length??0),0)+c[1]-1 : null;
    if (own(ep,'openingBeat') && index(ep.openingBeat) === null) errors.push('v3 invalid openingBeat');
    if (own(ep,'beatClaims') && !Array.isArray(ep.beatClaims)) errors.push('v3 beatClaims must be array');
    let lastEnd = -1;
    for (const c of Array.isArray(ep?.beatClaims) ? ep.beatClaims : []) {
      const start=index(c?.start), end=index(c?.end);
      if (!/^B\d{2,}$/.test(c?.beatId??'') || ids.has(c?.beatId) || start === null || end === null || start <= lastEnd || end < start) errors.push('v3 invalid/duplicate/out-of-order claim');
      ids.add(c?.beatId);lastEnd=end;
    }
    for (const sc of Array.isArray(ep?.scenes) ? ep.scenes : []) {
      if (!object(sc) || !/^S\d{2,}$/.test(sc.sceneId??'') || !Array.isArray(sc.characters) || sc.characters.some(c=>!/^C\d{2,}$/.test(c)) || new Set(sc.characters).size !== sc.characters.length || !Array.isArray(sc.flow) || !sc.flow.length) errors.push('v3 malformed scene');
      errors.push(...sceneSemanticsErrors(sc,`E${ep?.ep}`));
      for (const b of Array.isArray(sc?.flow) ? sc.flow : []) if (!own(b,'action') && !own(b,'line')) errors.push('v3 source only supports action/line');
    }
  }
  if (!Array.isArray(input.episodes) || !input.episodes.length || input.episodes.some(e => !object(e) || !Array.isArray(e.scenes) || !e.scenes.length)) errors.push('v3 input requires episodes with actual scenes');
  if (!nonempty(input.source)) errors.push('v3 input requires a work title');
  // A v3 document cannot prove source reading. Add blocking draft provenance only
  // after validating the otherwise-migrated text against supplied project inputs.
  for (const ep of Array.isArray(document.episodes) ? document.episodes : []) {
    if (own(ctx,'outline')) for (const key of ['opening','ending']) if (own(ep,key)) {
      retired[`episodes.${ep.ep}.${key}`] = structuredClone(ep[key]); delete ep[key];
      pending.push({path:`episodes.${ep.ep}.${key}`,reason:'Historical duplicated plan retained in migration report; reconcile meaning with current outline.'});
    }
    if (!own(ep,'targetSeconds')) pending.push({path:`episodes.${ep?.ep}.targetSeconds`,reason:'Not inferred; confirm before production.'});
  }
  // Every explicitly supplied upstream remains checked, including wrong versions.
  const validationCtx={...ctx,stage:'full',root:undefined,verifySources:false};
  errors.push(...validate(document,validationCtx));
  if (!independent) {
    document.provenance=null;
    pending.push({path:'provenance',reason:'Read original script; supply document hashes, owned coverage and exact flow/note sourceRefs. Do not invent source evidence.'});
  }
  pending.push({path:'episodes',reason:'Review original wording, non-speaking notes, sound/subtitle/audio identity and authorization. Structural migration is not semantic verification.'});
  return { document, errors, pending, retired, original:structuredClone(input), draft:!independent, contentReview:'not-performed' };
}

export function migrateV4File(input, { out, confirm = false, ctx = {}, independent = false, validate } = {}) {
  if (typeof confirm !== 'boolean' || typeof independent !== 'boolean') throw new Error('confirm/independent must be boolean');
  input = resolve(input);
  const stat = lstatSync(input);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Migration input must be a regular non-symlink file');
  const original = readFileSync(input);
  const result = migrateV4(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(original)), {ctx,independent,validate});
  const summary = {...result,input,written:false};
  if (!out || result.errors.length || !confirm) return summary;
  out = resolve(out);
  const backup = out+'.v3-backup', record = out+'.review';
  for (const file of [out,backup,record]) {
    try { lstatSync(file); throw new Error('Refusing existing output: '+file); } catch(e) { if(e.code !== 'ENOENT') throw e; }
  }
  if (!readFileSync(input).equals(original)) throw new Error('Input changed during preview; retry');
  const created = [];
  try {
    for (const [file,data] of [[backup,original],[record,JSON.stringify({...result,document:undefined,accepted:confirm},null,2)+'\n'],[out,JSON.stringify(result.document,null,2)+'\n']]) {
      writeFileSync(file,data,{flag:'wx'}); created.push(file);
    }
  } catch(e) { for(const file of created.reverse()) unlinkSync(file); throw e; }
  return {...summary,written:true,out,backup,record};
}
