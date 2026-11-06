# outline.json v2 契约

软件版本 2.0.0，数据版本必须是 `schemaVersion: 2`。JSON 唯一编辑源。旧文件拒绝并指向 [迁移指南](migration.md)。自有完整样例见 [旧站时刻](../examples/旧站时刻-outline.json)。本说明和本地 profile-contract 一起使用，无兄弟目录依赖。

## 顶层与参数

必需：schemaVersion、source（非空作品名）、params、story、adaptation、characters、scenes；节点阶段增加 beats、story.endingBeatId；完整阶段增加 episodes。可选 lang=zh/en、props、arcs、creativeContext。

params.episodes 为正整数，minutesPerEpisode 为有限正数分钟。genre 是题材描述，不参与程序分支。adaptMode 为原创/忠实/抽核/借壳。preferences 可保留用户偏好；类型为 string[]，允许空数组，提供的每一项必须是非空字符串。

params.thresholds 只管理制作资产预算，可覆盖 maxLeads(5)、maxSupport(10)、maxFunctional(10)、maxProps(8)、maxPrimaryScenes（默认 clamp(4+ceil(集数/10),5,15)）。值均为正整数；未知预算或旧 maxBeatGap 拒绝。预算不是题材规则。报告展示全部实际生效值。

所有注册规则必须写入 params.rules。关闭对象恰好为 `{ "level": "off" }`；开启对象包含 level=warn/error 与下表全部参数，不能保留未知字段或半个规则对象。整数必须有限、数值类型、正整数。

| 键 | 开启参数 | 检查语义 |
| --- | --- | --- |
| payoffCoverage | minPerEpisode 正整数 | 每集 payoff 数量下限 |
| firstMajor | byEpisode 正整数 | 必须有 major，首个不晚于 min(阈值,总集数) |
| majorGap | maxGap 正整数 | major 所在集去重后相邻差值；少于两集则不适用 |
| endingPayoff | minWeight=minor/major | endingBeatId 为满足强度的 payoff |
| endingModes | nonFinal/final 非空无重复模式数组 | 按全剧最终集身份检查 ending.mode |
| optionalQuestions | allow 布尔 | false 禁止 optional |
| stateProgress | 无其他参数 | 每集提供 before/after 且文本不完全相同 |
| arcCoverage | 无其他参数 | 非空 arcs 连续覆盖全剧；未提供则不适用 |
| arcPayoff | minWeight=minor/major | 非空 arcs 的终点为满足强度的 payoff |

params.defaults 必须包含 questionResolveWithin，类型为正整数或 null。它是创建默认值，不是检查规则，没有 level。只对新建 required 且未给期限的问题写 dueByEp=min(提出集+默认值,总集数)。不会改写 optional、旧问题或显式期限；最终集仍禁止无法履行的 required 承诺。导出的 newQuestion(question,ep,params) 不修改输入。

删除旧 params.pacing、maxBeatGap 等平铺创作字段；只有 migrate 辅助读取旧数据。validate/render 不填补缺项或重新应用策略。

## story：作品承诺

- focusCharacterIds：非空、无重复、存在的 C ID 数组，支持群像。
- premise：核心处境。
- throughline：贯穿行动、关系或议题，单元故事不必伪造统一任务。
- audiencePromise：观众希望持续获得的体验，不限爽感。
- ending：本次交付实际结束方式与意义。
- endingBeatId：节点和完整阶段必须指向最终集有效节点，不要求 payoff 或 major。
- drive：可选非空文本值对象，补充具体目标、阻力和代价；不强迫所有作品填写。

## adaptation：来源与取舍

core 必填。keep/cut/merge/risks 均为数组，允许原创或没有相关取舍时为空，不因为 adaptMode 标签强迫砍掉情节。

keep/cut/merge 条目为 what/why；risks 为 what/plan；均为非空文本。evidence 可附逐字原文，不得伪造。提供时必须非空；真实性与覆盖范围归内容评审。可选 sourceNote 说明材料不足或原创身份，cutNote/mergeNote 说明决策；填写则不可为空。

## 资产

所有 ID 使用前缀加至少两位数字，全表唯一；数字可超过两位，不自动重编号。

- characters：C ID、name、role、tier=lead/support/functional、from 非空字符串数组。lead/support 必须有 arc，functional 可省。不存在通用“至少一个 lead”胜利模型，叙事关注由 story.focusCharacterIds 记录。
- scenes：S ID、name、primary 布尔。reusePlan 可选，填写则非空。一次性场景不需要伪造复用方案。
- props：可选数组。P ID、name、function 非空。可选 beatIds 为无重复有效 B ID，可指向任何 kind，不局限兑现。
- 完整阶段，登记角色、场景、道具必须至少被一集引用。资产汇总、出现集与次数全部计算，不另存顶层 assets。
- 不接受 crowdPlan。人物在场不是多人同框证据。

## beats：重要事件表

每个节点：id=B01 格式、episode、position、kind、type、setup、outcome。

- episode 在 1..总集数内，是所属集号唯一来源。
- position=opening/early/middle/late/ending，只是粗区段，不代表五等分秒数。
- kind=event/pressure/turn/payoff。只有 payoff 必须填写 weight=minor/major；其他 kind 禁止 weight。
- type 是非空自由标签；setup/outcome 为非空处境和事件后果。
- 可选 resolves 为无重复 Q ID 数组。
- 数组按集号、粗位置排列；同一位置保留数组顺序。不自动排序掩盖作者顺序错误。
- 不接受旧 payoff 字段；不为每个动作登记节点，不为数量重复计数。

## episodes：分集计划

ep 从 1 连续到总集数，opening/synopsis 非空；sceneIds/characterIds 非空且无重复有效引用，propIds 可选无重复有效引用；warnings 可选非空字符串数组。

stateChange 可选，但提供时必须是 before/after 非空字符串对象。stateProgress 决定是否每集必填及完全相同文本是否失败。不同文本不证明内容推进。

禁止 hook/suspense/crowdPlan/beatIds，旧结构不双读。synopsis 保持梗概职责；引号检测不作为通用硬门。

ending 字段白名单：mode、event、question。

- mode=suspense/closure/open，event 非空，描述实际结束事件。
- suspense 必须有 question；closure 禁止携带 question（包括 null）；open 可选。
- question 白名单：id、text、resolution、reason、dueByEp。
- id=Q01 格式，全剧唯一；text 非空；resolution=required/optional。
- optional 必须有非空 reason，禁止 dueByEp。
- dueByEp 可省；填写时必须是提出集 < 期限 <= 总集数的整数。
- required 完整阶段必须由一个后续节点解决，最终集不得新提 required。
- optional 可不解决；若解决仍必须唯一、后续、有真实引用。未知 Q、重复解决、提前解决、超期都失败，策略不能关闭。
- beats 阶段尚未建立分集 Q，明确跳过问题对账；不误报不存在的集尾。

## arcs：可选阶段

数组或省略，空数组等同未提供。条目为 id=A01 格式、startEp/endEp 合法闭区间、goal 非空、endBeatId。按 startEp 排列且不重叠；终点节点必须属于 endEp。基础层不要求从第 1 集开始、不要求连续覆盖、不要求 payoff；arcCoverage/arcPayoff 决定附加要求。

## 策略来源与项目对账

creativeContext 保存完整四维 selection 快照、仅实际加载的 references（dimension/id/version/stage/sha256）和 overridePaths。outline 四维全部必须加载。值只在 params 保存，不在来源记录复制阈值。路径覆盖以完整规则或默认值为单位。

应用流程与摘要算法以 [profile-contract](profile-contract.md) 为准。历史读取缺来源或摘要漂移提醒，不改参数；继续创作必须恢复来源或明确升级。提供 production 时检查 creative 结构及完整 selection 相等，失配为阻断项；无 production 明确 missing-upstream。来源匹配不证明内容质量。

## 应用后的下游接口检查

真实 `apply-profile ... --confirm` 写入成功后，重新检查当前大纲，并读取项目根 `script/`、`creation/` 内直接存放的全部 `.json` 文件。项目根优先取显式或自动发现的 production 所在目录，否则按大纲位于 `outline/` 的目录约定寻找同级阶段。备份不以 `.json` 结尾，不参与发现。

本 skill 自带接口检查，不 import 兄弟代码，也不要求安装兄弟 skill：

- script/creation 必须为可读取 JSON 对象、schemaVersion 2，完整四维 selection 与当前大纲一致。
- 分集为非空数组，集号唯一递增，必须存在于大纲。允许合法批次，不要求每份文件覆盖全剧。
- script 的 targetSeconds 严格等于大纲分钟数乘以 60；逐集开场与集尾投影一致。beatClaims 必须按序认领全部当集节点，检查真实 flow 坐标、重复、倒序和重叠。
- creation 的开场及集尾投影与大纲一致；镜头秒数为有限正数，总时长按当前 tolerance 与大纲目标对账。存在唯一匹配 script 分集时，检查位置投影及每个剧本节拍恰好被镜头按序认领一次；多个匹配文件不能任意挑选。
- 真正缺少匹配 script 时，仅跳过依赖 script 的坐标存在性和完整覆盖检查。已知文件损坏、不可读或版本不支持均报错，不作为缺失跳过。

stderr 的 `downstream` 包含逐文件 gates、当前 stats、接口范围，以及 `fullDownstreamValidation/contentReview: not-performed`、`applicationWorkflow: incomplete`。本地接口失败使退出码为 1，但已经完成的策略写入不会自动撤销；原文件备份仍然保留。接口零失败不代表完整下游、内容评审或联合交付通过。继续执行各阶段完整校验及内容评审，包括策略、资产、台词估时、模型技术和参考图检查。

`node scripts/fixes-selftest.mjs` 执行消费者真实 CLI、损坏／过期下游及生成报告 DOM 交互回归；主自测及独立拷贝自测同样执行这些回归。DOM 测试不替代真实浏览器的布局验收。

## 阶段与结果 API

`skeleton` 检查选择、参数、story 说明、资产、改编；不要求节点/分集。`beats` 增加节点、终点、阶段与适用节点策略，分集/Q 仍跳过。`full` 全部检查。

导出 API：

- createSkeleton(options)：中性草稿，不自动选择 profile。
- checkup(doc,{stage='full',production,productionError,skillRoot})：返回 {stage,gates,stats,complete,contentReview,thresholds}。
- gateReport(doc,options)：返回 gates 数组。
- validateOutline(doc,stage='full',options)：返回阻断错误字符串数组；第二参数也可为 options。
- renderHtml/renderMarkdown(doc,lang,options)：只读派生视图，报告包含全部检查。
- computeAssets(doc)：计算资产使用、分档工作量、预警与关联类型。

每个 gate 为 {id,category,level,status,messages,reason?}。category 为 base/policy/source/content；status 为 pass/fail/skipped，无 ok。基础 error 或策略 error 失败阻断；warn fail 是提醒，不计通过；source 不阻断历史。off 跳过原因为 policy-disabled；另有 missing-upstream/stage-incomplete/not-applicable。来源漂移/不可核验可有专用提醒原因。

stats 分别记录本次 pass、阻断 fail、非阻断 warn、skipped 数量，不保存历史。complete 只说明 full 本地结构无阻断，不代表来源或联合交付、内容评审通过。contentReview 固定 not-performed，不从字段完整推导评审结论。

CLI checkup --json 输出该对象；validate/checkup 阻断失败退出 1，提醒退出 0；损坏显式或已发现 production 不退化成缺少上游。render 可展示无效结构以诊断，但不自动修复。
