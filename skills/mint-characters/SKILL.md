---
name: mint-characters
version: 2.0.0
description: |
  从小说或短故事里拆出角色表、人物画像、形象提示词、音色提示词，
  并给每个角色出角色设定图（左半身像 + 右全身三视图 + 细节条），产出 JSON + Markdown + 可交互的 report.html。
  报告语言可指定（--lang），默认中文，任意语言都支持；
  画风**不内置任何类型**——它由用户在 mint-setup 那一段填进 production.json 顶层的 style.character，
  本 skill 整块抄过来用（真人实拍、吉卜力、水墨、黏土定格都行，不用改代码）。
  Self-contained deterministic scripts export plans; the host canvas_cli performs authorized generation.
  上传、提交、任务恢复和下载归外部生成工具，本 skill 可独立交付创作与计划。
  跑过 mint-setup 的项目会自动读工作目录根的 production.json：画风与设定图画幅两条硬检查，出图模型与尺寸也从那里取；
  顶层 autopilot 为 true 时全程不打断——报告语言、选角人数、归并复核全自己定，做过的决定写进汇报。
  Use when asked to 拆小说角色、分析人物、生成角色卡、character sheets from a novel。
allowed-tools: read write edit grep find ls mint_skill canvas_cli
triggers:
  - mint-characters
  - 拆角色
  - 拆书角色
  - 小说角色
  - 人物画像
  - 角色卡
  - 三视图
  - character sheet from novel
metadata:
  license: Apache-2.0
  runtimes: [mint-cloud]
---

## v3 上游契约与迁移

seed 只接受显式 `outline.schemaVersion: 3`；production 同样要求 `schemaVersion: 3`。读取可选非空 `production.creativeBrief`，不解释策略配置。人物来源、弧光、节点分类与位置可以省略。缺 production 时仅跳过上游对账；提供损坏上游、旧配置或缺视觉正文的 production 必须失败。资产输出与媒体计划协议不变。

检查对象统一为 `status: pass/fail/skipped + category + level`，不再输出 ok 布尔值。跳过不计为通过。内容评审未执行时明确说明。开工前阅读 [契约](references/creative-background.md) 和 [迁移说明](references/migration.md)。

## mint-characters

输入一篇小说/短故事，输出每个角色的：人物画像、形象提示词、音色提示词、角色设定图。

`{baseDir}` is the packaged skill directory. Scripts remain self-contained and standard-library-only. Invoke deterministic operations through mint_skill with command tokens, never shell syntax or script paths. All artifact paths are workspace-relative; use read/write/edit/find/grep/ls directly. Character design runs sequentially in the main session. The application supplies canvas_cli for authorized generation; read references/media-handoff.md.

---

### Step 0 — 读生产参数（有就必须遵循）

`production.json`（`mint-setup` 的产出）住在工作目录根。**不用挂载，脚本自己找**：`validate` / `images` 会从 cast.json 所在目录**向上最多 5 层**去找它，找到就打印路径，找不到也打印一句「2 条检查跳过」——不静默。

找到了这三样以它为准：

| 字段 | 管什么 |
| --- | --- |
| `style.character` | **画风正文本身**。角色卡没把它整块用上直接报错——画风漂了，角色和场景合成时不像同一部片 |
| `image.asset.aspectRatio` | 设定图版面画幅，必须出现在每个角色的 `image.sheet` 里 |
| `image.model` + `image.asset.resolution` | 第 8 步出图用的模型与分辨率档位（档位对应模型的 `resolution` 枚举值，原样填） |

`lang` 也可以从它继承（优先级 `--lang` > cast.json 顶层 > production.json > 中文）。历史报告没有这份文件时可以独立读取；`--no-production` 只跳过上游对账，不提供出图默认值。出图前必须补齐视觉正文与制作参数。

### Step 0.1 — 确定报告语言

用户可以指定语言，比如「用英文」「--lang en」「日本語で」。**没说就是中文（`zh`）。**

这个 `lang` 会一路传下去：第二趟生成角色卡时决定人类可读字段用什么语言，`validate` 和 `render` 也都要带上。

**界面文案分两种情况：**

- `zh` / `en` / `ja` —— 内置，不用管
- **其他任何语言** —— 你要现场翻一份。跑

  ```text
  mint_skill({skill:"mint-characters",args:["ui-template","<lang>"]})
  ```

  它打印一份英文骨架，把每个值翻译成目标语言，整块放进 `cast.json` 顶层的 `ui` 字段。渲染时会合并进内置表。

  **不给 `ui` 的话 `validate` 会直接报错**——否则报告会是「角色内容是法语、界面标签是英文」的半吊子状态。

支持的语言不受内置表限制，法语韩语西班牙语都能出完整报告。

### Step 0.5 — 取画风 ⛔ 不要自己编

**本 skill 不内置任何画风，也不问用户画风。**画风是 `mint-setup` 那一段定的，住在工作目录根的 `production.json` 顶层。这一步只是把它取出来：

```text
mint_skill({skill:"mint-characters",args:["style"]})
```

打印这部剧的 `style.character` 那一块：`render` / `surface` / `lighting` / `negative` / `tags` 五段英文正文。**它们要原样抄进角色卡**——`render` 进 `image.sheet` 与 `image.prompt`，`negative` 的每一条进 `image.negativePrompt`。

命令找不到 `production.json`、或那一块没填，会直接报错。**那时回 `/mint-setup` 定画风，不要自己编一档顶上去**——编出来的那一档只活在这一段，场景与分镜是另一档，合成时对不上。

**换风格是整套换**：五块整块取用，不要混搭。详见 `{baseDir}/references/style.md`。

版面规则（三区、比例、细节让位）**不随画风变**，变的只有渲染质感。画幅读取 `production.image.asset.aspectRatio`，允许合法横向或方形比例——**成片拍竖屏也不改**，三区版面靠横向铺开，竖过来三视图会被压扁。

### Step 0.8 — 自动驾驶（autopilot）

Step 0 那份 `production.json` 顶层还有一个 `autopilot`。为 `true` 时本 skill 的全部流程**一口气跑完**：不提问、不等拍板、不把选择题抛回去。`validate` 与 `images` 找到生产参数也会打印一句 `↳ 自动驾驶：开启`（`render` 只做语言继承，不打印）——但 Step 0.1 跑在第一条命令之前，所以开工前要自己看一眼。

没有 `production.json`、字段写着 `false` 或者整个没写，就是各步原来的样子。

| 原本 | 自动驾驶下 |
| --- | --- |
| Step 0.1 问报告语言 | 按继承取（`--lang` > cast.json 顶层 > `production.json` > 中文），不问；非内置语言的 `ui` 骨架自己翻 |
| Step 4 `mergeCandidates` 逐条复核 | **自己判**：证据够才合，拿不准就**不合并**——合错了两个人并成一个，比没合更难修。逐条判定结果写进汇报 |
| Step 5 选角取前 N 位 | 用户没说就取默认 30，不问 |
| Step 8 generation | Export the offline plan; use host canvas_cli only within spending authorization. Inspect existing tasks instead of resubmitting. Report missing capability or ungenerated media. |

Autopilot delegates creative choices within the task. Step 7 validation, image-count disclosure and output inspection still apply. It does not grant spending authorization; stop generation if that authorization is missing. Report every decision in Step 10, including every merge judgment and the selected cast size.

### Step 1 — 定位输入

用户给文件路径就直接用。直接粘正文的，**先落到一个临时 .txt**——后面校验「引文是否逐字」要拿原文比对，没有原文文件这步就没法做。

**产物落点 ⛔ 只有一格**：本 skill 的全部产出写进 `<工作目录>/characters/`——`<书名>-cast.json`、`<书名>-cast.md`、`report.html`、`images/` 都在这一格里。工作目录根只住 `production.json`（`mint-setup` 的产出），别的 skill 各占自己的一格（`outline/`、`art/`、`script/`、`creation/`）。用户没指定工作目录就用原书同级目录，**但段目录这一层不省**——合并报告的 `--from` 自动发现就是按段目录名找 JSON 的，平铺在根目录它找不到。下文的 `<段目录>` 就指 `<工作目录>/characters/`。

分块、roster、角色卡这些中间件写进 `<段目录>/.work/`，跑完可以整个删掉，不影响任何交付物。下文的 `<workdir>` 就指 `<段目录>/.work/`。

跑过 `mint-setup` 的项目这条是查的：`validate` 找到 `production.json` 就顺带核对落点，放错了会点名该去哪；没找到那份文件就无从判断工作目录根在哪，明说跳过。

**有 `outline.json`（mint-outline 的产出）就一起要过来，走 seed**——大纲是角色设定的上游，它的 `characters` 块已经定死了角色清单：

```text
mint_skill({skill:"mint-characters",args:["seed","outline/作品-outline.json"]})
```

Save successful stdout with write to characters/.work/seed.json; seed has no --out. In the following examples, <workdir> means the workspace-relative characters/.work directory and <stage> means characters.

搬过来的是大纲已经拍板的事实，留空的是这一层才该做的设计：

| outline 的字段 | seed 之后 |
| --- | --- |
| `id` | 原样保留成角色码——下游 script / creation 用它引用角色 |
| `name` | 角色表就照这份，**不再自己判断谁该进** |
| `tier` | 映射成 `importance`：`lead` → `protagonist`、`support` → `supporting`、`functional` → `minor` |
| `arc` | 直接落进 `persona.arc` |
| `role` / `from` | 进 `seedNote`——定位（女主 / 反派）与「由原著的谁合并而来」，扫原文时知道该收哪几条线的戏 |

留空待填：`aliases`（要读原文才知道）、`oneLiner`、`persona` 其余各项、`image`、`voice`。**seed 出来的是骨架不是成品**，直接跑 `validate` 会报一堆字段缺失，那是预期的——后面 Step 2–6 就是来填它的。

两处口径要守住：

- **大纲定的分档不要推翻**。谁重要是改编阶段拍板的事，这一层只负责把定下来的人做深。真觉得分档不对，回去改大纲，别在这里悄悄改一个不一样的
- **主角组内部可以细分**。outline 的 `lead` 是「男女主 + 主反派」一整组，对应 `protagonist` 与 `major` 两档，seed 一律给 `protagonist`；照 `seedNote` 里的定位把主角之外的改成 `major`，这不算推翻分档

**没有 `outline.json` 也照常跑**，本 skill 不依赖它——跳过 seed，从 Step 2 开始自己从原文拆角色表。

### Step 2 — 分块

```text
mint_skill({skill:"mint-characters",args:["chunk","book.txt","characters/.work"]})
```

打印 `{"chunks": N, ...}`。

- **N == 1**：跳过 Step 3，直接在当前会话读原文做第一趟，结果自己写成 `<workdir>/roster-00.json`
- **N > 1**：进 Step 3
- `truncated: true`：明确告诉用户尾部没扫到，别闷着

### Step 3 — 第一趟扫描（仅 N > 1）

Scan chunks sequentially in the main session. No additional workflow roles are registered for this pass.

For each chunk:
1. 读 `{baseDir}/references/roster-pass.md`，照它执行
2. 读 `<workdir>/chunk-NN.txt`
3. 把 roster JSON 写到 `<workdir>/roster-NN.json`
4. 只回一句「done NN，抽到 X 个角色」

### Step 4 — 归并 + 复核

```text
mint_skill({skill:"mint-characters",args:["merge","characters/.work"]})
```

Save successful stdout with write to characters/.work/merged.json; merge has no --out.

落到 `merged.json` 不只是留档：Step 6 的 assemble 靠它拿同档角色的戏份顺序。

按名字+别名精确收敛（某块把「陆」列成「陆行远」的别名，两条就并成一个人），notes 累加、quotes 去重，按出现块数降序——出现的块越多戏份越重。

输出是 `{ "characters": [...], "mergeCandidates": [...] }`。**`mergeCandidates` 要逐条复核**：精确匹配只能收敛两块恰好写了相同称呼的情况，剩下的是语义判断，脚本做不了。候选来自名字包含关系（`「陆」⊂「陆行远」`）——是强信号不是判决，同姓的父子、兄弟就不能合。候选之外你自己看出来的同人（「陆先生」和「行远」没有包含关系，不会进候选）也要合。

要合并就写一份 merges.json 再落地：

```json
{ "merges": [{ "keep": "陆行远", "absorb": ["陆", "陆先生"] }] }
```

```text
mint_skill({skill:"mint-characters",args:["merge","characters/.work","--apply","characters/.work/merges.json"]})
```

Save successful stdout with write to characters/.work/merged.json.

`keep`/`absorb` 用名字或任一别名定位都行，找不到会直接报错。输出仍带 `mergeCandidates`，剩下的都确认是不同的人（或清空）再进下一步。没有要合的就直接往下走——但 `merged.json` 必须留着。

### Step 5 — 选角

取前 N 位。默认 30，用户说了就听用户的。剩下的角色在最后汇报里提一句「还识别出 X 位没做画像」。

### Step 6 — 第二趟出卡

Develop one card per character sequentially in the main session.

每份任务拿到：
- `{baseDir}/references/profile-pass.md` 和 `{baseDir}/references/schema.md`（读它们，照着做）
- `{baseDir}/references/realism.md`（真实感怎么落进提示词：姿态、神情、破绽、材质各进哪个字段。**非写实画风只取通用那半边**）
- **报告语言 `lang`**（Step 0 定的）
- 该角色归并后的 `name` / `aliases` / `notes` / `quotes`
- **同批其他角色的名字**（避免长相声线撞车）

角色卡 JSON 写到 `<workdir>/card-<slug>.json`。**断点续跑**：`card-<slug>.json` 已存在的角色不必重跑。

**同时写一段故事摘要**：用 `lang` 指定的语言，3–5 句，交代时空背景、核心情境、这几个人聚在一起的由头。短篇直接从原文写；长篇从各块的 roster note 归纳。不剧透结局，不写成推荐语。写到 `<workdir>/summary.txt`。非内置语言的话，把 Step 0 翻好的 ui 整块存成 `<workdir>/ui.json`。

然后合成 cast.json——**用 assemble，不要手拼**（手拼会丢字段、写错顶层键）：

```text
mint_skill({skill:"mint-characters",args:["assemble","characters/.work","--source","<title>","--lang","<lang>","--out","characters/作品-cast.json"]})
```

坏卡会被逐个点名——哪份 `card-*.json` 坏了就只重跑那个角色，其他不用动。

同档角色的先后是戏份顺序，来自 Step 4 留下的 `<workdir>/merged.json`（assemble 自动读，也可用 `--order` 指别的文件）。报告左栏「按戏份排序」的序号就靠它——看到「同档角色将按文件名序」的警告说明 merged.json 丢了，回 Step 4 重新生成。

### Step 7 — 校验 ⛔ 不能跳

```text
mint_skill({skill:"mint-characters",args:["validate","characters/作品-cast.json","book.txt"]})
```

记得带上 `--lang`（Step 0.1 定的）。检查：结构、`importance` 枚举、**引文逐字**、**出图提示词不含人名**、**语言分工**（人类字段跟随 `lang`、出图/TTS 提示词永远英文）、**非内置语言必须带 `ui`**，以及生产参数的两条——**画风整块用上**（`render` 原句进了两条提示词、`negative` 一条不落地进了反向词）、**设定图版面画幅与 production.json 一致**（找不到那份文件就明说跳过）。

**有违规就按报错逐条修，改完重跑，直到通过。** 这四类错模型真的会犯——这套检查就是被真实输出打出来的。

### Step 8 — 出图（可选，每个角色都出）

**每个角色一张**，用 `image.sheet`，落到 `./images/<slug>-sheet.png`。出图模型与档位由命令自己从 `production.json` 取（`image.model` / `image.asset.resolution` / `image.asset.aspectRatio` 进入离线计划 params；生成前核对实时 schema，**提示词里一个像素都不写**）。一张横向或方形画布内部左右分栏（画幅按 `production.image.asset.aspectRatio`）：

```
┌──────────┬────────────────────────────┐
│  半身像   │   正视    侧视    背视       │
│ （证件照） ├────────────────────────────┤
│  面部基准  │  细节 · 细节 · 细节 · 细节   │
│   ~34%   │        生产参数画幅        │
└──────────┴────────────────────────────┘
```

左栏半身像是面部设计基准，右上三视图的脸照它画，右下是关键细节的小特写。**两条硬要求**：三视图的脸必须与半身像一致（否则一张图两个长相）；三个全身像的比例必须协调（模型会为了塞下细节把人压扁）。

```text
mint_skill({skill:"mint-characters",args:["images","characters/作品-cast.json","--out","characters/image-plan.json"]})
```

This exports an offline plan, not images. --only selects items and --style-ref auto adds reference dependencies. Read [canvas handoff](references/media-handoff.md). The main session uses host canvas_cli to inspect live models, map items to nodes and ordered references, submit within authorization, inspect tasks and download verified outputs. Complete and verify anchor images before dependent generation and preserve input hashes. Unsupported fields, including negative prompts the current canvas does not send, block handoff until explicit plan revision.

Without canvas capability or authorization, deliver prompts/plans and state that images were not generated. Retired --force, --cutout, timeout and concurrency flags are not recovery controls. Quality retries and optional cutouts require separate authorized canvas work; never resubmit uncertain tasks.

核对左右两栏是否同一人物、三个全身像是否等高。版面要求见 [sheet](references/sheet.md)。

### Step 9 — 输出

```text
mint_skill({skill:"mint-characters",args:["render","characters/作品-cast.json","--md"]})
mint_skill({skill:"mint-characters",args:["render","characters/作品-cast.json","--html"]})
```

Save successful stdout with write to characters/作品-cast.md and characters/report.html respectively; render has no --out.

语言取 `cast.json` 里的 `lang`（没写就跟 `production.json`），要临时覆盖就加 `--lang <code>`。

`render` 会自动去 `images/<slug>-sheet.png` 找图。所以**先出图再 render**。

report.html 的样式约定见 `{baseDir}/references/report-style.md`——要改样式先读它，别把它改回通用卡片墙。

最终落地：

```
<工作目录>/
├── production.json                ← mint-setup 的产出，住在根目录
└── characters/                    ← 本 skill 的全部产出，一格装满
    ├── <书名>-cast.json
    ├── <书名>-cast.md
    ├── report.html                ← 双击就能开
    ├── images/
    │   ├── <slug>-sheet.png       ← 通过外部生成并核验后才有
    │   └── jobs/                  ← canvas task/output mappings for recovery
    └── .work/                     ← 分块、roster、角色卡，跑完可删
```

### Step 10 — 汇报

一句话说清：角色数、出图数、报告路径。校验一次没过的话，说明修了什么。有角色出图失败、被截断、或因为没有生成工具或授权 而没出图，明确说清楚。

---

## 边界

- 单次上限 24 块（净覆盖约 93 万字符），超了会明确报 `truncated`，不静默截断
- 人类可读字段跟随 `--lang`（默认中文）；出图和 TTS 提示词**永远英文**，那些引擎吃英文最稳
- 设定图最容易出的两个问题：**一张图里两个长相**、**为了塞细节把人物压扁**。拿到图先扫一眼，见 `references/sheet.md`
- images exports an offline plan. Authorized generation uses the host canvas_cli, with no additional gateway client or personal credentials.
- 想要能实时编辑、边跑边看的交互界面，那是另一个东西，不在这个 skill 里

## 自测

Developer-only terminal self-tests; cloud models do not execute these commands:

```sh
node {baseDir}/scripts/selftest.mjs
node {baseDir}/scripts/v3-selftest.mjs
node {baseDir}/scripts/upstream-selftest.mjs
```

离线自测覆盖创作、契约、渲染与交接计划；检查依赖顺序、提示词原文、素材路径、退役参数与防覆盖。不调用模型、不读取凭据、不发网络请求。

## 自带样例

`{baseDir}/examples/渡口.txt` 是一篇短故事，4 个角色，其中货郎全程只有绰号、船夫只被叫过「老伯」——专门用来验别名归并。对应产出 `渡口-cast.json` / `渡口-cast.md` 可以当质量基准，也是校验的自检夹具。
