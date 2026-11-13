# 设定图出图（场景 + 道具）· 版面与提示词

This skill exports an offline plan; authorized generation uses the host canvas_cli. Read [canvas handoff and recovery](media-handoff.md). All tool paths are workspace-relative.

```text
mint_skill({skill:"mint-art",args:["images","art/作品-art.json","--out","art/image-plan.json"]})
```

可使用 `--only` 选择任务，`--dry-run` 预览；默认同样不会生成。变体自动补齐母场景依赖，并按先母后子的顺序导出。
模型、档位和画幅来自显式 production.json，提示词来自 image.sheet 与 image.negativePrompt。缺完整制作参数时先补齐，不能使用隐式默认值。设定图画幅与视频画幅分别读取，不折算像素。Use host canvas_cli models to verify the current schema. Unsupported plan fields, including negative prompts the current canvas does not send, block submission until explicit creative revision.

以下是版面和提示词的创作要求；计划不等于图片。

## 每个场景、每件道具各一张图

### 场景

一张横向或方形画布（画幅读取 `production.image.asset.aspectRatio`），主视角大图 + **底部和右侧的 L 形细节边框**，
细线分隔：

```
┌─────────────────────────────┬───────┐
│                             │ 细节 1 │
│      主视角（标准取景）        ├───────┤
│      场景的标准长相            │ 细节 2 │
│      ~72% 宽 × 70% 高        │       │
├─────────┬─────────┬─────────┼───────┤
│  细节 3  │  细节 4  │  细节 5  │       │
└─────────┴─────────┴─────────┴───────┘
```

- **主区（左上，约 72% 宽 × 70% 高）**：主视角 = 这个场景的标准取景 + 第一个光照
  状态，这就是「这个场景长什么样」的唯一标准答案
- **右列 + 底行**：全部是**细节特写**——一致性锚点和关键材质的近景，右列 2 格、
  底行 3 格左右
- 每个细节格都必须是主视角那个空间的裁切放大，**不许出现主视角里没有的东西**——
  提示词里写死 `nothing invented that is not present in the master view`

### 道具

同一套 L 形版面，差别三处：**纯白背景**（每个面板都是，要抠图）、主视角是主状态的
四分之三角度、底行放**其他状态 + 侧面正交视图**。全图**无人且无手**——拿着道具的手
是最常见污染，出现就重生成。尺度短语（`handheld scale` 等）必须在提示词里，否则
手持铁盒会被画成柜子。

场景和道具的产物都落到 `./images/<slug>-sheet.png`（`slug` 命令生成安全文件名），
`render` 按同一个算法找图。

## 三条硬要求

1. **全图空景无人。**提示词里 `Absolutely no people anywhere` 必须在，反向提示词
   禁人必须在。生成图里出现一个人影就重生成——环境资产里的人洗不掉。
2. **一张图里只能有一个空间。**角色设定图最容易出「一张图两个长相」，环境图的对应
   崩法是**面板之间空间对不上**（左边六排坐板、右上变成四排）。提示词里写死
   `THE SPACE MUST BE IDENTICAL ACROSS ALL PANELS`。拿到图先核对锚点：每个锚点在
   主视角里找得到吗？
3. **透视要稳。**环境图最常见的废图是几何融化、透视歪斜。反向提示词里
   `warped perspective, melted geometry` 必须在（预设自带）。

## 变体场景的提示词

variantOf becomes a plan dependency. Complete and verify the parent scene through canvas_cli before connecting its observed output node as a reference:
母场景主视角 + `changes` 的改动描述 + 一句
`keep the structure, materials and wear identical to the reference image`。
这比从零生成一致得多——变体机制的意义就在这。

## 道具的透明底

Keep the white-background master. A cutout is a separate authorized canvas operation: first read the packaged command guidance and observed node tool capabilities, verify supported parameters and current costs, then download and verify the result at optionalCutoutOutput. If no suitable tool is available, report it as unfinished. Render continues to read <slug>-sheet.png; never reuse the retired --cutout flag.

## 画风一致性

同一部剧的所有场景应该像同一个美术组画的。压不住的话，把第一个主场景的成图当风格
参考喂给后面的场景（提示词里引一句它的渲染特征）。代价与角色 skill 相同：第一张
定基调，出得不好就得重来。

## 创作与制作参数分离

创作要求不替代技术参数。出图仍必须提供 production 的完整视觉正文、模型、分辨率和资产画幅，不能由 creativeBrief 或 CLI 默认值代替。缺制作参数时生成任务报错。参考依赖与目标路径由计划保留；生成、上传及透明底编辑交给外部工具。
