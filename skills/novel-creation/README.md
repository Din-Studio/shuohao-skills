**中文** · [English](README.en.md)

# novel-creation

给 AI 短剧**参考图直出视频**。前提刻在骨子里：**用户已经有 `novel-characters` / `novel-art` 出好的角色、场景、道具设定图**，有些场合不需要分镜图这一层中间产物，想直接拿这些设定图当参考图、配一条提示词就下单。所以结构里**没有关键帧这一层**：

```
段（segment）＝ 一次视频生成调用，≤ 15 秒（挂了生产参数还要落进对应视频模型的时长区间），不跨场次
 ├─ 分镜（cut）× 2–3 ＝ 段内剪切，每切 2–5 秒（硬门），各自认领剧本节拍
 ├─ 参考图挂载 ＝ 段级直接引用 cast.json / art.json 已经生成落盘的设定图（不出任何新图）
 └─ 通用视频提示词 ＝ 一段一条，逐张交代参考图身份 + [Shot k] 分行；一套骨架跨模型通用，
                      填法按 production.json 的 video.model 分流
```

- **零新增出图调用**——从 `seed` 到 `videos` 提交，本 skill 的任一命令都不调用 `lingying image create`。参考图全部来自 `cast.json` / `art.json` 已落盘的设定图文件
- **提示词骨架不是任何一个模型的内化版**——没有关键帧图可对齐，就没有对齐指令、没有切点时刻、没有 `<d>` 标签。骨架规范是本 skill 自己的方法论（`references/creation-prompt.md`），一套跨模型通用：`lingying model get` 现场查证过，`MiniMax H3` 与 `seedance2.5`/`seedance2.0` 都在顶层暴露通用的 `images: string[]` 字段，「参考图 + 提示词 → 视频」是跨模型的能力，不是 H3 独有
- **填法按 `video.model` 动态载入指南，骨架一个字不改**——挂 `MiniMax H3` 读 `references/h3-prompt.md`（官方 I2VA 指南里与关键帧无关的那部分：语言分工、说话人怎么交代、画外音的唇形句、声景两个字段怎么收进一个），挂 seedance 系列读 `references/seedance2-prompt.md`（默认语言切中文、一个精确时刻都不许写，有门查），没收录的模型照通用骨架写、不拿另一族顶上。`validate` 会打印这部剧该读哪一份
- **段级参考图挂载，不复制文件**——`images` 数组直接引用 `../characters/images/…`、`../art/images/…` 的相对路径，这些设定图被跨段共用，复制会在磁盘上重复几十份
- **出图调用收进代码**——下单走一条 `videos` 命令，提交/轮询/落盘/断点续传全在 `scripts/lib/lingying.mjs` 里（`novel-art`/`novel-characters` 出图那份的移植版），不经过 bash 文档现拼参数

产出 `creation.json` + Markdown + 一个双击就能开的 `creation-report.html`。

## 什么时候用它

- **合适**：设定图已经出好，要快、要省，直接拿它们配一条提示词就下单；一集里大部分场次是对话与日常动作，构图靠提示词描述 + 参考图锚定就够
- **不合适**：要每切一张关键帧精确控镜、要多图按秒对齐——本 skill 没有关键帧这一层，也不打算有

本 skill **自包含、可以整个拷走**：只读工作目录里的 `production.json` 与 `cast.json`/`art.json`，不 import 任何兄弟 skill 的代码、不读它们的文档，也不改动它们的产出。

## 质量门：17 道，全是代码

其中 3 道是这条路特有的——2 道盯参考图，1 道盯提示词与挂的模型口径；最后一道 `shot-recipe` 是可选挂载才查：

| 门 | 规则 |
| --- | --- |
| **节拍全覆盖** | 剧本每个节拍被恰好一个分镜认领、按顺序、连续、不跨场 |
| 段时长 | 0 < Σ分镜 ≤ 上限（一次生成的上限；挂了生产参数还要落进对应视频模型的时长区间） |
| 分镜时长 | 每切 2–5 秒——短剧节奏是硬门 |
| 台词装得下 | 认领节拍的台词秒数 ≤ 分镜秒数 |
| 每集总时长 | Σ段 落在剧本 `targetSeconds` ±15% 内 |
| 同框上限 | 单个分镜 ≤ 3 人，超了必须带拆解说明 |
| 段号纪律 | `E01-01` 格式、按顺序连号 |
| 景别短语 | 必须出现在这一切自己的 `[Shot k]` 行里（不是分开的分镜图提示词——这里没有那个字段） |
| 运镜词表 | 通用摄影语汇（英文词沿用 H3 官方词表），必须出现在自己的 `[Shot k]` 行里 |
| **台词逐字出现在 prompt 里** | 纯文本子串匹配，不要求任何标签——改一个字必被拦 |
| 提示词语言一致 | 正文语言与 `promptLang` 双向对账 |
| 提示词不含角色名 | 台词引号内放行；给 `--outline`/`--cast` 才查，不给明说跳过 |
| 引用对账 | 场次/人物/道具全部对账剧本该场 |
| **参考图能解出文件** | 段内出现的每个人物/场景/道具都要能从 `outline`/`art` 解出名字、拼出 `../characters\|art/images/<slug>-sheet.png`，文件不存在点名缺哪张 + 期望路径 |
| **参考图标注数量一致** | 提示词开头的 `Picture k is …` / `图 k 是…` 身份说明句数量必须与 `images` 数组长度一致 |
| **提示词与模型口径相符** | 按 `production.json` 的 `video.model` 分流：挂 seedance 系列时提示词里**一个精确时刻都不许有**（官方明说限制精确时间会让生成异常）；其余模型没有确定性硬约束可查，门明说这一点，并把这部剧该读哪份填法指南报出来 |
| **镜头配方**（可选挂载） | id 在卡库里、卡片的必备短语进对应 `[Shot k]` 行、多格配方连排够格数；建议景别与运镜只提示不设门 |

自测里每道门都有击穿用例。

## 报告长什么样

- **KPI 带**：生成段数 / 分镜数与平均秒数 / 总时长 vs 目标 / 台词段数
- **分镜节奏带**：每集一行色带，粗分隔 = 段边界，片宽 = 分镜时长占比，颜色深浅 = 景别远近
- **分集分镜表**：每段一张卡——**参考图条**（图存在就嵌缩略图，不存在显示占位，不猜不骗）、五五分栏（左列逐切分镜行，右列提示词面板一键复制）
- **参考图挂载单**：按段列出这一段挂了哪些设定图、路径存不存在——下单前先看这些文件都在不在
- **配音对齐单**：每句台词对到段号#切序
- 质量门面板 + 页眉徽章 + 导出 JSON，报告界面默认中文，`render --lang en` 出全英文界面

## 命令行直接用

```bash
node scripts/novel-creation.mjs seed script.json --eps 1        # 切镜底稿
cd <段目录>   # 从这里起，全部命令按当前目录解析参考图相对路径与生成参数
node ../../scripts/novel-creation.mjs validate creation.json \
     --script ../script/script.json --outline ../outline/outline.json \
     --cast ../characters/cast.json --art ../art/art.json
node ../../scripts/novel-creation.mjs render creation.json --html \
     --script ../script/script.json --outline ../outline/outline.json --art ../art/art.json > creation-report.html
node ../../scripts/novel-creation.mjs export creation.json --script ../script/script.json \
     --outline ../outline/outline.json --art ../art/art.json --out .
node ../../scripts/novel-creation.mjs videos manifest.json --dry-run     # 下单前先看会提交什么
```

`export` 的投产结构：**每段一个文件夹** `E01-01/`——只有 `prompt.md`（没有分镜图，视频提示词原样，头部列出挂载的参考图身份 + 相对路径），根部 `manifest.json` 带顶层视频参数与每段的参考图清单、缺图标注。

## 自动驾驶（autopilot）

工作目录根的 `production.json`（`novel-setup` 的产出）顶层写着 `"autopilot": true` 时，本 skill 的全部流程**一口气跑完**：提示词按 `video.model` 自己载入填法指南、参考图自己挂、下单前的花费预估照样报出来但不等回应，做过的决定全部写进最后的汇报。

**转移的是审批权，不是取消检查点**：17 道门照样要过、花费照样先算清楚、同一段连着失败两次照样跳过——**不打断不等于无限重试烧钱**。字段写着 `false`、整个没写、或者根本没有 `production.json`，就是原来的样子（该问就问）。跑 `validate` 时找到生产参数并且开着，会打印一句 `↳ 自动驾驶：开`。

## 边界

- 不写戏不改台词、不出设定图、**不做剪辑合成**；视频生成是可选的最后一步，走 `lingying video create`，产出到每段一个 mp4 为止
- **零新增出图调用**是硬承诺，不是偏好——参考图必须来自已存在的文件，找不到就是门失败，不会退而求其次去生成一张
- **不落 `.gates.jsonl`、不加 `stats` 子命令**——本 skill 不累积门失败统计，校验结果只在当次输出里

## 文件

```
SKILL.md                 给 agent 读的工作流
scripts/
  novel-creation.mjs     seed / validate / checkup / render / export / videos / slug
  lib/lingying.mjs       视频下单编排：submitTask/pollTask/uploadAsset/runBatch……
  selftest.mjs           自测，不调模型
references/
  schema.md              creation.json 结构 + 时长约束链
  creation-prompt.md     视频提示词的骨架规范（本 skill 自己的方法论，不是任何一个模型的内化版）
  h3-prompt.md           video.model 是 MiniMax H3 时的填法（官方 I2VA 指南内化版，只搬与关键帧无关的那部分）
  seedance2-prompt.md    video.model 是 seedance 系列时的加严填法（火山引擎官方指南内化版）
  shot-pass.md           切镜：分段规则、段级参考图挂载、导演运镜手感、常见病
  video-order.md         下单生视频的行为说明（videos 命令内部做什么）
  report-style.md        报告的设计约定
examples/
  收书人.txt              原创样例故事梗概
  outline/ characters/ art/ script/ creation/   最小合规夹具 + 真实占位设定图
  production.json        生产参数样例
```

## 自测

```bash
node scripts/selftest.mjs
```

不调模型、不花额度、1 秒跑完。改完脚本先跑这个。

**只在 macOS + Node 24 上实测过。** 代码没有平台相关调用，Linux 和更低版本 Node 理论上没问题，但没验过。
