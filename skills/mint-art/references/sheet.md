# 设定图出图（场景 + 道具）· 版面与提示词

身份登记不要求图片。只有 designStatus: ready 且任务需要生成时，本页才适用。本 skill 只导出出图计划；实际生成使用独立安装的 **ly-image**。先阅读 [交接与恢复流程](media-handoff.md)。提示词的通用组成（版式段 → 身份锁 → 细节 → 画风段 → 纯净画质段）、validate 从实际发送正文切出的主体区，以及基准、变体的写法见 [sheet-prompt.md](sheet-prompt.md)。

```bash
node <baseDir>/scripts/mint-art.mjs images <剧名>-art.json --out image-plan.json
```

可使用 `--only` 选择任务，`--dry-run` 预览；默认同样不会生成。变体场景自动补齐母场景依赖，道具的状态变体自动补齐基准道具依赖，并按先基准后变体的顺序导出。
模型、档位和画幅来自显式 production.json，提示词来自 image.sheet（道具状态变体来自 `states[n].prompt`）与 image.negativePrompt。缺完整制作参数时先补齐，不能使用隐式默认值。设定图画幅与视频画幅分别读取，不折算像素。实时 schema 由 ly-image 核对。

以下是版面和提示词的创作要求；计划不等于图片。

## 场景：单张广角大全景 + 正交平面图

一整张横版设定图，左侧用单张广角大全景交代当前空场的主要布局，右侧用同一场景的正交平面图明确空间关系，两区之间留白。

```
┌────────────────────┐   ┌───────────────────┐
│                    │   │   正交平面图       │
│  单张广角大全景      │   │ （室内：户型图）   │
│  当前状态的空场      │   │ （室外：俯瞰图）   │
│                    │   │  留白供后期标尺寸  │
└────────────────────┘   └───────────────────┘
          生产参数横版画幅 · 两区之间留白
```

- **左侧单张广角大全景**：在场景内外选择能交代主要布局的机位，以平视高度、水平广角拍摄当前状态的空场。尽量收进主要出入口、通道、关键设施和前中后景的相对位置。保持自然透视和实际比例，建筑直线平直，避免鱼眼和边缘拉伸。场景铺满左侧图像区。
- **右侧正交平面图**：室内画从正上方垂直向下看的户型图，呈现墙体、门窗开口、通道和主要陈设；室外画从正上方垂直向下看的正交俯瞰平面图，呈现场地边界、出入口、道路和关键固定设施。图内留白供合成时添加尺寸线，生成时不画尺寸线、文字或数字。
- 两区是同一场景、同一状态，同一物件的实际位置、朝向和数量一致，按观察角度呈现可见内容；保留物件与出入口、通道、固定结构的相对关系。两区在同一次生成中组成一整张图，画面无人，不含任何文字和品牌标识。

**版式固定句**（版式段放最前，只填尖括号；当前脚本的兼容性限制见 [schema.md](schema.md)「可选设计字段」）：

室内：

```text
One <画幅> landscape canvas on a plain white background, with a white gap between the two parts. Left part: a single wide establishing view of the empty room in its current state, from an eye-level camera position inside or outside it chosen to show the main layout, with a level wide-angle view, natural perspective, true-to-scale proportions and straight architectural lines, free of fisheye distortion and edge stretching; the scene fills the left image area, showing the main entrances, passages, key facilities and foreground, middle-ground and background relationships wherever visible. Right part: an orthographic top-down floor plan of the same room seen straight from above, showing walls, door and window openings, passages and main furnishings, with blank space reserved for dimension lines to be added later in compositing. Both parts show the same current state; corresponding objects have consistent actual positions, orientations and counts, with visible content appropriate to each viewing angle. No people anywhere in the image; no text, no lettering and no logos anywhere in the image.
```

室外：把左侧的 `the empty room` 换成 `the empty site`，右部换成 `Right part: an orthographic top-down plan of the same site seen straight from above, showing site boundaries, entrances, roads and key fixed facilities, with blank space reserved for dimension lines to be added later in compositing.`，两区一致性和无人无字要求照抄。

场景设定图使用 production 指定的横版画幅；制作参数不是横版时先协调参数与版式，不静默改成方形。

## 道具：正面、背面、尺寸参照三格

```
┌───────────┐   ┌───────────┐   ┌───────────┐
│   正面    │   │   背面    │   │ 尺寸参照  │
│           │   │ 旋转180度 │   │匿名手或人 │
└───────────┘   └───────────┘   └───────────┘
      生产参数横版画幅 · 三格等宽 · 白底间隔
```

一整张横图，白色背景，三个等宽的格子，格间留明显的白底间隔，每格内容不越界。

- **左格：正面**，道具主体居中、完整入画。
- **中格：背面**，同一件道具沿竖轴旋转 180 度，背面正对镜头，主体居中、完整入画。背面结构与细节必须明确描述，不改成侧面或斜上方。
- **右格：尺寸参照**，让人一眼看出它多大。按长边分三档，对应 `scale` 枚举：
  - **手持级**（长边 30 厘米以内）：一只通用的成年人的手捧着它的手部特写，手只露到手腕，道具占这一格的主体；
  - **桌面级**（长边超过 30 厘米且不超过 60 厘米）：一个穿素色衣服的普通人胸口以下双手持握它，画面上沿在锁骨以下；
  - **家具级**（长边超过 60 厘米）：一个穿素色衣服的普通人以背影或侧影站在它旁边或使用它。人物从头到脚完整入画，保持人体与道具的实际比例，不露脸。
- 右格里的手或人**只作尺寸参照，不是剧中任何角色（主角也不是）**：不写角色名，不照任何人物的长相或服装写，不露脸。提示词里写明「此人 / 这只手仅作尺寸参照，不是剧中角色，人物与道具比例真实」，否则视频模型会把这只手、这个人当成这一段里的人物。
- 三格里是同一件道具、同一比例；除右格那只手或那个人之外不出现人物，没有场景背景，纯白背景可抠图；画面不含任何文字和品牌标识。

**版式固定句**（放最前，只填画幅、右格档位与实际尺寸；prop-white、prop-scale、prop-size-ref 检查其中的白底、尺度短语和匿名尺寸参照，其他视觉要求另行复核）：

```text
One <画幅> landscape canvas: three equal panels side by side on a plain white background with clear white gaps, each item kept inside its own panel. Left panel: the front of the object, centered and complete. Middle panel: the back of the same object rotated 180 degrees around its vertical axis, with its back facing the camera, centered and complete. Right panel: <右格那一档>; the hand or person is an anonymous generic bystander used only as a size reference, not a character in the story, with no visible face and true-to-scale proportions between the person and the object; actual size about <长 × 宽 × 高，带单位>. The same object at the same scale in all three panels; no people except the size-reference hand or person in the right panel, no scene background; no text, no lettering and no logos anywhere in the image.
```

道具设定图使用 production 指定的横版画幅；制作参数不是横版时先协调参数与版式，不静默改画幅。

右格三档（下列英文可直接填入模板；prop-scale 门分别检查 `a generic adult hand holding it`、`holding it with both hands, framed from the chest down`、`standing next to it or using it`）：

| scale | 长边 | 英文 |
| --- | --- | --- |
| 手持级 | 30 厘米以内 | `a close-up of a generic adult hand holding it, the hand visible only up to the wrist, the object filling most of the panel` |
| 桌面级 | 超过 30 厘米且不超过 60 厘米 | `an ordinary person in plain clothes holding it with both hands, framed from the chest down, with the upper frame edge below the collarbones` |
| 家具级 | 超过 60 厘米 | `an ordinary person in plain clothes seen from behind or in a side silhouette with the face hidden, standing next to it or using it, visible in full from head to toe, with true-to-scale proportions between the person and the object` |

道具的光写 `soft even frontal studio lighting`，物件上没有明显的阴影和色光。

**反向词不禁手、不禁人**：右格本来就要画手或人，反向词里写 `hands`、`people` 会和版式自相矛盾（prop-size-ref 门查）。道具的反向词包含 `text, letters, watermark, logo, brand name, signature`，文件、证件、包装、屏幕也不使用带字例外。

## 三条硬要求

1. **场景空景无人。**版式固定句里的 `No people anywhere in the image` 必须在，场景反向提示词禁人（no-people 门查）。生成图里出现一个人影就重生成——环境资产里的人洗不掉。
2. **一张图里只能有一个空间、一件东西。**场景的大全景和平面图要对得上：锚点、功能性元素的位置、朝向、数量一致，按各自观察角度呈现可见内容。道具三格是同一件、同一比例。拿到图先按锚点核对。
3. **透视要稳。**环境图最常见的废图是几何融化、透视歪斜。空间默认方正（见 [scene-pass.md](scene-pass.md)），反向提示词里 `warped perspective, melted geometry` 从 production 的画风正文读取。

## 变体的提示词

- **场景变体**：`variantOf` 进入计划的参考依赖；ly-image 必须先完成母场景，再绑定其成图作为参考。沿用左侧单张广角大全景、右侧正交平面图的版式，整张重出。左侧呈现新的天色、光影锁或空间状态，右侧呈现当前版本的空间布局：布局相同则沿用原平面图的方向和结构，布局变化则同步更新相应位置。按 [sheet-prompt.md](sheet-prompt.md) 第三节四块写，点名保持建筑结构、未变的空间布局、基准图的机位、取景方向和视野，以及当前状态中仍保持的家具与关键物件的位置和数量；不重写未变陈设。只写新的光影锁（主光源、方位、色温、亮处、暗处、明暗差和阴影）与剧本写了的空间状态（天气、现场效果、破损、陈设）。
- **道具变体**：`states[0]` 是基准设定图画的那个状态；`states[1]` 及以后各写一条完整的英文变体提示词（四块写法），计划为它们导出依赖基准图的任务。整张重出，三格里的道具都换成同一个新状态。点名保持三格版式、主体结构、材质、形状、比例、颜色、右格的手或人的姿态与取景，不重描保持项；只写变了的状态：破损、燃烧、浸湿、磨损、碎裂、打开、带血的具体样子。

## 文件名

新登记资产通过固定 imageStem（默认稳定 ID）落到 `./images/<imageStem>-sheet.png`；显式 sheetImage 优先。道具状态变体落到 `./images/<imageStem>-state<序号>-sheet.png`，序号从 2 开始，对应 `states` 的第几个；任务 ID 是 `<道具 ID>.s<序号>`（如 `P01.s2`），可传给 `--only`。`render` 按同一个算法找图。

## 道具的透明底

白底出图之后，可另交 ly-image 执行透明底编辑；先查实时模型、参数和价格。抠图只取左格正面。核验后放到 optionalCutoutOutput，保留原白底主图；render 仍读取 sheetImage 或固定 imageStem 对应的主图。

## 画风一致性

同一部剧的所有场景应该像同一个美术组画的。压不住的话，把第一个主场景的成图当风格参考喂给后面的场景。代价是第一张定基调，出得不好就得重来。

## 创作与制作参数分离

创作要求不替代技术参数。出图仍必须提供 production 的完整视觉正文、模型、分辨率和资产画幅，不能由 creativeBrief 或 CLI 默认值代替。缺制作参数时生成任务报错。参考依赖与目标路径由计划保留；生成、上传及透明底编辑交给外部工具。

---

**学习来源**：场景单张广角大全景加正交平面图、变体按当前布局同步更新的要求内化自短剧资产图片提示词 skill（assets）最新版《场景》；道具三格与尺寸参照内化自《道具》《模型-midjourney》版式短语。
