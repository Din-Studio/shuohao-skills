# 剧本 v2 → v3 显式迁移

正式 validate/render 只读取 v3，不静默忽略废弃字段。先迁移 production，再迁移 outline、script、creation，最后联合检查。多文件迁移不是跨文件事务。

## 安全入口

```bash
node scripts/novel-script.mjs migrate-v3 OLD.json --outline OUTLINE-v3.json
node scripts/novel-script.mjs migrate-v3 OLD.json --outline OUTLINE-v3.json --out NEW.json
node scripts/novel-script.mjs migrate-v3 OLD.json --outline OUTLINE-v3.json --out NEW.json --confirm
```

没有 --out 只预览，即使 --confirm 也不写入。存在 pending 时返回非零；--out 不能绕过待确认项。--confirm 表示已阅读并接受迁移记录，不表示故事内容已评审。结构错误不能通过确认绕过。

目标、备份和工作记录已经存在时拒绝，不覆盖输入，不自动扫描修改项目。输入必须是非符号链接普通文件。损坏 JSON、非法 UTF-8、非法旧坐标、数值和节点仍失败，不能通过删除字段修饰成合法 v3。

成功写入 NEW.json，同时生成：
- NEW.json.v2-backup：输入原始字节，可直接复制恢复。
- NEW.json.review：旧规则、选择身份、显式覆盖路径、偏好、seedNote 和计划差异及确认状态。

工作记录不是新创作产物，也不是失败累积日志。备份与工作记录保留审阅信息；每个新文件独占创建，不声称多文件事务。普通写入异常清理本次已经创建的文件，输入不变；系统中断后若有残留，应人工检查，不覆盖重试。

## 映射与人工确认

- 保留 source、集号、targetSeconds、场次、flow、人物及资产 ID、beatClaims，不合并或重编号。
- 删除 endBeat 前验证它确实指向旧正文最后一项；新位置由工具计算。
- openingBeat 已提供则保留有效坐标；可由作者后续决定省略，不自动猜测新落点。
- 提供当前大纲时删除 opening/ending 副本；与大纲不一致的原计划保留在待确认工作记录。独立迁移保留本地计划。
- 删除 creativeContext；身份和摘要保留在原始备份与工作记录，不把 profile 名称机械拼入创作要求。
- 旧 rules/defaults 逐项出现在 pending，显式 overridePaths 也保留。审阅哪些属于模板、哪些是手工要求；希望继续生效的约束写成自然语言，而不是假设旧规则仍生效。
- preferences 文本保留原始结构在工作记录，同时建议按文本顺序合并到 creativeBrief，必须确认含义。项目已有要求时冲突仍阻断，先人工合并，不能静默选择。
- seedNote 创作信息转入本次迁移工作记录，不删除唯一信息。
- 保留现有数值参数，不能断言等于默认值就一定没有手工意图。正式新创作只保存用户覆盖。
- CLI 不删除 delivery，不重写正文。自有正式样例另经人工审阅删除机械重复说明；特殊说明必须保留。

旧 v1 无可靠 B ID/结束事件语义，不能直接进入本工具。先在备份副本中人工整理为结构有效 v2，不凭旧类型标签推断节点或结尾。

## 迁移后检查

对新文件执行 README 中的 validate/checkup，重新认领改动过的正文，生成中英报告。检查当前大纲计划、实际节点、项目要求和下游真实镜头覆盖。独立模式明确未对账范围。

scripts/fixtures/legacy-script-v2.json 是专用于迁移回归的历史输入，不是正式运行样例。examples 下均采用 v3。迁移成功不代表模型限制、内容质量或全项目联合交付已通过。
