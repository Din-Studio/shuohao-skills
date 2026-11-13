# 真实感 · 写实档的提示词怎么写

**真实感来自不完美，不是细节量。**

## 这份文档什么时候用

画风由 `production.json` 的 `style.character` 定（见 `style.md`），**本文档不是第二个画风来源**，它只是把「写实那一档到底要什么」展开讲清楚。分两半：

| 部分 | 适用范围 |
| --- | --- |
| 第 1–3 节（姿态、神情、穿着痕迹） | **哪一档画风都要**。吉卜力的角色也不站军姿，水墨的衣服也有褶 |
| 第 4–6 节（毛孔、原生质感、摄影感、反向词） | **只属于写实档**。`surface` 那段写着平涂、无毛孔、成簇发丝的，整段不要用 |

拿不准就以 `surface` 那段为准：它说要什么就写什么，本文档给的是写实档那一套的展开。

## 假从哪来

图像模型学的是修过的照片，默认输出是「刚做完医美、站在环形灯下、正对镜头、笑容标准」。看着假不是因为细节不够，是**该有的破绽被抹平了**：毛孔被磨掉、左右脸被拉对称、光被打匀、姿态被摆正。

所以提示词的方向不是「更真实」——`ultra realistic`、`8K`、`masterpiece`、`flawless skin` 只会推模型往「更精修」走，越写越假。**要写的是真实世界里的皮肤、光、镜头具体什么样。**

## 0. ⚠️ 两个字段吃的东西不一样

| 字段 | 是什么 | 真实感落在哪 |
| --- | --- | --- |
| `image.prompt` | 单张表现性插画（四分之三半身、浅景深） | **全套**：面部破绽 + 松弛姿态与神情 + 服饰痕迹 + 方向光 + 摄影感 |
| `image.sheet` | 设定图（身份档案：正面脸部特写 + 脖子以下三格） | **只有「长相与材质」那一半**：破绽、碎发、织纹与磨损照写；中性站姿、中性表情、柔和均匀的正面光，摄影感一律不写，最后接纯净画质段 |

**设定图不是照片。**浅景深、胶片颗粒、方向光、手持模糊、偏离中心的构图、抓拍瞬间——这些在 `image.prompt` 里是加分项，进了 `image.sheet` 就是**拆版式**：脸要严格正面、光要柔和均匀、三格要同一比例、要抠得干净（版式见 `sheet.md`）。参考图上的光和表情会被视频模型当成长相带进每一个镜头，所以设定图只画中性的样子。两边共用的只有「这个人长什么样、衣服是什么材质」。

## 1. 姿态：拒绝摆拍（`image.prompt`）

- 避开对称站姿和标准姿势：耸一边肩、歪头、手腕放松、手指微弯、重心压在一条腿上。
- 写一个**正在进行的日常瞬间**，不要堆静态名词。
  - 坏：`standing, holding a bag, looking at camera`
  - 好：`caught mid-turn, weight on one leg, one hand still on the door frame, bag hanging loose in the other`
- **`image.sheet` 相反**：右边三格是中性站姿（常坐轮椅的写坐轮椅），为的是看清身形和服装结构。那是身份档案，不写松弛姿态和剧情动作。

## 2. 表情与眼神：不要「双目呆滞」（`image.prompt`）

- 表情写具体的微表情：自然半笑、微抿嘴、眉头轻蹙、走神时嘴角松开。`smiling` 出来就是模板脸。
- 眼神要有**去处**和**情绪**：看向画外某处、垂着眼、疲惫、防备、走神。`looking at camera` 配上完美对称的脸，正是恐怖谷的标准配方。
- 神情要跟 `persona` 对得上——这个人的处境写在脸上，才是「有故事的脸」而不是「好看的脸」。
- **`image.sheet` 相反**：严格正面、看向镜头、放松平静的中性表情。设定图的表情会被视频模型带进每一个镜头，神情留给 `image.prompt` 和视频；设定图的「不呆滞」靠眼睛的湿润高光、虹膜纤维和左右略不对称来写，不靠表情。

## 3. 服饰：衣服要像被穿过（两个字段都写）

面料褶皱、穿后变形的领口与袖口、线头、轻微磨损与污渍、肘部和膝盖磨出的光泽。

材质要点名——粗棉、亚麻、起球的羊毛、哑光化纤，不要只写 `a shirt`：

```
coarse cotton tunic, collar softened and slightly out of shape, cuffs
frayed, fabric weave visible, creases from being worn all day
```

这一节在设定图里同样要写：右边三格看得清的就是这些磨损。

## 4. 面部与毛发：把破绽写回去（写实档）

| 部位 | 写进去的东西 | 英文短语 |
| --- | --- | --- |
| 皮肤 | 毛孔、细纹、颧骨轻微泛红、痘印与痣、眼下暗沉、鼻翼与耳缘的细微毛细血管、T 区油光 | `visible pores, natural skin micro-texture, uneven skin tone, faint capillaries at the nostrils and ear rims, subtle oiliness` |
| 不对称 | 眼型与眉形左右略有高低、嘴角一高一低、笑起来单边法令纹更深 | `eyelids and eyebrows slightly asymmetric, no two sides identical` |
| 毛发 | 碎发、毛躁、发尾分叉、发际线不规整 | `individual flyaway strands breaking the silhouette at the hairline` |
| 眼睛 | 湿润高光、虹膜纤维、虹膜环、下睫毛投影 | `wet specular highlight, visible iris fibres, soft limbal ring` |

年龄落在**皱纹的走向**上：法令纹、鱼尾纹、抬头纹顺着表情肌走，不是随机刻上去的线。写「四十岁的眼袋、松弛的下颌线、色素沉着」比写 `40 years old` 有用得多。

**细节量要跟景别匹配。**`image.prompt` 是半身像，写到毛孔级正合适；再往下堆到「隔着三米数得清毛孔」就成了处理过的图，不是拍出来的。

## 5. 光与摄影感（只进 `image.prompt`）

- 避开影棚均匀光和环形灯——脸上一点阴影都没有，是「一眼假」最大的单一来源。
- 交代四件事：**主光从哪来、什么光质、色温、落在脸的哪些位置**。眼窝、下巴下方、颈部要有阴影，脸才有体积。
- 加镜头语言：`50mm`、浅景深、轻微颗粒（`subtle film grain`）——模拟真实拍摄设备，不是渲染器。

```
soft directional key light from the upper left with a cool fill, gentle
falloff, ambient occlusion under the chin and in the folds; shallow depth
of field with the face in sharpest focus
```

**`image.sheet` 不用这一套**：设定图的光是固定句 `Soft even frontal studio lighting, with no visible shadows or colored light on the face or the clothes.`，见 `sheet-prompt.md`。脸的体积靠五官结构和皮肤质感写出来，不靠光。

## 6. 反向提示词

画风那一块的 `negative` **一条不落**照抄（`validate` 逐条查），再补塑料感这一组：

```
plastic or waxy skin, over-smoothed airbrushed complexion, poreless doll
face, perfectly symmetrical face, dead flat eyes without specular
highlight, helmet-like hair with no loose strands, beauty filter, 3d render
```

`flawless` / `perfect` / `beauty` 这几个词**写在正向里就是在要塑料脸**，它们属于反向词。

## 四条常踩的坑

1. **堆形容词不如给物理条件。**`ultra realistic, 8K, masterpiece` 是审美指令，模型只会输出模板脸。换成镜头、光、皮肤的具体描述。
2. **摄影感别进设定图**（见第 0 节）。
3. **分辨率不够时毛孔无处可画。**出图档位偏低的时候，配方再对也是塑料感——先看 `production.json` 的 `image.asset.resolution`，再怀疑提示词。
4. **真实感样板词会让同一批角色长成一个人。**毛孔、毛细血管、次表面散射、虹膜纤维是所有人共用的底子；**区分度必须落在个体描述上**——脸型、五官比例、体态、衣着的具体材质与磨损、这个人独有的那一处细节。个体描述写得短、样板词占了大半，两个年龄性别接近的角色出来就是同一张脸。`validate` 的雷同度门（75%）拦的就是这个。

## 交之前自己过一遍

脚本查得了画风有没有整块用上，查不了真实感写没写到位。这四条只有你能保证：

- `image.prompt` 里的姿态是**正在发生的瞬间**，不是静态名词堆
- 眼神有去处、表情是具体的微表情，不是 `smiling` + `looking at camera`
- 服饰点了材质名，并且带了穿着痕迹
- `image.sheet` 里**没有**浅景深、颗粒、方向光、抓拍、偏心构图这些摄影词，也没有笑容和动作

---

**学习来源**：不完美细节、负面词与「先给物理条件再谈风格」的提示词结构内化自 [Imagera《How to Fix Plastic-Looking AI Skin》](https://imagera.ai/blog/fix-ai-skin-plastic-look-2026)、[QuestStudio《Make AI Images Look Real》](https://queststudio.io/blog/make-it-look-real-prompt-rules)、[AVB《The Ultimate Guide to Photorealistic AI Prompts》](https://aivideobootcamp.com/blog/photorealistic-ai-prompts-guide-2026/)；「别写审美指令、要写镜头与光」内化自[《一个技巧去除 AI 味，让作品告别塑料感》](https://www.woshipm.com/ai/6394014.html)、[《Midjourney 真实面部与皮肤生成终极指南》](https://blog.bigbigwork.com/archives/202505093)；微表情与眼神空洞的成因内化自[《AI 人像不再有假人感：微表情提示词完整教学》](https://vocus.cc/article/6a0408eefd89780001628703)、[知乎《为什么你的 AI 人像永远像建模》](https://zhuanlan.zhihu.com/p/2056321651587995280)。第 0 节的字段裁剪与第 4 条坑来自本 skill 的生产实践，不在原文里；设定图的中性体态、正面均匀光与纯净画质段内化自短剧资产图片提示词 skill（assets）的《设定图提示词》《人物》。
