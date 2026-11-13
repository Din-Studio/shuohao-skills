# 显式迁移与逐字段证据材料

正式运行仅接受 v5。历史 v4 文件必须保留，不能只改版本号或删除资产字段。旧创作大纲不会自动成为剧本证据。

## v4 → v5

```bash
node scripts/mint-outline.mjs migrate-v5 old-v4.json
node scripts/mint-outline.mjs migrate-v5 old-v4.json --out outline/.work/story-draft.json --project PROJECT_ROOT --confirm
```

默认预览，不写文件。指定 --out 但不 --confirm 时 written=false，CLI 退出 1。--confirm 只授权保存草稿，不审核故事、身份或预算，不自动推进完整流程。

写入三个文件：
1. story-draft.json：只投影 v5 剧情字段。
2. story-draft.json.v4-backup：输入原始字节，输入本身不变。
3. **story-draft.migration.json**：供其他阶段读取的待核验材料，不是正式 outline/cast/art。

输出必须是不同的 .json 路径，不能以 .migration.json 命名草稿。不覆盖目标或旁路文件，不跟随输入符号链接。独占创建，写入失败仅清理本次已创建文件，不删除并发作者文件。检测输入在备份前变化。三个文件不是跨文件事务；进程中断后人工检查残留。

v4 已知结构、身份及 B/Q 关系损坏必须先修复。明确预算即使超额、值非法、键未知或无法归属，也原值导出，不降级为参考提醒。旧来源文件缺失或改版会记录 sourceVerification=fail，不伪装 skipped；仍可保存待核验材料，但不能因此发布或交接。

## .migration.json 形状

```json
{
  "migrationVersion": 1,
  "kind": "outline-v4-to-v5",
  "status": "pending-review",
  "source": "作品标题",
  "fromSchemaVersion": 4,
  "toSchemaVersion": 5,
  "input": {"path": "/absolute/old-v4.json", "sha256": "...", "schemaVersion": 4},
  "pathBases": {
    "originalArtifact": "/absolute/old-v4.json",
    "draftArtifact": "/absolute/story-draft.json",
    "migrationArtifact": "/absolute/story-draft.migration.json"
  },
  "original": {"schemaVersion": 4},
  "fields": [{
    "fieldId": "F00001",
    "originalPath": "/characters/0/aliases/0/name",
    "originalValue": "老许",
    "targetStage": "characters",
    "relatedStages": ["characters"],
    "destinationPath": null,
    "destinationValue": null,
    "status": "pending-stage-review",
    "handling": "preserve-evidence; no automatic identity approval",
    "legacyAssetIds": [],
    "sourceRefs": [{"documentId": "D01", "startLine": 3, "endLine": 7}]
  }],
  "stageMaterials": {
    "characters": {"status": "pending-review", "fieldIds": ["F00001"], "identityMapping": "not-verified"}
  },
  "identityMapping": "not-verified",
  "contentReview": "not-performed",
  "fullDownstreamValidation": "not-performed"
}
```

示意省略其他记录；真实 original 包含完整输入。fields 对**每一个字段／数组位置**登记，包含容器和空数组，原值不删减，fieldId 在本材料内唯一。originalPath 为 RFC6901 JSON Pointer（~ 转义为 ~0，/ 转义为 ~1），可以从 original 逐字段回查。

- destinationPath：仅投影剧情字段才有，指向 v5 草稿；其他为 null。destinationValue 保存草稿实际值；容器只投影其中剧情字段，原容器完整值仍在 originalValue。版本升级及路径重定位也能逐值比较。
- status：projected-pending-verification / pending-stage-review / unassigned-pending-review。
- targetStage：outline/characters/art/unassigned/multiple；relatedStages 提供跨阶段关系涉及方，stageMaterials 的 fieldIds 可以重叠，不代表一条关系已经映射。
- legacyAssetIds：原值中的 C/S/P 字符串候选，保持旧 ID，不按名字自动归并。
- sourceRefs：就近继承旧对象出处，原始来源字段仍完整登记，不制造新证据。alias 的原出处、notes 的资产关系和 speakerId 分别可追踪。
- handling：说明原字段的投影或待核验处理。
- pathRewrites：逐条登记来源 path 的原值、投影值、原／目标字段路径和重定位状态。草稿来源路径相对草稿；original 的路径始终相对输入旧文件，不能相对材料文件猜测。
- budgets：每个旧 thresholds 键的 originalPath/originalValue、targetStage、constraint=explicit-user-budget、severity=blocking-at-owning-stage、valueValidation 和待核验状态。maxLeads/maxSupport/maxFunctional 归 characters；maxPrimaryScenes/maxProps 归 art；未知键归 unassigned。非对象预算整体记录在 unclassifiedBudget，不能忽略。
- legacyValidation、draftValidation：结构与原预算结果，仅供定位。
- sourceVerification：实际打开旧原件核验的结果。纯 migrationDraftV5 API 没有文件上下文时明确 skipped。

人物完整记录、别名、定位、人物变化、地点主次、道具功能、来源、资产 notes、分集引用、prop.beatIds、focusCharacterIds、speakerId、所有预算及未知扩展都保存在 original 和 fields。资产自身的 notes/arc 不机械拼入 story，必须回查原文决定哪些故事事实需要重述。原剧情 notes 保留 text/sourceRefs/epistemic，旧资产引用单独导出；不按 speakerId 猜出新自然语言说话者。

## 既有消费者与失效检查

--project 指定项目根。未指定时，仅当输入直接位于 outline/ 时推断项目根；其他位置明确 skipped。

consumerInspection 只读递归检查 script、creation、characters、art、shots、images、reviews、review、audits、audit、prompts、work-orders。不导入脚本、不执行兄弟命令、不修改任何消费者。每个文件记录相对项目路径、字节摘要、大小、待核验状态；JSON 字符串／键中的旧 ID 有 fieldPath/value/key，文本命中有行号及原值，图片等二进制记录路径 ID，便于回查旧参考图。不通过名称匹配身份。

损坏 JSON、不可读文件或非法项目根标记 fail；符号链接记录 pending-review，不跟随。已有 .migration.json 不当作权威产物。自定义路径和项目外材料不在自动扫描范围，必须人工补查。空目录或没有命中不能证明不存在外部依赖。

后续阶段按 stageMaterials.fieldIds 和 original 读取证据、独立阅读剧本，建立自身身份／预算，并核对实际依赖的工作单、图片、输入摘要、提示词和审核。旧 ID 沿用不等于映射批准。来源版本变化、相关范围缺口或身份合并／拆分／纠正，仅使实际受影响的引用和审核待核验，不能宣称无关内容自动失效。

## 历史 v2／v3

migrate-v3 INPUT [--out OUTPUT] [--confirm] 仅用于 v2 → v3。
migrate-v4 INPUT [--out OUTPUT] [--confirm] 仅用于 v2/v3 → v4 待补证据草稿。

历史迁移仍保留原字节备份；旁路材料也以 **.migration.json** 结尾（OUTPUT.migration.json），不再输出 .review。它们的历史材料形状为 original/preserved 或 pending/review，不冒充 v5 migrationVersion:1。历史校验隔离在 legacy-v3-core.mjs/legacy-v4-core.mjs，仅用于显式迁移。

先人工补齐 v4 的真实 provenance/sourceRefs，修复关系，再执行 migrate-v5。没有原剧本时保留历史文件，不把大纲伪装成生产输入。升级顺序与无上游行为见[交接矩阵](handoff.md)。
