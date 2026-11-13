# 显式迁移与证据保存

正式运行要求 v4；不能只改版本号。旧创作大纲不自动成为剧本解析，缺少来源证据时必须人工补全。

## v2／v3 → v4 待核验草稿

```bash
node scripts/mint-outline.mjs migrate-v4 INPUT
node scripts/mint-outline.mjs migrate-v4 INPUT --out outline/.work/v4-draft.json --confirm
```

默认只预览。指定 --out 但不 --confirm 不写入并退出 1。--confirm 只确认保存保守草稿，不代表证据完整或语义批准。成功写入仍标记 status=pending-evidence；正式 validate 会拒绝没有 provenance/sourceRefs 的草稿。

输出独占创建，禁止覆盖输入、目标或旁路文件，不跟随输入符号链接。创建 OUTPUT、OUTPUT.legacy-backup（原始字节）、OUTPUT.review（完整 original、preserved 原值及待办）。原件不变。写入失败只删除本次已成功创建的文件，不删除并发作者文件。三文件并非跨文件事务；中断后人工检查残留，再决定处理。

- 删除的 adaptation（包括逐字 evidence、有效限制和历史取舍）、arcs、复用方案、规划参数、事件标签、Q 兑现规划全部保存在 review.original/preserved，不能直接丢弃。
- story 现有 premise/throughline/ending 原句拼接为 summary；原始分栏和 audiencePromise 仍在报告中。不声称这些句子已有剧本证据。
- 稳定 C/S/P/B/Q ID、分集、事件、用户预算、tier/primary 保持。endingBeatId 暂不迁入正式字段，需确认真实全剧末尾后恢复。
- 不制造 provenance、行号、阅读覆盖、总集数或 targetSeconds。历史分钟数仍在报告中，不能自动充当 script 已确认执行目标。
- 人工逐项对照原剧本，将有效限制迁入有出处 notes 或项目要求；历史改编决定不是源事实。本地 creativeBrief 接入项目时先人工合并至 production，再删除副本。
- 补全范围与出处后执行 verify-sources、结构检查和独立来源／正文核验。没有可提供剧本时，保留历史文档，不把创作材料伪装成 v4 生产输入。

## 历史 v2 → v3

migrate-v3 INPUT [--out OUTPUT] [--confirm] 保留，用于历史数据修复，不是生产入口。它保守合并 drive/core/type/stateChange 和旧要求，保留原文 evidence 与明确 Q 承诺；输出原字节 .v2-backup 及 .review。历史校验隔离于 legacy-v3-core.mjs，只供迁移使用。v3 输出仍需迁入 v4 并人工建立真实剧本证据。

未知版本或损坏结构不能自动修饰。先处理项目要求，再迁移解析和正文，最后由各阶段执行本地完整检查。本 skill 不迁移兄弟产物，不调用模型。
