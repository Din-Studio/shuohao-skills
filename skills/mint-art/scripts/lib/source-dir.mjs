// Per-episode Markdown folder intake. Stage-owned copy; never imports another skill.
// Document IDs are `D` + episode number so they line up with outline v5 and script.
import {readFileSync,readdirSync,realpathSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';

const int=x=>Number.isSafeInteger(x)&&x>0;
const CN_DIGITS={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
// Arabic digits or Chinese numerals below 1000 (一 … 九百九十九).
export function parseEpisodeNumber(text) {
  const t=String(text??'').trim();
  if(/^\d+$/.test(t)){const n=Number(t);return int(n)?n:null;}
  const m=t.match(/^(?:([一二两三四五六七八九])百)?(?:([零〇]))?(?:([一二三四五六七八九])?(十))?([一二三四五六七八九])?$/);
  if(!m||!t)return null;
  const [,h,zero,tens,ten,ones]=m;
  if(zero&&(!h||ten&&!tens||!ones&&!ten))return null;
  if(zero&&ten)return null;
  if(h&&ten&&!tens)return null;
  const n=(h?CN_DIGITS[h]*100:0)+(ten?(tens?CN_DIGITS[tens]:1)*10:0)+(ones?CN_DIGITS[ones]:0);
  return int(n)?n:null;
}
// Filename only; content never decides an episode number.
export function episodeFromFilename(name) {
  const stem=String(name).replace(/\.md$/i,'');
  const zh=stem.match(/第\s*([0-9零〇一二两三四五六七八九十百]+)\s*集/);
  if(zh)return parseEpisodeNumber(zh[1]);
  const ep=stem.match(/(?:^|[^a-z])(?:ep|e)[\s._-]*(\d+)/i);
  if(ep)return parseEpisodeNumber(ep[1]);
  const lead=stem.match(/^(\d+)/);
  return lead?parseEpisodeNumber(lead[1]):null;
}
const HEADING=/^\s*(?:#{1,6}\s*)?第(.+?)集/;
/**
 * Read one folder of per-episode Markdown files.
 * Returns [{id, ep, name, path(absolute), bytes}] sorted by episode, plus missingEpisodes.
 * `lineCount(bytes)` is the stage's own physical line counter.
 */
export function readSourceDir(dir,lineCount) {
  const root=resolve(dir);
  if(!statSync(root).isDirectory())throw Error('--source-dir 必须是目录');
  const parsed=[],seen=new Map(),errors=[];
  for(const name of readdirSync(root).filter(n=>!n.startsWith('.')&&/\.md$/i.test(n)).sort()) {
    const path=join(root,name);
    if(!statSync(path).isFile())continue;
    const real=realpathSync(path);
    if(seen.has(real))errors.push(`${name}：与 ${seen.get(real)} 是同一个文件`);else seen.set(real,name);
    parsed.push({name,ep:episodeFromFilename(name),path});
  }
  if(!parsed.length)throw Error('目录中没有 .md 文件');
  const byEp=new Map();
  for(const f of parsed) {
    if(f.ep===null)errors.push(`${f.name}：文件名中解析不出集号`);
    else if(byEp.has(f.ep))errors.push(`${f.name}：集号 ${f.ep} 与 ${byEp.get(f.ep).name} 重复`);
    else byEp.set(f.ep,f);
  }
  const table=()=>parsed.map(f=>`  ${f.name} -> ${f.ep??'?'}`).join('\n');
  if(errors.length)throw Error(errors.join('\n')+'\n全部文件：\n'+table());
  const sorted=[...byEp.values()].sort((a,b)=>a.ep-b.ep),width=Math.max(2,String(sorted.at(-1).ep).length);
  const documents=[];
  for(const f of sorted) {
    const bytes=readFileSync(f.path);
    let lines;
    try{lines=lineCount(bytes);}catch(e){errors.push(`${f.name}：${e.message}`);continue;}
    if(!lines){errors.push(`${f.name}：空文件`);continue;}
    new TextDecoder('utf-8').decode(bytes).split(/\r\n|\n|\r/).forEach((line,i)=>{
      const m=line.match(HEADING),n=m&&parseEpisodeNumber(m[1]);
      if(n&&n!==f.ep)errors.push(`${f.name}:${i+1}：正文集标题为第 ${n} 集，文件名为第 ${f.ep} 集`);
    });
    documents.push({id:'D'+String(f.ep).padStart(width,'0'),ep:f.ep,name:f.name,path:resolve(f.path),bytes});
  }
  if(errors.length)throw Error(errors.join('\n')+'\n全部文件：\n'+table());
  const missingEpisodes=[];for(let e=1;e<sorted.at(-1).ep;e++)if(!byEp.has(e))missingEpisodes.push(e);
  return {documents,missingEpisodes};
}
