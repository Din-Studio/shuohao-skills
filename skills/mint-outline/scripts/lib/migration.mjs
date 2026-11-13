// Explicit v2 -> v3 conversion. Runtime validators never dual-read old formats.
import {readFileSync,writeFileSync,lstatSync,unlinkSync,constants,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {checkup,object} from './legacy-v3-core.mjs';
import {nonempty} from './document.mjs';
const rules={payoffCoverage:['minPerEpisode'],firstMajor:['byEpisode'],majorGap:['maxGap'],endingPayoff:['minWeight'],endingModes:['nonFinal','final'],optionalQuestions:['allow'],stateProgress:[],arcCoverage:[],arcPayoff:['minWeight']};
function describeRule(key,r) {
 const weight=x=>x==='major'?'重大':'一般',mode={suspense:'悬念',closure:'收束',open:'开放'};
 return {payoffCoverage:()=>`每集至少安排 ${r.minPerEpisode} 次实际兑现`,firstMajor:()=>`首次重大兑现不晚于第 ${r.byEpisode} 集（总集数不足时以末集为限）`,majorGap:()=>`相邻重大兑现所在集之间不超过 ${r.maxGap} 集`,endingPayoff:()=>`终局至少形成${weight(r.minWeight)}兑现`,endingModes:()=>`普通集允许${r.nonFinal.map(x=>mode[x]).join('、')}结束；最终集允许${r.final.map(x=>mode[x]).join('、')}结束`,optionalQuestions:()=>r.allow?'允许保留不承诺回答的开放问题':'不保留未回答的开放问题',stateProgress:()=>'每集应有实际状态推进',arcCoverage:()=>'如有阶段规划，各阶段应连续覆盖全剧',arcPayoff:()=>`如有阶段规划，阶段终点至少形成${weight(r.minWeight)}兑现`}[key]();
}
function legacyErrors(old) {
 const errors=[];
 if(!object(old)||old.schemaVersion!==2) return ['migration requires a schemaVersion 2 object'];
 if(!object(old.params)) return ['v2 params must be an object'];
 if(old.params.preferences!==undefined&&(!Array.isArray(old.params.preferences)||!old.params.preferences.every(nonempty)))errors.push('v2 preferences must be non-empty strings');
 if(old.story?.drive!==undefined&&(!object(old.story.drive)||!Object.values(old.story.drive).every(nonempty)))errors.push('v2 story.drive must contain strings');
 if(!object(old.adaptation)||!nonempty(old.adaptation.core))errors.push('v2 adaptation.core required');
 for(const k of ['keep','cut','merge','risks'])if(!Array.isArray(old.adaptation?.[k]))errors.push('v2 adaptation.'+k+' must be an array');
 for(const c of Array.isArray(old.characters)?old.characters:[]) {
  if(!Array.isArray(c?.from)||!c.from.length||!c.from.every(nonempty))errors.push('v2 character.from required');
  if(c?.tier!=='functional'&&!nonempty(c?.arc))errors.push('v2 character.arc required');
 }
 for(const key of ['premise','throughline','ending','audiencePromise'])if(!nonempty(old.story?.[key]))errors.push('v2 story.'+key+' required');
 let previous=-1;
 for(const b of Array.isArray(old.beats)?old.beats:[]) {
  if(!nonempty(b?.setup)||!nonempty(b?.outcome)||!nonempty(b?.type)||b?.position===undefined||b?.kind===undefined||(b.kind==='payoff'&&b.weight===undefined))errors.push('v2 beat setup/outcome/type/position/kind/payoff weight required');
  const order=b?.episode*5+['opening','early','middle','late','ending'].indexOf(b?.position);
  if(order<previous)errors.push('v2 beats must follow episode/position order');previous=order;
 }
 for(const ep of Array.isArray(old.episodes)?old.episodes:[]) {
  if(!nonempty(ep?.synopsis)||!nonempty(ep?.opening))errors.push('v2 episode opening/synopsis required');
  if(ep?.stateChange!==undefined&&(!object(ep.stateChange)||!nonempty(ep.stateChange.before)||!nonempty(ep.stateChange.after)||Object.keys(ep.stateChange).some(k=>!['before','after'].includes(k))))errors.push('v2 stateChange requires before/after only; unknown information needs manual review');
  if(ep?.ending?.mode==='suspense'&&!object(ep.ending.question))errors.push('v2 suspense question required');
  if(ep?.ending?.question?.resolution==='optional'&&!nonempty(ep.ending.question.reason))errors.push('v2 optional question reason required');
 }
 const r=old.params.rules;
 if(!object(r)||Object.keys(r).length!==Object.keys(rules).length) errors.push('v2 complete rules required');
 for(const [key,fields] of Object.entries(rules)) {
  const rule=r?.[key];
  if(!object(rule)||!['off','warn','error'].includes(rule.level)){errors.push('v2 invalid rule '+key);continue;}
  const expected=rule.level==='off'?['level']:['level',...fields];
  if(Object.keys(rule).length!==expected.length||expected.some(k=>!(k in rule)))errors.push('v2 invalid rule fields '+key);
  if(rule.level==='off')continue;
  for(const k of fields) {
   const v=rule[k];
   const valid=k==='allow'?typeof v==='boolean':k==='minWeight'?['minor','major'].includes(v):['nonFinal','final'].includes(k)?Array.isArray(v)&&v.length&&new Set(v).size===v.length&&v.every(x=>['suspense','closure','open'].includes(x)):Number.isInteger(v)&&v>0;
   if(!valid)errors.push('v2 invalid rule value '+key+'.'+k);
  }
 }
 const defaults=old.params.defaults;
 if(!object(defaults)||Object.keys(defaults).length!==1||!Object.hasOwn(defaults,'questionResolveWithin')||(defaults.questionResolveWithin!==null&&(!Number.isInteger(defaults.questionResolveWithin)||defaults.questionResolveWithin<1)))errors.push('v2 invalid defaults');
 // Metadata is not promoted to v3, but malformed stored identities are not repaired.
 if(old.creativeContext!==undefined) {
  const c=old.creativeContext,dimensions=['genre','narrativeStyle','structure','pacing'];
  const identity=x=>object(x)&&typeof x.id==='string'&&/^[a-z][a-z0-9-]*$/.test(x.id)&&typeof x.version==='string'&&/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(x.version);
  if(!object(c)||Object.keys(c).some(k=>!['selection','references','overridePaths'].includes(k))||!object(c.selection)||Object.keys(c.selection).length!==4||dimensions.some(k=>!identity(c.selection[k])||Object.keys(c.selection[k]).some(k=>!['id','version'].includes(k)))||!Array.isArray(c.references)||c.references.some(r=>!identity(r)||!dimensions.includes(r.dimension)||r.stage!=='outline'||typeof r.sha256!=='string'||!/^[a-f0-9]{64}$/.test(r.sha256))||!Array.isArray(c.overridePaths)||!c.overridePaths.every(nonempty)) errors.push('v2 invalid creativeContext');
 }
 return errors;
}
const append=(base,label,value)=>base+'\n'+label+'：'+value;
export function migrationDraft(old,{confirm=false}={}) {
 const errors=legacyErrors(old);
 if(errors.length)throw Error(errors.join('\n'));
 const doc=structuredClone(old),pending=[];
 const record=(path,value,destination)=>pending.push({path,value:structuredClone(value),destination,status:confirm?'confirmed-preserved-merge':'pending-review'});
 doc.schemaVersion=3;
 if(doc.story.drive!==undefined) {
  record('story.drive',doc.story.drive,'story.throughline');
  for(const [k,v] of Object.entries(doc.story.drive))doc.story.throughline=append(doc.story.throughline,k,v);
  delete doc.story.drive;
 }
 record('adaptation.core',doc.adaptation.core,'story.premise');
 doc.story.premise=append(doc.story.premise,'原改编核心',doc.adaptation.core);delete doc.adaptation.core;
 for(const b of doc.beats??[]) {
  record('beats.'+b.id+'.type',b.type,'beats.'+b.id+'.setup');
  b.setup=append(b.setup,'原事件含义',b.type);delete b.type;
 }
 for(const ep of doc.episodes??[])if(ep.stateChange!==undefined) {
  record('episodes.'+ep.ep+'.stateChange',ep.stateChange,'episodes.'+ep.ep+'.synopsis');
  ep.synopsis=append(ep.synopsis,'原状态变化',ep.stateChange.before+' → '+ep.stateChange.after);delete ep.stateChange;
 }
 const brief=doc.creativeBrief?[doc.creativeBrief]:[];
 if(doc.params.preferences?.length) {
  record('params.preferences',doc.params.preferences,'creativeBrief (move to production for project mode)');brief.push(...doc.params.preferences);
 }
 for(const [k,r] of Object.entries(doc.params.rules)) {
  record('params.rules.'+k,r,r.level==='off'?'review sidecar (disabled constraint)':'creativeBrief');
  if(r.level!=='off')brief.push('历史创作要求（'+(r.level==='warn'?'建议':'明确要求')+'）：'+describeRule(k,r)+'。');
 }
 record('params.defaults',doc.params.defaults,'review sidecar; no automatic deadlines');
 for(const path of doc.creativeContext?.overridePaths??[])record('manual override: '+path,path,'review each overridden constraint before confirming');
 if(brief.length)doc.creativeBrief=brief.join('\n');
 delete doc.params.preferences;delete doc.params.rules;delete doc.params.defaults;delete doc.creativeContext;
 const validation=checkup(doc);
 if(validation.stats.fail)throw Error('Input cannot migrate without repair:\n'+validation.gates.filter(g=>g.status==='fail'&&g.level==='error').flatMap(g=>g.messages).join('\n'));
 return {document:doc,status:pending.length&&!confirm?'pending':'ready',pending,review:{contentReview:'not-performed',legacySelection:old.creativeContext?.selection??null,instructions:'Review semantic merges and every historical default/override. --confirm accepts conservative text preservation, not story quality. Project brief must be merged into production before local copy removal.'}};
}
export function migrateFile(input,output,{confirm=false}={}) {
 const from=resolve(input);
 if(!lstatSync(from).isFile())throw Error('Migration input must be a regular file, not a symlink');
 const raw=readFileSync(from),result=migrationDraft(JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(raw)),{confirm});
 if(!output)return result;
 const to=resolve(output),backup=to+'.v2-backup',review=to+'.migration.json';
 if(from===to)throw Error('Migration requires a different output path; original is never overwritten');
 for(const p of [to,backup,review]) {try{lstatSync(p);}catch(e){if(e.code==='ENOENT')continue;throw e;}throw Error('Migration destination already exists: '+p);}
 if(result.status!=='ready')return {...result,written:false};
 if(!readFileSync(from).equals(raw))throw Error('Input changed during migration; retry');
 const created=[];
 try {
  copyFileSync(from,backup,constants.COPYFILE_EXCL);created.push(backup);
  if(!readFileSync(backup).equals(raw))throw Error('Input changed before backup');
  writeFileSync(review,JSON.stringify({pending:result.pending,...result.review},null,2)+'\n',{flag:'wx'});created.push(review);
  writeFileSync(to,JSON.stringify(result.document,null,2)+'\n',{flag:'wx'});created.push(to);
 } catch(error) {for(const p of created.reverse())unlinkSync(p);throw error;}
 return {...result,written:true,output:to,backup,reviewFile:review,migrationFile:review};
}
