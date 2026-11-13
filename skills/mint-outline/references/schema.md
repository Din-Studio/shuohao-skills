# outline.json v5 唯一正式契约

正式命令只接受数值 schemaVersion:5。不双读历史版本，不把同一 v4 解释为两种语义。production 仍为 v3。source 是作品标题，不是路径。契约封闭：顶层及剧情对象的未知字段失败，不能通过换字段名重新建立资产表。完整自有[样例](../examples/旧站时刻-outline.json)。

## 顶层与阶段

必需：schemaVersion、source、provenance、story。正式 full 还必须有 beats 数组（允许为空）及非空 episodes 数组。

可选：lang=zh/en、params（仅 genre 非空描述）、creativeBrief（非空）、notes。项目要求只保存在 production；提供项目配置时本地 creativeBrief 必须先人工合并再删除。默认值不落盘。

- skeleton：检查版本、封闭字段、来源覆盖及摘要。beats、episodes 可以尚未提供；后续检查标记 skipped。
- beats：增加 B 节点、来源、顺序及 endingBeatId 核验；episodes 可以尚未提供。
- full：增加分集、说明、Q 提出／回答顺序和引用核验。不能把局部阶段称为 full。

无 characters/scenes/props、focusCharacterIds、分集资产 ID、资产 notes ID、speakerId、thresholds 或资产调度。旧节奏规划字段同样不接受，不恢复评分、类型、目标时长、Q 期限或强制悬念。必要的人物变化、关系、动机和物品状态仍可以作为有出处的故事文字。

## 来源身份与覆盖

provenance：
- kind 固定 script；scope=partial/complete。
- documents 非空：唯一非空 id；唯一 path，相对当前 outline JSON；sha256 为原件字节小写 64 位 SHA256；lineCount 为正整数。
- coverage 非空：documentId、startLine、endLine，包含两端、从 1 开始、不越界。相同文档的相邻／重叠范围取并集，不重复计数。
- totalEpisodes 可选正整数。complete 必须知道总集数，每份提供文档完整覆盖，full 时实际分集恰为 1..N。partial 允许缺集、非第一集开始及明确登记尚未阅读的其他文档。完整覆盖一份节选不证明全剧完整。

sourceRefs 与 coverage 范围同形，非空且位于已负责覆盖并集。story、beats、episodes、Q、notes 都需要引用。ending.sourceRefs 可选，缺省依赖该集出处。原句相同但位置不同，保留各自位置。不按文本去重。

实际原件要求严格 UTF-8。LF/CRLF/CR 均按物理行计数，末尾换行不虚构空行。默认仅结构检查；verify-sources 或 --verify-sources 实际打开原件。缺失、不可读、非法编码、摘要或行数变化、越界均阻断。永不自动更新摘要。路径基准必须由 artifactPath 或 baseDir 明确提供。

## 故事、节点与分集

story：
- summary 非空。
- sourceRefs 必需，notes 可选。
- endingBeatId 可选，必须是有效 B ID，且指向已知 totalEpisodes 的最终集事件。partial 也可以识别已提供最终集的真实结尾；不能把局部最后一集冒称终局。

beats[]：
- id 为唯一 B01 等字符串（B 后至少两位数字）。
- episode 正整数；数组按集号不递减，同集数组顺序即叙事顺序。full 时必须存在该分集。
- setup、outcome 非空。outcome 记录事件及结果，不另强迫添加事件分类。
- sourceRefs 必需，notes 可选。
- resolves 可选，无重复 Q ID 数组。

episodes[]：
- ep 正整数、唯一且严格递增。synopsis 非空，sourceRefs 必需。
- opening 可选非空文字，不强制开场钩子。
- ending 可选：event 必需非空；mode 可选 suspense/closure/open；sourceRefs 可选；question 可选。
- question：唯一 Q01 等 ID、非空 text、sourceRefs；reason 可选非空。不保存 resolution/dueByEp。
- notes 可选。warnings 可选非空字符串数组，仅记录已有剧情注意事项，不自动扫描或生成制作分类。

Q 可以长期未回答。resolves 必须指向存在的 Q，最多回答一次，且必须发生在提出集之后。集尾问题不能由本集更早事件解决。不能删掉问题伪造闭环。悬念、收束和开放都只表示可核实事实，不强迫每集设置问题。

## 必要说明与说话者

notes 可以附于顶层、story、beat、episode。每项：
- kind=performance/background/continuity/restriction。
- text 非空；sourceRefs 必需。
- epistemic 可选 fact/claim/uncertain。
- episode 可选正整数；full 时必须存在该集。
- speaker 可选：{status:"described"|"unknown", description:"非空、原文支持的自然语言"}。出处依赖本条 notes.sourceRefs。status=unknown 时 description 明确说明未知位置或特征，不猜测身份。

使用“原文称作师傅的人”“走廊里未辨认的声音”等描述。同名不同人以原文角色描述和出处区分，不建立 C ID。别名及隐藏身份不在 outline 归并。人物说法不自动升格为客观事实。

心理与背景说明不自动变为对白。只交接必要前情、物品状态和知情／揭晓限制，不建立全人物知情矩阵。不接受 transformation/candidate；正式转译属于 script，候选只在 .work。

## 状态、报告与公共 API

gates 的 status=pass/fail/skipped；error 失败阻断，warn 只提醒。stats 是本次检查结果，不保存失败累积日志。complete 仅指 full 本地结构通过，不等于 provenance.scope=complete，更不是语义审核批准。sourceVerification 明确是否实际核验；contentReview 固定 not-performed。

报告只展示故事、分集、节点、连续性、出处和检查。没有资产表、预算、资产矩阵或工作量估算。assets 命令与 computeAssets/thresholdsOf/CHARACTER_TIERS 等公共资产 API 已移除。

scripts/mint-outline.mjs 导出：
- createSkeleton({source,provenance,genre,creativeBrief,lang})：v5 未完成草稿，不推断来源或目标。
- newQuestion(question)：仅深复制。
- checkup(doc,{stage,verifySources,artifactPath,baseDir,production,productionError})；validateOutline(doc,stage,options)；gateReport(doc,options)。
- renderHtml/renderMarkdown(doc,lang,options)：只读派生；中英界面，正文不翻译。
- sourceDocument、sourceLines、unionRanges、coverageOf、provenanceErrors、sourceRefsErrors、verifySources、chunkScript：自包含来源工具。
- migrationDraftV5(oldV4)、migrateFileV5(input,output,{confirm,projectRoot})：形状见[显式迁移](migration.md)。

本地下游接口与版本矩阵见[交接说明](handoff.md)。本地检查不代替项目流程状态、资产映射、语义审核、工作单批准或成片审核。
