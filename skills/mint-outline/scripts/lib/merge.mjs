// Deterministic merge of per-batch v5 partial fragments into one draft, and draft publication.
// No model calls, no semantic judgement: only coverage, ownership, renumbering and existing checks.
import {existsSync,mkdirSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {basename,dirname,relative,resolve} from 'node:path';
import {checkup} from './outline-core.mjs';
import {coverageOf,sha256,sourceLines} from './source.mjs';
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const arr=x=>Array.isArray(x)?x:[];
const int=x=>Number.isSafeInteger(x)&&x>0;
const readJson=p=>JSON.parse(readFileSync(resolve(p),'utf8'));
const id=(prefix,n)=>prefix+String(n).padStart(2,'0');
const gateErrors=report=>report.gates.filter(g=>g.status==='fail'&&g.level==='error').flatMap(g=>g.messages.length?g.messages.map(m=>`${g.id}: ${m}`):[g.id]);
const FORBIDDEN=[['totalEpisodes',d=>d.provenance?.totalEpisodes],['endingBeatId',d=>d.story?.endingBeatId],['lang',d=>d.lang],['params',d=>d.params],['creativeBrief',d=>d.creativeBrief]];

// sources.json is a closed .work record written by source-folder; re-read every listed file.
export function readSources(path) {
 const file=resolve(path),data=readJson(file),errors=[];
 if(!obj(data)||Object.keys(data).some(k=>!['kind','documents','missingEpisodes'].includes(k))||data.kind!=='script-folder')throw Error(`${path}: not a source-folder record`);
 if(!Array.isArray(data.documents)||!data.documents.length||!Array.isArray(data.missingEpisodes))throw Error(`${path}: documents and missingEpisodes required`);
 const documents=data.documents.map((d,i)=>{
  if(!obj(d)||Object.keys(d).some(k=>!['id','ep','path','sha256','lineCount'].includes(k))||!int(d.ep)||typeof d.id!=='string'||typeof d.path!=='string'){errors.push(`${path}: documents[${i}] invalid`);return null;}
  const abs=resolve(dirname(file),d.path);
  try{const raw=readFileSync(abs);if(sha256(raw)!==d.sha256||sourceLines(raw).length!==d.lineCount)errors.push(`${d.id}: source changed since source-folder`);return {...d,abs,real:realpathSync(abs)};}
  catch(e){errors.push(`${d.id}: source unreadable: ${e.message}`);return null;}
 });
 for(let i=1;i<documents.length;i++)if(documents[i]&&documents[i-1]&&documents[i].ep<=documents[i-1].ep)errors.push(`${path}: documents must be in increasing episode order`);
 if(new Set(documents.map(d=>d?.id)).size!==documents.length)errors.push(`${path}: duplicate document id`);
 if(errors.length)throw Error(errors.join('\n'));
 return documents;
}

// Collect every sourceRefs array below a node, including nested notes, ending and question.
const refsBelow=x=>Array.isArray(x)?x.flatMap(refsBelow):obj(x)?Object.entries(x).flatMap(([k,v])=>k==='sourceRefs'?arr(v):refsBelow(v)):[];

function checkFragment(path,doc,{source,sources}) {
 const errors=[],label=path;
 if(!obj(doc))return {errors:[`${label}: fragment must be an object`]};
 if(doc.schemaVersion!==5)return {errors:[`${label}: schemaVersion must be 5`]};
 const report=checkup(doc,{stage:'full',verifySources:true,artifactPath:path});
 errors.push(...gateErrors(report).map(m=>`${label}: ${m}`));
 if(doc.provenance?.scope!=='partial')errors.push(`${label}: provenance.scope must be partial`);
 for(const [name,get] of FORBIDDEN)if(get(doc)!==undefined)errors.push(`${label}: ${name} belongs to the merged outline, not a fragment`);
 if(doc.source!==source)errors.push(`${label}: source must be ${JSON.stringify(source)}`);
 const docs=arr(doc.provenance?.documents),cover=coverageOf(doc.provenance),owned=[];
 for(const d of docs){
  const s=sources.find(s=>s.id===d?.id);
  if(!s){errors.push(`${label}: ${d?.id} is not in sources.json`);continue;}
  let real=null;try{real=realpathSync(resolve(dirname(path),d.path));}catch{}
  if(d.sha256!==s.sha256||d.lineCount!==s.lineCount||real!==s.real)errors.push(`${label}: ${d.id} differs from sources.json`);
  if(!cover.find(c=>c.documentId===d.id)?.complete)errors.push(`${label}: ${d.id} coverage must be the whole episode 1..${d.lineCount}`);
  owned.push(s);
 }
 const eps=arr(doc.episodes).map(e=>e?.ep),want=owned.map(s=>s.ep).sort((a,b)=>a-b);
 if(JSON.stringify([...eps].sort((a,b)=>a-b))!==JSON.stringify(want))errors.push(`${label}: episodes [${eps}] must equal its documents' episodes [${want}]`);
 const index=owned.map(s=>sources.indexOf(s)).sort((a,b)=>a-b);
 if(index.some((v,i)=>i&&v!==index[i-1]+1))errors.push(`${label}: episodes must be one contiguous range in sources.json`);
 const docOf=ep=>owned.find(s=>s.ep===ep)?.id;
 const local=(node,ep,where)=>{for(const r of refsBelow(node))if(r?.documentId!==docOf(ep))errors.push(`${label}: ${where} cites ${r?.documentId} outside episode ${ep}`);};
 for(const b of arr(doc.beats))local(b,b?.episode,b?.id);
 for(const e of arr(doc.episodes))local(e,e?.ep,'ep'+e?.ep);
 for(const n of [...arr(doc.notes),...arr(doc.story?.notes)])if(n?.episode!==undefined)local(n,n.episode,'note for ep'+n.episode);
 arr(doc.beats).forEach((b,i)=>{if(b?.id!==id('B',i+1))errors.push(`${label}: local beat IDs must run B01,B02… in order (found ${b?.id})`);});
 const questions=arr(doc.episodes).map(e=>e?.ending?.question).filter(Boolean);
 questions.forEach((q,i)=>{if(q.id!==id('Q',i+1))errors.push(`${label}: local question IDs must run Q01,Q02… in episode order (found ${q.id})`);});
 return {errors,owned,eps:want};
}

export function mergeFragments(fragments,{sources,out,publishTo,source,scope,totalEpisodes}={}) {
 if(!arr(fragments).length)throw Error('merge requires at least one fragment');
 if(!sources||!out||!publishTo||!source)throw Error('merge requires sources, out, publishTo and source');
 if(!['partial','complete'].includes(scope))throw Error('scope must be partial or complete');
 if(totalEpisodes!==undefined&&!int(totalEpisodes))throw Error('totalEpisodes must be a positive integer');
 if(scope==='complete'&&totalEpisodes===undefined)throw Error('complete scope requires totalEpisodes');
 if(existsSync(resolve(publishTo)))throw Error(`${publishTo} already exists: parallel merge only creates a new outline`);
 if(existsSync(resolve(out)))throw Error(`${out} already exists`);
 const docs=readSources(sources),errors=[],items=[],names=new Set();
 for(const path of fragments){
  const name=basename(path);if(names.has(name))errors.push(`${path}: duplicate fragment name ${name}`);names.add(name);
  let doc;try{doc=readJson(path);}catch(e){errors.push(`${path}: ${e.message}`);continue;}
  const result=checkFragment(resolve(path),doc,{source,sources:docs});errors.push(...result.errors);items.push({path,name,doc,...result});
 }
 const owners=new Map();
 for(const it of items)for(const s of arr(it.owned)){if(owners.has(s.id))errors.push(`${s.id} owned by both ${owners.get(s.id)} and ${it.path}`);owners.set(s.id,it.path);}
 for(const s of docs)if(!owners.has(s.id))errors.push(`${s.id} (episode ${s.ep}) is owned by no fragment`);
 if(errors.length)throw Error(errors.join('\n'));
 items.sort((a,b)=>a.eps[0]-b.eps[0]);
 for(let i=1;i<items.length;i++)if(items[i].eps[0]<=items[i-1].eps.at(-1))errors.push(`episode ranges of ${items[i-1].path} and ${items[i].path} overlap`);
 if(errors.length)throw Error(errors.join('\n'));
 const base=dirname(resolve(publishTo)),idMap={},beats=[],episodes=[],notes=[],storyNotes=[],storyRefs=[],summaries=[];
 let nb=0,nq=0;
 for(const it of items){
  const map=idMap[it.name]={},doc=structuredClone(it.doc);
  for(const b of arr(doc.beats))map[b.id]=id('B',++nb);
  for(const e of arr(doc.episodes))if(e.ending?.question)map[e.ending.question.id]=id('Q',++nq);
  for(const b of arr(doc.beats)){b.id=map[b.id];if(b.resolves)b.resolves=b.resolves.map(q=>map[q]);beats.push(b);}
  for(const e of arr(doc.episodes)){if(e.ending?.question)e.ending.question.id=map[e.ending.question.id];episodes.push(e);}
  notes.push(...arr(doc.notes));storyNotes.push(...arr(doc.story.notes));
  for(const r of arr(doc.story.sourceRefs))if(!storyRefs.some(x=>JSON.stringify(x)===JSON.stringify(r)))storyRefs.push(r);
  const [a,b]=[it.eps[0],it.eps.at(-1)];summaries.push(`第 ${a===b?a:a+'–'+b} 集：${doc.story.summary}`);
 }
 const draft={schemaVersion:5,source,story:{summary:summaries.join('\n\n'),sourceRefs:storyRefs,...(storyNotes.length?{notes:storyNotes}:{})},beats,episodes,...(notes.length?{notes}:{}),
  provenance:{kind:'script',scope,documents:docs.map(d=>({id:d.id,path:relative(base,d.abs),sha256:d.sha256,lineCount:d.lineCount})),coverage:docs.map(d=>({documentId:d.id,startLine:1,endLine:d.lineCount})),...(totalEpisodes===undefined?{}:{totalEpisodes})}};
 const report=checkup(draft,{stage:'full',verifySources:true,baseDir:base});
 if(report.stats.fail)throw Error('merged draft fails checks:\n'+gateErrors(report).join('\n'));
 mkdirSync(dirname(resolve(out)),{recursive:true});
 writeFileSync(resolve(out),JSON.stringify(draft,null,2)+'\n',{flag:'wx'});
 const resolved=new Set(beats.flatMap(b=>arr(b.resolves)));
 return {draft,summary:{out:resolve(out),publishTo:resolve(publishTo),fragments:items.length,documents:docs.length,beats:beats.length,questions:nq,unresolvedQuestions:episodes.map(e=>e.ending?.question?.id).filter(q=>q&&!resolved.has(q)),idMap}};
}

// Publish a reviewed draft byte-for-byte to the formal location. Never overwrites.
export function publishDraft(draftPath,{to}={}) {
 if(!draftPath||!to)throw Error('publish requires DRAFT and --to');
 const target=resolve(to);
 if(existsSync(target))throw Error(`${to} already exists: publish only creates a new outline`);
 const bytes=readFileSync(resolve(draftPath)),doc=JSON.parse(bytes.toString('utf8'));
 const report=checkup(doc,{stage:'full',verifySources:true,artifactPath:target});
 if(report.stats.fail)throw Error('draft fails checks at the formal location:\n'+gateErrors(report).join('\n'));
 mkdirSync(dirname(target),{recursive:true});
 writeFileSync(target,bytes,{flag:'wx'});
 return {to:target,stats:report.stats,contentReview:report.contentReview};
}
