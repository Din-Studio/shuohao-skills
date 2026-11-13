# 角色设定图 · 版面与提示词

本地 CLI 只导出出图计划；人物角色整理完成后，agent 立即接续独立安装的 **ly-image** 完成实际生成，再渲染报告。用户明确仅登记、仅提示词或暂不生图时除外。先阅读 [交接与恢复流程](media-handoff.md)。

```bash
node <baseDir>/scripts/mint-characters.mjs images <剧名>-cast.json --out image-plan.json
```

可使用 `--only` 选择任务，`--dry-run` 预览；默认同样不会生成。使用 `--style-ref auto|角色名` 添加风格参考依赖，`--images` 设置图片目录。
模型、档位和画幅来自显式 production.json，提示词来自 image.sheet 与 image.negativePrompt。缺完整制作参数时先补齐，不能使用隐式默认值。设定图画幅与视频画幅分别读取，不折算像素。实时 schema 由 ly-image 核对。

以下是版面和提示词的创作要求；计划不等于图片。

## 背景：白底

设定图一律**纯白背景**。理由有三个：抠图干净、印出来是设定表该有的样子、在深色报告里
也能读。`image.sheet` 里已经写死了 `plain pure white background`，不要改成灰底或场景背景。

### 分区光照

设定表要平光（抠图、量比例），写实要方向光（体积感）。两者矛盾，所以**分区解决**：
左栏半身像给柔和方向主光 + 环境遮蔽，右侧三视图和细节条保持平光正交。提示词里是两句
独立的 `LIGHTING IN THE LEFT ZONE ONLY` / `LIGHTING IN THE RIGHT ZONES`，不要合并成
一句全局光照。

### 比例 ⚠️

这个版面最容易崩的就是比例——模型为了把细节条塞进去，会把三个全身像压扁或拉长。
提示词里已经写死了 `PROPORTIONS ARE CRITICAL`、`no stretching, squashing or
foreshortening`、`the detail studies give way, not the figures`。**拿到图先量一眼三个
全身像是不是等高、头身比正不正常。**

### 左栏的收口 ⚠️

模型默认会把半身像的两侧肩膀裁掉、底边做成圆角或渐隐晕影，看着很别扭。提示词里必须
显式禁掉：肩膀完整、两侧留空、底边齐平直切。这条不写就一定会出问题。

### 面部一致性 ⚠️

一张图里出现两个长相是这个版面最容易出的问题——左栏画一个人、右栏画另一个人。提示词
里必须写死 `must match the bust portrait exactly — same features, same hairstyle,
same expression`。拿到图先扫一眼两边是不是同一个人，不一致时报告问题，重新生成须在授权范围内。

## 画风一致性 ⚠️ 已知短板

同一批角色各自独立出图，**画风可能有差异**。早期用「扁平矢量卡通」这种含糊的写法时漂得
很厉害——同一批出成动画感／半写实／水墨写实三种，摆在一起不像同一部片子。改成把
`production.json` 里那一块画风**整块原样抄进每张提示词**（见 `style.md`）后好了很多，
但不能保证完全一致。

使用 `--style-ref auto`：计划先列基准角色，再列依赖角色，并补充风格匹配提示词。ly-image 先完成并核验基准图，再将其作为后续任务参考。也可使用 `--style-ref 角色名` 指定基准。第一张决定整体基调；计划排序不是生成成功证明。

## 想要透明背景

白底主图保留。透明底作为独立编辑任务交给 ly-image，查询当前模型、参数与价格，核验结果后放到计划 optionalCutoutOutput。不要沿用旧 --cutout 命令或固定价格。

## 其他约束

- **提示词里不写调用指令**。`image.sheet` 是纯粹的图像描述，「copy to …」「reply with
  only the file path」这类给 agent 看的话一句都不要进去——落盘是命令的事
- 检查下载图片及最终报告；无法查看时明确说明未做视觉验收
- 网关报的错命令会如实转述，不要改写成「大概是网络问题」

## 文件名

产物路径由 `slug`（中文会保留）算出，`images` 与 `render` 用的是**同一个函数**——
所以两边永远对得上。`render` 会自动去 `images/<slug>-sheet.png` 找图，找到就嵌进
cast-report.html，**先出图再 render**。

## 创作与制作参数分离

创作要求不替代技术参数。出图仍必须提供 production 的完整视觉正文、模型、分辨率和资产画幅，不能由 creativeBrief 或 CLI 默认值代替。缺制作参数时生成任务报错。参考依赖与目标路径由计划保留；生成、上传及透明底编辑交给外部工具。
