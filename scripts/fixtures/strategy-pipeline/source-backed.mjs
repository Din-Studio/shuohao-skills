// Root-owned screenplay fixtures. Author source bytes FIRST; only then derive evidence.
// No skill examples, source helpers or migration implementations are imported here.
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {buildOutline, fillScript} from './stories.mjs';

export function writeStorySource(story, directory) {
  mkdirSync(directory, {recursive:true});
  const lines=[`《${story.title}》测试剧本`,story.premise,story.throughline,story.ending,
    ...story.people.map(([name,role,arc])=>`${name}：${role}。${arc}。`),
    `地点：${story.scene}。${story.sceneDescription}`,`道具：${story.prop}。${story.propFunction}`];
  const characters=story.people.map((_,i)=>5+i),scene=lines.length-1,prop=lines.length;
  const episodes=story.episodes.map((ep,i)=>{
    const start=lines.length+1;
    lines.push(`第${i+1}集`,ep.opening,`前情：${ep.before}；本集结果：${ep.after}`);
    const actions=ep.actions.map(action=>{lines.push(action);return lines.length;});
    const nodes=ep.nodes.map(n=>{lines.push(`事件说明：${n.type}；${n.setup}；${n.outcome}`);return lines.length;});
    lines.push(ep.ending.event);
    let question;
    if(ep.ending.question){lines.push(ep.ending.question.text);question=lines.length;}
    return {start,end:lines.length,actions,nodes,question};
  });
  const file=join(directory,`${story.title}.txt`);
  writeFileSync(file,lines.join('\n')+'\n');
  const bytes=readFileSync(file),actual=bytes.toString('utf8').trimEnd().split('\n');
  // Coordinates must point into the file just read, never invented hashes or padded lines.
  for(const [i,ep] of episodes.entries())for(const [j,line] of ep.actions.entries())
    if(actual[line-1]!==story.episodes[i].actions[j])throw Error('source coordinate mismatch');
  return {file,characters,scene,prop,episodes,lineCount:actual.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
const ref=(startLine,endLine=startLine)=>[{documentId:'D01',startLine,endLine}];
export function provenanceFor(source,artifact) {
  return {kind:'script',scope:'complete',totalEpisodes:3,
    documents:[{id:'D01',path:relative(dirname(artifact),source.file),sha256:source.sha256,lineCount:source.lineCount}],
    coverage:ref(1,source.lineCount)};
}
export function outlineV4(story,source,artifact) {
  const d=buildOutline(story);d.schemaVersion=4;d.provenance=provenanceFor(source,artifact);
  delete d.adaptation;delete d.arcs;
  for(const key of ['adaptMode','minutesPerEpisode','episodes'])delete d.params[key];
  d.story={summary:`${story.premise}${story.throughline}${story.ending}`,sourceRefs:ref(2,4),focusCharacterIds:d.story.focusCharacterIds,endingBeatId:d.story.endingBeatId};
  d.characters.forEach((c,i)=>{delete c.from;c.sourceRefs=ref(source.characters[i]);});
  d.scenes[0].sourceRefs=ref(source.scene);d.props[0].sourceRefs=ref(source.prop);
  let n=0;
  d.episodes.forEach((e,i)=>{
    delete e.stateChange;e.sourceRefs=ref(source.episodes[i].start,source.episodes[i].end);
    if(e.ending.question){delete e.ending.question.resolution;delete e.ending.question.dueByEp;e.ending.question.sourceRefs=ref(source.episodes[i].question);}
    story.episodes[i].nodes.forEach((node,j)=>{
      const b=d.beats[n++];b.setup=b.type+'：'+b.setup;
      for(const key of ['type','kind','position','weight'])delete b[key];
      b.sourceRefs=[...ref(source.episodes[i].actions[node.start-1],source.episodes[i].actions[node.end-1]),...ref(source.episodes[i].nodes[j])];
    });
  });
  return d;
}
export function scriptV4(seed,story,source,artifact,{production=true}={}) {
  const d=fillScript(seed,story);d.schemaVersion=4;d.provenance=provenanceFor(source,artifact);
  d.episodes.forEach((ep,i)=>{
    for(const key of ['opening','ending','endBeat'])delete ep[key];
    if(production)ep.targetSeconds=24;else delete ep.targetSeconds;
    const map=source.episodes[i];ep.sourceRefs=ref(map.start,map.end);
    ep.scenes[0].sourceRefs=ref(map.start,map.end);
    ep.scenes[0].flow.forEach((b,j)=>{b.sourceRefs=ref(map.actions[j]);});
  });
  return d;
}
// Preserve relative source identity when a negative/discovery test relocates JSON.
export function relocate(doc,from,to) {
  const d=structuredClone(doc);
  for(const source of d.provenance?.documents??[])source.path=relative(dirname(to),join(dirname(from),source.path));
  return d;
}
// Formal story-only projection, authored directly from root screenplay facts.
export function outlineV5(story,source,artifact) {
  let number=0;
  const beats=story.episodes.flatMap((ep,i)=>ep.nodes.map((node,j)=>({
    id:`B${String(++number).padStart(2,'0')}`,episode:i+1,setup:node.type+'：'+node.setup,outcome:node.outcome,
    ...(node.resolves?{resolves:structuredClone(node.resolves)}:{}),
    sourceRefs:[...ref(source.episodes[i].actions[node.start-1],source.episodes[i].actions[node.end-1]),...ref(source.episodes[i].nodes[j])]
  })));
  return {schemaVersion:5,source:story.title,params:{},provenance:provenanceFor(source,artifact),
    story:{summary:`${story.premise}${story.throughline}${story.ending}`,sourceRefs:ref(2,4),endingBeatId:beats.at(-1).id},beats,
    episodes:story.episodes.map((ep,i)=>({ep:i+1,synopsis:ep.nodes.map(n=>n.outcome).join('；'),opening:ep.opening,
      ending:{...structuredClone(ep.ending),...(ep.ending.question?{question:{id:ep.ending.question.id,text:ep.ending.question.text,sourceRefs:ref(source.episodes[i].question)}}:{})},
      sourceRefs:ref(source.episodes[i].start,source.episodes[i].end)}))};
}
