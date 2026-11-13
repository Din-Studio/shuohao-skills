# 真实感 · 写实档的提示词怎么写

**场景与道具的判据只有一条：像有人刚离开不久。**

## 这份文档什么时候用

画风由 `production.json` 的 `style.scene` 定（`style` 子命令取），**本文档不是第二个画风来源**，它只是把「写实那一档到底要什么」展开讲清楚。分两半：

| 部分 | 适用范围 |
| --- | --- |
| 第 1–2 节（生活痕迹、光有来源） | **哪一档画风都要**。吉卜力的房间也堆着东西，水墨的光也得有方向 |
| 第 3–6 节（材质做旧、磨损写法、摄影感、反向词） | **只属于写实档**。`render` / `surface` 写着平涂、赛璐珞、无质感的，整段不要用 |

拿不准就以 `render` 与 `surface` 那两段为准：它们说要什么就写什么。

## 假从哪来

环境图的默认失败模式是**样板间**，道具图的默认失败模式是**电商产品图**。两者是同一件事：表面太新、光太匀、每样东西都在最舒服的位置。这种「不可能的干净」就是渲染感的来源——现实里没有任何一个空间是刚打扫完、摆放整齐、四面都亮的。

商业静物摄影的作业规范恰好是一份反向清单：开拍前把每件东西擦干净、碰金属和玻璃戴手套防指纹、盯着灯下的浮尘不放。**要真实感，就把这份清单逐条反过来写。**

## 0. ⚠️ 三种图吃的东西不一样

| 图 | 真实感落在哪 |
| --- | --- |
| 场景 `image.prompt`（单张空景） | **全套**：生活痕迹 + 光的来源 + 材质做旧 + 机位高度 |
| 场景 `image.sheet`（四方向宫格 + 平面图） | 痕迹与材质照写，**但每一格都要看得清**：不写浅景深、不写手持模糊、不写偏心构图——四宫格是空间中央的平视广角，平面图是正交顶视 |
| 道具 `image.sheet` / `image.prompt`（白底） | 只写**道具本体**的磨损与包浆。环境那一套（散落物、窗光、地面材质）一句都不要——背景是纯白，光是柔和均匀的正面光 |

所有 `image.sheet` 结尾都带纯净画质段（见 `sheet-prompt.md`）：设定图是后面所有画面的参考，颗粒和噪点会一路带下去。

**「随手拍」那一套跟设定图是冲突的。**抓拍感、偏离中心、前景遮挡、大光圈虚化属于**镜头级**（分镜那一层的活）；设定图要交代的是「这个空间/这件东西长什么样」，糊了、歪了、挡了就交代不清。真实感在这里靠**内容**（痕迹、材质、光的逻辑）而不是靠**拍摄手法**。

## 1. 生活痕迹：不是没打扫，是有人在生活

- **散落物**：便签、数据线、半开的抽屉、堆着的书、没收的碗、没摆正的鞋。
- **半用状态**：喝到一半的杯子、翻开扣在桌上的书、用掉一半的笔、烟灰缸里的烟蒂、揉皱的坐垫。
- **判据**：**像有人刚离开不久。**空景是「此刻没有人」，不是「没人在这儿生活过」。

边界也要写死：要凌乱，不要脏乱；不要为了气氛把日常空间做成恐怖片布景；不要把普通场所升格成非日常规格（社区球馆不是大赛场馆）。

**⚠️ 痕迹要固定成锚点，否则每张图都重新编。**同一个空间要被生成几十次，「有生活痕迹」这种泛泛的要求每次都会长出不同的痕迹。把关键痕迹写成带方位的具体条目（「篷布右后角的补丁」「从岸边数第七块断裂的桥板」），一致性才守得住——这正是 `anchors` 存在的理由，见 `scene-pass.md` 规则 3。

## 2. 光：写来源，不写氛围

`cold moody light, cinematic atmosphere` 是氛围词，模型每次都能编出不同的打光。每条 `lighting.prompt` 至少交代四件事：**主光的物理来源与方向、光质（硬光/漫射）、色温、落在空间的哪些表面上。**

- 坏：`beautiful cinematic lighting, professional studio lighting`
- 好：`late-afternoon sun entering low through the single window on the left wall, hard directional shaft across the floorboards, warm falloff into the unlit right half of the room`

**光要有来源、有方向**：阴影、窗框投影、光斑都从画面里的光源物来，亮处暗处差一点。均匀布光是渲染感的另一半根源；但**不为「电影感」硬加体积光、逆光，或把亮处暗处拉得很开**——光束只在剧本或空间本身给了理由时写。选光的完整顺序见 `scene-lighting.md`。

还有一层下游的账：角色的受光方向跟环境对不上，人就像后期贴进背景的——这是合成时「假人感」最常见的来源之一。

## 3. 材质：真实感来自用旧的东西（写实档）

掉漆、水渍、包浆、磨白的木纹、锈迹、划痕、指纹、墙面污渍、地板上被踩出来的通行痕。

材料要点名，还要点明表面性质（哑光、抛光、釉面、拉丝），不要写 `nice furniture`：

```
scuffed enamel counter, waxed oak floor worn pale along the traffic path,
tarnished brass handle, matte plaster wall with a water stain near the ceiling
```

## 4. 道具：指名道姓地写清楚坏在哪（写实档）

`vintage` / `worn` / `used` 太抽象，模型会画成**崭新的复刻品**。要指名具体损伤：珐琅缺了一角、皮带边缘磨毛、黄铜氧化发暗、杯沿一圈茶渍、表蒙子上的细划痕。

再加一层**使用者留下的证据**：磨得最亮的那一处（常年被手握的地方）、修补过的痕迹、用到一半的内容物——暗示这东西刚被人用过。

这一节跟锚点是同一件事的两面：**能写进锚点的磨损，才是能核对的磨损**（`prop-pass.md` 规则 2）。

## 5. 摄影感：拍出来，不是渲染出来（写实档）

- **开头就定性**：写 `photorealistic ... photograph` / `live-action film environment`，不写 `3d render`。这一个词的差别是实测有效的。
- **机位高度是普通人拍得出来的**：`eye-level framing` / `chest-height handheld camera position`。贴地超低机位、极端俯拍能出好看的摄影作品，但交代的空间信息跟后面绝大多数镜头对不上（`scene-pass.md` 规则 5）。
- **色彩别过饱和**：`natural colour grading, muted tones, realistic contrast`。模型默认输出未调色的高饱和，一眼就是生成图。
- **画质**：不写颗粒、噪点、柔焦、滤镜，**浅景深与运动模糊也不要**——设定图的每一格都要看清材质，结尾的纯净画质段会再压一遍噪点。

## 6. 反向提示词

画风那一块的 `negative` **一条不落**照抄（场景的 `negativePrompt` 由 `validate` 逐条查），再补渲染感这一组：

```
showroom interior, staged furniture display, catalogue photography,
unnaturally tidy, plastic CG look, oversaturated colours, video game asset,
flat even lighting, warped perspective, melted geometry
```

**⚠️ 网上流传的室内提示词模板不能照抄。**它们几乎都带 `no clutter`——那是给样板间效果图用的，对我们完全反向。要删掉的是 `no clutter`，要留下的是 `no duplicated objects`、`no warped geometry`、`no text`。

**⚠️ 道具白底图是另一套。**它的反向词按自己的需要写：**不禁手、不禁人**（右格的尺寸参照要画匿名的手或人，`prop-pass.md` 规则 5），纯白背景是硬的（`validate` 查）；环境类的条目（`showroom`、`unnaturally tidy` 这些）跟白底自相矛盾，不要搬过去——道具的真实感全靠本体的磨损，不靠环境。

## 交之前自己过一遍

脚本查得了画风有没有整块用上、场景有没有禁人、道具有没有尺寸参照，查不了真实感写没写到位。这四条只有你能保证：

- 场景 `image.prompt` 里有具体的生活痕迹，不是「陈旧的氛围」这类形容词
- 每条 `lighting.prompt` 说清了主光从哪来、什么光质、落在哪
- 道具写的是**指名道姓的损伤**，不是 `worn` / `vintage`
- `image.sheet` 里**没有**浅景深、运动模糊、偏心构图这些镜头级手法

---

**学习来源**：样板间/渲染感的成因、「故意加入混乱」、材质微瑕内化自 [Vibe3D《Interior Rendering》](https://vibe3d.ai/blog/interior-rendering)、[Meltflex《AI Render Prompts for Photorealistic Renders》](https://www.meltflexai.com/blog/ai-render-prompts)；指名道姓写磨损、反向照搬商业静物规范、色彩调性内化自 [Cloudinary《How to Make AI Images Look Real》](https://cloudinary.com/guides/image-generation/how-to-make-ai-images-look-real)、[Miraflow《10 Prompt Tricks That Actually Work》](https://miraflow.ai/blog/how-to-make-ai-images-look-real-prompt-tricks)、[Sonya Bowman《Still Life Photography For Advertising》](https://www.sonyabowman.com/photography-blog/2022/10/19/still-life-photography-for-advertising)；「写来源不写氛围」「有缺陷的光」内化自[《AI 做图打造活人感：关键词 + 微调实用技巧》](https://gitcode.csdn.net/69df31060a2f6a37c59fd50c.html)、[爱范儿《这段有「缺陷」的 Prompt，反而生成了最真实的图片》](https://www.ifanr.com/1621769)。第 0 节的三种图裁剪、痕迹落成锚点、白底例外来自本 skill 的生产实践，不在原文里；「不为电影感硬加体积光」与纯净画质段内化自短剧资产图片提示词 skill（assets）的《场景光影》《设定图提示词》。
