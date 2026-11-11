---
name: novel-creation
version: 3.1.0
description: |
  将 v3 剧本转换为参考图直出视频方案：生成段、分镜、节拍认领、既有参考图挂载、通用视频提示词。
  不生成分镜图。不保存上游计划副本或结束坐标。创作方法与模型技术检查分离。
  产出 creation.json、Markdown、HTML 报告与投产包。视频生成是需要授权的可选步骤。
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

`{baseDir}` 是本文件目录。Node 18+，只有标准库依赖。整个目录可以单独拷走；不读取兄弟 skill 的实现或指南，不依赖第三方 skill。允许读取项目 JSON 和已经落盘的参考图。

## 0. 主 session 调度

完整读取 `references/prompt-workflow.md`。主 session 只准备输入、调度两个独立 subagent、处理阻塞和交接生成，不亲自编写或批准 prompt。

编写 subagent 使用“视频prompt编写”skill（或本 skill 自带完整编写规范）；审核 subagent 使用“视频prompt审核”skill（或本 skill 自带完整审核规范）。两者独立上下文、串行修改同一文档。编写完成通知主 session，主 session 启动审核，收到 changes_requested 后再次启动编写与审核，直到整批有效 approved。缺少独立子代理能力时明确暂停，不冒称已独立审核。

角色输入包、权限、状态、命令与恢复以该本地协议为准。新 skill 不作为本目录的代码依赖。

## 1. 确认输入与创作要求

完整读取 `references/创作指南.md` 和 `references/schema.md`。创作方法与评审问题只在本地指南维护。先确定故事，再写分镜，不为了通过结构检查改写故事。

script、outline、creation 和 production 都要求 `schemaVersion:3`。旧数据通过 `migrate-v3` 显式迁移，方法见 `references/migration.md`。正式 validate/render 不读取旧格式。

项目的自然语言 `creativeBrief` 是唯一要求，不解释成枚举或生成规则。独立 creation 可以保存 creativeBrief；项目与阶段同时存在要求时停止，请人工合并到 production。视觉 style、模型与外部媒体协议不改变。

命令自动从产物目录向上最多五层寻找 production.json，再从项目的 script、outline、art、characters 目录发现唯一 JSON。显式路径优先。缺少上游显示跳过；损坏、不可读或多候选输入失败，不能当作缺少上游。独立剧本没有大纲时，不要求伪造计划。

## 2. 编写 subagent：分段与提示词

```bash
node {baseDir}/scripts/novel-creation.mjs seed script/作品-script.json --eps 1-3 > creation/作品-creation.json
```

seed 只预填节拍工作底稿 seedScenes，segments 留空。完成分镜后删除 seedScenes。默认每批最多三集。creation 不保存 opening、ending、endBeat：计划读取当前 outline，或没有 outline 时读取独立 script；可选 openingBeat 只复制 script 的显式标注并严格对账，结束坐标从实际 flow 计算。没有标注 openingBeat 时不能把第一拍冒称为已核验开场。

每段对应一次生成，不跨场次。每个镜头认领连续节拍，全剧本正文恰好覆盖一次且按顺序。保留上游节点认领及资产 ID。台词逐字保持。估时默认语速 4.5、动作 2.5 秒、容差 0.15；只读取，不向文件写入默认值。script 的显式覆盖统一参与估时。

镜头停留服务于信息与表演，没有所有作品通用的建议时长硬门。段长必须满足 maxSegmentSeconds 和有效模型区间；技术限制不能关闭。超出单次能力的长镜头应调整制作方案，不承诺多次生成天然连续。

完整读取 `references/creation-prompt.md`，再按有效 video.model 读取技术指南：MiniMax H3 对应 `references/h3-prompt.md`；seedance 系列对应 `references/seedance2-prompt.md`；未知模型只使用通用骨架，并明确能力未核实。每段按 Picture 身份说明和 `[Shot k]` 组织，参考图数组顺序、景别、运镜和台词原文保持一致。

## 3. 独立审核 subagent：结构检查与内容评审

产物位于 `<工作目录>/creation/`，参考图相对该目录。先进入此目录：

```bash
node {baseDir}/scripts/novel-creation.mjs validate 作品-creation.json
node {baseDir}/scripts/novel-creation.mjs checkup 作品-creation.json
# 需要明确选择上游时：
node {baseDir}/scripts/novel-creation.mjs validate 作品-creation.json --script ../script/作品-script.json --outline ../outline/作品-outline.json --art ../art/作品-art.json --cast ../characters/作品-cast.json
```

基础检查保留唯一身份、节拍顺序覆盖、节点认领、资产引用、参考图身份、提示词、时长与模型技术限制。可选本地配方卡通过 `--shots <目录>` 挂载，不要求其他 skill。参考图存在不表示生成质量通过。

状态为 pass/fail/skipped，失败的 error 阻断。缺少上游为 missing-upstream。骨架没有镜头时不能交付。按创作指南引用镜号完成内容评审，单独报告“结构检查通过”“提醒”“缺少上游未检查”“内容评审未执行”。修改正文、项目要求、视觉要求或模型后重新检查引用、覆盖与实际内容，不按策略身份判断是否过期。

## 4. 审核文档、报告与投产包

```bash
node {baseDir}/scripts/novel-creation.mjs render 作品-creation.json --md > 作品-creation.md
node {baseDir}/scripts/novel-creation.mjs render 作品-creation.json --html --lang zh > creation-report.html
node {baseDir}/scripts/novel-creation.mjs export 作品-creation.json --out .
```

报告正文优先，随后展示当前上游交接、资产、估时和检查状态。zh/en 是报告语言，与 promptLang 分开。展示的上游计划不是新编辑源；导出 JSON 仍为原始 creation。HTML 可重建，不进入版本控制。

export 要求实际剧本并执行检查。首次输出每段 draft 状态的 prompt.md 和 manifest，保持参考图顺序与路径，不复制图像。再次导出保留已有正文和审核意见，并同步 JSON prompt 兼容镜像。首次导出后 Markdown 是提示词编辑源；JSON 仍是分段分镜结构源。render/checkup 展示独立审核结果。投产包不表示已通过审核或生成视频。

编写完成后使用 `review manifest.json --segment E01-01 --status pending_review` 提交。审核代理使用 `review manifest.json --segment E01-01 --status approved|changes_requested|blocked --reviewer prompt-reviewer --opinion /absolute/current-opinion.txt` 写回同一 Markdown。完整流程和旧文档显式转换见 `references/prompt-workflow.md`。只有审核代理执行结论命令，不手填 approved。

## 5. 授权后的可选生成

整批审核均为当前输入的有效 approved 后，读取 `references/video-order.md` 和 `references/media-handoff.md`。正文、上游、参考图或模型参数变化后必须重新审核。`videos manifest.json --dry-run` 只输出离线计划，`--out video-plan.json` 另存且拒绝覆盖。没有媒体执行工具或授权时交付计划并明确未生成。

用户授权后，外部执行工具发现实时模型与 schema，预览请求、告知最终秒数和费用，然后在授权范围内提交。可以选择已安装的 ly-video，但本 skill 不依赖它完成方案交付。超模型上限失败，不截短故事。恢复原任务，不因等待到期重复提交。下载核验后才报告完成。

production.autopilot 只有布尔 true 生效。它转移审批权，不取消费用告知、授权范围、技术检查或止损。不得新增永久评分或门失败累积记录。

## 样例与自测

`examples/` 是本 skill 自有《收书人》：一集、四段、九个镜头、十个节拍，目标三十秒、镜头计划三十二秒。本轮只迁移表达，不重创故事或分镜。详情见 `examples/MIGRATION.md`。

```bash
node {baseDir}/scripts/selftest.mjs
node {baseDir}/scripts/strategy-selftest.mjs
node {baseDir}/scripts/fixes-selftest.mjs
node {baseDir}/scripts/discovery-selftest.mjs
node {baseDir}/scripts/media-plan-selftest.mjs
node {baseDir}/scripts/migration-selftest.mjs
node {baseDir}/scripts/review-selftest.mjs
```

全部为本地确定性检查，不调用模型，不访问网关。
