---
name: mint-script
version: 3.0.0
description: |
  把故事写成结构化场次、动作和台词。支持独立创作及 outline v3，
  按节点 ID 认领核心表现范围，从正文计算结束位置，读取当前上游计划。
  创作方向由自然语言要求与本地指南确定，不预设冷开场、密集动作或悬念集尾。
  输出 JSON、Markdown、离线中英报告。不分镜、不出图、不调用付费模型。
  Use when asked to 写剧本、台词、场次、写戏、screenwriting、script。
allowed-tools: read write edit grep find ls mint_skill
triggers:
  - mint-script
  - 剧本
  - 写剧本
  - 台词
  - screenplay
metadata:
  license: Apache-2.0
  runtimes: [mint-cloud]
---

# mint-script v3

剧本负责人物行为和表达。分镜、镜号、模型提示词、参考图及生成调度属于视频制作阶段。整个 skill 可单独复制，只有 Node 18+ 标准库依赖，不读取兄弟代码、兄弟样例或第三方 skill。

{baseDir} is the packaged skill directory. Use workspace-relative paths with read/write/edit/find/grep/ls and invoke deterministic commands through mint_skill without shell execution. [README](README.md) owns command examples and developer-only self-tests.

## 输入与要求

读取本地 [创作指南](references/创作指南.md) 和 [数据契约](references/schema.md)。读取用户要求以及工作目录 production.json，或明确声明独立模式。

production v3 的可选 creativeBrief 是项目要求；独立 script 可保存自己的 creativeBrief。两者同时非空时要求人工合并进 production，再删除阶段副本。自然语言不解析成枚举、门槛或模型参数。视觉 style 和媒体协议不在本阶段更改。

有上游时读取当前 outline v3，可选 art/cast。CLI 自动发现唯一上游，多个候选必须显式指定。损坏输入、错误版本和悬空链接不能当作缺少上游。无大纲也可写作，但不宣称节点、问题及全剧结局已对账。

## 骨架与逐批写戏

项目产物放入项目根 script/。JSON 是唯一编辑源，Markdown/HTML 是派生视图。

seed 只建立集号、目标、按序 B ID 认领与空 scenes，不复制 opening/ending、Q、项目要求、默认参数或 seedNote。骨架检查通过不代表完整交付。

先确定故事，再安排事件，最后写场次。建议每批最多三集，传递人物位置、知情状态、道具状态与未兑现承诺。正文 flow 是有序动作和台词，不要求机械交替。characters 包括无台词人物，lighting/delivery 仅在确有表达价值时填写。

有大纲时每个当集节点都需认领，未分类节点同样不能遗漏。核心段按上游顺序、包含两端、不重叠，允许跨场次，共同铺垫可在范围之外。独立无节点时允许省略 beatClaims。

openingBeat 可选；省略不是确认第一拍。结束坐标由最后一个实际 flow 项计算，不保存 endBeat。上游 opening/ending 只有大纲一份编辑源，报告读取当前实际计划。修改正文后重新计算受影响的认领坐标并检查；不能因旧坐标仍存在就声称内容有效。

## 结构检查与内容评审

运行 validate/checkup。结构、引用、数值、版本或上下游目标不一致会阻断。粗略估时偏离仅提醒，不能据此强制删除有效表演。估时参数只有用户明确覆盖时保存，所有时间轴使用统一有效参数。

接着按创作指南阅读实际正文，检查动机、因果、信息、承诺、跨集状态及开场集尾表达。Q 由大纲维护；本阶段按 resolves 和 beatClaims 展示回答落点，不建第二份问题表。

记录具体分集、节点、坐标、原文、判断和复核状态到当前工作记录。不保存永久评分、失败累积日志或统计。自动检查始终声明内容评审未执行。要求变更后重新评审，不以指南已读取或字段完整代替内容结论。

## 报告与交接

报告优先展示正文，再展示关键事件、必要计划、资产、台词本、估时与结构状态。未填写的可选字段不建立大面积空配置区。原始 JSON 导出不插入默认值、统计或评审结论。派生 HTML 不进版本控制。

CLI 同时检查已知 creation v3 的当前实际 flow 顺序覆盖、作品和集号、可选开场落点及目标时长。过期或损坏下游返回非零，但不会擅自改文件。该检查不代替制作阶段的模型硬限制、资产、参考图身份顺序及内容评审。

汇报产物路径、集数、场次、台词句数、估时、阻断问题、提醒、缺少上游的范围和内容评审状态。不将局部通过冒称完整联合交付。

## 自动驾驶与旧数据

仅 production.autopilot === true 开启自动驾驶。审批权转移不取消逐项决定汇报、结构检查、内容评审或止损。本阶段不调用付费模型。

旧数据只通过 [显式迁移](references/migration.md)，默认预览，不覆盖原文件。无法确定如何合并的信息保留为待确认项，不能直接删除。

## 自有样例

先阅读 [《修伞簿》故事提案](examples/故事提案.md)。三集、六场、三十句台词；先修伞，再在双方同意下询问，不凭纹路认亲。前两集 closure，最终 open。故事、节点与正文保持既有内容，只调整契约表达。所有消费 fixture 均由本 skill 自有，不依赖兄弟目录。
