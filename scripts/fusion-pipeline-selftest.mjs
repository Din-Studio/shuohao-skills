#!/usr/bin/env node
// v4 source → outline → script → creation v3 audio continuation → real worksheet/approval/export.
// Offline root fixtures only. Structural approval tests are NOT semantic source review.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {materializeStory,planShots,relocate,outlineFor} from './fixtures/fusion/story.mjs';
import {identifyCast,identifyArt,mapAssets} from './fixtures/stage-identities.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temp=mkdtempSync(join(tmpdir(),'mint-fusion-root-'));
const castPath=join(temp,'characters','堤灯-cast.json'),artPath=join(temp,'art','堤灯-art.json');
const scriptPath=join(temp,'script','堤灯-script.json'),creationPath=join(temp,'creation','堤灯-creation.json');
const write=(p,d)=>{mkdirSync(dirname(p),{recursive:true});writeFileSync(p,typeof d==='string'?d:JSON.stringify(d,null,2)+'\n');};
const clone=structuredClone;
let passed=0,calls=0;const failures=[];
const cli=(skill,...args)=>{
  calls++;const r=spawnSync(process.execPath,[join(root,`skills/mint-${skill}/scripts/mint-${skill}.mjs`),...args],{cwd:temp,encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024,env:{...process.env,NODE_OPTIONS:''}});
  assert.ifError(r.error);assert.equal(r.signal,null);return {...r,output:r.stdout+'\n'+r.stderr};
};
const success=r=>{assert.equal(r.status,0,r.output);return r;};
const rejected=(r,pattern)=>{assert.notEqual(r.status,0,r.output);if(pattern)assert.match(r.output,pattern);return r;};
async function test(name,fn){try{await fn();passed++;console.log(`通过 ${name}`);}catch(e){failures.push(name+': '+e.message);console.error(`失败 ${name}\n${e.message}`);}}
const scriptCLI=(...args)=>cli('script',...args,'--no-production');
const creationCLI=(...args)=>cli('creation',...args,'--script',scriptPath,'--cast',castPath,'--art',artPath,'--no-production');
const validate=()=>scriptCLI('validate',scriptPath,'--verify-sources');
const withScript=(change,fn)=>{const before=readFileSync(scriptPath);try{const d=JSON.parse(before);change(d);write(scriptPath,d);return fn(d);}finally{writeFileSync(scriptPath,before);}};
// These fixture-specific expectations compare executable meaning against actual source bytes.
// They are regression assertions, not a general semantic verifier or independent approval.
const sourceText=(doc,sourceRefs)=>sourceRefs.map(r=>{
  const d=doc.provenance.documents.find(d=>d.id===r.documentId);
  const lines=readFileSync(resolve(dirname(scriptPath),d.path),'utf8').replace(/\n$/,'').split('\n');
  assert.ok(r.startLine>=1&&r.endLine<=lines.length);
  return lines.slice(r.startLine-1,r.endLine).join('\n');
}).join('\n');
const assertOpening=doc=>{
  const sc=doc.episodes[0].scenes[0],b=sc.flow[0];
  assert.equal(sc.sceneId,'S01');assert.ok(sc.characters.includes('C02'),'无台词齐叔必须是场次资产');
  assert.equal(b.action,sourceText(doc,b.sourceRefs).split('人物 ')[0].trim());
  assert.match(b.action,/堤坝值班室。程岚检查闸门状态，齐叔在门外等待。/);
};
const assertContinuity=doc=>{
  const segs=doc.episodes[0].segments;
  assert.deepEqual(segs[0].cuts[0].beats,[1,2]);
  for(const seg of segs.slice(1,4))assert.deepEqual(seg.cuts[0].audioRefs,[[1,2]],`${seg.id} 不能打断连续独白`);
  for(const seg of segs.slice(4))assert.equal(seg.cuts[0].audioRefs,undefined,'后续不得重播第一次独白');
  for(const seg of segs.slice(4,6)) {
    assert.ok(!seg.prompt.includes('程岚刚才的内心独白继续，不重新播放。'),'结构结束续声后提示词也须结束');
    assert.ok(seg.prompt.includes('当前镜头不延续此前的内心独白'));
  }
};
const assertOwnerBody=(body,line)=>{
  assert.ok(body.includes(`C01 程岚的主观内心独白（inner）`));
  assert.ok(body.includes('仅观众听见，C02 齐叔及场内人物均听不见，不张口说话'));
  assert.equal(body.split(line).length-1,1,'每个实际独白仅有一次完整文本');
};
let script,creation,W,cast,art;
try{
  script=materializeStory(temp,scriptPath);
  const first=resolve(dirname(scriptPath),script.provenance.documents[0].path);
  const castSeed=JSON.parse(success(cli('characters','seed','--source',first,'--title',script.source)).stdout);
  const artSeed=JSON.parse(success(cli('art','seed','--source',first,'--title',script.source)).stdout);
  castSeed.provenance=relocate(script,scriptPath,castPath).provenance;
  artSeed.provenance=relocate(script,scriptPath,artPath).provenance;
  const refs=(documentId,startLine)=>[{documentId,startLine,endLine:startLine}];
  // Independently registered from the actual two screenplay documents, not outline.
  cast=await identifyCast(root,castSeed,[{name:'程岚',speech:'speaking',sourceRefs:refs('D02',2)},{name:'齐叔',sourceRefs:refs('D01',2)}]);
  art=await identifyArt(root,artSeed,[{name:'值班室',sourceRefs:refs('D01',2)},{name:'廊道',sourceRefs:script.episodes[0].scenes[1].flow[0].sourceRefs},{name:'堤岸',sourceRefs:refs('D02',2)}]);
  write(castPath,cast);write(artPath,art);mapAssets(script,cast,art);write(scriptPath,script);
  await test('真实来源哈希、行号及重复文本的不同位置',()=>{
    for(const doc of script.provenance.documents)assert.ok(existsSync(resolve(dirname(scriptPath),doc.path)));
    const a=script.episodes[0].scenes[0].flow[1],b=script.episodes[0].scenes[2].flow[0];
    assert.equal(a.line,b.line);assert.notDeepEqual(a.sourceRefs,b.sourceRefs);
    success(validate());
    for(const ep of script.episodes)assert.ok(!('targetSeconds' in ep),'纯解析不虚构时长');
  });
  await test('原文实际内容进入正文：初始行动、无台词人物、长心理说明与有限让步',()=>{
    for(const d of script.provenance.documents){
      const bytes=readFileSync(resolve(dirname(scriptPath),d.path));
      assert.equal(d.sha256,createHash('sha256').update(bytes).digest('hex'));
      assert.equal(d.lineCount,bytes.toString('utf8').replace(/\n$/,'').split('\n').length);
    }
    assertOpening(script);
    const scenes=script.episodes[0].scenes,notes=scenes[0].notes[0];
    assert.equal(notes.text,sourceText(script,notes.sourceRefs).replaceAll('表演说明：',''));
    assert.equal(notes.text.split('\n\n').length,3);assert.ok(notes.text.length>600);
    for(const fact of ['七月十七日','三个月前','没有她的签名','不能因此认定齐叔就是开闸的人','让步只有复核实际水位这一项','完成检查','不发声','不朗读'])assert.ok(notes.text.includes(fact),fact);
    const continuity=scenes[1].notes[0];assert.equal(continuity.kind,'continuity');
    assert.equal(continuity.text,sourceText(script,continuity.sourceRefs).split('，').slice(1).join('，'));
    assert.equal(continuity.text,'程岚刚才的内心独白继续，不重新播放。');
    const lines=script.episodes.flatMap(e=>e.scenes.flatMap(s=>s.flow)).filter(b=>b.line);
    assert.equal(lines.length,2);assert.ok(lines.every(b=>b.speaker==='C01'));
    for(const b of lines){
      assert.equal(sourceText(script,b.sourceRefs),'程岚的内心独白：'+b.line);
      assert.deepEqual(b.audio,{mode:'inner',subjective:true,audibleTo:[]});
    }
    assert.ok(lines[0].sourceRefs[0].endLine<lines[1].sourceRefs[0].startLine);
    const lost=clone(script);lost.episodes[0].scenes[0].flow[0].action='程岚按住值班表。';
    assert.throws(()=>assertOpening(lost)); // Keeping refs cannot excuse missing action/location.
    const silent=clone(script);silent.episodes[0].scenes[0].characters=['C01'];assert.throws(()=>assertOpening(silent));
  });
  await test('解析时长可省略，生产 seed 必须拒绝；明确目标只在 script 保存',()=>{
    rejected(creationCLI('seed',scriptPath),/targetSeconds|目标|时长/i);
    // Confirmed fixture production targets, not durations claimed by the raw screenplay.
    script.episodes.forEach(ep=>ep.targetSeconds=ep.ep===1?54:12);write(scriptPath,script);
    const seeded=JSON.parse(success(creationCLI('seed',scriptPath)).stdout);
    assert.equal(seeded.schemaVersion,3);assert.ok(!('params' in script),'估时默认值不落盘');
    creation=planShots(seeded,script);write(creationPath,creation);
    assert.ok(creation.episodes.every(ep=>!('targetSeconds' in ep)),'制作计划不保存第二份目标时长');
    success(creationCLI('validate',creationPath));
    withScript(d=>delete d.episodes[0].targetSeconds,()=>{
      rejected(scriptCLI('validate',scriptPath,'--production-ready'),/targetSeconds|目标|时长/i);
      for(const args of [['validate',creationPath],['prompts','brief',creationPath,'--ep','1'],['export',creationPath,'--out',join(temp,'missing-target')]])
        rejected(creationCLI(...args),/targetSeconds|目标|时长/i);
      assert.ok(!existsSync(join(temp,'missing-target')));
    });
  });
  await test('来源覆盖按位置并集，重叠不会冒充已读取缺口',()=>{
    withScript(d=>{const c=d.provenance.coverage[0];d.provenance.coverage.push(clone(c));},()=>success(validate()));
    withScript(d=>{const c=d.provenance.coverage[0];c.endLine--;d.provenance.coverage.push(clone(c));},()=>rejected(validate(),/coverage|覆盖|source/i));
    withScript(d=>d.provenance.scope='partial',()=>success(validate()));
    const partial=clone(script);partial.provenance.scope='partial';delete partial.provenance.totalEpisodes;partial.episodes=partial.episodes.slice(1);mapAssets(partial,cast,art); // 实际原件从第二集开始，不改写原集号
    const file=join(temp,'detached','script','partial-script.json');write(file,relocate(partial,scriptPath,file));
    success(scriptCLI('validate',file,'--verify-sources'));
    withScript(d=>d.episodes.pop(),()=>rejected(validate(),/complete|totalEpisodes|完整|集/i));
  });
  for(const [name,change] of [
    ['非剧本来源',d=>d.provenance.kind='novel'],
    ['重复文档身份',d=>d.provenance.documents.push(clone(d.provenance.documents[0]))],
    ['零起点',d=>d.episodes[0].scenes[0].flow[1].sourceRefs[0].startLine=0],
    ['超出原文',d=>d.episodes[0].scenes[0].flow[1].sourceRefs[0].endLine=999],
    ['未知原文身份',d=>d.episodes[0].scenes[0].flow[1].sourceRefs[0].documentId='unknown'],
    ['正文没有依据',d=>delete d.episodes[0].scenes[0].flow[1].sourceRefs],
    ['说明没有依据',d=>delete d.episodes[0].scenes[0].notes[0].sourceRefs],
    ['双重正文种类',d=>d.episodes[0].scenes[0].flow[1].action='新增行动'],
    ['动作伪装发声方式',d=>d.episodes[0].scenes[0].flow[2].audio={mode:'inner'}],
    ['转译缺少授权',d=>d.episodes[0].scenes[0].flow[2].transformation={reason:'测试'}]
  ])await test(`来源与正文拒绝：${name}`,()=>withScript(change,()=>rejected(validate())));
  await test('来源修改和缺失必须在核验与真实制作材料入口阻断',()=>{
    const file=resolve(dirname(scriptPath),script.provenance.documents[0].path),bytes=readFileSync(file);
    try{
      writeFileSync(file,Buffer.concat([bytes,Buffer.from('来源新增一行\n')]));
      rejected(validate(),/SHA|changed|变化|来源|source/i);
      rejected(creationCLI('prompts','brief',creationPath,'--ep','1'),/SHA|changed|变化|来源|source/i);
    }finally{writeFileSync(file,bytes);}
    renameSync(file,file+'.held');
    try{rejected(validate(),/ENOENT|unreadable|source|来源/i);rejected(creationCLI('seed',scriptPath));}
    finally{renameSync(file+'.held',file);}
  });
  await test('派发说明、声音、字幕、跨场来源完整；说明与续声不重复估时',async()=>{
    const brief=JSON.parse(success(creationCLI('prompts','brief',creationPath,'--ep','1')).stdout);
    assert.deepEqual(brief.seedScenes[0].notes,script.episodes[0].scenes[0].notes);
    assert.deepEqual(brief.seedScenes[0].beats[1].audio,script.episodes[0].scenes[0].flow[1].audio);
    assert.deepEqual(brief.seedScenes[0].beats[1].sourceRefs,script.episodes[0].scenes[0].flow[1].sourceRefs);
    assert.deepEqual(brief.seedScenes[1].beats.map(b=>b.kind),['action','action','sound','subtitle']);
    assert.equal(brief.seedScenes[0].beats[0].text,script.episodes[0].scenes[0].flow[0].action);
    assert.ok(brief.seedScenes[0].characters.includes('C02'));
    assert.deepEqual(brief.seedScenes[1].notes,script.episodes[0].scenes[1].notes);
    assert.ok(brief.seedScenes[0].notes[0].text.includes('七月十七日'));
    assert.ok(brief.seedScenes[0].notes[0].text.includes('让步只有复核实际水位这一项'));
    for(const [si,sc] of script.episodes[0].scenes.entries())for(const [bi,b] of sc.flow.entries()){
      const actual=brief.seedScenes[si].beats[bi],kind=['action','line','sound','subtitle'].find(k=>k in b);
      assert.equal(actual.text,b[kind]);assert.deepEqual(actual.sourceRefs,b.sourceRefs);
      if(b.speaker)assert.equal(actual.speaker,b.speaker);
      if(b.audio)assert.deepEqual(actual.audio,b.audio);
    }
    const m=await import(pathToFileURL(join(root,'skills/mint-script/scripts/mint-script.mjs')));
    const ep=script.episodes[0],timeline=m.episodeTimeline(ep,{});
    assert.equal(timeline.length,9,'两次相同独白各自计入；非发声说明不占正文拍');
    const noNotes=clone(ep);noNotes.scenes.forEach(s=>delete s.notes);
    assert.equal(m.episodeTimeline(noNotes,{}).at(-1).endSeconds,timeline.at(-1).endSeconds);
    const expected=2*ep.scenes[0].flow[1].line.replace(/\s/g,'').length/4.5+5*2.5+4;
    assert.ok(Math.abs(timeline.at(-1).endSeconds-expected)<1e-9,'同一次续声不增加原始正文时长');
  });
  await test('长独白超出所属镜头容量，连续跨镜只认领和估时一次',async()=>{
    assertContinuity(creation);
    const gap=clone(creation);delete gap.episodes[0].segments[1].cuts[0].audioRefs;
    assert.throws(()=>assertContinuity(gap),/不能打断连续独白/);
    const m=await import(pathToFileURL(join(root,'skills/mint-creation/scripts/mint-creation.mjs')));
    const stats=m.computeStats(creation,script),segments=creation.episodes[0].segments;
    assert.equal(stats.dialogue.length,2);assert.deepEqual(stats.dialogue.map(d=>d.segment),['E01-01','E01-07']);
    const estimate=script.episodes[0].scenes[0].flow[1].line.length/4.5;
    assert.ok(estimate>segments[0].cuts[0].seconds,'所属镜头不能独自容纳第一次独白');
    assert.ok(estimate<=segments.slice(0,4).reduce((n,s)=>n+s.cuts[0].seconds,0));
    assert.ok(estimate<=segments[6].cuts[0].seconds,'第二次实际独白有自己的容量');
    assert.ok(Math.abs(stats.dialogue.reduce((n,d)=>n+d.seconds,0)-estimate*2)<1e-9);
    assert.equal(segments.length,8,'三段长心理说明没有各自增加镜头');
    const noContinuation=clone(creation);noContinuation.episodes[0].segments.forEach(s=>delete s.cuts[0].audioRefs);
    write(creationPath,noContinuation);
    try{rejected(creationCLI('validate',creationPath),/台词|时长|容纳/);}finally{write(creationPath,creation);}
    const noNotes=clone(script);noNotes.episodes.forEach(e=>e.scenes.forEach(s=>delete s.notes));
    const without=planShots(JSON.parse(success(creationCLI('seed',scriptPath)).stdout),noNotes);
    assert.deepEqual(without.episodes.map(e=>e.segments.map(s=>s.cuts)),creation.episodes.map(e=>e.segments.map(s=>s.cuts)));
  });
  for(const [name,change] of [
    ['漏领正文',d=>d.episodes[0].segments.pop()],
    ['重复认领',d=>d.episodes[0].segments[1].cuts[0].beats=[1,1]],
    ['镜头顺序倒置',d=>d.episodes[0].segments.reverse()],
    ['续声重复坐标',d=>d.episodes[0].segments[2].cuts[0].audioRefs=[[1,2],[1,2]]],
    ['续声指向动作',d=>d.episodes[0].segments[2].cuts[0].audioRefs=[[1,3]]],
    ['续声指向未来独白',d=>d.episodes[0].segments[2].cuts[0].audioRefs=[[3,1]]],
    ['续声指向本镜头',d=>d.episodes[0].segments[0].cuts[0].audioRefs=[[1,2]]],
    ['续声越界',d=>d.episodes[0].segments[2].cuts[0].audioRefs=[[99,1]]],
    ['字幕不允许负秒数',null]
  ])await test(`制作覆盖拒绝：${name}`,()=>{
    assert.ok(creation,'完整制作基线尚未就绪');
    if(!change)return withScript(d=>d.episodes[0].scenes[1].flow[3].seconds=-1,()=>rejected(creationCLI('validate',creationPath)));
    const d=clone(creation);change(d);write(creationPath,d);
    try{
      rejected(creationCLI('validate',creationPath));
      if(name.startsWith('续声'))rejected(validate(),/audioRefs|续声|continuation/i);
    }finally{write(creationPath,creation);}
  });
  await test('真实工作单 init → check → review → verdict → apply → export',async()=>{
    assert.ok(creation);W=await import(pathToFileURL(join(root,'skills/mint-creation/scripts/lib/worksheet.mjs')));
    success(creationCLI('prompts','init',creationPath));success(creationCLI('prompts','check',creationPath));
    rejected(creationCLI('prompts','apply',creationPath),/批准|approved/i);
    const unapproved=join(temp,'unapproved');rejected(creationCLI('export',creationPath,'--out',unapproved));assert.ok(!existsSync(unapproved));
    for(const ep of creation.episodes)for(const seg of ep.segments){
      const file=join(dirname(creationPath),seg.id,'prompt.md'),sheet=W.parseWorksheet(readFileSync(file,'utf8'));
      assert.equal(sheet.body,seg.prompt.trim());
      const sc=script.episodes[ep.ep-1].scenes[seg.sceneIndex-1];
      for(const note of sc.notes??[]) {
        if(note.kind==='continuity' && !seg.cuts.some(c=>c.audioRefs?.length)) {
          assert.ok(sheet.body.includes('当前镜头不延续此前的内心独白；该次声音已在前段结束，不重播。'));
          assert.ok(!sheet.body.includes(note.text),'已结束续声不能作为当前镜头执行指令重复传递');
        } else assert.ok(sheet.body.includes(note.text),'当前相关说明实际进入工作单正文');
      }
      if(['E01-01','E01-07'].includes(seg.id))assertOwnerBody(sheet.body,script.episodes[0].scenes[0].flow[1].line);
      if(seg.id==='E01-01')assert.ok(sheet.body.includes(script.episodes[0].scenes[0].flow[0].action));
      write(file,W.serializeWorksheet({...sheet,meta:{...sheet.meta,status:'in_review',round:1},review:'# 视频提示词审核\n\n- 审核结论：通过\n\n## 返修意见\n\n## 待确认事项'}));
      success(creationCLI('prompts','verdict',creationPath,'approved',seg.id));
    }
    success(creationCLI('prompts','status',creationPath));success(creationCLI('prompts','apply',creationPath));
    const applied=JSON.parse(readFileSync(creationPath,'utf8'));
    assert.deepEqual(applied.episodes[0].segments[2].cuts[0].audioRefs,[[1,2]]);
    const out=join(temp,'export');success(creationCLI('export',creationPath,'--out',out));
    const manifest=JSON.parse(readFileSync(join(out,'manifest.json'),'utf8'));assert.equal(manifest.segments.length,10);
    assertContinuity(applied);
    for(const entry of manifest.segments){
      const sheet=W.parseWorksheet(readFileSync(resolve(out,entry.prompt),'utf8'));
      const seg=applied.episodes.flatMap(e=>e.segments).find(s=>s.id===entry.segment);
      assert.equal(sheet.body,seg.prompt.trim());assert.equal(sheet.meta.status,'approved');
      assert.deepEqual(sheet.structure.cuts,seg.cuts);
      if(['E01-01','E01-07'].includes(entry.segment))assertOwnerBody(sheet.body,script.episodes[0].scenes[0].flow[1].line);
    }
    const first=applied.episodes[0].segments[0].prompt,line=script.episodes[0].scenes[0].flow[1].line;
    assert.throws(()=>assertOwnerBody(first.replace(/C01 程岚的主观内心独白（inner）.*?：“/,''),line));
    for(const seg of applied.episodes[0].segments.slice(1,4)){
      assert.ok(!seg.prompt.includes(line));assert.match(seg.prompt,/C01 程岚此前的主观内心独白继续/);
      assert.match(seg.prompt,/同一次播放，不重新开始/);assert.match(seg.prompt,/场内人物均听不见/);
    }
    // Continuation prompt deliberately does not repeat the owner's words. Owner still must.
    assert.ok(!applied.episodes[0].segments[2].prompt.includes(script.episodes[0].scenes[0].flow[1].line));
    const owner=join(dirname(creationPath),'E01-01','prompt.md'),before=readFileSync(owner,'utf8');
    try{write(owner,before.replace(script.episodes[0].scenes[0].flow[1].line,'删去原句'));rejected(creationCLI('prompts','check',creationPath));}
    finally{write(owner,before);}
  });
  const stale=()=>{
    const r=creationCLI('prompts','status',creationPath);
    return {r,ids:r.stdout.split('\n').filter(l=>l.startsWith('✗')).map(l=>l.split(/\s+/)[1]).sort()};
  };
  for(const [name,change,expected] of [
    ['声音方式',d=>d.episodes[0].scenes[0].flow[1].audio.mode='voiceover',['E01-01','E01-02','E01-03','E01-04']],
    ['来源坐标',d=>d.episodes[0].scenes[0].flow[1].sourceRefs[0].endLine=4,['E01-01','E01-02','E01-03','E01-04']],
    ['跨场来源说明',d=>d.episodes[0].scenes[0].notes[0].text+='不得微笑。',['E01-01','E01-02','E01-03','E01-04']],
    ['连续性说明',d=>d.episodes[0].scenes[1].notes[0].text+='保持同一次播放。',['E01-03','E01-04','E01-05','E01-06']],
    ['无关集说明',d=>d.episodes[1].scenes[0].notes[0].text+='保持未知。',['E02-01','E02-02']]
  ])await test(`批准局部失效：${name}`,()=>{
    success(stale().r);
    withScript(change,()=>{
      const result=stale();rejected(result.r);assert.deepEqual(result.ids,expected);
      rejected(creationCLI('prompts','apply',creationPath),/输入|失效|source/i);
      const out=join(temp,'stale-export');rejected(creationCLI('export',creationPath,'--out',out));assert.ok(!existsSync(out));
    });
    success(stale().r);
  });
  await test('原文更新后重新核验映射仍让实际依赖该文档的批准失效，其他集不连带',async()=>{
    success(stale().r);
    const file=resolve(dirname(scriptPath),script.provenance.documents[0].path),before=readFileSync(file);
    const castBefore=readFileSync(castPath),artBefore=readFileSync(artPath);
    try{
      // Same line count, different bytes: coordinates do not identify the version.
      writeFileSync(file,before.toString('utf8').replace('第一集','第壹集'));
      const sha256=createHash('sha256').update(readFileSync(file)).digest('hex');
      withScript(d=>d.provenance.documents[0].sha256=sha256,()=>rejected(validate(),/version|版本|source|来源/i));
      const identity=await import(pathToFileURL(join(root,'skills/mint-characters/scripts/lib/identity.mjs')));
      const stage=await import(pathToFileURL(join(root,'skills/mint-art/scripts/lib/stage.mjs')));
      const candidate=clone(cast);candidate.provenance.documents[0].sha256=sha256;
      const currentCast=identity.reconcile(candidate,cast);currentCast.status='identified';
      currentCast.review={status:'confirmed',by:'root-fixture-author',note:'原文标题改字，复读身份及来源后明确确认。',inputHash:identity.reviewHash(currentCast)};
      const currentArt=clone(art);currentArt.provenance.documents[0].sha256=sha256;
      for(const a of [...currentArt.scenes,...currentArt.props])a.identityReview.inputDigest=stage.identityDigest(currentArt,a);
      write(castPath,currentCast);write(artPath,currentArt);
      withScript(d=>{d.provenance.documents[0].sha256=sha256;mapAssets(d,currentCast,currentArt);},()=>{
        success(validate());
        const result=stale();rejected(result.r);
        assert.deepEqual(result.ids,creation.episodes[0].segments.map(s=>s.id).sort());
        rejected(creationCLI('prompts','apply',creationPath));
      });
    }finally{writeFileSync(file,before);writeFileSync(castPath,castBefore);writeFileSync(artPath,artBefore);}
  });
  await test('根样例 outline → script seed → B 认领 → 制作材料 → 工作单批准协议 → 导出',async()=>{
    const base=join(temp,'outline-chain'),op=join(base,'outline','堤灯-outline.json'),sp=join(base,'script','堤灯-script.json'),cp=join(base,'creation','堤灯-creation.json');
    const outline=outlineFor(script,scriptPath,op);write(op,outline);
    success(cli('outline','validate',op,'--verify-sources'));
    const seeded=JSON.parse(success(scriptCLI('seed',op,'--output-path',sp)).stdout);
    assert.deepEqual(seeded.provenance,relocate(script,scriptPath,sp).provenance);
    assert.deepEqual(seeded.episodes.map(e=>e.beatClaims.map(c=>c.beatId)),[['B01','B02'],['B03']]);
    // Fill the real seed from the previously source-checked execution, retaining its B identities.
    seeded.episodes.forEach((ep,i)=>{
      assert.deepEqual(ep.beatClaims.map(c=>c.beatId),script.episodes[i].beatClaims.map(c=>c.beatId));
      Object.assign(ep,clone(script.episodes[i]));
    });mapAssets(seeded,cast,art);write(sp,seeded);
    success(scriptCLI('validate',sp,'--outline',op,'--verify-sources'));
    const missing=clone(seeded);missing.episodes[0].beatClaims.pop();write(sp,missing);
    try{rejected(scriptCLI('validate',sp,'--outline',op),/B02|beat|认领/i);}finally{write(sp,seeded);}
    const cc=(...args)=>cli('creation',...args,'--script',sp,'--outline',op,'--cast',castPath,'--art',artPath,'--no-production');
    const planned=planShots(JSON.parse(success(cc('seed',sp)).stdout),seeded);write(cp,planned);
    success(cc('validate',cp));
    const m=await import(pathToFileURL(join(root,'skills/mint-creation/scripts/mint-creation.mjs')));
    const context=m.reportContext(planned,{script:seeded,outline,cast,art});
    assert.deepEqual(context.episodes.flatMap(e=>e.nodes.map(n=>[n.id,n.startCuts,n.endCuts])),[
      ['B01',['E01-01#1'],['E01-02#1']],['B02',['E01-07#1'],['E01-08#1']],['B03',['E02-01#1'],['E02-02#1']]
    ]);
    for(const ep of planned.episodes){
      const brief=JSON.parse(success(cc('prompts','brief',cp,'--ep',String(ep.ep))).stdout);
      assert.equal(brief.intent.planSource,'outline');
      for(const claim of brief.beatClaims){
        const fact=outline.beats.find(b=>b.id===claim.beatId);
        assert.deepEqual(claim.fact,fact);assert.deepEqual(claim.sourceRefs,fact.sourceRefs);
        assert.ok(claim.sourceDocuments.every(d=>existsSync(d.path)));
      }
      const silent=brief.assets.characters.find(c=>c.id==='C02');assert.equal(silent.name,'齐叔');
      assert.deepEqual(silent.sourceRefs,cast.characters[1].sourceRefs);
    }
    success(cc('prompts','init',cp));success(cc('prompts','check',cp));
    rejected(cc('export',cp,'--out',join(base,'unapproved')));assert.ok(!existsSync(join(base,'unapproved')));
    for(const seg of planned.episodes.flatMap(e=>e.segments)){
      const file=join(dirname(cp),seg.id,'prompt.md'),sheet=W.parseWorksheet(readFileSync(file,'utf8'));
      assert.equal(sheet.body,seg.prompt.trim());
      write(file,W.serializeWorksheet({...sheet,meta:{...sheet.meta,status:'in_review',round:1},review:'# 视频提示词审核\n\n- 审核结论：通过\n\n## 返修意见\n\n## 待确认事项'}));
      success(cc('prompts','verdict',cp,'approved',seg.id));
    }
    success(cc('prompts','status',cp));success(cc('prompts','apply',cp));
    const out=join(base,'export');success(cc('export',cp,'--out',out));
    const manifest=JSON.parse(readFileSync(join(out,'manifest.json'),'utf8'));assert.equal(manifest.segments.length,10);
    for(const entry of manifest.segments){
      const sheet=W.parseWorksheet(readFileSync(resolve(out,entry.prompt),'utf8'));
      assert.equal(sheet.body,planned.episodes.flatMap(e=>e.segments).find(s=>s.id===entry.segment).prompt.trim());
    }
  });
}finally{rmSync(temp,{recursive:true,force:true});}
console.log(`本次 ${passed} 组通过，${failures.length} 组失败；${calls} 次真实 CLI。批准仅模拟协议，未执行独立语义审核、图片或视频生成、粗剪。`);
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
