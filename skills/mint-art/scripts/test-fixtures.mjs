// Own test helpers; no sibling fixture or script dependency.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {identityDigest, characterIdentityDigest} from './lib/stage.mjs';
export const originalPath=fileURLToPath(new URL('../examples/桥下旗-来源.txt',import.meta.url));
// Story-only outline v5 for the same original; never an asset authority.
export const storyDoc=JSON.parse(readFileSync(new URL('../examples/桥下旗-outline.json',import.meta.url),'utf8'));
export function confirm(doc) {
  doc.status='ready';
  for(const a of [...doc.scenes,...(doc.props??[])])a.identityReview={status:'confirmed',basis:'本 skill 自有样例的人工语义登记；不等于媒体审核',inputDigest:identityDigest(doc,a)};
  return doc;
}
export function makeCast(names=[], title='雨棚留言') {
  const provenance=structuredClone(storyDoc.provenance);provenance.documents[0].path=originalPath;
  const sourceRefs=[{documentId:'D01',startLine:1,endLine:4}];
  const characters=names.map((name,i)=>({id:`C${String(i+1).padStart(2,'0')}`,identityKey:`test:${i}`,name,aliases:[{name:'Detective Alias',sourceRefs}],entityType:'human',presence:['visible'],speech:'unknown',unknowns:[],sourceRefs}));
  return {schemaVersion:1,kind:'mint-characters',source:title,lang:'zh',status:'identified',provenance,characters,review:{status:'confirmed',by:'test fixture author',note:'自有测试材料的明确身份确认'},budgets:{},lifecycle:{revision:1,previousHash:null,changes:[],recheckIds:[],registry:characters.map(c=>({id:c.id,identityKey:c.identityKey,state:'active',allocatedRevision:1,fingerprint:characterIdentityDigest(c,provenance)}))}};
}
