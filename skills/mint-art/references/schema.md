# art v1 数据契约

正式文档必须包含 `schemaVersion: 1, kind: "mint-art"`；其他版本或缺少版本一律报错。production 为 v3，故事背景仅 outline v5，人物身份仅 cast v1（kind: mint-characters）。版本数字不要求跨阶段相同。

## 顶层字段

| 字段 | 规则 |
| --- | --- |
| schemaVersion / kind | 固定 1 / mint-art |
| source | 非空作品标题，不是来源文件路径 |
| mode | script：已有原剧本；design：独立原创设计，不伪造来源 |
| status | draft / ready；draft 不能通过正式 validate |
| provenance | script 必需；文档身份、版本、范围见来源文档 |
| scenes / props | 必需数组，允许为空 |
| registry | entries / changes 必需数组；稳定 ID 和退休记录 |
| budgets | 必需对象，无预算时为空；不静默落盘参考默认值 |
| observations | 可选；未建立资产或尚未确定的线索、依据和 sourceRefs |
| incremental | 增量基线 previousDigest、previousRegistry、previousIdentities、previousBudgets，以及受影响 recheckIds |
| budgetChanges | 明确预算变更的 key/from/to/basis；不得无依据取消预算 |
| lang | 可选 zh/en；只影响报告默认语言 |

```json
{
  "schemaVersion": 1,
  "kind": "mint-art",
  "source": "原创空间",
  "mode": "design",
  "status": "draft",
  "scenes": [],
  "props": [],
  "registry": {"entries": [], "changes": []},
  "budgets": {}
}
```

这是未识别骨架，不是已完成资产清单。原剧本骨架另含 provenance，coverage 初始为空，不能声称已经阅读。

## 资产身份与确认

每个资产必需：`id`、永久 `identityKey`、`name`、`decision`、`identityReview`、`designStatus`。场景另需布尔 `primary`；script 模式另需非空 `sourceRefs`。

- 地点 S 加至少两位数字，物件 P 加至少两位数字。ID、永久 key 唯一，退休后永不复用。
- decision 说明为何需要美术资产，不是自动复制场次名称或正文中的名词。
- facts 保存可定位的来源事实、状态和限制。事实的 notes/aliases 等嵌套 sourceRefs 同样检查。
- identityReview 为 `{status:"pending"}` 或 `{status:"confirmed",basis:"非空复核依据",inputDigest:"64位小写SHA256"}`。摘要来自 identity-inputs；命令不替人填写确认。
- 摘要包括标题、mode、身份字段、全部资产引用、实际涉及文档的 ID/摘要/行数，以及引用是否处于负责范围。图像提示词等设计文本不冒充身份事实。更改引用或相关原件版本后既有确认不能沿用。
- lifecycleStamp 是该身份相关 registry.changes 的摘要，由 reconcile 更新。合并后继续使用的目标 ID 同样改变逐资产摘要，既有联合映射不能因 ID 沿用而跳过复核。
- 资产数组重排、增加未关联集号不改变身份。引用重核、关系变化和设计变化分别影响对应审核，不能一概宣称无关资产失效。
- designStatus 为 none / planned / ready。none 不要求 summary、锚点、光照、状态或 image；已存在 image 不得标成 none 隐藏设计。
- register 为新资产设置固定 `imageStem: ID`。它不随名称变化。手工产物可显式提供稳定 imageStem 或 sheetImage。
- `relatedScenes` 只能引用本产物地点。人物关系使用 `carrierRefs: [{characterId,basis,sourceRefs}]` 并提供 cast；资产不接受 carriedBy 自由名称或 sourceFacts 字段，来源事实写入 facts 与 sourceRefs。
- `usage: {episodes,beats,beatIds?}` 可选。集号为无重复正整数；B ID 引用由已提供 outline 对账。共同出现于一集不能证明节点发生于某个地点。
- `variantOf` 只能引用现有地点，不能自身引用或循环；必需 changes。是否新增视觉变体资产由制作需求决定，不按每个场次复制身份。

## 预算

```json
{
  "primaryScenes": {"kind":"explicit","max":3},
  "props": {"kind":"explicit","max":5},
  "scenes": {"kind":"reference","max":8}
}
```

允许键 scenes、primaryScenes、props。max 为非负安全整数。explicit 超额是 error 阻断；reference 超额为 warn 提醒。计数为登记资产数，不是图片任务数。角色预算不属于本产物，由 characters 负责。

明确预算基线为 `--previous` 既有 art 或 incremental.previousBudgets 中的明确美术预算。当前 budgets 删除、改值或降级必须提供与基线及当前值匹配的 budgetChanges；不能通过清空 budgets 或改为 reference 静默取消阻断。

## 可选设计字段

planned / ready 设计遵循以下视觉规则，none 不适用：

| 场景字段 | 规则 |
| --- | --- |
| summary | 非空设计意图；结构、动线及主光方向由人工/模型复核 |
| anchors | 3–5 个 {name,desc}；明确可画特征及方位 |
| lighting | 至少一个 {state,prompt}，prompt 英文并写色温数值（如 5500K）；`lighting[0]` 是基准设定图画的光影锁 |
| image | prompt、negativePrompt、sheet 非空；tags 英文数组；sheet 为四方向宫格加正交平面图（含 two-by-two grid、orthographic）并以纯净画质段收尾 |
| 画风、画幅 | production 提供时按 style.scene 和 image.asset 核验 |

| 道具字段 | 规则 |
| --- | --- |
| summary | 戏剧功能与设计意图，不是来源事实的替代品 |
| anchors | 3–5 个 {name,desc} |
| states | 至少一个 {state,prompt}，prompt 英文；`states[0]` 是基准状态，`states[1]` 起每条是完整变体提示词（含纯净画质段），各自进入出图计划 |
| scale | 手持级（长边 30 厘米以内）/ 桌面级（30–60 厘米）/ 家具级（60 厘米以上）；sheet 含对应的尺寸参照英文句（见 PROP_SCALES） |
| image | 提示词英文；sheet 三格版式，明确 white background，含匿名尺寸参照句与 actual size about，以纯净画质段收尾；反向词不禁手、不禁人 |

场景反向词禁人并完整带入 style.scene.negative；道具白底不强加与之矛盾的环境反向词，也不禁右格尺寸参照要画的手和人。提示词不含角色名（提供 cast 时核验）。production 缺失为 skipped，不提供出图默认值。ready 设计不等于媒体生成或批准。

## 检查与报告

检查对象为 status: pass/fail/skipped、category、level、detail，可选 reason。只有 fail + error 阻断；跳过不算通过。v1 保留 Markdown/HTML 报告和原始 JSON 导出；报告显示来源、身份、预算和生命周期状态。CLI 总是回查原件；内存 API 不假称已查文件。

公开 API：
- `mint-art.mjs`：seedFromSource、registerAsset、identityDigest、validateArt、gateReport、renderMarkdown、renderHtml、imageJobsFrom。
- `lib/stage.mjs`：stageErrors、evidenceErrors、verifySources、lifecycleErrors、budgetChecks、identityCoreDigest、lifecycleStamp、syncLifecycleStamps、sourceIdentity、digest、assertStoryOutline、assertCharacters、upstreamErrors、upstreamCheck。
- `seedFromOutline` 拒绝把故事背景当作资产 seed，指向原剧本入口。

媒体计划为 schemaVersion 1，带逐任务 inputDigest，不上传、不生成。变体依赖按参考顺序排列；只有 ready 任务进入计划。ready 道具的 `states[1]` 起各导出一个任务，ID 为 `<道具 ID>.s<序号>`，参考基准道具成图，产物为 `images/<imageStem>-state<序号>-sheet.png`。报告渲染不写回默认值、来源状态或自动挂图。
