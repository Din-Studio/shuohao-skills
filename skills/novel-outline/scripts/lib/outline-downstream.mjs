// Portable project-JSON interface checks only. Never import or execute sibling skills.
import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {validateSelection} from './creative.mjs';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const arr=x=>Array.isArray(x)?x:[];
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const integer=x=>Number.isInteger(x)&&x>0;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const dimensions=['genre','narrativeStyle','structure','pacing'];
const sameSelection=(a,b)=>dimensions.every(k=>a?.[k]?.id===b?.[k]?.id&&a?.[k]?.version===b?.[k]?.version);
const coord=x=>Array.isArray(x)&&x.length===2&&x.every(integer);
function coordinates(ep) {
 const keys=[];
 for(const [s,scene] of arr(ep?.scenes).entries())for(const [b] of arr(scene?.flow).entries())keys.push(`${s+1}:${b+1}`);
 return keys;
}
const position=(keys,p)=>coord(p)?keys.indexOf(p.join(':')):-1;

export function checkKnownDownstream(outline,root) {
 const gates=[], files=[], records=[];
 const add=(file,stage,id,messages=[],extra={})=>gates.push({file,stage,id,category:'base',level:'error',status:messages.length?'fail':'pass',messages,...extra});
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
  add(file,stage,'version',doc.schemaVersion===2?[]:['schemaVersion must be 2']);
  const selection=doc.creativeContext?.selection, selectionErrors=validateSelection(selection);
  if(!sameSelection(selection,outline.creativeContext?.selection))selectionErrors.push('creativeContext.selection differs from applied outline; synchronize explicitly');
  add(file,stage,'selection',selectionErrors);
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
 for(const {file,stage,doc} of scripts) {
  const duration=[], claims=[], projection=[], seen=new Set();
  for(const ep of arr(doc.episodes)) {
   const label=`ep${ep?.ep}`, upstream=arr(outline.episodes).find(e=>e?.ep===ep?.ep), keys=coordinates(ep);
   if(!positive(ep?.targetSeconds)||ep.targetSeconds!==outline.params?.minutesPerEpisode*60)duration.push(`${label}: targetSeconds must equal outline minutesPerEpisode × 60`);
   checkProjection(ep,upstream,label,projection);
   if(!Array.isArray(ep?.scenes)||!ep.scenes.length||ep.scenes.some(s=>!Array.isArray(s?.flow)||!s.flow.length))claims.push(`${label}: non-empty scenes/flow required to locate claims`);
   if(position(keys,ep?.openingBeat)<0||position(keys,ep?.endBeat)<0||position(keys,ep?.endBeat)!==keys.length-1)claims.push(`${label}: invalid openingBeat/endBeat`);
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
  const tolerance=doc.params?.tolerance;
  if(typeof tolerance!=='number'||!Number.isFinite(tolerance)||tolerance<0||tolerance>=1)duration.push('params.tolerance must be finite in [0,1)');
  for(const ep of arr(doc.episodes)) {
   const label=`ep${ep?.ep}`, upstream=arr(outline.episodes).find(e=>e?.ep===ep?.ep);
   checkProjection(ep,upstream,label,projection);
   const matches=scripts.flatMap(r=>arr(r.doc.episodes).filter(e=>e?.ep===ep?.ep).map(e=>({record:r,episode:e})));
   const script=matches.length===1?matches[0].episode:null;
   if(matches.length>1)claims.push(`${label}: ambiguous script episode in multiple project JSON files`);
   if(!matches.length) {
    if(gates.some(g=>g.stage==='script'&&['readable','discovery','version','episodes'].includes(g.id)&&g.status==='fail'))claims.push(`${label}: known script is damaged or unsupported; cannot verify coverage`);
    else missing.push(`${label}: no matching script; coordinate existence and full coverage not checked`);
   }
   if(script) {
    const upstreamFile=matches[0].record.file;
    if(gates.some(g=>g.file===upstreamFile&&g.status==='fail'))claims.push(`${label}: script interface invalid (${upstreamFile})`);
    for(const key of ['openingBeat','endBeat'])if(!same(ep?.[key],script[key]))projection.push(`${label}: ${key} differs from script`);
   }
   if(!coord(ep?.openingBeat)||!coord(ep?.endBeat))claims.push(`${label}: valid openingBeat/endBeat coordinates required`);
   let total=0, lastScene=0,lastBeat=0,openingCovered=false;
   const keys=script?coordinates(script):[], covered=[];
   if(!Array.isArray(ep?.segments)||!ep.segments.length)claims.push(`${label}: non-empty segments required`);
   for(const seg of arr(ep?.segments)) {
    if(!integer(seg?.sceneIndex)||!Array.isArray(seg?.cuts)||!seg.cuts.length)claims.push(`${label}: valid sceneIndex and non-empty cuts required`);
    for(const cut of arr(seg?.cuts)) {
     if(!positive(cut?.seconds))duration.push(`${label}: cut seconds must be finite and positive`);else total+=cut.seconds;
     const range=cut?.beats;
     if(!coord(range)||range[1]<range[0]){claims.push(`${label}: invalid cut beat range`);continue;}
     if((lastScene===0&&seg.sceneIndex!==1)||seg.sceneIndex<lastScene||(seg.sceneIndex===lastScene&&range[0]!==lastBeat+1)||(seg.sceneIndex!==lastScene&&(seg.sceneIndex!==lastScene+1||range[0]!==1)))claims.push(`${label}: cut claims must be ordered, contiguous and non-overlapping`);
     lastScene=seg.sceneIndex;lastBeat=range[1];
     if(coord(ep?.openingBeat)&&ep.openingBeat[0]===seg.sceneIndex&&ep.openingBeat[1]>=range[0]&&ep.openingBeat[1]<=range[1])openingCovered=true;
     if(script) {
      const start=position(keys,[seg.sceneIndex,range[0]]),end=position(keys,[seg.sceneIndex,range[1]]);
      if(start<0||end<start)claims.push(`${label}: cut claims missing script beats`);
      else covered.push(...keys.slice(start,end+1));
     }
    }
   }
   if(script&&!same(covered,keys))claims.push(`${label}: cuts must claim every script beat exactly once in order`);
   if(!openingCovered)claims.push(`${label}: openingBeat must be covered by an actual cut`);
   if(!same(ep?.endBeat,[lastScene,lastBeat]))claims.push(`${label}: endBeat must be the last claimed beat`);
   const target=outline.params?.minutesPerEpisode*60;
   if(ep?.targetSeconds!==undefined&&ep.targetSeconds!==target)duration.push(`${label}: targetSeconds differs from outline`);
   const epsilon=Number.EPSILON*Math.max(1,Math.abs(target),Math.abs(total))*4;
   if(!positive(target)||!Number.isFinite(total)||total<=0||total<target*(1-tolerance)-epsilon||total>target*(1+tolerance)+epsilon)duration.push(`${label}: cut total ${total} outside outline target ${target} tolerance`);
  }
  add(file,stage,'target-duration',duration);add(file,stage,'projection',projection);add(file,stage,'node-claims',claims);
  if(missing.length)add(file,stage,'script-coverage',missing,{status:'skipped',reason:'missing-upstream'});
 }
 return {scope:'local-project-json-interfaces-only',files,gates,stats:{pass:gates.filter(g=>g.status==='pass').length,fail:gates.filter(g=>g.status==='fail').length,skipped:gates.filter(g=>g.status==='skipped').length},fullDownstreamValidation:'not-performed',applicationWorkflow:'incomplete',contentReview:'not-performed'};
}
function checkProjection(ep,upstream,label,errors) {
 if(!upstream){errors.push(`${label}: no valid outline episode for projection reconciliation`);return;}
 if(ep?.opening!==upstream.opening)errors.push(`${label}: opening differs from outline`);
 if(!object(ep?.ending)||Object.keys(ep.ending).some(k=>!['mode','event'].includes(k))||ep.ending.mode!==upstream.ending?.mode||ep.ending.event!==upstream.ending?.event)errors.push(`${label}: ending mode/event differs from outline or contains extra fields`);
}
