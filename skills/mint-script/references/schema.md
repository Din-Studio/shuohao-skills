# script.json v4 数据契约

正式入口只接受 schemaVersion:4，outline 消费边界同为 v4。production 与 creation 仍为 v3。旧剧本必须显式迁移，不双读旧规划字段。Node 18+，标准库，无兄弟代码依赖。

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
- outline 事实：故事、人物、地点、道具、事件、分集及已登记问题提供来源引用。

内存结构检查只检查形状、并集与坐标。`verify-sources` 或 `--verify-sources` 才读取实际文件并核对哈希、行数和边界。文件变化、缺失、无法读取、非法编码均失败，不能跳过。`--production-ready` 同时执行来源核验与目标检查。核验成功不代表读懂剧情或通过语义忠实度审核。

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

sceneId 为 S 加至少两位数字。characters 是无重复 C ID 数组，可为空但不能缺省。包含无台词人物；画外人物若本场实际发声也明确登记。props 可选无重复 P ID 数组。lighting 可选非空文本。

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

## outline v4 消费边界

只接受已有剧本 provenance。删除 adaptation/arcs、params.adaptMode/minutesPerEpisode/episodes、beats.position/kind/weight/type、scenes.reusePlan。故事使用 summary，可选 focusCharacterIds/endingBeatId；endingBeatId 只能定位已识别的全剧终点，不因提供批次结束而填写。

分集保留 synopsis、引用，可选 opening 与 ending.event；ending.mode 可省略。问题保留 id/text/sourceRefs，可选 reason，禁止 resolution/dueByEp。原作未回答允许保持未知；resolves 仍为 B 上的 Q ID 数组，不能重复回答或早于问题提出。

本地校验覆盖实际消费接口，不替代 outline 的完整资产、身份或故事审核。characters.tier 与 scenes.primary 的含义由原阶段保留，不能因工具缺省而重写。

seed API 只做结构投影，建立 source、provenance、集号、按序 B 认领与空 scenes，不复制目标、开场集尾、Q、项目要求、默认参数。选择部分集时将 scope 改为 partial。CLI seed 先实际核验 outline 来源；输出到不同目录时传 `--output-path OUTPUT.json` 重定位相对来源路径。该选项不写文件；stdout 仍由调用方保存。不提供选项时保持相对于原 outline 目录的路径。

skeleton 允许空 scenes 和认领 null 端点，估时为 stage-incomplete；full 不允许。openingBeat 若提供，两阶段均必须有效。

## 发现、报告与下游

CLI 从产物目录向上最多五层寻找 production.json，从项目根 outline/art/characters 发现唯一 JSON。显式 --outline/--art/--cast 优先；多个候选必须明确指定。忽略 manifest、备份、临时及评审文件。损坏 JSON、非法 UTF-8、显式 null、错误版本、悬空链接不能当作缺少输入。--no-production 与 --production 互斥。

checkup 返回 gates/stats/blockingFailures/warnings/contentReview/sourceVerification/scope。validateScript 返回阻断错误数组。ctx 可传 stage、outline/art/cast/production、docPath/outlinePath/productionPath、verifySources、requireTarget、root、lang。requireTarget 是内存目标检查；实际来源读取另传 verifySources。API 不隐式猜测来源基准目录。

报告展示 sourceRefs、audio、notes 和 provenance。原始 JSON 导出不补默认值或目标。pass/fail/skipped 区分结构结果；未读取原件为 not-performed；语义审核始终另行完成。HTML 是派生产物，不进版本控制。

本地已知 creation v3 检查：作品、集号、可选 openingBeat、正数镜头秒数、目标、实际 flow 按顺序且恰好一次归属。cuts[].beats 仍为场内包含两端的连续范围。

可选 cuts[].audioRefs 为 `[[sceneIndex,beatIndex]]`，一基坐标，指向同集较早镜头已经拥有的 line。允许跨段、跨场；本镜头重复、向前引用、引用自己拥有的台词、动作或不存在位置均失败。每个镜头仍必须拥有实际正文拍，不能用 audioRefs 消除漏领或重复认领。它表示同一次播放延续，不表示重播。从拥有镜头到最后续声镜头必须连续引用，不能跳过中间镜头后再续声。相同台词的不同原文位置仍是两次实际发生。

该局部检查不替代制作模型硬限制、资产、参考图、派发材料和输入摘要审核。制作阶段必须纳入实际依赖的来源版本、选中场次 notes/audio 和跨段引用台词，相关变化应撤销对应批准，无关场次不应连带失效。
