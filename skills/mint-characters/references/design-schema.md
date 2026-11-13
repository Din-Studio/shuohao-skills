# 可选设计字段

正式身份契约见 [schema.md](schema.md)。cast v1 的每个角色可以按需附加 `persona`、`image`、`voice` 设计块，以及 `importance`、`oneLiner` 两个展示字段；身份登记不要求其中任何一项。提供某一项时，该项内部遵循本文字段规则。aliases 是带 sourceRefs 的对象数组，校验设计时只取其中的名称。

`image.sheet` 中的画幅占位符必须替换为生产参数实际值，不能直接提交占位符。

**cast 顶层没有 `style` 字段。**画风住在工作目录根的 `production.json`，`cast.json` 里再抄一份就是第二个来源，两个来源必然会漂。运行 `node scripts/mint-characters.mjs style` 取这部剧的那一块，详见 `style.md`。

角色设计块（与身份字段同在一个角色对象内，示例省略身份字段）：

```json
{
  "id": "C03",
  "name": "老周",
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
    "relationships": [{ "id": "C01", "name": "沈知微", "relation": "向他问路的年轻渡客" }],
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

「本地语言」= cast 顶层 `lang` 指定的语言，默认中文。

| 字段 | 类型 | 语言 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 原文 | 原文里用得最多的称呼；别名见 schema.md，职业名词（如「货郎」）归 `persona.identity` |
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

`scripts/mint-characters.mjs validate <cast.json>` 在 `optional-design` 检查中核对已提供的设计块：字段完整性、`importance` 枚举、**引文逐字**（对照 provenance 记录的原剧本）、**出图提示词不含人名**、**语言分工**、关系必须引用已有 C ID。违规时该项为 fail 并 exit 1。
