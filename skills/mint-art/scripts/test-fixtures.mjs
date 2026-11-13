// Own test helpers; no sibling fixture or script dependency.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {digest, identityDigest, characterIdentityDigest} from './lib/stage.mjs';
export const originalPath=fileURLToPath(new URL('../examples/桥下旗-来源.txt',import.meta.url));
export const originalDoc=JSON.parse(readFileSync(new URL('../examples/桥下旗-outline-v4.json',import.meta.url),'utf8'));
export function confirm(doc) {
  doc.status='ready';
  for(const a of [...doc.scenes,...(doc.props??[])])a.identityReview={status:'confirmed',basis:'本 skill 自有样例的人工语义登记；不等于媒体审核',inputDigest:identityDigest(doc,a)};
  return doc;
}
export function formalDesign(doc) {
  const copy=structuredClone(doc);
  Object.assign(copy,{schemaVersion:1,kind:'mint-art',mode:'design',status:'ready',registry:{entries:[],changes:[]},budgets:{scenes:{max:10,kind:'explicit'}}});
  for(const a of [...copy.scenes,...(copy.props??[])]){
    a.identityKey=`rain:${a.id}`;a.decision='故事先行确认的独立美术资产';a.designStatus='ready';delete a.carriedBy;
    copy.registry.entries.push({id:a.id,key:a.identityKey,status:'active'});
  }
  return confirm(copy);
}
export function makeCast(names=[], title='雨棚留言') {
  const provenance=structuredClone(originalDoc.provenance);provenance.documents[0].path=originalPath;
  const sourceRefs=structuredClone(originalDoc.characters[0].sourceRefs);
  const characters=names.map((name,i)=>({id:`C${String(i+1).padStart(2,'0')}`,identityKey:`test:${i}`,name,aliases:[{name:'Detective Alias',sourceRefs}],entityType:'human',presence:['visible'],speech:'unknown',unknowns:[],sourceRefs}));
  return {schemaVersion:1,kind:'mint-characters',source:title,lang:'zh',status:'identified',provenance,characters,review:{status:'confirmed',by:'test fixture author',note:'自有测试材料的明确身份确认'},budgets:{},lifecycle:{revision:1,previousHash:null,changes:[],recheckIds:[],registry:characters.map(c=>({id:c.id,identityKey:c.identityKey,state:'active',allocatedRevision:1,fingerprint:characterIdentityDigest(c,provenance)}))}};
}
export const snapshotHash=digest;
