# 角色设定图出图 · lingying

出图走 **lingying**（灵影网关）CLI：`image create` 提交任务，`task get` 轮询，产物是一个 URL，自己 `curl` 落盘。

**没有 lingying 就跳过整个第 8 步**，只交提示词，其余产出照常。这是可选能力，不是硬依赖。

## 前置：CLI 与凭证

| 要什么 | 说明 |
| --- | --- |
| `lingying` 可执行文件 | 安装在 PATH 里，或放在工作目录的 `bin/lingying` |
| `~/.config/lingying/config.json` | 至少要有 `api_key`；挂参考图还要 `assethub_admin_token` |

```bash
find_lingying() {
  local c
  # command -v 放第一个：尊重用户的 PATH；后面几个是常见安装位置兜底
  for c in "$(command -v lingying 2>/dev/null)" \
           ./bin/lingying \
           "$HOME/.local/bin/lingying" \
           /opt/homebrew/bin/lingying \
           /usr/local/bin/lingying; do
    [ -n "$c" ] && [ -x "$c" ] && { echo "$c"; return; }
  done
}
LY=$(find_lingying)
```

`$LY` 为空就跳过出图。凭证缺失时 `lingying` 报的是「缺少 API_KEY」，如实转述，**不要静默跳过**——用户以为出了图而实际没出，比明说没出更坏。

## 出图参数从 production.json 来 ⚠️

出图之前先读工作目录根的 `production.json`（`novel-setup` 的产出，从输出目录**向上最多 5 层**找）：`image.model` 定模型，`image.asset.resolution` 定分辨率**档位**，`image.asset.aspectRatio` 定版面画幅。

**这三个值原样填进 `--input_data`，不折算像素、提示词里也不写像素。**lingying 的 `resolution` 与 `aspect_ratio` 就是 input_schema 里的枚举值（`1K` / `2K` / `4K`、`16:9` / `9:16` / …），是结构化字段，不是提示词的一部分。

一行拿到拼好的参数：

```bash
node <novel-setup>/scripts/novel-setup.mjs resolve --for characters
```

它给出 `inputData`（形如 `{"aspect_ratio":"16:9","resolution":"2K"}`）——补一个 `prompt` 就能提交。

找不到 `production.json` 就按 `nanobanana2` + `2K` + `16:9` 出，并在汇报里说清没有找到。

## 调用三步

### 1 提交

```bash
cd <输出目录> && mkdir -p images

# P = image.sheet 的内容，原样，不要加任何「copy to …」之类的指令
INPUT=$(node -e '
  const [p, a, r, n] = process.argv.slice(1);
  console.log(JSON.stringify({ prompt: p, aspect_ratio: a, resolution: r, negative_prompt: n }));
' "$P" "$ASPECT" "$RES" "$NEG")

TASK=$("$LY" image create --model "$MODEL" --json --input_data "$INPUT" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.task_id))')
```

**JSON 一律用工具拼，不要手写字符串拼接**——提示词里有引号、换行和中文，手拼必崩。提示词长的时候也可以写成文件再 `--input_data ./input.json`（以 `{` 开头才按内联 JSON 解析，否则按文件路径读）。

### 2 轮询

```bash
while :; do
  OUT=$("$LY" task get "$TASK" --json) || { echo "任务失败"; break; }   # 退出码 1 = 任务失败
  ST=$(printf '%s' "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.status))')
  case "$ST" in success|failed) break;; esac
  sleep 3
done
```

⚠️ **必须读 `data.status`，不能在整段 JSON 里搜 `success`**——响应里 `"message": "success"` 恒为 success，粗糙的匹配第一次轮询就会假命中，拿到一个还没有 `result.url` 的任务。

⚠️ **未完成时退出码仍是 0**，只看退出码判断不了结束。

单张图大约 20~40 秒。

### 3 落盘

```bash
URL=$(printf '%s' "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.result.url))')
curl -fsSL -o "./images/<slug>-sheet.png" "$URL"
```

产物 URL 是网关的临时地址，**必须落到项目里**——只留 URL 等于没有资产。

## 一批角色可以并发

lingying 的任务是异步的：**先把这一批角色全部 `image create` 提交，拿到一串 task_id，再统一轮询**。10 个角色串行是 10 × 30 秒，并发提交后总耗时约等于最慢的那一个。

轮询时逐个 `task get`，谁 success 就立刻落盘，不用等齐。

## 反向提示词是独立字段

`negative_prompt` 是 input_schema 里的一等字段，`cast.json` 里的反向提示词**原样填进去**，不要再往正向提示词里塞「no …」。两个生图模型都收这个字段。

## 画风一致性 ⚠️ 已知短板

同一批角色各自独立出图，**画风可能有差异**。早期用「扁平矢量卡通」时漂得很厉害——同一批出成动画感／半写实／水墨写实三种，摆在一起不像同一部片子。换成明确的风格预设（见 `style-presets.md`）后好了很多，但不能保证完全一致。

想压住的话，把**第一个角色的成图当风格参考**喂给后面几个：

```bash
# 本地文件先换成 URL——生成接口只收 URL，不收本地路径
REF=$("$LY" upload ./images/<第一个角色>-sheet.png)
# 然后把 REF 放进 images 数组，提示词里补一句
#   Match the art style, line weight, shading and colour treatment of the
#   reference image exactly — these characters must belong to the same production.
```

`upload` 按内容去重，同一张参考图传第二次不重复传输，**URL 存下来整批复用**即可。

代价是第一张的画风就定了全片基调，出得不好就得重来。用户在意统一性就上参考图，只是要几张草图就不必。

## 背景：白底

设定图一律**纯白背景**。理由有三个：抠图干净、印出来是设定表该有的样子、在深色报告里也能读。

### 分区光照

设定表要平光（抠图、量比例），写实要方向光（体积感）。两者矛盾，所以**分区解决**：左栏半身像给柔和方向主光 + 环境遮蔽，右侧三视图和细节条保持平光正交。提示词里是两句独立的 `LIGHTING IN THE LEFT ZONE ONLY` / `LIGHTING IN THE RIGHT ZONES`，不要合并成一句全局光照。

### 比例 ⚠️

这个版面最容易崩的就是比例——模型为了把细节条塞进去，会把三个全身像压扁或拉长。提示词里已经写死了 `PROPORTIONS ARE CRITICAL`、`no stretching, squashing or foreshortening`、`the detail studies give way, not the figures`。**拿到图先量一眼三个全身像是不是等高、头身比正不正常。**

### 左栏的收口 ⚠️

模型默认会把半身像的两侧肩膀裁掉、底边做成圆角或渐隐晕影，看着很别扭。提示词里必须显式禁掉：肩膀完整、两侧留空、底边齐平直切。这条不写就一定会出问题。

### 面部一致性 ⚠️

一张图里出现两个长相是这个版面最容易出的问题——左栏画一个人、右栏画另一个人。提示词里必须写死 `must match the bust portrait exactly — same features, same hairstyle, same expression`。拿到图先扫一眼两边是不是同一个人，不是就重生成。`image.sheet` 的提示词里已经写死了 `plain pure white background`，不要改成灰底或场景背景。

### 想要真透明背景

lingying 的两个生图模型都不出透明底，但网关上有现成的抠图模型，**再走一次任务就行**：

```bash
URL=$("$LY" upload ./images/<slug>-sheet.png)
TASK=$("$LY" image create --model "birefnet" --input_data "{\"images\":[\"$URL\"]}" --json | …取 task_id)
# 轮询同上，落盘成 <slug>-sheet-cutout.png
```

`birefnet` 免费，`抠图` 是 0.06 元一张的另一档。**白底出图 + 抠图**这条路比让生图模型直接出透明底稳，也不用本地装 Python。用户明确要透明就多跑这一步，别自己决定改动主产物——**抠完的图另存一个文件名**，`render` 找的仍然是 `<slug>-sheet.png`。

## 其他约束

- **提示词里不写调用指令**。`image.sheet` 是纯粹的图像描述，「copy to …」「reply with only the file path」这类给 agent 看的话一句都不要进去——落盘是 `curl` 的事
- **不要逐张打开** 生成的 PNG 看——只看最终 report.html
- 出图失败**不阻断**整个流程：跳过这个角色，最后汇总说明哪些没出成、为什么
- 网关报的错如实转述（`input validation failed` 多半是档位或比例不在该模型的枚举里，跑 `novel-setup caps --model <名>` 对一眼）

## 文件名

用 `node scripts/novel-characters.mjs slug "<角色名>"` 生成安全文件名（中文会保留）。`render` 会自动去 `images/<slug>-sheet.png` 找图，找到就嵌进 report.html——所以**先出图，再 render**。
