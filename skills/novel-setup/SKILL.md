---
name: novel-setup
version: 1.2.0
description: |
  给 AI 短剧定生产参数：生图模型、资产图与分镜图的分辨率档位与比例、生视频模型与变体、
  视频 aspect_ratio 与 resolution，外加三个必须跨 skill 一致的口径（画风、报告界面语言、
  提示词语言）。一次定死，落成工作目录根的 production.json，后面四个 skill 出图与下单前
  向上找到它照着做。
  出图与生视频都走 lingying（灵影网关）CLI：分辨率与比例就是它 input_schema 里的**枚举值**，
  原样填进 --input_data，不折算像素、提示词里也不写像素。内置的模型能力表抄自 lingying model get，
  每条都注明取数命令。
  7 道质量门全部由脚本确定性检查，最值钱的一道是「分镜图比例 = 视频比例」——不一致整批分镜图白出。
  成片画幅**没有默认值**，必须显式指定——猜错了后果是整批产物重出。
  零依赖、零 npm；本 skill 自己不调模型，出图与生视频由下游 skill 拿 lingying 下单。
  Use when asked to 定参数、配置画幅、竖屏还是横屏、出图分辨率、视频参数、production setup for AI short drama。
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
triggers:
  - novel-setup
  - 生产参数
  - 定参数
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
| 资产图与分镜图分开定 | 设定图的版面要横构图，成片可以是竖屏——这两件事不是一回事 |
| 画风与语言也收进来 | 画风漂了角色是吉卜力、场景是实拍，合成没法看 |

`{baseDir}` = 本文件所在目录。脚本 `{baseDir}/scripts/novel-setup.mjs`，零依赖，`node` 直接跑。

**边界（不做的事）**：不写故事、不出图、不下单给视频模型。它只管技术参数——出图是 `novel-characters` / `novel-art` / `novel-storyboard` 的事，下单是 `novel-storyboard` 的事，创作参数（多少集、多长、什么题材）是 `novel-outline` 的活。

---

### Step 0 — 问清三件事 ⛔ 不能猜

**成片画幅没有默认值**，必须问用户。另外两件事也一起问清：

1. **成片画幅**——竖屏 `9:16` 还是横屏 `16:9`？AI 短剧多数是竖屏，但这条不能替用户定：猜错了整批分镜图和视频重出。
2. **生视频模型**——用哪个？跑 `lingying model list --model_type video` 看网关上现在有什么，把 ID 列的值原样填。`MiniMax H3` 还要定**变体**（`managed` / `open_source` / `bf16` / `int8`），它决定 `resolution` 的枚举。
3. **画风**——`realistic` 真人实拍还是 `ghibli` 吉卜力？

生图模型默认 `nanobanana2`，分辨率档位默认 `2K`，用户没特别要求就不用问。

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
  [--video-variant managed] [--style realistic|ghibli] \
  [--asset-resolution 2K] [--frame-resolution 2K] \
  > <工作目录>/production.json
```

`--aspect` 一个参数同时落到分镜图比例和视频 `aspect_ratio`——这两个本来就必须相等。`--video-variant` 不给就取该模型的默认变体（H3 是 `managed`）。资产图比例单独默认 `16:9`，成片拍竖屏也不改（理由见 `{baseDir}/references/schema.md` 的「两个比例是两件事」）。

**文件必须落在工作目录根**，不是某个 skill 的子目录里——下游是向上找它的。

### Step 3 — 校验 ⛔ 不能跳

```bash
node {baseDir}/scripts/novel-setup.mjs validate <工作目录>/production.json
```

7 道门全是代码：字段齐全与枚举合法、三个比例的写法、**分镜图比例 = 视频比例**、资产图是横构图或方形、三处分辨率档位都已填、视频模型与参数合法、档位与比例都被生图模型收。

后两道是改走 lingying 之后才查得起的：档位与比例是 `input_schema` 里的枚举值，**写错要到提交那一刻才被网关拒绝**，那时整集分镜图已经出完了。表里没有的模型明说跳过，不装查过。

**有违规逐条修，改完重跑，直到通过。**

### Step 4 — 汇报

```bash
node {baseDir}/scripts/novel-setup.mjs show <工作目录>/production.json
```

打印一张人读的参数表加门的结果。汇报一句话说清：成片什么画幅、分镜图和资产图各是什么档位、生图与生视频模型是哪个（带变体）、画风哪一档、文件落在哪里。

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
- **找不到就明说跳过**，照旧用内置默认值，但要在校验输出里说清哪几道门跳过了。装作查过比没查更坏。
- **产物各归各的段目录**：`outline/`、`characters/`、`art/`、`script/`、`storyboard/`，根目录只住这份 `production.json`。下游 `validate` 找到它就顺带核对落点——放错了点名该去哪，是提示不是门（落点写错不用重出图）。
- **找到了就必须遵循**，界线是改了要不要重出图：画风、画幅**设门不可绕过**，出图档位必须带进调用；报告界面语言走继承（`--lang` > 产物 JSON 顶层 > `production.json` > 默认中文），不设门。

一行拿到某一段要的全部参数：

```bash
node {baseDir}/scripts/novel-setup.mjs resolve --for storyboard
```

`resolution` 与 `aspectRatio` 是原样的真源，`inputData` 是拼好的 lingying 参数——补一个 `prompt`（要参考图再补 `images`）就能提交。

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
- **分辨率与比例是枚举值不是像素**：它们就是 lingying `--input_data` 里的两个字段，原样填。折算像素那一层整个没有了，也就没有了「拼法漂了」这类问题
- **能力表只收有确凿依据的**：每一条都抄自 `lingying model get`，带取数命令与 UUID，过期了重跑一次就能对账。表里没有的模型不是错误——相关的门明说跳过，不装查过
- **adaptive 不进本管线**：模型收它，但分镜图要按同一个比例整批出，比例交给模型临场挑就对不上了
- 不管创作参数（集数、时长、题材）——那是 `novel-outline` 的活

## 自测

```bash
node {baseDir}/scripts/selftest.mjs
```

195 项断言，不调模型、不碰网络、不花额度。7 道质量门每一道都有击穿用例。改完脚本先跑这个。

## 自带样例

- `{baseDir}/examples/回南天-production.json`：**竖屏 9:16** 真人实拍、2K、英文提示词、`nanobanana2` + `MiniMax H3 · managed`——AI 短剧最常见的形态
- `{baseDir}/examples/雪线-production.json`：**横屏 16:9** 吉卜力、4K、中文提示词、`image-2` + `seedance2.0`（没有变体）——另一头的极端

两份都当质量基准，也是自测夹具。**成片画幅两种、画风两档、提示词语言两种、生图模型两个、视频模型两个（带变体与不带变体各一）各出现一次**——因为这个 skill 交付的就是「参数可以怎么组合」本身。
