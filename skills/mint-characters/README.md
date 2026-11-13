**中文** · [English](README.en.md)

# mint-characters

正式交付固定包含 `cast.json`、`cast-report.md`、`cast-report.html` 三个文件。两份报告由 `cast.json` 渲染，三个文件均放在项目 `characters/` 目录下。

独立阅读原剧本，建立稳定人物身份。正式产物为 **cast v1**（`schemaVersion: 1, kind: mint-characters`）。outline **v5 仅为可选故事背景**，不是人物权威；production 保持 v3。

## 安装

完整复制本目录到 Agent 的 skills 目录。脚本只需要 Node 18+，没有 npm 依赖，也不依赖任何其他 skill。

## 使用

```bash
node scripts/mint-characters.mjs seed --source book.txt --title 书名 --budget 30 --out draft.json
# 人工或模型独立阅读，补齐身份、来源引用与实际已读范围；seed 只做骨架
node scripts/mint-characters.mjs reconcile draft.json --out cast.json
node scripts/mint-characters.mjs validate cast.json
node scripts/mint-characters.mjs render cast.json --md > cast-report.md
node scripts/mint-characters.mjs render cast.json --html > cast-report.html
```

交付放在项目 `characters/` 下。`--outline outline-v5.json` 可选；缺少时背景检查 skipped，提供损坏或错误版本则失败。原件路径相对记载它的 JSON；摘要、行数和覆盖必须核验，原件缺失不可跳过。

- 同名不同人、别名、无台词、匿名声音、未知说话者、非人及提及身份均保留。
- 人物身份不要求画像、声音或图片。persona / voice / image 各自按需设计。
- `--budget` 限制活动身份数量，明确超额在本阶段阻断，不降低为提醒。
- 既有产物通过 `reconcile candidate.json --previous cast.json --changes changes.json` 增量核验。重排不改 ID，合拆删纠正必须有显式映射和依据，退役 ID 不复用。
- 增量 validate/render/images 必须提供 --previous。结构通过不等于语义审核或完整流程交接通过。

## 画像、音色与图片

保留历史独立设计、assemble、Markdown、交互报告和离线计划能力。正式身份中的设计块为独立可选项；详见[设计字段](references/design-schema.md)。`images cast.json` 只对存在 image 的身份导出计划，不提交、不生成；正式任务及路径使用 C ID，例如 `images/C01-sheet.png`。外部生成工具由用户选择，不作为本 skill 安装前提。

## 历史迁移

```bash
node scripts/mint-characters.mjs migrate-outline old-outline-v4.json --out pending.json
node scripts/mint-characters.mjs migrate-cast old-cast.json --out pending-cast.json
```

保留原文件、旧 ID、画像、声音、图片、全部字段、关系和预算。输出逐字段 pending 材料，不能冒充正式 cast 或审核通过。正式 seed 不再接受 outline v3/v4；显式 `seed old-outline.json --legacy` 仅保留旧骨架。

[完整工作流](SKILL.md) · [正式契约](references/schema.md) · [来源](references/source-facts.md) · [迁移及消费者矩阵](references/migration.md)

## 自有样例与测试

`examples/回声台.txt` 和 `回声台-cast.json` 展示独立身份登记与全部语义边界。`examples/渡口-cast.json` 保留完整历史画像、音色和图片提示词样例。HTML 为可重建产物，不提交版本控制。

```bash
node scripts/test-all.mjs
```

全部测试离线，不调用模型、网关或付费生成。其他阶段的集成审核不由本测试冒充通过。
