---
name: mint-outline
version: 5.0.0
description: |
  解析已有剧本，仅提取来源覆盖、故事摘要、剧情节点、分集与问题回答。
  不建立人物、地点、道具身份，不管理资产预算或调度，不决定镜头。
  正式输入仅接受 outline schemaVersion 5，历史数据必须显式迁移。
  Use for existing-script parsing, 剧情梳理、分集解析、原文覆盖核对。
allowed-tools: read write edit bash grep find ls Read Write Edit Bash Glob Grep Task
metadata:
  license: Apache-2.0
  requires:
    bins: [node]
  runtimes: [pi, claude-code, codex]
---

# mint-outline v5

`{baseDir}` 是本文件目录。Node 18+，仅标准库，可以单独复制。只解析已有剧本，不接受小说、大纲或原创构思。文本类别必须人工确认，不能把小说标记为 script 规避限制。

正式编辑源位于工作目录 `outline/`。分块、候选和迁移草稿放在 `outline/.work/`。不覆盖原件。仅一个发布者组装正式 JSON。派生 Markdown/HTML 不进入版本控制。

正式交付固定包含 `xxx.json`、`xxx-report.md`、`xxx-report.html` 三个文件。`xxx` 是同一份 JSON 去掉 `.json` 后的完整文件名；两份报告由该 JSON 渲染，并与它放在同一阶段目录。

## 执行流程

1. 完整阅读原剧本、[解析指南](references/创作指南.md)、[数据契约](references/schema.md)及[交接边界](references/handoff.md)。确认实际提供范围及已知总集数，不补写未知结尾或制作目标。
2. 显式读取或向上发现 production.json（v3）。已提供但损坏的配置阻断，不冒充缺失。项目 creativeBrief 只保存在 production；本地副本须人工合并后删除。
3. 按[分块与覆盖](references/volume-pass.md)登记原件字节 SHA256、物理行数及负责范围。上下文不等于负责范围；生成分块不等于实际读过。
4. 先记录出处，再提取 B 事件、分集及 Q 问题。故事可以描述人物变化、物品交接和状态，但不分配 C/S/P 身份。使用原文支持的自然语言区分同名人物、未知说话者和匿名声音；不能按名称猜测身份。
5. 依次检查 skeleton、beats、full，再核验实际原件。partial 可以是完整的局部解析，不能冒称全剧完整。Q 未回答就保留未回答。
6. 在独立上下文逐处核对事实、原句、因果和揭晓顺序。SHA256 与结构通过不证明语义忠实。表达转译属于 script，未授权候选仅留在 .work。
7. 修改后执行本地剧情下游检查。它核对来源、B 节点认领、正文坐标和制作覆盖，不审核资产身份。script 必须同时读取原剧本，不按梗概重写对白。

完整流程固定为 outline → characters → art → script → creation。上一阶段完成本次范围和必要交接后才能开始下一阶段，不跳过、倒序或并行推进。本 skill 不代替项目级流程状态记录，也不新增状态服务。独立运行只完成本阶段，不能宣称前序阶段、跨阶段身份映射或联合制作已通过。

人物身份由 characters 独立判断。地点和物品的美术身份由 art 独立判断。本阶段不负责角色分档、主场景、出图范围、预算、复用和资产调度。自动驾驶仅在 production.autopilot 严格为 true 时开启，不扩大授权。

## 正式命令

```bash
node {baseDir}/scripts/mint-outline.mjs source-document script.txt --artifact outline/outline.json
node {baseDir}/scripts/mint-outline.mjs chunk script.txt outline/.work --kind script --max-lines 200 --context-lines 2
node {baseDir}/scripts/mint-outline.mjs validate outline/outline.json --stage skeleton
node {baseDir}/scripts/mint-outline.mjs validate outline/outline.json --stage beats
node {baseDir}/scripts/mint-outline.mjs validate outline/outline.json --verify-sources
node {baseDir}/scripts/mint-outline.mjs verify-sources outline/outline.json
node {baseDir}/scripts/mint-outline.mjs checkup outline/outline.json --verify-sources --downstream --json
node {baseDir}/scripts/mint-outline.mjs render outline/outline.json --html --verify-sources > outline/outline-report.html
node {baseDir}/scripts/mint-outline.mjs render outline/outline.json --md --verify-sources > outline/outline-report.md
```

正式 validate/checkup/render/verify-sources 只接受 v5；不隐式双读。assets 命令已移除，返回错误。错误退出 1；不回写默认值，不新增失败累积日志。validate/checkup/render 支持 --production FILE。报告界面语言依次取 --lang、文档 lang、production.lang、zh；正文不翻译。

默认只检查内存结构，source-files 明确 skipped。--verify-sources 实际读取原件，缺失、变更、非法编码或越界均失败。source-document 不登记阅读覆盖。chunk 独占创建 source-chunks.json，不覆盖已有分块。

## 显式迁移

```bash
node {baseDir}/scripts/mint-outline.mjs migrate-v5 old-v4.json
node {baseDir}/scripts/mint-outline.mjs migrate-v5 old-v4.json --out outline/.work/v5-draft.json --project PROJECT_ROOT --confirm
```

保留输入，创建剧情草稿、字节备份及 `v5-draft.migration.json`。逐字段导出资产、所有关系、来源与明确预算；材料不是已审核的资产产物。--confirm 仅授权写入。历史 migrate-v3/migrate-v4 仍是显式历史操作，不能直接进入正式运行。完整字段、路径基准及安全边界见[迁移文档](references/migration.md)。

## 样例与测试

自有[故事提案](examples/故事提案.md)先于[测试剧本](examples/旧站时刻-script.txt)，再建立[剧情样例](examples/旧站时刻-outline.json)。历史自有 fixture 与当前样例的区别见[样例核对](examples/迁移核对.md)。

`node {baseDir}/scripts/selftest.mjs` 执行全部本阶段测试及独立复制回归。也可分别运行 fixes-selftest.mjs、fusion-selftest.mjs、migration-selftest.mjs、v5-migration-selftest.mjs。不调用付费模型，不生成分镜或媒体。结构与 DOM 回归不冒充浏览器布局审核、语义忠实审核或成片审核。
