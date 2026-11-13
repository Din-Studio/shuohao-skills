// Root regression helpers. Inputs are root-owned screenplay facts, never outline assets.
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const assetDigest=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
export async function identifyCast(root,seed,people) {
  const {reconcile,reviewHash}=await import(pathToFileURL(join(root,'skills/mint-characters/scripts/lib/identity.mjs')));
  seed.characters=people.map((p,i)=>({id:`C${String(i+1).padStart(2,'0')}`,identityKey:`source-person-${i+1}`,aliases:[],entityType:'human',presence:['visible'],speech:'silent',unknowns:[],...p}));
  const cast=reconcile(seed);
  cast.status='identified';cast.review={status:'confirmed',inputHash:reviewHash(cast),by:'root-fixture-author',note:'逐项核对根测试原剧本中人物及来源；此确认仅适用于原创夹具。'};
  return cast;
}
export async function identifyArt(root,seed,scenes,props=[]) {
  const {registerAsset,identityDigest}=await import(pathToFileURL(join(root,'skills/mint-art/scripts/lib/stage.mjs')));
  for(const [kind,items] of [['scene',scenes],['prop',props]])for(const [i,item] of items.entries()) {
    const a=registerAsset(seed,kind,`source-${kind}-${i+1}`,item.name);
    Object.assign(a,{decision:'原剧本明确出现；人工登记本阶段资产身份。',...item});
    a.identityReview={status:'confirmed',basis:'按原文坐标核对身份，不以大纲或名称自动归并。',inputDigest:identityDigest(seed,a)};
  }
  seed.status='ready';return seed;
}
export function mapAssets(script,cast,art,targets={}) {
  const used=new Map(),add=(kind,id)=>{if(id)used.set(`${kind}:${id}`,{kind,localId:id});};
  for(const ep of script.episodes)for(const sc of ep.scenes){
    add('scene',sc.sceneId);for(const id of sc.characters??[])add('character',id);for(const id of sc.props??[])add('prop',id);
    for(const b of sc.flow){add('character',b.speaker);for(const id of b.audio?.audibleTo??[])add('character',id);}
  }
  script.assetMappings=[...used.values()].map(({kind,localId})=>{
    const authority=kind==='character'?cast:art,list={character:'characters',scene:'scenes',prop:'props'}[kind];
    const a=authority[list].find(a=>a.id===(targets[`${kind}:${localId}`]??localId));if(!a)throw Error(`Fixture lacks explicit ${kind}:${localId}`);
    const sourceRefs=structuredClone(a.sourceRefs),ids=new Set(sourceRefs.map(r=>r.documentId));
    return {kind,localId,assetId:a.id,status:'confirmed',sourceRefs,basis:'根测试作者逐项回查原剧本；局部引用和阶段身份显式核对。',assetDigest:assetDigest(a),documentVersions:authority.provenance.documents.filter(d=>ids.has(d.id)).map(({id,sha256,lineCount})=>({id,sha256,lineCount}))};
  });return script;
}
