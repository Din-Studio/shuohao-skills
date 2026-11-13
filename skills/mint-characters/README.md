**中文** · [English](README.en.md)

# mint-characters

当前来源交接支持 outline v4 的剧本事实，兼容显式 v3 历史资产投影。CLI `seed` 核验原文 SHA256 与范围；`sourceFacts` 将证据和限制与设计补定分开。详见[来源事实](references/source-facts.md)。production 保持 v3。

## 上游契约与迁移

seed 接受 `outline.schemaVersion: 4` 和显式 v3 历史资产投影；production 仍要求 `schemaVersion: 3`。读取可选非空 `production.creativeBrief`，不解释策略配置。人物来源、弧光、节点分类与位置可以省略。缺 production 时仅跳过上游对账；提供损坏上游、旧配置或缺视觉正文的 production 必须失败。资产输出与媒体计划协议不变。

检查对象统一为 `status: pass/fail/skipped + category + level`，不再输出 ok 布尔值。跳过不计为通过。内容评审未执行时明确说明。开工前阅读 [契约](references/creative-background.md) 和 [迁移说明](references/migration.md)。

丢一本小说或一篇短故事进去，输出每个角色的完整设定：

- **角色表** — 谁出场了，主角还是龙套，跨章节的不同称呼归并到同一个人
- **人物画像** — 性别、年龄、身份、外貌、性情、动机、人物弧光、关系网，每条附**原文逐字引文**
- **形象提示词** — 真人实拍路线，双语出图 prompt + negative prompt + 风格标签，反向词原样保留到计划，提交前按模型实时 schema 核对
- **音色提示词** — 音色、音高、语速、口音、情绪，双语 voice-design prompt，直接喂 Qwen3-TTS / ElevenLabs Voice Design
- **角色设定图** — **每个角色一张**：按 `production.image.asset.aspectRatio` 分三区，左侧约 34% 证件照式半身像（面部基准）、右上全身三视图、右下关键细节特写条。**画风由 `production.json` 定**，本 skill 不内置任何一档。白底方便抠图，`images` 导出计划，实际生成交给 ly-image
- **关系图谱** — 报告里的一个全景视图：谁跟谁有关系、是什么关系，一眼看完。悬停一个人亮出他的全部关系，点一下跳到那个人的详情

产出 `cast.json` + Markdown + 一个双击就能开的 `report.html`。

**报告语言可指定**，默认中文：

```
/mint-characters ./book.txt --lang en
/mint-characters ./book.txt --lang ja
```

内置 **中文 / English / 日本語** 三套界面文案。**其他语言一样支持**——skill 会现场把界面文案翻译成目标语言，存进 `cast.json` 的 `ui` 字段，渲染时合并进去。所以法语、韩语、西班牙语都能出完整报告，不会露出英文界面。

想自己准备翻译：

```bash
node scripts/mint-characters.mjs ui-template fr   # 打印待翻译的骨架
```

![report.html](assets/report.webp)

角色设定图（自带样例《渡口》的沈知微）：

![角色设定图](assets/sheet.jpg)

## 上游

管线里**大纲在角色的上游**，技术参数再往上一层：

```
mint-setup      → production.json （拿什么拍：模型、画幅、分辨率、画风）
mint-outline    → outline.json （什么：结构与分集，谁进谁不进）
mint-characters → cast.json    （谁：角色资产）
```

有 `outline.json` 就走 `seed`——它的 `characters` 块已经定死了角色清单：

```bash
node scripts/mint-characters.mjs seed outline.json > seed.json
```

搬过来的是大纲拍板过的事实（角色码、名字、分档、人物线、由原著的谁合并而来），留空的是这一层才该做的设计（别名、画像、形象提示词、音色提示词）。`tier` 映射成 `importance`：`lead` → protagonist、`support` → supporting、`functional` → minor。

**大纲定的分档不要在这一层推翻**，觉得不对回去改大纲。主角组内部可以细分——`lead` 是「男女主 + 主反派」一整组，seed 一律给 protagonist，照 `seedNote` 里的定位把主角之外的改成 major。

**没有 `outline.json` 也照常跑**，本 skill 不依赖它——跳过 seed，直接丢一本小说进去，自己从原文拆角色表。

## 使用

将本目录完整复制到 agent 的 skills 目录，例如 `~/.pi/agent/skills/mint-characters`、`~/.claude/skills/mint-characters` 或 `~/.codex/skills/mint-characters`。也可以从这些位置建立指向本目录的软链接。脚本只需要 Node 18+，无需安装第三方依赖。安装后：

```
/mint-characters ./你的小说.txt          # Claude Code、codex
/skill:mint-characters ./你的小说.txt    # pi（skill 命令带 skill: 前缀，参数写法一样）
```

或者直接说「帮我拆一下这本书的角色」并给出路径，三家都一样。

**pi 没有子代理**：两趟扫描（分块抽角色、逐角色出卡）在 pi 里是当前会话串行做，慢几倍，产出一个字不差。

### 报告语言

默认中文。用 `--lang`，或者直接说「用英文」「日本語で」：

```
/mint-characters ./book.txt --lang en
/mint-characters ./book.txt --lang ja
```

内置 **中文 / English / 日本語** 三套界面文案。**其他语言一样支持**——skill 会现场把界面文案翻译成目标语言，存进 `cast.json` 的 `ui` 字段，渲染时合并。法语、韩语、西班牙语都能出完整报告，不会露出英文界面。

`render --lang en` 仅切换界面语言。内容校验继续读取输入 `cast.json.lang`，HTML 与 Markdown 口径一致，不会把中文音色字段误判为英文违规。

两条不跟随语言：**出图和 TTS 提示词永远英文**（引擎吃英文最稳）；**原文引文永远保持原文语言**（翻译了就不是证据了）。

### 画风

**本 skill 不内置任何画风，也没有默认画风。**画风住在工作目录根的 `production.json` 顶层，由用户在 `/mint-setup` 那一段填——真人实拍、吉卜力手绘、水墨、黏土定格、80 年代胶片颗粒都行，**不用改任何代码**。

```bash
node scripts/mint-characters.mjs style     # 打印这部剧的 style.character 那一块
```

那一块有五样东西，出角色卡时**原样抄进去**：

| 块 | 抄到哪 |
| --- | --- |
| `render` | `image.sheet` 与 `image.prompt`（两条都要，只抄一条会出成两张皮） |
| `surface` | 同上 |
| `lighting` | `image.sheet` |
| `negative` | `image.negativePrompt`，**一条不落**；角色自己额外要禁的照加 |
| `tags` | `image.tags` |

`validate` 挂上 `production.json` 就自动查这两条，没有开关。

**换风格是整套换**，不是只换一句画风——五块一起换，不许混搭。详见 [`references/style.md`](references/style.md)。

## 报告长什么样

三栏工作台：顶栏搜索，左栏是故事摘要 + 按戏份排的角色列表，主区一次只看一个角色。

**关系图谱**在左栏顶部，跟角色详情互斥。边直接来自每个角色的 `relationships`，不用模型再跑一趟：

- 按**名字 + 别名**连边——老周的关系里写「老伯」也连到同一个节点
- 同一对人的两条单向记述合并成一条边，两个方向的说法都留着
- 弦上标一段关系文字（截到 6 字，全文在悬停提示和右侧关系表里）。边多了会糊，
  ≤ 14 条默认标出来，再多默认收起，顶部有开关
- 悬停一个人亮出他的全部关系线，悬停关系表某一行只亮那一条，点谁跳谁

圆环布局在 Node 里算好直接写进内联 SVG，**不引任何库**——report.html 始终是一个能离线双击打开的单文件。

### 导出 JSON

顶栏的「导出 JSON」下载的**就是 `cast.json` 本身的形状**，不是另一套导出格式：

```json
{ "source": "…", "lang": "zh", "summary": "…", "characters": [ … ] }
```

所以外部工具改完可以**直接喂回 `render` 重新出报告**，也能过 `validate`。输入原有的 `sheetImage` 原样导出；渲染时自动发现的图片只进入显示模型，不新增或覆盖导出字段。

数据以 `<script type="application/json">` 内嵌在报告里，点导出只是把它包成 Blob 下载，**不发任何网络请求**。

## 它是怎么工作的

长文本一次性塞进上下文会丢角色，所以拆成两趟：

**第一趟 · 扫描**（便宜）
按段落切成 4 万字符的重叠块，每块并发抽「角色名 + 别名 + 该块里的具体描写 + 逐字引文」。重叠是为了让卡在切口上的角色两边都能看见。

**归并**
按名字和别名建索引，`陆行远` / `陆` / `姑娘` 这类跨块的不同叫法收敛成同一个人。精确匹配管不到的（「陆」和「陆行远」没有共同键），脚本会按名字包含关系列成 `mergeCandidates` 疑似同人候选，由模型复核后写成 merges.json 确定性落地合并。按出现块数当戏份权重排序。

**第二趟 · 出卡**
只对戏份最重的 N 位（**默认 30**），把归并后的全部描写喂进去，一次生成完整角色卡。同批角色互相知道对方的名字，避免长相和声线撞车。族裔、年代、地域从原文推断后写死进出图提示词——**不跟报告语言走**，报告出成日文不会把民国的老船夫画成日本人。

**校验**（这步不能跳）
四类硬规则，全部由脚本确定性检查，不靠模型自觉：

| 规则 | 为什么 |
| --- | --- |
| `evidence` 必须是原文**逐字连续**片段 | 防编造。被「他说」断开的对白不许拼接 |
| 出图 prompt **不许出现人名** | 图像模型对人名偏见极重，会画成它记忆里的角色 |
| 字段**语言分工** | 人类字段跟随 `--lang`、出图和 TTS 提示词永远英文，模型会漂 |
| **画风整块用上** | `production.json` 那一块的渲染句进了两条提示词、反向词一条不落。少一条画风就漂了半步（找不到那份文件就明说跳过） |
| 结构 + 枚举 | `importance` 只能是那四个值 |

这四条不是拍脑袋定的——是模型输出真的违反过、被校验脚本当场抓住才立起来的。

## 命令行直接用

脚本本身不需要 agent 也能跑，只有两趟模型调用需要：

```bash
node scripts/mint-characters.mjs seed outline.json              # 有大纲就从它预填角色表骨架
node scripts/mint-characters.mjs chunk book.txt /tmp/wk        # 切块
node scripts/mint-characters.mjs merge /tmp/wk                 # 归并 roster-*.json，附疑似同人候选
node scripts/mint-characters.mjs merge /tmp/wk --apply m.json   # 落地复核后的合并
node scripts/mint-characters.mjs assemble /tmp/wk --source 书名 # card-*.json 合成 cast.json，同档按戏份排序
node scripts/mint-characters.mjs validate cast.json book.txt   # 校验
node scripts/mint-characters.mjs images cast.json               # 仅导出离线计划
node scripts/mint-characters.mjs images cast.json --dry-run     # 只看要提交什么
node scripts/mint-characters.mjs images cast.json --style-ref auto  # 拿第一张压画风
node scripts/mint-characters.mjs render cast.json --html       # 出 report.html
node scripts/mint-characters.mjs slug "胡二爷"                  # 安全文件名
```

## 自动驾驶（autopilot）

工作目录根的 `production.json`（`mint-setup` 的产出）顶层写着 `"autopilot": true` 时，本 skill 的全部流程**一口气跑完**：不问报告语言、不问选角人数，归并候选自己逐条复核（拿不准就不合并），设定图一次出全，做过的决定全部写进最后的汇报。

**转移的是审批权，不是取消检查点**：校验照样要过、出图前照样打印要出多少张、拿到图照样要核对——只是不再等人点头。字段写着 `false`、整个没写、或者根本没有 `production.json`，就是原来的样子（该问就问）。跑 `validate` 时找到生产参数并且开着，会打印一句 `↳ 自动驾驶：开启`。

## 边界

- 单次上限 24 块（净覆盖约 93 万字符）。超了会明确报 `truncated`，**不静默截断**
- 人类可读字段跟随 `--lang`；出图和 TTS 提示词**永远英文**，那些引擎吃英文最稳，跟报告语言无关
- 每个选中角色都有交接任务。使用 `--only` 缩小计划；`--style-ref auto` 包含基准依赖。实际生成与费用由 ly-image 处理。
- **同一批角色的画风可能有差异**——各自独立出图。早期用「扁平矢量卡通」这种含糊写法时漂得很厉害（同批出成动画感／半写实／水墨写实三种），改成把 `production.json` 那一块画风整块原样抄进每张提示词后好了很多，但不能保证完全一致。在意的话加 `--style-ref auto` 拿第一张当参考图压一压，见 `references/sheet.md`

> 实际生成使用独立安装的 [ly-image](https://github.com/Din-Studio/skills)，需要 Node 22.20+，可复用本机私有 `~/.config/ly/config.json`。先阅读 [交接与恢复](references/media-handoff.md)。密钥不进入请求或仓库。缺工具或授权时交付计划，不声称已出图。

## 文件

```
SKILL.md                 给 agent 读的工作流
scripts/
  mint-characters.mjs   chunk / merge / assemble / validate / images / render / slug
  lib/media-plan.mjs    离线交接计划，不调用网关
  selftest.mjs           439 项断言，不调模型、不发请求
references/
  roster-pass.md         第一趟：扫描角色
  profile-pass.md        第二趟：生成角色卡（8 条硬规则）
  realism.md             真实感怎么落进提示词（写实档全套，其余画风只取通用那半边）
  schema.md              角色卡结构 + 字段语言归属
  sheet.md               设定图的版面与提示词（生成交给 ly-image）
  report-style.md        report.html 的设计约定
  style.md               画风从哪来（不内置，读 production.json）
examples/
  渡口.txt                自带短故事，4 个角色
  渡口-cast.json          产出，同时是校验自检夹具
  渡口-cast.md            渲染结果，质量基准
```

`examples/渡口.txt` 里货郎全程只有绰号、船夫只被叫过「老伯」——专门用来验别名归并。

## 自测

```bash
node scripts/selftest.mjs
node scripts/v3-selftest.mjs
node scripts/upstream-selftest.mjs
```

离线自测覆盖创作契约、渲染和交接计划，包括参考依赖、提示词原文、文件检查和退役选项。不调用网关或模型。

**只在 macOS + Node 24 上实测过。** 代码没有平台相关调用，Linux 和更低版本 Node 理论上没问题，但**没验过**。
