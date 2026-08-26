# creation.json 结构

两层：**集 → 段（segment）→ 分镜（cut）**——比 `novel-storyboard` 少一层。没有分镜图，所以段直接挂载既有设定图、写一条通用视频提示词，不产生任何新的图像生成调用。

- **段** = 一次视频生成调用，总时长 ≤ `maxSegmentSeconds`（默认 15 秒），不跨场次——换景必开新段
- **分镜** = 段内的一次剪切，`minCutSeconds`–`maxCutSeconds`（默认 2–5 秒），各自认领剧本节拍、带景别运镜。**没有 `frame` 字段**——分镜不出关键帧图，景别与运镜短语写进段级 `prompt` 里这一切自己的 `[Shot k]` 行
- **参考图挂载** = 段级的 `images` 数组，直接引用 `cast.json` / `art.json` 已经生成落盘的设定图，不产生新的出图调用

```json
{
  "source": "收书人",
  "promptLang": "en",
  "params": { "maxSegmentSeconds": 15, "minCutSeconds": 2, "maxCutSeconds": 5, "maxOnScreen": 3, "tolerance": 0.15 },
  "episodes": [ { "ep": 1, "segments": [ ... ] } ]
}
```

`promptLang` 可省略（**默认 `en`**，与 `novel-storyboard` 的口径一致——不是因为 H3 要求，是因为「参考图 + 提示词」这条能力跨模型通用，英文提示词兼容面最广）。设成 `zh` 可切整条中文，人名放行。**没有 `style` 字段**——画风一致性完全由参考图本身保证（角色/场景/道具设定图早就按各自 skill 的画风出好了），不需要在提示词里重复交代一遍。

## segment（段）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 段号 `E01-01`：集号 + 两位序号，**按顺序连号**。它就是产物文件夹名（`E01-01/video.mp4`） |
| `sceneIndex` | int | 这一段在剧本该集的第几场（1 起）。段内全部分镜同场 |
| `cuts` | cut[] | 段内分镜，按时间顺序。段总秒数 = 分镜秒数之和，**不单独存** |
| `images` | image[] | **参考图挂载清单**，按 Picture 序（提示词里引用的顺序 = 数组顺序）。见下 |
| `prompt` | string | **一段一条通用视频提示词**，正文语言跟 `promptLang`（默认英文），结构见 `references/creation-prompt.md` |
| `note` | string | 备注，可选 |

## image（参考图挂载）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `kind` | enum | `character` / `scene` / `prop`——决定去 `characters/` 还是 `art/` 找设定图 |
| `ref` | string | 该资产的编号：`kind=character` 对应 `outline.json` 的 `characters[].id`（C 编号）；`scene`/`prop` 对应 `art.json` 的 `id`（S/P 编号） |
| `role` | string | 这张图在这一格里的用途，人读的一句话（如「身份参考」「环境参考」），进 `prompt.md` 的头部对照表，不进质量门 |

**按名字找文件，不按编号找**：`ref` 先经 `outline.characters` / `art.scenes` / `art.props` 的 id→name 映射转成名字，再拼 `slug(name)` 得到设定图路径——`character` 是 `../characters/images/<slug>-sheet.png`，`scene`/`prop` 是 `../art/images/<slug>-sheet.png`（相对 `creation/` 目录，与设定图 skill 的段目录同级）。这条链路与 `novel-storyboard` 的 `namer` + `sheetFile` 惯例完全一致，只是终点从「分镜图参考图」换成「视频参考图」。

**不是每段都要挂全部资产**——段级挂载是**这一格实际引用的**，不是「这场戏出现过的」全集。一段如果是纯特写、不需要重新交代环境，可以不挂场景设定图；只要该资产本身在 `characters/` 或 `art/` 里存在设定图文件，`refimage-coverage` 门就不会拦（它查的是「能不能解出文件」，不是「这段有没有挂」）。

## cut（分镜）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `beats` | [int, int] | 认领该场第几拍到第几拍（含两端）。**每个节拍必须被恰好一个分镜认领**，按顺序、连续 |
| `seconds` | number | 分镜时长，2–5 秒——短剧的注意力节奏是硬门。认领节拍的台词秒数必须装得下 |
| `size` | enum | 景别：`extreme-wide` 大远景 / `wide` 全景 / `medium` 中景 / `close` 特写 / `extreme-close` 大特写。对应的英文短语必须出现在这一切自己的 `[Shot k]` 行里 |
| `camera` | enum | 运镜，**直接用 H3 官方词表**（原样字符串，跟 `novel-storyboard` 同一张表——这是通用摄影语汇，不是 H3 私有字段）：`Static Shot` `Push In` `Pull Out` `Zoom In/Out` `Pan Left/Right` `Truck Left/Right` `Tilt Up/Down` `Pedestal Up/Down` `Arc Shot` `Tracking Shot` `Shake Slightly/Strongly` `POV` `Roll Clockwise/Counterclockwise`。运镜词同样必须出现在这一切自己的 `[Shot k]` 行里 |
| `characters` | string[] | 画内人物（C 编号），必须 ⊆ 剧本该场人物；空镜给空数组。> `maxOnScreen` 时必须带 `note` |
| `props` | string[] | 画内道具（P 编号），必须 ⊆ 剧本该场道具。可省略 |
| `recipe` | string | 镜头配方卡 id，可选。挂了 `--shots <卡片目录>` 才查（`shot-recipe` 门）。**cut 级不是 segment 级**；**多格配方靠连续同 id 的分镜表达**，不是数组 |
| `note` | string | 备注，可选 |

**没有 `frame` 字段。** `novel-storyboard` 里景别/运镜短语、必备配方短语都写进这一切自己的分镜图提示词；`novel-creation` 没有分镜图，这些短语改写进段级 `prompt` 里这一切自己的 `[Shot k]` 行——校验逻辑一模一样（按 `[Shot k]` 切片逐切核对），只是核对的目标文本从「分镜图提示词」换成「视频提示词的对应切片」。

## prompt 的结构（三道门盯着）

写法见 `references/creation-prompt.md`（本 skill 自己的方法论，不是 H3 I2VA 的内化版）。骨架：

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

`shots:` / `ambience:` 是两个固定字段名（`zh` 模式对应 `镜头描述：` / `环境声与配乐：`），`[Shot k]` 的切片边界由这两个字段名夹出来——与 `novel-storyboard` 用 `integrated_multimodal_description:` / `overall_soundscape:` 夹 `[Shot k]` 是同一个机制，字段名换了而已。

## 时长约束链

台词秒数（按剧本语速折算）≤ 分镜 `seconds` ≤ 5 秒；段 Σ分镜 ≤ `maxSegmentSeconds`，找到 `production.json` 时还要落进该视频模型的时长区间；集 Σ段 落在剧本 `targetSeconds` ±15% 内。全部由 `validate` 逐级对账。
