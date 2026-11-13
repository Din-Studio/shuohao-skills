---
name: mint-script
version: 4.0.0
description: |
  解析已有剧本，区分执行正文与非发声说明。保留独立创作及 outline v5，
  按节点 ID 认领核心表现范围，从正文计算结束位置，读取当前上游计划。
  创作方向由自然语言要求与本地指南确定，不预设冷开场、密集动作或悬念集尾。
  输出 JSON、Markdown、离线中英报告。不分镜、不出图、不调用付费模型。
  Use when asked to 写剧本、台词、场次、写戏、screenwriting、script。
allowed-tools: read write edit bash grep find ls Read Write Edit Bash Glob Grep Task
triggers:
  - mint-script
  - 剧本
  - 写剧本
  - 台词
  - screenplay
metadata:
  license: Apache-2.0
  requires:
    bins: [node]
  runtimes: [pi, claude-code, codex]
---

# mint-script v4

剧本负责人物行为和表达。分镜、镜号、模型提示词、参考图及生成调度属于视频制作阶段。整个 skill 可单独复制，只有 Node 18+ 标准库依赖，不读取兄弟代码、兄弟样例或第三方 skill。

{baseDir} 是本文件目录。命令、示例和自测入口统一见 [README](README.md)，不在多份指南重复维护。

## 输入与要求

读取本地 [创作指南](references/创作指南.md) 和 [数据契约](references/schema.md)。读取用户要求以及工作目录 production.json，或明确声明独立模式。

production v3 的可选 creativeBrief 是项目要求；独立 script 可保存自己的 creativeBrief。两者同时非空时要求人工合并进 production，再删除阶段副本。自然语言不解析成枚举、门槛或模型参数。视觉 style 和媒体协议不在本阶段更改。

完整流程按 outline → characters → art → script → creation 逐阶段交接，进入本阶段前确认 art 已完成本次范围。读取 outline v5 故事，以及 cast/art v1 的身份与来源；图片不是必需前置。独立运行可不提供上游，联合对账为 skipped，不冒称完整流程。解析任务必须同时读取原剧本，不得按梗概重新生成台词。读取 [来源与正文核验](references/来源与正文核验.md)，明确任务授权、负责范围和未提供范围。CLI 自动发现唯一上游，多个候选必须显式指定。损坏输入、错误版本和悬空链接不能当作缺少上游。无大纲也可写作，但不宣称节点、问题及全剧结局已对账。

## 骨架与逐批写戏

项目产物放入项目根 script/。JSON 是唯一编辑源，Markdown/HTML 是派生视图。

seed 建立 provenance、集号、按序 B ID 认领与空 scenes，不复制目标、opening/ending、Q、项目要求、默认参数或 seedNote。CLI 先实际核验原件版本；输出到不同目录时通过 --output-path 重定位来源路径。骨架检查通过不代表完整交付。

独立创作先确定故事，再安排事件，最后写场次。解析按原集场边界及上下文负载分块；不能用固定集数证明已经读全。交接带出处的人物位置、知情状态、道具状态与未兑现承诺，闪回使用当时状态。

flow 是有序 action/line/subtitle/sound，不要求机械交替。心理、背景、连续性与限制进入 scene.notes，不发声、不计时、不认领。line/sound 的 audio 明确发声方式、听者与主观性；delivery 不能代替“不发声”。C/S/P 仅是 script 局部标记，不负责项目人物归并、角色分档或地点身份。characters 包括无台词人物，lighting/delivery 仅在确有表达价值时填写。

解析正文和 notes 均提供精确 sourceRefs；原件版本及覆盖进入 provenance。重叠读取按位置合并，不按文字去重。实际对白、明确 VO、关键字幕默认保留原句。转译须有明确授权，必要变化记录 transformation.reason/authorization。候选留在 .work，不能进入正式正文。

有大纲时每个当集节点都需认领，未分类节点同样不能遗漏。核心段按上游顺序、包含两端、不重叠，允许跨场次，共同铺垫可在范围之外。独立无节点时允许省略 beatClaims。

openingBeat 可选；省略不是确认第一拍。结束坐标由最后一个实际 flow 项计算，不保存 endBeat。上游 opening/ending 只有大纲一份编辑源，报告读取当前实际计划。修改正文后重新计算受影响的认领坐标并检查；不能因旧坐标仍存在就声称内容有效。

## 局部引用与资产对账

唯一映射权威是 script.assetMappings，形状及失效规则见 [数据契约](references/schema.md#局部引用与资产映射)。人物资产来自 cast.characters；地点与物品资产来自 art.scenes/props。outline 只提供故事、B/Q 与来源，不能提供资产身份。即使 ID 或姓名相同，也不能省略映射或猜测确认。

每条映射记录局部与目标 ID、confirmed/pending/conflict、非空 basis、sourceRefs、完整目标资产规范 JSON 的 SHA256，以及相关 documentVersions。映射证据同时位于 script 的负责范围、目标资产出处和该资产阶段的负责范围内。版本或目标事实变化后重新核验相关映射；无关资产重排不使其他引用失效。用户身份决定必须记录真实决定及依据，不冒充原文事实。

只对实际制作依赖要求 confirmed；其他待确认与冲突保留可见。生产范围可通过 --required-mappings 明确选择，--production-ready 默认要求当前正文所有局部引用。局部结构通过不代表制作身份已确认。映射不能合并同次发声、改变场次、提前揭晓信息或覆盖原句；必要限制继续进入 notes。

## 结构检查与内容评审

运行 validate/checkup，并通过 verify-sources 实际核验原件字节、范围和引用。缺失、变化或无法读取的原件必须失败。内存结构检查不会声称已经读过原文。结构、引用、数值、版本或制作目标不一致会阻断。粗略估时偏离仅提醒，不能据此强制删除有效表演。估时参数只有用户明确覆盖时保存，所有时间轴使用统一有效参数。

解析时 targetSeconds 可省略，但进入制作前必须由用户确认，不能从 outline 的分钟数推断。--production-ready 检查目标并读取来源核验。

接着在独立上下文对照原文与正文，检查遗漏、越权、因果、信息、否定、条件、承诺、跨集状态及开场集尾表达。哈希合法不是语义忠实度结论；制作提示词审核也不能替代来源／正文核验。Q 由大纲维护；本阶段按 resolves 和 beatClaims 展示回答落点，不建第二份问题表。

记录具体分集、节点、坐标、原文、判断和复核状态到当前工作记录。不保存永久评分、失败累积日志或统计。自动检查始终声明内容评审未执行。要求变更后重新评审，不以指南已读取或字段完整代替内容结论。

## 报告与交接

正式交付固定包含 `xxx.json`、`xxx-report.md`、`xxx-report.html` 三个文件。`xxx` 是同一份 JSON 去掉 `.json` 后的完整文件名；两份报告由该 JSON 渲染，并与它放在同一阶段目录。

报告优先展示正文，再展示关键事件、必要计划、资产、台词本、估时与结构状态。未填写的可选字段不建立大面积空配置区。原始 JSON 导出不插入默认值、统计或评审结论。派生 HTML 不进版本控制。

CLI 同时检查已知 creation v3 的当前实际 flow 恰好一次有序归属、作品和集号、可选开场落点及目标时长。audioRefs 可跨段、跨场延续同集较早镜头拥有的同一句台词；不得重复播放、重复估时、向前引用或替代正文归属。从拥有镜头到最后续声镜头必须连续引用，不能跳过中间镜头后再续声。过期或损坏下游返回非零，但不会擅自改文件。该检查不代替制作阶段的模型硬限制、资产、参考图身份顺序及内容评审。

汇报产物路径、集数、场次、台词句数、估时、阻断问题、提醒、缺少上游的范围和内容评审状态。不将局部通过冒称完整联合交付。

## 自动驾驶

仅 production.autopilot === true 开启自动驾驶。审批权转移不取消逐项决定汇报、结构检查、内容评审或止损。本阶段不调用付费模型。

## 自有样例

先阅读 [《修伞簿》故事提案](examples/故事提案.md)。三集、六场、三十句台词；先修伞，再在双方同意下询问，不凭纹路认亲。前两集 closure，最终 open。故事、节点与正文保持既有内容。独立创作正文与来源解析映射正文分别保存；后者使用不同目标 ID 演示局部标记不等于资产身份。所有消费 fixture 均由本 skill 自有，不依赖兄弟目录。

再阅读 [《夜班水尺》故事提案](examples/夜班水尺-story.md) 与同目录原件、v4 解析正文。该样例只有第七集、第九集，演示缺集、不发声心理说明、内心声音、字幕、报警声和不同位置的重复台词；不虚构目标时长，也不补写全剧结局。
