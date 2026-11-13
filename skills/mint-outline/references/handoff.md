# 版本、消费者与交接矩阵

## 实施前基线与升级顺序

以下旧依赖按本次实施前的仓库版本盘点，表中脚本路径相对对应 skill 目录，不代表其他阶段当前分支已经完成升级。本阶段只修改 mint-outline；不能以本地检查替其他阶段宣布验收。

| 消费位置 | 原契约／读取位置 | 新权威来源 | 独立运行缺少上游 | 完整流程阻断条件 |
| --- | --- | --- | --- | --- |
| outline 正式命令 | outline v4；资产表和预算 | outline v5 仅剧情 | production 缺少则 skipped | 本阶段结构／来源／交接未完成 |
| characters：scripts/lib/contracts.mjs、scripts/mint-characters.mjs 的 seedFromOutline、scripts/lib/source-facts.mjs | outline v3/v4 characters、tier、aliases、sourceRefs | 原剧本及 characters 自身身份产物；v5 仅故事背景 | 可独立读取原剧本，不宣称背景对账通过 | 完整流程缺少已完成 outline，来源或范围不匹配 |
| art：scripts/lib/contracts.mjs、scripts/mint-art.mjs 的 seedFromOutline、scripts/lib/source-facts.mjs | outline v3/v4 scenes/props、primary、beatIds | 原剧本及 art 自身身份产物；人物由 characters 判断 | 可独立读取原剧本／明确设计输入 | 前序 outline/characters 未完成；人物引用未确认 |
| script：scripts/lib/outline-input.mjs、scripts/mint-script.mjs 的正文／声音检查 | outline v4 C/S/P、beats、分集、Q、来源 | B/Q 来自 outline v5；正文局部引用属于 script；人物／美术来自各自阶段 | 可保留独立创作／解析入口，跨阶段检查 skipped | 前序未完成、损坏／版本错、来源不匹配或实际需要的映射缺失／冲突 |
| creation：scripts/lib/contracts.mjs 的 outlineProblems/reconcile | outline v4 资产和剧情；script v4 | outline v5 剧情、script 正文位置、characters/art 身份 | 可保留原独立入口，不宣称联合交付 | 缺少流程输入、正文认领失效或实际制作依赖的映射未确认 |
| creation：scripts/mint-creation.mjs 的名称／参考图、scripts/lib/worksheet.mjs 及派发材料 | outline.characters 解析 C 名称、参考图、输入摘要及审核上下文 | characters 名称／身份、art 地点／物品；正式联合映射由下游维护 | 相关检查 skipped，不伪造名字或路径 | 使用资产却缺少身份／素材映射，或旧摘要／审核已失效 |
| video-prompt/video-prompt-review：scripts/lib/worksheet.mjs 及制作审核 | 工作单中的资产、来源和批准摘要，间接消费旧 outline 权威 | 当前正文与已核对的 characters/art 及工作单映射 | 不将结构通过称为内容审核通过 | 资产变更、来源版本／范围或相关映射变化后仍沿用旧审核 |

升级顺序：
1. 保留旧文件及旧工具版本；旧项目若继续旧流程，仅使用隔离的旧版本，不让本版正式命令隐式双读。
2. 显式建立 outline v5 草稿与 .migration.json，核对故事、来源和范围。
3. characters 再 art 独立读取剧本，消费待核验旧材料，确认本阶段身份及明确预算。
4. script 核对 B/Q、正文和实际需要的资产映射；不按名称猜测。
5. creation、工作单、参考图、提示词与审核重新核对受影响的实际引用。
6. 各阶段本地校验及项目级流程状态均满足本次范围后才交接，不把局部范围冒称全剧完成。

本版 outline 报错 schemaVersion must be 5；migrate-v5 仅接收显式 v4。历史 v2/v3 先走历史迁移并补证据。其他消费者必须在各自阶段升级，不能因字符 C01 相同就认定映射通过。迁移材料不是它们的正式产物。

## 本阶段的下游检查

checkup --downstream 只读取项目 script/creation 目录直接 JSON，忽略 .migration.json，不执行兄弟 skill 或依赖其样例。缺少目录／文件明确 skipped；损坏、悬空链接、多候选对应同集、版本错误及标题不匹配均失败。不扫描 .work。

本地接口支持 script v4、creation v3；这不是断言其完整契约或资产映射已经通过：
- script：来源文档 ID、sha256、行数与 outline 一致，负责范围不得超出 outline 已核验覆盖；flow/notes 有来源。flow 恰有一个非空 action/line/subtitle/sound。line 有 speaker（兼容当前 script v4 的 C ID／VO 语法，但本阶段不认定其资产身份）；audio 仅属于 line/sound。
- 每集 beatClaims 按顺序恰好认领全部本集 B ID；坐标有效、不逆序、不重叠。openingBeat 可选且必须实际存在。不能从 outline 复制 opening/ending/endBeat。
- 解析 targetSeconds 可缺省，提供则正数；制作必须有 script 确认目标。creation 的 cuts 必须按顺序、连续、恰好一次覆盖正文 flow，seconds 正数，按目标及 tolerance（默认 0.15，显式值在 [0,1)）核对。
- audioRefs 只能引用本集更早镜头拥有的 line；不可向前、同镜、行动、重复或越界。跨场续声必须连续引用，中间跳过后不能恢复同次发声。缺少 script 不宣称已核验声音或全覆盖。
- 不再读取 outline.characters/scenes/props，不按名称或 ID 片段推断身份。asset-identity-reconciliation 固定 skipped，归 characters/art/script/creation 的联合核对负责。

结果标记 scope=local-project-json-interfaces-only、fullDownstreamValidation=not-performed、applicationWorkflow=incomplete、contentReview=not-performed。本地结构检查不是完整流程状态、映射权威、内容审核或制作批准。项目级流程状态不是本 skill 的独立新增服务。
