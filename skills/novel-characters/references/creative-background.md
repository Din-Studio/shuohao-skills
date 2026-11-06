# 资产阶段创作背景与上游契约

## 本阶段只记录背景

从项目 `production.json.creative.selection` 读取 `genre` 和 `narrativeStyle` 的 ID、明确版本，作为创作背景展示。没有 production 或 creative 时说明未提供，不猜测题材或默认策略。

- 不读取任何本地或兄弟 skill 的 profile 文件。
- 不新增 profile 应用命令，不写 `creativeContext`，不生成 profile 摘要。
- `structure` / `pacing` 不属于资产阶段职责。完整 selection 的结构可以检查，但不解释这两个维度的规则。
- 本地 profile 缺失不影响资产阶段。项目选择的格式错误仍须修复，不能伪造已加载、已应用或来源已核验。
- 创作背景不是视觉正文。画风仍唯一来自 `production.style`；制作参数来自 `production.image`。已有有效参数不因背景变化被隐式替换。

## 接受的上游版本与字段

`seed` 只接受显式 `outline.schemaVersion: 2`。拒绝缺版本、旧版、未知版本、损坏或不可读上游。迁移见 [migration.md](migration.md)。

本地入口检查自己消费的投影：非空 source；characters/scenes 数组；稳定 C/S/P/B ID 与唯一性；角色 name/tier/from/role/arc；场景 name/primary 和可选 reusePlan；可选 props 的 name/function/beatIds；提供的 beats/episodes 的类型、节点 kind/position/setup/outcome、所属集与资产引用。未生成节点和分集的合法骨架可用于资产设计。本阶段不重复实现大纲策略、Q 计划和内容评审，不能声称已验证完整大纲。

`reusePlan` 是可选建议，一次性场景没有复用方案合法。`props[].beatIds` 可以引用 event/pressure/turn/payoff 任意节点，不限于兑现。引用不存在的节点仍失败。

## 检查结果

检查对象使用 `{ id, label, status, category, level, detail, reason? }`。
`status` 为 pass/fail/skipped；资产基础检查 `category=base, level=error`。不再输出检查用的 ok 布尔值。生成批次的成功计数不是检查对象。

- 缺少生产参数、原文或角色上游，仅跳过依赖该输入的检查，原因 missing-upstream。
- 没有道具等不适用项为 skipped / not-applicable。
- 提供损坏的生产参数、缺视觉正文、错误画幅或损坏上游均失败，不伪装成缺少上游。
- 出图必须提供合法视觉正文、模型、分辨率、资产比例；无 production 的历史报告可以读取，不代表可投产。
- 结构通过不等于内容评审通过。报告明确内容评审未执行。
- 无 profile 加载，所以不产生 policy-disabled 检查或策略通过项。

每个 skill 的本地脚本、指南、样例和测试可一起拷走。运行时没有兄弟代码或样例依赖。
