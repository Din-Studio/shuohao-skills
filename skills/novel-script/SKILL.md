---
name: novel-script
version: 2.0.0
description: |
  把分集故事写成结构化场次与节拍流。支持独立创作或 outline v2 严格投影，
  按稳定节点 ID 认领核心表现范围，核对开场、集尾和上游目标时长。
  题材、叙事风格、结构、节奏通过本地 profiles 显式选择；不预设密集兑现。
  输出 JSON、Markdown、离线中英报告。剧本不分镜、不出图、不调用付费模型。
  Use when asked to 写剧本、台词、场次、写戏、screenwriting、script。
allowed-tools: read write edit bash grep find ls Read Write Edit Bash Glob Grep Task
triggers:
  - novel-script
  - 剧本
  - 写剧本
  - 台词
  - screenplay
metadata:
  license: Apache-2.0
  requires:
    bins: [node]
  runtimes: [pi, claude-code, codex]
---

# novel-script v2

剧本负责人物行为和表达。分镜、镜号、镜头节奏、模型提示词、参考图和生成调度属于视频创作阶段。本 skill 自包含，只交换项目 JSON，不 import 兄弟代码，不读取兄弟样例或第三方 skill。

`{baseDir}` 为本文件所在目录。Node 18+，标准库，无安装依赖。

## 1. 输入与创作选择

读取工作目录的 `production.json`，或明确声明独立模式。已有项目没有 creative 时不偷偷套用新策略。新项目需确认四维选择；自动驾驶可以代为决定，但必须逐项汇报。画幅、画风和题材不自动决定节奏。

读取本地 [schema.md](references/schema.md)、[script-pass.md](references/script-pass.md)、[review-core.md](references/review-core.md) 和 [profile-contract.md](references/profile-contract.md)。

有上游时读取 outline v2、可选 art/cast。没有上游也可以创作，不要求安装其他 skill；明确哪些对账无法执行。提供损坏或不支持版本的上游必须失败，不能伪装成缺少上游。

```bash
node {baseDir}/scripts/novel-script.mjs profiles
node {baseDir}/scripts/novel-script.mjs profile --selection selection.json
```

四维全部加载本地匹配版本与指南。不能以相近 profile 替代缺失文件。来源漂移时停止继续创作：恢复原文件，或明确升级选择与版本。历史校验可以按已有有效参数运行，但必须展示来源提醒。

## 2. 建立骨架并显式应用

所有正式产物放入 `<工作目录>/script/`。JSON 是唯一编辑源，Markdown/HTML 是派生视图。

```bash
mkdir -p <工作目录>/script
node {baseDir}/scripts/novel-script.mjs seed outline.json --eps 1-3 > <工作目录>/script/作品-script.json
node {baseDir}/scripts/novel-script.mjs apply-profile <工作目录>/script/作品-script.json --production <工作目录>/production.json
# 审阅预览、冲突、旧覆盖和手工差异，再显式决定：
node {baseDir}/scripts/novel-script.mjs apply-profile <工作目录>/script/作品-script.json --production <工作目录>/production.json --decisions decisions.json --confirm
```

独立模式以 `--selection selection.json` 代替 `--production`。没有 outline 时按 schema 手建骨架：集数和目标时长明确，场次为空，两个位置为 null，未规划上游节点时 beatClaims 为空数组。不伪造上游。

seed 逐字复制 opening 与 ending.mode/event，只按 ID 复制 beatClaims，绝不复制 Q。位置为 null，scenes 为空。seed 不冒充已应用策略，不复制大纲规则或来源摘要。

应用从中性规则重建，非策略估时参数保持不变。旧覆盖必须选择保留、放弃或重新填写，不能隐式沿用。模块备份并原子写入。确认应用后 CLI 重检本地完整契约；骨架会显示未完成。另运行 `validate --stage skeleton` 只检查骨架阶段。应用不重写故事。

## 3. 逐批写戏

每批最多 3 集。顺序衔接；只有边界状态和跨批承诺明确时才并发。没有子代理时在当前会话顺序完成。

先确定故事，再安排节点，再写场次。读取上游事件 setup/outcome、实际结尾方式和人物状态。flow 是动作与台词的有序序列，不要求机械交替，不强制每场动作数量或连续台词数量。

- 每个上游节点分别认领。核心段按大纲顺序排列、两端包含、互不重叠。
- 共同铺垫可以在核心段之外；核心段允许同集跨场次。
- openingBeat 是有效坐标。endBeat 必须指向最后一拍。
- opening/ending 是计划投影，不能在剧本中同义改写后冒充已对账。正文可以换表达。
- 上游需要改动时先修订计划，再重新投影。不要通过改标签伪造节点落地。

时长估算不等于真实表演。压缩先处理重复表达、无效过渡和不影响因果的动作，保护证据、人物选择与结果。仍无法容纳则返回大纲调整事件或时长。不执行“写超先删除动作”，不要求开场运动或结尾悬念。

## 4. 基础检查、策略检查与内容评审

```bash
node {baseDir}/scripts/novel-script.mjs validate <工作目录>/script/作品-script.json --outline outline.json --art art.json --production <工作目录>/production.json
node {baseDir}/scripts/novel-script.mjs checkup <工作目录>/script/作品-script.json --outline outline.json --json
```

基础失败或 error 策略失败返回非零。warn 未满足是提醒，不是通过。off 是 skipped/policy-disabled。缺上游是 skipped/missing-upstream，与关闭规则分开。基础引用、位置、ID、节点范围与目标时长不能通过策略关闭。

接着按 review-core 与已加载的策略指南评审。引用具体分集、节点、坐标和台词。检查人物动机、因果、信息、节奏、跨批状态与开场集尾的实际表达。Q 由大纲管理；剧本报告按 ep 与 resolves/beatClaims 展示回答位置，不建立第二份问题表。

内容评审材料放当前工作记录或 `.work/`。不保存永久分数、爆款概率或门失败历史。自动检查不会宣布内容评审通过。

## 5. 渲染与交付

```bash
node {baseDir}/scripts/novel-script.mjs render <工作目录>/script/作品-script.json --md --outline outline.json > <工作目录>/script/作品-script.md
node {baseDir}/scripts/novel-script.mjs render <工作目录>/script/作品-script.json --html --outline outline.json --art art.json --cast cast.json > <工作目录>/script/script-report.html
# 英文界面增加 --lang en
```

报告先展示作品承诺、选择快照、有效参数、覆盖与来源，再展示正文、逐拍估算轴、节点计划与实际核心段、Q 回答落点、资产、台词本及检查状态。导出不修改原始 JSON，不写入默认值或评审结论。HTML 不进版本控制。

汇报集数、场次、句数、估时、阻断失败、提醒、跳过项、内容评审状态和产物路径。无 outline 不宣称节点与全剧结局已对账；无 production 不宣称项目选择一致。显式应用后，CLI 自动读取项目中唯一的已知上游，并检查已知 creation 的版本、选择、集号、开场／集尾及实际节拍覆盖；损坏或过期输入返回非零。完整联合交付仍须 creation 自身的模型能力、资产与内容检查。本阶段不 import 下游校验器，也不擅自修改其文件。

## 自动驾驶

仅 `production.autopilot === true` 生效。审批权转移，不取消策略确认记录、结构检查、内容评审或止损。批次照旧，逐项决定写入汇报。不调用付费模型。

## 自有样例与自测

先阅读 [故事提案](examples/故事提案.md)。《修伞簿》三个修补单元，前两集没有 payoff，普通集 closure，最终 open，不凭纹路认亲。所有上游 fixture 均在 examples 内本地编写。

```bash
node {baseDir}/scripts/selftest.mjs
```

样例与测试不依赖兄弟目录。旧数据按 [迁移指南](references/migration.md) 人工确认后迁移；v1 不再运行时双读。
