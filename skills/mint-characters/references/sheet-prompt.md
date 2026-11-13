# 设定图提示词怎么写（与图片模型无关的部分）

这份写「人物设定图里要画什么、`image.sheet` 里该有什么」。版式与必写内容见 [sheet.md](sheet.md)（人物、生物）和 [crowd.md](crowd.md)（群演）；使用 Midjourney 时另读 [model-midjourney.md](model-midjourney.md)。原则和术语见 [principles.md](principles.md)、[glossary.md](glossary.md)。

`image.sheet` 是机器字段，**一律英文**（validate 拦中日韩字符），与 cast 的 `lang` 无关。

## 一、一条设定图提示词由什么组成

按这个顺序写，每块单独成段（多数图片模型对靠前的信息更敏感）：

1. **版式要求**：放最前，以 `Layout requirements:` 开头，照 sheet.md 或 crowd.md 的英文版式写，画幅写成 `production.image.asset.aspectRatio` 的实际值。
2. **身份锁**：认出这个人靠的那几样——年龄段、人种标签、脸型、眉眼（含瞳色）、鼻、唇、肤色、可见的永久特征、发色发型、身高档与体型、体态。锁要写到能画出来（`deep brown almond eyes`，不是 `beautiful eyes`）。外观照身份卡写：设定图会画出来的外观是一定要有值的项，剧本没写的要先在 `persona` 里定好——空着的地方模型会用它的默认值补（常见是欧美面孔、影棚灰背景）。年代、地域的服装拿不准时可以查资料，要点和来源写进 `persona`，不写进提示词。
3. **服装与细节**：服装逐件写颜色、材质、款式，以及廓形、层次和看得见的工艺（缝线、刺绣、做旧）；鞋；一直戴着的配饰；整体气质一句。本段最后接固定句 `Soft even frontal studio lighting, with no visible shadows or colored light on the face or the clothes.`——参考图上的光会被视频模型当成长相、颜色带进每一段视频，戏里的光由视频去写。
4. **画风句**：以 `Overall style:` 开头单独一段，**原样**放 production `style.character.render` 那句（validate 查），`surface` 那段的皮肤、头发、布料处理写进身份锁和服装段；可在画风句后补本剧统一的色板和年代一句，全剧逐字一致。`style.character.lighting` 不进设定图，见 [style.md](style.md)。
5. **纯净画质段（固定句）**：最后单独一段，原文照用、一字不改；它必须是最后一段，之后不再追加任何内容（validate 查，只容许换行和空白差异）：

> Remove all noise, graininess, film grain and digital noise; shadows and dark areas smooth and clean, color transitions natural, gradients fine and smooth. Surfaces of skin, fabric, wood grain, stone, water and leaves clean and clear, edges crisp but not over-sharpened, with no dirt specks, hazy blur, smearing or artifacts. Keep the original details, do not reduce any characters or scene elements, do not change the characters' faces. High definition, clean low-ISO image quality, commercial-grade finished look.

设定图是后面所有画面的参考，噪点、颗粒会一路带下去，所以正文里也不写颗粒、噪点、柔焦、滤镜、浅景深这类画面处理；「旧」「破」「高级」使用材质本身的状态写（磨损、起球、褪色、织纹）。

写成叙述式的完整段落，不堆关键词。版式里需要模型避开的情形，尽量使用正面的话写清要什么（`facial midline vertical and centered, both eyes level` 比 `don't tilt the head` 可靠）；确实容易出错的再补一句不要什么。

## 二、提示词里只有看得见的东西

写进去：外观、五官、发型、体型、服装、配饰、材质、磨损、颜色、气质、画风、版式。

不写进去（模型画不出来，反而会画成奇怪的东西或让画面跑偏）：

- 角色名、别名、作品名、集数、出现在哪几集（validate 拦人名）；
- 跨集的状态概括（「第一集整洁、第五集狼狈」）——一张图只画一种稳定外观；
- 剧情、动作、情绪总结、身份关系、导演提示、说明性文字；
- 笑、哭、怒这类表情，伸手、前冲、拿东西这类剧情动作——设定图是身份档案，表情会被视频模型带进每一个镜头；
- 会被摘下、交出的挂件和手持物（它们是道具，归 mint-art）；
- `masterpiece`、`8K`、`ultra realistic` 这类质量吹捧词；
- 姓名、身高、尺寸文字，刻度尺、尺寸线和箭头；
- 真实品牌、商标、logo、水印；
- 画幅比例以外的出图参数。

## 三、辨识度

主要角色之间至少在脸型、眼型、发色、发型、肤色、体型、气质里有四项明显不同，男女主与同性别配角之间尤其要一眼分开。每个人只写自己的特征，正文不提别的角色。validate 对 `image.sheet` 只比较主体区（版式、正面光、画风和纯净段剥掉之后的身份锁与服装段，见第五节）：完全相同直接报错，相似度超过 75% 给出提示；`image.prompt` 另按独立插画提示词比较。

## 四、基准与变体（变体为备用说明）

- **基准** = 从零画出这张图：写满这一类的全部内容，**一个字都不提参考图**。基准没有参考图，写了「参考图 / 保持一致」只会得到一张随机的图。本阶段的 `image.sheet` 都是基准。
- **变体** = 以基准图为底改这张图。cast v1 每个身份只有一个 `image` 块，**没有变体槽位，本阶段不出人物变体图**；换装、受伤、跨年龄这类外观变化由下游按需处理。下游需要人物变体时，按下面四块写：
  0. **照抄块**：基准的版式要求段、正面光固定句、画风句和纯净画质段，原样照抄；
  1. **指向参考**：第二段以 `Based on the reference image [base sheet], keep ... exactly unchanged.` 开头，说明以基准图为底；
  2. **保持什么**：只点名，不重新描述——五官、脸型、肤色、瞳色、身高体型、身材比例、版式。写得越具体，模型越倾向按文字重画，结果反而不像；
  3. **只改什么**：以 `Change only the following:` 开头，一项一句写变了的服装、配饰、发型（没变不写）、伤痕、污渍、湿透、憔悴等可见状态。伤痕写清部位（按这个人自己的左右）、形态、颜色、大小。新出现的单侧特征和基准侧面画的不是同一侧时，写明侧面那一格画哪一侧。跨年龄写骨骼轮廓、皮肤紧致度、五官比例的结构变化，不写剧情动作和表情。
- 变体整张重出：脸部特写和右边三格一起换成这个状态。
- 所用模型完全不收参考图时，变体写成完整的独立提示词：照基准全文写，只把变了的几项换成新值。
- 身份参考（这个人）和风格参考（全剧画风）是两回事：模型把两者分成不同通道时各走各的。`images --style-ref` 只借画风，不拿它保角色。

## 五、主体区与风格参考：validate 查什么，不查什么

validate 和出图计划检查的是**实际发送正文**，也就是 `image.sheet`（开启 `--style-ref` 时再加上风格匹配句）。`image.prompt`、`image.promptLocal` 是独立插画，不进出图计划，写得再完整也不能代替 sheet 里的身份锁和服装段。

从正文里去掉版式句（通用写法从 `Layout requirements:` 到 `The image contains no text and no logos.`；Midjourney 写法从 `one <画幅> … canvas` 到版式短语结尾）、正面光固定句、`Overall style:` 画风段、风格匹配句和纯净画质段，剩下的就是**主体区**：人物是身份锁和服装两段，群像是人员构成段。不需要任何标签。

代码确定性检查（不通过就阻断）：

- **纯净段收尾**：最后一段在空白规整后等于纯净画质段，之后不再追加任何内容。
- **画风段位置**（通用模型）：`Overall style:` 单独成段，在纯净段之前；Midjourney 不强求单独的画风段，渲染句仍要在正文里。
- **主体区非空**；两个角色的主体区不能完全相同。
- **区分度提示**：主体区之间的词级相似度超过 75% 时报出那一对。这是启发式提示，不代表语义审核。

**风格参考**：`images --style-ref` 在出图时才决定挂不挂参考图、谁是基准，所以风格匹配句由出图计划插入，写 sheet 时不要自己加。它单独成段，插在 `Overall style:` 段之前，纯净段仍然收尾；不计入主体区，插入之后的最终正文照样过上面的检查。风格参考只借画风，不借基准角色的身份。

代码不判断主体写得对不对。写完之后另行发起一次内容复核（同一模型也可以，或人工），把主体区和人物画像、`sourceRefs`、`image.prompt` 并排对照：年龄段、人种标签、脸型、发型、体型、服装颜色材质是否一致；每个辨识特征在主体区里能不能画出来；同批角色依靠什么区分；适配目标模型时最终请求有没有丢弃或改写约束。复核结论为需返修或待确认时不提交生成。生成之后的看图审核见 [media-handoff.md](media-handoff.md)。

---

**学习来源**：内化自短剧资产图片提示词 skill（assets）的《设定图提示词》《人物》第四至六节和《模型-通用图片》的段落结构；原文的通用模型写中文，本 skill 的机器字段一律英文，所以结构保留、语言改为英文。
