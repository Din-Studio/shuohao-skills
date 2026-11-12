---
name: novel-outline
version: 3.0.0
description: |
  创作或改编故事大纲：核心处境、贯穿线索、人物资产、稳定 ID 重要事件与分集梗概。
  使用本地创作指南，不要求策略配置。输出 schemaVersion 3、Markdown 和离线中英报告。
  支持分卷、分阶段检查、下游本地接口检查与显式 v2 迁移。
  Use when asked to 改编大纲、短剧大纲、拆大纲、原创大纲、小说转短剧、adaptation outline。
allowed-tools: read write edit bash grep find ls Read Write Edit Bash Glob Grep Task
metadata:
  license: Apache-2.0
  requires:
    bins: [node]
  runtimes: [pi, claude-code, codex]
---

# novel-outline

`{baseDir}` 为本文件目录。Node 18+，仅标准库，可独立复制。正式产物位于工作目录的 `outline/`；临时材料在该目录的 `.work/`。JSON 是唯一编辑源。报告可重新生成，不进入版本控制。

## 创作流程

1. 阅读实际输入、[创作指南](references/创作指南.md) 与 [数据契约](references/schema.md)。确认集数、分钟数、题材、原创或改编方式与自然语言要求；不凭书名脑补。
2. 读取显式或向上发现的唯一 production.json。正式项目要求 schemaVersion 3；损坏配置不是缺少上游。creativeBrief 只在项目保存。独立大纲可保存本地要求；接入项目时先人工合并，再删除阶段副本。
3. 先确定故事，再建立骨架，不写分镜。长篇尚未完整阅读时按 [分卷指南](references/volume-pass.md) 整理来源，明确未覆盖范围。
4. 写 story、人物、场景及必要道具；原创无需 adaptation/from。完成 skeleton 后建立重要事件与 endingBeatId；完成 beats 后写分集。阶段通过不等于 full 交付。
5. 按创作指南进行内容评审，引用集号和节点。已登记 required 问题必须履行，不能为了通过检查删除承诺。结构检查不会自动确认内容质量。
6. 修改节点或目标后执行本地检查与已知下游接口检查。需要完整联合交付时，继续执行各阶段完整校验；本 skill 不 import 兄弟代码。

production.autopilot 仅严格布尔 true 开启。自动驾驶自行决定并汇报，但不取消阶段检查与内容评审。视觉 style 与媒体协议不属于本阶段改造范围。

## 命令权威入口

```bash
node {baseDir}/scripts/novel-outline.mjs chunk book.txt outline/.work --per-volume 15
node {baseDir}/scripts/novel-outline.mjs validate outline/outline.json --stage skeleton
node {baseDir}/scripts/novel-outline.mjs validate outline/outline.json --stage beats
node {baseDir}/scripts/novel-outline.mjs validate outline/outline.json
node {baseDir}/scripts/novel-outline.mjs checkup outline/outline.json --json --downstream
node {baseDir}/scripts/novel-outline.mjs render outline/outline.json --md > outline/outline.md
node {baseDir}/scripts/novel-outline.mjs render outline/outline.json --html > outline/outline-report.html
node {baseDir}/scripts/novel-outline.mjs render outline/outline.json --html --lang en > outline/outline-report.en.html
node {baseDir}/scripts/novel-outline.mjs assets outline/outline.json
```

validate/checkup/render 可传 `--production FILE`。语言优先级为 --lang、文档 lang、production.lang、zh。报告只翻译界面，不改正文。检查不写回默认值。错误退出 1；提醒不阻断。render 可输出诊断报告但无效数据退出非零。

报告正文优先，随后展示事件、资产、目标时长、用户预算与工具参考值，最后展示结构及内容评审状态。缺少上游、阶段未完成、提醒和结构失败分别说明。

## 迁移、样例与验证

显式迁移见 [迁移说明](references/migration.md)。默认预览，不覆盖输入；未知版本不自动修饰。自有 [旧站时刻](examples/旧站时刻-outline.json) 保留既定 [故事提案](examples/故事提案.md)，表达迁移记录见 [迁移核对](examples/迁移核对.md)。

本地测试入口：scripts/selftest.mjs、scripts/fixes-selftest.mjs、scripts/migration-selftest.mjs，均通过 node 执行。主测试额外执行独立复制回归；不调用付费模型。
