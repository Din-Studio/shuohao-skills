#!/usr/bin/env node
// Project orchestrator. Skills remain independently copyable; only this optional
// full-flow entry invokes all five stage CLIs. No failure history is persisted.
import { readFileSync, writeFileSync, openSync, closeSync, renameSync, unlinkSync, existsSync, mkdirSync, realpathSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, relative, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
export const STAGES = ['outline', 'characters', 'art', 'script', 'creation'];
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(readFileSync(path)));
const fail = message => { throw Error(message); };
function statePathOf(path) {
  const absolute=resolve(path);
  try { if(lstatSync(absolute).isSymbolicLink()) fail('流程状态入口不能是符号链接；请使用原状态文件路径。'); return realpathSync(absolute); }
  catch(e) { if(e.code!=='ENOENT') throw e; }
  const parent=dirname(absolute);
  if(parent===absolute) return absolute;
  return join(statePathOf(parent),basename(absolute));
}
const storedPath = (statePath,path) => relative(dirname(resolve(statePath)),realpathSync(path));
const localPath = (statePath,path) => resolve(dirname(resolve(statePath)),path);
function transaction(path, fn) {
  mkdirSync(dirname(path),{recursive:true});
  const lock = path + '.lock'; let fd;
  try { fd=openSync(lock,'wx'); } catch { fail('流程状态正在被另一项操作修改；不能并行推进。'); }
  try { return fn(); } finally { closeSync(fd); unlinkSync(lock); }
}
function save(path,state) {
  const temp=path+'.tmp';
  writeFileSync(temp,JSON.stringify(state,null,2)+'\n',{flag:'wx'});
  try { renameSync(temp,path); } catch(e) { unlinkSync(temp); throw e; }
}
export function readState(path) {
  path=statePathOf(path);
  const s=json(path);
  if(s?.schemaVersion!==1 || s.mode!=='full' || !s.source || !s.scope || !Array.isArray(s.sources) || !s.sources.length || !s.stages || typeof s.stages!=='object') fail('非法 pipeline.json；不能将独立运行记录当作完整流程。');
  const statuses=STAGES.map(k=>s.stages[k]?.status);
  if(statuses.some(x=>!['pending','active','complete'].includes(x)) || statuses.filter(x=>x==='active').length>1) fail('非法阶段状态。');
  let incomplete=false;
  for(const status of statuses) { if(incomplete && status==='complete') fail('阶段完成顺序非法。'); if(status!=='complete') incomplete=true; }
  return s;
}
function currentEvidence(s,path,until=STAGES.length) {
  for(const source of s.sources) if(hash(readFileSync(localPath(path,source.path)))!==source.sha256) fail(`原剧本已改版：${source.path}；须重新核验本次范围，不能沿用流程完成记录。`);
  for(const stage of STAGES.slice(0,until)) {
    const record=s.stages[stage];
    if(record.status!=='complete') fail(`前序阶段 ${stage} 尚未完成。`);
    for(const key of ['artifact','handoff',...(record.previous?['previous']:[])]) if(!record[key] || hash(readFileSync(localPath(path,record[key].path)))!==record[key].sha256) fail(`${stage} ${key} 已改变；须重新核验该阶段交接。`);
  }
}
export function initialize(path,{source,scope,sources}) {
  path=statePathOf(path);
  return transaction(path,()=>{
    if(existsSync(path)) fail('流程状态已存在；不覆盖既有记录。');
    if(typeof source!=='string'||!source.trim()||typeof scope!=='string'||!scope.trim()||!sources?.length) fail('init 需要 --title、--scope 和至少一个 --source 原剧本。');
    const seen=new Set();
    const records=sources.map(p=>{ const real=realpathSync(p); if(seen.has(real)) fail('重复原剧本路径。'); seen.add(real); const bytes=readFileSync(real); new TextDecoder('utf-8',{fatal:true}).decode(bytes); return {path:storedPath(path,real),sha256:hash(bytes)}; });
    const state={schemaVersion:1,mode:'full',source,scope,sources:records,stages:Object.fromEntries(STAGES.map(k=>[k,{status:'pending'}])),contentReview:'not-performed'};
    save(path,state); return state;
  });
}
export function begin(path,stage) {
  path=statePathOf(path);
  return transaction(path,()=>{
    const s=readState(path),index=STAGES.indexOf(stage); if(index<0) fail('未知阶段。');
    currentEvidence(s,path,index);
    if(STAGES.some(k=>s.stages[k].status==='active')) fail('已有阶段正在进行；不得并行或重复开始。');
    if(s.stages[stage].status!=='pending') fail('阶段已经完成；重新核验请先 reopen。');
    s.stages[stage]={status:'active'}; save(path,s); return s;
  });
}
function upstreamFlags(s,path,stage) {
  const flags=[];
  for(const [k,flag] of [['outline','--outline'],['characters','--cast'],['art','--art'],['script','--script']]) {
    if(STAGES.indexOf(k)>=STAGES.indexOf(stage)) continue;
    // Asset stages consume prior story/context but keep independent decisions.
    if(stage==='outline') continue;
    flags.push(flag,localPath(path,s.stages[k].artifact.path));
  }
  return flags;
}
export function stageCommand(s,path,stage,args) {
  const cli=join(root,'skills',`mint-${stage}`,'scripts',`mint-${stage}.mjs`);
  const result=spawnSync(process.execPath,[cli,...args],{encoding:'utf8',maxBuffer:32*1024*1024,cwd:dirname(resolve(path))});
  if(result.error) throw result.error;
  if(result.status!==0) fail(`${stage} 校验或命令失败（未推进状态）：\n${result.stdout??''}\n${result.stderr??''}`);
  return result.stdout;
}
function provenance(doc,s,path,artifact) {
  if(doc.source!==s.source || doc.provenance?.kind!=='script' || !Array.isArray(doc.provenance.documents) || !doc.provenance.documents.length || !doc.provenance.coverage?.length) fail('完整流程阶段必须登记本次原剧本身份及负责范围。');
  for(const d of doc.provenance.documents) {
    const original=realpathSync(resolve(dirname(artifact),d.path));
    const known=s.sources.find(x=>realpathSync(localPath(path,x.path))===original);
    if(!known || d.sha256!==known.sha256 || hash(readFileSync(original))!==d.sha256) fail(`来源 ${d.id} 不属于当前流程版本。`);
  }
}
export function complete(path,stage,{artifact,handoff,previous,validator=stageCommand}={}) {
  path=statePathOf(path);
  return transaction(path,()=>{
    const s=readState(path),index=STAGES.indexOf(stage); if(index<0) fail('未知阶段。');
    currentEvidence(s,path,index);
    if(s.stages[stage].status!=='active') fail('必须先 begin 当前阶段；不能跳过或倒序。');
    artifact=realpathSync(artifact); handoff=realpathSync(handoff);
    const initialArtifact=readFileSync(artifact),initialHandoff=readFileSync(handoff);
    const d=json(artifact),h=json(handoff);
    if(stage==='characters' && (d.kind!=='mint-characters' || d.status!=='identified' || d.review?.status!=='confirmed')) fail('人物身份仍是草稿或待确认，不能完成完整流程交接。');
    if(stage==='art' && (d.kind!=='mint-art' || d.status!=='ready')) fail('美术资产仍是草稿或待确认，不能完成完整流程交接。');
    if(h?.confirmed!==true || h.scope!==s.scope || !Array.isArray(h.unresolved) || h.unresolved.some(x=>!x || typeof x.text!=='string' || x.blocking!==false)) fail('交接需 confirmed:true、匹配的 scope 和 unresolved 数组；范围内阻断问题不能交接。');
    // Creation keeps source evidence in its required script, not a second copy.
    provenance(stage==='creation'?json(localPath(path,s.stages.script.artifact.path)):d,s,path,stage==='creation'?localPath(path,s.stages.script.artifact.path):artifact);
    const args=['validate',artifact,...upstreamFlags(s,path,stage)];
    let previousRecord;
    if(previous!==undefined) {
      if(!['characters','art'].includes(stage)) fail('--previous 仅适用于人物或美术增量基线。');
      previous=realpathSync(previous);
      if(previous===artifact) fail('增量基线不能是当前候选产物。');
      previousRecord={path:storedPath(path,previous),sha256:hash(readFileSync(previous))};
      args.push('--previous',previous);
    }
    if(stage!=='creation') args.push('--verify-sources');
    validator(s,path,stage,args);
    // Detect modifications while the validator ran. State stays active on error.
    const bytes=readFileSync(artifact),hb=readFileSync(handoff);
    if(hash(bytes)!==hash(initialArtifact)) fail('校验期间产物已改变。');
    if(hash(hb)!==hash(initialHandoff)) fail('校验期间交接已改变。');
    if(previousRecord && hash(readFileSync(previous))!==previousRecord.sha256) fail('校验期间增量基线已改变。');
    currentEvidence(s,path,index);
    s.stages[stage]={status:'complete',artifact:{path:storedPath(path,artifact),sha256:hash(bytes)},handoff:{path:storedPath(path,handoff),sha256:hash(hb)},...(previousRecord?{previous:previousRecord}:{}),scope:s.scope,unresolved:h.unresolved,structuralValidation:'pass',contentReview:'user-confirmed-handoff'};
    if(stage==='creation' && s.sourceReconciliation) s.sourceReconciliation.status='stage-reverified';
    save(path,s); return s;
  });
}
export function refreshSources(path,{sources,basis,confirm=false}={}) {
  path=statePathOf(path);
  return transaction(path,()=>{
    const s=readState(path);
    if(!confirm || typeof basis!=='string' || !basis.trim() || !Array.isArray(sources) || !sources.length) fail('来源改版需要 --confirm、--basis 复核说明和全部 --source 路径；不会自动接受新摘要。');
    const seen=new Set();
    const records=sources.map(p=>{
      const real=realpathSync(p);if(seen.has(real))fail('重复原剧本路径。');seen.add(real);
      const bytes=readFileSync(real);new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      return {path:storedPath(path,real),sha256:hash(bytes)};
    });
    s.sourceReconciliation={previous:s.sources,current:records,basis,status:'pending-stage-reverification'};
    s.sources=records;
    for(const k of STAGES)s.stages[k]={status:'pending'};
    save(path,s);return s;
  });
}
export function reopen(path,stage) {
  path=statePathOf(path);
  return transaction(path,()=>{ const s=readState(path),i=STAGES.indexOf(stage); if(i<0) fail('未知阶段。');
    // Only workflow completion is reset. Media/content reviews remain owned by
    // the stage and must invalidate only their actual changed dependencies.
    for(const k of STAGES.slice(i)) s.stages[k]={status:'pending'};
    save(path,s); return s;
  });
}
export function run(path,stage,args) {
  path=statePathOf(path);
  return transaction(path,()=>{ const s=readState(path),i=STAGES.indexOf(stage); if(i<0 || s.stages[stage].status!=='active') fail('run 只能执行已 begin 的当前阶段。'); currentEvidence(s,path,i); return stageCommand(s,path,stage,args); });
}
export function check(path) {
  path=statePathOf(path);
  const s=readState(path); const first=STAGES.findIndex(k=>s.stages[k].status!=='complete'); currentEvidence(s,path,first<0?STAGES.length:first);
  return {state:s,workflow:first<0?'complete':'incomplete',contentReview:'not-performed',mediaValidation:'not-performed'};
}
const usage='pipeline.mjs init STATE --title TITLE --scope SCOPE --source SCRIPT [--source SCRIPT]\n  begin STATE STAGE | run STATE STAGE -- COMMAND ARGS...\n  complete STATE STAGE --artifact JSON --handoff JSON [--previous JSON]\n  reopen STATE STAGE | check STATE\n  refresh-sources STATE --source SCRIPT --basis TEXT --confirm\n固定顺序：outline → characters → art → script → creation。独立入口不代表完整流程。';
export function main(args) {
  const [cmd,input,stage]=args;if(!cmd||cmd==='--help'){console.log(usage);return;}
  if(!input) fail(usage); const path=resolve(input);
  const value=flag=>{const i=args.indexOf(flag); if(i<0)return undefined; if(!args[i+1]||args[i+1].startsWith('--'))fail(`${flag} 缺少参数`); return args[i+1];};
  let result;
  if(cmd==='init') result=initialize(path,{source:value('--title'),scope:value('--scope'),sources:args.flatMap((x,i)=>x==='--source'?[args[i+1]]:[])});
  else if(cmd==='begin') result=begin(path,stage);
  else if(cmd==='complete') result=complete(path,stage,{artifact:value('--artifact'),handoff:value('--handoff'),previous:value('--previous')});
  else if(cmd==='reopen') result=reopen(path,stage);
  else if(cmd==='check') result=check(path);
  else if(cmd==='refresh-sources') result=refreshSources(path,{sources:args.flatMap((x,i)=>x==='--source'?[args[i+1]]:[]),basis:value('--basis'),confirm:args.includes('--confirm')});
  else if(cmd==='run') {const i=args.indexOf('--');if(i<0)fail('run 需要 -- COMMAND ARGS');result=run(path,stage,args.slice(i+1));}
  else fail(usage);
  console.log(typeof result==='string'?result:JSON.stringify(result,null,2));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) try{main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}
