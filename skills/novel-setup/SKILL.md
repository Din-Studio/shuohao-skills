---
name: novel-setup
version: 3.0.0
description: |
  给 AI 短剧定生产参数：资产图模型、分辨率档位与比例，视频模型、画幅与档位，
  以及画风、报告界面语言、提示词语言和自动驾驶 autopilot。
  一次写入工作目录根的 production.json，五个创作 skill 向上查找并遵循。
  资产图是横构图或方形的设定表，与成片画幅独立；视频直接挂载已有设定图。
  画风没有内置类型或默认值，由用户填写角色与环境两块正文。
  9 道检查（含 v3 契约）全部由脚本检查。分辨率与比例直接使用 模型枚举档位，生成前按实时 schema 核对，不折算像素。
  成片画幅没有默认值，必须显式指定。本 skill 不调用模型，不出图，不下单。
  Use when asked to 定参数、配置画幅、竖屏还是横屏、出图分辨率、视频参数、production setup for AI short drama。
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
      - node
  runtimes:
    - pi
    - claude-code
    - codex
---

## v3 创作契约与迁移

production 使用 `schemaVersion: 3`。通过 `init --creative-brief "正文"` 收集可选的自然语言创作要求。提供时必须非空，不解析为枚举、规则或模型参数。show 展示要求，resolve 原样返回 creativeBrief；不要求选择策略。

检查对象统一为 `status: pass/fail/skipped + category + level`，不再输出 ok 布尔值。跳过不计为通过。内容评审未执行时明确说明。开工前阅读 [契约](references/creative-brief.md) 和 [迁移说明](references/migration.md)。

## novel-setup

管线的第 0 段。先统一技术参数，再进行创作。

`{baseDir}` 是本文件所在目录。脚本为 `{baseDir}/scripts/novel-setup.mjs`，Node 18+，只使用标准库，无 npm 依赖。

**边界**：不写故事、不出图、不下单。角色与美术阶段生成设定图，视频创作阶段直接挂载设定图生成视频。集数、时长属于大纲阶段；创作方向只记录自然语言要求，不在本阶段创作故事。

### Step 0 — 确认要求

三项技术要求必须确认：

1. **成片画幅**：例如 `9:16` 或 `16:9`。没有默认值，猜错会导致视频重出。
2. **视频模型与档位**：读取已安装 ly-video，执行其 `models` 与 `models --model <ID>` 查看实时模型和档位；本地 `caps` 只提供历史快照。
3. **画风**：确认名字与具体质感要求。没有预设选项或默认画风；真人实拍、手绘、水墨、黏土定格都可以。

另收集可选的 **creativeBrief**：请用户直接描述想要的作品与不希望的处理。没有额外要求就省略；不追问策略名称或版本，不自动推导规则。要求变化后明确提示下游内容需要重新评审。

生图模型默认 `nanobanana2`，资产图默认 `2K`、`16:9`。资产图是设定表，成片竖屏不要求设定图也竖屏。

自动驾驶默认关闭。用户明确要求全自动时添加 `--autopilot`。它只影响下游五个创作 skill，不免除本阶段的要求确认。

### Step 1 — 检查模型能力

```bash
node {baseDir}/scripts/novel-setup.mjs caps
node {baseDir}/scripts/novel-setup.mjs caps --model "MiniMax H3"
```

模型能力表保留历史采集来源与 UUID，只做离线检查。表外模型明确跳过能力检查。生成前通过已安装 ly-image / ly-video 的 models --model 查询实时 schema，不把快照当成当前能力。

**资产图与视频分别检查**：`nanobanana2` 不接受 `4:3` 资产图，不代表视频不能选择 `4:3`。`image-2` 的 `4K` 资产图只接受 `16:9` / `9:16`。

### Step 2 — 创建参数文件

```bash
node {baseDir}/scripts/novel-setup.mjs init --aspect 9:16 \
  --source <剧名> --video-model "MiniMax H3" --video-resolution 768p \
  > <工作目录>/production.json
```

可选参数：`--creative-brief "正文"`、`--autopilot`、`--asset-resolution`、`--asset-aspect`、`--image-model`、`--lang`、`--prompt-lang`、`--style <style.json>`。

`--aspect` 只设置视频画幅。文件必须位于工作目录根，下游从自己的产物目录向上最多 5 层查找。

### Step 3 — 填写画风

先阅读 `{baseDir}/references/schema.md`，再获取空骨架：

```bash
node {baseDir}/scripts/novel-setup.mjs style-template
```

没有传入 `--style` 时，`init` 留下空骨架，不能直接通过校验。

| 字段 | 内容 |
| --- | --- |
| `label.zh` / `label.en` | 中文名必填，英文名可留空 |
| `phrase` | 英文画风短语，视频提示词按模型指南使用 |
| `character` | `render` / `surface` / `lighting` / `negative` / `tags` |
| `scene` | `render` / `surface` / `negative` / `tags` |

正文填写英文，供下游原样进入提示词。`label` 是展示名称。

- **角色与环境分别写**：皮肤、眼睛、布料质感不能直接搬成环境材质说明。
- **换画风必须整套更换**：不要留下上一套的反向提示词。
- **正反向不能冲突**：正向要求的完整短语不能同时出现在 `negative` 中。
- **保留画风短语**：Seedance 指南使用 `style.phrase` 补充风格约束；它不再是关键帧提示词的必带字段。

### Step 4 — 校验

```bash
node {baseDir}/scripts/novel-setup.mjs validate <工作目录>/production.json
node {baseDir}/scripts/novel-setup.mjs checkup <工作目录>/production.json
```

9 道检查（含 v3 契约）：数据版本与创作要求、字段与枚举、比例写法、资产图横构图或方形、分辨率已填、视频模型参数、生图模型参数、画风完整、画风不矛盾。有违规先修正，再重跑直到通过。

视频采用固定 `W:H` 画幅，不接受 `adaptive`，避免逐段比例变化。资产图比例不要求等于视频比例。

### Step 5 — 汇报与交付

```bash
node {baseDir}/scripts/novel-setup.mjs show <工作目录>/production.json
```

汇报模型、资产图档位与比例、视频档位与画幅、画风名称、语言、自动驾驶状态、文件路径及跳过的检查。不生成 HTML 报告。

```
<工作目录>/
├── production.json
├── outline/
├── characters/
├── art/
├── script/
└── creation/
```

## 下游契约

详细规则见 `{baseDir}/references/contract.md`。

- 下游直接读取 JSON，不 import 本 skill 的代码，始终可以单独拷走。
- 找不到参数文件时明确说明跳过的检查；画风没有内置默认值。
- `lang` 的优先级为命令行、产物 JSON、生产参数、默认中文。提示词语言按视频创作阶段的模型规则解析。
- `autopilot` 只认布尔值 `true`。开启后不等待逐步审批，但质量门、费用预估和失败止损仍然生效。
- 每个创作阶段的产物归自己的目录，根目录只存生产参数。

```bash
node {baseDir}/scripts/novel-setup.mjs resolve --for characters
node {baseDir}/scripts/novel-setup.mjs resolve --for art
node {baseDir}/scripts/novel-setup.mjs resolve --for video
node {baseDir}/scripts/novel-setup.mjs duration 12.5 --model "MiniMax H3"
```

`resolve` 输出结构化 `inputData`。出图时补充提示词与参考图 URL；视频还要补充逐段时长。分辨率与比例是枚举值，不写入提示词作为像素指令。模型专属字段由下单阶段按模型 schema 补充。

## 自测与样例

```bash
node {baseDir}/scripts/selftest.mjs
node {baseDir}/scripts/migration-selftest.mjs
node {baseDir}/scripts/upstream-selftest.mjs
```

离线自测覆盖全部质量门，不调用模型、不访问网络、不花额度。

- `examples/回南天-production.json`：竖屏、真人实拍、2K 资产图、英文提示词、自动驾驶关闭。
- `examples/雪线-production.json`：横屏、手绘动画、4K 资产图、中文提示词、自动驾驶开启。

样例展示有效参数组合，不是画风选项列表。旧文件中的 `image.frame` 不再读取或校验；新文件不生成该字段。`style.phrase` 仍用于视频提示词指南。
