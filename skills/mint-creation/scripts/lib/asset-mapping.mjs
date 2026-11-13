// Locally owned consumer contract. No sibling imports or identity inference.
import {createHash} from 'node:crypto';
export const assetLists = {character:'characters',scene:'scenes',prop:'props'};
const obj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && !!x.trim();
const sha = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const ordered = value => Array.isArray(value) ? value.map(ordered) : obj(value) ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])) : value;
export const canonical = value => JSON.stringify(ordered(value));
export const assetDigest = asset => createHash('sha256').update(canonical(asset)).digest('hex');
export function assetSourceRefs(value) {
  if (!obj(value) && !Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([k,v])=>k==='sourceRefs' ? (Array.isArray(v)?v:[]) : assetSourceRefs(v));
}
export const assetsOf = (ctx, kind) => (kind === 'character' ? ctx.cast : ctx.art)?.[assetLists[kind]] ?? [];
export const mappingOf = (script,kind,localId) => {
  const rows = (Array.isArray(script?.assetMappings) ? script.assetMappings : []).filter(m=>m?.kind===kind && m.localId===localId);
  return rows.length === 1 ? rows[0] : null;
};
export function mappedAssetId(script,kind,localId) {
  const m = mappingOf(script,kind,localId);
  return m?.status === 'confirmed' ? m.assetId : null;
}
const range = r => obj(r) && text(r.documentId) && Number.isInteger(r.startLine) && r.startLine>0 && Number.isInteger(r.endLine) && r.endLine>=r.startLine;
export function mappingShapeErrors(script) {
  if (script?.assetMappings === undefined) return [];
  if (!Array.isArray(script.assetMappings)) return ['script.assetMappings 必须为数组'];
  const errors=[], seen=new Set();
  for (const m of script.assetMappings) {
    const key=`${m?.kind}:${m?.localId}`;
    if (!obj(m) || !Object.hasOwn(assetLists,m.kind) || !new RegExp(`^${{character:'C',scene:'S',prop:'P'}[m.kind]}\\d{2,}$`).test(m.localId) || !text(m.assetId) || !['confirmed','pending','conflict'].includes(m.status) || !text(m.basis) || !Array.isArray(m.sourceRefs) || !m.sourceRefs.length || !m.sourceRefs.every(range) || !sha(m.assetDigest) || !Array.isArray(m.documentVersions) || !m.documentVersions.length || m.documentVersions.some(d=>!obj(d)||!text(d.id)||!sha(d.sha256)||!Number.isInteger(d.lineCount)||d.lineCount<1) || new Set(m.documentVersions.map(d=>d?.id)).size!==m.documentVersions.length || seen.has(key)) errors.push(`script.assetMappings ${key} 非法或重复（basis/sourceRefs/assetDigest/documentVersions）`);
    if (obj(m) && (Object.keys(m).some(k=>!['kind','localId','assetId','status','sourceRefs','basis','assetDigest','documentVersions'].includes(k)) || (Array.isArray(m.documentVersions) && Array.isArray(m.sourceRefs) && (m.sourceRefs.some(r=>!m.documentVersions.some(d=>d?.id===r?.documentId)))))) errors.push(`script.assetMappings ${key} 字段或文档版本集合非法`);
    seen.add(key);
  }
  return errors;
}
export function covers(coverage, ref) {
  let cursor=ref.startLine;
  for (const r of (coverage??[]).filter(r=>r.documentId===ref.documentId).sort((a,b)=>a.startLine-b.startLine)) {
    if (r.startLine>cursor) break;
    if (r.endLine>=cursor) cursor=r.endLine+1;
  }
  return cursor>ref.endLine;
}
// Only references actually needed by production require confirmation. Unused pending
// mappings remain visible, but never block unrelated segments or revoke approvals.
export function mappingErrors(script,ctx,required=[]) {
  const errors=[];
  for (const {kind,localId} of required) {
    const label=`${kind}:${localId}`, m=mappingOf(script,kind,localId);
    const upstream=kind==='character'?ctx.cast:ctx.art;
    if (!m || m.status!=='confirmed') {errors.push(`${label} 缺少唯一 confirmed 显式映射（同 ID/同名不算确认）`);continue;}
    for(const v of m.documentVersions??[]) {const d=script?.provenance?.documents?.find(d=>d.id===v.id);if(!d||d.sha256!==v.sha256||d.lineCount!==v.lineCount)errors.push(`${label} 映射来源版本已变化`);}
    const asset=assetsOf(ctx,kind).find(a=>a.id===m.assetId);
    if (!asset) {errors.push(`${label} 目标资产 ${m.assetId} 缺失`);continue;}
    if (!Array.isArray(asset.sourceRefs) || !asset.sourceRefs.length) errors.push(`${label} 目标资产缺少来源证据`);
    if ((m.sourceRefs??[]).some(r=>!covers(asset.sourceRefs,r))) errors.push(`${label} 映射依据不在目标资产负责范围`);
    if (assetDigest(asset)!==m.assetDigest) errors.push(`${label} assetDigest 已变化，重新确认映射`);
    for (const r of [...(m.sourceRefs??[]),...assetSourceRefs(asset)]) {
      const version=m.documentVersions?.find(d=>d.id===r.documentId);
      for (const [name,doc] of [['script',script],['asset',upstream]]) {
        const d=doc?.provenance?.documents?.find(d=>d.id===r.documentId);
        if (!version || !d || version.sha256!==d.sha256 || version.lineCount!==d.lineCount || r.endLine>d.lineCount || (name==='asset' || (m.sourceRefs??[]).includes(r)) && !covers(doc.provenance.coverage,r)) errors.push(`${label} ${name} 来源版本或覆盖范围不匹配：${r.documentId}`);
      }
    }
  }
  return errors;
}
export function requiredMappings(structure,scene,episodeScenes=[]) {
  const refs=new Map();
  const add=(kind,localId)=>{if(localId)refs.set(`${kind}:${localId}`,{kind,localId});};
  if ((structure?.cuts??[]).length) add('scene',scene?.sceneId);
  const beatAt=(sc,n)=>Array.isArray(sc?.flow)?sc.flow[n-1]:(sc?.beats??[]).find(b=>b?.n===n);
  const voice=beat=>{
    if (/^C\d{2,}$/.test(beat?.speaker)) add('character',beat.speaker);
    for(const id of beat?.audio?.audibleTo??[]) if(/^C\d{2,}$/.test(id))add('character',id);
  };
  for(const c of structure?.cuts??[]) {
    for(const id of c.characters??[])add('character',id);
    for(const id of c.props??[])add('prop',id);
    const [start,end]=c.beats??[];
    if(Number.isInteger(start)&&Number.isInteger(end)) for(let n=start;n<=end&&n-start<100000;n++)voice(beatAt(scene,n));
    for(const pos of c.audioRefs??[]) if(Array.isArray(pos)&&pos.length===2) {
      const source=episodeScenes.find(s=>s?.sceneIndex===pos[0])??episodeScenes[pos[0]-1];
      voice(beatAt(source,pos[1]));
    }
  }
  for(const i of structure?.images??[])add(i.kind,i.ref);
  return [...refs.values()];
}
export function assetContractErrors(doc,key,source) {
  if (!obj(doc) || doc.schemaVersion !== 1) return [`${key}.schemaVersion 不支持（cast/art:1）`];
  const errors=[];
  if (!text(doc.source) || (source && doc.source!==source)) errors.push(`${key}.source 与正文不匹配`);
  for (const kind of key==='cast'?['character']:['scene','prop']) {
    const list=doc[assetLists[kind]], seen=new Set();
    if(!Array.isArray(list)) {errors.push(`${key}.${assetLists[kind]} 必须为数组`);continue;}
    for(const a of list) {
      if(!obj(a)||!new RegExp(`^${{character:'C',scene:'S',prop:'P'}[kind]}\\d{2,}$`).test(a.id)||!text(a.name)||seen.has(a.id))errors.push(`${key} 资产 ID/name 非法或重复`);
      seen.add(a?.id);
    }
  }
  return errors;
}
// The dispatch material keeps script mappings as evidence, not a second authority.
export function materialMappingErrors(structure,material) {
  const errors=[];
  const scene=material?.seedScenes?.find(s=>s.sceneIndex===structure?.sceneIndex);
  const required=requiredMappings(structure,scene,material?.seedScenes??[]);
  if (!Array.isArray(material?.assetMappings)) return required.length ? ['制作依赖缺少 script.assetMappings 输入；请重新生成派发材料'] : [];
  for(const {kind,localId} of required) {
    const rows=material.assetMappings.filter(m=>m.kind===kind&&m.localId===localId), m=rows[0];
    const a=material.assets?.[assetLists[kind]]?.find(a=>a.id===m?.assetId);
    if(rows.length!==1 || m.status!=='confirmed' || !text(m.basis) || !Array.isArray(m.sourceRefs) || !m.sourceRefs.length || !Array.isArray(m.documentVersions) || !m.documentVersions.length || !a || !obj(a.specification) || a.assetDigest!==m.assetDigest || assetDigest(a.specification)!==a.assetDigest || m.mappingErrors?.length) {
      errors.push(`${kind}:${localId} 制作依赖映射未确认、失效或目标缺失`);continue;
    }
    const shape=mappingShapeErrors({assetMappings:[Object.fromEntries(Object.entries(m).filter(([key])=>key!=='mappingErrors'))]});
    if(shape.length) errors.push(...shape);
    const versions = new Map(m.documentVersions.map(v=>[v.id,v]));
    for(const r of [...m.sourceRefs,...assetSourceRefs(a.specification)]) {
      const scriptDoc=material.provenance?.documents?.find(d=>d.id===r.documentId);
      const assetDoc=a.sourceDocuments?.find(d=>d.id===r.documentId);
      const version=versions.get(r.documentId);
      if (!range(r) || !version || !scriptDoc || !assetDoc || !sha(version.sha256) || version.sha256!==scriptDoc.sha256 || version.lineCount!==scriptDoc.lineCount || version.sha256!==assetDoc.sha256 || version.lineCount!==assetDoc.lineCount || r.endLine>version.lineCount || m.sourceRefs.includes(r) && !covers(material.provenance?.coverage,r) || !covers(a.sourceCoverage,r)) errors.push(`${kind}:${localId} 派发来源版本或覆盖范围不匹配`);
    }
    if (m.sourceRefs.some(r=>!covers(a.specification.sourceRefs,r))) errors.push(`${kind}:${localId} 派发映射依据超出目标资产负责范围`);
  }
  return errors;
}
