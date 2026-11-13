---
name: mint-outline
version: 4.0.0
description: |
  解析已有剧本，提取来源覆盖、故事摘要、人物地点道具、稳定事件 ID 与分集事实。
  只接受剧本，不接受小说、大纲或原创构思；不改写剧情，不决定镜头。
  输出 schemaVersion 4、自包含来源核验及离线中英报告。保留显式历史迁移。
  Use for existing-script parsing, 剧本解析、剧本对象归并、原文覆盖核对。
allowed-tools: read write edit bash grep find ls Read Write Edit Bash Glob Grep Task
metadata:
  license: Apache-2.0
  requires:
    bins: [node]
  runtimes: [pi, claude-code, codex]
---

# mint-outline

`{baseDir}` 为本文件目录。Node 18+，仅标准库，可独立复制。只解析已有剧本。小说、大纲、创作提案不是正式入口；不得把它们标记为 script 规避限制。文本类别须人工确认，摘要和坐标校验不能识别伪装的小说。

正式编辑源在工作目录 `outline/`，分块及候选在 `outline/.work/`。原件不可覆盖。仅一个发布者组装正式 JSON。Markdown/HTML 为派生报告，不进入版本控制。

## 解析流程

1. 阅读原剧本、[解析指南](references/创作指南.md)、[数据契约](references/schema.md)。确认实际提供范围、是否知道总集数、允许变化与禁止变化；未知结尾和制作目标不补写。
2. 读取显式或向上发现的 production.json（schemaVersion 3）。损坏配置阻断。项目 creativeBrief 只保存于 production；本地要求须人工合并后删除副本。
3. 短剧本直接阅读。长剧本按[分块与覆盖](references/volume-pass.md)拆分。登记文档字节 SHA256、行数、负责范围；相邻上下文不算已负责范围。
4. 先记录出处，再归并 C/S/P 身份和 B 事件。保留无台词人物、同名不同人和未知事实。summary 与每条提取事实附 sourceRefs；只交接下游确需的连续性、说法与揭晓限制。
5. 执行 skeleton、beats、full 结构检查，再执行原件核验。partial 可交付完整的局部解析，不宣称全剧完整。Q 未回答就保持未回答，不能补写答案或删除问题。
6. 独立上下文对照原文核验事实、原句、因果、顺序和授权；不要以 SHA256 通过冒充语义忠实。发现遗漏返回本阶段；表达转译由 script 在授权内处理，候选不进入正式正文。
7. 修改后执行本地下游接口检查。script 从原件读取正文，不从摘要重新生成对白。执行目标仅在 script.targetSeconds 确认；进入制作必须确认并继续检查时长。

自动驾驶仅在 production.autopilot 严格为 true 时开启，不扩大授权，不发明来源或结尾。人物与美术保留 tier/primary 的真实含义；是否出图由制作需求确定。本阶段不决定复用变体或镜头。

## 命令

```bash
node {baseDir}/scripts/mint-outline.mjs source-document script.txt --artifact outline/outline.json
node {baseDir}/scripts/mint-outline.mjs chunk script.txt outline/.work --kind script --max-lines 200 --context-lines 2
node {baseDir}/scripts/mint-outline.mjs validate outline/outline.json --stage skeleton
node {baseDir}/scripts/mint-outline.mjs validate outline/outline.json --stage beats
node {baseDir}/scripts/mint-outline.mjs validate outline/outline.json --verify-sources
node {baseDir}/scripts/mint-outline.mjs verify-sources outline/outline.json
node {baseDir}/scripts/mint-outline.mjs checkup outline/outline.json --verify-sources --downstream --json
node {baseDir}/scripts/mint-outline.mjs render outline/outline.json --html --verify-sources > outline/outline-report.html
node {baseDir}/scripts/mint-outline.mjs render outline/outline.json --md
node {baseDir}/scripts/mint-outline.mjs assets outline/outline.json
```

source-document 读取字节生成文档身份，不登记阅读覆盖。chunk 保留原行，输出不覆盖已有 source-chunks.json；分块不等于已经阅读。validate/checkup/render 不传 --verify-sources 时仅检查内存结构，来源文件核验标记 skipped。verify-sources 会实际打开全部原件，缺失、变更、非法编码或越界均失败。错误退出 1，提醒不阻断，不回写默认值。validate/checkup/render 可传 --production FILE。报告语言依次取 --lang、文档 lang、production.lang、zh，正文不翻译。

## 迁移与测试

[显式迁移](references/migration.md)保留原件和全部旧证据，不伪造新 provenance。migrate-v4 --confirm 仅写入待补证据草稿，不能使草稿通过生产校验。migrate-v3 仅为历史操作。

自有[故事提案](examples/故事提案.md)先于[测试剧本](examples/旧站时刻-script.txt)，再建立[解析样例](examples/旧站时刻-outline.json)。不是从历史大纲自动伪造来源；差异见[样例核对](examples/迁移核对.md)。

通过 node 运行 scripts/selftest.mjs、scripts/fixes-selftest.mjs、scripts/migration-selftest.mjs、scripts/fusion-selftest.mjs。主测试还运行独立复制回归。不调用付费模型，不生成分镜或媒体。
