# 设定图出图（场景 + 道具）· lingying

出图走 **lingying**（灵影网关）CLI：`image create` 提交，`task get` 轮询，产物是 URL，自己 `curl` 落盘。**没有 lingying 就整步跳过**，只交提示词，其余产出照常。

## 前置：CLI 与凭证

`lingying` 安装在 PATH 里（或放在工作目录的 `bin/lingying`），`~/.config/lingying/config.json` 里有 `api_key`；挂参考图还要 `assethub_admin_token`。

```bash
find_lingying() {
  local c
  for c in "$(command -v lingying 2>/dev/null)" ./bin/lingying \
           "$HOME/.local/bin/lingying" /opt/homebrew/bin/lingying /usr/local/bin/lingying; do
    [ -n "$c" ] && [ -x "$c" ] && { echo "$c"; return; }
  done
}
LY=$(find_lingying)
```

`$LY` 为空就跳过出图。凭证缺失时如实转述报错，**不要静默跳过**。

## 出图参数从 production.json 来 ⚠️

出图之前先读工作目录根的 `production.json`（`novel-setup` 的产出，从输出目录**向上最多 5 层**找）：`image.model` 定模型，`image.asset.resolution` 定分辨率**档位**，`image.asset.aspectRatio` 定版面画幅。

**这三个值原样进 `--input_data`，不折算像素、提示词里也不写像素**——lingying 的 `resolution` 与 `aspect_ratio` 是 input_schema 里的枚举字段。一行拿到拼好的参数：

```bash
node <novel-setup>/scripts/novel-setup.mjs resolve --for art
```

它给出 `inputData`（形如 `{"aspect_ratio":"16:9","resolution":"2K"}`），补一个 `prompt` 就能提交。

**资产图的画幅和成片画幅是两件事**：成片拍竖屏，设定图仍然是横构图——L 形版面靠横向铺开，竖过来细节格会被压扁。`novel-setup` 有一道门专门盯着这条。

找不到 `production.json` 就按 `nanobanana2` + `2K` + `16:9` 出，并在汇报里说清没有找到。

## 每个场景、每件道具各一张图

### 场景

一张横构图（画幅按生产参数，默认 16:9），主视角大图 + **底部和右侧的 L 形细节边框**，细线分隔：

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

- **主区（左上，约 72% 宽 × 70% 高）**：主视角 = 这个场景的标准取景 + 第一个光照状态，这就是「这个场景长什么样」的唯一标准答案
- **右列 + 底行**：全部是**细节特写**——一致性锚点和关键材质的近景，右列 2 格、底行 3 格左右
- 每个细节格都必须是主视角那个空间的裁切放大，**不许出现主视角里没有的东西**——提示词里写死 `nothing invented that is not present in the master view`

### 道具

同一套 L 形版面，差别三处：**纯白背景**（每个面板都是，要抠图）、主视角是主状态的四分之三角度、底行放**其他状态 + 侧面正交视图**。全图**无人且无手**——拿着道具的手是最常见污染，出现就重生成。尺度短语（handheld scale 等）必须在提示词里，否则皮箱会被画成衣柜。

提示词字段 `image.sheet`，场景和道具都落到 `./images/<slug>-sheet.png`（`slug` 命令生成安全文件名）。

## 三条硬要求

1. **全图空景无人。**提示词里 `Absolutely no people anywhere` 必须在，反向提示词禁人必须在。生成图里出现一个人影就重生成——环境资产里的人洗不掉。
2. **一张图里只能有一个空间。**角色设定图最容易出「一张图两个长相」，环境图的对应崩法是**面板之间空间对不上**（左边六排坐板、右上变成四排）。提示词里写死 `THE SPACE MUST BE IDENTICAL ACROSS ALL PANELS`。拿到图先核对锚点：每个锚点在主视角里找得到吗？
3. **透视要稳。**环境图最常见的废图是几何融化、透视歪斜。反向提示词里 `warped perspective, melted geometry` 必须在（预设自带）。

## 调用三步（与 novel-characters 相同）

```bash
cd <输出目录> && mkdir -p images

# 1 提交 —— JSON 一律用工具拼，提示词里有引号换行中文，手拼必崩
TASK=$("$LY" image create --model "$MODEL" --json --input_data "$INPUT_JSON" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.task_id))')

# 2 轮询 —— 必须读 data.status
while :; do
  OUT=$("$LY" task get "$TASK" --json) || { echo "任务失败"; break; }
  ST=$(printf '%s' "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.status))')
  case "$ST" in success|failed) break;; esac
  sleep 3
done

# 3 落盘
URL=$(printf '%s' "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.result.url))')
curl -fsSL -o "./images/<slug>-sheet.png" "$URL"
```

⚠️ **必须读 `data.status`，不能在整段 JSON 里搜 `success`**——响应里 `"message": "success"` 恒为 success，粗糙的匹配第一次轮询就假命中。未完成时退出码也仍然是 0。

其余约定：

- **一批场景、一批道具可以并发提交**，拿到一串 task_id 再统一轮询，总耗时约等于最慢的那一张
- `negative_prompt` 是独立字段，`art.json` 里的反向提示词原样填进去，不要塞回正向提示词
- **提示词里不写调用指令**，落盘是 `curl` 的事
- 单个失败跳过不阻断，最后汇总说明哪些没出成、为什么
- `input validation failed` 多半是档位或比例不在该模型的枚举里，跑 `novel-setup caps --model <名>` 对一眼

## 变体场景的出图

`variantOf` 的场景**拿母场景的成图当参考图**：

```bash
REF=$("$LY" upload ./images/<母场景>-sheet.png)   # 生成接口只收 URL，不收本地路径
# 把 REF 放进 --input_data 的 images 数组
```

提示词 = 母场景主视角 + `changes` 的改动描述 + 一句 `keep the structure, materials and wear identical to the reference image`。这比从零生成一致得多——变体机制的意义就在这。

`upload` 按内容去重，同一张母场景图传第二次不重复传输，**URL 存下来整批复用**。

## 道具要真透明底

白底出图之后再走一次抠图任务，比让生图模型直接出透明底稳：

```bash
URL=$("$LY" upload ./images/<slug>-sheet.png)
"$LY" image create --model "birefnet" --input_data "{\"images\":[\"$URL\"]}" --json   # 免费；另一档是「抠图」0.06 元一张
```

轮询与落盘同上，**抠完的图另存一个文件名**——`render` 找的仍然是 `<slug>-sheet.png`。

## 画风一致性

同一部剧的所有场景应该像同一个美术组画的。压不住的话，拿第一个主场景的成图 `upload` 成 URL，当风格参考喂给后面的场景。代价与角色 skill 相同：第一张定基调，出得不好就得重来。
