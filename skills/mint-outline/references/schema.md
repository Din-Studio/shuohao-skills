# outline.json v4 数据契约

只接受已有剧本。正式运行只接受 schemaVersion:4，不双读历史格式。production 仍为 v3。source 始终是作品标题，不是路径或来源对象。完整自有[样例](../examples/旧站时刻-outline.json)可独立运行。

## 来源身份与覆盖

provenance 必需：
- kind 固定 script；scope 为 partial 或 complete。
- documents 非空数组：id 唯一非空字符串、path 相对当前 JSON 的路径、sha256 原件字节的小写 64 位 SHA256、lineCount 正整数。文件为严格 UTF-8，LF/CRLF/CR 均按物理行计数，末尾换行不产生虚构空行。
- coverage 非空数组：documentId、startLine、endLine。行号从 1 开始，包含两端，不得越界。相同文档的重叠和相邻范围取并集，不累计重复位置。
- totalEpisodes 可选正整数。complete 要求每份提供文档完整覆盖、已知 totalEpisodes、full 时实际分集恰为 1..N。partial 允许缺集和非第一集开始；已知总集数时不能超界。完整覆盖一份节选不证明全剧完整。

sourceRefs 是非空范围数组，形状与 coverage 条目一致，必须在已负责覆盖并集内。story、人物、地点、道具、B 事件、分集、Q 问题、notes、别名证据均需要引用。同样文字在两个位置发生，保留两个位置。多个证据范围可共同支持一个事实，不按文字去重。

validate/checkup 默认只检查结构；--verify-sources 或 verify-sources 命令实际读取原件。哈希不符、实际行数不符、缺失、不可读、非法编码均阻断。检查永不自行更新哈希。修改来源后先重新阅读、核对引用，再更新登记。原件核验不证明语义忠实或授权。

## 最小事实与阶段

必需：schemaVersion、source、provenance、story、characters/scenes 数组。props 可选。lang 可选 zh/en。params 可省，仅允许 genre 非空描述和 thresholds。不落盘默认值。

story：summary 非空；sourceRefs 必需；focusCharacterIds 可选，无重复且存在的 C ID。endingBeatId 仅在确实识别全剧末尾时填写，要求已知 totalEpisodes 并指向其末集 B 事件。partial 也可识别已提供末集的真实结尾，不能把局部最后一集当全剧结尾。

skeleton 检查来源形状、摘要和资产；beats 增加事件及引用；full 增加实际分集、资产使用和 Q 顺序。阶段缺口明确标记，不冒充 full。空人物／地点数组允许无人物或纯字幕来源；不虚构资产。beats 可以为空，但必须是数组，不能为凑数发明重要事件。

- characters：唯一 C01 等 ID、name/role 非空、tier=lead/support/functional。arc 可选非空；from 可选非空字符串数组，但不能替代 sourceRefs。presence 可选 visible/voice-only/mentioned。aliases 可选数组，每项 name 与 sourceRefs；同名不证明同一身份。
- scenes：唯一 S01 等地点 ID、name、primary 布尔、sourceRefs。地点身份不等于场次序号。
- props：唯一 P01 等 ID、name/function、sourceRefs；beatIds 可选，无重复有效 B ID。同一实物交接或损坏不新建身份。
- beats：唯一 B01 等 ID、episode 正整数、setup/outcome 非空、sourceRefs；按集号不递减，同集数组顺序为叙事顺序。full 时每个事件对应已提供分集。resolves 可选无重复 Q ID。
- episodes：非空、ep 正整数递增唯一、synopsis 非空、sourceRefs、characterIds/sceneIds 有效唯一 ID 数组，允许为空；propIds 可选。全部登记资产须被至少一集引用。opening 可选非空。warnings 可选非空字符串数组。
- ending 可选，event 必需非空，mode 可选 suspense/closure/open；sourceRefs 可选，缺省由该集引用支持。question 可选：唯一 Q ID、text、sourceRefs，reason 可选。不再使用 resolution/dueByEp。可以长期未回答，不能删除问题伪造闭环。resolves 指向存在问题，最多一次且必须在提出集之后；集尾问题不能在本集更早解决。

## 必要说明

notes 可附于顶层、story、资产、事件、分集。每项 text 非空、kind=performance/background/continuity/restriction、sourceRefs 必需。可选 characterIds/sceneIds/propIds、episode 均校验实际 ID；epistemic 可选 fact/claim/uncertain，speakerId 可选真实 C ID，用于区分客观事实与角色说法。只记录影响下游的状态、前情和禁区，不建立全人物知情矩阵。

非发声心理和背景保持说明，不自动变为对白或动作。说明不需要认领镜头。outline 不保存 transformation 或 candidate；正式转译归 script，待授权候选仅放 .work。授权判断是语义工作，不建立权限引擎。

删除字段：params.episodes/minutesPerEpisode/adaptMode、adaptation、arcs、story.premise/throughline/ending/audiencePromise/drive、beats.position/kind/weight/type/payoff、scenes.reusePlan，以及旧 stateChange/hook/suspense/crowdPlan/beatIds 分集规划字段。旧证据与决定通过显式迁移保存，不静默丢弃。

## 项目、预算与状态

creativeBrief 提供则非空。项目只在 production 保存；与本地同时存在阻断，必须人工合并。旧 creative/creativeContext/selection/decisions/overrides 和 params.rules/defaults/preferences 不接受。

thresholds 合法键 maxLeads/maxSupport/maxFunctional/maxProps/maxPrimaryScenes，值正整数。明确预算超额阻断；工具参考值 5/10/10/8 与 clamp(4+ceil(已提供集数/10),5,15) 仅提醒。tier/primary 不自动替代或删除。出现对象不表示必须出图。

gates 使用 status=pass/fail/skipped；error 失败阻断，warn 提醒。complete 仅指 full 本地结构通过，不等于 scope=complete，也不证明语义忠实。sourceVerification 表明是否实际核验；contentReview 固定 not-performed。不会写入失败累积日志。

## 本地下游接口

--downstream 只读取项目 script/creation 目录的直接 JSON，不执行或导入兄弟 skill。损坏文件、悬空链接与歧义上游失败；缺少上游明确 skipped。

script 必须 v4，creation 仍 v3；标题一致，分集可为合法批次。解析 script 的来源身份与 outline 一致，flow 与 notes 具有来源引用。flow 恰有一个 action/line/subtitle/sound 非空字符串；line 需要 speaker；audio 只属于 line/sound。opening/ending 不从 outline 复制，openingBeat 可选；beatClaims 顺序认领所有本集 B ID，坐标真实且不重叠。纯解析 targetSeconds 可缺省，提供则正数；制作时必须有 script 的确认目标。

creation 镜头仍须连续、恰好一次覆盖实际 flow，seconds 正数，总时长按 script.targetSeconds 与 tolerance（默认 0.15，明确值在 [0,1)）检查。audioRefs 为可选坐标数组，只能引用本集更早镜头拥有的 line，不可同镜、向前、行动、重复或越界。可跨段、跨场，但不是重复播放，也不重复计时。拥有镜头到最后续声镜头之间必须连续引用，不允许跳过中间镜头后恢复同次声音。缺少 script 不能核验声音引用。原句逐字与播放语义仍由对应阶段及内容审核承担。

本地接口检查不是模型技术验证、制作工作单批准或完整联合交付；fullDownstreamValidation/contentReview 均 not-performed。

## 公共 API

scripts/lib/source.mjs：sourceDocument(path,{artifactPath,id}) 读取并生成相对路径身份；sourceLines(bytes) 严格解码；unionRanges(ranges)/coverageOf(provenance) 合并统计；provenanceErrors(p,{episodes,requireEpisodes})/sourceRefsErrors(refs,p,path,{required}) 仅检查结构；verifySources(doc,{artifactPath|baseDir}) 返回 status/errors/documents/coverage/contentReview，必须明确解析路径边界。chunkScript(bytes,{kind:'script',maxLines,contextLines,documentId}) 返回准确 owned/context 坐标及原行。

checkup(doc,{stage,verifySources,artifactPath,baseDir,production}) 返回检查；validateOutline 返回错误字符串；computeAssets/read-only renderHtml/renderMarkdown 派生报告。createSkeleton 只返回未完成草稿，不推断来源或目标；newQuestion 只复制。
