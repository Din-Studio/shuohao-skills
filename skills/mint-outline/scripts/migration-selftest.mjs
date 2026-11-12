#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {migrationDraft,migrateFile} from './lib/migration.mjs';
import {validateOutline} from './lib/outline-core.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),cli=join(root,'scripts/mint-outline.mjs');
const legacy=JSON.parse(fs.readFileSync(join(root,'scripts/fixtures/outline-v2.json'),'utf8'));
const sample=JSON.parse(fs.readFileSync(join(root,'examples/旧站时刻-outline.json'),'utf8'));
const tmp=fs.mkdtempSync(join(tmpdir(),'outline-migration-'));let count=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++;},ok=(v,m)=>{assert.ok(v,m);count++;},throws=f=>{assert.throws(f);count++;};
const clone=()=>structuredClone(legacy),json=(p,d)=>fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:20000,maxBuffer:8*1024*1024});
try {
 const before=JSON.stringify(legacy),preview=migrationDraft(legacy),confirmed=migrationDraft(legacy,{confirm:true});
 eq(preview.status,'pending');ok(preview.pending.length>0);eq(confirmed.status,'ready');eq(JSON.stringify(legacy),before);eq(validateOutline(confirmed.document),[]);
 const d=confirmed.document;
 eq(d.episodes.length,legacy.episodes.length);eq(d.params.episodes,legacy.params.episodes);eq(d.params.genre,legacy.params.genre);eq(d.params.thresholds,legacy.params.thresholds);
 for(const key of ['characters','scenes','props','arcs'])eq(d[key],legacy[key],key+' retained');
 eq(d.story.endingBeatId,legacy.story.endingBeatId);
 for(let i=0;i<d.beats.length;i++){
  const a=d.beats[i],b=legacy.beats[i];for(const k of ['id','episode','outcome','resolves','kind','weight','position'])eq(a[k],b[k]);ok(a.setup.includes(b.setup));ok(a.setup.includes(b.type));ok(!('type' in a));
 }
 for(let i=0;i<d.episodes.length;i++){
  const a=d.episodes[i],b=legacy.episodes[i];for(const k of ['ep','opening','ending','characterIds','sceneIds','propIds'])eq(a[k],b[k]);ok(a.synopsis.includes(b.synopsis));ok(a.synopsis.includes(b.stateChange.before));ok(a.synopsis.includes(b.stateChange.after));ok(!('stateChange' in a));
 }
 for(const k of ['rules','defaults','preferences'])ok(!(k in d.params));ok(!('creativeContext' in d));ok(!('drive' in d.story));ok(!('core' in d.adaptation));
 for(const p of legacy.params.preferences)ok(d.creativeBrief.includes(p));ok(!d.creativeBrief.includes('gradual'));ok(preview.pending.some(p=>p.path==='params.rules.endingModes'));ok(preview.pending.some(p=>p.path==='params.defaults'));
 const rich=clone();rich.story.drive={goal:'纠正档案',cost:'承担退休荣誉损失'};rich.adaptation.evidence='原文逐字\n不得改写“标点”';rich.adaptation.keep[0].evidence='原文Ａ\tＢ';rich.creativeBrief='已有实际约束';rich.creativeContext.overridePaths=['params.rules.endingModes'];
 const r=migrationDraft(rich,{confirm:true});ok(r.document.story.throughline.includes('承担退休荣誉损失'));eq(r.document.adaptation.evidence,rich.adaptation.evidence);eq(r.document.adaptation.keep[0].evidence,rich.adaptation.keep[0].evidence);ok(r.document.creativeBrief.includes('已有实际约束'));ok(r.pending.some(p=>p.path.startsWith('manual override:')));
 // Manually reviewed own sample keeps exact story prose instead of duplicating already-expressed semantics.
 eq(sample.episodes.length,legacy.episodes.length);eq(sample.story,legacy.story);
 for(let i=0;i<sample.beats.length;i++){const expected=structuredClone(legacy.beats[i]);delete expected.type;eq(sample.beats[i],expected);}
 for(let i=0;i<sample.episodes.length;i++){const expected=structuredClone(legacy.episodes[i]);delete expected.stateChange;eq(sample.episodes[i],expected);}
 for(const key of ['scenes','props','arcs'])eq(sample[key],legacy[key]);eq(sample.characters.map(c=>c.id),legacy.characters.map(c=>c.id));
 const input=join(tmp,'old.json'),output=join(tmp,'new.json');json(input,legacy);const bytes=fs.readFileSync(input);
 eq(run('migrate-v3',input).status,0);eq(fs.readFileSync(input),bytes);eq(fs.readdirSync(tmp),['old.json']);
 let result=run('migrate-v3',input,'--out',output);eq(result.status,1,result.stderr);eq(JSON.parse(result.stdout).status,'pending');ok(!fs.existsSync(output));
 result=run('migrate-v3',input,'--out',output,'--confirm');eq(result.status,0,result.stderr);const report=JSON.parse(result.stdout);ok(report.written);eq(fs.readFileSync(input),bytes);eq(fs.readFileSync(report.backup),bytes);eq(JSON.parse(fs.readFileSync(output)),d);ok(fs.existsSync(report.reviewFile));
 const restored=join(tmp,'restored.json');fs.copyFileSync(report.backup,restored);eq(fs.readFileSync(restored),bytes);
 eq(run('migrate-v3',input,'--out',output,'--confirm').status,1);eq(run('migrate-v3',input,'--out',output,'--out',join(tmp,'other.json')).status,1);eq(run('migrate-v3',input,'--out',input,'--confirm').status,1);eq(run('migrate-v3',input,'--out').status,1);eq(run('migrate-v3',input,'--unknown').status,1);eq(run('migrate-v3',input,'extra').status,1);
 const invalidUtf8=join(tmp,'invalid-utf8.json');
 const encoded=Buffer.from(JSON.stringify(legacy));const at=encoded.indexOf(Buffer.from(legacy.source));
 fs.writeFileSync(invalidUtf8,Buffer.concat([encoded.subarray(0,at),Buffer.from([0xff]),encoded.subarray(at+Buffer.byteLength(legacy.source))]));
 eq(run('migrate-v3',invalidUtf8,'--out',join(tmp,'utf8-out.json'),'--confirm').status,1);ok(!fs.existsSync(join(tmp,'utf8-out.json')));
 const link=join(tmp,'link.json');fs.symlinkSync(input,link);eq(run('migrate-v3',link,'--out',join(tmp,'link-out.json'),'--confirm').status,1);
 const dangling=join(tmp,'dangling.json');fs.symlinkSync('missing',dangling);throws(()=>migrateFile(input,dangling,{confirm:true}));
 const collision=join(tmp,'collision.json');fs.writeFileSync(collision+'.review','retain');throws(()=>migrateFile(input,collision,{confirm:true}));ok(!fs.existsSync(collision));eq(fs.readFileSync(collision+'.review','utf8'),'retain');
 for(const fn of [
  x=>x.schemaVersion=3,x=>delete x.schemaVersion,x=>x.params.episodes='6',x=>x.params.minutesPerEpisode=0,x=>x.params.preferences=[''],x=>x.story.drive={goal:42},x=>x.story.premise='',x=>x.story.throughline='',x=>delete x.story.audiencePromise,x=>x.adaptation.core='',x=>x.adaptation.keep[0].evidence='',x=>x.characters[0].from=[],x=>x.characters[0].arc='',x=>x.beats[0].type=null,x=>x.beats[0].setup='',x=>x.beats[0].position='invalid',x=>x.beats[0].kind='invalid',x=>x.beats[1].id='B01',x=>x.beats[0].episode=999,x=>x.episodes[0].stateChange={before:'',after:'x'},x=>x.episodes[0].synopsis='',x=>x.episodes[0].sceneIds=['S99'],x=>delete x.beats[2].resolves,x=>x.beats[2].resolves=['Q99'],x=>delete x.episodes[0].ending.question,x=>x.params.rules={},x=>x.params.rules.stateProgress={level:'error',other:true},x=>x.params.rules.endingModes.final=['invalid'],x=>x.params.defaults.questionResolveWithin=0,x=>x.creativeContext.selection.genre.version='latest',x=>x.creativeContext.references[0].sha256='bad',x=>x.creativeContext.overridePaths=[1]
 ]){const x=clone();fn(x);throws(()=>migrationDraft(x,{confirm:true}));json(input,x);eq(run('migrate-v3',input,'--out',join(tmp,'invalid.json'),'--confirm').status,1);ok(!fs.existsSync(join(tmp,'invalid.json')));}
 for(const value of [null,[],42])throws(()=>migrationDraft(value));fs.writeFileSync(input,'{broken');eq(run('migrate-v3',input).status,1);
 // Failed writes preserve original, do not replace existing files and clean only files created here.
 json(input,legacy);const safe=fs.readFileSync(input),write=fs.writeFileSync;
 const failed=join(tmp,'failure.json');
 try{fs.writeFileSync=function(p,...args){if(p===failed)throw Error('injected write failure');return write.call(this,p,...args);};syncBuiltinESMExports();throws(()=>migrateFile(input,failed,{confirm:true}));}
 finally{fs.writeFileSync=write;syncBuiltinESMExports();}
 eq(fs.readFileSync(input),safe);for(const p of [failed,failed+'.v2-backup',failed+'.review'])ok(!fs.existsSync(p));
 // Concurrent source change at backup time is detected, not silently migrated.
 const changed=join(tmp,'changed.json'),copy=fs.copyFileSync;
 try{fs.copyFileSync=function(from,to,...args){if(to===changed+'.v2-backup')fs.writeFileSync(from,'concurrent source');return copy.call(this,from,to,...args);};syncBuiltinESMExports();throws(()=>migrateFile(input,changed,{confirm:true}));}
 finally{fs.copyFileSync=copy;syncBuiltinESMExports();}
 eq(fs.readFileSync(input,'utf8'),'concurrent source');for(const p of [changed,changed+'.v2-backup',changed+'.review'])ok(!fs.existsSync(p));json(input,legacy);
 // A destination created after preflight is never overwritten or removed during rollback.
 const raced=join(tmp,'race.json');
 try{fs.writeFileSync=function(p,...args){if(p===raced)write.call(this,raced,'concurrent author');return write.call(this,p,...args);};syncBuiltinESMExports();throws(()=>migrateFile(input,raced,{confirm:true}));}
 finally{fs.writeFileSync=write;syncBuiltinESMExports();}
 eq(fs.readFileSync(raced,'utf8'),'concurrent author');eq(fs.readFileSync(input),safe);ok(!fs.existsSync(raced+'.v2-backup'));ok(!fs.existsSync(raced+'.review'));
 console.log(`✓ ${count} assertions passed: explicit migration preview, semantic preservation, malformed inputs, backups and safe writes.`);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
