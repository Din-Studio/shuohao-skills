# 设定图出图（场景 + 道具）· 版面与提示词

身份登记不要求图片。只有 designStatus: ready 且任务需要生成时，本页才适用。本 skill 只导出出图计划；实际生成使用独立安装的 **ly-image**。先阅读 [交接与恢复流程](media-handoff.md)。提示词的通用组成（版式段 → 身份锁 → 细节 → 画风段 → 纯净画质段）和基准、变体的写法见 [sheet-prompt.md](sheet-prompt.md)。

```bash
node <baseDir>/scripts/mint-art.mjs images <剧名>-art.json --out image-plan.json
```

可使用 `--only` 选择任务，`--dry-run` 预览；默认同样不会生成。变体场景自动补齐母场景依赖，道具的状态变体自动补齐基准道具依赖，并按先基准后变体的顺序导出。
模型、档位和画幅来自显式 production.json，提示词来自 image.sheet（道具状态变体来自 `states[n].prompt`）与 image.negativePrompt。缺完整制作参数时先补齐，不能使用隐式默认值。设定图画幅与视频画幅分别读取，不折算像素。实时 schema 由 ly-image 核对。

以下是版面和提示词的创作要求；计划不等于图片。

## 场景：四方向宫格 + 平面图

**为什么出四个方向**：一个场景如果只有一张全景，视频模型只知道镜头正前方长什么样；正反打、切到人物背后时，背景就要靠它现编，前后镜头对不上。所以场景设定图从空间中央向前、后、左、右各看一眼，再配一张平面图交代东西在哪。

```
┌─────────┬─────────┬───────────────────┐
│   前     │   后     │                   │
│         │         │   正交平面图        │
├─────────┼─────────┤   （室内：户型图）   │
│   左     │   右     │   （室外：俯瞰图）   │
│         │         │                   │
└─────────┴─────────┴───────────────────┘
          生产参数画幅 · 白色背景
```

- **左侧四宫格**：站在空间中央、平视高度、广角，朝前、后、左、右各看一格。排列固定：左上「前」、右上「后」、左下「左」、右下「右」，前后左右照《术语》「方位」里场景自己的前后左右。四格是同一个空间、同一时刻、同一套光线（这个场景的光影锁），格与格之间留白底间隔，**四格里都不出现人物**。
- **右侧平面图**：室内画正交顶视的户型图——从正上方垂直俯视、无透视畸变，画出墙体、门窗洞口和家具摆放；室外画正交俯瞰图，画出场地边界、道路、建筑轮廓、树木和关键物件。和四宫格是同一套陈设、同一个位置。**平面图上不写任何字和数字**——模型画的字和数字常常是错的。
- 四宫格和平面图必须是同一次生成的一整张图，这样光线、材质、陈设才是一套。

**版式固定句**（版式段照抄，只填尖括号；scene-layout 门查 `two-by-two grid` 与 `orthographic`）：

室内：

```text
One <画幅> landscape canvas on a plain white background. Left part: a two-by-two grid of four wide eye-level views taken from the center of the same empty room, looking forward (top left), backward (top right), left (bottom left) and right (bottom right), same moment and same lighting in all four, separated by white gaps. Right part: an orthographic top-down floor plan of the same room seen straight from above, walls, door and window openings and furniture in the same positions as the grid, clean unlabeled plan. No people anywhere in the image; no text, no lettering and no logos anywhere in the image.
```

室外：把 `the same empty room` 换成 `the same empty site`，右部换成 `Right part: an orthographic top-down aerial view of the same site seen straight from above, site boundary, paths, building outlines, trees and key objects in the same positions as the grid, clean unlabeled plan.`

方形画布把 `landscape` 换成 `square`。

## 道具：三格

```
┌───────────┬───────────┬───────────┐
│   正面     │ 最容易认错  │  尺寸参照   │
│           │  的那一面   │（匿名手或人）│
└───────────┴───────────┴───────────┘
        生产参数画幅 · 白色背景
```

- **左格：正面**，道具主体居中、完整入画。
- **中格：最容易认错的那一面**，同一件道具换个角度：厚度、轮廓最容易画错的（刀、手机、戒指、铁盒）画侧面或斜上方；其余画背面（水平旋转 180 度），纸张、卡片这类薄片也画背面。看不见的部分按同一件物品的结构合理补全。
- **右格：尺寸参照**，让人一眼看出它多大。按长边分三档，对应 `scale` 枚举：
  - **手持级**（长边 30 厘米以内）：一只通用的成年人的手捧着它的手部特写，手只露到手腕，道具占这一格的主体；
  - **桌面级**（30–60 厘米）：一个穿素色衣服的普通人胸口以下双手持握它，画面上沿在锁骨以下；
  - **家具级**（60 厘米以上）：一个穿素色衣服的普通人以背影或侧影站在它旁边或正在使用它（靠着车、坐在椅上、手扶门）。
- 右格里的手或人**只作尺寸参照，不是剧中任何角色（主角也不是）**：不写角色名，不照任何人物的长相或服装写，不露脸。提示词里写明它是匿名路人、仅作尺寸参照、比例真实，否则视频模型会把这只手、这个人当成这一段里的人物。
- 三格里是同一件道具、同一比例；除右格那只手或那个人之外不出现人物，没有场景背景，纯白背景可抠图。

**版式固定句**（prop-white、prop-scale、prop-size-ref 三道门查）：

```text
One <画幅> landscape canvas: three equal panels side by side on a plain white background with clear white gaps, each item kept inside its own panel. Left panel: the front of the object, centered and complete. Middle panel: <中格>. Right panel: <右格那一档>; the hand or person is an anonymous generic bystander used only as a size reference, with true-to-scale proportions; actual size about <长 × 宽 × 高，带单位>. The same object at the same scale in all three panels, no scene background; no text, no lettering and no logos anywhere in the image.
```

中格三种角度：背面 `the back of the same object rotated 180 degrees`；侧面 `the side view of the same object showing its thickness`；斜上方 `the same object seen from above at an angle`。

右格三档（`scale` 对应的英文，prop-scale 门查加粗部分）：

| scale | 长边 | 英文 |
| --- | --- | --- |
| 手持级 | 30 厘米以内 | `a close-up of **a generic adult hand holding it**, the hand visible only up to the wrist, the object filling most of the panel` |
| 桌面级 | 30–60 厘米 | `an ordinary person in plain clothes **holding it with both hands, framed from the chest down**` |
| 家具级 | 60 厘米以上 | `an ordinary person in plain clothes seen from behind, the back of the head toward the camera, **standing next to it or using it**` |

道具的光写 `soft even frontal studio lighting`，物件上没有明显的阴影和色光。

**反向词不禁手、不禁人**：右格本来就要画手或人，反向词里写 `hands`、`people` 会和版式自相矛盾（prop-size-ref 门查）。道具的反向词写水印、商标、签名，本来不该有字的再加 `text, letters`。

## 三条硬要求

1. **场景空景无人。**版式固定句里的 `No people anywhere in the image` 必须在，场景反向提示词禁人（no-people 门查）。生成图里出现一个人影就重生成——环境资产里的人洗不掉。
2. **一张图里只能有一个空间、一件东西。**四宫格的四格和平面图要对得上：每个锚点、每个功能性元素在它该在的方向格里，在平面图上位置对得上。道具三格是同一件、同一比例。拿到图先按锚点核对。
3. **透视要稳。**环境图最常见的废图是几何融化、透视歪斜。空间默认方正（见 [scene-pass.md](scene-pass.md)），反向提示词里 `warped perspective, melted geometry` 从 production 的画风正文读取。

## 变体的提示词

- **场景变体**：`variantOf` 进入计划的参考依赖；ly-image 必须先完成母场景，再绑定其成图作为参考。变体整张重出：四宫格换成新的天色、光影锁或空间状态，平面图不动。按 [sheet-prompt.md](sheet-prompt.md) 第三节四块写：保持建筑结构、空间布局、四个方向的视角、家具与关键物件的位置和数量、平面图；只改光影锁（新的主光源、方位、色温，亮处暗处差多少和阴影）和剧本写了的空间状态（天气、现场效果、破损、陈设）。重写沙发的位置，模型就会把沙发重摆一遍，和基准对不上。
- **道具变体**：`states[0]` 是基准设定图画的那个状态；`states[1]` 及以后各写一条完整的英文变体提示词（四块写法），计划为它们导出依赖基准图的任务。保持三格版式、主体结构、材质、形状、比例、颜色、右格的手或人的姿态与取景；只写变了的状态：破损、燃烧、浸湿、磨损、碎裂、打开、带血的具体样子。

## 文件名

新登记资产通过固定 imageStem（默认稳定 ID）落到 `./images/<imageStem>-sheet.png`；显式 sheetImage 优先。道具状态变体落到 `./images/<imageStem>-state<序号>-sheet.png`，序号从 2 开始，对应 `states` 的第几个；任务 ID 是 `<道具 ID>.s<序号>`（如 `P01.s2`），可传给 `--only`。`render` 按同一个算法找图。

## 道具的透明底

白底出图之后，可另交 ly-image 执行透明底编辑；先查实时模型、参数和价格。抠图只取左格正面。核验后放到 optionalCutoutOutput，保留原白底主图；render 仍读取 sheetImage 或固定 imageStem 对应的主图。

## 画风一致性

同一部剧的所有场景应该像同一个美术组画的。压不住的话，把第一个主场景的成图当风格参考喂给后面的场景。代价是第一张定基调，出得不好就得重来。

## 创作与制作参数分离

创作要求不替代技术参数。出图仍必须提供 production 的完整视觉正文、模型、分辨率和资产画幅，不能由 creativeBrief 或 CLI 默认值代替。缺制作参数时生成任务报错。参考依赖与目标路径由计划保留；生成、上传及透明底编辑交给外部工具。

---

**学习来源**：场景四宫格加平面图、道具三格与尺寸参照、变体整张重出的版式内化自短剧资产图片提示词 skill（assets）的《场景》《道具》《模型-midjourney》版式短语。
