# 角色设定图 · 版式与出图

本地 CLI 只导出出图计划；人物角色整理完成后，agent 立即接续独立安装的 **ly-image** 完成实际生成，再渲染报告。用户明确仅登记、仅提示词或暂不生图时除外。先阅读 [交接与恢复流程](media-handoff.md)。

```bash
node <baseDir>/scripts/mint-characters.mjs images <剧名>-cast.json --out image-plan.json
```

可使用 `--only` 选择任务，`--dry-run` 预览；默认同样不会生成。使用 `--style-ref auto|角色名` 添加风格参考依赖，`--images` 设置图片目录。
模型、档位和画幅来自显式 production.json，提示词来自 image.sheet 与 image.negativePrompt。缺完整制作参数时先补齐，不能使用隐式默认值。设定图画幅与视频画幅分别读取，不折算像素。实时 schema 由 ly-image 核对。

提示词的段落顺序、纯净画质段和「只写看得见的东西」见 [sheet-prompt.md](sheet-prompt.md)；群演见 [crowd.md](crowd.md)。以下是人物设定图的版式和必写内容；计划不等于图片。

## 一、版式

一整张横图（画幅读取 `production.image.asset.aspectRatio`），白色背景，分左右两块：

```
┌──────────────┬────────┬────────┬────────┐
│              │        │        │        │
│   正面脸部     │  正面   │  侧面   │  背面   │
│   特写        │（脖子   │（脖子   │（脖子   │
│ （全图唯一     │  以下） │  以下） │  以下） │
│   一张脸）     │        │        │        │
└──────────────┴────────┴────────┴────────┘
              白底，块与格之间留白
```

- **左边一块：这个人严格正面的面部特写**——脸部中轴线垂直居中、双眼等高、鼻梁正对镜头、视线看向镜头；不侧脸、不偏头、不低头仰头。脸要占足够大的画面，视频模型认人主要靠这块。
- **右边一块：三个等宽的竖格**——格与格之间、和左边一块之间都留出白底间隔；三格从左到右依次是这个人的正面、侧面、背面，每一格的上边缘都切在这个人的脖子中间、下边缘到脚底下方一点，像服装目录里裁掉头部的穿搭照，格里只看得到脖子以下的身体和衣服；三格同一比例、脚踩在同一条地线上，脚下不画投影。
- 整张图里只有左边这一张脸；画面不含任何文字和品牌标识。

**为什么右边三格不带头**：一张参考图里出现几张脸时，视频模型容易把脸认串。身份交给左边那一张大脸，身形、服装交给右边三格。

**侧面画哪一侧**：身上有单侧的可见特征（手表、手镯、手臂或腿上的伤和包扎、文身、单侧的包带、单肩磨损）时，侧面那一格画露出这些特征的那一侧，提示词里写明是这个人自己的哪一侧（`The side panel shows the person's own right side, where …`）；没有的不用写。只画一侧时，另一侧的东西视频模型只能猜，换镜头时容易左右跳。

**英文版式段**（`image.sheet` 第一段，validate 查 `strictly frontal close-up of the face` 和 `from the neck down` 两个短语，以及画幅与 production 一致）：

```
Layout requirements: one <aspectRatio> landscape canvas on a plain pure white background, divided into a left part and a right part. Left part: a strictly frontal close-up of the face, facial midline vertical and centered, both eyes level, the bridge of the nose pointing straight at the camera, eyes looking straight into the camera, head held level, the face large enough to fill most of the left part. Right part: three equal vertical panels of the same person seen from the neck down to the feet, front, side and back from left to right; the top edge of every panel cuts across the middle of the neck and the bottom edge sits just below the feet, like a cropped costume catalogue photo, so each panel shows only the body and clothes. The three panels share the same scale, the feet stand on one shared ground line, and there is no cast shadow under the feet. Clear white gaps separate the three panels from each other and from the left part. The only face in the whole image is the close-up in the left part. [单侧特征时补侧面那一句] The image contains no text and no logos.
```

方形画布把 `landscape` 换成 `square`。

## 二、必写内容

版式段之后依次写：年龄段、性别、人种标签；脸型、眉眼（含瞳色）、鼻、唇、肤色、可见的永久特征；发色、长度、发型、发质；身高档（可附约数）、肩宽与体型、体态；服装逐件写颜色、材质、款式，以及廓形、层次和看得见的工艺；鞋；一直戴着的配饰；整体气质一句；正面光固定句；画风句；纯净画质段。

- **中性体态**：站姿；常坐轮椅的写坐轮椅（右边三格都坐着）。不写剧情动作（伸手抓、前冲、发力）——设定图是身份档案，不是剧照；动作由分镜和视频处理。
- **中性表情**：放松、平静地看向镜头。气质使用眼神、站姿、穿着来表现，不写笑、哭、怒这类表情——设定图的表情会被视频模型带进每一个镜头。天生的面部特征（笑纹、眯缝眼）照写，它们不是表情。
- **摘得下的东西不画**：会被摘下、交出、拿走的挂件和手持物是道具，归 mint-art，不画进人物设定图；`image.prompt` 那张表现性插画可以带。
- 小角色、儿童只要出图，也使用同一个版式，不写成半身照、生活照、单头像。
- 身份锁的具体程度、辨识度要求见 [sheet-prompt.md](sheet-prompt.md)；写实档的皮肤、毛发、布料写法见 [realism.md](realism.md)。

## 三、生物与非人主体

`entityType: nonhuman` 的主体使用同一个版式：左边是它的正面头部特写，右边三格是它颈部以下的正面、侧面、背面。身体结构（几条腿、有没有尾巴、站姿是直立还是四足）照 `persona` 和原文写，四足动物的三格写成同一地线上的全身站姿。外形本来就不是人的，人种标签写种族名和性别（见 [glossary.md](glossary.md)）。

`entityType: unknown` 需要出图时同样使用这个版式；`group` 改用 [crowd.md](crowd.md) 的群像图。

## 四、未成年人物

年龄 17 岁及以下的人物，设定图里服装、身体、姿势与气质按下面写，因为未成年人保护是合规底线（[principles.md](principles.md) 第三节）：

1. **服装**：全身包裹的日常或正式装——校服、长袖衬衫配长裤、过膝连衣裙、毛衣、外套、小皮鞋或运动鞋。
2. **身体**：只写脸、头发和身高档（`primary-school height`），不写皮肤质感和身材部位。
3. **姿势与气质**：站姿或端正的坐姿，双手自然下垂；气质写天真、活泼、安静、懂事一类。
4. 剧情需要睡衣、泳装、湿透、洗澡、躺在床上这类状态时，不为未成年人物出这类图，在交付汇报里写明不出图和理由。

## 五、白底与透明底

设定图一律**纯白背景**：抠图干净、在深色报告里也能读。白底主图保留；透明底作为独立编辑任务交给 ly-image，查询当前模型、参数与价格，核验结果后放到计划 optionalCutoutOutput。本地命令不提供抠图选项，也不使用固定价格。

## 六、拿到图先核对

- **只有一张脸**：右边三格出现了头或脸，重新生成须在授权范围内。
- **正面**：左边的脸是不是严格正面、双眼等高、看向镜头。
- **比例**：三格是不是同一比例、脚踩同一条地线；身材比例正不正常。
- **侧面**：有单侧特征时，侧面那一格画的是不是写明的那一侧。
- **光**：脸和衣服上有没有明显阴影和色光。
- 无法查看图片时明确说明未做视觉验收；网关报的错如实转述，不改写成「大概是网络问题」。

## 七、画风一致性 ⚠️ 已知短板

同一批角色各自独立出图，画风可能有差异。把 production 里那一块画风整块原样写进每张提示词（见 [style.md](style.md)）后好了很多，但不能保证完全一致。

使用 `--style-ref auto`：计划先列基准角色，再列依赖角色，并补充风格匹配提示词。ly-image 先完成并核验基准图，再将其作为后续任务参考。也可使用 `--style-ref 角色名` 指定基准。第一张决定整体基调；计划排序不是生成成功证明。

## 八、其他约束

- **提示词里不写调用指令**。`image.sheet` 是纯粹的图像描述，「copy to …」「reply with only the file path」这类给 agent 看的话一句都不要进去——落盘是命令的事。
- 产物路径使用稳定 C ID：`images/<C ID>-sheet.png`，`images` 计划与 `render` 找图使用同一规则，改名或新增同名人物都不会漂移。`render` 找到图片就嵌进 cast-report.html，**先出图再 render**。
- 创作要求不替代技术参数。出图仍必须提供 production 的完整视觉正文、模型、分辨率和资产画幅，不能由 creativeBrief 或 CLI 默认值代替。参考依赖与目标路径由计划保留；生成、上传及透明底编辑交给外部工具。

---

**学习来源**：版式、侧面选择、未成年人规则内化自短剧资产图片提示词 skill（assets）的《人物》第四、五节和《模型-midjourney》的人物版式短语。
