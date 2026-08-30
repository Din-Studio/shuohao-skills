# 场景与物品真实感

**判据只有一条：像有人刚离开不久。**

五个层面：生活痕迹 · 有来源的光 · 用旧的材质 · 指名道姓的磨损 · 拍出来而不是渲染出来。

## 先想清楚：假从哪来

环境图的默认失败模式是**样板间**，物品图的默认失败模式是**电商产品图**。两者是同一件事：表面太新、光太匀、每样东西都在最舒服的位置。这种「不可能的干净」正是渲染感的来源——现实里没有任何一个空间是刚打扫完、摆放整齐、四面都亮的。

商业静物摄影的作业规范恰好是反向清单：开拍前把每件东西擦干净、碰金属和玻璃要戴手套防指纹、盯着灯下的浮尘不放。**要真实感，就把这份清单逐条反过来写。**

## 1. 生活痕迹：不是没打扫，是有人在生活

- **散落物**：便签、数据线、半开的抽屉、堆着的书、没收的碗、没摆正的鞋。
- **半用状态**：喝到一半的杯子、翻开扣在桌上的书、用掉一半的笔、烟灰缸里的烟蒂、揉皱的沙发毯。
- **判据**：**像有人刚离开不久。**空景是「此刻没有人」，不是「没人在这儿生活过」。

边界也要写死：要凌乱，不要脏乱；不要为了气氛把日常空间做成恐怖片布景；不要把普通场所升格成非日常规格（社区球馆不是大赛场馆）。

## 2. 光：写来源，不写氛围

`cold moody light, cinematic atmosphere` 是氛围词，模型每次都能编出不同的打光。每条光照描述至少交代四件事：**主光的物理来源与方向、光质（硬光/漫射）、色温、落在空间的哪些表面上。**

- 坏：`beautiful cinematic lighting, professional studio lighting`
- 好：`late-afternoon sun entering low through the single window on the left wall, hard directional shaft across the floorboards, warm falloff into the unlit right half of the room`

**光要允许有缺陷**：阴影、逆光、窗框投影、光斑、光柱里的浮尘。均匀布光是渲染感的另一半根源。

多角色场景还有一层：角色的受光方向跟环境对不上，人就像后期贴进背景的——这是「假人感」最常见的来源之一。

## 3. 材质：真实感来自用旧的东西

掉漆、水渍、包浆、磨白的木纹、锈迹、划痕、指纹、墙面污渍、地板的踩踏痕。

材料要点名，还要点明它的表面性质（哑光、抛光、釉面、拉丝），不要写 `nice furniture`：

```
scuffed enamel counter, waxed oak floor worn pale along the traffic path,
tarnished brass handle, matte plaster wall with a water stain near the ceiling
```

## 4. 物品：指名道姓地写清楚坏在哪

`vintage` / `worn` / `used` 太抽象，模型会画成崭新的复刻品。**要指名具体损伤**：珐琅缺了一角、皮带边缘磨毛、黄铜氧化发暗、杯沿一圈茶渍、表蒙子上的细划痕。

再加一层**使用者留下的证据**：桌上散落的碎屑、随手放歪的角度、旁边摊开的工具——暗示这东西刚被人用过。

```
photorealistic still life of a chipped enamel mug, tea stains ringing the
inside rim, fine dust and fingerprints on the glaze, sitting on aged wood,
soft window light from the left, dust motes in the beam, 50mm, muted
natural colour grading, slight film grain
```

## 5. 相机与画质：拍出来，不是渲染出来

- **开头就定性**：写 `photorealistic interior photograph`，不写 `3d render`。这一个词的差别是实测有效的。
- **机位高度是普通人拍得出来的**：`eye-level framing` / `chest-height handheld camera position`。贴地超低机位、极端俯拍能出好看的摄影作品，但交代的空间信息跟后面绝大多数镜头对不上。
- **镜头**：`35mm` 环境、`50mm` 自然、浅景深。
- **色彩别过饱和**：`natural colour grading, muted tones, realistic contrast, soft highlights and deep shadows`。AI 默认输出未调色的高饱和，一眼就是生成图。
- **画质**：轻微颗粒、镜头反光。

## 6. 构图

不居中、有前景遮挡（门框、椅背、垂下的植物）、边缘裁掉一部分物体——随手拍的失衡比完美三分法更可信。

## 7. 反向提示词与一个例外

```
showroom interior, staged furniture display, catalogue photography,
unnaturally tidy, 3d render, cgi, video game asset, oversaturated,
plastic materials, flat even lighting, duplicated furniture, warped geometry
```

**⚠️ 通用负面词模板不能照抄。**网上流传的室内提示词模板几乎都带 `no clutter`——那是给样板间效果图用的，对我们完全反向。要删掉的是 `no clutter`，要留下的是 `no duplicated objects`、`no warped geometry`、`no text`。

**白底物品参考图是另一套。**要被抠出来贴进各种镜头的道具图，用的是纯白背景，跟「环境别太干净」这一条天然冲突——那种图按它自己的需要写反向词（禁人、禁手、纯白背景），别把环境类的条目搬过去。

## 两条常踩的坑

1. **一次改一件事。**与其写一条巨长的提示词，不如分层迭代：先出布局，再改光，再加陈设。一次只改一处，其余部分才稳得住。
2. **痕迹要写死成锚点，否则每张图都重新编。**同一个空间要被生成几十次，「有生活痕迹」这种泛泛的要求每次都会长出不同的痕迹。把关键痕迹固定成带方位的具体条目（「篷布右后角的补丁」「从岸边数第七块断裂的桥板」），一致性才守得住，核对表也才有东西可核。

---

**学习来源**：样板间/产品图成因、故意加入混乱、材质微瑕内化自 [Vibe3D《Interior Rendering》](https://vibe3d.ai/blog/interior-rendering)、[Meltflex《AI Render Prompts for Photorealistic Renders》](https://www.meltflexai.com/blog/ai-render-prompts)；指名道姓写磨损、反向照搬商业静物规范、色彩调性内化自 [Cloudinary《How to Make AI Images Look Real》](https://cloudinary.com/guides/image-generation/how-to-make-ai-images-look-real)、[Miraflow《10 Prompt Tricks That Actually Work》](https://miraflow.ai/blog/how-to-make-ai-images-look-real-prompt-tricks)、[Sonya Bowman《Still Life Photography For Advertising》](https://www.sonyabowman.com/photography-blog/2022/10/19/still-life-photography-for-advertising)；「写来源不写氛围」「有缺陷的光」内化自[《AI 做图打造活人感：关键词 + 微调实用技巧》](https://gitcode.csdn.net/69df31060a2f6a37c59fd50c.html)、[爱范儿《这段有「缺陷」的 Prompt，反而生成了最真实的图片》](https://www.ifanr.com/1621769)。第 7 节的白底例外与第 2 条坑来自本仓库生产实践（见 `skills/novel-art/references/scene-pass.md`、`prop-pass.md`）。
