# 角色卡结构

## 2.0.0 创作契约与迁移

seed 只接受显式 `outline.schemaVersion: 2`。只读取 production 中 genre/narrativeStyle 作为背景，不加载 profile，不新增应用流程或 creativeContext，不伪造摘要。本地 profile 缺失不影响资产阶段。缺 production 的历史读取仅跳过上游对账；提供损坏上游或缺视觉正文的 production 必须失败。出图仍须合法视觉正文及制作参数。

检查对象统一为 `status: pass/fail/skipped + category + level`，不再输出 ok 布尔值。跳过不计为通过。内容评审未执行时明确说明。开工前阅读 [契约](creative-background.md) 和 [迁移说明](migration.md)。

`cast.json` 顶层：

```json
{
  "source": "渡口",
  "lang": "zh",
  "summary": "民国年间的清晨，一条河的渡口浓雾未散。摆渡四十年的老船夫照常开船，先后上船的是……",
  "characters": [ /* 角色卡 */ ]
}
```

| 顶层字段 | 必填 | 说明 |
| --- | --- | --- |
| `source` | 是 | 书名/篇名，报告标题用 |
| `lang` | 是 | 内容语言及默认界面语言，默认 `zh`。`render --lang` 仅覆盖界面语言，不改变内容校验语言 |
| `ui` | 视情况 | 界面文案翻译。`lang` 是 `zh`/`en`/`ja` 时**不需要**（内置）；其他任何语言**必填**，否则 `validate` 报错。用 `ui-template <lang>` 生成骨架后翻译。只覆盖部分键也可以，缺的用内置英文兜底 |
| `summary` | 是 | **故事摘要**，中文 3–5 句。交代时空背景、核心情境、人物聚在一起的由头。报告顶部显示，让人不看原文也知道这几个角色是什么关系。不要剧透结局，也不要写成推荐语 |
| `characters` | 是 | 角色卡数组 |

角色 `id`：新版 seed 保留稳定 ID，格式为 `C` 加至少两位数字（`^C\d{2,}$`），全表唯一。旧独立角色卡可以省略 `id`；已经提供时，空白、非法类型、非法格式与重复值始终失败，不依赖原文或 production。

`image.sheet` 中的画幅占位符必须替换为生产参数实际值，不能直接提交占位符。

`summary` 缺失会被 `validate` 判为违规——报告顶部会空着。

**顶层没有 `style` 字段。**画风住在工作目录根的 `production.json`，`cast.json` 里再抄一份就是第二个来源，两个来源必然会漂。跑 `node scripts/novel-characters.mjs style` 取这部剧的那一块，详见 `style.md`。

单张角色卡：

```json
{
  "name": "老周",
  "aliases": ["老伯"],
  "importance": "major",
  "oneLiner": "在渡口摆渡四十年的老船夫，一只眼睛是白的。",

  "persona": {
    "gender": "男",
    "ageRange": "约七十岁（推断）",
    "identity": "渡口船夫",
    "appearance": "背驼得像一张拉满的弓。左眼被风沙磨得只剩一层白翳。……",
    "personality": ["沉默", "耐性", "老练"],
    "temperament": "开口时嗓子里像卡着半口江水，含混、发沉。……",
    "motivation": "把船开过去。雾再厚也照常开船。",
    "arc": "静止。他是这条河的一部分。",
    "relationships": [{ "name": "沈知微", "relation": "向他问路的年轻渡客" }],
    "evidence": ["雾一厚，连自己的手都看不清。"]
  },

  "image": {
    "style": "Flat vector cartoon with ink-wash colouring",
    "prompt": "Character design sheet of an elderly Chinese ferryman ...",
    "promptLocal": "角色设定图：约七十岁的中国老船夫……",
    "negativePrompt": "photorealistic, 3d render, young face, ...",
    "tags": ["flat vector", "character sheet", "ink wash palette"],
    "sheet": "Single character model sheet on ONE <production.image.asset.aspectRatio> canvas ... LEFT ZONE ... about 34% ... one bust portrait ... RIGHT-TOP ZONE ... three FULL-BODY views ... PROPORTIONS ARE CRITICAL ... RIGHT-BOTTOM ZONE ... four to five small isolated close-up studies ..."
  },

  "voice": {
    "timbre": "沙哑低沉的男中低音，喉音重",
    "pitch": "低",
    "pace": "缓慢，字与字之间拖着气口",
    "accent": "南方水乡口音，尾音含混",
    "emotion": "疲惫而平静",
    "referenceHint": "像一个在同一个渡口喊了四十年「开船」的人",
    "prompt": "An elderly male voice, around seventy-five. Low bass-baritone ..."
  }
}
```

## 语言分工

「本地语言」= 顶层 `lang` 指定的语言，默认中文。

| 字段 | 类型 | 语言 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 原文 | 原文里用得最多的称呼 |
| `aliases` | string[] | 原文 | 其他称谓；职业名词（如「货郎」）归 `identity`，不进这里 |
| `importance` | enum | — | `protagonist` / `major` / `supporting` / `minor`，**只能这四个** |
| `oneLiner` | string | **本地语言** | 一句话抓住这个人 |
| `persona.*` | — | **本地语言** | `personality` 3–5 个词 |
| `persona.evidence` | string[] | **原文语言** | **逐字引用**，永远不翻译——翻了就不是证据了。没有就空数组 |
| `image.style` | string | 本地语言 | 画风一句话 |
| `image.prompt` | string | **英文** | 单张卡通设定图；**禁止出现人名**；**必须写明族裔／年代／地域** |
| `image.promptLocal` | string | 本地语言 | 上面那条的译文；`lang=en` 时省略；**同样禁止人名** |
| `image.negativePrompt` | string | **英文** | 逗号分隔 |
| `image.tags` | string[] | **英文** | 4–8 个风格标签 |
| `image.sheet` | string | **英文** | **角色设定图**，画幅读取 `production.image.asset.aspectRatio`，三区版面：左约 34% 半身像（面部基准）／右上全身三视图／右下细节条，细线分隔；**禁止出现人名**；**必须写明族裔／年代／地域** |
| `voice.timbre/pitch/pace/accent/emotion/referenceHint` | string | **本地语言** | 最容易写漂的地方，注意 |
| `voice.prompt` | string | **英文** | 给 TTS 音色设计引擎。**没有 `promptLocal` 对照版，这是有意的**——上面六项已经是本地语言，再给一段中文散文只会让人复制错，把它喂进 TTS（生产里踩过） |

**英文字段不跟随 `lang`。** 图像模型和 TTS 引擎吃英文最稳，跟报告用什么语言无关。

## 设定图的三区版面

画幅读取 `production.image.asset.aspectRatio`，允许合法横向或方形比例，细线分成三块：

- **左侧（约 34%）** 半身像当**面部设计基准**，尺寸大、五官画得细，可以直接拿去做表情设计
- **右上** 三视图管剪影、比例、服装，脸照左栏画
- **右下** 细节条，4–5 个关键细节的小特写（配饰、道具、疤痕、鞋履……）

两个最容易崩的点：**一张图里出现两个长相**，以及**为了塞下细节把人物压扁**。提示词里都要写死——细节放不下就往右缘延伸，**永远是细节让位，不是人物让位**。

## 校验

`scripts/novel-characters.mjs validate <cast.json> <book.txt>` 会检查：结构完整性、`importance` 枚举、**引文逐字**、**出图提示词不含人名**、**语言分工**。违规逐条列出并 exit 1。
