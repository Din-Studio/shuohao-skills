// Creation-owned source boundary. Coordinate checks are not semantic fidelity review.
import {readFileSync} from 'node:fs';
import {dirname, resolve, isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && !!x.trim();
const positive = x => Number.isInteger(x) && x > 0;
export const lineCountOf = bytes => {
  const s = new TextDecoder('utf-8', {fatal:true}).decode(bytes);
  return s ? s.split(/\r\n|\n|\r/).length - (/[\r\n]$/.test(s) ? 1 : 0) : 0;
};
function rangesCover(ranges, start, end) {
  let cursor = start;
  for (const r of [...ranges].sort((a,b) => a.startLine-b.startLine)) {
    if (r.endLine < cursor) continue;
    if (r.startLine > cursor) return false;
    cursor = Math.max(cursor, r.endLine + 1);
    if (cursor > end) return true;
  }
  return cursor > end;
}
export function sourceProblems(doc, {required = false} = {}) {
  const p = doc?.provenance;
  if (p === undefined) {
    const hasRefs = x => !!x && typeof x === 'object' && (Object.hasOwn(x,'sourceRefs') || Object.values(x).some(hasRefs));
    return required || hasRefs(doc) ? ['缺少 provenance 来源证据'] : [];
  }
  const errors = [];
  if (!object(p) || p.kind !== 'script' || !['partial','complete'].includes(p.scope) || !Array.isArray(p.documents) || !p.documents.length || !Array.isArray(p.coverage) || !p.coverage.length) return ['provenance 需要剧本来源、范围、文档与覆盖'];
  const ids = new Map();
  for (const d of p.documents) {
    if (!object(d) || !text(d.id) || ids.has(d.id) || !text(d.path) || !/^[a-f0-9]{64}$/.test(d.sha256) || !positive(d.lineCount)) errors.push('provenance document 非法或重复');
    if (object(d)) ids.set(d.id,d);
  }
  function range(r) { return object(r) && ids.has(r.documentId) && positive(r.startLine) && positive(r.endLine) && r.endLine >= r.startLine && r.endLine <= ids.get(r.documentId).lineCount; }
  for (const r of p.coverage) if (!range(r)) errors.push('provenance coverage 坐标越界或文档未知');
  if (p.totalEpisodes !== undefined && (!positive(p.totalEpisodes) || doc.episodes?.some(e => e?.ep > p.totalEpisodes))) errors.push('totalEpisodes 必须为正整数，实际集号不能超出已知总集数');
  if (p.scope === 'complete') {
    if (!positive(p.totalEpisodes) || doc.episodes?.length !== p.totalEpisodes || Array.from({length:positive(p.totalEpisodes) ? Math.min(p.totalEpisodes,100000) : 0}, (_,i) => i+1).some(n => !doc.episodes?.some(e => e?.ep === n))) errors.push('complete 需要已知总集数及完整 1..N 集');
    for (const d of p.documents) if (object(d) && !rangesCover(p.coverage.filter(r => range(r) && r.documentId === d.id),1,d.lineCount)) errors.push(`complete 来源覆盖不完整：${d.id}`);
  }
  function walk(x, path = '') {
    if (!object(x)) return;
    if (Object.hasOwn(x,'sourceRefs')) {
      if (!Array.isArray(x.sourceRefs) || !x.sourceRefs.length) errors.push(`${path} sourceRefs 必须为非空数组`);
      else for (const r of x.sourceRefs) if (!range(r) || !rangesCover(p.coverage.filter(c => range(c) && c.documentId === r.documentId), r.startLine,r.endLine)) errors.push(`${path} sourceRefs 不在已覆盖范围`);
    }
    for (const [k,v] of Object.entries(x)) if (k !== 'provenance') {
      if (Array.isArray(v)) v.forEach((item,i) => walk(item,`${path}.${k}[${i}]`));
      else if (object(v)) walk(v,`${path}.${k}`);
    }
  }
  walk(doc);
  return errors;
}
/** Explicit file-read boundary. Paths resolve against the JSON artifact, never the caller's cwd. */
export function verifySources(doc, artifactPath) {
  const errors = sourceProblems(doc);
  if (errors.length) throw new Error(errors.join('；'));
  if (!doc?.provenance) return {status:'not-applicable'};
  for (const d of doc.provenance.documents) {
    if (!artifactPath && !isAbsolute(d.path)) throw new Error(`来源核验需要 JSON 路径：${d.id}`);
    const path = isAbsolute(d.path) ? d.path : resolve(dirname(resolve(artifactPath)), d.path);
    let bytes;
    try { bytes = readFileSync(path); } catch (e) { throw new Error(`来源无法读取 ${d.id}：${e.message}`); }
    if (createHash('sha256').update(bytes).digest('hex') !== d.sha256) throw new Error(`来源 SHA256 已变化：${d.id}`);
    if (lineCountOf(bytes) !== d.lineCount) throw new Error(`来源行数不一致：${d.id}`);
  }
  return {status:'verified', scope:'bytes-and-coordinates-only'};
}
export function transformationProblems(value, label) {
  return value === undefined || (object(value) && text(value.reason) && text(value.authorization)) ? [] : [`${label} transformation 需要 reason/authorization`];
}
export function audioProblems(b, label) {
  if (b.audio === undefined) return [];
  const a = b.audio;
  return (!text(b.line) && !text(b.sound)) || !object(a) || !['onscreen','offscreen','voiceover','inner'].includes(a.mode) || (a.subjective !== undefined && typeof a.subjective !== 'boolean') || (a.audibleTo !== undefined && (!Array.isArray(a.audibleTo) || a.audibleTo.some(id => !/^C\d{2,}$/.test(id)) || new Set(a.audibleTo).size !== a.audibleTo.length)) ? [`${label} audio 非法或用于非声音正文`] : [];
}
/** Each coordinate denotes one occurrence, not matching text. Owners must precede continuation cuts. */
export function continuationProblems(ep, scriptEp) {
  const errors = [], owners = new Set();
  for (const seg of ep?.segments ?? []) for (const cut of seg?.cuts ?? []) {
    const refs = cut?.audioRefs ?? [], seen = new Set();
    if (!Array.isArray(refs)) { errors.push(`${seg.id} audioRefs 必须为坐标数组`); continue; }
    for (const pos of refs) {
      const key = JSON.stringify(pos);
      if (!Array.isArray(pos) || pos.length !== 2 || !pos.every(positive) || seen.has(key) || !owners.has(key)) errors.push(`${seg.id} audioRefs 必须唯一引用同集更早镜头认领的台词`);
      else if (scriptEp && !text(scriptEp.scenes?.[pos[0]-1]?.flow?.[pos[1]-1]?.line)) errors.push(`${seg.id} audioRefs 只能延续台词`);
      seen.add(key);
    }
    const [a,b] = cut?.beats ?? [];
    if (positive(a) && positive(b) && b >= a && b-a < 100000) for (let n=a;n<=b;n++) owners.add(JSON.stringify([seg.sceneIndex,n]));
  }
  return errors;
}
