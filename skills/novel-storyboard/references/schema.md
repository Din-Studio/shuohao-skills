# storyboard.json 结构

三层：**集 → 段（segment）→ 分镜（cut）**。

- **段** = 一次视频生成调用，总时长 ≤ `maxSegmentSeconds`（默认 15 秒），不跨场次——换景必开新段
- **分镜** = 段内的一次剪切，`minCutSeconds`–`maxCutSeconds`（默认 2–5 秒），各自认领剧本节拍、带景别运镜和一张分镜图
- **分镜图** = 每个分镜一张关键帧：第 1 切的是**主分镜图**（钉在 0.00 秒），其余是**子分镜图**（各钉在自己的切点时刻）。**每段一个文件夹**：`<段号>/f<切序>.png` + `prompt.md`（export 生成，内容就是 videoPrompt）

```json
{
  "source": "渡口",
  "style": "realistic",
  "promptLang": "zh",
  "video": { "model": "MiniMax H3" },
  "params": { "maxSegmentSeconds": 15, "minCutSeconds": 2, "maxCutSeconds": 5, "maxOnScreen": 3, "tolerance": 0.15 },
  "episodes": [ { "ep": 1, "segments": [ ... ] } ]
}
```

`video.model` 可省略（默认继承 `production.json` 的 `video.model`，两边都没有就按 `MiniMax H3` 算）——**它决定用哪一套提示词骨架**，见下文。

`promptLang` 也可省略，默认跟着骨架的官方口径走：H3 默认 `en`（整条英文、禁角色名，台词在 `<d>[Chinese]` 里保留原文），seedance 默认 `zh`（官方指南通篇中文术语与中文案例，人名放行）。两套都能手动切到另一种语言，但那是偏离官方推荐的备选项。`style` 可省略（默认 `realistic`），预设与角色/场景 skill 同名对齐（`realistic` / `ghibli`），对应的英文短语（如 `cinematic film still`）必须出现在**每条**分镜图提示词里——同一部剧的分镜图不许画风漂，门查。

## segment（段）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 段号 `E01-01`：集号 + 两位序号，**按顺序连号**。它就是素材文件名（`E01-01.mp4` / `E01-01-f1.png`） |
| `sceneIndex` | int | 这一段在剧本该集的第几场（1 起）。段内全部分镜同场 |
| `cuts` | cut[] | 段内分镜，按时间顺序。段总秒数 = 分镜秒数之和，**不单独存**——少一处会漂的冗余 |
| `videoPrompt` | string | **一段一条视频提示词**，骨架按 `video.model` 分流（见下文），正文语言跟 `promptLang`。老项目写的 `h3Prompt` 照样读得出来 |
| `note` | string | 备注，可选 |

## cut（分镜）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `beats` | [int, int] | 认领该场第几拍到第几拍（含两端）。**每个节拍必须被恰好一个分镜认领**，按顺序、连续 |
| `seconds` | number | 分镜时长，2–5 秒——短剧的注意力节奏是硬门。认领节拍的台词秒数必须装得下 |
| `size` | enum | 景别：`extreme-wide` 大远景 / `wide` 全景 / `medium` 中景 / `close` 特写 / `extreme-close` 大特写 |
| `camera` | enum | 运镜，统一词表（原样字符串，英文词沿用 H3 官方词表，两套骨架通用）：`Static Shot` `Push In` `Pull Out` `Zoom In/Out` `Pan Left/Right` `Truck Left/Right` `Tilt Up/Down` `Pedestal Up/Down` `Arc Shot` `Tracking Shot` `Shake Slightly/Strongly` `POV` `Roll Clockwise/Counterclockwise` |
| `characters` | string[] | 画内人物（C 编号），必须 ⊆ 剧本该场人物；空镜给空数组。> `maxOnScreen` 时必须带 `note` |
| `props` | string[] | 画内道具（P 编号），必须 ⊆ 剧本该场道具。可省略 |
| `frame` | string | **分镜图英文提示词**：这一格关键帧的样子。景别英文短语必须在里面；禁角色名 |
| `recipe` | string | 镜头配方卡 id，可选。挂了 `--shots <卡片目录>` 才查（`shot-recipe` 门）。**cut 级不是 segment 级**——一段可以跨多种配方；**多格配方靠连续同 id 的分镜表达**，不是数组 |
| `note` | string | 备注，可选 |

`recipe` 是**可选挂载**：不给 `--shots` 就整门跳过。给了就查三条——id 在卡库里、卡片的每条 `must_phrases` 出现在该切的 `frame` 里（两边小写化后 `includes`）、卡片 `cuts` 下限 ≥ 2 时连续同 id 的分镜数不得低于该下限。卡片的**建议景别与运镜不设门**，只在报告里提示偏离：配方是语汇不是法条。

## videoPrompt 的结构：两套骨架，按 video.model 分流

**骨架不是文案偏好，是模型口径。** `video.model` 决定用哪一套，`validate` 的对账口径跟着换——选错一套，整段提示词作废：

| video.model | 骨架 | 写法规范 | promptLang 默认 |
| --- | --- | --- | --- |
| `MiniMax H3`（默认） | I2VA：对齐指令 + 三个字段 + 切点时刻 | `references/h3-prompt.md` | `en` |
| `seedance2.5` / `seedance2.0` / `seedance2.0 fast` / `seedance2.0 mini` | 全模态参考：身份说明 + 主体标签 + 逐镜描述，**全程不出现时刻** | `references/seedance2-prompt.md` | `zh` |

两套骨架都由 `prompt-structure` / `dialogue-verbatim` / `prompt-lang` 三道门盯着，门的 label 会写清这一批按哪套骨架对账。

### H3 骨架（`video.model` 是 MiniMax H3 时）

写法见 `references/h3-prompt.md`（官方方法论的内化版，本 skill 自包含不依赖外部 skill）。骨架：

```text
How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 2) aligns with the 3.00-second mark of the target video; ….

integrated_multimodal_description:
[Shot 1] Cinematic, live-action, …（首格锚定 → 动作 → 运镜 → 对白）
[Shot 2] At 00:03.000, the camera cuts to …（每个镜头独立一行，切点时刻开头）

overall_soundscape: …（环境声与动作声，1–4 句）

non_diegetic_music: …（1–3 句，没有就 N/A）
```

确定性检查的五条：

1. **首行对齐指令整行由分镜结构按 `promptLang` 推导**（`h3AlignmentLine`）：多分镜的段把每张分镜图钉在自己的切点秒数上；单分镜的段用固定句式。validate **逐字对账**——分镜秒数一改，旧指令立刻对不上
2. 三个字段名齐全且按序；描述正文有 `[Shot 1]`
3. **每个 `[Shot k]`（k ≥ 2）必须带切点时刻 `At 00:0X.XXX,`，且等于前面分镜秒数的累计**——节奏写在纸上就必须和提示词一致
4. 认领节拍的每句台词**逐字**进 `<d>[Chinese] …</d>`；说话人身份音色语气用英文写在 `<d>` 外；画外音用 `says in an off-screen voiceover` 并注明唇形闭合
5. `<d>` 块之外的正文语言与 `promptLang` 一致（中文写成英文、英文混进中文都拦）；英文模式禁角色名，中文模式放行（身份靠分镜图锚定）；每个分镜的运镜词（中文用词表中文词如「推」「固定」，英文用官方词）必须出现在**自己的 [Shot k] 段落**里

### seedance 骨架（`video.model` 是 seedance 系列时）

写法见 `references/seedance2-prompt.md`（火山引擎官方指南的内化版）。骨架：

```text
图 1 是……，下文称<主体1>。图 2 是……。（每张分镜图一句，各给一个全程复用的标签）

镜头描述：
[镜头 1] 中景, 跟拍 — ……他压低声音说：{台词逐字照搬}……<铜铃轻响>
[镜头 2] 大远景, 固定 — ……（每个镜头独立一行，**开头不写时刻**）

环境声与配乐：……（音乐写在中文圆括号里，没有就写「无配乐」）

（段末收一句画质、色调与约束词：面部稳定、无字幕、禁止双胞胎分身……）
```

英文模式（`promptLang: 'en'`）的对应 token：`Picture k is` / `shots:` / `ambience:` / `[Shot k]`——与 `novel-creation` 那条产线的通用骨架刻意取齐，两条产线之间搬提示词不用再翻译一遍字段名。

确定性检查的四条：

1. `镜头描述：` 与 `环境声与配乐：` 两个字段齐全且按序
2. **身份说明段里每张分镜图各有一句 `图 k 是…`**——参考图靠标签锚定，不靠秒数对齐，所以身份说明少一张就是少一张图没交代
3. 描述正文里 `[镜头 1]`…`[镜头 N]` 逐镜齐全，每切的运镜词落在自己那一行
4. **全文不许出现时刻**（`00:03.000`、`3.00-second`、`3.00 秒处` 都拦）——官方原话「模型对精确时间（如 0–3 秒）的支持不稳定，强行限制时长可能导致生成结果异常」。分镜秒数照旧留在 storyboard.json 里，用来折算 `duration`、对齐配音、做剪辑，只是不进提示词

台词与语言两条和 H3 一样管着：认领节拍的每句台词**逐字**进提示词（seedance 的台词符号是 `{}`，但门只认逐字——包不包得住是写法，漂没漂是事故）；正文语言与 `promptLang` 双向对账。

## 时长约束链

台词秒数（按剧本语速折算）≤ 分镜 `seconds` ≤ 5 秒；段 Σ分镜 ≤ 15 秒；集 Σ段 落在剧本 `targetSeconds` ±15%。全部由 validate 逐级对账。
