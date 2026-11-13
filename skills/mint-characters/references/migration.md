# 版本、迁移与身份生命周期

## 正式版本矩阵

| 消费位置 | 正式输入与权威 | 无上游状态 | 阻断或升级要求 |
| --- | --- | --- | --- |
| characters seed | 原剧本文件 → cast v1 骨架 | 原件不可缺失 | 不是语义抽取，不直接通过交接 |
| characters validate/render/images | cast schemaVersion 1、kind mint-characters | 身份不可缺失 | 不认识的版本拒绝，不隐式双读 |
| 可选故事背景 | outline v5，仅剧情背景 | skipped，独立运行 | 已提供但损坏、旧版本、原件版本不同、已绑定背景摘要变化均失败 |
| 可选制作配置 | production v3 | 独立身份、画像或声音可继续 | 已提供但损坏失败；生成图片计划必须有配置 |
| 历史独立设计 | 无版本 cast 对象或裸角色数组、chunk/assemble/merge 辅助 | 不声称来源或联合对账通过 | 保留原有设计、渲染和计划接口，升级正式身份需 migrate-cast 后回查原文 |
| 历史 outline | v3/v4 → migrate-outline 待核对材料 | 不适用 | 不能传入正式 seed；--legacy 仅保留旧骨架投影 |
| script 的角色引用、声音提示词 | cast.characters 的 C ID、voice；正文位置权威仍在 script | 独立正文保持局部引用，联合对账 skipped | script 必须显式确认局部引用 → cast 身份，不靠名字或相同 C 字符自动映射 |
| creation 图片、提示词、工作单、审核 | cast 身份与来源 + script 已确认映射；图片需实际存在 | 非制作所需身份不强求图片 | 实际消费的映射缺失、歧义、来源改版、参考图失效必须阻断 |

消费者升级顺序：先完成 outline v5 → characters cast v1 → art → script → creation。本目录不修改消费者，不代替其内容审核。当前 script 接受 versioned cast 的身份/声音投影，不代表完成了本阶段 review 与生命周期校验。当前 creation 的参考图函数仍可能按名字或同名 ID+名字路径定位；正式 characters 计划使用稳定 `images/<C ID>-sheet.png`，消费者未支持此路径时必须显式更新其接口或交接工作单，不能自动复制图片、按名字猜测或宣称联合生成通过。

工作单、提示词、图片与审核的身份事实应读取 cast，不再读取 outline.characters。需要的正文映射唯一权威由 script 的 assetMappings 保存；characters 只维护自身身份生命周期与变更依据，不另设一套跨阶段映射表。消费方应把相关 cast 来源版本、身份事实和参考图摘要纳入输入摘要。完整流程状态仍由项目管理，本 CLI 不推进流程。

## 显式历史迁移

```bash
node scripts/mint-characters.mjs migrate-outline old-outline-v4.json --out pending.json
node scripts/mint-characters.mjs migrate-cast old-cast.json --out pending-cast.json
```

输出 kind=mint-characters-migration、status=pending。写入使用独占创建，绝不覆盖原文件或已有目标。源文件路径、原始字节 SHA256、完整 snapshot 与逐叶字段 ledger 全部保留，每项有 path/value/status。空数组和空对象也保留。旧 C ID、别名、画像、声音、图片及路径保存在 candidates.legacy 和 snapshot，不直接标为正式已确认身份。

outline 的人物、地点、道具、来源、notes、分集资产引用、props.beatIds、story.focusCharacterIds、speakerId、params.thresholds 等全部逐字段保留，不因不归 characters 而删除。人物预算须人工明确归属为 budgets.characters 或 maxLeads/maxSupport/maxFunctional，并保留旧值和路径的核对记录；分档阈值不能改成总数阈值或降级为参考提醒。地点、道具和无法自动归属的旧阈值保持 pending，交还相应负责阶段；不能冒充已迁移或自动舍弃。材料保存全部字段，而不是仅复制人物数组。

迁移操作步骤：

1. 保留旧文件，导出待核对材料。
2. 从原剧本建立正式 seed，读取实际范围。
3. 对照原文、旧角色及所有现有 script/creation、图片路径和审核材料认领身份。首次登记尽可能沿用合法旧 C ID；ID 沿用不是审核通过。无法确认的身份保持未知，不按名称合并。
4. 填写永久 identityKey、sourceRefs、别名出处、出现方式、未知项和预算。把原画像、音色及图片设计按需放回可选字段，制作补定不冒充来源事实。
5. reconcile 生成正式草稿。再完成语义复核和相关联合映射、图片、工作单与审核核验。材料 pending 不因 reconcile 或结构通过而自动变 confirmed。

历史 `seed old-outline.json --legacy` 和公开 `seedFromOutline` 函数仍是旧投影接口，仅供历史设计回归。正式工作流不得消费其人物表为权威。v3 历史数据没有来源摘要时，必须回到原件补齐，不能通过只改版本号升级。

## 增量身份生命周期

既有 cast 是唯一基线。不增加共享身份服务、失败累积日志或统计。

```json
[
  {
    "type": "merge",
    "from": ["C04", "C08"],
    "to": ["C04"],
    "basis": "user",
    "decision": "用户明确决定两处声音为同一身份；不是原文已确认事实",
    "reason": "根据本次明确授权归并"
  }
]
```

变化类型：merge 至少两个旧身份 → 一个当前身份；split 一个旧身份 → 至少两个当前身份；delete 一个旧身份 → 空数组；correct 一个旧身份 → 原 ID。所有类型都需要非空 reason。basis=source 时提供 sourceRefs，必须在已读范围内；reconcile 同时保存 sourceDocuments 的原始版本摘要及行数，历史映射不拿改版后的原文冒充旧依据；basis=user 时提供明确 decision，不冒充原文事实。新身份不手填 ID，先按登记顺序预知将分配的历史最大编号之后的 ID，再填写 to。

- 重排：identityKey 与 C ID 保持，重排不改变身份指纹，也不无故使审核失效。
- 新增剧集：先重新阅读来源，更新摘要、范围和事实；旧身份不重编号。
- 新身份：只分配未使用编号，退役 ID 与 identityKey 永不复用。
- 合拆删：保留所有退役登记，保留历史 from/to/reason/依据。不能仅从活动数组删除。
- 纠正：名字、别名、引用、出现方式等身份事实变化要写 correct；纯图片或音色设计变化不更换身份 ID，但需重核媒体及其内容审核。
- 来源改版：保留 ID，实际引用相关文档的身份进入 recheckIds，无关文档不会使所有身份自动失效。原件变化后不允许继续使用旧摘要。
- 影响范围：recheckIds 是待重新核验身份集合，不是统计。消费者需按其实际使用位置重核局部映射、工作单、参考图、提示词和审核。当前 CLI 不代替联合复核，也不自动清除该集合。

增量校验必须带 --previous，核对 previousHash 并重放本次映射，不能只信候选文件里自行填写的 registry。生成新文件后，原基线不覆盖。身份或来源范围变化时 reconcile 恢复 pending；纯重排只沿用摘要仍有效的既有审核；人工或模型确认时记录与 validate.reviewInputHash 对应的 review.inputHash。语义确认过期不得继续宣称 identified。
