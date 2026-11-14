#!/usr/bin/env node
// 分集目录登记、接力草稿与设计写回。只用本 skill 的样例，离线，不调用模型。
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync,copyFileSync,symlinkSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {reviewHash} from './lib/identity.mjs';
import {parseEpisodeNumber,episodeFromFilename} from './lib/source-dir.mjs';
import {DESIGN_FIELDS} from './mint-characters.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),cliPath=join(root,'scripts/mint-characters.mjs');
const temp=mkdtempSync(join(tmpdir(),'characters-batch-'));
const cli=(...args)=>spawnSync(process.execPath,[cliPath,...args],{encoding:'utf8',cwd:temp});
const read=p=>JSON.parse(readFileSync(p,'utf8')),write=(p,x)=>writeFileSync(p,JSON.stringify(x,null,2)+'\n');
let tests=0;
const test=(name,f)=>{try{f();tests++;}catch(e){e.message=`${name}: ${e.message}`;throw e;}};
const folder=join(root,'examples/回声台-分集');
const dir=(name,files)=>{const d=join(temp,name);mkdirSync(d);for(const [n,t] of Object.entries(files))writeFileSync(join(d,n),t);return d;};

try {
  test('episode numbers from filenames',()=>{
    assert.equal(parseEpisodeNumber('十二'),12);assert.equal(parseEpisodeNumber('一百零五'),105);assert.equal(parseEpisodeNumber('一百十'),null);
    for(const [n,ep] of [['第一集.md',1],['第02集.md',2],['EP-3.md',3],['e04 夜.md',4],['5 收尾.md',5],['尾声.md',null]])assert.equal(episodeFromFilename(n),ep,n);
  });

  test('seed --source-dir registers sample folder',()=>{
    const r=cli('seed','--source-dir',folder,'--title','回声台','--budget','8');
    assert.equal(r.status,0,r.stderr);
    const d=JSON.parse(r.stdout);
    assert.deepEqual(d.provenance.documents.map(x=>[x.id,x.lineCount]),[['D01',8],['D02',2]]);
    assert.ok(d.provenance.documents.every(x=>x.path.startsWith('/')));
    assert.deepEqual(d.provenance.coverage,[]);assert.equal(d.provenance.scope,'partial');
    assert.equal(d.characters.length,0);assert.equal(d.budgets.characters,8);
    assert.equal(r.stderr,'');
  });

  test('document id width follows largest episode; gaps reported, not fatal',()=>{
    const d=dir('gap',{'第1集.md':'第1集 开场\n','第100集.md':'第100集 结尾\n'});
    const r=cli('seed','--source-dir',d,'--title','缺集');
    assert.equal(r.status,0,r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).provenance.documents.map(x=>x.id),['D001','D100']);
    assert.match(r.stderr,/missingEpisodes: 2, 3/);
  });

  test('seed --source-dir rejects bad folders without writing',()=>{
    const cases=[
      ['noep',{'第1集.md':'a\n','番外.md':'b\n'},/解析不出集号/],
      ['dup',{'第1集.md':'a\n','ep1.md':'b\n'},/重复/],
      ['heading',{'第1集.md':'第2集 错位\n'},/正文集标题为第 2 集/],
      ['empty',{'第1集.md':''},/空文件/],
      ['none',{'readme.txt':'x\n'},/没有 \.md/],
    ];
    for(const [name,files,pattern] of cases) {
      const out=join(temp,`${name}.json`);
      const r=cli('seed','--source-dir',dir(name,files),'--title','坏目录','--out',out);
      assert.notEqual(r.status,0,name);assert.match(r.stderr,pattern,name);assert.equal(existsSync(out),false,name);
    }
    const link=dir('link',{'第1集.md':'a\n'});symlinkSync(join(link,'第1集.md'),join(link,'第2集.md'));
    assert.match(cli('seed','--source-dir',link,'--title','链接').stderr,/同一个文件/);
  });

  test('seed --source-dir flag conflicts and existing output',()=>{
    assert.match(cli('seed','--source-dir',folder,'--source',join(root,'examples/回声台.txt'),'--title','回声台').stderr,/二选一/);
    const out=join(temp,'exists.json');writeFileSync(out,'{}');
    assert.notEqual(cli('seed','--source-dir',folder,'--title','回声台','--out',out).status,0);
    assert.equal(readFileSync(out,'utf8'),'{}');
  });

  test('outline with different document ids is rejected',()=>{
    const seeded=JSON.parse(cli('seed','--source-dir',folder,'--title','回声台').stdout);
    const documents=seeded.provenance.documents.map((d,i)=>({...d,id:`D0${i+5}`}));
    const outline={schemaVersion:5,source:'回声台',provenance:{kind:'script',scope:'complete',documents,coverage:documents.map(d=>({documentId:d.id,startLine:1,endLine:d.lineCount})),totalEpisodes:2},
      story:{summary:'停电中的交接。',sourceRefs:[{documentId:'D05',startLine:1,endLine:8}]},beats:[],episodes:[{ep:1,synopsis:'交接。',sourceRefs:[{documentId:'D05',startLine:1,endLine:8}]}]};
    write(join(temp,'outline.json'),outline);
    const r=cli('seed','--source-dir',folder,'--title','回声台','--outline',join(temp,'outline.json'));
    assert.notEqual(r.status,0);assert.match(r.stderr,/文档身份不匹配/);
  });

  // 接力：第一位只读第一集，第二位读第二集并在已有条目上补引用。
  test('relay drafts reconcile at every step and end in a valid cast',()=>{
    const draft00=join(temp,'draft-00.json');
    assert.equal(cli('seed','--source-dir',folder,'--title','回声台','--budget','8','--out',draft00).status,0);
    const ref=(documentId,startLine,endLine=startLine)=>[{documentId,startLine,endLine}];
    const person=(key,name,r,extra={})=>({identityKey:key,name,aliases:[],entityType:'human',presence:['visible'],speech:'silent',unknowns:[],sourceRefs:r,...extra});
    const d1=read(draft00);
    d1.provenance.coverage=ref('D01',1,8);d1.summary='第一集：停电中的交接。';
    d1.characters=[
      person('night-operator','许禾',ref('D01',1,2),{speech:'speaking',aliases:[{name:'小禾',sourceRefs:ref('D01',2)}]}),
      person('morning-operator','许禾',ref('D01',1,2)),
      person('door-girl','陌生女孩',ref('D01',3),{unknowns:['姓名未知']}),
      person('neighbor-voice','隔壁喊话者',ref('D01',4),{presence:['voice-only'],speech:'speaking',unknowns:['姓名未知']}),
      person('guard-dog','灰点',ref('D01',5),{entityType:'nonhuman'}),
      person('mentor-liang','梁师傅',ref('D01',6),{presence:['mentioned'],speech:'unknown'}),
      person('speaker-voice','扬声器声音',ref('D01',7),{entityType:'unknown',presence:['voice-only'],speech:'speaking',unknowns:['发声主体与录音状态未知']}),
    ];
    write(join(temp,'draft-01.json'),d1);
    assert.equal(cli('reconcile',join(temp,'draft-01.json')).status,0,'draft-01 self-check');
    const d2=structuredClone(d1);
    d2.provenance.coverage.push(...ref('D02',1,2));d2.provenance.scope='complete';d2.summary='停电中的交接；夜班员独自返回确认交接完成。';
    // 原文「夜班员小禾」：对应已有的夜班员，补引用，不新建身份。
    d2.characters[0].sourceRefs.push(...ref('D02',1,2));
    // 窗外喊声：原文明确没有确认与隔壁喊话者同一，新登记并写明疑点。
    d2.characters.push(person('window-voice','窗外喊话者',ref('D02',1),{presence:['voice-only'],speech:'speaking',unknowns:['不能确认与隔壁喊话者是否同一身份']}));
    write(join(temp,'draft-02.json'),d2);
    assert.equal(cli('reconcile',join(temp,'draft-02.json')).status,0,'draft-02 self-check');
    assert.deepEqual(read(join(temp,'draft-01.json')),d1,'relay never rewrites an earlier draft');
    const castPath=join(temp,'relay-cast.json');
    assert.equal(cli('reconcile',join(temp,'draft-02.json'),'--out',castPath).status,0);
    const cast=read(castPath);
    assert.equal(cast.characters.length,8);assert.equal(cast.characters.filter(c=>c.name==='许禾').length,2);
    const v=cli('validate',castPath,'--no-production');assert.equal(v.status,0,v.stderr);
  });

  // 设计写回：拿《渡口》完整样例拆掉设计，再从设计文件写回。
  const ferry=join(temp,'ferry');mkdirSync(ferry);
  copyFileSync(join(root,'examples/渡口.txt'),join(ferry,'渡口.txt'));
  const full=read(join(root,'examples/渡口-cast.json'));
  const bare=structuredClone(full);for(const c of bare.characters)for(const k of DESIGN_FIELDS)delete c[k];
  const castPath=join(ferry,'cast.json'),designs=join(ferry,'designs');mkdirSync(designs);
  const designOf=c=>Object.fromEntries([['id',c.id],...DESIGN_FIELDS.filter(k=>Object.hasOwn(c,k)).map(k=>[k,c[k]])]);
  const files=full.characters.map(c=>{const p=join(designs,`${c.id}.json`);write(p,designOf(c));return p;});
  const reset=()=>write(castPath,bare);
  const apply=(...args)=>cli('apply-designs',castPath,...args,'--no-production');

  test('apply-designs writes every block back and keeps the identity review hash',()=>{
    reset();
    const r=apply(...files);assert.equal(r.status,0,r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).applied,full.characters.map(c=>c.id));
    assert.deepEqual(read(castPath),full);
    assert.equal(reviewHash(read(castPath)),reviewHash(bare));
    assert.equal(cli('validate',castPath,'--no-production').status,0);
    assert.deepEqual(readdirSync(ferry).filter(n=>n.includes('.tmp-')),[]);
  });

  test('apply-designs reports replaced blocks',()=>{
    write(castPath,full);
    const r=apply(files[0]);assert.equal(r.status,0,r.stderr);
    assert.ok(JSON.parse(r.stdout).replaced.includes(`${full.characters[0].id}.image`));
  });

  test('apply-designs rejects bad design files and writes nothing',()=>{
    const bad=join(ferry,'bad');mkdirSync(bad);
    const c0=full.characters[0];
    const cases=[
      ['unknown id',()=>{const p=join(bad,'C99.json');write(p,{id:'C99',oneLiner:'无此人'});return [p];},/没有这个身份/],
      ['name mismatch',()=>{const p=join(bad,'wrong.json');write(p,designOf(c0));return [p];},/文件名必须是/],
      ['duplicate id',()=>{const d=join(bad,'again');mkdirSync(d,{recursive:true});const p=join(d,`${c0.id}.json`);write(p,designOf(c0));return [files[0],p];},/出现两次/],
      ['tier refused',()=>{const p=join(bad,`${c0.id}.json`);write(p,{...designOf(c0),tier:'lead'});return [p];},/不接受 tier/],
      ['identity field refused',()=>{const p=join(bad,`${c0.id}.json`);write(p,{...designOf(c0),name:'改名'});return [p];},/不接受 name/],
      ['no design field',()=>{const p=join(bad,`${c0.id}.json`);write(p,{id:c0.id});return [p];},/至少提供一项/],
      ['invalid design names the id',()=>{const p=join(bad,`${c0.id}.json`);write(p,{...designOf(c0),importance:'hero'});return [p,...files.slice(1)];},new RegExp(`${c0.id}：`)],
    ];
    for(const [name,make,pattern] of cases) {
      reset();const before=readFileSync(castPath,'utf8');
      const r=apply(...make());
      assert.notEqual(r.status,0,name);assert.match(r.stderr,pattern,name);
      assert.equal(readFileSync(castPath,'utf8'),before,`${name}: cast unchanged`);
    }
  });

  test('problems already in the cast are not blamed on design files',()=>{
    const over=structuredClone(bare);over.budgets.characters=1;write(castPath,over);
    const before=readFileSync(castPath,'utf8');
    const r=apply(...files);
    assert.notEqual(r.status,0);
    assert.match(r.stderr,/原 cast 本身的问题（与设计文件无关）：.*预算超额/);
    for(const c of full.characters)assert.doesNotMatch(r.stderr,new RegExp(`^${c.id}：`,'m'));
    assert.equal(readFileSync(castPath,'utf8'),before);
  });

  test('apply-designs needs a cast and at least one design',()=>{
    reset();
    assert.match(cli('apply-designs',castPath,'--no-production').stderr,/至少一份设计文件/);
    assert.match(cli('apply-designs',castPath,files[0],'--force').stderr,/不认识 --force/);
  });
} finally {rmSync(temp,{recursive:true,force:true});}
console.log(`✓ mint-characters batch selftest passed (${tests} groups)`);
