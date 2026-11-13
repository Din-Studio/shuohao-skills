// Outline v5: extract existing scripts. Deterministic checks do not prove fidelity.
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {documentErrors} from './document.mjs';
import {provenanceErrors,sourceRefsErrors,verifySources,coverageOf} from './source.mjs';
export const SKILL_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const STAGES=['skeleton','beats','full'];
export const MODES=['suspense','closure','open'];
export const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.trim().length>0;
const int=x=>Number.isSafeInteger(x)&&x>0;
const arr=x=>Array.isArray(x)?x:[];
const validIds=(xs,prefix)=>Array.isArray(xs)&&xs.every(x=>typeof x==='string'&&new RegExp(`^${prefix}\\d{2,}$`).test(x))&&new Set(xs).size===xs.length;
export const blocking=g=>g.status==='fail'&&g.level==='error';
export function createSkeleton({source,provenance,genre,creativeBrief,lang}={}){
 return {schemaVersion:5,source,...(provenance===undefined?{}:{provenance:structuredClone(provenance)}),...(genre===undefined?{}:{params:{genre}}),...(creativeBrief===undefined?{}:{creativeBrief}),...(lang===undefined?{}:{lang}),story:{summary:'',sourceRefs:[]},beats:[],episodes:[]};
}
export const newQuestion=q=>structuredClone(q);
export function checkup(doc,options={}){
 if(typeof options==='string')options={stage:options};
 const stage=options.stage??'full',gates=[];
 const add=(id,messages=[],extra={})=>gates.push({id,category:'base',level:'error',status:messages.length?'fail':'pass',messages,...extra});
 const skip=(id,reason,category='base',level='error')=>add(id,[],{status:'skipped',reason,category,level});
 const reject=(x,keys,path,errors)=>{for(const k of keys)if(x?.[k]!==undefined)errors.push(`${path}.${k}: not allowed in outline v5; use explicit migration`);};
 const fields=(x,keys,path,errors)=>{if(!object(x)){errors.push(path+': object required');return;}for(const k of keys)if(!text(x[k]))errors.push(`${path}.${k}: non-empty string required`);};
 if(!object(doc)){add('document',['outline must be an object']);return finish();}
 if(!STAGES.includes(stage))add('stage',['unknown stage '+stage]);
 const p=object(doc.params)?doc.params:{},beats=arr(doc.beats),eps=arr(doc.episodes);
 const bi=new Map(beats.map(b=>[b?.id,b]));
 const errors=[];
 if(doc.schemaVersion!==5)errors.push('schemaVersion must be 5; run migrate-v5 explicitly (v2/v3 require historical migration first)');
 fields(doc,['source'],'outline',errors);
 if(doc.lang!==undefined&&!['zh','en'].includes(doc.lang))errors.push('lang must be zh/en');
 if(doc.params!==undefined&&!object(doc.params))errors.push('params must be an object');
 if(p.genre!==undefined&&!text(p.genre))errors.push('params.genre must be non-empty');
 // Closed contract: reject unknown or historical fields, including nested assets at every stage.
 const shape=(x,keys,path)=>{if(!object(x))return;for(const k of Object.keys(x))if(!keys.includes(k))errors.push(`${path}.${k}: not allowed in outline v5; migrate explicitly`);};
 shape(doc,['schemaVersion','source','lang','params','creativeBrief','provenance','story','beats','episodes','notes'],'outline');
 shape(p,['genre'],'params');
 shape(doc.story,['summary','endingBeatId','sourceRefs','notes'],'story');
 const noteShape=(x,path)=>arr(x?.notes).forEach((n,i)=>{shape(n,['kind','text','sourceRefs','episode','epistemic','speaker'],`${path}.notes[${i}]`);shape(n?.speaker,['status','description'],`${path}.notes[${i}].speaker`);});
 noteShape(doc,'outline');noteShape(doc.story,'story');
 for(const [i,b] of beats.entries()){shape(b,['id','episode','setup','outcome','resolves','sourceRefs','notes'],`beats[${i}]`);noteShape(b,`beats[${i}]`);}
 for(const [i,e] of eps.entries()){shape(e,['ep','synopsis','opening','ending','warnings','sourceRefs','notes'],`episodes[${i}]`);noteShape(e,`episodes[${i}]`);shape(e?.ending,['event','mode','question','sourceRefs'],`episodes[${i}].ending`);shape(e?.ending?.question,['id','text','reason','sourceRefs'],`episodes[${i}].ending.question`);}
 errors.push(...documentErrors(doc,options.production));
 // Reject old persisted fields at every stage, even if the corresponding stage is incomplete.
 for(const b of beats)reject(b,['position','kind','weight','type','payoff'],`beats.${b?.id}`,errors);
 for(const e of eps){reject(e,['stateChange','hook','suspense','crowdPlan','beatIds'],`ep${e?.ep}`,errors);reject(e?.ending?.question,['resolution','dueByEp'],`ep${e?.ep}.question`,errors);}
 add('fields',errors);
 add('provenance',provenanceErrors(doc.provenance,{episodes:eps,requireEpisodes:stage==='full'}));
 const refs=(x,path,errors,required=true)=>errors.push(...sourceRefsErrors(x?.sourceRefs,doc.provenance,path+'.sourceRefs',{required}));
 const notes=(x,path,errors)=>{
  if(x?.notes===undefined)return;
  if(!Array.isArray(x.notes))errors.push(path+'.notes must be an array');
  for(const [i,n] of arr(x.notes).entries()){
   const label=`${path}.notes[${i}]`;fields(n,['text'],label,errors);refs(n,label,errors);
   if(!['performance','background','continuity','restriction'].includes(n?.kind))errors.push(label+': invalid kind');
   if(n?.epistemic!==undefined&&!['fact','claim','uncertain'].includes(n.epistemic))errors.push(label+': invalid epistemic');
   if(n?.speaker!==undefined){
    if(!object(n.speaker)||!['described','unknown'].includes(n.speaker.status)||!text(n.speaker.description))errors.push(label+': speaker requires status described/unknown and source-supported description (unknown must remain explicit)');
   }
   if(n?.episode!==undefined&&(!int(n.episode)||(stage==='full'&&!eps.some(e=>e?.ep===n.episode))))errors.push(label+': unknown episode');
   if(n?.candidate!==undefined||n?.transformation!==undefined)errors.push(label+': outline extracts source facts, not transformation candidates');
  }
 };
 const se=[],story=doc.story;
 fields(story,['summary'],'story',se);refs(story,'story',se);
 reject(story,['premise','throughline','ending','audiencePromise','drive'],'story',se);
 notes(doc,'outline',se);notes(story,'story',se);add('story',se);
 if(stage==='skeleton'){for(const id of ['beats','ending-beat'])skip(id,'stage-incomplete');}
 else{
  const be=[];if(!Array.isArray(doc.beats))be.push('beats must be an array');
  if(!validIds(beats.map(b=>b?.id),'B'))be.push('beats: invalid or duplicate B IDs');
  let previous=0;
  for(const b of beats){const label='beats.'+b?.id;fields(b,['setup','outcome'],label,be);refs(b,label,be);notes(b,label,be);
   if(!int(b?.episode)||b.episode<previous||doc.provenance?.totalEpisodes&&b.episode>doc.provenance.totalEpisodes||(stage==='full'&&!eps.some(e=>e?.ep===b?.episode)))be.push(label+': invalid episode/order');previous=b?.episode;
   if(b?.resolves!==undefined&&!validIds(b.resolves,'Q'))be.push(label+': resolves must be unique Q IDs');
  }
  add('beats',be);
  const ending=bi.get(story?.endingBeatId),known=doc.provenance?.totalEpisodes;
  add('ending-beat',story?.endingBeatId!==undefined&&(!int(known)||!ending||ending.episode!==known)?['story.endingBeatId requires identified ending in known final episode']:[]);

 }
 if(stage!=='full'){for(const id of ['episodes','questions'])skip(id,'stage-incomplete');}
 else{
  const ee=[],qe=[],questions=new Map();let previous=0;
  if(!Array.isArray(doc.episodes)||!eps.length)ee.push('episodes must be non-empty');
  for(const e of eps){const label='ep'+e?.ep;
   if(!int(e?.ep)||e.ep<=previous)ee.push(label+': episode numbers must be positive, unique and increasing');previous=e?.ep;
   fields(e,['synopsis'],label,ee);refs(e,label,ee);notes(e,label,ee);
   if(e?.opening!==undefined&&!text(e.opening))ee.push(label+': opening must be non-empty');
   if(e?.warnings!==undefined&&(!Array.isArray(e.warnings)||!e.warnings.every(text)))ee.push(label+': warnings must be strings');
   const end=e?.ending;
   if(end!==undefined){fields(end,['event'],label+'.ending',ee);if(end?.mode!==undefined&&!MODES.includes(end.mode))ee.push(label+': invalid ending mode');if(object(end)&&Object.keys(end).some(k=>!['event','mode','question','sourceRefs'].includes(k)))ee.push(label+': unknown ending fields');refs(end,label+'.ending',ee,false);}
   if(end?.question!==undefined){const q=end.question;fields(q,['text'],label+'.question',qe);refs(q,label+'.question',qe);
    if(!validIds([q?.id],'Q')||questions.has(q?.id))qe.push(label+': invalid or duplicate Q ID');
    if(object(q)&&Object.keys(q).some(k=>!['id','text','reason','sourceRefs'].includes(k)))qe.push(label+': unknown question fields');
    if(q?.reason!==undefined&&!text(q.reason))qe.push(label+': reason must be non-empty');questions.set(q?.id,{...q,ep:e.ep});
   }
  }
  const resolved=new Set();for(const b of beats)for(const id of arr(b?.resolves)){
   const q=questions.get(id);if(!q||resolved.has(id)||b.episode<=q.ep)qe.push(`${b?.id}: unknown, repeated or non-later resolution ${id}`);resolved.add(id);
  }
  add('episodes',ee);add('questions',qe);

 }
 if(options.verifySources){const result=verifySources(doc,options);add('source-files',result.errors,{category:'source',verification:result});}else skip('source-files','not-requested','source');
 if(options.production===undefined&&!options.productionError)skip('project-requirements','missing-upstream');
 if(options.productionError)add('production-readable',[options.productionError]);
 skip('content-review','not-performed','content','warn');return finish();
 function finish(){const stats={pass:gates.filter(g=>g.status==='pass').length,fail:gates.filter(blocking).length,warn:gates.filter(g=>g.status==='fail'&&!blocking(g)).length,skipped:gates.filter(g=>g.status==='skipped').length};return {stage,gates,stats,complete:stage==='full'&&stats.fail===0,scope:doc?.provenance?.scope,coverage:coverageOf(doc?.provenance),sourceVerification:gates.find(g=>g.id==='source-files')?.status??'not-performed',contentReview:'not-performed'};}
}
export const gateReport=(doc,options={})=>checkup(doc,options).gates;
export function validateOutline(doc,stage='full',options={}){if(object(stage)){options=stage;stage=options.stage??'full';}return checkup(doc,{...options,stage}).gates.filter(blocking).flatMap(g=>g.messages.map(m=>`${g.id}: ${m}`));}
