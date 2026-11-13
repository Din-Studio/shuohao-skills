// Stage-owned cast v1. No sibling imports or automatic semantic recognition.
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {sourceLineCount} from './source-facts.mjs';
import {outlineInputErrors} from './outline-input.mjs';
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const txt = x => typeof x === 'string' && !!x.trim();
const arr = x => Array.isArray(x) ? x : [];
const cid = x => typeof x === 'string' && /^C\d{2,}$/.test(x);
const pos = x => Number.isSafeInteger(x) && x > 0;
export const hash = x => createHash('sha256').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(canonical(x))).digest('hex');
function canonical(x) { return Array.isArray(x) ? x.map(canonical) : obj(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k,canonical(x[k])])) : x; }
const sortedRefs = rs => arr(rs).map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
export const identityLifecycleStamp = (id,changes=[]) => hash(arr(changes).filter(change=>arr(change?.from).includes(id)||arr(change?.to).includes(id)));
export function identityHash(c, provenance) {
  // Document path and display order do not change identity. Source versions do.
  const used = new Set([...arr(c.sourceRefs), ...arr(c.aliases).flatMap(a=>arr(a.sourceRefs)), ...arr(c.notes).flatMap(n=>arr(n.sourceRefs))].map(r=>r.documentId));
  return hash({identityKey:c.identityKey,name:c.name,aliases:arr(c.aliases).map(a=>({...a,sourceRefs:sortedRefs(a.sourceRefs)})).sort((a,b)=>a.name.localeCompare(b.name)),
    entityType:c.entityType,lifecycleStamp:c.lifecycleStamp,presence:[...arr(c.presence)].sort(),speech:c.speech,unknowns:c.unknowns,notes:c.notes,
    sourceRefs:sortedRefs(c.sourceRefs),documents:arr(provenance?.documents).filter(d=>used.has(d.id)).map(({id,sha256})=>({id,sha256})).sort((a,b)=>a.id.localeCompare(b.id))});
}
export function seedSource(path, title) {
  if (!txt(title)) throw Error('seed 需要 --title title');
  const bytes=readFileSync(resolve(path)), lineCount=sourceLineCount(bytes);
  if (!lineCount) throw Error('原剧本不能为空');
  return {schemaVersion:1,kind:'mint-characters',status:'draft',source:title,lang:'zh',summary:'',
    provenance:{kind:'script',scope:'partial',documents:[{id:'D01',path:resolve(path),sha256:hash(bytes),lineCount}],coverage:[]},
    characters:[],budgets:{},lifecycle:{revision:0,previousHash:null,registry:[],changes:[],recheckIds:[]},
    review:{status:'pending',note:'骨架不进行语义识别；模型或人工阅读原文后登记身份和已读范围。'}};
}
export function sourceErrors(doc, file, {verify=true}={}) {
  const errors=[], p=doc?.provenance, docs=new Map();
  if (!obj(p) || p.kind!=='script' || !['partial','complete'].includes(p.scope)) return ['provenance 必须声明 script、partial/complete'];
  if (!arr(p.documents).length) errors.push('provenance.documents 不能为空');
  for (const d of arr(p.documents)) {
    if (!obj(d) || !txt(d.id) || docs.has(d.id) || !txt(d.path) || !/^[a-f0-9]{64}$/.test(d.sha256??'') || !pos(d.lineCount)) {errors.push('来源文件身份、路径、SHA256 或行数非法');continue;}
    docs.set(d.id,d);
    if (verify) try {
      const bytes=readFileSync(resolve(dirname(resolve(file)),d.path));
      if (hash(bytes)!==d.sha256) errors.push(`${d.id} 来源版本已变化，必须重新阅读核验`);
      if (sourceLineCount(bytes)!==d.lineCount) errors.push(`${d.id} 来源行数不一致`);
    } catch(e) {errors.push(`${d.id} 来源无法读取：${e.message}`);}
  }
  const range=r=>obj(r)&&docs.has(r.documentId)&&pos(r.startLine)&&pos(r.endLine)&&r.startLine<=r.endLine&&r.endLine<=docs.get(r.documentId).lineCount;
  if (!Array.isArray(p.coverage) || !p.coverage.length) errors.push('coverage 不能为空；seed 不代表已读取');
  for(const r of arr(p.coverage)) if(!range(r)) errors.push('coverage 范围非法');
  const covered=r=>{
    let next=r.startLine;
    for(const c of arr(p.coverage).filter(c=>range(c)&&c.documentId===r.documentId).sort((a,b)=>a.startLine-b.startLine)) {
      if(c.startLine>next) break;
      if(c.endLine>=next) next=c.endLine+1;
    }
    return next>r.endLine;
  };
  const refs=(rs,label)=>{
    if(!Array.isArray(rs)||!rs.length) errors.push(`${label} 缺少 sourceRefs`);
    for(const r of arr(rs)) {
      if(!range(r)) errors.push(`${label} sourceRefs 范围非法`);
      else if(!covered(r)) errors.push(`${label} sourceRefs 超出已读范围`);
      else if(r.quote!==undefined && verify) try {
        const d=docs.get(r.documentId), lines=readFileSync(resolve(dirname(resolve(file)),d.path),'utf8').split(/\r\n|\n|\r/);
        if(!txt(r.quote)||!lines.slice(r.startLine-1,r.endLine).join('\n').includes(r.quote)) errors.push(`${label} 引文不在指定来源行内`);
      } catch { /* document error already recorded */ }
    }
  };
  for(const c of arr(doc.characters)) {
    refs(c?.sourceRefs,c?.id??'character');
    for(const a of arr(c?.aliases)) {if(!txt(a?.name)) errors.push('aliases.name 不能为空');refs(a?.sourceRefs,'aliases');}
    for(const n of arr(c?.notes)) {if(!txt(n?.text)) errors.push('notes.text 不能为空');refs(n?.sourceRefs,'notes');}
  }
  for(const change of arr(doc.lifecycle?.changes)) if(change?.basis==='source') {
    if(change.revision===doc.lifecycle.revision) refs(change.sourceRefs,'lifecycle.changes');
    else {
      // Past decisions cite their original source version, not today's rewritten file.
      const historical=new Map(arr(change.sourceDocuments).map(d=>[d?.id,d]));
      if(!arr(change.sourceRefs).length) errors.push('历史映射缺少 sourceRefs');
      for(const r of arr(change.sourceRefs)) {
        const d=historical.get(r?.documentId);
        if(!d||!/^[a-f0-9]{64}$/.test(d.sha256??'')||!pos(d.lineCount)||!pos(r.startLine)||!pos(r.endLine)||r.startLine>r.endLine||r.endLine>d.lineCount) errors.push('历史映射缺少有效的原始来源版本依据');
      }
    }
  }
  if(p.scope==='complete') for(const d of docs.values()) if(!covered({documentId:d.id,startLine:1,endLine:d.lineCount})) errors.push(`完整范围漏读 ${d.id}`);
  return errors;
}
export function outlineErrors(outline, cast, outlinePath, castPath) {
  if(!obj(outline)||outline.schemaVersion!==5) return ['正式 outline 背景仅接受 v5；v3/v4 请显式 migrate-outline'];
  const errors=outlineInputErrors(outline);
  if(outline.source!==cast.source) errors.push('outline 与 cast 文档标题不匹配');
  for(const k of ['characters','scenes','props']) if(Object.hasOwn(outline,k)) errors.push(`outline v5 不应含 ${k} 资产权威`);
  if(!txt(outline.story?.summary)||!Array.isArray(outline.beats)||!Array.isArray(outline.episodes)) errors.push('outline v5 故事背景结构损坏');
  if(outline.story?.focusCharacterIds!==undefined||outline.params?.thresholds!==undefined) errors.push('outline v5 不允许角色身份或资产预算');
  const beatIds=new Set(),episodeIds=new Set();
  for(const b of arr(outline.beats)) {
    if(!obj(b)||!/^B\d{2,}$/.test(b.id??'')||beatIds.has(b.id)||!pos(b.episode)||!txt(b.setup)||!txt(b.outcome)) errors.push('outline v5 剧情节点损坏');
    beatIds.add(b?.id);
  }
  for(const e of arr(outline.episodes)) {
    if(!obj(e)||!pos(e.ep)||episodeIds.has(e.ep)) errors.push('outline v5 分集结构损坏');
    for(const k of ['characterIds','sceneIds','propIds']) if(e?.[k]!==undefined) errors.push('outline v5 分集不得含资产引用');
    episodeIds.add(e?.ep);
  }

  // Validate background facts against THEIR OWN coverage, not cast coverage.
  const facts=[{id:'story',sourceRefs:outline.story?.sourceRefs},...arr(outline.beats).map(b=>({id:b?.id,sourceRefs:b?.sourceRefs})),...arr(outline.episodes).map(e=>({id:`E${e?.ep}`,sourceRefs:e?.sourceRefs}))];
  const collect=value=>{
    if(!obj(value)&&!Array.isArray(value))return;
    if(obj(value)&&Object.hasOwn(value,'notes')) {
      if(!Array.isArray(value.notes))errors.push('outline.notes 必须是数组');
      for(const note of arr(value.notes))facts.push({id:'outline note',sourceRefs:note?.sourceRefs});
    }
    for(const [k,v] of Object.entries(value)) {
      if(['notes','provenance','sourceRefs'].includes(k))continue;
      if(k==='question')facts.push({id:'outline question',sourceRefs:v?.sourceRefs});
      if(k==='ending'&&v?.sourceRefs!==undefined)facts.push({id:'outline ending',sourceRefs:v.sourceRefs});
      collect(v);
    }
  };collect(outline);
  errors.push(...sourceErrors({...outline,characters:facts},outlinePath));
  const docs=new Map(arr(cast.provenance?.documents).map(d=>[d.id,d]));
  for(const d of arr(outline.provenance?.documents)) if(!docs.has(d.id)||docs.get(d.id).sha256!==d.sha256) errors.push(`outline 来源版本或文档身份不匹配 ${d.id}`);
  return [...new Set(errors)];
}
export function identityErrors(doc, file, {verify=true}={}) {
  if(!obj(doc)||doc.schemaVersion!==1||doc.kind!=='mint-characters') return ['正式 cast 需要 schemaVersion: 1, kind: mint-characters；旧文件请显式 migrate-cast'];
  const errors=sourceErrors(doc,file,{verify});
  if(!txt(doc.source)||!txt(doc.lang)) errors.push('source/lang 必须非空');
  if(!['draft','identified'].includes(doc.status)) errors.push('status 必须为 draft/identified');
  if(!Array.isArray(doc.characters)) errors.push('characters 必须是数组');
  const ids=new Set(), keys=new Set();
  for(const c of arr(doc.characters)) {
    if(!obj(c)) {errors.push('角色必须是对象');continue;}
    if(!cid(c.id)||ids.has(c.id)) errors.push('C ID 非法或重复');ids.add(c.id);
    if(!txt(c.identityKey)||keys.has(c.identityKey)) errors.push('identityKey 必须非空且唯一');keys.add(c.identityKey);
    if(!txt(c.name)||!Array.isArray(c.aliases)) errors.push(`${c.id} name/aliases 非法`);
    if(!['human','nonhuman','unknown','group'].includes(c.entityType)) errors.push(`${c.id} entityType 非法`);
    if(!Array.isArray(c.presence)||!c.presence.length||c.presence.some(x=>!['visible','voice-only','mentioned'].includes(x))||new Set(c.presence).size!==c.presence.length) errors.push(`${c.id} presence 非法`);
    if(!['speaking','silent','unknown'].includes(c.speech)) errors.push(`${c.id} speech 非法`);
    if(!Array.isArray(c.unknowns)||c.unknowns.some(x=>!txt(x))) errors.push(`${c.id} unknowns 必须为字符串数组`);
    if(c.notes!==undefined&&!Array.isArray(c.notes)) errors.push(`${c.id} notes 必须为数组`);
    if(c.importance!==undefined&&!['protagonist','major','supporting','minor'].includes(c.importance)) errors.push(`${c.id} importance 非法`);
    if(c.tier!==undefined&&!['lead','support','functional'].includes(c.tier)) errors.push(`${c.id} tier 非法；由人物阶段判定，不能从 importance 猜测`);
    for(const r of arr(c.persona?.relationships)) if(!cid(r.id)||!arr(doc.characters).some(x=>x.id===r.id)) errors.push(`${c.id} 关系必须显式引用已有 C ID，不按名字猜测`);
  }
  errors.push(...budgetChecks(doc).filter(g=>g.status==='fail'&&g.level==='error').map(g=>g.detail));
  errors.push(...budgetChangeErrors(doc,doc.lifecycle?.previousBudgets));
  const l=doc.lifecycle;
  if(!obj(l)||!Number.isSafeInteger(l.revision)||l.revision<1||!Array.isArray(l.registry)||!Array.isArray(l.changes)||!Array.isArray(l.recheckIds)) errors.push('生命周期未登记；执行 reconcile');
  else {
    const registry=new Map(), regKeys=new Set();
    for(const r of l.registry) {
      if(!cid(r?.id)||registry.has(r.id)||!txt(r.identityKey)||regKeys.has(r.identityKey)||!['active','retired'].includes(r.state)||!Number.isSafeInteger(r.allocatedRevision)||r.allocatedRevision<1||r.allocatedRevision>l.revision) errors.push('registry 非法、重复或 ID 被复用');
      registry.set(r?.id,r);regKeys.add(r?.identityKey);
    }
    for(const c of arr(doc.characters)) {
      const r=registry.get(c?.id);
      if(!r||r.state!=='active'||r.identityKey!==c.identityKey||r.fingerprint!==identityHash(c,doc.provenance)) errors.push(`${c?.id} 身份或来源变化尚未增量核验`);
      if(c.lifecycleStamp!==identityLifecycleStamp(c.id,l.changes)) errors.push(`${c.id} 身份合拆纠正记录摘要未更新，不能沿用联合引用`);
    }
    for(const r of l.registry) if((r.state==='active')!==ids.has(r.id)) errors.push(`${r.id} registry 与当前身份不一致`);
    if(l.revision===1&&l.previousHash!==null || l.revision>1&&!/^[a-f0-9]{64}$/.test(l.previousHash??'')) errors.push('previousHash 非法');
    for(const id of l.recheckIds) if(!registry.has(id)) errors.push('recheckIds 包含未分配身份');
    const retired=new Set();
    for(const change of l.changes) {
      const from=arr(change?.from),to=arr(change?.to);
      if(!obj(change)||!['merge','split','delete','correct'].includes(change.type)||!txt(change.reason)||!['source','user'].includes(change.basis)||change.basis==='user'&&!txt(change.decision)||!pos(change.revision)||change.revision>l.revision||from.some(id=>!registry.has(id))||to.some(id=>!registry.has(id))) errors.push('历史变更依据或引用非法');
      if(!from.length||new Set(from).size!==from.length||new Set(to).size!==to.length||change.type==='merge'&&(from.length<2||to.length!==1)||change.type==='split'&&(from.length!==1||to.length<2)||change.type==='delete'&&(from.length!==1||to.length!==0)||change.type==='correct'&&(from.length!==1||to.length!==1||from[0]!==to[0])) errors.push('历史变更映射形状非法');
      from.filter(id=>!to.includes(id)).forEach(id=>retired.add(id));
    }
    for(const r of l.registry) if(r.state==='retired'&&!retired.has(r.id)||r.state==='active'&&retired.has(r.id)) errors.push('身份退役缺少映射或发生 ID 复用');

  }
  if(doc.review?.status==='confirmed' && doc.review.inputHash!==reviewHash(doc)) errors.push('语义审核输入摘要已失效，必须重新核验');
  if(doc.status==='identified'&&doc.review?.status!=='confirmed') errors.push('identified 需要明确的人工/模型语义确认');
  if(!obj(doc.review)||!['pending','confirmed'].includes(doc.review.status)||doc.review.status==='confirmed'&&(!txt(doc.review.by)||!txt(doc.review.note))) errors.push('review 需要状态及语义确认依据；结构校验不自动通过审核');
  return [...new Set(errors)];
}
export function budgetChangeErrors(doc,previousBudgets) {
  const changes=doc.budgetChanges??[],errors=[];
  if(!Array.isArray(changes))return ['budgetChanges 必须为数组'];
  const allowed=['characters','maxLeads','maxSupport','maxFunctional'];
  for(const change of changes) if(!obj(change)||!allowed.includes(change.key)||!txt(change.basis)||!Object.hasOwn(change,'from')||!Object.hasOwn(change,'to'))errors.push('预算变更必须记录 key/from/to/basis 用户决定，不得自动取消或降级明确预算');
  if(!obj(previousBudgets))return errors;
  for(const key of allowed) if(previousBudgets[key]!==undefined&&previousBudgets[key]!==doc.budgets?.[key]) {
    const matches=changes.filter(c=>c?.key===key&&c.from===previousBudgets[key]&&c.to===(doc.budgets?.[key]??null)&&txt(c.basis));
    if(matches.length!==1)errors.push(`明确预算 ${key} 改值、删除或降级须记录唯一 budgetChanges 和用户依据`);
  }
  return errors;
}
export function budgetChecks(doc) {
  const limits={characters:arr(doc.characters).length,maxLeads:arr(doc.characters).filter(c=>c.tier==='lead').length,maxSupport:arr(doc.characters).filter(c=>c.tier==='support').length,maxFunctional:arr(doc.characters).filter(c=>c.tier==='functional').length};
  const checks=[],add=(id,detail,status='fail',level='error')=>checks.push({id,status,category:'base',level,detail});
  if(!obj(doc.budgets)) {add('character-budget','budgets 必须是对象');return checks;}
  if(doc.params?.thresholds!==undefined || Object.keys(doc.budgets).some(k=>!Object.hasOwn(limits,k)&&k!=='reference')) add('character-budget','未识别预算字段；必须显式归属角色预算，不能静默忽略');
  for(const [origin,values] of [['explicit',doc.budgets],['reference',doc.budgets.reference??{}]]) {
    if(!obj(values)) {add('character-budget-reference','budgets.reference 必须为对象');continue;}
    for(const [key,max] of Object.entries(values)) {
      if(origin==='explicit'&&key==='reference')continue;
      if(!Object.hasOwn(limits,key)||!Number.isSafeInteger(max)||max<0) {add('character-budget-'+key,`角色预算 ${key} 必须为已知字段和非负整数`);continue;}
      const unknown=key!=='characters'&&arr(doc.characters).some(c=>!['lead','support','functional'].includes(c.tier));
      const excess=limits[key]>max;
      add('character-budget-'+origin+'-'+key,unknown?`角色预算 ${key} 尚缺人物阶段明确 tier，不能推断或忽略分档预算`:`角色预算 ${key}：${limits[key]} / ${max}${excess?'，预算超额':''}`,unknown||excess?'fail':'pass',origin==='reference'?'warn':'error');
    }
  }
  if(!checks.length)add('character-budget','未设置明确角色预算；不推断默认预算','skipped');
  return checks;
}
export function reviewHash(doc) {return hash({source:doc.source,scope:doc.provenance?.scope,coverage:doc.provenance?.coverage,identities:arr(doc.characters).map(c=>({id:c.id,fingerprint:identityHash(c,doc.provenance)})).sort((a,b)=>a.id.localeCompare(b.id))});}
export function reconcile(candidate, previous=null, changes=[]) {
  const doc=structuredClone(candidate);
  if(doc.schemaVersion!==1||doc.kind!=='mint-characters'||!Array.isArray(doc.characters)) throw Error('reconcile 需要正式 cast v1');
  if(!Array.isArray(changes)) throw Error('changes 必须是数组');
  if(previous) {
    const bad=identityErrors(previous,'.',{verify:false});
    if(bad.length) throw Error('既有产物损坏：'+bad.join('；'));
    if(previous.source!==doc.source) throw Error('增量产物标题不匹配');
    const budgetErrors=budgetChangeErrors(doc,previous.budgets);if(budgetErrors.length)throw Error(budgetErrors.join('；'));
  } else if(doc.lifecycle?.revision>0) throw Error('已有身份必须提供 --previous，不能重置生命周期');
  const revision=(previous?.lifecycle.revision??0)+1;
  const registry=structuredClone(previous?.lifecycle.registry??[]), old=new Map(arr(previous?.characters).map(c=>[c.id,c]));
  const current=new Map(), keySet=new Set(), touched=new Set(), handled=new Set();
  const max=registry.reduce((m,r)=>Math.max(m,Number(r.id.slice(1))),0);let next=max+1;
  for(const c of doc.characters) {
    if(!txt(c.identityKey)||keySet.has(c.identityKey)) throw Error('每个身份需要唯一、永久 identityKey；不能按名字自动归并');keySet.add(c.identityKey);
    const known=registry.find(r=>r.identityKey===c.identityKey);
    if(known) {
      if(known.state==='retired') throw Error(`${known.id} 已退役，ID 和 identityKey 不复用`);
      if(c.id!==undefined&&c.id!==known.id) throw Error('重排不得改变既有 C ID');
      c.id=known.id;
    } else {
      if(previous&&c.id!==undefined) throw Error('新增身份不得指定或复用 ID，移除 id 后分配');
      if(!previous&&c.id!==undefined&&!cid(c.id)) throw Error('C ID 非法');
      if(c.id===undefined) {while(registry.some(r=>Number(r.id.slice(1))===next)||doc.characters.some(x=>x.id===`C${String(next).padStart(2,'0')}`)) next++;c.id=`C${String(next++).padStart(2,'0')}`;}
      if(registry.some(r=>r.id===c.id)) throw Error('ID 不复用');
      registry.push({id:c.id,identityKey:c.identityKey,state:'active',allocatedRevision:revision});
    }
    if(current.has(c.id)) throw Error('重复 C ID');current.set(c.id,c);
  }
  const history=structuredClone(previous?.lifecycle.changes??[]);
  for(const change of changes) {
    if(!obj(change)||!['merge','split','delete','correct'].includes(change.type)||!txt(change.reason)||!['source','user'].includes(change.basis)||change.basis==='user'&&!txt(change.decision)||change.basis==='source'&&!arr(change.sourceRefs).length) throw Error('身份合拆删纠正必须提供 type/from/to/reason 及 sourceRefs 或用户决定');
    const from=arr(change.from), to=arr(change.to);
    if(!from.length||new Set(from).size!==from.length||new Set(to).size!==to.length||from.some(id=>!old.has(id))||to.some(id=>!current.has(id))) throw Error('身份变更映射引用非法');
    if(change.type==='merge'&&(from.length<2||to.length!==1)||change.type==='split'&&(from.length!==1||to.length<2)||change.type==='delete'&&(from.length!==1||to.length!==0)||change.type==='correct'&&(from.length!==1||to.length!==1||from[0]!==to[0])) throw Error('身份变更映射形状非法');
    if(from.some(id=>handled.has(id))) throw Error('同一修订的身份变更冲突');
    from.forEach(id=>{handled.add(id);touched.add(id);});to.forEach(id=>touched.add(id));
    for(const id of from) if(!to.includes(id)&&current.has(id)) throw Error('被合并/拆分/删除的旧身份仍在活动表');
    history.push({...structuredClone(change),revision,
      ...(change.basis==='source'?{sourceDocuments:arr(doc.provenance?.documents).filter(d=>change.sourceRefs.some(r=>r.documentId===d.id)).map(d=>structuredClone(d))}:{})});
  }
  for(const [id,c] of old) {
    const now=current.get(id);
    if(!now&&!handled.has(id)) throw Error(`${id} 删除或合拆缺少显式映射依据`);
    if(now&&identityHash(now,doc.provenance)!==identityHash(c,previous.provenance)) {
      // Source version changes invalidate facts without changing identity allocation.
      const sameFacts=identityHash(now,previous.provenance)===identityHash(c,previous.provenance);
      if(!sameFacts&&!handled.has(id)) throw Error(`${id} 身份纠正缺少显式 correct 映射依据`);
      touched.add(id);
    }
  }
  for(const c of current.values()) c.lifecycleStamp=identityLifecycleStamp(c.id,history);
  for(const r of registry) {const c=current.get(r.id);r.state=c?'active':'retired';if(c) r.fingerprint=identityHash(c,doc.provenance);}
  doc.lifecycle={revision,previousHash:previous?hash(previous):null,...(previous?{previousBudgets:structuredClone(previous.budgets)}:{}),registry,changes:history,recheckIds:[...new Set([...arr(previous?.lifecycle.recheckIds),...touched])].sort()};
  const unchangedReview=previous && reviewHash(previous)===reviewHash(doc);
  doc.review=unchangedReview?structuredClone(previous.review):{status:'pending',note:'登记或增量更新不代表语义审核通过；受影响身份及联合引用需重新核验。'};
  doc.status=unchangedReview?previous.status:'draft';
  return doc;
}
export function migrationMaterial(input, path, kind) {
  if(kind==='outline'&&![3,4].includes(input?.schemaVersion)) throw Error('历史迁移仅接受 outline v3/v4');
  if(kind==='cast'&&(!obj(input)&&!Array.isArray(input)||input.schemaVersion!==undefined)) throw Error('历史 cast 迁移仅接受无版本对象');
  const characters=kind==='cast'&&Array.isArray(input)?input:input?.characters;
  if(!Array.isArray(characters)) throw Error('历史材料缺少 characters');
  const fields=[];
  function walk(v,p) {if(obj(v)&&Object.keys(v).length) for(const [k,x] of Object.entries(v)) walk(x,p?`${p}.${k}`:k);else if(Array.isArray(v)&&v.length) v.forEach((x,i)=>walk(x,`${p}[${i}]`));else fields.push({path:p,value:structuredClone(v),status:'pending'});}
  walk(input,'');
  return {schemaVersion:1,kind:'mint-characters-migration',status:'pending',source:input.source,
    legacy:{kind,path:resolve(path),sha256:hash(readFileSync(resolve(path))),snapshot:structuredClone(input)},
    candidates:characters.map(c=>({legacyId:c.id??null,name:c.name,legacy:structuredClone(c),status:'pending'})),
    fields,note:'逐字段待核对材料，不是正式 cast，不是审核通过。预算原值及无法归属关系均保留；不得只改版本号。'};
}
export function rebaseSources(doc, file) {
  const copy=structuredClone(doc);
  for(const d of arr(copy.provenance?.documents)) d.path=resolve(dirname(resolve(file)),d.path);
  return copy;
}
export function writeNew(path, doc) {writeFileSync(resolve(path),JSON.stringify(doc,null,2)+'\n',{flag:'wx'});}
export function renderIdentity(doc, html=false, {lang=doc.lang, images={}}={}) {
  const en=lang!=='zh', label=(zh,enText)=>en?enText:zh;
  const title=`${doc.source} · ${label('角色身份','Character identities')}`;
  const states=`cast v1 · ${doc.provenance.scope} · ${label('语义审核','Semantic review')}: ${doc.review.status}`;
  const notice=label('结构与来源核验不等于内容审核。联合对账：skipped。','Structural/source checks are not content review. Joint handoff: skipped.');
  const budget=`${label('角色预算','Character budget')}: ${JSON.stringify(doc.budgets)} · ${doc.characters.length}`;
  const pending=`${label('受影响引用待重新核验','Affected references need recheck')}: ${doc.lifecycle.recheckIds.join(', ')||label('没有记录','none recorded')}`;
  const sections=doc.characters.map(c=>({c,parts:[
    [label('来源身份','Source identity'),{identityKey:c.identityKey,tier:c.tier,aliases:c.aliases,entityType:c.entityType,presence:c.presence,speech:c.speech,unknowns:c.unknowns,sourceRefs:c.sourceRefs,notes:c.notes}],
    ...(c.persona?[[label('人物画像（含制作补定）','Profile (includes design decisions)'),c.persona]]:[]),
    ...(c.image?[[label('图片提示词（制作设计）','Image prompts (design)'),c.image]]:[]),
    ...(c.voice?[[label('音色提示词（制作设计）','Voice prompts (design)'),c.voice]]:[])
  ]}));
  const md=[`# ${title}`,'',states,'',notice,'',doc.summary??'','',budget,'',pending,''];
  for(const {c,parts} of sections) {
    md.push(`## [${c.id}] ${c.name}`,'');
    if(images[c.id])md.push(`![${c.id}](${images[c.id]})`,'');
    for(const [name,value] of parts)md.push(`### ${name}`,'','```json',JSON.stringify(value,null,2),'```','');
  }
  const evidence={provenance:doc.provenance,lifecycle:doc.lifecycle,budgets:doc.budgets,budgetChecks:budgetChecks(doc)};
  md.push(`## ${label('来源与生命周期','Provenance and lifecycle')}`,'','```json',JSON.stringify(evidence,null,2),'```');
  if(!html)return md.join('\n');
  const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const pre=value=>`<pre>${esc(JSON.stringify(value,null,2))}</pre>`;
  return `<!doctype html><html lang="${esc(lang)}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>:root{--paper:#eceded;--panel:#f5f6f5;--ink:#191d21;--seal:#8a3324}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.7 system-ui}header,main{padding:24px}h1,h2{font-family:Georgia,"Songti SC",serif}header{background:var(--panel)}.layout{display:grid;grid-template-columns:240px minmax(0,1fr)}nav{padding:24px;position:sticky;top:0;height:100vh;overflow:auto}nav a{display:block;color:var(--ink);margin:12px 0}article{border-top:2px solid var(--seal);margin-bottom:36px}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:18px;background:var(--panel);font:13px/1.6 ui-monospace,monospace}img{max-width:100%;max-height:700px}button{padding:7px 16px;cursor:pointer}a:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--seal)}@media(max-width:750px){.layout{display:block}nav{position:static;height:auto}}@media print{nav,button{display:none}.layout{display:block}details{display:block}article{break-inside:avoid}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}</style>
<header><h1>${esc(title)}</h1><p>${esc(states)}</p><p>${esc(notice)}</p><p>${esc(budget)} · ${esc(pending)}</p><button id="export">${label('导出 JSON','Export JSON')}</button></header>
<div class="layout"><nav>${sections.map(({c})=>`<a href="#${c.id}">[${c.id}] ${esc(c.name)}</a>`).join('')}</nav><main><p>${esc(doc.summary??'')}</p>
${sections.map(({c,parts})=>`<article id="${c.id}"><h2>[${c.id}] ${esc(c.name)}</h2>${images[c.id]?`<img src="${esc(images[c.id])}" alt="${c.id}">`:''}${parts.map(([name,value])=>`<details open><summary>${esc(name)}</summary><button class="copy">${label('复制','Copy')}</button>${pre(value)}</details>`).join('')}</article>`).join('')}
<h2>${label('来源与生命周期','Provenance and lifecycle')}</h2>${pre(evidence)}</main></div>
<script type="application/json" id="cast-data">${JSON.stringify(doc).replaceAll('<','\\u003c')}</script>
<script>document.querySelectorAll('.copy').forEach(b=>b.onclick=()=>navigator.clipboard.writeText(b.nextElementSibling.textContent));document.getElementById('export').onclick=()=>{const a=document.createElement('a'),u=URL.createObjectURL(new Blob([document.getElementById('cast-data').textContent],{type:'application/json'}));a.href=u;a.download='cast.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)};</script></html>`;
}
