// Local source evidence boundary. Byte/coordinate verification is not semantic review.
import { readFileSync } from 'node:fs';
import { dirname, resolve, isAbsolute, relative, normalize } from 'node:path';
import { createHash } from 'node:crypto';
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && x.trim().length > 0;
const pos = x => Number.isSafeInteger(x) && x > 0;
const arr = x => Array.isArray(x) ? x : [];
export const sourceLineCount = text => text.length === 0 ? 0 : text.split(/\r\n|\n|\r/).length - (/\r\n$|[\n\r]$/.test(text) ? 1 : 0);
export function unionRanges(ranges) {
  const sorted = arr(ranges).filter(r => pos(r?.startLine) && pos(r?.endLine) && r.endLine >= r.startLine).map(r => [r.startLine, r.endLine]).sort((a,b) => a[0]-b[0]), result = [];
  for (const [start,end] of sorted) {
    if (result.length && start <= result.at(-1)[1]+1) result.at(-1)[1] = Math.max(end,result.at(-1)[1]);
    else result.push([start,end]);
  }
  return result;
}
export function sourceRefsErrors(refs, provenance, path = 'sourceRefs', required = true) {
  if (refs === undefined && !required) return [];
  if (!Array.isArray(refs) || !refs.length) return [`${path}: expected nonempty source ranges`];
  const errors = [];
  for (const ref of refs) {
    const doc = arr(provenance?.documents).find(d => d?.id === ref?.documentId);
    if (!obj(ref) || !text(ref.documentId) || Object.keys(ref).some(k => !['documentId','startLine','endLine'].includes(k)) || !doc || !pos(ref.startLine) || !pos(ref.endLine) || ref.endLine < ref.startLine || ref.endLine > doc.lineCount) { errors.push(`${path}: invalid document or one-based inclusive line range`); continue; }
    const covered = unionRanges(arr(provenance?.coverage).filter(r => r?.documentId === ref.documentId && pos(r.startLine) && pos(r.endLine)));
    if (!covered.some(([s,e]) => s <= ref.startLine && e >= ref.endLine)) errors.push(`${path}: range lies outside owned coverage`);
  }
  return errors;
}
export function provenanceErrors(provenance, episodes = []) {
  if (!obj(provenance)) return ['provenance: expected object'];
  const errors = [];
  if (Object.keys(provenance).some(k => !['kind','scope','documents','coverage','totalEpisodes'].includes(k))) errors.push('provenance: unknown fields');
  if (pos(provenance.totalEpisodes) && arr(episodes).some(e => e?.ep > provenance.totalEpisodes)) errors.push('provenance: episode exceeds known totalEpisodes');
  if (provenance.kind !== 'script') errors.push('provenance.kind: only existing script sources are accepted');
  if (!['partial','complete'].includes(provenance.scope)) errors.push('provenance.scope: expected partial/complete');
  if ('totalEpisodes' in provenance && !pos(provenance.totalEpisodes)) errors.push('provenance.totalEpisodes: expected positive integer');
  if (!Array.isArray(provenance.documents) || !provenance.documents.length) errors.push('provenance.documents: expected nonempty array');
  const ids = new Set(), paths = new Set();
  for (const d of arr(provenance.documents)) {
    if (!obj(d) || Object.keys(d).some(k => !['id','path','sha256','lineCount'].includes(k)) || !text(d.id) || ids.has(d.id) || !text(d.path) || isAbsolute(d.path) || paths.has(normalize(d.path)) || typeof d.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(d.sha256) || !pos(d.lineCount)) errors.push('provenance.documents: unique ID, relative path, SHA256 and positive lineCount required');
    ids.add(d?.id);
    if (text(d?.path)) paths.add(normalize(d.path));
  }
  errors.push(...sourceRefsErrors(provenance.coverage, provenance, 'provenance.coverage'));
  if (provenance.scope === 'complete') {
    if (!pos(provenance.totalEpisodes) || !Array.isArray(episodes) || episodes.length !== provenance.totalEpisodes || episodes.some((e,i) => e?.ep !== i+1)) errors.push('provenance: complete scope requires actual episodes 1..totalEpisodes');
    for (const d of arr(provenance.documents)) {
      const ranges = unionRanges(arr(provenance.coverage).filter(r => r?.documentId === d?.id && pos(r.startLine) && pos(r.endLine)));
      if (ranges.length !== 1 || ranges[0][0] !== 1 || ranges[0][1] !== d?.lineCount) errors.push(`provenance: complete coverage required for ${d?.id}`);
    }
  }
  return errors;
}
export function evidenceErrors(doc, { outline = false } = {}) {
  const required = outline || Object.hasOwn(doc ?? {}, 'provenance');
  const errors = required ? provenanceErrors(doc?.provenance, arr(doc?.episodes)) : [];
  const checked = new Set();
  const check = (item,path,must = false) => {
    if (must || Object.hasOwn(item ?? {}, 'sourceRefs')) {
      errors.push(...sourceRefsErrors(item?.sourceRefs, doc?.provenance, `${path}.sourceRefs`, must));
      checked.add(item);
    }
  };
  if (outline) {
    check(doc?.story,'story',true);
    for (const key of ['characters','scenes','props','beats']) for (const item of arr(doc?.[key])) check(item,`${key}.${item?.id}`,true);
  }
  for (const ep of arr(doc?.episodes)) {
    check(ep,`E${ep?.ep}`,outline);
    if (outline) { if (ep?.ending?.question) check(ep.ending.question,`E${ep.ep}.question`,true); continue; }
    for (const [i,sc] of arr(ep?.scenes).entries()) {
      check(sc,`E${ep?.ep}.scenes.${i}`);
      for (const [j,b] of arr(sc?.flow).entries()) check(b,`E${ep?.ep}.scenes.${i}.flow.${j}`,required);
      for (const [j,n] of arr(sc?.notes).entries()) check(n,`E${ep?.ep}.scenes.${i}.notes.${j}`,required);
    }
  }
  const walk = (value,path) => {
    if (Array.isArray(value)) value.forEach((v,i) => walk(v,`${path}[${i}]`));
    else if (obj(value)) {
      if ('sourceRefs' in value && !checked.has(value)) check(value,path);
      for (const [key,v] of Object.entries(value)) if (key !== 'sourceRefs') walk(v,`${path}.${key}`);
    }
  };
  walk(doc,outline ? 'outline':'script');
  return errors;
}
export function verifySources(doc, artifactPath, options = {}) {
  const errors = evidenceErrors(doc, options);
  if (!doc?.provenance) return { status: errors.length ? 'fail' : 'not-applicable', errors, semanticReview: 'not-performed' };
  if (!artifactPath) errors.push('source verification requires the JSON artifact path');
  if (errors.length) return { status:'fail', errors, semanticReview:'not-performed' };
  for (const d of doc.provenance.documents) {
    try {
      const bytes = readFileSync(resolve(dirname(resolve(artifactPath)), d.path));
      const decoded = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      if (createHash('sha256').update(bytes).digest('hex') !== d.sha256) errors.push(`${d.id}: source SHA256 changed`);
      if (sourceLineCount(decoded) !== d.lineCount) errors.push(`${d.id}: source lineCount changed`);
    } catch (error) { errors.push(`${d.id}: unreadable source: ${error.message}`); }
  }
  return { status:errors.length ? 'fail':'pass', errors, semanticReview:'not-performed' };
}
export function rebaseProvenance(provenance, from, to) {
  const result = structuredClone(provenance);
  for (const d of result.documents) d.path = relative(dirname(resolve(to)), resolve(dirname(resolve(from)),d.path));
  return result;
}
