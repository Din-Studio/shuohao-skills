# 版本切换、身份生命周期与迁移

## 正式版本矩阵

| 输入或消费者 | 正式支持 | 旧项目处理 |
| --- | --- | --- |
| art seed | 原剧本 + 标题；可选既有 art v1 | 不再 seed outline 资产表 |
| art validate/checkup/render/images | art v1，kind: mint-art | 未版本化旧美术文件显式 migrate-art；其他版本报错 |
| outline 故事背景 | outline v5 | v3/v4 仅 migrate-outline 导出待核验材料 |
| 人物输入 --cast | cast v1，kind: mint-characters | 未版本化名单不当作身份权威；由人物生产者迁移 |
| 视觉配置 | production v3 | 旧配置由其生产者显式升级；不提供默认生成参数 |
| 离线图片计划 | schemaVersion 1；逐任务 inputDigest | 原提示词、依赖、技术参数和路径保留 |
| script 正文与映射 | script v4；映射权威 script.assetMappings | C/S/P 相同不代表已映射；实际消费兼容性由调用方核验 |
| creation 工作单与提示词审核 | creation v3；通过 script 映射指向 cast/art | 身份、来源、图片或批准改变后核验相关依赖 |

本目录只实现 art 端，不声称其他消费者升级或全项目联合测试已经通过。升级顺序：先故事和身份生产端，再 script、creation、派发材料及审核消费者。旧项目可以固定旧工具继续运行；不能直接修改版本数字或隐式双读两种语义。

## 消费位置与新权威

| 原读取位置 | 新权威 | 无上游 | 联合制作阻断条件 |
| --- | --- | --- | --- |
| seed 的 outline.scenes/props/episodes 资产表 | 原件 + 本阶段 registry/facts | 原件不可缺；独立原创设计另行声明 | 身份未确认、来源未读或范围不符 |
| 原 primary/reusePlan、主场景数量预算 | art 制作决定及 budgets | 无明确预算为 skipped；参考值不阻断 | 明确美术预算超额 |
| carriedBy、角色名称禁词 | cast 身份；carrierRefs 显式 C ID | 禁名对账 skipped；不得批准人物关联 | 实际人物关联缺权威、歧义或冲突 |
| 场景 usage.beats、道具 beatIds | outline v5 剧情节点；落点由原件明确支持 | 剧情对账 skipped | 已提供节点不存在或所属集不符 |
| script 场次、地点和物品局部标记 | script 正文位置 + assetMappings | 独立正文可继续，映射 skipped | 制作依赖未确认映射、原件版本或范围不符 |
| creation 名称、工作单、设定图路径、提示词包 | script 映射 + 当前 art 身份/设计/媒体 | 单独结构检查不等于联合批准 | 实际依赖缺身份、必要图片、最新摘要或批准 |
| 图片及审核历史 | 原路径、原文件和实际内容审核 | 未提供旧材料明确待核对 | 沿用 ID 但相关输入摘要已经变化 |

不把 art 的引用关系作为 script 的第二份映射权威。身份变化只要求重新核验受影响的联合引用，不自动宣称所有无关制作批准失效。

## 显式旧数据迁移

```bash
node scripts/mint-art.mjs migrate-art old-art.json --out art-pending.json --related old-script.json --related old-creation.json --related old-review.json
node scripts/mint-art.mjs migrate-outline outline-v4.json --out outline-assets-pending.json
```

输出使用排他创建；不覆盖旧文件、不移动原图、不删除历史批准。migrate-art 保留原设计、提示词、状态、视觉变体、媒体路径、审核历史和完整原值，固定旧图片路径；旧批准留在历史，不升级成新身份确认。当前原件路径重定位为绝对路径。

migrate-outline 只接受显式 v3/v4，v4 回查原件。尽可能沿用原 S/P ID，但全部身份是 pending；不把 outline 资产表或原 ID 当作独立识别已经通过。原 characters、来源、别名、notes、分集 C/S/P 引用、props.beatIds、焦点人物、speakerId、预算均保存在 migration.original 和逐字段 fields 中。每项记录原字段路径、原值及 pending 状态。不能归属本阶段的关系仍在 unresolved，不能静默丢弃。

旧 scenes/maxScenes、primaryScenes/maxPrimaryScenes、props/maxProps 的非负整数明确预算投影到本产物 budgets，保留原值；角色预算及不支持形状留在待归属关系。参考值不能替代明确预算。

正式校验从 migration.original 重建明确美术预算基线，并与当前实际生效的 budgets 比较。旧美术原件中的 explicit budgets 同样纳入基线。即使所有 fields 已核对、migration.status 已为 reviewed，删除、改值或降级为 reference 仍须 budgetChanges 提供匹配原值和当前值的 key/from/to/basis。删除时 to 为 null。空的增量预算快照不能覆盖迁移原件基线。

--related 可重复，显式提供但不可读会失败；保存材料路径、字节摘要及 pending 状态。没有提供旧 script、creation、图片或审核材料不代表已核对，/related 待处理项会保留。核对 ID、图片路径、批准及受影响依赖后记录处理依据。所有 fields 都须保留原路径和原值，写明处理依据，状态为 mapped/retained/not-applicable；关联材料为 reviewed/not-applicable 并写明依据；unresolved 为空，migration.status 为 reviewed；并重新确认实际身份和来源后才可能通过正式校验。不能只改 reviewed 字段就冒称通过。

## 稳定身份与增量

registry.entries 为 `{id,key,status:"active"|"retired"}`。register 使用该种类已分配最大编号加一；身份 key 和 ID 永不复用。既有产物重排或新增剧集不改编号。

身份变更追加 registry.changes：
```json
{
  "id": "change-001",
  "type": "merge",
  "from": ["P01", "P02"],
  "to": ["P01"],
  "basis": "原件复读确认是同一面蓝旗；旧版误将别名作为两件实物",
  "sourceRefs": [{"documentId":"D01","startLine":2,"endLine":3}]
}
```

merge 多对一；split 一对多；delete 一对空；correct 一对一。未继续使用的旧 ID 必须退休。不同种类不可合并。correct 保持同一永久 key，纠正名字或事实不代表分配给另一个对象。被合并、拆分、删除的原 ID 与映射保留；原变更记录不能修改。reconcile 更新每个相关活动身份的 lifecycleStamp，并记录 incremental.recheckIds。即使合并目标仍沿用原 ID，其 assetDigest 也会改变，旧联合映射和制作输入必须重新核验；没有参与变更的身份不自动失效。

```bash
node scripts/mint-art.mjs reconcile candidate.json --previous old-art.json --out reconciled.json
node scripts/mint-art.mjs identity-inputs reconciled.json
# 人工/模型复读受影响事实，填写确认，完成本次范围后设 status: ready
node scripts/mint-art.mjs validate reconciled.json --previous old-art.json
```

reconcile 核验而不代作语义决定。基线摘要、既有 registry、身份摘要及预算快照保存在 incremental，未改变身份保留确认，变化身份回到 pending。既有明确预算删除或修改需 budgetChanges 保存 key/from/to/basis。源文件改版可以 seed --existing，原 ID、设计和图片保留，相关来源范围及确认撤回。

正式 JSON 是本阶段权威，需保留项目版本历史及可信基线；脚本不把可编辑 JSON 当作不可篡改数据库，不新增共享身份服务或失败累计日志。

## 核验

`node scripts/run-selftests.mjs` 运行全部离线测试，包括历史视觉行为、显式迁移、原件改版/缺失、partial/覆盖缺口、身份合拆删纠正、ID 不复用、预算、独立设计和单独复制运行。`fixes-selftest.mjs` 覆盖四项真实 CLI 回归：迁移预算生效值、活动证据版本一致性、outline v5 完整消费边界、design 来源对账；逐项在临时独立副本中移除防护，要求对应回归失败，验证消融敏感性。不会调用模型或付费工具。跨阶段语义和实际媒体审核仍须独立完成。
