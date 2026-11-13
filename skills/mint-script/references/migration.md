# 剧本 v4 显式迁移

正式 validate/render 只读取 script v4 和 outline v4。production/creation 仍为 v3。不静默忽略旧字段，也不将版本号升级当作来源核验。多文件迁移不是跨文件事务。

## v3 → v4

```bash
node scripts/mint-script.mjs migrate-v4 OLD-v3.json --no-production
node scripts/mint-script.mjs migrate-v4 OLD-v3.json --out PROJECT/script/.work/NEW.draft --confirm --no-production
# 仅在确认原输入是独立创作时：
node scripts/mint-script.mjs migrate-v4 OLD-v3.json --independent --out NEW-v4.json --confirm --no-production
```

默认只预览。--confirm 不改变读取证据，不授予改写权限。默认输出为待完善的解析草稿：schemaVersion:4，provenance:null。结构检查会阻断这份草稿，直到人工读取真实来源、补齐 provenance 与 flow/notes 的 sourceRefs。不能猜测摘要、行号、总集数或目标时长。建议把未完成草稿保存在 .work 且不使用正式 JSON 后缀，避免被阶段唯一文件发现选中。

--independent 是明确的独立创作声明，仅用于没有解析来源的作品；不得用它绕过已有剧本的来源义务。此时不添加 provenance，仍需要人工复核非发声说明与声音语义。独立创作能力不因 outline 的解析入口限制而删除。

保留 source、所有集场与 flow、资产 ID、beatClaims 和已有 targetSeconds。不因秒数等于默认值就删除它。没有目标时记录制作前待确认项，不从大纲推断。提供 outline 时，重复 opening/ending 移入迁移记录，不能把历史意义直接丢弃。旧文档的完整 JSON 一直保存在 review.original，原始字节保存在 NEW.v3-backup。

成功写入三个独占创建的新文件：输出草稿、`.v3-backup`、`.review`。记录包括完整旧文档、移出的计划、pending、draft 和 contentReview:not-performed。默认解析草稿需要补来源证据，因此确认迁移成功不代表可进入制作。输入、已有输出、备份或记录都不覆盖；符号链接输入和结构损坏拒绝，写入前检查输入未变化，普通写入异常清理本次文件。

完成草稿后执行 verify-sources、validate/checkup，再进行独立来源／正文核验。制作前执行 --production-ready，并由制作阶段重新 seed/检查工作单。来源变化须重新定位引用，不能只更新哈希让旧坐标继续通过。

## 历史 v2 → v3

保留 migrate-v3 作为历史操作，它的输出不能直接进入新的正式制作入口。先使用本 skill 的历史 v3 outline 完成旧字段迁移，再执行 migrate-v4。历史迁移不会静默将 outline v4 降级读取。

### 历史迁移安全入口

```bash
node scripts/mint-script.mjs migrate-v3 OLD.json --outline OUTLINE-v3.json
node scripts/mint-script.mjs migrate-v3 OLD.json --outline OUTLINE-v3.json --out NEW.json
node scripts/mint-script.mjs migrate-v3 OLD.json --outline OUTLINE-v3.json --out NEW.json --confirm
```

没有 --out 只预览，即使 --confirm 也不写入。存在 pending 时返回非零；--out 不能绕过待确认项。--confirm 表示已阅读并接受迁移记录，不表示故事内容已评审。结构错误不能通过确认绕过。

目标、备份和工作记录已经存在时拒绝，不覆盖输入，不自动扫描修改项目。输入必须是非符号链接普通文件。损坏 JSON、非法 UTF-8、非法旧坐标、数值和节点仍失败，不能通过删除字段修饰成合法 v3。

成功写入 NEW.json，同时生成：
- NEW.json.v2-backup：输入原始字节，可直接复制恢复。
- NEW.json.review：旧规则、选择身份、显式覆盖路径、偏好、seedNote 和计划差异及确认状态。

工作记录不是新创作产物，也不是失败累积日志。备份与工作记录保留审阅信息；每个新文件独占创建，不声称多文件事务。普通写入异常清理本次已经创建的文件，输入不变；系统中断后若有残留，应人工检查，不覆盖重试。

### 历史字段映射与人工确认

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

### 历史迁移后检查

历史操作得到 v3 后继续显式 migrate-v4。补完来源证据后，对 v4 执行 README 中的 validate/checkup，重新认领改动过的正文，生成中英报告。检查当前大纲计划、实际节点、项目要求和下游真实镜头覆盖。独立模式明确未对账范围。

scripts/fixtures/legacy-script-v2.json 是专用于迁移回归的历史输入，不是正式运行样例。scripts/fixtures/ 同时保存独立的 legacy-script-v3 与 legacy-outline-v3，只供历史回归；examples 的 script/outline 使用 v4，媒体与项目夹具保留各自版本。迁移成功不代表模型限制、内容质量或全项目联合交付已通过。
