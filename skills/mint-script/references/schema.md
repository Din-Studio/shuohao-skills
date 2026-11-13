# script.json v4 数据契约

正式入口只接受 schemaVersion:4，outline 消费边界只接受 v5。production 与 creation 仍为 v3。旧剧本必须显式迁移，不双读旧规划字段。Node 18+，标准库，无兄弟代码依赖。

## 独立创作与解析

```json
{
  "schemaVersion": 4,
  "source": "独立创作样例",
  "episodes": [{
    "ep": 1,
    "scenes": [{
      "sceneId": "S01",
      "characters": ["C01"],
      "flow": [{"action": "值夜员把手从开关上移开。"}]
    }]
  }]
}
```

独立创作不伪造 provenance。解析已有剧本必须提供 provenance，并给所有实际 flow 和 notes 提供 sourceRefs。不得通过删除 provenance 冒充独立创作来逃避来源核验；任务入口和内容审核负责确认来源性质。提供 outline 只做接口对账，不证明 script 已阅读来源。

source 始终是作品标题，不改成对象。可选 lang 为 zh/en。creativeBrief 是非空文本；production 与本地同时存在时阻断，先人工合并到项目配置。拒绝 creative、creativeContext、selection、decisions、overrides、seedNote、candidates 和平行 context 系统。转译候选只放在 .work，不属于正式 JSON。

## 来源版本、覆盖与定位

```json
{
  "kind": "script",
  "scope": "partial",
  "documents": [{
    "id": "night",
    "path": "夜班水尺-source.txt",
    "sha256": "填写原件原始字节的64位小写SHA256",
    "lineCount": 19
  }],
  "coverage": [{"documentId":"night","startLine":1,"endLine":19}],
  "totalEpisodes": 10
}
```

这是 provenance 的结构示意，sha256 示例文字不是合法摘要。id 唯一，path 相对 JSON 产物，不相对进程工作目录，不接受绝对路径。SHA256 对原始文件字节计算。UTF-8 严格解码。lineCount 为正整数；CRLF、LF、CR 都是换行，文件末尾的换行不额外产生空行。

scope 为 partial 或 complete。complete 必须覆盖所有提供文档的全部行，且已知 totalEpisodes，实际集号恰为 1..N。partial 可以从非第一集开始、存在缺集和未知结局。totalEpisodes 提供时必须为正整数。

coverage 表示负责范围，不是只供理解的上下文范围。重叠和相邻区间按位置取并集，不重复计数。不能按文本相同去重。

sourceRefs 使用与 coverage 相同的 documentId/startLine/endLine 三字段数组。行号从 1 开始，包含两端。每项必须在对应文档的已提供负责范围内；多段引用合法。没有 provenance 的孤立 sourceRefs 失败。解析时：

- flow 与 notes：每项都必须有非空 sourceRefs。
- episodes 与 scenes：可选，提供时同样核验；完整 flow 引用不能替代非发声 notes 自己的依据。
- outline 事实：故事、事件、分集及已登记问题提供来源引用；不消费人物、地点或道具身份表。

内存结构检查只检查形状、并集与坐标。`verify-sources` 或 `--verify-sources` 才读取实际文件并核对哈希、行数和边界。文件变化、缺失、无法读取、非法编码均失败，不能跳过。`--production-ready` 同时执行来源核验与目标检查。提供 cast/art 且有相应映射时，还读取映射版本快照实际依赖的资产来源原件，路径相对各自资产 JSON（资产阶段已有绝对路径也可核验），不把路径改写回产物。缺少资产 JSON 路径或相关原件同样失败。没有映射时不假称已读取资产原件，也不把无关资产来源改版关联到当前引用。核验成功不代表读懂剧情或通过语义忠实度审核。

公开本地 API：`lib/source.mjs` 的 evidenceErrors、provenanceErrors、sourceRefsErrors、verifySources(doc, artifactPath, {outline?})、unionRanges、sourceLineCount。verifySources 返回 status/errors/semanticReview；未提供解析来源为 not-applicable，语义审核永远 not-performed。rebaseProvenance(provenance, fromArtifactPath, toArtifactPath) 只改变相对路径，不改变版本或位置。

## 参数与估时

params 可省略。只保存用户明确覆盖：charsPerSecond 有限正数，默认 4.5；actionSeconds 有限正数，默认 2.5；tolerance 为 [0,1)，默认 0.15。拒绝未知参数及 rules/defaults/preferences 等旧配置。不将默认值回写 JSON。

- line：去除空白后的 JavaScript 字符串长度除以语速，标点计入。
- action：固定 actionSeconds。
- sound/subtitle：可选 seconds，必须有限正数；缺省使用 actionSeconds。
- notes：不计时、不朗读、不认领事件或镜头。
- audioRefs：延续既有一次发声，不新增 script flow，不重复估时。

场次、分集、落点、认领范围与报告共用未舍入累计轴。显示时才舍入一位小数。不可用或溢出时间轴阻断，不显示零秒。偏离已确认目标只提醒，不冒充实际表演或成片时长。没有目标时只展示估时，不伪造目标或差额。

## 分集、计划与事件认领

| 字段 | 契约 |
| --- | --- |
| ep | 唯一递增正整数；partial 或独立批次不必从 1 开始 |
| targetSeconds | 解析时可省略；提供时有限正数。进入制作 seed/check/export 前必须确认；只在 script 保存，不从 outline 推断 |
| opening / ending | 独立创作可选；有 outline 时禁止保存重复副本 |
| openingBeat | 可选一基 [场次序号, 场内节拍序号]；提供时必须存在，不默认指向第一拍 |
| beatClaims | 独立无节点可省略；有 outline 时按数组顺序认领全部当集 B ID |
| scenes | full 为非空有序数组；skeleton 可为空 |

独立 ending 只允许 mode/event，mode 为 suspense/closure/open，event 非空。独立 suspense 不强制建立 Q。结束坐标由 endBeatOf 从最后一个实际 flow 计算，不保存 endBeat。seedNote 的旧信息保存在迁移记录。

认领格式：`{"beatId":"B01","start":[1,3],"end":[2,2]}`。只允许这三个字段。B 加至少两位数字，全文件唯一；端点存在，包含两端，起点不晚于终点。后一个核心段严格晚于前一个终点。允许跨场次，允许范围之外的共同铺垫。来源引用不能代替事件认领。

有 outline 时 actual B ID 数组必须等于上游当集事件数组；漏领、多领、错集、重复、倒序、重叠或无效坐标阻断。修改正文后重新计算受影响坐标，不能因旧坐标还存在就声称语义有效。

## 场次、说明与执行正文

sceneId 为 S 加至少两位数字，是正文局部地点／出现标记，不是 art 地点身份，也不是场次顺序；场次由所在集及数组位置区分。characters 是无重复局部 C ID 数组，可为空但不能缺省。包含无台词人物；画外人物若本场实际发声也明确登记。props 可选无重复局部 P ID 数组。局部标记可区分同名人物、匿名声音、无台词人物或非人主体，不凭名字合并。身份未确定时保留区别和来源；只提及的人物或物品不强制建立制作资产。lighting 可选非空文本。

flow 非空。每项必须且只能有一个非空文本字段：action、line、subtitle、sound。

| 类型 | 附加字段 |
| --- | --- |
| action | sourceRefs、transformation |
| line | speaker 必须是场内 C ID 或 VO；可选 delivery、audio、sourceRefs、transformation |
| subtitle | 可选 seconds、sourceRefs、transformation；不是发声台词 |
| sound | 可选 seconds、audio、sourceRefs、transformation；不携带 speaker/delivery |

未知 flow 字段阻断。delivery 只表示发声表演差异，不能用“不发声”把心理说明伪装成台词。audio 仅用于 line/sound：

```json
{"mode":"offscreen","audibleTo":["C01","C03"],"subjective":false}
```

mode 为 onscreen/offscreen/voiceover/inner。audibleTo 可选，无重复场内 C ID 数组，空数组表示没有角色听见。subjective 可选布尔值。匿名 VO 不能替代已知角色的声音身份。字段一致不代表已核实实际发声者、次数或知情边界。

scene.notes 为可选数组，每项有非空 text、kind（performance/background/continuity/restriction），解析时必须 sourceRefs；可选 transformation。notes 不允许 line/speaker/action/sound/subtitle/audio/seconds/beatClaims。下游须收到选中场次的完整 notes，不强制为说明建立独立镜头。

transformation 为 `{reason,authorization}`，两个值都是非空文本，只保留这两个字段。授权必须来自真实任务或项目要求；工具只验证记录格式，不决定语义权限，也不自动批准改写。实际台词、明确 VO、关键字幕默认保留原句；改写须另有明确授权。

## 局部引用与资产映射

script.assetMappings 是唯一权威数组。不能在 scene、flow、outline 或独立映射文件建立第二份权威。缺省表示尚无映射，不表示相同 ID 自动映射。每项严格包含：

| 字段 | 契约 |
| --- | --- |
| kind | character / scene / prop |
| localId | script 中实际存在的局部 C/S/P 标记；kind + localId 唯一 |
| assetId | 明确目标资产 ID；来自 cast.characters / art.scenes / art.props，不按姓名查找 |
| status | confirmed / pending / conflict；未知不能默认 confirmed |
| sourceRefs | 非空一基包含端点范围；同时处于 script provenance.coverage、目标资产 sourceRefs 的位置并集、目标阶段 provenance.coverage |
| basis | 非空文本；说明来源核对或用户明确身份决定及依据，不冒充原文事实 |
| assetDigest | 完整目标资产 JSON 的 SHA256，小写 64 位；递归按对象 key 排序，保留数组顺序，无空白 JSON，UTF-8；不是 ID/name 或挑选字段的摘要 |
| documentVersions | 非空数组 `{id,sha256,lineCount}`；无重复，至少包含映射及完整目标资产 sourceRefs 涉及的文档；每个提供的快照都核验；同时匹配 script 与目标阶段的文档身份、原件摘要、行数；目标资产更广的来源范围不要求冒充 script 已读取范围 |

正式 cast/art 输入仅接受 schemaVersion 1，必须包含对应资产数组、唯一 ID、名称及匹配作品名。人物／美术生产端正式版本均为 v1；其他版本不能按形状相似隐式读取。无版本旧文件不隐式兼容，须在负责阶段显式版本化或迁移。映射引用的资产还须提供非空 sourceRefs 及有效 provenance 版本与覆盖；不能拿仅有设计提示词的旧资产冒充已核验来源。

没有已知目标时不伪造摘要或来源，可暂不建立该映射并在 notes 记录必要歧义。有候选但身份待核对时填写 pending/conflict，保留候选和真实依据。这些状态不等于确认；不因同名、别名、字符相同、图片文件名相同或用户要求“继续”自动确认。

自包含公开 API 位于 `scripts/lib/asset-mappings.mjs`：

```js
mappingErrors(script, ctx, {required: [{kind:'character',localId:'C01'}]});
mappingErrors(script, ctx, {required: true}); // 当前正文全部局部引用
mappedAssetId(script, 'character', 'C01'); // 唯一 confirmed 的 assetId，否则 null
assetDigest(asset); // 完整目标资产规范 JSON 的 SHA256
```

required 缺省为 []，false 同样表示无制作依赖。所有已提供映射始终检查结构、script 证据和版本记录；提供对应资产阶段时对账目标摘要、来源版本和范围。缺少可选资产阶段时不伪装成已核验；仅在它是 required 依赖时阻断。required 是 true/false 或 `{kind,localId}` 数组；null、字符串、未知引用等明确失败。mappedAssetId 只解析记录，不替代 mappingErrors 或原件读取；消费前仍须验证。

validateScript/checkup 接受 ctx.requiredMappings；--production-ready 同时确认目标、读取原件，并默认要求全部当前局部引用。--required-mappings FILE 可把范围显式限制为实际制作依赖；JSON 内容就是上述数组，不能将损坏文件伪装成空范围。选择的正确性仍需制作内容评审。

只有 required 引用需要 confirmed。无关待确认不冒称已通过，也不阻断另一个已确认依赖。资产增删或重排不按数组位置改写映射。某一资产摘要变化仅在指向它的映射给出失效诊断；其他资产不自动失效。目标合并、拆分、删除或身份纠正后，原映射不能按名字跳到新身份，须回查依据后显式修改。来源版本、负责范围或资产 sourceRefs 变化同样重新核验受影响的引用，不通过仅更新摘要掩盖未复核。

映射不改变正文顺序、场次边界、说话者当时称呼、声音主体、听者或来源。报告只在映射有效时于身份元数据显示目标名称和音色，正文台词说话者保留局部标记；正文中的实际台词不替换成资产姓名，也不提前揭晓身份。不同位置的相同台词仍是两次发生。无上游时名称保持局部标记，联合对账 skipped；即使提供全部阶段，没有请求制作身份依赖且无映射时也不宣称映射交接通过。

## outline v5 消费边界

正式入口只接受 schemaVersion:5；v4 及更早版本必须在原阶段显式迁移，不更改版本号冒充转换。不依赖 outline 的人物、地点、物品、分档、预算或资产调度；出现 characters/scenes/props、story.focusCharacterIds、分集 characterIds/sceneIds/propIds、params.thresholds 或 notes 的资产 ID/speakerId 即失败。

只接受已有剧本 provenance。故事使用 summary，可选 endingBeatId；endingBeatId 只能定位已识别的全剧终点，不因提供批次结束而填写。继续拒绝 adaptation/arcs、params.adaptMode/minutesPerEpisode/episodes、beats.position/kind/weight/type 等退役字段。

分集保留 synopsis、引用，可选 opening 与 ending.event；ending.mode 可省略。问题保留 id/text/sourceRefs，可选 reason，禁止 resolution/dueByEp。原作未回答允许未知；resolves 仍为 B 上的 Q ID 数组，不能重复回答或早于问题提出。故事、节点、分集、问题和 notes 的引用仍须处于 outline 已登记版本与负责范围。script 自身的来源文档身份、摘要与行数必须和 outline 对账。

本地校验只覆盖消费接口，不替代原阶段的完整故事审核。人物身份以 cast、地点及物品以 art 为准，不能从 outline 自然语言称呼推断同一身份。

seed API 只做结构投影，建立 source、provenance、集号、按序 B 认领与空 scenes，不复制目标、开场集尾、Q、项目要求、默认参数。选择部分集时将 scope 改为 partial。CLI seed 先实际核验 outline 来源；输出到不同目录时传 `--output-path OUTPUT.json` 重定位相对来源路径。该选项不写文件；stdout 仍由调用方保存。不提供选项时保持相对于原 outline 目录的路径。

skeleton 允许空 scenes 和认领 null 端点，估时为 stage-incomplete；full 不允许。openingBeat 若提供，两阶段均必须有效。

## 发现、报告与下游

CLI 从产物目录向上最多五层寻找 production.json，从项目根 outline/art/characters 发现唯一 JSON。显式 --outline/--art/--cast 优先；多个候选必须明确指定。忽略 manifest、备份、临时及评审文件。损坏 JSON、非法 UTF-8、显式 null、错误版本、悬空链接不能当作缺少输入。--no-production 与 --production 互斥。

checkup 返回 gates/stats/blockingFailures/warnings/contentReview/sourceVerification/scope。validateScript 返回阻断错误数组。ctx 可传 stage、outline/art/cast/production、docPath/outlinePath/castPath/artPath/productionPath、verifySources、requireTarget、requiredMappings、fullWorkflow、root、lang。requireTarget 是内存目标检查；实际来源读取另传 verifySources。API 不隐式猜测来源基准目录。

报告展示 sourceRefs、audio、notes 和 provenance。原始 JSON 导出不补默认值或目标。pass/fail/skipped 区分结构结果；未读取原件为 not-performed；语义审核始终另行完成。HTML 是派生产物，不进版本控制。

本地已知 creation v3 检查：作品、集号、可选 openingBeat、正数镜头秒数、目标、实际 flow 按顺序且恰好一次归属。cuts[].beats 仍为场内包含两端的连续范围。

可选 cuts[].audioRefs 为 `[[sceneIndex,beatIndex]]`，一基坐标，指向同集较早镜头已经拥有的 line。允许跨段、跨场；本镜头重复、向前引用、引用自己拥有的台词、动作或不存在位置均失败。每个镜头仍必须拥有实际正文拍，不能用 audioRefs 消除漏领或重复认领。它表示同一次播放延续，不表示重播。从拥有镜头到最后续声镜头必须连续引用，不能跳过中间镜头后再续声。相同台词的不同原文位置仍是两次实际发生。

该局部检查不替代制作模型硬限制、资产、参考图、派发材料和输入摘要审核。制作阶段必须纳入实际依赖的来源版本、选中场次 notes/audio 和跨段引用台词，相关变化应撤销对应批准，无关场次不应连带失效。
