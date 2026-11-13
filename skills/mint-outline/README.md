# mint-outline v4

只解析已有剧本。拒绝小说、大纲与原创创作入口。保存来源版本、行范围、覆盖、对象身份、重要事件及必要连续性事实；不补写未知结局，不推定制作时长。

- [流程与命令](SKILL.md) · [解析指南](references/创作指南.md)
- [数据契约](references/schema.md) · [分块读取](references/volume-pass.md) · [显式迁移](references/migration.md)
- 自有[剧本](examples/旧站时刻-script.txt)与[解析样例](examples/旧站时刻-outline.json)

Node 18+，仅标准库，可单独复制。schemaVersion 4 支持部分来源与未解问题。--verify-sources 实际读取原件，默认校验仅检查结构。来源身份核验、语义忠实核验与制作审核分别报告，不互相替代。明确预算仍阻断，参考值仅提醒。

通过 node 执行 scripts/selftest.mjs（包含其他自测及独立复制），或分别执行 scripts/fixes-selftest.mjs、scripts/migration-selftest.mjs、scripts/fusion-selftest.mjs。不调用付费模型，不提交生成 HTML。
