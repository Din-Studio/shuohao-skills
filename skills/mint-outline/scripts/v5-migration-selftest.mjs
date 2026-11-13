#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {migrationDraftV5,migrateFileV5,inspectMigrationConsumers} from './lib/migration-v5.mjs';
import {validateOutline} from './lib/outline-core.mjs';
import {sourceDocument,verifySources} from './lib/source.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),cli=join(root,'scripts/mint-outline.mjs');
const fixture=JSON.parse(fs.readFileSync(join(root,'scripts/fixtures/outline-v4.json'),'utf8'));
const tmp=fs.mkdtempSync(join(tmpdir(),'outline-v5-migration-'));let count=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++;},ok=(v,m)=>{assert.ok(v,m);count++;},throws=(f,m)=>{assert.throws(f,m);count++;},clone=x=>structuredClone(x??fixture),json=(p,d)=>fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:20000,maxBuffer:24*1024*1024});
const pointer=(x,p)=>p.split('/').slice(1).reduce((v,k)=>v[k.replace(/~1/g,'/').replace(/~0/g,'~')],x);
try {
 const old=clone(),refs=clone(old.characters[0].sourceRefs);
 old.characters[0].aliases=[{name:'老许',sourceRefs:refs}];
 old.characters[0].notes=[{kind:'continuity',text:'人物说法不能替代独立证据。',characterIds:['C01','C03'],sceneIds:['S01'],propIds:['P01'],speakerId:'C01',epistemic:'claim',episode:4,sourceRefs:refs}];
 old.notes=clone(old.characters[0].notes);old.story.notes=clone(old.notes);old.beats[0].notes=clone(old.notes);
 old.beats[0].notes[0].episode=1;
 old.custom={'a/b~c':{retained:'不能丢失的额外字段',ids:['C01','S01','P01']},empty:[]};
 const before=JSON.stringify(old),result=migrationDraftV5(old),{document,material}=result;
 eq(JSON.stringify(old),before);eq(document.schemaVersion,5);eq(validateOutline(document),[]);eq(material.original,old);eq(result.status,'pending-review');
 for(const k of ['characters','scenes','props'])ok(!(k in document));ok(!('thresholds' in document.params));ok(!('focusCharacterIds' in document.story));
 eq(document.beats.map(b=>[b.id,b.episode,b.setup,b.outcome,b.resolves]),old.beats.map(b=>[b.id,b.episode,b.setup,b.outcome,b.resolves]));
 for(let i=0;i<old.episodes.length;i++)for(const k of ['ep','synopsis','opening','ending','sourceRefs'])eq(document.episodes[i][k],old.episodes[i][k]);
 eq(document.notes[0].text,old.notes[0].text);eq(document.notes[0].epistemic,'claim');ok(!('speakerId' in document.notes[0]));ok(!('speaker' in document.notes[0]),'do not turn an old ID/name into a source-confirmed speaker');
 const fields=material.fields,seen=new Set();
 for(const f of fields){ok(!seen.has(f.originalPath));seen.add(f.originalPath);eq(pointer(old,f.originalPath),f.originalValue);ok(f.status.includes('pending'));if(f.destinationPath)eq(pointer(document,f.destinationPath),f.destinationValue);}
 function verifyEveryField(v,p=''){for(const [k,x]of Object.entries(v??{})){const path=p+'/'+k.replace(/~/g,'~0').replace(/\//g,'~1');ok(seen.has(path),'traceable '+path);if(x&&typeof x==='object')verifyEveryField(x,path);}}verifyEveryField(old);
 for(const path of ['/characters/0/id','/characters/0/aliases/0/name','/characters/0/aliases/0/sourceRefs/0/startLine','/characters/0/notes/0/speakerId','/scenes/0/primary','/props/0/beatIds/0','/story/focusCharacterIds/0','/episodes/0/characterIds/0','/episodes/0/sceneIds/0','/episodes/0/propIds/0','/notes/0/speakerId','/params/thresholds/maxLeads','/provenance/documents/0/sha256','/custom/a~1b~0c/retained'])ok(fields.some(f=>f.originalPath===path));
 const cross=fields.find(f=>f.originalPath==='/characters/0/notes/0');ok(material.stageMaterials.characters.fieldIds.includes(cross.fieldId));ok(material.stageMaterials.art.fieldIds.includes(cross.fieldId),'cross-asset relationships available to both owning stages');
 ok(fields.some(f=>f.originalPath==='/custom/a~1b~0c/retained'&&f.targetStage==='unassigned'));
 eq(material.identityMapping,'not-verified');eq(material.contentReview,'not-performed');eq(material.sourceVerification.status,'skipped');
 for(const [key,value]of Object.entries(old.params.thresholds)){const b=material.budgets.find(b=>b.originalPath.endsWith('/'+key));eq(b.originalValue,value);eq(b.constraint,'explicit-user-budget');eq(b.severity,'blocking-at-owning-stage');eq(b.targetStage,key==='maxProps'||key==='maxPrimaryScenes'?'art':'characters');}
 const unusual=clone(old);unusual.params.thresholds.maxCrowds={limit:2};unusual.params.thresholds.maxLeads=0;
 const unusualResult=migrationDraftV5(unusual);eq(unusualResult.material.budgets.find(b=>b.originalPath.endsWith('maxCrowds')).targetStage,'unassigned');eq(unusualResult.material.budgets.find(b=>b.originalPath.endsWith('maxLeads')).originalValue,0);
 unusual.params.thresholds=['ambiguous budget'];eq(migrationDraftV5(unusual).material.unclassifiedBudget.originalValue,['ambiguous budget']);
 for(const v of [null,[],{}, {...old,schemaVersion:3},{...old,schemaVersion:5}])throws(()=>migrationDraftV5(v));
 for(const mutate of [d=>d.characters[0].id='bad',d=>d.characters[0].aliases[0].sourceRefs=[],d=>d.episodes[0].characterIds=['C99'],d=>d.props[0].beatIds=['B99'],d=>d.notes[0].speakerId='C99',d=>d.beats[2].resolves=['Q99']]){const d=clone(old);mutate(d);throws(()=>migrationDraftV5(d));}
 const project=join(tmp,'project');for(const n of ['outline','script','creation','art/images','reviews','prompts','work-orders'])fs.mkdirSync(join(project,n),{recursive:true});
 const input=join(project,'outline/old.json'),source=join(project,'source.txt'),output=join(project,'outline/new.json');
 fs.copyFileSync(join(root,'examples/旧站时刻-script.txt'),source);const fileOld=clone(old);fileOld.provenance.documents=[sourceDocument(source,{artifactPath:input})];json(input,fileOld);
 json(join(project,'script/a.json'),{schemaVersion:4,speaker:'C01',sceneId:'S01',propId:'P01'});json(join(project,'creation/a.json'),{schemaVersion:3,images:['art/images/C01.png'],audit:'old approval'});
 fs.writeFileSync(join(project,'art/images/C01.png'),Buffer.from([0x89,0x50,0x4e,0x47]));
 fs.writeFileSync(join(project,'reviews/a.md'),'旧工作单：C01 与 P01，位置 S01，尚需重新审核。');json(join(project,'prompts/old.json'),{C01:'既有角色提示词'});json(join(project,'work-orders/a.json'),{asset:'P01'});
 json(join(project,'script/not-authority.migration.json'),{original:fileOld});
 const bytes=fs.readFileSync(input),preview=migrateFileV5(input);
 eq(preview.written,false);eq(preview.material.sourceVerification.status,'pass');eq(preview.material.consumerInspection.status,'pending-review');
 const inventory=preview.material.consumerInspection.files;
 ok(inventory.some(f=>f.path==='art/images/C01.png'&&f.pathAssetIds.includes('C01')));
 ok(inventory.some(f=>f.path==='script/a.json'&&f.matches.some(m=>m.fieldPath==='/speaker'&&m.value==='C01')));
 ok(inventory.some(f=>f.path==='prompts/old.json'&&f.matches.some(m=>m.key==='C01')));
 ok(inventory.some(f=>f.path==='reviews/a.md'&&f.matches[0].line===1));
 eq(inspectMigrationConsumers().status,'skipped');eq(inspectMigrationConsumers(join(tmp,'missing')).status,'fail');
 const broken=join(project,'creation/broken.json');fs.writeFileSync(broken,'{broken');eq(migrateFileV5(input).material.consumerInspection.status,'fail');fs.rmSync(broken);
 const link=join(project,'reviews/link.json');fs.symlinkSync('missing',link);ok(migrateFileV5(input).material.consumerInspection.files.some(f=>f.path==='reviews/link.json'&&f.reason==='symlink-not-followed'));fs.rmSync(link);
 eq(run('migrate-v5',input,'--out',output).status,1);ok(!fs.existsSync(output));
 let cliResult=run('migrate-v5',input,'--out',output,'--project',project,'--confirm');eq(cliResult.status,0,cliResult.stderr);const written=JSON.parse(cliResult.stdout);
 eq(written.migrationFile,join(project,'outline/new.migration.json'));eq(written.status,'pending-review');eq(fs.readFileSync(input),bytes);eq(fs.readFileSync(written.backup),bytes);
 eq(JSON.parse(fs.readFileSync(written.migrationFile)).original,fileOld);eq(verifySources(JSON.parse(fs.readFileSync(output)),{artifactPath:output}).status,'pass');
 eq(run('validate',written.migrationFile).status,1,'migration material is not a formal outline');eq(run('validate',input).status,1,'no implicit v4 read');
 eq(run('migrate-v5',input,'--out',output,'--confirm').status,1);eq(run('migrate-v5',input,'--out',input,'--confirm').status,1);
 const other=join(project,'drafts');fs.mkdirSync(other);const rebased=join(other,'outline.json'),relocated=migrateFileV5(input,rebased,{confirm:true});
 eq(verifySources(relocated.document,{artifactPath:rebased}).status,'pass');eq(relocated.material.pathBases.originalArtifact,input);eq(relocated.material.pathRewrites[0].originalValue,'../source.txt');
 const srcBefore=fs.readFileSync(source);fs.writeFileSync(source,'原件改版');eq(migrateFileV5(input).material.sourceVerification.status,'fail');fs.rmSync(source);eq(migrateFileV5(input).material.sourceVerification.status,'fail');fs.writeFileSync(source,srcBefore);
 for(const args of [['--project'],['--out'],['--unknown'],['extra'],['--out',join(tmp,'a.json'),'--out',join(tmp,'b.json')]])eq(run('migrate-v5',input,...args).status,1);
 const inputLink=join(tmp,'old-link.json');fs.symlinkSync(input,inputLink);throws(()=>migrateFileV5(inputLink));
 const invalid=join(tmp,'invalid.json');fs.writeFileSync(invalid,Buffer.from([0xff]));eq(run('migrate-v5',invalid).status,1);
 const collide=join(tmp,'collide.json');fs.symlinkSync('missing',join(tmp,'collide.migration.json'));throws(()=>migrateFileV5(input,collide,{confirm:true}));ok(!fs.existsSync(collide));
 const write=fs.writeFileSync,copy=fs.copyFileSync;
 const failed=join(tmp,'failed.json');
 try{fs.writeFileSync=function(p,...args){if(p===failed)throw Error('injected write failure');return write.call(this,p,...args);};syncBuiltinESMExports();throws(()=>migrateFileV5(input,failed,{confirm:true}));}finally{fs.writeFileSync=write;syncBuiltinESMExports();}
 for(const p of [failed,failed+'.v4-backup',join(tmp,'failed.migration.json')])ok(!fs.existsSync(p));eq(fs.readFileSync(input),bytes);
 const raced=join(tmp,'raced.json');
 try{fs.writeFileSync=function(p,...args){if(p===raced)write.call(this,p,'concurrent author');return write.call(this,p,...args);};syncBuiltinESMExports();throws(()=>migrateFileV5(input,raced,{confirm:true}));}finally{fs.writeFileSync=write;syncBuiltinESMExports();}
 eq(fs.readFileSync(raced,'utf8'),'concurrent author');ok(!fs.existsSync(raced+'.v4-backup'));ok(!fs.existsSync(join(tmp,'raced.migration.json')));
 const changed=join(tmp,'changed.json');
 try{fs.copyFileSync=function(from,to,...args){if(to===changed+'.v4-backup')fs.writeFileSync(from,'concurrent source');return copy.call(this,from,to,...args);};syncBuiltinESMExports();throws(()=>migrateFileV5(input,changed,{confirm:true}));}finally{fs.copyFileSync=copy;syncBuiltinESMExports();}
 eq(fs.readFileSync(input,'utf8'),'concurrent source');for(const p of [changed,changed+'.v4-backup',join(tmp,'changed.migration.json')])ok(!fs.existsSync(p));
 console.log(`✓ ${count} assertions passed: v5 migration, every-field traceability, all asset relations/budgets, consumer evidence, source rebasing, collisions and races.`);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
