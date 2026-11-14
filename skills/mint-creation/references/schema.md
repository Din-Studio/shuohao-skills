# creation.json 结构

creation 为 schemaVersion:3。提示词采用五部分散文格式，完整规则见 creation-prompt.md；模型文件只解释技术适配，不定义另一套写法。

## 数据与正文的分工

- 集 → 段 → cuts 的 JSON 结构保持不变。每段对应一次视频生成，不跨场次。
- cuts 保留 beats、seconds、audioRefs、size、camera、characters、props、recipe、note；beats 连续覆盖，seconds 为有限正数，size/camera 仍须合法枚举。但这些是内部认领与估时计划，不代表生成视频的切镜，不要求对应正文自然段。
- 段保存 id、sceneIndex、cuts、images、prompt 和可选 note。段总秒数仍为 cuts.seconds 求和，不另存一份。
- images 仍为 kind/ref/role，kind 为 character/scene/prop，ref 是 script 局部标记，通过 script.assetMappings 的 confirmed 记录映射到 cast/art 身份。数组顺序就是 @图片N 和实际提交素材的顺序。不新增音频或状态素材管理。
- prompt 为五部分：七个全局字段、参考素材、散文正文、画风与固定结尾、负面提示词。固定字段中文；默认 promptLang=zh，显式 en 可使用英文叙述，但固定文字和对象全称保留。台词保留原文或正式译文。不禁止角色名。
- video.model 仍由 creation 覆盖 production，均缺省时 MiniMax H3。模型时长边界和已有参数继承不变。
- 景别和运镜检查只验证内部枚举，不查逐镜短语；引用配方时仍核对配方存在、正文包含必备短语及内部连排数量，但不逐镜切片。正文不能混入 shots/ambience 骨架或镜头编号。
- 五部分检查包括字段顺序、固定文字、色温 K、有序 @图片N 引用和模板占位符；动作因果、人设、素材引用时机及负面词质量由内容审核判断。
- 图片只对实际挂载项要求存在；画内人物、已知画外发声者等实际依赖仍须确认身份映射。不强制所有人物出图。缺少匹配素材时准确描述状态，不能编造引用。
- 稳定路径由 cast 目标身份 ID、art imageStem/sheetImage 解析，不按名称或同号回退；所有检查、报告、派发和导出使用同一解析规则。
- 来源、notes、四种 flow 和声音延续规则保持不变，必须完整读取 source-audio-handoff.md。

## 按 script 分镜分段

script 阶段的分镜文件 `<剧本名>-storyboard.md` 与剧本 JSON 同目录，CLI 自动读取，也可以 `--storyboard FILE` 显式指定（显式文件必须存在）。解析与检查使用 `scripts/lib/storyboard.mjs`，与 mint-script 的副本逐字一致。分镜不进入 creation.json，creation.json 的形状不变。

- `storyboard` 门：分镜先对照剧本做确定性检查（场次、段号、节拍归属、本段剧本逐字、字段、复写配对、台词估时），再要求每集已有的段与分镜逐段一致：`id`、`sceneIndex`、cuts 认领的节拍范围。分镜单段上限超过制作 `maxSegmentSeconds` 时失败。还没有段的集（seed 阶段）不比较。没有分镜或没有剧本时 skipped（missing-upstream），不计为通过。
- 输入材料带有本集分镜，批准绑定本段的分镜条目与单段上限；分镜没有通过检查时材料生成失败。

## 时长约束链

每次台词秒数（按剧本语速折算）装进拥有镜头及明确 audioRefs 延续镜头的共享 `seconds`，只累计一次，按正文台词顺序分配容量，延续链不得跳过中间镜头；段 Σ分镜 ≤ `maxSegmentSeconds`，并落进有效视频模型的合法时长区间；集 Σ段 落在剧本 `targetSeconds` 的 tolerance 内。targetSeconds 只属于 script；解析阶段可以未知，进入 creation seed/check/export 前必须确认，不能从 outline 推导。所有时间是估算，不是生成结果。估时、段和集的求和、模型边界检查及 manifest 都使用未舍入数值；只有报告显示可以舍入。15.04 秒不能作为 15 秒通过模型上限。

## 当前上游与唯一执行目标

script 必须显式 schemaVersion:4；outline 必须显式 schemaVersion:5；creation、production 必须为 schemaVersion:3；cast/art 必须为 schemaVersion:1。只接受这些版本。creative/creativeContext、params.rules/defaults/preferences、minCutSeconds/maxCutSeconds 以及 hook/cliff/closure/hookBeat 不属于当前契约，出现即报错，不静默忽略。

creation 集对象不持久化 opening、ending、endBeat。计划只从当前加载的 outline 读取；无 outline 时读取独立 script 的可选 opening/ending。提供 outline 时，script 中的计划副本报错。source、ep、目标秒数和 B ID 顺序进行实际对账，但同名不证明语义同步。

creation.openingBeat 与 script 的可选显式标注一致，不补默认坐标。script.openingBeat 可选，缺省显示 not-marked，不生成虚假的开场映射。结束坐标从最后一个实际 flow 项计算，正文追加动作后自动变化。镜头必须覆盖最后一拍；正文追加后镜头未覆盖时失败。

script beatClaims 在独立模式可以省略；提供 outline 时必须按顺序完整认领全部当集节点。不分类的节点仍按 ID 认领。已提供的认领坐标继续检查存在、重复、倒序、重叠和所属集。场次 characters 包括无台词在场人物，不从 speaker 推导替代；props 可选，填写时为唯一合法 P ID。

script params 可选。唯一有效参数入口使用 charsPerSecond=4.5、actionSeconds=2.5、tolerance=0.15 的工具默认值，并接受显式覆盖。读取和渲染不回写默认值。非法数值、损坏参数和无效动作／台词失败，不按零秒累计。delivery、lighting 可选，特殊表演说明保留；省略不影响合法性。

outline v5 必须有 provenance、story.summary、故事与事件出处。删除 adaptation/arcs、params.adaptMode/minutesPerEpisode/episodes、beats.position/kind/weight 和 scenes.reusePlan；不读取任何资产表、tier/primary 或资产预算。endingBeatId 可选，只有识别已知实际全剧结尾时才能填写，不使用最后数组项代替。节点引用继续检查；资产从 cast/art 取得。完整 Q 语义、预算和内容质量仍由大纲阶段校验及内容评审负责，本消费端不冒充完整大纲检查。

## 创作要求与发现

creativeBrief 提供时为非空字符串。项目与任一已加载阶段同时存在要求时失败，人工合并到 production 后删除阶段副本。要求是自然语言，不解析成规则。指南修改不使既有故事失效。

CLI 从产物所在目录向上最多五层寻找 production.json；随后在项目 script、outline、art、characters 目录发现唯一 JSON。显式路径优先。过滤 manifest、隐藏文件及备份／工作记录。多候选失败，要求明确路径。损坏、不可读、悬空链接不能当作缺失。API 仅 undefined 表示缺失，显式 null 失败。

缺上游时只跳过真正依赖上游的检查，本地 ID、连续覆盖、数据类型、时长和模型约束继续执行。--production 与 --no-production 互斥，--no-production 不关闭模型默认限制，也不停止其他上游发现。

检查对象使用 id/category/level/status/messages，必要时附 reason；没有 ok。status 为 pass/fail/skipped。提醒和跳过不计为通过，内容评审状态另列。命令只在 SKILL.md 维护；模型和媒体交接协议保持原样。

## 工作单 `<段号>/prompt.md`

分镜与提示词不直接写入 creation.json，而是由编写方写进每段一份的工作单，经审核方批准后回写。工作单位于 creation.json 所在目录（`--dir` 可以另指）。

```text
---
segment: E01-01
status: draft | in_review | changes_requested | blocked | approved
round: 2
model: MiniMax H3
promptLang: en
bodyHash: <批准时写入的内容摘要>
inputHash: <批准时写入的输入摘要>
---
# E01-01 · 视频提示词工作单
## 分镜结构        ← json 代码块：本文件 segment 表里除 prompt 以外的全部字段
## 审核意见（仅本轮）
## 编写回应（仅本轮）
---
<提示词正文>       ← 最后一条分隔线之下，即 segment.prompt
```

| 命令 | 读取 | 写入 | 要求 |
| --- | --- | --- | --- |
| `prompts brief` | 上游 | 无（stdout） | 需要剧本 |
| `prompts init` | creation.json 已有的段 | 缺少的工作单（draft） | 不覆盖已有工作单 |
| `prompts new` | creation.json 的有效模型与语言 | 一份空白工作单（draft） | 拒绝覆盖；编写方命令的本地等价物 |
| `prompts check` | creation.json 骨架 + 全部工作单 | 无 | 拼入内存后执行全部结构检查；不看审核状态 |
| `prompts submit` | 同 check | 工作单状态头 | 结构检查通过；被退回或阻塞的段已写回应；编写方命令的本地等价物 |
| `prompts verdict` | 工作单 + 当前上游 | 工作单状态头 | 审核意见符合结论；批准时绑定当前输入；审核方命令的本地等价物 |
| `prompts status` | 全部工作单 + 当前上游 | 无 | 全部批准且两重绑定有效时退出码为零 |
| `prompts apply` | 同 check | creation.json 的 segments；移除 seedScenes | 结构检查通过，全部批准且批准有效 |
| `export` | creation.json + 工作单 + 当前上游 | manifest.json | 每段工作单已批准、两重绑定有效、与 creation.json 一致 |
| `videos` | manifest.json + creation.json + 工作单 + 当前上游 | 无（计划） | 同 export，并且 manifest 的视频参数与当前配置一致 |

- **批准绑定内容与输入**：`bodyHash` 是分镜结构与正文的摘要；`inputHash` 是这一段依据的输入的摘要——拥有与延续正文、来源身份、相关场次 notes、事件认领、挂载资产证据与参考图内容、视频模型参数、提示词语言、目标时长、同框与单段限制、项目要求。任何一样变化，这一段的批准失效，`status`、`apply`、`export`、`videos` 全部拒绝。绑定范围只到这一段：别的段、别的集、上游文件里无关的字段发生变化，不影响它。显式场次 characters/props 也进入绑定，包括声音来源场。开场措辞只绑定实际开场坐标所在段（未标注时使用第一拍），集尾措辞只绑定实际最后一拍所在段；修改后自动使相关批准失效，不影响其他段。
- **状态头只由角色命令改写**：`in_review` 由编写方的提交命令写入，`approved`、`changes_requested` 与 `blocked` 由审核方的结论命令写入。主会话只在 `prompts init` 时写出草稿；`prompts new|submit|verdict` 是给没有安装兄弟 skill 的 subagent 使用的本地等价物，不是给主会话代替两个角色使用的。
- **manifest 记录来源**：`creation` 是 creation.json 相对 manifest 的路径，`videos` 靠它重新核对；每段的 `prompt` 与参考图路径同样相对 manifest。没有 `creation` 的 manifest 需要重新导出。
- **工作单区域固定为三个**：审核区允许固定子标题「返修意见」「待确认事项」；其他区域不增加二级标题。解析边界不随审核子标题截断。
- **模型一致**：状态头的 `model` 与当前有效视频模型不同则检查失败——更换模型后需要重新编写并审核。
- **意见不累积**：审核意见与编写回应只保留本轮，轮次只由 `round` 计数；`round` 达到三轮仍为 `changes_requested` 时 `prompts status` 提示交给用户决定。
- 三个 skill 各自携带一份相同的工作单解析库 `scripts/lib/worksheet.mjs`；本 skill 的 `references/` 还保存编写方与审核方指南的副本（`creation-prompt.md`、`h3-prompt.md`、`seedance2-prompt.md`、`分镜指南.md`、`worksheet.md`、`审核清单.md`）。仓库级自测核对这些副本逐字一致，修改时各处一起修改。

完整的身份来源、接受版本、映射记录及失效范围见 [资产身份与显式映射交接](asset-identity-handoff.md)。manifest 的 ref 仍是局部标记，mappedAssetId 和 assetDigest 记录实际目标，图片路径使用目标资产 ID。
