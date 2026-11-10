#!/usr/bin/env node
// Self-contained outline v3 CLI. Node 18+; no third-party dependencies.
import {mkdirSync,readFileSync,realpathSync,writeFileSync,lstatSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {migrateFile} from './lib/migration.mjs';
export {migrationDraft} from './lib/migration.mjs';
import {checkup,validateOutline,computeAssets,STAGES,SKILL_ROOT} from './lib/outline-core.mjs';
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
 * Step 0 缺的参数（集数 × 时长、题材）自己定，Step 3 的快版骨架不等用户拍板，
 * 做过的决定全部写进最后的汇报。
 *
 * 转移的是**审批权**，不是取消检查点：结构与引用检查照常执行、快版骨架照样要出、
 * `--stage beats` 照样要过——只是不再等人点头。
 *
 * **只认布尔真值**：JSON 里写成字符串 "false" 在 JS 里是真的，那种写法会让
 * 一整条管线闷头跑完，比没写更坏。novel-setup 的 fields 门查这个类型。
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
 * 单独跑某一段、没跑过 novel-setup 的场合无从判断，那就不提示。
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


export const CHAPTER_RE =
  /^[ \t　]*(第[0-9零一二三四五六七八九十百千两]+[章回节卷部][^\n]*|楔子[^\n]*|序章[^\n]*|尾声[^\n]*|番外[^\n]*|Chapter\s+\d+[^\n]*)$/gm;

export const DEFAULT_PER_VOLUME = 15;
export const MAX_VOLUMES = 60;
export const FALLBACK_CHUNK = 20_000;
export const FALLBACK_OVERLAP = 500;

export function detectChapters(text) {
  const found = [];
  for (const m of text.matchAll(CHAPTER_RE)) {
    found.push({ title: m[1].trim(), start: m.index });
  }
  return found;
}

/**
 * @returns {{volumes: string[], chapters: number, truncated: boolean, mode: 'chapter'|'size'}}
 */
export function chunkVolumes(text, perVolume = DEFAULT_PER_VOLUME) {
  if (!Number.isInteger(perVolume) || perVolume < 1) throw Error('perVolume must be a positive integer');
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (!clean) return { volumes: [], chapters: 0, truncated: false, mode: 'chapter' };

  const chapters = detectChapters(clean);

  // 章节太少：按字数切（带重叠，让卡在切口上的情节两边都看得见）
  if (chapters.length < 2) {
    const volumes = [];
    let cursor = 0, coveredEnd = 0;
    while (cursor < clean.length && volumes.length < MAX_VOLUMES) {
      const end = Math.min(cursor + FALLBACK_CHUNK, clean.length);
      volumes.push(clean.slice(cursor, end).trim());
      coveredEnd = end;
      if (end >= clean.length) break;
      cursor = Math.max(end - FALLBACK_OVERLAP, cursor + 1);
    }
    const truncated = coveredEnd < clean.length;
    return { volumes, chapters: 0, truncated, mode: 'size' };
  }

  // 章前的引子归进第一卷
  const starts = chapters.map((c) => c.start);
  if (starts[0] > 0) starts.unshift(0);

  const volumes = [];
  for (let i = 0; i < starts.length && volumes.length < MAX_VOLUMES; i += perVolume) {
    const from = starts[i];
    const to = i + perVolume < starts.length ? starts[i + perVolume] : clean.length;
    volumes.push(clean.slice(from, to).trim());
  }
  const covered = Math.min(starts.length, MAX_VOLUMES * perVolume);
  const truncated = covered < starts.length;
  return { volumes, chapters: chapters.length, truncated, mode: 'chapter' };
}

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
const USAGE=`novel-outline v3
  chunk BOOK WORKDIR [--per-volume N]
  validate DOC [--stage skeleton|beats|full] [--production FILE]
  checkup DOC [--stage skeleton|beats|full] [--production FILE] [--json] [--downstream]
  render DOC [--html|--md] [--lang zh|en] [--stage STAGE] [--production FILE]
  assets DOC
  migrate-v3 INPUT [--out OUTPUT] [--confirm]  preview first; never overwrite input
  slug NAME
Read references/创作指南.md. Structural validation is not content review.`;
async function main(argv) {
 const [cmd,...args]=argv;
 if(!cmd||['-h','--help'].includes(cmd)){console.log(USAGE);return;}
 if(cmd==='slug'){console.log(slug(args[0]??''));return;}
 if(cmd==='chunk'){
  const [book,workdir]=args;if(!book||!workdir)throw Error('chunk BOOK WORKDIR');
  validateOptions(args,2,['--per-volume']);
  const result=chunkVolumes(readFileSync(resolve(book),'utf8'),Number(flag(args,'--per-volume',DEFAULT_PER_VOLUME)));
  mkdirSync(resolve(workdir),{recursive:true});
  result.volumes.forEach((v,i)=>writeFileSync(join(resolve(workdir),'vol-'+String(i).padStart(2,'0')+'.txt'),v));
  console.log(JSON.stringify({...result,volumes:result.volumes.length,workdir:resolve(workdir)},null,2));return;
 }
 if(cmd==='migrate-v3'){
  if(!args[0]||args[0].startsWith('--'))throw Error('migrate-v3 requires INPUT');
  validateOptions(args,1,['--out'],['--confirm']);
  const output=flag(args,'--out'),result=migrateFile(args[0],output,{confirm:args.includes('--confirm')});
  console.log(JSON.stringify(result,null,2));if(output&&!result.written)process.exitCode=1;return;
 }
 if(!['validate','checkup','render','assets'].includes(cmd))throw Error('Unknown command '+cmd+'\n'+USAGE);
 if(!args[0]||args[0].startsWith('--'))throw Error(cmd+' requires DOC');
 validateOptions(args,1,['--stage','--production',...(cmd==='render'?['--lang']:[])],cmd==='render'?['--html','--md']:cmd==='checkup'?['--json','--downstream']:[]);
 if(args.includes('--html')&&args.includes('--md'))throw Error('Choose --html or --md, not both');
 const file=args[0],doc=readJson(file),stage=flag(args,'--stage','full');
 if(!STAGES.includes(stage))throw Error('Unknown stage '+stage);
 const context={...loadProduction(file,flag(args,'--production')),stage};
 if(cmd==='assets'){const result=checkup(doc,context);console.log(JSON.stringify(computeAssets(doc),null,2));if(result.stats.fail)process.exitCode=1;return;}
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
