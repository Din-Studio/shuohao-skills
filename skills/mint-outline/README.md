# mint-outline v3

先确定故事，再整理重要事件与分集。原创无需改编表、人物来源、问题表或兑现分类。自然语言要求与一份本地创作指南取代策略配置。

- [使用流程与命令](SKILL.md)
- [创作指南](references/创作指南.md)
- [数据契约](references/schema.md) · [迁移说明](references/migration.md)
- [自有样例：旧站时刻](examples/旧站时刻-outline.json) · [迁移核对](examples/迁移核对.md)

Node 18+，仅标准库，可独立复制。支持 skeleton/beats/full、只读资产汇总、Markdown 与离线中英 HTML、下游本地接口检查。明确制作预算仍阻断，工具参考值仅提醒；结构检查不证明内容质量。

Developer-only self-tests: run scripts/selftest.mjs, scripts/fixes-selftest.mjs and scripts/migration-selftest.mjs with Node from a developer terminal. The main test includes isolated-copy verification. Cloud models use mint_skill as described in SKILL.md and do not run shell commands. Tests make no paid model calls; generated HTML is not versioned.
