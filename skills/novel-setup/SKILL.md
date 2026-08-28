---
name: novel-setup
version: 1.5.0
description: |
  给 AI 短剧定生产参数：生图模型、资产图与分镜图的分辨率档位与比例、生视频模型、
  视频 aspect_ratio 与 resolution，外加四个必须跨 skill 一致的口径（画风、报告界面语言、
  提示词语言、自动驾驶 autopilot）。一次定死，落成工作目录根的 production.json，后面六个
  skill 出图与下单前向上找到它照着做。
  **画风没有内置类型也没有默认值**，由用户在这一段填成 production.json 顶层的 style 对象：
  中英文名、分镜图必带短语、角色那一块与场景那一块。写实、吉卜力、水墨、黏土定格都行——
  写什么下游就查什么，不用改任何代码。
  autopilot 为 true 时下游各自把自己那一段一口气跑完——不提问、不等拍板，
  该做的决定自己做；转移的是审批权，质量门、花费预估、失败止损照旧。
  出图与生视频都走 lingying（灵影网关）CLI：分辨率与比例就是它 input_schema 里的**枚举值**，
  原样填进 --input_data，不折算像素、提示词里也不写像素。内置的模型能力表抄自 lingying model get，
  每条都注明取数命令。
  9 道质量门全部由脚本确定性检查，最值钱的一道是「分镜图比例 = 视频比例」——不一致整批分镜图白出。
  成片画幅**没有默认值**，必须显式指定——猜错了后果是整批产物重出。
  零依赖、零 npm；本 skill 自己不调模型，出图与生视频由下游 skill 拿 lingying 下单。
  Use when asked to 定参数、配置画幅、竖屏还是横屏、出图分辨率、视频参数、production setup for AI short drama。
# 工具名两套都列：pi 认小写（read/write/edit/bash/grep/find/ls），Claude Code 认大写；各自取各自认得的
allowed-tools: read write edit bash grep find ls Read Write Edit Bash Glob Grep
triggers:
  - novel-setup
  - 生产参数
  - 定参数
  - 自动驾驶
  - autopilot
  - 画幅
  - 竖屏
  - 横屏
  - 分辨率
  - 出图参数
  - 视频参数
  - production setup
metadata:
  license: Apache-2.0
  requires:
    bins:
      - node          # >= 18，只用标准库，无 npm 依赖
  runtimes:
    - pi            # 本 skill 没有并发步骤，三家跑起来完全一样
    - claude-code
    - codex
---

## novel-setup

给 AI 短剧定**生产参数**——管线的第 0 段，在拆角色排大纲之前先跑。

它解决的问题只有一个：**技术参数散在每一次出图调用里，就必然会漂**。今天出的角色设定图是 16:9，明天出的分镜图还是 16:9，可片子要拍竖屏——这件事要等到把分镜图喂给视频模型、被裁掉两边才发现，那时一集三四十格已经出完了。

| 交付 | 解决什么 |
| --- | --- |
| 参数落成一份 JSON | 一处定死，四个下游 skill 向上找到它照着做，不各写各的 |
| **分镜图比例 = 视频比例**（门） | 分镜图是喂给视频模型的参考图，比例差一点整批白出 |
| 分辨率与比例存**枚举值** | 它们就是 lingying `--input_data` 里的 `resolution` / `aspect_ratio`，原样填、不折算像素 |
| `caps` 查模型收什么 | 「nanobanana2 收不收 4:3」「H3 managed 的档位是哪两个」——定参数时就查死，不等提交被网关拒 |
| `autopilot` 定跑法 | 一处打开，后面六个 skill 全都一口气跑完不打断；不打开就是原来的样子 |
| 资产图与分镜图分开定 | 设定图的版面要横构图，成片可以是竖屏——这两件事不是一回事 |
| **画风就住在这里** | 没有内置类型、没有默认值，用户想拍什么风格就写什么。画风漂了角色一个样、场景另一个样，合成没法看 |

`{baseDir}` = 本文件所在目录。脚本 `{baseDir}/scripts/novel-setup.mjs`，零依赖，`node` 直接跑。

**运行环境**：pi、Claude Code、codex 都能跑，工作流一样。本 skill 没有并发步骤、不出图也不下单，只要 `node`。

**边界（不做的事）**：不写故事、不出图、不下单给视频模型。它只管技术参数——出图是 `novel-characters` / `novel-art` / `novel-storyboard` 的事，下单是 `novel-storyboard` 的事，创作参数（多少集、多长、什么题材）是 `novel-outline` 的活。

---

### Step 0 — 问清三件事 ⛔ 不能猜

**成片画幅没有默认值**，必须问用户。另外两件事也一起问清：

1. **成片画幅**——竖屏 `9:16` 还是横屏 `16:9`？AI 短剧多数是竖屏，但这条不能替用户定：猜错了整批分镜图和视频重出。
2. **生视频模型**——用哪个？跑 `lingying model list --model_type video` 看网关上现在有什么，把 ID 列的值原样填。跟着定 `resolution` 档位，枚举逐个模型不同，跑 `caps --model <名>` 能查到。
3. **画风**——拍成什么样子？**没有选项列表，也没有默认值。**真人实拍、吉卜力手绘、水墨、黏土定格、80 年代胶片颗粒……用户说什么就是什么。问清楚**画风的名字**加**几个具体的质感要求**（皮肤要不要毛孔、线条是硬边还是水彩边、色彩浓还是淡），够写出下一步那一块正文就行。

生图模型默认 `nanobanana2`，分辨率档位默认 `2K`，用户没特别要求就不用问。

**自动驾驶（`autopilot`）同样有默认值（关），不用问。**用户主动说了「全自动」「别问我」「一路跑到底」这类话，就加 `--autopilot`——后面六个 skill 读到它会各自把自己那一段一口气跑完，不再停下来提问或者等拍板。本 skill 是这个字段的产地，**自己不受它约束**：上面三件事照样问。

### Step 1 — 看一眼模型收什么

```bash
node {baseDir}/scripts/novel-setup.mjs caps
```

```
生图：
  nanobanana2    档位 1K / 2K / 4K　比例 1:1 / 2:3 / 3:2 / 9:16 / 16:9
  image-2        档位 1K / 2K / 4K　比例 1:1 / 3:2 / 2:3 / 4:3 / 3:4 / 16:9 / 9:16
                 ↳ 4K 下只收 16:9 / 9:16

生视频：
  MiniMax H3 · managed         档位 768p / 2K　比例 16:9 / 21:9 / 4:3 / 1:1 / 3:4 / 9:16 / adaptive
  MiniMax H3 · open_source     档位 480p / 720p　比例 1:1 / 2:3 / 3:2 / 3:4 / 4:3 / 9:16 / 16:9
                               ↳ duration 5~15 秒整数
  …
```

**这一步值得跑**：它会暴露定不下来的组合——想拍 `4:3` 就不能用 `nanobanana2`（它不收），想在 `image-2` 上出 `4K` 的 `4:3` 分镜图也不行（8.29MP 像素上限）。早知道比出图时才知道便宜。

能力表抄自 `lingying model get`，每条都带取数命令与 UUID。**表里没有的模型不是错误**：相关的门明说跳过，其余门照常。网关上新加了模型就先跑一句看口径：

```bash
lingying model list --model_type image
lingying model get <MODEL_ID 列的 UUID>
```

### Step 2 — 生成参数文件

```bash
node {baseDir}/scripts/novel-setup.mjs init --aspect 9:16 \
  --source <剧名> --video-model "MiniMax H3" --video-resolution 768p \
  [--autopilot] [--asset-resolution 2K] [--frame-resolution 2K] \
  > <工作目录>/production.json
```

`--aspect` 一个参数同时落到分镜图比例和视频 `aspect_ratio`——这两个本来就必须相等。资产图比例单独默认 `16:9`，成片拍竖屏也不改（理由见 `{baseDir}/references/schema.md` 的「两个比例是两件事」）。

**文件必须落在工作目录根**，不是某个 skill 的子目录里——下游是向上找它的。

`init` 出来的 `style` 是一份**空骨架**，下一步填它。

### Step 3 — 写画风 ⛔ 没有默认值

```bash
node {baseDir}/scripts/novel-setup.mjs style-template
```

打印骨架与逐字段说明。按 Step 0 问到的画风把它写满，整块放进 `production.json` 的顶层 `style`：

| 填什么 | 要点 |
| --- | --- |
| `label.zh` / `label.en` | 画风的名字，报告界面显示它 |
| `phrase` | 英文小写短语，**每条**分镜图提示词里必须原样出现。同一部剧的分镜图靠它不漂 |
| `character` 五块 | 角色设定图那套：`render` / `surface` / `lighting` / `negative` / `tags` |
| `scene` 四块 | 场景与道具设定图那套：`render` / `surface` / `negative` / `tags` |

三条铁律，写之前先记住：

1. **`character` 与 `scene` 是同一个画风的两种落地，不是同一段文字。**写实的人要毛孔、皮下散射、根根分明的碎发；写实的环境要斑驳、水渍、包浆、灰尘。把人那套带进环境，出来就是四不像。
2. **换风格是整套换。**五块一起换，不许混搭——尤其别把上一档的 `negative` 留着。
3. **正向要的词不许出现在 `negative` 里。**一边要真实感一边禁 `photorealistic`，模型两头讨好，整批图废掉。`style-coherent` 门查这一条。

正文全部写英文（它们要原样进出图提示词），`label` 是给人读的，写中文。

### Step 4 — 校验 ⛔ 不能跳

```bash
node {baseDir}/scripts/novel-setup.mjs validate <工作目录>/production.json
```

9 道门全是代码：字段齐全与枚举合法、三个比例的写法、**分镜图比例 = 视频比例**、资产图是横构图或方形、三处分辨率档位都已填、视频模型与参数合法、档位与比例都被生图模型收、**画风各块填全**、**画风不自相矛盾**。

`model-caps` 与 `video-model` 是改走 lingying 之后才查得起的：档位与比例是 `input_schema` 里的枚举值，**写错要到提交那一刻才被网关拒绝**，那时整集分镜图已经出完了。表里没有的模型明说跳过，不装查过。

`style-blocks` 与 `style-coherent` 是画风交给用户之后才需要的：以前画风是两档写死的预设，正文由代码保证；现在正文是写出来的，缺块与自相矛盾都得查。

**有违规逐条修，改完重跑，直到通过。**

### Step 5 — 汇报

```bash
node {baseDir}/scripts/novel-setup.mjs show <工作目录>/production.json
```

打印一张人读的参数表加门的结果。汇报一句话说清：成片什么画幅、分镜图和资产图各是什么档位、生图与生视频模型是哪个、画风是什么（名字加那句分镜图短语）、自动驾驶开着还是关着、文件落在哪里。

最终落地：

```
<工作目录>/
├── production.json      ← 就这一个文件，后面四个 skill 向上找它
├── outline/
├── characters/
├── art/
├── script/
└── storyboard/
```

**不出 HTML 报告**：这是一份十来行的参数表，`show` 就够了，多一份要 render 的产物只是多一处会漂的东西。

---

## 下游怎么用它

完整契约见 `{baseDir}/references/contract.md`。三句话版本：

- **下游向上找**：从自己的段目录向上最多 5 层找 `production.json`，找到第一份就用。**下游不 import 本 skill 的代码**——每个 skill 都要能整个拷走单独跑，查找逻辑各自实现十几行。
- **找不到就明说跳过**，照旧用内置默认值，但要在校验输出里说清哪几道门跳过了。装作查过比没查更坏。**画风是唯一没有内置默认值的**——它的正文本来就只住在这一份文件里，下游没有一份可退，所以那几道门只能跳过，跳过就要说清这一趟没有任何东西在保证画风不漂。
- **产物各归各的段目录**：`outline/`、`characters/`、`art/`、`script/`、`storyboard/`，根目录只住这份 `production.json`。下游 `validate` 找到它就顺带核对落点——放错了点名该去哪，是提示不是门（落点写错不用重出图）。
- **找到了就必须遵循**，界线是改了要不要重出图：画风、画幅**设门不可绕过**，出图档位必须带进调用；报告界面语言走继承（`--lang` > 产物 JSON 顶层 > `production.json` > 默认中文），不设门。
- **画风只有这一处产地**：下游的 `cast.json` / `art.json` / `storyboard.json` 顶层**没有** `style` 字段。产物里再抄一份就是第二个来源，两个来源必然会漂。
- **`autopilot` 管的是跑法不是参数**：为 `true` 时下游各自把自己那一段一口气跑完——不提问、不等拍板，该做的决定自己做，做过的决定全部写进汇报。**转移的是审批权，不是取消检查点**：质量门照样是门、花钱前照样先算账、失败的止损照样止损。只认布尔真值（字符串 `"false"` 在 JS 里是真的，`fields` 门查这个类型）。

一行拿到某一段要的全部参数：

```bash
node {baseDir}/scripts/novel-setup.mjs resolve --for storyboard
```

`resolution` 与 `aspectRatio` 是原样的真源，`inputData` 是拼好的 lingying 参数——补一个 `prompt`（要参考图再补 `images`）就能提交。`style` 只给这一段要的那一块（`--for characters` 给 `character`、`--for art` 给 `scene`、其余只给 `label` 与 `phrase`）；要看完整的一份跑 `style <production.json>`。

## 六个 skill 的接力

```
novel-setup      → production.json （拿什么拍：模型、画幅、分辨率、画风）
novel-outline    → outline.json    （什么：结构与分集）
novel-characters → cast.json       （谁：角色设定图）
novel-art        → art.json        （哪里：场景与道具设定图）
novel-script     → script.json     （戏：场次、节拍、台词）
novel-storyboard → storyboard.json （怎么拍：镜头、分镜图、批次）
```

`novel-setup` 是唯一一个不产生创作内容的段，它产生的是**所有创作内容要落进的那个容器的形状**。

## 边界

- **成片画幅不设默认值**：这是唯一一个宁可让用户多打一个参数也不能猜的参数
- **画风不设内置类型**：以前是 `realistic` / `ghibli` 两档写死的枚举，正文分存在三个出图 skill 的代码里——想拍水墨只能改代码，改一处还漏两处。现在正文就是 `style` 字段本身，写什么下游查什么
- **分辨率与比例是枚举值不是像素**：它们就是 lingying `--input_data` 里的两个字段，原样填。折算像素那一层整个没有了，也就没有了「拼法漂了」这类问题
- **能力表只收有确凿依据的**：每一条都抄自 `lingying model get`，带取数命令与 UUID，过期了重跑一次就能对账。表里没有的模型不是错误——相关的门明说跳过，不装查过
- **adaptive 不进本管线**：模型收它，但分镜图要按同一个比例整批出，比例交给模型临场挑就对不上了
- **`autopilot` 是唯一一个不管技术参数的字段**：它不改任何一个下给模型的值，只决定下游遇到「该问用户」时停不停。放在这里是因为它跟画风、语言一样必须跨 skill 一致——一段问一段不问，用户体验比全问还差
- **不替用户想画风**：本 skill 不预置任何一档风格，也不建议某一档。它只保证写下来的那一套完整、不自相矛盾、下游查得动
- 不管创作参数（集数、时长、题材）——那是 `novel-outline` 的活

## 自测

```bash
node {baseDir}/scripts/selftest.mjs
```

249 项断言，不调模型、不碰网络、不花额度。9 道质量门每一道都有击穿用例。改完脚本先跑这个。

## 自带样例

- `{baseDir}/examples/回南天-production.json`：**竖屏 9:16** 真人实拍、2K、英文提示词、`nanobanana2` + `MiniMax H3`、自动驾驶关——AI 短剧最常见的形态
- `{baseDir}/examples/雪线-production.json`：**横屏 16:9** 吉卜力手绘、4K、中文提示词、`image-2` + `seedance2.0`、自动驾驶开——另一头的极端

两份都当质量基准，也是自测夹具。**成片画幅两种、画风两套、档位两档、提示词语言两种、生图模型两个、视频模型两个、自动驾驶两档各出现一次**——因为这个 skill 交付的就是「参数可以怎么组合」本身。

那两套画风**是样例不是选项**：它们演示的是一块写满的 `style` 该长什么样（`character` 与 `scene` 分开写、`negative` 与正向那几块不打架），不是「只能在这两个里挑」。照着它们的详细程度写自己那一档就行。
