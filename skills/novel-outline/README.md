# novel-outline v3

先确定故事，再整理重要事件与分集。原创无需改编表、人物来源、问题表或兑现分类。自然语言要求与一份本地创作指南取代策略配置。

- [使用流程与命令](SKILL.md)
- [创作指南](references/创作指南.md)
- [数据契约](references/schema.md) · [迁移说明](references/migration.md)
- [自有样例：旧站时刻](examples/旧站时刻-outline.json) · [迁移核对](examples/迁移核对.md)

Node 18+，仅标准库，可独立复制。支持 skeleton/beats/full、只读资产汇总、Markdown 与离线中英 HTML、下游本地接口检查。明确制作预算仍阻断，工具参考值仅提醒；结构检查不证明内容质量。

自测：通过 node 执行 scripts/selftest.mjs、scripts/fixes-selftest.mjs、scripts/migration-selftest.mjs。主入口包含独立复制验证。不调用付费模型，不提交生成 HTML。
