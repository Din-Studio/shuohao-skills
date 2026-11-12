# script.json v3 数据契约

正式入口只接受 schemaVersion: 3。v2 只由显式迁移读取，不双读旧字段。Node 18+，标准库，无兄弟代码依赖。

## 最小独立剧本

```json
{
  "schemaVersion": 3,
  "source": "修伞簿",
  "episodes": [{
    "ep": 1,
    "targetSeconds": 60,
    "scenes": [{
      "sceneId": "S01",
      "characters": ["C01"],
      "flow": [{"action": "林禾合上修伞簿。"}]
    }]
  }]
}
```

这个例子结构有效，但估时短于目标，会显示提醒。结构通过不代表内容完成。

顶层可选 lang（zh/en）、creativeBrief（非空字符串）、params。项目与本地同时有非空 creativeBrief 时阻断并要求人工合并进 production。production 必须声明 schemaVersion:3；本地只检查所消费的项目接口，不替代制作配置完整检查。

拒绝 creative、creativeContext、selection、decisions、overrides、seedNote；params 拒绝 rules、defaults、preferences、hookWindow、maxLineChars 及其他未知参数。旧内容按迁移说明处理。

## 参数与估时

params 可省略。提供时只能含用户明确覆盖：
- charsPerSecond：有限正数，工具默认 4.5。
- actionSeconds：有限正数，工具默认 2.5。
- tolerance：[0,1) 有限数，工具默认 0.15。

paramsOf / effectiveParams 统一解析，validate/render/seed 不回写默认值。台词按去除空白后的 JavaScript 字符串长度除以语速估算，标点计入；动作使用固定秒数。所有场次、分集、开场、节点范围与报告使用同一未舍入累计轴，只有显示值舍入一位小数。

无效数值、不可用或溢出的时间轴阻断。粗略估时偏离目标只显示提醒；不冒充实际表演或成片时长。

## 分集与计划来源

| 字段 | 契约 |
| --- | --- |
| ep | 唯一递增正整数；批次不必从 1 开始 |
| targetSeconds | 有限正数；有大纲时严格等于 minutesPerEpisode × 60 |
| opening / ending | 独立模式可选；有 outline 时禁止保存重复计划 |
| openingBeat | 可选 1 起始 [场次序号, 场内节拍序号]；提供就必须存在，null 不合法 |
| beatClaims | 独立无节点时可省略；有 outline 时逐个认领所有当集节点 |
| scenes | 完整阶段为非空有序数组 |

独立 opening 提供时非空。独立 ending 只允许 mode/event，mode 为 suspense/closure/open，event 非空。Q 计划仍归大纲；独立 suspense 不要求 Q。

endBeat 删除，endBeatOf(ep) 从最后一个实际 flow 项计算，没有正文时返回 null。openingBeat 缺省不是确认第一拍；报告明确未标注和未核验。seedNote 删除，其创作信息保存在迁移工作记录。

有大纲时计划来自当前显式加载或唯一发现的大纲，不能从旧剧本副本读取。source 与集号核对仅是基本身份检查，不代表内容已同步；每次都要按实际节点 ID 对账，并单独评审正文。导出 Markdown/HTML 可附计划，但 JSON 导出保持原输入。

## 节点认领

```json
{"beatId":"B01","start":[1,3],"end":[2,2]}
```

每项仅允许 beatId/start/end。B 加至少两位数字，全文件唯一。端点存在，范围包含两端，start 不晚于 end。后一个核心段严格晚于前一个结束，不能重叠。允许跨场次和范围之外的共同铺垫。

有 outline 时 actual ID 数组必须等于本集上游 beats 的 ID 数组，未分类节点同样认领。漏领、多领、错集、重复、倒序、重叠或无效坐标阻断。独立模式仍检查已提供认领的格式、范围与顺序，只跳过依赖上游的对账。改正文后必须重新计算受影响坐标。

## 场次与正文

sceneId 为 S 加至少两位数字。characters 是无重复 C ID 数组，可为空，但不可缺省；无台词人物不能自动删除。props 可选无重复 P ID 数组。lighting 可选非空文本，只保存有意义的状态。

flow 非空，每项 action 或 line 二选一。action 非空，不允许 speaker/delivery。line 非空，speaker 必须是场内人物或 VO。delivery 可选非空文本，特殊表演说明在台词本保留。动作台词不必交替。

大纲提供人物、场景与道具 ID 时检查实际引用；art 提供时额外核对资产与光照登记。cast 提供时检查人物名称、可选 ID 和音色提示词类型。art/cast 接受既有无版本契约或 schemaVersion:1，不强行升级媒体输出版本。

## 上游边界与骨架

outline 边界接受 v3、非空 source、合法目标时长、分集计划、人物和资产 ID、按集号不递减的节点。position/kind 可选，填写则检查枚举；同集以数组顺序为准。weight 仅在 kind=payoff 时可选 minor/major。setup/outcome 必须非空。拒绝废弃字段。

这里只检查剧本消费接口，不重复大纲完整 story/Q 验证。已登记 required 问题、唯一解决、期限与原文证据须由大纲校验完成；报告不据此宣称通过。

seed 仅创建 source、目标、按序认领 ID 与空 scenes，不复制计划、Q、默认参数或创作要求。认领 start/end 为 null。skeleton 允许这些空场次和空认领端点，估时标为 stage-incomplete；full 不允许。openingBeat 无论哪个阶段，提供时都必须是真实坐标。

CLI 从产物目录向上最多五层查找 production.json，项目产物应位于项目根 script/。发现损坏文件、悬空链接、非法 UTF-8、显式 null、错误版本均失败。--no-production 禁止自动读取项目配置，与 --production 互斥，不等于禁止读取已经明确提供或唯一发现的大纲。

CLI 从项目根 outline/、art/、characters/ 发现唯一 JSON，忽略 manifest、备份、临时及评审文件。显式 --outline/--art/--cast 优先；未显式指定且有多候选时报错，不能自行挑选。真正缺少上游为 skipped/missing-upstream。

## 检查与下游接口

gateReport 返回本阶段结构检查；checkup 返回 gates/stats/blockingFailures/warnings/contentReview/scope。validateScript 返回阻断错误数组。ctx 接受 outline/art/cast/production、stage、lang、docPath/productionPath；提供 root 时 checkup/validateScript 还检查已知 creation JSON。

status 为 pass/fail/skipped。error 失败阻断；warn 失败显示提醒，不计通过。内容评审始终为 not-performed。render 可输出损坏结构的诊断报告并返回非零；不支持的数据版本先拒绝。

CLI validate/checkup/render 自动检查已知 creation v3 的作品、集号、可选开场落点、实际 flow 顺序覆盖、正数镜头秒数与目标。creation 不保存 opening/ending/endBeat 副本；其内容从当前计划和正文读取。缺省 openingBeat 不得伪造映射。局部下游检查不代替 creation 的模型硬限制、参考图身份顺序、资产及内容评审。

全部正式命令及示例只维护在 [README](../README.md)。迁移详见 [migration.md](migration.md)。
