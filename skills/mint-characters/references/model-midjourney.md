# Midjourney 写法（人物与群演）

只在 `production.image.model` 是 Midjourney 时使用这一份；其余模型按 [sheet-prompt.md](sheet-prompt.md) 写。下面几条是 Midjourney 专属约束，不适用于其他模型。

## 一、和通用写法的差别

| 维度 | Midjourney |
|---|---|
| 顺序 | **媒介 + 主体放最前**：开头 → 摄影短语（写实）→ 版式短语 → 身份锁 → 服装 / 新旧 → 光线，非写实结尾接风格短语；开头的词权重最高，越往后越弱。production 的 `render` 原句仍要放进正文（validate 查），放在开头之后。 |
| 否定 | 纯净画质段之前的正文**不写否定句**（no / not / never / without）——它不懂否定，提到的东西反而会画出来。要排除的东西放进 `image.negativePrompt`（名词，逗号分隔）。 |
| 参数 | 正文里不写任何 `--` 参数、`::`、网址、画幅比例以外的设置；参数由出图设置给。 |
| 长度 | 纯净画质段之前的正文一般 60–160 个英文词，不超过 160。写不下先删氛围修饰、合并同类修饰，身份锁一个不删。 |
| 参考图 | 最多 2 张：第 1 张原图参考，第 2 张风格参考。 |

## 二、开头与摄影短语

**写实（真人）**：开头就是真人照片，紧跟相机、镜头、真实质感；不写 `character reference sheet`、`design sheet`、`hyperrealistic`、`cinematic lighting`——这些词偏设定图或渲染，写实剧会出成游戏 CG 风。

| 类型 | 开头 | 紧跟的摄影短语 |
| --- | --- | --- |
| 人物、生物 | `Costume test photo board of one real <年龄段> <族裔> <国籍或地域> <性别>`（人种标签照英文语序写，如 `Black American woman`；中文标签里没有族裔的这一槽空着，如 `Chinese man`；架空种族的族裔一项放进 `<族裔>` 这一槽，如 `wolf-clan man, human form, Nordic-looking`） | `shot on a full-frame camera with an 85mm lens, natural skin with visible pores, real fabric texture` |
| 群演 | `Background cast photo lineup of <人数与构成>` | 同人物 |

**非写实**：开头写 `<媒介> character reference sheet of …`，结尾接风格短语，不写摄影短语。媒介按《术语》「画风类别」取：二维取 `Illustration`，三维取 `3D render`；风格短语照 production 的 `render` 原句。

## 三、版式短语（固定英文）

| 版式 | 英文 |
|---|---|
| 人物、生物 | `plain white background; left part a strictly frontal close-up of the face, facial midline vertical and centered, both eyes level, looking straight into the camera; right part three full-body views of the same person from the neck down to the feet, front, side and back from left to right, same scale, standing on one shared ground line, separated by clear white gaps` |
| 群演 | `plain white background; <N> people in <R> rows, each row standing side by side on its own ground line, full body from the top of the head to the feet, front view, same scale, separated by clear white gaps, all different heights and builds` |

画幅写进版式短语开头（`one 16:9 landscape canvas, plain white background; …`），validate 核对画幅与 production 一致。光线一律写 `soft even frontal studio lighting`。

纯净画质段照 [sheet-prompt.md](sheet-prompt.md) 的英文固定句，放在正文之后单独一段。

## 四、负向词

只写名词，逗号分隔；production `style.character.negative` 一条不落地带上（validate 查），再接：

- 人物、群演：`text, letters, labels, watermark, logo, signature, cast shadow`
- 写实剧再接：`3d render, cgi, video game, game art, concept art, illustration, digital painting, anime, cartoon, doll, plastic skin`——但要先确认这些词没有出现在 production 的画风正文里，一边要一边禁就是自相矛盾。

---

**学习来源**：内化自短剧资产图片提示词 skill（assets）的《模型-midjourney》，只保留人物与群演部分；变体写法见 sheet-prompt.md 第四节。
