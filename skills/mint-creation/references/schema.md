# creation.json 结构

两层：**集 → 段（segment）→ 分镜（cut）**。分镜下面没有关键帧这一层，所以段直接挂载既有设定图、写一条通用视频提示词，不产生任何新的图像生成调用。

- **段** = 一次视频生成调用，总时长 ≤ `maxSegmentSeconds`（默认 15 秒），不跨场次——换景必开新段
- **分镜** = 段内的一次剪切，表达时长由故事与表演需要决定，各自认领剧本节拍、带景别运镜。**没有 `frame` 字段**——分镜不出关键帧图，景别与运镜短语写进段级 `prompt` 里这一切自己的 `[Shot k]` 行
- **参考图挂载** = 段级的 `images` 数组，直接引用 `cast.json` / `art.json` 已经生成落盘的设定图，不产生新的出图调用

```json
{
  "schemaVersion": 3,
  "source": "收书人",
  "promptLang": "en",
  "video": { "model": "MiniMax H3" },
  "params": { "maxSegmentSeconds": 15, "maxOnScreen": 3, "tolerance": 0.15 },
  "episodes": [ { "ep": 1, "segments": [ ... ] } ]
}
```

`video.model` 可省略（默认继承 `production.json` 的 `video.model`，两边都没有就按 `MiniMax H3` 算）——本 skill 的骨架跨模型通用，模型只影响三件事：`promptLang` 的默认值、**编写方载入哪一份填法指南**（H3 读 `references/h3-prompt.md`，seedance 系列读 `references/seedance2-prompt.md`，没收录的模型照 `references/creation-prompt.md` 的通用骨架写；`mint-video-prompt` 持有同一份副本），以及挂 seedance 时那条「全程不许出现精确时刻」的官方硬约束（`prompt-model-fit` 门查）。

`promptLang` 也可省略，默认跟着模型走：挂 seedance 系列默认 `zh`（官方指南通篇中文术语与中文案例），其余默认 `en`（「参考图 + 提示词」这条能力跨模型通用，英文提示词兼容面最广）。两种都能手动切到另一种语言，中文模式人名放行。**没有 `style` 字段**——画风一致性完全由参考图本身保证（角色/场景/道具设定图早就按各自 skill 的画风出好了），不需要在提示词里重复交代一遍。

必须同时阅读 [来源、非发声说明与跨镜声音交接](source-audio-handoff.md)。line/sound 的 audio、四种 flow、notes 与 transformation 必须传递至当前输入材料；来源哈希核验不是忠实性审核。

## segment（段）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 段号 `E01-01`：集号 + 两位序号，**按顺序连号**。它就是产物文件夹名（`E01-01/video.mp4`） |
| `sceneIndex` | int | 这一段在剧本该集的第几场（1 起）。段内全部分镜同场 |
| `cuts` | cut[] | 段内分镜，按时间顺序。段总秒数 = 分镜秒数之和，**不单独存** |
| `images` | image[] | **参考图挂载清单**，按 Picture 序（提示词里引用的顺序 = 数组顺序）。见下 |
| `prompt` | string | **一段一条通用视频提示词**，正文语言跟 `promptLang`，由编写方在工作单里写成、审核方批准后经 `prompts apply` 回写；骨架见 `references/creation-prompt.md`，填法按 `video.model` 读取对应指南，本文件只规定下面三道门检查的结构 |
| `note` | string | 备注，可选 |

## image（参考图挂载）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `kind` | enum | `character` / `scene` / `prop`——决定去 `characters/` 还是 `art/` 找设定图 |
| `ref` | string | 该资产的编号：`kind=character` 对应 `outline.json` 的 `characters[].id`（C 编号）；`scene`/`prop` 对应 `art.json` 的 `id`（S/P 编号） |
| `role` | string | 这张图在这一格里的用途，人读的一句话（如「身份参考」「环境参考」），写进工作单的分镜结构与 manifest，不进质量门 |

**按稳定编号查找资产，再根据当前资产列表解析文件名**：角色优先匹配 `cast.characters[].id`，旧名称匹配只接受无歧义的唯一结果。唯一名称保留 `<slug>-sheet.png`；角色名称 slug 碰撞时使用 `<C ID>-<slug>-sheet.png`，场景与道具在同一目录共同检查碰撞，使用 `<S/P ID>-<slug>-sheet.png`。角色目录是 `../characters/images/`，场景／道具目录是 `../art/images/`，均相对 creation 目录。检查、派发、报告与导出使用同一规则，不修改原始名称，不合并同名身份。

**不是每段都要挂全部资产**——段级挂载是**这一格实际引用的**，不是「这场戏出现过的」全集。一段如果是纯特写、不需要重新交代环境，可以不挂场景设定图；只要该资产本身在 `characters/` 或 `art/` 里存在设定图文件，`refimage-coverage` 门就不会拦（它查的是「能不能解出文件」，不是「这段有没有挂」）。

## cut（分镜）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `beats` | [int, int] | 认领该场第几拍到第几拍（含两端）。**每个节拍必须被恰好一个分镜认领**，按顺序、连续 |
| `seconds` | number | 分镜时长，必须为有限正数。没有通用的建议时长硬门。台词须装进拥有及延续镜头共享时长 |
| `audioRefs` | [int, int][] | 可选，同集更早镜头已拥有的 LINE 坐标；可跨段跨场，禁止当前／向前／动作／重复引用。不替代 beats，不重播 |
| `size` | enum | 景别：`extreme-wide` 大远景 / `wide` 全景 / `medium` 中景 / `close` 特写 / `extreme-close` 大特写。对应的英文短语必须出现在这一切自己的 `[Shot k]` 行里 |
| `camera` | enum | 运镜，统一词表（原样字符串，英文词沿用 H3 官方词表——这是通用摄影语汇，不是任何一个模型的私有字段）：`Static Shot` `Push In` `Pull Out` `Zoom In/Out` `Pan Left/Right` `Truck Left/Right` `Tilt Up/Down` `Pedestal Up/Down` `Arc Shot` `Tracking Shot` `Shake Slightly/Strongly` `POV` `Roll Clockwise/Counterclockwise`。运镜词同样必须出现在这一切自己的 `[Shot k]` 行里 |
| `characters` | string[] | 画内人物（C 编号），必须 ⊆ 剧本该场人物；空镜给空数组。> `maxOnScreen` 时必须带 `note` |
| `props` | string[] | 画内道具（P 编号），必须 ⊆ 剧本该场道具。可省略 |
| `recipe` | string | 镜头配方卡 id，可选。挂了 `--shots <卡片目录>` 才查（`shot-recipe` 门）。**cut 级不是 segment 级**；**多格配方靠连续同 id 的分镜表达**，不是数组 |
| `note` | string | 备注，可选 |

**没有 `frame` 字段。** 分镜不出关键帧，所以没有「这一切自己的出图提示词」这个东西：景别短语、运镜短语、必备配方短语全部写进段级 `prompt` 里这一切自己的 `[Shot k]` 行，门按 `[Shot k]` 切片逐切核对（切片怎么夹见本文最后一节）。

## prompt 的结构（三道门盯着）

骨架的写法见 `references/creation-prompt.md`，模型填法见对应指南；这里只列出结构检查所依赖的形状：

```text
Picture 1 is the young man carrying the worn poetry book. Picture 2 is the night-only secondhand bookstore, shelves crowded with old books under a warm desk lamp.

shots:
[Shot 1] Wide shot, Tracking Shot — the camera follows <Picture 1> as he pushes open the door…
[Shot 2] Medium shot, Push In — slowly moving closer on <Picture 1>'s face as he asks: "还开着吗？我想卖一本书。"

ambience: A faint bell chime fades under the low hum of the night; no music.
```

三道门核对的部分：

1. **参考图身份说明句数量与 `images` 数组长度一致**（`refimage-labeled`）：每张挂载的图都要在提示词开头有一句 `Picture k is …`（`zh` 模式是 `图 k 是……`），k 从 1 编到 `images.length`，不多不少
2. **每个 `[Shot k]`（k 从 1 起，对应第 k 个分镜）必须同时带景别短语与运镜短语**：`size-phrase` 门查景别短语，`camera-phrase` 门查运镜短语，两道门都是「在这一切自己的 `[Shot k]` 行里找，不满足到别的行就算」
3. **认领节拍的每句台词逐字出现在 `prompt` 里**（`dialogue-verbatim`）：不要求包在任何标签里，纯文本 `includes` 判定；写法上建议打引号原文引用，但门本身不检查引号

`shots:` / `ambience:` 是两个固定字段名（`zh` 模式对应 `镜头描述：` / `环境声与配乐：`），**`[Shot k]` 的切片边界由这两个字段名夹出来**：正文从 `shots:` 起、到 `ambience:` 止，段内再按 `[Shot k]` 到 `[Shot k+1]` 切成每个分镜自己的一段。所以**不要自己加字段、也不要把收尾的画质与约束词写在 `ambience:` 之前**——加了字段或写错位置，切片就散了，逐镜的门跟着一起脏。

## 时长约束链

每次台词秒数（按剧本语速折算）装进拥有镜头及明确 audioRefs 延续镜头的共享 `seconds`，只累计一次，按正文台词顺序分配容量，延续链不得跳过中间镜头；段 Σ分镜 ≤ `maxSegmentSeconds`，并落进有效视频模型的合法时长区间；集 Σ段 落在剧本 `targetSeconds` 的 tolerance 内。targetSeconds 只属于 script；解析阶段可以未知，进入 creation seed/check/export 前必须确认，不能从 outline 推导。所有时间是估算，不是生成结果。估时、段和集的求和、模型边界检查及 manifest 都使用未舍入数值；只有报告显示可以舍入。15.04 秒不能作为 15 秒通过模型上限。

## v4 上游与唯一执行目标

script、outline 必须显式 schemaVersion:4；creation、production 仍为 schemaVersion:3。正式读取拒绝旧 creative/creativeContext、params.rules/defaults/preferences、旧镜头阈值和旧开场字段，不静默忽略。

creation 集对象不持久化 opening、ending、endBeat。计划只从当前加载的 outline 读取；无 outline 时读取独立 script 的可选 opening/ending。提供 outline 时，script 中的计划副本报待迁移错误。source、ep、目标秒数和 B ID 顺序进行实际对账，但同名不证明语义同步。

creation.openingBeat 与 script 的可选显式标注一致，不补默认坐标。script.openingBeat 可选，缺省显示 not-marked，不生成虚假的开场映射。结束坐标从最后一个实际 flow 项计算，正文追加动作后自动变化。镜头必须覆盖最后一拍；旧镜头遗漏追加正文时失败。

script beatClaims 在独立模式可以省略；提供 outline 时必须按顺序完整认领全部当集节点。不分类的节点仍按 ID 认领。已提供的认领坐标继续检查存在、重复、倒序、重叠和所属集。场次 characters 包括无台词在场人物，不从 speaker 推导替代；props 可选，填写时为唯一合法 P ID。

script params 可选。唯一有效参数入口使用 charsPerSecond=4.5、actionSeconds=2.5、tolerance=0.15 的工具默认值，并接受显式覆盖。读取和渲染不回写默认值。非法数值、损坏参数和无效动作／台词失败，不按零秒累计。delivery、lighting 可选，特殊表演说明保留；省略不影响合法性。

outline v4 必须有 provenance、story.summary、对象与事件出处。删除 adaptation/arcs、params.adaptMode/minutesPerEpisode/episodes、beats.position/kind/weight 和 scenes.reusePlan；保留 tier/primary。endingBeatId 可选，只有识别已知实际全剧结尾时才能填写，不使用最后数组项代替。显式资产和节点引用继续检查。完整 Q 语义、预算和内容质量仍由大纲阶段校验及内容评审负责，本消费端不冒充完整大纲检查。

## 创作要求与发现

creativeBrief 提供时为非空字符串。项目与任一已加载阶段同时存在要求时失败，人工合并到 production 后删除阶段副本。要求是自然语言，不解析成规则。指南修改不使旧故事失效。

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
- **manifest 记录来源**：`creation` 是 creation.json 相对 manifest 的路径，`videos` 靠它重新核对；每段的 `prompt` 与参考图路径同样相对 manifest。没有 `creation` 的旧 manifest 需要重新导出。
- **二级标题只有三个**：意见或回应里多出二级标题的工作单被所有命令拒绝，避免它之下的内容在改写时丢失。
- **模型一致**：状态头的 `model` 与当前有效视频模型不同则检查失败——更换模型后需要重新编写并审核。
- **意见不累积**：审核意见与编写回应只保留本轮，轮次只由 `round` 计数；`round` 达到三轮仍为 `changes_requested` 时 `prompts status` 提示交给用户决定。
- 三个 skill 各自携带一份相同的工作单解析库 `scripts/lib/worksheet.mjs`；本 skill 的 `references/` 还保存编写方与审核方指南的副本（`creation-prompt.md`、`h3-prompt.md`、`seedance2-prompt.md`、`分镜指南.md`、`worksheet.md`、`审核清单.md`）。仓库级自测核对这些副本逐字一致，修改时各处一起修改。
