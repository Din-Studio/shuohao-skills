#!/usr/bin/env node
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync,realpathSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {initialize,begin,complete,reopen,refreshSources,check,readState,run,STAGES} from './pipeline.mjs';
const dir=realpathSync(mkdtempSync(join(tmpdir(),'mint-flow-'))),state=join(dir,'pipeline.json'),source=join(dir,'original.txt'),handoff=join(dir,'handoff.json');
const hash=b=>createHash('sha256').update(b).digest('hex');
let n=0;const ok=(fn)=>{fn();n++;};
try {
 writeFileSync(source,'值班员把记录交给接班员。\n');
 ok(()=>assert.throws(()=>initialize(state,{source:'记录',scope:'第一集',sources:[]}),/source/));
 initialize(state,{source:'记录',scope:'第一集',sources:[source]});
 ok(()=>assert.throws(()=>initialize(state,{source:'记录',scope:'第一集',sources:[source]}),/已存在/));
 ok(()=>assert.throws(()=>begin(state,'art'),/前序/));
 ok(()=>assert.throws(()=>run(state,'outline',['--help']),/begin/));
 ok(()=>assert.equal(check(state).workflow,'incomplete'));
 const artifacts={};
 for(const stage of STAGES) {
   const artifact=join(dir,`${stage}.json`);artifacts[stage]=artifact;
   const doc={schemaVersion:stage==='outline'?5:stage==='creation'?3:4,...(stage==='characters'?{kind:'mint-characters',status:'identified',review:{status:'confirmed'}}:stage==='art'?{kind:'mint-art',status:'ready'}:{}),source:'记录',provenance:{kind:'script',scope:'partial',documents:[{id:'D01',path:relative(dirname(artifact),source),sha256:hash(readFileSync(source)),lineCount:1}],coverage:[{documentId:'D01',startLine:1,endLine:1}]}};
   writeFileSync(artifact,JSON.stringify(doc));
   writeFileSync(handoff,JSON.stringify({confirmed:true,scope:'第一集',unresolved:[]}));
   ok(()=>assert.throws(()=>complete(state,stage,{artifact,handoff,validator:()=>{}}),/begin/));
   begin(state,stage);
   ok(()=>assert.throws(()=>begin(state,stage),/正在进行/));
   ok(()=>assert.throws(()=>complete(state,stage,{artifact,handoff,validator:()=>{throw Error('invalid artifact');}}),/invalid artifact/));
   ok(()=>assert.equal(readState(state).stages[stage].status,'active'));
   // The production path must invoke the real validator and reject this deliberately
   // incomplete fixture. Test-only injected validators below isolate state behavior.
   ok(()=>assert.throws(()=>complete(state,stage,{artifact,handoff}),/校验或命令失败/));
   const bad=JSON.parse(readFileSync(handoff));bad.unresolved=[{text:'身份冲突',blocking:true}];writeFileSync(handoff,JSON.stringify(bad));
   ok(()=>assert.throws(()=>complete(state,stage,{artifact,handoff,validator:()=>{}}),/阻断/));
   writeFileSync(handoff,JSON.stringify({confirmed:true,scope:'第二集',unresolved:[]}));
   ok(()=>assert.throws(()=>complete(state,stage,{artifact,handoff,validator:()=>{}}),/scope/));
   const stageHandoff=join(dir,stage+'-handoff.json');writeFileSync(stageHandoff,JSON.stringify({confirmed:true,scope:'第一集',unresolved:[]}));
   const baseline=join(dir,stage+'-previous.json');writeFileSync(baseline,'{}');
   const incremental=['characters','art'].includes(stage);
   complete(state,stage,{artifact,handoff:stageHandoff,...(incremental?{previous:baseline}:{}),validator:(s,p,k,args)=>{
     assert.equal(k,stage);assert.equal(args[0],'validate');assert.ok(args.includes(artifact));
     const flags={outline:'--outline',characters:'--cast',art:'--art',script:'--script'};
     for(const previous of STAGES.slice(0,STAGES.indexOf(stage))) {
       assert.equal(args[args.indexOf(flags[previous])+1],artifacts[previous],`${stage} must receive completed ${previous}`);
     }
     assert.equal(args.includes('--verify-sources'),stage!=='creation');
     assert.equal(args.includes('--previous'),incremental);
     if(incremental)assert.equal(args[args.indexOf('--previous')+1],baseline);
   }});
   ok(()=>assert.equal(readState(state).stages[stage].status,'complete'));
 }
 const alias=join(dir,'alias.json');symlinkSync(state,alias);
 ok(()=>assert.throws(()=>readState(alias),/符号链接/));
 ok(()=>assert.throws(()=>reopen(alias,'outline'),/符号链接/));
 ok(()=>assert.equal(check(state).workflow,'complete'));
 const baseline=join(dir,'characters-previous.json');writeFileSync(baseline,'changed');
 ok(()=>assert.throws(()=>check(state),/previous 已改变/));writeFileSync(baseline,'{}');
 ok(()=>assert.equal(check(state).contentReview,'not-performed'));
 const before=readFileSync(artifacts.characters);writeFileSync(artifacts.characters,'{}');
 ok(()=>assert.throws(()=>check(state),/已改变/));writeFileSync(artifacts.characters,before);
 writeFileSync(source,'值班员销毁记录。\n');ok(()=>assert.throws(()=>check(state),/改版/));writeFileSync(source,'值班员把记录交给接班员。\n');
 reopen(state,'characters');ok(()=>assert.equal(readState(state).stages.outline.status,'complete'));ok(()=>assert.ok(STAGES.slice(1).every(k=>readState(state).stages[k].status==='pending')));
 begin(state,'characters');ok(()=>assert.throws(()=>begin(state,'art'),/前序/));
 writeFileSync(state+'.lock','busy');ok(()=>assert.throws(()=>reopen(state,'outline'),/并行/));rmSync(state+'.lock');
 ok(()=>assert.equal(existsSync(state+'.tmp'),false));ok(()=>assert.equal(existsSync(state+'.lock'),false));
 ok(()=>assert.ok(!readFileSync(state,'utf8').includes('failureHistory')));
 writeFileSync(source,'值班员重新核对记录。\n');
 ok(()=>assert.throws(()=>refreshSources(state,{sources:[source],basis:'原件改版'}),/confirm/));
 ok(()=>assert.throws(()=>refreshSources(state,{sources:[source],confirm:true}),/basis/));
 refreshSources(state,{sources:[source],basis:'原件改版，重新阅读第一集全部负责范围',confirm:true});
 ok(()=>assert.ok(STAGES.every(k=>readState(state).stages[k].status==='pending')));
 begin(state,'outline');ok(()=>assert.equal(readState(state).stages.outline.status,'active'));
 console.log(`${n} flow-state assertions passed; no generation, network or semantic review.`);
} finally {rmSync(dir,{recursive:true,force:true});}
