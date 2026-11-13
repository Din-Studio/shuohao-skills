# 资产阶段对接 v4 与历史 v3

## 当前 v4 输入

outline v4 移除改编规划、固定分钟数与 reusePlan，保留 tier、primary、稳定资产 ID 和来源证据。CLI seed 核验原文版本与范围，并将必要 sourceRefs／notes 放入 sourceFacts；设计字段不冒称源事实。详见 [来源事实与制作补定](source-facts.md)。资产与媒体计划输出协议不变。运行 `scripts/v4-selftest.mjs` 验证当前投影。

## 历史 v3 输入

以下仅说明保留的 v3 消费兼容，不表示 v3 已升级成来源可核验的解析结果。

本次只升级上游消费契约。art.json 输出、图片提示词、参考图、媒体计划与导出协议不变，不为统一数字强加输出版本。

1. 备份现有输入。production 与 outline 必须明确为 schemaVersion: 3；仅改数字不算迁移。
2. production 的旧 creative 通过其生产者的显式 migrate-v3 入口迁移，或人工移入备份并整理为可选非空 creativeBrief。保留完整 style/image/video 与原有技术限制。
3. outline 的 story.drive、adaptation.core、beats.type、episodes.stateChange 中独有内容须先合并进对应故事正文或节点 setup/outcome；params.preferences 合并到唯一创作要求。保留 B/C/S/P ID、集数、道具引用与逐字 evidence。旧策略和明确覆盖逐项审阅，不能静默删除。
4. 原创不需要 from、arc、adaptation、audiencePromise 或节点分类。允许省略 kind/position；weight 仅 kind=payoff 时允许且仍可省略。
5. seed 只检查本地消费投影，不提供全大纲迁移工具，也不替代大纲内容评审。完整旧大纲应由作者或其生产者完成语义迁移后再输入。独立运行不需要安装其他 skill。
6. 未分类节点照常交接，道具 usage.beatIds 原样保留，阅读文本改从节点 outcome 获取。不得凭同集出现补造精确关联。
7. 缺 production 可以生成历史报告并标记未对账；存在损坏 production 则失败。出图不能缺少合法视觉正文和制作参数。
8. 本地样例为《雨棚留言》，examples/雨棚留言-outline-v3.json 仅是消费投影夹具，不是完整大纲交付。资产成品、原文和证据没有重写。

重新运行 scripts/selftest.mjs、scripts/contracts-selftest.mjs、scripts/upstream-selftest.mjs、scripts/media-plan-selftest.mjs 和 scripts/v3-selftest.mjs。所有测试均离线，不执行付费调用。内容评审与全项目交接另外检查，结构通过不代表创作要求已经重新评审。

详见 [creative-background.md](creative-background.md)。
