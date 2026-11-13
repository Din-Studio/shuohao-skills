---
name: mint-art
version: 3.0.0
description: |
  独立阅读原剧本，识别地点与物品，判断哪些需要美术资产，维护稳定 S/P 身份与来源。
  按任务需要完成场景、道具、复用与变体设计；场景物品整理完成后立即生图，交付 art v1、图片和报告。
  seed 仅生成骨架；语义识别由模型或人工完成。outline v5 仅提供故事背景，人物身份来自 cast v1。
  支持独立设计和历史资产显式迁移；登记身份不要求设计或出图。
  Use when asked to 美术设定、场景设定、道具设定、环境一致性、scene bible、prop sheet。
allowed-tools: read write edit bash grep find ls Read Write Edit Bash Glob Grep Task
triggers:
  - mint-art
  - 美术设定
  - 场景设定
  - 场景道具
  - 道具设定
  - 环境设定
  - scene bible
  - prop sheet
metadata:
  license: Apache-2.0
  requires:
    bins: [node]
  runtimes: [pi, claude-code, codex]
---

# mint-art

本 skill 的本地脚本自包含，Node 18+、标准库，无第三方 skill 或兄弟脚本依赖。本地脚本交付身份、设计、报告及离线计划，不调用生成网关；场景物品整理完成后，由执行 agent 立即衔接可用图片生成工具。没有生成工具时仍可完成本地工作，并明确图片未生成。

`{baseDir}` 是本文件所在目录。正式接口为 **art v1（kind: mint-art）**、可选 outline v5 故事背景、可选 cast v1 人物身份、可选 production v3 视觉正文和制作参数。旧 outline v3/v4 不再是资产权威；旧美术文件必须显式迁移。

开工阅读 [schema](references/schema.md)、[来源事实](references/source-facts.md)、[生命周期与迁移](references/migration.md)。需要设计时，再阅读 [场景](references/scene-pass.md)、[道具](references/prop-pass.md)、[真实感](references/realism.md)、[版面](references/sheet.md)。

## 阶段职责与顺序

完整流程固定为 **outline → characters → art → script → creation**。前序完成本次范围及交接后才能进入本阶段。项目级流程状态由调用方维护，不由独立 skill 代写；独立入口不证明前序完成，也不宣称联合制作通过。

- 原剧本是共同输入。独立回查，不从 outline 复制资产结论。
- outline v5 只提供故事、节点与分集背景，不分配 S/P ID。
- 人物归并、别名、同名不同人、匿名声音及非人主体由 characters 判断。本阶段不按名称猜测 C ID。
- 场次不是地点身份。同一空间的晨晚、闪回、清空状态不自动建立新地点。
- 提及物品不是建立道具的理由。记录建立或不建立的依据；物件交接、破损和修复通常是同一实物的状态。
- 原文事实写入 `facts/sourceRefs`；主场景、复用、变体、材质和光照补定属于本阶段制作决定，不能伪造原文证据。
- 身份、设计和媒体是三件事。`designStatus: none` 的已确认身份可以正式交付，不要求锚点、提示词、production 或图片。

## 第一步：读取输入与既有产物

先确定故事，再识别资产；故事未定不写分镜、不出图。

```bash
node {baseDir}/scripts/mint-art.mjs seed --source 原剧本.txt --title 剧名 --out art-draft.json
# 增量识别：完整保留已有 ID、设计、图片路径、预算及历史
node {baseDir}/scripts/mint-art.mjs seed --source 原剧本.txt --title 剧名 --existing old-art.json --out next-draft.json
# 可选背景及人物接口；已经提供但损坏、版本错误或来源不匹配会失败
node {baseDir}/scripts/mint-art.mjs seed --source 原剧本.txt --title 剧名 --outline outline-v5.json --cast cast-v1.json
# 保留独立原创设计入口；不得借此隐瞒已有原件
node {baseDir}/scripts/mint-art.mjs seed --design --title 原创空间 --out design-draft.json
```

seed 只计算文件身份、字节摘要和物理行数。资产数组、已读范围均为空；它不理解剧情、不标记读完。模型或人工必须实际读取原件，填写负责范围、身份、事实引用和取舍依据。路径相对所属 JSON，不相对进程目录；seed 输出绝对原件路径以支持 stdout 重定向。

已有产物增量识别先读取 `registry`。重排资产或新增剧集不能重分 ID。原件改版时只撤回关联身份的确认及该文档已读范围，不删除设计和媒体，不凭名称重新归并。

## 第二步：登记身份与来源

```bash
node {baseDir}/scripts/mint-art.mjs register art-draft.json --kind scene --key permanent-location-key --name 地点名称 --out registered.json
node {baseDir}/scripts/mint-art.mjs register registered.json --kind prop --key permanent-object-key --name 物件名称 --out registered-prop.json
```

登记后仍是待核验骨架。填写 `decision`、`sourceRefs`、`facts`、场景 `primary` 和实际需要的引用。未知身份保持待确认，不为了通过检查编造答案。不建立资产的线索可以写入 `observations`，保留来源及取舍理由。

涉及人物身份时提供 `carrierRefs: [{characterId,basis,sourceRefs}]` 并在核验、渲染和出图命令提供 `--cast`。旧 `carriedBy` 自由名称不能冒充确认关系。

```bash
node {baseDir}/scripts/mint-art.mjs identity-inputs registered-prop.json
```

此命令只打印当前身份输入摘要。人工或模型复读原件后，填写 `identityReview: {status:"confirmed", basis:"确认依据", inputDigest:"对应摘要"}`。完成本次负责范围后将顶层 `status` 改为 `ready`。写入摘要本身不是语义审核；脚本不自动批准。

明确预算保存在本产物 `budgets`。超额阻断；`reference` 参考值仅提醒。不要为了预算删除原文事实或假改主场景标记。

## 第三步：按需要设计

只登记身份时保持 `designStatus: none`。需要设计时标为 `planned`，按本目录指南填写 summary、锚点、光照或状态、尺度、英文提示词。`ready` 表示设计已具备出图条件，不表示图片已经生成。

画风只从 production v3 的 `style.scene` 读取，不内置风格、不搬入角色皮肤正文：
```bash
node {baseDir}/scripts/mint-art.mjs style --production production.json
```

production 中的 `creativeBrief` 是自然语言要求，不解析成规则。缺少 production 可以完成身份登记和独立设计核验，相关画风及画幅检查 skipped；已经提供的损坏 production 必须失败。图片计划需要完整 production，不提供默认模型。

自动驾驶只在明确授权范围内代作决定，决定写入交付说明。它不能跳过来源、预算、身份核验，不能自动扩大出图范围或重复付费。

## 第四步：核验与增量交接

```bash
node {baseDir}/scripts/mint-art.mjs validate art.json --outline outline-v5.json --cast cast-v1.json
node {baseDir}/scripts/mint-art.mjs checkup art.json
node {baseDir}/scripts/mint-art.mjs verify-sources art.json
node {baseDir}/scripts/mint-art.mjs reconcile candidate.json --previous old-art.json --out reconciled.json
node {baseDir}/scripts/mint-art.mjs validate reconciled.json --previous old-art.json
```

CLI 的 validate/checkup/render/images 都回查实际原件。缺原件、摘要或行数变化、引用越界、覆盖缺口必须失败；`--no-production` 不能关闭来源核验。`--verify-sources` 可兼容调用方，但不是启用来源核验所必需。

合并、拆分、纠正、删除须在 `registry.changes` 追加显式 from/to 映射、依据和来源。退休 ID 与 identityKey 永不复用；既有变更不能覆盖。增量基线摘要保存在本产物，不另建共享身份服务。reconcile 不自动理解或批准变更；受影响身份重新确认，未受影响身份不自动撤回确认。详见迁移文档。

## 第五步：整理完成后立即生图与报告

正式交付固定包含 `xxx.json`、`xxx-report.md`、`xxx-report.html` 三个文件。`xxx` 是同一份 JSON 去掉 `.json` 后的完整文件名；两份报告由该 JSON 渲染，并与它放在同一阶段目录。

场景、物品整理完成且通过上述核验后，立即导出本次范围的图片计划，并按 [媒体交接](references/media-handoff.md) 调用可用生图工具执行，不停在清单、提示词或离线计划交付，也不再次询问是否开始生图。用户明确要求仅登记身份、仅整理文本、仅预览或不出图时，遵从该限制。缺少 production、明确模型、生成工具或必要授权时，说明具体阻塞及“未生成”状态，不虚报完成。

```bash
node {baseDir}/scripts/mint-art.mjs images art.json --production production.json --only S01,P01 --out image-plan.json
node {baseDir}/scripts/mint-art.mjs render art.json --html > art-report.html
node {baseDir}/scripts/mint-art.mjs render art.json --md > art-report.md
```

images 只导出 `designStatus: ready` 的任务，按变体依赖排序。计划保留逐资产输入摘要；原件、事实和引用变更后重新核验受影响映射、工作单、提示词、素材路径和审核。执行方见 [媒体交接](references/media-handoff.md)。没有执行工具或没有授权时明确“未生成”。

报告默认中文，支持 `--lang en`；导出 JSON 保持输入原值，展示默认值和自动挂图不写回。报告包括身份决定、来源、审核状态、预算、生命周期与设计。结构/来源通过不等于语义忠实、图片审核或成片审核通过。

产物归 `<项目>/art/`，包括 JSON、Markdown、报告和 images。HTML 是可重新渲染产物，不进入版本控制。

汇报正式版本接口、本次范围、资产数、设计数、图片实际生成数、skipped 项和未决问题。不以局部范围冒称全剧完成，不以独立运行冒称完整流程通过。

## 自有样例与测试

先阅读 `examples/雨棚留言-故事提案.md`。本目录包含原剧本、v5 故事消费投影、v1 人物交接夹具、身份登记样例和独立设计样例；历史 v3/v4 仅用于显式迁移测试。不读取兄弟 skill 样例，不包含真实生成图片。

```bash
node {baseDir}/scripts/run-selftests.mjs
```

离线运行本阶段全部测试；无模型、凭据、网络、付费调用或失败累计日志。
