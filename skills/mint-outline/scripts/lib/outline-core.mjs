// Outline v4: extract existing scripts. Deterministic checks do not prove fidelity.
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {documentErrors} from './document.mjs';
import {provenanceErrors,sourceRefsErrors,verifySources,coverageOf} from './source.mjs';
export const SKILL_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const STAGES=['skeleton','beats','full'];
export const MODES=['suspense','closure','open'];
export const CHARACTER_TIERS=['lead','support','functional'];
export const TIER_LABELS={lead:'主角组',support:'重要配角',functional:'功能性角色'};
export const TIER_ASSET_SPEC={lead:'按制作需求确认角色资产',support:'按制作需求确认角色资产',functional:'按制作需求确认角色资产'};
export const DEFAULT_THRESHOLDS={maxLeads:5,maxSupport:10,maxFunctional:10,maxProps:8};
export function primarySceneCap(n){return Number.isInteger(n)&&n>0?Math.max(5,Math.min(15,4+Math.ceil(n/10))):8;}
export function thresholdsOf(doc){return {...DEFAULT_THRESHOLDS,maxPrimaryScenes:primarySceneCap(doc?.episodes?.length),...(object(doc?.params?.thresholds)?doc.params.thresholds:{})};}
export const RISK_PATTERNS={雨戏:/下(?:起|着|过)?雨|雨中|雨夜|雨天|暴雨|大雨|小雨|细雨|阵雨|淋雨|雨水|雨声|雨滴|雨幕|雨势|雨停|雨落|风雨/,肢体接触:/吻|拥抱|相拥|牵手|贴身|扭打|搂/,人群:/人群|围观|众人|满堂|满座|集市|人山/,手部特写:/手部|指尖|十指|特写.{0,4}手/};
export const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.trim().length>0;
const int=x=>Number.isSafeInteger(x)&&x>0;
const arr=x=>Array.isArray(x)?x:[];
const validIds=(xs,prefix)=>Array.isArray(xs)&&xs.every(x=>typeof x==='string'&&new RegExp(`^${prefix}\\d{2,}$`).test(x))&&new Set(xs).size===xs.length;
export const blocking=g=>g.status==='fail'&&g.level==='error';
export function createSkeleton({source,provenance,genre,creativeBrief,lang}={}){
 return {schemaVersion:4,source,...(provenance===undefined?{}:{provenance:structuredClone(provenance)}),...(genre===undefined?{}:{params:{genre}}),...(creativeBrief===undefined?{}:{creativeBrief}),...(lang===undefined?{}:{lang}),story:{summary:'',sourceRefs:[]},characters:[],scenes:[],props:[],beats:[],episodes:[]};
}
export const newQuestion=q=>structuredClone(q);
export function checkup(doc,options={}){
 if(typeof options==='string')options={stage:options};
 const stage=options.stage??'full',gates=[];
 const add=(id,messages=[],extra={})=>gates.push({id,category:'base',level:'error',status:messages.length?'fail':'pass',messages,...extra});
 const skip=(id,reason,category='base',level='error')=>add(id,[],{status:'skipped',reason,category,level});
 const reject=(x,keys,path,errors)=>{for(const k of keys)if(x?.[k]!==undefined)errors.push(`${path}.${k}: removed in v4; run migrate-v4 explicitly`);};
 const fields=(x,keys,path,errors)=>{if(!object(x)){errors.push(path+': object required');return;}for(const k of keys)if(!text(x[k]))errors.push(`${path}.${k}: non-empty string required`);};
 if(!object(doc)){add('document',['outline must be an object']);return finish();}
 if(!STAGES.includes(stage))add('stage',['unknown stage '+stage]);
 const p=object(doc.params)?doc.params:{},chars=arr(doc.characters),scenes=arr(doc.scenes),props=arr(doc.props),beats=arr(doc.beats),eps=arr(doc.episodes);
 const ci=new Set(chars.map(c=>c?.id)),si=new Set(scenes.map(s=>s?.id)),pi=new Set(props.map(p=>p?.id)),bi=new Map(beats.map(b=>[b?.id,b]));
 const errors=[];
 if(doc.schemaVersion!==4)errors.push('schemaVersion must be 4; run migrate-v4 explicitly');
 fields(doc,['source'],'outline',errors);
 if(doc.lang!==undefined&&!['zh','en'].includes(doc.lang))errors.push('lang must be zh/en');
 if(doc.params!==undefined&&!object(doc.params))errors.push('params must be an object');
 for(const k of Object.keys(p))if(!['genre','thresholds'].includes(k))errors.push(`params.${k}: unsupported planning field; run migrate-v4`);
 if(p.genre!==undefined&&!text(p.genre))errors.push('params.genre must be non-empty');
 if(p.thresholds!==undefined&&!object(p.thresholds))errors.push('params.thresholds must be an object');
 for(const [k,v] of Object.entries(object(p.thresholds)?p.thresholds:{}))if(![...Object.keys(DEFAULT_THRESHOLDS),'maxPrimaryScenes'].includes(k)||!int(v))errors.push('params.thresholds.'+k+': invalid budget');
 reject(doc,['adaptation','arcs','crowdPlan','assets'],'outline',errors);
 errors.push(...documentErrors(doc,options.production));
 // Reject old persisted fields at every stage, even if the corresponding stage is incomplete.
 for(const b of beats)reject(b,['position','kind','weight','type','payoff'],`beats.${b?.id}`,errors);
 for(const s of scenes)reject(s,['reusePlan'],`scenes.${s?.id}`,errors);
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
   if(n?.speakerId!==undefined&&!ci.has(n.speakerId))errors.push(label+': unknown speakerId');
   for(const [key,prefix,ids] of [['characterIds','C',ci],['sceneIds','S',si],['propIds','P',pi]])if(n?.[key]!==undefined&&(!validIds(n[key],prefix)||n[key].some(id=>!ids.has(id))))errors.push(label+': invalid '+key);
   if(n?.episode!==undefined&&(!int(n.episode)||(stage==='full'&&!eps.some(e=>e?.ep===n.episode))))errors.push(label+': unknown episode');
   if(n?.candidate!==undefined||n?.transformation!==undefined)errors.push(label+': outline extracts source facts, not transformation candidates');
  }
 };
 const se=[],story=doc.story;
 fields(story,['summary'],'story',se);refs(story,'story',se);
 reject(story,['premise','throughline','ending','audiencePromise','drive'],'story',se);
 if(story?.focusCharacterIds!==undefined&&(!validIds(story.focusCharacterIds,'C')||story.focusCharacterIds.some(id=>!ci.has(id))))se.push('story.focusCharacterIds: unknown or duplicate C IDs');
 notes(doc,'outline',se);notes(story,'story',se);add('story',se);
 const ae=[];
 for(const [key,rows,prefix] of [['characters',chars,'C'],['scenes',scenes,'S'],['props',props,'P']]){
  if((key!=='props'||doc.props!==undefined)&&!Array.isArray(doc[key]))ae.push(key+': array required');
  if(!validIds(rows.map(r=>r?.id),prefix))ae.push(key+': invalid or duplicate IDs');
  for(const r of rows){const label=key+'.'+r?.id;fields(r,['name'],label,ae);refs(r,label,ae);notes(r,label,ae);
   if(key==='characters'){
    fields(r,['role'],label,ae);if(!CHARACTER_TIERS.includes(r?.tier))ae.push(label+': invalid tier');
    if(r?.arc!==undefined&&!text(r.arc))ae.push(label+': arc must be non-empty');
    if(r?.from!==undefined&&(!Array.isArray(r.from)||!r.from.length||!r.from.every(text)))ae.push(label+': from must contain strings');
    if(r?.presence!==undefined&&!['visible','voice-only','mentioned'].includes(r.presence))ae.push(label+': invalid presence');
    if(r?.aliases!==undefined&&!Array.isArray(r.aliases))ae.push(label+': aliases must be an array');
    for(const [i,a] of arr(r?.aliases).entries()){fields(a,['name'],`${label}.aliases[${i}]`,ae);refs(a,`${label}.aliases[${i}]`,ae);}
   }
   if(key==='scenes'&&typeof r?.primary!=='boolean')ae.push(label+': primary must be boolean');
   if(key==='props'){fields(r,['function'],label,ae);if(r?.beatIds!==undefined&&!validIds(r.beatIds,'B'))ae.push(label+': beatIds must be unique B IDs');}
  }
 }
 add('assets',ae);
 const th=thresholdsOf(doc);
 for(const [tier,key] of [['lead','maxLeads'],['support','maxSupport'],['functional','maxFunctional']])add(tier+'-cap',chars.filter(c=>c?.tier===tier).length>th[key]?[`count exceeds ${th[key]}`]:[],{level:p.thresholds?.[key]!==undefined?'error':'warn',budgetSource:p.thresholds?.[key]!==undefined?'user':'reference'});
 for(const [id,key,count] of [['scene-cap','maxPrimaryScenes',scenes.filter(s=>s?.primary).length],['prop-cap','maxProps',props.length]])add(id,count>th[key]?[`count exceeds ${th[key]}`]:[],{level:p.thresholds?.[key]!==undefined?'error':'warn',budgetSource:p.thresholds?.[key]!==undefined?'user':'reference'});
 if(stage==='skeleton'){for(const id of ['beats','ending-beat','prop-beats'])skip(id,'stage-incomplete');}
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
  add('prop-beats',props.flatMap(p=>arr(p?.beatIds).filter(id=>!bi.has(id)).map(id=>`${p?.id}: unknown ${id}`)));
 }
 if(stage!=='full'){for(const id of ['episodes','references','questions'])skip(id,'stage-incomplete');skip('risk-scan','stage-incomplete','content','warn');}
 else{
  const ee=[],re=[],qe=[],questions=new Map();let previous=0;
  if(!Array.isArray(doc.episodes)||!eps.length)ee.push('episodes must be non-empty');
  for(const e of eps){const label='ep'+e?.ep;
   if(!int(e?.ep)||e.ep<=previous)ee.push(label+': episode numbers must be positive, unique and increasing');previous=e?.ep;
   fields(e,['synopsis'],label,ee);refs(e,label,ee);notes(e,label,ee);
   if(e?.opening!==undefined&&!text(e.opening))ee.push(label+': opening must be non-empty');
   for(const [key,prefix,ids] of [['characterIds','C',ci],['sceneIds','S',si],['propIds','P',pi]]){
    if((key!=='propIds'||e?.[key]!==undefined)&&!validIds(e?.[key],prefix))ee.push(label+': valid '+key+' required');
    for(const id of arr(e?.[key]))if(!ids.has(id))re.push(`${label}.${key}: unknown ${id}`);
   }
   if(e?.warnings!==undefined&&(!Array.isArray(e.warnings)||!e.warnings.every(text)))ee.push(label+': warnings must be strings');
   const end=e?.ending;
   if(end!==undefined){fields(end,['event'],label+'.ending',ee);if(end?.mode!==undefined&&!MODES.includes(end.mode))ee.push(label+': invalid ending mode');if(object(end)&&Object.keys(end).some(k=>!['event','mode','question','sourceRefs'].includes(k)))ee.push(label+': unknown ending fields');refs(end,label+'.ending',ee,false);}
   if(end?.question!==undefined){const q=end.question;fields(q,['text'],label+'.question',qe);refs(q,label+'.question',qe);
    if(!validIds([q?.id],'Q')||questions.has(q?.id))qe.push(label+': invalid or duplicate Q ID');
    if(object(q)&&Object.keys(q).some(k=>!['id','text','reason','sourceRefs'].includes(k)))qe.push(label+': unknown question fields');
    if(q?.reason!==undefined&&!text(q.reason))qe.push(label+': reason must be non-empty');questions.set(q?.id,{...q,ep:e.ep});
   }
  }
  for(const [rows,key] of [[chars,'characterIds'],[scenes,'sceneIds'],[props,'propIds']])for(const r of rows)if(!eps.some(e=>arr(e?.[key]).includes(r?.id)))re.push(`${r?.id}: asset never referenced in episodes`);
  const resolved=new Set();for(const b of beats)for(const id of arr(b?.resolves)){
   const q=questions.get(id);if(!q||resolved.has(id)||b.episode<=q.ep)qe.push(`${b?.id}: unknown, repeated or non-later resolution ${id}`);resolved.add(id);
  }
  add('episodes',ee);add('references',re);add('questions',qe);
  const risks=[];for(const e of eps)for(const [risk,pattern] of Object.entries(RISK_PATTERNS))if(pattern.test([e?.synopsis,e?.opening,e?.ending?.event].join(' '))&&!arr(e?.warnings).includes(risk))risks.push(`ep${e?.ep}: consider ${risk}`);add('risk-scan',risks,{category:'content',level:'warn'});
 }
 if(options.verifySources){const result=verifySources(doc,options);add('source-files',result.errors,{category:'source',verification:result});}else skip('source-files','not-requested','source');
 if(options.production===undefined&&!options.productionError)skip('project-requirements','missing-upstream');
 if(options.productionError)add('production-readable',[options.productionError]);
 skip('content-review','not-performed','content','warn');return finish();
 function finish(){const stats={pass:gates.filter(g=>g.status==='pass').length,fail:gates.filter(blocking).length,warn:gates.filter(g=>g.status==='fail'&&!blocking(g)).length,skipped:gates.filter(g=>g.status==='skipped').length};return {stage,gates,stats,complete:stage==='full'&&stats.fail===0,scope:doc?.provenance?.scope,coverage:coverageOf(doc?.provenance),sourceVerification:gates.find(g=>g.id==='source-files')?.status??'not-performed',contentReview:'not-performed',thresholds:object(doc)?thresholdsOf(doc):{}};}
}
export const gateReport=(doc,options={})=>checkup(doc,options).gates;
export function validateOutline(doc,stage='full',options={}){if(object(stage)){options=stage;stage=options.stage??'full';}return checkup(doc,{...options,stage}).gates.filter(blocking).flatMap(g=>g.messages.map(m=>`${g.id}: ${m}`));}
export function computeAssets(doc){
 const eps=arr(doc?.episodes),chars=arr(doc?.characters),beats=arr(doc?.beats),usage=(id,key)=>eps.filter(e=>arr(e?.[key]).includes(id)).map(e=>e.ep);
 const rows=(key,ref)=>arr(doc?.[key]).map(r=>{const episodes=usage(r?.id,ref);return {...r,uses:episodes.length,episodes};});
 const scenes=rows('scenes','sceneIds').map(s=>({...s,associatedBeatIds:beats.filter(b=>s.episodes.includes(b?.episode)).map(b=>b?.id)}));
 const castPlan=CHARACTER_TIERS.map(tier=>{const members=chars.filter(c=>c?.tier===tier);return {tier,label:TIER_LABELS[tier],count:members.length,names:members.map(c=>c?.name),spec:TIER_ASSET_SPEC[tier]};});
 const warnings=Object.create(null);for(const e of eps)for(const w of arr(e?.warnings))(warnings[w]??=[]).push(e?.ep);
 return {characters:rows('characters','characterIds'),scenes,props:rows('props','propIds').map(p=>({...p,beatIds:arr(p.beatIds)})),castPlan,warnings};
}
