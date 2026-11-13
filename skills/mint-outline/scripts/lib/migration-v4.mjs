// Explicit evidence-preserving v2/v3 -> v4 DRAFT migration. No invented provenance.
import {readFileSync,writeFileSync,lstatSync,unlinkSync,copyFileSync,constants} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {checkup as legacyCheckup} from './legacy-v3-core.mjs';
import {migrationDraft as migrateV3} from './migration.mjs';
import {checkup,object} from './legacy-v4-core.mjs';
export function migrationDraftV4(old){
 if(!object(old)||![2,3].includes(old.schemaVersion))throw Error('migrate-v4 requires a schemaVersion 2 or 3 object');
 const original=structuredClone(old),v3=old.schemaVersion===2?migrateV3(old,{confirm:true}).document:structuredClone(old);
 const validation=legacyCheckup(v3);
 if(validation.stats.fail)throw Error('Repair malformed legacy input first:\n'+validation.gates.filter(g=>g.status==='fail'&&g.level==='error').flatMap(g=>g.messages).join('\n'));
 const document=structuredClone(v3),preserved=[];
 const remove=(obj,key,path)=>{if(obj?.[key]!==undefined){preserved.push({path:path+'.'+key,value:structuredClone(obj[key]),destination:'review.original; manually reconcile evidence/project or art requirements'});delete obj[key];}};
 document.schemaVersion=4;
 for(const k of ['episodes','minutesPerEpisode','adaptMode'])remove(document.params,k,'params');
 if(!Object.keys(document.params).length)delete document.params;
 for(const k of ['adaptation','arcs'])remove(document,k,'outline');
 const oldStory=structuredClone(document.story);
 // Existing text is preserved verbatim, not rewritten into a fictional source account.
 document.story={summary:[oldStory.premise,oldStory.throughline,oldStory.ending].filter(Boolean).join('\n'),...(oldStory.focusCharacterIds?{focusCharacterIds:oldStory.focusCharacterIds}:{})};
 preserved.push({path:'story',value:oldStory,destination:'story.summary (verbatim concatenation); review.original (including unverified ending)'});
 for(const s of document.scenes??[])remove(s,'reusePlan','scenes.'+s.id);
 for(const b of document.beats??[])for(const k of ['position','kind','weight'])remove(b,k,'beats.'+b.id);
 for(const e of document.episodes??[])for(const k of ['resolution','dueByEp'])remove(e.ending?.question,k,'episodes.'+e.ep+'.ending.question');
 const report=checkup(document);
 return {document,status:'pending-evidence',pending:report.gates.filter(g=>g.status==='fail'&&g.level==='error').flatMap(g=>g.messages),preserved,review:{original,contentReview:'not-performed',instructions:'This is NOT a production-ready outline. Read actual scripts; establish provenance and sourceRefs, confirm supplied scope, reconcile notes and source fidelity. Historical evidence, restrictions, choices and targets remain in original/preserved; do not invent source lines, totalEpisodes or targetSeconds. Restore endingBeatId only after identifying the actual whole ending.'}};
}
export function migrateFileV4(input,output,{confirm=false}={}){
 const from=resolve(input);if(!lstatSync(from).isFile())throw Error('Migration input must be a regular file, not a symlink');
 const raw=readFileSync(from),result=migrationDraftV4(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)));
 if(!output)return result;
 const to=resolve(output),backup=to+'.legacy-backup',review=to+'.migration.json';
 if(from===to)throw Error('Migration never overwrites input');
 for(const p of [to,backup,review]){try{lstatSync(p);}catch(e){if(e.code==='ENOENT')continue;throw e;}throw Error('Migration destination already exists: '+p);}
 if(!confirm)return {...result,written:false};
 // Preserve any pre-existing relative references if a legacy extension carried them.
 for(const d of result.document.provenance?.documents??[])d.path=relative(dirname(to),resolve(dirname(from),d.path));
 if(!readFileSync(from).equals(raw))throw Error('Input changed during migration');
 const created=[];
 try{
  copyFileSync(from,backup,constants.COPYFILE_EXCL);created.push(backup);
  if(!readFileSync(backup).equals(raw)||!readFileSync(from).equals(raw))throw Error('Input changed before backup');
  writeFileSync(review,JSON.stringify({status:result.status,pending:result.pending,preserved:result.preserved,...result.review},null,2)+'\n',{flag:'wx'});created.push(review);
  writeFileSync(to,JSON.stringify(result.document,null,2)+'\n',{flag:'wx'});created.push(to);
 }catch(e){for(const p of created.reverse())unlinkSync(p);throw e;}
 return {...result,written:true,output:to,backup,reviewFile:review,migrationFile:review};
}
