// 根目录自有故事。先确定交班事实，再整理正文和制作计划。
import {promptFixture} from '../../../skills/mint-creation/scripts/test-prompt.mjs';
export const title='井口双签';
export const scope='第一集交班';
export const screenplay=[
  '《井口双签》第一集',
  '林宁（巡检员，工号甲）与同名的林宁（交班员，工号乙）在井口值班亭交班；二人不是同一身份。',
  '值班亭内，巡检员把水位记录板放在两人之间。',
  '巡检员林宁：我只签实际读数。',
  '交班员林宁：我另签接班时间。',
  '两人在水位记录板上分别签署自己的工号，交班完成。'
].join('\n')+'\n';
export const ref=(startLine,endLine=startLine)=>[{documentId:'D01',startLine,endLine}];
export function outline(provenance) {
  return {schemaVersion:5,source:title,params:{},provenance,story:{summary:'同名的两名值班员分别签署读数和接班时间，不替对方担保。',endingBeatId:'B01',sourceRefs:ref(2,6)},
    beats:[{id:'B01',episode:1,setup:'两名同名值班员需要交班',outcome:'二人按各自职责分别签名，交班完成',sourceRefs:ref(3,6)}],
    episodes:[{ep:1,synopsis:'二人在水位记录板上完成独立签名。',opening:'巡检员把记录板放在两人之间。',ending:{mode:'closure',event:'各自工号签署完成，交班结束。'},sourceRefs:ref(1,6)}]};
}
export const people=[{id:'C11',name:'林宁',identityKey:'inspector-number-a',speech:'speaking',aliases:[{name:'巡检员',sourceRefs:ref(2,4)}],sourceRefs:ref(2,4)},
  {id:'C12',name:'林宁',identityKey:'handover-number-b',speech:'speaking',aliases:[{name:'交班员',sourceRefs:ref(2,5)}],sourceRefs:ref(2,5)}];
export const scenes=[{id:'S01',name:'井口值班亭',sourceRefs:ref(2,3)}];
export const props=[{id:'P01',name:'水位记录板',sourceRefs:ref(3,6)}];
export const targets={'character:C01':'C11','character:C02':'C12','scene:S91':'S01','prop:P91':'P01'};
export function fillScript(seed) {
  seed.episodes[0]={ep:1,targetSeconds:12,sourceRefs:ref(1,6),beatClaims:[{beatId:'B01',start:[1,1],end:[1,4]}],openingBeat:[1,1],
    scenes:[{sceneId:'S91',characters:['C01','C02'],props:['P91'],sourceRefs:ref(2,6),flow:[
      {action:'值班亭内，巡检员把水位记录板放在两人之间。',sourceRefs:ref(3)},
      {speaker:'C01',line:'我只签实际读数。',sourceRefs:ref(4)},
      {speaker:'C02',line:'我另签接班时间。',sourceRefs:ref(5)},
      {action:'两人在水位记录板上分别签署自己的工号，交班完成。',sourceRefs:ref(6)}]}]};
  return seed;
}
export function fillCreation(seed) {
  seed.promptLang='zh';seed.video={model:'MiniMax H3',resolution:'768p'};
  delete seed.episodes[0].seedScenes;
  seed.episodes[0].segments=[{id:'E01-01',sceneIndex:1,images:[],cuts:[1,2,3,4].map(n=>({beats:[n,n],seconds:3,size:'medium',camera:'Static Shot',characters:['C01','C02'],props:['P91']})),
    prompt:promptFixture('值班亭内，巡检员把水位记录板放在两人之间。C01 林宁（巡检员）说：“我只签实际读数。”C02 林宁（交班员）说：“我另签接班时间。”两人在水位记录板上分别签署自己的工号，交班完成。')}];
  return seed;
}
