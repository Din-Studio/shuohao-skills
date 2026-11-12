// 原创隔离文本。故事先行依据：同目录《故事提案.md》。不读取任何正式样例。
const selection = (genre, narrativeStyle, structure, pacing) => Object.fromEntries(
  Object.entries({genre, narrativeStyle, structure, pacing}).map(([k,id]) => [k,{id,version:'1.0.0'}]));
export const stories = [
  {
    key:'dense', title:'失物登记', selection:selection('drama','intense','serial-cliff','dense-payoff'), seconds:4, cutsPerSegment:2,
    premise:'失物室管理员发现义卖捐款短缺，主管以账目延迟阻止核查。',
    throughline:'罗宁从被撤凭证追到私人报销，逐笔追回失物义卖捐款。',
    promise:'每集获得一项可核实的反击结果，并追问尚未解释的账目。',
    ending:'捐款全部追回，失物室设立公开登记簿。',
    people:[['罗宁','失物室管理员','从私下核账到承担公开证据的责任'],['戴衡','失物室主管','从以延迟搪塞到退还挪用款项']],
    scene:'失物室登记柜台', prop:'捐款登记簿', propFunction:'把义卖收据、转账账户和追回款项逐笔对齐。',
    sceneDescription:'金属储物格围着窄柜台，蓝色捐款箱和公开登记栏相对。',
    episodes:[
      {opening:'罗宁发现登记簿上的首笔捐款凭证被撤下。', before:'缺款可能只是入账延迟', after:'首笔款项确已进入私人账户',
       ending:{mode:'suspense',event:'罗宁在凭证背面发现主管签署的维修编号。',question:{id:'Q01',text:'维修编号对应的款项去了哪里？',resolution:'required',dueByEp:2}},
       actions:['罗宁翻到捐款页，停在凭证留下的空白方框。','戴衡把待入账的标签贴在空白处。','罗宁从收件袋取出重复打印的转账回执。','补打回执与登记簿中的捐助站收款账户栏并排，两个账户号码明显不同。','罗宁把带流水号的补打回执封入透明袋并登记保全时间。','她翻过回执，露出戴衡签署的维修编号。'],
       nodes:[{kind:'turn',type:'账目核对',start:1,end:3,setup:'主管以入账延迟解释空白',outcome:'罗宁找回重复回执，可以核实实际收款账户'},{kind:'payoff',weight:'minor',type:'账目核对',start:4,end:6,setup:'重复回执保留转账信息',outcome:'首笔截留有了可核验凭证且补打件得到保全，主管不能再以延迟否认'}]},
      {opening:'罗宁按维修编号调出报销单，设备栏仍写着未修。',before:'维修编号还没有对应支出',after:'假报销被确认，一笔捐款已经退回',
       ending:{mode:'suspense',event:'退款到账后，罗宁发现前两个月仍有相同编号。',question:{id:'Q02',text:'前两个月被截留的捐款能否追回？',resolution:'required',dueByEp:3}},
       actions:['罗宁把维修编号圈在报销单上。','她拉开柜台下没有换过的破损抽屉。','戴衡对照未维修的验收记录，收回否认的手势。','他在退款终端输入第一笔截留金额。','罗宁看见退款到账，把对应登记栏盖上已归还印章。','她翻到前两个月，同样的编号各出现一次。'],
       nodes:[{kind:'turn',type:'报销核查',start:1,end:3,setup:'维修支出解释了收款去向',outcome:'设备与验收记录证明维修报销虚构',resolves:['Q01']},{kind:'payoff',weight:'major',type:'款项追回',start:4,end:6,setup:'虚假报销已无法否认',outcome:'戴衡退回首笔捐款，到账记录成为进一步追查依据'}]},
      {opening:'罗宁把三个月的收据按日期铺在捐款登记簿旁。',before:'余下两笔捐款尚未归还',after:'全部款项追回，登记过程向捐助站公开',
       ending:{mode:'closure',event:'罗宁把完整收据和到账记录挂上公开登记栏。'},
       actions:['罗宁把三张收据的编号对齐。','她将各笔转账记录封袋交给捐助站，收到逐笔材料的接收确认。','戴衡在剩余两笔退款确认页上签名。','罗宁逐笔核对到账金额，划去最后两项欠款。','她把三个月的收据贴进公开登记栏。','新的义卖款到来，罗宁当面登记并递出可查询的凭证。'],
       nodes:[{kind:'turn',type:'证据提交',start:1,end:3,setup:'重复编号连接三个月的账目',outcome:'完整证据提交后，戴衡确认余款责任'},{kind:'payoff',weight:'major',type:'公开归还',start:4,end:6,setup:'捐助站收到逐笔证据',outcome:'余款全部到账，公开登记取代内部口头解释',resolves:['Q02']}]}],
    arcs:[{id:'A01',startEp:1,endEp:3,goal:'保全证据、追回捐款并公开登记',endBeatId:'B06'}]
  },
  {
    key:'gradual',title:'夜班温度',selection:selection('mystery','restrained','serial','gradual'),seconds:6,cutsPerSegment:1,
    premise:'冷库的夜间温度缓慢升高，记录员尚不能区分设备误报与人为操作。',
    throughline:'许苒用独立测量、门磁记录和交班签字逐步缩小原因范围。',
    promise:'跟随证据排除错误解释，观察认知如何改变，不提前给出凶手答案。',
    ending:'人为开门证据封存并提交调查，人员处分不在本次承诺内。',
    people:[['许苒','冷库夜班记录员','从接受故障解释到坚持独立验证'],['高路','设备维护员','从相信仪器误报到配合保存门磁记录']],
    scene:'冷库值班台',prop:'夜班记录夹',propFunction:'并置温度曲线、独立测量与交班签字的时间。',
    sceneDescription:'结霜观察窗靠近值班台，温度屏和纸质记录架相邻。',
    episodes:[
      {opening:'许苒在夜班曲线上发现连续三晚相似的缓慢升温。',before:'夜间波动被当成偶发故障',after:'重复曲线形成可以复核的异常模式',
       ending:{mode:'suspense',event:'许苒把三张曲线重叠，异常开始时间几乎一致。',question:{id:'Q01',text:'相同时段的升温是故障还是有人开门？',resolution:'required'}},
       actions:['许苒把当晚温度曲线取下，逐格检查上升部分。','高路把传感器故障标签放在记录夹旁，没有撕掉原始记录。','许苒取出前两晚的记录，把三个时间刻度对齐。','她透过灯光观察重叠曲线，在共同起点画下细线。'],
       nodes:[{kind:'event',type:'重复观察',start:1,end:2,setup:'单晚异常还可能是仪器故障',outcome:'原始曲线被保存而非按故障记录丢弃'},{kind:'turn',type:'异常对照',start:3,end:4,setup:'三晚曲线可相互比较',outcome:'相同起点让随机误报的解释受到怀疑'}]},
      {opening:'许苒把独立温度计放在固定传感器旁。',before:'重复升温仍可能来自固定传感器',after:'独立测量排除单一传感器故障，门磁断开值得追查',
       ending:{mode:'closure',event:'两支温度计读数一致，高路撤下传感器故障标签。'},
       actions:['许苒等待独立温度计的读数稳定，与墙面显示逐项对照。','高路断开固定传感器的记录接口，独立曲线仍继续上升。','许苒把门磁断开记录放到升温曲线下，对齐两处时间。','高路看完独立记录，收起传感器故障标签，把门磁日志交给许苒。'],
       nodes:[{kind:'event',type:'独立测量',start:1,end:2,setup:'必须先排除仪器自身的问题',outcome:'不依赖原传感器的测量同样记录升温'},{kind:'turn',type:'原因排除',start:3,end:4,setup:'独立测量与门磁日志并置',outcome:'传感器误报被排除，门的开闭成为下一步核查对象'}]},
      {opening:'许苒将门磁断开时间与交班签字并排核对。',before:'门磁断开可能仍是维护操作',after:'无维护安排时有人开门的证据链完整',
       ending:{mode:'open',event:'许苒封存记录夹，把调查申请放进值班交接柜。',question:{id:'Q02',text:'调查之后冷库会如何调整夜班制度？',resolution:'optional',reason:'本次交付只确认人为开门事实，不承诺后续制度决定。'}},
       actions:['许苒核对交班记录的维护与装卸两栏：异常时段均无安排，最后一次装卸已在此前签收结束。','高路出示备用机械门计数器，与门磁的开门次数一致。','许苒把维护与装卸记录、两份开门记录夹在同一页，对照时间写明非装卸时段人为开门。','她封好原件，把调查申请投入交接柜，手在柜门上停留后离开。'],
       nodes:[{kind:'turn',type:'交叉核实',start:1,end:3,setup:'门磁可能误触，或来自计划内维护及正常装卸',outcome:'独立门计数确认开门，交班与签收记录排除计划内维护和正常装卸',resolves:['Q01']},{kind:'event',type:'证据封存',start:4,end:4,setup:'人为开门事实已可追溯',outcome:'记录正式提交，调查结果仍然开放'}]}],
    arcs:[{id:'A01',startEp:2,endEp:3,goal:'排除故障并封存人为开门证据',endBeatId:'B06'}]
  },
  {
    key:'episodic',title:'楼下早餐',selection:selection('life','warm','episodic','measured'),seconds:8,cutsPerSegment:1,
    premise:'摊主照顾家人，邻居轮流接手早餐摊，在每日小事里学习照顾别人。',
    throughline:'一张轮值表连接三次独立的早餐交付，互助逐渐成为习惯。',
    promise:'每集完成一件小事，留出看见等待与体谅的时间。',
    ending:'周姨接受每周休息一天，邻里互助可以继续但没有待解问题。',
    people:[['周姨','早餐摊主','从不愿麻烦邻居到接受固定休息'],['阿禾','轮值邻居','从照着菜单交付到注意不同食客的需要'],['老郑','轮值邻居','从担心出错到找到停电时的替代办法'],['顾伯','早餐摊常客','从默默留下偏硬食物到安心接受邻居的调整']],
    scene:'楼下早餐摊',prop:'早餐轮值板',propFunction:'记录已经完成的代班，并为摊主留出固定休息日。',
    sceneDescription:'蒸笼和空盘摆在矮摊台，墙上轮值板紧邻收摊挂钩。',
    episodes:[
      {characterIds:['C02','C04'],opening:'阿禾代班第一天，发现常客留下半个偏硬的馒头。',before:'阿禾只按原定时间出锅',after:'阿禾学会按食客需要调整蒸制',
       ending:{mode:'closure',event:'常客取走柔软的早餐，阿禾在轮值板上记下蒸制时间。'},
       actions:['阿禾看着纸袋里剩下的半个馒头，把蒸笼重新盖好等待回软。','笼边蒸汽慢慢升起，阿禾试过松软程度后装好新的一袋。','取餐的手接走纸袋，阿禾在轮值板边写下更长的蒸制时间并擦净摊台。'],
       nodes:[{kind:'event',type:'体谅需要',start:1,end:2,setup:'按惯常时间出锅不能满足常客需要',outcome:'阿禾愿意等待回软而非重复交付'},{kind:'event',type:'当日收束',start:3,end:3,setup:'柔软早餐准备完成',outcome:'当天交付完成，合适的蒸制时间留给下次代班者'}]},
      {characterIds:['C03','C04'],opening:'老郑接班时发现摊位停电，蒸笼还没有启动。',before:'停电似乎让当天早餐无法交付',after:'常温饭团完成交付，替代办法记入轮值板',
       ending:{mode:'closure',event:'最后一只饭团被取走，老郑把洗净的空盘晾在架上。'},
       actions:['老郑确认插座断电，把当天已备好的熟饭和配菜放到干净摊台。','他慢慢把熟饭包成饭团，取餐的人带走无需再加热的早餐。','最后一只饭团离开空盘，老郑冲洗盘子晾好，在轮值板上记下停电办法。'],
       nodes:[{kind:'event',type:'替代办法',start:1,end:2,setup:'没有电，热蒸早餐无法按计划制作',outcome:'老郑使用已有熟食提供安全的常温替代'},{kind:'event',type:'当日收束',start:3,end:3,setup:'饭团完成当天交付',outcome:'空盘洗净，停电没有留下未完成的订单'}]},
      {characterIds:['C01','C02','C03'],opening:'周姨回到摊前，轮值板上多了两条代班心得。',before:'周姨仍打算每天独自开摊',after:'周姨接受固定休息，邻居继续轮值',
       ending:{mode:'closure',event:'周姨圈出每周休息日，把早餐递给前来代班的邻居。'},
       actions:['周姨站在轮值板前，逐字看完软馒头和停电饭团的两条记录。','阿禾和老郑把下一周的代班日期放到板上，等周姨自己作决定。','周姨慢慢圈出自己的休息日，把早已备好的早餐分别递给两位邻居。'],
       nodes:[{kind:'event',type:'阅读心意',start:1,end:2,setup:'邻居完成两次代班而没有要求回报',outcome:'周姨看见互助可以持续而非一次性救急'},{kind:'event',type:'接受照顾',start:3,end:3,setup:'下一周的代班日期留出选择空间',outcome:'周姨确认休息日，互助关系在当天早餐中闭合'}]}],arcs:[]
  }
];

export const style = {
  label:{zh:'日常纪实',en:'Everyday documentary'},phrase:'documentary live action',
  character:{render:'documentary live action',surface:'natural skin and cotton fabric',lighting:'soft practical light',negative:'cartoon',tags:['documentary']},
  scene:{render:'documentary live action',surface:'worn wood and brushed metal',negative:'cartoon',tags:['documentary']}
};

export function buildOutline(story) {
  let number=0;
  const beats=story.episodes.flatMap((ep,i)=>ep.nodes.map((node,j)=>({
    id:`B${String(++number).padStart(2,'0')}`,episode:i+1,position:j===0?'early':'ending',
    kind:node.kind,type:node.type,setup:node.setup,outcome:node.outcome,
    ...(node.weight?{weight:node.weight}:{}),...(node.resolves?{resolves:node.resolves}:{})
  })));
  return {schemaVersion:2,source:story.title,lang:'zh',
    params:{episodes:3,minutesPerEpisode:0.4,genre:story.premise,adaptMode:'原创',thresholds:{maxLeads:3,maxSupport:3,maxFunctional:3,maxPrimaryScenes:2,maxProps:3}},
    story:{focusCharacterIds:['C01'],premise:story.premise,throughline:story.throughline,audiencePromise:story.promise,ending:story.ending,endingBeatId:beats.at(-1).id},
    adaptation:{core:story.premise,sourceNote:'原创隔离联合测试故事，没有外部原作证据。',keep:[],cut:[],merge:[],risks:[]},
    characters:story.people.map(([name,role,arc],i)=>({id:`C0${i+1}`,name,role,arc,tier:i===0?'lead':'support',from:['本测试原创人物']})),
    scenes:[{id:'S01',name:story.scene,primary:true}],
    props:[{id:'P01',name:story.prop,function:story.propFunction,beatIds:beats.map(b=>b.id)}],
    beats,arcs:structuredClone(story.arcs),
    episodes:story.episodes.map((ep,i)=>({ep:i+1,opening:ep.opening,synopsis:ep.nodes.map(n=>n.outcome).join('；'),ending:structuredClone(ep.ending),stateChange:{before:ep.before,after:ep.after},sceneIds:['S01'],characterIds:ep.characterIds??story.people.map((_,j)=>`C0${j+1}`),propIds:['P01']}))
  };
}

export function fillScript(seed, story) {
  seed.params={...seed.params,actionSeconds:story.seconds,charsPerSecond:4.5,tolerance:0.15};
  for(const [i,ep] of seed.episodes.entries()) {
    const plan=story.episodes[i];
    ep.scenes=[{sceneId:'S01',characters:plan.characterIds??story.people.map((_,j)=>`C0${j+1}`),props:['P01'],flow:plan.actions.map(action=>({action}))}];
    ep.openingBeat=[1,1];ep.endBeat=[1,plan.actions.length];
    for(const [j,claim] of ep.beatClaims.entries()) {claim.start=[1,plan.nodes[j].start];claim.end=[1,plan.nodes[j].end];}
  }
  return seed;
}

export function fillCreation(seed, script, story) {
  seed.promptLang='zh';
  for(const [i,ep] of seed.episodes.entries()) {
    delete ep.seedScenes;
    const flow=script.episodes[i].scenes[0].flow;
    ep.segments=[];
    for(let start=0;start<flow.length;start+=story.cutsPerSegment) {
      const actions=flow.slice(start,start+story.cutsPerSegment);
      const characters=script.episodes[i].scenes[0].characters;
      const images=[...characters.map(ref=>({kind:'character',ref,role:'人物身份参考'})),{kind:'scene',ref:'S01',role:'场景参考'},{kind:'prop',ref:'P01',role:'叙事道具参考'}];
      ep.segments.push({id:`E${String(i+1).padStart(2,'0')}-${String(ep.segments.length+1).padStart(2,'0')}`,sceneIndex:1,
        images,cuts:actions.map((_,j)=>({beats:[start+j+1,start+j+1],seconds:story.seconds,size:'medium',camera:'Static Shot',characters:[...characters],props:['P01']})),
        prompt:images.map((img,k)=>`图 ${k+1} 是${img.kind==='character'?story.people[Number(img.ref.slice(1))-1][0]:img.kind==='scene'?story.scene:story.prop}的参考。`).join('\n')+'\n镜头描述：\n'+actions.map((a,j)=>`[镜头 ${j+1}] 中景，固定镜头。${a.action}`).join('\n')+'\n环境声与配乐：保留现场环境声，不添加配乐。'
      });
    }
  }
  return seed;
}
