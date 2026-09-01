# novel-creation Step 2 走查：从剧本第 1 集到一条视频提示词

**素材**：仓库根的 `demo-script.json` 第一条数据——《我把爱情煲成汤》第 1 集，场次 `S02`，深夜酒吧初遇。
**目的**：把 `novel-creation` 的 Step 2（唯一由模型执笔的一步）拆成五个动作逐一演示，交代每个决定是从剧本哪个字段推出来的、被哪道门盯着。

这份文档**不是 skill 的自带样例**（`novel-creation` 自带《收书人》，见 `skills/novel-creation/examples/`），是一份流程走查。文档里的分段规划与两条完整提示词都实际核对过，验证记录在最后一节。

---

## 一、进 Step 2 之前手里有什么

Step 2 不读剧本原文，读的是 Step 1 `seed` 展开出来的工作底稿：

```bash
node skills/novel-creation/scripts/novel-creation.mjs seed demo-script.json --eps 1-1 \
  > creation/我把爱情煲成汤-creation.json
```

底稿里这一集是 **1 场、55 拍、106.1 秒**（`targetSeconds` 120 秒，容差 ±15% → 102–138 秒）。节选：

| 拍 | 类型 | 秒 | 说话人 | 内容 |
| --- | --- | --- | --- | --- |
| 1 | 动作 | 2.5 | | 深夜的妖绿酒吧，绿色霓虹灯管亮着，舞池里人影晃动。一个背着书包的女孩从人群里挤出来，径直走向角落卡座。 |
| 2 | 动作 | 2.5 | | 何念斌正和同事碰杯，女孩在他面前站定，仰着头看他。 |
| 3 | 台词 | 2.7 | C02 | 先生，我可以陪你睡觉吗？ |
| 4 | 动作 | 2.5 | | 何念斌一口酒呛住，杯子重重顿在桌上。 |
| 5 | 台词 | 1.1 | C01 | 你说什么？ |
| 6 | 台词 | 2.9 | C02 | 我可以陪你睡觉，价钱你定。 |
| … | | | | （共 55 拍） |

**每拍的秒数是 `seed` 算出来的，不要重新估**：台词按 `字数 ÷ 4.5`，动作固定 2.5 秒（`charsPerSecond` / `actionSeconds` 从 `script.params` 继承，这份剧本没写就走默认值）。

另外三份输入按有则用：

| 输入 | 这一步拿它做什么 |
| --- | --- |
| `production.json` | 读 `video.model` 决定载入哪份填法指南；读 `style.phrase` 写进收尾段 |
| `outline.json` + `cast.json` | 角色 id→name 映射，解析参考图路径；`en` 模式下的禁人名别名表 |
| `art.json` | 场景/道具 id→name 映射 |

本走查假定的上游（真实项目里由 `novel-setup` / `novel-outline` / `novel-characters` / `novel-art` 产出）：

```jsonc
// production.json（工作目录根）
{ "video": { "model": "seedance2.5", "aspect_ratio": "9:16", "resolution": "1080p" },
  "style": { "phrase": "写实都市夜景，绿色霓虹低照度" },
  "lang": "zh", "autopilot": false }
```

| 编号 | 名字 | 设定图路径（由 `ref` 经 id→name 推导） |
| --- | --- | --- |
| C01 | 何念斌 | `../characters/images/何念斌-sheet.png` |
| C02 | 夏鸥 | `../characters/images/夏鸥-sheet.png` |
| C04 | 大板 | `../characters/images/大板-sheet.png` |
| S02 | 妖绿酒吧 | `../art/images/妖绿酒吧-sheet.png` |

中文名的 `slug` 原样保留，不做转写（`node scripts/novel-creation.mjs slug 何念斌` → `何念斌`）。

---

## 二、Step 2 的五个动作

| # | 动作 | 产出 | 被谁管 |
| --- | --- | --- | --- |
| 1 | 读 `video.model`，载入填法指南 | 一份填法约束（语言、台词符号、能不能写时刻） | ⛔ 不能跳，`prompt-model-fit` 门查其中一条 |
| 2 | 按剧情单元分段 | `segments[].id` + `sceneIndex` + 段边界 | `segment-cap`、`segment-id`、`coverage` |
| 3 | 段内切分镜 | `cuts[].beats/seconds/size/camera/characters` | `cut-length`、`dialogue-fit`、`crowd`、`scene-account` |
| 4 | 段级挂载参考图 | `segments[].images` | `refimage-coverage`、`refimage-labeled` |
| 5 | 每段写一条 `prompt` | `segments[].prompt` | `size-phrase`、`camera-phrase`、`dialogue-verbatim`、`prompt-lang`、`prompt-no-names`、`prompt-model-fit` |

顺序不能颠倒：动作 1 决定动作 5 怎么写，动作 4 的数组顺序决定动作 5 开头的编号。

---

## 动作 1 — 读 `video.model`，载入填法指南

```
production.json → video.model = "seedance2.5"
                → 载入 skills/novel-creation/references/seedance2-prompt.md
```

这一步定下四件事，后面全程照办：

| 项目 | seedance 系列的填法 |
| --- | --- |
| `promptLang` | 默认 `zh`，整条中文（官方术语与案例通篇中文；剧本台词也是中文，整条英文正文配中文台词正是官方点名的混用） |
| 台词符号 | `{}` 包裹 |
| 精确时刻 | **全程禁止**——官方明说限制精确时间会让生成异常，`prompt-model-fit` 门当场拦 |
| 收尾段 | `环境声与配乐：` 之后补画质、风格、约束词 |

段时长区间同时收窄：`maxSegmentSeconds` 默认 15，`seedance2.5` 的区间是 4–30，取交集 → **每段 4–15 秒**。

---

## 动作 2 — 按剧情单元分段

段的三条约束：**≤ 15 秒**（挂了生产参数还要落进模型区间）、**不跨场次**、**一段一个环境锚**。

### 这一集踩到的第一个真实问题：一场戏跨了三个物理空间

`S02` 的 55 拍里，空间换了两次：

| 拍 | 空间 |
| --- | --- |
| 1–46 | 酒吧内，角落卡座 |
| 47–49 | 酒吧大门外，夜风 |
| 50–55 | 出租车后座 |

`sceneIndex` 全是 1，所以 `coverage` 门**不会**拦跨空间的段——它只查节拍连续、不跨场次。换景必开新段是 `shot-pass.md` 的导演规则，靠人判断。这里在拍 46/47 与拍 49/50 之间强制切开，落成 E01-11、E01-12 两段。

### 全集分段规划（12 段）

| 段号 | 认领节拍 | 切数 | 段秒 | 剧情单元 | 空间 |
| --- | --- | --- | --- | --- | --- |
| E01-01 | 1–3 | 3 | 8.5 | 进场 + 第一句炸弹 | 酒吧 |
| E01-02 | 4–6 | 3 | 7.5 | 呛住 + 她把话重说一遍 | 酒吧 |
| E01-03 | 7–11 | 3 | 9.0 | 同事起哄 + 问出十六岁 | 酒吧 |
| E01-04 | 12–16 | 4 | 10.5 | 上下打量 + 她自陈身份 | 酒吧 |
| E01-05 | 17–20 | 3 | 9.5 | 满桌安静 + 同事劝走 | 酒吧 |
| E01-06 | 21–24 | 3 | 8.5 | 掏学生证自证 | 酒吧 |
| E01-07 | 25–30 | 3 | 10.5 | 转身要走 + 叫住 + 报名字 | 酒吧 |
| E01-08 | 31–35 | 3 | 9.5 | 对视 + 「你刚才没跟着起哄」 | 酒吧 |
| E01-09 | 36–40 | 4 | 13.0 | 仙人跳警告 + 「我没有家」 | 酒吧 |
| E01-10 | 41–45 | 4 | 11.5 | 「今晚住你那儿」+ 穿过舞池 | 酒吧 |
| E01-11 | 46–49 | 2 | 6.5 | 出门 + 夜风里的「冷？」 | 门外 |
| E01-12 | 50–55 | 3 | 10.0 | 出租车上交换名字 | 车内 |

**合计 114.5 秒**，目标 120 秒，落在 102–138 秒区间内 ✓。每段都在 4–15 秒 ✓。

分段的三个判断依据，都在表里能看出来：

- **一次交锋一段**：E01-01 到 E01-02 的切点在「呛住」之前，因为那是一句话砸下去之后的反应，属于新的一拍交锋
- **重台词单独占段尾**：E01-04 收在「知道。我是妓女。」，E01-09 收在「我没有家。」——`shot-pass.md` 的「段的最后一切留钩」
- **短段不硬凑**：E01-11 只有 6.5 秒，因为门外那三拍本来就短，硬并进车内那段就跨了空间

---

## 动作 3 — 段内切分镜

每切 2–5 秒，围着 3 秒打，一段 2–4 切。以 **E01-01** 为例，三拍对三切：

| 切 | 认领 | 秒 | 景别 | 运镜 | 画内人物 | 为什么这么切 |
| --- | --- | --- | --- | --- | --- | --- |
| #1 | 拍 1 | 3.0 | `wide` | `Tracking Shot` | C02 | **进场三件套：第一切给运动主体。** 全集开场不能是静物特写，跟拍她挤出人群把环境和主体一次交代完 |
| #2 | 拍 2 | 2.5 | `medium` | `Static Shot` | C01 C02 C04 | 三人同框建立关系位置，镜头不动——下一切要推，这里先稳住 |
| #3 | 拍 3 | 3.0 | `close` | `Push In` | C01 C02 | 全集第一句台词，**推给情绪**。台词 2.7 秒，给 3.0 秒装 |

秒数来自节拍但不等于节拍：**分镜秒数是导演定的，只要台词装得下**。`dialogue-fit` 门查的是「认领节拍的台词秒数 ≤ 分镜秒数」，判定是 `dlg > cut.seconds` 才算违规，相等放行——但 2.7 配 2.7 太贴边，给 3.0 留一点呼吸。

### 这一集踩到的第二个真实问题：一处台词爆仓

规划 E01-08 时，把拍 34–35（「为什么是我？」1.3 秒 +「你刚才没跟着起哄。」2.0 秒 = 3.3 秒）切成 3.0 秒，核对时当场点名：

```
✗ E01-08 拍[34,35] 台词 3.3s 装不进 3s
```

改成 3.5 秒即通过，段秒从 9.0 变 9.5，全集总时长 114.0 → 114.5，仍在区间内。**这就是 `dialogue-fit` 的工作方式**——不是拍脑袋，是逐镜算。

### 画外音怎么认领

E01-11 的 #1 认领拍 46–47：拍 46 是 C04（大板）的台词「老何，明天上班别迟到！」，但此刻两人已经走向大门，大板不在画面里。处理成**画外音**：

- `cut.characters` 写 `["C01","C02"]`——`scene-account` 门查的是 `⊆ 剧本该场人物`，不查「说话人在不在画面里」
- `dialogue-verbatim` 门照样要求这句台词逐字出现在 `prompt` 里
- 提示词正文写明声音来自身后

---

## 动作 4 — 段级挂载参考图

挂什么：**这一段实际入镜的**人物/场景/道具，不是「这场戏出现过的全集」。

### E01-01 的挂载

| Picture | `kind` | `ref` | 名字 | 为什么挂 |
| --- | --- | --- | --- | --- |
| 1 | `character` | C02 | 夏鸥 | 三切里都是她，全片主体 |
| 2 | `character` | C01 | 何念斌 | #2 #3 入镜 |
| 3 | `character` | C04 | 大板 | 只有 #2 入镜，但那一切必须有他 |
| 4 | `scene` | S02 | 妖绿酒吧 | 全集第一次建立环境 |

四张，seedance 官方建议一段收敛到 5 张以内 ✓。

### E01-02 的挂载：**故意少挂一张**

| Picture | `kind` | `ref` | 名字 |
| --- | --- | --- | --- |
| 1 | `character` | C02 | 夏鸥 |
| 2 | `character` | C01 | 何念斌 |

不挂场景设定图，也不挂大板：

- **不挂大板**：这一段三切分别是何念斌呛住、何念斌反问、夏鸥答话，大板一次都没入镜
- **不挂场景**：上一段刚建立过环境，这一段全是中景与特写，镜头没有离开卡座——`shot-pass.md` 明说这种情况可以不重复挂载，靠文字描述延续「此刻还在原地」

`refimage-coverage` 门查的是「挂了的能不能解出文件」，不是「这段该不该挂」。挂不挂是导演判断，理由写进段的 `note` 里备查：

```json
"note": "不挂场景设定图：上一段刚建立过环境，这一段是中景与特写，镜头没有离开卡座"
```

### 排序惯例：全片固定，不要每段重排

seedance 官方要求「越需要精准参考的素材放得越靠前」，同时要求每个主体给一个**全程复用的稳定标签**。这两条会打架：按每段的重要性重排，`<主体1>` 在这一段是夏鸥、下一段变成何念斌，写着写着就混了。

本走查采用的惯例：**全片固定优先级 `夏鸥 > 何念斌 > 其他角色 > 场景 > 道具`**，谁出现谁按这个顺序占位。这样 `<主体1>` 在任何有夏鸥的段里恒等于夏鸥，既满足「重要素材前置」（女主是全片核心），又不会让标签在段之间漂。

> ⚠️ **标签只在段内有效。** 每段是一次独立的生成调用，`images` 数组重编号，`<主体k>` 的所指跟着变。不设固定惯例的话，跨段复制提示词片段是最容易出错的动作。

### 这一集踩到的第三个真实问题：学生证没登记为道具

拍 21「夏鸥从书包里掏出一张学生证，摊在桌上」，学生证是这一段的叙事核心，但 `S02` 的 `props` 是空的——剧本没把它登记成道具。后果：

- `cut.props` **不能**写它（`scene-account` 门查 `cut.props ⊆ 剧本该场道具`，写了当场拦）
- `images` 也挂不了它（没有 `art.json` 的条目就推导不出设定图路径）

两条路，选一条：

1. **回 `novel-script` 给 `S02` 补 `props: ["P0x"]`，再回 `novel-art` 出这张道具设定图**——学生证是这一集的转折物证（大板看了才信），值得走这条
2. **在提示词里用文字描述**——`[镜头 k]` 行写「一张塑封的学生证，照片一角压着钢印」，不挂参考图

本走查走第 2 条（demo 的上游没有这个道具条目），但在段的 `note` 里记一句，交给下一轮决定。

---

## 动作 5 — 写提示词

骨架照 `creation-prompt.md`，填法照 `seedance2-prompt.md`。逐块拆解 E01-01：

### 块 1：身份说明句（`refimage-labeled` 门数数量）

```
图 1 是背着帆布学生书包、扎马尾辫、穿牛仔裤的少女，眉眼干净，下文称<主体1>。
图 2 是三十出头、穿深色衬衫的男人，眼下带着倦色，下文称<主体2>。
图 3 是体格壮实、穿花衬衫的中年男人，笑时眼睛眯成一条缝，下文称<主体3>。
图 4 是深夜营业的酒吧内景，绿色霓虹灯管沿墙铺开，舞池拥挤，墙角是一排卡座，下文称<场景1>。
```

- **`图 k 是` 的句数必须等于 `images` 长度**，4 张图 4 句，不多不少
- 前半句 `图 k 是<2–3 个稳定静态特征>` 给门，后半句 `下文称<主体N>` 给模型——seedance 官方要求的主体标签
- 特征写**通用描述**，不写人名。虽然 `zh` 模式下 `prompt-no-names` 门放行人名，但身份识别本来就该交给参考图，文字只负责让模型能区分「这三个人不是同一个」
- 这三条特征（书包、马尾辫、牛仔裤）不是我编的，是拍 12「何念斌上下打量她：牛仔裤、马尾辫、肩上的学生书包」里剧本自己写的

### 块 2：`[镜头 k]` 逐镜描述（`size-phrase` / `camera-phrase` / `dialogue-verbatim` 三道门逐切核对）

```
镜头描述：
[镜头 1] 全景, 跟拍 — 深夜的<场景1>，绿色霓虹灯管沿墙亮着，舞池里人影密集晃动；<主体1>侧着肩从人群缝隙里挤出来，帆布书包在背后一颠一颠，她目不斜视地朝墙角卡座走去；镜头在她身后平稳跟拍。（背景中播放着节奏沉闷的电子舞曲）
[镜头 2] 中景, 固定镜头 — 卡座里<主体2>正举杯和<主体3>碰了一下，杯沿刚离开嘴唇；<主体1>在桌前站定，双手扣住书包背带，微微仰起头看向<主体2>；镜头固定不动。<玻璃杯轻碰的脆响>
[镜头 3] 特写, 推 — <主体1>的脸，绿色灯光斜切过她半张脸，她眼睛一眨不眨，声音清脆得像在问路：{先生，我可以陪你睡觉吗？}；镜头缓慢推近。
```

每一行怎么长出来的：

| 成分 | 来源 | 门 |
| --- | --- | --- |
| `全景` / `中景` / `特写` | `cut.size` 的中文词（`SHOT_SIZES` 表） | `size-phrase`：必须落在**这一切自己的行**里 |
| `跟拍` / `固定` / `推` | `cut.camera` 的中文词根（`CAMERA_MOVES` 表） | `camera-phrase`：同上 |
| 动作描写 | `flow[].action` 原文改写 | 无门 |
| `{先生，我可以陪你睡觉吗？}` | `flow[].line` **逐字** | `dialogue-verbatim`：纯文本子串匹配，`{}` 包在外面不影响 |
| `声音清脆得像在问路` | `flow[].delivery`（「声音清脆，像在问路」） | 无门 |

> ⚠️ **`delivery` 不在 seed 底稿里。** `seedFromScript` 只把 `n / kind / seconds / speaker / text` 带进 `seedScenes`，表演提示丢在 `script.json` 原文里。要用它就直接翻剧本，别指望底稿。

三个填法细节：

1. **中文运镜词是词根，不是完整术语。** 门查的是 `固定`、`推`、`跟拍`，所以 `镜头固定不动`、`镜头缓慢推近` 都能命中；但 `Tilt Down` 的词根是 `俯摇`，写成「镜头缓慢下移」就**不含**这个词，门会拦。写之前对一眼 `schema.md` 的词表。
2. **单字运镜撞车。** 中文里「他推开门」和「镜头推近」都有「推」字，模型分不清是机位动了还是人动了。运镜写成完整短语（`镜头缓慢推近`），人物动作换个说法（`伸手把门推开`），同一行里把主语分清。
3. **四种括号别混。** 音乐 `（）`、音效 `<>`、台词 `{}`、字幕 `【】`。`<玻璃杯轻碰的脆响>` 与 `<主体1>` 都用尖括号是官方的写法，照办即可。

### 块 3：声景（`[镜头 k]` 切片的右边界）

```
环境声与配乐：低频的电子舞曲从舞池方向压过来，人群说话声混成一片嗡响，玻璃杯偶尔相碰。除舞池音乐外无额外配乐。
```

`镜头描述：` 和 `环境声与配乐：` 是两个**固定字段名**，`[镜头 k]` 的切片边界由它们夹出来。**不要自己加字段**——加了切片就散，逐镜的三道门跟着一起脏。

**声景也是动作指令**：画面改了这一句必须跟着改。这里写了「玻璃杯偶尔相碰」，因为 #2 有碰杯动作。

### 块 4：收尾段（写在 `环境声与配乐：` 之后，不能在之前）

```
全片高清电影质感，绿色霓虹为主的低照度夜景，光影硬朗，皮肤质感写实；人物面部稳定不变形，动作自然连贯，无卡顿无闪烁。保持无字幕，不要生成 Logo，不要生成水印。视频全程禁止出现外形、着装、配饰完全一致的人物，禁止生成同款分身、双胞胎效果，同一画面中仅保留单个对应人物。
```

三件事一段写完：**画质** + **风格**（跟 `production.json` 的 `style.phrase` 走）+ **约束词**。

最后那句「禁止双胞胎」不是可选的：`novel-characters` 落盘的是**三视图版面**的 `-sheet.png`，seedance 官方两处点名多视图素材会加剧人物 ID 漂移与双胞胎。提示词兜底 + 主角图排 `images[0]` 是零成本必做项；要更稳就从 sheet 裁一张单人半身像另存 `-face.png`，在 `manifest.seedance.json` 上改路径下单（`seedance2-prompt.md` 第四节有完整做法）。

**位置很关键**：收尾段写在 `环境声与配乐：` 之前，会被算进最后一切的 `[镜头 3]` 行里。

---

## 三、成品与对照

### E01-01 完整 JSON

```json
{
  "id": "E01-01",
  "sceneIndex": 1,
  "images": [
    { "kind": "character", "ref": "C02", "role": "主体身份参考" },
    { "kind": "character", "ref": "C01", "role": "主体身份参考" },
    { "kind": "character", "ref": "C04", "role": "配角身份参考" },
    { "kind": "scene", "ref": "S02", "role": "环境参考" }
  ],
  "cuts": [
    { "beats": [1, 1], "seconds": 3,   "size": "wide",   "camera": "Tracking Shot", "characters": ["C02"] },
    { "beats": [2, 2], "seconds": 2.5, "size": "medium", "camera": "Static Shot",   "characters": ["C01", "C02", "C04"] },
    { "beats": [3, 3], "seconds": 3,   "size": "close",  "camera": "Push In",       "characters": ["C01", "C02"] }
  ],
  "prompt": "图 1 是背着帆布学生书包、扎马尾辫、穿牛仔裤的少女，眉眼干净，下文称<主体1>。图 2 是三十出头、穿深色衬衫的男人，眼下带着倦色，下文称<主体2>。图 3 是体格壮实、穿花衬衫的中年男人，笑时眼睛眯成一条缝，下文称<主体3>。图 4 是深夜营业的酒吧内景，绿色霓虹灯管沿墙铺开，舞池拥挤，墙角是一排卡座，下文称<场景1>。\n\n镜头描述：\n[镜头 1] 全景, 跟拍 — …\n[镜头 2] 中景, 固定镜头 — …\n[镜头 3] 特写, 推 — …\n\n环境声与配乐：…\n\n全片高清电影质感，…"
}
```

（`prompt` 里的换行是真实的 `\n`；`[镜头 k]` 一切就是一行，中间不断行。完整正文见上一节逐块拆解。）

### E01-02 对照：少挂一张图，节奏换一种

```
图 1 是背着帆布学生书包、扎马尾辫、穿牛仔裤的少女，眉眼干净，下文称<主体1>。图 2 是三十出头、穿深色衬衫的男人，眼下带着倦色，下文称<主体2>。

镜头描述：
[镜头 1] 中景, 轻微晃动 — <主体2>刚喝进一口酒，肩膀猛地一缩，呛得侧过头去咳，握杯的手用力把玻璃杯顿在桌面上，酒液晃出杯沿；镜头随他的动作轻微晃动。<玻璃杯重重顿在木桌上的闷响>
[镜头 2] 特写, 推 — <主体2>抹了一把嘴角，眉头拧紧，抬眼直视对面，从喉咙里挤出一句：{你说什么？}；镜头缓慢推近他的脸。
[镜头 3] 特写, 固定 — <主体1>站在原地没有退开，双手仍扣着书包背带，下巴微微抬着，语气平得像在报价：{我可以陪你睡觉，价钱你定。}；镜头固定不动。

环境声与配乐：舞池的低频音乐持续压在背景里，人群喧哗声不断，一声玻璃杯顿桌的闷响格外清楚。无额外配乐。

全片高清电影质感，绿色霓虹为主的低照度夜景，光影硬朗，皮肤质感写实；人物面部稳定不变形，动作自然连贯，无卡顿无闪烁。保持无字幕，不要生成 Logo，不要生成水印。视频全程禁止出现外形、着装、配饰完全一致的人物，禁止生成同款分身、双胞胎效果，同一画面中仅保留单个对应人物。
```

跟 E01-01 的三处差异，都是有理由的：

| 差异 | 理由 |
| --- | --- |
| 身份句从 4 句减到 2 句 | `images` 少挂两张，句数必须跟着减——`refimage-labeled` 门数的就是这个 |
| 开场用 `轻微晃动` 而不是固定镜头 | 呛咳是身体的突发动作，镜头跟着抖一下比稳着拍有力；`Shake Slightly` 的中文词根是 `轻微晃动` |
| 两个特写连着切 | 正反打：他问、她答，各给一张脸。`shot-pass.md` 的「对话切正反打」 |

### 换成 MiniMax H3 会变成什么

改 `production.json` 的 `video.model` 就要**重读 `h3-prompt.md`、重写这一批的填法**。同一段 E01-01：

```
Picture 1 is a teenage girl with a ponytail, worn jeans and a canvas school backpack. Picture 2 is a man in his early thirties in a dark shirt, tired around the eyes. Picture 3 is a stocky middle-aged man in a loud floral shirt. Picture 4 is the interior of a late-night bar, green neon tubes running along the walls, a crowded dance floor and booth seating in the corner.

shots:
[Shot 1] Wide shot, Tracking Shot — deep night inside the bar, green neon tubes glowing along the walls, bodies shifting on the crowded dance floor; the girl with the canvas backpack squeezes sideways out of the crowd, the backpack bouncing behind her, and walks straight toward the corner booth; the camera tracks her steadily from behind.
[Shot 2] Medium shot, Static Shot — in the booth the man in the dark shirt has just clinked glasses with the stocky man in the floral shirt, the rim barely off his lips; the girl stops at the table, both hands hooked on her backpack straps, and tilts her face up at him; the camera holds still.
[Shot 3] Close-up, Push In — the girl's face, green light cutting across one half of it, her eyes not blinking, her voice clear and light as if she were asking for directions: "先生，我可以陪你睡觉吗？"; a slow push in on her face.

ambience: Low-frequency dance music pressing in from the floor, the crowd talk blurred into a hum, glasses clinking now and then; no music beyond the club track.
```

**骨架一个字没改**，变的全是填法：

| 项目 | seedance2.5 | MiniMax H3 |
| --- | --- | --- |
| 语言 | 整条中文 | 整条英文，**且禁人名**（`prompt-no-names` 门在 `en` 模式逐个查别名） |
| 字段名 | `镜头描述：` / `环境声与配乐：` | `shots:` / `ambience:` |
| 镜头标记 | `[镜头 k]` | `[Shot k]` |
| 景别运镜 | 中文词根 `全景` `跟拍` | 英文短语 `wide shot` `tracking shot`（大小写不敏感） |
| 台词符号 | `{}` | **英文直双引号 `"`** |
| 主体标签 | `<主体1>` 全程复用 | 无标签体系，同一个人全段用**同一个说法**（`the girl with the canvas backpack` 不能下一镜改叫 `that student`） |
| 收尾段 | 画质 + 风格 + 约束词 | **没有**——那是 seedance 的填法 |
| 段时长区间 | 4–30（与 15 取交集 → 4–15） | **5–15** |

> ⚠️ **`en` 模式下台词必须用英文直双引号 `"`。** 语言门是这么剥的：`prompt.replace(/"[^"\n]*"/g, ' ')` ——只认 ASCII 直双引号，且不跨行。用中文引号「」或弯引号 `""` 包中文台词，剥不掉，`prompt-lang` 门会报「在台词引号之外混入了中文」。

段秒 8.5 落在 H3 的 5–15 区间内 ✓；如果哪一段只有 3 秒，`clampDuration` 下单时会顶到 5 秒，片尾多出的部分留给剪辑裁掉。

---

## 四、收尾

切完 12 段，**把 `seedScenes` 删掉**——它是工作底稿，不是交付物。然后进 Step 3：

```bash
cd <工作目录>/creation
node {baseDir}/scripts/novel-creation.mjs validate 我把爱情煲成汤-creation.json \
  --script <script.json> --outline <outline.json> --cast <cast.json> --art <art.json>
```

---

## 五、验证记录

文档里的东西都实际核对过，没有拍脑袋的数字：

**1. 分段规划（12 段）用 `expandScript` 的真实秒数核对**——覆盖连续不重不漏、段 4–15 秒、切 2–5 秒、每一切的台词都装得下：

```
末拍游标: 55 / 55
总时长: 114.5 s | 目标 120s | 区间 102–138s
✓ 覆盖连续不重不漏、段 4–15s、切 2–5s、台词全部装得下
```

第一版有一处失败（`E01-08 拍[34,35] 台词 3.3s 装不进 3s`），把那一切从 3.0 秒加到 3.5 秒后通过——文档里保留了这个过程。

**2. E01-01 + E01-02 两段的完整 JSON 跑过 `validate`**（seedance 中文版与 H3 英文版各跑一次），结果：

```
✗ 2 处违规：
  质量门未过：剧本节拍被恰好一次、按顺序、连续认领（分镜级）（E01 第 1 场第 7–55 拍没人认领）
  质量门未过：每集总时长在剧本目标 ±15% 内（E01 欠 86 秒（16s / 目标 120s））
```

**这两道红是示例只展开了 2 段造成的**，切满 12 段就绿。其余门全部通过，包括这一步真正要验的六道：`size-phrase`、`camera-phrase`、`dialogue-verbatim`、`prompt-lang`、`prompt-model-fit`、`refimage-labeled`。

没跑到的两道门与原因：

- `refimage-coverage`：没给 `--outline` / `--art`，脚本明说跳过（走查里的角色/场景条目是假定的，设定图文件不存在）
- `segment-cap` 的模型区间比对：工作目录里没有 `production.json`，脚本明说跳过（走查里那份是假定的）

---

## 六、这一集暴露的三个问题（不是 skill 的 bug，是真实项目会遇到的）

| # | 问题 | 谁该管 |
| --- | --- | --- |
| 1 | 一场戏跨了三个物理空间（酒吧内 → 门外 → 车内），`sceneIndex` 却是同一个，`coverage` 门不会拦 | 导演判断，换景必开新段。要让门管得住，得回 `novel-script` 把它拆成三场 |
| 2 | 学生证是转折物证，却没登记进 `scene.props`，`cut.props` 写不了、参考图也挂不了 | 回 `novel-script` 补 `props`，再回 `novel-art` 出设定图；或者接受用文字描述 |
| 3 | `delivery`（表演提示）没进 `seedScenes` 底稿，写提示词时得回头翻 `script.json` 原文 | 现状如此。写「声音清脆得像在问路」这类语气描写时记得回原文取 |
