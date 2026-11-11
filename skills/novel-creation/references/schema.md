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

`video.model` 可省略（默认继承 `production.json` 的 `video.model`，两边都没有就按 `MiniMax H3` 算）——本 skill 的骨架跨模型通用，模型只影响三件事：`promptLang` 的默认值、**写提示词时载入哪一份填法指南**（H3 读 `references/h3-prompt.md`，seedance 系列读 `references/seedance2-prompt.md`，没收录的模型照 `references/creation-prompt.md` 的通用骨架写），以及挂 seedance 时那条「全程不许出现精确时刻」的官方硬约束（`prompt-model-fit` 门查）。

`promptLang` 也可省略，默认跟着模型走：挂 seedance 系列默认 `zh`（官方指南通篇中文术语与中文案例），其余默认 `en`（「参考图 + 提示词」这条能力跨模型通用，英文提示词兼容面最广）。两种都能手动切到另一种语言，中文模式人名放行。**没有 `style` 字段**——画风一致性完全由参考图本身保证（角色/场景/道具设定图早就按各自 skill 的画风出好了），不需要在提示词里重复交代一遍。

## 提示词编辑源与审核

首次 export 前使用 segment.prompt 编写初稿；首次导出后，各段 prompt.md 正文区域是唯一人工提示词编辑源。JSON 的 prompt 由 export 同步，保留兼容镜像，不再双写。分段分镜与资产引用仍以 JSON 为准。validate/checkup/render 默认读取 JSON 同目录的 Markdown；独立投产目录使用 --pack 指定。审核格式、状态与批准绑定见本地 prompt-workflow.md。审核意见不进入模型正文。

## segment（段）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 段号 `E01-01`：集号 + 两位序号，**按顺序连号**。它就是产物文件夹名（`E01-01/video.mp4`） |
| `sceneIndex` | int | 这一段在剧本该集的第几场（1 起）。段内全部分镜同场 |
| `cuts` | cut[] | 段内分镜，按时间顺序。段总秒数 = 分镜秒数之和，**不单独存** |
| `images` | image[] | **参考图挂载清单**，按 Picture 序（提示词里引用的顺序 = 数组顺序）。见下 |
| `prompt` | string | **一段一条通用视频提示词**，正文语言跟 `promptLang`，结构见 `references/creation-prompt.md`；填法按 `video.model` 动态载入（H3 加读 `references/h3-prompt.md`，seedance 系列加读 `references/seedance2-prompt.md`） |
| `note` | string | 备注，可选 |

## image（参考图挂载）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `kind` | enum | `character` / `scene` / `prop`——决定去 `characters/` 还是 `art/` 找设定图 |
| `ref` | string | 该资产的编号：`kind=character` 对应 `outline.json` 的 `characters[].id`（C 编号）；`scene`/`prop` 对应 `art.json` 的 `id`（S/P 编号） |
| `role` | string | 这张图在这一格里的用途，人读的一句话（如「身份参考」「环境参考」），进 `prompt.md` 的头部对照表，不进质量门 |

**按名字找文件，不按编号找**：`ref` 先经 `outline.characters` / `art.scenes` / `art.props` 的 id→name 映射转成名字，再拼 `slug(name)` 得到设定图路径——`character` 是 `../characters/images/<slug>-sheet.png`，`scene`/`prop` 是 `../art/images/<slug>-sheet.png`（相对 `creation/` 目录，与设定图 skill 的段目录同级）。编号与名字分离是上游的现状：`cast.json` 的角色对象只有 `name`，id→name 的映射在 `outline.json` 里；场景/道具在 `art.json` 里自带 id + name。落盘文件名按名字 slug，不按编号——这是设定图 skill 的落盘惯例，本 skill 只是按同一条规则拼路径。

**不是每段都要挂全部资产**——段级挂载是**这一格实际引用的**，不是「这场戏出现过的」全集。一段如果是纯特写、不需要重新交代环境，可以不挂场景设定图；只要该资产本身在 `characters/` 或 `art/` 里存在设定图文件，`refimage-coverage` 门就不会拦（它查的是「能不能解出文件」，不是「这段有没有挂」）。

## cut（分镜）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `beats` | [int, int] | 认领该场第几拍到第几拍（含两端）。**每个节拍必须被恰好一个分镜认领**，按顺序、连续 |
| `seconds` | number | 分镜时长，必须为有限正数。没有通用的建议时长硬门。认领节拍的台词秒数必须装得下 |
| `size` | enum | 景别：`extreme-wide` 大远景 / `wide` 全景 / `medium` 中景 / `close` 特写 / `extreme-close` 大特写。对应的英文短语必须出现在这一切自己的 `[Shot k]` 行里 |
| `camera` | enum | 运镜，统一词表（原样字符串，英文词沿用 H3 官方词表——这是通用摄影语汇，不是任何一个模型的私有字段）：`Static Shot` `Push In` `Pull Out` `Zoom In/Out` `Pan Left/Right` `Truck Left/Right` `Tilt Up/Down` `Pedestal Up/Down` `Arc Shot` `Tracking Shot` `Shake Slightly/Strongly` `POV` `Roll Clockwise/Counterclockwise`。运镜词同样必须出现在这一切自己的 `[Shot k]` 行里 |
| `characters` | string[] | 画内人物（C 编号），必须 ⊆ 剧本该场人物；空镜给空数组。> `maxOnScreen` 时必须带 `note` |
| `props` | string[] | 画内道具（P 编号），必须 ⊆ 剧本该场道具。可省略 |
| `recipe` | string | 镜头配方卡 id，可选。挂了 `--shots <卡片目录>` 才查（`shot-recipe` 门）。**cut 级不是 segment 级**；**多格配方靠连续同 id 的分镜表达**，不是数组 |
| `note` | string | 备注，可选 |

**没有 `frame` 字段。** 分镜不出关键帧，所以没有「这一切自己的出图提示词」这个东西：景别短语、运镜短语、必备配方短语全部写进段级 `prompt` 里这一切自己的 `[Shot k]` 行，门按 `[Shot k]` 切片逐切核对（切片怎么夹见本文最后一节）。

## prompt 的结构（三道门盯着）

骨架见 `references/creation-prompt.md`（本 skill 自己的方法论，不是任何一个模型的内化版），怎么填按 `video.model` 载入对应那一族的指南。骨架：

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

台词秒数（按剧本语速折算）≤ 分镜 `seconds`；段 Σ分镜 ≤ `maxSegmentSeconds`，并落进有效视频模型的合法时长区间；集 Σ段 落在剧本 `targetSeconds` 的 tolerance 内。提供 outline 时，先严格对账目标为 minutesPerEpisode × 60，容差不能放宽此项。所有时间是估算，不是生成结果。估时、段和集的求和、模型边界检查及 manifest 都使用未舍入数值；只有报告显示可以舍入。15.04 秒不能作为 15 秒通过模型上限。

## v3 上游与唯一计划

script、outline、creation、production 必须显式 schemaVersion:3。正式读取拒绝旧 creative/creativeContext、params.rules/defaults/preferences、旧镜头阈值和旧开场字段，不静默忽略。

creation 集对象不持久化 opening、ending、endBeat。计划只从当前加载的 outline 读取；无 outline 时读取独立 script 的可选 opening/ending。提供 outline 时，script 中的计划副本报待迁移错误。source、ep、目标秒数和 B ID 顺序进行实际对账，但同名不证明语义同步。

creation.openingBeat 与 script 的可选显式标注一致，不补默认坐标。script.openingBeat 可选，缺省显示 not-marked，不生成虚假的开场映射。结束坐标从最后一个实际 flow 项计算，正文追加动作后自动变化。镜头必须覆盖最后一拍；旧镜头遗漏追加正文时失败。

script beatClaims 在独立模式可以省略；提供 outline 时必须按顺序完整认领全部当集节点。不分类的节点仍按 ID 认领。已提供的认领坐标继续检查存在、重复、倒序、重叠和所属集。场次 characters 包括无台词在场人物，不从 speaker 推导替代；props 可选，填写时为唯一合法 P ID。

script params 可选。唯一有效参数入口使用 charsPerSecond=4.5、actionSeconds=2.5、tolerance=0.15 的工具默认值，并接受显式覆盖。读取和渲染不回写默认值。非法数值、损坏参数和无效动作／台词失败，不按零秒累计。delivery、lighting 可选，特殊表演说明保留；省略不影响合法性。

outline 的人物 from/arc、audiencePromise、adaptation、props、节点 position/kind/weight 按 v3 可选。weight 仅允许 kind=payoff 时提供。endingBeatId 仍需引用最终集节点，不能简单使用最后数组项代替。显式资产和节点引用继续检查。完整 Q 语义、预算和内容质量仍由大纲阶段校验及内容评审负责，本消费端不冒充完整大纲检查。

## 创作要求与发现

creativeBrief 提供时为非空字符串。项目与任一已加载阶段同时存在要求时失败，人工合并到 production 后删除阶段副本。要求是自然语言，不解析成规则。指南修改不使旧故事失效。

CLI 从产物所在目录向上最多五层寻找 production.json；随后在项目 script、outline、art、characters 目录发现唯一 JSON。显式路径优先。过滤 manifest、隐藏文件及备份／工作记录。多候选失败，要求明确路径。损坏、不可读、悬空链接不能当作缺失。API 仅 undefined 表示缺失，显式 null 失败。

缺上游时只跳过真正依赖上游的检查，本地 ID、连续覆盖、数据类型、时长和模型约束继续执行。--production 与 --no-production 互斥，--no-production 不关闭模型默认限制，也不停止其他上游发现。

检查对象使用 id/category/level/status/messages，必要时附 reason；没有 ok。status 为 pass/fail/skipped。提醒和跳过不计为通过，内容评审状态另列。命令只在 SKILL.md 维护；模型和媒体交接协议保持原样。
