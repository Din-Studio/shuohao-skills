# mint-outline v5

正式交付固定包含 `xxx.json`、`xxx-report.md`、`xxx-report.html` 三个文件。`xxx` 是同一份 JSON 去掉 `.json` 后的完整文件名；两份报告由该 JSON 渲染，并与它放在同一阶段目录。

仅解析已有剧本的故事、剧情节点、分集、问题回答、来源与必要连续性。不建立人物／地点／道具身份，不管理资产、预算或调度。未知结局不补写。

- [流程与命令](SKILL.md) · [数据契约](references/schema.md)
- [解析指南](references/创作指南.md) · [分块读取](references/volume-pass.md)
- [显式迁移与材料形状](references/migration.md) · [版本及交接矩阵](references/handoff.md)
- 自有[剧本](examples/旧站时刻-script.txt)与[v5 样例](examples/旧站时刻-outline.json)

Node 18+，仅标准库，可以单独复制。正式入口仅接受 v5。assets 命令及资产报告已移除。v4 必须显式 migrate-v5；保留原件与全部旧关系、明确预算，导出 .migration.json 待核验材料，不冒充已审核资产。

--verify-sources 实际读取原件；默认来源核验为 skipped。来源版本核验、语义忠实审核与制作审核分别报告。

执行 `node scripts/selftest.mjs` 运行全部本阶段测试及独立复制回归。测试不调用付费模型，不提交生成 HTML。
