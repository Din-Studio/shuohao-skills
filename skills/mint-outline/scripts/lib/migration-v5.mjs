// Explicit v4 -> story-only v5 draft. This exports evidence, not approved identities.
import {readFileSync,writeFileSync,lstatSync,readdirSync,copyFileSync,unlinkSync,constants} from 'node:fs';
import {dirname,resolve,relative,join,basename,extname} from 'node:path';
import {checkup as checkV4} from './legacy-v4-core.mjs';
import {checkup,object} from './outline-core.mjs';
import {sha256,verifySources} from './source.mjs';
const arr=x=>Array.isArray(x)?x:[];
const clone=x=>structuredClone(x);
const escape=x=>String(x).replace(/~/g,'~0').replace(/\//g,'~1');
const child=(p,k)=>p+'/'+escape(k);
const atPointer=(x,p)=>p.split('/').slice(1).reduce((v,k)=>v[k.replace(/~1/g,'/').replace(/~0/g,'~')],x);
const schemas={
 document:{schemaVersion:'value',source:'value',lang:'value',creativeBrief:'value',params:'params',provenance:'provenance',story:'story',beats:'beats',episodes:'episodes',notes:'notes'},
 params:{genre:'value'},provenance:{kind:'value',scope:'value',documents:'documents',coverage:'ranges',totalEpisodes:'value'},
 sourceDocument:{id:'value',path:'value',sha256:'value',lineCount:'value'},range:{documentId:'value',startLine:'value',endLine:'value'},
 story:{summary:'value',endingBeatId:'value',sourceRefs:'ranges',notes:'notes'},
 beat:{id:'value',episode:'value',setup:'value',outcome:'value',resolves:'values',sourceRefs:'ranges',notes:'notes'},
 episode:{ep:'value',synopsis:'value',opening:'value',ending:'ending',warnings:'values',sourceRefs:'ranges',notes:'notes'},
 ending:{event:'value',mode:'value',question:'question',sourceRefs:'ranges'},question:{id:'value',text:'value',reason:'value',sourceRefs:'ranges'},
 note:{kind:'value',text:'value',sourceRefs:'ranges',episode:'value',epistemic:'value'}
};
const arrays={documents:'sourceDocument',ranges:'range',beats:'beat',episodes:'episode',notes:'note',values:'value'};
function project(value,type,path,projected) {
 projected.add(path);
 if(arrays[type])return arr(value).map((v,i)=>project(v,arrays[type],child(path,i),projected));
 if(!schemas[type])return clone(value);
 const result={};
 for(const [key,subtype] of Object.entries(schemas[type]))if(Object.hasOwn(value??{},key))result[key]=project(value[key],subtype,child(path,key),projected);
 return result;
}
const idTokens=x=>[...new Set((JSON.stringify(x).match(/\b[CSP]\d{2,}\b/g)??[]))];
function destination(path,inherited) {
 if(/^\/characters(?:\/|$)/.test(path))return 'characters';
 if(/^\/(?:scenes|props)(?:\/|$)/.test(path))return 'art';
 if(path.startsWith('/params/thresholds/')) {
  const key=path.split('/')[3];
  return ['maxLeads','maxSupport','maxFunctional'].includes(key)?'characters':['maxPrimaryScenes','maxProps'].includes(key)?'art':'unassigned';
 }
 if(path==='/params/thresholds')return 'multiple';
 if(/\/(?:characterIds|speakerId|focusCharacterIds)(?:\/|$)/.test(path))return 'characters';
 if(/\/(?:sceneIds|propIds)(?:\/|$)/.test(path))return 'art';
 return inherited??'unassigned';
}
export function migrationDraftV5(old) {
 if(!object(old)||old.schemaVersion!==4)throw Error('migrate-v5 requires schemaVersion 4; migrate-v3/migrate-v4 explicitly first; repair v4 source evidence before v5');
 const legacyValidation=checkV4(old);
 const malformed=legacyValidation.gates.filter(g=>g.status==='fail'&&g.level==='error'&&!g.id.endsWith('-cap')).map(g=>({...g,messages:g.messages.filter(m=>!m.startsWith('params.thresholds'))})).filter(g=>g.messages.length);
 if(malformed.length)throw Error('Repair malformed v4 input before migration:\n'+malformed.flatMap(g=>g.messages).join('\n'));
 const projected=new Set(),document=project(old,'document','',projected);document.schemaVersion=5;
 const fields=[];
 function walk(value,path='',inherited,sourceRefs=[]) {
  const targetStage=projected.has(path)?'outline':path==='/params/thresholds'&&!object(value)?'unassigned':destination(path,inherited==='outline'?undefined:inherited);
  const refs=object(value)&&Array.isArray(value.sourceRefs)?value.sourceRefs:sourceRefs;
  const relatedStages=[...new Set([targetStage,...idTokens(value).map(id=>id[0]==='C'?'characters':'art')])];
  if(path)fields.push({relatedStages,fieldId:'F'+String(fields.length+1).padStart(5,'0'),originalPath:path,originalValue:clone(value),targetStage,destinationPath:projected.has(path)?path:null,destinationValue:projected.has(path)?clone(atPointer(document,path)):null,status:projected.has(path)?'projected-pending-verification':targetStage==='unassigned'?'unassigned-pending-review':'pending-stage-review',handling:path==='/schemaVersion'?'version-upgrade':projected.has(path)?object(value)||Array.isArray(value)?'project-story-container; removed fields tracked separately':'copy-story-fact':path.startsWith('/params/thresholds')?'preserve-explicit-budget':path.includes('/notes')?'preserve-note-and-relations; review story continuity before release':'preserve-evidence; no automatic identity approval',legacyAssetIds:idTokens(value),sourceRefs:clone(refs)});
  if(Array.isArray(value))value.forEach((v,i)=>walk(v,child(path,i),targetStage,refs));
  else if(object(value))for(const [k,v] of Object.entries(value))walk(v,child(path,k),targetStage,refs);
 }
 walk(old);
 const byStage=stage=>fields.filter(f=>f.relatedStages.includes(stage)).map(f=>f.fieldId);
 const validation=checkup(document);
 const material={migrationVersion:1,kind:'outline-v4-to-v5',status:'pending-review',source:old.source,fromSchemaVersion:4,toSchemaVersion:5,pathConvention:'RFC6901 JSON Pointer; original paths resolve in original; destination paths resolve in draft; relative file paths resolve from the artifact identified in pathBases',original:clone(old),fields,stageMaterials:{characters:{status:'pending-review',fieldIds:byStage('characters'),identityMapping:'not-verified'},art:{status:'pending-review',fieldIds:byStage('art'),identityMapping:'not-verified'},outline:{status:'pending-review',fieldIds:byStage('outline')},unassigned:{status:'pending-review',fieldIds:byStage('unassigned')},multiple:{status:'pending-review',fieldIds:byStage('multiple')}},budgets:Object.entries(object(old.params?.thresholds)?old.params.thresholds:{}).map(([key,value])=>({originalPath:'/params/thresholds/'+escape(key),originalValue:clone(value),valueValidation:Number.isSafeInteger(value)&&value>0?'valid-v4-budget':'invalid-or-unknown; preserve and review without downgrade',constraint:'explicit-user-budget',severity:'blocking-at-owning-stage',targetStage:destination('/params/thresholds/'+escape(key)),status:'pending-stage-review'})),unclassifiedBudget:old.params?.thresholds!==undefined&&!object(old.params.thresholds)?{originalPath:'/params/thresholds',originalValue:clone(old.params.thresholds),targetStage:'unassigned',status:'pending-review'}:null,legacyValidation,sourceVerification:{status:'skipped',reason:'file-context-not-provided'},consumerInspection:{status:'skipped',reason:'project-root-not-provided',files:[]},draftValidation:validation,identityMapping:'not-verified',contentReview:'not-performed',fullDownstreamValidation:'not-performed',instructions:['Read original scripts independently in characters/art; retained C/S/P IDs are candidates, not confirmed identities or mappings.','Preserve explicit budgets in their owning stage and check them there. Unknown budgets remain unassigned and blocking for handoff until classified.','Review asset notes, arcs, relations and removed speakerId for story continuity. Rewrite only from source-supported descriptions; do not infer identity from names.','Reverify source identity, coverage and affected script/creation, image paths, work orders, prompts and reviews. Missing, changed, conflicting or ambiguous mappings cannot pass joint delivery.','Release only after story/source review and affected cross-stage reconciliation. --confirm only authorizes writing a draft.']};
 return {document,status:'pending-review',material,summary:summarize(material)};
}
function summarize(m) {
 return {fields:m.fields.length,byStage:Object.fromEntries(Object.entries(m.stageMaterials).map(([k,v])=>[k,v.fieldIds.length])),explicitBudgets:m.budgets,unclassifiedBudget:m.unclassifiedBudget,unassignedFieldPaths:m.fields.filter(f=>f.targetStage==='unassigned').map(f=>f.originalPath),sourceVerification:m.sourceVerification.status,consumerInspection:m.consumerInspection.status,identityMapping:'not-verified',contentReview:'not-performed'};
}
// Read-only inspection. Files are never rewritten, imported or executed. Symlinks are not followed.
export function inspectMigrationConsumers(root,legacyIds=[]) {
 const files=[],errors=[];
 if(!root)return {status:'skipped',reason:'project-root-not-provided',files};
 root=resolve(root);
 try{if(!lstatSync(root).isDirectory())throw Error('project root must be a real directory, not a symlink');}catch(e){return {status:'fail',root,files,errors:[e.message]};}
 const walk=(path)=>{
  let stat;try{stat=lstatSync(path);}catch(e){errors.push(path+': '+e.message);return;}
  if(stat.isSymbolicLink()){files.push({path:relative(root,path),status:'pending-review',reason:'symlink-not-followed'});return;}
  if(stat.isDirectory()){try{for(const n of readdirSync(path).sort())walk(join(path,n));}catch(e){errors.push(path+': '+e.message);}return;}
  if(!stat.isFile()){errors.push(path+': not a regular file');return;}
  const item={path:relative(root,path),status:'pending-review',identityMapping:'not-verified',matches:[]};
  try{
   const raw=readFileSync(path);item.sha256=sha256(raw);item.bytes=raw.length;
   item.pathAssetIds=legacyIds.filter(id=>new RegExp('(?:^|[^A-Za-z0-9])'+id+'(?:[^A-Za-z0-9]|$)').test(item.path));
   if(extname(path)==='.json') {
    if(path.endsWith('.migration.json')){item.reason='migration-material-not-authoritative';}
    else {
     const doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));item.schemaVersion=doc?.schemaVersion??null;
     const collect=(v,p='')=>{if(typeof v==='string'){const ids=idTokens(v).filter(id=>legacyIds.includes(id));if(ids.length)item.matches.push({fieldPath:p,value:v,legacyAssetIds:ids,status:'pending-review'});}else if(Array.isArray(v))v.forEach((x,i)=>collect(x,child(p,i)));else if(object(v))for(const [k,x] of Object.entries(v)){const ids=idTokens(k).filter(id=>legacyIds.includes(id));if(ids.length)item.matches.push({fieldPath:child(p,k),key:k,legacyAssetIds:ids,status:'pending-review'});collect(x,child(p,k));}};collect(doc);
    }
   }else if(['.md','.txt','.html','.csv','.mjs','.js','.yaml','.yml'].includes(extname(path))) {
    const lines=new TextDecoder('utf-8',{fatal:true}).decode(raw).split(/\r\n|\n|\r/);
    lines.forEach((value,i)=>{const ids=idTokens(value).filter(id=>legacyIds.includes(id));if(ids.length)item.matches.push({line:i+1,value,legacyAssetIds:ids,status:'pending-review'});});
   }else item.reason='binary-or-unsupported; inspect file/path manually';
  }catch(e){item.status='fail';item.error=e.message;errors.push(item.path+': '+e.message);}
  files.push(item);
 };
 // Stage outputs and conventional production/review locations, not sibling skill implementations.
 for(const name of ['script','creation','characters','art','shots','images','reviews','review','audits','audit','prompts','work-orders']){
  const path=join(root,name);try{lstatSync(path);walk(path);}catch(e){if(e.code!=='ENOENT')errors.push(path+': '+e.message);}
 }
 return {status:errors.length?'fail':'pending-review',root,files,errors,scope:'listed project directories only; external/custom paths require manual inspection',identityMapping:'not-verified',contentReview:'not-performed'};
}
export function migrateFileV5(input,output,{confirm=false,projectRoot}={}) {
 const from=resolve(input);if(!lstatSync(from).isFile())throw Error('Migration input must be a regular file, not a symlink');
 const raw=readFileSync(from),result=migrationDraftV5(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)));
 const to=output?resolve(output):null;
 if(to&&(from===to||!to.endsWith('.json')||to.endsWith('.migration.json')))throw Error('Use a different draft .json path (not .migration.json); original is never overwritten');
 const materialFile=to?to.slice(0,-5)+'.migration.json':null,backup=to?to+'.v4-backup':null;
 result.material.input={path:from,sha256:sha256(raw),schemaVersion:4};
 result.material.pathBases={originalArtifact:from,draftArtifact:to,migrationArtifact:materialFile};
 result.material.sourceVerification=verifySources(result.material.original,{artifactPath:from});
 const inferred=basename(dirname(from))==='outline'?dirname(dirname(from)):null;
 result.material.consumerInspection=inspectMigrationConsumers(projectRoot??inferred,idTokens(result.material.original));
 if(to)for(const d of result.document.provenance.documents)d.path=relative(dirname(to),resolve(dirname(from),d.path));
 // Track every path rewrite rather than silently relocating source evidence.
 result.material.pathRewrites=to?result.document.provenance.documents.map((d,i)=>({originalPath:`/provenance/documents/${i}/path`,originalValue:result.material.original.provenance.documents[i].path,destinationPath:`/provenance/documents/${i}/path`,destinationValue:d.path,status:'rebased-pending-verification'})):[];
 for(const f of result.material.fields)if(f.destinationPath)f.destinationValue=clone(atPointer(result.document,f.destinationPath));
 result.material.draftValidation=checkup(result.document);
 result.summary=summarize(result.material);
 if(!to)return {...result,written:false};
 for(const p of [to,backup,materialFile]){try{lstatSync(p);}catch(e){if(e.code==='ENOENT')continue;throw e;}throw Error('Migration destination already exists: '+p);}
 if(!confirm)return {...result,written:false};
 if(!readFileSync(from).equals(raw))throw Error('Input changed during migration');
 const created=[];
 try{
  copyFileSync(from,backup,constants.COPYFILE_EXCL);created.push(backup);
  if(!readFileSync(backup).equals(raw)||!readFileSync(from).equals(raw))throw Error('Input changed before backup');
  writeFileSync(materialFile,JSON.stringify(result.material,null,2)+'\n',{flag:'wx'});created.push(materialFile);
  writeFileSync(to,JSON.stringify(result.document,null,2)+'\n',{flag:'wx'});created.push(to);
 }catch(e){for(const p of created.reverse())unlinkSync(p);throw e;}
 return {...result,written:true,output:to,backup,migrationFile:materialFile};
}
