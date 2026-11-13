# 消费者与交接矩阵

## 消费者与权威来源

表中脚本路径相对对应 skill 目录。本阶段只负责 mint-outline；不能以本地检查替其他阶段宣布验收。

| 消费位置 | 权威来源 | 独立运行缺少上游 | 完整流程阻断条件 |
| --- | --- | --- | --- |
| outline 正式命令 | outline v5 仅剧情 | production 缺少则 skipped | 本阶段结构／来源／交接未完成 |
| characters | 原剧本及 characters 自身身份产物；outline 仅提供故事背景 | 可独立读取原剧本，不宣称背景对账通过 | 完整流程缺少已完成 outline，来源或范围不匹配 |
| art | 原剧本及 art 自身身份产物；人物由 characters 判断 | 可独立读取原剧本／明确设计输入 | 前序 outline/characters 未完成；人物引用未确认 |
| script | B/Q 来自 outline；正文局部引用属于 script；人物／美术来自各自阶段 | 可保留独立创作／解析入口，跨阶段检查 skipped | 前序未完成、损坏／版本不符、来源不匹配或实际需要的映射缺失／冲突 |
| creation | outline 剧情、script 正文位置、characters/art 身份 | 可保留独立入口，不宣称联合交付 | 缺少流程输入、正文认领失效或实际制作依赖的映射未确认 |
| video-prompt/video-prompt-review | 当前正文与已核对的 characters/art 及工作单映射 | 不将结构通过称为内容审核通过 | 资产变更、来源版本／范围或相关映射变化后仍沿用原审核 |

完整流程顺序：outline → characters → art → script → creation。各阶段本地校验及项目级流程状态均满足本次范围后才交接，不把局部范围冒称全剧完成。outline 只接受 schemaVersion 5；其他消费者不能因字符 C01 相同就认定映射通过。

## 本阶段的下游检查

checkup --downstream 只读取项目 script/creation 目录直接 JSON，不执行兄弟 skill 或依赖其样例。缺少目录／文件明确 skipped；损坏、悬空链接、多候选对应同集、版本错误及标题不匹配均失败。不扫描 .work。

本地接口按 script schemaVersion 4、creation schemaVersion 3 检查；这不是断言其完整契约或资产映射已经通过：
- script：来源文档 ID、sha256、行数与 outline 一致，负责范围不得超出 outline 已核验覆盖；flow/notes 有来源。flow 恰有一个非空 action/line/subtitle/sound。line 有 speaker（接受 script 的 C ID／VO 语法，但本阶段不认定其资产身份）；audio 仅属于 line/sound。
- 每集 beatClaims 按顺序恰好认领全部本集 B ID；坐标有效、不逆序、不重叠。openingBeat 可选且必须实际存在。不能从 outline 复制 opening/ending/endBeat。
- 解析 targetSeconds 可缺省，提供则正数；制作必须有 script 确认目标。creation 的 cuts 必须按顺序、连续、恰好一次覆盖正文 flow，seconds 正数，按目标及 tolerance（默认 0.15，显式值在 [0,1)）核对。
- audioRefs 只能引用本集更早镜头拥有的 line；不可向前、同镜、行动、重复或越界。跨场续声必须连续引用，中间跳过后不能恢复同次发声。缺少 script 不宣称已核验声音或全覆盖。
- 不读取人物／地点／道具身份，不按名称或 ID 片段推断身份。asset-identity-reconciliation 固定 skipped，归 characters/art/script/creation 的联合核对负责。

结果标记 scope=local-project-json-interfaces-only、fullDownstreamValidation=not-performed、applicationWorkflow=incomplete、contentReview=not-performed。本地结构检查不是完整流程状态、映射权威、内容审核或制作批准。项目级流程状态不是本 skill 的独立新增服务。
