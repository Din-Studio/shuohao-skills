// Local, portable source identity and coordinate verification. Never semantic proof.
import {readFileSync,realpathSync,statSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const arr=x=>Array.isArray(x)?x:[];
const str=x=>typeof x==='string'&&x.trim().length>0;
const int=x=>Number.isSafeInteger(x)&&x>0;
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
// LF and CRLF each delimit one physical line. A terminal newline adds no phantom line.
export function sourceLines(bytes) {
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 if(!text.length)return [];
 const lines=text.split(/\r\n|\n|\r/);if(lines.at(-1)==='')lines.pop();return lines;
}
export function unionRanges(ranges) {
 const sorted=arr(ranges).filter(r=>int(r?.startLine)&&int(r?.endLine)&&r.endLine>=r.startLine).map(r=>[r.startLine,r.endLine]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const result=[];for(const [start,end] of sorted){const last=result.at(-1);if(last&&start<=last[1]+1)last[1]=Math.max(last[1],end);else result.push([start,end]);}return result;
}
export function coverageOf(p) {
 return arr(p?.documents).map(d=>{const ranges=unionRanges(arr(p?.coverage).filter(r=>r?.documentId===d?.id));const coveredLines=ranges.reduce((n,[a,b])=>n+b-a+1,0);return {documentId:d?.id,ranges,coveredLines,lineCount:d?.lineCount,complete:ranges.length===1&&ranges[0][0]===1&&ranges[0][1]===d?.lineCount};});
}
function rangeErrors(ref,p,path,{covered=false}={}) {
 const errors=[];
 if(!obj(ref)){return [path+': range must be an object'];}
 if(Object.keys(ref).some(k=>!['documentId','startLine','endLine'].includes(k)))errors.push(path+': unknown range fields');
 const d=arr(p?.documents).find(d=>d?.id===ref.documentId);
 if(!str(ref.documentId)||!d)errors.push(path+': unknown documentId');
 if(!int(ref.startLine)||!int(ref.endLine)||ref.endLine<ref.startLine||d&&ref.endLine>d.lineCount)errors.push(path+': invalid one-based inclusive line range');
 if(covered&&d&&!unionRanges(arr(p?.coverage).filter(r=>r?.documentId===d.id)).some(([a,b])=>ref.startLine>=a&&ref.endLine<=b))errors.push(path+': reference outside owned coverage');
 return errors;
}
export function provenanceErrors(p,{episodes,requireEpisodes=true}={}) {
 if(!obj(p))return ['provenance: script provenance required'];
 const errors=[];
 if(Object.keys(p).some(k=>!['kind','scope','documents','coverage','totalEpisodes'].includes(k)))errors.push('provenance: unknown fields');
 if(p.kind!=='script')errors.push('provenance.kind: only existing script input is supported (not novel/outline/original authoring)');
 if(!['partial','complete'].includes(p.scope))errors.push('provenance.scope must be partial/complete');
 if(!Array.isArray(p.documents)||!p.documents.length)errors.push('provenance.documents must be non-empty');
 const ids=new Set(),paths=new Set();
 for(const [i,d] of arr(p.documents).entries()){
  const label=`provenance.documents[${i}]`;
  if(!obj(d)){errors.push(label+': object required');continue;}
  if(Object.keys(d).some(k=>!['id','path','sha256','lineCount'].includes(k)))errors.push(label+': unknown fields');
  if(!str(d.id)||ids.has(d.id))errors.push(label+': invalid or duplicate id');ids.add(d.id);
  if(!str(d.path)||isAbsolute(d.path)||paths.has(d.path))errors.push(label+': unique artifact-relative path required');paths.add(d.path);
  if(typeof d.sha256!=='string'||! /^[a-f0-9]{64}$/.test(d.sha256))errors.push(label+': lowercase SHA256 required');
  if(!int(d.lineCount))errors.push(label+': positive lineCount required');
 }
 if(!Array.isArray(p.coverage)||!p.coverage.length)errors.push('provenance.coverage must be non-empty');
 for(const [i,r] of arr(p.coverage).entries())errors.push(...rangeErrors(r,p,`provenance.coverage[${i}]`));
 if(p.totalEpisodes!==undefined&&!int(p.totalEpisodes))errors.push('provenance.totalEpisodes must be a positive integer');
 if(p.scope==='complete'){
  if(!int(p.totalEpisodes))errors.push('complete scope requires known totalEpisodes');
  if(coverageOf(p).some(d=>!d.complete))errors.push('complete scope requires full provided document coverage');
  if(requireEpisodes&&(!Array.isArray(episodes)||episodes.length!==p.totalEpisodes||episodes.some((e,i)=>e?.ep!==i+1)))errors.push('complete scope requires actual episodes 1..totalEpisodes');
 }
 if(int(p.totalEpisodes)&&arr(episodes).some(e=>e?.ep>p.totalEpisodes))errors.push('episode exceeds known totalEpisodes');
 return errors;
}
export function sourceRefsErrors(refs,p,path='sourceRefs',{required=true}={}) {
 if(refs===undefined&&!required)return [];
 if(!Array.isArray(refs)||!refs.length)return [path+': non-empty sourceRefs required'];
 return refs.flatMap((r,i)=>rangeErrors(r,p,`${path}[${i}]`,{covered:true}));
}
export function sourceDocument(path,{artifactPath,id='D01'}={}) {
 if(!artifactPath)throw Error('artifactPath required to resolve source paths');
 if(!statSync(resolve(path)).isFile())throw Error('source must be a regular file');
 const bytes=readFileSync(resolve(path)),lines=sourceLines(bytes);
 if(!lines.length)throw Error('source must contain lines');
 return {id,path:relative(dirname(resolve(artifactPath)),resolve(path)),sha256:sha256(bytes),lineCount:lines.length};
}
export function verifySources(doc,{artifactPath,baseDir}={}) {
 const errors=provenanceErrors(doc?.provenance,{episodes:doc?.episodes}),documents=[];
 if(!artifactPath&&!baseDir)errors.push('source verification requires artifactPath or explicit baseDir');
 const base=baseDir?resolve(baseDir):artifactPath?dirname(resolve(artifactPath)):null;
 const seen=new Set();
 for(const d of arr(doc?.provenance?.documents)){
  if(!base||!str(d?.path))continue;
  try{
   const path=resolve(base,d.path),canonical=realpathSync(path);
   if(!statSync(canonical).isFile())throw Error('source must be a regular file');
   if(seen.has(canonical))errors.push(`${d.id}: duplicate resolved source path`);seen.add(canonical);
   const raw=readFileSync(canonical),lines=sourceLines(raw),hash=sha256(raw);
   if(hash!==d.sha256)errors.push(`${d.id}: source SHA256 changed`);
   if(lines.length!==d.lineCount)errors.push(`${d.id}: source lineCount changed (${lines.length} != ${d.lineCount})`);
   for(const r of arr(doc.provenance.coverage).filter(r=>r?.documentId===d.id))if(r.endLine>lines.length)errors.push(`${d.id}: coverage exceeds actual source lines`);
   documents.push({id:d.id,path,sha256:hash,lineCount:lines.length});
  }catch(e){errors.push(`${d?.id}: source unreadable: ${e.message}`);}
 }
 // All supplied references, including nested notes, are checked, not merely coverage.
 const walk=(x,path)=>{if(Array.isArray(x))x.forEach((v,i)=>walk(v,`${path}[${i}]`));else if(obj(x))for(const [k,v] of Object.entries(x)){if(k==='sourceRefs')errors.push(...sourceRefsErrors(v,doc?.provenance,`${path}.sourceRefs`));else walk(v,`${path}.${k}`);}};walk(doc,'outline');
 return {status:errors.length?'fail':'pass',errors,documents,coverage:coverageOf(doc?.provenance),contentReview:'not-performed'};
}
// Chunk exact physical lines, never trim/rewrite source. Context is not owned coverage.
export function chunkScript(bytes,{kind,maxLines=200,contextLines=2,documentId='D01'}={}) {
 if(kind!=='script')throw Error('chunk requires explicit kind=script; novel/outline inputs are unsupported');
 if(!int(maxLines)||!Number.isSafeInteger(contextLines)||contextLines<0)throw Error('invalid chunk size/context');
 const lines=sourceLines(bytes),chunks=[];
 for(let start=1;start<=lines.length;){
  let end=Math.min(start+maxLines-1,lines.length);
  // Prefer an existing episode/scene boundary, without dropping boundary lines.
  if(end<lines.length)for(let i=end;i>start;i--)if(/^\s*(?:第.+[集场]|(?:EPISODE|SCENE|INT\.|EXT\.)\b)/i.test(lines[i-1])){end=i-1;break;}
  const a=Math.max(1,start-contextLines),b=Math.min(lines.length,end+contextLines);
  chunks.push({owned:{documentId,startLine:start,endLine:end},context:{documentId,startLine:a,endLine:b},lines:lines.slice(a-1,b)});start=end+1;
 }
 return {kind,sha256:sha256(bytes),lineCount:lines.length,chunks,contentReview:'not-performed'};
}
