# 群演 · 群像图

## 什么时候出群像图

- 成群入镜的群演，在 [roster-pass.md](roster-pass.md) 按一批登记成一个 `entityType: group` 身份，需要视觉呈现时出**一张群像图**。
- 单个路人只登记身份，不写 `image`，不出图；他的长相靠下游镜头里那一行描述。
- 不同批次的群演分别登记、分别出图，不为了省图合并成一批。

## 版式（`image.sheet` 第一段）

白色背景，这批里有几个人就画几个人，全身正面站好；人多就分成上下几排，每个人都看得清：每排各站在自己的一条地线上，每个人头顶到脚底完整入画，同一比例，人与人之间、排与排之间都留白底间隔，谁也不挡谁，脚下不画投影。群像图要画头（群演没有单独的脸部特写，脸只能靠这张图），也不配比例对照。画面不含任何文字和品牌标识。

英文写法（`<N>` 写人数，`<R>` 写排数，一排写 `one row`）：

```
Layout requirements: one <aspectRatio> landscape canvas on a plain pure white background; <N> people in <R> rows, each row standing side by side on its own ground line, full body from the top of the head to the feet, front view, same scale, separated by clear white gaps, nobody overlapping anybody, no cast shadow under the feet, all different heights and builds. The image contains no text and no logos.
```

**固定句**：`all different heights and builds`（「高矮胖瘦各不相同」）每张群像图都原文带上，validate 查。不写的话，模型会把一群人画成一个模子刻出来的。群像图不要求脸部特写和脖子以下三格，validate 按 `entityType: group` 换一套检查。

## 内容

- 这批人的人种标签构成、服装、发型、体态；接正面光固定句（见 [sheet-prompt.md](sheet-prompt.md) 第一节）。
- 中性站姿、中性表情，不写剧情动作；不写名字、剧情。
- 群演不是剧中重要人物，长相写成普通、可信的路人，和需要设定图的人物在外观上拉开距离，免得视频里被认成某个主要人物；不同群演批次之间也在发型、服装色系上拉开，免得两批人被看成同一批。
- 画风句、纯净画质段与人物设定图相同，全剧统一。

---

**学习来源**：内化自短剧资产图片提示词 skill（assets）的《群演》第三节和《模型-midjourney》的群演版式短语。
