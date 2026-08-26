# 角色设定图 · 版面与提示词

出图走 **lingying**（灵影网关）。**调用不用你写**——提交、轮询、落盘、续传全在
`scripts/lib/lingying.mjs` 里，一条命令跑完：

```bash
cd <段目录>            # <段目录> = <工作目录>/characters/
node <baseDir>/scripts/novel-characters.mjs images <书名>-cast.json
```

| 选项 | 作用 |
| --- | --- |
| `--dry-run` | 只打印将要提交的参数，不提交。参数存疑先跑这个 |
| `--only 老周,沈知微` | 只出这几个（风格参考的基准角色会自动跟着出） |
| `--force` | 已有产物也重出。默认跳过已经出好的 |
| `--cutout` | 白底图再走一次抠图，另存 `-cutout.png` |
| `--style-ref auto` | 拿第一个角色的成图当风格参考喂给其余角色，压画风漂移。也可以指名某个角色 |
| `--images <dir>` | 图片目录名，默认 `images`（跟 `render` 是同一个参数） |
| `--timeout <秒>` | 单张总超时，默认 300 秒 |
| `--concurrency <n>` | 同时在跑的任务数，默认 4 |

**没有 lingying 就整步跳过**，只交提示词，其余产出照常。这是可选能力，不是硬依赖——
命令会明说跳过原因，不静默。

**这一步以前是一段可以复制的 bash，那是错的分工。** 写提示词是模型的活，把提示词
提交给网关、等它跑完、把图存下来是代码的活——判据是「换个模型跑会不会得到不同
结果」。会，交给模型；不会，交给代码。

## 命令替你保证的七件事

以前这七件靠模型每次重新拼一遍 bash，于是同一个接口有无数种拼错的方式：

1. **参数不经过 shell**——`execFile` 收数组，提示词里的引号、换行、`$`、反引号、
   中文原样抵达。`--input_data` 由 `JSON.stringify` 生成，手拼字符串炸掉的那一类
   故障不存在了
2. **只读 `data.status`**——响应里的 `"message": "success"` 恒为 success，在整段
   JSON 里搜 `success` 第一次轮询就假命中，拿到一个还没有 `result.url` 的任务；
   未完成时退出码也仍然是 0。读不到 `data.status` 直接报错，不猜
3. **超时是有限的**——单张到点标记 timeout 继续下一张，不阻断整批；退避从 3 秒
   逐步拉开到 15 秒封顶，不是固定空转。单张图大约 20~40 秒
4. **产物即状态**——已有非空产物就跳过，先写 `.part` 再改名，半截文件不会被当成
   成品。30 个角色重来一次只补缺的，不重复花钱
5. **断点续传**——提交成功立刻把 task_id 写进 `images/.tasks.json`，中断后重跑接着
   轮询那些任务，不重复提交。图落地这条就消掉，产物本身才是完成的凭据
6. **一批提交再统一轮询**——10 个角色串行是 10 × 30 秒，并发提交后总耗时约等于最慢
   的那一个。**这里的「并发」是提交不等待，跟有没有子代理无关**，pi 照样这么做
7. **提交之前失败**——提示词空着、`--style-ref` 指错了人、两个角色算出同一个文件名、
   凭证缺失，全部在花钱之前一次说完

失败不阻断批次，但**最后有失败就 exit 1**——重跑会跳过已有产物，成本很低。
stdout 是一行 JSON 汇总（`summary` + 逐条 `results`），进度与错误走 stderr。

**不按 `importance` 筛，选中的角色全都出。** 一个角色一次调用，30 个就是 30 次——
这是整条管线里最慢的一步，命令开跑前会打印要出多少张。用户想省就用 `--only`。

## 出图参数从 production.json 来

命令自己从段目录**向上最多 5 层**找 `production.json`（`novel-setup` 的产出）：
`image.model` 定模型，`image.asset.resolution` 定分辨率**档位**，`image.asset.aspectRatio`
定版面画幅。这三个值原样进 `--input_data`，**不折算像素、提示词里也不写像素**——
lingying 的 `resolution` 与 `aspect_ratio` 是 `input_schema` 里的枚举字段（`1K` / `2K` /
`4K`、`16:9` / `9:16` / …），是结构化字段，不是提示词的一部分。它们已经被 `novel-setup`
的能力表校验过一遍，这里不维护第二份枚举表。

找不到 `production.json` 就按 `nanobanana2` + `2K` + `16:9` 出，命令会警告，汇报里要
说清。提交报 `input validation failed` 时错误信息会指向 `novel-setup caps --model <名>`。

`negative_prompt` 是 `input_schema` 里的一等字段，`cast.json` 里的反向提示词由命令
原样填进去，**不要再往正向提示词里塞「no …」**。两个生图模型都收这个字段。

---

以下是**你要写的部分**：版面与提示词。它们落在 `cast.json` 的 `image.sheet`
（设定图版面指令）与 `image.negativePrompt`（反向词）里，命令直接拿去提交。

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
same expression`。拿到图先扫一眼两边是不是同一个人，不是就 `--force` 重出。

## 画风一致性 ⚠️ 已知短板

同一批角色各自独立出图，**画风可能有差异**。早期用「扁平矢量卡通」时漂得很厉害——同一
批出成动画感／半写实／水墨写实三种，摆在一起不像同一部片子。换成明确的风格预设（见
`style-presets.md`）后好了很多，但不能保证完全一致。

想压住就加 `--style-ref auto`：命令先出第一个角色，等它落盘后 `upload` 成 URL，把这张
图当参考图挂给其余角色，并在提示词后追加一句

> Match the art style, line weight, shading and colour treatment of the reference
> image exactly — these characters must belong to the same production.

`upload` 按内容去重，同一张参考图不重复传输。**代价是第一张的画风就定了全片基调，出得
不好就得重来**——用户在意统一性就开，只要几张草图就不必。指名某个角色当基准也行
（`--style-ref 沈知微`）。

## 想要真透明背景

lingying 的两个生图模型都不出透明底，但网关上有现成的抠图模型：加 `--cutout` 就会在
白底成图之上再走一次 `birefnet`（免费，另一档「抠图」是 0.06 元一张）。**白底出图 + 抠图**
这条路比让生图模型直接出透明底稳，也不用本地装 Python。抠完的图另存
`<slug>-sheet-cutout.png`，`render` 找的仍然是 `<slug>-sheet.png`——主产物不动。

## 其他约束

- **提示词里不写调用指令**。`image.sheet` 是纯粹的图像描述，「copy to …」「reply with
  only the file path」这类给 agent 看的话一句都不要进去——落盘是命令的事
- **不要逐张打开**生成的 PNG 看——只看最终 report.html
- 网关报的错命令会如实转述，不要改写成「大概是网络问题」

## 文件名

产物路径由 `slug`（中文会保留）算出，`images` 与 `render` 用的是**同一个函数**——
所以两边永远对得上。`render` 会自动去 `images/<slug>-sheet.png` 找图，找到就嵌进
report.html，**先出图再 render**。
