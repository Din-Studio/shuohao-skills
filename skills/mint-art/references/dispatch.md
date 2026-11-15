# 阶段内并行：派发指南

适用于所有原剧本识别、修订与增量核验，不按字数回退到主会话阅读。正式产物仍只有一份 art v1。阶段之间不能并行，完整流程为 outline → characters → art → script → creation；完整流程必须先有本次范围已完成交接的正式 cast。

## 一、最小流程与硬约束

```text
seed 登记来源（coverage 为空）→ 主会话分批
  ↓
提取者 × N（独立 subagent，并行）→ .work/extract/batch-XX.md
  ↓
整理者 × 1（以提取结果为主）→ .work/draft.json
  ↓
核验者 × N（独立 subagent，按批并行）→ .work/review/batch-XX.md
  ↓
整理者定向修复 → 受影响批次独立复核
  ↓
主会话校验、记录有依据的逐资产审核、发布 art.json
  ↓
设计者按 S/P ID 分组并行 → apply-designs → 校验 → 媒体生成与报告
```

- **主会话不读取原文正文。** 不先通读后分批，不以修复或预检代替来源任务。
- **每个 subagent 一次调用累计最多接触 4 个不同集号的原文。** 完整阅读、前情、检索命中和定向回读全部计入；分块、改名、修复轮次不重置上限。同一调用不能接着处理下一批。
- 每批 1–4 集，长集、切换密集、物件多时继续缩小。2 集及以上至少分为 2 批并发；60 集通常为 15 批。并发可按资源分波执行，但不能一次只派一个串行接力。
- 单集也独立并行派发：例如一位提取地点，另一位提取物件与状态；可以读取同一集，整理时检查两者并集。核验由新的独立调用执行；只有一批时，也按上述关注点并发核验，合起来覆盖整集。
- 极长单集可按可靠场次或行范围拆分，保留必要边界重叠，不能任意切断语义。单文件多集明确派发集号、绝对路径和行范围；边界无法确定时先确认，不读取全文猜测。
- 没有 subagent 工具时通过独立进程派发。两者都不可用时停止，禁止主会话代读或声称独立核验。
- 程序计算 SHA256、物理行数不等于模型已读。命令不启动代理、不审计工具历史，实际读取白名单由简报与执行纪律落实。
- 独立原创设计没有原剧本时不伪造提取或来源核验；跳过不存在的来源任务，按需要独立并行设计。已有原件不得借 --design 隐瞒。

## 二、来源与工作文件

主会话先读取 [schema.md](schema.md)、[source-facts.md](source-facts.md)、[lifecycle.md](lifecycle.md)，执行确定性来源登记。只接收路径、文档 ID、摘要和行数等元数据，不把原文打印到主会话。

```bash
node {baseDir}/scripts/mint-art.mjs seed --source-dir 剧本目录 --title 作品标题 --cast characters/cast.json --out art/.work/seed.json
# 单个原件使用 --source；--source-dir 只支持首次登记，不与 --existing 混用
```

`{baseDir}` 为本 skill 目录。文档 ID 为 D 加集号，缺集以 missingEpisodes 汇报。独立运行没有 cast 时明确不批准 carrierRefs，不能冒称完整流程完成。

工作记录使用普通 Markdown，不是第二种正式格式，不设 schemaVersion。每批记录实际已读的 documentId、集号和行范围、地点／物件事实与出处、状态及疑点。可以使用文件内临时条目标识，不分配最终 S/P ID 或永久 identityKey，不建立新注册表。不要贴长篇原文、写多份摘要或建立额外候选索引。

**写者规则：** 提取者只写自己的一份 extract 文件；整理者是 draft 的唯一写者；核验期间草稿冻结；核验者只写 review；设计者只写 designs。正式文件只有主会话发布，之后通过主会话和 apply-designs 修改。subagent 只回报文件路径、状态及具体未决问题，不回贴正文。

## 三、提取者：按批并行

**简报：** 本批集号、documentId、原件绝对路径及行范围，输出路径；正式 cast（如有）；必读 schema、source-facts、lifecycle、[principles.md](principles.md)、[glossary.md](glossary.md) 与本文。单集分工时写清关注点及整体覆盖责任。

1. 完整阅读本批负责范围，不读其他批原文，不读取前批累计草稿或其他提取者的结论。
2. 地点记录称呼、空间结构、标志物、空间关系及光照／空间变化；物件记录称呼、材质、独特标记、持有、拿取、交接、破损、修复和内容变化。每项有可定位出处。
3. 本批明确同地同物时可以局部判断，保存证据。跨批重复允许存在，不凭同名、相似外观或材质自动合并。
4. 先保存线索，不把场次直接当地点，也不把所有提及物品直接当道具。暂不建立资产的线索同样保留，供整理者依据全局出现情况判断。
5. 人物身份只来自正式 cast，不猜测 C ID，不重新归并人物；关系不明确时提出具体证据问题。
6. 记录实际阅读范围和缺口；不执行 register、不写最终 S/P ID，不制作设计，不确认审核，不根据 seed 成功声称已读。

示例：[雨棚留言分集原件](../examples/雨棚留言-分集/) 各批独立提取雨棚、留言板、铁盒和雨伞线索。整理者判断跨批同地同物；铁盒放入夹纸到腾空是同一道具的状态，雨伞仅被提及的事实也不能在提取时丢掉。

## 四、整理者：默认一个

**简报：** seed、全部批次结果、草稿输出路径、正式 cast；增量时给既有 art 和变更依据；必读 schema、source-facts、lifecycle、principles、glossary 与本文。主会话不把全剧原文作为必读输入。

- 直接读取批次提取结果，先判断同地同物，再决定是否建立资产，最后决定视觉变体。不另建多级索引、关系图或永久映射体系；归并依据保留在工作记录、facts、decision 或 observations。
- 同一实物的交接、破损、腾空和修复写进同一道具的 facts，按集序带出处，不新建身份。场景变体只因光照状态持续变化或空间状态变化且需要独立视觉呈现而建立，使用 variantOf 与 changes；情绪和剧情时刻不建变体。
- 不建资产的线索写 observations，保留来源和理由；反复出现或有连续性要求时可以据实提升为资产。未知保持分开或待确认，不为预算删除事实。
- 首次归并后才由唯一写者执行现有 register，分配 S/P ID 与永久 key；补齐 decision、sourceRefs、facts、primary、usage、必要 carrierRefs 和变体关系。局部提取不 register，不全局重新编号。
- carrierRefs 只引用正式 cast，依据不能越出人物已确认范围。无法对应 C ID 时交回 characters 定向核验，art 不重判人物身份。
- 按实际提取范围填写 coverage。只有所有登记原件确实全文覆盖才设 complete 和 totalEpisodes；partial 不假称全剧。
- **必要时按需求读取特定集数的剧本。** 读取前明确集号、路径、行范围，每次调用累计最多 4 集；超出上限另派证据任务。不通读或全局检索全剧。
- 提取结果过大时报告具体材料范围，针对疑点另派有限任务，不默认多层归并，不通过扩大原文读取解决。
- 用现有 verify-sources 检查草稿，不确认语义；它在进程内校验原件字节，不表示模型通读全文。

**增量：** 涉及来源的修订同样独立并行提取、核验。整理者先读取既有 registry，沿用 ID、key、预算、设计及媒体路径；合拆删纠正按现有 registry.changes 和 reconcile --previous，不覆盖既有记录或重新编号。单原件改版可以 seed --existing；分集目录增量沿用既有文档登记和受影响范围，不能用首次 --source-dir 绕过基线。

## 五、核验与定向修复

**简报：** 本批原件和精确范围、冻结草稿、相关批次事实及归并依据、正式 cast（如有）、review 输出路径，schema、source-facts、lifecycle 和本文。不读取提取者自评，不让提取者自证。

- **按批完整覆盖，不按资产要求一个人回读全部出处，不抽查代替漏登记检查。** 从原文检查地点、重要物件和交接／状态线索是否进入资产或 observations；从草稿检查对应事实和出处是否成立。
- 检查同地同物合并依据、状态链顺序、变体条件、decision、primary 和 carrierRefs。场次、提及物品和人物自由名称不能冒充确认身份。
- 跨批归并读取相关提取结果和依据，不能仅凭本批原文批准其他批事实。必要时定向回读，仍累计最多 4 集；证据不足写明确问题，请主会话另派证据任务。贯穿全剧的场景或道具仍按批检查，不让一个任务通读全部出处。
- 每条问题给出 S/P ID 或临时条目、documentId、行号及修复范围；结论区分通过、需要修复和证据不足。核验者只写结论，不改草稿、不自动确认 identityReview。

整理者在核验结束后统一修复。原文事实修复复核受影响批次；合并、拆分、关系变化涉及多个批次时全部相关批次复核。新增原文需求另派受限任务，主会话不代读。无法确认的资产保留未知或阻断相关交付，不删除事实或放宽预算求通过。

**定稿：** 主会话依据结论检查 primary 和预算；增量先执行 reconcile --previous。确认所有需修复及证据问题已解决后执行 identity-inputs，逐资产写 `identityReview: {status:"confirmed", basis, inputDigest}`，basis 引用对应核验依据，设置 status: ready；validate 通过后发布。现有正式文件只做受控增量修改，不覆盖重建。结构通过、摘要生成不能代替语义确认。

## 六、设计与媒体

身份与来源确认后按 S/P ID 并行派发独立设计者，基准场景与全部变体同组，同一道具全部 states 同组；强关联道具尽量与场景协调。只有一个设计组时由独立设计者完成，不由主会话补写。不再以“少于八个资产”为由改在主会话设计。

**简报：** 负责 ID、已确认 art、必要来源和限制、production、输出路径。场景读 [scene-pass.md](scene-pass.md)、[scene-lighting.md](scene-lighting.md)，道具读 [prop-pass.md](prop-pass.md)；共同读 principles、glossary、[sheet-prompt.md](sheet-prompt.md)、[sheet.md](sheet.md)、[realism.md](realism.md)；Midjourney 另读 [model-midjourney.md](model-midjourney.md)，再读适用题材文件。

每个 ID 写 `.work/designs/<ID>.json`，必需 id（与文件名及负责资产一致）、designStatus（planned 或 ready），其他只接受 summary、anchors、lighting、image、states、scale、changes；changes 只用于变体场景。不修改 art，不写身份、facts、sourceRefs、decision、primary、variantOf、usage，不处理范围外 ID。必要原文回读同样累计最多 4 集，不为设计通读全剧。

主会话执行现有 apply-designs，全部通过才写回，失败时只退回有问题的设计。设计不进入身份摘要；身份或来源变化仍需重核受影响设计与媒体。images 仅导出计划，按 [media-handoff.md](media-handoff.md) 核对授权、生成、下载、审核和变体参考依赖；不能把 ready 或计划导出当成图片已生成。

## 七、运行环境与边界

| 环境 | 派发方式 |
| --- | --- |
| Claude Code | Task/Agent 通用 subagent；提取与按批核验的调用分别在同一消息内并发 |
| pi | subagent 工具；不可用则 bash 启动独立 pi -p 进程，并行启动本波任务 |
| 两者都不可用 | 停止，报告无法满足独立并行；不回退到主会话 |

不新增 agent 定义文件、调度服务、自动相似度归并、第二套正式格式、数据库、文件锁或失败累积日志。离线测试只验证确定性规则及文档约定，实际并发、模型读取和来源忠实度要通过真实执行核验，未执行明确“未验证”。
