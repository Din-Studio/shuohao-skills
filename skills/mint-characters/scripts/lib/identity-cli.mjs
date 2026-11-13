import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {hash,reviewHash,budgetChecks,seedSource,identityErrors,outlineErrors,reconcile,rebaseSources,writeNew,renderIdentity} from './identity.mjs';
const read=p=>JSON.parse(readFileSync(resolve(p),'utf8'));
const valued=['--source','--title','--out','--outline','--previous','--changes','--budget','--lang'];
function flag(args,k) {const i=args.indexOf(k);if(i<0)return null;if(!args[i+1]||args[i+1].startsWith('--')||args.indexOf(k,i+1)>=0)throw Error(`${k} 需要唯一参数值`);return args[i+1];}
function emit(doc,args) {const out=flag(args,'--out');if(out)writeNew(out,doc);else console.log(JSON.stringify(doc,null,2));}
function background(doc,file,args) {
  const explicit=flag(args,'--outline');
  const path=explicit??(doc.background?resolve(dirname(resolve(file)),doc.background.path):null);
  if(!path)return [{id:'outline-background',status:'skipped',category:'base',level:'error',detail:'未提供可选 v5 故事背景；独立模式不代表完整流程'}];
  const outline=read(path),bad=outlineErrors(outline,doc,path,file);
  if(doc.background&&hash(readFileSync(path))!==doc.background.sha256)bad.push('outline 背景摘要变化，需回查原文，不能静默覆盖');
  return [{id:'outline-background',status:bad.length?'fail':'pass',category:'base',level:'error',detail:bad.join('；')}];
}
export async function identityCommand(cmd,args,helpers) {
  const independent=cmd==='seed'&&args.includes('--source');
  const registered=['reconcile'].includes(cmd);
  let doc;
  if(!independent&&!registered) {
    if(!['validate','checkup','render','images'].includes(cmd)||!args[0]||args[0].startsWith('--'))return false;
    doc=read(args[0]);
    if(doc?.schemaVersion!==1||doc?.kind!=='mint-characters')throw Error('cast 需要 schemaVersion: 1, kind: mint-characters');
  }
  if(independent||registered) for(const k of valued)if(args.includes(k))flag(args,k);
  if(independent) {
    doc=seedSource(flag(args,'--source'),flag(args,'--title'));
    const budget=flag(args,'--budget');
    if(budget!==null) {if(!/^\d+$/.test(budget)||!Number.isSafeInteger(Number(budget)))throw Error('--budget 需要非负整数');doc.budgets.characters=Number(budget);}
    if(flag(args,'--lang'))doc.lang=flag(args,'--lang');
    const outlinePath=flag(args,'--outline');
    if(outlinePath) {
      const outline=read(outlinePath);
      const bad=outlineErrors(outline,{...doc,provenance:{...doc.provenance,coverage:outline.provenance?.coverage??[]}},outlinePath,'.');
      if(bad.length)throw Error(bad.join('；'));
      doc.background={path:resolve(outlinePath),sha256:hash(readFileSync(outlinePath)),role:'story-only'};
    }
    emit(doc,args);return true;
  }
  if(registered) {
    if(!args[0]||args[0].startsWith('--'))throw Error('reconcile <候选cast.json> [--previous 既有cast.json] [--changes changes.json]');
    const file=args[0],previousPath=flag(args,'--previous'),changesPath=flag(args,'--changes');
    const previous=previousPath?read(previousPath):null;
    if(previousPath && (!previous || typeof previous!=='object' || Array.isArray(previous)))throw Error('已提供的既有产物损坏，不能当作缺失');
    doc=rebaseSources(read(file),file);
    if(doc.background)doc.background.path=resolve(dirname(resolve(file)),doc.background.path);
    doc=reconcile(doc,previous,changesPath?read(changesPath):[]);
    const bad=identityErrors(doc,'.');
    if(bad.length)throw Error(bad.join('；'));
    const bg=background(doc,'.',args);if(bg.some(g=>g.status==='fail'))throw Error(bg.map(g=>g.detail).join('；'));
    emit(doc,args);return true;
  }
  const file=args[0],bad=identityErrors(doc,file);
  const previousPath=flag(args,'--previous');
  const checks=[{id:'identity-source-lifecycle-budget',status:bad.length?'fail':'pass',category:'base',level:'error',detail:bad.join('；')},...background(doc,file,args),...budgetChecks(doc)];
  if(previousPath) {
    const previous=read(previousPath),errors=[];
    if(doc.lifecycle.previousHash!==hash(previous))errors.push('previousHash 与既有产物不一致');
    try {
      const changes=doc.lifecycle.changes.filter(c=>c.revision===doc.lifecycle.revision);
      // Strip freshly allocated IDs before deterministic replay.
      const candidate=structuredClone(doc),known=new Set(previous.lifecycle.registry.map(r=>r.identityKey));
      for(const c of candidate.characters)if(!known.has(c.identityKey))delete c.id;
      const replay=reconcile(candidate,previous,changes);
      if(hash(replay.lifecycle)!==hash(doc.lifecycle))errors.push('增量生命周期与既有产物不一致');
    } catch(e) {errors.push(e.message);}
    checks.push({id:'incremental-baseline',status:errors.length?'fail':'pass',category:'base',level:'error',detail:errors.join('；')});
  } else checks.push({id:'incremental-baseline',status:doc.lifecycle.revision>1?'fail':'skipped',category:'base',level:'error',detail:'未提供 --previous，未核验外部基线；registry 仅作本地一致性检查'});
  checks.push({id:'semantic-review',status:'skipped',category:'content',level:'error',detail:`本命令未执行语义审核；已记录状态 ${doc.review?.status??'pending'}`},
    {id:'joint-handoff',status:'skipped',category:'base',level:'error',detail:'未执行跨阶段映射与完整流程交接'});
  // Designs are optional and independently validated when present.
  const designProblems=helpers.designProblems(doc,file,args);
  checks.push({id:'optional-design',status:designProblems.length?'fail':doc.characters.some(c=>c.persona||c.image||c.voice)?'pass':'skipped',category:'base',level:'error',detail:designProblems.join('；')});
  if(cmd==='validate'||cmd==='checkup') {
    console.log(JSON.stringify({schemaVersion:1,kind:'mint-characters-checks',reviewInputHash:reviewHash(doc),checks},null,2));
    if(checks.some(g=>g.status==='fail'&&g.level==='error'))throw Error('角色阶段校验失败');return true;
  }
  if(checks.some(g=>g.status==='fail'&&g.level==='error'))throw Error(checks.filter(g=>g.status==='fail'&&g.level==='error').map(g=>g.detail).join('；'));
  if(cmd==='render') {
    const images={};
    for(const c of doc.characters) {const path=`images/${c.id}-sheet.png`;if(existsSync(resolve(dirname(resolve(file)),path)))images[c.id]=path;}
    console.log(renderIdentity(doc,args.includes('--html'),{lang:flag(args,'--lang')??doc.lang,images}));return true;
  }
  if(cmd==='images') {await helpers.images(doc,file,args);return true;}
  return false;
}
