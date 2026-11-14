# 分集接力与设计并行：派发指南

适用输入：一个文件夹，内含多份 Markdown，每份是一集剧本。本指南只描述执行方式，不改变正式契约：正式产物仍只有一份 cast v1。阶段之间不能并行，完整流程仍是 outline → characters → art → script → creation。

本流程分两段：

- **A 段：身份识别，串行接力。** 每批派一个 subagent，一次只派一个。它在原文就在眼前时直接判断「这是不是前面已有的人物」，所以跨集同人判定不交给事后归并。
- **B 段：设计，并行。** 身份定稿后，按 C ID 分组同时派发设计者，最后由 `apply-designs` 一次写回。

## 一、何时使用

- **A 段只用于首次生成。** 正式 cast 已经存在时，增量识别仍走 [SKILL.md](../SKILL.md) 第三步的 `--previous` 流程。
- **A 段分流**（初始经验值，按实际模型校准，不能用来证明读全）：原文总量约在 3 万字以内且不超过 10 集时，在当前会话读完；超过时接力，每批是一段连续集号，约 1 万到 1.5 万字。对白密集、人物多、身份转换多的集，缩小批次。
- **B 段**：需要设计的身份较多（经验起点约 8 个）时并行，每组 3–5 人；少于这个数量时在当前会话完成。B 段在首次生成和后续补设计时都可以使用。

## 二、流程

```
seed --source-dir 剧本目录 → characters/.work/draft-00.json（文档 ID = D 加集号；coverage 为空）
  ▼
接力者 batch-01 → batch-02 → …（一次只派一个）→ .work/draft-01.json、draft-02.json …
  ▼
核验者 × N（同一条消息内并发，按身份分组）＋ 1 个漏登记核验 → .work/review/*.md
  ▼
主会话修改最后一份 draft → reconcile --out characters/cast.json → validate → 记录审核
  ═══════════ 身份定稿，C ID 固定 ═══════════
  ▼
设计者 × N（同一条消息内并发）→ .work/designs/C01.json …
  ▼
apply-designs characters/cast.json .work/designs/*.json → validate → images → render
```

命令：

```bash
node {baseDir}/scripts/mint-characters.mjs seed --source-dir 剧本目录 --title 作品标题 [--budget N] [--outline outline.json] --out characters/.work/draft-00.json
node {baseDir}/scripts/mint-characters.mjs reconcile characters/.work/draft-03.json > /dev/null   # 接力者自查，不写文件
node {baseDir}/scripts/mint-characters.mjs reconcile characters/.work/draft-03.json --out characters/cast.json
node {baseDir}/scripts/mint-characters.mjs apply-designs characters/cast.json characters/.work/designs/*.json [--production production.json]
```

`{baseDir}` 是本 skill 目录。seed 把缺失的集号打印为 `missingEpisodes`，主会话在汇报中列出。提供 `--outline` 时，文档 ID 与 outline 不一致直接报错。

**写者规则：**

- 每份 `draft-XX.json` 只由一位接力者创建，之后不再修改；下一位在新文件里继续。编号的 draft 同时就是接力记录，某一位改坏了，从上一份重新派发即可。
- 修复循环中只有主会话修改最后一份 draft。
- 核验者只写 `review/`，设计者只写 `designs/`。
- 正式 cast 由 reconcile 创建，之后只有主会话和 `apply-designs` 修改。

`characters/.work/` 下的文件都不是正式产物，不进入版本控制。

## 三、角色

### 主会话

- 执行确定性命令，分批，依次派发接力者，并发派发核验者和设计者，向用户汇报。
- **不细读原文，不替接力者补登记。** 处理核验意见时只做定向回读。
- subagent 只回报文件路径、一行状态和未决数量，不把正文贴回会话。

### 接力者（每批一个，依次派发）

**简报内容：** 本批集号、文档 ID 和文件绝对路径；上一份 draft 路径；本批输出路径；必读文档的绝对路径：[roster-pass.md](roster-pass.md)、[schema.md](schema.md)、[source-facts.md](source-facts.md)，以及本文「接力者」一节。

**步骤：**

1. 读取上一份 draft 的已有人物（不读其他批的原文）。
2. 逐份完整阅读本批原件；长集可以先执行 `chunk` 再分段阅读。
3. 按 roster-pass 处理本批出现的**所有**人：有台词、无台词、仅出声、仅被提及、非人主体、群演批次。
   - **对应已有人物**（有原文证据：称谓、胸牌、外观、职业、关系）：在该条目上补 sourceRefs、别名、presence、notes。证据需要前文支持时，按已有条目的 sourceRefs **定向回读**前文行，不通读前文。
   - **新人物**：新登记，写全剧唯一的 identityKey，不写 id。
   - **不能确定是否对应已有人物**：新登记，在 `unknowns` 中写明疑点和出处，交给核验处理。不为了减少条目而猜测同一。
4. **揭晓**：本批原文明确揭晓两个已有条目是同一人时，合并它们（sourceRefs、别名、presence、notes、unknowns 取并集；speech 只要有一方为 speaking 就是 speaking，全部 silent 才是 silent，否则 unknown），notes 中写明揭晓位置和揭晓前的不知情状态。
5. 把本批文档的 coverage 写为 `1..lineCount`；summary 补写本批概要。最后一位接力者把 summary 整理成全剧概要；全部集读完时把 `provenance.scope` 改为 complete。
6. 写出本批 draft，执行 `reconcile 本批draft > /dev/null` 自查，失败就自行修改，直到通过。

**示例**（[examples/回声台-分集/](../examples/回声台-分集/)）：第二集的「夜班员小禾」与第一集夜班员许禾的自称「大家叫我小禾」对应，第二位接力者在已有条目上补引用，不新建身份；第二集窗外的喊声，原文明确没有确认与第一集隔壁喊话者是否同一人，所以新登记，并在 unknowns 中写明。

**禁止：** 修改上一份 draft 或任何其他文件；写 id、tier、budgets；写 persona、voice、image 等设计字段；确认审核。

### 核验者（并发）

- **按身份分组，不按批次。** 同一人物的判定跨批，只看一批无法判断合并或分开是否正确。同名、曾被合并、带有疑点的身份分在同一组。
- **输入：** 该组身份在最后一份 draft 中的条目、原件路径。逐人回读全部出处，检查：合并是否有证据、同名分开是否正确、别名是否有出处、presence 与 speech 是否符合原文、unknowns 是否被擅自清空。
- **漏登记核验，一个：** 按批抽查原件中有人物出场或发声、却没有被任何身份 sourceRefs 覆盖的行。
- 结论写入 `review/group-XX.md`、`review/coverage.md`，每条给出 identityKey、documentId 和行号。
- 核验者只写结论，不修改 draft，也不读取接力者的自我评价。

**修复循环：** 主会话按意见修改最后一份 draft，重新自查，只复核受影响的组；漏登记有修改时同时复核 coverage。两轮仍未通过就停下，向用户报告。核验放在 reconcile 之前，结论引用 identityKey，修改不会使 C ID 漂移。

**定稿：** 主会话为全部身份判定 tier（存在分档预算时）、检查预算，执行 `reconcile 最后一份draft --out characters/cast.json` 和 validate，写入 `review: {status:"confirmed", by, note, inputHash}`（inputHash 取 validate 输出的 reviewInputHash）与 `status: identified`。

### 设计者（并发）

**简报内容：** 负责的 C ID；`characters/cast.json` 路径；`production.json` 路径；输出目录；必读文档的绝对路径：[profile-pass.md](profile-pass.md)、[design-schema.md](design-schema.md)、[principles.md](principles.md)、[glossary.md](glossary.md)、[sheet-prompt.md](sheet-prompt.md)、[sheet.md](sheet.md)、[style.md](style.md)、[realism.md](realism.md)；群演另读 [crowd.md](crowd.md)；Midjourney 另读 [model-midjourney.md](model-midjourney.md)；适用的 `genres/` 文件；本文「设计者」一节。

**分组：** 同名或外观容易混淆的身份分在同一组，便于拉开外观差异。

**步骤：** 读取负责身份的 cast 条目，回读出处，按指南写设计，每个 ID 写一份 `designs/<ID>.json`：

```json
{"id": "C01", "persona": {}, "voice": {}, "image": {}, "importance": "major", "oneLiner": "…"}
```

只接受 `persona`、`voice`、`image`、`importance`、`oneLiner`，至少一项，按需提供。

**禁止：** 修改 cast.json；写身份字段或 tier；写负责范围以外的 ID。

**写回：** 主会话执行 `apply-designs`。它在内存中写入全部设计，执行与 validate 相同的完整检查，全部通过才写回；失败时不写，按 ID 列出问题，主会话只把有问题的那几份退回原设计者。设计不进入身份摘要，写回后已记录的审核仍然有效。

## 四、运行环境

| 环境 | 派发方式 |
|---|---|
| Claude Code | 使用 Task/Agent 派发通用 subagent；接力者逐个派发，核验者和设计者的调用放在同一条消息里并发 |
| pi | 有子代理扩展时使用 `subagent` 工具；没有时通过 bash 启动独立的 `pi -p` 进程 |
| 两者都不能 | 在当前会话按同样的文件约定依次完成，汇报中注明「接力、核验与设计在同一会话完成，核验不独立」 |

不新增 agent 定义文件。简报直接给出本文的绝对路径。

## 五、不做的事

- 不并行读取 A 段；不按名字、别名或任何相似度自动合并人物。
- 不把一集拆给多个接力者。
- 不对核验结论做代码格式检查。
- 不新增调度脚本、状态服务、文件锁、数据库、失败累积日志或统计。
- 不宣称结果已经通过语义审核或图片审核。
