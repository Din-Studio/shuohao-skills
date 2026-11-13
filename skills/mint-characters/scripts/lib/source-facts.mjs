// Local source projection for visual design. Never imports another skill.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0;
const int = v => Number.isSafeInteger(v) && v > 0;
const rows = v => Array.isArray(v) ? v : [];
export const sourceLineCount = bytes => {
  const text = new TextDecoder('utf-8', {fatal:true}).decode(bytes);
  if (!text) return 0;
  const lines = text.split(/\r\n|\n|\r/);
  return lines.length - (lines.at(-1) === '' ? 1 : 0);
};
export function sourceProjectionErrors(doc) {
  const errors = [], p = doc?.provenance;
  if (!obj(p) || p.kind !== 'script' || !['partial', 'complete'].includes(p.scope)) return ['provenance 必须声明已有剧本及完整或部分范围'];
  if (!Array.isArray(p.documents) || !p.documents.length) errors.push('provenance.documents 不能为空');
  const ids = new Map();
  for (const d of rows(p.documents)) {
    if (!obj(d) || !text(d.id) || ids.has(d.id) || !text(d.path) || !/^[a-f0-9]{64}$/.test(d.sha256 ?? '') || !int(d.lineCount)) errors.push('来源文件身份、路径、SHA256 或行数非法');
    else ids.set(d.id, d);
  }
  const range = (r, label) => {
    if (!obj(r) || !ids.has(r.documentId) || !int(r.startLine) || !int(r.endLine) || r.endLine < r.startLine || r.endLine > ids.get(r.documentId)?.lineCount) { errors.push(`${label} 来源范围非法`); return false; }
    return true;
  };
  if (!Array.isArray(p.coverage) || !p.coverage.length) errors.push('provenance.coverage 不能为空');
  for (const c of rows(p.coverage)) range(c, 'coverage');
  const covers = r => {
    let next = r.startLine;
    for (const c of rows(p.coverage).filter(c => c?.documentId === r.documentId).sort((a,b) => a.startLine - b.startLine)) {
      if (c.startLine > next) break;
      if (c.endLine >= next) next = c.endLine + 1;
    }
    return next > r.endLine;
  };
  const refs = (rs, label) => {
    if (!Array.isArray(rs) || !rs.length) { errors.push(`${label} 缺少 sourceRefs`); return; }
    for (const r of rs) if (range(r, label) && !covers(r)) errors.push(`${label} 超出已读范围`);
  };
  for (const k of ['characters','scenes','props','beats','episodes']) for (const item of rows(doc[k])) {
    refs(item?.sourceRefs, `${k}.${item?.id ?? item?.ep}`);
    for (const field of ['notes','aliases']) if (item?.[field] !== undefined && !Array.isArray(item[field])) errors.push(`${k}.${field} 必须是数组`);
    for (const alias of rows(item?.aliases)) {
      if (!text(alias?.name)) errors.push(`${k} aliases.name 不能为空`);
      refs(alias?.sourceRefs, `${k}.aliases`);
    }
    if (item?.presence !== undefined && !['visible','voice-only','mentioned'].includes(item.presence)) errors.push(`${k} presence 非法`);
    for (const note of rows(item?.notes)) {
      if (!obj(note) || !text(note.text) || !['performance','background','continuity','restriction'].includes(note.kind)) errors.push(`${k} notes 必须具有合法 kind 和非空 text`);
      refs(note?.sourceRefs, `${k}.notes`);
    }
  }
  if (p.totalEpisodes !== undefined && !int(p.totalEpisodes)) errors.push('totalEpisodes 必须是正整数');
  if (p.scope === 'complete') {
    if (!int(p.totalEpisodes) || rows(doc.episodes).length !== p.totalEpisodes || rows(doc.episodes).some((e,i) => e?.ep !== i+1)) errors.push('完整来源必须具有已知总集数和连续全集');
    for (const d of ids.values()) if (!covers({documentId:d.id,startLine:1,endLine:d.lineCount})) errors.push(`完整来源漏读 ${d.id}`);
  }
  return errors;
}
/** CLI boundary: paths are relative to the supplied outline, never to process cwd. */
export function verifyOutlineSources(doc, outlinePath) {
  if (doc?.schemaVersion !== 4) return;
  const errors = sourceProjectionErrors(doc);
  for (const d of rows(doc?.provenance?.documents)) {
    try {
      const bytes = readFileSync(resolve(dirname(resolve(outlinePath)), d.path));
      if (createHash('sha256').update(bytes).digest('hex') !== d.sha256) errors.push(`${d.id} 来源版本已变化，请重新核验来源引用`);
      if (sourceLineCount(bytes) !== d.lineCount) errors.push(`${d.id} 来源行数不一致`);
    } catch (e) { errors.push(`${d?.id} 来源无法读取：${e.message}`); }
  }
  if (errors.length) throw Error(errors.join('；'));
}
/** Carry only evidence and restrictions, separate from visual production decisions. */
export function sourceFactsOf(item, outline, outlinePath) {
  if (outline?.schemaVersion !== 4) return {};
  const refs = [...rows(item?.sourceRefs), ...rows(item?.notes).flatMap(n => rows(n?.sourceRefs)), ...rows(item?.aliases).flatMap(a => rows(a?.sourceRefs))];
  const used = new Set(refs.map(r => r.documentId));
  const documents = rows(outline.provenance?.documents).filter(d => used.has(d.id)).map(d => ({...d,
    ...(outlinePath ? {path:resolve(dirname(resolve(outlinePath)), d.path)} : {})}));
  return { sourceFacts: { sourceRefs: structuredClone(rows(item?.sourceRefs)), documents,
    ...(item?.notes ? {notes:structuredClone(item.notes)} : {}),
    ...(item?.presence !== undefined ? {presence:item.presence} : {}),
    ...(item?.aliases ? {aliases:structuredClone(item.aliases)} : {}) } };
}
