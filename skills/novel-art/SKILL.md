---
name: novel-art
version: 2.0.0
description: |
  给 AI 短剧出美术设定集（场景 + 叙事道具）：场景的设计意图、一致性锚点、光照时段变体、
  空景提示词；道具的戏剧功能、状态变体、尺度参照、白底无手提示词。
  产出 art.json + Markdown + 单页评审报告（含导出 JSON）。
  为 AI 生成而设计，不是实拍——环境和道具都是生成资产，交付的是让它们跨集长一样的一致性方案；
  资产检查全部由脚本确定性执行（锚点 3–5、无人无手、白底可抠、尺度短语、提示词英文……，
  其中 2 道读工作目录根的 production.json：画风与设定图画幅，没有就明说跳过）。
  画风**不内置任何类型**——它由用户在 novel-setup 那一段填进 production.json 顶层的 style.scene，
  本 skill 整块抄过来用（真人实拍、吉卜力、水墨、黏土定格都行，不用改代码）。
  有 outline.json 就使用 seed 预填场景清单与出现集；本地 images 导出离线计划。
  上传、提交、任务恢复和下载归外部生成工具，本 skill 可独立交付创作与计划。
  零依赖、零 npm；本地不执行生成，实际生图可交给独立安装的 ly-image。
  production.json 顶层 autopilot 为 true 时全程不打断——输入、道具清单自己定，做过的决定写进汇报。
  Use when asked to 场景设定、出场景、环境设定集、场景一致性、scene bibles for AI short drama。
# 工具名两套都列：pi 认小写（read/write/edit/bash/grep/find/ls），Claude Code 认大写；各自取各自认得的
allowed-tools: read write edit bash grep find ls Read Write Edit Bash Glob Grep Task
triggers:
  - novel-art
  - 美术设定
  - 场景设定
  - 场景道具
  - 出场景
  - 道具设定
  - 环境设定
  - scene bible
  - prop sheet
metadata:
  license: Apache-2.0
  requires:
    bins:
      - node          # >= 18，只用标准库，无 npm 依赖
    # 可选外部执行工具：ly-image；不影响本 skill 独立产出
  runtimes:
    - pi            # 没有子代理：并发步骤在当前会话串行做，产出一致
    - claude-code
    - codex
---

## v3 上游契约与迁移

seed 只接受显式 `outline.schemaVersion: 3`；production 同样要求 `schemaVersion: 3`。读取可选非空 `production.creativeBrief`，不解释策略配置。人物来源、弧光、节点分类与位置可以省略。缺 production 时仅跳过上游对账；提供损坏上游、旧配置或缺视觉正文的 production 必须失败。资产输出与媒体计划协议不变。

检查对象统一为 `status: pass/fail/skipped + category + level`，不再输出 ok 布尔值。跳过不计为通过。内容评审未执行时明确说明。开工前阅读 [契约](references/creative-background.md) 和 [迁移说明](references/migration.md)。

## novel-art

给 AI 短剧出**美术设定集**：场景 + 叙事道具。**前提刻在骨子里：这是 AI 生成，不是实拍**——没有堪景搭景置景采买，环境和道具都是要被生成几十次还得长一样的资产，所以交付物全部围绕一致性：

| 交付 | 解决什么 |
| --- | --- |
| 一致性锚点（每景 3–5 个） | 观众靠它认场景，QC 靠它核对生成镜头有没有漂 |
| 光照时段变体 | AI 换时段是重新生成不是重新打灯，每个状态落成完整提示词 |
| 空景出图提示词 | 环境和角色是两层资产，参考图里混进人，一致性全毁 |
| 变体机制（variantOf） | 生成新景便宜，但变体复用母场景资产更一致 |
| 道具状态变体 | 铁盒的合上与打开是两张参考图——道具有状态弧，场景没有 |
| 道具尺度参照 | AI 经常把手持道具画成家具尺寸，提示词必须带尺度短语 |
| 道具白底无手 | 道具图要被贴进各种镜头，必须可抠；拿着道具的手是最常见污染 |

`{baseDir}` = 本文件所在目录。脚本 `{baseDir}/scripts/novel-art.mjs`，零依赖，`node` 直接跑。

**运行环境**：pi、Claude Code、codex 都能跑，工作流一样。**pi 默认不带子代理**（也没有内置待办与后台 bash），所有写着「有子代理就并发」的步骤在 pi 里就是当前会话顺着做一遍——产出一致，只是慢。实际生成可交给独立安装的 ly-image——见 `references/media-handoff.md`。

**边界（不做的事）**：不做分镜、不写剧本、不管角色（`novel-characters` 的活）、不排大纲（`novel-outline` 的活）。**道具只收叙事道具**（有特写、跨集、承载剧情的，通常 3–8 件）——场景陈设归场景锚点，一次性手部道具镜头级提示词解决，都不单独建资产。

---

### Step 0 — 定输入与画风

三种输入，优先级从高到低：

1. **outline.json**（novel-outline 的产出）——最优，场景清单、出现集、关联剧情节点、复用方案都是现成的
2. 小说原文——自己归纳场景清单（主舞台优先，依照项目明确的资产预算控制数量，不依赖其他 skill 指南）
3. 用户手写的场景清单

**画风不内置、不问用户、不自己编。**它是 `novel-setup` 那一段定的，住在工作目录根的 `production.json` 顶层。取出来：

```bash
node {baseDir}/scripts/novel-art.mjs style
```

打印这部剧的 `style.scene` 那一块：`render` / `surface` / `negative` / `tags`。**它们要原样抄进设定卡**——`render` 与 `surface` 进 `image.sheet` 与 `image.prompt`，`negative` 的每一条进 `image.negativePrompt`。

命令找不到 `production.json`、或那一块没填，会直接报错。**那时回 `/novel-setup` 定画风**——自己编一档出来，角色是一个样、场景是另一个样，一半动画一半实拍没法看。

`style.scene` 与 `style.character` 是**同一个画风的两种落地**，不是同一段文字：写实的人要毛孔、皮下散射；写实的环境要斑驳、水渍、包浆。**别把角色那一块搬过来。**

有 cast.json（novel-characters 的产出）也带上——校验「提示词不含角色名」要用。

**产物落点 ⛔ 只有一格**：本 skill 的全部产出写进 `<工作目录>/art/`——`<剧名>-art.json`、`<剧名>-art.md`、`art-report.html`、`images/` 都在这一格里。工作目录根只住 `production.json`（`novel-setup` 的产出），别的 skill 各占自己的一格（`outline/`、`characters/`、`script/`、`creation/`）。用户没指定工作目录就用大纲同级目录，**但段目录这一层不省**——合并报告的 `--from` 自动发现就是按段目录名找 JSON 的，平铺在根目录它找不到。下文的 `<段目录>` 就指 `<工作目录>/art/`。

跑过 `novel-setup` 的项目这条是查的：`validate` 找到 `production.json` 就顺带核对落点，放错了会点名该去哪；没找到那份文件就无从判断工作目录根在哪，明说跳过。

**生产参数不用挂载，脚本自己找。** `production.json`（`novel-setup` 的产出）住在工作目录根，`validate` / `checkup` / `images` 都会从 art.json 所在目录**向上最多 5 层**去找它，找到就打印路径，找不到也打印一句「2 道门跳过」——不静默。

找到了画风就以它为准（渲染句有没有进提示词、反向词有没有带全，由脚本查了），设定图版面的画幅也必须与 `image.asset.aspectRatio` 一致。出图用 `image.model` + `image.asset.resolution`（**档位对应模型的 `resolution` 枚举值**，进入计划 params，提交前按实时 schema 核对，不折算像素）——**这三个值 `images` 子命令自己读，不用手动挂载**。历史报告没有这份文件时可以独立读取；`--no-production` 只跳过上游对账，不提供出图默认值。出图前必须补齐视觉正文与制作参数。

### Step 0.5 — 自动驾驶（autopilot）

Step 0 那份 `production.json` 顶层还有一个 `autopilot`。为 `true` 时本 skill 的全部流程**一口气跑完**：不提问、不等拍板、不把选择题抛回去。`validate` / `checkup` 与 `images` 找到生产参数也会打印一句 `↳ 自动驾驶：开启`（`render` 只做语言继承，不打印）——但 Step 0 跑在第一条命令之前，所以开工前要自己看一眼。

没有 `production.json`、字段写着 `false` 或者整个没写，就是各步原来的样子。

| 原本 | 自动驾驶下 |
| --- | --- |
| Step 0 三种输入选哪个 | 按写死的优先级自己选（outline.json > 小说原文 > 用户手写清单），选了哪个写进汇报 |
| Step 2 叙事道具收哪几件 | 自己定（有特写、跨集、承载剧情，3–8 件），清单与取舍理由写进汇报 |
| Step 4 出图 | 完成离线计划；已授权时通过 ly-image 生成并检查，不自动重投。没有生成工具则明确未生成 |

**转移的是审批权，不是取消检查点**：确定性检查照样要过、拿到图照样要核对锚点——只是不再等人点头。**替用户做的每一个决定都要写进 Step 5 的汇报**，道具取舍一条不漏。

### Step 1 — seed 骨架（有 outline.json 才有这步）

```bash
mkdir -p <段目录>
node {baseDir}/scripts/novel-art.mjs seed <outline.json> > <段目录>/<剧名>-art.json
```

确定性搬运：场景 id/名称/主场景标记/出现集/关联剧情节点，带复用方案的场景会有 `seedNote` 提示做成变体。**这些事实不要让模型重新想一遍。**

没有 outline.json 就自己按 `references/schema.md` 建清单。

### Step 2 — 逐场景填设定 + 提取叙事道具

每个场景一份，有子代理就并发、没有（例如 pi）就在当前会话串行做，产出一致。每份任务拿到：

- `{baseDir}/references/scene-pass.md` 和 `{baseDir}/references/schema.md`（读它们，照着做）
- `{baseDir}/references/realism.md`（真实感怎么落进提示词：生活痕迹、光的来源、材质做旧各进哪种图。**非写实画风只取通用那半边**）
- 该场景的骨架 + 原文/大纲里关于这个空间的全部信息
- **同批其他场景的名字**（空间气质要区分开，别都写成同一种破旧）
- 这部剧的画风全文（`style` 命令的输出）

核心要求都在 scene-pass.md 里，最重的三条：锚点要**可画可认可核对**（「补丁船篷」是锚点，「陈旧的氛围」是形容词）；光照状态**从分集反推**，不写用不上的全家桶；**能做变体就别开新景**。

**叙事道具优先吃大纲**：`outline.json` v3 的可选 `props`，`seed` 会把道具表连同「承载什么」「关联哪些剧情节点」「哪几集出现」一起搬过来，这一层只填设计字段（尺度、锚点、状态变体、白底提示词）。**大纲没有 props 就从原文提取**，那时这步是模型的活：只收**有特写、跨集出现、承载剧情**的，通常 3–8 件，跟主角数量一个量级。每件按 `references/prop-pass.md` 填：戏剧功能、锚点、状态变体、尺度、白底无手提示词；磨损怎么写得可核对，见 `references/realism.md` 第 4 节。留言板这种「跟人走的道具」就该在这——塞进场景锚点和角色画像都不对。

### Step 3 — 校验 ⛔ 不能跳

```bash
node {baseDir}/scripts/novel-art.mjs validate <art.json> --cast <cast.json>
```

资产检查全是代码，另含字段/引用与 production 完整性检查。场景 + 共用 6 道：锚点 3–5、光照状态 ≥1、**无人**、提示词全英文、不含角色名（给了 --cast 才查）、变体引用完整。道具专属 4 道：**状态 ≥1**、**尺度短语写进提示词**、**反向词禁手**、**设定图纯白背景**。生产参数 2 道：**画风整块用上**（渲染句进了 `sheet` 与 `prompt`、反向词一条不落地进了场景的反向词）、**设定图版面画幅与生产参数一致**（找不到 production.json 就明说跳过）。

**有违规逐条修，改完重跑，直到通过。**

### Step 4 — 出图（可选）

```bash
cd <段目录>
node {baseDir}/scripts/novel-art.mjs images <剧名>-art.json
```

本命令只输出离线计划，不会生成图片。可增加 `--out image-plan.json` 保存计划，`--only` 筛选任务。

读取 [生成交接流程](references/media-handoff.md)，再读取已安装的 **ly-image**。由它发现实时模型/schema、构造请求、预览、在授权范围内提交，并使用原回执恢复查询与下载。计划按参考依赖排序；基准图核验完成后才能生成依赖图。外部下载名不同于本地报告路径，核验格式和内容后放到计划 output，再 render。

没有 ly-image 或没有生成授权时，只交付提示词与计划，明确“未生成”。原 `--force`、`--cutout`、超时与并发选项已退役；质量重做和透明底由 ly-image 另行处理，不能自动重复付费。

全图无人；道具另加无手、纯白背景。版面要求见 [sheet](references/sheet.md)。

### Step 5 — 输出与汇报

```bash
cd <段目录>
node {baseDir}/scripts/novel-art.mjs render <剧名>-art.json --cast ../characters/<剧名>-cast.json --md   > <剧名>-art.md
node {baseDir}/scripts/novel-art.mjs render <剧名>-art.json --cast ../characters/<剧名>-cast.json --html > art-report.html
```

`render` 与 `validate/checkup` 读取相同的 `--cast` 上游并执行禁名检查。独立运行没有角色文件时省略 `--cast`，报告明确跳过；已经提供但损坏或不可读的角色文件必须失败。

报告界面默认中文；用户要英文界面就加 `--lang en`（或在 art.json 顶层写 `"lang": "en"`，也可以在 `production.json` 里一处定死；优先级 `--lang` > art.json > production.json > 中文）。`render` 自动去 `images/<slug>-sheet.png` 找图（场景和道具都找），**先出图再 render**。报告含：KPI 带、场景清单、场景设定卡、道具清单、道具设定卡（锚点核对表 / 状态变体 / 提示词包全带复制按钮）、质量门面板、导出 JSON（下载的就是 art.json 原样）。

汇报一句话说清：几个场景（主场景/变体各几）、几件道具、锚点总数、出图数、报告路径；没过的门和没出的图明说。

最终落地：

```
<工作目录>/
├── production.json                ← novel-setup 的产出，住在根目录
└── art/                           ← 本 skill 的全部产出，一格装满
    ├── <剧名>-art.json
    ├── <剧名>-art.md
    ├── art-report.html            ← 双击就能开
    └── images/
        ├── <slug>-sheet.png       ← 通过外部生成并核验后才有
        └── jobs/                  ← 外部 skill 回执，保留用于恢复
```

---

## 四个 skill 的接力

```
novel-setup      → production.json （拿什么拍：模型、画幅、分辨率、画风）
novel-outline    → outline.json （什么：结构与分集）
novel-characters → cast.json    （谁：角色资产）
novel-art        → art.json     （哪里 + 手里拿的：美术资产）
```

seed 吃 outline.json 的场景与道具两块（大纲没有 `props` 时道具留空，模型从原文提取），`--cast` 吃 cast.json。三份 JSON 各自的报告都带导出按钮，改完都能喂回各自的 render/validate。

## 边界

- 报告界面内置中英（`--lang`，默认中文、或跟 art.json 的 `lang` 字段）；出图提示词永远英文
- 画风不自己定也不自己编：`style.scene` 从 `production.json` 取，`style.character` 是角色 skill 的，两块别互相搬
- `images` 只输出离线计划；实际生成只交给 ly-image，不内置第二套网关调用。
- 场景数量不设硬上限——上限在 novel-outline 的主场景门那里管；这里管的是每个资产的质量
- 道具只收叙事道具，3–8 件为宜——每多一件就多一份跨集一致性维护

## 自测

```bash
node {baseDir}/scripts/selftest.mjs
node {baseDir}/scripts/v3-selftest.mjs
node {baseDir}/scripts/upstream-selftest.mjs
```

离线自测覆盖创作、契约、渲染与交接计划；检查依赖顺序、提示词原文、素材路径、退役参数与防覆盖。不调用模型、不读取凭据、不发网络请求。

## 自带样例

`{baseDir}/examples/雨棚留言-art.json`：《雨棚留言》三场景 + 两件叙事道具（旧留言板、夹纸铁盒）的完整设定，全部质量门通过（角色名检查使用本 skill 自有夹具）。当质量基准，也是自测夹具。

正式样例先阅读 `examples/雨棚留言-故事提案.md`（schema 阅读者从 skill 根目录定位）。独立水池场景不要求 reusePlan；节点关联包含 event 和 turn，不伪造 payoff。当前资产不含真实生成图片。
