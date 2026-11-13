// Local full v5 consumption contract. Learned from the documented outline v5
// data contract; no producer scripts or sibling fixtures are runtime dependencies.
import {isAbsolute} from 'node:path';
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&!!v.trim();
const int=v=>Number.isSafeInteger(v)&&v>0;
const rows=v=>Array.isArray(v)?v:[];
const ids=(v,p)=>Array.isArray(v)&&v.every(x=>typeof x==='string'&&new RegExp(`^${p}\\d{2,}$`).test(x))&&new Set(v).size===v.length;
// Range bounds and owned coverage are additionally checked by evidenceErrors.
export function outlineInputErrors(doc) {
  const errors=[];
  const shape=(v,keys,label)=>{
    if(!obj(v)){errors.push(`${label} 必须是对象`);return;}
    for(const k of Object.keys(v))if(!keys.includes(k))errors.push(`${label}.${k} 不属于 outline v5`);
  };
  const refs=(v,label,required=true)=>{
    if(v===undefined&&!required)return;
    if(!Array.isArray(v)||!v.length){errors.push(`${label}.sourceRefs 必须是非空数组`);return;}
    for(const r of v)shape(r,['documentId','startLine','endLine'],`${label}.sourceRefs`);
  };
  const eps=rows(doc.episodes),beats=rows(doc.beats),p=doc.provenance;
  shape(doc,['schemaVersion','source','lang','params','creativeBrief','provenance','story','beats','episodes','notes'],'outline');
  if(!text(doc.source))errors.push('outline.source 必须是非空标题');
  if(doc.lang!==undefined&&!['zh','en'].includes(doc.lang))errors.push('outline.lang 非法');
  if(doc.creativeBrief!==undefined&&!text(doc.creativeBrief))errors.push('outline.creativeBrief 必须非空');
  if(doc.params!==undefined){shape(doc.params,['genre'],'params');if(doc.params?.genre!==undefined&&!text(doc.params.genre))errors.push('params.genre 必须非空');}
  shape(p,['kind','scope','documents','coverage','totalEpisodes'],'provenance');
  const paths=new Set();
  for(const d of rows(p?.documents)){
    shape(d,['id','path','sha256','lineCount'],'provenance.documents');
    if(!text(d?.path)||isAbsolute(d.path)||paths.has(d.path))errors.push('outline 来源路径必须相对产物且唯一');
    paths.add(d?.path);
  }
  for(const r of rows(p?.coverage))shape(r,['documentId','startLine','endLine'],'provenance.coverage');
  if(!Array.isArray(doc.beats))errors.push('outline.beats 必须是数组');
  if(!Array.isArray(doc.episodes)||!eps.length)errors.push('outline.episodes 必须是非空数组');
  if(p?.scope==='complete'&&(!int(p.totalEpisodes)||eps.length!==p.totalEpisodes||eps.some((e,i)=>e?.ep!==i+1)))errors.push('outline complete 必须包含连续全集 1..totalEpisodes');
  const notes=(v,label)=>{
    if(v?.notes===undefined)return;
    if(!Array.isArray(v.notes))errors.push(`${label}.notes 必须是数组`);
    for(const n of rows(v.notes)){
      shape(n,['kind','text','sourceRefs','episode','epistemic','speaker'],`${label}.notes`);
      if(!text(n?.text)||!['performance','background','continuity','restriction'].includes(n?.kind))errors.push(`${label}.notes 缺少合法 kind/text`);
      refs(n?.sourceRefs,`${label}.notes`);
      if(n?.episode!==undefined&&(!int(n.episode)||!eps.some(e=>e?.ep===n.episode)))errors.push(`${label}.notes.episode 不存在`);
      if(n?.epistemic!==undefined&&!['fact','claim','uncertain'].includes(n.epistemic))errors.push(`${label}.notes.epistemic 非法`);
      if(n?.speaker!==undefined){shape(n.speaker,['status','description'],`${label}.notes.speaker`);if(!['described','unknown'].includes(n.speaker?.status)||!text(n.speaker?.description))errors.push(`${label}.notes.speaker 非法`);}
    }
  };
  shape(doc.story,['summary','endingBeatId','sourceRefs','notes'],'story');
  if(!text(doc.story?.summary))errors.push('story.summary 必须非空');
  refs(doc.story?.sourceRefs,'story');notes(doc,'outline');notes(doc.story,'story');
  let last=0;
  if(!ids(beats.map(b=>b?.id),'B'))errors.push('outline 节点 ID 非法或重复');
  for(const b of beats){
    shape(b,['id','episode','setup','outcome','resolves','sourceRefs','notes'],'beat');
    if(!int(b?.episode)||b.episode<last||!eps.some(e=>e?.ep===b.episode)||int(p?.totalEpisodes)&&b.episode>p.totalEpisodes)errors.push('outline 节点所属集或顺序非法');
    last=b?.episode;
    if(!text(b?.setup)||!text(b?.outcome))errors.push('outline 节点缺少 setup/outcome');
    refs(b?.sourceRefs,'beat');notes(b,'beat');
    if(b?.resolves!==undefined&&!ids(b.resolves,'Q'))errors.push('beat.resolves 必须是唯一 Q ID 数组');
  }
  if(doc.story?.endingBeatId!==undefined&&(!int(p?.totalEpisodes)||!beats.some(b=>b?.id===doc.story.endingBeatId&&b.episode===p.totalEpisodes)))errors.push('story.endingBeatId 必须指向已知最终集节点');
  last=0;const questions=new Map();
  for(const e of eps){
    shape(e,['ep','synopsis','opening','ending','warnings','sourceRefs','notes'],'episode');
    if(!int(e?.ep)||e.ep<=last||int(p?.totalEpisodes)&&e.ep>p.totalEpisodes)errors.push('outline 分集编号、顺序或总集数范围非法');
    last=e?.ep;
    if(!text(e?.synopsis))errors.push('episode.synopsis 必须非空');
    refs(e?.sourceRefs,'episode');notes(e,'episode');
    if(e?.opening!==undefined&&!text(e.opening))errors.push('episode.opening 必须非空');
    if(e?.warnings!==undefined&&(!Array.isArray(e.warnings)||e.warnings.some(x=>!text(x))))errors.push('episode.warnings 必须是非空字符串数组');
    if(e?.ending!==undefined){
      const end=e.ending;shape(end,['event','mode','question','sourceRefs'],'episode.ending');
      if(!text(end?.event))errors.push('episode.ending.event 必须非空');
      if(end?.mode!==undefined&&!['suspense','closure','open'].includes(end.mode))errors.push('episode.ending.mode 非法');
      refs(end?.sourceRefs,'episode.ending',false);
      if(end?.question!==undefined){
        const q=end.question;shape(q,['id','text','reason','sourceRefs'],'question');
        if(!ids([q?.id],'Q')||questions.has(q?.id)||!text(q?.text))errors.push('question ID/text 非法或重复');
        if(q?.reason!==undefined&&!text(q.reason))errors.push('question.reason 必须非空');
        refs(q?.sourceRefs,'question');questions.set(q?.id,e.ep);
      }
    }
  }
  const resolved=new Set();
  for(const b of beats)for(const id of rows(b?.resolves)){
    if(!questions.has(id)||resolved.has(id)||b.episode<=questions.get(id))errors.push('resolves 问题不存在、重复回答或未在提出集之后');
    resolved.add(id);
  }
  return errors;
}
