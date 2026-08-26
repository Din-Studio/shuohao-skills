# 分镜图出图 · lingying

出图走 **lingying**（灵影网关）CLI：`image create` 提交，`task get` 轮询，产物是 URL，自己 `curl` 落盘。**没有 lingying 就整步跳过**，只交提示词，报告显示「未生成」占位，其余产出照常。

## 前置：CLI 与凭证

`lingying` 安装在 PATH 里（或放在工作目录的 `bin/lingying`），`~/.config/lingying/config.json` 里有 `api_key` 与 `assethub_admin_token`——**分镜图一定要挂参考图，所以 assethub 的 token 是必需的，不是可选的**。

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

出图之前先读工作目录根的 `production.json`（`novel-setup` 的产出，从段目录**向上最多 5 层**找）：

| 字段 | 用在哪 |
| --- | --- |
| `image.model` | `--model` 传它 |
| `image.frame.resolution` | `--input_data` 的 `resolution`（`1K` / `2K` / `4K`） |
| `image.frame.aspectRatio` | `--input_data` 的 `aspect_ratio`——**就是成片画幅** |

**档位与比例是 lingying 的枚举字段，原样填进 `--input_data`，提示词里一个像素都不写。**一行拿到拼好的参数：

```bash
node <novel-setup>/scripts/novel-setup.mjs resolve --for storyboard
```

它给出 `inputData`，形如：

```json
{ "aspect_ratio": "9:16", "resolution": "2K" }
```

**这一步不是可选的。**分镜图是喂给视频模型的参考图，画幅和视频 `aspect_ratio` 差一点就会被裁切或拉伸——一集三四十格，错了是整批白出。`validate` 有一道 `frame-aspect` 门盯着提示词里的画幅，**但真正下给模型的比例只有出图这一步能带上**，门查不到。

找不到 `production.json` 就按 16:9 出，并在汇报里说清没有找到。

## 分镜图是什么

一个分镜一张成片画幅的关键帧（下面的示例按 16:9 写），**每段一个文件夹**：`<段号>/f<切序>.png`（f1 = 主分镜图），H3 提示词由 `export` 写成同文件夹里的 `prompt.md`（头部对照表明确 f1.png 是首帧、各图钉在第几秒）——整个文件夹就是一次视频生成的全部材料。第 1 切的是**主分镜图**（H3 对齐指令把它钉在 0.00 秒），其余是**子分镜图**（各钉在自己的切点时刻）——一段的每一格构图都由图控制，不靠文字赌。**它是资产合成，不是凭空画**：场景、角色、道具长什么样已经由上游设定图定死，分镜图只负责把它们按这一格的构图摆进同一帧。

## 参考图挂载（命根子）

lingying 的生成接口**只收 URL，不收本地路径**。所以每张设定图先 `upload` 换成 URL，再放进 `--input_data` 的 `images` 数组：

```bash
SCENE=$("$LY" upload ../art/images/<场景名>-sheet.png)
FACE=$("$LY" upload ../characters/images/<角色名>-sheet.png)
# images: [SCENE, FACE, …]
```

`upload` **按内容去重**：同一张场景设定图在整集三四十格里要挂几十次，第一次传完把 URL 存进一张表，后面直接复用，不重复传输。**建一张 `本地路径 → URL` 的映射表整集共用**，这是分镜出图最省时间的一件事。

每一格挂什么：

1. **场景设定图**——必挂，环境、材质、光的唯一标准
2. **画内每个角色的设定图**——有几个挂几个
3. **画内叙事道具的设定图**——有就挂
4. **链式参考**：某角色没有设定图时，先出他看得最清的那一格，之后所有带他的格都拿这张当身份参考（先 `upload` 换 URL，提示词明写 the SAME face, same clothes as this reference）——同集的脸不许换人。段的主分镜图也值得一直挂着，锁世界观和雾的浓度
5. **挂图按「画面里有什么」，不按「段属于哪个场」**：段在栈桥场，但画面里出现了渡船，就必须把渡船的设定图也挂上——不挂 = 每帧发明一条新船（踩过）。船、马车、宅门这类「会入画的大资产」都同理
6. **提示词必须写明人物此刻的位置状态**：已上船 / 在舱内 / 站在桥头——切镜时人物位置是连续的剧情状态，只写构图不写状态，模型会把上了船的人又画回岸上（踩过）

提示词开头明说每张参考图的用途（which is the environment / whose face to match / which prop to match），别让模型猜。**参考图的顺序就是提示词里引用的顺序**，写好了别打乱。

`nanobanana2` 与 `image-2` 都收 `images` 数组，`input_schema` 没写张数上限，但挂十几张之后模型会开始糊——**只挂这一格真正入画的**。

## 调用三步

```bash
cd <段目录> && mkdir -p "<段号>"   # <段目录> = <工作目录>/storyboard/，段文件夹与报告同级

# 1 提交 —— JSON 一律用工具拼；提示词里有引号换行中文，手拼必崩
TASK=$("$LY" image create --model "$MODEL" --json --input_data "$INPUT_JSON" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.task_id))')

# 2 轮询 —— 必须读 data.status
while :; do
  OUT=$("$LY" task get "$TASK" --json) || { echo "任务失败"; break; }
  ST=$(printf '%s' "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.status))')
  case "$ST" in success|failed) break;; esac
  sleep 3
done

# 3 落盘 —— 落到段文件夹，f1 是首帧
URL=$(printf '%s' "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.result.url))')
curl -fsSL -o "<段号>/f<切序>.png" "$URL"
```

⚠️ **必须读 `data.status`，不能在整段 JSON 里搜 `success`**——响应里 `"message": "success"` 恒为 success，粗糙的匹配第一次轮询就假命中，拿到一个还没有 `result.url` 的任务。未完成时退出码也仍然是 0。

## 一整段可以并发

一集三四十格串行是几十分钟。做法：**整段（或整集）的 `image create` 一次性全部提交**，拿到 task_id 列表，再统一轮询，谁 success 谁落盘。总耗时约等于最慢的那一格。

参考图的 `upload` 也一样——先把这一集要用到的设定图全部传完拿到 URL 表，再开始批量提交。

**这里的「并发」是提交不等待，跟有没有子代理无关**——pi 这种不带子代理的运行环境照样这么做。

## 其他约定

- 提示词末尾固定加：`No text, no watermark, no borders — a single clean full-bleed frame.`（分镜图是干净的一帧，不是设定图，不要格子边框）
- **提示词里不写调用指令**，也不写像素——落盘是 `curl` 的事，尺寸是 `--input_data` 的事
- `negative_prompt` 是独立字段，反向提示词填在那里
- 单个失败跳过不阻断，最后汇总说明哪些没出成、为什么
- `input validation failed` 多半是档位或比例不在该模型的枚举里，跑 `novel-setup caps --model <名>` 对一眼——**尤其注意 `image-2` 的 4K 只收 16:9 / 9:16**
