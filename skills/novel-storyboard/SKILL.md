---
name: novel-storyboard
version: 1.5.0
description: |
  给 AI 短剧出分镜：三层结构——段（一次视频生成，≤15 秒）→ 分镜（段内 2–5 秒的剪切，认领剧本节拍）
  → 分镜图（每切一张关键帧：主分镜图钉 0.00 秒，子分镜图钉各自切点）。
  每段自带一条 MiniMax H3 视频提示词（官方口径默认英文、逐镜换行，promptLang 可切中文）：对齐指令和
  [Shot k] 切点时刻由分镜结构推导、逐字对账，台词逐字进 <d> 块（写法规范已内化为
  references/h3-prompt.md，不依赖外部 skill）。
  产出 storyboard.json + Markdown + 单页评审报告（分镜节奏带 / 分集分镜表 / 生成批次单 /
  配音对齐单，含导出 JSON）。分镜图出图拿场景与角色设定图当参考图走 lingying（可选）。
  19 道质量门全部由脚本确定性检查（其中 2 道读工作目录根的 production.json：画风与分镜图画幅，没有就明说跳过；
  第 19 道 shot-recipe 可选：挂上 shot-recipes 卡库才查，不挂就明说跳过）；
  export 一键导出投产包（每段提示词 + 按 Picture 序的分镜图清单），再走 lingying 下单生视频（可选）。零依赖、零 npm。
  Use when asked to 分镜、出分镜、镜头表、切镜、storyboard for AI short drama。
allowed-tools:
  - Read
  - Write
  - Bash
  - Task
  - Glob
triggers:
  - novel-storyboard
  - 分镜
  - 出分镜
  - 镜头表
  - 切镜
  - 首帧
  - storyboard
  - shot list
metadata:
  license: Apache-2.0
  requires:
    bins:
      - node          # >= 18，只用标准库，无 npm 依赖
    optional:
      - lingying      # 有才出首帧图、才能下单生视频；没有就只交提示词与投产包，其余照常
  runtimes:
    - claude-code
    - codex
---

## novel-storyboard

给 AI 短剧出**分镜**——管线里第一个直接面对视频模型的层。**前提刻在骨子里：镜头是生成出来的，多切一镜的成本几乎为零**，所以这里不心疼镜头数量，上限只有一个：视频模型单段生成的时长（默认 15 秒）。

**核心机制：镜头认领节拍。** 每个镜头声明它覆盖剧本某场的哪几个连续节拍（`sceneIndex` + `beats: [起, 止]`），镜头不许跨场次——换景必换镜。这让分镜和剧本的关系变成可机械对账的：

| 交付 | 解决什么 |
| --- | --- |
| 节拍认领 | 每个节拍被恰好一个镜头认领、顺序不乱——剧本改了重跑 validate，失效的镜头当场点名 |
| 单镜头 ≤ 15 秒 | AI 视频单段生成上限，长对话在这里被强制拆镜（`params.maxShotSeconds` 按模型改） |
| 台词装得下 | 认领节拍的台词秒数 ≤ 镜头秒数——逐镜检查，不是拍脑袋 |
| 首帧 + 运动双提示词 | 首帧给图像模型（配合参考图），运动是模型无关的过程描述；景别、运镜是枚举，英文短语必须写进对应提示词 |
| **H3 视频提示词（每镜一段）** | MiniMax H3 的 I2VA 结构：固定对齐指令 + integrated_multimodal_description + overall_soundscape + non_diegetic_music。**认领节拍的台词逐字进 `<d>[Chinese] …</d>` 块**——对白、声景、配乐一段提示词全带上 |
| 生成批次单 | 同场景 + 同光照的镜头归一批，共用同一张环境参考图——AI 版的顺场表，脚本自动汇总 |
| 配音对齐单 | 每句台词对到镜号——TTS 音频贴到哪一段视频，脚本自动汇总 |

`{baseDir}` = 本文件所在目录。脚本 `{baseDir}/scripts/novel-storyboard.mjs`，零依赖，`node` 直接跑。

**边界（不做的事）**：不写戏不改台词（`novel-script` 的活）、不出场景/角色/道具设定图（`novel-art` / `novel-characters` 的活）、**不做剪辑合成**（拼接、转场、配乐、贴 TTS 音频都不在这里）。视频生成本身是可选的最后一步——走 lingying 下单，产出到每段一个 mp4 为止。口型/唇形同步暂不管——那是生成管线的事。

---

### Step 0 — 定输入与范围

**script.json 是硬前提**——分镜离开剧本没有意义，validate/render 都必须给 `--script`。其余上游按有则用：

- `--outline` / `--cast`：提示词禁人名检查 + 报告里 C01 显示成人名
- `--art`：报告里 S01 显示成场景名 + 批次单嵌场景设定图
- `--shots <卡片目录>`：**可选**挂载 shot-recipes 的镜头配方卡库（指向 `shot-recipes/references/cards`，只接受目录不接受导出的 JSON），开第 19 道 `shot-recipe` 门。没装 shot-recipes 就别给——本 skill 自包含，不依赖它

**生产参数不用挂载，脚本自己找。** `production.json`（`novel-setup` 的产出）住在工作目录根，`validate` / `render` / `export` 都会从 storyboard.json 所在目录**向上最多 5 层**去找它，找到就打印路径，找不到也打印一句「2 道门跳过」——不静默。

找到了就必须遵循两件事，这两件改了都要整批重出图：

- **画风**：storyboard.json 的 `style` 必须与它一致（自己不写就继承）
- **分镜图画幅**：每条分镜图提示词里的画幅必须是 `image.frame.aspectRatio`。**成片拍竖屏，分镜图就得是 `9:16`**——写死 `16:9` 出一集三四十格，喂给视频模型全被裁掉两边

出图用 `image.model` + `image.frame.resolution`（**档位就是 lingying 收的 `resolution` 枚举值**，原样进 `--input_data`，不折算像素；一行拿到拼好的参数：`novel-setup resolve --for storyboard`）。老项目没有这份文件照跑，那两道门明说跳过；临时绕过用 `--no-production`，用了会明说。

**一次切几集**：跟剧本的批次走（剧本写到哪就分到哪），默认一批 ≤ 3 集。

### Step 1 — seed 工作底稿

```bash
node {baseDir}/scripts/novel-storyboard.mjs seed <script.json> --eps 1-3 > <workdir>/storyboard.json
```

确定性展开：每场的节拍清单（编号、动作/台词、每拍秒数、说话人）进 `seedScenes`，这就是切镜时的工作底稿。**每拍几秒是算出来的，不要让模型重新估。** shots 留空，切镜才是模型的活。

### Step 2 — 逐集分段切镜

每集一份任务，能并发就并发。每份任务拿到：

- `{baseDir}/references/storyboard-pass.md` 和 `{baseDir}/references/schema.md`（读它们，照着做）
- 该集的 seedScenes 底稿 + 场景卡（art.json 的锚点与光照提示词）+ 角色卡（cast.json 的形象要点）

流程：**先按剧情单元分段**（每段 9–15 秒、不跨场），**段内切 2–5 秒的分镜**（对话正反打、关键动作插入特写、进场三件套——切镜语法都在 storyboard-pass.md），每切写一条分镜图提示词。

**每段写一条 `h3Prompt`**，照 `{baseDir}/references/h3-prompt.md` 写（官方方法论的内化版，**不依赖任何外部 skill**）。官方口径默认英文（`promptLang` 可切中文），**每个镜头独立一行**。要点：首行对齐指令和 `[Shot k]` 切点时刻**由分镜秒数推导，一个字符都不许漂**（validate 逐字对账）；认领台词**逐字**进 `<d>[Chinese] …</d>`；每切的运镜词写进自己那一行；声景与配乐分进后两个字段——**声景也是动作指令，画面改了声景一起改**。

切完把 `seedScenes` 删掉。

### Step 3 — 校验 ⛔ 不能跳

```bash
node {baseDir}/scripts/novel-storyboard.mjs validate <storyboard.json> \
  --script <script.json> --outline <outline.json> --cast <cast.json> \
  [--shots </path/to/cards>]
```

19 道质量门全是代码：节拍全覆盖（分镜级，恰好一次、按顺序、连续）、段 0 < 总秒 ≤ 15、**每切 2–5 秒**、台词装得进分镜、每集总时长在剧本目标 ±15% 内、同框 ≤ 3 人（超了必须带拆解说明）、段号 E01-01 格式连号、景别短语在分镜图提示词里、**风格短语统一**（`style` 预设 realistic/ghibli 与角色/场景 skill 同名对齐，同剧分镜图不许画风漂）、运镜用 H3 词表且在自己的 [Shot k] 段落里、**H3 对齐指令由分镜结构推导逐字对账 + 切点时刻逐个对**、**认领台词逐字进 `<d>` 块**、**提示词语言与 promptLang 一致**（双向查：中文写成英文、英文混进中文都拦）、分镜图提示词全英文非空、英文提示词不含角色名（中文 H3 提示词放行）、场次/人物/道具对账剧本、**画风与生产参数一致**、**分镜图画幅与生产参数一致**、**镜头配方对账**（可选门，见下）。

**有违规逐条修，改完重跑，直到通过。**

**第 19 道 `shot-recipe`（可选挂载）**：给了 `--shots` 才查，不给就明说跳过。cut 上可以写一个可选的 `recipe`（配方卡 id，**cut 级不是 segment 级**，**多格配方靠连续同 id 的分镜表达**，不是数组），门查三条——id 在卡库里、卡片的每条 `must_phrases` 出现在该切的 `frame` 里（两边小写化后 `includes`）、卡片 `cuts` 下限 ≥ 2 时连续同 id 的分镜数不得低于该下限。卡片的**建议景别与运镜不设门**，只在报告的「配方」列和 `checkup` 末尾提示偏离：配方是语汇不是法条，可选挂载的东西一旦变严就没人挂。

### Step 4 — 出分镜图（可选）

一切一张成片画幅的关键帧（`production.json` 的 `image.frame.aspectRatio`，没有就默认 16:9），走 **lingying** CLI，读 `{baseDir}/references/frame.md` 照契约做。要点：

- **没有 lingying 就整步跳过**，只交提示词，报告显示占位不装有
- **出图参数从 `production.json` 来**：`image.model` 传 `--model`，`image.frame.resolution` 与 `image.frame.aspectRatio` 原样进 `--input_data` 的 `resolution` / `aspect_ratio`。**提示词里一个像素都不写**——它们是结构化字段。一行拿到拼好的参数：`novel-setup resolve --for storyboard`。**先把画幅和档位对上再出图**——一集三四十格，错了全批重来
- **参考图是命根子**：该段场景设定图（该光照状态）+ 画内角色的设定图 + 涉及道具的设定图，各自先 `lingying upload` 换成 URL 再放进 `images` 数组，提示词只负责取景和此刻的姿态。**建一张「本地路径 → URL」的映射表整集共用**，`upload` 按内容去重，同一张图不重复传输
- **可以整段并发提交**：`image create` 只返回 task_id，先把一段（或一集）全部提交，再统一 `task get` 轮询，谁成功谁落盘。输出 `./<段号>/f<切序>.png`（f1 = 主分镜图，每段一个文件夹）
- **默认先出第一段的整套分镜图给用户看效果**（3–5 张），确认画风和正反打构图再往后补——一集约 30–40 格，错了浪费的是整批
- 单个失败跳过不阻断，最后汇总说明

### Step 5 — 输出与汇报

```bash
cd <输出目录>
node {baseDir}/scripts/novel-storyboard.mjs render <剧名>-storyboard.json --md \
  --script <script.json> --outline <outline.json> --art <art.json> > <剧名>-storyboard.md
node {baseDir}/scripts/novel-storyboard.mjs render <剧名>-storyboard.json --html \
  --script <script.json> --outline <outline.json> --art <art.json> > storyboard-report.html
```

报告界面语言用 `--lang zh|en` 指定（优先级 `--lang` > JSON 顶层 `lang` 字段 > `production.json` 的 `lang` > 默认中文）——只切界面标签，与 `promptLang`（H3 提示词语言）互相独立。`render` 自动去 `images/<镜号>-frame.png` 找首帧（批次单还会找场景设定图），**先出图再 render**。报告含：KPI 带、分镜节奏带（粗分隔 = 段边界、片宽 = 分镜时长占比、颜色深浅 = 景别远近、点击跳段卡）、分集分镜表（主分镜图 + 子分镜条 + 逐切分镜行 + 分镜图/H3 提示词复制按钮）、生成批次单、配音对齐单、质量门、导出 JSON。Markdown 版每段附完整 H3 提示词，直接复制可用。

汇报一句话说清：几集几镜、总时长 vs 目标、几个生成批次、出了几张首帧、报告路径；没过的门和没出的图明说。

最终落地：

`export` 会把生产参数里的视频模型、`aspect_ratio`、`resolution`、`variant` 写进两处：`manifest.json` 的顶层 `video` 字段，以及每段 `prompt.md` 的头部。下单时参数就在投产包里，不用回头翻配置。

```
<输出目录>/
├── <剧名>-storyboard.json
├── <剧名>-storyboard.md
├── storyboard-report.html         ← 双击就能开
├── manifest.json                  ← export 生成（顶层带视频参数）
└── E01-01/                        ← 一段一个文件夹 = 一次视频生成的全部材料
    ├── f1.png                     ← 主分镜图（有 lingying 才有）
    ├── f2.png …                   ← 子分镜图
    ├── prompt.md                  ← H3 提示词（export 生成）
    └── video.mp4                  ← 下单产出（跑了 Step 6 才有）
```

### Step 6 — 下单生视频（可选）

投产包就是下单的全部材料。走 **lingying** 的 `video create`，读 `{baseDir}/references/video-order.md` 照契约做。要点：

- **没有 lingying 就整步跳过**，投产包照常交付——用户拿它去别处下单也一样能用
- **参数全在 `manifest.json` 顶层的 `video` 里**：`model` / `aspectRatio` / `resolution` / `variant`（`MiniMax H3` 的 `variant` 进 `metadata.h3_variant`，是必填字段）
- **`prompt` 取 `prompt.md` 分隔线以下的原文**，一个字不改；`images` 按 Picture 序挂这一段的 `f1..fN.png`（先 `lingying upload` 换成 URL）
- **`duration` 要折算**：模型收的是区间内的整数秒（H3 是 5~15），段秒数不一定是。跑 `novel-setup duration <秒> --model <名>` 折，向上取整、夹进区间，动过就在汇报里说清
- **按秒计费**：提交前把这一集的总秒数和预估花费报给用户，不要闷头提交一整集
- 整集可以并发提交，再统一轮询；单段失败跳过不阻断，同一段连着失败两次就停下来问，不要烧钱重试
- 落盘到 `<段号>/video.mp4`，和这一段的分镜图、提示词住在一起

---

## 六个 skill 的接力（管线到此闭环）

```
novel-setup      → production.json （拿什么拍：模型、画幅、分辨率、画风）
novel-outline    → outline.json    （什么：结构与分集）
novel-characters → cast.json       （谁：角色设定图）
novel-art        → art.json        （哪里：场景/道具设定图）
novel-script     → script.json     （戏：场次、节拍、台词）
novel-storyboard → storyboard.json （怎么拍：镜头、首帧、批次）
```

分镜是消费端：seed 吃 script.json，分镜图出图吃 art 和 characters 的设定图当参考，H3 提示词加整套分镜图直接下单给视频模型，配音对齐单接 script 台词本的 TTS 产物。五份创作 JSON 各自的报告都带导出按钮，改完都能喂回各自的 render/validate。

## 边界

- 报告界面内置中英（`--lang`，默认中文）；提示词语言由 `promptLang` 单独控制（默认英文）。两者都可以在 `production.json` 里一处定死，本文件不写就继承
- 秒数是**下给视频模型的生成时长**不是估算——段上限按你的模型改 `params.maxSegmentSeconds`，切的节奏区间改 `min/maxCutSeconds`
- 口型/唇形同步暂不管——那是生成管线的事
- 分镜图不追求一次到位——它是给视频模型的构图锚，构图对、资产对就够，微调交给重生成

## 门失败会累积

`validate` 与 `checkup` 每次都把门的结果追加到**当前目录**的 `.gates.jsonl`；跑 `stats` 汇总：

```bash
node {baseDir}/scripts/novel-storyboard.mjs stats
```

回答三件事：**哪道门最常响**（那条规则模型最常无视，该改的是措辞）、**哪道门从没响过**（可能是死门，也可能规则已被内化）、**失败详情长什么样**（反复出现却没有门的那类问题，只能靠人看）。

不想记加 `--no-log`；写不进去静默跳过，不影响校验。

## 自测

```bash
node {baseDir}/scripts/selftest.mjs
```

297 项断言，不调模型、不花额度。19 道质量门每一道都有击穿用例。改完脚本先跑这个。

## 自带样例

`{baseDir}/examples/渡口-storyboard.json`：《渡口》第 1 集完整分镜——10 段 34 切认领剧本全部 35 拍，平均 3.5 秒一切，共 119 秒 / 目标 120 秒，2 个生成批次，每段带完整的 H3 视频提示词（多图对齐 + 切点时刻全部对账通过）。当质量基准，也是自测夹具。
