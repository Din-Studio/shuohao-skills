# Midjourney 写法（场景与道具）

production 的 `image.model` 是 Midjourney 时，在 [sheet-prompt.md](sheet-prompt.md) 的通用写法之上按这份调整；其他模型不适用本页。版式固定句仍以 [sheet.md](sheet.md) 为准。

## 一、和通用写法的差别

| 维度 | Midjourney |
| --- | --- |
| 语言 | 英文正文（和通用写法相同）。画面里要出现的字保持原语言原字形，放在英文直双引号里并写清在哪里（`a sign above the door reads "…"`），只写短字串；正文级小字写 `small printed lines too small to read`。 |
| 顺序 | **媒介和主体放最前**：开头 → 摄影短语（写实）→ 版式段 → 身份锁 → 新旧状态 → 光线，非写实结尾接风格短语；开头的词权重最高。 |
| 否定 | 纯净画质段之前的正文**不写否定句**（no / not / never / without）——它不懂否定，提到的东西反而会画出来。要排除的东西放进 `image.negativePrompt`（名词，逗号分隔）。版式固定句里的 `no text…` 那半句改成负向词 `text, letters`。 |
| 参数 | 正文里不写任何 `--` 参数、`::`、网址；参数由出图设置给。 |
| 长度 | 纯净画质段之前的正文一般 60–160 个英文词，不超过 160。写不下先删氛围修饰、合并同类修饰，身份锁一个不删。 |
| 参考图 | 最多 2 张：第 1 张原图参考，第 2 张风格参考。资产变体只使用基准一张。 |

## 二、开头与摄影短语

写实（真人）画风：

| 资产 | 开头 | 紧跟的摄影短语 |
| --- | --- | --- |
| 场景 | `Location scout photo board of <地点类型与年代文化>` | `shot on a full-frame camera with a 24mm lens, real material surfaces` |
| 道具 | `Studio product photo board of <道具类别与形状>` | `shot on a full-frame camera with a 100mm macro lens, real material surfaces` |

不写 `design sheet`、`photorealistic`、`hyperrealistic`、`cinematic lighting`——这些词偏设定图或渲染，写实剧会出成游戏 CG 风。

非写实画风：开头写 `<媒介> scene design sheet of …` / `<媒介> prop design sheet of …`，媒介按《术语》「画风类别」取：二维取 `Illustration`，三维取 `3D render`；结尾接风格短语，不写摄影短语。

开头、摄影短语、风格短语都是固定译法，全剧逐字照抄。

**和 production 画风的关系**：style-match 门要求 `image.sheet` 含 `style.scene.render` 原句，Midjourney 也不例外，所以基准和变体都保留 `Overall style:` 那一段；变体不再另加风格短语（风格随基准图带过来，再写风格短语会和它打架）。

## 三、道具的光线

道具一律写 `soft even frontal studio lighting`；场景的光写在主体描述里（光源 + 方向 + 色温 + 阴影），见 [scene-lighting.md](scene-lighting.md)。

## 四、变体

正文描述**最终这张图**，不写 keep / same as / only change 这类指令，这一点和通用写法的四块不同：

1. 照抄块：开头的媒介、摄影短语、版式段、道具的光线短语、画风段和纯净画质段逐字照抄基准；开头里的主体部分换成下一条的锚点句；
2. 主体锚点一句，在句中写一次对基准图的引用：`… of the same <主体一句> as in the reference image, …`（只写一次，不放句首）；
3. 只写变了的槽位（新光线、新状态）；没变的不写，不重描陈设。

## 五、负向词（`image.negativePrompt`）

只写名词，逗号分隔；正文里要的东西不放进来（本来带字的道具不加 `text`）。

| 类型 | 负向词 |
| --- | --- |
| 场景 | `people, person, crowd, text, letters, numbers, watermark, logo, signature`，再接 `style.scene.negative` 的每一条（style-match 门查） |
| 道具 | `watermark, logo, brand name, signature`；本来不该有字的再加 `text, letters`。**不禁 hands、people**：右格的尺寸参照要画一只匿名的手或一个匿名的人（prop-size-ref 门查） |

写实剧再接一组：`3d render, cgi, video game, game art, concept art, illustration, digital painting, anime, cartoon, plastic look`。

**再提醒一次**：英文、媒介和主体放最前、正文不写否定和参数、不超过 160 词；开头、摄影短语、版式段用固定译法全剧照抄；变体引用基准一次，只写变了的；结尾附纯净画质段。

---

**学习来源**：内化自短剧资产图片提示词 skill（assets）的《模型-midjourney》，只保留场景和道具的行；画风段按本 skill 的 style-match 门保留在变体里。
