// 与 stories.mjs 同一批原创故事的资产设计，不读取 skill 正式样例。
const designs={
  dense:{
    scene:'An unattended lost-property counter surrounded by scratched steel lockers, a blue donation box and a public ledger rail.',
    sceneAnchors:[['储物格','柜台后方成排的灰色金属储物格'],['捐款箱','左侧带透明视窗的蓝色捐款箱'],['登记栏','右侧供逐笔公开收据的横向木轨']],
    prop:'A clothbound donation ledger with numbered receipt pockets, red return stamps and a reinforced spine.',
    propAnchors:[['收据袋','按日期编排的透明收据袋'],['退款印章','右侧逐笔盖印的退款栏'],['包布书脊','深蓝色包布书脊磨损处']],
    people:[
      {gender:'女性',age:'三十岁左右',look:'齐耳短发、浅灰工作衫、袖口有墨迹',image:'A focused woman around thirty, cropped black hair, pale gray work shirt, ink-stained cuffs, square shoulders, steady dark eyes, practical shoes.',voice:'Adult female; clear alto, forward resonance, precise consonants, measured pace, firm calm delivery, standard Mandarin.',timbre:'清晰略低的女声',pace:'逐字清楚，遇到证据时放慢'},
      {gender:'男性',age:'五十岁左右',look:'稀疏后梳发、深色针织背心、略弓肩背',image:'An older stocky male supervisor with thinning swept-back hair, dark knitted vest, narrow spectacles, downturned mouth, stooped back, polished loafers.',voice:'Older male; dry baritone, nasal grain, clipped endings, quick defensive rhythm, restrained volume, Mandarin.',timbre:'干涩带鼻音的男声',pace:'起初急促，退款时短句停顿'}
    ]
  },
  gradual:{
    scene:'An empty refrigeration night-shift desk beside a frosted observation window, a wall temperature display and stacked paper chart trays.',
    sceneAnchors:[['观察窗','窗边结霜而中央仍能看进冷库'],['温度屏','墙面显示屏正对纸质记录架'],['记录架','三层金属托盘按夜班日期分类']],
    prop:'A rigid night-shift record folder holding temperature charts, magnetic door logs and a signed handover sheet.',
    propAnchors:[['金属夹','顶部双环金属夹固定原始曲线'],['时间栏','纸张左侧清晰分隔的时间刻度栏'],['签字页','最后一页带蓝色交班签字格']],
    people:[
      {gender:'女性',age:'二十七岁左右',look:'低马尾、青色保温夹克、圆框眼镜',image:'A slender young female recorder with low ponytail, round glasses, teal insulated jacket, tired attentive eyes, wool gloves tucked into her belt.',voice:'Young woman; soft middle register, airy onset, deliberate pauses, low amplitude, analytical neutrality, unhurried Mandarin.',timbre:'轻而稳定的中音女声',pace:'留出观察停顿，不抢结论'},
      {gender:'男性',age:'四十岁左右',look:'平头、橙色维护外套、粗糙手掌',image:'A broad maintenance technician, close-cropped salt-and-pepper hair, orange canvas overalls, weathered palms, strong jaw, thick boots, relaxed heavy stance.',voice:'Middle-aged man; rounded bass, chest resonance, coarse texture, slow syllables, warm matter-of-fact phrasing, northern Mandarin.',timbre:'厚实带颗粒感的低音男声',pace:'稳慢陈述，复核时简短回应'}
    ]
  },
  episodic:{
    scene:'An empty neighborhood breakfast stall with bamboo steamers, a low wooden serving ledge, ceramic drying plates and a small handwritten rota board.',
    sceneAnchors:[['蒸笼','摊台左边摞起的两层竹蒸笼'],['晾盘架','靠墙整齐排列的陶瓷空盘'],['轮值位置','收摊挂钩旁固定轮值板的位置']],
    prop:'A small wooden breakfast rota board with weekly date columns, erasable recipe notes and a red circular rest-day marker.',
    propAnchors:[['日期格','横向七格日期栏'],['心得栏','下方可以擦写蒸制与停电办法的白板条'],['休息标记','红色圆圈标明摊主休息日']],
    people:[
      {gender:'女性',age:'六十岁左右',look:'银白短卷发、米色棉围裙、眼角细纹',image:'An elderly breakfast vendor with short silver curls, beige cotton apron, soft lined cheeks, small sturdy frame, rolled floral sleeves and gentle eyes.',voice:'Older woman; husky mezzo, soft breath, rounded vowels, patient phrasing, affectionate warmth, everyday Mandarin.',timbre:'略沙哑而温厚的女声',pace:'从容，答应休息前稍作停顿'},
      {gender:'女性',age:'二十五岁左右',look:'乌黑长辫、蓝色运动外套、轻巧站姿',image:'A youthful athletic neighbor, long black braid, blue sports jacket, angular face, bright brows, lightweight sneakers, nimble upright posture.',voice:'Young female; bright soprano, clean attack, lively cadence, light resonance, curious optimism, crisp Mandarin.',timbre:'明亮轻快的女声',pace:'原本轻快，等待蒸制时主动放慢'},
      {gender:'男性',age:'六十五岁左右',look:'灰白寸发、棕色灯芯绒衫、宽大双手',image:'A retired tall neighbor with gray buzz cut, brown corduroy overshirt, broad hands, long nose, thick eyebrows and slightly bent knees.',voice:'Senior male; gravelly low register, subdued chest buzz, short phrases, easy pauses, reassuring humor, relaxed Mandarin.',timbre:'低沉带砂砾感的男声',pace:'慢条斯理，提出办法时语调平稳'},
      {gender:'男性',age:'七十岁左右',look:'白色鸭舌帽、深绿薄风衣、瘦长面颊',image:'An elderly slim regular customer wearing a white flat cap and forest-green windbreaker, hollow cheeks, fine pale eyebrows, cautious narrow steps, folded shopping bag.',voice:'Elderly gentleman; thin tenor, delicate breath, slightly wavering sustain, courteous soft articulation, gentle Mandarin.',timbre:'纤细略颤的男声',pace:'细慢，表达需要时带着客气停顿'}
    ]
  }
};
const PURITY="Remove all noise, graininess, film grain and digital noise; shadows and dark areas smooth and clean, color transitions natural, gradients fine and smooth. Surfaces of skin, fabric, wood grain, stone, water and leaves clean and clear, edges crisp but not over-sharpened, with no dirt specks, hazy blur, smearing or artifacts. Keep the original details, do not reduce any characters or scene elements, do not change the characters' faces. High definition, clean low-ISO image quality, commercial-grade finished look.";
export function sourceText(story){return `《${story.title}》原创测试文本\n${story.premise}\n`+story.people.map(([name,role,arc])=>`${name}：${role}。${arc}。`).join('\n')+'\n'+story.episodes.flatMap(e=>[e.opening,...e.actions,e.ending.event]).join('\n');}
export function fillAssets(cast,art,story,style){
  const design=designs[story.key];cast.summary=story.throughline;
  for(const [i,c] of cast.characters.entries()){
    const person=design.people[i],[name,role,arc]=story.people[i];
    c.oneLiner=`${role}，${arc}。`;
    c.persona={gender:person.gender,ageRange:person.age,identity:role,appearance:person.look+'（原创造型设定）',personality:['认真面对当下处境','随证据或关系调整行动'],temperament:person.pace,motivation:arc,arc,relationships:[],evidence:[`${name}：${role}。${arc}。`]};
    c.image={style:style.label.zh,prompt:`${style.character.render}. ${person.image} ${style.character.surface}. ${style.character.lighting}.`,promptLocal:person.look+'（原创造型设定）',negativePrompt:style.character.negative,tags:['documentary'],sheet:`One 16:9 landscape sheet on a plain white background; left part a strictly frontal close-up of the face, facial midline vertical and centered, both eyes level, looking straight into the camera; right part three full-body views of the same person from the neck down to the feet, front, side and back from left to right, same scale, standing on one shared ground line, separated by clear white gaps. ${person.image} Soft even frontal studio lighting. Overall style: ${style.character.render}.\n\n${PURITY}`};
    c.voice={timbre:person.timbre,pitch:i===0?'中音区':'较低音区',pace:person.pace,accent:'普通话',emotion:'遵循人物当下处境，不预演未发生的结果',referenceHint:'原创声音设计，不模仿真实演员',prompt:person.voice};
  }
  const scene=art.scenes[0],prop=art.props[0];
  scene.summary=story.sceneDescription;
  scene.anchors=design.sceneAnchors.map(([name,desc])=>({name,desc}));
  scene.lighting=[{state:'日常工作照明',prompt:'Light comes mainly from the ceiling panel lamps above the work counter, soft 4000K neutral white light, evenly lighting the counter and records with readable surfaces and stable exposure.'}];
  scene.image={prompt:`${style.scene.render}. ${design.scene} ${style.scene.surface}.`,negativePrompt:`${style.scene.negative}, people, human figures`,sheet:`One 16:9 landscape sheet on a plain white background; left part a two-by-two grid of four wide eye-level views taken from the center of the same empty room, looking forward (top left), backward (top right), left (bottom left) and right (bottom right), same moment and same lighting in all four, separated by white gaps; right part an orthographic top-down floor plan of the same room seen straight from above, clean unlabeled plan. ${design.scene} Light comes mainly from the ceiling panel lamps, soft 4000K neutral white. Overall style: ${style.scene.render}.\n\n${PURITY}`,tags:['documentary','empty-room']};
  prop.scale='桌面级';prop.anchors=design.propAnchors.map(([name,desc])=>({name,desc}));
  prop.states=[{state:'可阅读状态',prompt:design.prop}];prop.relatedScenes=['S01'];prop.carriedBy=[];
  prop.image={prompt:`${style.scene.render}. ${design.prop} tabletop scale, isolated on white background.`,negativePrompt:'watermark, logo, brand name, signature, cartoon',sheet:`One 16:9 landscape sheet, three equal panels side by side on a pure white background with clear white gaps: left panel the front of the object, centered and complete; middle panel the side view of the same object showing its thickness; right panel an ordinary person in plain clothes holding it with both hands, framed from the chest down; the hand or person is an anonymous generic bystander used only as a size reference, with true-to-scale proportions, actual size about 36 x 28 x 4 cm. ${design.prop} Soft even frontal studio lighting. Overall style: ${style.scene.render}.\n\n${PURITY}`,tags:['documentary','prop']};
  return {cast,art};
}
