#!/usr/bin/env node
// 分集目录登记、接力草稿与设计写回。只用本 skill 的样例，离线，不调用模型。
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync,symlinkSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {identityDigest,assetsOf} from './lib/stage.mjs';
import {episodeFromFilename} from './lib/source-dir.mjs';
import {DESIGN_FIELDS} from './mint-art.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),cliPath=join(root,'scripts/mint-art.mjs');
const temp=mkdtempSync(join(tmpdir(),'art-batch-'));
const cli=(...args)=>spawnSync(process.execPath,[cliPath,...args],{encoding:'utf8',cwd:temp});
const read=p=>JSON.parse(readFileSync(p,'utf8')),write=(p,x)=>writeFileSync(p,JSON.stringify(x,null,2)+'\n');
let tests=0;
const test=(name,f)=>{try{f();tests++;}catch(e){e.message=`${name}: ${e.message}`;throw e;}};
const folder=join(root,'examples/雨棚留言-分集');
const dir=(name,files)=>{const d=join(temp,name);mkdirSync(d);for(const [n,t] of Object.entries(files))writeFileSync(join(d,n),t);return d;};
const ref=(documentId,startLine,endLine=startLine)=>[{documentId,startLine,endLine}];

try {
  test('episode numbers from filenames',()=>{
    for(const [n,ep] of [['第1集.md',1],['第二集.md',2],['第03集.md',3],['ep12.md',12],['番外.md',null]])assert.equal(episodeFromFilename(n),ep,n);
  });

  test('seed --source-dir registers sample folder',()=>{
    const r=cli('seed','--source-dir',folder,'--title','雨棚留言');
    assert.equal(r.status,0,r.stderr);
    const d=JSON.parse(r.stdout);
    assert.deepEqual(d.provenance.documents.map(x=>[x.id,x.lineCount]),[['D01',3],['D02',2],['D03',4]]);
    assert.ok(d.provenance.documents.every(x=>x.path.startsWith('/')));
    assert.deepEqual(d.provenance.coverage,[]);assert.equal(d.mode,'script');assert.equal(d.status,'draft');
    assert.deepEqual([d.scenes,d.props,d.registry.entries],[[],[],[]]);
    assert.doesNotMatch(r.stderr,/missingEpisodes/);
  });

  test('missing episodes are reported, not fatal',()=>{
    const r=cli('seed','--source-dir',dir('gap',{'第1集.md':'第1集 雨棚\n','第4集.md':'第4集 水池\n'}),'--title','缺集');
    assert.equal(r.status,0,r.stderr);assert.match(r.stderr,/missingEpisodes: 2, 3/);
  });

  test('seed --source-dir rejects bad folders and flag conflicts without writing',()=>{
    const cases=[
      ['noep',{'第1集.md':'a\n','附录.md':'b\n'},/解析不出集号/],
      ['dup',{'第1集.md':'a\n','第一集.md':'b\n'},/重复/],
      ['heading',{'第1集.md':'第3集 错位\n'},/正文集标题为第 3 集/],
      ['empty',{'第1集.md':''},/空文件/],
    ];
    for(const [name,files,pattern] of cases) {
      const out=join(temp,`${name}.json`);
      const r=cli('seed','--source-dir',dir(name,files),'--title','坏目录','--out',out);
      assert.notEqual(r.status,0,name);assert.match(r.stderr,pattern,name);assert.equal(existsSync(out),false,name);
    }
    const link=dir('link',{'第1集.md':'a\n'});symlinkSync(join(link,'第1集.md'),join(link,'第2集.md'));
    assert.match(cli('seed','--source-dir',link,'--title','链接').stderr,/同一个文件/);
    const one=join(folder,'第1集.md');
    for(const extra of [['--source',one],['--design'],['--existing',join(temp,'x.json')]])
      assert.match(cli('seed','--source-dir',folder,'--title','雨棚留言',...extra).stderr,/只用于首次生成/,extra[0]);
  });

  test('outline document ids must match episode document ids',()=>{
    const src=join(temp,'src');mkdirSync(src);
    const files=['第1集.md','第二集.md','第03集.md'];
    for(const f of files)writeFileSync(join(src,f),readFileSync(join(folder,f)));
    const seeded=JSON.parse(cli('seed','--source-dir',src,'--title','雨棚留言').stdout).provenance.documents;
    const outline=ids=>{
      const documents=seeded.map((d,i)=>({...d,id:ids[i],path:`src/${files[i]}`}));
      return {schemaVersion:5,source:'雨棚留言',provenance:{kind:'script',scope:'complete',documents,coverage:documents.map(d=>({documentId:d.id,startLine:1,endLine:d.lineCount})),totalEpisodes:3},
        story:{summary:'留言板回到主人手里。',sourceRefs:ref(ids[0],1)},beats:[],episodes:[1,2,3].map(ep=>({ep,synopsis:'推进。',sourceRefs:ref(ids[ep-1],1)}))};
    };
    write(join(temp,'outline-ok.json'),outline(['D01','D02','D03']));
    let r=cli('seed','--source-dir',src,'--title','雨棚留言','--outline',join(temp,'outline-ok.json'));assert.equal(r.status,0,r.stderr);
    write(join(temp,'outline-bad.json'),outline(['D05','D06','D07']));
    r=cli('seed','--source-dir',src,'--title','雨棚留言','--outline',join(temp,'outline-bad.json'));
    assert.notEqual(r.status,0);assert.match(r.stderr,/文档身份或版本不匹配 D01/);
  });

  // 接力：第一位读第 1–2 集，第二位读第 3 集，在已有资产上补引用和状态。
  test('relay drafts pass source checks at every step and end in a valid art',()=>{
    const d0=join(temp,'draft-00.json');
    assert.equal(cli('seed','--source-dir',folder,'--title','雨棚留言','--out',d0).status,0);
    // 第一位接力者：在共享草稿上 register，ID 自然续号。
    let prev=d0;
    for(const [i,[kind,key,name]] of [['scene','canopy','菜摊雨棚'],['scene','pool','公共水池'],['prop','board','旧留言板'],['prop','box','夹纸铁盒']].entries()) {
      const next=join(temp,`reg-${i}.json`);
      const r=cli('register',prev,'--kind',kind,'--key',key,'--name',name,'--out',next);assert.equal(r.status,0,r.stderr);prev=next;
    }
    const a1=read(prev);
    a1.provenance.coverage=[...ref('D01',1,3),...ref('D02',1,2)];
    const [canopy,pool]=a1.scenes,[board,box]=a1.props;
    assert.deepEqual([canopy.id,pool.id,board.id,box.id],['S01','S02','P01','P02']);
    Object.assign(canopy,{primary:true,decision:'清理旧留言板的主要空间',sourceRefs:ref('D01',1,2),usage:{episodes:[1],beats:[]}});
    Object.assign(pool,{decision:'核对夹纸归属的场所',sourceRefs:ref('D02',1,2),usage:{episodes:[2],beats:[]}});
    Object.assign(board,{decision:'代存、寻主与交还的核心物件',sourceRefs:ref('D01',2,3),facts:{text:'陶敏交给许桂兰代存的旧留言板',sourceRefs:ref('D01',2)}});
    Object.assign(box,{decision:'核对夹纸归属的容器，状态需要连续',sourceRefs:ref('D02',1),facts:{text:'第2集：夹纸被放进铁盒逐一核对',sourceRefs:ref('D02',1)}});
    a1.observations=[{text:'新雨伞仅被口头提及，暂不建立道具资产',disposition:'not-asset',sourceRefs:ref('D01',3)}];
    write(join(temp,'draft-01.json'),a1);
    let r=cli('verify-sources',join(temp,'draft-01.json'));assert.equal(r.status,0,r.stdout+r.stderr);
    // 第二位接力者：第 3 集的雨棚、留言板、铁盒都是已有资产，只补引用与状态。
    const a2=structuredClone(a1);
    a2.provenance.coverage.push(...ref('D03',1,4));a2.provenance.scope='complete';a2.provenance.totalEpisodes=3;
    const [c2]=a2.scenes,[b2,x2]=a2.props;
    c2.sourceRefs.push(...ref('D03',1,4));c2.usage.episodes.push(3);c2.decision='同一空间在第1、3集及入夜场次复现；清空是状态变化，不按场次新建地点';
    b2.sourceRefs.push(...ref('D03',2));
    x2.sourceRefs.push(...ref('D03',2));x2.facts={text:'第2集放入夹纸；第3集腾空后合上',sourceRefs:[...ref('D02',1),...ref('D03',2)]};
    a2.observations.push({text:'清空后雨棚仍为同一地点；不另建变体',disposition:'same-location',sceneId:'S01',sourceRefs:ref('D03',3,4)});
    write(join(temp,'draft-02.json'),a2);
    r=cli('verify-sources',join(temp,'draft-02.json'));assert.equal(r.status,0,r.stdout+r.stderr);
    assert.deepEqual(read(join(temp,'draft-01.json')),a1,'relay never rewrites an earlier draft');
    assert.equal(a2.registry.entries.length,4);
    // 定稿：逐资产写入审核摘要，status: ready，完整 validate 通过。
    const art=structuredClone(a2);
    for(const a of assetsOf(art))a.identityReview={status:'confirmed',basis:'接力样例核验',inputDigest:identityDigest(art,a)};
    art.status='ready';
    const artPath=join(temp,'art.json');write(artPath,art);
    r=cli('validate',artPath,'--no-production');assert.equal(r.status,0,r.stdout+r.stderr);
  });

  // 设计写回：拿《雨棚留言》独立设计样例拆掉设计，再从设计文件写回。
  const work=join(temp,'design');mkdirSync(work);
  const full=read(join(root,'examples/雨棚留言-art.json'));
  // changes 随 variantOf 由接力者登记，留在身份侧；其余设计字段拆掉。
  const stripped=DESIGN_FIELDS.filter(k=>k!=='changes'&&k!=='designStatus');
  const bare=structuredClone(full);for(const a of assetsOf(bare)){for(const k of stripped)delete a[k];a.designStatus='none';}
  const artPath=join(work,'art.json'),designs=join(work,'designs');mkdirSync(designs);
  const designOf=a=>Object.fromEntries([['id',a.id],...DESIGN_FIELDS.filter(k=>k!=='changes'&&Object.hasOwn(a,k)).map(k=>[k,a[k]])]);
  const files=assetsOf(full).map(a=>{const p=join(designs,`${a.id}.json`);write(p,designOf(a));return p;});
  const reset=()=>write(artPath,bare);
  const apply=(...args)=>cli('apply-designs',artPath,...args,'--no-production');
  const digests=d=>assetsOf(d).map(a=>identityDigest(d,a));

  test('stripped sample still validates without designs',()=>{
    reset();const r=cli('validate',artPath,'--no-production');assert.equal(r.status,0,r.stdout+r.stderr);
  });

  test('apply-designs writes base and variant together and keeps identity digests',()=>{
    reset();
    const r=apply(...files);assert.equal(r.status,0,r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).applied,assetsOf(full).map(a=>a.id));
    assert.deepEqual(read(artPath),full);
    assert.deepEqual(digests(read(artPath)),digests(bare));
    assert.equal(cli('validate',artPath,'--no-production').status,0);
    assert.deepEqual(readdirSync(work).filter(n=>n.includes('.tmp-')),[]);
  });

  test('apply-designs rejects bad design files and writes nothing',()=>{
    const bad=join(work,'bad');mkdirSync(bad);
    const s1=assetsOf(full)[0];
    const cases=[
      ['unknown id',()=>{const p=join(bad,'S99.json');write(p,{id:'S99',designStatus:'planned'});return [p];},/没有这个资产/],
      ['name mismatch',()=>{const p=join(bad,'wrong.json');write(p,designOf(s1));return [p];},/文件名必须是/],
      ['duplicate id',()=>{const d=join(bad,'again');mkdirSync(d,{recursive:true});const p=join(d,`${s1.id}.json`);write(p,designOf(s1));return [files[0],p];},/出现两次/],
      ['identity field refused',()=>{const p=join(bad,`${s1.id}.json`);write(p,{...designOf(s1),primary:false});return [p];},/不接受 primary/],
      ['variantOf refused',()=>{const p=join(bad,`${s1.id}.json`);write(p,{...designOf(s1),variantOf:'S02'});return [p];},/不接受 variantOf/],
      ['changes only on variants',()=>{const p=join(bad,`${s1.id}.json`);write(p,{...designOf(s1),changes:'换一盏灯'});return [p];},/changes 只用于变体场景/],
      ['designStatus required',()=>{const p=join(bad,`${s1.id}.json`);const x=designOf(s1);delete x.designStatus;write(p,x);return [p];},/designStatus/],
      ['invalid design names the id',()=>{const p=join(bad,`${s1.id}.json`);write(p,{...designOf(s1),anchors:[]});return [p,...files.slice(1)];},new RegExp(`${s1.id}：`)],
    ];
    for(const [name,make,pattern] of cases) {
      reset();const before=readFileSync(artPath,'utf8');
      const r=apply(...make());
      assert.notEqual(r.status,0,name);assert.match(r.stderr,pattern,name);
      assert.equal(readFileSync(artPath,'utf8'),before,`${name}: art unchanged`);
    }
  });

  test('problems already in the art are not blamed on design files',()=>{
    const over=structuredClone(bare);over.budgets={props:{kind:'explicit',max:1}};write(artPath,over);
    const before=readFileSync(artPath,'utf8');
    const r=apply(...files);
    assert.notEqual(r.status,0);
    assert.match(r.stderr,/原 art 本身的问题（与设计文件无关）/);
    for(const a of assetsOf(full))assert.doesNotMatch(r.stderr,new RegExp(`^${a.id}：`,'m'));
    assert.equal(readFileSync(artPath,'utf8'),before);
  });

  test('apply-designs needs at least one design and known flags',()=>{
    reset();
    assert.match(cli('apply-designs',artPath,'--no-production').stderr,/至少一份设计文件/);
    assert.match(cli('apply-designs',artPath,files[0],'--force').stderr,/不认识 --force/);
  });
} finally {rmSync(temp,{recursive:true,force:true});}
console.log(`✓ mint-art batch selftest passed (${tests} groups)`);
