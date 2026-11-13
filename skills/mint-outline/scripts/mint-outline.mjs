#!/usr/bin/env node
// Self-contained outline v5 CLI. Node 18+; no third-party dependencies.
import {mkdirSync,readFileSync,realpathSync,writeFileSync,lstatSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chunkScript,sourceDocument,verifySources} from './lib/source.mjs';
export * from './lib/source.mjs';
import {checkup,validateOutline,STAGES,SKILL_ROOT} from './lib/outline-core.mjs';
import {renderHtml,renderMarkdown} from './lib/outline-report.mjs';
import {checkKnownDownstream} from './lib/outline-downstream.mjs';
export * from './lib/outline-core.mjs';
export * from './lib/outline-report.mjs';
export const PRODUCTION_FILE = 'production.json';
export const PRODUCTION_DEPTH = 5;

export function findProduction(fromDir = '.', depth = PRODUCTION_DEPTH) {
  let dir = resolve(fromDir);
  for (let i = 0; i <= depth; i++) {
    const hit = resolve(dir, PRODUCTION_FILE);
    try { lstatSync(hit); return hit; }
    catch (error) { if (error.code !== 'ENOENT') return hit; } // unreadable entries are not missing
    const up = dirname(dir);
    if (up === dir) break; // 到根了
    dir = up;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 自动驾驶                                                            */
/* ------------------------------------------------------------------ */
/*
 * production.json 顶层的 autopilot。为 true 时本 skill 的全部流程一口气跑完：
 * 仅按已提供剧本与授权整理事实，不自行补齐集数、时长或未知结局，
 * 做过的决定全部写进最后的汇报。
 *
 * 转移的是**审批权**，不是取消检查点：结构与引用检查照常执行、快版骨架照样要出、
 * `--stage beats` 照样要过——只是不再等人点头。
 *
 * **只认布尔真值**：JSON 里写成字符串 "false" 在 JS 里是真的，那种写法会让
 * 一整条管线闷头跑完，比没写更坏。mint-setup 的 fields 门查这个类型。
 */

export const autopilotOf = (production) => production?.autopilot === true;

/** 开着才打印——关着就是原来的样子，没有新信息。 */
export const AUTOPILOT_NOTE =
  '自动驾驶：开——本段流程一口气跑完，不要停下来问用户；替用户做的决定全部写进最后的汇报';

/* ------------------------------------------------------------------ */
/* 产物落点                                                            */
/* ------------------------------------------------------------------ */
/*
 * 工作目录约定：每个 skill 的产物归自己的段目录（outline / characters /
 * art / script / creation），工作目录根只住 production.json。
 *
 * 落点写错了不用重出图，所以这里是提示不是门——但必须说出来：合并报告的
 * `--from` 自动发现是按段目录名找 JSON 的，产物平铺在根目录它就找不到。
 *
 * 只有找得到 production.json 才判断得了——那份文件定义了工作目录根在哪。
 * 单独跑某一段、没跑过 mint-setup 的场合无从判断，那就不提示。
 */

/** 本 skill 的产物该住的段目录名。 */
export const STAGE_DIR = 'outline';

/** 落点不对就返回一句人读的提示；落点对了、或无从判断，返回 null。 */
export function stageDirNote(docPath, productionPath, stage = STAGE_DIR) {
  if (!docPath || !productionPath) return null;
  const want = resolve(dirname(resolve(productionPath)), stage);
  const got = dirname(resolve(docPath));
  if (got === want) return null;
  return `产物落在 ${got}，按工作目录约定该住在 ${want}——每个 skill 的产物归自己的段目录，放错了合并报告的 --from 自动发现找不到它`;
}


// Source chunks retain exact physical line coordinates; no novel/chapter adapter.

/* ------------------------------------------------------------------ */
/* slug                                                                */
/* ------------------------------------------------------------------ */

export function slug(name) {
  const cleaned = String(name)
    .trim()
    .replace(/[\s/\\:*?"<>|]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'outline';
}


const readJson=p=>JSON.parse(readFileSync(resolve(p),'utf8'));
const flag=(args,key,fallback=null)=>{const i=args.indexOf(key);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw Error(key+' requires a value');return args[i+1];};
function validateOptions(args,start,values=[],toggles=[]) {
 const seen=new Set();
 for(let i=start;i<args.length;i++) {
  const key=args[i];
  if(seen.has(key)||(!values.includes(key)&&!toggles.includes(key)))throw Error('Unknown or duplicate option '+key);
  seen.add(key);
  if(values.includes(key)){if(!args[i+1]||args[i+1].startsWith('--'))throw Error(key+' requires a value');i++;}
 }
}
export function loadProduction(docPath,explicit) {
 const path=explicit??findProduction(dirname(resolve(docPath)));
 if(!path)return {};
 try {const production=readJson(path);if(!production||typeof production!=='object'||Array.isArray(production))throw Error('production.json must be an object');return {production,productionPath:path};}
 catch(error){return {productionError:path+': '+error.message,productionPath:path};}
}
const USAGE=`mint-outline v5 (existing scripts only)
  chunk SCRIPT WORKDIR --kind script [--max-lines N] [--context-lines N]
  source-document SCRIPT --artifact DOC [--id ID]
  verify-sources DOC
  validate DOC [--stage skeleton|beats|full] [--production FILE]
  checkup DOC [--stage skeleton|beats|full] [--production FILE] [--json] [--downstream]
  render DOC [--html|--md] [--lang zh|en] [--stage STAGE] [--production FILE]
  slug NAME
Read references/创作指南.md. Structural validation is not content review.`;
async function main(argv) {
 const [cmd,...args]=argv;
 if(!cmd||['-h','--help'].includes(cmd)){console.log(USAGE);return;}
 if(cmd==='slug'){console.log(slug(args[0]??''));return;}
 if(cmd==='chunk'){
  const [file,workdir]=args;if(!file||!workdir)throw Error('chunk SCRIPT WORKDIR --kind script');
  validateOptions(args,2,['--kind','--max-lines','--context-lines']);
  const result=chunkScript(readFileSync(resolve(file)),{kind:flag(args,'--kind'),maxLines:Number(flag(args,'--max-lines',200)),contextLines:Number(flag(args,'--context-lines',2))});
  mkdirSync(resolve(workdir),{recursive:true});
  writeFileSync(join(resolve(workdir),'source-chunks.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({...result,chunks:result.chunks.length,workdir:resolve(workdir)},null,2));return;
 }
 if(cmd==='source-document'){
  if(!args[0]||args[0].startsWith('--'))throw Error('source-document requires SCRIPT');
  validateOptions(args,1,['--artifact','--id']);
  console.log(JSON.stringify(sourceDocument(args[0],{artifactPath:flag(args,'--artifact'),id:flag(args,'--id','D01')}),null,2));return;
 }
 if(cmd==='verify-sources'){
  if(!args[0])throw Error('verify-sources requires DOC');validateOptions(args,1);
  const report=checkup(readJson(args[0]),{verifySources:true,artifactPath:args[0]});console.log(JSON.stringify(report,null,2));if(report.stats.fail)process.exitCode=1;return;
 }
 if(!['validate','checkup','render'].includes(cmd))throw Error('Unknown command '+cmd+'\n'+USAGE);
 if(!args[0]||args[0].startsWith('--'))throw Error(cmd+' requires DOC');
 validateOptions(args,1,['--stage','--production',...(cmd==='render'?['--lang']:[])],cmd==='render'?['--html','--md','--verify-sources']:cmd==='checkup'?['--json','--downstream','--verify-sources']:['--verify-sources']);
 if(args.includes('--html')&&args.includes('--md'))throw Error('Choose --html or --md, not both');
 const file=args[0],doc=readJson(file),stage=flag(args,'--stage','full');
 if(!STAGES.includes(stage))throw Error('Unknown stage '+stage);
 const context={...loadProduction(file,flag(args,'--production')),stage,artifactPath:resolve(file),verifySources:args.includes('--verify-sources')};
 if(cmd==='render'){
  const lang=flag(args,'--lang',doc?.lang??context.production?.lang??'zh');
  process.stdout.write((args.includes('--html')?renderHtml(doc,lang,context):renderMarkdown(doc,lang,context))+'\n');
  if(checkup(doc,context).stats.fail)process.exitCode=1;
  return;
 }
 if(autopilotOf(context.production))console.error(AUTOPILOT_NOTE);
 const note=stageDirNote(file,context.productionPath);if(note)console.error(note);
 const report=checkup(doc,context);
 if(args.includes('--downstream')) {
  const root=context.productionPath?dirname(resolve(context.productionPath)):dirname(dirname(resolve(file)));
  report.downstream=checkKnownDownstream(doc,root,context);
  if(report.downstream.stats.fail)process.exitCode=1;
 }
 if(cmd==='checkup'&&args.includes('--json'))console.log(JSON.stringify(report,null,2));
 else {
  for(const g of report.gates)console.log(`${g.status} [${g.category}/${g.level}] ${g.id}${g.reason?' ('+g.reason+')':''}${g.messages.length?': '+g.messages.join('; '):''}`);
  console.log(JSON.stringify({stage,stats:report.stats,contentReview:report.contentReview,downstream:report.downstream}));
 }
 if(report.stats.fail)process.exitCode=1;
}
function isMainModule(){try{return process.argv[1]&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url));}catch{return false;}}
if(isMainModule()){
 process.stdout.on('error',error=>{if(error.code==='EPIPE')process.exit(0);throw error;});
 try{await main(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=1;}
}
