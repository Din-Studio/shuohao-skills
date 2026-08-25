# 下单生视频 · lingying

`export` 出的投产包（每段一个文件夹：`f1..fN.png` + `prompt.md`，根部一份 `manifest.json`）**就是下单的全部材料**。这一步把它交给 **lingying**（灵影网关）的 `video create`。

**这是可选的最后一步**：没有 lingying、或者用户想拿投产包去别处下单，跳过即可，前面的产出照常。**剪辑合成不在这个 skill 里**，产出到每段一个 mp4 为止。

## 前置

`lingying` 安装在 PATH 里（或放在工作目录的 `bin/lingying`），`~/.config/lingying/config.json` 里有 `api_key` 与 `assethub_admin_token`（分镜图要 `upload` 换 URL，所以后者是必需的）。

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

## 参数从 manifest.json 来

`export` 已经把生产参数写进 `manifest.json` 顶层的 `video` 字段和每段 `prompt.md` 的头部，**下单时不用回头翻配置**：

```json
{
  "video": { "model": "MiniMax H3", "aspectRatio": "9:16", "resolution": "768p", "variant": "managed" },
  "segments": [ { "segment": "E01-01", "seconds": 15, "cuts": 5, "pictures": ["E01-01/f1.png", "…"] } ]
}
```

映射到 lingying 的 `--input_data`：

| manifest | lingying | 说明 |
| --- | --- | --- |
| `video.model` | `--model` | 取 `lingying model list` 的 ID 列 |
| `video.aspectRatio` | `aspect_ratio` | 与分镜图比例一致——`novel-setup` 有一道门盯着 |
| `video.resolution` | `resolution` | `MiniMax H3 · managed` 是 `768p` / `2K`，**不是 720p / 1080p** |
| `video.variant` | `metadata.h3_variant` | H3 的必填字段；seedance 全系没有这一项 |
| `segments[].seconds` | `duration` | 要折成整数秒，见下 |
| `segments[].pictures` | `images` | **顺序就是 Picture 序**，f1 在第一个 |
| `prompt.md` 分隔线以下 | `prompt` | H3 提示词原样，一个字不改 |

一行拿到拼好的参数（`duration` 除外，它逐段不同）：

```bash
node <novel-setup>/scripts/novel-setup.mjs resolve --for video
```

## duration 要折算 ⚠️

段秒数是按节拍算出来的，可能是 12 秒，也可能是 3 秒或 12.5 秒。**模型收的是整数秒且有区间**（`MiniMax H3` 是 5~15，`seedance2.5` 是 4~30，seedance2.0 全系是 4~15）。折算规则：

```bash
node <novel-setup>/scripts/novel-setup.mjs duration 12.5 --model "MiniMax H3"
# → { "duration": 13, "note": "12.5 秒向上取整到 13 秒" }
```

- **非整数向上取整**——宁可多出半秒，剪辑时裁掉，短了要补拍
- **短于下限按下限下单**，片尾多出的部分剪辑时裁掉
- **长于上限按上限下单**，但这说明这一段本该再拆一次，汇报里要点出来

`clampDuration` 把这三条写死在一处，免得每个下单脚本各折各的。

## 下单三步

```bash
SEG=E01-01
# 1 分镜图换成 URL —— 生成接口只收 URL，顺序就是 Picture 序
IMGS=$(for f in $SEG/f*.png; do "$LY" upload "$f"; done | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(s.trim().split("\n"))))')

# 2 提交 —— prompt 取 prompt.md 分隔线以下的原文
TASK=$("$LY" video create --model "$MODEL" --json --input_data "$INPUT_JSON" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.task_id))')

# 3 轮询 —— 视频要几分钟，间隔放到 10 秒
while :; do
  OUT=$("$LY" task get "$TASK" --json) || { echo "$SEG 生成失败"; break; }
  ST=$(printf '%s' "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.status))')
  case "$ST" in success|failed) break;; esac
  sleep 10
done
URL=$(printf '%s' "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.result.url))')
curl -fsSL -o "$SEG/video.mp4" "$URL"
```

`--input_data` 长成这样（JSON **一律用工具拼**，H3 提示词里有引号、换行和整段中文台词，手拼必崩）：

```json
{
  "prompt": "<prompt.md 分隔线以下的原文>",
  "aspect_ratio": "9:16",
  "resolution": "768p",
  "duration": 15,
  "images": ["https://…f1", "https://…f2"],
  "metadata": { "h3_variant": "managed" }
}
```

⚠️ **必须读 `data.status`**，不能在整段 JSON 里搜 `success`——响应里 `"message": "success"` 恒为 success。未完成时退出码也仍然是 0。

**一段大约三分钟**（实测 `MiniMax H3 · managed` 5 秒片用了 196 秒），比出图慢一个量级——所以轮询间隔写 10 秒，不是出图那边的 3 秒。产物带音轨，`768p` 档的 16:9 出来是 1344×768。

## 整集并发提交

一集十来段，串行是十几分钟起。**先把整集的 `upload` 做完**（同一张图内容去重，不重复传输），**再把所有段一次性 `video create` 提交**，拿到 task_id 列表统一轮询，谁 success 谁落盘。

按秒计费（H3 是 0.1 元每秒，seedance 0.25~3.13 元每秒），**下单前先把这一集的总秒数和预估花费报给用户**，不要闷头提交一整集。

## 落盘位置

每段一个 mp4，跟这一段的分镜图和提示词住在一起：

```
storyboard/
├── manifest.json
├── E01-01/
│   ├── f1.png … fN.png     ← 分镜图
│   ├── prompt.md           ← H3 提示词
│   └── video.mp4           ← 下单产出
└── E01-02/…
```

mp4 与 png 一样**建议不进版本控制**——它们随时能按 `prompt.md` 重出，把段文件夹里的 `*.png` / `*.mp4` 加进工作目录的 `.gitignore` 就行。

## 失败与重试

- **单段失败不阻断**：跳过这一段，最后汇总说明哪些没出成、错误码是什么
- `input validation failed` 多半是 `resolution` 或 `aspect_ratio` 不在该模型（该变体）的枚举里，跑 `novel-setup caps --model <名>` 对一眼
- 上游生成失败（`UPSTREAM_ERROR`）重提交一次通常就好；**同一段连着失败两次就停下来问**，不要烧钱重试
- 生成结果不满意**不改提示词就重提交没有意义**——H3 的对齐指令把每张图钉在固定时刻，画面不对多半是分镜图不对，回去重出那一格的图

## 边界

这个 skill 到**每段一个 mp4** 为止。拼接、转场、配乐、字幕、把 TTS 音频贴到对应段——都是剪辑的活，不在这里。配音对齐单（`render` 的产出）给的就是「哪句台词贴哪一段」的对照表。
