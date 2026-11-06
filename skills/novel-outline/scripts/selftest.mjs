#!/usr/bin/env node
// No paid models, network, images, siblings or persistent test logs.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,cpSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {checkup,validateOutline,gateReport,computeAssets,createSkeleton,newQuestion,chunkVolumes,detectChapters,MAX_VOLUMES,FALLBACK_CHUNK,FALLBACK_OVERLAP,slug,primarySceneCap,findProduction,loadProduction,autopilotOf,stageDirNote,renderHtml,renderMarkdown,fmtEps,migrationDraft,SKILL_ROOT} from './novel-outline.mjs';
import {neutralParams,previewApplication,applyToFile,resolveProfiles,validateParams,discoverProfiles} from './lib/creative.mjs';
const HERE=dirname(fileURLToPath(import.meta.url)), CLI=join(HERE,'novel-outline.mjs');
const FIXTURE=JSON.parse(readFileSync(join(SKILL_ROOT,'examples/旧站时刻-outline.json'),'utf8'));
let count=0;
const ok=(v,m)=>{assert.ok(v,m);count++;};
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++;};
const throws=(f,m)=>{assert.throws(f,undefined,m);count++;};
const clone=x=>structuredClone(x??FIXTURE);
const gate=(d,id,options)=>checkup(d,options).gates.find(g=>g.id===id);
const bad=(mutate,id='fields',stage='full')=>{const d=clone();mutate(d);eq(gate(d,id,{stage}).status,'fail',id+' defeats malformed input');return d;};
const good=d=>eq(validateOutline(d),[],'full contract passes');
const selection=(structure='serial',pacing='gradual',genre='mystery',style='restrained')=>Object.fromEntries(Object.entries({genre,narrativeStyle:style,structure,pacing}).map(([k,id])=>[k,{id,version:'1.0.0'}]));
const apply=(doc,sel,skillRoot=SKILL_ROOT,overrides={})=>{const opts={skillRoot,stage:'outline',selection:sel,overrides};const p=previewApplication(doc,opts);return previewApplication(doc,{...opts,decisions:Object.fromEntries(p.decisionsRequired.filter(p=>!(p in overrides)).map(p=>[p,'drop']))}).document;};
const tmp=mkdtempSync(join(tmpdir(),'outline-v2-selftest-'));
const json=(path,doc)=>writeFileSync(path,JSON.stringify(doc,null,2)+'\n');
const run=(...args)=>spawnSync(process.execPath,[CLI,...args],{encoding:'utf8',timeout:20000});
try {
  // Original story and immutable, phased reading.
  good(FIXTURE);
  const before=JSON.stringify(FIXTURE);
  for(const stage of ['skeleton','beats','full'])eq(validateOutline(FIXTURE,stage),[],stage+' example');
  eq(JSON.stringify(FIXTURE),before,'validation never mutates');
  ok(!('ok' in gateReport(FIXTURE)[0]),'status only, no legacy ok');
  eq(checkup(FIXTURE).contentReview,'not-performed');
  const s=clone();delete s.beats;delete s.episodes;delete s.story.endingBeatId;
  eq(validateOutline(s,'skeleton'),[]);
  eq(checkup(s,{stage:'skeleton'}).complete,false);
  eq(gate(s,'beats',{stage:'skeleton'}).reason,'stage-incomplete');
  eq(gate(s,'endingModes',{stage:'beats'}).reason,'stage-incomplete');
  eq(gate(s,'payoffCoverage',{stage:'skeleton'}).reason,'policy-disabled');
  ok(validateOutline(s,'beats').length>0);ok(validateOutline(s,'full').length>0);
  const b=clone();delete b.episodes;eq(validateOutline(b,'beats'),[]);
  eq(gate(b,'questions',{stage:'beats'}).reason,'stage-incomplete');
  const empty=createSkeleton({source:'测试',episodes:3,minutesPerEpisode:2,genre:'生活'});
  eq(empty.params.rules,neutralParams('outline').rules);
  eq(empty.params.defaults.questionResolveWithin,null);
  ok(validateOutline(empty,'skeleton').length>0,'factory is an honest incomplete draft');

  // Version, types, all registered rules, old fields, budget boundaries.
  bad(d=>delete d.schemaVersion);bad(d=>d.schemaVersion=1);
  for(const v of [0,-1,1.2,'6',null,Infinity,NaN])bad(d=>d.params.episodes=v);
  for(const v of [0,-1,'3',null,Infinity,NaN])bad(d=>d.params.minutesPerEpisode=v);
  for(const v of [null,[],42])bad(d=>d.params=v);
  bad(d=>d.source='');bad(d=>d.lang='fr');bad(d=>d.params.genre='');bad(d=>d.params.adaptMode='auto');
  bad(d=>d.params.preferences='unexpected');
  for (const [description, expected] of [['苏雨晴在室内核对记录。', 'pass'], ['雨棚下的桌子已经收好。', 'pass'], ['苏雨晴走进大雨里。', 'fail']]) {
    const d = clone();
    for (const ep of d.episodes) { ep.synopsis = description; ep.opening = description; ep.ending.event = description; ep.warnings = []; }
    eq(gate(d, 'risk-scan').status, expected, '天气候选不由人名单字或雨棚推导');
  }
  bad(d=>d.episodes[0].ending.question.reason=42,'questions');
  const damagedProduction=checkup(FIXTURE,{productionError:'bad JSON'});
  eq(damagedProduction.gates.find(g=>g.id==='creative-project').status,'fail');
  ok(!damagedProduction.gates.some(g=>g.id==='creative-project'&&g.reason==='missing-upstream'));
  for(const key of Object.keys(neutralParams('outline').rules))bad(d=>delete d.params.rules[key]);
  bad(d=>d.params.rules.payoffCoverage={level:'off',minPerEpisode:1});
  bad(d=>d.params.rules.payoffCoverage={level:'warn',minPerEpisode:'1'});
  bad(d=>d.params.rules.payoffCoverage={level:'silent'});
  bad(d=>d.params.rules.unknown={level:'off'});
  bad(d=>delete d.params.defaults);bad(d=>d.params.defaults.questionResolveWithin=0);
  for(const key of ['pacing','maxBeatGap','hookWindow','maxLineChars','minCutSeconds','maxCutSeconds'])bad(d=>d.params[key]=3);
  bad(d=>d.params.thresholds.maxBeatGap=99);bad(d=>d.params.thresholds.maxLeads='3');bad(d=>d.params.thresholds.maxProps=0);
  bad(d=>d.params.thresholds=[]);bad(d=>d.assets={});
  eq(primarySceneCap(6),5);eq(primarySceneCap(60),10);eq(primarySceneCap(300),15);eq(primarySceneCap(),8);
  for(const [key,id,value] of [['maxLeads','lead-cap',1],['maxPrimaryScenes','scene-cap',1],['maxProps','prop-cap',1]])bad(d=>d.params.thresholds[key]=value,id);
  for(const [tier,id] of [['support','support-cap'],['functional','functional-cap']]) {
    const d=clone();d.characters.forEach(c=>c.tier=tier);d.params.thresholds[tier==='support'?'maxSupport':'maxFunctional']=1;
    eq(gate(d,id).status,'fail');
  }
  const noLead=clone();noLead.characters.filter(c=>c.tier==='lead').forEach(c=>c.tier='support');good(noLead);
  // Story and adaptation preserve real values without old fixed victory/cut rules.
  for(const k of ['premise','throughline','audiencePromise','ending'])bad(d=>d.story[k]='','story');
  for(const ids of [[],['C99'],['C01','C01'],'C01'])bad(d=>d.story.focusCharacterIds=ids,'story');
  bad(d=>d.story.drive=[],'story');bad(d=>d.story.endingBeatId='B01','ending-beat');bad(d=>d.story.endingBeatId='B99','ending-beat');
  bad(d=>d.adaptation=null,'adaptation');bad(d=>d.adaptation.keep=[{what:'x'}],'adaptation');
  bad(d=>d.adaptation.risks=[{what:'x',plan:''}],'adaptation');bad(d=>d.adaptation.cutNote='','adaptation');
  bad(d=>d.adaptation.keep[0].evidence='','adaptation');
  const faithful=clone();faithful.params.adaptMode='抽核';faithful.adaptation.cut=[];good(faithful);
  // Asset IDs, types, optional reuse, functional arcs and arbitrary-kind prop links.
  for(const [field,prefix] of [['characters','C'],['scenes','S'],['props','P']]) {
    bad(d=>d[field][0].id='X1','assets');bad(d=>d[field][1].id=d[field][0].id,'assets');bad(d=>d[field]=null,'assets');
    const d=clone();d[field][0].id=prefix+'100';ok(!gate(d,'assets').messages.some(m=>m.includes('IDs')));
  }
  bad(d=>delete d.characters[0].from,'assets');bad(d=>d.characters[0].from=[''],'assets');bad(d=>delete d.characters[0].arc,'assets');bad(d=>d.characters[0].tier='unknown','assets');
  bad(d=>delete d.scenes[0].primary,'assets');bad(d=>d.scenes[0].reusePlan='','assets');
  bad(d=>delete d.props[0].function,'assets');bad(d=>d.props[0].beatIds=['B01','B01'],'assets');
  bad(d=>d.props[0].beatIds=['B99'],'prop-beats');
  const propEvent=clone();propEvent.props[0].beatIds=['B01'];good(propEvent);
  const noProps=clone();delete noProps.props;noProps.episodes.forEach(e=>delete e.propIds);good(noProps);eq(gate(noProps,'prop-cap').reason,'not-applicable');
  const once=clone();delete once.scenes[2].reusePlan;good(once);
  // Beat ID, positional order, classification and weight cannot be bypassed by off rules.
  for(const mutation of [d=>d.beats=[],d=>d.beats[0].id='x',d=>d.beats[1].id='B01',d=>d.beats[0].episode=99,d=>d.beats[0].episode=0,d=>d.beats[0].position='center',d=>d.beats[0].kind='win',d=>d.beats[0].type='',d=>d.beats[0].outcome='',d=>d.beats[0].setup='',d=>d.beats[0].weight='minor',d=>delete d.beats[5].weight,d=>d.beats[5].weight='super',d=>d.beats[0].payoff='legacy',d=>d.beats.reverse(),d=>d.beats[0].resolves='Q01'])bad(mutation,'beats');
  // Endings and questions are actual commitments, independent of policy.
  for(const mutation of [d=>d.episodes.pop(),d=>d.episodes[0].ep=2,d=>d.episodes[0].opening='',d=>d.episodes[0].synopsis='',d=>d.episodes[0].ending.mode='win',d=>d.episodes[0].ending.event='',d=>d.episodes[0].ending.extra=1,d=>d.episodes[0].stateChange={before:''},d=>d.episodes[0].warnings='rain',d=>d.episodes[0].sceneIds=[],d=>d.episodes[0].characterIds=['C01','C01'],d=>d.episodes[0].propIds='P01'])bad(mutation,'episodes');
  for(const key of ['hook','suspense','crowdPlan','beatIds'])bad(d=>d.episodes[0][key]='legacy','episodes');
  for(const [field,id] of [['sceneIds','S99'],['characterIds','C99'],['propIds','P99']])bad(d=>d.episodes[0][field]=[id],'references');
  bad(d=>d.episodes.forEach(e=>e.characterIds=e.characterIds.filter(x=>x!=='C03')),'references');
  for(const mutation of [d=>delete d.episodes[0].ending.question,d=>d.episodes[1].ending.question=null,d=>d.episodes[0].ending.question.id='x',d=>d.episodes[2].ending.question.id='Q01',d=>delete d.episodes[0].ending.question.text,d=>d.episodes[0].ending.question.resolution='later',d=>d.episodes[0].ending.question.extra=1,d=>d.episodes[0].ending.question.dueByEp=1,d=>d.episodes[0].ending.question.dueByEp=7,d=>d.episodes[0].ending.question.dueByEp=2.5,d=>delete d.episodes[5].ending.question.reason,d=>d.episodes[5].ending.question.dueByEp=6,d=>d.episodes[5].ending.question.resolution='required',d=>d.beats[2].resolves=[],d=>d.beats[2].resolves=['Q99'],d=>d.beats[3].resolves=['Q01'],d=>{d.beats[0].resolves=['Q01'];d.beats[2].resolves=[];},d=>{d.episodes[0].ending.question.dueByEp=2;d.beats[2].resolves=[];d.beats[3].resolves=['Q01'];}])bad(mutation,'questions');
  const optional=clone();optional.episodes[0].ending.question.resolution='optional';optional.episodes[0].ending.question.reason='保留未知去向';delete optional.episodes[0].ending.question.dueByEp;optional.beats[2].resolves=[];good(optional);
  optional.beats[2].resolves=['Q01'];good(optional);optional.beats[3].resolves=['Q01'];eq(gate(optional,'questions').status,'fail');
  const noQ=clone();noQ.episodes.forEach(e=>e.ending={mode:'closure',event:e.ending.event});noQ.beats.forEach(b=>delete b.resolves);good(noQ);
  // Arcs: optional, partial and event endpoints valid; overlap/invalid refs never valid.
  for(const mutation of [d=>d.arcs='x',d=>d.arcs[0].id='X01',d=>d.arcs[0].startEp=0,d=>d.arcs[0].endEp=7,d=>d.arcs[0].startEp=5,d=>d.arcs[0].endBeatId='B01',d=>d.arcs[0].goal='',d=>d.arcs.push({...d.arcs[0],id:'A02'})])bad(mutation,'arcs');
  const noArcs=clone();delete noArcs.arcs;good(noArcs);
  const emptyArcs=clone();emptyArcs.arcs=[];good(emptyArcs);

  // Rule-specific failure, warning, off and not-applicable behavior.
  const cases={payoffCoverage:{level:'error',minPerEpisode:1},firstMajor:{level:'error',byEpisode:3},majorGap:{level:'error',maxGap:1},endingPayoff:{level:'error',minWeight:'major'},endingModes:{level:'error',nonFinal:['suspense'],final:['closure']},optionalQuestions:{level:'error',allow:false},stateProgress:{level:'error'},arcCoverage:{level:'error'},arcPayoff:{level:'error',minWeight:'major'}};
  for(const [key,rule] of Object.entries(cases)) {
    const d=clone();d.params.rules[key]=rule;
    if(key==='majorGap'){d.beats[0].kind='payoff';d.beats[0].weight='major';}
    if(key==='stateProgress')d.episodes[0].stateChange.after=d.episodes[0].stateChange.before;
    eq(gate(d,key).status,'fail',key+' error failure');ok(validateOutline(d).length>0);
    d.params.rules[key].level='warn';eq(gate(d,key).status,'fail');eq(gate(d,key).level,'warn');eq(checkup(d).stats.fail,0);ok(checkup(d).stats.warn>0);
    d.params.rules[key]={level:'off'};eq(gate(d,key).status,'skipped');eq(gate(d,key).reason,'policy-disabled');eq(checkup(d).stats.warn,0);
  }
  for(const key of ['arcCoverage','arcPayoff']) {const d=clone();d.arcs=[];d.params.rules[key]=cases[key];eq(gate(d,key).reason,'not-applicable');}
  const gap=clone();gap.params.rules.majorGap=cases.majorGap;eq(gate(gap,'majorGap').reason,'not-applicable');
  const disabled=clone();disabled.params.rules={...neutralParams('outline').rules};disabled.episodes.forEach(e=>delete e.stateChange);good(disabled);
  disabled.episodes[0].stateChange={before:'x',after:''};eq(gate(disabled,'episodes').status,'fail');
  // Duplicate major episodes do not manufacture gap intervals.
  const dup=clone();dup.beats[6].kind='payoff';dup.beats[6].weight='major';dup.params.rules.majorGap={level:'error',maxGap:1};eq(gate(dup,'majorGap').reason,'not-applicable');
  const deadline={id:'Q10',text:'测试',resolution:'required'};
  const params={episodes:6,defaults:{questionResolveWithin:2}};
  eq(newQuestion(deadline,1,params).dueByEp,3);eq(newQuestion(deadline,5,params).dueByEp,6);eq(deadline.dueByEp,undefined);
  eq(newQuestion({...deadline,dueByEp:5},1,params).dueByEp,5);
  eq(newQuestion({...deadline,resolution:'optional',reason:'余味'},1,params).dueByEp,undefined);
  eq(newQuestion(deadline,1,{...params,defaults:{questionResolveWithin:null}}).dueByEp,undefined);
  const oldDeadline=clone();oldDeadline.params.defaults.questionResolveWithin=1;eq(oldDeadline.episodes[0].ending.question.dueByEp,3);good(oldDeadline);

  // Three combinations: meaningful isolated local fixtures, same core code.
  function compact(kind) {
    const d=clone();delete d.creativeContext;d.params.episodes=3;d.characters=d.characters.slice(0,3);d.scenes=d.scenes.slice(0,2);d.props=[];d.arcs=[];
    const outcomes=kind==='dense'?['回执证明末班车已到站，林蔚解除当前失踪误报。','旧留底推翻司机归责，程安取得正式更正凭据。','许钟署名承担旧漏报责任，更正与原件共同交存。']:['林蔚为常客补写清晰的临时换乘时刻，完成当日咨询。','许钟与程安将归还的站牌分类，留下供社区使用的一块。','两人整理完最后一箱资料，关门后各自走向新的日常。'];
    d.beats=outcomes.map((outcome,i)=>({id:'B0'+(i+1),episode:i+1,position:'ending',kind:kind==='dense'?'payoff':'event',...(kind==='dense'?{weight:'major'}:{}),type:kind==='dense'?'责任更正':'站务日常',setup:'撤站前处理实际遗留事务',outcome,...(kind==='dense'&&i>0?{resolves:['Q0'+i]}:{})}));
    d.story.endingBeatId='B03';
    d.episodes=outcomes.map((outcome,i)=>({ep:i+1,opening:'站务员开始处理当日留待解决的事项。',synopsis:outcome,ending:kind==='dense'&&i<2?{mode:'suspense',event:outcome,question:{id:'Q0'+(i+1),text:i===0?'旧归责是否有依据？':'许钟是否愿意签署更正？',resolution:'required',dueByEp:i+2}}:{mode:'closure',event:outcome},stateChange:{before:'事项待核对',after:outcome},characterIds:['C01','C02','C03'],sceneIds:['S01','S02'],propIds:[],warnings:[]}));
    if(kind==='dense')d.arcs=[{id:'A01',startEp:1,endEp:3,goal:'核对并公开新旧漏报',endBeatId:'B03'}];
    return apply(d,kind==='dense'?selection('serial-cliff','dense-payoff','drama','intense'):selection('episodic','measured','life','warm'));
  }
  const dense=compact('dense'),measured=compact('measured'),gradual=apply(clone(),selection());
  const invalidCount=clone(dense);invalidCount.params.episodes=Infinity;
  eq(gate(invalidCount,'payoffCoverage').status,'fail','invalid count cannot cause an unbounded coverage loop');
  invalidCount.params.episodes=1000000000;
  eq(gate(invalidCount,'payoffCoverage').status,'fail','large planned count is checked without iteration');
  const minorFinal=clone(dense);minorFinal.beats[2].weight='minor';minorFinal.params.rules.endingPayoff.minWeight='minor';minorFinal.params.rules.arcPayoff.minWeight='minor';good(minorFinal);
  const clamped=clone(dense);clamped.params.rules.firstMajor.byEpisode=99;eq(gate(clamped,'firstMajor').status,'pass');
  clamped.beats.forEach(b=>b.weight='minor');eq(gate(clamped,'firstMajor').status,'fail','first major still required with a large bound');
  for(const d of [dense,measured,gradual]){good(d);eq(gate(d,'creative-project',{production:{creative:{version:1,selection:d.creativeContext.selection}}}).status,'pass');}
  ok(gradual.episodes.some(e=>!gradual.beats.some(b=>b.episode===e.ep&&b.kind==='payoff')),'gradual has real zero-payoff episode');
  ok(measured.episodes.some(e=>e.ep<3&&e.ending.mode==='closure'),'measured non-final closure');
  eq(gate(dense,'payoffCoverage').status,'pass');eq(gate(measured,'payoffCoverage').reason,'policy-disabled');
  const switched=apply(dense,selection('episodic','measured','life','warm'));
  eq(switched.params.rules.payoffCoverage,{level:'off'});eq(switched.params.defaults.questionResolveWithin,null);
  eq(switched.params.episodes,dense.params.episodes);eq(switched.params.minutesPerEpisode,dense.params.minutesPerEpisode);eq(switched.params.thresholds,dense.params.thresholds);eq(switched.beats,dense.beats);eq(switched.episodes,dense.episodes);
  eq(gate(switched,'creative-project',{production:{creative:{version:1,selection:dense.creativeContext.selection}}}).status,'fail','switch requires project synchronization');

  // Consumer source integration: historical source drift doesn't mutate params.
  const isolated=join(tmp,'isolated');cpSync(SKILL_ROOT,isolated,{recursive:true});
  const guide=join(isolated,'references/profiles/pacing/gradual/1.0.0/guide.md'),originalGuide=readFileSync(guide,'utf8');
  const src=clone(),srcBefore=JSON.stringify(src);writeFileSync(guide,originalGuide+'\nChanged during test.\n');
  const drift=checkup(src,{skillRoot:isolated});
  ok(drift.gates.some(g=>g.category==='source'&&g.status==='fail'),'source drift reminder');eq(drift.stats.fail,0);eq(JSON.stringify(src),srcBefore);
  throws(()=>previewApplication(src,{skillRoot:isolated,stage:'outline',selection:src.creativeContext.selection}),'same-version reapplication blocked');
  writeFileSync(guide,originalGuide);ok(!checkup(src,{skillRoot:isolated}).gates.some(g=>g.category==='source'&&g.status==='fail'));
  rmSync(join(isolated,'references/profiles/pacing/gradual'),{recursive:true});eq(checkup(src,{skillRoot:isolated}).stats.fail,0);
  ok(checkup(src,{skillRoot:isolated}).gates.some(g=>g.reason==='source-unverifiable'));
  throws(()=>resolveProfiles(isolated,'outline',selection()),'new application needs local sources');
  // Explicit overrides retained/dropped/cancelled; preview and failed apply leave bytes untouched.
  const file=join(tmp,'document.json'),sel=selection();json(file,gradual);
  const override={'params.rules.payoffCoverage':{level:'warn',minPerEpisode:1}};
  const r=applyToFile(file,{skillRoot:SKILL_ROOT,stage:'outline',selection:sel,overrides:override,confirm:true});ok(r.applied);ok(existsSync(r.backup));
  const bytes=readFileSync(file,'utf8');
  const preview=applyToFile(file,{skillRoot:SKILL_ROOT,stage:'outline',selection:sel});eq(preview.applied,false);eq(readFileSync(file,'utf8'),bytes);ok(preview.decisionsRequired.includes('params.rules.payoffCoverage'));
  throws(()=>applyToFile(file,{skillRoot:SKILL_ROOT,stage:'outline',selection:sel,confirm:true}));eq(readFileSync(file,'utf8'),bytes);
  const kept=applyToFile(file,{skillRoot:SKILL_ROOT,stage:'outline',selection:sel,decisions:{'params.rules.payoffCoverage':'keep'},confirm:true});eq(kept.document.params.rules.payoffCoverage.level,'warn');
  const dropped=applyToFile(file,{skillRoot:SKILL_ROOT,stage:'outline',selection:sel,decisions:{'params.rules.payoffCoverage':'drop'},confirm:true});eq(dropped.document.params.rules.payoffCoverage,{level:'off'});
  const manual=clone();manual.params.rules.majorGap={level:'warn',maxGap:9};ok(previewApplication(manual,{skillRoot:SKILL_ROOT,stage:'outline',selection:sel}).decisionsRequired.includes('params.rules.majorGap'));

  // Reports, export, asset calculations, English UI, failures and narrow layouts.
  const assets=computeAssets(FIXTURE);
  eq(assets.characters[0].episodes,[1,2,3,4,5,6]);eq(assets.scenes[2].uses,1);eq(assets.props[0].beatIds,FIXTURE.props[0].beatIds);eq(assets.castPlan[0].count,2);eq(computeAssets(noProps).props,[]);
  eq(fmtEps([1,2,3]),'1–3');eq(fmtEps([1,6]),'1 · 6');eq(fmtEps([]),'—');
  for(const lang of ['zh','en']) {
    const html=renderHtml(FIXTURE,lang),md=renderMarkdown(FIXTURE,lang);
    ok(html.startsWith('<!doctype html>'));ok(html.includes('<html lang="'+lang+'">'));ok(md.startsWith('# 旧站时刻'));
    for(const id of ['story','config','beats','arcs','episodes','characters','scenes','props','matrix','plan','adaptation','checks','review'])ok(html.includes('id="sec-'+id+'"'),'report section '+id);
    eq((html.match(/class="ep"/g)||[]).length,6);ok(html.includes('epswrap clip'));ok(html.includes("p.id===btn.dataset.pane"));ok(html.includes("classList.remove('clip')"));
    ok(html.includes('@media print'));ok(html.includes('prefers-reduced-motion'));ok(html.includes('minmax(min(100%,360px),1fr)'));
    ok(!/<script\s+src=|<link\s|@import|url\(https?:/.test(html));
    eq(JSON.parse(html.match(/id="outline-data">([\s\S]*?)<\/script>/)[1]),FIXTURE,'export input values unchanged');
    ok(html.includes('revokeObjectURL(url),10000'));
    ok(html.includes(lang==='en'?'Content review not performed':'内容评审未执行'));ok(html.includes(lang==='en'?'Policy disabled':'策略关闭'));ok(html.includes(lang==='en'?'Missing upstream':'缺少上游'));
  }
  ok(!renderHtml(FIXTURE,'en').includes('导出 JSON'));throws(()=>renderHtml(FIXTURE,'fr'));
  const hostile=clone();hostile.story.premise='</script><img src=x onerror=alert(1)>';hostile.source='<script>alert(1)</script>';
  const hostileHtml=renderHtml(hostile);ok(!hostileHtml.includes('<img src=x'));ok(hostileHtml.includes('&lt;img'));eq(JSON.parse(hostileHtml.match(/id="outline-data">([\s\S]*?)<\/script>/)[1]),hostile);
  ok(!renderMarkdown(hostile).includes('<script>'),'Markdown title is escaped as well as tables');
  const special=clone();special.beats[0].type='__proto__';special.episodes[0].warnings=['constructor','__proto__'];
  eq(computeAssets(special).beatsByType['__proto__'],[1]);eq(computeAssets(special).warnings.constructor,[1]);
  ok(renderHtml(special).includes('__proto__'),'free text labels cannot collide with object prototypes');
  const warning=clone();warning.params.rules.payoffCoverage={level:'warn',minPerEpisode:1};ok(renderHtml(warning).includes('提醒'));eq(checkup(warning).stats.fail,0);
  const broken=clone();broken.story.endingBeatId='B99';ok(renderHtml(broken).includes('阻断失败'));ok(renderMarkdown(broken).includes('endingBeatId'));
  ok(renderHtml(s,'zh',{stage:'skeleton'}).includes('阶段尚未完成'));
  eq(JSON.stringify(FIXTURE),before,'all report/asset operations read-only');

  // Chunk and CLI legacy value retained, including overlap-aware truncation.
  const book=Array.from({length:30},(_,i)=>`第${i+1}章 标题\n正文${i}`).join('\n');
  eq(detectChapters(book).length,30);eq(chunkVolumes(book,10).volumes.length,3);eq(chunkVolumes(book,10).truncated,false);eq(chunkVolumes('').volumes,[]);
  eq(detectChapters('楔子\n文字\nChapter 2 Title\ntext').length,2);
  const size=chunkVolumes('X'.repeat(45000));eq(size.mode,'size');eq(size.volumes.length,3);eq(size.truncated,false);
  const edge=FALLBACK_CHUNK+(MAX_VOLUMES-1)*(FALLBACK_CHUNK-FALLBACK_OVERLAP);
  eq(chunkVolumes('X'.repeat(edge)).truncated,false);eq(chunkVolumes('X'.repeat(edge+1)).truncated,true);
  const huge=Array.from({length:MAX_VOLUMES+1},(_,i)=>`第${i+1}章\n正文`).join('\n');eq(chunkVolumes(huge,1).truncated,true);
  for(const v of [0,-1,1.2,NaN])throws(()=>chunkVolumes(book,v));eq(slug('a/b:c'),'a-b-c');eq(slug('旧站时刻'),'旧站时刻');
  // Explicit corrupted production is a failure, never hidden as missing upstream.
  const project=join(tmp,'project'),outlineDir=join(project,'outline');mkdirSync(outlineDir,{recursive:true});
  const docFile=join(outlineDir,'outline.json'),prodFile=join(project,'production.json');json(docFile,FIXTURE);
  eq(findProduction(outlineDir,0),null);json(prodFile,{creative:{version:1,selection:FIXTURE.creativeContext.selection},lang:'en'});
  eq(findProduction(outlineDir),prodFile);eq(stageDirNote(docFile,prodFile),null);ok(stageDirNote(join(project,'wrong.json'),prodFile));eq(stageDirNote(docFile,null),null);
  eq(run('validate',docFile).status,0);eq(run('checkup',docFile,'--json').status,0);
  const neutralLang=clone();delete neutralLang.lang;json(docFile,neutralLang);ok(run('render',docFile,'--html').stdout.includes('lang="en"'));ok(run('render',docFile,'--html','--lang','zh').stdout.includes('lang="zh"'));
  json(prodFile,{creative:{version:1,selection:selection('episodic','measured','life','warm')}});eq(run('validate',docFile).status,1);
  writeFileSync(prodFile,'{broken');ok(loadProduction(docFile).productionError);eq(run('validate',docFile).status,1);eq(run('render',docFile,'--html').status,1);
  rmSync(prodFile);eq(run('validate',docFile).status,0);eq(run('validate',docFile,'--production',prodFile).status,1);
  json(docFile,warning);eq(run('validate',docFile).status,0);warning.params.rules.payoffCoverage.level='error';json(docFile,warning);eq(run('validate',docFile).status,1);eq(run('checkup',docFile).status,1);eq(run('validate',docFile,'--stage','unknown').status,1);
  for(const v of [false,'true','false',1,null])eq(autopilotOf({autopilot:v}),false);eq(autopilotOf({autopilot:true}),true);
  eq(run('profiles').status,0);eq(discoverProfiles(SKILL_ROOT,'outline').length,12);
  const selectionFile=join(tmp,'selection.json');json(selectionFile,selection());eq(run('profile','--selection',selectionFile).status,0);
  json(docFile,gradual);
  const confirmedCLI=run('apply-profile','--selection',selectionFile,docFile,'--confirm');
  eq(confirmedCLI.status,0,confirmedCLI.stderr);
  ok(confirmedCLI.stderr.includes('postApplicationChecks'),'confirmed CLI rechecks document');
  ok(confirmedCLI.stderr.includes('联合验证尚未执行'),'CLI does not claim unexecuted downstream checks');
  // Migration is backed up, incomplete and does not infer semantic classifications.
  const legacy={source:'旧记录',params:{episodes:6,minutesPerEpisode:3,genre:'生活',adaptMode:'忠实',thresholds:{maxBeatGap:3,maxLeads:4}},adaptation:FIXTURE.adaptation,characters:FIXTURE.characters,scenes:FIXTURE.scenes,beats:[{id:'B01',payoff:'不能自动认定兑现'}],episodes:[{ep:1,hook:'旧字段',suspense:'旧字段'}]};
  const draft=migrationDraft(legacy);eq(draft.document.beats,[]);eq(draft.document.episodes,[]);eq(draft.review.legacyBeats,legacy.beats);eq(draft.document.params.thresholds.maxBeatGap,undefined);eq(draft.document.params.thresholds.maxLeads,4);ok(validateOutline(draft.document).length>0);
  const oldFile=join(tmp,'old.json'),newFile=join(tmp,'new.json');json(oldFile,legacy);eq(run('migrate',oldFile,newFile).status,0);eq(JSON.parse(readFileSync(oldFile)),legacy);ok(existsSync(newFile+'.review.json'));ok(readdirSync(tmp).some(n=>n.startsWith('old.json.bak-')));eq(run('migrate',oldFile,newFile).status,1);eq(run('migrate',oldFile,oldFile).status,1);
  // Actual consumer CLI and generated report DOM: also executed in the standalone copy.
  const fixes=spawnSync(process.execPath,[join(HERE,'fixes-selftest.mjs')],{cwd:SKILL_ROOT,encoding:'utf8',timeout:60000});
  eq(fixes.status,0,fixes.stderr+fixes.stdout);
  // Standalone copy: restore profiles, run own example/CLI without sibling directories.
  rmSync(join(isolated,'references/profiles'),{recursive:true});cpSync(join(SKILL_ROOT,'references/profiles'),join(isolated,'references/profiles'),{recursive:true});
  const standalone=spawnSync(process.execPath,[join(isolated,'scripts/novel-outline.mjs'),'validate',join(isolated,'examples/旧站时刻-outline.json')],{cwd:isolated,encoding:'utf8',timeout:20000});eq(standalone.status,0,standalone.stderr+standalone.stdout);
  if(!process.env.OUTLINE_SELFTEST_COPIED) {
    const copied=spawnSync(process.execPath,[join(isolated,'scripts/selftest.mjs')],{cwd:isolated,env:{...process.env,OUTLINE_SELFTEST_COPIED:'1'},encoding:'utf8',timeout:60000});eq(copied.status,0,copied.stderr+copied.stdout);
  }
  // Links are local and portable, excluding image-only screenshot assets.
  for(const name of ['SKILL.md','README.md','README.en.md','references/schema.md','references/outline-pass.md','references/episode-pass.md','references/review-core.md','references/migration.md']) {
    const file=join(SKILL_ROOT,name),body=readFileSync(file,'utf8');
    for(const m of body.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g))if(!/^https?:/.test(m[1]))ok(existsSync(resolve(dirname(file),m[1])),'link '+name+' -> '+m[1]);
  }
  console.log(`✓ ${count} assertions passed: outline v2 contracts, nine policies, three combinations, sources, CLI, migration, rendering and standalone copy.`);
} finally {rmSync(tmp,{recursive:true,force:true});}
