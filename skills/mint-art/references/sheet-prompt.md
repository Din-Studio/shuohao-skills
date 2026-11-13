# 设定图提示词（场景与道具，与图片模型无关的部分）

这份写「设定图里要画什么、`image.sheet` 里该有什么」，与使用哪个图片模型无关。版式和必写内容见 [sheet.md](sheet.md)（场景、道具两类各自的版式）、[scene-pass.md](scene-pass.md)、[prop-pass.md](prop-pass.md)；光影锁见 [scene-lighting.md](scene-lighting.md)；production 指定 Midjourney 时另按 [model-midjourney.md](model-midjourney.md) 调整。术语见 [glossary.md](glossary.md)。

**语言**：`image.sheet`、`image.prompt`、`image.negativePrompt`、`lighting[].prompt`、`states[].prompt` 都是喂给模型的机器字段，**一律英文**，validate 的 english 门逐条查。叙述式的完整段落，不堆关键词；摄影说法融进句子里。

## 一、一条设定图提示词由什么组成

按这个顺序写（多数图片模型对靠前的信息更敏感）：

1. **版式段**：放最前，单独成段，照 [sheet.md](sheet.md) 里该类型的版式固定句写，画幅写成 production 的 `image.asset.aspectRatio` 实际值。
2. **身份锁**：认出这个资产靠的那几样。场景：地点类型、年代与地域文化、空间结构、功能性元素、光影锁；道具：类别、形状与实际尺寸、材质、颜色、标记。锁要写到能画出来（`a pale square wooden patch at the right end of the counter`，不是 `an old counter`）。剧本没写、设定图又一定要画的值，按 [principles.md](principles.md) 第一节估或设计好再写。年代、地域的建筑和器物拿不准时可以查资料，要点和来源记在 `facts` 或交付汇报，不写进提示词。
3. **细节**：颜色材质、新旧状态、生活痕迹、氛围（以可见细节表达，不写抽象形容词）。道具写柔和均匀的正面光（`soft even frontal studio lighting`），物件上没有明显的阴影和色光：参考图上的光会被视频模型当成物件本身的颜色带进每一段视频，戏里的光由视频去写。场景照自己的光影锁写。
4. **画风段**：单独一段，以 `Overall style:` 开头，接 production `style.scene.render` 原句（style-match 门逐字查），再接质感短语：场景 `cinematic composition`，道具 `still-life studio texture`。`style.scene.surface` 那段按需要接在后面。
5. **纯净画质段（固定句）**：每一条设定图提示词，基准和每个变体，都在最后单独一段带上下面这段话，原文照用、一字不改（sheet-purity 门查，空白规整后比较）：

> Remove all noise, graininess, film grain and digital noise; shadows and dark areas smooth and clean, color transitions natural, gradients fine and smooth. Surfaces of skin, fabric, wood grain, stone, water and leaves clean and clear, edges crisp but not over-sharpened, with no dirt specks, hazy blur, smearing or artifacts. Keep the original details, do not reduce any characters or scene elements, do not change the characters' faces. High definition, clean low-ISO image quality, commercial-grade finished look.

设定图是后面所有画面的参考，噪点、颗粒会一路带下去，所以正文里也不写颗粒、噪点、柔焦、滤镜这类画面处理；「旧」「破」「高级」以材质本身的状态写（磨损、锈蚀、覆尘、织物纹理）。

版式里需要模型避开的情形，尽量以正面的话写清要什么（`walls straight and corners square` 比 `no warped walls` 更可靠）；确实容易出错的再补一句不要什么。

## 二、提示词里只有看得见的东西

写进去：结构、比例、材质、颜色、磨损、光线、时间、关键物件、空间纵深、氛围、画风、版式。

不写进去（模型画不出来，反而会画成奇怪的东西或让画面跑偏）：

- 资产名、变体名、角色名、集数、出现在哪几集、保留或合并的理由；
- 跨集的状态概括（「第一集整洁、第五集狼狈」）——一张图只画一种稳定外观；
- 剧情、动作、情绪总结、身份关系、导演提示、说明性文字；
- `masterpiece`、`8K`、`ultra detailed` 这类质量吹捧词——它们不描述画面，只挤占长度；
- 标注性的东西：尺寸文字、刻度尺、尺寸线、方向箭头、平面图上的字和数字；也不在画面里摆门、硬币、易拉罐来比大小——模型画的字会错、画的大小会和真实数值打架。道具的大小交给右格的尺寸参照（见 [sheet.md](sheet.md)）；
- 真实品牌、商标、logo、水印；
- 像素和分辨率（由出图参数决定；画幅比例按版式固定句写一次）。

## 三、基准与变体

- **基准** = 从零画出这张图：写满这一类的全部内容，**一个字都不提参考图**。基准没有参考图，写了 `reference image` 或 `keep consistent` 只会得到一张随机的图。场景的基准是母场景的 `image.sheet`，画 `lighting[0]` 的光影锁；道具的基准是 `image.sheet`，画 `states[0]` 的状态。
- **变体** = 以基准图为底整张重出，由四块组成：
  0. **照抄块**：基准提示词里不随状态变的几段原样照抄——版式段、画风段、纯净画质段，道具再加正面光那一句。一个资产的整套图看着才是同一套；
  1. **指向参考**：以 `Based on the reference image,` 开头，说明以基准图为底（出图计划把母场景或基准道具的成图挂为参考）；
  2. **保持什么**：接着写 `keep exactly the same … as in the reference image; do not alter them.`，**点名**要保持的项（场景：建筑结构、空间布局、四个方向的视角、家具与关键物件的位置和数量、平面图；道具：三格版式、主体结构、材质、形状、比例、颜色、右格尺寸参照的姿态与取景）。只点名，不重新描述——对要保留的东西写得越具体，模型越倾向按文字重画它，结果反而不像；
  3. **只改什么**：以 `Change only the following:` 开头，一项一句，每句以 `Lighting:`、`State:`、`Damage:` 这类小标题开头，只写真正变了的几项的新值；没变的一个字都不写。
- 变体落在哪个字段：场景变体是一个带 `variantOf`、`changes` 的变体场景，四块写进它自己的 `image.sheet`；道具变体是 `states[1]` 及以后的 `prompt`。
- 所用模型完全不收参考图时，变体写成完整的独立提示词：照基准全文写，只把变了的几项换成新值。
- 身份参考（这个空间、这件东西）和风格参考（全剧画风）是两回事：模型把两者分成不同通道时各走各的，不拿身份参考去借风格。

变体段落顺序（照抄块在首尾）：

```text
<版式段，照抄基准>

Based on the reference image, keep exactly the same <点名的保持项> as in the reference image; do not alter them. Change only the following: Lighting: <新的光影锁>. State: <新的空间或物件状态>.

<道具：正面光那一句，照抄基准>
Overall style: <照抄基准>

<纯净画质段>
```

## 四、画风一致性

- 画风正文只有一个来源：production 的 `style.scene`。基准和变体都带 `Overall style:` 那一段，场景和道具使用同一套渲染句。
- 另外传给模型的风格参考图（模型支持时）是画风的加强，不代替文字里的画风段。

## 五、画面里的文字

- 每类版式的末尾都有 `no text, no lettering and no logos anywhere in the image` 一句。本来就带字的东西（文件、招牌、屏幕、包装、证件），写明文字的**语言**和**内容**——这句放在版式段末尾，替换「无文字」那半句（`the only text is the body of a property transfer agreement in Chinese with a signature line`）；剧情不需要看清的写 `the only text is illegible small print`。只写语言不写内容，模型会填乱码。
- 文字使用什么语言，按 [principles.md](principles.md) 第四节定。
- 平面图、俯瞰图上永远不写字和数字。

---

**学习来源**：内化自短剧资产图片提示词 skill（assets）的《设定图提示词》《模型-通用图片》，删去人物和群演的内容；通用写法的中文段落改成英文段落，以满足本 skill 机器字段一律英文的约定；画风句改为 production `style.scene.render` 原句。
