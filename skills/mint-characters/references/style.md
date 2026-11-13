# 画风从哪来

**本 skill 不内置任何画风。**画风住在工作目录根的 `production.json` 顶层，由用户在
`mint-setup` 那一段填。本 skill 要的是其中的 `style.character` 那一块。

```text
mint_skill({skill:"mint-characters",args:["style"]})
```

从当前目录向上最多 5 层找 `production.json`，把角色那一块原样打出来。**出角色卡之前先跑它**——
那几段英文正文是要原样抄进 `image.sheet` / `image.prompt` / `image.negativePrompt` 的。

找不到那份文件，或那一块没填，命令会直接报错并指路回 `/mint-setup`。不要自己编一档画风顶上去。

## 为什么不内置

以前这里写死两档预设（`realistic` / `ghibli`），有两个问题：

- 想拍水墨、拍黏土定格、拍胶片颗粒的年代戏，只能改代码
- 同一档画风的正文在三个出图 skill 里各存一份，改一处漏两处

现在正文只有一处产地，写什么下游就查什么。**`cast.json` 顶层也不再有 `style` 字段**——
产物里再抄一份就是第二个来源，两个来源必然会漂。

## 那一块有五样东西

| 块 | 作用 |
| --- | --- |
| `render` | 渲染方式那句 |
| `surface` | 皮肤、眼睛、头发、布料怎么处理 |
| `lighting` | 光照 |
| `negative` | 反向提示词 |
| `tags` | 风格标签 |

## ⚠️ 换风格是整套换，不是只换一句「画风」

五块**必须整块取用，不要混搭**。混搭必然自相矛盾：写实那套刚把 `photorealistic`
从反向词里留出来，平涂动画那套恰恰要禁它；毛孔、皮下散射、顺表情肌的皱纹在写实里是加分项，
在平涂动画里是反效果。

矛盾本身由 `mint-setup` 的 `style-coherent` 门查（**同一个短语既写进 `render`/`surface`/`lighting`/`tags`
又写进 `negative`，就是自相矛盾**）。走到这一段，画风本身已经是自洽的。

## 本段查什么

`validate` 挂上 `production.json` 之后自动查两条，没有开关：

| 查什么 | 为什么 |
| --- | --- |
| `image.sheet` 与 `image.prompt` 都含 `render` 原句 | 只查 `sheet` 的话，`prompt` 里留着上一档画风也照样全绿，出来就是设定表一个样、单张人像插画另一个样的两张皮 |
| `image.negativePrompt` 带全 `negative` 的每一条 | 换风格是整套换。少一条就是画风漂了半步 |

反向词按逗号拆成词条**逐条**查，所以**角色自己额外加的不受影响**——某个角色要禁「戴眼镜」
「叼烟」，照加，门查的是有没有带全，不是有没有多写。

## 版面不随画风变

按 `production.image.asset.aspectRatio` 分三区、34%/66% 分栏比例、人物比例协调、细节让位不是人物让位——这些是**版面规则**，
哪一档画风都一样。变的只有渲染质感。

`lighting` 归在画风里而不是版面里，是因为它两头都沾：设定表要平光才好抠图、好量比例，
写实又要方向光才有体积。怎么调和是画风自己的事（写实那套分区打光，平涂那套全图平光，
平光本来就是那个风格的一部分），所以它跟着画风走。

## 创作背景与视觉边界

参见 [creative-background.md](creative-background.md)。读取 production.creativeBrief 的自然语言要求，不推导策略。保留逐字证据、角色区分度、设定表比例、视觉正文和参考图挂载检查。seed 接受 outline v3，允许省略人物 from/arc；角色卡输出仍遵循原协议。正式样例与本地投影夹具均为《渡口》。
