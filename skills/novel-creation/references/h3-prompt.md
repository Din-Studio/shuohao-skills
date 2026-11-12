# H3 提示词指南 · 内化版（挂 MiniMax H3 才读这份）

> 文中提到的门名称（如 `dialogue-verbatim`、`size-phrase`）是调度方完整结构检查里的检查项名称。本文件在编写方 `novel-video-prompt` 与调度方 `novel-creation` 各有一份相同副本，修改时两份一起修改；编写方的本地自查是它自己的 `lint` 命令，调度方的完整检查是 `prompts check`。

**学习来源**：MiniMax-H3 官方提示词指南（I2VA / 多图对齐模式）。方法论**内化成本 skill
自带文档，不依赖任何外部 skill**——搬过来的是判断，不是链接。

**什么时候读这份**：`production.json`（或 creation.json 顶层）的 `video.model` 是
`MiniMax H3`，或者两边都没写模型（按默认模型算）。挂 seedance 系列就整份跳过、改读
`seedance2-prompt.md`；挂的是别的模型，两份都不读，照 `creation-prompt.md` 的通用骨架写。

**跟 `creation-prompt.md` 的分工**：那份定骨架（基础检查查的结构），这份讲**骨架里怎么填**
才对得上 H3 的口味。骨架一个字不改——身份说明句、`[Shot k]` 逐镜分行、认领台词逐字，
一样都不许少。

## 一、官方指南里搬什么、不搬什么

官方 I2VA 那套语法是为「每切一张精确钉住秒数的关键帧图」设计的；**本 skill 的参考图是
整段共享的身份锚，不分配到某一秒**，那部分语法在这里没有落点，一律不搬：

| H3 官方有的 | 本 skill 搬不搬 | 为什么 |
| --- | --- | --- |
| 对齐指令（`Picture k … aligns with the 0.00-second mark`） | **不搬** | 没有关键帧可对齐 |
| 切点时刻（`[Shot 2] At 00:03.000,`） | **不搬** | 同上；留着它，哪天换成 seedance 就是硬伤 |
| `<d>[Chinese] …</d>` 台词标签 | **不搬**，改用引号 | `dialogue-verbatim` 门做纯文本子串匹配，不认标签 |
| `(S1)` `(S2)` 说话人编号 | **不搬** | 身份靠参考图锚定，不靠编号体系 |
| 语言分工、说话人交代、画外音句式、声景分工、运镜与动作 | **搬**，见下 | 这些与有没有关键帧无关，是 H3 对提示词本身的口径 |

**不要从别处的多图对齐提示词整段复制过来**——首行的对齐指令与切点时刻在这里既没有用处，
也过不了本 skill 的结构门。

## 二、语言：挂 H3 时默认整条英文

`promptLang` 不写就跟着模型走，挂 H3 默认 `en`。官方口径是正文、字段名、镜头标记全英文，
**并且禁角色名**——用 `an old ferryman`、`a young woman in a plain qipao` 这类通用身份，
`prompt-no-names` 门在 `en` 模式下逐个查（`zh` 模式放行）。

三样东西保留原文语言：

- **台词**逐字，一个标点都不许动（`dialogue-verbatim` 门盯着）
- **歌词**同理
- **画面里真实可见的文字**（招牌、字条、信封上的字）用英文双引号原样引用，不翻译——
  引号里的内容不进语言门与人名门的检查

真要整部剧走中文提示词，在 `production.json` 或 creation.json 顶层显式写
`"promptLang": "zh"` 盖掉默认值，骨架 token 换成 `图 k 是` / `[镜头 k]` /
`镜头描述：` / `环境声与配乐：`。

## 三、说话人怎么交代（没有编号，靠描述）

官方要求说话人**第一次出现就给足辨识信息**：身份、年龄段、音色、语速。本 skill 不用
`(S1)` 编号，这些信息就写在台词引号**外面**的正文里：

```text
[Shot 2] Medium shot, Push In — the old ferryman, gravel-voiced and unhurried, calls out
toward the bank: "上船喽——过河的抓紧，雾要变天。"
```

**同一个人全段用同一个说法**：这一镜写 `the old ferryman`、下一镜改口叫 `that old man`，
模型会当成两个人。没有编号体系时这是唯一的稳定手段，写的时候自己盯。

**画外音**用官方句式：`… says in an off-screen voiceover while their lips remain
completely closed`。通用骨架只要求写成通用描述，不强制这半句；但**唇形闭合是 H3 官方
专门给过措辞的地方**——挂 H3 就补上，成本是一个从句，省的是一张开口说话却没有声音来源的脸。

## 四、声景：官方两个字段，这里收进一个

H3 官方把声音分成两个字段：环境与动作声进 `overall_soundscape`，观众才听得见的配乐进
`non_diegetic_music`。**本 skill 只有一个 `ambience:`**（`zh` 是 `环境声与配乐：`）——
字段名是结构门夹 `[Shot k]` 切片的边界，**不要自己加字段**，加了整段切片就散了。

填法是把官方那两件事收进同一段，先环境与动作声、再配乐，没有配乐就写 `no music`：

```text
ambience: Water slapping the wooden piles, two distant watchman's clappers, baskets
creaking on the gangplank; no music.
```

**声景也是动作指令**——踩过的坑：声景里写「铜铃在撞击时炸响」，视频就真把撞击演出来了。
画面动作改了，这一句必须跟着改。

## 五、运镜与动作

- 运镜词表 20 个（`references/worksheet.md`），可加幅度（小幅／大幅）与
  速度（缓／快），**写成自然英文动作句**：`a slow push in toward the whitened knuckles`。
  词表里那个短语必须原样出现在这一切自己的 `[Shot k]` 行里，`camera-phrase` 门大小写
  不敏感地查
- 动作遵守**常见动作原则**：模型见过千万次的日常动作放心写（推门、
  翻书、弯腰拾物），精确物理交互与微表情不要写
- 人物**此刻的位置状态**要交代清楚（已经在门口 / 站在柜台后 / 已上船）。参考图锁长相
  与材质，文字锁此刻在哪、在做什么——两边冲突时模型听图的

## 六、下单时才用得上的两个数

- `duration` 区间是 **5–15 秒**，段秒数不在区间内由 `clampDuration` 折算（向上取整、
  夹进区间）
- `resolution` 是 **`768p` / `2K`**，不是 `720p` / `1080p`——填错整批提交失败

两条都属于下单阶段，由调度方处理，写提示词时不用管。

## 七、常见病

| 病 | 症状 | 治法 |
| --- | --- | --- |
| 抄关键帧那套 | 从多图对齐的提示词里复制，带来了对齐指令、`[Shot 2] At 00:03.000,`、`<d>` 标签 | 三样都删。这里没有关键帧，它们没有落点 |
| 半改病 | 从 H3 换成 seedance，提示词没重写 | 换了 `video.model` 就重读新那一族的指南——时刻那一条 `prompt-model-fit` 门当场拦 |
| 说话人漂移 | 同一个人这一镜是 `the ferryman`，下一镜成了 `the old man` | 全段一个说法，没有编号就只能靠自律 |
| 自己加字段 | 学官方拆出 `non_diegetic_music:` | 只有 `ambience:` 一个字段，配乐收进它的后半句 |
| 人名漏网 | 正文里写了角色名 | `en` 模式禁人名，改通用身份；人名只许出现在台词引号里 |
| 声景漏改 | 画面改成搭手卸担，声景还写着铜铃撞击 | 声景是动作指令，画面一改跟着改 |
