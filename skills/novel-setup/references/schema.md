# production.json 结构

一部剧一份，住在**工作目录根**——五个 skill 各自的段目录都在它下面，下游从自己的段目录**向上**找它（最多 5 层）。

```json
{
  "source": "回南天",
  "style": "realistic",
  "lang": "zh",
  "promptLang": "en",
  "image": {
    "model": "nanobanana2",
    "asset": { "resolution": "2K", "aspectRatio": "16:9" },
    "frame": { "resolution": "2K", "aspectRatio": "9:16" }
  },
  "video": {
    "model": "MiniMax H3",
    "aspectRatio": "9:16",
    "resolution": "768p"
  }
}
```

出图与生视频都走 **lingying**（灵影网关）CLI。`resolution` 与 `aspectRatio` **就是它 `input_schema` 里的枚举值**——`1K` / `2K` / `4K`、`768p`、`16:9` / `9:16` ……原样填进 `--input_data` 即可，**不折算像素，提示词里也不写像素**。

## 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `source` | string | 剧名，可选。只用来在参数表里显示 |
| `style` | enum | 画风：`realistic` 真人实拍 / `ghibli` 吉卜力。**与 novel-characters / novel-art / novel-storyboard 的画风预设同名对齐** |
| `lang` | enum | 报告界面语言 `zh` / `en`。五个 skill 的 `render --lang` 缺省时跟它 |
| `promptLang` | enum | H3 视频提示词语言 `zh` / `en`。默认 `en`——官方规范口径 |
| `image.model` | string | 生图模型，取 `lingying model list --model_type image` 的 ID 列。内置能力表里有的查枚举，没有的明说跳过 |
| `image.asset.resolution` | string | **资产图分辨率档位**：`1K` / `2K` / `4K`。角色设定图、场景设定图、道具设定图共用 |
| `image.asset.aspectRatio` | string | **资产图比例**：`W:H`。**必须是横构图或方形** |
| `image.frame.resolution` | string | **分镜图分辨率档位** |
| `image.frame.aspectRatio` | string | **分镜图比例**：`W:H`。**必须等于 `video.aspectRatio`** |
| `video.model` | string | 生视频模型，取 `lingying model list --model_type video` 的 ID 列 |
| `video.aspectRatio` | string | **视频 aspect_ratio**：`W:H`。这就是成片画幅 |
| `video.resolution` | string | **视频 resolution 档位**。枚举**逐个模型不同**：`MiniMax H3` 是 `768p` / `2K`，seedance 全系是 `480p` / `720p`（`seedance2.0` 多一档 `1080p`） |

## adaptive 不能用 ⚠️

lingying 的视频模型都收 `aspect_ratio: "adaptive"`（按输入自动挑比例）。**本管线不能用它**：分镜图要按同一个比例整批出，比例交给模型临场挑，一集三四十格就对不上了。`aspect-format` 门直接把 `adaptive` 拦掉。

## 两个比例是两件事 ⚠️

最容易误解的一处：**资产图比例和成片画幅无关**。

- **资产图**（角色设定图、场景设定图、道具设定图）是给参考图与人眼看的**设定表**。角色设定图的三区版面、场景与道具设定图的 L 形版面都靠横向铺开，竖过来三视图会被压扁。所以资产图默认 `16:9`，成片拍竖屏也不改。
- **分镜图**是喂给视频模型的关键帧，**它就是成片的一格**。比例和 `video.aspectRatio` 差一点，参考图就会被裁切或拉伸，一整批分镜图白出。

`asset-landscape` 与 `frame-matches-video` 两道门分别管这两件事。

## 七道质量门

| 门 | 查什么 | 为什么是门 |
| --- | --- | --- |
| `fields` | 字段齐全、`style` / `lang` / `promptLang` 在枚举里 | 少一个字段，下游读到 `undefined` 会静默用回默认值 |
| `aspect-format` | 三个比例都是 `W:H` 写法 | 写成 `9-16` 下游解析不出来；`adaptive` 也在这里拦掉 |
| `frame-matches-video` | **分镜图比例 = 视频比例** | 不一致 = 整批分镜图被裁或被拉，白出 |
| `asset-landscape` | 资产图是横构图或方形 | 竖构图会把设定图的三视图压扁 |
| `resolution-filled` | 三处分辨率档位都已填 | 没填就等于没定 |
| `video-model` | 视频模型已填，`resolution` 与 `aspect_ratio` 在该模型的枚举里 | 档位写错要到提交那一刻才被网关拒绝，那时整集分镜图已经出完了 |
| `model-caps` | 资产图与分镜图的档位、比例都被生图模型收 | 同上。**`nanobanana2` 不收 `4:3`、`image-2` 的 `4K` 只收 `16:9` / `9:16`** —— 选错了整批出不来 |

## 能力表从哪来

以前这两张表一张只有 `gpt-image-2`、另一张**有意留空**，理由是「凭记忆编一张比不查更坏」。改走 lingying 之后依据有了——`model get` 会把 `input_schema` 原样打出来，本机可查：

```bash
lingying model list --model_type video          # 看网关上有什么
lingying model get 7809cb1a-4f09-40de-a9e9-dd3841016138   # 看某个模型收什么参数
```

所以表可以填，但**出处不许省**：`IMAGE_MODELS` / `VIDEO_MODELS` 里每一条都带 `source`（取数命令）和 `modelId`（UUID），过期了重新跑一次就能对账。自测里有断言盯着这两个字段。

**模型自己特有的配置参数不进 `production.json`。**有的模型除了通用的 `resolution` / `aspect_ratio` 还收一个只有它认识的字段，那个字段还会反过来决定前两者的枚举。这类参数属于下单那一层，`production.json` 只放跨 skill 共用的口径。能力表因此按 `input_schema` 里那个字段的 **default 值**抄——不传它时网关生效的就是这一套。`MiniMax H3` 的 `768p` / `2K` 就是这么来的。

一行看全表：

```bash
node scripts/novel-setup.mjs caps
```

**表里没有的模型不是错误**：`model-caps` 与 `video-model` 两道门明说跳过，其余门照常。用户确认了口径，往表里加一条就自动开始查。

## 单段时长

视频模型收的 `duration` 是**整数秒且有区间**：`MiniMax H3` 是 5~15，`seedance2.5` 是 4~30，seedance2.0 全系是 4~15。分镜的段秒数是按节拍算出来的，不一定是整数，也可能短于下限。折算规则写死在一处：

```bash
node scripts/novel-setup.mjs duration 12.5 --model "MiniMax H3"
# → { "duration": 13, "note": "12.5 秒向上取整到 13 秒" }
```

向上取整、夹进区间、动过就说清楚。下单细节见 `novel-storyboard/references/video-order.md`。
