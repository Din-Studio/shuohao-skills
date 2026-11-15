# 阶段内并行：派发指南

适用于所有原剧本识别、修订与增量核验，不按字数回退到主会话阅读。正式产物仍只有一份 cast v1。阶段之间不能并行，完整流程为 outline → characters → art → script → creation。

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
主会话 reconcile、validate、记录有依据的审核、发布 cast.json
  ↓
设计者按 C ID 分组并行 → apply-designs → 校验 → 媒体生成与报告
```

- **主会话不读取原文正文。** 不先通读后分批，不以修复或预检代替来源任务。
- **每个 subagent 一次调用累计最多接触 4 个不同集号的原文。** 完整阅读、前情、检索命中和定向回读全部计入；分块、改名、修复轮次不重置上限。同一调用不能接着处理下一批。
- 每批 1–4 集，长集、对白密集、人物多时继续缩小。2 集及以上至少分为 2 批并发；60 集通常为 15 批。并发可按资源分波执行，但不能一次只派一个串行接力。
- 单集也独立并行派发：例如一位提取出场／发声，另一位提取提及／别名及身份限制；可以读取同一集，整理时检查两者并集。核验由新的独立调用执行；只有一批时，也按上述关注点并发核验，合起来覆盖整集。
- 极长单集可按可靠场次或行范围拆分，保留必要边界重叠，不能任意切断语义。单文件多集明确派发集号、绝对路径和行范围；边界无法确定时先确认，不读取全文猜测。
- 没有 subagent 工具时通过独立进程派发。两者都不可用时停止，禁止主会话代读或声称独立核验。
- 程序计算 SHA256、物理行数或生成分块不等于模型已读。命令不启动代理、不审计工具历史，实际读取白名单由简报与执行纪律落实。

## 二、来源与工作文件

主会话先读取 [schema.md](schema.md)、[source-facts.md](source-facts.md)，执行确定性来源登记。只接收路径、文档 ID、摘要和行数等元数据，不把原文打印到主会话。

```bash
node {baseDir}/scripts/mint-characters.mjs seed --source-dir 剧本目录 --title 作品标题 --out characters/.work/seed.json
# 单个原件使用 --source；outline 可选，已提供则必须有效
```

`{baseDir}` 为本 skill 目录。文档 ID 为 D 加集号，缺集以 missingEpisodes 汇报。长集可以使用现有 chunk 辅助阅读，但各调用仍只读取简报指定范围。

工作记录使用普通 Markdown，不是第二种正式格式，不设 schemaVersion。每批记录实际已读的 documentId、集号和行范围、简短概要、人物事实与出处、未知及跨批疑点。可以使用文件内临时条目标识，不分配最终 C ID 或永久 identityKey，不建立新注册表。不要贴长篇原文、写多份摘要或建立额外候选索引。

**写者规则：** 提取者只写自己的一份 extract 文件；整理者是 draft 的唯一写者；核验期间草稿冻结；核验者只写 review；设计者只写 designs。正式文件只有主会话发布，之后通过主会话和 apply-designs 修改。subagent 只回报文件路径、状态及具体未决问题，不回贴正文。

## 三、提取者：按批并行

**简报：** 本批集号、documentId、原件绝对路径及行范围，输出路径；必读 [roster-pass.md](roster-pass.md)、[schema.md](schema.md)、[source-facts.md](source-facts.md) 与本文。单集分工时写清关注点及整体覆盖责任。

1. 完整阅读本批负责范围，不读其他批原文，不读取前批累计草稿或其他提取者的结论。
2. 提取所有身份线索：有台词、无台词、仅出声、仅提及、非人主体及群体；记录称呼、别名、presence、speech、身份关系、证据位置和限制。
3. 本批明确证明同人时可以局部归并，保留揭晓位置和此前未知。跨批可能重复允许保留，不凭名字、职业或外观相似认定同人。
4. 来源说法与客观事实分开；未知保留。不要为了预算少登记，不制作 persona、voice、image，不确认审核。
5. 写明实际阅读范围。未读完就明确缺口，不把 seed 或分块成功写成完整 coverage。

示例：[回声台分集原件](../examples/回声台-分集/) 的两位同名许禾必须区分。第二集提取者独立登记“夜班员小禾”；整理者依据第一集自称与第二集身份线索判断归属。窗外喊声不能无证据并入隔壁喊话者。

## 四、整理者：默认一个

**简报：** seed、全部批次结果、草稿输出路径；增量时给既有 cast 和变更依据；必读 schema、source-facts、roster-pass 与本文。主会话不把全剧原文作为必读输入。

- 直接读取批次提取结果，判断确认同一、确认不同或尚不能确认。保留可追溯的归并依据，写在工作记录或草稿既有 notes／unknowns，不另建多级索引、关系图或永久映射体系。
- 首次草稿为人物填写全局唯一 identityKey，暂不分配 C ID。对应身份补 sourceRefs、aliases、presence、speech 和 notes；未知保持 unknowns。合并不能丢掉来源、限制和揭晓顺序，后文身份不能抹去前文未知。
- 根据实际提取范围填写 provenance.coverage、summary。只有所有登记原件确实全文覆盖才设 complete；partial 不补写结局或假称全剧。
- **必要时按需求读取特定集数的剧本。** 读取前明确集号、路径、行范围，每次调用累计最多 4 集；超出上限另派证据任务。不通读或全局检索全剧。
- 提取结果也可能过大。实际发生时报告具体材料范围，针对疑点另派有限任务，不默认建立多层归并，不通过扩大原文读取解决。
- 使用现有 `reconcile .work/draft.json > /dev/null` 检查首次草稿，不带 --out，不确认语义。此命令可能在进程内校验全部原件字节，不表示模型读取全文。

**增量：** 所有涉及来源的修订同样独立并行提取、核验。整理者读取既有 cast 认领旧 identityKey 与 C ID；新身份省略 ID，合拆删纠正保留显式 changes 及依据。沿用 reconcile --previous，不重新编号，不以新 seed 绕过基线或预算。来源改版只重核实际受影响身份。

## 五、核验与定向修复

**简报：** 本批原件和精确范围、冻结草稿、相关批次事实及归并依据、review 输出路径，schema、source-facts、roster-pass 和本文。不读取提取者自评，不让提取者自证。

- **按批完整覆盖，不按身份要求一个人回读全部出处，不抽查代替漏登记检查。** 从原文检查所有人物是否登记；从草稿检查相关身份、别名、presence、speech、未知和引用是否有证据。
- 同名是否错误合并、同人是否重复拆分、人物说法是否被写成事实、身份是否提前揭晓、原文限制是否丢失，都要检查。
- 跨批归并读取相关提取结果和依据，不能仅凭本批原文批准其他批事实。必要时定向回读，仍累计最多 4 集；证据不足写明确问题，请主会话另派证据任务。贯穿全剧的主角仍按批检查来源，不由一个任务通读全部出处。
- 每条问题给出 identityKey 或临时条目、documentId、行号及修复范围；结论区分通过、需要修复和证据不足。核验者只写结论，不改草稿、不自动确认正式审核。

整理者在核验结束后统一修复。原文事实修复复核受影响批次；合并、拆分、关系变化涉及多个批次时全部相关批次复核。新增原文需求另派受限任务，主会话不代读。无法确认的身份保留未知或阻断相关交付，不删除事实或放宽预算求通过。

**定稿：** 主会话依据核验结论检查预算及必要 tier，执行 reconcile 写出候选 cast 和 validate。首次使用 --out；增量同时带 --previous 和必要 --changes。确认所有需修复及证据问题已解决后，记录 `review: {status:"confirmed", by, note, inputHash}`（取 validate 的 reviewInputHash），再设 status: identified 并验证、发布。现有正式文件只做受控增量修改，不覆盖重建。结构通过或摘要匹配不能代替语义确认。

## 六、设计与媒体

身份与来源确认后，按 C ID 并行派发独立设计者，易混淆人物可以同组；只有一个需要设计的对象时由独立设计者完成，不由主会话补写。不再以“少于八人”为由改在主会话设计。persona、voice 仍按需，用户仅登记或仅提示词时不生图。

**简报：** 负责 ID、已确认 cast、必要来源和限制、production、设计输出路径；只读取与任务相关的指南：[profile-pass.md](profile-pass.md)、[design-schema.md](design-schema.md)，图片另读 [principles.md](principles.md)、[glossary.md](glossary.md)、[sheet-prompt.md](sheet-prompt.md)、[sheet.md](sheet.md)、[style.md](style.md)、[realism.md](realism.md)。群演另读 [crowd.md](crowd.md)，Midjourney 另读 [model-midjourney.md](model-midjourney.md)，再读适用题材文件。

每个 ID 写 `.work/designs/<ID>.json`，只接受 id 加 persona、voice、image、importance、oneLiner 中至少一项。不修改 cast，不写身份或 tier，不处理范围外 ID。必要原文回读同样累计最多 4 集，不为设计通读全剧。

主会话执行现有 apply-designs，全部通过才写回，失败时只退回有问题的设计。设计不进入身份摘要；身份或来源变化仍需重核受影响设计与媒体。images 仅导出计划，实际生成、授权、下载与审核按 [media-handoff.md](media-handoff.md)，完成后 render；不能把设计 ready 或计划导出当成图片已生成。

## 七、运行环境与边界

| 环境 | 派发方式 |
| --- | --- |
| Claude Code | Task/Agent 通用 subagent；提取与按批核验的调用分别在同一消息内并发 |
| pi | subagent 工具；不可用则 bash 启动独立 pi -p 进程，并行启动本波任务 |
| 两者都不可用 | 停止，报告无法满足独立并行；不回退到主会话 |

不新增 agent 定义文件、调度服务、自动相似度归并、第二套正式格式、数据库、文件锁或失败累积日志。离线测试只验证确定性规则及文档约定，实际并发、模型读取和来源忠实度要通过真实执行核验，未执行明确“未验证”。
