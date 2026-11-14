# 分集接力与设计并行：派发指南

适用输入：一个文件夹，内含多份 Markdown，每份是一集剧本；完整流程中，正式 `characters/cast.json` 已经完成。本指南只描述执行方式，不改变正式契约：正式产物仍只有一份 art v1。阶段之间不能并行，完整流程仍是 outline → characters → art → script → creation。

本流程分两段：

- **A 段：资产识别，串行接力。** 每批派一个 subagent，一次只派一个。它在原文就在眼前时直接判断「这是不是前面已有的地点或物件」，同地、同物、状态链和变体都在接力中当场处理。
- **B 段：设计，并行。** 身份定稿后，按 S/P ID 分组同时派发设计者，最后由 `apply-designs` 一次写回。

## 一、何时使用

- **A 段只用于首次生成。** 正式 art 已经存在时，增量识别仍走 `seed --existing` 与 `reconcile --previous`，见 [lifecycle.md](lifecycle.md)。
- **A 段分流**（初始经验值，按实际模型校准，不能用来证明读全）：原文总量约在 3 万字以内且不超过 10 集时，在当前会话读完；超过时接力，每批是一段连续集号，约 1 万到 1.5 万字。场景切换密集、道具多的集，缩小批次。
- **B 段**：需要设计的资产较多（经验起点约 8 个）时并行，每组 3–5 个；少于这个数量时在当前会话完成。

## 二、流程

```
seed --source-dir 剧本目录 → art/.work/draft-00.json（文档 ID = D 加集号；coverage 为空）
  ▼
接力者 batch-01 → batch-02 → …（一次只派一个）→ .work/draft-01.json、draft-02.json …
  ▼
核验者 × N（同一条消息内并发，按资产分组）＋ 1 个漏登记核验 → .work/review/*.md
  ▼
主会话修改最后一份 draft → 另存为 art/art.json → identity-inputs → 逐资产写审核 → status: ready → validate
  ═══════════ 身份定稿，S/P ID 固定 ═══════════
  ▼
设计者 × N（同一条消息内并发；基准场景与其变体同组）→ .work/designs/S01.json …
  ▼
apply-designs art/art.json .work/designs/*.json → validate → images → render
```

命令：

```bash
node {baseDir}/scripts/mint-art.mjs seed --source-dir 剧本目录 --title 作品标题 [--outline outline.json] [--cast characters/cast.json] --out art/.work/draft-00.json
node {baseDir}/scripts/mint-art.mjs register 当前草稿 --kind scene|prop --key 永久键 --name 名称 --out 新草稿   # 接力者登记新资产
node {baseDir}/scripts/mint-art.mjs verify-sources art/.work/draft-03.json                                      # 接力者自查
node {baseDir}/scripts/mint-art.mjs identity-inputs art/art.json
node {baseDir}/scripts/mint-art.mjs apply-designs art/art.json art/.work/designs/*.json [--cast characters/cast.json] [--production production.json]
```

`{baseDir}` 是本 skill 目录。seed 把缺失的集号打印为 `missingEpisodes`，主会话在汇报中列出。`--source-dir` 不能与 `--source`、`--design`、`--existing` 同时提供。

**写者规则：**

- 每份 `draft-XX.json` 只由一位接力者创建，之后不再修改；下一位在新文件里继续。接力者内部 register 产生的中间文件放在自己的批目录里。编号的 draft 同时就是接力记录，某一位改坏了，从上一份重新派发即可。
- 修复循环中只有主会话修改最后一份 draft。
- 核验者只写 `review/`，设计者只写 `designs/`。
- 正式 art 由主会话另存创建，之后只有主会话和 `apply-designs` 修改。

`art/.work/` 下的文件都不是正式产物，不进入版本控制。

## 三、角色

### 主会话

- 执行确定性命令，分批，依次派发接力者，并发派发核验者和设计者，向用户汇报。
- 开始前确认正式 cast 已经完成（完整流程时）；独立运行没有 cast 时，在简报里写明不写 carrierRefs。
- **不细读原文，不替接力者补登记。** 处理核验意见时只做定向回读。
- subagent 只回报文件路径、一行状态和未决数量，不把正文贴回会话。

### 接力者（每批一个，依次派发）

**简报内容：** 本批集号、文档 ID 和文件绝对路径；上一份 draft 路径；本批输出路径；正式 cast 路径；必读文档的绝对路径：[schema.md](schema.md)、[source-facts.md](source-facts.md)、[lifecycle.md](lifecycle.md)、[principles.md](principles.md)、[glossary.md](glossary.md)，以及本文「接力者」一节。

**步骤：**

1. 读取上一份 draft 的已有资产与 observations（不读其他批的原文）。
2. 逐份完整阅读本批原件。
3. 对本批出现的每个地点、物件：
   - **对应已有资产**（有原文证据：空间结构、标志物、材质、标记、持有关系）：在该资产上补 sourceRefs、facts、usage.episodes。证据需要前文支持时，按已有资产的 sourceRefs **定向回读**前文行，不通读前文。
   - **新资产**：在当前草稿上执行 `register`，ID 自然续号；填写 decision、sourceRefs、facts、primary，需要时写 carrierRefs。
   - **不能确定是否对应已有资产**：新登记，并在 observations 中写明疑点和出处，交给核验处理。不为了减少条目而猜测同一。
4. **状态与变体：**
   - 状态变化（交接、破损、腾空、修复）写进同一道具的 facts，按集序带出处，不新建道具。
   - 变体只在光照状态持续变化或空间状态变化（清空、破损、布置）时建立，写 `variantOf` 和 changes；情绪和剧情时刻不建变体。不需要单独出图的状态写进 observations。
5. **取舍：** 只出现一次、暂不建资产的物件写进 observations；后续接力者发现它反复出现、有连续性要求，可以把它提升为道具，写明依据。
6. **揭晓**：本批原文明确两个已有资产是同一对象时，合并它们（sourceRefs、facts、usage.episodes 取并集）。草稿从未发布，合并时删除被并入的资产及其 registry 条目，并改写所有指向它的 `variantOf`、`relatedScenes`、`observations[].sceneId`，不记录 registry.changes。
7. carrierRefs 只引用正式 cast 的 C ID，证据不越出该人物已确认的出处范围；不按名称猜测。
8. 把本批文档的 coverage 写为 `1..lineCount`。全部集读完时，最后一位接力者把 `provenance.scope` 改为 complete，并写入 `totalEpisodes`。
9. 写出本批 draft，执行 `verify-sources` 自查，失败就自行修改，直到通过。

**示例**（[examples/雨棚留言-分集/](../examples/雨棚留言-分集/)）：第一位接力者读第 1–2 集，登记菜摊雨棚、公共水池、旧留言板、夹纸铁盒，新雨伞只被口头提及，写进 observations。第二位接力者读第 3 集：雨棚、留言板、铁盒都对应已有资产，只补引用；铁盒「放入夹纸」到「腾空」写成同一道具的 facts；清空后的雨棚是同一地点，写进 observations，不建新地点。

**禁止：** 修改上一份 draft 或任何其他文件；写设计字段；写 budgets；确认 identityReview。

### 核验者（并发）

- **按资产分组，不按批次。** 同一对象的判定跨批，只看一批无法判断合并或分开是否正确。基准场景与其变体一组；同一 carrier 或同一状态链相关的道具一组。
- **输入：** 该组资产在最后一份 draft 中的条目、原件路径。逐个资产回读全部出处，检查：同地、同物合并是否有证据，变体是否符合「光或空间状态」规则，状态链顺序与出处是否一致，decision 是否成立，carrierRefs 是否越出人物已确认的范围。
- **漏登记核验，一个：** 按批抽查原件中有具体地点或被拿取、交接、特写的物件，却既没有资产也没有 observations 引用的行。
- 结论写入 `review/group-XX.md`、`review/coverage.md`，每条给出 S/P ID、documentId 和行号。
- 核验者只写结论，不修改 draft。

**修复循环：** 主会话按意见修改最后一份 draft，重新自查，只复核受影响的组；漏登记有修改时同时复核 coverage。两轮仍未通过就停下，向用户报告。

**定稿：** 主会话判定 primary、写入预算并检查，把最后一份 draft 另存为 `art/art.json`，执行 `identity-inputs`，逐资产写入 `identityReview: {status:"confirmed", basis, inputDigest}`（basis 引用对应核验结论），顶层 `status` 改为 ready，再执行 validate。

### 设计者（并发）

**简报内容：** 负责的 S/P ID；`art/art.json` 路径；`production.json` 路径；输出目录；必读文档的绝对路径：场景读 [scene-pass.md](scene-pass.md)、[scene-lighting.md](scene-lighting.md)，道具读 [prop-pass.md](prop-pass.md)；共同读 [principles.md](principles.md)、[glossary.md](glossary.md)、[sheet-prompt.md](sheet-prompt.md)、[sheet.md](sheet.md)、[realism.md](realism.md)；Midjourney 另读 [model-midjourney.md](model-midjourney.md)；适用的 `genres/` 文件；本文「设计者」一节。

**分组：** 基准场景与它的全部变体分在同一组，先写基准，再按「抄块、指向参考、保持什么、只改什么」写变体，一轮完成；场景的常驻道具尽量与该场景同组，便于统一材质和尺度。

**步骤：** 读取负责资产的条目和 facts，回读出处，按指南写设计，每个 ID 写一份 `designs/<ID>.json`：

```json
{"id": "S01", "designStatus": "ready", "summary": "…", "anchors": [], "lighting": [], "image": {}}
```

必须有 `designStatus`（planned 或 ready）；其余只接受 `summary`、`anchors`、`lighting`、`image`、`states`、`scale`、`changes`，按资产种类提供；`changes` 只用于变体场景。

**禁止：** 修改 art.json；写身份字段、facts、sourceRefs、decision、primary、variantOf、usage；写负责范围以外的 ID。

**写回：** 主会话执行 `apply-designs`。它在内存中写入全部设计，执行与 validate 相同的完整检查，全部通过才写回；失败时不写，按 ID 列出问题（变体会连同同组的基准一起检查），主会话只把有问题的那几份退回原设计者。设计不进入身份摘要，写回后逐资产的 identityReview 仍然有效。

## 四、运行环境

| 环境 | 派发方式 |
|---|---|
| Claude Code | 使用 Task/Agent 派发通用 subagent；接力者逐个派发，核验者和设计者的调用放在同一条消息里并发 |
| pi | 有子代理扩展时使用 `subagent` 工具；没有时通过 bash 启动独立的 `pi -p` 进程 |
| 两者都不能 | 在当前会话按同样的文件约定依次完成，汇报中注明「接力、核验与设计在同一会话完成，核验不独立」 |

不新增 agent 定义文件。简报直接给出本文的绝对路径。

## 五、不做的事

- 不并行读取 A 段；不按名称或任何相似度自动合并地点或物件。
- 不把一集拆给多个接力者。
- 不让接力者判断人物身份；carrierRefs 只引用正式 cast。
- 不对核验结论做代码格式检查。
- 不新增调度脚本、状态服务、文件锁、数据库、失败累积日志或统计。
- 不宣称结果已经通过语义审核或图片审核。
