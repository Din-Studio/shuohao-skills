---
name: novel-creation
version: 3.1.0
description: |
  将 v3 剧本转换为参考图直出视频方案。主会话只负责调度：准备材料、运行结构检查、
  派发「视频提示词编写」与「视频提示词审核」两个 subagent 并循环到全部批准，再回写、导出、交接生成。
  不生成分镜图。不保存上游计划副本或结束坐标。产出 creation.json、每段工作单、报告与投产包。
  视频生成是需要授权的可选步骤。
  Use when asked to 直出视频、参考图生视频、不出分镜图、跳过分镜图 for AI drama。
allowed-tools: read write edit bash grep find ls Read Write Edit Bash Glob Grep Task
triggers:
  - novel-creation
  - 直出视频
  - 参考图生视频
metadata:
  license: Apache-2.0
  requires:
    bins: [node]
  runtimes: [pi, claude-code, codex]
---

# novel-creation

`{baseDir}` 是本文件目录。Node 18+，只有标准库依赖。整个目录可以单独拷走：不读取兄弟 skill 的实现，不依赖第三方 skill。**提示词的编写与审核交给两个角色**——编写方与审核方，各自在独立上下文的 subagent 里工作，只通过工作单 `<段号>/prompt.md` 这一份文件协作。两个角色的指南与命令有两处来源，内容相同：

- 已经安装兄弟 skill `novel-video-prompt`（编写方）与 `novel-video-prompt-review`（审核方）时，subagent 加载它们。
- 没有安装时，subagent 读取本目录 `references/` 里的指南副本，使用本脚本的 `prompts new|submit|verdict`。副本与兄弟 skill 逐字一致，由仓库级自测核对。

两种来源的状态规则出自同一份工作单解析库。主会话在任何情况下都不代替它们编写或审核。

**主会话是调度方**：不写分镜，不写提示词，不做内容评审。它负责准备材料、运行确定性命令、派发 subagent、判断循环是否结束，以及向用户汇报。

```
seed ─→ 编写 subagent ─→ prompts check ─→ 审核 subagent ─→ 全部 approved？
            ↑   结构问题退回 ┘                    │ 否：带着意见退回编写
            └─────────────────────────────────────┘
                                                  是 ↓
                         prompts apply ─→ validate ─→ export ─→ 授权 ─→ videos
```

## 1. 确认输入

读取 `references/schema.md` 和 `references/dispatch.md`。script、outline、creation 和 production 都要求 `schemaVersion:3`。旧数据通过 `migrate-v3` 显式迁移，方法见 `references/migration.md`。正式 validate/render 不读取旧格式。

项目的自然语言 `creativeBrief` 是唯一要求，不解释成枚举或生成规则。独立 creation 可以保存 creativeBrief；项目与阶段同时存在要求时停止，请人工合并到 production。

命令自动从产物目录向上最多五层寻找 production.json，再从项目的 script、outline、art、characters 目录发现唯一 JSON。显式路径优先。缺少上游显示跳过；损坏、不可读或多候选输入失败，不能当作缺少上游。独立剧本没有大纲时，不要求伪造计划。

确认两个角色的来源：兄弟 skill 是否已经安装并且当前运行环境能够加载。在仓库里可以这样安装：

```bash
./scripts/install.sh novel-video-prompt novel-video-prompt-review   # 在本仓库根目录
```

安装到 Claude Code 时会同时链接两个 subagent 定义 `novel-video-prompt-writer` 与 `novel-video-prompt-reviewer`，它们预载对应的 skill；pi 的同名角色定义位于仓库的 `.pi/agents/`。没有安装兄弟 skill 时不停止，按 `references/dispatch.md` 的「本地来源」派发。

## 2. 准备骨架

产物位于 `<工作目录>/creation/`，参考图相对该目录。先进入此目录：

```bash
node {baseDir}/scripts/novel-creation.mjs seed ../script/作品-script.json --eps 1-3 > 作品-creation.json
```

seed 只预填节拍工作底稿 seedScenes，segments 留空。默认每批最多三集。creation 不保存 opening、ending、endBeat：计划读取当前 outline，或没有 outline 时读取独立 script；可选 openingBeat 只复制 script 的显式标注并严格对账，结束坐标从实际 flow 计算。

为本批每一集生成派发材料（节拍底稿、资产表、项目要求、有效模型、开场与集尾计划）：

```bash
mkdir -p .work
node {baseDir}/scripts/novel-creation.mjs prompts brief 作品-creation.json --ep 1 > .work/E01-输入材料.json
```

工作单目录就是 `creation/`：每段一份 `creation/<段号>/prompt.md`。已经有段的旧 creation.json 需要补走审核时，运行 `prompts init` 生成草稿工作单。

## 3. 编写与审核循环

按 `references/dispatch.md` 的任务简报派发。一集一个编写 subagent、一个审核 subagent；多集可以并发，所有调用放在同一条消息里。

每一轮：

1. **派发编写 subagent**：有 `novel-video-prompt-writer` 定义时按名字派发；没有时派发通用 subagent，并在简报里给出编写方指南的绝对路径（兄弟 skill 的 SKILL.md，或本地来源的指南副本）。首轮传入输入材料路径、有效视频模型与工作单目录；修改轮指明哪些段被退回，以及结构检查的输出。
2. **运行结构检查**：

   ```bash
   node {baseDir}/scripts/novel-creation.mjs prompts check 作品-creation.json
   ```

   它把工作单拼入内存中的 creation 并执行全部确定性检查（节拍覆盖、台词逐字、时长、模型限制、骨架短语、参考图），不要求已经批准，也不改写任何文件。失败时把输出原样交还编写 subagent，**不启动审核**——不让审核方把轮次花在工具能够判断的问题上。
3. **派发审核 subagent**：有 `novel-video-prompt-reviewer` 定义时按名字派发；没有时派发通用 subagent，并在简报里给出审核方指南的绝对路径。传入与编写方相同的材料和工作单路径，**不转述编写方的回报或自我评价**。批准时审核方要带上这份输入材料，批准才会绑定它。
4. **查看状态**：

   ```bash
   node {baseDir}/scripts/novel-creation.mjs prompts status 作品-creation.json
   ```

   全部批准并且批准仍然有效（退出码为零）则结束循环。有 `changes_requested` 的段回到第 1 步，只派发被退回的那几集。有 `blocked` 的段先停下来：审核方发现了编写方无法单独解决的问题（缺少设定图、剧本台词有误、目标时长无法容纳），协调上游或请用户决定之后，重新生成输入材料，再派发编写方回应并提交。

止损：同一段**提交三轮仍未批准**时，`prompts status` 会标出；停止这一段的循环，把审核意见与编写回应的分歧原样交给用户决定。`production.autopilot` 为 true 时同样止损，不无限重试。结构检查连续两次以同一原因失败，也停下来汇报。

**批准绑定两样东西**：这一段的分镜结构与正文，以及这一段依据的输入——认领节拍的原文、挂载参考图的内容、视频模型与参数、提示词语言、单段上限和项目要求。任何一样变化，这一段的批准失效；别的段不受影响。`prompts status` 会指出哪些段因为哪一种变化失效：重新生成输入材料，只对这些段重新派发。

主会话不修改工作单的任何区域。状态头只由编写方与审核方的命令改写；发现状态与内容对不上时，按 `prompts status` 的提示重新派发，不手工修正。

**没有子代理能力的运行环境**：在当前会话依次承担两个角色，串行完成编写与审核，流程与命令不变。汇报中必须注明「审核与编写在同一会话完成，审核不独立」。

## 4. 回写、检查与报告

```bash
node {baseDir}/scripts/novel-creation.mjs prompts apply 作品-creation.json
node {baseDir}/scripts/novel-creation.mjs validate 作品-creation.json
node {baseDir}/scripts/novel-creation.mjs checkup 作品-creation.json
node {baseDir}/scripts/novel-creation.mjs render 作品-creation.json --md > 作品-creation.md
node {baseDir}/scripts/novel-creation.mjs render 作品-creation.json --html --lang zh > creation-report.html
# 需要明确选择上游时：
node {baseDir}/scripts/novel-creation.mjs validate 作品-creation.json --script ../script/作品-script.json --outline ../outline/作品-outline.json --art ../art/作品-art.json --cast ../characters/作品-cast.json
```

apply 只在全部工作单已批准、批准的两重绑定仍然有效并且结构检查通过时，把分镜与提示词回写 creation.json，同时移除 seedScenes。creation.json 仍是机器侧唯一数据源；工作单是协作文件，也是下单时读取提示词的文件。

基础检查保留唯一身份、节拍顺序覆盖、节点认领、资产引用、参考图身份、提示词、时长与模型技术限制。可选本地配方卡通过 `--shots <目录>` 挂载。参考图存在不表示生成质量通过。

状态为 pass/fail/skipped，失败的 error 阻断。缺少上游为 missing-upstream。分别汇报「结构检查通过」「提醒」「缺少上游未检查」，以及内容审核的结论：每段的审核状态与轮次、审核方留下的建议、需要实际视频验证的事项。修改正文、项目要求、视觉要求或模型后，受影响的段要重新编写并审核。

报告正文优先，随后展示当前上游交接、资产、估时和检查状态。zh/en 是报告语言，与 promptLang 分开。HTML 可重建，不进入版本控制。

## 5. 投产包

```bash
node {baseDir}/scripts/novel-creation.mjs export 作品-creation.json --out .
```

export 要求实际剧本并执行检查，还要求**每一段都有已批准、绑定仍然有效、并且与 creation.json 一致的工作单**；有任何一段不满足就失败。它只写出根部 manifest.json，引用各段现有的工作单与 creation.json，不改写工作单，不复制图像。`--out` 指向其他目录时，manifest 里的路径相对 manifest 自己，工作单仍留在 creation 目录（`--dir` 可以另指）。投产包不表示已生成视频。

## 6. 授权后的可选生成

读取 `references/video-order.md` 和 `references/media-handoff.md`。`videos manifest.json --dry-run` 只输出离线计划，`--out video-plan.json` 另存且拒绝覆盖。它按当前的 creation.json 与上游再次核对每段工作单的批准：内容没有改动、输入没有变化、视频参数与导出时一致，然后只取最后一条分隔线之下的提示词正文。计划带有 `approval.input`；外部执行工具提交之前重新运行 `videos` 并比对这个值，不一致就回到编写与审核，不提交。没有媒体执行工具或授权时交付计划并明确未生成。

用户授权后，外部执行工具发现实时模型与 schema，预览请求、告知最终秒数和费用，然后在授权范围内提交。可以选择已安装的 ly-video，但本 skill 不依赖它完成方案交付。超模型上限失败，不截短故事。恢复原任务，不因等待到期重复提交。下载核验后才报告完成。

production.autopilot 只有布尔 true 生效。它转移审批权，不取消费用告知、授权范围、技术检查、审核循环或止损。不得新增永久评分或门失败累积记录；工作单里的审核意见只保留本轮。

## 样例与自测

`examples/` 是本 skill 自有《收书人》：一集、四段、九个镜头、十个节拍，目标三十秒、镜头计划三十二秒。样例的 creation.json 早于审核流程，没有附带工作单，因此不能直接导出；自测在临时目录里生成并批准工作单来覆盖完整流程。详情见 `examples/MIGRATION.md`。

```bash
node {baseDir}/scripts/selftest.mjs
node {baseDir}/scripts/strategy-selftest.mjs
node {baseDir}/scripts/fixes-selftest.mjs
node {baseDir}/scripts/discovery-selftest.mjs
node {baseDir}/scripts/media-plan-selftest.mjs
node {baseDir}/scripts/migration-selftest.mjs
node {baseDir}/scripts/worksheet-selftest.mjs
```

全部为本地确定性检查，不调用模型，不访问网关。
