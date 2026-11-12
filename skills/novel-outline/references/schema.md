# outline.json v3 数据契约

正式运行严格要求 schemaVersion: 3，拒绝旧字段并提示显式迁移，不双读旧格式。完整样例见 [旧站时刻](../examples/旧站时刻-outline.json)。创作方法见 [创作指南](创作指南.md)。

## 核心与阶段

必需：schemaVersion、非空 source、params、story、characters、scenes。可选 lang=zh/en、creativeBrief、adaptation、props、arcs。节点阶段增加 beats 与 story.endingBeatId；完整阶段增加 episodes。

skeleton 检查核心故事、参数与资产；beats 增加事件、结束节点、阶段和道具节点引用；full 增加分集、资产使用及问题回收。未到阶段明确 stage-incomplete，不冒充完整交付。

params.episodes 为正整数；minutesPerEpisode 为有限正数；genre 为非空题材描述；adaptMode 为原创/忠实/抽核/借壳。genre 不选择规则。params.preferences/rules/defaults 已删除。legacy pacing、maxBeatGap、hookWindow、maxLineChars、minCutSeconds、maxCutSeconds 同样拒绝。

creativeBrief 提供时必须为非空字符串。production 使用 schemaVersion 3；项目要求只在 production 保存，本地要求必须先人工合并再删除副本。旧 creative、creativeContext、selection、decisions、overrides 拒绝。修改指南不影响数据结构有效性。

## 故事与改编

story.focusCharacterIds 为非空、无重复、存在的 C ID 数组；premise、throughline、ending 为非空字符串。audiencePromise 可选，提供则非空。endingBeatId 必须指向最终集的明确结束节点，不能用数组最后一项隐式替代。不要求兑现终点。drive 已删除。

adaptation 整体可选。keep/cut/merge 按需为数组，条目含非空 what/why；risks 含 what/plan。条目的 evidence 或 adaptation.evidence 提供时为非空逐字原文；真实性由内容评审判断。sourceNote、cutNote、mergeNote 可选非空字符串。core 已删除；独有信息迁入 story。原创不强制填写空数组或伪造来源。

## 人物、场景、道具

ID 为前缀加至少两位数字，各表不重复，始终保持稳定：

- characters：id=C01、name、role 非空，tier=lead/support/functional。from 可选非空字符串数组；arc 可选非空字符串，静态人物不必编造变化。
- scenes：id=S01、name 非空、primary 布尔。reusePlan 可选非空。
- props：可选数组，id=P01、name/function 非空；beatIds 可选无重复有效 B ID。明确引用校验，不从同集推断精确关联。
- full 时所有登记资产至少被一集引用。聚合使用次数、人物工作量、场景关联由工具计算。不接受顶层 assets/crowdPlan。

## 重要事件与阶段规划

beats 为非空数组，每项 id=B01、episode（1..总集数）、setup/outcome 非空。
数组按 episode 不递减；同集使用数组顺序。position 可选 opening/early/middle/late/ending，提供仅校验枚举，不重新排序。kind 可选 event/pressure/turn/payoff；weight 仅 kind=payoff 时可提供 minor/major。分类、强度均不强制。type/payoff 旧字段拒绝。resolves 可选无重复 Q ID 数组。

arcs 可省或为空；条目 id=A01、startEp/endEp 合法区间、非空 goal、endBeatId 指向 endEp 节点。按起始集排序且不重叠；不强制连续覆盖或兑现结束。

## 分集与问题

episodes 恰好 params.episodes 项，ep 从 1 连续排列。opening/synopsis 为非空字符串。characterIds/sceneIds 为非空、无重复、有效引用；propIds 可选；warnings 可选非空字符串数组。stateChange、hook、suspense、crowdPlan、beatIds 旧字段拒绝。

ending 仅含 mode=suspense/closure/open、非空 event、可选 question。suspense 无 question 合法；closure 禁止新待答问题。question 仅含 id/text/resolution/reason/dueByEp：

- id 为唯一 Q ID，text 非空，resolution=required/optional。
- reason 可选非空；optional 不携带 dueByEp。
- dueByEp 可选，明确提供时为提出集 < 期限 <= 总集数的整数；不自动填写。
- required 由后续唯一节点解决，最终集不能新登记 required。optional 可不解决，若解决仍须唯一且后续。
- 未登记引用、重复、提前或超期解决均失败。不得删去未解决承诺来规避校验。

## 制作预算与状态

params.thresholds 可选对象，合法键 maxLeads/maxSupport/maxFunctional/maxProps/maxPrimaryScenes，值为正整数。只有用户明确提供的键阻断超额；其余工具参考值为 5/10/10/8 与 clamp(4+ceil(集数/10),5,15)，仅提醒。报告逐项区分“用户预算”和“工具参考值”。

gate 使用 id/category/level/status/messages/reason?；status=pass/fail/skipped。error 失败阻断，warn 失败是提醒，缺上游与阶段未完成明确跳过。contentReview 固定 not-performed。complete 仅代表 full 本地结构无阻断；不等于内容或联合交付通过。validate/render 只读，不自动补字段。

## 本地下游接口

checkup 的 --downstream 读取项目根 script/creation 中直接存放的 JSON，不执行兄弟代码。项目根来自 production，否则按 outline/ 目录约定定位。接口检查：

- schemaVersion 3、source 一致、无旧配置字段；集号递增唯一且存在于 outline，允许合法批次。
- script.targetSeconds 严格对齐大纲分钟数乘 60；拒绝重复 opening/ending 与持久化 endBeat。openingBeat 可选，缺省不伪造核验。beatClaims 按序认领当集所有 B ID，验证真实 flow 坐标、重复、倒序和重叠。
- creation 拒绝项目计划副本/endBeat；检查镜头范围的顺序、连续、重叠和真实覆盖。唯一 script 匹配时覆盖全部实际 flow，结束位置由正文推导。openingBeat 缺省不新增映射。
- creation 镜头秒数合法且总时长对齐目标，tolerance 缺省 0.15，明确覆盖须在 [0,1)。
- 缺少 script 只跳过依赖上游的覆盖检查；损坏、悬空链接、不支持版本及多候选均失败。

本地接口零失败不代表模型技术、媒体交接或各阶段完整联合校验通过。结果标记 fullDownstreamValidation/contentReview: not-performed。

## API

createSkeleton(options) 返回未完成草稿；newQuestion(question) 只复制，不生成期限。
checkup(doc,options) 返回 stage/gates/stats/complete/contentReview/thresholds；validateOutline 返回错误字符串；gateReport 返回 gates。
computeAssets 计算资产使用、castPlan、warnings、可选分类汇总 beatsByKind。
renderHtml/renderMarkdown 为只读派生报告，导出 JSON 保持输入值。
