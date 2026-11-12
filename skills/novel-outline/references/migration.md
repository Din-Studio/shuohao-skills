# v2 → v3 显式迁移

正式运行不接受 v2 或旧配置字段。无版本、v1、未知版本须先人工建立有效 v2 或直接按 v3 重建；不能只改版本号。

## 操作

```bash
node scripts/novel-outline.mjs migrate-v3 INPUT
node scripts/novel-outline.mjs migrate-v3 INPUT --out OUTPUT
node scripts/novel-outline.mjs migrate-v3 INPUT --out OUTPUT --confirm
```

无 --out 只预览。存在语义项时 status=pending，指定输出但未确认则退出 1 且不写文件。--confirm 明确接受预览中的保守文本合并，不是自动内容评审。先逐项审阅，无法确认时停止，不盲目执行确认。

写入只创建不同的新路径，已有目标或旁路文件均拒绝；输入要求普通文件，不跟随符号链接。成功时生成 OUTPUT、OUTPUT.v2-backup（原始字节）、OUTPUT.review（迁移去向与历史选择）。原文件始终不变。可从备份复制恢复。三个文件不是跨文件事务；中断后先人工检查，再清理残留目标重试。工具不自动操作用户项目目录。

## 语义映射与人工合并

- story.drive 各独有文本合并到 throughline；adaptation.core 合并到 premise。
- beats.type 的含义附入 setup，不修改 B ID、episode、outcome 或 resolves。
- stateChange 的 before/after 附入对应 synopsis，不改变集数、opening、ending、资产引用。
- preferences 实际文本合并 creativeBrief。既有 brief 保留。
- rules 每项进入预览，包括关闭项。开启的历史要求以文字保留在 brief；默认期限进入工作记录，不自动写入问题。manual overridePaths 逐项提醒，不能假定为模板默认。
- 历史 profile 名称仅在迁移说明中保留；摘要与版本在原始备份，不迁入新正式产物。
- 用户 thresholds、角色来源、原文 evidence、明确 Q 承诺及期限保持。不得删除未解 required 来通过检查。

工具不能判断语义重复，因此保守追加原文本而非自动删减。人工或 Agent 可审阅后将重复表述自然合并，逐项记录理由。自有样例见迁移核对记录：原 type/stateChange/core 已由正文完整表达，因此保留原正文，删除重复结构。

## 多文件顺序与验证边界

先 production 与项目要求，再 outline、script、creation，最后检查人物/美术消费者及联合接口。迁移后的独立 brief 接入项目时合并到 production，再删除阶段副本；同时存在不能静默选优先级。

迁移先校验 v2 结构形状，再校验生成的完整 v3。损坏参数、非法引用、未解承诺、非法旧字段不能因迁移被修饰成有效产物。旧创作规则是否应延续属于人工审阅，不以历史模板是否满足作为 v3 阻断条件。

本工具不迁移兄弟阶段，不执行模型调用。结构通过后仍须内容评审和各阶段完整校验。原始输入与备份保留全部信息。
