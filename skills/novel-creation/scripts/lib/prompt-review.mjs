// Local review documents. Workflow attribution is not a security/authentication boundary.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().filter(k=>value[k] !== undefined).map(k=>[k,canonical(value[k])])) : value;
export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(canonical(value))).digest('hex');
const marker = name => [`<!-- ${name}:start -->`, `<!-- ${name}:end -->`];
function region(text, name) {
  const [start, end] = marker(name);
  if (text.split(start).length !== 2 || text.split(end).length !== 2 || text.indexOf(end) < text.indexOf(start)) throw new Error(`文档需要唯一且有序的 ${name} 区域`);
  return text.slice(text.indexOf(start) + start.length, text.indexOf(end)).trim();
}
export function parsePrompt(text) {
  const prompt = region(text, 'prompt');
  const meta = JSON.parse(region(text, 'review-meta'));
  if (!prompt || meta.version !== 1 || !Number.isInteger(meta.revision) || meta.revision < 1 || !['draft','pending_review','approved','changes_requested','blocked'].includes(meta.status)) throw new Error('提示词或审核元数据非法');
  if (text.split('## 当前审核\n').length !== 2) throw new Error('需要唯一的当前审核区域');
  return { prompt, meta, text };
}
export function reviewDocument(header, prompt) {
  const meta = {version:1, revision:1, status:'draft', reviewedRevision:null, approvedInput:null};
  return `${header}\n<!-- review-meta:start -->\n${JSON.stringify(meta,null,2)}\n<!-- review-meta:end -->\n\n## 提示词正文\n<!-- prompt:start -->\n${prompt}\n<!-- prompt:end -->\n\n## 编写说明\n尚未提交审核。\n\n## 当前审核\n尚未审核。\n`;
}
export function updateReview(parsed, meta, opinion) {
  const [start,end] = marker('review-meta');
  let text = parsed.text.slice(0,parsed.text.indexOf(start)+start.length) + '\n' + JSON.stringify(meta,null,2) + '\n' + parsed.text.slice(parsed.text.indexOf(end));
  if (opinion !== undefined) text = text.slice(0,text.indexOf('## 当前审核\n')) + '## 当前审核\n' + opinion.trim() + '\n';
  parsePrompt(text); // Reject opinions containing reserved markers before any write.
  return text;
}
export function hydrate(doc, base) {
  const copy = structuredClone(doc);
  for (const ep of copy.episodes ?? []) for (const seg of ep.segments ?? []) {
    const path = resolve(base, seg.id, 'prompt.md');
    if (existsSync(path)) seg.prompt = parsePrompt(readFileSync(path,'utf8')).prompt;
  }
  return copy;
}
export function structureHash(doc) {
  const source = structuredClone(doc);
  for (const ep of source.episodes ?? []) for (const seg of ep.segments ?? []) delete seg.prompt;
  return hash(source);
}
export function reviewBinding(manifest, base, context) {
  if (!manifest.reviewSource) throw new Error('旧投产包没有审核来源，请重新导出并审核');
  const prompts = manifest.segments.map(s => ({ id:s.segment, prompt:parsePrompt(readFileSync(resolve(base,s.prompt),'utf8')).prompt,
    images:(s.images ?? []).map(image => hash(readFileSync(resolve(base,image.path)))) }));
  const source = JSON.parse(readFileSync(manifest.reviewSource.path,'utf8'));
  if (structureHash(source) !== manifest.reviewSource.structureHash || hash(context) !== manifest.reviewSource.contextHash) throw new Error('结构或上游已变化，请重新 export 后提交审核');
  return hash({manifest, structure:structureHash(source), context, prompts});
}
export function requireApproved(manifest, base, binding, selected = manifest.segments) {
  if (!selected.length) throw new Error('没有待生成的段');
  for (const seg of selected) {
    const {meta} = parsePrompt(readFileSync(resolve(base,seg.prompt),'utf8'));
    if (meta.status !== 'approved' || meta.approvedInput !== binding || meta.reviewedRevision !== meta.revision || !meta.reviewer) throw new Error(`${seg.segment} 尚未批准或批准已失效，请重新审核`);
  }
}
export function loadReview(path) { return parsePrompt(readFileSync(path,'utf8')); }
export function sourceArgs(manifest) {
  const source = manifest.reviewSource;
  if (!source?.path || !Array.isArray(source.args)) throw new Error('缺少审核来源');
  return source.args;
}
