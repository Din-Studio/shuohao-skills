---
name: novel-storyboard
version: 1.10.0
description: |
  给 AI 短剧出分镜：三层结构——段（一次视频生成，≤15 秒）→ 分镜（段内 2–5 秒的剪切，认领剧本节拍）
  → 分镜图（每切一张关键帧：主分镜图钉 0.00 秒，子分镜图钉各自切点）。
  每段自带一条视频提示词，骨架按 production.json 的 video.model 分流：MiniMax H3 走 I2VA（对齐指令
  与 [Shot k] 切点时刻由分镜结构推导、逐字对账，台词进 <d> 块），seedance 系列走全模态参考骨架
  （身份说明 + 主体标签 + 逐镜描述，全程不出现时刻——官方口径）。两套写法规范都已内化为
  references/h3-prompt.md 与 references/seedance2-prompt.md，不依赖外部 skill。
  产出 storyboard.json + Markdown + 单页评审报告（分镜节奏带 / 分集分镜表 / 生成批次单 /
  配音对齐单，含导出 JSON）。分镜图出图拿场景与角色设定图当参考图走 lingying（可选）。
  18 道质量门全部由脚本确定性检查（其中 2 道读工作目录根的 production.json：画风短语与分镜图画幅，没有就明说跳过；
  第 18 道 shot-recipe 可选：挂上 shot-recipes 卡库才查，不挂就明说跳过）；
  export 一键导出投产包（每段提示词 + 按 Picture 序的分镜图清单），再走 lingying 下单生视频（可选）。零依赖、零 npm。
  production.json 顶层 autopilot 为 true 时全程不打断——第一段分镜图自己验效果、下单花费照样报出来但不等回应；
  质量门、花费预估、失败止损照旧。
  Use when asked to 分镜、出分镜、镜头表、切镜、storyboard for AI short drama。
# 工具名两套都列：pi 认小写（read/write/edit/bash/grep/find/ls），Claude Code 认大写；各自取各自认得的
allowed-tools: read write edit bash grep find ls Read Write Edit Bash Glob Grep Task
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
    - pi            # 没有子代理：并发步骤在当前会话串行做，产出一致
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
| **视频提示词（每镜一段）** | 骨架跟着 `video.model` 走：H3 是 I2VA 结构（对齐指令 + 三个字段 + 切点时刻），seedance 是身份说明 + 主体标签 + 逐镜描述且全程无时刻。**两套都要求认领节拍的台词逐字进提示词**——对白、声景、配乐一段全带上 |
| 生成批次单 | 同场景 + 同光照的镜头归一批，共用同一张环境参考图——AI 版的顺场表，脚本自动汇总 |
| 配音对齐单 | 每句台词对到镜号——TTS 音频贴到哪一段视频，脚本自动汇总 |

`{baseDir}` = 本文件所在目录。脚本 `{baseDir}/scripts/novel-storyboard.mjs`，零依赖，`node` 直接跑。

**运行环境**：pi、Claude Code、codex 都能跑，工作流一样。**pi 默认不带子代理**（也没有内置待办与后台 bash），所有写着「有子代理就并发」的步骤在 pi 里就是当前会话顺着做一遍——产出一致，只是慢。Step 4 出分镜图、Step 6 下单生视频要本机安装了 `lingying` CLI——见 `references/frame.md` 与 `references/video-order.md`。

**边界（不做的事）**：不写戏不改台词（`novel-script` 的活）、不出场景/角色/道具设定图（`novel-art` / `novel-characters` 的活）、**不做剪辑合成**（拼接、转场、配乐、贴 TTS 音频都不在这里）。视频生成本身是可选的最后一步——走 lingying 下单，产出到每段一个 mp4 为止。口型/唇形同步暂不管——那是生成管线的事。

---

### Step 0 — 定输入与范围

**script.json 是硬前提**——分镜离开剧本没有意义，validate/render 都必须给 `--script`。其余上游按有则用：

- `--outline` / `--cast`：提示词禁人名检查 + 报告里 C01 显示成人名
- `--art`：报告里 S01 显示成场景名 + 批次单嵌场景设定图
- `--shots <卡片目录>`：**可选**挂载 shot-recipes 的镜头配方卡库（指向 `shot-recipes/references/cards`，只接受目录不接受导出的 JSON），开第 18 道 `shot-recipe` 门。没装 shot-recipes 就别给——本 skill 自包含，不依赖它

**产物落点 ⛔ 只有一格**：本 skill 的全部产出写进 `<工作目录>/storyboard/`——`<剧名>-storyboard.json`、`<剧名>-storyboard.md`、`storyboard-report.html`、`manifest.json`、每段一个的 `E01-0x/` 投产包、门失败日志 `.gates.jsonl` 都在这一格里。工作目录根只住 `production.json`（`novel-setup` 的产出），别的 skill 各占自己的一格（`outline/`、`characters/`、`art/`、`script/`）。用户没指定工作目录就用剧本同级目录，**但段目录这一层不省**——合并报告的 `--from` 自动发现就是按段目录名找 JSON 的，平铺在根目录它找不到。下文的 `<段目录>` 就指 `<工作目录>/storyboard/`。

**段文件夹就摆在 `<段目录>` 里，不要再往下收一层**（例如收进 `segments/`）：报告里的分镜图走相对路径 `<段号>/f<切序>.png`，报告 HTML 与段文件夹必须同级，多套一层目录报告里的图会**静默**全变成「未生成」占位，不报错。

跑过 `novel-setup` 的项目落点这条是查的：`validate` 与 `export` 找到 `production.json` 就顺带核对，放错了会点名该去哪；没找到那份文件就无从判断工作目录根在哪，明说跳过。

**生产参数不用挂载，脚本自己找。** `production.json`（`novel-setup` 的产出）住在工作目录根，`validate` / `checkup` / `export` 都会从 storyboard.json 所在目录**向上最多 5 层**去找它，找到就打印路径，找不到也打印一句「2 道门跳过」——不静默。

找到了就必须遵循两件事，这两件改了都要整批重出图：

- **画风**：本 skill 不内置画风，storyboard.json 里也不存一份。只要 `style.phrase` 那句短语，它必须出现在**每条**分镜图提示词里
- **分镜图画幅**：每条分镜图提示词里的画幅必须是 `image.frame.aspectRatio`。**成片拍竖屏，分镜图就得是 `9:16`**——写死 `16:9` 出一集三四十格，喂给视频模型全被裁掉两边

出图用 `image.model` + `image.frame.resolution`（**档位就是 lingying 收的 `resolution` 枚举值**，原样进 `--input_data`，不折算像素；一行拿到拼好的参数：`novel-setup resolve --for storyboard`）。老项目没有这份文件照跑，那两道门明说跳过；临时绕过用 `--no-production`，用了会明说。

**一次切几集**：跟剧本的批次走（剧本写到哪就分到哪），默认一批 ≤ 3 集。

### Step 0.5 — 自动驾驶（autopilot）

Step 0 那份 `production.json` 顶层还有一个 `autopilot`。为 `true` 时本 skill 的全部流程**一口气跑完**：不提问、不等拍板、不把选择题抛回去。`validate` / `checkup` 与 `export` 找到生产参数也会打印一句 `↳ 自动驾驶：开`（`render` 只做语言继承，不打印）——但 Step 0 跑在第一条命令之前，所以开工前要自己看一眼。

没有 `production.json`、字段写着 `false` 或者整个没写，就是各步原来的样子。

| 原本 | 自动驾驶下 |
| --- | --- |
| Step 2 视频提示词按哪套骨架写 | 按 `production.json` 的 `video.model` 自己分流，不问 |
| **Step 4 先出第一段的整套分镜图给用户看效果** | 顺序不变——还是先出第一段（3–5 张）再往后补，但**由你自己看**：画风与正反打构图对了就接着出，明显不对就重出这一段，不等用户点头 |
| Step 6 按秒计费，提交前把总秒数与预估花费报给用户 | 照样算清楚、照样报出来（打印给用户看），**不等回应**直接提交 |
| Step 6 同一段连着失败两次就停下来问 | 不问用户，但**照样停这一段**：跳过并记进汇报。不打断不等于无限重试烧钱 |

**转移的是审批权，不是取消检查点**：18 道门照样要过、花费照样先算清楚、失败的止损照样止损——只是不再等人点头。可选步骤（出图、下单）在自动驾驶下**照跑**，只有依赖缺失（没装 `lingying`）才跳过并明说。**替用户做的每一个决定都要写进 Step 5 的汇报**，第一段效果的判断结论一条不漏。

### Step 1 — seed 工作底稿

```bash
mkdir -p <段目录>
node {baseDir}/scripts/novel-storyboard.mjs seed <script.json> --eps 1-3 > <段目录>/<剧名>-storyboard.json
```

确定性展开：每场的节拍清单（编号、动作/台词、每拍秒数、说话人）进 `seedScenes`，这就是切镜时的工作底稿。**每拍几秒是算出来的，不要让模型重新估。** shots 留空，切镜才是模型的活。

### Step 2 — 逐集分段切镜

每集一份任务，有子代理就并发、没有（例如 pi）就在当前会话串行做，产出一致。每份任务拿到：

- `{baseDir}/references/storyboard-pass.md` 和 `{baseDir}/references/schema.md`（读它们，照着做）
- 该集的 seedScenes 底稿 + 场景卡（art.json 的锚点与光照提示词）+ 角色卡（cast.json 的形象要点）

流程：**先按剧情单元分段**（每段 9–15 秒、不跨场），**段内切 2–5 秒的分镜**（对话正反打、关键动作插入特写、进场三件套——切镜语法都在 storyboard-pass.md），每切写一条分镜图提示词。

**每段写一条 `videoPrompt`**，**骨架先看 `production.json` 的 `video.model`**——两套骨架不通用，选错一套整段提示词作废，`validate` 的对账口径也跟着模型换：

| `video.model` | 读哪份写法规范 | 骨架要点 |
| --- | --- | --- |
| `MiniMax H3`（两边都没写模型时的默认） | `{baseDir}/references/h3-prompt.md` | 默认英文。首行对齐指令和 `[Shot k]` 切点时刻**由分镜秒数推导，一个字符都不许漂**；认领台词逐字进 `<d>[Chinese] …</d>`；声景与配乐分进后两个字段 |
| `seedance2.5` / `seedance2.0` / `seedance2.0 fast` / `seedance2.0 mini` | `{baseDir}/references/seedance2-prompt.md` | 默认中文。每张分镜图一句 `图 k 是…` 的身份说明并给全程复用的标签；逐镜 `[镜头 k]` 一行；台词逐字用 `{}` 包；**全程不写时刻**——官方明说限制精确时间会让生成异常 |

两份都是官方方法论的内化版，**不依赖任何外部 skill**。共通的三条：**每个镜头独立一行**；每切的运镜词写进自己那一行；**声景也是动作指令，画面改了声景一起改**。

模型也可以写在 `storyboard.json` 顶层的 `video.model` 里覆盖生产参数——一部剧两条产线试不同模型时用得上。

切完把 `seedScenes` 删掉。

### Step 3 — 校验 ⛔ 不能跳

```bash
node {baseDir}/scripts/novel-storyboard.mjs validate <storyboard.json> \
  --script <script.json> --outline <outline.json> --cast <cast.json> \
  [--shots </path/to/cards>]
```

18 道质量门全是代码：节拍全覆盖（分镜级，恰好一次、按顺序、连续）、段 0 < 总秒 ≤ 15、**每切 2–5 秒**、台词装得进分镜、每集总时长在剧本目标 ±15% 内、同框 ≤ 3 人（超了必须带拆解说明）、段号 E01-01 格式连号、景别短语在分镜图提示词里、**风格短语统一**（`production.json` 的 `style.phrase` 必须出现在每条分镜图提示词里，同剧分镜图不许画风漂）、运镜用统一词表且在自己的镜头段落里、**视频提示词的骨架与挂载的视频模型对得上**（H3 查对齐指令与切点时刻逐字对账，seedance 查身份说明逐张齐全、逐镜齐全且全程无时刻）、**认领台词逐字进视频提示词**、**提示词语言与 promptLang 一致**（双向查：中文写成英文、英文混进中文都拦）、分镜图提示词全英文非空、英文提示词不含角色名（中文视频提示词放行）、场次/人物/道具对账剧本、**分镜图画幅与生产参数一致**、**镜头配方对账**（可选门，见下）。

**有违规逐条修，改完重跑，直到通过。**

**第 18 道 `shot-recipe`（可选挂载）**：给了 `--shots` 才查，不给就明说跳过。cut 上可以写一个可选的 `recipe`（配方卡 id，**cut 级不是 segment 级**，**多格配方靠连续同 id 的分镜表达**，不是数组），门查三条——id 在卡库里、卡片的每条 `must_phrases` 出现在该切的 `frame` 里（两边小写化后 `includes`）、卡片 `cuts` 下限 ≥ 2 时连续同 id 的分镜数不得低于该下限。卡片的**建议景别与运镜不设门**，只在报告的「配方」列和 `checkup` 末尾提示偏离：配方是语汇不是法条，可选挂载的东西一旦变严就没人挂。

### Step 4 — 出分镜图（可选）

一切一张成片画幅的关键帧（`production.json` 的 `image.frame.aspectRatio`，没有就默认 16:9），走 **lingying** CLI，读 `{baseDir}/references/frame.md` 照契约做。要点：

- **没有 lingying 就整步跳过**，只交提示词，报告显示占位不装有
- **出图参数从 `production.json` 来**：`image.model` 传 `--model`，`image.frame.resolution` 与 `image.frame.aspectRatio` 原样进 `--input_data` 的 `resolution` / `aspect_ratio`。**提示词里一个像素都不写**——它们是结构化字段。一行拿到拼好的参数：`novel-setup resolve --for storyboard`。**先把画幅和档位对上再出图**——一集三四十格，错了全批重来
- **参考图是命根子**：该段场景设定图（该光照状态）+ 画内角色的设定图 + 涉及道具的设定图，各自先 `lingying upload` 换成 URL 再放进 `images` 数组，提示词只负责取景和此刻的姿态。**建一张「本地路径 → URL」的映射表整集共用**，`upload` 按内容去重，同一张图不重复传输
- **可以整段并发提交**：`image create` 只返回 task_id，先把一段（或一集）全部提交，再统一 `task get` 轮询，谁成功谁落盘。输出 `<段目录>/<段号>/f<切序>.png`（f1 = 主分镜图，每段一个文件夹）
- **默认先出第一段的整套分镜图给用户看效果**（3–5 张），确认画风和正反打构图再往后补——一集约 30–40 格，错了浪费的是整批
- 单个失败跳过不阻断，最后汇总说明

### Step 5 — 输出与汇报

```bash
cd <段目录>
node {baseDir}/scripts/novel-storyboard.mjs render <剧名>-storyboard.json --md \
  --script <script.json> --outline <outline.json> --art <art.json> > <剧名>-storyboard.md
node {baseDir}/scripts/novel-storyboard.mjs render <剧名>-storyboard.json --html \
  --script <script.json> --outline <outline.json> --art <art.json> > storyboard-report.html
```

报告界面语言用 `--lang zh|en` 指定（优先级 `--lang` > JSON 顶层 `lang` 字段 > `production.json` 的 `lang` > 默认中文）——只切界面标签，与 `promptLang`（视频提示词语言）互相独立。`render` 自动去 `<段号>/f<切序>.png` 找分镜图（批次单还会找场景设定图），路径是相对当前目录的——所以要先 `cd <段目录>`，**先出图再 render**。报告含：KPI 带、分镜节奏带（粗分隔 = 段边界、片宽 = 分镜时长占比、颜色深浅 = 景别远近、点击跳段卡）、分集分镜表（主分镜图 + 子分镜条 + 逐切分镜行 + 分镜图/视频提示词复制按钮）、生成批次单、配音对齐单、质量门、导出 JSON。Markdown 版每段附完整视频提示词，直接复制可用。

汇报一句话说清：几集几镜、总时长 vs 目标、几个生成批次、出了几张首帧、报告路径；没过的门和没出的图明说。

导出投产包（还在 `<段目录>` 里跑，`--out .` 就是把 `manifest.json` 与每段一个的文件夹落在报告旁边）：

```bash
node {baseDir}/scripts/novel-storyboard.mjs export <剧名>-storyboard.json \
  --script <script.json> --out .
```

`export` 会把生产参数里的视频模型、`aspect_ratio`、`resolution` 写进两处：`manifest.json` 的顶层 `video` 字段，以及每段 `prompt.md` 的头部。下单时参数就在投产包里，不用回头翻配置。

最终落地：

```
<工作目录>/
├── production.json                ← novel-setup 的产出，住在根目录
└── storyboard/                    ← 本 skill 的全部产出，一格装满
    ├── <剧名>-storyboard.json
    ├── <剧名>-storyboard.md
    ├── storyboard-report.html     ← 双击就能开
    ├── manifest.json              ← export 生成（顶层带视频参数）
    ├── .gates.jsonl               ← 门失败累积（在这个目录里跑 stats）
    └── E01-01/                    ← 一段一个文件夹 = 一次视频生成的全部材料
        ├── f1.png                 ← 主分镜图（有 lingying 才有）
        ├── f2.png …               ← 子分镜图
        ├── prompt.md              ← 视频提示词（export 生成）
        └── video.mp4              ← 下单产出（跑了 Step 6 才有）
```

### Step 6 — 下单生视频（可选）

投产包就是下单的全部材料。走 **lingying** 的 `video create`，读 `{baseDir}/references/video-order.md` 照契约做。要点：

- **没有 lingying 就整步跳过**，投产包照常交付——用户拿它去别处下单也一样能用
- **参数全在 `manifest.json` 顶层的 `video` 里**：`model` / `aspectRatio` / `resolution`
- **`prompt` 取 `prompt.md` 分隔线以下的原文**，一个字不改——它的骨架在 Step 2 就已经按 `video.model` 写对了，下单时不需要再改写；`images` 按切序挂这一段的 `f1..fN.png`（先 `lingying upload` 换成 URL）
- **一段切得多就别把图挂满**：seedance 官方推荐 4–5 个素材并明说不建议用满上限，6 切以上只挂转场处的关键帧，或者回 Step 2 把这一段再拆一次
- **`duration` 要折算**：模型收的是区间内的整数秒（H3 是 5~15，seedance2.0 全系是 4~15，2.5 是 4~30），段秒数不一定是。跑 `novel-setup duration <秒> --model <名>` 折算，向上取整、夹进区间，动过就在汇报里说清
- **按秒计费**：提交前把这一集的总秒数和预估花费报给用户，不要闷头提交一整集
- 整集可以并发提交，再统一轮询；单段失败跳过不阻断，同一段连着失败两次就停下来问，不要烧钱重试
- 落盘到 `<段目录>/<段号>/video.mp4`，和这一段的分镜图、提示词住在一起

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

分镜是消费端：seed 吃 script.json，分镜图出图吃 art 和 characters 的设定图当参考，视频提示词加整套分镜图直接下单给视频模型，配音对齐单接 script 台词本的 TTS 产物。五份创作 JSON 各自的报告都带导出按钮，改完都能喂回各自的 render/validate。

## 边界

- 报告界面内置中英（`--lang`，默认中文）；提示词语言由 `promptLang` 单独控制（默认英文）。两者都可以在 `production.json` 里一处定死，本文件不写就继承
- 秒数是**下给视频模型的生成时长**不是估算——段上限按你的模型改 `params.maxSegmentSeconds`，切的节奏区间改 `min/maxCutSeconds`
- 口型/唇形同步暂不管——那是生成管线的事
- 分镜图不追求一次到位——它是给视频模型的构图锚，构图对、资产对就够，微调交给重生成

## 门失败会累积

`validate` 与 `checkup` 每次都把门的结果追加到**当前目录**的 `.gates.jsonl`——在 `<段目录>` 里跑就落在 `<段目录>`，和分镜产物住在一起；跑 `stats` 汇总（同样在 `<段目录>` 里跑）：

```bash
node {baseDir}/scripts/novel-storyboard.mjs stats
```

回答三件事：**哪道门最常响**（那条规则模型最常无视，该改的是措辞）、**哪道门从没响过**（可能是死门，也可能规则已被内化）、**失败详情长什么样**（反复出现却没有门的那类问题，只能靠人看）。

不想记加 `--no-log`；写不进去静默跳过，不影响校验。

## 自测

```bash
node {baseDir}/scripts/selftest.mjs
```

360 项断言，不调模型、不花额度。18 道质量门每一道都有击穿用例。改完脚本先跑这个。

## 自带样例

`{baseDir}/examples/渡口-storyboard.json`：《渡口》第 1 集完整分镜——10 段 34 切认领剧本全部 35 拍，平均 3.5 秒一切，共 119 秒 / 目标 120 秒，2 个生成批次，每段带完整的视频提示词（H3 骨架：多图对齐 + 切点时刻全部对账通过）。当质量基准，也是自测夹具。
