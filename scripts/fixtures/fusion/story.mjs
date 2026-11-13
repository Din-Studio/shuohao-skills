// Story is authored in the two adjacent raw screenplay files, before any shots.
import {createHash} from 'node:crypto';
import {copyFileSync,mkdirSync,readFileSync} from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const refs=(documentId,startLine,endLine=startLine)=>[{documentId,startLine,endLine}];
export function relocate(doc,from,to) {
  const d=structuredClone(doc);
  for(const source of d.provenance.documents)source.path=relative(dirname(to),resolve(dirname(from),source.path));
  return d;
}
export function materializeStory(dir,scriptPath) {
  const docs=[1,2].map(n=>{
    const name=`堤灯-第${n===1?'一':'二'}集.txt`,file=join(dir,'source',name);
    mkdirSync(dirname(file),{recursive:true});copyFileSync(join(here,name),file);
    const bytes=readFileSync(file),lines=bytes.toString('utf8').replace(/\n$/,'').split('\n');
    return {id:`D0${n}`,path:relative(dirname(scriptPath),file),sha256:createHash('sha256').update(bytes).digest('hex'),lineCount:lines.length,lines};
  });
  // Resolve exact locations from actual reads, including the second identical occurrence.
  const locate=(doc,prefix,occurrence=0)=>{
    const matches=docs[doc-1].lines.flatMap((s,i)=>s.startsWith(prefix)?[i+1]:[]);
    if(matches[occurrence]===undefined)throw Error(`Raw source mismatch D0${doc}: ${prefix}`);
    return matches[occurrence];
  };
  const text=(doc,line,prefix='')=>{
    const value=docs[doc-1].lines[line-1];
    if(!value?.startsWith(prefix))throw Error(`Raw source mismatch D0${doc}:${line}`);
    return value.slice(prefix.length);
  };
  const action=(doc,prefix)=>{const n=locate(doc,prefix);return {action:text(doc,n),sourceRefs:refs(`D0${doc}`,n)};};
  const inner=occurrence=>{const n=locate(1,'程岚的内心独白：',occurrence);return {speaker:'C01',line:text(1,n,'程岚的内心独白：'),audio:{mode:'inner',subjective:true,audibleTo:[]},sourceRefs:refs('D01',n)};};
  const corridor=locate(1,'廊道。'),sound=locate(1,'声音：'),subtitle=locate(1,'字幕：'),background=locate(2,'背景说明：');
  const performance=locate(1,'表演说明：'),lastPerformance=locate(1,'表演说明：',2);
  return {schemaVersion:4,source:'堤灯',provenance:{kind:'script',scope:'complete',totalEpisodes:2,
    documents:docs.map(({lines,...d})=>d),coverage:docs.map(d=>refs(d.id,1,d.lineCount)[0])},
    episodes:[{ep:1,beatClaims:[{beatId:'B01',start:[1,1],end:[1,3]},{beatId:'B02',start:[3,1],end:[3,2]}],scenes:[
      {sceneId:'S01',characters:['C01','C02'],flow:[
        {action:text(1,2).split('人物 ')[0].trim(),sourceRefs:refs('D01',2)},inner(0),action(1,'程岚按住')],
        notes:[{kind:'performance',text:docs[0].lines.slice(performance-1,lastPerformance).join('\n').replaceAll('表演说明：',''),sourceRefs:refs('D01',performance,lastPerformance)}]},
      {sceneId:'S02',characters:['C02'],flow:[
        {action:'廊道。齐叔将旧水位牌翻回正面。',sourceRefs:refs('D01',corridor)},action(1,'齐叔把手'),
        {sound:text(1,sound,'声音：'),seconds:2,audio:{mode:'offscreen',audibleTo:['C02']},sourceRefs:refs('D01',sound)},
        {subtitle:text(1,subtitle,'字幕：'),seconds:2,sourceRefs:refs('D01',subtitle)}],
        notes:[{kind:'continuity',text:text(1,corridor).split('，').slice(1).join('，'),sourceRefs:refs('D01',corridor)}]},
      {sceneId:'S01',characters:['C01'],flow:[inner(1),action(1,'程岚把没有签名')]}
    ]},{ep:2,beatClaims:[{beatId:'B03',start:[1,1],end:[1,2]}],scenes:[{sceneId:'S03',characters:['C01'],flow:[action(2,'程岚核对'),action(2,'她将巡检本')],notes:[{kind:'restriction',text:text(2,background,'背景说明：'),sourceRefs:refs('D02',background)}]}]}]};
}
export function outlineFor(script,scriptPath,outlinePath) {
  const s=script.episodes,ref=(ep,sc,b)=>structuredClone(s[ep-1].scenes[sc-1].flow[b-1].sourceRefs);
  return {schemaVersion:4,source:script.source,provenance:relocate(script,scriptPath,outlinePath).provenance,
    story:{summary:'程岚复核水位但拒绝未经核实的签名；完成检查不等于原谅齐叔。',sourceRefs:[...ref(1,1,2),...ref(2,1,1)]},
    characters:[{id:'C01',name:'程岚',tier:'lead',role:'检查闸门并复核水位',sourceRefs:ref(1,1,1)},
      {id:'C02',name:'齐叔',tier:'support',role:'在门外等待的无台词人物',presence:'visible',sourceRefs:ref(1,1,1)}],
    scenes:[{id:'S01',name:'值班室',primary:true,sourceRefs:ref(1,1,1)},
      {id:'S02',name:'廊道',primary:false,sourceRefs:ref(1,2,1)},
      {id:'S03',name:'堤岸',primary:false,sourceRefs:refs('D02',2)}],props:[],
    beats:[{id:'B01',episode:1,setup:'程岚检查闸门，齐叔在门外等待',outcome:'程岚只答应复核，按住值班表而不签名',sourceRefs:[...ref(1,1,1),...ref(1,1,2),...ref(1,1,3)]},
      {id:'B02',episode:1,setup:'程岚再次想起同一句话',outcome:'她再次独白，将没有签名的值班表放回架上',sourceRefs:[...ref(1,3,1),...ref(1,3,2)]},
      {id:'B03',episode:2,setup:'程岚核对实际水位',outcome:'记录在自己的巡检本，继续检查',sourceRefs:[...ref(2,1,1),...ref(2,1,2)]}],
    episodes:s.map(ep=>({ep:ep.ep,synopsis:ep.ep===1?'程岚拒绝签名，齐叔在廊道等待。':'程岚复核水位并记录，继续检查。',
      characterIds:ep.ep===1?['C01','C02']:['C01'],sceneIds:ep.ep===1?['S01','S02']:['S03'],
      sourceRefs:refs(`D0${ep.ep}`,1,script.provenance.documents[ep.ep-1].lineCount)}))};
}
export function planShots(seed,script) {
  // Fixture-specific production choices, not source timing or a generic timeline framework.
  // Initial inspection and first inner voice share a cut; long notes create no shots.
  seed.promptLang='zh';seed.video={model:'MiniMax H3',resolution:'768p'};
  for(const ep of seed.episodes){
    delete ep.seedScenes;ep.segments=[];
    const source=script.episodes.find(e=>e.ep===ep.ep);
    source.scenes.forEach((sc,si)=>{
      const ranges=ep.ep===1&&si===0?[[1,2],[3,3]]:sc.flow.map((_,i)=>[i+1,i+1]);
      ranges.forEach(([a,b])=>{
        const continuation=ep.ep===1&&((si===0&&a===3)||(si===1&&a<=2));
        const audioRefs=continuation?[[1,2]]:undefined;
        const body=sc.flow.slice(a-1,b).map(beat=>beat.line
          ? `C01 程岚的主观内心独白（inner），仅观众听见，C02 齐叔及场内人物均听不见，不张口说话：“${beat.line}”`
          : beat.sound?`画外现场声音，C02 齐叔能够听见：${beat.sound}`
          : beat.subtitle?`画面字幕，不朗读：${beat.subtitle}`:beat.action).join('');
        const notes=(sc.notes??[]).map(n=>n.kind==='continuity' && !continuation
          ? '当前镜头不延续此前的内心独白；该次声音已在前段结束，不重播。场次连续性依据保留在派发材料中。'
          : `不发声的${n.kind==='continuity'?'连续性说明':'表演限制'}：${n.text}`).join('\n');
        ep.segments.push({id:`E0${ep.ep}-${String(ep.segments.length+1).padStart(2,'0')}`,sceneIndex:si+1,images:[],
          cuts:[{beats:[a,b],seconds:ep.ep===1&&si===2&&a===1?12:6,size:'medium',camera:'Static Shot',characters:sc.characters,...(audioRefs?{audioRefs}:{})}],
          prompt:`镜头描述：\n[镜头 1] 中景，固定镜头。${body}${continuation?'C01 程岚此前的主观内心独白继续，同一次播放，不重新开始；仅观众听见，C02 齐叔及场内人物均听不见。':''}\n${notes}\n环境声与配乐：保留现场声，不添加配乐。`});
      });
    });
  }
  return seed;
}
