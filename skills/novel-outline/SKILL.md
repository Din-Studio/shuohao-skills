---
name: novel-outline
version: 2.0.0
description: |
  创作或改编故事大纲：作品承诺、改编说明、人物与资产、稳定 ID 剧情节点、分集梗概。
  创作策略通过本地 references 显式选择与应用，不默认密集兑现、悬念集尾或终局胜利。
  输出 schemaVersion 2 JSON、Markdown 和离线中英报告；支持分卷、分阶段检查、体检与迁移。
  自动驾驶转移审批权，不取消检查、来源核验和内容评审。
  Use when asked to 改编大纲、短剧大纲、拆大纲、原创大纲、小说转短剧、adaptation outline。
allowed-tools: read write edit bash grep find ls Read Write Edit Bash Glob Grep Task
triggers:
  - novel-outline
  - 改编大纲
  - 短剧大纲
  - 大纲体检
  - adaptation outline
metadata:
  license: Apache-2.0
  requires:
    bins: [node]
  runtimes: [pi, claude-code, codex]
---

# novel-outline

`{baseDir}` 为本文件目录。脚本是 `{baseDir}/scripts/novel-outline.mjs`，Node 18+ 标准库，无第三方 skill 依赖。所有交付位于 `<工作目录>/outline/`；临时分卷与评审材料位于其中的 `.work/`。JSON 是唯一编辑源，Markdown/HTML 不反向编辑。HTML 不进入版本控制。

## 职责与边界

组织重要事件，不写完整剧本台词、不做分镜、不生成图片。保留改编证据、角色来源与分档、场景和道具。资产汇总必须由 `assets` 计算，不另建顶层手写清单。画幅不能推导节奏，题材标签不能触发代码分支。视觉正文仍来自 production.style，不由创作 profile 替代。

## 1. 确认材料、参数与选择

读取实际输入；不可凭书名脑补。确认总集数、每集分钟、作品题材描述、原创/忠实/抽核/借壳与用户偏好。角色清单可以从已有项目 JSON 获取，但运行不依赖其他 skill 安装。

读取项目根 production.json；不存在时明确独立运行。损坏或不支持的配置不能当作不存在。autopilot 仅在严格布尔 true 时开启：自行作出有依据的选择并逐项汇报，不等待审批，但不跳过检查和评审。

读取本地 [schema](references/schema.md)、[策略契约](references/profile-contract.md)、[通用评审](references/review-core.md)。四维选择来自 production.creative.selection；独立模式显式提供完整 selection 文件。既有项目缺少 creative 不自动套入新策略。新创作先建议并确认四维组合，不能隐式默认密集兑现。

```bash
node {baseDir}/scripts/novel-outline.mjs profiles
node {baseDir}/scripts/novel-outline.mjs profile --selection selection.json
node {baseDir}/scripts/novel-outline.mjs apply-profile outline.json --production ../production.json
# 独立模式改为 --selection selection.json
# 确认预览中每项差异后：
node {baseDir}/scripts/novel-outline.mjs apply-profile outline.json --production ../production.json --decisions decisions.json --confirm
```

读取四个实际加载的指南。所有注册规则整体从中性基线重建；旧覆盖不能自动沿用。需要覆盖时提交完整规则对象，路径见策略契约。应用会备份并原子写入；validate/render 不重新应用。相同版本摘要漂移禁止继续创作：恢复来源，或建立新版本并更新选择后重新应用。缺少本地来源可历史读取，但不能宣称来源已核验。

## 2. 长文本分卷

短篇或已经完整读过原文可跳过。其余按 [分卷指南](references/volume-pass.md)：

```bash
node {baseDir}/scripts/novel-outline.mjs chunk book.txt outline/.work --per-volume 15
```

优先章节切分，否则按字数并带重叠切分。最多 60 卷；truncated 必须汇报，不冒称全文覆盖。有子代理可分卷并发，没有则串行。逐字证据保留原语言，明确材料缺口。

## 3. 先确立故事，再建立骨架

读取 [骨架指南](references/outline-pass.md)。先确认处境、贯穿线索、观众期待和结束意义，再写节点。原创明确声明原创，不伪造原作证据。群像、单元故事与开放结局都合法。

先写 story、adaptation、characters、scenes、可选 props 和有效 params，执行 skeleton。然后加入 beats、endingBeatId 与可选 arcs，执行 beats：

```bash
node {baseDir}/scripts/novel-outline.mjs validate outline.json --stage skeleton
node {baseDir}/scripts/novel-outline.mjs validate outline.json --stage beats
```

快版确认作品承诺、保留/砍掉/合并决定、主要节点与结束位置。用户确认后细化；自动驾驶自行审查并记录决定。阶段通过不等于完整交付通过。

## 4. 分批写作

按 [分集指南](references/episode-pass.md)，每批最多 10 集。默认顺序衔接，传入此前状态、已知信息、未解决问题与后续承诺；只有这些边界明确才并发。

节点所属集号只在 beats[].episode 保存。每集使用 opening/synopsis/ending，禁止继续写 hook/suspense/crowdPlan。仅主要集尾问题进入 Q 计划；required 必须由后续唯一节点解决。默认期限仅用于新建问题，不重写旧问题。sceneIds/characterIds/propIds 只引用已登记资产，人数不等于同框人数。

## 5. 检查与内容评审

```bash
node {baseDir}/scripts/novel-outline.mjs validate outline.json
node {baseDir}/scripts/novel-outline.mjs checkup outline.json --json
```

基础错误与 error 策略失败阻断；warn 是提醒，不算通过；off 是 policy-disabled 跳过。缺少上游、阶段不完整和不适用分别汇报。制作风险扫描仅提示，不因关键词强迫情节变化。

完整检查后，按 review-core 与四份策略指南进行内容评审，引用具体集号/节点。检查因果、证据、角色选择、重复计数和跨批次状态；不能以字符串不同证明推进，不能以 ID 存在证明事件成立。评审材料存放当前 .work，不新增失败累积日志或永久总分。

切换策略后重新检查本阶段、项目选择和已知 script/creation JSON。CLI 重新检查当前产物，并执行已知下游 JSON 的本地接口检查（版本、选择、集号、目标时长与节点认领），发现失效项返回非零。下游完整规则、制作技术及表达校验由各自阶段执行；未执行时应用流程仍未完成，不得宣称联合通过。事件删除或改写必须同步下游认领，不能无差别重编号。

## 6. 交付与报告

```bash
node {baseDir}/scripts/novel-outline.mjs render outline.json --md > outline.md
node {baseDir}/scripts/novel-outline.mjs render outline.json --html > outline-report.html
node {baseDir}/scripts/novel-outline.mjs render outline.json --html --lang en > outline-report.en.html
node {baseDir}/scripts/novel-outline.mjs assets outline.json
```

语言顺序：--lang > 文档 lang > production.lang > zh。只翻译界面，故事原文保持。报告优先作品承诺与当前有效配置，不以兑现密度作为所有作品首页指标。展示节点、分集、阶段、证据、资产矩阵、来源和检查分类。导出 JSON 与输入值一致，不补默认值或评审结论。

汇报路径、检查阶段、阻断项/提醒/跳过原因、来源状态、项目对账状态和内容评审是否执行。只有 full 无阻断项才能交付完整本地大纲；独立零退出码不证明联合交付。

## 迁移与样例

v1 缺版本数据明确拒绝，见 [迁移指南](references/migration.md)。不能只重命名旧字段。

自有样例 [旧站时刻](examples/旧站时刻-outline.json) 先有 [故事提案](examples/故事提案.md)，展示渐进累积、无兑现分集、非最终收束、非兑现最终节点和有理由的开放问题。不会借用兄弟正式样例。

```bash
node {baseDir}/scripts/selftest.mjs
```
