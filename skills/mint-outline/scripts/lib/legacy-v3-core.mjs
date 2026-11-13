// Frozen historical v3 validator ONLY for explicit migration and its regressions.
// Production entry points use outline-core.mjs (v5); never dual-read this contract.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { documentErrors } from './document.mjs';
export const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const STAGES = ['skeleton', 'beats', 'full'];
export const ADAPT_MODES = ['忠实', '抽核', '借壳', '原创'];
export const BEAT_WEIGHTS = ['minor', 'major'];
export const POSITIONS = ['opening', 'early', 'middle', 'late', 'ending'];
export const KINDS = ['event', 'pressure', 'turn', 'payoff'];
export const MODES = ['suspense', 'closure', 'open'];
export const CHARACTER_TIERS = ['lead', 'support', 'functional'];
export const TIER_LABELS = {lead:'主角组',support:'重要配角',functional:'功能性角色'};
export const TIER_ASSET_SPEC = {lead:'全套角色设定图 + 一致性核对',support:'半身参考图 + 关键戏核对',functional:'角色参考或提示词，按制作要求确认'};
export const DEFAULT_THRESHOLDS = {maxLeads:5,maxSupport:10,maxFunctional:10,maxProps:8};
export function primarySceneCap(n) { return Number.isInteger(n) && n > 0 ? Math.max(5,Math.min(15,4+Math.ceil(n/10))) : 8; }
export function thresholdsOf(doc) { return {...DEFAULT_THRESHOLDS,maxPrimaryScenes:primarySceneCap(doc?.params?.episodes),...doc?.params?.thresholds}; }
// 制作关键词只提供候选提醒，不识别人名中的单个「雨」字。
export const RISK_PATTERNS = {雨戏:/下(?:起|着|过)?雨|雨中|雨夜|雨天|暴雨|大雨|小雨|细雨|阵雨|淋雨|雨水|雨声|雨滴|雨幕|雨势|雨停|雨落|风雨/,肢体接触:/吻|拥抱|相拥|牵手|贴身|扭打|搂/,人群:/人群|围观|众人|满堂|满座|集市|人山/,手部特写:/手部|指尖|十指|特写.{0,4}手/};
export const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && x.trim().length > 0;
const positiveInt = x => Number.isInteger(x) && x > 0;
const array = x => Array.isArray(x) ? x : [];
const unique = x => new Set(x).size === x.length;
const validIds = (xs, prefix) => Array.isArray(xs) && xs.every(x=>typeof x === 'string' && new RegExp(`^${prefix}\\d{2,}$`).test(x)) && unique(xs);
export const blocking = g => g.status === 'fail' && g.level === 'error' && g.category !== 'source';

export function createSkeleton({source, episodes, minutesPerEpisode, genre='', adaptMode='原创',creativeBrief,lang}={}) {
  return {schemaVersion:3,source,...(lang===undefined?{}:{lang}),...(creativeBrief===undefined?{}:{creativeBrief}),params:{episodes,minutesPerEpisode,genre,adaptMode},story:{focusCharacterIds:[],premise:'',throughline:'',ending:''},characters:[],scenes:[],props:[],beats:[],episodes:[]};
}
// Explicit copy helper. Never invent a question deadline.
export function newQuestion(question) { return structuredClone(question); }

export function checkup(doc, options={}) {
  if (typeof options === 'string') options={stage:options};
  const stage=options.stage ?? 'full', gates=[];
  const add=(id, messages=[], extra={})=>gates.push({id,category:'base',level:'error',status:messages.length?'fail':'pass',messages,...extra});
  const skip=(id,reason,category='base',level='error')=>add(id,[],{category,level,status:'skipped',reason});
  const fields=(value, names, path, errors)=>{ for(const key of names) if(!text(value?.[key])) errors.push(`${path}.${key}: non-empty string required`); };
  const reject=(value,names,path,errors)=>{for(const key of names) if(value?.[key]!==undefined) errors.push(`${path}.${key}: removed in v3; run migrate-v3; see references/migration.md`);};
  if(!object(doc)) {add('document',['outline must be an object']); return finish();}
  if(!STAGES.includes(stage)) add('stage',[`unknown stage ${stage}`]);
  const p=object(doc.params)?doc.params:{}, n=p.episodes, chars=array(doc.characters), scenes=array(doc.scenes), props=array(doc.props), beats=array(doc.beats), eps=array(doc.episodes), arcs=array(doc.arcs);
  const ci=new Set(chars.map(c=>c?.id)), si=new Set(scenes.map(s=>s?.id)), pi=new Set(props.map(p=>p?.id)), bi=new Map(beats.map(b=>[b?.id,b]));
  const errors=[];
  if(doc.schemaVersion!==3) errors.push('schemaVersion must be 3; run migrate-v3 explicitly');
  fields(doc,['source'],'outline',errors);
  if(doc.lang!==undefined && !['zh','en'].includes(doc.lang)) errors.push('lang must be zh/en');
  if(!object(doc.params)) errors.push('params must be an object');
  if(!positiveInt(n)) errors.push('params.episodes must be a positive integer');
  if(typeof p.minutesPerEpisode!=='number'||!Number.isFinite(p.minutesPerEpisode)||p.minutesPerEpisode<=0) errors.push('params.minutesPerEpisode must be finite and positive');
  fields(p,['genre'],'params',errors);
  if(!ADAPT_MODES.includes(p.adaptMode)) errors.push('params.adaptMode invalid');
  errors.push(...documentErrors(doc,options.production));
  reject(p,['pacing','maxBeatGap','hookWindow','maxLineChars','minCutSeconds','maxCutSeconds'],'params',errors);
  if(p.thresholds!==undefined && !object(p.thresholds)) errors.push('params.thresholds must be an object');
  for(const [key,value] of Object.entries(object(p.thresholds)?p.thresholds:{})) if(![...Object.keys(DEFAULT_THRESHOLDS),'maxPrimaryScenes'].includes(key)||!positiveInt(value)) errors.push(`params.thresholds.${key}: unknown budget or not a positive integer`);
  reject(doc,['crowdPlan','assets'],'outline',errors);
  // Removed persisted fields are never silently accepted at an earlier stage.
  if(stage==='skeleton')for(const b of beats)reject(b,['type','payoff'],`beats.${b?.id}`,errors);
  if(stage!=='full')for(const ep of eps)reject(ep,['stateChange','hook','suspense','crowdPlan','beatIds'],`ep${ep?.ep}`,errors);
  add('fields',errors);

  const storyErrors=[], story=doc.story;
  if(!object(story)) storyErrors.push('story required');
  fields(story,['premise','throughline','ending'],'story',storyErrors);
  if(story?.audiencePromise!==undefined&&!text(story.audiencePromise)) storyErrors.push('story.audiencePromise must be non-empty if provided');
  if(!validIds(story?.focusCharacterIds,'C')||!story?.focusCharacterIds?.length) storyErrors.push('story.focusCharacterIds must be non-empty unique C IDs');
  for(const id of array(story?.focusCharacterIds)) if(!ci.has(id)) storyErrors.push(`story.focusCharacterIds unknown ${id}`);
  reject(story,['drive'],'story',storyErrors);
  add('story',storyErrors);
  const adErrors=[], ad=doc.adaptation;
  if(ad!==undefined&&!object(ad)) adErrors.push('adaptation must be an object if provided');
  reject(ad,['core'],'adaptation',adErrors);
  for(const [key,names] of [['keep',['what','why']],['cut',['what','why']],['merge',['what','why']],['risks',['what','plan']]]) {
    if(ad?.[key]!==undefined&&!Array.isArray(ad[key])) adErrors.push(`adaptation.${key} must be an array`);
    for(const [i,item] of array(ad?.[key]).entries()) {
      fields(item,names,`adaptation.${key}[${i}]`,adErrors);
      if(item?.evidence!==undefined&&!text(item.evidence)) adErrors.push(`adaptation.${key}[${i}].evidence must be a non-empty verbatim excerpt`);
    }
  }
  for(const key of ['cutNote','mergeNote','sourceNote','evidence']) if(ad?.[key]!==undefined&&!text(ad[key])) adErrors.push(`adaptation.${key} cannot be empty`);
  add('adaptation',adErrors);
  // Evidence authenticity is a content review, not a substring or genre heuristic.
  if(p.adaptMode==='原创') skip('source-evidence','not-applicable','content','warn');
  else add('source-evidence',[],{category:'content',level:'warn',status:'skipped',reason:'not-applicable',messages:['Verbatim evidence and source coverage require content review; not automatically verified.']});

  const assetErrors=[];
  for(const [key,rows,prefix] of [['characters',chars,'C'],['scenes',scenes,'S'],['props',props,'P']]) {
    if((key!=='props'||doc.props!==undefined)&&!Array.isArray(doc[key])) assetErrors.push(`${key} must be an array`);
    if(key!=='props'&&!rows.length) assetErrors.push(`${key} cannot be empty`);
    if(!validIds(rows.map(r=>r?.id),prefix)) assetErrors.push(`${key}: invalid or duplicate ${prefix} IDs`);
    for(const r of rows) {
      fields(r,['name'],`${key}.${r?.id}`,assetErrors);
      if(key==='characters') {
        fields(r,['role'],`${key}.${r?.id}`,assetErrors);
        if(!CHARACTER_TIERS.includes(r?.tier)) assetErrors.push(`${r?.id}.tier invalid`);
        if(r?.arc!==undefined) fields(r,['arc'],`${key}.${r?.id}`,assetErrors);
        if(r?.from!==undefined&&(!Array.isArray(r.from)||!r.from.length||!r.from.every(text))) assetErrors.push(`${r?.id}.from must record source/original character`);
      }
      if(key==='scenes') {
        if(typeof r?.primary!=='boolean') assetErrors.push(`${r?.id}.primary must be boolean`);
        if(r?.reusePlan!==undefined&&!text(r.reusePlan)) assetErrors.push(`${r?.id}.reusePlan must be non-empty if provided`);
      }
      if(key==='props') {
        fields(r,['function'],`${key}.${r?.id}`,assetErrors);
        if(r?.beatIds!==undefined&&!validIds(r.beatIds,'B')) assetErrors.push(`${r?.id}.beatIds must be unique B IDs`);
      }
    }
  }
  add('assets',assetErrors);
  const th=thresholdsOf(doc);
  for(const [tier,key] of [['lead','maxLeads'],['support','maxSupport'],['functional','maxFunctional']]) {
    const count=chars.filter(c=>c?.tier===tier).length;
    add(`${tier}-cap`,count>th[key]?[`${count} > ${th[key]}`]:[],{level:p.thresholds?.[key]!==undefined?'error':'warn',budgetSource:p.thresholds?.[key]!==undefined?'user':'reference'});
  }
  add('scene-cap',scenes.filter(s=>s?.primary).length>th.maxPrimaryScenes?[`primary scenes > ${th.maxPrimaryScenes}`]:[],{level:p.thresholds?.maxPrimaryScenes!==undefined?'error':'warn',budgetSource:p.thresholds?.maxPrimaryScenes!==undefined?'user':'reference'});
  if(doc.props===undefined) skip('prop-cap','not-applicable'); else add('prop-cap',props.length>th.maxProps?[`${props.length} > ${th.maxProps}`]:[],{level:p.thresholds?.maxProps!==undefined?'error':'warn',budgetSource:p.thresholds?.maxProps!==undefined?'user':'reference'});

  if(stage==='skeleton') {
    for(const id of ['beats','ending-beat','arcs','prop-beats']) skip(id,'stage-incomplete');
  } else {
    const be=[];
    if(!beats.length||!Array.isArray(doc.beats)) be.push('beats must be a non-empty array');
    if(!validIds(beats.map(b=>b?.id),'B')) be.push('beats: invalid or duplicate B IDs');
    let previous=-1;
    for(const b of beats) {
      fields(b,['setup','outcome'],`beats.${b?.id}`,be);
      if(!positiveInt(b?.episode)||b.episode>n) be.push(`${b?.id}.episode outside episode range`);
      if(b?.position!==undefined&&!POSITIONS.includes(b.position)) be.push(`${b?.id}.position invalid`);
      if(b?.kind!==undefined&&!KINDS.includes(b.kind)) be.push(`${b?.id}.kind invalid`);
      if(b?.weight!==undefined&&(b?.kind!=='payoff'||!BEAT_WEIGHTS.includes(b.weight))) be.push(`${b?.id}.weight allowed only for payoff and must be minor/major`);
      if(b?.resolves!==undefined&&!validIds(b.resolves,'Q')) be.push(`${b?.id}.resolves must be unique Q IDs`);
      reject(b,['payoff','type'],`beats.${b?.id}`,be);
      const order=b?.episode;
      if(order<previous) be.push(`${b?.id}: beats must follow episode order; same-episode array order is authoritative`);
      previous=order;
    }
    add('beats',be);
    const ending=bi.get(story?.endingBeatId);
    add('ending-beat',!ending||ending.episode!==n?['story.endingBeatId must reference a beat in the final episode']:[]);
    const ae=[];
    if(doc.arcs!==undefined&&!Array.isArray(doc.arcs)) ae.push('arcs must be an array');
    if(!validIds(arcs.map(a=>a?.id),'A')) ae.push('arcs: invalid or duplicate A IDs');
    let prevEnd=0;
    for(const a of arcs) {
      fields(a,['goal'],`arcs.${a?.id}`,ae);
      if(!positiveInt(a?.startEp)||!positiveInt(a?.endEp)||a.startEp>a.endEp||a.endEp>n||a.startEp<=prevEnd) ae.push(`${a?.id}: invalid, unsorted or overlapping arc range`);
      if(!bi.has(a?.endBeatId)||bi.get(a?.endBeatId)?.episode!==a?.endEp) ae.push(`${a?.id}.endBeatId must belong to endEp`);
      prevEnd=a?.endEp;
    }
    add('arcs',ae);
    add('prop-beats',props.flatMap(pr=>array(pr?.beatIds).filter(id=>!bi.has(id)).map(id=>`${pr?.id}: unknown beat ${id}`)));
  }

  if(stage!=='full') {
    for(const id of ['episodes','references','questions']) skip(id,'stage-incomplete');
    skip('risk-scan','stage-incomplete','content','warn');
  } else {
    const ee=[], re=[], qe=[], questions=new Map();
    if(!Array.isArray(doc.episodes)||eps.length!==n) ee.push(`episodes must contain exactly ${n} episodes`);
    for(const [i,e] of eps.entries()) {
      if(e?.ep!==i+1) ee.push(`episodes[${i}].ep must be ${i+1}`);
      fields(e,['opening','synopsis'],`ep${e?.ep}`,ee);
      reject(e,['hook','suspense','crowdPlan','beatIds','stateChange'],`ep${e?.ep}`,ee);
      for(const [key,prefix,ids] of [['characterIds','C',ci],['sceneIds','S',si],['propIds','P',pi]]) {
        if((key!=='propIds'||e?.[key]!==undefined)&&(!validIds(e?.[key],prefix)||(key!=='propIds'&&!e?.[key]?.length))) ee.push(`ep${e?.ep}.${key}: valid non-empty asset references required`);
        for(const id of array(e?.[key])) if(!ids.has(id)) re.push(`ep${e?.ep}.${key}: unknown ${id}`);
      }
      if(e?.warnings!==undefined&&(!Array.isArray(e.warnings)||!e.warnings.every(text))) ee.push(`ep${e?.ep}.warnings must be strings`);
      const end=e?.ending;
      if(!object(end)||!MODES.includes(end.mode)||!text(end.event)) ee.push(`ep${e?.ep}.ending requires mode/event`);
      if(object(end)&&Object.keys(end).some(k=>!['mode','event','question'].includes(k))) ee.push(`ep${e?.ep}.ending unknown fields`);
      if(end?.mode==='closure'&&end.question!==undefined) qe.push(`ep${e?.ep}: closure forbids question`);
      if(end?.question!==undefined) {
        const q=end.question;
        const validQuestionId=typeof q?.id==='string' && /^Q\d{2,}$/.test(q.id);
        if(!object(q)||!validQuestionId||!text(q?.text)||!['required','optional'].includes(q?.resolution)) qe.push(`ep${e?.ep}: invalid question`);
        if(object(q)&&Object.keys(q).some(k=>!['id','text','resolution','reason','dueByEp'].includes(k))) qe.push(`ep${e?.ep}: question unknown fields`);
        if(validQuestionId) {
          if(questions.has(q.id)) qe.push(`duplicate question ${q.id}`);
          questions.set(q.id,{...q,ep:e?.ep});
        }
        if(q?.reason!==undefined&&!text(q.reason)) qe.push(`${q?.id}: reason must be a non-empty string`);
        if(q?.resolution==='optional'&&q.dueByEp!==undefined) qe.push(`${q?.id}: optional forbids dueByEp`);
        if(q?.dueByEp!==undefined&&(!positiveInt(q.dueByEp)||q.dueByEp<=e?.ep||q.dueByEp>n)) qe.push(`${q?.id}: invalid dueByEp`);
        if(q?.resolution==='required'&&e?.ep===n) qe.push(`${q?.id}: final episode cannot promise required resolution`);
      }
    }
    for(const [rows,key] of [[chars,'characterIds'],[scenes,'sceneIds'],[props,'propIds']]) for(const r of rows) if(!eps.some(e=>array(e?.[key]).includes(r?.id))) re.push(`${r?.id}: asset never referenced in episodes`);
    const resolved=new Map();
    for(const b of beats) for(const id of array(b?.resolves)) {
      const q=questions.get(id);
      resolved.set(id,(resolved.get(id)||0)+1);
      if(!q) qe.push(`${b?.id}: unknown question ${id}`);
      else if(b.episode<=q.ep||(q.dueByEp!==undefined&&b.episode>q.dueByEp)) qe.push(`${b?.id}: ${id} resolved too early or after deadline`);
    }
    for(const [id,q] of questions) if((q.resolution==='required'&&(resolved.get(id)||0)!==1)||(resolved.get(id)||0)>1) qe.push(`${id}: required needs exactly one later resolution; optional at most one`);
    add('episodes',ee);add('references',re);add('questions',qe);
    const risks=[];
    for(const e of eps) for(const [risk,pattern] of Object.entries(RISK_PATTERNS)) if(pattern.test([e?.synopsis,e?.opening,e?.ending?.event].join(' '))&&!array(e?.warnings).includes(risk)) risks.push(`ep${e?.ep}: consider ${risk}`);
    add('risk-scan',risks,{category:'content',level:'warn'});
  }
  if(options.production===undefined&&!options.productionError) skip('project-requirements','missing-upstream');
  if(options.productionError) add('production-readable',[options.productionError]);
  // No renderer or structural check can award a semantic review pass.
  skip('content-review','not-applicable','content','warn');
  return finish();
  function finish() {
    const stats={pass:gates.filter(g=>g.status==='pass').length,fail:gates.filter(blocking).length,warn:gates.filter(g=>g.status==='fail'&&!blocking(g)).length,skipped:gates.filter(g=>g.status==='skipped').length};
    return {stage,gates,stats,complete:stage==='full'&&stats.fail===0,contentReview:'not-performed',thresholds:object(doc)?thresholdsOf(doc):{}};
  }
}
export function gateReport(doc, options={}) {return checkup(doc,options).gates;}
export function validateOutline(doc, stage='full', options={}) {
  if(object(stage)) {options=stage;stage=options.stage??'full';}
  return checkup(doc,{...options,stage}).gates.filter(blocking).flatMap(g=>g.messages.map(m=>`${g.id}: ${m}`));
}

export function computeAssets(doc) {
  const eps=array(doc?.episodes), chars=array(doc?.characters), beats=array(doc?.beats);
  const usage=(id,key)=>eps.filter(e=>array(e?.[key]).includes(id)).map(e=>e.ep);
  const scenes=array(doc?.scenes).map(s=>{const episodes=usage(s?.id,'sceneIds');return {...s,uses:episodes.length,episodes,reusePlan:s?.reusePlan??null,associatedBeatIds:beats.filter(b=>episodes.includes(b?.episode)).map(b=>b?.id)};});
  const characters=chars.map(c=>{const episodes=usage(c?.id,'characterIds');return {...c,uses:episodes.length,episodes};});
  const props=array(doc?.props).map(p=>{const episodes=usage(p?.id,'propIds');return {...p,uses:episodes.length,episodes,beatIds:array(p?.beatIds)};});
  const castPlan=CHARACTER_TIERS.map(tier=>{const members=chars.filter(c=>c?.tier===tier);return {tier,label:TIER_LABELS[tier],count:members.length,names:members.map(c=>c.name),spec:TIER_ASSET_SPEC[tier]};});
  const warnings=Object.create(null),beatsByKind=Object.create(null);
  for(const e of eps) for(const w of array(e?.warnings)) (warnings[w]??=[]).push(e.ep);
  for(const b of beats) if(b?.kind!==undefined) (beatsByKind[b.kind]??=[]).push(b?.episode);
  return {scenes,characters,props,castPlan,warnings,beatsByKind};
}
