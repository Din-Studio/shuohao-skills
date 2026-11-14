# mint-outline v5

正式交付固定包含 `xxx.json`、`xxx-report.md`、`xxx-report.html` 三个文件。`xxx` 是同一份 JSON 去掉 `.json` 后的完整文件名；两份报告由该 JSON 渲染，并与它放在同一阶段目录。

仅解析已有剧本的故事、剧情节点、分集、问题回答、来源与必要连续性。不建立人物／地点／道具身份，不管理资产、预算或调度。未知结局不补写。

- [流程与命令](SKILL.md) · [数据契约](references/schema.md)
- [解析指南](references/创作指南.md) · [分块读取](references/volume-pass.md) · [分集并行派发](references/dispatch.md)
- [消费者与交接矩阵](references/handoff.md)
- 自有[剧本](examples/旧站时刻-script.txt)与[v5 样例](examples/旧站时刻-outline.json)

Node 18+，仅标准库，可以单独复制。全部命令只接受 schemaVersion 5，其他版本直接报错，不提供迁移或双读。

所有解析和修订强制派发独立 subagent，主会话不阅读原文，不保留小体量串行或无法派发时同会话代做的回退。每个调用累计最多接触 4 集原文，含前情、检索和回读；2 集及以上至少拆成 2 批并发，只有 1 集仍由独立读取者与核验者完成。串联者以提取结果为主，必要时按需求读取特定集数的剧本，每次调用累计最多接触 4 集原文；超限需求另派独立证据任务。

每集一份 Markdown 时，按 source-folder → plan-batches → 并行读取 → merge → 串联 → 核验 → publish 首次生成。plan-batches 将 60 集分成 15 批；merge 拒绝超过 4 集的 fragment。已有 outline 采用并行定向修订与核验，保持 B/Q ID，不重新 merge。单文件多集按集界与原件行范围分派。正式产物仍只有一份 outline；运行时读取纪律和命令的保证范围见派发指南。

--verify-sources 实际读取原件；默认来源核验为 skipped。来源版本核验、语义忠实审核与制作审核分别报告。

执行 `node scripts/selftest.mjs` 运行全部本阶段测试及独立复制回归。测试不调用付费模型，不提交生成 HTML。
