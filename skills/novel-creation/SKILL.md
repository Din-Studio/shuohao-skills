---
name: novel-creation
version: 1.0.0
description: |
  给 AI 短剧参考图直出视频：段（一次视频生成，≤15 秒）→ 分镜（段内 2–5 秒的剪切，认领剧本节拍）——
  比 novel-storyboard 少一层：**没有分镜图**，段直接挂载 novel-characters / novel-art 已经生成
  落盘的角色/场景/道具设定图当参考图，写一条通用视频提示词（不是 H3 私有结构，跨模型通用，
  写法内化为 references/creation-prompt.md）。从 seed 到下单，不产生任何新的图像生成调用。
  产出 creation.json + Markdown + 单页评审报告（分镜节奏带 / 分集分镜表 / 参考图挂载单 /
  配音对齐单，含导出 JSON）。
  16 道质量门全部由脚本确定性检查（其中 1 道读工作目录根的 production.json：段秒数落进对应
  视频模型的时长区间，没有就明说跳过；第 16 道 shot-recipe 可选：挂上 shot-recipes 卡库才查，
  不挂就明说跳过）；export 一键导出投产包（每段提示词 + 挂载的参考图清单），再走 lingying 下单
  生视频（可选）。零依赖、零 npm。
  要精确控镜、愿意多出一层分镜图用 novel-storyboard；要快、直接吃现成设定图用这个。
  Use when asked to 直出视频、参考图生视频、不出分镜图、跳过分镜图 for AI short drama。
# 工具名两套都列：pi 认小写（read/write/edit/bash/grep/find/ls），Claude Code 认大写；各自取各自认得的
allowed-tools: read write edit bash grep find ls Read Write Edit Bash Glob Grep Task
triggers:
  - novel-creation
  - 直出视频
  - 参考图生视频
  - 不出分镜图
  - 跳过分镜图
  - 参考图直出
metadata:
  license: Apache-2.0
  requires:
    bins:
      - node          # >= 18，只用标准库，无 npm 依赖
    optional:
      - lingying      # 有才能下单生视频；没有就只交提示词与投产包，其余照常
  runtimes:
    - pi            # 没有子代理：并发步骤在当前会话串行做，产出一致
    - claude-code
    - codex
---

## novel-creation

给 AI 短剧**参考图直出视频**——`novel-storyboard` 的并列产线，不是它的替代。

**跟 `novel-storyboard` 的边界写清楚，别选错：**

| | novel-storyboard | novel-creation（本 skill） |
| --- | --- | --- |
| 分镜图这一层 | 有——每切一张关键帧，多图对齐、精确钉秒数 | **没有**——段直接挂载既有设定图 |
| 出图调用 | 分镜图要真出图（可选） | **零新增出图调用**，从 seed 到下单不生成任何新图像 |
| 提示词结构 | MiniMax H3 的 I2VA 结构（`<d>` 标签、对齐指令） | 本 skill 自己的通用结构，跨模型通用，不绑定任何一个模型 |
| 适合场合 | 要精确控镜、愿意多出一层分镜图、追求正式产出 | 要快、要省，直接拿现成设定图配提示词下单 |
| 产物落点 | `<工作目录>/storyboard/` | `<工作目录>/creation/`，与 `storyboard/` 平级 |

两条产线共享 `production.json` 的生产参数与 `cast.json`/`art.json` 的设定图，**互不改动对方的代码**，用户按场合二选一或两个都跑（比如同一集的关键场次走 storyboard 精雕，其余场次走 creation 快出）。

**核心机制不变：镜头认领节拍。** 每个分镜声明它覆盖剧本某场的哪几个连续节拍（`sceneIndex` + `beats: [起, 止]`），分镜不许跨场次。这让分镜和剧本的关系保持可机械对账：

| 交付 | 解决什么 |
| --- | --- |
| 节拍认领 | 每个节拍被恰好一个分镜认领、顺序不乱——剧本改了重跑 validate，失效的分镜当场点名 |
| 单段 ≤ 15 秒（挂了生产参数还要落进模型时长区间） | AI 视频单段生成上限，长对话在这里被强制拆段 |
| 台词装得下 | 认领节拍的台词秒数 ≤ 分镜秒数——逐镜检查，不是拍脑袋 |
| **段级参考图挂载** | 直接引用 `cast.json`/`art.json` 已落盘的设定图，缺文件时 `refimage-coverage` 门点名缺哪张 |
| 通用视频提示词（每段一条） | 逐张交代参考图身份、按 [Shot k] 分行、景别运镜短语落进对应行、认领台词打引号原文引用——不绑定任何一个视频模型 |
| 配音对齐单 | 每句台词对到镜号——TTS 音频贴到哪一段视频，脚本自动汇总 |

`{baseDir}` = 本文件所在目录。脚本 `{baseDir}/scripts/novel-creation.mjs`，零依赖，`node` 直接跑。

**运行环境**：pi、Claude Code、codex 都能跑，工作流一样。**pi 默认不带子代理**（也没有内置待办与后台 bash），所有写着「有子代理就并发」的步骤在 pi 里就是当前会话顺着做一遍——产出一致，只是慢。Step 6 下单生视频要本机安装了 `lingying` CLI——见 `references/video-order.md`。

**边界（不做的事）**：不写戏不改台词（`novel-script` 的活）、不出场景/角色/道具设定图（`novel-art` / `novel-characters` 的活）、**不出任何新图像**（这是本 skill 存在的理由：直接用现成的）、**不做剪辑合成**（拼接、转场、配乐、贴 TTS 音频都不在这里）。视频生成本身是可选的最后一步——走 lingying 下单，产出到每段一个 mp4 为止。**不落 `.gates.jsonl`、不加 `stats` 子命令**（门失败累积目前只在 `novel-storyboard` 上试验，见仓库 `CLAUDE.md`）。

---

### Step 0 — 定输入与范围

**script.json 是硬前提**——段离开剧本没有意义，validate/render/export 都必须给 `--script`。其余上游按有则用：

- `--outline` / `--art`：解析参考图路径的名字来源（角色走 outline 的 id→name，场景/道具走 art 的 id→name），开 `refimage-coverage` 门；`--cast`：提示词禁人名检查再加一份别名
- `--shots <卡片目录>`：**可选**挂载 shot-recipes 的镜头配方卡库（指向 `shot-recipes/references/cards`，只接受目录不接受导出的 JSON），开第 16 道 `shot-recipe` 门。没装 shot-recipes 就别给——本 skill 自包含，不依赖它

**产物落点 ⛔ 只有一格**：本 skill 的全部产出写进 `<工作目录>/creation/`——`<剧名>-creation.json`、`<剧名>-creation.md`、`creation-report.html`、`manifest.json`、每段一个的 `E01-0x/` 投产包都在这一格里。工作目录根只住 `production.json`，`characters/`、`art/` 各占自己的一格——**它们的设定图会被本 skill 直接引用，不会被复制进 `creation/`**。用户没指定工作目录就用剧本同级目录，**但段目录这一层不省**。下文的 `<段目录>` 就指 `<工作目录>/creation/`。

**从 Step 3（校验）开始，全部命令都要先 `cd` 进 `<段目录>` 再跑**——参考图的相对路径（`../characters/images/…`、`../art/images/…`）与生成参数都按当前目录解析，`export --out .` 也把投产包落在这里。

跑过 `novel-setup` 的项目落点这条是查的：`validate` 与 `export` 找到 `production.json` 就顺带核对，放错了会点名该去哪；没找到那份文件就无从判断工作目录根在哪，明说跳过。

**生产参数不用挂载，脚本自己找。** `production.json`（`novel-setup` 的产出）住在工作目录根，`validate`/`render`/`export` 都会从 creation.json 所在目录**向上最多 5 层**去找它，找到就打印路径，找不到也打印一句「时长区间比对跳过」——不静默。找到了就必须遵循：**段秒数落进 `production.json` 的 `video.model` 对应的时长区间**（`segment-cap` 门自动加严，没有开关）。老项目没有这份文件照跑，那部分明说跳过；临时绕过用 `--no-production`，用了会明说。

**一次切几集**：跟剧本的批次走（剧本写到哪就分到哪），默认一批 ≤ 3 集。

### Step 1 — seed 工作底稿

```bash
mkdir -p <段目录>
node {baseDir}/scripts/novel-creation.mjs seed <script.json> --eps 1-3 > <段目录>/<剧名>-creation.json
```

确定性展开：每场的节拍清单（编号、动作/台词、每拍秒数、说话人）进 `seedScenes`，这就是切镜时的工作底稿。**每拍几秒是算出来的，不要让模型重新估。** segments 留空，切镜才是模型的活。

### Step 2 — 逐集分段切镜（含参考图挂载与提示词）

每集一份任务，有子代理就并发、没有（例如 pi）就在当前会话串行做，产出一致。每份任务拿到：

- `{baseDir}/references/shot-pass.md` 和 `{baseDir}/references/schema.md`（读它们，照着做）
- 该集的 seedScenes 底稿 + 场景/道具卡（art.json 的锚点提示）+ 角色卡（cast.json 的形象要点）——**只用来判断这一格该挂哪张参考图，不需要读设定图提示词本身**

流程：**先按剧情单元分段**（每段总时长不超过上限、不跨场），**段内切 2–5 秒的分镜**（对话正反打、关键动作插入特写、进场三件套——切镜语法都在 `shot-pass.md`），**段级挂载参考图**（这一段实际入镜的人物/场景/道具设定图，顺序就是提示词的 Picture 序）。

**每段写一条 `prompt`**，照 `{baseDir}/references/creation-prompt.md` 写（本 skill 自己的方法论，**不是 H3 的内化版，不依赖任何外部 skill**）。要点：开头逐张交代参考图身份（`Picture k is …`，k 对应 `images` 数组序号）；`[Shot k]` 行首固定给景别短语 + 运镜短语（沿用 H3 官方运镜词表，作为通用摄影语汇）；认领台词打引号原文引用，一个字不许漂；结尾 1–2 句交代环境声/配乐。**没有对齐指令、没有切点时刻、没有 `<d>` 标签**——这些是给「有精确关键帧钉时间点」的场合用的，本 skill 没有这个前提。

切完把 `seedScenes` 删掉。

### Step 3 — 校验 ⛔ 不能跳

```bash
cd <段目录>
node {baseDir}/scripts/novel-creation.mjs validate <creation.json> \
  --script <script.json> --outline <outline.json> --cast <cast.json> --art <art.json> \
  [--shots </path/to/cards>]
```

16 道质量门全是代码：节拍全覆盖（分镜级，恰好一次、按顺序、连续）、段 0 < 总秒 ≤ 上限（挂了生产参数还要落进对应视频模型的时长区间）、**每切 2–5 秒**、台词装得进分镜、每集总时长在剧本目标 ±15% 内、同框 ≤ 3 人（超了必须带拆解说明）、段号 E01-01 格式连号、景别短语在这一切自己的 [Shot k] 行里、运镜用通用词表且在自己的 [Shot k] 行里、**认领台词逐字出现在 prompt 里**（纯文本匹配，不要求标签）、**提示词语言与设定一致**、提示词正文不含角色名（台词引号内放行）、场次/人物/道具对账剧本、**段内出现的每个人物/场景/道具都能解出一张存在的设定图文件**（缺了点名缺哪张 + 期望路径）、**提示词的身份说明句数量与 `images` 数组长度一致**、镜头配方对账（可选门，见下）。

**有违规逐条修，改完重跑，直到通过。**

**第 16 道 `shot-recipe`（可选挂载）**：给了 `--shots` 才查，不给就明说跳过。与 `novel-storyboard` 同一套判定，只是核对目标从「分镜图提示词」换成「这一切自己的 [Shot k] 行」。

### Step 4 — 输出与汇报

```bash
cd <段目录>
node {baseDir}/scripts/novel-creation.mjs render <剧名>-creation.json --md \
  --script <script.json> --outline <outline.json> --art <art.json> > <剧名>-creation.md
node {baseDir}/scripts/novel-creation.mjs render <剧名>-creation.json --html \
  --script <script.json> --outline <outline.json> --art <art.json> > creation-report.html
```

报告界面语言用 `--lang zh|en` 指定（优先级 `--lang` > JSON 顶层 `lang` 字段 > `production.json` 的 `lang` > 默认中文）——只切界面标签，与 `promptLang`（提示词语言）互相独立。`render` 自动去 `../characters/images/`、`../art/images/` 找参考图，路径相对当前目录——所以要先 `cd <段目录>`。报告含：KPI 带、分镜节奏带、分集分镜表（每段的参考图条 + 分镜行 + 提示词面板）、参考图挂载单（按段列出挂了哪些设定图、路径存不存在）、配音对齐单、质量门、导出 JSON。

汇报一句话说清：几集几段几分镜、总时长 vs 目标、报告路径；没过的门明说。

### Step 5 — 导出投产包

```bash
cd <段目录>
node {baseDir}/scripts/novel-creation.mjs export <剧名>-creation.json \
  --script <script.json> --outline <outline.json> --art <art.json> --out .
```

`export` 会把生产参数里的视频模型、`aspect_ratio`、`resolution`、`variant` 写进 `manifest.json` 的顶层 `video` 字段；每段 `prompt.md` 头部列出挂载的参考图（身份 + 相对路径），分隔线以下是 `prompt` 原文。**不复制参考图文件**——它们被跨段共用，复制会在磁盘上重复几十份，`manifest.json` 只记相对路径，下单时直接读源文件上传。缺参考图会在 `missingTotal` 与每段的 `missing` 里标注。

最终落地：

```
<工作目录>/
├── production.json                ← novel-setup 的产出，住在根目录
├── characters/images/…             ← novel-characters 的设定图，本 skill 只读不写
├── art/images/…                    ← novel-art 的设定图，本 skill 只读不写
└── creation/                       ← 本 skill 的全部产出，一格装满
    ├── <剧名>-creation.json
    ├── <剧名>-creation.md
    ├── creation-report.html       ← 双击就能开
    ├── manifest.json              ← export 生成（顶层带视频参数）
    └── E01-01/                    ← 一段一个文件夹
        ├── prompt.md              ← export 生成（视频提示词，无分镜图）
        └── video.mp4              ← 下单产出（跑了 Step 6 才有）
```

### Step 6 — 下单生视频（可选）

投产包就是下单的全部材料。走 **lingying** 的 `video create`，读 `{baseDir}/references/video-order.md` 照契约做，实际执行交给一条命令：

```bash
cd <段目录>
node {baseDir}/scripts/novel-creation.mjs videos manifest.json [--only E01-01,E01-02] [--dry-run]
```

要点：

- **没有 lingying 就整步跳过**，投产包照常交付——用户拿它去别处下单也一样能用
- **提交、轮询、落盘、断点续传全在代码里**——`scripts/lib/lingying.mjs`（`novel-art`/`novel-characters` 出图那份的移植版：`execFile` 收数组参数、只读 `data.status`、超时退避、断点续传，改成一次性并发提交 + 参考图整批去重上传，因为视频任务之间没有互相依赖）
- **按秒计费**：提交前把这一批的总秒数和预估花费报给用户，不要闷头提交一整批——命令本身不做交互式确认，责任放在这里
- 单段失败跳过不阻断，最后汇总说明；同一段连着失败两次就停下来问，不要烧钱重试
- 落盘到 `<段目录>/<段号>/video.mp4`，和这一段的 `prompt.md` 住在一起

---

## 七个 skill 的接力（管线到此有了两个出口）

```
novel-setup      → production.json （拿什么拍：模型、画幅、分辨率、画风）
novel-outline    → outline.json    （什么：结构与分集）
novel-characters → cast.json       （谁：角色设定图）
novel-art        → art.json        （哪里：场景/道具设定图）
novel-script     → script.json     （戏：场次、节拍、台词）
                                    ┌─ novel-storyboard → storyboard.json （精细：镜头、分镜图、批次）
                                    └─ novel-creation    → creation.json  （快速：直出，零新增出图）
```

`novel-creation` 是消费端：seed 吃 script.json，段直接挂载 characters/art 的设定图，通用视频提示词直接下单给视频模型，配音对齐单接 script 台词本的 TTS 产物。

## 自测

```bash
node {baseDir}/scripts/selftest.mjs
```

不调模型、不花额度。16 道质量门每一道都有击穿用例，`lib/lingying.mjs` 的下单编排用注入的假 CLI 与假时钟跑完全部路径。改完脚本先跑这个。

## 自带样例

`{baseDir}/examples/`：《收书人》第 1 集完整分镜——4 段 9 切认领剧本全部 9 拍，共 30 秒 / 目标 30 秒，每段带完整的通用视频提示词与参考图挂载。当质量基准，也是自测夹具（`node scripts/selftest.mjs` 直接读这套样例）。
