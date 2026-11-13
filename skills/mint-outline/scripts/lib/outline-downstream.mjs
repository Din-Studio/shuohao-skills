// Portable project-JSON interface checks only. Never import or execute sibling skills.
import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {validateOutline} from './outline-core.mjs';
import {documentErrors} from './document.mjs';
import {provenanceErrors,sourceRefsErrors,verifySources} from './source.mjs';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const arr=x=>Array.isArray(x)?x:[];
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const integer=x=>Number.isInteger(x)&&x>0;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const coord=x=>Array.isArray(x)&&x.length===2&&x.every(integer);
function coordinates(ep) {
 const keys=[];
 for(const [s,scene] of arr(ep?.scenes).entries())for(const [b] of arr(scene?.flow).entries())keys.push(`${s+1}:${b+1}`);
 return keys;
}
const position=(keys,p)=>coord(p)?keys.indexOf(p.join(':')):-1;

export function checkKnownDownstream(outline,root,options={}) {
 const gates=[], files=[], records=[];
 const add=(file,stage,id,messages=[],extra={})=>gates.push({file,stage,id,category:'base',level:'error',status:messages.length?'fail':'pass',messages,...extra});
 const outlineErrors=validateOutline(outline);
 if(outlineErrors.length){add(null,'outline','outline-contract',outlineErrors);return finish();}
 for(const stage of ['script','creation']) {
  const dir=join(root,stage);
  let names;
  try {names=readdirSync(dir).filter(n=>n.endsWith('.json')).sort();}
  catch(error) {
   // A dangling stage directory must not be mistaken for an absent one.
   let absent=false;
   if(error.code==='ENOENT')try {lstatSync(dir);}catch(statError){absent=statError.code==='ENOENT';}
   if(!absent)add(dir,stage,'discovery',[error.message]);
   continue;
  }
  for(const name of names) {
   const file=join(dir,name);files.push(file);
   try {
    const doc=JSON.parse(readFileSync(file,'utf8'));
    if(!object(doc))throw Error('project JSON must be an object');
    records.push({file,stage,doc});add(file,stage,'readable');
   } catch(error) {add(file,stage,'readable',[error.message]);}
  }
 }
 for(const {file,stage,doc} of records) {
  add(file,stage,'version',doc.schemaVersion===(stage==='script'?4:3)?[]:[`schemaVersion must be ${stage==='script'?4:3}`]);
  add(file,stage,'document',documentErrors(doc,options.production));
  add(file,stage,'source',doc.source===outline.source?[]:['source must match outline']);
  const errors=[];
  if(!Array.isArray(doc.episodes)||!doc.episodes.length)errors.push('episodes must be a non-empty array');
  let previous=0;
  for(const ep of arr(doc.episodes)) {
   if(!integer(ep?.ep)||ep.ep<=previous)errors.push('episode numbers must be positive, unique and increasing');
   previous=ep?.ep;
   if(!arr(outline.episodes).some(e=>e?.ep===ep?.ep))errors.push(`unknown outline episode ${ep?.ep}`);
  }
  add(file,stage,'episodes',errors);
 }
 const scripts=records.filter(r=>r.stage==='script');
 const owners=new Map();
 for(const r of scripts)for(const e of arr(r.doc.episodes)){const prior=owners.get(e?.ep);if(prior)add(r.file,'script','episode-authority',[`ambiguous script episode ${e?.ep} also provided by ${prior}`]);else owners.set(e?.ep,r.file);}
 for(const {file,stage,doc} of scripts) {
  const duration=[], claims=[], projection=[], seen=new Set(),source=provenanceErrors(doc.provenance,{episodes:doc.episodes});
  if(integer(doc.provenance?.totalEpisodes)&&integer(outline.provenance?.totalEpisodes)&&doc.provenance.totalEpisodes!==outline.provenance.totalEpisodes)source.push('known totalEpisodes differs from outline');
  for(const d of arr(doc.provenance?.documents))if(!object(d)||!arr(outline?.provenance?.documents).some(o=>object(o)&&o.id===d.id&&o.sha256===d.sha256&&o.lineCount===d.lineCount))source.push(`source identity differs from outline: ${d?.id}`);
  source.push(...sourceRefsErrors(doc.provenance?.coverage,outline.provenance,'script.coverage against outline'));
  if(options.verifySources)source.push(...verifySources(doc,{artifactPath:file}).errors);
  for(const ep of arr(doc.episodes))for(const [si,sc] of arr(ep?.scenes).entries()){
   source.push(...sourceRefsErrors(sc?.sourceRefs,doc.provenance,`ep${ep?.ep}.scene${si+1}.sourceRefs`,{required:false}));
   if(sc?.notes!==undefined&&!Array.isArray(sc.notes))source.push('scene.notes must be an array');
   const transformation=x=>{if(x?.candidate!==undefined)source.push('candidate belongs only in .work');if(x?.transformation!==undefined&&(!object(x.transformation)||typeof x.transformation.reason!=='string'||!x.transformation.reason.trim()||typeof x.transformation.authorization!=='string'||!x.transformation.authorization.trim()))source.push('transformation requires reason and authorization');};
   for(const n of arr(sc?.notes)){
    transformation(n);
    if(typeof n?.text!=='string'||!n.text.trim()||!['performance','background','continuity','restriction'].includes(n?.kind))source.push('scene note requires text/kind');
    source.push(...sourceRefsErrors(n?.sourceRefs,doc.provenance,'scene.notes.sourceRefs'));
   }
   for(const b of arr(sc?.flow)){
    transformation(b);
    source.push(...sourceRefsErrors(b?.sourceRefs,doc.provenance,'flow.sourceRefs'));
    const kinds=['action','line','subtitle','sound'].filter(k=>b?.[k]!==undefined);
    if(kinds.length!==1||typeof b?.[kinds[0]]!=='string'||!b[kinds[0]].trim())source.push('flow requires exactly one non-empty action/line/subtitle/sound');
    if(b?.line!==undefined&&(typeof b.speaker!=='string'||!(/^(?:C\d{2,}|VO)$/.test(b.speaker))))source.push('line requires speaker');
    if(b?.line===undefined&&(b?.speaker!==undefined||b?.delivery!==undefined))source.push('speaker/delivery only allowed on line');
    if(b?.audio!==undefined){
     if(b.line===undefined&&b.sound===undefined)source.push('audio only allowed on line/sound');
     if(!object(b.audio)||!['onscreen','offscreen','voiceover','inner'].includes(b.audio.mode))source.push('invalid audio mode');
     if(b.audio?.subjective!==undefined&&typeof b.audio.subjective!=='boolean')source.push('invalid audio.subjective');
     if(b.audio?.audibleTo!==undefined&&(!Array.isArray(b.audio.audibleTo)||new Set(b.audio.audibleTo).size!==b.audio.audibleTo.length||b.audio.audibleTo.some(id=>typeof id!=='string'||!/^C\d{2,}$/.test(id))))source.push('invalid audio.audibleTo');
    }
    if(b?.seconds!==undefined&&(!positive(b.seconds)||(b.subtitle===undefined&&b.sound===undefined)))source.push('seconds only allowed positive on subtitle/sound');
   }
  }
  add(file,stage,'source-evidence',source);
  for(const ep of arr(doc.episodes)) {
   const label=`ep${ep?.ep}`, upstream=arr(outline.episodes).find(e=>e?.ep===ep?.ep), keys=coordinates(ep);
   if(ep?.targetSeconds!==undefined&&!positive(ep.targetSeconds))duration.push(`${label}: targetSeconds must be positive when provided; outline supplies no target`);
   checkProjection(ep,upstream,label,projection);
   if(!Array.isArray(ep?.scenes)||!ep.scenes.length||ep.scenes.some(s=>!Array.isArray(s?.flow)||!s.flow.length))claims.push(`${label}: non-empty scenes/flow required to locate claims`);
   if(ep?.openingBeat!==undefined&&position(keys,ep.openingBeat)<0)claims.push(`${label}: invalid openingBeat`);
   const expected=arr(outline.beats).filter(b=>b?.episode===ep?.ep).map(b=>b?.id);
   if(!Array.isArray(ep?.beatClaims)||!same(arr(ep?.beatClaims).map(c=>c?.beatId),expected))claims.push(`${label}: beatClaims must match all outline IDs in order`);
   let last=-1;
   for(const c of arr(ep?.beatClaims)) {
    const start=position(keys,c?.start),end=position(keys,c?.end);
    if(!object(c)||Object.keys(c).some(k=>!['beatId','start','end'].includes(k))||typeof c?.beatId!=='string'||!/^B\d{2,}$/.test(c.beatId)||seen.has(c.beatId))claims.push(`${label}: invalid or repeated beatId ${c?.beatId}`);
    seen.add(c?.beatId);
    if(start<0||end<start||start<=last)claims.push(`${label}/${c?.beatId}: invalid, reversed or overlapping claim coordinates`);
    last=end;
   }
  }
  add(file,stage,'target-duration',duration);add(file,stage,'projection',projection);add(file,stage,'node-claims',claims);
 }
 for(const {file,stage,doc} of records.filter(r=>r.stage==='creation')) {
  const duration=[],claims=[],projection=[],missing=[];
  const tolerance=doc.params?.tolerance===undefined?0.15:doc.params.tolerance;
  if(typeof tolerance!=='number'||!Number.isFinite(tolerance)||tolerance<0||tolerance>=1)duration.push('params.tolerance must be finite in [0,1)');
  for(const ep of arr(doc.episodes)) {
   const label=`ep${ep?.ep}`, upstream=arr(outline.episodes).find(e=>e?.ep===ep?.ep);
   checkProjection(ep,upstream,label,projection);
   const matches=scripts.flatMap(r=>arr(r.doc.episodes).filter(e=>e?.ep===ep?.ep).map(e=>({record:r,episode:e})));
   const script=matches.length===1?matches[0].episode:null;
   if(matches.length>1)claims.push(`${label}: ambiguous script episode in multiple project JSON files`);
   if(!matches.length) {
    if(gates.some(g=>g.stage==='script'&&['readable','discovery','version','episodes'].includes(g.id)&&g.status==='fail'))claims.push(`${label}: known script is damaged or unsupported; cannot verify coverage`);
    else missing.push(`${label}: no matching script; coordinate existence, full coverage and target-duration reconciliation not checked`);
   }
   if(script) {
    const upstreamFile=matches[0].record.file;
    if(gates.some(g=>g.file===upstreamFile&&g.status==='fail'))claims.push(`${label}: script interface invalid (${upstreamFile})`);
    if(!same(ep?.openingBeat,script.openingBeat))projection.push(`${label}: openingBeat differs from script; do not invent a missing opening marker`);
   }
   if(ep?.openingBeat!==undefined&&!coord(ep.openingBeat))claims.push(`${label}: valid openingBeat coordinates required when provided`);
   let total=0, lastScene=0,lastBeat=0,openingCovered=false;
   const keys=script?coordinates(script):[], covered=[],owned=new Set(),audioLast=new Map();let cutIndex=0;
   if(!Array.isArray(ep?.segments)||!ep.segments.length)claims.push(`${label}: non-empty segments required`);
   for(const seg of arr(ep?.segments)) {
    if(!integer(seg?.sceneIndex)||!Array.isArray(seg?.cuts)||!seg.cuts.length)claims.push(`${label}: valid sceneIndex and non-empty cuts required`);
    for(const cut of arr(seg?.cuts)) {
     cutIndex++;
     if(!positive(cut?.seconds))duration.push(`${label}: cut seconds must be finite and positive`);else total+=cut.seconds;
     const range=cut?.beats;
     if(!coord(range)||range[1]<range[0]){claims.push(`${label}: invalid cut beat range`);continue;}
     if((lastScene===0&&seg.sceneIndex!==1)||seg.sceneIndex<lastScene||(seg.sceneIndex===lastScene&&range[0]!==lastBeat+1)||(seg.sceneIndex!==lastScene&&(seg.sceneIndex!==lastScene+1||range[0]!==1)))claims.push(`${label}: cut claims must be ordered, contiguous and non-overlapping`);
     lastScene=seg.sceneIndex;lastBeat=range[1];
     if(cut?.audioRefs!==undefined){
      if(!Array.isArray(cut.audioRefs))claims.push(`${label}: audioRefs must be an array`);
      const seenAudio=new Set();
      for(const ref of arr(cut.audioRefs)){
       const key=coord(ref)?ref.join(':'):null,beat=coord(ref)?script?.scenes?.[ref[0]-1]?.flow?.[ref[1]-1]:null;
       if(!key||seenAudio.has(key)||!owned.has(key)||!script||typeof beat?.line!=='string'||!beat.line.trim())claims.push(`${label}: audioRefs must reference unique lines owned by earlier cuts in this episode`);
       if(key&&owned.has(key)&&audioLast.get(key)!==cutIndex-1)claims.push(`${label}: audioRefs cannot skip an intervening cut in the same playback`);
       audioLast.set(key,cutIndex);
       seenAudio.add(key);
      }
     }
     // Record owners only after validating continuations: current cut ownership is not earlier.
     if(script){const start=position(keys,[seg.sceneIndex,range[0]]),end=position(keys,[seg.sceneIndex,range[1]]);if(start>=0&&end>=start)for(const key of keys.slice(start,end+1)){owned.add(key);audioLast.set(key,cutIndex);}}
     if(coord(ep?.openingBeat)&&ep.openingBeat[0]===seg.sceneIndex&&ep.openingBeat[1]>=range[0]&&ep.openingBeat[1]<=range[1])openingCovered=true;
     if(script) {
      const start=position(keys,[seg.sceneIndex,range[0]]),end=position(keys,[seg.sceneIndex,range[1]]);
      if(start<0||end<start)claims.push(`${label}: cut claims missing script beats`);
      else covered.push(...keys.slice(start,end+1));
     }
    }
   }
   if(script&&!same(covered,keys))claims.push(`${label}: cuts must claim every script beat exactly once in order`);
   if(ep?.openingBeat!==undefined&&!openingCovered)claims.push(`${label}: openingBeat must be covered by an actual cut`);
   // End is derived from current script coordinates; complete coverage above checks it.

   const target=script?.targetSeconds;
   if(script){
    if(ep?.targetSeconds!==undefined&&ep.targetSeconds!==target)duration.push(`${label}: targetSeconds differs from script`);
    const epsilon=Number.EPSILON*Math.max(1,Math.abs(target),Math.abs(total))*4;
    if(!positive(target)||!Number.isFinite(total)||total<=0||total<target*(1-tolerance)-epsilon||total>target*(1+tolerance)+epsilon)duration.push(`${label}: confirmed script target required; cut total ${total} outside target ${target} tolerance`);
   } // Missing or damaged script already reported above; never relabel damaged as missing.
  }
  add(file,stage,'target-duration',duration);add(file,stage,'projection',projection);add(file,stage,'node-claims',claims);
  if(missing.length)add(file,stage,'script-coverage',missing,{status:'skipped',reason:'missing-upstream'});
 }
 for(const stage of ['script','creation'])if(!files.some(f=>f.startsWith(join(root,stage)+'/'))&&!gates.some(g=>g.stage===stage&&g.status==='fail'))add(null,stage,'upstream',[],{status:'skipped',reason:'missing-upstream'});
 add(null,'joint','asset-identity-reconciliation',[],{status:'skipped',reason:'outside-outline-authority; characters/art mapping not checked'});
 return finish();
 function finish(){return {scope:'local-project-json-interfaces-only',files,gates,stats:{pass:gates.filter(g=>g.status==='pass').length,fail:gates.filter(g=>g.status==='fail').length,skipped:gates.filter(g=>g.status==='skipped').length},fullDownstreamValidation:'not-performed',applicationWorkflow:'incomplete',contentReview:'not-performed'};}

}
function checkProjection(ep,upstream,label,errors) {
 if(!upstream){errors.push(`${label}: no valid outline episode for projection reconciliation`);return;}
 for(const key of ['opening','ending','endBeat'])if(ep?.[key]!==undefined)errors.push(`${label}: ${key} is not copied into downstream project documents`);
}
