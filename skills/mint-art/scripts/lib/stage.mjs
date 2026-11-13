// Art v1: stage-owned identities, evidence, incremental changes and explicit migration.
// Standard library only. This module never imports another skill.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { sourceLineCount } from './source-facts.mjs';
import { outlineInputErrors } from './outline-input.mjs';
export const ART_VERSION = 1;
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && !!v.trim();
const rows = v => Array.isArray(v) ? v : [];
const idOK = v => typeof v === 'string' && /^[SP]\d{2,}$/.test(v);
const canonical = v => Array.isArray(v) ? v.map(canonical) : obj(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
export const digest = v => createHash('sha256').update(JSON.stringify(canonical(v)) ?? 'undefined').digest('hex');
export const fileDigest = bytes => createHash('sha256').update(bytes).digest('hex');
export const assetsOf = doc => [...rows(doc?.scenes), ...rows(doc?.props)];
export const refsIn = value => !obj(value) && !Array.isArray(value) ? [] : Object.entries(value).flatMap(([k,v]) => k === 'sourceRefs' ? rows(v) : refsIn(v));
export function covered(ref, coverage) {
  let next = ref.startLine;
  for (const c of rows(coverage).filter(c => c?.documentId === ref.documentId).sort((a,b) => a.startLine-b.startLine)) {
    if (c.startLine > next) break;
    if (c.endLine >= next) next = c.endLine+1;
  }
  return next > ref.endLine;
}
// Only active evidence participates. migration.original/fields and related
// materials are historical snapshots, never an alternative current authority.
export const activeDocuments = doc => [...rows(doc?.provenance?.documents), ...assetsOf(doc).flatMap(a=>rows(a?.sourceFacts?.documents))];
export function activeEvidenceErrors(doc) {
  const errors=[], documents=new Map();
  for(const d of activeDocuments(doc)) {
    if(!obj(d)||!text(d.id)||!/^[a-f0-9]{64}$/.test(d.sha256??'')||!Number.isSafeInteger(d.lineCount)||d.lineCount<1){errors.push('活动证据文档身份、SHA256 或行数非法');continue;}
    const prior=documents.get(d.id);
    if(prior&&(prior.sha256!==d.sha256||prior.lineCount!==d.lineCount))errors.push(`${d.id} 活动证据版本冲突：同 documentId 必须具有相同 SHA256 和行数`);
    documents.set(d.id,d);
  }
  return errors;
}
export function evidenceErrors(doc, {requireAssetRefs = false} = {}) {
  const errors = activeEvidenceErrors(doc), p = doc?.provenance;
  const refs = refsIn({...doc, migration:undefined, upstreams:undefined, incremental:undefined});
  if (!p) return [...errors,...(refs.length || requireAssetRefs ? ['来源引用缺少 provenance'] : [])];
  if (!obj(p) || p.kind !== 'script' || !['partial','complete'].includes(p.scope)) errors.push('provenance.kind/scope 非法');
  const documents = rows(p.documents), ids = new Map();
  if (!documents.length) errors.push('provenance.documents 不能为空');
  for (const d of documents) {
    if (!obj(d) || !text(d.id) || ids.has(d.id) || !text(d.path) || !/^[a-f0-9]{64}$/.test(d.sha256 ?? '') || !Number.isSafeInteger(d.lineCount) || d.lineCount < 1) errors.push('来源身份、路径、SHA256 或行数非法');
    else ids.set(d.id,d);
  }
  const range = r => obj(r) && ids.has(r.documentId) && Number.isSafeInteger(r.startLine) && Number.isSafeInteger(r.endLine) && r.startLine > 0 && r.endLine >= r.startLine && r.endLine <= ids.get(r.documentId).lineCount;
  if (!Array.isArray(p.coverage) || !p.coverage.length) errors.push('provenance.coverage 不能为空；seed 未声明已读，须人工或模型填写');
  for (const r of rows(p.coverage)) if (!range(r)) errors.push('coverage 来源范围非法');
  for (const r of refs) if (!range(r) || !covered(r,p.coverage)) errors.push('sourceRefs 超出文档或负责范围');
  // Validate all nested sourceRefs, including empty/malformed arrays, not only flattened references.
  const walk = v => {
    if (!obj(v) && !Array.isArray(v)) return;
    for (const [k,x] of Object.entries(v)) {
      if (['migration','upstreams','incremental'].includes(k)) continue;
      if (k === 'sourceRefs' && (!Array.isArray(x) || !x.length)) errors.push('sourceRefs 必须是非空数组');
      else walk(x);
    }
  }; walk(doc);
  if (requireAssetRefs) for (const a of assetsOf(doc)) if (!rows(a?.sourceRefs).length) errors.push(`${a?.id} 缺少独立识别的 sourceRefs`);
  if (p.totalEpisodes !== undefined && (!Number.isSafeInteger(p.totalEpisodes) || p.totalEpisodes < 1)) errors.push('totalEpisodes 非法');
  if (p.scope === 'complete') {
    if (!Number.isSafeInteger(p.totalEpisodes) || p.totalEpisodes < 1) errors.push('完整范围必须声明 totalEpisodes');
    for (const d of ids.values()) if (!covered({documentId:d.id,startLine:1,endLine:d.lineCount},p.coverage)) errors.push(`完整范围漏读 ${d.id}`);
  }
  return errors;
}
export function verifySources(doc, artifactPath) {
  const errors = evidenceErrors(doc, {requireAssetRefs:doc?.mode === 'script'});
  for (const d of rows(doc?.provenance?.documents)) {
    try {
      const bytes = readFileSync(resolve(dirname(resolve(artifactPath)), d.path));
      if (fileDigest(bytes) !== d.sha256) errors.push(`${d.id} 来源版本已变化`);
      if (sourceLineCount(bytes) !== d.lineCount) errors.push(`${d.id} 来源行数不一致`);
      const lines=new TextDecoder('utf-8',{fatal:true}).decode(bytes).split(/\r\n|\n|\r/);
      for(const r of refsIn({...doc,migration:undefined,upstreams:undefined,incremental:undefined}).filter(r=>r?.documentId===d.id&&r.quote!==undefined))if(!text(r.quote)||!lines.slice(r.startLine-1,r.endLine).join('\n').includes(r.quote))errors.push(`${d.id} 引文与实际原件行不一致`);
    } catch (e) { errors.push(`${d?.id} 来源无法读取：${e.message}`); }
  }
  // Legacy sourceFacts also carry real originals; they are not exempt from verification.
  for (const a of assetsOf(doc)) if (a?.sourceFacts?.documents) {
    const factDoc = {provenance:{kind:'script',scope:'partial',documents:a.sourceFacts.documents,coverage:rows(doc.provenance?.coverage).length?doc.provenance.coverage:refsIn(a.sourceFacts)},facts:a.sourceFacts};
    errors.push(...verifySources(factDoc, artifactPath).errors.map(e => `${a.id}.sourceFacts ${e}`));
  }
  return {status:errors.length?'fail':doc?.provenance || assetsOf(doc).some(a=>a?.sourceFacts) ? 'pass' : 'skipped', errors, semanticReview:'not-performed'};
}
export function identityBasis(a) {
  const basis=Object.fromEntries(Object.entries(a).filter(([k])=>!['usage','identityReview','designStatus','image','imageStem','sheetImage','summary','anchors','lighting','states','scale','changes'].includes(k)));
  if(obj(basis.sourceFacts))basis.sourceFacts={...basis.sourceFacts,documents:rows(basis.sourceFacts.documents).map(d=>obj(d)?Object.fromEntries(Object.entries(d).filter(([k])=>k!=='path')):d)};
  return basis;
}
export function identityDigest(doc, a) {
  const refs = refsIn(a).filter(obj);
  const used = new Set(refs.map(r=>r.documentId));
  const documents = rows(doc.provenance?.documents).filter(d=>obj(d)&&used.has(d.id)).map(({id,sha256,lineCount})=>({id,sha256,lineCount})).sort((a,b)=>a.id.localeCompare(b.id));
  // Only responsible coverage of these actual references affects this identity.
  const coverage = refs.map(r=>({documentId:r.documentId,startLine:r.startLine,endLine:r.endLine,covered:covered(r,doc.provenance?.coverage)})).sort((a,b)=>a.documentId.localeCompare(b.documentId)||a.startLine-b.startLine||a.endLine-b.endLine);
  return digest({source:doc.source,mode:doc.mode,identity:identityBasis(a),refs,documents,coverage});
}
export function sourceIdentity(doc) {
  return digest({source:doc.source,provenance:doc.provenance,refs:refsIn({...doc,migration:undefined,upstreams:undefined,incremental:undefined})});
}
export function seedFromSource(sourcePath, title, {existing = null} = {}) {
  if (!text(title)) throw Error('seed --source path --title title 必须提供标题');
  const path = resolve(sourcePath), bytes = readFileSync(path), lineCount = sourceLineCount(bytes);
  if (!lineCount) throw Error('原剧本不能为空');
  if (existing && existing.schemaVersion !== ART_VERSION) throw Error('既有 art 必须是 v1；旧版请显式 migrate-art');
  if (existing && existing.source !== title) throw Error('既有产物标题不一致；不得按名称重新分配身份');
  const doc = existing ? structuredClone(existing) : {schemaVersion:ART_VERSION,kind:'mint-art',source:title,mode:'script',status:'draft',scenes:[],props:[],registry:{entries:[],changes:[]},budgets:{},upstreams:{}};
  if (existing) doc.incremental = {previousDigest:digest(existing),previousRegistry:structuredClone(existing.registry),previousIdentities:assetsOf(existing).map(a=>({id:a.id,coreDigest:identityCoreDigest(a)})),previousBudgets:structuredClone(existing.budgets)};
  const old = rows(doc.provenance?.documents).find(d=>resolve(d.path)===path);
  const id = old?.id ?? (doc.provenance ? null : 'D01');
  if (!id) throw Error('新增或不同原件须显式编辑 documents/coverage；不猜测文档身份');
  const changed = !old || old.sha256 !== fileDigest(bytes);
  const document = {id,path,sha256:fileDigest(bytes),lineCount};
  if(existing?.provenance && changed)doc.provenance.scope='partial';
  doc.provenance = existing?.provenance ? {...doc.provenance,documents:doc.provenance.documents.map(d=>d.id===id?document:d),coverage:changed?doc.provenance.coverage.filter(c=>c.documentId!==id):doc.provenance.coverage} : {kind:'script',scope:'partial',documents:[document],coverage:[]};
  doc.mode = 'script';
  if (changed) { doc.status='draft'; for (const a of assetsOf(doc)) if (refsIn(a).some(r=>r.documentId===id)) a.identityReview={status:'pending'}; }
  return doc;
}
export function registerAsset(doc, kind, key, name) {
  if (doc?.schemaVersion !== ART_VERSION || !['scene','prop'].includes(kind) || !text(key) || !text(name)) throw Error('register 需要 art v1、scene/prop、非空 key/name');
  if (!obj(doc.registry) || !Array.isArray(doc.registry.entries)) throw Error('缺少 registry');
  if (doc.registry.entries.some(e=>!obj(e)||!idOK(e.id)||!text(e.key))) throw Error('既有 registry 损坏，不得绕过历史重新分配 ID');
  if (doc.registry.entries.some(e=>e.key===key)) throw Error('identityKey 已分配，不得复用');
  const prefix = kind==='scene'?'S':'P';
  const max = doc.registry.entries.filter(e=>e.id.startsWith(prefix)).reduce((max,e)=>{const n=BigInt(e.id.slice(1));return n>max?n:max;},0n);
  const id = prefix+String(max+1n).padStart(2,'0');
  const a={id,identityKey:key,name,decision:'',identityReview:{status:'pending'},designStatus:'none',imageStem:id,...(kind==='scene'?{primary:false}:{})};
  doc[kind==='scene'?'scenes':'props'].push(a);doc.registry.entries.push({id,key,status:'active'});return a;
}
export const identityCoreDigest=a=>digest(identityBasis(a));
// Per-asset event stamp makes even a surviving merge target change its downstream
// assetDigest. The registry remains the sole authority for the actual mappings.
export function lifecycleStamp(doc,id) {
  const events=rows(doc.registry?.changes).filter(c=>[...rows(c?.from),...rows(c?.to)].includes(id));
  return events.length?digest(events):undefined;
}
export function syncLifecycleStamps(doc) {
  for(const a of assetsOf(doc)){const stamp=lifecycleStamp(doc,a.id);if(stamp)a.lifecycleStamp=stamp;}
  return doc;
}
export function lifecycleErrors(doc, previous = null) {
  if(previous&&(!obj(previous)||previous.schemaVersion!==ART_VERSION||previous.kind!=='mint-art'||!obj(previous.registry)||!Array.isArray(previous.registry.entries)||!Array.isArray(previous.registry.changes)))return ['既有 art v1 基线损坏或版本不兼容'];
  const errors=[], reg=doc?.registry;
  if (!obj(reg) || !Array.isArray(reg.entries) || !Array.isArray(reg.changes)) return ['registry.entries/changes 必须是数组'];
  const ids=new Map(),keys=new Set();
  for (const e of reg.entries) {
    if (!obj(e)||!idOK(e.id)||ids.has(e.id)||!text(e.key)||keys.has(e.key)||!['active','retired'].includes(e.status)) errors.push('身份登记非法、重复或 ID 复用');
    else {ids.set(e.id,e);keys.add(e.key);}
  }
  const current = new Map();
  for (const a of assetsOf(doc)) {
    if (!obj(a)) {errors.push('资产必须是对象');continue;}
    if (current.has(a.id)) errors.push(`资产 ID ${a.id} 重复`);
    current.set(a.id,a);
    if (ids.get(a.id)?.key!==a.identityKey||ids.get(a.id)?.status!=='active') errors.push(`${a.id} 与稳定 registry 不一致`);
  }
  for (const e of reg.entries) if (e?.status==='active'&&!current.has(e.id)) errors.push(`${e.id} 删除须退休并记录显式映射`);
  const eventIDs=new Set();
  for (const c of reg.changes) {
    if (!obj(c)||!text(c.id)||eventIDs.has(c.id)||!['merge','split','delete','correct'].includes(c.type)||!text(c.basis)||!Array.isArray(c.from)||!Array.isArray(c.to)||new Set(c.from).size!==c.from.length||new Set(c.to).size!==c.to.length||!c.from.length||[...c.from,...c.to].some(id=>!ids.has(id))) {errors.push('身份变更缺少类型、显式映射或依据');continue;}
    eventIDs.add(c.id);
    if ([...c.from,...c.to].some(id=>id[0]!==c.from[0][0])) errors.push(`${c.id} 不能跨场景/道具种类合并身份`);
    if (doc.mode==='script'&&!rows(c.sourceRefs).length) errors.push(`${c.id} 变更缺少 sourceRefs`);
    if ((c.type==='merge'&&(c.from.length<2||c.to.length!==1))||(c.type==='split'&&(c.from.length!==1||c.to.length<2))||(c.type==='delete'&&c.to.length)||(c.type==='correct'&&(c.from.length!==1||c.to.length!==1))) errors.push(`${c.id} 合并/拆分/删除/纠正映射数量非法`);
    for (const id of c.from) if (!c.to.includes(id)&&ids.get(id)?.status!=='retired') errors.push(`${id} 变更来源必须退休`);
  }
  for (const e of reg.entries) if (e?.status==='retired'&&!reg.changes.some(c=>rows(c?.from).includes(e.id))) errors.push(`${e.id} 退休缺少显式映射和依据`);
  const oldReg=previous?.registry ?? doc.incremental?.previousRegistry;
  if (oldReg) {
    for (const e of rows(oldReg.entries)) {
      if(!obj(e)||!idOK(e.id)||!text(e.key)){errors.push('既有 registry 快照损坏');continue;}
      const now=ids.get(e.id);
      if (!now||now.key!==e.key||(e.status==='retired'&&now.status!=='retired')) errors.push(`${e.id} 已分配 ID 不得删除、复用或重新激活`);
      if (now?.status!==e.status&&!reg.changes.some(c=>!rows(oldReg.changes).some(o=>o?.id===c?.id)&&rows(c.from).includes(e.id))) errors.push(`${e.id} 增量身份变化缺少新映射`);
    }
    for (const c of rows(oldReg.changes)) if (!reg.changes.some(n=>digest(n)===digest(c))) errors.push(`既有变更 ${c.id} 不得覆盖`);
  }
  const previousIdentities=previous?assetsOf(previous).map(a=>({id:a.id,coreDigest:identityCoreDigest(a)})):rows(doc.incremental?.previousIdentities);
  for(const old of previousIdentities){const now=current.get(old.id);if(now&&identityCoreDigest(now)!==old.coreDigest&&!reg.changes.some(c=>!rows(oldReg?.changes).some(o=>o?.id===c?.id)&&rows(c.from).includes(old.id)))errors.push(`${old.id} 身份纠正缺少显式映射和依据`);}
  const previousBudgets=previous?.budgets??doc.incremental?.previousBudgets;
  // Re-derive migration baselines from the preserved original, not the editable
  // reviewed fields, current budgets or a caller-supplied incremental snapshot.
  const budgetBaselines=[...Object.entries(previousBudgets??{}),...migrationBudgetBaselines(doc.migration)];
  for(const [key,b]of budgetBaselines)if(b?.kind==='explicit'&&digest(doc.budgets?.[key]??null)!==digest(b)&&!rows(doc.budgetChanges).some(c=>obj(c)&&c.key===key&&text(c.basis)&&digest(c.from)===digest(b)&&digest(c.to??null)===digest(doc.budgets?.[key]??null)))errors.push(`${key} 明确预算变更缺少用户依据和原值`);
  if (previous) {
    if (previous.schemaVersion!==ART_VERSION||doc.source!==previous.source) errors.push('增量基线必须是同一作品的 art v1');
    if (doc.incremental?.previousDigest && doc.incremental.previousDigest!==digest(previous)) errors.push('增量基线摘要不匹配');
    for (const a of assetsOf(previous)) {
      const now=current.get(a?.id);
      if (now && now.identityKey!==a.identityKey) errors.push(`${a.id} 不得换成另一个对象`);
    }
  }
  return errors;
}
export function budgetChecks(doc) {
  const results=[]; const b=doc?.budgets;
  if (!obj(b)) return [{id:'art-budget',label:'美术资产预算',status:'fail',category:'base',level:'error',detail:'budgets 必须显式保存（无预算时为空对象）'}];
  const counts={scenes:rows(doc.scenes).length,primaryScenes:rows(doc.scenes).filter(s=>s?.primary).length,props:rows(doc.props).length};
  for (const [k,v] of Object.entries(b)) {
    const valid=Object.hasOwn(counts,k)&&obj(v)&&Number.isSafeInteger(v.max)&&v.max>=0&&['explicit','reference'].includes(v.kind);
    results.push({id:'budget-'+k,label:`美术预算 ${k}`,status:!valid||counts[k]>v.max?'fail':'pass',category:'base',level:valid&&v.kind==='reference'?'warn':'error',detail:valid?`${counts[k]} / ${v.max}（${v.kind}）`:'预算键或 max/kind 非法'});
  }
  return results.length?results:[{id:'art-budget',label:'美术资产预算',status:'skipped',category:'base',level:'error',reason:'not-configured',detail:'未设置明确预算；道具 3–8 件仅为参考值'}];
}
const budgetMapping={primaryScenes:'primaryScenes',maxPrimaryScenes:'primaryScenes',scenes:'scenes',maxScenes:'scenes',props:'props',maxProps:'props'};
function migrationBudgetBaselines(m) {
  if(!obj(m?.original))return [];
  const original=m.original;
  return [
    ...Object.entries(original.budgets??{}).filter(([k,b])=>Object.hasOwn(budgetMapping,k)&&b?.kind==='explicit'),
    ...Object.entries(original.params?.thresholds??{}).filter(([k,v])=>Object.hasOwn(budgetMapping,k)&&Number.isSafeInteger(v)&&v>=0).map(([k,v])=>[budgetMapping[k],{kind:'explicit',max:v}])
  ];
}
function migrationFields(input) {
  const fields=[];
  const walk=(v,p)=>{if(obj(v)||Array.isArray(v)){if(!Object.keys(v).length)fields.push({path:p,value:structuredClone(v)});for(const [k,x]of Object.entries(v))walk(x,`${p}/${k}`);}else fields.push({path:p,value:v});};
  walk(input,'');return fields;
}
function migrationErrors(m) {
  if(!obj(m))return ['migration 必须是显式迁移材料对象'];
  const errors=[];
  if(!['art','outline'].includes(m.kind)||!obj(m.original)||m.inputDigest!==digest(m.original))errors.push('迁移原始快照或身份摘要损坏');
  const expected=migrationFields(m.original),fields=rows(m.fields);
  if(!Array.isArray(m.fields)||fields.length!==expected.length||new Set(fields.map(f=>f?.path)).size!==fields.length||expected.some(e=>!fields.some(f=>f?.path===e.path&&digest(f.value)===digest(e.value))))errors.push('迁移逐字段原路径/原值不完整，不得删除待处理材料');
  if(m.status!=='reviewed'||!Array.isArray(m.unresolved)||m.unresolved.length||fields.some(f=>!obj(f)||!['mapped','retained','not-applicable'].includes(f.status)||!text(f.basis)))errors.push('迁移材料待核验或存在未归属关系，不得冒充已审核资产');
  if(m.related!==undefined&&(!Array.isArray(m.related)||m.related.some(r=>!obj(r)||!['reviewed','not-applicable'].includes(r.status)||!text(r.basis)||!text(r.path)||!/^[a-f0-9]{64}$/.test(r.sha256??''))))errors.push('历史关联材料尚未核验');
  return errors;
}
export function stageErrors(doc, {previous=null} = {}) {
  if (!obj(doc)||(doc.schemaVersion!==ART_VERSION||doc.kind!=='mint-art')) return ['art 需要 schemaVersion: 1, kind: mint-art；旧版必须显式 migrate-art，outline v3/v4 使用 migrate-outline'];
  const errors=[];
  if (!text(doc.source)||!['script','design'].includes(doc.mode)||!['draft','ready'].includes(doc.status)) errors.push('source/mode/status 非法');
  if (doc.status!=='ready') errors.push('art 为草稿/待核验，不是正式交付');
  if (doc.mode==='script'&&!doc.provenance) errors.push('原剧本模式缺少 provenance');
  for (const k of ['scenes','props']) if (!Array.isArray(doc[k])) errors.push(`${k} 必须是数组（允许为空）`);
  errors.push(...evidenceErrors(doc,{requireAssetRefs:doc.mode==='script'}),...lifecycleErrors(doc,previous));
  for (const a of assetsOf(doc)) {
    if (!obj(a)) continue;
    if (!idOK(a.id)||(rows(doc.scenes).includes(a)?!a.id?.startsWith('S'):!a.id?.startsWith('P'))) errors.push(`${a.id} 资产种类与 ID 前缀不一致`);
    if(rows(doc.scenes).includes(a)&&typeof a.primary!=='boolean')errors.push(`${a.id} 主场景 primary 必须明确`);
    for(const k of ['relatedScenes','carrierRefs'])if(a[k]!==undefined&&!Array.isArray(a[k]))errors.push(`${a.id}.${k} 必须是数组`);
    if(a.usage?.beatIds!==undefined&&(!Array.isArray(a.usage.beatIds)||a.usage.beatIds.some(id=>typeof id!=='string'||!/^B\d{2,}$/.test(id))||new Set(a.usage.beatIds).size!==a.usage.beatIds.length))errors.push(`${a.id}.usage.beatIds 非法`);
    if(a.usage!==undefined&&(!obj(a.usage)||!Array.isArray(a.usage.episodes)||a.usage.episodes.some(e=>!Number.isSafeInteger(e)||e<1)||new Set(a.usage.episodes).size!==a.usage.episodes.length||!Array.isArray(a.usage.beats)))errors.push(`${a.id}.usage 结构非法`);
    if(a.lifecycleStamp!==lifecycleStamp(doc,a.id))errors.push(`${a.id} 身份变更戳尚未登记；执行 reconcile 并重核受影响引用`);
    if (!text(a.name)||!text(a.decision)) errors.push(`${a.id} 缺少 name 或建立美术资产的 decision`);
    if (!['none','planned','ready'].includes(a.designStatus)) errors.push(`${a.id} designStatus 非法`);
    if (a.identityReview?.status!=='confirmed'||a.identityReview?.inputDigest!==identityDigest(doc,a)||!text(a.identityReview?.basis)) errors.push(`${a.id} 身份待核验或来源/引用摘要已失效`);
    if (a.designStatus==='none'&&a.image!==undefined) errors.push(`${a.id} 已有设计须标记 planned/ready，不得假装没有设计`);
    if(a.relatedScenes!==undefined&&Array.isArray(a.relatedScenes)&&a.relatedScenes.some(id=>!rows(doc.scenes).some(s=>s?.id===id)))errors.push(`${a.id} relatedScenes 引用不存在`);
    if(a.sheetImage!==undefined&&!text(a.sheetImage))errors.push(`${a.id} sheetImage 路径非法`);
    if(a.imageStem!==undefined&&(!text(a.imageStem)||/[\\/]/.test(a.imageStem)))errors.push(`${a.id} imageStem 必须是文件名，不是路径`);
    if (a.carriedBy!==undefined) errors.push(`${a.id} carriedBy 自由名称已退役；人物身份由 characters 的 carrierRefs 明确映射`);
    for (const c of rows(a.carrierRefs)) if (!obj(c)||!/^C\d{2,}$/.test(c.characterId??'')||!text(c.basis)||!rows(c.sourceRefs).length) errors.push(`${a.id} carrierRefs 需要明确 C ID、依据与来源`);
    if (a.variantOf) {
      if (!rows(doc.scenes).some(s=>s?.id===a.variantOf)||a.variantOf===a.id||!text(a.changes)) errors.push(`${a.id} 变体引用缺失或缺少 changes`);
      const seen=new Set([a.id]);let next=a.variantOf;
      while(next) {if(seen.has(next)){errors.push(`${a.id} 变体循环`);break;}seen.add(next);next=rows(doc.scenes).find(s=>s?.id===next)?.variantOf;}
    }
  }
  if(doc.migration!==undefined)errors.push(...migrationErrors(doc.migration));
  return errors;
}
export function assertStoryOutline(doc) {
  if (!obj(doc)||doc.schemaVersion!==5) throw Error('正式 outline 仅支持 v5；v3/v4 必须显式 migrate-outline，不能作为资产权威');
  if (!text(doc.source)||!obj(doc.story)||!text(doc.story.summary)||!rows(doc.story.sourceRefs).length||!Array.isArray(doc.beats)||!Array.isArray(doc.episodes)) throw Error('outline v5 故事投影结构损坏');
  for (const k of ['characters','scenes','props']) if (Object.hasOwn(doc,k)) throw Error(`outline v5 不得具有资产表 ${k}`);
  if (doc.params?.thresholds!==undefined||doc.story.focusCharacterIds!==undefined||rows(doc.episodes).some(e=>['characterIds','sceneIds','propIds'].some(k=>Object.hasOwn(e,k)))) throw Error('outline v5 残留资产权威字段');
  const forbidden=new Set(['characterId','sceneId','propId','characterIds','sceneIds','propIds','assetId','assetIds','speakerId','focusCharacterIds']);
  const retired=v=>{if(!obj(v)&&!Array.isArray(v))return;for(const[k,x]of Object.entries(v)){if(forbidden.has(k))throw Error('outline v5 残留资产身份字段 '+k);retired(x);}};retired(doc);
  if (!doc.provenance) throw Error('outline v5 缺少 provenance');
  const errors=[...evidenceErrors(doc),...outlineInputErrors(doc)];if(errors.length)throw Error(errors.join('；'));
  return doc;
}
// Local consumption projection of cast v1. No image/persona requirement.
export function characterIdentityDigest(c,p) {
  const sortedRefs=rs=>rows(rs).map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const used=new Set([...rows(c.sourceRefs),...rows(c.aliases).flatMap(a=>rows(a.sourceRefs))].map(r=>r.documentId));
  return digest({identityKey:c.identityKey,name:c.name,aliases:rows(c.aliases).map(a=>({...a,sourceRefs:sortedRefs(a.sourceRefs)})).sort((a,b)=>a.name.localeCompare(b.name)),entityType:c.entityType,lifecycleStamp:c.lifecycleStamp,presence:[...rows(c.presence)].sort(),speech:c.speech,unknowns:c.unknowns,notes:c.notes,sourceRefs:sortedRefs(c.sourceRefs),documents:rows(p?.documents).filter(d=>obj(d)&&used.has(d.id)).map(({id,sha256})=>({id,sha256})).sort((a,b)=>a.id.localeCompare(b.id))});
}
export function assertCharacters(doc) {
  if (!obj(doc)||doc.schemaVersion!==1||doc.kind!=='mint-characters'||!text(doc.source)||!Array.isArray(doc.characters)) throw Error('characters 正式输入需要 cast v1, kind: mint-characters；旧名单不能冒充身份交接');
  if(doc.status!=='identified'||doc.review?.status!=='confirmed'||!text(doc.review.by)||!text(doc.review.note))throw Error('characters 身份尚未确认');
  if(!obj(doc.lifecycle)||!Number.isSafeInteger(doc.lifecycle.revision)||doc.lifecycle.revision<1||!Array.isArray(doc.lifecycle.registry)||!Array.isArray(doc.lifecycle.changes)||!Array.isArray(doc.lifecycle.recheckIds)||doc.lifecycle.revision===1&&doc.lifecycle.previousHash!==null||doc.lifecycle.revision>1&&!/^[a-f0-9]{64}$/.test(doc.lifecycle.previousHash??''))throw Error('characters 生命周期登记损坏');
  const registryIDs=new Set(),registryKeys=new Set();for(const r of doc.lifecycle.registry){if(!obj(r)||!/^C\d{2,}$/.test(r.id??'')||registryIDs.has(r.id)||!text(r.identityKey)||registryKeys.has(r.identityKey)||!['active','retired'].includes(r.state))throw Error('characters registry 非法或重复');registryIDs.add(r.id);registryKeys.add(r.identityKey);}
  const ids=new Set(),keys=new Set();for(const c of doc.characters) {
    if(!obj(c)||!/^C\d{2,}$/.test(c.id??'')||ids.has(c.id)||!text(c.name)||!text(c.identityKey)||keys.has(c.identityKey)||!Array.isArray(c.aliases)||c.aliases.some(a=>!text(a?.name)||!rows(a?.sourceRefs).length)||!rows(c.sourceRefs).length)throw Error('characters 身份或别名损坏');ids.add(c.id);keys.add(c.identityKey);
    if(!['human','nonhuman','unknown','group'].includes(c.entityType)||!Array.isArray(c.presence)||!c.presence.length||c.presence.some(v=>!['visible','voice-only','mentioned'].includes(v))||!['speaking','silent','unknown'].includes(c.speech)||!Array.isArray(c.unknowns)||c.unknowns.some(v=>!text(v))||(c.notes!==undefined&&(!Array.isArray(c.notes)||c.notes.some(n=>!text(n?.text)||!rows(n?.sourceRefs).length))))throw Error('characters 身份字段或来源说明损坏');
    const entry=rows(doc.lifecycle?.registry).find(e=>e.id===c.id);
    if(!entry||entry.state!=='active'||entry.identityKey!==c.identityKey||entry.fingerprint!==characterIdentityDigest(c,doc.provenance))throw Error('characters 身份摘要未核验或已失效');
  }
  if(doc.lifecycle.registry.some(r=>(r.state==='active')!==ids.has(r.id)))throw Error('characters registry 与活动身份表不一致');
  if(!doc.provenance)throw Error('characters 缺少 provenance');
  const errors=evidenceErrors(doc);if(errors.length)throw Error(errors.join('；'));return doc;
}
export function upstreamErrors(doc, upstream, kind) {
  const errors=[];
  try {kind==='outline'?assertStoryOutline(upstream):assertCharacters(upstream);}catch(e){return [e.message];}
  if(upstream.source!==doc.source)errors.push(`${kind} 作品标题不匹配`);
  const documents=activeDocuments(doc);
  const shared=documents.some(d=>rows(upstream.provenance?.documents).some(u=>u.id===d?.id));
  if(doc.mode==='script'||shared) {
    for(const d of documents) {
      const u=rows(upstream.provenance?.documents).find(u=>u.id===d.id);
      if(!u||u.sha256!==d.sha256||u.lineCount!==d.lineCount)errors.push(`${kind} 来源文档身份或版本不匹配 ${d.id}`);
    }
    // Only facts actually referenced by this stage must be covered upstream.
    for(const r of refsIn({assets:assetsOf(doc),changes:doc.registry?.changes}))if(!covered(r,upstream.provenance?.coverage))errors.push(`${kind} 未覆盖美术所引用范围`);
  }
  if(kind==='outline')for(const a of assetsOf(doc))for(const id of rows(a?.usage?.beatIds)){const beat=upstream.beats.find(b=>b.id===id);if(!beat)errors.push(`${a.id} 关联节点 ${id} 不存在`);else if(rows(a.usage.episodes).length&&!a.usage.episodes.includes(beat.episode))errors.push(`${a.id} 节点 ${id} 与关联集不符`);}
  if(kind==='characters')for(const a of assetsOf(doc))for(const c of rows(a?.carrierRefs)){const target=upstream.characters.find(x=>x.id===c?.characterId);if(!target)errors.push(`${a?.id} 未知人物 ${c?.characterId}`);else for(const r of rows(c.sourceRefs))if(!covered(r,target.sourceRefs))errors.push(`${a.id} 人物关联证据超出 ${target.id} 已确认身份范围`);}
  return errors;
}
export function upstreamCheck(doc,upstream,kind) {
  const errors=upstreamErrors(doc,upstream,kind);
  const shared=activeDocuments(doc).some(d=>rows(upstream?.provenance?.documents).some(u=>u?.id===d?.id));
  return {status:errors.length?'fail':shared?'pass':'skipped',errors,...(!shared?{detail:'无共同原件；独立设计未完成来源对账'}:{}),semanticReview:'not-performed'};
}
// Every original field remains traceable, including relations this stage cannot own.
export function migrationMaterial(input, path, kind, projected) {
  const fields=migrationFields(input).map(f=>({...f,status:'pending'}));
  return {...projected,migration:{kind,path:resolve(path),inputDigest:digest(input),status:'pending',fields,original:structuredClone(input),unresolved:fields.filter(f=>/characters|characterIds|focusCharacterIds|speakerId|thresholds|notes|beatIds|sceneIds|propIds|carriedBy/.test(f.path)).map(f=>({path:f.path,value:f.value,status:'pending'}))}};
}
export function migrateArt(input, path) {
  if(!obj(input)||input.schemaVersion===1||!text(input.source)||!Array.isArray(input.scenes)||!Array.isArray(input.props??[]))throw Error('migrate-art 仅接受未版本化或显式 v2–v4 历史美术产物');
  if(Object.hasOwn(input,'characters')||Object.hasOwn(input,'beats'))throw Error('outline 资产表必须使用 migrate-outline，不能假装旧 art');
  if(input.schemaVersion!==undefined&&![2,3,4].includes(input.schemaVersion))throw Error('不支持的旧 art 版本');
  const doc={...structuredClone(input),schemaVersion:1,kind:'mint-art',mode:input.provenance?'script':'design',status:'draft',props:structuredClone(input.props??[]),registry:{entries:[],changes:[]},budgets:structuredClone(input.budgets??{}),upstreams:{}};
  for(const a of assetsOf(doc)) {
    if(!idOK(a?.id)||doc.registry.entries.some(e=>e.id===a.id))throw Error('旧资产 ID 非法或重复，不能自动迁移');
    a.identityKey=`legacy:${a.id}`;a.identityReview={status:'pending'};a.decision='待独立核验旧美术资产的识别依据';a.designStatus=a.image?'ready':'none';
    doc.registry.entries.push({id:a.id,key:a.identityKey,status:'active'});
    if(a.carriedBy!==undefined){a.legacyCarriedBy=structuredClone(a.carriedBy);delete a.carriedBy;}
  }
  return migrationMaterial(input,path,'art',doc);
}
export function migrateOutline(input, path, legacyProjection) {
  if(!obj(input)||![3,4].includes(input.schemaVersion)||!obj(legacyProjection)||!Array.isArray(legacyProjection.scenes)||!Array.isArray(legacyProjection.props))throw Error('migrate-outline 仅接受显式 outline v3/v4 及已检查的历史投影');
  const doc={...legacyProjection,schemaVersion:1,kind:'mint-art',mode:input.provenance?'script':'design',status:'draft',registry:{entries:[],changes:[]},budgets:{},upstreams:{}};
  if(input.provenance)doc.provenance=structuredClone(input.provenance);
  for(const a of assetsOf(doc)) {
    a.identityKey=`legacy:${a.id}`;a.identityReview={status:'pending'};a.decision='待原剧本独立识别';a.designStatus='none';delete a.image;
    doc.registry.entries.push({id:a.id,key:a.identityKey,status:'active'});
  }
  const t=input.params?.thresholds??{};
  // Preserve exact values. Unsupported budget shapes stay unresolved rather than becoming advice.
  for(const [k,v]of Object.entries(t))if(Object.hasOwn(budgetMapping,k)&&Number.isSafeInteger(v)&&v>=0)doc.budgets[budgetMapping[k]]={kind:'explicit',max:v};
  return migrationMaterial(input,path,'outline',doc);
}
