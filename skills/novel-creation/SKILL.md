---
name: novel-creation
version: 2.0.0
description: |
  将 v2 剧本转换为参考图直出视频方案：生成段、分镜、节拍认领、既有参考图挂载、通用视频提示词。
  不生成分镜图。创作策略与模型能力分开加载，镜头时长规则支持 off/warn/error。
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
    optional: [lingying]
  runtimes: [pi, claude-code, codex]
---

# novel-creation

`{baseDir}` 是本文件目录。Node 18+，只有标准库依赖。整个目录可以单独拷走，不读取兄弟 skill 的 references，不依赖第三方 skill。允许读取项目 JSON 和已经落盘的参考图。

## 职责与边界

- 保留 **集 → 生成段 → 分镜**。段对应一次生成调用，不跨剧本场次；镜头认领连续节拍。
- 不改写故事、台词或上游节点。先确定故事，再写分镜。模型技术上限不是创作节奏。
- 段挂载既有角色／场景／道具设定图，不产生新的分镜图，不复制参考图。
- 不做剪辑合成。真实视频生成需要单独授权；没有授权就交付方案与投产包。
- 不新增质量门失败累积日志、统计命令或永久内容评分。

## 1. 输入与选择

先完整读取 `references/schema.md`、`references/profile-contract.md`、`references/shot-pass.md`、`references/review-core.md`。

完整创作需要 `schemaVersion:2` 的 script 和 outline，以及参考图名字映射所需的 cast/art。旧数据先按 `references/migration.md` 迁移。可以独立校验已有 creation；缺上游必须显示跳过，不能宣称完整联合交付。提供损坏上游时失败，不作为缺失跳过。

项目根的 `production.json` 管理视觉正文 `style`、制作参数 `video` 和四维 `creative.selection`。脚本从产物目录向上最多五层发现它，也支持显式 `--production`。新项目没有选择时提出组合并确认；自动驾驶下明确记录选择理由。既有项目缺少 creative 不自动获得密集兑现策略。

创建阶段必须加载所选 **genre、narrativeStyle、pacing** 的本地 profile 与指南。structure 只记录完整项目身份，不加载本地实现；集尾方式直接遵循剧本。画幅、视觉风格、模型名称都不能推导创作节奏。

```bash
node {baseDir}/scripts/novel-creation.mjs profiles
node {baseDir}/scripts/novel-creation.mjs profile --selection selection.json
node {baseDir}/scripts/novel-creation.mjs seed script.json --eps 1-3 > creation/作品-creation.json
node {baseDir}/scripts/novel-creation.mjs apply-profile creation/作品-creation.json --production production.json
# 阅读预览；逐项确认已有覆盖，之后才写入
node {baseDir}/scripts/novel-creation.mjs apply-profile creation/作品-creation.json --production production.json --decisions decisions.json --confirm
```

独立模式使用 `--selection selection.json`。覆盖文件是完整路径到完整规则对象的映射，例如 `{"params.rules.cutDuration":{"level":"off"}}`；决策文件是路径到 `keep/drop` 的映射。预览、取消、错误都不能留下半更新产物。成功写入前备份；新组合从中性基线重建，只重建本阶段规则，不改技术参数、上游故事或镜头。

`validate/render` 只读取当前有效参数。来源缺失／漂移仅提醒历史读取，不改摘要。继续创作前必须恢复同版本原文件，或升级选择后重新应用；不得接受同版本新摘要。项目选择不一致阻断完整交付。

## 2. 分段、切镜与提示词

seed 保留剧本 `opening/ending/openingBeat/endBeat`，只复制 ending 的 mode/event，不复制问题计划。剧本必须显式提供语速和动作估时参数，读取时不补默认值；估时与段长计算不提前舍入。`seedScenes` 是按语速和动作参数计算的工作底稿，不是真实表演时长；segments 为空，不伪造镜头。默认每批最多三集，完成后删除 seedScenes。

先遵循实际事件和上游开场／集尾意图，再决定镜头长度。唯一镜头表达规则为 `params.rules.cutDuration`；关闭合法，提醒不阻断。观察、停顿、静物开场和较长镜头都可能成立；不能统一要求运动开场、三秒剪切或段尾悬念。最终集 open/closure 不改成追更悬念。

模型能力另行检查：段长须满足 `maxSegmentSeconds` 和有效视频模型合法区间，创作覆盖不能放宽。超过单次能力的连续镜头必须修改制作方案；多次生成不保证连续性。

先读 `references/creation-prompt.md` 的通用骨架，再按 **有效 video.model** 读取模型技术指南：

| 模型 | 技术指南 |
| --- | --- |
| MiniMax H3 | `references/h3-prompt.md` |
| seedance 系列 | `references/seedance2-prompt.md` |
| 未收录模型 | 只使用通用骨架，明确说明能力尚未核实 |

模型指南不替代创作指南。每段 prompt 按 Picture 身份说明和 `[Shot k]` 组织；景别、运镜和原文台词必须进入相应镜头。保留模型语言、时刻标记限制和参考图身份约束。配方卡可通过 `--shots <本地卡片目录>` 显式挂载，但不是运行前提，不要求安装其他 skill。

## 3. 检查与内容评审

全部产物位于 `<工作目录>/creation/`，参考图路径相对该目录。执行前进入此目录：

```bash
node {baseDir}/scripts/novel-creation.mjs validate 作品-creation.json --script ../script/作品-script.json --outline ../outline/作品-outline.json --art ../art/作品-art.json --cast ../characters/作品-cast.json
node {baseDir}/scripts/novel-creation.mjs checkup 作品-creation.json --script ../script/作品-script.json --outline ../outline/作品-outline.json --art ../art/作品-art.json
```

基础检查包括字段、唯一身份、局部／上游节拍认领、开场集尾实际位置、上游计划和目标时长对账、参考图、提示词和模型技术限制。策略检查只按当前 level 执行。每项保存 `status=pass/fail/skipped` 和 category/level/reason，不保存 ok。

基础失败或 error 策略失败返回非零。warn 失败显示“提醒”，不计通过。off 显示 `policy-disabled`；缺上游显示 `missing-upstream`。骨架尚无镜头时不能完整交付。没有生产选择对账、没有上游或没有内容评审，都不能汇报“全部完成”。

依据通用评审和实际加载指南逐项引用镜号／节拍证据。结构有效不证明情绪成立，估时不证明生成效果。更换策略、视觉正文或模型后，重新检查分镜、提示词、参考图和已导出投产包；不得自动声称旧视频仍有效。

## 4. 报告与投产包

```bash
node {baseDir}/scripts/novel-creation.mjs render 作品-creation.json --script ../script/作品-script.json --outline ../outline/作品-outline.json --art ../art/作品-art.json --md > 作品-creation.md
node {baseDir}/scripts/novel-creation.mjs render 作品-creation.json --script ../script/作品-script.json --outline ../outline/作品-outline.json --art ../art/作品-art.json --html --lang zh > creation-report.html
node {baseDir}/scripts/novel-creation.mjs export 作品-creation.json --script ../script/作品-script.json --outline ../outline/作品-outline.json --art ../art/作品-art.json --out .
```

报告展示当前有效配置、覆盖路径、来源摘要、作品承诺、开场／集尾镜头落点、上游节点认领、分镜正文、参考图、配音对齐和三类检查状态。语言支持 zh/en，与 promptLang 分开。JSON 导出保持输入原样。HTML 是派生产物，不进入版本控制。

export 在检查通过后生成 manifest 和每段 prompt.md，包含已有参考图路径及模型参数，不复制图像。投产包不是已生成结果。

## 5. 视频生成（仅授权后）

读取 `references/video-order.md`。使用 `videos manifest.json --dry-run` 检查下单计划。实际生成前告知模型、总秒数和费用预估；没有 lingying 或授权就跳过。原有 `lib/lingying.mjs` 负责提交、轮询、续传、去重上传与止损。超模型上限的段直接失败，不截短下单。普通续传须核对现有台账的输入身份；身份变化要求明确使用 `--force`，该选项始终重新提交而不复用旧任务。同一段连续失败两次停止该段，不无限重试。

production.autopilot 必须严格为布尔 true 才生效。它转移审批权，不取消策略确认记录、费用告知、授权范围、检查或止损。替用户作出的选择写入当次汇报。

## 样例与自测

`examples/` 保留本 skill 原创《收书人》：一集、四段、九个镜头、十个节拍；目标三十秒，镜头计划三十二秒。v2 上游夹具按原文手工迁移，内容评审后增加一句确认姐妹关系的自语，终点是认出私人旧物后的开放余味，不伪造寻人成功。迁移与内容限制见 `examples/MIGRATION.md`。

```bash
node {baseDir}/scripts/selftest.mjs
node {baseDir}/scripts/strategy-selftest.mjs
node {baseDir}/scripts/profile-selftest.mjs
node {baseDir}/scripts/fixes-selftest.mjs
```

只执行确定性检查及注入假 CLI 的生成接口回归，不调用模型。
