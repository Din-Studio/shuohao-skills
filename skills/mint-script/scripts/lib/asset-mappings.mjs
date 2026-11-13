// Script-local references are not project identities. No name/ID fallback.
import { createHash } from 'node:crypto';
import { sourceRefsErrors, unionRanges } from './source.mjs';
const arr = x => Array.isArray(x) ? x : [];
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && x.trim().length > 0;
const pos = x => Number.isSafeInteger(x) && x > 0;
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const kinds = { character: ['cast','characters','C'], scene: ['art','scenes','S'], prop: ['art','props','P'] };
const localOK = (kind,id) => Object.hasOwn(kinds,kind ?? '') && typeof id === 'string' && new RegExp(`^${kinds[kind][2]}\\d{2,}$`).test(id);
const canonical = value => Array.isArray(value) ? value.map(canonical) : obj(value) ? Object.fromEntries(Object.keys(value).sort().map(k => [k,canonical(value[k])])) : value;
export function assetSourceRefs(value) {
  if(!obj(value)&&!Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key,item])=>key==='sourceRefs'?arr(item):assetSourceRefs(item));
}
export function assetDigest(asset) {
  if (!obj(asset)) throw new TypeError('assetDigest: expected JSON asset object');
  return createHash('sha256').update(JSON.stringify(canonical(asset))).digest('hex');
}
export function mappedAssetId(script, kind, localId) {
  const matches = arr(script?.assetMappings).filter(m => m?.kind === kind && m?.localId === localId);
  return matches.length === 1 && matches[0].status === 'confirmed' && localOK(kind,localId) && text(matches[0].assetId) ? matches[0].assetId : null;
}
export function localReferences(script) {
  const refs = new Map();
  const add = (kind,localId) => { if (localOK(kind,localId)) refs.set(`${kind}:${localId}`,{kind,localId}); };
  for (const ep of arr(script?.episodes)) for (const scene of arr(ep?.scenes)) {
    add('scene',scene?.sceneId);
    for (const id of arr(scene?.characters)) add('character',id);
    for (const id of arr(scene?.props)) add('prop',id);
    for (const beat of arr(scene?.flow)) {
      add('character',beat?.speaker);
      for (const id of arr(beat?.audio?.audibleTo)) add('character',id);
    }
  }
  return [...refs.values()];
}
// required=true means all current local refs. An array selects actual production
// dependencies. Omitted/false means no production dependencies, not auto-confirmation.
export function mappingErrors(script, ctx = {}, { required = [] } = {}) {
  const errors = [], seen = new Set();
  if (Object.hasOwn(script ?? {},'assetMappings') && !Array.isArray(script.assetMappings)) errors.push('script.assetMappings: expected array');
  const records = arr(script?.assetMappings);
  const refs = new Set(localReferences(script).map(r => `${r.kind}:${r.localId}`));
  for (const [i,m] of records.entries()) {
    const path = `script.assetMappings[${i}]`, key = `${m?.kind}:${m?.localId}`;
    if (!obj(m)) { errors.push(`${path}: expected object`); continue; }
    if (Object.keys(m).some(k => !['kind','localId','assetId','status','sourceRefs','basis','assetDigest','documentVersions'].includes(k))) errors.push(`${path}: unknown mapping fields`);
    if (!localOK(m.kind,m.localId) || seen.has(key)) errors.push(`${path}: invalid or duplicate local mapping`);
    seen.add(key);
    if (!refs.has(key)) errors.push(`${path}: local reference not present in script`);
    if (!text(m.assetId)) errors.push(`${path}.assetId: expected explicit target ID`);
    if (!['confirmed','pending','conflict'].includes(m.status)) errors.push(`${path}.status: expected confirmed/pending/conflict`);
    if (!text(m.basis)) errors.push(`${path}.basis: expected nonempty evidence/decision text`);
    if (!hash(m.assetDigest)) errors.push(`${path}.assetDigest: expected full lowercase SHA256`);
    errors.push(...sourceRefsErrors(m.sourceRefs,script?.provenance,`${path}.sourceRefs`));
    const versions = arr(m.documentVersions), ids = new Set();
    if (!Array.isArray(m.documentVersions) || !versions.length) errors.push(`${path}.documentVersions: expected nonempty versions`);
    for (const v of versions) {
      if (!obj(v) || Object.keys(v).some(k => !['id','sha256','lineCount'].includes(k)) || !text(v.id) || ids.has(v.id) || !hash(v.sha256) || !pos(v.lineCount)) errors.push(`${path}.documentVersions: invalid/duplicate version`);
      ids.add(v?.id);
      const d = arr(script?.provenance?.documents).find(d => d?.id === v?.id);
      if (!d || d.sha256 !== v?.sha256 || d.lineCount !== v?.lineCount) errors.push(`${path}: script source version differs for ${v?.id}`);
    }
    const referenced = new Set(arr(m.sourceRefs).map(r => r?.documentId));
    if ([...referenced].some(id => !ids.has(id))) errors.push(`${path}: documentVersions must cover mapping source documents`);
    if (!Object.hasOwn(kinds,m.kind ?? '')) continue;
    const [stage,list] = kinds[m.kind], authority = ctx[stage];
    // Missing optional authority is skipped. A supplied malformed authority is an error.
    if (authority === undefined) continue;
    if (!obj(authority) || authority.schemaVersion !== 1 || !Array.isArray(authority[list])) { errors.push(`${path}: invalid supplied ${stage} schemaVersion 1 input`); continue; }
    const targets = authority[list].filter(a => a?.id === m.assetId);
    if (targets.length !== 1) { errors.push(`${path}: target ${m.assetId} absent or ambiguous in ${stage}`); continue; }
    const asset = targets[0];
    for (const ref of assetSourceRefs(asset)) if (!ids.has(ref?.documentId)) errors.push(`${path}: documentVersions must cover target asset source documents`);
    if (assetDigest(asset) !== m.assetDigest) errors.push(`${path}: target assetDigest changed; recheck this mapping`);
    if (text(authority.source) && authority.source !== script?.source) errors.push(`${path}: ${stage} work title differs`);
    for (const v of versions) {
      const d = arr(authority.provenance?.documents).find(d => d?.id === v?.id);
      if (!d || d.sha256 !== v?.sha256 || d.lineCount !== v?.lineCount) errors.push(`${path}: ${stage} source version differs for ${v?.id}`);
    }
    // Characters may attach a verified quote to their own evidence. It is
    // asset data (and remains in assetDigest), not an extra script range field.
    if(!Array.isArray(asset.sourceRefs)||!asset.sourceRefs.length) errors.push(`${path}.target sourceRefs: required`);
    const targetRanges=assetSourceRefs(asset).map(r=>obj(r)?{documentId:r.documentId,startLine:r.startLine,endLine:r.endLine}:r);
    errors.push(...sourceRefsErrors(targetRanges,authority.provenance,`${path}.target sourceRefs`));
    errors.push(...sourceRefsErrors(m.sourceRefs,authority.provenance,`${path}.${stage} coverage`));
    for (const r of arr(m.sourceRefs)) {
      const ranges = unionRanges(arr(asset.sourceRefs).filter(a => a?.documentId === r?.documentId));
      if (!ranges.some(([s,e]) => s <= r?.startLine && e >= r?.endLine)) errors.push(`${path}: mapping evidence outside target asset source coverage`);
    }
  }
  const dependencies = required === true ? localReferences(script) : required === false ? [] : required;
  if (!Array.isArray(dependencies)) errors.push('required mappings: expected true/false or [{kind,localId}]');
  for (const r of arr(dependencies)) {
    const key = `${r?.kind}:${r?.localId}`, id = mappedAssetId(script,r?.kind,r?.localId);
    if (!localOK(r?.kind,r?.localId) || !refs.has(key)) { errors.push(`required mapping ${key}: unknown local reference`); continue; }
    if (!id) errors.push(`required mapping ${key}: explicit confirmed mapping required; equal names/IDs do not count`);
    const [stage] = kinds[r.kind];
    if (ctx[stage] === undefined) errors.push(`required mapping ${key}: missing authoritative ${stage}`);
  }
  return errors;
}
