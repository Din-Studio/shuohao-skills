# 接口、身份生命周期与增量

## 正式接口

| 输入或消费者 | 正式接口 | 其他版本 |
| --- | --- | --- |
| art seed | 原剧本 + 标题；可选既有 art v1 | outline 不提供资产表，不能 seed 资产 |
| art validate/checkup/render/images | art v1，kind: mint-art | 报错 |
| outline 故事背景 | outline v5 | 报错 |
| 人物输入 --cast | cast v1，kind: mint-characters | 报错；未版本化名单不当作身份权威 |
| 视觉配置 | production v3 | 报错；不提供默认生成参数 |
| 离线图片计划 | schemaVersion 1；逐任务 inputDigest | — |
| script 正文与映射 | script v4；映射权威 script.assetMappings | C/S/P 相同不代表已映射 |
| creation 工作单与提示词审核 | creation v3；通过 script 映射指向 cast/art | 身份、来源、图片或批准改变后核验相关依赖 |

本目录只实现 art 端，不声称其他消费者或全项目联合测试已经通过。

## 权威归属

| 关注点 | 权威 | 无上游 | 联合制作阻断条件 |
| --- | --- | --- | --- |
| 地点与物品身份 | 原件 + 本阶段 registry/facts | 原件不可缺；独立原创设计另行声明 | 身份未确认、来源未读或范围不符 |
| 主场景、复用、变体与美术预算 | art 制作决定及 budgets | 无明确预算为 skipped；参考值不阻断 | 明确美术预算超额 |
| 人物关联、角色名称禁词 | cast 身份；carrierRefs 显式 C ID | 禁名对账 skipped；不得批准人物关联 | 实际人物关联缺权威、歧义或冲突 |
| 场景 usage.beats、道具 beatIds | outline v5 剧情节点；落点由原件明确支持 | 剧情对账 skipped | 已提供节点不存在或所属集不符 |
| script 场次、地点和物品局部标记 | script 正文位置 + assetMappings | 独立正文可继续，映射 skipped | 制作依赖未确认映射、原件版本或范围不符 |
| creation 名称、工作单、设定图路径、提示词包 | script 映射 + 当前 art 身份/设计/媒体 | 单独结构检查不等于联合批准 | 实际依赖缺身份、必要图片、最新摘要或批准 |

不把 art 的引用关系作为 script 的第二份映射权威。身份变化只要求重新核验受影响的联合引用，不自动宣称所有无关制作批准失效。

## 稳定身份与增量

registry.entries 为 `{id,key,status:"active"|"retired"}`。register 使用该种类已分配最大编号加一；身份 key 和 ID 永不复用。既有产物重排或新增剧集不改编号。

身份变更追加 registry.changes：
```json
{
  "id": "change-001",
  "type": "merge",
  "from": ["P01", "P02"],
  "to": ["P01"],
  "basis": "原件复读确认是同一面蓝旗；此前误将别名作为两件实物",
  "sourceRefs": [{"documentId":"D01","startLine":2,"endLine":3}]
}
```

merge 多对一；split 一对多；delete 一对空；correct 一对一。未继续使用的原 ID 必须退休。不同种类不可合并。correct 保持同一永久 key，纠正名字或事实不代表分配给另一个对象。被合并、拆分、删除的原 ID 与映射保留；既有变更记录不能修改。reconcile 更新每个相关活动身份的 lifecycleStamp，并记录 incremental.recheckIds。即使合并目标沿用原 ID，其 assetDigest 也会改变，联合映射和制作输入必须重新核验；没有参与变更的身份不自动失效。

```bash
node scripts/mint-art.mjs reconcile candidate.json --previous previous-art.json --out reconciled.json
node scripts/mint-art.mjs identity-inputs reconciled.json
# 人工/模型复读受影响事实，填写确认，完成本次范围后设 status: ready
node scripts/mint-art.mjs validate reconciled.json --previous previous-art.json
```

reconcile 核验而不代作语义决定。基线摘要、既有 registry、身份摘要及预算快照保存在 incremental，未改变身份保留确认，变化身份回到 pending。既有明确预算（`--previous` 产物或 incremental.previousBudgets）删除、改值或降级为 reference，必须由 budgetChanges 保存匹配基线与当前值的 key/from/to/basis；删除时 to 为 null。原件改版可以 seed --existing，原 ID、设计和图片保留，相关来源范围及确认撤回。

正式 JSON 是本阶段权威，需保留项目版本控制及可信基线；脚本不把可编辑 JSON 当作不可篡改数据库，不新增共享身份服务或失败累计日志。

## 核验

`node scripts/run-selftests.mjs` 运行全部离线测试，包括视觉检查、原件改版/缺失、partial/覆盖缺口、身份合拆删纠正、ID 不复用、预算、独立设计和单独复制运行。`fixes-selftest.mjs` 覆盖四项真实 CLI 回归：既有明确预算生效值、来源文档身份唯一、outline v5 完整消费边界、design 来源对账；逐项在临时独立副本中移除防护，要求对应回归失败，验证消融敏感性。不会调用模型或付费工具。跨阶段语义和实际媒体审核仍须独立完成。
