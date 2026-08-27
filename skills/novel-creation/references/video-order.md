# 下单生视频 · videos 命令

`export` 出的投产包（每段一个文件夹的 `prompt.md` + 根部 `manifest.json`）**就是下单的全部材料**。这一步交给 `videos` 命令——提交、轮询、落盘、断点续传全在代码里，不需要现拼 bash（`novel-storyboard` 现在还停留在这一层文档，`novel-creation` 是全新代码，直接照 `novel-art` / `novel-characters` 已经验证过的模式起步）。

**这是可选的最后一步**：没有 `lingying`、或者想拿投产包去别处下单，跳过即可，前面的产出照常。**剪辑合成不在这个 skill 里**，产出到每段一个 `video.mp4` 为止。

## 前置

`lingying` 安装在 PATH 里（或放在工作目录的 `bin/lingying`），`~/.config/lingying/config.json` 里有 `api_key` 与 `assethub_admin_token`（参考图要 `upload` 换 URL，所以后者是必需的）。没装或凭证不全，`videos` 命令整步跳过，输出 `{skipped: true, reason: [...]}`，不假装能下单。

## 参数从 manifest.json 来

`export` 已经把生产参数写进 `manifest.json` 顶层的 `video` 字段和每段 `prompt.md` 的头部，**下单时不用回头翻配置**：

```json
{
  "video": { "model": "MiniMax H3", "aspectRatio": "9:16", "resolution": "768p" },
  "segments": [ { "segment": "E01-01", "seconds": 7, "images": [ { "kind": "character", "ref": "C02", "name": "周亦", "path": "../characters/images/周亦-sheet.png", "role": "identity reference" } ] } ]
}
```

映射到 lingying 的 `--input_data`，`videos` 命令内部帮你做：

| manifest | lingying | 说明 |
| --- | --- | --- |
| `video.model` | `--model` | 取 `lingying model list` 的 ID 列 |
| `video.aspectRatio` | `aspect_ratio` | 与设定图比例一致——出这些图时 `novel-characters` / `novel-art` 有门盯着 |
| `video.resolution` | `resolution` | 档位就是 lingying 的枚举值，原样填 |
| `segments[].seconds` | `duration` | 折算成模型收的整数秒且落进区间，见下 |
| `segments[].images[].path` | `images` 数组 | 相对路径先本地读取、`upload` 换 URL，**顺序就是 Picture 序**，与 `prompt` 里的编号一一对应 |
| `prompt.md` 分隔线以下 | `prompt` | 视频提示词原样，一个字不改 |

`input_schema` 里除了这几个通用字段，有的模型还有**自己特有的配置参数**。它不在生产参数里——`novel-setup` 的能力表按那个参数的 default 值抄枚举，所以照表填的档位与比例，`videos` 命令不传它也提交得出去。

## duration 要折算 ⚠️

段秒数是按分镜秒数求和算出来的，可能不是模型要求的整数秒、也可能落在区间外。`videos` 命令内部用与 `novel-setup` 的 `clampDuration` 一致的规则（**本 skill 自带一份小表，不 import `novel-setup` 的代码**——只含 5 个视频模型的时长区间，改了这条要跟着 `novel-setup` 的 `VIDEO_MODELS` 同步）：

- **非整数向上取整**——宁可多出半秒，剪辑时裁掉，短了要补拍
- **短于模型下限按下限下单**，片尾多出的部分剪辑时裁掉
- **长于模型上限按上限下单**，但这说明这一段本该再拆一次，`videos` 的汇报里会点出来

## 这些步骤 videos 命令帮你做，你只需要……

1. **确认这一批的花费**：`videos` 不做交互式确认花费的阻断——按秒计费（H3 是 0.1 元每秒，seedance 0.25~3.13 元每秒），下单前你自己把这一批的总秒数和预估花费报给用户，不要让命令闷头提交一整批
2. **执行命令**：`node {baseDir}/scripts/novel-creation.mjs videos manifest.json [--only E01-01,E01-02] [--dry-run] [--force] [--timeout <秒>] [--concurrency <n>]`——参考图先整批去重上传（同一张设定图被十几段共用，只传一次），再一次性并发提交全部段，拿到 task_id 列表统一轮询，谁 success 谁落盘
3. **读汇报**：stdout 一行 JSON（成功/跳过/失败/超时计数），失败或超时的会点名段号与原因；**同一段连着失败两次就停下来问**，不要烧钱重试
4. **必要时重跑**：`videos` 会跳过已有产物（`--force` 覆盖）、接着轮询超时的任务（不重复提交也不重复花钱）——重跑本命令就够，不用手动清理

## 落盘位置

每段一个 `mp4`，跟这一段的 `prompt.md` 住在一起：

```
creation/
├── manifest.json
├── E01-01/
│   ├── prompt.md          ← 视频提示词
│   └── video.mp4          ← 下单产出
└── E01-02/…
```

`video.mp4` 与图像一样**建议不进版本控制**——它随时能按 `prompt.md` 重出，把段文件夹里的 `*.mp4` 加进工作目录的 `.gitignore` 就行。

## 失败与重试

- **单段失败不阻断**：跳过这一段，最后汇总说明哪些没出成、错误码是什么
- `input validation failed` 多半是 `resolution` 或 `aspect_ratio` 不在该模型的枚举里，跑 `novel-setup caps --model <名>` 对一眼
- 上游生成失败重提交一次通常就好；**同一段连着失败两次就停下来问**，不要烧钱重试
- 生成结果不满意**不改提示词就重提交没有意义**——回去检查这一段挂的参考图和提示词里的位置状态描述是否清楚，画面不对多半是这两处没锁住

## 边界

这个 skill 到**每段一个 mp4** 为止。拼接、转场、配乐、字幕——都是剪辑的活，不在这里。
