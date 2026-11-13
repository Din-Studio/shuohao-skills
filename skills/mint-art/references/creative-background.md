# 资产阶段创作要求与上游契约

## 自然语言要求

读取 `production.creativeBrief` 原文作为背景。提供时必须是非空字符串，不解析成规则、分类或模型参数。省略时不显示空配置区，不推断默认要求。资产 JSON 不保存要求副本。

production 必须包含 `schemaVersion: 3`。拒绝旧 creative/creativeContext、selection/decisions/overrides、params.rules/defaults/preferences，并指向显式迁移。创作要求不是视觉正文：画风仍唯一来自 production.style，制作参数来自 production.image。要求变化后由 Agent 评审受影响设计，不自动改变技术参数。

## outline v4 与历史 v3 消费投影

seed 接受 `outline.schemaVersion: 4`，并兼容显式 v3 历史资产投影。v4 的 sourceRefs、notes 与来源文件版本必须核验，详见 [来源事实](source-facts.md)。检查自己消费的字段，不声称已验证完整大纲：

- source 非空；characters/scenes 数组。
- C/S/P/B ID 合法且唯一；角色 name/tier、场景 name/primary、道具 name/function。
- characters.from、arc、role 可以省略。提供时检查类型；from 是非空字符串元素组成的数组。
- scenes.reusePlan、props、props.beatIds、beats、episodes 按消费需要提供。未完成节点和分集的骨架可以用于资产设计。
- 节点必须有 id/episode/setup/outcome；kind、position 可选，提供时检查合法枚举。weight 仅 kind=payoff 时允许，仍可省略。
- 节点集号不递减；已提供的集数与分集、资产引用及道具 beatIds 必须一致。未分类节点照常按 B ID 引用。
- 拒绝旧 beats.type、story.drive、adaptation.core、episodes.stateChange 及创作配置，不静默忽略。
- 不重复实现大纲 Q 回收、完整叙事契约与内容评审。

seed 保留道具 usage.beatIds，usage.beats 的阅读文本来自节点 outcome。场景 usage.beats 仅展示其出现集中的节点结果，不证明事件发生在该场景；不凭同集出现伪造精确事件关联。缺少 from/arc 不妨碍角色骨架生成；角色卡成品仍遵循自身原输出协议。

## 技术检查与独立运行

检查对象为 status=pass/fail/skipped、category=base、level=error。缺少 production/原文/角色上游只跳过依赖项（missing-upstream），不适用项单列 not-applicable。提供损坏或不可读上游必须失败，不当作缺失。出图仍须完整视觉正文、模型、分辨率、资产比例。

结构通过不等于内容评审通过。报告明确内容评审未执行；导出 JSON 不增加要求副本或统计。资产输出、参考图身份顺序及媒体计划协议不变。

本 skill 的脚本、指南、样例和测试可整体独立复制，不读取兄弟目录。迁移说明见 [migration.md](migration.md)。
