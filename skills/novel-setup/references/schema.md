# production.json 结构

一部剧一份，住在**工作目录根**——五个 skill 各自的段目录都在它下面，下游从自己的段目录**向上**找它（最多 5 层）。

```json
{
  "source": "回南天",
  "autopilot": false,
  "style": {
    "label": { "zh": "真人实拍", "en": "Photorealistic live-action" },
    "phrase": "cinematic film still",
    "character": { "render": "…", "surface": "…", "lighting": "…", "negative": "…", "tags": ["…"] },
    "scene": { "render": "…", "surface": "…", "negative": "…", "tags": ["…"] }
  },
  "lang": "zh",
  "promptLang": "en",
  "image": {
    "model": "nanobanana2",
    "asset": { "resolution": "2K", "aspectRatio": "16:9" }
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
| `autopilot` | bool | **自动驾驶**，默认 `false`。为 `true` 时下游五个 skill 各自把自己那一段一口气跑完：不提问、不等拍板、该做的决定自己做。详见下面一节 |
| `style` | object | **画风本身**，由用户在这一段填。没有内置类型，没有默认值。下面单开一节 |
| `lang` | enum | 报告界面语言 `zh` / `en`。五个 skill 的 `render --lang` 缺省时跟它 |
| `promptLang` | enum | 视频提示词语言 `zh` / `en`。默认 `en`——官方规范口径 |
| `image.model` | string | 生图模型，取 `lingying model list --model_type image` 的 ID 列。内置能力表里有的查枚举，没有的明说跳过 |
| `image.asset.resolution` | string | **资产图分辨率档位**：`1K` / `2K` / `4K`。角色设定图、场景设定图、道具设定图共用 |
| `image.asset.aspectRatio` | string | **资产图比例**：`W:H`。**必须是横构图或方形** |
| `video.model` | string | 生视频模型，取 `lingying model list --model_type video` 的 ID 列 |
| `video.aspectRatio` | string | **视频 aspect_ratio**：`W:H`。这就是成片画幅 |
| `video.resolution` | string | **视频 resolution 档位**。枚举**逐个模型不同**：`MiniMax H3` 是 `768p` / `2K`，seedance 全系是 `480p` / `720p`（`seedance2.0` 多一档 `1080p`） |

## style：画风没有内置类型 ⚠️

以前这个字段是个两档枚举（`realistic` / `ghibli`），正文分别写死在三个出图 skill 的代码里。那样有两个问题：想拍水墨、拍黏土定格、拍胶片颗粒的年代戏只能改代码；而且同一档画风的正文存了三份，改一处漏两处。

**现在画风就是这个字段本身**，一部剧一套，在这一段填。跑 `style-template` 拿骨架与逐字段说明：

```bash
node scripts/novel-setup.mjs style-template
```

| 字段 | 说明 |
| --- | --- |
| `label.zh` | 画风的中文名，报告界面显示它（如「真人实拍」） |
| `label.en` | 英文名，出英文报告时显示。可留空，回落到中文名 |
| `phrase` | 英文画风短语，Seedance 视频提示词指南按它补充收尾风格约束，不是关键帧配置 |
| `character.render` | 角色设定图的渲染方式那句，英文 |
| `character.surface` | 皮肤、眼睛、头发、布料怎么处理，英文 |
| `character.lighting` | 设定图的光照，英文。设定表要能抠图、要能量比例，这一句得把左右分区交代清楚 |
| `character.negative` | 角色设定图的反向提示词，英文逗号分隔 |
| `character.tags` | 风格标签数组，英文 |
| `scene.render` | 场景与道具设定图的渲染方式那句，英文 |
| `scene.surface` | 环境材质怎么处理，英文 |
| `scene.negative` | 场景与道具的反向提示词，英文逗号分隔。参考图必须空景，这里要把人禁掉 |
| `scene.tags` | 风格标签数组，英文 |

### character 与 scene 是同一个画风的两种落地

**不是同一段文字，也不能互相搬。**写实的人要毛孔、皮下散射、根根分明的碎发；写实的环境要斑驳、水渍、包浆、灰尘。把角色那套带进环境，出来就是四不像。

`scene` 比 `character` 少一块 `lighting`：场景的光照状态（晨雾/正午/夜）是 `novel-art` 逐个场景自己定的，一个场景可能有三档时段；角色设定图的光照是**版面级**的固定规则（左栏方向光给体积、右侧平光好抠图），所以归在画风里。

### 换风格是整套换 ⚠️

`render` / `surface` / `lighting` / `negative` / `tags` 是一整块，**必须一起换，不许混搭**。混搭必然自相矛盾：写实那套刚把 `photorealistic` 从反向词里留出来，平涂动画那套恰恰要禁它；毛孔与皮下散射在写实里是加分项，在平涂动画里是反效果。

这条规则以前写死成「`realistic` 绝不能禁 `photorealistic`，`ghibli` 必须禁」。画风交给用户之后那句话没法再写死，但它背后的规则可以——**同一个短语既写进 `render`/`surface`/`lighting`/`tags`，又写进 `negative`，就是自相矛盾**。`style-coherent` 门查的就是这一条，它不认识任何一档具体画风，却正好复现了原来那两条。

判定按**完整短语**：`negative` 按逗号分号拆成词条，逐条到正向那几块里找，带词边界。所以 `negative` 里的 `text` 不会被 `surface` 里的 `micro-texture` 命中——误报的门比没有门更坏。

### 下游怎么用它

| skill | 用哪一块 | 怎么查 |
| --- | --- | --- |
| `novel-characters` | `style.character` | 角色卡的 `image.sheet` 与 `image.prompt` 含 `render` 原句，`image.negativePrompt` 带全 `negative` 的每一条 |
| `novel-art` | `style.scene` | 设定卡同上。反向词只对**场景**查全——道具是纯白背景，画风里「环境别太干净」那几条和白底自相矛盾 |
| `novel-creation` | `style.phrase`（提示词指南） | 画风由参考图继承，Seedance 收尾段再按指南补充风格约束 |

**下游的产物 JSON 顶层没有 `style` 字段。**画风正文只有这一处产地，产物里再抄一份就是第二个来源，两个来源必然会漂。

一行拿到某一段要抄的那一块：

```bash
node scripts/novel-setup.mjs style <production.json> --for character
```

## autopilot：转移审批权，不是取消检查点

`autopilot` 是唯一一个**不管技术参数、只管跑法**的字段：它不改任何一个下给模型的值，改的是下游 skill 遇到「该问用户」的地方怎么办。

- `false`（默认）：原来的样子。该问就问、该等拍板就等拍板。
- `true`：下游五个 skill 各自把自己那一段**一口气跑完**——不提问、不等拍板、不把选择题抛回去，该做的决定自己做，做过的决定全部写进最后的汇报。

**转移的是审批权，不是取消检查点。**三件事不受它影响，这是它与「无人值守随便跑」的分界线：

| 不受影响 | 为什么 |
| --- | --- |
| **质量门照样是门** | `validate` 没过就修到过。门拦的是「白出一整批」，跟问不问用户无关 |
| **花钱前照样先算账** | 预估花费照样算清楚、照样报给用户（打印出来），只是不等回应就往下走 |
| **止损照样止损** | 同一段连着失败两次仍然跳过、记进汇报。不打断不等于无限重试烧钱 |

**只认布尔真值。**JSON 里写成字符串 `"false"`，在 JavaScript 里是真值——那种写法会让一整条管线闷头跑完，比不写更坏。所以 `fields` 门查类型：写了就必须是 `true` / `false`；**整个不写不算违规**，老项目的 `production.json` 里本来就没有这个字段，按 `false` 处理。

`novel-setup` 自己不受它约束——它是这个字段的产地，成片画幅照样必须问用户。

## adaptive 不能用 ⚠️

能力表中的部分模型支持 `aspect_ratio: "adaptive"`。本管线要求成片画幅固定，避免模型逐段选择不同的比例，因此 `aspect-format` 门仍拒绝 `adaptive`。

## 两个比例是两件事 ⚠️

最容易误解的一处：**资产图比例和成片画幅无关**。

- **资产图**（角色设定图、场景设定图、道具设定图）是给参考图与人眼看的**设定表**。角色设定图的三区版面、场景与道具设定图的 L 形版面都靠横向铺开，竖过来三视图会被压扁。所以资产图默认 `16:9`，成片拍竖屏也不改。
- **视频画幅**决定成片比例。参考图是身份与场景设定，不是成片中的一格，因此不要求与资产图比例相等。

`asset-landscape` 检查资产图版面；`video-model` 独立检查视频画幅。

## 八道质量门

| 门 | 查什么 | 为什么是门 |
| --- | --- | --- |
| `fields` | 字段齐全、`style` 是对象、`lang` / `promptLang` 在枚举里、`autopilot` 写了就得是布尔值 | 少一个字段，下游读到 `undefined` 会静默用回默认值；`autopilot` 写成字符串 `"false"` 反而是开着 |
| `aspect-format` | 资产图与视频比例都是 `W:H` 写法 | 写成 `9-16` 下游解析不出来；`adaptive` 也在这里拦掉 |
| `asset-landscape` | 资产图是横构图或方形 | 竖构图会把设定图的三视图压扁 |
| `resolution-filled` | 资产图与视频分辨率档位都已填 | 没填就等于没定 |
| `video-model` | 视频模型已填，`resolution` 与 `aspect_ratio` 在该模型的枚举里 | 提前检查，避免提交时才被网关拒绝 |
| `model-caps` | 资产图的档位、比例都被生图模型收 | 同上。**`nanobanana2` 不收 `4:3`、`image-2` 的 `4K` 只收 `16:9` / `9:16`** —— 选错了整批出不来 |
| `style-blocks` | 画风各块填全、`phrase` 为纯 ASCII | 画风正文是用户写的，缺一块下游就少一段提示词 |
| `style-coherent` | 反向词没出现在 `render` / `surface` / `lighting` / `tags` 里 | 一边要一边禁，模型两头讨好，整批图废掉。**换风格时把上一档的 `negative` 留着**是最常见的形态 |

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

向上取整、夹进区间、动过就说清楚。下游参数交接见本 skill 的 `contract.md`。
