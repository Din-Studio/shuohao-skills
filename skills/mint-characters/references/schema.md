# 正式人物身份契约：cast v1

版本独立于 outline v5、production v3。正式产物：`schemaVersion: 1, kind: mint-characters`。validate、render、images 只接受此版本，其他版本、无版本对象或裸数组一律失败。

```json
{
  "schemaVersion": 1,
  "kind": "mint-characters",
  "status": "draft",
  "source": "回声台",
  "lang": "zh",
  "summary": "停电中的交接。",
  "provenance": {
    "kind": "script",
    "scope": "partial",
    "documents": [{"id":"D01","path":"原剧本.txt","sha256":"64位小写十六进制摘要","lineCount":10}],
    "coverage": [{"documentId":"D01","startLine":1,"endLine":3}]
  },
  "characters": [{
    "id": "C01",
    "identityKey": "night-operator",
    "name": "许禾",
    "aliases": [{"name":"小禾","sourceRefs":[{"documentId":"D01","startLine":2,"endLine":2}]}],
    "entityType": "human",
    "presence": ["visible"],
    "speech": "speaking",
    "unknowns": [],
    "sourceRefs": [{"documentId":"D01","startLine":1,"endLine":2}]
  }],
  "budgets": {"characters": 30},
  "lifecycle": {"revision":0,"previousHash":null,"registry":[],"changes":[],"recheckIds":[]},
  "review": {"status":"pending","note":"尚未语义审核"}
}
```

以上为候选结构示意，摘要占位符不能提交；revision 0 仅为骨架。通过 reconcile 后才能进行正式结构核验。

## 身份字段

- `id`：C 加至少两位数字，唯一。首次 reconcile 可以分配；后续永久沿用，不按数组或剧集顺序分配。
- `identityKey`：作者定义的永久唯一键，不是名字，不是出场序号。ID 及该键退役后均不复用。
- `name`：来源支持的展示称呼。匿名主体使用位置与描述；允许同名，不允许按名字自动认定同人。
- `aliases`：对象数组，每个别名必须有 name 和 sourceRefs。不是搜索词，不把猜测称呼当作已确认别名。
- `entityType`：human / nonhuman / unknown / group。
- `presence`：非空去重数组，元素为 visible / voice-only / mentioned。无台词不是“没有身份”；同一身份可有多种出场方式。
- `speech`：speaking / silent / unknown，指本次已核验范围，不为缺台词者编造声线事实。
- `unknowns`：非空字符串组成的数组，允许空数组。匿名、身份未揭晓、声音可能为录音等写在这里。
- `sourceRefs`：非空引用数组。documentId、startLine、endLine 必须在已读取范围内；可附 quote，核验该行范围内逐字连续文本。
- `notes`：可选数组，每项非空 text 和 sourceRefs，保存必要的原文身份限制。
- `persona`、`voice`、`image`：独立可选设计块。提供时检查其完整字段，详见 [设计契约](design-schema.md)。人物关系必须填已有稳定 `id`，name 仅展示；不能靠同名猜测。
- `importance`、`oneLiner`：可选，提供时按 [设计契约](design-schema.md) 的枚举和文本规则检查。outline 不负责分档。
- `tier`：可选 lead/support/functional，由人物阶段明确判定。存在分档预算时所有活动人物必须提供；不能从 importance 或原文提及次数机械推断。

## 来源与覆盖

documents 的身份、路径、原始字节 SHA256、物理行数均需核验。路径相对产物 JSON，不相对进程目录。seed 和 reconcile 输出绝对原件路径。多文档均独立核验，不按文本相同合并出处。

coverage 为实际已读区间。重叠区间按位置合并核验，不能跨缺口引用。partial 不要求全集；complete 必须覆盖每份原件全文，人物阶段不引入分集权威。缺原件直接失败，不能标为 skipped。

`background` 为可选 outline v5 文件 path、sha256、role: story-only。提供则核验文件和共同原件版本；已绑定文件损坏或变化必须失败。没有背景时检查 skipped，不代表完整流程已完成。

## 生命周期与预算

`budgets.characters` 为可选非负整数，限制活动身份总数（不是画像、图片或声音任务数）。`maxLeads/maxSupport/maxFunctional` 为可选非负整数，分别限制 tier=lead/support/functional 的活动身份，不得合并成总数而改变约束。明确预算超额，或分档预算尚缺 tier 判定，均阻断。

`budgets.reference` 可保存相同键的参考值，仅提醒，不阻断。不设置则无明确预算。未知预算键报错，不得丢弃或降级。

增量产物保留 lifecycle.previousBudgets。明确预算的改值、删除或改成参考值必须记录唯一 `budgetChanges: [{key,from,to,basis}]`，basis 是用户的本次变更依据，删除时 to 为 null。reconcile 和 validate 都核对基线；不能通过重新登记悄悄放宽预算。

lifecycle 由 reconcile 维护：revision、previousHash（既有产物规范化 JSON 摘要）、registry（包含退役身份）、累计显式 changes（来源依据附 sourceDocuments 版本快照）和 recheckIds。registry 保存 id、identityKey、active/retired、allocatedRevision、fingerprint；指纹包含身份事实和相关原件版本，不包含展示顺序、路径或设计。每个活动人物的 lifecycleStamp 绑定与该人物有关的合并、拆分、删除及纠正记录。即使合并后继续使用原 ID、姓名和来源文字，目标完整资产摘要也会变化，强制重新确认受影响映射；无关人物的摘要不变。

revision 大于 1 的 validate/render/images 必须提供 `--previous`，按原基线重放本次变更，核对摘要、登记表和映射。不能只拿新文件自证既往变更正确。变化后的 ID 对实际消费的工作单、提示词、参考图及映射触发重新核验；本阶段不保存 script 的局部映射权威。

## 审核与报告接口

status 为 draft 或 identified。identified 要求 review.status=confirmed，填写 by、note、inputHash。inputHash 取 validate 输出 reviewInputHash，绑定当前身份、来源版本、范围和覆盖。审核确认由人工或模型完成，不由脚本生成。

validate 输出 `kind: mint-characters-checks, schemaVersion: 1, reviewInputHash, checks`。每项为 status/category/level/detail，未执行的语义审核及联合交接为 skipped。

正式离线图片计划保持 media-plan v1，任务 ID 使用 C ID，增加 identityFingerprint；路径为 `images/<C ID>-sheet.png`。计划不提交、不生成。正式报告导出原始 JSON，不将自动发现的图片路径写入原始身份数据。
